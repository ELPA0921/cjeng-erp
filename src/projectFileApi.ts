// Pictures kept for a 공사 (발주서 scans and the 사진대지 album), stored through /api/files.
export type FileKind = 'purchaseOrder' | 'photo'
export type ProjectFile = { id: string; projectId: string; kind: FileKind; meta: Record<string, string>; contentType: string; size: number; createdAt: string; createdBy: string }
export type PreparedImage = { contentType: string; data: string; thumb: string }

export const fileUrl = (id: string, thumb = false) => `/api/files?id=${encodeURIComponent(id)}${thumb ? '&thumb=1' : ''}`
export const downloadUrl = (id: string, name: string) => `/api/files?id=${encodeURIComponent(id)}&download=1&name=${encodeURIComponent(name)}`

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // The server only takes changes sent as JSON, so DELETE says so too even without a body.
  const response = await fetch(url, { ...init, headers: init?.method && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? '사진 저장소에 연결할 수 없습니다.')
  return body as T
}

export const listProjectFiles = (projectId: string) =>
  request<{ files: ProjectFile[] }>(`/api/files?projectId=${encodeURIComponent(projectId)}`).then(body => body.files)
export const uploadProjectFile = (projectId: string, kind: FileKind, meta: Record<string, string>, image: PreparedImage) =>
  request<{ file: ProjectFile }>('/api/files', { method: 'POST', body: JSON.stringify({ projectId, kind, meta, ...image }) }).then(body => body.file)
export const updateProjectFile = (id: string, meta: Record<string, string>) =>
  request<{ file: ProjectFile }>('/api/files', { method: 'PATCH', body: JSON.stringify({ id, meta }) }).then(body => body.file)
export const deleteProjectFile = (id: string) => request<{ ok: true }>(`/api/files?id=${encodeURIComponent(id)}`, { method: 'DELETE' })

const keepAsIs = ['image/jpeg', 'image/png', 'image/webp']
const maxEdge = 2400
const maxBytes = 2_800_000

const base64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
  reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
  reader.readAsDataURL(blob)
})

/**
 * Draws the picture as JPEG with its longer side at most edge px. Framed, it instead sits whole in the
 * middle of a landscape 4:3 frame at most edge × ¾edge, with white filling the sides of upright shots.
 */
function jpeg(bitmap: ImageBitmap, edge: number, quality: number, framed = false) {
  const scale = Math.min(1, framed ? Math.min(edge / bitmap.width, edge * 3 / 4 / bitmap.height) : edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = framed ? Math.max(width, Math.round(height * 4 / 3)) : width
  canvas.height = framed ? Math.max(height, Math.round(width * 3 / 4)) : height
  const context = canvas.getContext('2d')!
  // Transparent captures would turn black as JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 줄이지 못했습니다.')), 'image/jpeg', quality))
}

const decode = (file: Blob) => createImageBitmap(file).catch(() => { throw new Error('JPG, PNG, WebP 사진만 올릴 수 있습니다.') })

/**
 * Readies a picture for upload: small enough captures keep their original file so 발주서 text stays
 * sharp; bigger photos are scaled to 2400px JPEG. A 480px preview goes along for lists and albums.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await decode(file)
  try {
    let picture: Blob = file
    if (!keepAsIs.includes(file.type) || file.size > maxBytes || Math.max(bitmap.width, bitmap.height) > maxEdge) {
      picture = await jpeg(bitmap, maxEdge, 0.88)
      if (picture.size > maxBytes) picture = await jpeg(bitmap, 1800, 0.8)
      if (picture.size > maxBytes) throw new Error('사진이 너무 큽니다.')
    }
    return { contentType: picture.type, data: await base64(picture), thumb: await base64(await jpeg(bitmap, 480, 0.8)) }
  } finally {
    bitmap.close()
  }
}

/**
 * Readies a 사진대지 photo: every one becomes the same landscape 4:3 JPEG, 1600×1200 at most (about
 * 0.3MB), so the album and its printouts line up. Upright shots keep all of the picture, with white beside it.
 */
export async function preparePhoto(file: Blob): Promise<PreparedImage> {
  const bitmap = await decode(file)
  try {
    return { contentType: 'image/jpeg', data: await base64(await jpeg(bitmap, 1600, 0.85, true)), thumb: await base64(await jpeg(bitmap, 480, 0.8, true)) }
  } finally {
    bitmap.close()
  }
}

/** A file's own date (when the photo was taken or saved) as YYYY-MM-DD in local time. */
export function fileDate(file: File) {
  const date = new Date(file.lastModified || Date.now())
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export type ViewerItem = { id: string; title: string; name: string }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/** Opens pictures in a new window, one at a time, with 다운로드, ‹ › (or the arrow keys) to move between them and ✕ (or Esc) to close. */
export function openImageViewer(items: ViewerItem[], start: number) {
  const viewer = window.open('', '_blank')
  if (!viewer) return
  const origin = window.location.origin
  const pictures = items.map(item => ({ title: item.title, src: origin + fileUrl(item.id), download: origin + downloadUrl(item.id, item.name) }))
  viewer.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(items[start]?.title ?? '사진')}</title><style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; background: #1f2933; color: #f5f7fa; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; }
    body { display: grid; grid-template-rows: auto 1fr; }
    header { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 14px; background: #102a43; }
    header strong { flex: 1 1 240px; min-width: 0; overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
    header span { color: #9fb3c8; font-size: 13px; }
    a, button { min-height: 36px; border: 1px solid #486581; border-radius: 6px; background: #243b53; color: #f5f7fa; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; padding: 7px 14px; text-decoration: none; }
    a.download { border-color: #0b806f; background: #0b806f; }
    button.close { min-width: 36px; padding: 7px 10px; font-size: 16px; line-height: 1; }
    button:disabled { cursor: default; opacity: 0.4; }
    main { display: grid; place-items: center; overflow: auto; padding: 12px; }
    img { max-width: 100%; max-height: calc(100vh - 80px); background: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
  </style></head><body><header><strong id="title"></strong><span id="count"></span><button id="prev" type="button">‹ 이전</button><button id="next" type="button">다음 ›</button><a id="download" class="download">다운로드</a><button id="close" class="close" type="button" aria-label="닫기" title="닫기 (Esc)">✕</button></header><main><img id="picture" alt=""></main><script>
    var pictures = ${JSON.stringify(pictures).replace(/</g, '\\u003c')}, index = ${start}
    function show(next) {
      index = Math.max(0, Math.min(pictures.length - 1, next))
      var picture = pictures[index]
      document.getElementById('picture').src = picture.src
      document.getElementById('picture').alt = picture.title
      document.getElementById('title').textContent = picture.title
      document.title = picture.title
      document.getElementById('download').href = picture.download
      document.getElementById('count').textContent = pictures.length > 1 ? (index + 1) + ' / ' + pictures.length : ''
      document.getElementById('prev').disabled = index === 0
      document.getElementById('next').disabled = index === pictures.length - 1
      document.getElementById('prev').hidden = document.getElementById('next').hidden = pictures.length < 2
    }
    document.getElementById('prev').onclick = function () { show(index - 1) }
    document.getElementById('next').onclick = function () { show(index + 1) }
    document.getElementById('close').onclick = function () { window.close() }
    document.addEventListener('keydown', function (event) { if (event.key === 'ArrowLeft') show(index - 1); if (event.key === 'ArrowRight') show(index + 1); if (event.key === 'Escape') window.close() })
    show(index)
  </script></body></html>`)
  viewer.document.close()
}
