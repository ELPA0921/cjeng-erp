import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Expense, FreightRecord, WorkspaceData } from './workspaceTypes'
import { equipmentCategories, freightCategories, freightGroupOf, freightLabel as label, freightOf, freightRecordsUntil, guessRoute, isFreightCategory, type EquipmentCategory, type FreightCategory } from './freightRules'
import ModalClose from './ModalClose'
import YearPicker from './YearPicker'
import './FreightExpenses.css'

type Group = '장비' | '운반비'
const groups: Group[] = ['장비', '운반비']
export type OutputTable = { title: string; columns: string[]; rows: (string | number)[][]; totals: (string | number)[][] }
export type FreightProject = { orderNo: string; name: string; client: string; region: string }
export type FreightPatch = Partial<Pick<WorkspaceData, 'expenses' | 'freightRecords'>>
const money = (value: number) => value.toLocaleString('ko-KR')
const untilLabel = freightRecordsUntil.replace(/-/g, '.')

/** A value typed in for the row, or (shown greyed) one read from the 수주대장, 내용 or 거래처 data. */
type Filled = { text: string; auto: boolean }
const typed = (text?: string): Filled => ({ text: text ?? '', auto: false })
/**
 * One line of the list: a line brought over from the Excel files (up to freightRecordsUntil), or an
 * expense after that day whose 거래처·내용 read as 장비 or 운반비.
 */
type Row = {
  id: string
  date: string
  category: FreightCategory
  orderNo: string
  orderName: string
  client: string
  vendor: string
  memo: string
  amount: number
  place: Filled
  hours: string
  from: Filled
  to: Filled
  contact: Filled
  note: string
  expense?: Expense
  record?: FreightRecord
}
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
/** The details typed in per line: 장비 has 장소·사용시간, 운반비 출발지·목적지·연락처, both 비고. */
type DetailField = 'freightPlace' | 'freightHours' | 'freightFrom' | 'freightTo' | 'freightContact' | 'freightNote'
const detailFields: Record<Group, { field: DetailField; label: string }[]> = {
  장비: [{ field: 'freightPlace', label: '장소' }, { field: 'freightHours', label: '사용시간' }, { field: 'freightNote', label: '비고' }],
  운반비: [{ field: 'freightFrom', label: '출발지' }, { field: 'freightTo', label: '목적지' }, { field: 'freightContact', label: '연락처' }, { field: 'freightNote', label: '비고' }],
}
/** Where an Excel line keeps each detail. */
const recordField: Record<DetailField, 'place' | 'hours' | 'from' | 'to' | 'contact' | 'note'> = { freightPlace: 'place', freightHours: 'hours', freightFrom: 'from', freightTo: 'to', freightContact: 'contact', freightNote: 'note' }

/** 장비 has a sub-menu of its kinds (크레인, 지게차, ...); 운반비 is one kind. */
const matches = (group: Group, sub: EquipmentCategory | null, category: FreightCategory) => freightGroupOf(category) === group && (!sub || category === sub)

/**
 * 장비·운반비 내역: 장비 (크레인, 지게차, 고소작업대, 스카이, 사다리차, 포크레인) and 운반비 (화물차).
 * Up to freightRecordsUntil the lines are the ones kept in the Excel files, a line per day of use or
 * per trip. After it, an expense shows up here as soon as it is registered when its 거래처 or 내용
 * reads like one. Ticked lines can be moved to another 분류 or left out, and one line's details
 * (장소, 출발지 ...) typed in.
 */
export default function FreightExpenses({ expenses, records, projectInfo, orderName, vendorPhone, onSave, initialYear, renderOutput }: {
  expenses: Expense[]
  records: FreightRecord[]
  projectInfo: (projectId: string) => FreightProject
  /** The 공사명 of a 수주번호, or ''. */
  orderName: (orderNo: string) => string
  /** The 거래처's phone number from 거래관리, or ''. */
  vendorPhone: (vendor: string) => string
  onSave: (patch: FreightPatch) => Promise<boolean>
  initialYear: string
  /** The 인쇄 / CSV menu for the shown rows, as on the 지출내역 screens. */
  renderOutput: (table: OutputTable) => ReactNode
}) {
  const listed = useMemo(() => {
    const fromRecords: Row[] = records.flatMap(record => !record.excluded && isFreightCategory(record.category) ? [{
      id: record.id, date: record.date, category: record.category, orderNo: record.orderNo, orderName: orderName(record.orderNo), client: record.client,
      vendor: record.vendor, memo: record.vehicle ? `${record.item} (${record.vehicle})` : record.item, amount: record.amount,
      place: typed(record.place), hours: record.hours ?? '', from: typed(record.from), to: typed(record.to), contact: typed(record.contact), note: record.note ?? '', record,
    }] : [])
    const fromExpenses: Row[] = expenses.flatMap(expense => {
      const category = expense.date > freightRecordsUntil ? freightOf(expense) : null
      if (!category) return []
      const project = projectInfo(expense.projectId), route = guessRoute(expense.memo)
      return [{
        id: expense.id, date: expense.date, category, orderNo: project.orderNo, orderName: project.name, client: project.client, vendor: expense.vendor, memo: expense.memo, amount: expense.amount,
        place: expense.freightPlace ? typed(expense.freightPlace) : { text: project.region, auto: true },
        hours: expense.freightHours ?? '',
        from: expense.freightFrom ? typed(expense.freightFrom) : { text: route?.from ?? '', auto: true },
        to: expense.freightTo ? typed(expense.freightTo) : { text: route?.to ?? '', auto: true },
        contact: expense.freightContact ? typed(expense.freightContact) : { text: vendorPhone(expense.vendor), auto: true },
        note: expense.freightNote ?? '', expense,
      }]
    })
    return [...fromRecords, ...fromExpenses]
  }, [expenses, records, projectInfo, orderName, vendorPhone])
  const years = useMemo(() => [...new Set([initialYear, ...listed.map(row => row.date.slice(0, 4))])].sort().reverse(), [listed, initialYear])
  const [year, setYear] = useState('전체')
  const inYear = (date: string) => year === '전체' || date.startsWith(year)
  const yearLabel = year === '전체' ? '전체' : `${year}년`
  const [group, setGroup] = useState<Group>('장비')
  const [sub, setSub] = useState<EquipmentCategory | null>(null)
  const [query, setQuery] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sort, setSort] = useState<{ id: string; direction: 'asc' | 'desc' }>({ id: 'date', direction: 'asc' })
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<{ row: Row; values: Record<DetailField, string> } | null>(null)

  const filledCell = (filled: Filled, source: string) => filled.auto && filled.text ? <span className="freight-auto" title={`자동: ${source}`}>{filled.text}</span> : filled.text
  const common = {
    date: { id: 'date', label: '일자', className: 'col-date', value: (row: Row) => row.date },
    category: { id: 'category', label: '분류', className: 'col-category', value: (row: Row) => label(row.category), cell: (row: Row) => <span className="freight-tag" data-freight={row.category}>{label(row.category)}</span> },
    orderNo: { id: 'orderNo', label: '수주번호', className: 'col-order', value: (row: Row) => row.orderNo, title: (row: Row) => row.orderName },
    client: { id: 'client', label: '수주처', className: 'col-client', value: (row: Row) => row.client },
    vendor: { id: 'vendor', label: '거래처', className: 'col-vendor', value: (row: Row) => row.vendor },
    memo: { id: 'memo', label: '내용', className: 'col-memo', align: 'left' as const, value: (row: Row) => row.memo },
    amount: { id: 'amount', label: '합계', className: 'col-money', align: 'right' as const, value: (row: Row) => row.amount, cell: (row: Row) => money(row.amount) },
    note: { id: 'note', label: '비고', className: 'col-note', align: 'left' as const, value: (row: Row) => row.note },
  }
  const columns: Column[] = group === '장비' ? [
    common.date, common.category, common.orderNo, common.client,
    { id: 'place', label: '장소', className: 'col-place', value: row => row.place.text, cell: row => filledCell(row.place, '수주대장의 지역') },
    common.vendor, common.memo,
    { id: 'hours', label: '사용시간', className: 'col-hours', value: row => row.hours },
    common.amount, common.note,
  ] : [
    common.date, common.orderNo, common.client,
    { id: 'from', label: '출발지', className: 'col-place', value: row => row.from.text, cell: row => filledCell(row.from, '내용에서 읽음') },
    { id: 'to', label: '목적지', className: 'col-place', value: row => row.to.text, cell: row => filledCell(row.to, '내용에서 읽음') },
    common.vendor, common.memo,
    { id: 'contact', label: '연락처', className: 'col-contact', value: row => row.contact.text, cell: row => filledCell(row.contact, '거래관리의 거래처 연락처') },
    common.amount, common.note,
  ]

  const ofYear = listed.filter(row => inYear(row.date))
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searchText = (row: Row) => [row.orderName, ...columns.map(column => column.value(row))].join(' ').toLowerCase()
  const sortColumn = columns.find(column => column.id === sort.id) ?? common.date
  const rows = ofYear
    .filter(row => matches(group, sub, row.category) && words.every(word => searchText(row).includes(word)))
    .sort((a, b) => {
      const x = sort.id === 'category' ? freightCategories.indexOf(a.category) : sortColumn.value(a)
      const y = sort.id === 'category' ? freightCategories.indexOf(b.category) : sortColumn.value(b)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
      // Rows that tie stay in date order whichever way the column is sorted.
      return (sort.direction === 'asc' ? order : -order) || a.date.localeCompare(b.date) || a.vendor.localeCompare(b.vendor, 'ko')
    })
  const excluded = [
    ...records.filter(record => record.excluded && inYear(record.date)).map(record => ({ id: record.id, date: record.date, orderNo: record.orderNo, vendor: record.vendor, memo: record.item, amount: record.amount })),
    ...expenses.filter(expense => expense.freight === '제외' && expense.date > freightRecordsUntil && inYear(expense.date)).map(expense => ({ id: expense.id, date: expense.date, orderNo: projectInfo(expense.projectId).orderNo, vendor: expense.vendor, memo: expense.memo, amount: expense.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const total = (list: Row[]) => ({ count: list.length, amount: list.reduce((sum, row) => sum + row.amount, 0) })
  const shownTotal = total(rows)
  const summary = groups.map(item => ({ item, ...total(ofYear.filter(row => matches(item, null, row.category))) }))
  const kinds = equipmentCategories.map(item => ({ item, ...total(ofYear.filter(row => row.category === item)) }))
  const chosen = rows.filter(row => selected.includes(row.id))
  const allChosen = rows.length > 0 && chosen.length === rows.length
  const pickGroup = (item: Group) => { setGroup(item); setSub(null); setSelected([]) }

  // A column clicked again flips its order; another column starts from the smallest.
  const toggleSort = (id: string) => setSort(sort.id === id ? { id, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { id, direction: 'asc' })
  const toggleRow = (id: string) => setSelected(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])

  /** Saves the changed expenses and Excel lines; a change returns null for a line it leaves alone. */
  async function save(changeExpense: (expense: Expense) => Expense | null, changeRecord: (record: FreightRecord) => FreightRecord | null) {
    if (saving) return false
    let expensesChanged = false, recordsChanged = false
    const nextExpenses = expenses.map(expense => { const next = changeExpense(expense); if (next) expensesChanged = true; return next ?? expense })
    const nextRecords = records.map(record => { const next = changeRecord(record); if (next) recordsChanged = true; return next ?? record })
    if (!expensesChanged && !recordsChanged) return true
    setSaving(true)
    try {
      return await onSave({ ...(expensesChanged ? { expenses: nextExpenses } : {}), ...(recordsChanged ? { freightRecords: nextRecords } : {}) })
    } finally { setSaving(false) }
  }
  async function classify(ids: string[], value: string) {
    if (!ids.length || !value) return
    if (value === '제외' && !window.confirm(`선택한 ${ids.length}건을 장비·운반비 내역에서 제외할까요? 지출내역에서는 지워지지 않습니다.`)) return
    const saved = await save(
      expense => ids.includes(expense.id) ? { ...expense, freight: value === '자동' ? undefined : value } : null,
      // An Excel line has no 거래처·내용 guess to fall back on, so 자동 leaves it as it is.
      record => !ids.includes(record.id) || value === '자동' ? null : value === '제외' ? { ...record, excluded: '제외' } : { ...record, category: value },
    )
    if (saved) setSelected([])
  }
  function openEditor() {
    const row = chosen[0]
    if (!row || chosen.length !== 1) return
    const e = row.expense, r = row.record
    setEditing({ row, values: e
      ? { freightPlace: e.freightPlace ?? '', freightHours: e.freightHours ?? '', freightFrom: e.freightFrom ?? '', freightTo: e.freightTo ?? '', freightContact: e.freightContact ?? '', freightNote: e.freightNote ?? '' }
      : { freightPlace: r?.place ?? '', freightHours: r?.hours ?? '', freightFrom: r?.from ?? '', freightTo: r?.to ?? '', freightContact: r?.contact ?? '', freightNote: r?.note ?? '' } })
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const fields = detailFields[freightGroupOf(editing.row.category)]
    const value = (field: DetailField) => editing.values[field].trim() || undefined
    const saved = await save(
      expense => expense.id === editing.row.id ? { ...expense, ...Object.fromEntries(fields.map(({ field }) => [field, value(field)])) } : null,
      record => record.id === editing.row.id ? { ...record, ...Object.fromEntries(fields.map(({ field }) => [recordField[field], value(field)])) } : null,
    )
    if (saved) { setEditing(null); setSelected([]) }
  }
  const restore = (id: string) => void save(
    expense => expense.id === id ? { ...expense, freight: undefined } : null,
    record => record.id === id ? { ...record, excluded: undefined } : null,
  )

  const title = `${yearLabel} 장비·운반비 내역${sub ? ` (장비 · ${sub})` : ` (${group})`}`
  const amountIndex = columns.findIndex(column => column.id === 'amount')
  const outputTable: OutputTable = {
    title,
    columns: columns.map(column => column.label),
    rows: rows.map(row => columns.map(column => column.id === 'amount' ? money(row.amount) : column.value(row))),
    totals: [columns.map((column, index) => index === 0 ? '합계' : column.id === 'amount' ? money(shownTotal.amount) : index === amountIndex - 1 ? `${shownTotal.count}건` : '')],
  }
  const editingFields = editing ? detailFields[freightGroupOf(editing.row.category)] : []
  // What an expense's blank field shows instead; an Excel line has no automatic values.
  const autoValue = (field: DetailField) => {
    const expense = editing?.row.expense
    if (!expense) return ''
    return field === 'freightPlace' ? projectInfo(expense.projectId).region
      : field === 'freightFrom' ? guessRoute(expense.memo)?.from ?? ''
      : field === 'freightTo' ? guessRoute(expense.memo)?.to ?? ''
      : field === 'freightContact' ? vendorPhone(expense.vendor) : ''
  }

  return <section className="content-grid single freight-view">
    <div className="freight-summary" aria-label={`${yearLabel} 분류별 합계`}>
      {summary.map(({ item, count, amount }) => <button key={item} type="button" aria-pressed={group === item} className={`freight-summary-item${group === item ? ' active' : ''}`} onClick={() => pickGroup(item)}>
        <span>{item}</span><strong>{money(amount)}</strong><small>{count}건 · 합계</small>
      </button>)}
    </div>
    <div className="panel full">
      <div className="panel-heading freight-heading">
        <div><h3>{title}</h3><span>{untilLabel}까지는 「장비 사용 내역」·「화물차 사용내역」 엑셀에서 옮긴 기록(사용일·운반 건마다 한 줄)입니다. 그 뒤로는 지출을 등록하면 거래처·내용에 크레인, 지게차(중기·건설기계), 고소작업대(렌탈), 스카이, 사다리차, 포크레인, 화물, 운반, 운송 등이 있을 때 자동으로 들어옵니다. 택배는 넣지 않습니다.</span></div>
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
        <button type="button" role="tab" aria-selected={!sub} className={!sub ? 'active' : ''} onClick={() => { setSub(null); setSelected([]) }}><span>장비 전체</span><small>{summary[0].count}건 · {money(summary[0].amount)}</small></button>
        {kinds.map(({ item, count, amount }) => <button key={item} type="button" role="tab" aria-selected={sub === item} className={sub === item ? 'active' : ''} data-freight={item} onClick={() => { setSub(item); setSelected([]) }}><span>{item}</span><small>{count}건 · {money(amount)}</small></button>)}
      </div>}
      <div className="freight-actions">
        <strong>선택 {chosen.length}건</strong>
        <select className="freight-class-change" aria-label="선택한 내역의 분류 변경" disabled={!chosen.length || saving} value="" onChange={event => void classify(chosen.map(row => row.id), event.target.value)}>
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
            <th scope="col"><input type="checkbox" aria-label="전체 선택" checked={allChosen} disabled={!rows.length} onChange={() => setSelected(allChosen ? [] : rows.map(row => row.id))} /></th>
            {columns.map(column => <th key={column.id} scope="col" aria-sort={sort.id === column.id ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
              <button type="button" className="sort-button" onClick={() => toggleSort(column.id)}>
                {column.label}{sort.id === column.id ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            </th>)}
          </tr></thead>
          <tbody>
            {rows.map(row => { const checked = selected.includes(row.id); return <tr key={row.id} className={checked ? 'selected' : ''}>
              <td><input type="checkbox" aria-label={`선택 ${row.date} ${row.vendor}`} checked={checked} onChange={() => toggleRow(row.id)} /></td>
              {columns.map(column => { const value = column.value(row); return <td key={column.id} className={`clip${column.align ? ` ${column.align}` : ''}`} title={column.title?.(row) ?? (typeof value === 'string' ? value : undefined)}>{column.cell ? column.cell(row) : value}</td> })}
            </tr> })}
            {!rows.length && <tr><td colSpan={columns.length + 1} className="freight-empty">{yearLabel} {sub ?? group} 내역이 없습니다.</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr>
            <td colSpan={amountIndex + 1}>합계 {shownTotal.count}건</td>
            <td className="right">{money(shownTotal.amount)}</td>
            {columns.slice(amountIndex + 1).map(column => <td key={column.id} />)}
          </tr></tfoot>}
        </table>
      </div>
      <details className="freight-excluded" open={showExcluded} onToggle={event => setShowExcluded(event.currentTarget.open)}>
        <summary>제외한 내역 {excluded.length}건</summary>
        {excluded.length ? <ul>{excluded.map(item => <li key={item.id}><span>{item.date} · {item.orderNo || '-'} · {item.vendor} · {item.memo} · {money(item.amount)}원</span>
          <button type="button" className="ghost-button compact-button" disabled={saving} onClick={() => restore(item.id)}>제외 취소</button></li>)}</ul> : <p>제외한 내역이 없습니다.</p>}
      </details>
      <p className="freight-hint">회색 글자는 자동으로 채운 값입니다(장소: 수주대장의 지역, 출발지·목적지: 내용의 「A → B」, 연락처: 거래관리의 거래처 연락처). 「내용 입력」에서 직접 넣으면 그 값이 쓰입니다. 자동으로 잡히지 않은 지출은 지출내역의 「지출 수정」에서 「장비·운반비」 항목을 고르면 여기에 들어옵니다.</p>
    </div>
    {editing && <div className="modal-backdrop" role="presentation">
      <form className="modal-panel form-panel freight-detail-form" onSubmit={event => void saveDetails(event)}>
        <div className="modal-heading">
          <div><h3>{label(editing.row.category)} 내용 입력</h3><span>{editing.row.date} · {editing.row.orderNo || '-'} · {editing.row.vendor} · {money(editing.row.amount)}원</span></div>
          <ModalClose onClose={() => setEditing(null)} />
        </div>
        <p className="freight-detail-memo">{editing.row.memo}</p>
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
