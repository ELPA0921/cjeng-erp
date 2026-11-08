import ModalClose from './ModalClose'
import { legacyLastYear } from './legacyExpenses'
import { orderStatuses } from './orderStatus'
import type { Order } from './orderTypes'
import { emptyOrderSearch, isSearchingOrders, searchOrders, type OrderSearchFilters } from './orderSearchFilters'

/**
 * 수주 검색: looks through every year's 수주대장 at once, by 수주처, 공사현장, 공사명 and the rest.
 * Every filled condition must match. Picking a result shows it checked in that year's 수주대장;
 * its 공사명 opens the 공사 상세.
 */
export default function OrderSearch({ orders, years, yearOf, statusOf, filters, onFilters, onOpen, onOpenProject, onClose }: {
  orders: Order[]
  years: string[]
  yearOf: (order: Order) => string
  statusOf: (order: Order) => string
  filters: OrderSearchFilters
  onFilters: (filters: OrderSearchFilters) => void
  onOpen: (order: Order) => void
  onOpenProject: (order: Order) => void
  onClose: () => void
}) {
  const set = (patch: Partial<OrderSearchFilters>) => onFilters({ ...filters, ...patch })
  const searching = isSearchingOrders(filters)
  const results = searchOrders(orders, filters, { yearOf, statusOf })

  return <div className="modal-backdrop" role="presentation">
    <section className="modal-panel expense-search-modal order-search-modal" role="dialog" aria-modal="true" aria-labelledby="order-search-title">
      <div className="modal-heading">
        <div><h3 id="order-search-title">수주 검색</h3><span>{Number(legacyLastYear) + 1}년 이후 모든 수주대장에서 찾습니다. 입력한 조건을 모두 만족하는 수주만 보여 줍니다.</span></div>
        <ModalClose onClose={onClose} />
      </div>
      <form className="expense-search-form" onSubmit={event => event.preventDefault()}>
        <label className="wide">수주처<input autoFocus type="search" value={filters.client} placeholder="예: 진영" onChange={event => set({ client: event.target.value })} /></label>
        <label className="wide">공사현장<input type="search" value={filters.region} placeholder="예: 금곡공장" onChange={event => set({ region: event.target.value })} /></label>
        <label className="wide">공사명<input type="search" value={filters.project} placeholder="예: 배관 교체" onChange={event => set({ project: event.target.value })} /></label>
        <label className="wide">검색어<input type="search" value={filters.keyword} placeholder="수주번호·담당자·비고 등 전체" onChange={event => set({ keyword: event.target.value })} /></label>
        <label>담당자<input type="search" value={filters.manager} onChange={event => set({ manager: event.target.value })} /></label>
        <label>년도<select value={filters.year} onChange={event => set({ year: event.target.value })}>
          <option value="">전체</option>
          {[...years].reverse().map(year => <option key={year} value={year}>{year}</option>)}
        </select></label>
        <label>상태<select value={filters.status} onChange={event => set({ status: event.target.value })}>
          <option value="">전체</option>
          {orderStatuses.map(status => <option key={status} value={status}>{status}</option>)}
        </select></label>
        <button className="ghost-button" type="button" disabled={!searching} onClick={() => onFilters(emptyOrderSearch)}>조건 지우기</button>
      </form>
      <div className="expense-search-summary">
        {searching ? <><strong>{results.length.toLocaleString('ko-KR')}건</strong><span>행을 누르면 수주대장에서 해당 수주를 선택해 보여 줍니다.</span></>
          : <span>수주처·공사현장·공사명 등을 입력하면 바로 찾습니다.</span>}
      </div>
      <div className="table-wrap expense-search-results order-search-results">
        <table>
          <thead><tr><th>년도</th><th>수주번호</th><th>수주일자</th><th>상태</th><th>담당자</th><th>수주처</th><th>공사현장</th><th>공사명</th></tr></thead>
          <tbody>
            {results.map(order => <tr key={order.id} tabIndex={0} title="수주대장에서 이 수주 보기" onClick={() => onOpen(order)}
              onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(order) }}>
              <td>{yearOf(order)}</td>
              <td><strong>{order.orderNo}</strong></td>
              <td className="date-cell">{order.orderDate}</td>
              <td><span className="status" data-order-status={statusOf(order)}>{statusOf(order)}</span></td>
              <td>{order.manager}</td>
              <td>{[order.client1, order.client2].filter(Boolean).join(' · ')}</td>
              <td>{order.region}</td>
              <td><button className="text-link" type="button" title="공사 상세 열기" onClick={event => { event.stopPropagation(); onOpenProject(order) }}>{order.projectName}</button></td>
            </tr>)}
            {searching && results.length === 0 && <tr><td colSpan={8}>조건에 맞는 수주가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>
}
