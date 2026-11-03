import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { validateOrders, validateRevision } from './orderValidation.ts'
import { createOrdersHandler } from '../api/orders.ts'
import { readSession, sameOrigin, settings, useUserDirectory } from './security.ts'
import { createUserDirectory } from './userAccess.ts'

const origin = 'https://workspace.example.test'
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'test-client', DATABASE_URL: 'postgresql://not-used',
  WORKSPACE_SESSION_SECRET: 'test-only-secret-012345678901234567890123456789',
  WORKSPACE_ORIGIN: origin, WORKSPACE_ALLOWED_EMAILS: 'allowed@example.test',
})
// Sessions check the account list; tests use the environment list without a database.
useUserDirectory(createUserDirectory({ sql: () => null, envEmails: () => [...settings().allowed] }))
const order = { id: 'id-1', year: '2023', orderNo: '23001', orderDate: '', expectedCompletionDate: '2023-09-19', manager: '', client1: '', client2: '', region: '', projectName: '테스트 공사', note: '쉼표,\n비고', status: '준공' }

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = JSON.parse(value) } }
}
async function token(email = 'allowed@example.test', expiry = '1h') {
  return new SignJWT({ email, name: '테스트 사용자' }).setProtectedHeader({ alg: 'HS256' }).setSubject('test-google-sub').setIssuer(origin).setAudience('cjeng-workspace').setIssuedAt().setExpirationTime(expiry).sign(settings().secret)
}
const request = (body, method = 'PUT') => ({ method, headers: { origin, 'content-type': 'application/json' }, body })

test('server validates identity, unique keys, actual dates and status while preserving unknown dates', () => {
  assert.equal(validateOrders([order])[0].orderDate, '')
  assert.equal(validateOrders([order])[0].note, '쉼표,\n비고')
  assert.throws(() => validateOrders([order, { ...order, id: 'other-id' }]), /중복/)
  assert.throws(() => validateOrders([{ ...order, orderDate: '2023-02-30' }]), /날짜/)
  assert.throws(() => validateOrders([{ ...order, status: '완료' }]), /상태/)
  assert.throws(() => validateOrders([{ ...order, projectName: '' }]), /필수/)
  for (const value of [-1, 1.5, '0', null]) assert.throws(() => validateRevision(value))
})

test('valid staff sessions work; expired, tampered, and disallowed identities fail closed', async () => {
  const valid = await token()
  assert.equal((await readSession({ headers: { cookie: `__Host-cjeng-session=${valid}` } })).sub, 'test-google-sub')
  for (const invalid of [await token('outsider@example.test'), await token('allowed@example.test', '-1h'), valid.slice(0, -10) + 'bad']) {
    assert.equal(await readSession({ headers: { cookie: `__Host-cjeng-session=${invalid}` } }), null)
  }
  assert.equal(await readSession({ headers: {} }), null)
  assert.equal(sameOrigin(request({}), origin), true)
  assert.equal(sameOrigin({ headers: { origin: 'https://other.example', 'content-type': 'application/json' } }, origin), false)
})

test('unauthenticated requests and cross-origin writes never reach the database', async () => {
  let dbCalls = 0
  const deps = { settings, sameOrigin, readSession: async () => null, readOrders: async () => { dbCalls++; return {} }, writeOrders: async () => { dbCalls++; return {} } }
  const denied = response()
  await createOrdersHandler(deps)(request({}, 'GET'), denied)
  assert.equal(denied.statusCode, 401)
  deps.readSession = async () => ({ email: 'allowed@example.test' })
  const crossOrigin = response()
  await createOrdersHandler(deps)({ ...request({ orders: [order], revision: 0 }), headers: { origin: 'https://other.example', 'content-type': 'application/json' } }, crossOrigin)
  assert.equal(crossOrigin.statusCode, 403)
  assert.equal(dbCalls, 0)
})

test('two clients cannot overwrite each other; a failed or invalid write is never reported saved', async () => {
  let data = { orders: [order], revision: 0 }
  let failDatabase = false
  const deps = { settings, sameOrigin, readSession: async () => ({ email: 'allowed@example.test' }), readOrders: async () => structuredClone(data), writeOrders: async (orders, revision) => {
    if (failDatabase) throw new Error('connection failed')
    if (revision !== data.revision) return null
    data = { orders, revision: revision + 1 }
    return structuredClone(data)
  } }
  const handler = createOrdersHandler(deps)
  const staffA = response(), staffB = response()
  await handler(request({}, 'GET'), staffA)
  await handler(request({}, 'GET'), staffB)
  const changed = response()
  await handler(request({ orders: [{ ...order, status: '보류' }], revision: staffA.body.revision }), changed)
  assert.equal(changed.statusCode, 200)
  const conflicting = response()
  await handler(request({ orders: [{ ...order, status: '진행중' }], revision: staffB.body.revision }), conflicting)
  assert.equal(conflicting.statusCode, 409)
  assert.equal(data.orders[0].status, '보류')
  const invalid = response()
  await handler(request({ orders: [order, order], revision: data.revision }), invalid)
  assert.equal(invalid.statusCode, 400)
  failDatabase = true
  const unavailable = response()
  await handler(request({ orders: [order], revision: data.revision }), unavailable)
  assert.equal(unavailable.statusCode, 503)
  assert.equal(data.orders[0].status, '보류')
})

test('a saved 수주대장 brings the 공사 folders along, and a drive problem never fails the save', async () => {
  let data = { orders: [order], revision: 0 }
  const calls = []
  let driveDown = false
  const drive = {
    async arrange(year, name) { if (driveDown) throw new Error('drive down'); calls.push(['arrange', year, name]) },
    async relocate() {},
    async remove(folder) { calls.push(['remove', folder.name]) },
  }
  const deps = { settings, sameOrigin, readSession: async () => ({ email: 'allowed@example.test' }), readOrders: async () => structuredClone(data), drive: () => drive,
    writeOrders: async (orders, revision) => revision === data.revision ? structuredClone(data = { orders, revision: revision + 1 }) : null }
  const handler = createOrdersHandler(deps)
  const added = { ...order, id: 'id-2', orderNo: '23002', projectName: '신규 공사' }
  const saved = response()
  await handler(request({ orders: [order, added], revision: 0 }), saved)
  assert.equal(saved.statusCode, 200)
  assert.deepEqual(calls, [['arrange', '2023', '23002 신규 공사']])
  // A write that lost to another staff member leaves the folders alone.
  await handler(request({ orders: [order], revision: 0 }), response())
  assert.equal(calls.length, 1)
  const removed = response()
  await handler(request({ orders: [added], revision: 1 }), removed)
  assert.deepEqual(calls.at(-1), ['remove', '23001 테스트 공사'])
  driveDown = true
  const stillSaved = response()
  await handler(request({ orders: [added, order], revision: 2 }), stillSaved)
  assert.equal(stillSaved.statusCode, 200)
  assert.equal(data.orders.length, 2)
})
