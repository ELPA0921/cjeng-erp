import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameOrigin } from '../server/security.ts'
import { deleteProjectFile, updateProjectFile } from './projectFileApi.ts'

test('picture changes, deletes included, pass the server\'s same-origin check', async () => {
  const origin = 'https://erp.example.test'
  const sent = []
  globalThis.fetch = async (url, init = {}) => {
    sent.push({ method: init.method, headers: { origin, ...Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])) } })
    return new Response(JSON.stringify({ ok: true, file: {} }), { status: 200 })
  }
  await deleteProjectFile('f1')
  await updateProjectFile('f1', { caption: '설치 후' })
  assert.deepEqual(sent.map(request => [request.method, sameOrigin(request, origin)]), [['DELETE', true], ['PATCH', true]])
})
