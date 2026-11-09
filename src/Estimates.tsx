import { useMemo, useState } from 'react'
import ModalClose from './ModalClose'
import { estimateTotals, itemGrade, itemHasGrade, itemUnitCost, lineAmounts, lineFromItem, nextEstimateNo, quoted, regradeLine, sectionAmounts } from './estimateCalc'
import { downloadEstimate } from './estimateExcel'
import { seedItems } from './estimateSeed'
import { costKinds, grades, itemCategories, normalizeSettings, steelShapes, type CostRates, type Estimate, type EstimateItem, type EstimateLine, type EstimateSection, type EstimateSettings, type Grade } from './estimateTypes'
import type { SharedWorkspaceStore, WorkspaceData } from './workspaceTypes'
import './Estimates.css'

type Patch = Pick<WorkspaceData, 'estimateItems' | 'estimates' | 'estimateSettings'>
type Tab = 'estimates' | 'items' | 'settings'

const storageKeys = { estimateItems: 'cost-app-estimate-items', estimates: 'cost-app-estimates', estimateSettings: 'cost-app-estimate-settings' } as const
function readLocal<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw) as T } catch { return fallback }
}

const won = (value: number) => Math.round(value).toLocaleString('ko-KR')
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const numberValue = (text: string) => { const value = Number(text.replace(/,/g, '')); return Number.isFinite(value) ? value : 0 }
const optionalNumber = (text: string) => text.trim() === '' ? undefined : numberValue(text)
const roundOptions = [[1, '절사 안 함'], [1000, '천 단위'], [10000, '만 단위'], [100000, '십만 단위'], [1000000, '백만 단위']] as const
const rateFields: [keyof Omit<CostRates, 'overheadIncludesExpense'>, string, string][] = [
  ['industrialAccident', '산재 보험료', '직노 ×'], ['employment', '고용 보험료', '직노 ×'], ['health', '건강 보험료', '직노 ×'],
  ['pension', '연금 보험료', '직노 ×'], ['longTermCare', '노인장기 요양보험료', '건보 ×'], ['retirement', '퇴직공제 부금비', '직노 ×'],
  ['safety', '산업안전 보건관리비', '(재+직노) ×'], ['environment', '환경 보전비', '(재+직노+경비) ×'], ['otherExpense', '기타 경비', '(재+노) ×'],
  ['overhead', '일반 관리비', ''], ['profit', '이윤', '(노+경비+일반관리비) ×'],
]

/** A plain number box that keeps what was typed (commas allowed) until it leaves the field. */
function NumberInput({ value, onChange, placeholder, className, label }: { value: number | undefined; onChange: (value: number | undefined) => void; placeholder?: string; className?: string; label: string }) {
  const [text, setText] = useState<string | null>(null)
  return <input className={className} inputMode="decimal" aria-label={label} placeholder={placeholder}
    value={text ?? (value === undefined ? '' : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 }))}
    onFocus={() => setText(value === undefined ? '' : String(value))}
    onChange={event => { setText(event.target.value); onChange(optionalNumber(event.target.value)) }}
    onBlur={() => setText(null)} />
}

export default function Estimates({ workspaceStore }: { workspaceStore?: SharedWorkspaceStore }) {
  const [local, setLocal] = useState(() => ({
    estimateItems: readLocal<EstimateItem[]>(storageKeys.estimateItems, []),
    estimates: readLocal<Estimate[]>(storageKeys.estimates, []),
    estimateSettings: readLocal<Partial<EstimateSettings>>(storageKeys.estimateSettings, {}),
  }))
  const items = workspaceStore?.data.estimateItems ?? local.estimateItems
  const estimates = workspaceStore?.data.estimates ?? local.estimates
  const settings = normalizeSettings(workspaceStore ? workspaceStore.data.estimateSettings : local.estimateSettings)
  const [tab, setTab] = useState<Tab>('estimates')
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function save(patch: Patch) {
    if (workspaceStore) {
      const saved = await workspaceStore.save(patch, workspaceStore.revision)
      if (!saved) setMessage('저장하지 못했습니다. 다른 직원이 먼저 수정했을 수 있으니 새로고침 후 다시 시도하세요.')
      return saved
    }
    setLocal(current => ({ ...current, ...patch }))
    for (const [key, value] of Object.entries(patch)) localStorage.setItem(storageKeys[key as keyof Patch], JSON.stringify(value))
    return true
  }

  const open = estimates.find(row => row.id === openId)

  function createEstimate() {
    const date = today()
    const estimate: Estimate = {
      id: newId('est'), no: nextEstimateNo(date, estimates.map(row => row.no)), title: '', client: '', date,
      paymentTerms: '협의', supplyPeriod: '발주 후 60일', delivery: '설치 완료', validity: '견적일로 30일',
      remarks: '1. 부가세 별도\n2. 견적 외 별도\n3. 1차 전기, 1차 용수 제외',
      grade: '일반', roundTo: 100000, rates: { ...settings.rates }, updatedAt: new Date().toISOString(),
      sections: [{ id: newId('sec'), name: '제작', miscRate: 3, lines: [] }],
    }
    void save({ estimates: [estimate, ...estimates] }).then(saved => { if (saved) { setOpenId(estimate.id); setTab('estimates') } })
  }
  function copyEstimate(source: Estimate) {
    const date = today()
    const copy: Estimate = {
      ...structuredClone(source), id: newId('est'), no: nextEstimateNo(date, estimates.map(row => row.no)), date,
      title: `${source.title} (복사)`, updatedAt: new Date().toISOString(),
    }
    copy.sections = copy.sections.map(section => ({ ...section, id: newId('sec'), lines: section.lines.map(line => ({ ...line, id: newId('line') })) }))
    void save({ estimates: [copy, ...estimates] }).then(saved => { if (saved) setMessage(`${source.no}을(를) ${copy.no}(으)로 복사했습니다.`) })
  }
  function deleteEstimate(target: Estimate) {
    if (!window.confirm(`견적서 ${target.no} "${target.title || '건명 없음'}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    void save({ estimates: estimates.filter(row => row.id !== target.id) })
  }

  return <section className="estimates-view">
    <nav className="contact-tabs est-tabs" aria-label="견적산출 메뉴">
      {([['estimates', '견적서'], ['items', '원가 단가표'], ['settings', 'kg 단가·요율 기준']] as const).map(([key, label]) =>
        <button key={key} type="button" className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined}
          onClick={() => { setTab(key); setOpenId(null); setMessage('') }}>{label}{key === 'items' && <small>{items.length}</small>}</button>)}
    </nav>
    {message && <p className="est-message" role="status">{message}<button type="button" className="text-link" onClick={() => setMessage('')}>닫기</button></p>}

    {tab === 'estimates' && (open
      ? <EstimateEditor key={open.id} estimate={open} items={items} settings={settings}
          onSave={async next => save({ estimates: estimates.map(row => row.id === next.id ? next : row) })}
          onClose={() => setOpenId(null)} />
      : <EstimateList estimates={estimates} itemCount={items.length} onCreate={createEstimate} onOpen={id => setOpenId(id)} onCopy={copyEstimate} onDelete={deleteEstimate} onGoItems={() => setTab('items')} />)}
    {tab === 'items' && <ItemTable items={items} settings={settings} onSave={next => save({ estimateItems: next })} />}
    {tab === 'settings' && <SettingsForm settings={settings} onSave={next => save({ estimateSettings: next })} />}
  </section>
}

function EstimateList({ estimates, itemCount, onCreate, onOpen, onCopy, onDelete, onGoItems }: {
  estimates: Estimate[]; itemCount: number; onCreate: () => void; onOpen: (id: string) => void; onCopy: (row: Estimate) => void; onDelete: (row: Estimate) => void; onGoItems: () => void
}) {
  const [search, setSearch] = useState('')
  const rows = estimates
    .filter(row => !search.trim() || [row.no, row.client, row.title].some(text => text.toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))
  return <article className="panel">
    <div className="panel-heading est-heading">
      <div><h3>견적서 목록</h3><span>원가 단가표에서 품목을 골라 견적을 만들고, 회사 양식 엑셀(갑지·원가계산서·집계표·상세내역서)로 내려받습니다.</span></div>
      <div className="est-actions">
        <input className="est-search" placeholder="견적번호·고객명·건명 검색" value={search} onChange={event => setSearch(event.target.value)} aria-label="견적서 검색" />
        <button type="button" className="primary-button" onClick={onCreate}>새 견적</button>
      </div>
    </div>
    {itemCount === 0 && <div className="est-callout"><p>원가 단가표가 비어 있습니다. 기존 견적서를 분석한 단가로 먼저 채워 두면 견적을 만들 때 골라 쓸 수 있습니다.</p><button type="button" className="ghost-button compact-button" onClick={onGoItems}>원가 단가표로 이동</button></div>}
    {rows.length === 0 ? <p className="est-empty">{estimates.length ? '검색 결과가 없습니다.' : '아직 만든 견적서가 없습니다. 새 견적을 눌러 시작하세요.'}</p> :
      <div className="est-scroll"><table className="est-table">
        <thead><tr><th>견적번호</th><th>작성일</th><th>고객명</th><th>건명</th><th>구분</th><th className="num">원가</th><th className="num">견적 총액</th><th className="num">예상 이익률</th><th /></tr></thead>
        <tbody>{rows.map(row => {
          const totals = estimateTotals(row)
          return <tr key={row.id}>
            <td><button type="button" className="text-link" onClick={() => onOpen(row.id)}>{row.no}</button></td>
            <td>{row.date}</td><td>{row.client || '-'}</td><td className="est-title-cell">{row.title || '(건명 없음)'}</td>
            <td><span className={`est-grade est-grade-${row.grade === '스텐' ? 'sts' : 'gen'}`}>{row.grade}</span></td>
            <td className="num">{won(totals.cost)}</td><td className="num strong">{won(totals.sheet.applied)}</td>
            <td className="num">{totals.sheet.applied ? `${(totals.marginRate * 100).toFixed(1)}%` : '-'}</td>
            <td className="est-row-actions">
              <button type="button" className="ghost-button compact-button" onClick={() => onOpen(row.id)}>열기</button>
              <button type="button" className="ghost-button compact-button" onClick={() => onCopy(row)}>복사</button>
              <button type="button" className="ghost-button compact-button danger" onClick={() => onDelete(row)}>삭제</button>
            </td>
          </tr>
        })}</tbody>
      </table></div>}
  </article>
}

function EstimateEditor({ estimate, items, settings, onSave, onClose }: {
  estimate: Estimate; items: EstimateItem[]; settings: EstimateSettings; onSave: (next: Estimate) => Promise<boolean>; onClose: () => void
}) {
  const [draft, setDraft] = useState(estimate)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [pickerSection, setPickerSection] = useState<string | null>(null)
  const [bulkMarkup, setBulkMarkup] = useState<number | undefined>(1.2)
  const dirty = JSON.stringify(draft) !== JSON.stringify(estimate)
  const totals = useMemo(() => estimateTotals(draft), [draft])

  const update = (patch: Partial<Estimate>) => setDraft(current => ({ ...current, ...patch }))
  const updateSection = (id: string, change: (section: EstimateSection) => EstimateSection) =>
    setDraft(current => ({ ...current, sections: current.sections.map(section => section.id === id ? change(section) : section) }))
  const updateLine = (sectionId: string, lineId: string, patch: Partial<EstimateLine>) =>
    updateSection(sectionId, section => ({ ...section, lines: section.lines.map(line => line.id === lineId ? { ...line, ...patch } : line) }))
  const moveLine = (sectionId: string, index: number, step: number) => updateSection(sectionId, section => {
    const lines = [...section.lines]; const target = index + step
    if (target < 0 || target >= lines.length) return section
    ;[lines[index], lines[target]] = [lines[target], lines[index]]
    return { ...section, lines }
  })

  async function saveDraft() {
    setSaving(true)
    const next = { ...draft, updatedAt: new Date().toISOString() }
    const saved = await onSave(next)
    setSaving(false)
    if (saved) { setDraft(next); setNotice('저장했습니다.') }
  }
  function close() {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 저장하지 않고 목록으로 갈까요?')) return
    onClose()
  }
  function switchGrade(grade: Grade) {
    let changed = 0, kept = 0
    const sections = draft.sections.map(section => ({ ...section, lines: section.lines.map(line => {
      const next = regradeLine(line, grade, items, settings)
      if (next.grade === grade && line.grade !== grade) changed++
      else if (next.grade !== grade) kept++
      return next
    }) }))
    setDraft({ ...draft, grade, sections })
    setNotice(`${grade}(으)로 바꿨습니다: ${changed}개 품목 단가 변경${kept ? `, ${kept}개는 ${grade} 단가가 없어 그대로 둠` : ''}.`)
  }
  function refreshCosts() {
    let changed = 0
    const sections = draft.sections.map(section => ({ ...section, lines: section.lines.map(line => {
      const next = regradeLine(line, line.grade, items, settings)
      if (next.matCost !== line.matCost || next.labCost !== line.labCost || next.expCost !== line.expCost) changed++
      return next
    }) }))
    setDraft({ ...draft, sections })
    setNotice(changed ? `단가표 기준으로 ${changed}개 품목의 원가를 갱신했습니다.` : '단가표와 원가가 모두 같습니다.')
  }
  function applyBulkMarkup() {
    if (!bulkMarkup || bulkMarkup <= 0) return
    let changed = 0
    const sections = draft.sections.map(section => ({ ...section, lines: section.lines.map(line => line.matCost > 0 ? (changed++, { ...line, markup: bulkMarkup }) : line) }))
    setDraft({ ...draft, sections })
    setNotice(`재료비 품목 ${changed}개에 배율 ${bulkMarkup}을 적용했습니다. 노무비·경비만 있는 줄은 그대로입니다.`)
  }
  function addItems(sectionId: string, picked: EstimateItem) {
    updateSection(sectionId, section => ({ ...section, lines: [...section.lines, lineFromItem(picked, draft.grade, settings, newId('line'))] }))
  }
  function addBlankLine(sectionId: string) {
    updateSection(sectionId, section => ({ ...section, lines: [...section.lines, { id: newId('line'), name: '', spec: '', unit: 'EA', qty: 1, grade: draft.grade, matCost: 0, labCost: 0, expCost: 0, markup: 1 }] }))
  }

  const sheet = totals.sheet
  return <div className="est-editor">
    <div className="est-editor-bar panel">
      <button type="button" className="ghost-button compact-button" onClick={close}>← 목록</button>
      <strong className="est-no">{draft.no}</strong>
      <div className="est-segment" role="group" aria-label="일반 / 스텐 전체 전환">
        {grades.map(grade => <button key={grade} type="button" className={draft.grade === grade ? 'active' : ''} aria-pressed={draft.grade === grade} onClick={() => switchGrade(grade)}>{grade}</button>)}
      </div>
      <button type="button" className="ghost-button compact-button" onClick={refreshCosts} title="단가표가 바뀐 뒤 이 견적의 원가를 다시 읽어옵니다">단가표 원가로 갱신</button>
      <span className="est-spacer" />
      <span className="est-bar-total">견적 총액 <strong>{won(sheet.applied)}</strong> 원가 {won(totals.cost)} <em>이익 {sheet.applied ? `${(totals.marginRate * 100).toFixed(1)}%` : '-'}</em></span>
      <button type="button" className="ghost-button compact-button" onClick={() => downloadEstimate(draft)}>엑셀 (제출용)</button>
      <button type="button" className="ghost-button compact-button" onClick={() => downloadEstimate(draft, { includeCost: true })} title="원가·배율·이익이 들어간 시트가 추가됩니다. 고객에게 보내지 마세요.">엑셀 (원가분석 포함)</button>
      <button type="button" className="primary-button" disabled={!dirty || saving} onClick={() => void saveDraft()}>{saving ? '저장 중…' : dirty ? '저장' : '저장됨'}</button>
    </div>
    {notice && <p className="est-message" role="status">{notice}<button type="button" className="text-link" onClick={() => setNotice('')}>닫기</button></p>}

    <div className="est-editor-grid">
      <div className="est-editor-main">
        <article className="panel form-panel est-info">
          <div className="est-info-grid">
            <label>고객명<input value={draft.client} onChange={event => update({ client: event.target.value })} placeholder="예: LG화학" /></label>
            <label className="wide">건명<input value={draft.title} onChange={event => update({ title: event.target.value })} placeholder="예: 150CMM 오존탈취탑 설치공사" /></label>
            <label>작성일<input type="date" value={draft.date} onChange={event => event.target.value && update({ date: event.target.value })} /></label>
            <label>견적번호<input value={draft.no} onChange={event => update({ no: event.target.value })} /></label>
            <label>지불조건<input value={draft.paymentTerms} onChange={event => update({ paymentTerms: event.target.value })} /></label>
            <label>공급기간<input value={draft.supplyPeriod} onChange={event => update({ supplyPeriod: event.target.value })} /></label>
            <label>운반조건<input value={draft.delivery} onChange={event => update({ delivery: event.target.value })} /></label>
            <label>유효기간<input value={draft.validity} onChange={event => update({ validity: event.target.value })} /></label>
            <label>총액 절사<select value={draft.roundTo} onChange={event => update({ roundTo: Number(event.target.value) })}>{roundOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="full">REMARK (한 줄에 하나)<textarea rows={3} value={draft.remarks} onChange={event => update({ remarks: event.target.value })} /></label>
          </div>
        </article>

        <div className="est-bulk">
          <span>재료비 품목 배율 일괄</span>
          <NumberInput className="est-markup-input" label="일괄 배율" value={bulkMarkup} onChange={setBulkMarkup} />
          <button type="button" className="ghost-button compact-button" onClick={applyBulkMarkup}>적용</button>
          <small>견적 단가 = 원가 × 배율. 덕트는 지금까지 1.4를 썼고, 업체 견적을 그대로 넣을 때는 1.0입니다.</small>
        </div>

        {draft.sections.map((section, sectionIndex) => {
          const amounts = sectionAmounts(section)
          return <article className="panel est-section" key={section.id}>
            <div className="est-section-head">
              <span className="est-section-no">{sectionIndex + 1}.</span>
              <input className="est-section-name" aria-label="구간 이름" value={section.name} onChange={event => updateSection(section.id, current => ({ ...current, name: event.target.value }))} placeholder="구간 이름 (예: 오존탈취탑, 전기공사)" />
              <label className="est-misc">잡자재비<NumberInput label="잡자재비 %" value={section.miscRate} onChange={value => updateSection(section.id, current => ({ ...current, miscRate: value ?? 0 }))} />%</label>
              <span className="est-section-sum">견적 {won(amounts.total)} · 원가 {won(amounts.cost)}</span>
              <button type="button" className="ghost-button compact-button danger" disabled={draft.sections.length === 1}
                onClick={() => { if (!section.lines.length || window.confirm(`"${section.name}" 구간과 품목 ${section.lines.length}개를 지울까요?`)) setDraft({ ...draft, sections: draft.sections.filter(row => row.id !== section.id) }) }}>구간 삭제</button>
            </div>
            <div className="est-scroll">
              <table className="est-table est-lines">
                <thead>
                  <tr><th rowSpan={2}>품명</th><th rowSpan={2}>규격</th><th rowSpan={2}>단위</th><th rowSpan={2}>수량</th><th rowSpan={2}>구분</th><th colSpan={3}>원가 단가</th><th rowSpan={2}>배율</th><th rowSpan={2} className="num">견적 단가</th><th rowSpan={2} className="num">견적 금액</th><th rowSpan={2} className="num">원가 금액</th><th rowSpan={2} /></tr>
                  <tr><th>재료비</th><th>노무비</th><th>경비</th></tr>
                </thead>
                <tbody>
                  {section.lines.map((line, index) => {
                    const amounts = lineAmounts(line)
                    const item = line.itemId ? items.find(row => row.id === line.itemId) : undefined
                    return <tr key={line.id}>
                      <td><input aria-label="품명" value={line.name} onChange={event => updateLine(section.id, line.id, { name: event.target.value })} /></td>
                      <td><input aria-label="규격" value={line.spec} onChange={event => updateLine(section.id, line.id, { spec: event.target.value })} /></td>
                      <td><input className="est-unit" aria-label="단위" value={line.unit} onChange={event => updateLine(section.id, line.id, { unit: event.target.value })} /></td>
                      <td><NumberInput className="est-qty" label="수량" value={line.qty} onChange={value => updateLine(section.id, line.id, { qty: value ?? 0 })} /></td>
                      <td><select aria-label="일반/스텐" value={line.grade} onChange={event => updateLine(section.id, line.id, regradeLine(line, event.target.value as Grade, items, settings))}>
                        {grades.map(grade => <option key={grade} value={grade} disabled={!!item && !itemHasGrade(item, grade, settings)}>{grade}</option>)}
                      </select></td>
                      <td><NumberInput className="est-money" label="재료비 원가" value={line.matCost} onChange={value => updateLine(section.id, line.id, { matCost: value ?? 0 })} /></td>
                      <td><NumberInput className="est-money" label="노무비 원가" value={line.labCost} onChange={value => updateLine(section.id, line.id, { labCost: value ?? 0 })} /></td>
                      <td><NumberInput className="est-money" label="경비 원가" value={line.expCost} onChange={value => updateLine(section.id, line.id, { expCost: value ?? 0 })} /></td>
                      <td><NumberInput className={`est-markup-input${line.markup !== 1 ? ' marked' : ''}`} label="배율" value={line.markup} onChange={value => updateLine(section.id, line.id, { markup: value ?? 1 })} /></td>
                      <td className="num">{won(quoted(line.matCost, line.markup) + quoted(line.labCost, line.markup) + quoted(line.expCost, line.markup))}</td>
                      <td className="num strong">{won(amounts.total)}</td>
                      <td className="num muted">{won(amounts.cost)}</td>
                      <td className="est-line-actions">
                        <button type="button" aria-label="위로" title="위로" disabled={index === 0} onClick={() => moveLine(section.id, index, -1)}>↑</button>
                        <button type="button" aria-label="아래로" title="아래로" disabled={index === section.lines.length - 1} onClick={() => moveLine(section.id, index, 1)}>↓</button>
                        <button type="button" aria-label="품목 삭제" title="삭제" onClick={() => updateSection(section.id, current => ({ ...current, lines: current.lines.filter(row => row.id !== line.id) }))}>×</button>
                      </td>
                    </tr>
                  })}
                  {amounts.misc > 0 && <tr className="est-misc-row"><td>잡자재비</td><td>재료비의 {section.miscRate}%</td><td colSpan={8} /><td className="num strong">{won(amounts.misc)}</td><td /><td /></tr>}
                  {!section.lines.length && <tr><td colSpan={13} className="est-empty">품목이 없습니다. 단가표에서 추가하거나 직접 입력하세요.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="est-section-actions">
              <button type="button" className="ghost-button compact-button" onClick={() => setPickerSection(section.id)}>+ 단가표에서 추가</button>
              <button type="button" className="ghost-button compact-button" onClick={() => addBlankLine(section.id)}>+ 직접 입력</button>
            </div>
          </article>
        })}
        <button type="button" className="ghost-button est-add-section" onClick={() => setDraft({ ...draft, sections: [...draft.sections, { id: newId('sec'), name: '', miscRate: 0, lines: [] }] })}>+ 구간 추가</button>

        <details className="panel est-rates">
          <summary>원가계산서 요율 <small>이 견적에만 적용 · 기준값은 "kg 단가·요율 기준" 탭</small></summary>
          <RatesForm rates={draft.rates} onChange={rates => update({ rates })} />
          <button type="button" className="ghost-button compact-button" onClick={() => update({ rates: { ...settings.rates } })}>기준 요율로 되돌리기</button>
        </details>
      </div>

      <aside className="est-summary panel">
        <h3>금액 요약</h3>
        <dl>
          <dt>원가 합계</dt><dd>{won(totals.cost)}</dd>
          <dt>+ 배율로 붙은 금액</dt><dd>{won(totals.markupAmount)}</dd>
          <dt className="sep">직접공사비 (재+노+경)</dt><dd className="sep">{won(totals.direct)}</dd>
          <dt>+ 원가계산서 가산</dt><dd>{won(totals.sheetAmount)}</dd>
          <dt className="total">견적 총액 <small>(VAT 별도)</small></dt><dd className="total">{won(sheet.applied)}</dd>
          <dt className="profit">예상 이익</dt><dd className="profit">{won(totals.margin)} <small>{sheet.applied ? `${(totals.marginRate * 100).toFixed(1)}%` : ''}</small></dd>
        </dl>
        <h4>원가계산서</h4>
        <table className="est-sheet">
          <tbody>
            <tr><th>재료비 (직접경비 포함)</th><td>{won(sheet.materialTotal)}</td></tr>
            <tr><th>노무비</th><td>{won(sheet.labor)}</td></tr>
            <tr><th>경비 (보험·안전관리)</th><td>{won(sheet.expenseTotal)}</td></tr>
            <tr><th>환경보전비</th><td>{won(sheet.environment)}</td></tr>
            <tr><th>기타경비</th><td>{won(sheet.otherExpense)}</td></tr>
            <tr><th>일반관리비</th><td>{won(sheet.overhead)}</td></tr>
            <tr><th>이윤</th><td>{won(sheet.profit)}</td></tr>
            <tr className="total"><th>순공사원가</th><td>{won(sheet.total)}</td></tr>
            <tr className="total"><th>적용 총원가</th><td>{won(sheet.applied)}</td></tr>
          </tbody>
        </table>
      </aside>
    </div>

    {pickerSection && <ItemPicker items={items} settings={settings} grade={draft.grade}
      onPick={item => { addItems(pickerSection, item); setNotice(`"${item.name}${item.spec ? ` ${item.spec}` : ''}" 추가`) }}
      onClose={() => setPickerSection(null)} />}
  </div>
}

function RatesForm({ rates, onChange }: { rates: CostRates; onChange: (rates: CostRates) => void }) {
  return <div className="est-rates-grid">
    {rateFields.map(([key, label, base]) => <label key={key}>
      <span>{label}</span>
      <span className="est-rate-input"><small>{key === 'overhead' ? (rates.overheadIncludesExpense ? '(재+노+경비) ×' : '(재+노) ×') : base}</small><NumberInput label={label} value={rates[key]} onChange={value => onChange({ ...rates, [key]: value ?? 0 })} />%</span>
    </label>)}
    <label className="est-check"><input type="checkbox" checked={rates.overheadIncludesExpense} onChange={event => onChange({ ...rates, overheadIncludesExpense: event.target.checked })} />일반관리비에 경비 포함</label>
  </div>
}

function costLabel(item: EstimateItem, grade: Grade, settings: EstimateSettings) {
  const cost = itemUnitCost(item, grade, settings)
  return cost === undefined ? '-' : won(cost)
}

function ItemPicker({ items, settings, grade, onPick, onClose }: { items: EstimateItem[]; settings: EstimateSettings; grade: Grade; onPick: (item: EstimateItem) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const categories = [...new Set(items.map(item => item.category))]
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = items.filter(item => (!category || item.category === category) && words.every(word => `${item.name} ${item.spec} ${item.category} ${item.vendor}`.toLowerCase().includes(word)))
  return <div className="modal-backdrop" role="presentation">
    <div className="modal-panel est-picker" role="dialog" aria-label="단가표에서 품목 추가">
      <div className="modal-heading"><div><h3>단가표에서 추가</h3><span>누르면 바로 추가됩니다. 여러 개를 연달아 고를 수 있습니다. 현재 구분: {grade}</span></div><ModalClose onClose={onClose} /></div>
      <div className="est-picker-filters">
        <input autoFocus placeholder="품명·규격·거래처 검색" value={search} onChange={event => setSearch(event.target.value)} aria-label="품목 검색" />
        <select value={category} onChange={event => setCategory(event.target.value)} aria-label="분류"><option value="">전체 분류</option>{categories.map(name => <option key={name}>{name}</option>)}</select>
      </div>
      {items.length === 0 ? <p className="est-empty">단가표가 비어 있습니다. 원가 단가표 탭에서 먼저 품목을 넣으세요.</p> :
        <div className="est-scroll est-picker-list"><table className="est-table">
          <thead><tr><th>분류</th><th>품명</th><th>규격</th><th>단위</th><th className="num">일반 원가</th><th className="num">스텐 원가</th><th>배율</th></tr></thead>
          <tbody>{rows.map(item => {
            const used = itemGrade(item, grade, settings)
            return <tr key={item.id} className="est-pick-row" tabIndex={0} onClick={() => onPick(item)} onKeyDown={event => { if (event.key === 'Enter') onPick(item) }}>
              <td>{item.category}</td><td><strong>{item.name}</strong>{used !== grade && <em className="est-tag">{used}만</em>}</td><td>{item.spec}</td><td>{item.unit}</td>
              <td className="num">{costLabel(item, '일반', settings)}</td><td className="num">{costLabel(item, '스텐', settings)}</td><td>{item.markup}</td>
            </tr>
          })}</tbody>
        </table></div>}
      <div className="modal-actions"><button type="button" className="primary-button" onClick={onClose}>완료</button></div>
    </div>
  </div>
}

const emptyItem = (): EstimateItem => ({ id: '', category: '기타', name: '', spec: '', unit: 'EA', kind: '재료비', markup: 1, vendor: '', priceDate: today(), note: '' })
const yearAgo = () => { const date = new Date(); date.setFullYear(date.getFullYear() - 1); return date.toISOString().slice(0, 10) }

function ItemTable({ items, settings, onSave }: { items: EstimateItem[]; settings: EstimateSettings; onSave: (items: EstimateItem[]) => Promise<boolean> }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<EstimateItem | null>(null)
  const categories = [...new Set([...itemCategories, ...items.map(item => item.category)])]
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = items.filter(item => (!category || item.category === category) && words.every(word => `${item.name} ${item.spec} ${item.category} ${item.vendor} ${item.note}`.toLowerCase().includes(word)))
  const stale = yearAgo()

  function remove(item: EstimateItem) {
    if (!window.confirm(`단가표에서 "${item.name} ${item.spec}"을(를) 지울까요? 이미 만든 견적서의 금액은 바뀌지 않습니다.`)) return
    void onSave(items.filter(row => row.id !== item.id))
  }
  async function submit(item: EstimateItem) {
    const next = item.id ? items.map(row => row.id === item.id ? item : row) : [...items, { ...item, id: newId('item') }]
    if (await onSave(next)) setEditing(null)
  }

  return <article className="panel">
    <div className="panel-heading est-heading">
      <div><h3>원가 단가표</h3><span>업체에서 받은 견적·발주 금액(원가)을 할증 없이 넣습니다. 판재·형강은 중량 × kg 단가로 계산되어, kg 단가만 고치면 함께 바뀝니다.</span></div>
      <div className="est-actions">
        <input className="est-search" placeholder="품명·규격·거래처 검색" value={search} onChange={event => setSearch(event.target.value)} aria-label="단가표 검색" />
        <select value={category} onChange={event => setCategory(event.target.value)} aria-label="분류"><option value="">전체 분류</option>{categories.map(name => <option key={name}>{name}</option>)}</select>
        <button type="button" className="primary-button" onClick={() => setEditing(emptyItem())}>품목 추가</button>
      </div>
    </div>
    {items.length === 0 && <div className="est-callout">
      <p><strong>단가표가 비어 있습니다.</strong> 2024~2026년 견적서(D:\창조이엔지)에서 찾은 단가 {seedItems().length}개로 시작할 수 있습니다. 업체 견적에서 확인한 원가와, 우리 견적에서 가져와 원가 확인이 필요한 단가가 비고에 구분되어 있습니다.</p>
      <button type="button" className="primary-button" onClick={() => void onSave(seedItems())}>분석한 단가로 시작하기</button>
    </div>}
    {items.length > 0 && <div className="est-scroll"><table className="est-table">
      <thead><tr><th>분류</th><th>품명</th><th>규격</th><th>단위</th><th>구분</th><th className="num">일반 원가</th><th className="num">스텐 원가</th><th className="num">경비/단위</th><th>배율</th><th>거래처</th><th>기준일</th><th>비고</th><th /></tr></thead>
      <tbody>{rows.map(item => {
        const weight = item.kgPerUnit && item.shape
        const check = /확인 필요/.test(item.note)
        return <tr key={item.id}>
          <td>{item.category}</td><td><strong>{item.name}</strong></td><td>{item.spec}</td><td>{item.unit}</td><td>{item.kind}</td>
          {grades.map(grade => <td key={grade} className="num">{costLabel(item, grade, settings)}{weight && <small className="est-sub">{item.kgPerUnit}kg × {won(settings.kgPrices[`${grade}${item.shape!}`])}</small>}</td>)}
          <td className="num">{item.expense ? won(item.expense) : ''}</td>
          <td>{item.markup !== 1 ? <strong className="est-marked">{item.markup}</strong> : 1}</td>
          <td>{item.vendor}</td>
          <td>{item.priceDate}{item.priceDate && item.priceDate < stale && <em className="est-tag warn">1년 경과</em>}</td>
          <td className={check ? 'est-note warn' : 'est-note'}>{item.note}</td>
          <td className="est-row-actions">
            <button type="button" className="ghost-button compact-button" onClick={() => setEditing(item)}>수정</button>
            <button type="button" className="ghost-button compact-button danger" onClick={() => remove(item)}>삭제</button>
          </td>
        </tr>
      })}</tbody>
    </table></div>}
    {editing && <ItemForm item={editing} categories={categories} settings={settings} onSubmit={submit} onClose={() => setEditing(null)} />}
  </article>
}

function ItemForm({ item, categories, settings, onSubmit, onClose }: { item: EstimateItem; categories: string[]; settings: EstimateSettings; onSubmit: (item: EstimateItem) => void; onClose: () => void }) {
  const [form, setForm] = useState(item)
  const [byWeight, setByWeight] = useState(Boolean(item.kgPerUnit && item.shape))
  const set = (patch: Partial<EstimateItem>) => setForm(current => ({ ...current, ...patch }))
  const preview = { ...form, ...(byWeight ? { shape: form.shape ?? '판재' as const } : { kgPerUnit: undefined, shape: undefined }) }
  const valid = form.name.trim() && form.markup > 0 && (byWeight ? (form.kgPerUnit ?? 0) > 0 : form.costGeneral !== undefined || form.costStainless !== undefined)
  return <div className="modal-backdrop" role="presentation">
    <form className="modal-panel form-panel est-item-form" onSubmit={event => {
      event.preventDefault()
      if (!valid) return
      const { kgPerUnit, shape, costGeneral, costStainless, ...rest } = preview
      onSubmit({ ...rest, name: form.name.trim(), ...(byWeight ? { kgPerUnit, shape } : { ...(costGeneral !== undefined ? { costGeneral } : {}), ...(costStainless !== undefined ? { costStainless } : {}) }) })
    }}>
      <div className="modal-heading"><div><h3>{item.id ? '단가 수정' : '단가 추가'}</h3><span>원가는 업체에서 받은 금액 그대로 넣고, 붙일 금액은 배율로 정합니다.</span></div><ModalClose onClose={onClose} /></div>
      <div className="est-form-grid">
        <label>분류<input list="est-categories" value={form.category} onChange={event => set({ category: event.target.value })} /><datalist id="est-categories">{categories.map(name => <option key={name} value={name} />)}</datalist></label>
        <label>품명<input required value={form.name} onChange={event => set({ name: event.target.value })} /></label>
        <label>규격<input value={form.spec} onChange={event => set({ spec: event.target.value })} /></label>
        <label>단위<input value={form.unit} onChange={event => set({ unit: event.target.value })} /></label>
        <label>견적서 칸<select value={form.kind} onChange={event => set({ kind: event.target.value as EstimateItem['kind'] })}>{costKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>배율<NumberInput label="배율" value={form.markup} onChange={value => set({ markup: value ?? 1 })} /></label>
        <fieldset className="full est-pricing">
          <legend>원가 방식</legend>
          <label className="est-check"><input type="radio" checked={!byWeight} onChange={() => setByWeight(false)} />단가 직접 입력</label>
          <label className="est-check"><input type="radio" checked={byWeight} onChange={() => setByWeight(true)} />중량 × kg 단가 (판재·형강)</label>
        </fieldset>
        {byWeight ? <>
          <label>단위중량 (kg / {form.unit || '단위'})<NumberInput label="단위중량" value={form.kgPerUnit} onChange={value => set({ kgPerUnit: value })} /></label>
          <label>kg 단가 종류<select value={form.shape ?? '판재'} onChange={event => set({ shape: event.target.value as EstimateItem['shape'] })}>{steelShapes.map(shape => <option key={shape}>{shape}</option>)}</select></label>
          <p className="full est-hint">일반 {costLabel(preview, '일반', settings)}원 · 스텐 {costLabel(preview, '스텐', settings)}원 (kg 단가는 기준 탭에서 바꿉니다)</p>
        </> : <>
          <label>일반 원가<NumberInput label="일반 원가" placeholder="일반 없음" value={form.costGeneral} onChange={value => set({ costGeneral: value })} /></label>
          <label>스텐 원가<NumberInput label="스텐 원가" placeholder="스텐 없음" value={form.costStainless} onChange={value => set({ costStainless: value })} /></label>
        </>}
        <label>함께 붙는 경비 (단위당)<NumberInput label="경비" placeholder="없음" value={form.expense} onChange={value => set({ expense: value })} /></label>
        <label>거래처<input value={form.vendor} onChange={event => set({ vendor: event.target.value })} /></label>
        <label>단가 기준일<input type="date" value={form.priceDate} onChange={event => set({ priceDate: event.target.value })} /></label>
        <label className="full">비고 (출처 등)<input value={form.note} onChange={event => set({ note: event.target.value })} /></label>
      </div>
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>취소</button><button type="submit" className="primary-button" disabled={!valid}>저장</button></div>
    </form>
  </div>
}

function SettingsForm({ settings, onSave }: { settings: EstimateSettings; onSave: (settings: EstimateSettings) => Promise<boolean> }) {
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState('')
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
  return <article className="panel form-panel est-settings">
    <div className="panel-heading"><div><h3>kg 단가</h3><span>판재·형강 품목은 단위중량 × 이 단가로 원가가 계산됩니다. 철강 시세가 바뀌면 여기 네 개만 고치세요.</span></div></div>
    <div className="est-kg-grid">
      {grades.map(grade => steelShapes.map(shape => <label key={`${grade}${shape}`}>{grade} {shape} (원/kg)
        <NumberInput label={`${grade} ${shape}`} value={form.kgPrices[`${grade}${shape}`]} onChange={value => setForm({ ...form, kgPrices: { ...form.kgPrices, [`${grade}${shape}`]: value ?? 0 } })} />
      </label>))}
      <label className="full">출처·메모<input value={form.kgNote} onChange={event => setForm({ ...form, kgNote: event.target.value })} /></label>
    </div>
    <div className="panel-heading est-gap"><div><h3>원가계산서 기준 요율</h3><span>새 견적에 들어가는 기본값입니다(현재 값: LG화학 75CMM 2026-07 견적서). 이미 만든 견적서는 바뀌지 않습니다.</span></div></div>
    <RatesForm rates={form.rates} onChange={rates => setForm({ ...form, rates })} />
    <div className="modal-actions">
      {saved && <span className="est-saved">{saved}</span>}
      <button type="button" className="ghost-button" disabled={!dirty} onClick={() => setForm(settings)}>되돌리기</button>
      <button type="button" className="primary-button" disabled={!dirty} onClick={() => void onSave(form).then(ok => setSaved(ok ? '저장했습니다.' : ''))}>저장</button>
    </div>
  </article>
}

