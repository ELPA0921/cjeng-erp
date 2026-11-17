import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Expense } from './workspaceTypes'
import { equipmentCategories, freightCategories, freightGroupOf, freightLabel as label, freightOf, guessRoute, type EquipmentCategory, type FreightCategory } from './freightRules'
import ModalClose from './ModalClose'
import YearPicker from './YearPicker'
import './FreightExpenses.css'

type Group = '전체' | '장비' | '운반비'
const groups: Group[] = ['전체', '장비', '운반비']
export type OutputTable = { title: string; columns: string[]; rows: (string | number)[][]; totals: (string | number)[][] }
export type FreightProject = { orderNo: string; name: string; client: string; region: string }
const money = (value: number) => value.toLocaleString('ko-KR')
const firstYear = '2023'

type Row = { expense: Expense; category: FreightCategory }
/** A value typed in for the row, or (shown greyed) one read from the 수주대장, 내용 or 거래처 data. */
type Filled = { text: string; auto: boolean }
type Column = {
  id: string
  label: string
  className: string
  align?: 'left' | 'right'
  value: (row: Row) => string | number
  /** Shown in place of value, e.g. the 분류 tag or a greyed automatic value. */
  cell?: (row: Row) => ReactNode
  title?: (row: Row) => string
}
/** The details typed in per expense: 장비 has 장소·사용시간, 운반비 출발지·목적지·연락처, both 비고. */
type DetailField = 'freightPlace' | 'freightHours' | 'freightFrom' | 'freightTo' | 'freightContact' | 'freightNote'
const detailFields: Record<'장비' | '운반비', { field: DetailField; label: string }[]> = {
  장비: [{ field: 'freightPlace', label: '장소' }, { field: 'freightHours', label: '사용시간' }, { field: 'freightNote', label: '비고' }],
  운반비: [{ field: 'freightFrom', label: '출발지' }, { field: 'freightTo', label: '목적지' }, { field: 'freightContact', label: '연락처' }, { field: 'freightNote', label: '비고' }],
}

/** 장비 has a sub-menu of its kinds (크레인, 지게차, ...); 운반비 is one kind. */
const matches = (group: Group, sub: EquipmentCategory | null, category: FreightCategory) => group === '전체' || (freightGroupOf(category) === group && (!sub || category === sub))

/**
 * 장비·운반비 내역: 장비 (크레인, 지게차, 고소작업대, 스카이, 사다리차, 포크레인) and 운반비 (화물차)
 * expenses from every 공사, 관리비 and 연구. An expense shows up here as soon as it is registered (by
 * hand or from a posted tax invoice or card row) when its 거래처 or 내용 reads like one. Ticked rows
 * can be moved to another 분류 or left out, and one row's details (장소, 출발지 ...) typed in.
 */
export default function FreightExpenses({ expenses, projectInfo, vendorPhone, onSave, initialYear, renderOutput }: {
  expenses: Expense[]
  projectInfo: (projectId: string) => FreightProject
  /** The 거래처's phone number from 거래관리, or ''. */
  vendorPhone: (vendor: string) => string
  onSave: (expenses: Expense[]) => Promise<boolean>
  initialYear: string
  /** The 인쇄 / CSV menu for the shown rows, as on the 지출내역 screens. */
  renderOutput: (table: OutputTable) => ReactNode
}) {
  const listed = useMemo(() => expenses.flatMap(expense => { const category = freightOf(expense); return category ? [{ expense, category }] : [] }), [expenses])
  const years = useMemo(() => [...new Set([initialYear, ...listed.map(row => row.expense.date.slice(0, 4))])].filter(year => year >= firstYear).sort().reverse(), [listed, initialYear])
  // '전체' lists every year shown here (2023 on); earlier years live in 22년 이전 지출내역.
  const [year, setYear] = useState('전체')
  const inYear = (date: string) => year === '전체' ? date >= firstYear : date.startsWith(year)
  const yearLabel = year === '전체' ? '전체' : `${year}년`
  const [group, setGroup] = useState<Group>('전체')
  const [sub, setSub] = useState<EquipmentCategory | null>(null)
  const [query, setQuery] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sort, setSort] = useState<{ id: string; direction: 'asc' | 'desc' }>({ id: 'date', direction: 'asc' })
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<{ row: Row; values: Record<DetailField, string> } | null>(null)

  const place = (row: Row): Filled => row.expense.freightPlace ? { text: row.expense.freightPlace, auto: false } : { text: projectInfo(row.expense.projectId).region, auto: true }
  const route = (row: Row, end: 'from' | 'to'): Filled => {
    const typed = end === 'from' ? row.expense.freightFrom : row.expense.freightTo
    return typed ? { text: typed, auto: false } : { text: guessRoute(row.expense.memo)?.[end] ?? '', auto: true }
  }
  const contact = (row: Row): Filled => row.expense.freightContact ? { text: row.expense.freightContact, auto: false } : { text: vendorPhone(row.expense.vendor), auto: true }
  const filledCell = (filled: Filled, source: string) => filled.auto && filled.text ? <span className="freight-auto" title={`자동: ${source}`}>{filled.text}</span> : filled.text

  const common = {
    date: { id: 'date', label: '일자', className: 'col-date', value: (row: Row) => row.expense.date },
    category: { id: 'category', label: '분류', className: 'col-category', value: (row: Row) => label(row.category), cell: (row: Row) => <span className="freight-tag" data-freight={row.category}>{label(row.category)}</span> },
    orderNo: { id: 'orderNo', label: '수주번호', className: 'col-order', value: (row: Row) => projectInfo(row.expense.projectId).orderNo, title: (row: Row) => projectInfo(row.expense.projectId).name },
    client: { id: 'client', label: '수주처', className: 'col-client', value: (row: Row) => projectInfo(row.expense.projectId).client },
    vendor: { id: 'vendor', label: '거래처', className: 'col-vendor', value: (row: Row) => row.expense.vendor },
    memo: { id: 'memo', label: '내용', className: 'col-memo', align: 'left' as const, value: (row: Row) => row.expense.memo },
    amount: { id: 'amount', label: '합계', className: 'col-money', align: 'right' as const, value: (row: Row) => row.expense.amount, cell: (row: Row) => money(row.expense.amount) },
    note: { id: 'note', label: '비고', className: 'col-note', align: 'left' as const, value: (row: Row) => row.expense.freightNote ?? '' },
  }
  const columns: Column[] = group === '장비' ? [
    common.date, common.category, common.orderNo, common.client,
    { id: 'place', label: '장소', className: 'col-place', value: row => place(row).text, cell: row => filledCell(place(row), '수주대장의 지역') },
    common.vendor, common.memo,
    { id: 'hours', label: '사용시간', className: 'col-hours', value: row => row.expense.freightHours ?? '' },
    common.amount, common.note,
  ] : group === '운반비' ? [
    common.date, common.orderNo, common.client,
    { id: 'from', label: '출발지', className: 'col-place', value: row => route(row, 'from').text, cell: row => filledCell(route(row, 'from'), '내용에서 읽음') },
    { id: 'to', label: '목적지', className: 'col-place', value: row => route(row, 'to').text, cell: row => filledCell(route(row, 'to'), '내용에서 읽음') },
    common.vendor, common.memo,
    { id: 'contact', label: '연락처', className: 'col-contact', value: row => contact(row).text, cell: row => filledCell(contact(row), '거래관리의 거래처 연락처') },
    common.amount, common.note,
  ] : [common.date, common.category, common.orderNo, common.client, common.vendor, common.memo, common.amount, common.note]

  const ofYear = listed.filter(row => inYear(row.expense.date))
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searchText = (row: Row) => { const project = projectInfo(row.expense.projectId); return [project.name, ...columns.map(column => column.value(row))].join(' ').toLowerCase() }
  const sortColumn = columns.find(column => column.id === sort.id) ?? common.date
  const rows = ofYear
    .filter(row => matches(group, sub, row.category) && words.every(word => searchText(row).includes(word)))
    .sort((a, b) => {
      const x = sort.id === 'category' ? freightCategories.indexOf(a.category) : sortColumn.value(a)
      const y = sort.id === 'category' ? freightCategories.indexOf(b.category) : sortColumn.value(b)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
      // Rows that tie stay in date order whichever way the column is sorted.
      return (sort.direction === 'asc' ? order : -order) || a.expense.date.localeCompare(b.expense.date) || a.expense.vendor.localeCompare(b.expense.vendor, 'ko')
    })
  const excluded = expenses.filter(expense => expense.freight === '제외' && inYear(expense.date)).sort((a, b) => a.date.localeCompare(b.date))
  const total = (list: Row[]) => ({ count: list.length, amount: list.reduce((sum, row) => sum + row.expense.amount, 0) })
  const shownTotal = total(rows)
  const summary = groups.map(item => ({ item, ...total(ofYear.filter(row => matches(item, null, row.category))) }))
  const kinds = equipmentCategories.map(item => ({ item, ...total(ofYear.filter(row => row.category === item)) }))
  const chosen = rows.filter(row => selected.includes(row.expense.id))
  const allChosen = rows.length > 0 && chosen.length === rows.length
  const pickGroup = (item: Group) => { setGroup(item); setSub(null); setSelected([]) }

  // A column clicked again flips its order; another column starts from the smallest.
  const toggleSort = (id: string) => setSort(sort.id === id ? { id, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { id, direction: 'asc' })
  const toggleRow = (id: string) => setSelected(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])

  async function save(change: (expense: Expense) => Expense | null) {
    if (saving) return false
    setSaving(true)
    try { return await onSave(expenses.map(expense => change(expense) ?? expense)) }
    finally { setSaving(false) }
  }
  async function classify(ids: string[], value: string) {
    if (!ids.length || !value) return
    if (value === '제외' && !window.confirm(`선택한 ${ids.length}건을 장비·운반비 내역에서 제외할까요? 지출내역에서는 지워지지 않습니다.`)) return
    if (await save(expense => ids.includes(expense.id) ? { ...expense, freight: value === '자동' ? undefined : value } : null)) setSelected([])
  }
  function openEditor() {
    const row = chosen[0]
    if (!row || chosen.length !== 1) return
    const e = row.expense
    setEditing({ row, values: { freightPlace: e.freightPlace ?? '', freightHours: e.freightHours ?? '', freightFrom: e.freightFrom ?? '', freightTo: e.freightTo ?? '', freightContact: e.freightContact ?? '', freightNote: e.freightNote ?? '' } })
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const fields = detailFields[freightGroupOf(editing.row.category)]
    const saved = await save(expense => expense.id === editing.row.expense.id
      ? { ...expense, ...Object.fromEntries(fields.map(({ field }) => [field, editing.values[field].trim() || undefined])) }
      : null)
    if (saved) { setEditing(null); setSelected([]) }
  }

  const title = `${yearLabel} 장비·운반비 내역${group === '전체' ? '' : sub ? ` (장비 · ${sub})` : ` (${group})`}`
  const amountIndex = columns.findIndex(column => column.id === 'amount')
  const outputTable: OutputTable = {
    title,
    columns: columns.map(column => column.label),
    rows: rows.map(row => columns.map(column => column.id === 'amount' ? money(row.expense.amount) : column.value(row))),
    totals: [columns.map((column, index) => index === 0 ? '합계' : column.id === 'amount' ? money(shownTotal.amount) : index === amountIndex - 1 ? `${shownTotal.count}건` : '')],
  }
  const editingFields = editing ? detailFields[freightGroupOf(editing.row.category)] : []
  const autoValue = (field: DetailField) => {
    if (!editing) return ''
    const row = editing.row
    return field === 'freightPlace' ? place({ ...row, expense: { ...row.expense, freightPlace: undefined } }).text
      : field === 'freightFrom' ? guessRoute(row.expense.memo)?.from ?? ''
      : field === 'freightTo' ? guessRoute(row.expense.memo)?.to ?? ''
      : field === 'freightContact' ? vendorPhone(row.expense.vendor) : ''
  }

  return <section className="content-grid single freight-view">
    <div className="freight-summary" aria-label={`${yearLabel} 분류별 합계`}>
      {summary.map(({ item, count, amount }) => <button key={item} type="button" aria-pressed={group === item} className={`freight-summary-item${group === item ? ' active' : ''}`} onClick={() => pickGroup(item)}>
        <span>{item === '전체' ? '장비 + 운반비' : item}</span><strong>{money(amount)}</strong><small>{count}건 · 합계</small>
      </button>)}
    </div>
    <div className="panel full">
      <div className="panel-heading freight-heading">
        <div><h3>{title}</h3><span>지출을 등록하면 거래처·내용에 크레인, 지게차(중기·건설기계), 고소작업대(렌탈), 스카이, 사다리차, 포크레인, 화물, 운반, 운송 등이 있을 때 자동으로 여기에 들어옵니다. 택배는 넣지 않습니다. 분류가 틀리면 체크한 뒤 「분류 변경」으로 바꾸거나 제외하세요.</span></div>
        <YearPicker ariaLabel="년도" value={year} options={[{ value: '전체', label: '전체' }, ...years.map(item => ({ value: item, label: item }))]} onChange={item => { setYear(item); setSelected([]) }} />
      </div>
      <div className="freight-toolbar">
        <div className="freight-filters" role="tablist" aria-label="장비·운반비">
          {groups.map(item => <button key={item} type="button" role="tab" aria-selected={group === item} className={group === item ? 'active' : ''} onClick={() => pickGroup(item)}>{item}</button>)}
        </div>
        <input type="search" className="freight-search" placeholder="거래처, 내용, 공사 검색" aria-label="장비·운반비 검색" value={query} onChange={event => { setQuery(event.target.value); setSelected([]) }} />
        {renderOutput(outputTable)}
      </div>
      {group === '장비' && <div className="freight-kinds" role="tablist" aria-label="장비 종류">
        <button type="button" role="tab" aria-selected={!sub} className={!sub ? 'active' : ''} onClick={() => { setSub(null); setSelected([]) }}><span>장비 전체</span><small>{summary[1].count}건 · {money(summary[1].amount)}</small></button>
        {kinds.map(({ item, count, amount }) => <button key={item} type="button" role="tab" aria-selected={sub === item} className={sub === item ? 'active' : ''} data-freight={item} onClick={() => { setSub(item); setSelected([]) }}><span>{item}</span><small>{count}건 · {money(amount)}</small></button>)}
      </div>}
      <div className="freight-actions">
        <strong>선택 {chosen.length}건</strong>
        <select className="freight-class-change" aria-label="선택한 지출의 분류 변경" disabled={!chosen.length || saving} value="" onChange={event => void classify(chosen.map(row => row.expense.id), event.target.value)}>
          <option value="" disabled>분류 변경</option>
          {freightCategories.map(category => <option key={category} value={category}>{label(category)}</option>)}
          <option value="자동">자동 (거래처·내용으로 판단)</option>
          <option value="제외">제외</option>
        </select>
        <button type="button" className="ghost-button compact-button" disabled={chosen.length !== 1 || saving} title="한 건을 선택하면 장소·사용시간·출발지·목적지·연락처·비고를 입력합니다" onClick={openEditor}>내용 입력</button>
      </div>
      <div className="table-wrap freight-table-wrap">
        <table className="freight-table" style={{ minWidth: `${columns.length * 105 + 220}px` }}>
          <colgroup><col className="col-check" />{columns.map(column => <col key={column.id} className={column.className} />)}</colgroup>
          <thead><tr>
            <th scope="col"><input type="checkbox" aria-label="전체 선택" checked={allChosen} disabled={!rows.length} onChange={() => setSelected(allChosen ? [] : rows.map(row => row.expense.id))} /></th>
            {columns.map(column => <th key={column.id} scope="col" aria-sort={sort.id === column.id ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
              <button type="button" className="sort-button" onClick={() => toggleSort(column.id)}>
                {column.label}{sort.id === column.id ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            </th>)}
          </tr></thead>
          <tbody>
            {rows.map(row => { const checked = selected.includes(row.expense.id); return <tr key={row.expense.id} className={checked ? 'selected' : ''}>
              <td><input type="checkbox" aria-label={`선택 ${row.expense.date} ${row.expense.vendor}`} checked={checked} onChange={() => toggleRow(row.expense.id)} /></td>
              {columns.map(column => { const value = column.value(row); return <td key={column.id} className={`clip${column.align ? ` ${column.align}` : ''}`} title={column.title?.(row) ?? (typeof value === 'string' ? value : undefined)}>{column.cell ? column.cell(row) : value}</td> })}
            </tr> })}
            {!rows.length && <tr><td colSpan={columns.length + 1} className="freight-empty">{yearLabel} {group === '전체' ? '' : `${sub ?? group} `}내역이 없습니다.</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr>
            <td colSpan={amountIndex + 1}>합계 {shownTotal.count}건</td>
            <td className="right">{money(shownTotal.amount)}</td>
            {columns.slice(amountIndex + 1).map(column => <td key={column.id} />)}
          </tr></tfoot>}
        </table>
      </div>
      <details className="freight-excluded" open={showExcluded} onToggle={event => setShowExcluded(event.currentTarget.open)}>
        <summary>제외한 지출 {excluded.length}건</summary>
        {excluded.length ? <ul>{excluded.map(expense => <li key={expense.id}><span>{expense.date} · {projectInfo(expense.projectId).orderNo} · {expense.vendor} · {expense.memo} · {money(expense.amount)}원</span>
          <button type="button" className="ghost-button compact-button" disabled={saving} onClick={() => void save(item => item.id === expense.id ? { ...item, freight: undefined } : null)}>제외 취소</button></li>)}</ul> : <p>제외한 지출이 없습니다.</p>}
      </details>
      <p className="freight-hint">회색 글자는 자동으로 채운 값입니다(장소: 수주대장의 지역, 출발지·목적지: 내용의 「A → B」, 연락처: 거래관리의 거래처 연락처). 「내용 입력」에서 직접 넣으면 그 값이 쓰입니다. 자동으로 잡히지 않은 지출은 지출내역의 「지출 수정」에서 「장비·운반비」 항목을 고르면 여기에 들어옵니다.</p>
    </div>
    {editing && <div className="modal-backdrop" role="presentation">
      <form className="modal-panel form-panel freight-detail-form" onSubmit={event => void saveDetails(event)}>
        <div className="modal-heading">
          <div><h3>{label(editing.row.category)} 내용 입력</h3><span>{editing.row.expense.date} · {projectInfo(editing.row.expense.projectId).orderNo} · {editing.row.expense.vendor} · {money(editing.row.expense.amount)}원</span></div>
          <ModalClose onClose={() => setEditing(null)} />
        </div>
        <p className="freight-detail-memo">{editing.row.expense.memo}</p>
        {editingFields.map(({ field, label: name }) => <label key={field}>{name}
          <input value={editing.values[field]} placeholder={autoValue(field) ? `비워 두면 자동: ${autoValue(field)}` : name}
            onChange={event => setEditing({ ...editing, values: { ...editing.values, [field]: event.target.value } })} />
        </label>)}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={() => setEditing(null)}>취소</button>
          <button className="primary-button" type="submit" disabled={saving}>저장</button>
        </div>
      </form>
    </div>}
  </section>
}
