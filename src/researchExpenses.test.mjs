import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isResearchOrderNo, nextResearchOrderNo, researchOfYear, researchOrder } from './researchExpenses.ts'

const project = (orderNo, name = '연구') => ({ id: `research-${orderNo}`, orderNo, name })

test('research numbers are 9NN after the year, never a 공사 or 관리비 number', () => {
  assert.equal(isResearchOrderNo('26901'), true)
  assert.equal(isResearchOrderNo('26999'), true)
  assert.equal(isResearchOrderNo('26900'), false)
  assert.equal(isResearchOrderNo('26000'), false)
  assert.equal(isResearchOrderNo('26035'), false)
  assert.equal(isResearchOrderNo('2026-901'), false)
})

test('each year starts at 901 and continues past the highest number used', () => {
  assert.equal(nextResearchOrderNo([], '2026'), '26901')
  assert.equal(nextResearchOrderNo([project('26901'), project('26903'), project('25907')], '2026'), '26904')
  assert.equal(nextResearchOrderNo([project('26901')], '2027'), '27901')
  assert.equal(nextResearchOrderNo([project('26999')], '2026'), null)
})

test('a year lists only its own research, in number order, as stand-in orders', () => {
  assert.deepEqual(researchOfYear([project('26902'), project('25901'), project('26901')], '2026').map(p => p.orderNo), ['26901', '26902'])
  const order = researchOrder(project('26901', '필터 테스트'))
  assert.equal(order.year, '2026'); assert.equal(order.projectName, '필터 테스트'); assert.equal(order.client1, '')
})
