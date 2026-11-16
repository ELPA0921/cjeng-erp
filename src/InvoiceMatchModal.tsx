import { useState } from 'react'
import type { Order } from './orderTypes'
import type { CardAccounting, Expense } from './workspaceTypes'
import ModalClose from './ModalClose'
import OrderNoField from './OrderNoField'
import { foldVendor } from './vendors'
import { getExpenseSupplyAmount } from './expenseAmounts'
import { entryExpenseIds, findOrder, matchTotals, missingOrderMessage, orderNoOfProject, type MatchLine, type PostingSource } from './cardAccounting'

type Added = { key: number; date: string; orderNo: string; memo: string; supply: string }
const money = (value: number) => value.toLocaleString('ko-KR')
const signed = (value: number) => value === 0 ? '0' : `${value > 0 ? '+' : '−'}${money(Math.abs(value))}`
const digits = (value: string) => value.replace(/[^\d]/g, '')
// A line typed or corrected here has no 부가세 of its own yet; it is read as 공급가액 + 10%.
const withVat = (supply: number) => supply + Math.round(supply / 10)
let nextKey = 0

/**
 * 지출 대조: a vendor that bills a whole month on one tax invoice. Lists the expenses entered by
 * hand for that vendor and month, compares their total with the invoice, and lets the lines be
 * corrected (공급가액), left out (untick) or added until they match. Then the invoice is posted
 * onto those expenses as 분할회계반영.
 */
export default function InvoiceMatchModal({ row, expenses, cardAccounting, orders, onSave, onBack, onClose }: {
  row: PostingSource
  expenses: Expense[]
  cardAccounting: CardAccounting[]
  orders: Order[]
  onSave: (lines: MatchLine[]) => Promise<string | null>
  onBack: () => void
  onClose: () => void
}) {
  const entry = cardAccounting.find(item => item.id === row.id)
  const linkedHere = new Set(entry ? entryExpenseIds(entry) : [])
  const linkedElsewhere = new Set(cardAccounting.filter(item => item.id !== row.id).flatMap(entryExpenseIds))
  const [vendor, setVendor] = useState(row.vendor)
  const [month, setMonth] = useState(row.date.slice(0, 7))
  // Ticks the user changed; the rest are ticked by default (a row matched before: just its own expenses).
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [supplyEdits, setSupplyEdits] = useState<Record<string, string>>({})
  const [added, setAdded] = useState<Added[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const vendorKey = foldVendor(vendor)
  const inMonth = (expense: Expense) => !!month && expense.date.startsWith(month)
  const sameVendor = (expense: Expense) => !!vendorKey && foldVendor(expense.vendor).includes(vendorKey)
  const found = expenses.filter(expense => inMonth(expense) && sameVendor(expense)).sort((a, b) => a.date.localeCompare(b.date) || (a.sequence ?? 0) - (b.sequence ?? 0))
  // Expenses posted from 법인카드·전자세금계산서 조회 (another row) are listed greyed out: they
  // cannot be ticked or corrected, and never count toward the total.
  const locked = (expense: Expense) => linkedElsewhere.has(expense.id)
  const lockedCount = found.filter(locked).length
  const isTicked = (expense: Expense) => !locked(expense) && (picked[expense.id] ?? (entry?.mode === '대조' ? linkedHere.has(expense.id) : true))
  const toggle = (id: string, on: boolean) => { setPicked(current => ({ ...current, [id]: on })); setError('') }
  const projectOf = (expense: Expense) => {
    const orderNo = orderNoOfProject(orders, expense.projectId)
    const order = findOrder(orders, orderNo)
    return { orderNo, name: order?.projectName ?? (orderNo ? '' : '공사 미지정') }
  }
  const supplyOf = (expense: Expense) => expense.id in supplyEdits ? Number(digits(supplyEdits[expense.id]) || 0) : getExpenseSupplyAmount(expense)
  const amountOf = (expense: Expense) => expense.id in supplyEdits ? withVat(supplyOf(expense)) : expense.amount

  const lines: MatchLine[] = [
    ...found.filter(isTicked).map(expense => ({ expenseId: expense.id, date: expense.date, orderNo: projectOf(expense).orderNo, memo: expense.memo, supplyAmount: supplyOf(expense), amount: amountOf(expense) })),
    ...added.map(item => { const supply = Number(digits(item.supply) || 0); return { date: item.date, orderNo: item.orderNo.trim(), memo: item.memo.trim(), supplyAmount: supply, amount: withVat(supply) } }),
  ]
  const totals = matchTotals(row, lines)

  function updateAdded(key: number, patch: Partial<Added>) {
    setAdded(current => current.map(item => item.key === key ? { ...item, ...patch } : item))
    setError('')
  }
  async function save() {
    if (lines.some(line => !line.orderNo)) { setError('공사가 지정되지 않은 지출이 있습니다. 지출내역에서 공사를 먼저 지정하거나 체크를 해제해 주세요.'); return }
    if (added.some(item => !findOrder(orders, item.orderNo) || !item.date)) { setError(`추가한 지출의 일자와 수주번호를 확인해 주세요. ${missingOrderMessage}`); return }
    if (lines.some(line => line.supplyAmount <= 0)) { setError('공급가액이 0원인 줄이 있습니다.'); return }
    setSaving(true); setError('')
    const failure = await onSave(lines)
    setSaving(false)
    if (failure) setError(failure)
  }

  return <div className="modal-backdrop card-order-picker-backdrop" role="presentation">
    <section className="modal-panel form-panel invoice-match-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-match-title">
      <div className="modal-heading">
        <div><h3 id="invoice-match-title">등록된 지출과 대조</h3>
          <span>{row.date} {row.vendor} 세금계산서와, 그 달에 직접 등록한 지출을 맞춰 봅니다.</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      <div className="invoice-match-filters">
        <label>거래처<input type="search" value={vendor} onChange={event => { setVendor(event.target.value); setError('') }} /></label>
        <label>월<input type="month" value={month} onChange={event => { setMonth(event.target.value); setError('') }} /></label>
        <dl className="invoice-match-invoice">
          <div><dt>세금계산서 공급가액</dt><dd>{money(row.supplyAmount ?? 0)}</dd></div>
          <div><dt>부가세</dt><dd>{money(row.vatAmount ?? 0)}</dd></div>
          <div><dt>합계</dt><dd>{money(row.amount)}</dd></div>
        </dl>
      </div>
      <div className="table-wrap invoice-match-rows">
        <table>
          <thead><tr><th aria-label="포함" /><th>일자</th><th>수주번호</th><th>내용</th><th>구분</th><th>공급가액</th><th>합계</th></tr></thead>
          <tbody>
            {found.map(expense => {
              const on = isTicked(expense), fixed = locked(expense), { orderNo, name } = projectOf(expense)
              return <tr key={expense.id} className={fixed ? 'is-locked' : on ? undefined : 'is-off'} title={fixed ? `${expense.kind} 조회에서 이미 회계반영된 지출이라 합계에 넣지 않습니다.` : undefined}>
                <td className="invoice-match-check"><input type="checkbox" aria-label={`${expense.date} ${expense.memo} 포함`} checked={on} disabled={fixed} onChange={event => toggle(expense.id, event.target.checked)} /></td>
                <td>{expense.date}</td>
                <td className="invoice-match-project"><strong>{orderNo || '-'}</strong><small>{name}</small></td>
                <td className="invoice-match-memo" title={expense.memo}>{expense.memo || '-'}</td>
                <td className="invoice-match-kind">{expense.kind}{fixed && <small className="invoice-match-posted">조회에서 반영됨</small>}</td>
                <td className="invoice-match-money">{fixed
                  ? <span className="invoice-match-fixed">{money(getExpenseSupplyAmount(expense))}</span>
                  : <input aria-label="공급가액" inputMode="numeric" disabled={!on}
                    className={expense.id in supplyEdits ? 'is-edited' : undefined}
                    value={money(supplyOf(expense))}
                    onChange={event => { setSupplyEdits(current => ({ ...current, [expense.id]: digits(event.target.value) })); setError('') }} />}</td>
                <td className="card-accounting-amount">{money(amountOf(expense))}</td>
              </tr>
            })}
            {added.map(item => <tr key={item.key} className="is-added">
              <td className="invoice-match-check"><button type="button" className="ghost-button card-row-remove" aria-label="추가한 줄 빼기" title="추가한 줄 빼기" onClick={() => setAdded(current => current.filter(other => other.key !== item.key))}>×</button></td>
              <td><input type="date" aria-label="일자" value={item.date} onChange={event => updateAdded(item.key, { date: event.target.value })} /></td>
              <td className="invoice-match-order"><OrderNoField value={item.orderNo} orders={orders} disabled={false} invalid={!!item.orderNo.trim() && !findOrder(orders, item.orderNo)} onChange={orderNo => updateAdded(item.key, { orderNo })} onBlur={() => undefined} /></td>
              <td><input aria-label="내용" value={item.memo} placeholder={row.defaultMemo || '내용'} onChange={event => updateAdded(item.key, { memo: event.target.value })} /></td>
              <td className="invoice-match-kind">추가</td>
              <td className="invoice-match-money"><input aria-label="공급가액" inputMode="numeric" value={digits(item.supply) ? money(Number(digits(item.supply))) : ''} placeholder="0" onChange={event => updateAdded(item.key, { supply: digits(event.target.value) })} /></td>
              <td className="card-accounting-amount">{money(withVat(Number(digits(item.supply) || 0)))}</td>
            </tr>)}
            {found.length === 0 && added.length === 0 && <tr><td colSpan={7} className="invoice-match-empty">{vendorKey && month ? `${month} ${vendor}의 지출내역이 없습니다.` : '거래처와 월을 입력해 주세요.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="invoice-match-tools">
        <button type="button" className="ghost-button" disabled={saving} onClick={() => setAdded(current => [...current, { key: nextKey++, date: row.date, orderNo: '', memo: '', supply: '' }])}>+ 빠진 지출 추가</button>
        {lockedCount > 0 && <small>회색 {lockedCount}건은 법인카드·전자세금계산서 조회에서 이미 회계반영된 지출이라 고칠 수 없고 합계에도 넣지 않습니다.</small>}
      </div>
      <table className="invoice-match-compare">
        <thead><tr><th /><th>공급가액</th><th>합계</th></tr></thead>
        <tbody>
          <tr><th>선택한 지출 {lines.length}건</th><td>{money(totals.supply)}</td><td>{money(totals.amount)}</td></tr>
          <tr><th>세금계산서</th><td>{money(row.supplyAmount ?? 0)}</td><td>{money(row.amount)}</td></tr>
          <tr className="invoice-match-diff"><th>차이</th>
            <td className={totals.supplyDiff === 0 ? 'is-ok' : 'is-off'}>{totals.supplyDiff === 0 ? '일치' : signed(totals.supplyDiff)}</td>
            <td className={totals.amountDiff === 0 ? 'is-ok' : 'is-off'}>{totals.amountDiff === 0 ? '일치' : signed(totals.amountDiff)}</td></tr>
        </tbody>
      </table>
      <p className={`invoice-match-note ${totals.matches ? 'is-ok' : ''}`} role="status">
        {totals.matches
          ? `금액이 맞습니다. 분할회계반영하면 선택한 지출 ${lines.length}건이 이 세금계산서로 연결되고, 각 지출의 금액은 세금계산서 기준(공급가액·부가세·합계)으로 맞춰집니다. 일자·공사·내용은 그대로입니다.`
          : '차이가 있습니다. 공급가액을 고치거나, 해당하지 않는 지출의 체크를 풀거나, 빠진 지출을 추가해 주세요.'}
      </p>
      {error && <p className="card-query-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onBack}>방식 다시 선택</button>
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="button" disabled={saving || !totals.matches} onClick={() => void save()}>{saving ? '저장 중…' : '분할회계반영'}</button>
      </div>
    </section>
  </div>
}
