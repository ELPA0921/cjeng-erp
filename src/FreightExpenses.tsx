import { useMemo, useState, type ReactNode } from 'react'
import type { Expense } from './workspaceTypes'
import { getExpenseSupplyAmount, getExpenseVatAmount } from './expenseAmounts'
import { equipmentCategories, freightCategories, freightGroupOf, freightLabel as label, freightOf, guessFreight, type EquipmentCategory, type FreightCategory } from './freightRules'
import './FreightExpenses.css'

type Group = '전체' | '장비' | '운반비'
const groups: Group[] = ['전체', '장비', '운반비']
export type OutputTable = { title: string; columns: string[]; rows: (string | number)[][]; totals: (string | number)[][] }
const money = (value: number) => value.toLocaleString('ko-KR')
type SortKey = 'date' | 'category' | 'project' | 'kind' | 'vendor' | 'memo' | 'supply' | 'vat' | 'amount'
/** The table's columns: header, sort key, and how the column is aligned. 분류 변경 has no sort. */
const columns: { label: string; key?: SortKey; className: string }[] = [
  { label: '일자', key: 'date', className: 'col-date' },
  { label: '분류', key: 'category', className: 'col-category' },
  { label: '수주번호', key: 'project', className: 'col-project' },
  { label: '구분', key: 'kind', className: 'col-kind' },
  { label: '거래처', key: 'vendor', className: 'col-vendor' },
  { label: '내용', key: 'memo', className: 'col-memo' },
  { label: '공급가액', key: 'supply', className: 'col-money' },
  { label: '부가세', key: 'vat', className: 'col-money' },
  { label: '합계', key: 'amount', className: 'col-money' },
  { label: '분류 변경', className: 'col-class' },
]
/** 장비 has a sub-menu of its kinds (크레인, 지게차, ...); 운반비 is one kind. */
const matches = (group: Group, sub: EquipmentCategory | null, category: FreightCategory) => group === '전체' || (freightGroupOf(category) === group && (!sub || category === sub))

/**
 * 장비·운반비 내역: the year's 장비 (크레인, 지게차, 고소작업대, 스카이, 사다리차, 포크레인) and 운반비 (화물차) expenses from every 공사, 관리비 and 연구.
 * An expense shows up here as soon as it is registered (by hand or from a posted tax invoice or card
 * row) when its 거래처 or 내용 reads like one; 분류 changes the category or leaves it out.
 */
export default function FreightExpenses({ expenses, projectLabel, onSave, initialYear, renderOutput }: {
  expenses: Expense[]
  projectLabel: (projectId: string) => { orderNo: string; name: string }
  onSave: (expenses: Expense[]) => Promise<boolean>
  initialYear: string
  /** The 인쇄 / CSV menu for the shown rows, as on the 지출내역 screens. */
  renderOutput: (table: OutputTable) => ReactNode
}) {
  const listed = useMemo(() => expenses.flatMap(expense => { const category = freightOf(expense); return category ? [{ expense, category }] : [] }), [expenses])
  const years = useMemo(() => [...new Set([initialYear, ...listed.map(row => row.expense.date.slice(0, 4))])].filter(year => year >= '2023').sort().reverse(), [listed, initialYear])
  const [year, setYear] = useState(initialYear)
  const [group, setGroup] = useState<Group>('전체')
  const [sub, setSub] = useState<EquipmentCategory | null>(null)
  const [query, setQuery] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' })

  const ofYear = listed.filter(row => row.expense.date.startsWith(year))
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searchText = (expense: Expense) => { const project = projectLabel(expense.projectId); return [expense.date, project.orderNo, project.name, expense.kind, expense.vendor, expense.memo, expense.note ?? ''].join(' ').toLowerCase() }
  const rows = ofYear
    .filter(row => matches(group, sub, row.category) && words.every(word => searchText(row.expense).includes(word)))
    .sort((a, b) => {
      const value = (row: typeof a): string | number => {
        const { expense } = row
        switch (sort.key) {
          case 'date': return expense.date
          case 'category': return freightCategories.indexOf(row.category)
          case 'project': return projectLabel(expense.projectId).orderNo
          case 'kind': return expense.kind
          case 'vendor': return expense.vendor
          case 'memo': return expense.memo
          case 'supply': return getExpenseSupplyAmount(expense)
          case 'vat': return getExpenseVatAmount(expense)
          case 'amount': return expense.amount
        }
      }
      const x = value(a), y = value(b)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
      // Rows that tie stay in date order whichever way the column is sorted.
      return (sort.direction === 'asc' ? order : -order) || a.expense.date.localeCompare(b.expense.date) || a.expense.vendor.localeCompare(b.expense.vendor, 'ko')
    })
  const excluded = expenses.filter(expense => expense.freight === '제외' && expense.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date))
  const total = (list: Expense[]) => ({ count: list.length, supply: list.reduce((sum, e) => sum + getExpenseSupplyAmount(e), 0), vat: list.reduce((sum, e) => sum + getExpenseVatAmount(e), 0), amount: list.reduce((sum, e) => sum + e.amount, 0) })
  const shownTotal = total(rows.map(row => row.expense))
  const summary = groups.map(item => ({ item, ...total(ofYear.filter(row => matches(item, null, row.category)).map(row => row.expense)) }))
  const kinds = equipmentCategories.map(item => ({ item, ...total(ofYear.filter(row => row.category === item).map(row => row.expense)) }))
  const pickGroup = (item: Group) => { setGroup(item); setSub(null) }

  // A column clicked again flips its order; another column starts from the smallest.
  function toggleSort(key: SortKey | undefined) {
    if (key) setSort(sort.key === key ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }

  async function classify(expense: Expense, value: string) {
    if (saving) return
    setSaving(true)
    try { await onSave(expenses.map(item => item.id === expense.id ? { ...item, freight: value || undefined } : item)) }
    finally { setSaving(false) }
  }

  const title = `${year}년 장비·운반비 내역${group === '전체' ? '' : sub ? ` (장비 · ${sub})` : ` (${group})`}`
  const outputTable: OutputTable = {
    title,
    columns: ['일자', '분류', '수주번호', '공사명', '구분', '거래처', '내용', '공급가액', '부가세', '합계'],
    rows: rows.map(({ expense, category }) => { const project = projectLabel(expense.projectId); return [expense.date, label(category), project.orderNo, project.name, expense.kind, expense.vendor, expense.memo, money(getExpenseSupplyAmount(expense)), money(getExpenseVatAmount(expense)), money(expense.amount)] }),
    totals: [['합계', '', '', '', '', '', `${shownTotal.count}건`, money(shownTotal.supply), money(shownTotal.vat), money(shownTotal.amount)]],
  }

  const classSelect = (expense: Expense) => {
    const guess = guessFreight(expense)
    return <select className="freight-class" aria-label={`${expense.vendor} 분류`} disabled={saving} value={expense.freight ?? ''} onChange={event => void classify(expense, event.target.value)}>
      <option value="">{guess ? `자동 (${label(guess)})` : '자동 (해당없음)'}</option>
      {freightCategories.map(category => <option key={category} value={category}>{label(category)}</option>)}
      <option value="제외">제외</option>
    </select>
  }

  return <section className="content-grid single freight-view">
    <div className="freight-summary" aria-label={`${year}년 분류별 합계`}>
      {summary.map(({ item, count, supply }) => <button key={item} type="button" aria-pressed={group === item} className={`freight-summary-item${group === item ? ' active' : ''}`} onClick={() => pickGroup(item)}>
        <span>{item === '전체' ? '장비 + 운반비' : item}</span><strong>{money(supply)}</strong><small>{count}건 · 공급가액</small>
      </button>)}
    </div>
    <div className="panel full">
      <div className="panel-heading freight-heading">
        <div><h3>{title}</h3><span>지출을 등록하면 거래처·내용에 크레인, 지게차(중기·건설기계), 고소작업대(렌탈), 스카이, 사다리차, 포크레인, 화물, 운반, 운송 등이 있을 때 자동으로 여기에 들어옵니다. 택배는 넣지 않습니다. 분류가 틀리면 오른쪽 「분류 변경」에서 바꾸거나 제외하세요.</span></div>
        <div className="year-switch" aria-label="년도">{years.map(item => <button key={item} type="button" className={item === year ? 'active' : ''} onClick={() => setYear(item)}>{item}</button>)}</div>
      </div>
      <div className="freight-toolbar">
        <div className="freight-filters" role="tablist" aria-label="장비·운반비">
          {groups.map(item => <button key={item} type="button" role="tab" aria-selected={group === item} className={group === item ? 'active' : ''} onClick={() => pickGroup(item)}>{item}</button>)}
        </div>
        <input type="search" className="freight-search" placeholder="거래처, 내용, 공사 검색" aria-label="장비·운반비 검색" value={query} onChange={event => setQuery(event.target.value)} />
        {renderOutput(outputTable)}
      </div>
      {group === '장비' && <div className="freight-kinds" role="tablist" aria-label="장비 종류">
        <button type="button" role="tab" aria-selected={!sub} className={!sub ? 'active' : ''} onClick={() => setSub(null)}><span>장비 전체</span><small>{summary[1].count}건 · {money(summary[1].supply)}</small></button>
        {kinds.map(({ item, count, supply }) => <button key={item} type="button" role="tab" aria-selected={sub === item} className={sub === item ? 'active' : ''} data-freight={item} onClick={() => setSub(item)}><span>{item}</span><small>{count}건 · {money(supply)}</small></button>)}
      </div>}
      <div className="table-wrap freight-table-wrap">
        <table className="freight-table">
          <colgroup>{columns.map(column => <col key={column.label} className={column.className} />)}</colgroup>
          <thead><tr>{columns.map(column => <th key={column.label} scope="col" aria-sort={column.key && sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
            {column.key ? <button type="button" className="sort-button" onClick={() => toggleSort(column.key)}>
              {column.label}{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </button> : column.label}
          </th>)}</tr></thead>
          <tbody>
            {rows.map(({ expense, category }) => { const project = projectLabel(expense.projectId); return <tr key={expense.id}>
              <td>{expense.date}</td>
              <td><span className="freight-tag" data-freight={category}>{label(category)}</span></td>
              <td className="clip" title={project.name}>{project.orderNo}</td>
              <td className="clip" title={expense.kind}>{expense.kind}</td>
              <td className="clip" title={expense.vendor}>{expense.vendor}</td>
              <td className="clip memo" title={expense.memo}>{expense.memo}</td>
              <td className="number">{money(getExpenseSupplyAmount(expense))}</td>
              <td className="number">{money(getExpenseVatAmount(expense))}</td>
              <td className="number">{money(expense.amount)}</td>
              <td>{classSelect(expense)}</td>
            </tr> })}
            {!rows.length && <tr><td colSpan={10} className="freight-empty">{year}년 {group === '전체' ? '' : `${sub ?? group} `}내역이 없습니다.</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td colSpan={6}>합계 {shownTotal.count}건</td><td className="number">{money(shownTotal.supply)}</td><td className="number">{money(shownTotal.vat)}</td><td className="number">{money(shownTotal.amount)}</td><td /></tr></tfoot>}
        </table>
      </div>
      <details className="freight-excluded" open={showExcluded} onToggle={event => setShowExcluded(event.currentTarget.open)}>
        <summary>제외한 지출 {excluded.length}건</summary>
        {excluded.length ? <ul>{excluded.map(expense => <li key={expense.id}><span>{expense.date} · {projectLabel(expense.projectId).orderNo} · {expense.vendor} · {expense.memo} · {money(getExpenseSupplyAmount(expense))}원</span>{classSelect(expense)}</li>)}</ul> : <p>제외한 지출이 없습니다.</p>}
      </details>
      <p className="freight-hint">자동으로 잡히지 않은 지출은 지출내역에서 「지출 수정」을 열어 「장비·운반비」 항목을 골라 주면 여기에 들어옵니다.</p>
    </div>
  </section>
}
