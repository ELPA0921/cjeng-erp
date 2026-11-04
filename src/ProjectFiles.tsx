import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import ModalClose from './ModalClose'
import type { ProjectFilesStore } from './useProjectFiles'
import { deleteProjectFile, downloadUrl, fileDate, fileUrl, maxPdfBytes, openImageViewer, openPicturePreview, pdfPages, picturesPdf, prepareImage, preparePdf, preparePhoto, saveBlob, updateProjectFile, uploadProjectFile, type DriveFolder, type FileKind, type ProjectFile } from './projectFileApi'

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
/** The pictures among the files, and PDFs too where withPdf says so. */
const imageFiles = (list: FileList | DataTransferItemList | null | undefined, withPdf = false) =>
  [...(list ?? [])].map(item => item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null)
    .filter((file): file is File => !!file && (file.type.startsWith('image/') || (withPdf && isPdf(file))))
const message = (error: unknown) => error instanceof Error ? error.message : '저장하지 못했습니다.'

/** A picture pasted anywhere on the page is handed over; pasted text still goes to the text box. */
function usePastedImages(onImages: (files: File[]) => void, enabled = true) {
  const latest = useRef(onImages)
  useEffect(() => { latest.current = onImages })
  useEffect(() => {
    if (!enabled) return
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFiles(event.clipboardData?.items)
      if (!files.length) return
      event.preventDefault()
      latest.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enabled])
}

function FilesUnavailable({ store }: { store: ProjectFilesStore }) {
  if (!store.shared) return <p className="files-note">사진은 공유 저장소에 연결된 상태에서만 볼 수 있습니다.</p>
  if (store.error) return <p className="files-note error">{store.error}</p>
  if (!store.loaded) return <p className="files-note">불러오는 중…</p>
  return null
}

/** One 발주서 with its pages, and the PDF it came as if it did. The first picture carries the details. */
type FileGroup = { key: string; pages: ProjectFile[]; meta: Record<string, string>; pdf?: ProjectFile }

// Pictures of one group share meta.group; ones saved before groups existed have none and go by their own id.
const groupKey = (file: ProjectFile) => file.meta.group || file.id
const groupPages = (files: ProjectFile[], kind: FileKind, key: string) =>
  files.filter(file => file.kind === kind && groupKey(file) === key).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
const groupPdf = (files: ProjectFile[], key: string) => files.find(file => file.kind === 'purchaseOrderPdf' && file.meta.group === key)
const fileGroups = (files: ProjectFile[], kind: FileKind): FileGroup[] =>
  [...new Set(files.filter(file => file.kind === kind).map(groupKey))].map(key => { const pages = groupPages(files, kind, key); return { key, pages, meta: pages[0].meta, pdf: groupPdf(files, key) } })

/** Every picture of the groups in order for the viewer; a group of several numbers its pages. */
function viewerItems(groups: FileGroup[], title: (group: FileGroup) => string, name: (group: FileGroup, index: number) => string) {
  return groups.flatMap((group, groupIndex) => group.pages.map((page, index) => {
    const pageNo = group.pages.length > 1 ? index + 1 : 0
    return {
      id: page.id,
      title: title(group) + (pageNo ? ` (${pageNo}/${group.pages.length}장)` : ''),
      name: [name(group, groupIndex), pageNo ? String(pageNo) : ''].filter(Boolean).join('_'),
    }
  }))
}

async function deleteGroup(store: ProjectFilesStore, group: FileGroup) {
  try {
    for (const page of [...group.pages, ...group.pdf ? [group.pdf] : []]) { await deleteProjectFile(page.id); store.removed(page.id) }
  } catch (error) { window.alert(message(error)) }
}

/**
 * The pictures of one group while its form is open. Saved ones come from the store, so a retry after
 * a half-finished save neither repeats nor loses one; new ones wait here until saved.
 */
function useGroupEditor(store: ProjectFilesStore, projectId: string, folder: DriveFolder, kind: FileKind, group: FileGroup | null) {
  const [key] = useState(() => group?.key ?? crypto.randomUUID())
  // A page drawn from a PDF remembers that PDF.
  const [pictures, setPictures] = useState<{ file: File; url: string; pdf?: File }[]>([])
  const [removing, setRemoving] = useState<string[]>([])
  const [converting, setConverting] = useState(false)
  const [problem, setProblem] = useState('')
  const urls = useRef<string[]>([])
  useEffect(() => { const made = urls.current; return () => made.forEach(url => URL.revokeObjectURL(url)) }, [])
  /** Adds pictures as they are and each page of a PDF as a picture of its own. */
  const add = async (files: File[]) => {
    const added: { file: File; url: string; pdf?: File }[] = []
    setProblem('')
    try {
      for (const file of files) {
        if (!isPdf(file)) { added.push({ file, url: URL.createObjectURL(file) }); continue }
        setConverting(true)
        for (const page of await pdfPages(file)) added.push({ file: page, url: URL.createObjectURL(page), pdf: file })
      }
    } catch (error) { setProblem(message(error)) } finally { setConverting(false) }
    urls.current.push(...added.map(picture => picture.url))
    setPictures(current => [...current, ...added])
  }
  usePastedImages(add)
  const saved = groupPages(store.files, kind, key).filter(page => !removing.includes(page.id))
  // The PDF a 발주서 came as is kept only while its pages are exactly that PDF's.
  const pdfs = new Set(pictures.map(picture => picture.pdf))
  const newPdf = !saved.length && pdfs.size === 1 ? [...pdfs][0] : undefined
  const pages = [
    ...saved.map(page => ({ key: page.id, src: fileUrl(page.id, true), full: window.location.origin + fileUrl(page.id), remove: () => setRemoving(current => [...current, page.id]) })),
    ...pictures.map(picture => ({ key: picture.url, src: picture.url, full: picture.url, remove: () => setPictures(current => current.filter(item => item !== picture)) })),
  ]

  /** Writes the details the form changed onto every saved picture, then uploads the new ones and drops the removed ones. */
  async function save(meta: Record<string, string>) {
    const changed = Object.entries(meta).filter(([field, value]) => value !== (group?.meta[field] ?? ''))
    const oldPdf = groupPdf(store.files, key)
    const pagesChanged = pictures.length > 0 || removing.length > 0
    for (const page of [...saved, ...oldPdf && !pagesChanged ? [oldPdf] : []]) {
      if (changed.some(([field, value]) => page.meta[field] !== value)) store.replaced(await updateProjectFile(page.id, { ...page.meta, ...Object.fromEntries(changed) }))
    }
    for (const picture of pictures) {
      store.added(await uploadProjectFile(projectId, kind, { ...meta, group: key, fileName: picture.file.name }, await prepareImage(picture.file), folder))
      setPictures(current => current.filter(item => item !== picture))
    }
    if (oldPdf && pagesChanged) { await deleteProjectFile(oldPdf.id); store.removed(oldPdf.id) }
    if (newPdf && newPdf.size <= maxPdfBytes) store.added(await uploadProjectFile(projectId, 'purchaseOrderPdf', { ...meta, group: key, fileName: newPdf.name }, await preparePdf(newPdf), folder))
    for (const id of removing) {
      if (store.files.some(file => file.id === id)) await deleteProjectFile(id)
      store.removed(id)
    }
  }
  return { pages, add, save, converting, problem, pdfTooBig: !!newPdf && newPdf.size > maxPdfBytes }
}

/** The group's pictures in order, each opening big in a window beside the form, with × to take it out, and a tile to add more. */
function PageStrip({ editor, disabled, empty }: { editor: ReturnType<typeof useGroupEditor>; disabled: boolean; empty: string }) {
  const picker = <input type="file" accept="image/*,application/pdf,.pdf" multiple disabled={editor.converting} onChange={event => { const files = imageFiles(event.target.files, true); event.target.value = ''; void editor.add(files) }} />
  if (editor.converting && !editor.pages.length) return <p className="file-drop"><span>PDF를 그림으로 바꾸는 중…</span></p>
  if (!editor.pages.length) return <label className="file-drop"><span>{empty}</span>{picker}</label>
  return <div className="page-strip">
    {editor.pages.map((page, index) => <figure key={page.key}>
      <button className="page-view" type="button" title="새 창에서 크게 보기" onClick={() => openPicturePreview(editor.pages.map((item, at) => ({ title: `발주서 ${at + 1}장`, src: item.full })), index)}>
        <img src={page.src} alt={`${index + 1}장`} />
      </button>
      <figcaption>{index + 1}장<button type="button" title="이 장 빼기" aria-label={`${index + 1}장 빼기`} disabled={disabled} onClick={page.remove}>×</button></figcaption>
    </figure>)}
    <label className="file-drop page-add">
      <span>{editor.converting ? 'PDF를 그림으로 바꾸는 중…' : <>+ 장 추가<small>사진·PDF 붙여넣기·끌어다 놓기·선택</small></>}</span>
      {picker}
    </label>
  </div>
}

type PurchaseOrderForm = { vendor: string; item: string; date: string; poNumber: string }
const emptyForm: PurchaseOrderForm = { vendor: '', item: '', date: '', poNumber: '' }

/**
 * 발주서 게시판: one post per 발주서 with 수주번호, 거래처 (상호), 내용 (first item, "외" when
 * there are more), 날짜 and 발주번호. A 발주서 may have several pages. Clicking a post opens its
 * pages in a new window.
 */
/** folder names the 공사's folder in the shared drive, such as "24012 집진시스템 개선 공사" in "2024년". */
export function PurchaseOrderBoard({ projectId, orderNo, folder, store }: { projectId: string; orderNo: string; folder: DriveFolder; store: ProjectFilesStore }) {
  const posts = fileGroups(store.files, 'purchaseOrder')
    .sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? '') || (b.meta.poNumber ?? '').localeCompare(a.meta.poNumber ?? '') || b.pages[0].createdAt.localeCompare(a.pages[0].createdAt))
  const [editing, setEditing] = useState<FileGroup | 'new' | null>(null)
  const fileName = ({ meta }: FileGroup) => [orderNo, meta.poNumber || meta.date, meta.vendor].filter(Boolean).join('_') || '발주서'
  const items = viewerItems(posts, ({ meta }) => [orderNo, meta.vendor, meta.item, meta.poNumber].filter(Boolean).join(' · '), fileName)
  const open = (post: FileGroup) => openImageViewer(items, items.findIndex(item => item.id === post.pages[0].id))
  const [makingPdf, setMakingPdf] = useState('')
  /** Saves the PDF the 발주서 came as, or one made from its pictures. */
  async function downloadPdf(post: FileGroup) {
    if (post.pdf) { const link = document.createElement('a'); link.href = downloadUrl(post.pdf.id, fileName(post)); link.click(); return }
    setMakingPdf(post.key)
    try { saveBlob(await picturesPdf(post.pages.map(page => page.id)), `${fileName(post)}.pdf`) }
    catch (error) { window.alert(message(error)) }
    finally { setMakingPdf('') }
  }
  const remove = (post: FileGroup) => {
    if (window.confirm(`${post.meta.vendor || '이'} 발주서를 삭제할까요? 사진${post.pages.length > 1 ? ` ${post.pages.length}장` : ''}도 함께 지워집니다.`)) deleteGroup(store, post)
  }

  return <>
    <div className="panel-heading">
      <h3>발주서</h3>
      <div className="files-heading-actions">
        <span>클릭하면 새 창에서 발주서를 보고 내려받을 수 있습니다.</span>
        {store.shared && store.loaded && !store.error && <button className="primary-button compact-button" type="button" onClick={() => setEditing('new')}>발주서 등록</button>}
      </div>
    </div>
    <FilesUnavailable store={store} />
    {store.loaded && !store.error && <div className="table-wrap">
      <table className="file-board">
        <thead><tr><th>수주번호</th><th>거래처</th><th>내용</th><th>날짜</th><th>발주번호</th><th aria-label="관리"></th></tr></thead>
        <tbody>
          {posts.map(post => <tr key={post.key} tabIndex={0} title="새 창에서 발주서 보기" onClick={() => open(post)}
            onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) open(post) }}>
            <td>{orderNo}</td>
            <td>{post.meta.vendor || '-'}</td>
            <td className="file-board-title">{post.meta.item || '-'}{post.pages.length > 1 && <span className="page-count">{post.pages.length}장</span>}</td>
            <td className="date-cell">{post.meta.date || '-'}</td>
            <td>{post.meta.poNumber || '-'}</td>
            <td className="file-board-actions" onClick={event => event.stopPropagation()}>
              <button className="ghost-button compact-button" type="button" disabled={makingPdf === post.key} title={post.pdf ? '올린 PDF 그대로 받기' : '발주서 그림을 모아 PDF로 받기'} onClick={() => downloadPdf(post)}>{makingPdf === post.key ? 'PDF 만드는 중…' : 'PDF'}</button>
              <button className="ghost-button compact-button" type="button" onClick={() => setEditing(post)}>수정</button>
              <button className="ghost-button compact-button danger" type="button" onClick={() => remove(post)}>삭제</button>
            </td>
          </tr>)}
          {posts.length === 0 && <tr><td colSpan={6}>등록된 발주서가 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>}
    {editing && <PurchaseOrderModal projectId={projectId} folder={folder} post={editing === 'new' ? null : editing} store={store} onClose={() => setEditing(null)} />}
  </>
}

/**
 * Registers or edits one 발주서. Pages are pasted, dropped or chosen in order; when editing,
 * pages can be added or taken away as well.
 */
function PurchaseOrderModal({ projectId, folder, post, store, onClose }: { projectId: string; folder: DriveFolder; post: FileGroup | null; store: ProjectFilesStore; onClose: () => void }) {
  const [form, setForm] = useState<PurchaseOrderForm>(post ? { ...emptyForm, ...post.meta } : emptyForm)
  const editor = useGroupEditor(store, projectId, folder, 'purchaseOrder', post)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<PurchaseOrderForm>) => setForm(current => ({ ...current, ...patch }))
  const drop = (event: DragEvent) => { event.preventDefault(); void editor.add(imageFiles(event.dataTransfer.files, true)) }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (editor.converting) return
    if (!editor.pages.length) { setError('발주서 사진이나 PDF를 한 장 이상 붙여넣거나 선택해 주세요.'); return }
    setSaving(true)
    setError('')
    try {
      await editor.save({ vendor: form.vendor, item: form.item, date: form.date, poNumber: form.poNumber })
      onClose()
    } catch (failure) { setError(message(failure)) } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation">
    <form className="modal-panel form-panel file-group-modal" onSubmit={save} onDragOver={event => event.preventDefault()} onDrop={drop}>
      <div className="modal-heading">
        <div><h3>{post ? '발주서 수정' : '발주서 등록'}</h3><span>{post ? '내용을 고치거나 장을 더하고 뺄 수 있습니다.' : '캡처한 발주서를 Ctrl+V로 붙여넣거나 사진·PDF를 끌어다 놓으세요. PDF는 쪽마다 한 장으로 들어가고, 사진을 누르면 새 창에서 크게 보입니다.'}</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      <PageStrip editor={editor} disabled={saving} empty="여기에 발주서 사진이나 PDF를 붙여넣기(Ctrl+V)·끌어다 놓기·클릭해서 선택 (여러 장 가능)" />
      <div className="two-columns">
        <label>거래처<input value={form.vendor} placeholder="상호(법인명)" onChange={event => set({ vendor: event.target.value })} /></label>
        <label>발주번호<input value={form.poNumber} placeholder="CJE-2502071" onChange={event => set({ poNumber: event.target.value })} /></label>
        <label>내용<input value={form.item} placeholder="1번 품목 (2개 이상이면 '외')" onChange={event => set({ item: event.target.value })} /></label>
        <label>날짜<input type="date" value={form.date} onChange={event => set({ date: event.target.value })} /></label>
      </div>
      {editor.pdfTooBig && <p className="files-note">PDF가 3MB를 넘어 원본 PDF는 저장하지 않습니다. PDF로 받을 때는 저장된 그림을 모아 만듭니다.</p>}
      {(error || editor.problem) && <p className="files-note error">{error || editor.problem}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="submit" disabled={saving || editor.converting}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  </div>
}

/**
 * 사진대지: the 공사's photos laid out one by one in a grid. Several photos chosen, dropped or
 * pasted together each get their own card; ✎ edits one photo's 설명 and 날짜.
 */
export function PhotoAlbum({ projectId, projectName, folder, store }: { projectId: string; projectName: string; folder: DriveFolder; store: ProjectFilesStore }) {
  const photos = store.files.filter(file => file.kind === 'photo')
    .sort((a, b) => (a.meta.date ?? '').localeCompare(b.meta.date ?? '') || a.createdAt.localeCompare(b.createdAt))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState<ProjectFile | null>(null)
  const ready = store.shared && store.loaded && !store.error
  const items = photos.map((photo, index) => ({ id: photo.id, title: [projectName, photo.meta.caption || photo.meta.date].filter(Boolean).join(' · '), name: [projectName, photo.meta.date, photo.meta.caption || String(index + 1)].filter(Boolean).join('_') }))

  async function upload(files: File[]) {
    if (!ready || progress || !files.length) return
    setError('')
    const failed: string[] = []
    for (const [index, file] of files.entries()) {
      setProgress({ done: index, total: files.length })
      try { store.added(await uploadProjectFile(projectId, 'photo', { caption: '', date: fileDate(file), fileName: file.name }, await preparePhoto(file), folder)) }
      catch (failure) { failed.push(`${file.name}: ${message(failure)}`) }
    }
    setProgress(null)
    if (failed.length) setError(`${failed.length}장을 올리지 못했습니다. ${failed.join(' / ')}`)
  }
  usePastedImages(upload, ready && !editing)
  const remove = async (photo: ProjectFile) => {
    if (!window.confirm('이 사진을 삭제할까요?')) return
    try { await deleteProjectFile(photo.id); store.removed(photo.id) } catch (failure) { window.alert(message(failure)) }
  }

  return <div className={`photo-album${dragging ? ' dragging' : ''}`}
    onDragOver={event => { if (!ready) return; event.preventDefault(); if (!editing) setDragging(true) }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
    onDrop={event => { event.preventDefault(); setDragging(false); if (!editing) upload(imageFiles(event.dataTransfer.files)) }}>
    <div className="panel-heading">
      <h3>사진대지</h3>
      <div className="files-heading-actions">
        <span>{progress ? `${progress.done + 1} / ${progress.total}장 올리는 중…` : '여러 장을 한 번에 고르거나 끌어다 놓을 수 있습니다. Ctrl+V로 붙여넣을 수도 있습니다.'}</span>
        {ready && <label className={`primary-button compact-button file-picker${progress ? ' disabled' : ''}`}>
          사진 올리기
          <input type="file" accept="image/*" multiple disabled={!!progress} onChange={event => { const files = imageFiles(event.target.files); event.target.value = ''; upload(files) }} />
        </label>}
      </div>
    </div>
    <FilesUnavailable store={store} />
    {error && <p className="files-note error">{error}</p>}
    {ready && <div className="photo-grid">
      {photos.map((photo, index) => <figure key={photo.id} className="photo-card">
        <button type="button" className="photo-open" title="새 창에서 크게 보기" onClick={() => openImageViewer(items, index)}>
          <img src={fileUrl(photo.id, true)} alt={photo.meta.caption || `${photo.meta.date} 사진`} loading="lazy" />
        </button>
        <figcaption>
          <span><strong>{photo.meta.caption || '설명 없음'}</strong><small>{photo.meta.date}</small></span>
          <span className="photo-actions">
            <button type="button" title="설명 고치기" aria-label="설명 고치기" onClick={() => setEditing(photo)}>✎</button>
            <button type="button" title="삭제" aria-label="사진 삭제" onClick={() => remove(photo)}>×</button>
          </span>
        </figcaption>
      </figure>)}
      {photos.length === 0 && <p className="files-note">아직 사진이 없습니다. 사진 올리기를 누르거나 이곳에 끌어다 놓으세요.</p>}
    </div>}
    {editing && <PhotoModal photo={editing} store={store} onClose={() => setEditing(null)} />}
  </div>
}

function PhotoModal({ photo, store, onClose }: { photo: ProjectFile; store: ProjectFilesStore; onClose: () => void }) {
  const [caption, setCaption] = useState(photo.meta.caption ?? '')
  const [date, setDate] = useState(photo.meta.date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      store.replaced(await updateProjectFile(photo.id, { ...photo.meta, caption, date }))
      onClose()
    } catch (failure) { setError(message(failure)) } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation">
    <form className="modal-panel form-panel file-group-modal" onSubmit={save}>
      <div className="modal-heading">
        <div><h3>사진 설명 수정</h3><span>설명과 날짜를 고칠 수 있습니다.</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      <img className="photo-modal-picture" src={fileUrl(photo.id, true)} alt={photo.meta.caption || `${photo.meta.date} 사진`} />
      <div className="two-columns">
        <label>설명<input value={caption} placeholder="설치 전, 배관 작업 등" autoFocus onChange={event => setCaption(event.target.value)} /></label>
        <label>날짜<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      </div>
      {error && <p className="files-note error">{error}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  </div>
}
