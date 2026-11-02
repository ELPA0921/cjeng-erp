import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readSession, sameOrigin, settings } from '../server/security.ts'
import { workspaceSql } from '../server/workspaceDb.ts'
import { deleteFile, ensureFileSchema, FileInputError, insertFile, listFiles, readFile, updateFileMeta, validateUpload } from '../server/projectFiles.ts'

// The table is created on first use, once per function instance.
let schema: Promise<void> | null = null
const fileStore = { sql: () => workspaceSql(settings().databaseUrl), ensureFileSchema, listFiles, readFile, insertFile, updateFileMeta, deleteFile }
const downloadName = (name: string, contentType: string) => {
  const base = [...name].map(char => char < ' ' || '\\/:*?"<>|'.includes(char) ? '_' : char).join('').trim().slice(0, 120) || 'photo'
  return `${base}.${contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'}`
}

/**
 * GET ?projectId= lists a 공사's pictures; GET ?id= sends one (&thumb=1 for its preview,
 * &download=1&name= to save it). POST uploads, PATCH { id, meta } edits the 발주서 or caption
 * details, DELETE ?id= removes it.
 */
export function createFilesHandler(deps = { readSession, sameOrigin, settings, fileStore }) {
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
          json(200, { files: await deps.fileStore.listFiles(sql, projectId) }); return
        }
        const file = await deps.fileStore.readFile(sql, id, query.get('thumb') === '1')
        if (!file) { json(404, { error: '사진을 찾을 수 없습니다.' }); return }
        res.statusCode = 200
        res.setHeader('Content-Type', file.contentType)
        // An id never points at a different picture, so the browser may keep it.
        res.setHeader('Cache-Control', 'private, max-age=86400')
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
        if (query.get('download') === '1') res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName(query.get('name') ?? '', file.contentType))}`)
        res.end(file.data); return
      }
      if (!['POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) { res.setHeader('Allow', 'GET, POST, PATCH, DELETE'); json(405, {}); return }
      if (!deps.sameOrigin(req, deps.settings().origin)) { json(403, { error: '접속 주소를 확인해 주세요.' }); return }
      if (req.method === 'DELETE') {
        const id = query.get('id')
        if (!id || !await deps.fileStore.deleteFile(sql, id)) { json(404, { error: '사진을 찾을 수 없습니다.' }); return }
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
      json(200, { file: await deps.fileStore.insertFile(sql, randomUUID(), validateUpload(body), user.email) })
    } catch (error) {
      if (error instanceof FileInputError || error instanceof SyntaxError) { json(400, { error: error instanceof FileInputError ? error.message : '입력값을 확인해 주세요.' }); return }
      json(503, { error: '사진 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' })
    }
  }
}
export default createFilesHandler()
