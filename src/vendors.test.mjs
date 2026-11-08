import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frequentClientMinimum, frequentVendors, matchVendors, vendorGroups } from './vendors.ts'

const uses = (vendor, n, source = '') => Array(n).fill({ vendor, source })

test('only vendors used five times or more are offered, most used first', () => {
  const vendors = frequentVendors([...uses('승우레이져', 7), ...uses('대화볼트', 5), ...uses('한번업체', 4), ...uses(' 대화볼트 ', 1), ...uses('', 3)])
  assert.deepEqual(vendors, [{ name: '승우레이져', count: 7 }, { name: '대화볼트', count: 6 }])
})

test('each spelling is offered on its own', () => {
  const vendors = frequentVendors([...uses('승우레이져', 5), ...uses('승우 레이져', 1), ...uses('(주)승우레이져', 6, '전자세금계산서')])
  assert.deepEqual(vendors, [{ name: '(주)승우레이져', count: 6 }, { name: '승우레이져', count: 5 }])
  assert.deepEqual(matchVendors(vendors, '승우').map(v => v.name), ['(주)승우레이져', '승우레이져'])
})

test('matching ignores spaces and (주), puts prefix matches first and hides an exact entry', () => {
  const vendors = [{ name: '대화볼트', count: 9 }, { name: '(주)승우레이져', count: 6 }, { name: '볼트나라', count: 5 }]
  assert.deepEqual(matchVendors(vendors, '승우 레이').map(v => v.name), ['(주)승우레이져'])
  assert.deepEqual(matchVendors(vendors, '승우레이져').map(v => v.name), ['(주)승우레이져'])
  assert.deepEqual(matchVendors(vendors, '볼트').map(v => v.name), ['볼트나라', '대화볼트'])
  assert.deepEqual(matchVendors(vendors, '대화볼트'), [])
  assert.deepEqual(matchVendors(vendors, '  '), [])
})

test('vendors with fewer than five expenses are left out; groups keep the tax invoice spelling, then the card one', () => {
  const groups = vendorGroups([
    ...uses('승우레이져', 12), ...uses('(주)승우레이져', 3, '전자세금계산서'), ...uses('승우레이져(주)', 2, '법인카드'),
    ...uses('대화 볼트', 2), ...uses('대화볼트', 4, '법인카드'),
    ...uses('대성철물', 3), ...uses('대성 철물', 1),
    ...uses('혼자업체', 9),
  ])
  assert.deepEqual(groups.map(g => [g.target, g.total, g.spellings.map(s => s.name)]), [
    ['(주)승우레이져', 17, ['(주)승우레이져', '승우레이져(주)', '승우레이져']],
    ['대화볼트', 6, ['대화볼트', '대화 볼트']],
  ])
})

test('only spaces and (주) join names; any other letter difference stays apart', () => {
  const groups = vendorGroups([
    ...uses('주식회사 대상레이져', 4, '전자세금계산서'), ...uses('대상레이져', 3), ...uses('대상레이저', 5), ...uses('대형레이져', 6),
    ...uses('(주) 동일크레인', 2, '법인카드'), ...uses('동일크레인', 4), ...uses('제일크레인', 7),
  ])
  assert.deepEqual(groups.map(g => [g.target, g.total, g.spellings.map(s => s.name)]), [
    ['주식회사 대상레이져', 7, ['주식회사 대상레이져', '대상레이져']],
    ['(주) 동일크레인', 6, ['(주) 동일크레인', '동일크레인']],
  ])
})

test('names from the tax invoice and card lists win even when no expense uses them yet', () => {
  const official = [{ name: '(주)승우레이져', source: '전자세금계산서' }, { name: '승우레이져', source: '법인카드' }, { name: '편의점', source: '법인카드' }, { name: '(주)대상레이져', source: '전자세금계산서' }]
  const groups = vendorGroups([...uses('승우레이져', 12), ...uses('승우 레이져', 1), ...uses('대상레이져', 5), ...uses('대형레이져', 6)], official)
  assert.deepEqual(groups.map(g => [g.target, g.total, g.spellings.map(s => [s.name, s.count, s.source])]), [
    ['(주)승우레이져', 13, [['(주)승우레이져', 0, '전자세금계산서'], ['승우레이져', 12, '법인카드'], ['승우 레이져', 1, '']]],
    ['(주)대상레이져', 5, [['(주)대상레이져', 0, '전자세금계산서'], ['대상레이져', 5, '']]],
  ])
})

test('수주처 are offered from three orders on', () => {
  const uses = (vendor, count) => Array.from({ length: count }, () => ({ vendor, source: '' }))
  assert.deepEqual(frequentVendors([...uses('한빛산업', 4), ...uses('동서화학', 3), ...uses('세림금속', 2)], frequentClientMinimum), [{ name: '한빛산업', count: 4 }, { name: '동서화학', count: 3 }])
})
