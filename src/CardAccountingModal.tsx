import { useState, type FormEvent } from 'react'
import type { Order } from './orderTypes'
import type { CardAccounting } from './workspaceTypes'
import { adminOrders } from './adminExpenses'
import ModalClose from './ModalClose'
import OrderNoField from './OrderNoField'
import { findOrder, invalidOrderRows, missingOrderMessage, type CardAccountingChoice, type CardAccountingInput, type PostingSource } from './cardAccounting'

type Draft = { status: CardAccountingChoice; orderNo: string; memo: string }
const money = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
const statusChoices: CardAccountingChoice[] = ['회계반영', '강제회계반영', '미반영']

// 26028 and 2026-028 sort as the same year and number.
const orderNoKey = (orderNo: string) => /^\d{5}$/.test(orderNo.trim()) ? `20${orderNo.trim().slice(0, 2)}-${orderNo.trim().slice(2)}` : orderNo.trim()

export default function CardAccountingModal({ mode, rows, entries, orders, onSubmit, onClose, onCreateOrder, onRemove }: {
  mode: 'post' | 'edit'
  rows: PostingSource[]
  entries: Map<string, CardAccounting>
  orders: Order[]
  onSubmit: (inputs: CardAccountingInput[]) => Promise<string | null>
  onClose: () => void
  onCreateOrder: (onCreated: (order: Order) => void) => void
  /** 회계반영 only: takes a row out of this posting and unticks it; it stays 미반영. */
  onRemove?: (id: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(rows.map(row => {
    const entry = entries.get(row.id)
    return [row.id, { status: mode === 'post' ? '회계반영' : entry?.status ?? '회계반영', orderNo: entry?.orderNo ?? '', memo: entry?.memo || row.defaultMemo || '' }]
  })))
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set())
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputs = (): CardAccountingInput[] => rows.map(row => ({ row, ...drafts[row.id] }))
  const removable = mode === 'post' && !!onRemove
  function remove(id: string) {
    setInvalid(current => { const next = new Set(current); next.delete(id); return next })
    if (pickerFor === id) setPickerFor(null)
    setError('')
    onRemove?.(id)
  }
  // Newest order number first; each year's 관리비 code (26000) lands after that year's 공사.
  const sortedOrders = [...adminOrders(orders), ...orders].sort((a, b) => orderNoKey(b.orderNo).localeCompare(orderNoKey(a.orderNo), 'ko-KR', { numeric: true }))
  const keyword = search.trim().toLowerCase()
  const pickerOrders = keyword ? sortedOrders.filter(order => [order.orderNo, order.projectName, order.client1, order.region].join(' ').toLowerCase().includes(keyword)) : sortedOrders

  function update(id: string, patch: Partial<Draft>) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch } }))
    if ('orderNo' in patch || 'status' in patch) setInvalid(current => { const next = new Set(current); next.delete(id); return next })
  }
  function checkOrder(id: string) {
    const draft = drafts[id]
    if (draft.status === '회계반영' && draft.orderNo.trim() && !findOrder(orders, draft.orderNo)) setInvalid(current => new Set(current).add(id))
  }
  function createOrder() {
    // Fill the new order into the rows that still have no order number.
    onCreateOrder(order => {
      const filled = rows.filter(row => drafts[row.id].status === '회계반영' && !drafts[row.id].orderNo.trim()).map(row => row.id)
      setDrafts(current => ({ ...current, ...Object.fromEntries(filled.map(id => [id, { ...current[id], orderNo: order.orderNo }])) }))
      setInvalid(current => new Set([...current].filter(id => !filled.includes(id))))
    })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const next = inputs()
    const missing = invalidOrderRows(next, orders)
    setInvalid(new Set(missing))
    if (missing.length) { setError(missingOrderMessage); return }
    setSaving(true); setError('')
    const failure = await onSubmit(next)
    setSaving(false)
    if (failure) setError(failure)
  }

  return <div className="modal-backdrop" role="presentation">
    <form className="modal-panel form-panel card-accounting-modal" role="dialog" aria-modal="true" aria-labelledby="card-accounting-title" onSubmit={submit}>
      <div className="modal-heading">
        <div><h3 id="card-accounting-title">{mode === 'post' ? '회계반영' : '회계반영 수정'}</h3>
          <span>{mode === 'post' ? `선택한 ${rows.length}건을 수주의 지출내역(${rows[0]?.kind ?? '법인카드'})에 등록합니다.` : `선택한 ${rows.length}건의 반영 내용을 수정합니다.`}</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      <div className="table-wrap card-accounting-rows">
        <table><thead><tr><th>일자</th><th>거래처</th><th>금액</th>{mode === 'edit' && <th>상태</th>}<th>수주번호</th><th>내용</th>{removable && <th aria-label="빼기" />}</tr></thead>
          <tbody>{rows.map(row => {
            const draft = drafts[row.id]
            const needsOrder = draft.status === '회계반영'
            // A tax invoice's item name is pre-filled as 내용; clicking the field clears it for
            // typing, and leaving it empty puts the item name back.
            const defaultMemo = row.defaultMemo ?? ''
            const showingDefault = !!defaultMemo && draft.memo === defaultMemo
            return <tr key={row.id}>
              <td>{row.date}</td>
              <td className="card-accounting-store">{row.vendor || '-'}</td>
              <td className="card-accounting-amount">{money(row.amount)}</td>
              {mode === 'edit' && <td className="card-accounting-wide" data-label="상태"><select aria-label="상태" value={draft.status} onChange={event => update(row.id, { status: event.target.value as CardAccountingChoice })}>
                {statusChoices.map(status => <option key={status} value={status}>{status}</option>)}
              </select></td>}
              <td className="card-accounting-wide" data-label="수주번호">
                <div className="card-order-field">
                  <OrderNoField value={draft.orderNo} orders={sortedOrders} disabled={!needsOrder} invalid={invalid.has(row.id)}
                    onChange={orderNo => update(row.id, { orderNo })} onBlur={() => checkOrder(row.id)} />
                  <button type="button" className="ghost-button card-order-search" aria-label="수주번호 찾기" title="수주번호 찾기" disabled={!needsOrder} onClick={() => { setSearch(''); setPickerFor(row.id) }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
                {invalid.has(row.id) && <small className="card-order-error" role="alert">{missingOrderMessage}</small>}
              </td>
              <td className="card-accounting-wide" data-label="내용"><input aria-label="내용" className={showingDefault ? 'card-memo-default' : undefined} title={showingDefault ? '클릭하면 지우고 새로 입력합니다' : undefined} value={draft.memo} disabled={draft.status === '미반영'} placeholder={defaultMemo || '내용'}
                onFocus={() => { if (showingDefault) update(row.id, { memo: '' }) }}
                onBlur={() => { if (defaultMemo && !draft.memo.trim()) update(row.id, { memo: defaultMemo }) }}
                onChange={event => update(row.id, { memo: event.target.value })} /></td>
              {removable && <td className="card-accounting-remove"><button type="button" className="ghost-button card-row-remove" aria-label={`${row.date} ${row.vendor || ''} 빼기`} title="이번 회계반영에서 빼기 (미반영으로 남음)" disabled={saving} onClick={() => remove(row.id)}>×</button></td>}
            </tr>
          })}</tbody>
        </table>
      </div>
      {error && (error !== missingOrderMessage || invalid.size > 0) && <p className="card-query-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>{mode === 'post' ? '미반영' : '닫기'}</button>
        <button className="ghost-button" type="button" disabled={saving} onClick={createOrder}>수주번호생성</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : mode === 'post' ? '회계반영' : '수정 저장'}</button>
      </div>
    </form>
    {pickerFor && <div className="modal-backdrop card-order-picker-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setPickerFor(null) }}>
      <div className="modal-panel small-modal card-order-picker" role="dialog" aria-modal="true" aria-labelledby="card-order-picker-title">
        <div className="modal-heading"><div><h3 id="card-order-picker-title">수주번호 선택</h3><span>수주대장에서 선택하면 입력칸에 채워집니다.</span></div>
          <ModalClose onClose={() => setPickerFor(null)} /></div>
        <input autoFocus className="card-order-picker-search" type="search" placeholder="수주번호·공사명·발주처 검색" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="card-order-picker-list">
          {pickerOrders.map(order => <button key={order.id} type="button" onClick={() => { update(pickerFor, { orderNo: order.orderNo }); setPickerFor(null) }}>
            <strong>{order.orderNo}</strong><span>{order.projectName}</span><small>{[order.client1, order.region].filter(Boolean).join(' · ')}</small>
          </button>)}
          {pickerOrders.length === 0 && <p>일치하는 수주가 없습니다.</p>}
        </div>
      </div>
    </div>}
  </div>
}
