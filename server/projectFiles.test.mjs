import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { generateKeyPairSync } from 'node:crypto'
import { createDrive, driveConfig, syncOrderFolders } from './googleDrive.ts'
import { deleteFile, ensureFileSchema, insertFile, kindFolder, listFiles, listUnmoved, markMoved, pictureName, readFile, updateFileMeta, validateUpload } from './projectFiles.ts'

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
  assert.deepEqual(file.meta, { vendor: '연일철강', item: '흑각관 외', date: '2025-02-07', poNumber: 'CJE-2502071', fileName: '', group: '' })
  assert.equal(file.size, png.length)
  await insertFile(sql, 'f2', validateUpload(upload({ kind: 'photo', projectId: 'shared-2025-25002', meta: { caption: '설치 전' } })), 'staff@cjeng.kr')
  assert.deepEqual((await listFiles(sql, 'shared-2025-25001')).map(row => row.id), ['f1'])
  assert.deepEqual(await readFile(sql, 'f1', false), { contentType: 'image/png', data: png, driveId: null })
  assert.deepEqual(await readFile(sql, 'f1', true), { contentType: 'image/jpeg', data: jpeg, driveId: null })
  assert.deepEqual(await readFile(sql, 'f2', true), { contentType: 'image/png', data: png, driveId: null })
  assert.equal((await updateFileMeta(sql, 'f1', { vendor: '연일철강', poNumber: 'CJE-2502072' })).meta.poNumber, 'CJE-2502072')
  assert.equal(await updateFileMeta(sql, 'missing', {}), null)
  assert.deepEqual(await deleteFile(sql, 'f1'), { driveId: null })
  assert.equal(await deleteFile(sql, 'f1'), null)
  assert.equal(await readFile(sql, 'f1', false), null)
})

test('uploads must be real pictures of an allowed type with tidy details', () => {
  assert.throws(() => validateUpload(upload({ contentType: 'image/jpeg' })), /사진 파일/)
  assert.throws(() => validateUpload(upload({ contentType: 'text/html', data: Buffer.from('<script>').toString('base64') })), /JPG, PNG, WebP/)
  assert.throws(() => validateUpload(upload({ kind: 'contract' })), /파일 종류/)
  assert.throws(() => validateUpload(upload({ meta: { date: '25.02.07' } })), /날짜/)
  assert.throws(() => validateUpload(upload({ projectId: '' })))
  assert.throws(() => validateUpload(upload({ data: 'not base64!' })))
  assert.deepEqual(validateUpload(upload({ kind: 'photo', meta: { caption: ' 설치 후 ', vendor: '무시됨' } })).meta, { caption: '설치 후', date: '', fileName: '', group: '' })
})

test('/api/files lets signed-in staff upload, list, view, download and delete pictures', async () => {
  const { createFilesHandler } = await import('../api/files.ts')
  const sql = neonLike(new PGlite())
  const origin = 'https://erp.example.test'
  const fileStore = { sql: () => sql, ensureFileSchema, listFiles, readFile, insertFile, updateFileMeta, deleteFile, listUnmoved, markMoved }
  const deps = signedIn => ({ readSession: async () => signedIn ? { email: 'staff@cjeng.kr', role: 'staff' } : null, sameOrigin: req => req.headers.origin === origin, settings: () => ({ storage: 'postgres', origin }), fileStore, drive: () => null })
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

// A stand-in shared drive that keeps pictures in memory.
function memoryDrive() {
  const files = new Map()
  let next = 0
  return {
    files,
    async upload(path, name, contentType, data) { const id = `d${++next}`; files.set(id, { path, name, contentType, data, trashed: false }); return id },
    async download(id) { const file = files.get(id); return file ? file.data : null },
    async trash(id) { const file = files.get(id); if (file) file.trashed = true },
  }
}

test('with a shared drive, originals go to the 공사 folder and only previews stay in the database', async () => {
  const { createFilesHandler } = await import('../api/files.ts')
  const sql = neonLike(new PGlite())
  const origin = 'https://erp.example.test'
  const drive = memoryDrive()
  const fileStore = { sql: () => sql, ensureFileSchema, listFiles, readFile, insertFile, updateFileMeta, deleteFile, listUnmoved, markMoved }
  let role = 'staff'
  const handler = createFilesHandler({ readSession: async () => ({ email: 'staff@cjeng.kr', role }), sameOrigin: req => req.headers.origin === origin, settings: () => ({ storage: 'postgres', origin }), fileStore, drive: () => drive })
  const call = async (method, url, body) => {
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value } }
    await handler({ method, url, headers: { origin }, body }, res)
    return res
  }
  // One picture saved before the drive was set up.
  await ensureFileSchema(sql)
  await insertFile(sql, 'old', validateUpload(upload({ projectId: 'shared-2024-24012', meta: { vendor: '태진', poNumber: 'CJE-1', fileName: '24012-01.png' } })), 'staff@cjeng.kr')

  const created = JSON.parse((await call('POST', '/api/files', upload({ folder: '25001 신규 공사', year: '2025', thumb: jpeg.toString('base64'), meta: { vendor: '연일철강', poNumber: 'CJE-2502071', fileName: 'image.png' } }))).body).file
  const [stored] = drive.files.values()
  assert.deepEqual([stored.path, stored.name, stored.data], [['2025년', '25001 신규 공사', '발주서'], 'CJE-2502071_연일철강_image.png', png])
  assert.deepEqual(await readFile(sql, created.id, false), { contentType: 'image/png', data: null, driveId: 'd1' })
  assert.deepEqual((await call('GET', '/api/files?id=' + created.id)).body, png)
  assert.deepEqual((await call('GET', '/api/files?thumb=1&id=' + created.id)).body, jpeg)

  // Only an admin moves the older pictures, and each lands in its 공사's folder.
  assert.equal((await call('POST', '/api/files', { action: 'moveToDrive', folders: {} })).statusCode, 403)
  role = 'admin'
  assert.deepEqual(JSON.parse((await call('POST', '/api/files', { action: 'moveToDrive', folders: { 'shared-2024-24012': '24012 집진시스템 개선 공사' } })).body), { moved: 1, left: 0 })
  assert.deepEqual(drive.files.get('d2').path, ['24012 집진시스템 개선 공사', '발주서'])
  assert.deepEqual((await call('GET', '/api/files?id=old')).body, png)
  assert.deepEqual(JSON.parse((await call('POST', '/api/files', { action: 'moveToDrive', folders: {} })).body), { moved: 0, left: 0 })

  // Deleting sends the drive copy to the trash; a copy missing from the drive reads as not found.
  assert.equal((await call('DELETE', '/api/files?id=' + created.id)).statusCode, 200)
  assert.equal(drive.files.get('d1').trashed, true)
  drive.files.delete('d2')
  assert.equal((await call('GET', '/api/files?id=old')).statusCode, 404)
})

test('picture names in the drive come from their details', () => {
  assert.equal(pictureName('purchaseOrder', { poNumber: '', date: '2025-02-07', vendor: '연일철강', fileName: '' }, 'image/jpeg'), '2025-02-07_연일철강.jpg')
  assert.equal(pictureName('photo', { date: '2026-11-02', caption: '설치 전', fileName: '20261102_101530.jpg' }, 'image/jpeg'), '2026-11-02_설치 전_20261102_101530.jpg')
  assert.equal(pictureName('photo', {}, 'image/jpeg'), '사진.jpg')
})

test('the drive client signs in as the service account, makes folders once and uploads into them', async () => {
  assert.equal(driveConfig({}), null)
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = JSON.stringify({ client_email: 'erp@cjeng.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
  const config = driveConfig({ GOOGLE_DRIVE_SERVICE_ACCOUNT: key, GOOGLE_DRIVE_FOLDER_ID: 'root' })
  const requests = []
  const reply = body => new Response(JSON.stringify(body), { status: 200 })
  const drive = createDrive(config, async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    requests.push((init.method ?? 'GET') + ' ' + pathname)
    if (pathname === '/token') return reply({ access_token: 'token', expires_in: 3600 })
    assert.equal(init.headers.Authorization, 'Bearer token')
    if (pathname === '/drive/v3/files' && !init.method) return reply({ files: searchParams.get('q').includes("name = '발주서'") ? [{ id: 'po-folder' }] : [] })
    if (pathname === '/drive/v3/files') return reply({ id: 'project-folder' })
    if (pathname.startsWith('/upload/')) { assert.match(init.body.toString(), /"parents":\["po-folder"\]/); return reply({ id: 'file-1' }) }
    if (init.method === 'PATCH') return new Response('{}', { status: 404 })
    return new Response(png)
  })
  assert.equal(await drive.upload(['24012 집진시스템 개선 공사', '발주서'], 'CJE-1_태진.png', 'image/png', png), 'file-1')
  assert.equal(await drive.upload(['24012 집진시스템 개선 공사', '발주서'], 'CJE-1_태진.png', 'image/png', png), 'file-1')
  assert.deepEqual(await drive.download('file-1'), png)
  await drive.trash('gone')
  // One sign-in, the two folders looked up (one made) once, then two uploads.
  assert.deepEqual(requests, ['POST /token', 'GET /drive/v3/files', 'POST /drive/v3/files', 'GET /drive/v3/files', 'POST /upload/drive/v3/files', 'POST /upload/drive/v3/files', 'GET /drive/v3/files/file-1', 'PATCH /drive/v3/files/gone'])
})

test('공사 folders go into their year folder: older ones are moved, missing ones are made empty', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = JSON.stringify({ client_email: 'erp@cjeng.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
  const drive = createDrive(driveConfig({ GOOGLE_DRIVE_SERVICE_ACCOUNT: key, GOOGLE_DRIVE_FOLDER_ID: 'root' }), async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    const reply = body => new Response(JSON.stringify(body), { status: 200 })
    if (pathname === '/token') return reply({ access_token: 'token', expires_in: 3600 })
    if (pathname === '/drive/v3/files' && !init.method) {
      const [, name, parent] = /^name = '(.*)' and '(.*)' in parents/.exec(searchParams.get('q'))
      return reply({ files: [...folders].filter(([, f]) => f.name === name && f.parent === parent && !f.trashed).map(([id]) => ({ id })) })
    }
    if (pathname === '/drive/v3/files') { const { name, parents } = JSON.parse(init.body); const id = `f${folders.size}`; folders.set(id, { name, parent: parents[0] }); return reply({ id }) }
    if (pathname.startsWith('/upload/')) return reply({ id: 'picture' })
    const id = decodeURIComponent(pathname.split('/').pop())
    if (searchParams.get('addParents')) { assert.equal(searchParams.get('removeParents'), folders.get(id).parent); folders.get(id).parent = searchParams.get('addParents') }
    Object.assign(folders.get(id), JSON.parse(init.body))
    return reply({ id })
  })
  const folders = new Map([['root', { name: 'ERP 사진', parent: 'drive' }], ['old', { name: '23019 집진기 공사', parent: 'root' }]])
  const where = name => { const [id, f] = [...folders].find(([, f]) => f.name === name); return { id, parent: folders.get(f.parent)?.name ?? f.parent } }

  assert.equal(await drive.arrange('2023', '23019 집진기 공사'), 'moved')
  assert.deepEqual(where('23019 집진기 공사'), { id: 'old', parent: '2023년' })
  assert.equal(await drive.arrange('2023', '23019 집진기 공사'), 'kept')
  assert.equal(await drive.arrange('2026', '26001 신규/공사'), 'made')
  assert.equal(where('26001 신규_공사').parent, '2026년')
  // New pictures land in the moved folder, not a fresh one at the top.
  const before = folders.size
  await drive.upload(['2023년', '23019 집진기 공사', '사진대지'], '사진.jpg', 'image/jpeg', jpeg)
  assert.equal(where('사진대지').parent, '23019 집진기 공사')
  assert.equal(folders.size, before + 1)
  // A 공사 renamed into another year takes its folder along; a deleted one's folder goes to the trash.
  assert.equal(await drive.relocate({ year: '2023', name: '23019 집진기 공사' }, { year: '2024', name: '24001 집진기 개선 공사' }), 'moved')
  assert.deepEqual(where('24001 집진기 개선 공사'), { id: 'old', parent: '2024년' })
  assert.equal(await drive.relocate({ year: '2025', name: '25009 없는 공사' }, { year: '2025', name: '25009 새 공사' }), 'made')
  assert.equal(await drive.remove({ year: '2024', name: '24001 집진기 개선 공사' }), true)
  assert.equal(folders.get('old').trashed, true)
  assert.equal(await drive.remove({ year: '2022', name: '22001 예전 공사' }), false)
})

test('only an admin arranges the drive folders, with a checked list', async () => {
  const { createFilesHandler } = await import('../api/files.ts')
  const origin = 'https://erp.example.test'
  const arranged = []
  const drive = { ...memoryDrive(), async arrange(year, folder) { arranged.push([year, folder]); return arranged.length === 1 ? 'moved' : 'made' } }
  let role = 'staff'
  const fileStore = { sql: () => () => Promise.resolve([]), ensureFileSchema: async () => {} }
  const handler = createFilesHandler({ readSession: async () => ({ email: 'staff@cjeng.kr', role }), sameOrigin: () => true, settings: () => ({ storage: 'postgres', origin }), fileStore, drive: () => drive })
  const call = async body => {
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value } }
    await handler({ method: 'POST', url: '/api/files', headers: { origin }, body }, res)
    return res
  }
  const folders = [{ year: '2023', folder: '23019 집진기 공사' }, { year: '2026', folder: '26001 신규 공사' }]
  assert.equal((await call({ action: 'arrangeDrive', folders })).statusCode, 403)
  role = 'admin'
  assert.equal((await call({ action: 'arrangeDrive', folders: [{ year: '23', folder: '23019' }] })).statusCode, 400)
  assert.equal((await call({ action: 'arrangeDrive', folders: Array(26).fill(folders[0]) })).statusCode, 400)
  assert.deepEqual(JSON.parse((await call({ action: 'arrangeDrive', folders })).body), { kept: 0, moved: 1, made: 1 })
  assert.deepEqual(arranged, [['2023', '23019 집진기 공사'], ['2026', '26001 신규 공사']])
})

test('saving 수주대장 makes, follows and trashes the 공사 folders', async () => {
  const calls = []
  const drive = {
    async arrange(year, name) { calls.push(['arrange', year, name]); return 'made' },
    async relocate(from, to) { calls.push(['relocate', from.name, to.year + '/' + to.name]); return 'moved' },
    async remove(folder) { calls.push(['remove', folder.year + '/' + folder.name]); if (folder.name.startsWith('26003')) throw new Error('drive down'); return true },
  }
  const order = (id, year, orderNo, projectName) => ({ id, year, orderNo, projectName })
  const before = [order('a', '2026', '26001', '배관 공사'), order('b', '2026', '26002', '덕트 공사'), order('c', '2026', '26003', '철거 공사'), order('m', '2026', '26000', '관리비')]
  const after = [order('a', '2026', '26001', '배관 공사'), order('b', '2026', '26002', '덕트 교체 공사'), order('d', '2026', '26004', ' 신규 공사 '), order('n', '2027', '27000', '관리비')]
  assert.deepEqual(await syncOrderFolders(drive, before, after), { done: 2, failed: 1, skipped: 0 })
  assert.deepEqual(calls, [['relocate', '26002 덕트 공사', '2026/26002 덕트 교체 공사'], ['arrange', '2026', '26004 신규 공사'], ['remove', '2026/26003 철거 공사']])
  // A large import is left for the admin to arrange instead of holding up the save.
  calls.length = 0
  const many = Array.from({ length: 21 }, (_, i) => order('x' + i, '2026', String(26100 + i), '공사'))
  assert.deepEqual(await syncOrderFolders(drive, [], many), { done: 0, failed: 0, skipped: 21 })
  assert.equal(calls.length, 0)
})

test('a 발주서 keeps the PDF it came as, and only a real PDF passes as one', async () => {
  const pdf = Buffer.from('%PDF-1.7\n발주서')
  const upload = { projectId: 'shared-2026-26001', kind: 'purchaseOrderPdf', contentType: 'application/pdf', data: pdf.toString('base64'), thumb: jpeg.toString('base64'), meta: { vendor: '연일철강', poNumber: 'CJE-1', fileName: '발주서.pdf', group: 'g1' } }
  const checked = validateUpload(upload)
  assert.deepEqual([checked.contentType, checked.data, checked.thumb, checked.meta.group], ['application/pdf', pdf, null, 'g1'])
  assert.throws(() => validateUpload({ ...upload, kind: 'purchaseOrder' }), /JPG, PNG, WebP/)
  assert.throws(() => validateUpload({ ...upload, contentType: 'image/png', data: png.toString('base64') }), /PDF 파일만/)
  assert.throws(() => validateUpload({ ...upload, data: png.toString('base64') }), /파일을 확인/)
  assert.equal(pictureName('purchaseOrderPdf', checked.meta, 'application/pdf'), 'CJE-1_연일철강_발주서.pdf')
  assert.equal(kindFolder('purchaseOrderPdf'), '발주서')
})
