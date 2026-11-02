import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import ModalClose from './ModalClose'
import type { ProjectFilesStore } from './useProjectFiles'
import { deleteProjectFile, fileDate, fileUrl, openImageViewer, prepareImage, updateProjectFile, uploadProjectFile, type FileKind, type ProjectFile } from './projectFileApi'

const imageFiles = (list: FileList | DataTransferItemList | null | undefined) =>
  [...(list ?? [])].map(item => item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null).filter((file): file is File => !!file && file.type.startsWith('image/'))
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

type PurchaseOrderForm = { vendor: string; item: string; date: string; poNumber: string }
const emptyForm: PurchaseOrderForm = { vendor: '', item: '', date: '', poNumber: '' }
type PurchaseOrderPost = { key: string; pages: ProjectFile[]; meta: Record<string, string> }

// Pages of one 발주서 share meta.group; a 발주서 saved before pages existed has none and goes by its own id.
const postKey = (file: ProjectFile) => file.meta.group || file.id
const postPages = (files: ProjectFile[], key: string) =>
  files.filter(file => file.kind === 'purchaseOrder' && postKey(file) === key).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

/**
 * 발주서 게시판: one post per 발주서 with 수주번호, 거래처 (상호), 내용 (first item, "외" when
 * there are more), 날짜 and 발주번호. A 발주서 may have several pages. Clicking a post opens its
 * pages in a new window.
 */
export function PurchaseOrderBoard({ projectId, orderNo, store }: { projectId: string; orderNo: string; store: ProjectFilesStore }) {
  const posts: PurchaseOrderPost[] = [...new Set(store.files.filter(file => file.kind === 'purchaseOrder').map(postKey))]
    .map(key => { const pages = postPages(store.files, key); return { key, pages, meta: pages[0].meta } })
    .sort((a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? '') || (b.meta.poNumber ?? '').localeCompare(a.meta.poNumber ?? '') || b.pages[0].createdAt.localeCompare(a.pages[0].createdAt))
  const [editing, setEditing] = useState<PurchaseOrderPost | 'new' | null>(null)
  const viewerItems = posts.flatMap(({ meta, pages }) => pages.map((page, index) => {
    const pageNo = pages.length > 1 ? index + 1 : 0
    return {
      id: page.id,
      title: [orderNo, meta.vendor, meta.item, meta.poNumber].filter(Boolean).join(' · ') + (pageNo ? ` (${pageNo}/${pages.length}장)` : ''),
      name: [orderNo, meta.poNumber || meta.date, meta.vendor, pageNo ? String(pageNo) : ''].filter(Boolean).join('_') || '발주서',
    }
  }))
  const firstPage = (post: PurchaseOrderPost) => viewerItems.findIndex(item => item.id === post.pages[0].id)
  const remove = async (post: PurchaseOrderPost) => {
    if (!window.confirm(`${post.meta.vendor || '이'} 발주서를 삭제할까요? 사진${post.pages.length > 1 ? ` ${post.pages.length}장` : ''}도 함께 지워집니다.`)) return
    try {
      for (const page of post.pages) { await deleteProjectFile(page.id); store.removed(page.id) }
    } catch (error) { window.alert(message(error)) }
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
          {posts.map(post => <tr key={post.key} tabIndex={0} title="새 창에서 발주서 보기" onClick={() => openImageViewer(viewerItems, firstPage(post))}
            onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) openImageViewer(viewerItems, firstPage(post)) }}>
            <td>{orderNo}</td>
            <td>{post.meta.vendor || '-'}</td>
            <td className="file-board-title">{post.meta.item || '-'}{post.pages.length > 1 && <span className="page-count">{post.pages.length}장</span>}</td>
            <td className="date-cell">{post.meta.date || '-'}</td>
            <td>{post.meta.poNumber || '-'}</td>
            <td className="file-board-actions" onClick={event => event.stopPropagation()}>
              <button className="ghost-button compact-button" type="button" onClick={() => setEditing(post)}>수정</button>
              <button className="ghost-button compact-button danger" type="button" onClick={() => remove(post)}>삭제</button>
            </td>
          </tr>)}
          {posts.length === 0 && <tr><td colSpan={6}>등록된 발주서가 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>}
    {editing && <PurchaseOrderModal projectId={projectId} post={editing === 'new' ? null : editing} store={store} onClose={() => setEditing(null)} />}
  </>
}

/**
 * Registers or edits one 발주서. Pages are pasted, dropped or chosen in order; when editing,
 * pages can be added or taken away as well.
 */
function PurchaseOrderModal({ projectId, post, store, onClose }: { projectId: string; post: PurchaseOrderPost | null; store: ProjectFilesStore; onClose: () => void }) {
  const [form, setForm] = useState<PurchaseOrderForm>(post ? { ...emptyForm, ...post.meta } : emptyForm)
  const [group] = useState(() => post?.key ?? crypto.randomUUID())
  const [pictures, setPictures] = useState<{ file: File; url: string }[]>([])
  const [removing, setRemoving] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const urls = useRef<string[]>([])
  useEffect(() => { const made = urls.current; return () => made.forEach(url => URL.revokeObjectURL(url)) }, [])
  const addPictures = (files: File[]) => {
    const added = files.map(file => ({ file, url: URL.createObjectURL(file) }))
    urls.current.push(...added.map(picture => picture.url))
    setPictures(current => [...current, ...added])
  }
  usePastedImages(addPictures)
  // Saved pages come from the store, so a retry after a half-finished save neither repeats nor loses one.
  const saved = postPages(store.files, group).filter(page => !removing.includes(page.id))
  const pages = [
    ...saved.map(page => ({ key: page.id, src: fileUrl(page.id, true), remove: () => setRemoving(current => [...current, page.id]) })),
    ...pictures.map(picture => ({ key: picture.url, src: picture.url, remove: () => setPictures(current => current.filter(item => item !== picture)) })),
  ]
  const set = (patch: Partial<PurchaseOrderForm>) => setForm(current => ({ ...current, ...patch }))
  const drop = (event: DragEvent) => { event.preventDefault(); addPictures(imageFiles(event.dataTransfer.files)) }
  const picker = <input type="file" accept="image/*" multiple onChange={event => { const files = imageFiles(event.target.files); event.target.value = ''; addPictures(files) }} />

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!pages.length) { setError('발주서 사진을 한 장 이상 붙여넣거나 선택해 주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const meta = { vendor: form.vendor, item: form.item, date: form.date, poNumber: form.poNumber }
      for (const page of saved) {
        if (Object.entries(meta).some(([field, value]) => page.meta[field] !== value)) store.replaced(await updateProjectFile(page.id, { ...page.meta, ...meta }))
      }
      for (const picture of pictures) {
        store.added(await uploadProjectFile(projectId, 'purchaseOrder', { ...meta, group, fileName: picture.file.name }, await prepareImage(picture.file)))
        setPictures(current => current.filter(item => item !== picture))
      }
      for (const id of removing) {
        if (store.files.some(file => file.id === id)) await deleteProjectFile(id)
        store.removed(id)
      }
      onClose()
    } catch (failure) { setError(message(failure)) } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation">
    <form className="modal-panel form-panel purchase-order-modal" onSubmit={save} onDragOver={event => event.preventDefault()} onDrop={drop}>
      <div className="modal-heading">
        <div><h3>{post ? '발주서 수정' : '발주서 등록'}</h3><span>{post ? '내용을 고치거나 장을 더하고 뺄 수 있습니다.' : '캡처한 발주서를 Ctrl+V로 붙여넣거나 끌어다 놓으세요. 여러 장이면 차례대로 넣으세요.'}</span></div>
        <ModalClose onClose={onClose} disabled={saving} />
      </div>
      {pages.length === 0
        ? <label className="file-drop">
          <span>여기에 발주서 사진을 붙여넣기(Ctrl+V)·끌어다 놓기·클릭해서 선택 (여러 장 가능)</span>
          {picker}
        </label>
        : <div className="page-strip">
          {pages.map((page, index) => <figure key={page.key}>
            <img src={page.src} alt={`발주서 ${index + 1}장`} />
            <figcaption>{index + 1}장<button type="button" title="이 장 빼기" aria-label={`${index + 1}장 빼기`} disabled={saving} onClick={page.remove}>×</button></figcaption>
          </figure>)}
          <label className="file-drop page-add">
            <span>+ 장 추가<small>붙여넣기·끌어다 놓기·선택</small></span>
            {picker}
          </label>
        </div>}
      <div className="two-columns">
        <label>거래처<input value={form.vendor} placeholder="상호(법인명)" onChange={event => set({ vendor: event.target.value })} /></label>
        <label>발주번호<input value={form.poNumber} placeholder="CJE-2502071" onChange={event => set({ poNumber: event.target.value })} /></label>
        <label>내용<input value={form.item} placeholder="1번 품목 (2개 이상이면 '외')" onChange={event => set({ item: event.target.value })} /></label>
        <label>날짜<input type="date" value={form.date} onChange={event => set({ date: event.target.value })} /></label>
      </div>
      {error && <p className="files-note error">{error}</p>}
      <div className="modal-actions">
        <button className="ghost-button" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  </div>
}

/** 사진대지: the 공사's photos as an album. Several can be added at once by choosing, dropping or pasting. */
export function PhotoAlbum({ projectId, projectName, store }: { projectId: string; projectName: string; store: ProjectFilesStore }) {
  const photos = store.files.filter(file => file.kind === 'photo')
    .sort((a, b) => (a.meta.date ?? '').localeCompare(b.meta.date ?? '') || a.createdAt.localeCompare(b.createdAt))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const ready = store.shared && store.loaded && !store.error
  const viewerItems = photos.map((photo, index) => ({ id: photo.id, title: [projectName, photo.meta.caption || photo.meta.date].filter(Boolean).join(' · '), name: [projectName, photo.meta.date, photo.meta.caption || String(index + 1)].filter(Boolean).join('_') }))

  async function upload(files: File[]) {
    if (!ready || progress || !files.length) return
    setError('')
    const failed: string[] = []
    for (const [index, file] of files.entries()) {
      setProgress({ done: index, total: files.length })
      try { store.added(await uploadProjectFile(projectId, 'photo' satisfies FileKind, { caption: '', date: fileDate(file), fileName: file.name }, await prepareImage(file))) }
      catch (failure) { failed.push(`${file.name}: ${message(failure)}`) }
    }
    setProgress(null)
    if (failed.length) setError(`${failed.length}장을 올리지 못했습니다. ${failed.join(' / ')}`)
  }
  usePastedImages(upload, ready)
  const caption = async (photo: ProjectFile) => {
    const next = window.prompt('사진 설명', photo.meta.caption ?? '')
    if (next === null) return
    try { store.replaced(await updateProjectFile(photo.id, { ...photo.meta, caption: next })) } catch (failure) { window.alert(message(failure)) }
  }
  const remove = async (photo: ProjectFile) => {
    if (!window.confirm('이 사진을 삭제할까요?')) return
    try { await deleteProjectFile(photo.id); store.removed(photo.id) } catch (failure) { window.alert(message(failure)) }
  }

  return <div className={`photo-album${dragging ? ' dragging' : ''}`}
    onDragOver={event => { if (!ready) return; event.preventDefault(); setDragging(true) }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
    onDrop={event => { event.preventDefault(); setDragging(false); upload(imageFiles(event.dataTransfer.files)) }}>
    <div className="panel-heading">
      <h3>사진대지</h3>
      <div className="files-heading-actions">
        <span>{progress ? `${progress.done + 1} / ${progress.total}장 올리는 중…` : '사진을 끌어다 놓거나 Ctrl+V로 붙여넣을 수 있습니다.'}</span>
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
        <button type="button" className="photo-open" title="새 창에서 크게 보기" onClick={() => openImageViewer(viewerItems, index)}>
          <img src={fileUrl(photo.id, true)} alt={photo.meta.caption || `${photo.meta.date} 사진`} loading="lazy" />
        </button>
        <figcaption>
          <span><strong>{photo.meta.caption || '설명 없음'}</strong><small>{photo.meta.date}</small></span>
          <span className="photo-actions">
            <button type="button" title="설명 고치기" aria-label="설명 고치기" onClick={() => caption(photo)}>✎</button>
            <button type="button" title="삭제" aria-label="사진 삭제" onClick={() => remove(photo)}>×</button>
          </span>
        </figcaption>
      </figure>)}
      {photos.length === 0 && <p className="files-note">아직 사진이 없습니다. 사진 올리기를 누르거나 이곳에 끌어다 놓으세요.</p>}
    </div>}
  </div>
}
