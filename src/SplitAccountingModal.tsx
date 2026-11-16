import { useState, type FormEvent } from 'react'
import type { Order } from './orderTypes'
import ModalClose from './ModalClose'
import OrderNoField from './OrderNoField'
import { findOrder, splitAmounts, splitError, type PostingSource, type SplitPart } from './cardAccounting'

type Line = { key: number; date: string; orderNo: string; memo: string; supply: string }
const money = (value: number) => value.toLocaleString('ko-KR')
const digits = (value: string) => value.replace(/[^\d]/g, '')
let nextKey = 0
const line = (date: string, part: Partial<SplitPart> = {}): Line => ({ key: nextKey++, date: part.date || date, orderNo: part.orderNo ?? '', memo: part.memo ?? '', supply: part.supplyAmount ? String(part.supplyAmount) : '' })

/**
 * 분할회계반영: shares one row's 공급가액 out over several orders. Each share gets its own
 * 일자 (the invoice's by default), 수주번호 and 내용; 부가세 and 합계 follow the 공급가액. One share may be left blank and takes
 * whatever is left over.
 */
export default function SplitAccountingModal({ row, parts, orderNo, memo, orders, onSave, onClose }: {
  row: PostingSource
  /** The split being edited, or undefined to start a new one. */
  parts?: SplitPart[]
  /** The row's current 수주번호 and 내용, which a new split starts from. */
  orderNo: string
  memo: string
  orders: Order[]
  /** Saves the split; returns an error message, or null once saved. */
  onSave: (parts: SplitPart[]) => Promise<string | null>
  onClose: () => void
}) {
  const total = row.supplyAmount ?? 0
  const [lines, setLines] = useState<Line[]>(() => parts?.length ? parts.map(part => line(row.date, part)) : [line(row.date, { orderNo, memo }), line(row.date, { memo })])
  const [invalid, setInvalid] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const filled = lines.filter(item => digits(item.supply)).reduce((sum, item) => sum + Number(digits(item.supply)), 0)
  const left = total - filled
  const blanks = lines.filter(item => !digits(item.supply))
  // The one blank share shows (and will take) the remainder.
  const supplies = lines.map(item => digits(item.supply) ? Number(digits(item.supply)) : blanks.length === 1 ? left : 0)
  // Until the shares add up, each one shows its own 부가세 without the last share's rounding catch-up.
  const exact = supplies.reduce((sum, value) => sum + value, 0) === total
  const amounts = exact ? splitAmounts(row, supplies) : supplies.map(value => { const vat = total ? Math.round((row.vatAmount ?? 0) * value / total) : 0; return { supplyAmount: value, vatAmount: vat, amount: value + vat } })

  function update(key: number, patch: Partial<Line>) {
    setLines(current => current.map(item => item.key === key ? { ...item, ...patch } : item))
    if ('orderNo' in patch) setInvalid(current => { const next = new Set(current); next.delete(key); return next })
    setError('')
  }
  async function apply(event: FormEvent) {
    event.preventDefault()
    const next = lines.map((item, index) => ({ date: item.date, orderNo: item.orderNo.trim(), memo: item.memo.trim(), supplyAmount: supplies[index] }))
    const missing = lines.filter(item => !findOrder(orders, item.orderNo)).map(item => item.key)
    setInvalid(new Set(missing))
    const failure = splitError(row, next, orders)
    if (failure) { setError(failure); return }
    setSaving(true); setError('')
    const saveError = await onSave(next)
    setSaving(false)
    if (saveError) setError(saveError)
  }

  return <div className="modal-backdrop card-order-picker-backdrop" role="presentation">
    <form className="modal-panel form-panel card-split-modal" role="dialog" aria-modal="true" aria-labelledby="card-split-title" onSubmit={event => void apply(event)}>
      <div className="modal-heading">
        <div><h3 id="card-split-title">분할회계반영</h3>
          <span>{row.date} {row.vendor} · 공급가액 {money(total)}원을 수주별로 나눕니다. 비워 둔 한 칸에는 남은 금액이 들어갑니다.</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      <div className="table-wrap card-accounting-rows card-split-rows">
        <table><thead><tr><th>일자</th><th>수주번호</th><th>공급가액</th><th>부가세</th><th>합계</th><th>내용</th><th aria-label="빼기" /></tr></thead>
          <tbody>{lines.map((item, index) => <tr key={item.key}>
            <td className="card-split-date" data-label="일자"><input type="date" aria-label="일자" required value={item.date} onChange={event => update(item.key, { date: event.target.value })} /></td>
            <td className="card-accounting-wide" data-label="수주번호"><div className="card-order-field">
              <OrderNoField value={item.orderNo} orders={orders} disabled={false} invalid={invalid.has(item.key)} onChange={value => update(item.key, { orderNo: value })} onBlur={() => { if (item.orderNo.trim() && !findOrder(orders, item.orderNo)) setInvalid(current => new Set(current).add(item.key)) }} />
            </div></td>
            <td className="card-split-money" data-label="공급가액"><input aria-label="공급가액" inputMode="numeric" value={digits(item.supply) ? money(Number(digits(item.supply))) : ''} placeholder={blanks.length === 1 && left > 0 ? money(left) : '0'} onChange={event => update(item.key, { supply: digits(event.target.value) })} /></td>
            <td className="card-accounting-amount" data-label="부가세">{supplies[index] > 0 ? money(amounts[index].vatAmount) : '-'}</td>
            <td className="card-accounting-amount" data-label="합계">{supplies[index] > 0 ? money(amounts[index].amount) : '-'}</td>
            <td className="card-accounting-wide" data-label="내용"><input aria-label="내용" value={item.memo} placeholder={row.defaultMemo || '내용'} onChange={event => update(item.key, { memo: event.target.value })} /></td>
            <td className="card-accounting-remove">{lines.length > 2 && <button type="button" className="ghost-button card-row-remove" aria-label="이 줄 빼기" title="이 줄 빼기" onClick={() => setLines(current => current.filter(other => other.key !== item.key))}>×</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="card-split-footer">
        <button type="button" className="ghost-button" onClick={() => setLines(current => [...current, line(row.date, { memo })])}>+ 수주 추가</button>
        <span className={left === 0 || (blanks.length === 1 && left > 0) ? undefined : 'is-off'}>나눈 금액 {money(supplies.reduce((sum, value) => sum + value, 0))}원 / {money(total)}원{left !== 0 && blanks.length !== 1 && ` · ${left > 0 ? '남은' : '초과'} 금액 ${money(Math.abs(left))}원`}</span>
      </div>
      {error && <p className="card-query-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : parts?.length ? '수정 저장' : '분할회계반영'}</button>
      </div>
    </form>
  </div>
}
