import type { CardApproval } from './cardTypes.ts'
import type { Order } from './orderTypes.ts'
import type { CardAccounting, CardAccountingSplit, CardAccountingStatus, Expense } from './workspaceTypes.ts'
import { cardSupplyAmount } from './cardAmounts.ts'
import { adminOrder, adminYearOfOrderNo } from './adminExpenses.ts'

// A Barobill row (card approval or purchase tax invoice) as the posting flow sees it.
export type PostingSource = {
  id: string
  date: string
  vendor: string
  supplyAmount: number | null
  vatAmount: number | null
  amount: number
  kind: '법인카드' | '전자세금계산서'
  cardNumber: string
  defaultMemo?: string
}
export type CardAccountingChoice = CardAccountingStatus | '미반영'
/** One share of a 분할 회계반영: which order, its 공급가액 and its 내용. */
export type SplitPart = { orderNo: string; memo: string; supplyAmount: number }
export type CardAccountingInput = { row: PostingSource; status: CardAccountingChoice; orderNo: string; memo: string; splits?: SplitPart[] }

export const missingOrderMessage = '존재하지 않는 수주번호입니다.'

export function cardPostingSource(row: CardApproval): PostingSource {
  return { id: row.id, date: row.dateTime.slice(0, 10), vendor: row.store, supplyAmount: cardSupplyAmount(row).value, vatAmount: row.vatAmount, amount: row.amount, kind: '법인카드', cardNumber: row.cardNumber }
}

export function findOrder(orders: Order[], orderNo: string) {
  const value = orderNo.trim()
  if (!value) return undefined
  const adminYear = adminYearOfOrderNo(value)
  return adminYear ? adminOrder(adminYear) : orders.find(order => order.orderNo.trim() === value)
}

// One expense per source row, so posting the same row twice can never duplicate it.
export const cardExpenseId = (approvalId: string) => `card-${approvalId.slice(0, 32)}`
export const postingExpenseId = (row: PostingSource) => row.kind === '법인카드' ? cardExpenseId(row.id) : `tax-${row.id.slice(0, 32)}`

const isSplit = (input: CardAccountingInput) => input.status === '회계반영' && (input.splits?.length ?? 0) > 0

/** Returns the ids of rows whose order number blocks saving. */
export function invalidOrderRows(inputs: CardAccountingInput[], orders: Order[]) {
  return inputs.filter(input => input.status === '회계반영' && (isSplit(input) ? input.splits!.some(part => !findOrder(orders, part.orderNo)) : !findOrder(orders, input.orderNo))).map(input => input.row.id)
}

/** A row can be split when it has a positive 공급가액 to share out. */
export const canSplit = (row: PostingSource) => (row.supplyAmount ?? 0) > 0

/**
 * 부가세 follows each share's 공급가액 in proportion; the last share takes what rounding left,
 * so the shares always add up to the row's 공급가액, 부가세 and 합계 exactly.
 */
export function splitAmounts(row: Pick<PostingSource, 'supplyAmount' | 'vatAmount' | 'amount'>, supplies: number[]) {
  const supply = row.supplyAmount ?? 0, vat = row.vatAmount ?? 0
  let vatLeft = vat, amountLeft = row.amount
  return supplies.map((part, index) => {
    const last = index === supplies.length - 1
    const partVat = last ? vatLeft : supply ? Math.round(vat * part / supply) : 0
    const amount = last ? amountLeft : part + partVat
    vatLeft -= partVat; amountLeft -= amount
    return { supplyAmount: part, vatAmount: partVat, amount }
  })
}

/** Why a split cannot be saved, or null when it can. */
export function splitError(row: PostingSource, parts: SplitPart[], orders: Order[]) {
  const total = row.supplyAmount ?? 0
  if (parts.length < 2) return '두 건 이상으로 나눠 주세요.'
  if (parts.some(part => !Number.isFinite(part.supplyAmount) || part.supplyAmount <= 0)) return '나눌 공급가액을 모두 입력해 주세요.'
  const sum = parts.reduce((acc, part) => acc + part.supplyAmount, 0)
  if (sum !== total) return `나눈 공급가액 합계(${sum.toLocaleString('ko-KR')}원)가 ${total.toLocaleString('ko-KR')}원과 맞지 않습니다.`
  if (parts.some(part => !findOrder(orders, part.orderNo))) return missingOrderMessage
  return null
}

/** Every order number a posting points at (one, or each share of a split). */
export const entryOrderNos = (entry: CardAccounting) => entry.splits?.length ? [...new Set(entry.splits.map(split => split.orderNo.trim()))] : entry.orderNo.trim() ? [entry.orderNo.trim()] : []
/** Every expense a posting created. */
export const entryExpenseIds = (entry: CardAccounting) => [entry.expenseId, ...(entry.splits ?? []).map(split => split.expenseId)].filter((id): id is string => !!id)
// A split posting is listed as "26019, 26018" with its 내용 joined, so the lists can show, sort and search it.
const splitSummary = (splits: CardAccountingSplit[]) => ({
  orderNo: [...new Set(splits.map(split => split.orderNo))].join(', '),
  memo: [...new Set(splits.map(split => split.memo).filter(Boolean))].join(' / '),
})

/**
 * Applies the chosen status to each row. 회계반영 creates or updates the linked
 * expense on the order (one per share when split); 강제회계반영 and 미반영 remove them.
 */
export function applyCardAccounting(
  inputs: CardAccountingInput[],
  state: { cardAccounting: CardAccounting[]; expenses: Expense[]; orders: Order[] },
  now = new Date().toISOString(),
) {
  const entries = new Map(state.cardAccounting.map(entry => [entry.id, entry]))
  const expenses = new Map(state.expenses.map(expense => [expense.id, expense]))
  for (const input of inputs) {
    const { row, status, orderNo, memo } = input
    const previous = entries.get(row.id)
    const kept = new Set<string>()
    const dropStale = () => { for (const id of previous ? entryExpenseIds(previous) : []) if (!kept.has(id)) expenses.delete(id) }
    if (status === '미반영') { dropStale(); entries.delete(row.id); continue }
    const entry: CardAccounting = { id: row.id, status, orderNo: orderNo.trim(), memo: memo.trim(), updatedAt: now }
    const base = (expenseId: string) => ({
      ...expenses.get(expenseId),
      id: expenseId,
      date: row.date,
      kind: row.kind,
      vendor: row.vendor.trim() || row.kind,
      ...(row.cardNumber ? { cardNumber: row.cardNumber } : {}),
    })
    if (isSplit(input)) {
      const parts = input.splits!
      const failure = splitError(row, parts, state.orders)
      if (failure) throw new Error(failure)
      const amounts = splitAmounts(row, parts.map(part => part.supplyAmount))
      entry.splits = parts.map((part, index) => {
        const expenseId = `${postingExpenseId(row)}-${index + 1}`
        expenses.set(expenseId, { ...base(expenseId), projectId: findOrder(state.orders, part.orderNo)!.id, memo: part.memo.trim(), ...amounts[index] })
        kept.add(expenseId)
        return { expenseId, orderNo: part.orderNo.trim(), memo: part.memo.trim(), supplyAmount: part.supplyAmount }
      })
      Object.assign(entry, splitSummary(entry.splits))
    } else if (status === '회계반영') {
      const order = findOrder(state.orders, orderNo)
      if (!order) throw new Error(missingOrderMessage)
      const expenseId = previous?.expenseId ?? postingExpenseId(row)
      expenses.set(expenseId, {
        ...base(expenseId),
        projectId: order.id,
        memo: entry.memo,
        ...(row.supplyAmount === null ? {} : { supplyAmount: row.supplyAmount }),
        ...(row.vatAmount === null ? {} : { vatAmount: row.vatAmount }),
        amount: row.amount,
      })
      entry.expenseId = expenseId
      kept.add(expenseId)
    }
    dropStale()
    entries.set(row.id, entry)
  }
  return { cardAccounting: [...entries.values()], expenses: [...expenses.values()] }
}

/** Deleting a posted expense sends its source row back to 미반영. */
export function unlinkDeletedExpenses(cardAccounting: CardAccounting[], deletedExpenseIds: Set<string>) {
  return cardAccounting.filter(entry => !entryExpenseIds(entry).some(id => deletedExpenseIds.has(id)))
}

/**
 * The shares of a split are deleted together: deleting any one of them takes the others along,
 * since the source row goes back to 미반영 as a whole.
 */
export function withSplitSiblings(cardAccounting: CardAccounting[], expenseIds: Set<string>) {
  const all = new Set(expenseIds)
  for (const entry of cardAccounting) {
    const ids = entry.splits?.map(split => split.expenseId) ?? []
    if (ids.some(id => expenseIds.has(id))) for (const id of ids) all.add(id)
  }
  return all
}

/** Editing a posted expense keeps its source row's 수주번호 and 내용 (and a share's 공급가액) in step. */
export function syncEditedExpense(cardAccounting: CardAccounting[], expense: Pick<Expense, 'id' | 'memo'> & { supplyAmount?: number }, orderNo: string, now = new Date().toISOString()) {
  return cardAccounting.map(entry => {
    if (entry.expenseId === expense.id) return { ...entry, orderNo, memo: expense.memo.trim(), updatedAt: now }
    if (!entry.splits?.some(split => split.expenseId === expense.id)) return entry
    const splits = entry.splits.map(split => split.expenseId === expense.id ? { ...split, orderNo, memo: expense.memo.trim(), supplyAmount: expense.supplyAmount ?? split.supplyAmount } : split)
    return { ...entry, ...splitSummary(splits), splits, updatedAt: now }
  })
}
