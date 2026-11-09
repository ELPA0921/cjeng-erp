import ModalClose from './ModalClose'
import { adminYearOfProject } from './adminExpenses'
import type { Order } from './orderTypes'
import { emptyExpenseSearch, type ExpenseSearchFilters } from './expenseSearchFilters'
import type { Expense } from './workspaceTypes'

const shownLimit = 300
const fold = (text: string) => text.toLowerCase().replace(/\s+/g, '')
const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean).map(fold)
const money = (value: number) => value.toLocaleString('ko-KR')
const amountOf = (text: string) => { const digits = text.replace(/[^\d-]/g, ''); return digits && digits !== '-' ? Number(digits) : null }

/**
 * 지출 검색: looks through the expenses of every 공사 and every year's 관리비 at once, for
 * "where did we buy that 동파이프컷터?". Every filled condition must match; the keyword's
 * words may each appear in 거래처, 내용, 카드번호 or 비고. Picking a result opens it in 지출내역.
 */
export default function ExpenseSearch({ expenses, orders, scope, kinds, kindOf, filters, onFilters, onOpen, onClose }: {
  /** The expenses to look through: every 공사 after 2022, or the 22년 이전 ones. */
  expenses: Expense[]
  /** What those expenses are, for the heading ("모든 공사와 관리비"). */
  scope: string
  orders: Order[]
  kinds: readonly string[]
  /** The 구분 as the 지출내역 table shows it (old 세금계산서 rows read as 전자세금계산서). */
  kindOf: (kind: string) => string
  filters: ExpenseSearchFilters
  onFilters: (filters: ExpenseSearchFilters) => void
  onOpen: (expense: Expense) => void
  onClose: () => void
}) {
  const ordersById = new Map(orders.map(order => [order.id, order]))
  const project = (projectId: string) => {
    const adminYear = adminYearOfProject(projectId)
    if (adminYear) return { orderNo: `${adminYear.slice(2)}000`, name: `${adminYear}년 관리비`, client: '' }
    const order = ordersById.get(projectId)
    // 22년 이전 공사 use the 공사명 as their 수주번호, so their year stands in for it.
    const orderNo = order && order.orderNo === order.projectName && order.year ? order.year : order?.orderNo
    return order ? { orderNo: orderNo ?? '', name: order.projectName, client: order.client1 } : { orderNo: '-', name: '공사 미지정', client: '' }
  }
  const set = (patch: Partial<ExpenseSearchFilters>) => onFilters({ ...filters, ...patch })
  const keyword = words(filters.keyword)
  const projectWords = words(filters.project)
  const min = amountOf(filters.minAmount), max = amountOf(filters.maxAmount)
  const searching = keyword.length > 0 || projectWords.length > 0 || !!filters.from || !!filters.to || !!filters.kind || min !== null || max !== null
  const results = !searching ? [] : expenses.filter(expense => {
    if (filters.from && expense.date < filters.from) return false
    if (filters.to && expense.date > filters.to) return false
    if (filters.kind && kindOf(expense.kind) !== filters.kind) return false
    if (min !== null && expense.amount < min) return false
    if (max !== null && expense.amount > max) return false
    const text = fold([expense.vendor, expense.memo, expense.cardNumber ?? '', expense.note ?? ''].join(' '))
    if (!keyword.every(word => text.includes(word))) return false
    if (projectWords.length) {
      const { orderNo, name, client } = project(expense.projectId)
      const projectText = fold([orderNo, name, client].join(' '))
      if (!projectWords.every(word => projectText.includes(word))) return false
    }
    return true
  }).sort((a, b) => b.date.localeCompare(a.date))
  const total = results.reduce((sum, expense) => sum + expense.amount, 0)

  return <div className="modal-backdrop" role="presentation">
    <section className="modal-panel expense-search-modal" role="dialog" aria-modal="true" aria-labelledby="expense-search-title">
      <div className="modal-heading">
        <div><h3 id="expense-search-title">지출 검색</h3><span>{scope}의 지출내역에서 찾습니다. 입력한 조건을 모두 만족하는 지출만 보여 줍니다.</span></div>
        <ModalClose onClose={onClose} />
      </div>
      <form className="expense-search-form" onSubmit={event => event.preventDefault()}>
        <label className="wide">검색어<input autoFocus type="search" value={filters.keyword} placeholder="거래처·내용·카드번호·비고" onChange={event => set({ keyword: event.target.value })} /></label>
        <label className="wide">공사<input type="search" value={filters.project} placeholder="수주번호·공사명·발주처" onChange={event => set({ project: event.target.value })} /></label>
        <label>시작일<input type="date" value={filters.from} onChange={event => set({ from: event.target.value })} /></label>
        <label>종료일<input type="date" value={filters.to} onChange={event => set({ to: event.target.value })} /></label>
        <label>구분<select value={filters.kind} onChange={event => set({ kind: event.target.value })}>
          <option value="">전체</option>
          {kinds.map(kind => <option key={kind} value={kind}>{kind}</option>)}
        </select></label>
        <label>금액<span className="expense-search-range">
          <input inputMode="numeric" value={filters.minAmount} placeholder="최소" aria-label="최소 금액" onChange={event => set({ minAmount: event.target.value })} />
          ~
          <input inputMode="numeric" value={filters.maxAmount} placeholder="최대" aria-label="최대 금액" onChange={event => set({ maxAmount: event.target.value })} />
        </span></label>
        <button className="ghost-button" type="button" disabled={!searching} onClick={() => onFilters(emptyExpenseSearch)}>조건 지우기</button>
      </form>
      <div className="expense-search-summary">
        {searching ? <><strong>{results.length.toLocaleString('ko-KR')}건</strong><span>금액 합계 {money(total)}원</span>{results.length > shownLimit && <span>최근 {shownLimit}건만 표시합니다. 조건을 더 좁혀 주세요.</span>}</>
          : <span>검색어나 조건을 입력하면 바로 찾습니다.</span>}
      </div>
      <div className="table-wrap expense-search-results">
        <table>
          <thead><tr><th>일자</th><th>공사</th><th>거래처</th><th>내용</th><th>금액</th><th>구분</th></tr></thead>
          <tbody>
            {results.slice(0, shownLimit).map(expense => {
              const { orderNo, name, client } = project(expense.projectId)
              return <tr key={expense.id} tabIndex={0} title="이 지출이 있는 지출내역으로 이동" onClick={() => onOpen(expense)}
                onKeyDown={event => { if (event.key === 'Enter') onOpen(expense) }}>
                <td className="date-cell">{expense.date}</td>
                <td className="expense-search-project"><strong>{orderNo}</strong><span>{[client, name].filter(Boolean).join(' · ')}</span></td>
                <td>{expense.vendor}</td>
                <td className="expense-content">{expense.memo || '-'}</td>
                <td className="numeric-cell">{money(expense.amount)}</td>
                <td>{kindOf(expense.kind)}</td>
              </tr>
            })}
            {searching && results.length === 0 && <tr><td colSpan={6}>조건에 맞는 지출이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>
}
