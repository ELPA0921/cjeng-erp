import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costSheet, estimateTotals, itemCosts, itemUnitCost, lineAmounts, lineFromItem, nextEstimateNo, regradeLine, sectionAmounts } from './estimateCalc.ts'
import { defaultRates, defaultSettings } from './estimateTypes.ts'

const settings = defaultSettings()
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} != ${expected}`)

test('the 정읍 150CMM 오존탈취탑 원가계산서 comes out as quoted (2025-11)', () => {
  const rates = { ...defaultRates(), industrialAccident: 3.7, employment: 1.01, health: 0, pension: 0, longTermCare: 0, retirement: 0, safety: 3.09, otherExpense: 0, overheadIncludesExpense: true }
  const sheet = costSheet(80008500, 5840000, 18450000, rates, 1000000)
  assert.equal(sheet.materialTotal, 85848500)
  near(sheet.industrialAccident + sheet.employment, 868995, '산재+고용')
  near(sheet.safety, 3222824, '안전관리비')
  near(sheet.expenseTotal, 4091819, '경비 소계')
  near(sheet.environment, 541952, '환경보전비')
  near(sheet.overhead, 6503419, '일반관리비')
  near(sheet.profit, 4356786, '이윤')
  near(sheet.total, 119792475, '순공사원가')
  assert.equal(sheet.applied, 119000000)
})

test('the LG화학 75CMM 원가계산서 comes out as quoted with the default rates (2026-07)', () => {
  const sheet = costSheet(98071018, 0, 30800000, defaultRates())
  near(sheet.industrialAccident, 1096480, '산재')
  near(sheet.health, 1091860, '건강')
  near(sheet.longTermCare, 141396, '노인장기')
  near(sheet.safety, 3775921, '안전관리비')
  near(sheet.expenseTotal, 8511137, '경비 소계')
  near(sheet.otherExpense, 3866131, '기타경비')
  near(sheet.overhead, 7732261, '일반관리비')
  near(sheet.profit, 7056510, '이윤')
  near(sheet.total, 156723967, '순공사원가')
})

const plate = { id: 'plate', category: '판재·형강', name: 'PLATE', spec: '', unit: 'KG', kind: '재료비', kgPerUnit: 1, shape: '판재', markup: 1, vendor: '', priceDate: '', note: '' }
const angle = { ...plate, id: 'angle', name: 'ANGLE', spec: '50×50×6T', unit: 'M', kgPerUnit: 4.43, shape: '형강' }
const duct = { id: 'duct', category: '덕트·배관', name: '스파이럴 덕트 직관', spec: 'Ø250', unit: 'M', kind: '재료비', costStainless: 62700, markup: 1.4, vendor: '', priceDate: '', note: '' }
const welder = { id: 'welder', category: '노무', name: '제작비 기공', spec: '', unit: 'M/D', kind: '노무비', costGeneral: 300000, costStainless: 300000, expense: 30000, markup: 1, vendor: '', priceDate: '', note: '' }

test('steel is priced by weight from the grade’s kg price', () => {
  assert.equal(itemUnitCost(plate, '일반', settings), 1600)
  assert.equal(itemUnitCost(plate, '스텐', settings), 4800)
  assert.equal(itemUnitCost(angle, '스텐', settings), Math.round(4.43 * 7500))
  assert.equal(itemUnitCost(duct, '일반', settings), undefined)
  assert.deepEqual(itemCosts(welder, '일반', settings), { matCost: 0, labCost: 300000, expCost: 30000 })
})

test('a stainless-only item stays stainless, and switching grade re-reads the 단가표', () => {
  const ductLine = lineFromItem(duct, '일반', settings, 'l1')
  assert.equal(ductLine.grade, '스텐')
  assert.equal(regradeLine(ductLine, '일반', [duct], settings), ductLine)
  const plateLine = { ...lineFromItem(plate, '일반', settings, 'l2'), qty: 315 }
  const stainless = regradeLine(plateLine, '스텐', [plate], settings)
  assert.equal(stainless.grade, '스텐')
  assert.equal(stainless.matCost, 4800)
  assert.equal(stainless.qty, 315)
  const typed = { ...plateLine, itemId: undefined, matCost: 999 }
  assert.deepEqual(regradeLine(typed, '스텐', [plate], settings), { ...typed, grade: '스텐' })
})

test('배율 lifts the quoted price and 원가 stays visible', () => {
  const line = { ...lineFromItem(duct, '스텐', settings, 'l1'), qty: 24 }
  assert.deepEqual(lineAmounts(line), { mat: 87780 * 24, lab: 0, exp: 0, total: 87780 * 24, cost: 62700 * 24 })
  const section = { id: 's', name: '덕트', miscRate: 3, lines: [line, { ...lineFromItem(welder, '스텐', settings, 'l2'), qty: 2 }] }
  const amounts = sectionAmounts(section)
  assert.equal(amounts.misc, Math.round(87780 * 24 * 0.03))
  assert.equal(amounts.mat, 87780 * 24 + amounts.misc)
  assert.equal(amounts.lab, 600000)
  assert.equal(amounts.exp, 60000)
  assert.equal(amounts.cost, 62700 * 24 + Math.round(62700 * 24 * 0.03) + 660000)
})

test('estimate totals split the margin into 배율 and 원가계산서', () => {
  const line = { ...lineFromItem(duct, '스텐', settings, 'l1'), qty: 10 }
  const estimate = { rates: defaultRates(), roundTo: 1000, sections: [{ id: 's', name: '덕트', miscRate: 0, lines: [line] }] }
  const totals = estimateTotals(estimate)
  assert.equal(totals.cost, 627000)
  assert.equal(totals.direct, 877800)
  assert.equal(totals.markupAmount, 250800)
  assert.equal(totals.sheet.applied % 1000, 0)
  assert.equal(totals.margin, totals.sheet.applied - 627000)
  assert.equal(totals.markupAmount + totals.sheetAmount, totals.margin)
})

test('견적번호 takes the next free number of the day', () => {
  assert.equal(nextEstimateNo('2026-11-09', []), '261109-01A')
  assert.equal(nextEstimateNo('2026-11-09', ['261109-01A', '261109-02A']), '261109-03A')
})
