import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readSession, sameOrigin, settings } from '../server/security.ts'
import { workspaceSql } from '../server/workspaceDb.ts'
import { createDrive, driveConfig, DriveError, yearFolder, type Drive } from '../server/googleDrive.ts'
import { deleteFile, ensureFileSchema, FileInputError, insertFile, kindFolder, listFiles, listUnmoved, markMoved, pictureName, readFile, updateFileMeta, validateUpload } from '../server/projectFiles.ts'

// The table is created on first use, once per function instance.
let schema: Promise<void> | null = null
const fileStore = { sql: () => workspaceSql(settings().databaseUrl), ensureFileSchema, listFiles, readFile, insertFile, updateFileMeta, deleteFile, listUnmoved, markMoved }
let sharedDrive: Drive | null | undefined
// Originals go to the shared drive once its settings are in place; until then they stay in the database.
const drive = () => {
  if (sharedDrive === undefined) { const config = driveConfig(); sharedDrive = config ? createDrive(config) : null }
  return sharedDrive
}
const downloadName = (name: string, contentType: string) => {
  const base = [...name].map(char => char < ' ' || '\\/:*?"<>|'.includes(char) ? '_' : char).join('').trim().slice(0, 120) || 'photo'
  return `${base}.${contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'}`
}
// Pictures moved per call, small enough to finish well inside a function's time limit.
const moveBatch = 10
// 공사 folders put in their year's folder per call.
const arrangeBatch = 25

/**
 * GET ?projectId= lists a 공사's pictures; GET ?id= sends one (&thumb=1 for its preview,
 * &download=1&name= to save it). POST uploads, PATCH { id, meta } edits the 발주서 or caption
 * details, DELETE ?id= removes it. POST { action: 'moveToDrive', folders } lets an admin move
 * pictures still kept in the database to the shared drive, a few at a time. POST { action:
 * 'arrangeDrive', folders: [{ year, folder }], rootName? } lets an admin put 공사 folders in their
 * year's folder, making empty ones for 공사 without pictures yet.
 */
export function createFilesHandler(deps = { readSession, sameOrigin, settings, fileStore, drive }) {
  return async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const json = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      const user = await deps.readSession(req)
      if (!user) { json(401, { error: '직원 계정으로 로그인해 주세요.' }); return }
      if (deps.settings().storage !== 'postgres') { json(503, { error: '사진은 데이터베이스에 연결된 상태에서만 저장할 수 있습니다.' }); return }
      const sql = deps.fileStore.sql()
      schema ??= deps.fileStore.ensureFileSchema(sql).catch(error => { schema = null; throw error })
      await schema
      const query = new URL(req.url ?? '/', 'http://local').searchParams
      if (req.method === 'GET') {
        const id = query.get('id')
        if (!id) {
          const projectId = query.get('projectId')
          if (!projectId) { json(400, { error: '공사를 확인해 주세요.' }); return }
          // Says where new originals go: 'drive', 'database', or 'error' when the drive settings are wrong.
          let storage = 'error'
          try { storage = deps.drive() ? 'drive' : 'database' } catch { /* left as error */ }
          json(200, { files: await deps.fileStore.listFiles(sql, projectId), storage }); return
        }
        const file = await deps.fileStore.readFile(sql, id, query.get('thumb') === '1')
        if (!file) { json(404, { error: '사진을 찾을 수 없습니다.' }); return }
        let data = file.data
        if (!data && file.driveId) {
          const shared = deps.drive()
          if (!shared) { json(503, { error: '구글 드라이브 연결 설정이 필요합니다.' }); return }
          data = await shared.download(file.driveId)
        }
        if (!data) { json(404, { error: '원본 사진을 구글 드라이브에서 찾을 수 없습니다.' }); return }
        res.statusCode = 200
        res.setHeader('Content-Type', file.contentType)
        // An id never points at a different picture, so the browser may keep it.
        res.setHeader('Cache-Control', 'private, max-age=86400')
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
        if (query.get('download') === '1') res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName(query.get('name') ?? '', file.contentType))}`)
        res.end(data); return
      }
      if (!['POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) { res.setHeader('Allow', 'GET, POST, PATCH, DELETE'); json(405, {}); return }
      if (!deps.sameOrigin(req, deps.settings().origin)) { json(403, { error: '접속 주소를 확인해 주세요.' }); return }
      if (req.method === 'DELETE') {
        const id = query.get('id')
        const removed = id ? await deps.fileStore.deleteFile(sql, id) : null
        if (!removed) { json(404, { error: '사진을 찾을 수 없습니다.' }); return }
        // The drive copy goes to its trash; if that fails the record is already gone, so it only leaves a stray file.
        if (removed.driveId) await deps.drive()?.trash(removed.driveId).catch(() => {})
        json(200, { ok: true }); return
      }
      if (Number(req.headers['content-length']) > 4_400_000) throw new FileInputError('사진이 너무 큽니다.')
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      if (req.method === 'PATCH') {
        const id = body?.id
        if (typeof id !== 'string') throw new FileInputError('사진을 확인해 주세요.')
        const file = await deps.fileStore.updateFileMeta(sql, id, body.meta)
        if (!file) { json(404, { error: '사진을 찾을 수 없습니다.' }); return }
        json(200, { file }); return
      }
      if (body?.action === 'moveToDrive') {
        if (user.role !== 'admin') { json(403, { error: '관리자만 사진을 옮길 수 있습니다.' }); return }
        const shared = deps.drive()
        if (!shared) { json(503, { error: '구글 드라이브 연결 설정이 필요합니다.' }); return }
        const folders = body.folders && typeof body.folders === 'object' ? body.folders as Record<string, unknown> : {}
        const { files, left } = await deps.fileStore.listUnmoved(sql, moveBatch)
        for (const file of files) {
          const folder = typeof folders[file.projectId] === 'string' ? folders[file.projectId] as string : file.projectId
          const driveId = await shared.upload([folder, kindFolder(file.kind)], pictureName(file.kind, file.meta, file.contentType), file.contentType, file.data)
          if (!await deps.fileStore.markMoved(sql, file.id, driveId)) await shared.trash(driveId)
        }
        json(200, { moved: files.length, left: left - files.length }); return
      }
      if (body?.action === 'arrangeDrive') {
        if (user.role !== 'admin') { json(403, { error: '관리자만 폴더를 정리할 수 있습니다.' }); return }
        const shared = deps.drive()
        if (!shared) { json(503, { error: '구글 드라이브 연결 설정이 필요합니다.' }); return }
        const list = Array.isArray(body.folders) ? body.folders as { year?: unknown; folder?: unknown }[] : []
        if (list.length > arrangeBatch || list.some(item => !/^\d{4}$/.test(String(item?.year)) || typeof item?.folder !== 'string' || !item.folder.trim() || item.folder.length > 200)) throw new FileInputError('폴더 목록을 확인해 주세요.')
        if (typeof body.rootName === 'string' && body.rootName.trim()) await shared.renameRoot(body.rootName.trim())
        const done = { kept: 0, moved: 0, made: 0 }
        for (const item of list) done[await shared.arrange(String(item.year), String(item.folder))]++
        json(200, done); return
      }
      const upload = validateUpload(body)
      const shared = deps.drive()
      const driveId = shared ? await shared.upload([...upload.year ? [yearFolder(upload.year)] : [], upload.folder || upload.projectId, kindFolder(upload.kind)],pictureName(upload.kind, upload.meta, upload.contentType), upload.contentType, upload.data) : null
      try {
        json(200, { file: await deps.fileStore.insertFile(sql, randomUUID(), upload, user.email, driveId) })
      } catch (error) {
        if (driveId) await shared?.trash(driveId).catch(() => {})
        throw error
      }
    } catch (error) {
      if (error instanceof FileInputError || error instanceof SyntaxError) { json(400, { error: error instanceof FileInputError ? error.message : '입력값을 확인해 주세요.' }); return }
      if (error instanceof DriveError) { json(502, { error: error.message }); return }
      json(503, { error: '사진 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' })
    }
  }
}
export default createFilesHandler()
