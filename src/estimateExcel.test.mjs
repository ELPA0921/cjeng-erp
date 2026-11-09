import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateWorkbook } from './estimateExcel.ts'
import { columnName, crc32 } from './xlsxWriter.ts'
import { defaultRates } from './estimateTypes.ts'

const estimate = {
  id: 'e1', no: '261109-01A', title: '150CMM 오존탈취탑 <설치>', client: '정읍', date: '2026-11-09',
  paymentTerms: '협의', supplyPeriod: '발주후 60일', delivery: '설치 완료', validity: '견적일로 30일', remarks: '1. 견적외 별도\n2. 부가세 별도',
  grade: '스텐', roundTo: 100000, rates: defaultRates(), updatedAt: '',
  sections: [{ id: 's1', name: '오존탈취탑', miscRate: 3, lines: [
    { id: 'l1', name: 'BODY', spec: 'STS304 Ø1500×2200H', unit: 'EA', qty: 1, grade: '스텐', matCost: 3000000, labCost: 0, expCost: 0, markup: 1.3 },
    { id: 'l2', name: '제작비 기공', spec: '', unit: 'M/D', qty: 16, grade: '스텐', matCost: 0, labCost: 300000, expCost: 30000, markup: 1 },
  ] }],
}

test('zip helpers', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.deepEqual([0, 25, 26, 27, 51, 52].map(columnName), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
})

const text = bytes => new TextDecoder().decode(bytes)

test('the workbook has the company’s four sheets, with 원가 only in the internal one', () => {
  const plain = text(estimateWorkbook(estimate))
  for (const name of ['갑지', '원가계산서', '집계표', '상세내역서']) assert.match(plain, new RegExp(`<sheet name="${name}"`))
  assert.doesNotMatch(plain, /원가분석/)
  assert.match(plain, /150CMM 오존탈취탑 &lt;설치&gt;/)
  // 3,900,000 quoted for BODY; the 원가 3,000,000 must not reach the client.
  assert.match(plain, /<v>3900000<\/v>/)
  assert.doesNotMatch(plain, /<v>3000000<\/v>/)
  const internal = text(estimateWorkbook(estimate, { includeCost: true }))
  assert.match(internal, /<sheet name="원가분석\(내부용\)"/)
  assert.match(internal, /<v>3000000<\/v>/)
})
