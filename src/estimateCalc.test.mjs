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

test('업체 견적 prices override the 단가표; the latest 견적일 wins and 공통 sets both grades', async () => {
  const { withQuotes, itemUnitCost } = await import('./estimateCalc.ts')
  const quote = (id, date, lines) => ({ id, date, vendor: `업체${id}`, quoteNo: '', memo: '', updatedAt: date, lines })
  const line = (itemId, grade, price) => ({ id: `${itemId}${price}`, itemId, category: '', name: '', spec: '', unit: '', kind: '재료비', grade, price, note: '' })
  const items = withQuotes([plate, welder], [
    quote('b', '2026-09-01', [line('plate', '스텐', 4500)]),
    quote('a', '2026-05-01', [line('plate', '스텐', 5200), line('plate', '일반', 1500)]),
    quote('c', '2026-10-01', [line('welder', '공통', 320000)]),
  ])
  assert.equal(itemUnitCost(items[0], '스텐', settings), 4500)
  assert.equal(items[0].quoted.스텐.vendor, '업체b')
  assert.equal(itemUnitCost(items[0], '일반', settings), 1500)
  assert.equal(itemUnitCost(items[1], '일반', settings), 320000)
  assert.equal(itemUnitCost(items[1], '스텐', settings), 320000)
})

test('saving a quote links lines to the same 품명·규격·단위 or adds a new item once', async () => {
  const { linkQuote } = await import('./estimateCalc.ts')
  let n = 0
  const lines = [
    { id: '1', category: '판재·형강', name: 'ANGLE', spec: '50 × 50 × 6T', unit: 'm', kind: '재료비', grade: '스텐', price: 30000, note: '' },
    { id: '2', category: '기기류', name: '터보팬', spec: '150CMM', unit: 'SET', kind: '재료비', grade: '공통', price: 6000000, note: '' },
    { id: '3', category: '기기류', name: '터보팬', spec: '150CMM', unit: 'set', kind: '재료비', grade: '일반', price: 5000000, note: '' },
  ]
  const { quote, added } = linkQuote({ id: 'q', date: '2026-11-09', vendor: '대영풍력', quoteNo: '', memo: '', updatedAt: '', lines }, [angle], () => `new${++n}`)
  assert.equal(quote.lines[0].itemId, 'angle')
  assert.equal(quote.lines[1].itemId, 'new1')
  assert.equal(quote.lines[2].itemId, 'new1')
  assert.deepEqual(added.map(item => [item.name, item.vendor, item.priceDate]), [['터보팬', '대영풍력', '2026-11-09']])
})

test('rows pasted from a vendor’s Excel quote become lines', async () => {
  const { parsePastedLines } = await import('./estimateCalc.ts')
  const rows = parsePastedLines([
    'NO\t품 명\t규 격\t단위\t수량\t단 가\t금 액',
    '1\t스텐판\t4*8*1.5T\tSHEET\t2\t160,000\t320,000',
    '2\t스텐스파이럴 닥트\tΦ125*4M\t본\t8\t150,000\t1,200,000',
    '\t실리콘패킹\t1000*2000*10T\tSHEET\t2\t220,000\t440,000',
    '레이져모형가공\t\tSET\t6\t150,000',
    'STEEL PLATE\t12t\tKG\t1,309\t1,309,000',
    '\t\t\t\t합계\t5,350,000',
  ].join('\n'))
  assert.deepEqual(rows.map(row => [row.name, row.spec, row.unit, row.qty, row.price, row.grade]), [
    ['스텐판', '4*8*1.5T', 'SHEET', 2, 160000, '스텐'],
    ['스텐스파이럴 닥트', 'Φ125*4M', '본', 8, 150000, '스텐'],
    ['실리콘패킹', '1000*2000*10T', 'SHEET', 2, 220000, '일반'],
    ['레이져모형가공', '', 'SET', 6, 150000, '일반'],
    ['STEEL PLATE', '12t', 'KG', 1000, 1309, '일반'],
  ])
})

test('pasted labour and transport lines go to 노무비 and 경비 for both grades', async () => {
  const { parsePastedLines } = await import('./estimateCalc.ts')
  const rows = parsePastedLines(['기공\t\t인\t4\t280,000\t1,120,000', '카고크레인 운반\t5톤\t대\t1\t450,000', '스텐판\t4*8*1T\tSHEET\t1\t120,000'].join('\n'))
  assert.deepEqual(rows.map(row => [row.name, row.kind, row.grade]), [['기공', '노무비', '공통'], ['카고크레인 운반', '경비', '공통'], ['스텐판', '재료비', '스텐']])
})
