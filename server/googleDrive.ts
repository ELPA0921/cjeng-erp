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

/** Each year's 공사 folders sit in a folder such as "2026년". */
export const yearFolder = (year: string) => `${year}년`
/** A 공사's folder: its year and a name such as "24012 집진시스템 개선 공사". */
export type ProjectFolder = { year: string; name: string }

let shared: Drive | null | undefined
/** The shared drive client, made once per function instance; null until the drive settings are in place. */
export function sharedDrive() {
  if (shared === undefined) { const config = driveConfig(); shared = config ? createDrive(config) : null }
  return shared
}

/**
 * Keeps the 공사 folders in step with 수주대장 after it is saved: a new 공사 gets its folder even
 * before any picture, one whose year or name changed has its folder follow, and a deleted 공사's
 * folder goes to the trash. 관리비 (order numbers such as 26000) has no folder.
 */
export async function syncOrderFolders(drive: Pick<Drive, 'arrange' | 'relocate' | 'remove'>, before: Record<string, string>[], after: Record<string, string>[]) {
  const folderOf = (order: Record<string, string>): ProjectFolder | null =>
    /^\d{2}000$/.test(order.orderNo?.trim() ?? '') || !/^\d{4}$/.test(order.year ?? '') ? null
      : { year: order.year, name: [order.orderNo?.trim(), order.projectName?.trim()].filter(Boolean).join(' ') }
  const old = new Map(before.map(order => [order.id, folderOf(order)]))
  const kept = new Set(after.map(order => order.id))
  const changes: (() => Promise<unknown>)[] = []
  for (const order of after) {
    const now = folderOf(order)
    const was = old.get(order.id)
    if (!now) continue
    if (!was) changes.push(() => drive.arrange(now.year, now.name))
    else if (was.year !== now.year || was.name !== now.name) changes.push(() => drive.relocate(was, now))
  }
  for (const [id, was] of old) if (was && !kept.has(id)) changes.push(() => drive.remove(was))
  // A big import is left to the admin's folder arranging rather than holding up the save.
  if (changes.length > maxFolderChanges) return { done: 0, failed: 0, skipped: changes.length }
  let failed = 0
  for (const change of changes) await change().catch(() => { failed++ })
  return { done: changes.length - failed, failed, skipped: 0 }
}
const maxFolderChanges = 20

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

  /** The id of the folder of this name directly under parent, if there is one. */
  async function find(parent: string, name: string) {
    const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType = '${folderType}' and trashed = false`
    const list = await call(`${api}?${new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives' })}`)
    return (await list.json() as { files: { id: string }[] }).files[0]?.id ?? null
  }

  /** The folder of this name under parent, made when it is not there yet. */
  function folder(parent: string, name: string) {
    const key = `${parent}/${name}`
    let found = folders.get(key)
    if (!found) {
      found = (async () => {
        const existing = await find(parent, name)
        if (existing) return existing
        const made = await call(`${api}?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: folderType, parents: [parent] }) })
        return (await made.json() as { id: string }).id
      })()
      folders.set(key, found)
      found.catch(() => folders.delete(key))
    }
    return found
  }

  async function folderPath(path: string[]) {
    let parent = config.rootId
    for (const part of path) parent = await folder(parent, driveName(part) || '기타')
    return parent
  }

  /** Moves a file or folder from one parent to another, renaming it when a name is given. */
  async function move(id: string, from: string, to: string, name?: string) {
    const query = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id', ...from === to ? {} : { addParents: to, removeParents: from } })
    await call(`${api}/${encodeURIComponent(id)}?${query}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(name ? { name } : {}) })
  }

  /**
   * Puts a 공사's folder in its year's folder: one left from before years were used is moved
   * there with everything in it, and an empty one is made when the 공사 has none yet.
   */
  async function arrange(year: string, name: string): Promise<'kept' | 'moved' | 'made'> {
    const yearId = await folderPath([yearFolder(year)])
    const folderName = driveName(name) || '기타'
    if (await find(yearId, folderName)) return 'kept'
    const loose = await find(config.rootId, folderName)
    if (!loose) { await folder(yearId, folderName); return 'made' }
    await move(loose, config.rootId, yearId)
    folders.delete(`${config.rootId}/${folderName}`)
    folders.set(`${yearId}/${folderName}`, Promise.resolve(loose))
    return 'moved'
  }

  return {
    /** Saves a picture as path/name (folders made as needed) and returns its Drive file id. */
    async upload(path: string[], name: string, contentType: string, data: Buffer) {
      const parent = await folderPath(path)
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
    arrange,
    /** Follows a 공사 whose year or name changed: its folder is moved and renamed, with everything in it. */
    async relocate(from: ProjectFolder, to: ProjectFolder) {
      const fromYear = await find(config.rootId, yearFolder(from.year))
      const fromName = driveName(from.name) || '기타'
      const id = fromYear && await find(fromYear, fromName)
      if (!id) return arrange(to.year, to.name)
      const toYear = await folderPath([yearFolder(to.year)])
      const toName = driveName(to.name) || '기타'
      // A folder already there by the new name is left as it is, next to the old one.
      if (await find(toYear, toName)) return 'kept'
      await move(id, fromYear, toYear, toName)
      folders.delete(`${fromYear}/${fromName}`)
      folders.set(`${toYear}/${toName}`, Promise.resolve(id))
      return 'moved'
    },
    /** Sends a deleted 공사's folder to the shared drive's trash, where it can be restored for 30 days. */
    async remove(folder: ProjectFolder) {
      const yearId = await find(config.rootId, yearFolder(folder.year))
      const name = driveName(folder.name) || '기타'
      const id = yearId && await find(yearId, name)
      if (!id) return false
      await call(`${api}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
      folders.delete(`${yearId}/${name}`)
      return true
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
