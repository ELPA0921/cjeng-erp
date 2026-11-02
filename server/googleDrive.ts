import { importPKCS8, SignJWT } from 'jose'

// Originals of the 발주서 and 사진대지 pictures can live in a Google shared drive instead of the
// database. The ERP signs in as a service account that is a member of that shared drive, so it
// only ever sees the folder it was given.
export type DriveConfig = { clientEmail: string; privateKey: string; rootId: string }
type Fetch = typeof fetch

export class DriveError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

const api = 'https://www.googleapis.com/drive/v3/files'
const folderType = 'application/vnd.google-apps.folder'

/** The shared drive settings, or null while they are not set up (pictures then stay in the database). */
export function driveConfig(env: Record<string, string | undefined> = process.env): DriveConfig | null {
  const key = env.GOOGLE_DRIVE_SERVICE_ACCOUNT?.trim()
  const rootId = env.GOOGLE_DRIVE_FOLDER_ID?.trim()
  if (!key || !rootId) return null
  let parsed: { client_email?: unknown; private_key?: unknown } = {}
  try { parsed = JSON.parse(key) } catch { /* reported below */ }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') throw new DriveError('구글 드라이브 서비스 계정 키를 확인하세요.', 500)
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key, rootId }
}

/** Drive folder and file names cannot hold path characters; keep them short and readable. */
export const driveName = (name: string) => [...name].map(char => char < ' ' || '\\/:*?"<>|'.includes(char) ? '_' : char).join('').trim().slice(0, 120)

export function createDrive(config: DriveConfig, fetchImpl: Fetch = fetch) {
  let token: { value: string; expires: number } | null = null
  const folders = new Map<string, Promise<string>>()

  async function accessToken() {
    if (token && token.expires > Date.now() + 60_000) return token.value
    const now = Math.floor(Date.now() / 1000)
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/drive' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(config.clientEmail).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now + 3600)
      .sign(await importPKCS8(config.privateKey, 'RS256'))
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    })
    if (!response.ok) throw new DriveError('구글 드라이브에 로그인하지 못했습니다.', response.status)
    const body = await response.json() as { access_token: string; expires_in: number }
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 }
    return token.value
  }

  async function call(url: string, init: RequestInit = {}) {
    const response = await fetchImpl(url, { ...init, headers: { ...init.headers as Record<string, string>, Authorization: `Bearer ${await accessToken()}` } })
    if (!response.ok) throw new DriveError(`구글 드라이브 요청이 실패했습니다. (${response.status})`, response.status)
    return response
  }

  /** The folder of this name under parent, made when it is not there yet. */
  function folder(parent: string, name: string) {
    const key = `${parent}/${name}`
    let found = folders.get(key)
    if (!found) {
      found = (async () => {
        const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType = '${folderType}' and trashed = false`
        const list = await call(`${api}?${new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives' })}`)
        const [existing] = (await list.json() as { files: { id: string }[] }).files
        if (existing) return existing.id
        const made = await call(`${api}?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: folderType, parents: [parent] }) })
        return (await made.json() as { id: string }).id
      })()
      folders.set(key, found)
      found.catch(() => folders.delete(key))
    }
    return found
  }

  return {
    /** Saves a picture as path/name (folders made as needed) and returns its Drive file id. */
    async upload(path: string[], name: string, contentType: string, data: Buffer) {
      let parent = config.rootId
      for (const part of path) parent = await folder(parent, driveName(part) || '기타')
      const boundary = `cjeng${Date.now().toString(36)}`
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: driveName(name) || 'photo', parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--`),
      ])
      const response = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      })
      return (await response.json() as { id: string }).id
    },
    /** The picture's bytes, or null when it is gone from the drive. */
    async download(id: string) {
      try { return Buffer.from(await (await call(`${api}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`)).arrayBuffer()) }
      catch (error) { if (error instanceof DriveError && error.status === 404) return null; throw error }
    },
    /** Moves the picture to the shared drive's trash, where it can still be restored for 30 days. */
    async trash(id: string) {
      try { await call(`${api}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }) }
      catch (error) { if (!(error instanceof DriveError && error.status === 404)) throw error }
    },
  }
}
export type Drive = ReturnType<typeof createDrive>
