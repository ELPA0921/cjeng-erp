import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PurchaseTaxInvoice, PurchaseTaxInvoicePage } from './taxInvoiceTypes'
import { entryOrderNos, type PostingSource } from './cardAccounting'
import SplitOrderNos from './SplitOrderNos'
import { usePosting, type PostingProps, type PostingView } from './usePosting'
import './CorporateCards.css'

async function request<T>(input: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/barobill-cards', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || '세금계산서 내역을 불러올 수 없습니다.')
  return body as T
}
const money = (value: number | null) => value === null ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
const invoiceView: PostingView<PurchaseTaxInvoice> = {
  toSource: (row): PostingSource => ({ id: row.id, date: row.writeDate, vendor: row.vendor, supplyAmount: row.supplyAmount, vatAmount: row.vatAmount, amount: row.amount, kind: '전자세금계산서', cardNumber: '', defaultMemo: row.itemName }),
  sortValue: (row, key) => key === 'memo' ? row.itemName : (row as Record<string, unknown>)[key] as string | number | null,
  defaultSort: 'writeDate',
  // 사업자번호 and 승인번호 are not shown but still searchable.
  searchText: row => [row.writeDate, row.vendor, row.itemName, row.supplyAmount, row.vatAmount, row.amount, row.vendorCorpNum, row.approvalNumber, row.modified ? '수정' : ''],
}

export default function TaxInvoices(props: PostingProps) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`)
  const [endDate, setEndDate] = useState(today)
  const [result, setResult] = useState<(PurchaseTaxInvoicePage & { environment: string }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeRequest = useRef<AbortController | null>(null)
  const posting = usePosting(result?.records ?? [], props, invoiceView)
  useEffect(() => () => activeRequest.current?.abort(), [])

  async function query() {
    if (loading) return
    setError('')
    if (!startDate || !endDate || endDate < startDate || (Date.parse(endDate) - Date.parse(startDate)) / 86400000 >= 200) { setError('조회 기간은 시작일부터 최대 200일로 설정해 주세요.'); return }
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    setLoading(true); setResult(null); posting.reset()
    try { setResult(await request<PurchaseTaxInvoicePage & { environment: string }>({ action: 'purchaseTaxInvoices', startDate, endDate, page: 'all' }, controller.signal)) }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '세금계산서 조회에 실패했습니다.') }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }
  function submit(event: FormEvent) { event.preventDefault(); posting.setFilter('미반영'); void query() }
  function clearResult() { setResult(null); setError(''); posting.reset() }

  return <section className="content-grid single">
    <div className="panel full">
      <div className="panel-heading"><div><h3>전자세금계산서 매입내역</h3><span>바로빌이 홈택스에서 수집한 매입 세금계산서·계산서를 조회합니다.</span></div></div>
      {result?.environment === 'test' && <p className="card-query-hint" role="status">바로빌 테스트 서버에 연결되어 있습니다.</p>}
      <form className="card-query-form tax-query-form" onSubmit={submit}>
        {posting.searchBox(!!result)}
        <label>시작일<input type="date" required value={startDate} disabled={loading} onChange={event => { setStartDate(event.target.value); clearResult() }} /></label>
        <label>종료일<input type="date" required value={endDate} disabled={loading} onChange={event => { setEndDate(event.target.value); clearResult() }} /></label>
        <button className="primary-button" type="submit" disabled={loading}>{loading ? '조회 중…' : '내역 조회'}</button>
      </form>
      <p className="card-query-hint">작성일자 기준 · 최대 200일 · 기간 전체를 한 번에 불러와 검색합니다</p>
      {error && <p className="card-query-error" role="alert">{error}</p>}
      {loading && <p role="status">바로빌에서 세금계산서를 불러오고 있습니다.</p>}
      {result ? <>
        <div className="card-results-heading"><strong>조회 결과 {result.total.toLocaleString('ko-KR')}건{posting.selectedIds.size > 0 && ` · ${posting.selectedIds.size.toLocaleString('ko-KR')}건 선택`}</strong><span>{result.startDate} ~ {result.endDate}</span></div>
        {posting.toolbar}
        <div className="table-wrap card-results-scroll" role="region" aria-label="매입 세금계산서" tabIndex={0}>
          <table className="card-results-table tax-results-table"><thead><tr>
            <th className="card-check">{posting.selectAll}</th>
            {([['orderNo', '수주번호'], ['writeDate', '작성일자'], ['vendor', '거래처'], ['memo', '내용'], ['supplyAmount', '공급가액'], ['vatAmount', '부가세'], ['amount', '합계'], ['status', '회계반영']] as const).map(([key, label]) => <th key={key}>{posting.sortHeader(key, label)}</th>)}
          </tr></thead>
            <tbody>{posting.pageRows.map(row => {
              const entry = posting.entries.get(row.id)
              return <tr key={row.id} className={posting.selectedIds.has(row.id) ? 'card-row-selected' : undefined}>
                <td className="card-check">{posting.rowBox(row, `${row.writeDate} ${row.vendor}`)}</td>
                <td>{entry?.splits?.length ? <SplitOrderNos orderNos={entryOrderNos(entry)} orders={props.orders} /> : entry?.orderNo || '-'}</td>
                <td title={`국세청 승인번호 ${row.approvalNumber}`}>{row.writeDate}</td>
                <td>{row.vendor || '-'}{row.modified && <small className="tax-modified" title="수정 세금계산서">수정</small>}</td>
                <td className={entry?.memo ? undefined : 'tax-item'}>{entry?.memo || row.itemName || '-'}</td>
                <td>{money(row.supplyAmount)}</td><td>{money(row.vatAmount)}</td><td>{money(row.amount)}</td>
                <td>{posting.statusChip(row)}</td>
              </tr>
            })}
              {posting.pageRows.length === 0 && <tr><td colSpan={9}>{posting.emptyMessage('해당 기간에 수집된 매입 세금계산서가 없습니다.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="card-query-hint">내용 칸의 회색 글씨는 세금계산서 품목명이며, 회계반영할 때 내용의 기본값으로 들어갑니다.</p>
        <p className="card-query-hint">회계반영하면 입력한 수주의 지출내역에 전자세금계산서 지출로 등록됩니다. 분할회계반영은 한 건의 공급가액을 여러 수주로 나눠 각각 등록합니다. 강제회계반영은 지출내역에 등록하지 않고 반영 처리만 합니다.</p>
        {posting.modal}
      </> : !loading && !error && <div className="expense-source-empty"><strong>기간을 선택한 뒤 내역 조회를 눌러주세요.</strong><p>홈택스에 신고된 매입 세금계산서를 확인할 수 있습니다.</p></div>}
    </div>
  </section>
}
