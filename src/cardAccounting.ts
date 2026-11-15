import type { CardApproval } from './cardTypes.ts'
import type { Order } from './orderTypes.ts'
import type { CardAccounting, CardAccountingSplit, CardAccountingStatus, Expense } from './workspaceTypes.ts'
import { cardSupplyAmount } from './cardAmounts.ts'
import { adminOrder, adminOrders, adminYearOfOrderNo, adminYearOfProject } from './adminExpenses.ts'
import { isResearchProject } from './researchExpenses.ts'

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

// 26028 and 2026-028 sort as the same year and number.
const orderNoKey = (orderNo: string) => /^d{5}$/.test(orderNo.trim()) ? `20${orderNo.trim().slice(0, 2)}-${orderNo.trim().slice(2)}` : orderNo.trim()
/**
 * The orders a 수주번호 can be picked from: newest number first, each year's 관리비 code (26000)
 * after that year's 공사, and 연구비 (269NN), seldom used, after everything else.
 */
export const postingOrders = (orders: Order[]) => [...adminOrders(orders), ...orders].sort((a, b) => Number(isResearchProject(a.id)) - Number(isResearchProject(b.id)) || orderNoKey(b.orderNo).localeCompare(orderNoKey(a.orderNo), 'ko-KR', { numeric: true }))

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
 * A row matched against hand-entered expenses (지출 대조) only lets go of them instead: they
 * were the user's own entries before the invoice arrived, so they are never deleted here.
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
    const matched = previous?.mode === '대조'
    const kept = new Set<string>()
    const dropStale = () => { if (!matched) for (const id of previous ? entryExpenseIds(previous) : []) if (!kept.has(id)) expenses.delete(id) }
    if (status === '미반영') { dropStale(); entries.delete(row.id); continue }
    const entry: CardAccounting = { id: row.id, status, orderNo: orderNo.trim(), memo: memo.trim(), updatedAt: now }
    const base = (expenseId: string) => {
      const existing = expenses.get(expenseId)
      return {
        ...existing,
        id: expenseId,
        // A matched expense keeps the day it was entered for.
        date: matched && existing ? existing.date : row.date,
        kind: row.kind,
        vendor: row.vendor.trim() || row.kind,
        ...(row.cardNumber ? { cardNumber: row.cardNumber } : {}),
      }
    }
    if (isSplit(input)) {
      const parts = input.splits!
      const failure = splitError(row, parts, state.orders)
      if (failure) throw new Error(failure)
      const amounts = splitAmounts(row, parts.map(part => part.supplyAmount))
      entry.splits = parts.map((part, index) => {
        const expenseId = (matched ? previous?.splits?.[index]?.expenseId : undefined) ?? `${postingExpenseId(row)}-${index + 1}`
        expenses.set(expenseId, { ...base(expenseId), projectId: findOrder(state.orders, part.orderNo)!.id, memo: part.memo.trim(), ...amounts[index] })
        kept.add(expenseId)
        return { expenseId, orderNo: part.orderNo.trim(), memo: part.memo.trim(), supplyAmount: part.supplyAmount }
      })
      Object.assign(entry, splitSummary(entry.splits))
      if (matched) entry.mode = '대조'
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
      if (matched && previous?.expenseId) entry.mode = '대조'
      kept.add(expenseId)
    }
    dropStale()
    entries.set(row.id, entry)
  }
  return { cardAccounting: [...entries.values()], expenses: [...expenses.values()] }
}

/** The 수주번호 an expense is filed under ('' when its 공사 is unknown). */
export function orderNoOfProject(orders: Order[], projectId: string) {
  const adminYear = adminYearOfProject(projectId)
  return adminYear ? adminOrder(adminYear).orderNo : orders.find(order => order.id === projectId)?.orderNo ?? ''
}

/**
 * One line of 지출 대조: an expense entered by hand earlier (expenseId), or one added in the
 * match window to fill a gap (no expenseId: then date and orderNo say where it goes).
 */
export type MatchLine = { expenseId?: string; date: string; orderNo: string; memo: string; supplyAmount: number; amount: number }

// Shares a whole out in proportion to the weights; the last share takes the rounding.
function shareOut(total: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  let left = total
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return left
    const share = sum ? Math.round(total * weight / sum) : 0
    left -= share
    return share
  })
}

/** How a match stands against the invoice: totals of the lines and the differences. */
export function matchTotals(row: Pick<PostingSource, 'supplyAmount' | 'amount'>, lines: Pick<MatchLine, 'supplyAmount' | 'amount'>[]) {
  const supply = lines.reduce((acc, line) => acc + line.supplyAmount, 0)
  const amount = lines.reduce((acc, line) => acc + line.amount, 0)
  const supplyDiff = supply - (row.supplyAmount ?? 0), amountDiff = amount - row.amount
  // Either total matching is enough: 부가세 rounded per line can differ by a few 원 from the invoice's.
  return { supply, amount, supplyDiff, amountDiff, matches: lines.length > 0 && (supplyDiff === 0 || amountDiff === 0) }
}

/**
 * 지출 대조 → 분할회계반영: a month's tax invoice covers expenses already entered one by one.
 * Once their total matches the invoice, the invoice is posted onto those same expenses:
 * each keeps its day, 공사 and 내용, and takes its share of the invoice's 공급가액, 부가세 and
 * 합계 (so they add up to the invoice exactly) along with its 거래처 and 구분.
 */
export function applyInvoiceMatch(
  row: PostingSource,
  lines: MatchLine[],
  state: { cardAccounting: CardAccounting[]; expenses: Expense[]; orders: Order[] },
  now = new Date().toISOString(),
) {
  const totals = matchTotals(row, lines)
  if (!totals.matches) throw new Error('선택한 지출의 합계가 세금계산서 금액과 맞지 않습니다.')
  const entries = new Map(state.cardAccounting.map(entry => [entry.id, entry]))
  const expenses = new Map(state.expenses.map(expense => [expense.id, expense]))
  const previous = entries.get(row.id)
  const linkedElsewhere = new Set(state.cardAccounting.filter(entry => entry.id !== row.id).flatMap(entryExpenseIds))
  if (lines.some(line => line.expenseId && linkedElsewhere.has(line.expenseId))) throw new Error('다른 세금계산서·카드 내역에 이미 반영된 지출이 있습니다.')
  if (lines.some(line => !line.orderNo.trim() || (!line.expenseId && !findOrder(state.orders, line.orderNo)))) throw new Error(missingOrderMessage)
  const supplies = totals.supplyDiff === 0 ? lines.map(line => line.supplyAmount) : shareOut(row.supplyAmount ?? 0, lines.map(line => line.amount))
  const amounts = splitAmounts(row, supplies)
  const ids = new Set(expenses.keys())
  const splits: CardAccountingSplit[] = lines.map((line, index) => {
    let expenseId = line.expenseId
    if (!expenseId) { let n = index + 1; do expenseId = `${postingExpenseId(row)}-m${n++}`; while (ids.has(expenseId)); ids.add(expenseId) }
    const existing = expenses.get(expenseId)
    const next: Expense = {
      ...existing,
      id: expenseId,
      projectId: existing?.projectId ?? findOrder(state.orders, line.orderNo)!.id,
      date: existing?.date ?? line.date,
      kind: row.kind,
      vendor: row.vendor.trim() || row.kind,
      memo: line.memo.trim(),
      ...amounts[index],
    }
    // The 구분 is now the invoice's, so a card number typed earlier no longer applies.
    if (row.cardNumber) next.cardNumber = row.cardNumber
    else delete next.cardNumber
    expenses.set(expenseId, next)
    return { expenseId, orderNo: line.orderNo.trim(), memo: line.memo.trim(), supplyAmount: supplies[index] }
  })
  // Expenses the invoice no longer covers: hand-entered ones stay, ones the posting made go.
  const keep = new Set(splits.map(split => split.expenseId))
  if (previous && previous.mode !== '대조') for (const id of entryExpenseIds(previous)) if (!keep.has(id)) expenses.delete(id)
  const entry: CardAccounting = splits.length === 1
    ? { id: row.id, status: '회계반영', orderNo: splits[0].orderNo, memo: splits[0].memo, updatedAt: now, expenseId: splits[0].expenseId, mode: '대조' }
    : { id: row.id, status: '회계반영', ...splitSummary(splits), updatedAt: now, splits, mode: '대조' }
  entries.set(row.id, entry)
  return { cardAccounting: [...entries.values()], expenses: [...expenses.values()] }
}

/** Deleting a posted expense sends its source row back to 미반영. */
export function unlinkDeletedExpenses(cardAccounting: CardAccounting[], deletedExpenseIds: Set<string>) {
  return cardAccounting.filter(entry => !entryExpenseIds(entry).some(id => deletedExpenseIds.has(id)))
}

/**
 * The shares of a split are deleted together: deleting any one of them takes the others along,
 * since the source row goes back to 미반영 as a whole. Matched (지출 대조) expenses are the
 * user's own entries, so only the one picked goes; the others stay and are just unlinked.
 */
export function withSplitSiblings(cardAccounting: CardAccounting[], expenseIds: Set<string>) {
  const all = new Set(expenseIds)
  for (const entry of cardAccounting) {
    if (entry.mode === '대조') continue
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
