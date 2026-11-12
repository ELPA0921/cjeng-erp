import { useState, type FormEvent } from 'react'
import ModalClose from './ModalClose'
import { isResearchOrderNo, newResearchProjectId, nextResearchOrderNo, researchYear, type ResearchProject } from './researchExpenses'

/**
 * 연구 등록 / 수정: a new 연구 gets the year's next 269NN number (it can be changed before saving);
 * a saved one keeps its number, since 회계반영 records point at it, and only its name changes.
 */
export default function ResearchProjectModal({ project, year, projects, onSave, onClose }: {
  project: ResearchProject | null
  year: string
  projects: ResearchProject[]
  onSave: (project: ResearchProject) => Promise<boolean>
  onClose: () => void
}) {
  const [orderNo, setOrderNo] = useState(project?.orderNo ?? nextResearchOrderNo(projects, year) ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const prefix = `${year.slice(2)}9`

  async function save(event: FormEvent) {
    event.preventDefault()
    const number = orderNo.trim()
    if (!project) {
      if (!isResearchOrderNo(number) || researchYear(number) !== year) { setError(`${year}년 연구비 번호는 ${prefix}01 ~ ${prefix}99 입니다.`); return }
      if (projects.some(other => other.orderNo === number)) { setError(`${number}은(는) 이미 사용 중인 번호입니다.`); return }
    }
    if (!name.trim()) { setError('연구명을 입력해 주세요.'); return }
    setSaving(true); setError('')
    const saved = await onSave({ id: project?.id ?? newResearchProjectId(), orderNo: project?.orderNo ?? number, name: name.trim() })
    setSaving(false)
    if (!saved) setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }

  return <div className="modal-backdrop" role="presentation">
    <form className="modal-panel form-panel small-modal" role="dialog" aria-modal="true" aria-labelledby="research-modal-title" onSubmit={save}>
      <div className="modal-heading">
        <div><h3 id="research-modal-title">{project ? '연구 수정' : '연구 등록'}</h3>
          <span>{project ? '연구명을 고칩니다. 번호는 회계반영 내역과 이어져 있어 바꿀 수 없습니다.' : `${year}년 연구비 번호(${prefix}01부터)를 붙입니다. 수주대장에는 들어가지 않습니다.`}</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      <div className="two-columns">
        <label>연구비 번호<input value={orderNo} inputMode="numeric" maxLength={5} disabled={!!project} placeholder={`${prefix}01`} onChange={event => setOrderNo(event.target.value)} /></label>
        <label>연구명<input autoFocus value={name} placeholder="예: 필터 성능 테스트" onChange={event => setName(event.target.value)} /></label>
      </div>
      {error && <p className="files-note error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  </div>
}
