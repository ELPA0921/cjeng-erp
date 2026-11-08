import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyOrderSearch, searchOrders } from './orderSearchFilters.ts'

const order = (orderNo, client1, region, projectName, extra = {}) => ({ id: orderNo, year: `20${orderNo.slice(0, 2)}`, orderNo, orderDate: '', expectedCompletionDate: '', manager: '김해운', client1, client2: '', region, projectName, ...extra })
const orders = [
  order('25010', '(주)진영', '오류공장', '배관 교체공사'),
  order('26003', '진영', '금곡공장', '덕트 설치공사', { note: '야간작업' }),
  order('26004', '경인양행', '인천공장', '배관 보수공사', { manager: '유수열' }),
]
const find = filters => searchOrders(orders, { ...emptyOrderSearch, ...filters }, { yearOf: o => o.year, statusOf: () => '진행중' }).map(o => o.orderNo)

test('nothing is listed until a condition is filled', () => {
  assert.deepEqual(find({}), [])
  assert.deepEqual(find({ client: '   ' }), [])
})

test('each field matches its own column, ignoring (주) and spaces, newest first', () => {
  assert.deepEqual(find({ client: '진영 (주)' }), ['26003', '25010'])
  assert.deepEqual(find({ region: '공장 금곡' }), ['26003'])
  assert.deepEqual(find({ project: '배관' }), ['26004', '25010'])
  assert.deepEqual(find({ manager: '유수열' }), ['26004'])
  assert.deepEqual(find({ client: '진영', project: '배관' }), ['25010'])
})

test('the keyword looks through every column and the year narrows it', () => {
  assert.deepEqual(find({ keyword: '야간' }), ['26003'])
  assert.deepEqual(find({ keyword: '26004' }), ['26004'])
  assert.deepEqual(find({ keyword: '공장', year: '2026' }), ['26004', '26003'])
  assert.deepEqual(find({ status: '준공' }), [])
})
