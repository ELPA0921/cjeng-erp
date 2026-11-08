import { useRef, useState } from 'react'
import type { Order } from './orderTypes'
import type { CardAccounting, Expense, WorkspaceData } from './workspaceTypes'
import { applyCardAccounting, type CardAccountingInput, type PostingSource } from './cardAccounting'
import CardAccountingModal from './CardAccountingModal'

const statusClass: Record<string, string> = { 회계반영: 'is-posted', 강제회계반영: 'is-forced' }
const filters = ['전체', '미반영', '회계반영', '강제회계반영'] as const
type Filter = typeof filters[number]
type SortValue = string | number | null | undefined
const compareValues = (a: SortValue, b: SortValue) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'ko-KR', { numeric: true })
const statusOrder = ['미반영', '회계반영', '강제회계반영']
const isBlank = (value: SortValue) => value === null || value === undefined || value === ''

export type PostingProps = {
  orders: Order[]
  expenses: Expense[]
  cardAccounting: CardAccounting[]
  onSave: (patch: Partial<WorkspaceData>) => Promise<boolean>
  onCreateOrder: (onCreated: (order: Order) => void) => void
}

// How a list describes its rows: what to post, how to sort a column, and what text search sees.
export type PostingView<T> = {
  toSource: (row: T) => PostingSource
  sortValue: (row: T, key: string) => SortValue
  defaultSort: string
  searchText: (row: T) => (string | number | null | undefined)[]
}
const normalize = (value: string) => value.toLowerCase().replace(/[\s,]/g, '')

/**
 * Status tabs, search, row selection and the 회계반영 / 강제회계반영 / 수정 actions shared by
 * every Barobill list (법인카드, 전자세금계산서). Rows are filtered and posted in place.
 * Column sorting: 'orderNo', 'memo' and 'status' read the saved posting; other keys come from
 * sortValue. Blank values always sort last. Search, tabs and sorting apply to the current page.
 */
export function usePosting<T extends { id: string }>(rows: T[], { orders, expenses, cardAccounting, onSave, onCreateOrder }: PostingProps, { toSource, sortValue, defaultSort, searchText }: PostingView<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [modal, setModal] = useState<{ mode: 'post' | 'edit'; rows: PostingSource[] } | null>(null)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<Filter>('미반영')
  const [savingForced, setSavingForced] = useState(false)
  const [sort, setSort] = useState({ key: defaultSort, direction: 'asc' as 'asc' | 'desc' })
  const [search, setSearch] = useState('')
  const skippedNote = useRef('')
  const entries = new Map(cardAccounting.map(entry => [entry.id, entry]))
  const statusOf = (row: T) => entries.get(row.id)?.status ?? '미반영'
  const valueOf = (row: T, key: string): SortValue => key === 'orderNo' ? entries.get(row.id)?.orderNo : key === 'status' ? statusOrder.indexOf(statusOf(row)) : key === 'memo' ? entries.get(row.id)?.memo || sortValue(row, key) : sortValue(row, key)
  // Every word must appear somewhere in the row; spaces and thousands separators are ignored.
  const words = search.split(/\s+/).map(normalize).filter(Boolean)
  const matches = (row: T) => {
    if (!words.length) return true
    const entry = entries.get(row.id)
    const haystack = normalize([...searchText(row), entry?.orderNo, entry?.memo, statusOf(row)].filter(value => value !== null && value !== undefined).join(' '))
    return words.every(word => haystack.includes(word))
  }
  const found = words.length ? rows.filter(matches) : rows
  const pageRows = (filter === '전체' ? found : found.filter(row => statusOf(row) === filter)).map((row, index) => ({ row, index, value: valueOf(row, sort.key) }))
    .sort((a, b) => isBlank(a.value) !== isBlank(b.value) ? (isBlank(a.value) ? 1 : -1) : (sort.direction === 'asc' ? 1 : -1) * compareValues(a.value, b.value) || a.index - b.index)
    .map(item => item.row)
  const filterCount = (value: Filter) => value === '전체' ? found.length : found.filter(row => statusOf(row) === value).length
  const pageSelected = pageRows.filter(row => selectedIds.has(row.id)).length
  const selectedRows = pageRows.filter(row => selectedIds.has(row.id))

  // The search term survives a new query, so it can be typed before the first one.
  function reset() { setSelectedIds(new Set()); setNotice('') }
  function toggleRow(id: string, checked: boolean) {
    setSelectedIds(current => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next })
  }
  function togglePage(checked: boolean) {
    setSelectedIds(current => { const next = new Set(current); for (const row of pageRows) { if (checked) next.add(row.id); else next.delete(row.id) } return next })
  }
  async function save(inputs: CardAccountingInput[]) {
    return onSave(applyCardAccounting(inputs, { cardAccounting, expenses, orders }))
  }
  // Rows already in another state are left alone so one click never overwrites earlier work.
  function pick(allowed: string[], action: string) {
    const picked = selectedRows.filter(row => allowed.includes(statusOf(row)))
    skippedNote.current = selectedRows.length > picked.length ? ` 이미 처리된 ${selectedRows.length - picked.length}건은 제외했습니다. 변경은 수정 버튼을 사용하세요.` : ''
    setNotice(picked.length === 0 ? `${action}할 수 있는 항목을 선택해 주세요.${skippedNote.current}` : skippedNote.current.trim())
    return picked
  }
  function openPost() {
    const picked = pick(['미반영', '강제회계반영'], '회계반영')
    if (picked.length) setModal({ mode: 'post', rows: picked.map(toSource) })
  }
  function openEdit() {
    const picked = selectedRows.filter(row => statusOf(row) !== '미반영')
    setNotice(picked.length ? '' : '수정할 반영 항목을 선택해 주세요. 미반영 항목은 회계반영 버튼을 사용하세요.')
    if (picked.length) setModal({ mode: 'edit', rows: picked.map(toSource) })
  }
  async function forcePost() {
    const picked = pick(['미반영'], '강제회계반영')
    if (!picked.length) return
    setSavingForced(true)
    const saved = await save(picked.map(row => ({ row: toSource(row), status: '강제회계반영', orderNo: '', memo: '' })))
    setSavingForced(false)
    if (!saved) { setNotice('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return }
    setNotice(`${picked.length}건을 강제회계반영했습니다.${skippedNote.current}`)
    setSelectedIds(new Set())
  }
  async function submitModal(inputs: CardAccountingInput[]) {
    try { if (!await save(inputs)) return '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }
    catch (err) { return err instanceof Error ? err.message : '저장하지 못했습니다.' }
    const posted = inputs.filter(input => input.status === '회계반영').length
    setNotice(modal?.mode === 'post' ? `${posted}건을 회계반영했습니다.${skippedNote.current}` : `${inputs.length}건을 수정했습니다.`)
    setModal(null)
    setSelectedIds(new Set())
    return null
  }

  // A row taken out of the 회계반영 window is unticked and stays as it was; the window closes with the last one.
  function removeFromModal(id: string) {
    setSelectedIds(current => { const next = new Set(current); next.delete(id); return next })
    setModal(current => { if (!current) return current; const left = current.rows.filter(row => row.id !== id); return left.length ? { ...current, rows: left } : null })
  }

  /** Sits inside the query form: Enter runs the query until results are loaded, then only filters. */
  const searchBox = (loaded: boolean) => <div className="card-search">
    <input type="search" aria-label="조회 내역 검색" placeholder="거래처, 내용, 수주번호, 금액, 날짜 검색" value={search}
      onChange={event => { setSearch(event.target.value); setSelectedIds(new Set()) }}
      onKeyDown={event => { if (event.key === 'Enter' && loaded) event.preventDefault() }} />
    {loaded && words.length > 0 && <span role="status">{found.length.toLocaleString('ko-KR')}건 일치</span>}
  </div>
  const toolbar = <>
    <div className="card-toolbar">
      <div className="card-filter-tabs" role="tablist" aria-label="회계반영 상태로 보기">
        {filters.map(value => <button key={value} type="button" role="tab" aria-selected={filter === value} className={`card-filter-tab ${statusClass[value] ?? ''}`} onClick={() => { setFilter(value); setSelectedIds(new Set()) }}>
          {/* Only the 미반영 count is a to-do; the other totals carry no meaning. */}
          {value}{value === '미반영' && <span>{filterCount(value).toLocaleString('ko-KR')}</span>}
        </button>)}
      </div>
      <div className="card-accounting-actions">
        <button className="primary-button" type="button" disabled={selectedIds.size === 0 || savingForced} onClick={openPost}>회계반영</button>
        <button className="ghost-button card-force-button" type="button" disabled={selectedIds.size === 0 || savingForced} onClick={() => void forcePost()}>{savingForced ? '저장 중…' : '강제회계반영'}</button>
        <button className="ghost-button" type="button" disabled={selectedIds.size === 0 || savingForced} onClick={openEdit}>수정</button>
      </div>
    </div>
    {notice && <p className="card-accounting-notice" role="status">{notice}</p>}
  </>
  const selectAll = <input type="checkbox" aria-label="보이는 항목 전체 선택" disabled={pageRows.length === 0} checked={pageRows.length > 0 && pageSelected === pageRows.length} ref={input => { if (input) input.indeterminate = pageSelected > 0 && pageSelected < pageRows.length }} onChange={event => togglePage(event.target.checked)} />
  const rowBox = (row: T, label: string) => <input type="checkbox" aria-label={`${label} 선택`} checked={selectedIds.has(row.id)} onChange={event => toggleRow(row.id, event.target.checked)} />
  const statusChip = (row: T) => { const status = statusOf(row); return <span className={`card-accounting ${statusClass[status] ?? ''}`}>{status}</span> }
  const modalElement = modal && <CardAccountingModal mode={modal.mode} rows={modal.rows} entries={entries} orders={orders} onSubmit={submitModal} onClose={() => setModal(null)} onCreateOrder={onCreateOrder} onRemove={removeFromModal} />
  const sortHeader = (key: string, label: string) => <button className="sort-button" type="button" onClick={() => setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))}>
    {label}{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
  </button>
  const emptyMessage = (none: string) => rows.length === 0 ? none : words.length ? `검색어와 일치하는 ${filter === '전체' ? '' : `${filter} `}항목이 없습니다.` : `조회 기간에 ${filter} 항목이 없습니다.`

  return { entries, pageRows, selectedIds, setFilter, reset, searchBox, toolbar, selectAll, rowBox, statusChip, sortHeader, modal: modalElement, emptyMessage }
}
