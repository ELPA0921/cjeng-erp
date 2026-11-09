import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCollection, validateSetting } from './workspaceValidation.ts'
import { seedItems } from '../src/estimateSeed.ts'
import { defaultRates, defaultSettings } from '../src/estimateTypes.ts'

const estimate = {
  id: 'e1', no: '261109-01A', title: '오존탈취탑', client: '정읍', date: '2026-11-09', paymentTerms: '협의', supplyPeriod: '60일', delivery: '설치', validity: '30일', remarks: '', grade: '스텐', roundTo: 100000, rates: defaultRates(), updatedAt: '2026-11-09T00:00:00.000Z',
  sections: [{ id: 's1', name: '본체', miscRate: 3, lines: [{ id: 'l1', itemId: 'item-seed-001', name: 'PLATE', spec: '3T', unit: 'KG', qty: 315, grade: '스텐', matCost: 4800, labCost: 0, expCost: 0, markup: 1.2 }] }],
}

test('the seeded 단가표 and an estimate pass the server checks unchanged', () => {
  assert.deepEqual(validateCollection('estimateItems', seedItems()), seedItems())
  assert.deepEqual(validateCollection('estimates', [estimate]), [estimate])
  assert.deepEqual(validateSetting('estimateSettings', defaultSettings()), defaultSettings())
})

test('older snapshots without 견적산출 read as empty', () => {
  assert.deepEqual(validateCollection('estimateItems', undefined), [])
  assert.deepEqual(validateCollection('estimates', undefined), [])
  assert.deepEqual(validateSetting('estimateSettings', undefined), {})
})

test('broken 견적 data is refused', () => {
  assert.throws(() => validateCollection('estimateItems', [{ ...seedItems()[0], kind: '자재' }]), /단가표/)
  assert.throws(() => validateCollection('estimateItems', [{ ...seedItems()[0], markup: '1.4' }]), /숫자/)
  assert.throws(() => validateCollection('estimates', [{ ...estimate, grade: 'SUS' }]), /일반\/스텐/)
  assert.throws(() => validateCollection('estimates', [{ ...estimate, sections: [{ ...estimate.sections[0], lines: [{ ...estimate.sections[0].lines[0], qty: Infinity }] }] }]), /수량/)
  assert.throws(() => validateCollection('estimates', [estimate, estimate]), /중복/)
  assert.throws(() => validateSetting('estimateSettings', { kgPrices: { 일반판재: 1 } }), /kg 단가/)
})
