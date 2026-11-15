import { useState } from 'react'
import ModalClose from './ModalClose'
import { getExpenseSupplyAmount, getExpenseVatAmount } from './expenseAmounts'
import { adminYearOfProject } from './adminExpenses'
import type { Order } from './orderTypes'
import { emptyExpenseSearch, type ExpenseSearchFilters } from './expenseSearchFilters'
import type { Expense } from './workspaceTypes'

const shownLimit = 300
const fold = (text: string) => text.toLowerCase().replace(/\s+/g, '')
const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean).map(fold)
const money = (value: number) => value.toLocaleString('ko-KR')
type SortKey = 'date' | 'project' | 'vendor' | 'memo' | 'amount' | 'kind'
const columns: [SortKey, string][] = [['date', '일자'], ['project', '공사'], ['vendor', '거래처'], ['memo', '내용'], ['amount', '금액'], ['kind', '구분']]
const compareText = (a: string, b: string) => a.localeCompare(b, 'ko-KR', { numeric: true })
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
  // Newest first until a column header is clicked; clicking it again flips the order.
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true })
  const [showTotals, setShowTotals] = useState(false)
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
  })
  const sortValue = (expense: Expense) => sort.key === 'project' ? project(expense.projectId).orderNo : sort.key === 'kind' ? kindOf(expense.kind) : sort.key === 'amount' ? expense.amount : expense[sort.key] ?? ''
  const sorted = results.map(expense => ({ expense, value: sortValue(expense) })).sort((a, b) => {
    const order = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : compareText(String(a.value), String(b.value))
    // Ties keep the newest first.
    return (sort.desc ? -order : order) || b.expense.date.localeCompare(a.expense.date)
  }).map(item => item.expense)
  // 합계 계산 covers every match, not only the rows shown.
  const totals = results.reduce((sum, expense) => ({ supply: sum.supply + getExpenseSupplyAmount(expense), vat: sum.vat + getExpenseVatAmount(expense), amount: sum.amount + expense.amount }), { supply: 0, vat: 0, amount: 0 })
  const kindTotals = new Map<string, { count: number; amount: number }>()
  for (const expense of results) {
    const kind = kindOf(expense.kind), sum = kindTotals.get(kind) ?? { count: 0, amount: 0 }
    kindTotals.set(kind, { count: sum.count + 1, amount: sum.amount + expense.amount })
  }
  const byKind = [...kindTotals]
  function sortBy(key: SortKey) {
    // A new column starts newest / largest first for 일자 and 금액, and 가나다 order for text.
    setSort(current => current.key === key ? { key, desc: !current.desc } : { key, desc: key === 'date' || key === 'amount' })
  }

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
        {searching ? <><strong>{results.length.toLocaleString('ko-KR')}건</strong>{results.length > shownLimit && <span>앞의 {shownLimit}건만 표시합니다. 조건을 더 좁혀 주세요.</span>}</>
          : <span>검색어나 조건을 입력하면 바로 찾습니다.</span>}
        <button className="ghost-button expense-search-total-button" type="button" disabled={!searching || results.length === 0} aria-expanded={showTotals} onClick={() => setShowTotals(current => !current)}>{showTotals ? '합계 닫기' : '합계 계산'}</button>
      </div>
      {showTotals && searching && results.length > 0 && <div className="expense-search-totals" role="status">
        <dl>
          <div><dt>건수</dt><dd>{results.length.toLocaleString('ko-KR')}건</dd></div>
          <div><dt>공급가액</dt><dd>{money(totals.supply)}원</dd></div>
          <div><dt>부가세</dt><dd>{money(totals.vat)}원</dd></div>
          <div className="is-total"><dt>합계</dt><dd>{money(totals.amount)}원</dd></div>
        </dl>
        {byKind.length > 1 && <ul>{byKind.map(([kind, { count, amount }]) => <li key={kind}><span>{kind}</span><span>{count.toLocaleString('ko-KR')}건</span><strong>{money(amount)}원</strong></li>)}</ul>}
        {results.length > shownLimit && <small>표에는 {shownLimit}건만 보이지만, 합계는 조건에 맞는 {results.length.toLocaleString('ko-KR')}건 전체로 계산했습니다.</small>}
      </div>}
      <div className="table-wrap expense-search-results">
        <table>
          <thead><tr>{columns.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
            <button className="sort-button" type="button" onClick={() => sortBy(key)}>{label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button>
          </th>)}</tr></thead>
          <tbody>
            {sorted.slice(0, shownLimit).map(expense => {
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
