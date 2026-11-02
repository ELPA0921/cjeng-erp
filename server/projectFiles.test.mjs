import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { deleteFile, ensureFileSchema, insertFile, listFiles, readFile, updateFileMeta, validateUpload } from './projectFiles.ts'

// Same stand-in for the Neon driver as workspaceDb.test.mjs: tagged templates become parameterized queries.
function neonLike(db) {
  return (strings, ...values) => {
    const text = strings.reduce((out, part, i) => out + part + (i < values.length ? `$${i + 1}` : ''), '')
    return { then: (resolve, reject) => db.query(text, values).then(result => result.rows).then(resolve, reject) }
  }
}

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('발주서 사진')])
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('원본')])
const upload = (extra = {}) => ({ projectId: 'shared-2025-25001', kind: 'purchaseOrder', contentType: 'image/png', data: png.toString('base64'),
  meta: { vendor: '연일철강', item: '흑각관 외', date: '2025-02-07', poNumber: 'CJE-2502071' }, ...extra })

test('a 발주서 picture is stored, listed, read back, edited and deleted', async () => {
  const sql = neonLike(new PGlite())
  await ensureFileSchema(sql)
  await ensureFileSchema(sql)
  const file = await insertFile(sql, 'f1', validateUpload(upload({ thumb: jpeg.toString('base64') })), 'staff@cjeng.kr')
  assert.deepEqual(file.meta, { vendor: '연일철강', item: '흑각관 외', date: '2025-02-07', poNumber: 'CJE-2502071', fileName: '' })
  assert.equal(file.size, png.length)
  await insertFile(sql, 'f2', validateUpload(upload({ kind: 'photo', projectId: 'shared-2025-25002', meta: { caption: '설치 전' } })), 'staff@cjeng.kr')
  assert.deepEqual((await listFiles(sql, 'shared-2025-25001')).map(row => row.id), ['f1'])
  assert.deepEqual(await readFile(sql, 'f1', false), { contentType: 'image/png', data: png })
  assert.deepEqual(await readFile(sql, 'f1', true), { contentType: 'image/jpeg', data: jpeg })
  assert.deepEqual(await readFile(sql, 'f2', true), { contentType: 'image/png', data: png })
  assert.equal((await updateFileMeta(sql, 'f1', { vendor: '연일철강', poNumber: 'CJE-2502072' })).meta.poNumber, 'CJE-2502072')
  assert.equal(await updateFileMeta(sql, 'missing', {}), null)
  assert.equal(await deleteFile(sql, 'f1'), true)
  assert.equal(await deleteFile(sql, 'f1'), false)
  assert.equal(await readFile(sql, 'f1', false), null)
})

test('uploads must be real pictures of an allowed type with tidy details', () => {
  assert.throws(() => validateUpload(upload({ contentType: 'image/jpeg' })), /사진 파일/)
  assert.throws(() => validateUpload(upload({ contentType: 'text/html', data: Buffer.from('<script>').toString('base64') })), /JPG, PNG, WebP/)
  assert.throws(() => validateUpload(upload({ kind: 'contract' })), /파일 종류/)
  assert.throws(() => validateUpload(upload({ meta: { date: '25.02.07' } })), /날짜/)
  assert.throws(() => validateUpload(upload({ projectId: '' })))
  assert.throws(() => validateUpload(upload({ data: 'not base64!' })))
  assert.deepEqual(validateUpload(upload({ kind: 'photo', meta: { caption: ' 설치 후 ', vendor: '무시됨' } })).meta, { caption: '설치 후', date: '', fileName: '' })
})

test('/api/files lets signed-in staff upload, list, view, download and delete pictures', async () => {
  const { createFilesHandler } = await import('../api/files.ts')
  const sql = neonLike(new PGlite())
  const origin = 'https://erp.example.test'
  const fileStore = { sql: () => sql, ensureFileSchema, listFiles, readFile, insertFile, updateFileMeta, deleteFile }
  const deps = signedIn => ({ readSession: async () => signedIn ? { email: 'staff@cjeng.kr' } : null, sameOrigin: req => req.headers.origin === origin, settings: () => ({ storage: 'postgres', origin }), fileStore })
  const call = async (method, url, body, signedIn = true, headers = { origin }) => {
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value } }
    await createFilesHandler(deps(signedIn))({ method, url, headers, body }, res)
    return res
  }
  assert.equal((await call('GET', '/api/files?projectId=p1', undefined, false)).statusCode, 401)
  assert.equal((await call('POST', '/api/files', upload(), true, { origin: 'https://elsewhere.test' })).statusCode, 403)
  assert.equal((await call('POST', '/api/files', upload({ contentType: 'image/jpeg' }))).statusCode, 400)
  const created = JSON.parse((await call('POST', '/api/files', upload())).body).file
  assert.equal(created.meta.poNumber, 'CJE-2502071')
  assert.deepEqual(JSON.parse((await call('GET', '/api/files?projectId=shared-2025-25001')).body).files.map(file => file.id), [created.id])
  const picture = await call('GET', `/api/files?id=${created.id}`)
  assert.deepEqual([picture.headers['Content-Type'], picture.body], ['image/png', png])
  assert.equal(picture.headers['Content-Disposition'], undefined)
  const download = await call('GET', `/api/files?id=${created.id}&download=1&name=${encodeURIComponent('25001_CJE-2502071/연일철강')}`)
  assert.equal(download.headers['Content-Disposition'], `attachment; filename*=UTF-8''${encodeURIComponent('25001_CJE-2502071_연일철강.png')}`)
  assert.equal(JSON.parse((await call('PATCH', '/api/files', { id: created.id, meta: { vendor: '연일철강(주)' } })).body).file.meta.vendor, '연일철강(주)')
  assert.equal((await call('DELETE', `/api/files?id=${created.id}`)).statusCode, 200)
  assert.equal((await call('GET', `/api/files?id=${created.id}`)).statusCode, 404)
})
