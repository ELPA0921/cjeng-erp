import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import seed from './deliverySeed.json'
import ModalClose from './ModalClose'
import type { SharedWorkspaceStore } from './workspaceTypes'
import {
  deliveryColumns, deliveryCsv, deliveryKey, emptyDeliveryFilters,
  filterDeliveries, isDelivery, normalizeDeliveryDate, prepareDeliveryImport,
  type Delivery, type DeliveryField, type DeliveryImport,
} from './deliveryData'
import './DeliveryPerformance.css'

const storageKey = 'cost-app-deliveries-v1'
// The edit form pairs the short fields and gives 주소 and 비고 a whole line.
const editOrder: DeliveryField[] = ['date', 'item', 'client', 'company', 'address', 'specification', 'airflow', 'note']
const initialRecords: Delivery[] = seed

function readDeliveries() {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return { records: initialRecords, error: '' }
    const data: unknown = JSON.parse(stored)
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
        !('records' in data) || !Array.isArray(data.records) || !data.records.every(isDelivery)) throw new Error()
    return { records: data.records as Delivery[], error: '' }
  } catch {
    return { records: initialRecords, error: '브라우저의 저장 데이터를 읽을 수 없습니다. 기존 데이터를 보호하기 위해 CSV 추가를 중단했습니다. 브라우저 저장 설정을 확인해 주세요.' }
  }
}

function downloadCsv(records: Delivery[], name: string) {
  const url = URL.createObjectURL(new Blob([deliveryCsv(records)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url; link.download = `${name}.csv`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DeliveryPerformance({workspaceStore}:{workspaceStore?:SharedWorkspaceStore}) {
  const [localSaved, setSaved] = useState(readDeliveries)
  const saved=workspaceStore?{records:workspaceStore.data.deliveries,error:''}:localSaved
  const [filters, setFilters] = useState(emptyDeliveryFilters)
  const [sort, setSort] = useState<{ key: DeliveryField; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [preview, setPreview] = useState<(DeliveryImport & { text: string; name: string; revision?: string }) | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<Delivery | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if(workspaceStore)return
    const refresh = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setSaved(readDeliveries()) }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [workspaceStore])

  const years = [...new Set(saved.records.map(record => record.date.slice(0, 4)))].sort().reverse()
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to)
  const filtered = useMemo(() => filterDeliveries(saved.records, filters).sort((a, b) => {
    const compared = a[sort.key].localeCompare(b[sort.key], 'ko', { numeric: true, sensitivity: 'base' })
    return sort.direction === 'asc' ? compared : -compared
  }), [saved.records, filters, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeFilters = Object.values(filters).some(Boolean)
  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters(current => ({ ...current, [key]: value })); setPage(1); setSelected([])
  }
  const goToPage = (next: number) => { setPage(next); setSelected([]) }
  // Only rows on the page can be ticked, so the header box ticks the page.
  const chosen = visible.filter(record => selected.includes(record.id))
  const allChosen = visible.length > 0 && chosen.length === visible.length
  const toggleRow = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    const date = normalizeDeliveryDate(editing.date)
    const record = Object.fromEntries(Object.entries(editing).map(([key, value]) => [key, value.trim()])) as Delivery
    if (!date || !record.item) { setError('날짜(YYYY-MM-DD)와 품명은 꼭 입력해 주세요.'); return }
    record.date = date
    setSaving(true); setError(''); setMessage('')
    try {
      const latest = workspaceStore ? workspaceStore.data.deliveries : readDeliveries().records
      if (!latest.some(item => item.id === record.id)) throw new Error('다른 사람이 이미 지운 납품실적입니다. 새로고침해 주세요.')
      const records = latest.map(item => item.id === record.id ? record : item)
      if (workspaceStore) { if (!await workspaceStore.save({ deliveries: records }, workspaceStore.revision)) return }
      else { localStorage.setItem(storageKey, JSON.stringify({ version: 1, records })); setSaved({ records, error: '' }) }
      setEditing(null); setSelected([])
      setMessage(`${record.date} ${record.company || record.client} 납품실적을 수정했습니다.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '수정한 내용을 저장하지 못했습니다.')
    } finally { setSaving(false) }
  }

  async function readFile(file: File) {
    setPreview(null); setError(''); setMessage(''); setReading(true)
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('CSV 파일을 선택해 주세요.')
      if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 CSV 파일을 선택해 주세요.')
      const bytes = await file.arrayBuffer()
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { text = new TextDecoder('euc-kr', { fatal: true }).decode(bytes) }
      const result = prepareDeliveryImport(text, saved.records)
      if (!result.total) throw new Error('CSV에 추가할 데이터가 없습니다.')
      setPreview({ ...result, text, name: file.name, revision:workspaceStore?.revision })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '파일을 읽을 수 없습니다.') }
    finally { setReading(false) }
  }

  async function confirmImport() {
    if (!preview || preview.errors.length) return
    try {
      // Re-read storage at commit time so another tab's additions are retained.
      const latest = workspaceStore ? {records:workspaceStore.data.deliveries,error:''} : readDeliveries()
      if (latest.error) throw new Error(latest.error)
      const result = prepareDeliveryImport(preview.text, latest.records)
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      const additions = result.records.map(record => ({ ...record, id: crypto.randomUUID() }))
      const records = [...latest.records, ...additions]
      if(workspaceStore){if(!await workspaceStore.save({deliveries:records},preview.revision ?? workspaceStore.revision))return}
      else { localStorage.setItem(storageKey, JSON.stringify({ version: 1, records })); setSaved({ records, error: '' }) }
      setPreview(null); setFilters(emptyDeliveryFilters); goToPage(1)
      setMessage(`${additions.length}건을 추가했습니다.${result.duplicates ? ` 중복 ${result.duplicates}건은 제외했습니다.` : ''}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장 공간이 부족하거나 브라우저 저장이 차단되어 추가하지 못했습니다.')
    }
  }

  return <section className="content-grid single delivery-view">
    <div className="panel full delivery-panel">
      <div className="panel-heading">
        <div><h3>납품실적 전체조회</h3><span>전체 {saved.records.length.toLocaleString()}건 · 검색 결과 {filtered.length.toLocaleString()}건</span></div>
        <div className="delivery-actions">
          <button type="button" className="ghost-button compact-button" onClick={() => downloadCsv([], '납품실적_업로드양식')}>CSV 양식</button>
          <button type="button" className="ghost-button compact-button" disabled={!filtered.length} onClick={() => downloadCsv(filtered, activeFilters ? '납품실적_검색결과' : '납품실적_전체')}>{activeFilters ? '검색 결과 CSV' : '전체 CSV 내보내기'}</button>
          <button type="button" className="primary-button compact-button" disabled={reading || Boolean(saved.error)} onClick={() => inputRef.current?.click()}>{reading ? '파일 읽는 중…' : 'CSV로 추가'}</button>
          <input ref={inputRef} className="delivery-file" type="file" accept=".csv,text/csv" aria-label="납품실적 CSV 파일" onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void readFile(file)
          }} />
        </div>
      </div>
      <p className="delivery-storage-note">{workspaceStore ? '추가한 납품실적은 직원들과 공유됩니다. 저장 후 다른 화면에도 자동으로 반영됩니다.' : '추가한 데이터는 현재 브라우저에 저장됩니다. 다른 PC에서 보려면 CSV로 내보낸 후 불러오세요.'}</p>
      {(error || saved.error) && <p role="alert" className="delivery-error">{error || saved.error}</p>}
      <p className="delivery-status" role="status">{message}</p>

      {preview && <section className="delivery-import" aria-label="CSV 추가 미리보기">
        <h4>CSV 추가 미리보기</h4>
        <p className="delivery-file-name">{preview.name}</p>
        <p>전체 {preview.total}건 · 추가 {preview.records.length}건 · 중복 제외 {preview.duplicates}건 · 오류 {preview.errors.length}건</p>
        {preview.errors.length > 0 && <div className="delivery-import-errors" role="alert"><strong>오류를 수정한 뒤 파일을 다시 선택해 주세요. 아직 저장되지 않았습니다.</strong><ul>{preview.errors.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        {preview.records.length > 0 && <div className="table-wrap"><table className="delivery-preview-table"><caption>추가 예정 데이터 (최대 5건)</caption><thead><tr>{deliveryColumns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead><tbody>{preview.records.slice(0, 5).map(record => <tr key={deliveryKey(record)}>{deliveryColumns.map(([key]) => <td key={key}>{record[key] || '—'}</td>)}</tr>)}</tbody></table></div>}
        {!preview.records.length && !preview.errors.length && <p>모든 행이 기존 데이터와 중복됩니다. 추가할 데이터가 없습니다.</p>}
        <div className="delivery-actions">
          <button type="button" className="ghost-button compact-button" onClick={() => { setPreview(null); setError('') }}>취소</button>
          <button type="button" className="primary-button compact-button" disabled={!preview.records.length || Boolean(preview.errors.length) || Boolean(saved.error)} onClick={confirmImport}>{preview.records.length}건 추가 확정</button>
        </div>
      </section>}

      <section className="delivery-filters" aria-label="납품실적 검색 조건">
        <div className="delivery-main-filters">
          <label className="delivery-query">전체 검색<input type="search" placeholder="발주처, 회사명, 품명 등 검색" value={filters.query} onChange={event => updateFilter('query', event.target.value)} /></label>
          <label>연도<select value={filters.year} onChange={event => updateFilter('year', event.target.value)}><option value="">전체 연도</option>{years.map(year => <option key={year} value={year}>{year}년</option>)}</select></label>
          <label>시작일<input type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label>
          <label>종료일<input type="date" value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
          <button className="ghost-button compact-button" type="button" disabled={!activeFilters} onClick={() => { setFilters(emptyDeliveryFilters); goToPage(1) }}>검색 초기화</button>
        </div>
        {invalidRange && <p className="delivery-error" role="alert">종료일을 시작일 이후로 설정해 주세요.</p>}
        <details open className="delivery-field-filters"><summary>항목별 검색 <span>입력한 조건을 모두 만족하는 실적을 표시합니다.</span></summary><div>
          {deliveryColumns.map(([key, label]) => <label key={key}>{label}<input type="search" aria-label={`${label} 검색`} placeholder={key === 'date' ? '예: 2023-01' : `${label} 입력`} value={filters[key]} onChange={event => updateFilter(key, event.target.value)} /></label>)}
        </div></details>
      </section>

      <div className="delivery-result-bar"><strong>검색 결과 {filtered.length.toLocaleString()}건 <small>/ 전체 {saved.records.length.toLocaleString()}건</small></strong><div className="delivery-edit-actions"><span>선택 {chosen.length}건</span><button type="button" className="ghost-button compact-button" disabled={chosen.length !== 1 || saving} title="한 건을 체크하면 날짜·발주처·주소·품명·규격·풍량·비고를 고칠 수 있습니다" onClick={() => { setError(''); setEditing({ ...chosen[0] }) }}>수정</button></div><label>표시 개수<select aria-label="페이지당 표시 개수" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); goToPage(1) }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}건</option>)}<option value={Number.MAX_SAFE_INTEGER}>전체</option></select></label></div>
      <div className="table-wrap delivery-table-wrap"><table className="delivery-table"><caption className="delivery-sr-only">납품실적 검색 결과</caption><thead><tr>
        <th scope="col" className="delivery-check"><input type="checkbox" aria-label="이 페이지 전체 선택" checked={allChosen} disabled={!visible.length} onChange={() => setSelected(allChosen ? [] : visible.map(record => record.id))} /></th>
        {deliveryColumns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => { setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); goToPage(1) }}>{label} <span aria-hidden="true">{sort.key === key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>)}
      </tr></thead><tbody>{visible.map(record => { const checked = selected.includes(record.id); return <tr key={record.id} className={checked ? 'selected' : undefined}><td className="delivery-check"><input type="checkbox" aria-label={`선택 ${record.date} ${record.company || record.client}`} checked={checked} onChange={() => toggleRow(record.id)} /></td>{deliveryColumns.map(([key]) => <td key={key}>{record[key] || <span className="delivery-empty">—</span>}</td>)}</tr> })}{!visible.length && <tr><td colSpan={deliveryColumns.length + 1} className="delivery-no-results">검색 조건에 맞는 납품실적이 없습니다. 검색어를 바꾸거나 조건을 초기화해 주세요.</td></tr>}</tbody></table></div>
      <nav className="delivery-pagination" aria-label="납품실적 페이지 이동"><span>{filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} / {filtered.length}건</span><div><button className="ghost-button compact-button" type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>이전</button><span>{currentPage} / {pageCount}</span><button className="ghost-button compact-button" type="button" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}>다음</button></div></nav>
      <details className="delivery-guide"><summary>CSV 추가 방법</summary><p>CSV 양식을 내려받아 첫 행의 8개 머리글을 유지해 주세요. 날짜와 품명은 필수이며, 날짜는 YYYY-MM-DD 형식입니다. UTF-8 또는 Excel의 한국어 CSV를 사용할 수 있습니다.</p><p>업로드 후 미리보기를 확인하고 ‘추가 확정’을 누르세요. 8개 항목이 모두 같은 행은 중복으로 제외하며, 비고나 규격이 다르면 별도 실적으로 추가합니다. 오류 행이 있으면 파일을 수정한 뒤 다시 업로드해 주세요.</p></details>
    </div>
    {editing && <div className="modal-backdrop" role="presentation">
      <form className="modal-panel form-panel delivery-edit-form" onSubmit={event => void saveEdit(event)}>
        <div className="modal-heading">
          <div><h3>납품실적 수정</h3><span>날짜와 품명은 꼭 입력해 주세요.</span></div>
          <ModalClose onClose={() => setEditing(null)} />
        </div>
        <div className="delivery-edit-fields">
          {editOrder.map(key => [key, deliveryColumns.find(([column]) => column === key)?.[1] ?? key] as const).map(([key, label]) => <label key={key} className={key === 'address' || key === 'note' ? 'wide' : undefined}>{label}
            {key === 'note'
              ? <textarea rows={3} value={editing.note} onChange={event => setEditing({ ...editing, note: event.target.value })} />
              : <input type={key === 'date' ? 'date' : 'text'} required={key === 'date' || key === 'item'} value={editing[key]} onChange={event => setEditing({ ...editing, [key]: event.target.value })} />}
          </label>)}
        </div>
        {error && <p role="alert" className="delivery-error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={() => setEditing(null)}>취소</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </div>}
  </section>
}
