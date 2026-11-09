import type { CostRates, Estimate, EstimateItem, EstimateLine, EstimateSection, EstimateSettings, Grade } from './estimateTypes.ts'

const round = (value: number) => Math.round(value)

/** The item's 원가 per unit in the grade, or undefined when it has no price in that grade. */
export function itemUnitCost(item: EstimateItem, grade: Grade, settings: EstimateSettings) {
  if (item.kgPerUnit && item.shape) return round(item.kgPerUnit * settings.kgPrices[`${grade}${item.shape}`])
  const cost = grade === '스텐' ? item.costStainless : item.costGeneral
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined
}

export const itemHasGrade = (item: EstimateItem, grade: Grade, settings: EstimateSettings) => itemUnitCost(item, grade, settings) !== undefined

/** The grade the item is priced in when asked for `grade`: the other one if it only has that. */
export function itemGrade(item: EstimateItem, grade: Grade, settings: EstimateSettings): Grade {
  return itemHasGrade(item, grade, settings) ? grade : grade === '스텐' ? '일반' : '스텐'
}

/** Splits an item's 원가 into the 재료비 / 노무비 / 경비 columns. */
export function itemCosts(item: EstimateItem, grade: Grade, settings: EstimateSettings) {
  const cost = itemUnitCost(item, grade, settings) ?? 0
  return {
    matCost: item.kind === '재료비' ? cost : 0,
    labCost: item.kind === '노무비' ? cost : 0,
    expCost: (item.kind === '경비' ? cost : 0) + (item.expense ?? 0),
  }
}

export function lineFromItem(item: EstimateItem, grade: Grade, settings: EstimateSettings, id: string): EstimateLine {
  const used = itemGrade(item, grade, settings)
  return { id, itemId: item.id, name: item.name, spec: item.spec, unit: item.unit, qty: 1, grade: used, ...itemCosts(item, used, settings), markup: item.markup }
}

/** Moves a line to another grade, re-reading its 원가 from the 단가표 when the item has that grade. */
export function regradeLine(line: EstimateLine, grade: Grade, items: EstimateItem[], settings: EstimateSettings): EstimateLine {
  const item = line.itemId ? items.find(row => row.id === line.itemId) : undefined
  if (!item) return { ...line, grade }
  if (!itemHasGrade(item, grade, settings)) return line
  return { ...line, grade, ...itemCosts(item, grade, settings) }
}

/** Quoted unit price: 원가 × 배율, to the won. */
export const quoted = (cost: number, markup: number) => round(cost * markup)

export function lineAmounts(line: EstimateLine) {
  const mat = quoted(line.matCost, line.markup) * line.qty
  const lab = quoted(line.labCost, line.markup) * line.qty
  const exp = quoted(line.expCost, line.markup) * line.qty
  return { mat: round(mat), lab: round(lab), exp: round(exp), total: round(mat + lab + exp), cost: round((line.matCost + line.labCost + line.expCost) * line.qty) }
}

export function sectionAmounts(section: EstimateSection) {
  const sum = { mat: 0, lab: 0, exp: 0, cost: 0, matCost: 0 }
  for (const line of section.lines) {
    const amounts = lineAmounts(line)
    sum.mat += amounts.mat; sum.lab += amounts.lab; sum.exp += amounts.exp; sum.cost += amounts.cost
    sum.matCost += round(line.matCost * line.qty)
  }
  // 잡자재비 is a share of the quoted 재료비; its own 원가 is the same share of the 재료 원가.
  const misc = round(sum.mat * section.miscRate / 100)
  const miscCost = round(sum.matCost * section.miscRate / 100)
  return { mat: sum.mat + misc, lab: sum.lab, exp: sum.exp, misc, total: sum.mat + misc + sum.lab + sum.exp, cost: sum.cost + miscCost }
}

export type CostSheet = {
  directMaterial: number
  directExpense: number
  materialTotal: number
  labor: number
  industrialAccident: number
  employment: number
  health: number
  pension: number
  longTermCare: number
  retirement: number
  safety: number
  expenseTotal: number
  environment: number
  otherExpense: number
  overhead: number
  profit: number
  total: number
  applied: number
}

/** 공사 원가 계산서, the way the company's sheet computes it. */
export function costSheet(directMaterial: number, directExpense: number, labor: number, rates: CostRates, roundTo = 1): CostSheet {
  const pct = (base: number, rate: number) => round(base * rate / 100)
  const materialTotal = directMaterial + directExpense
  const industrialAccident = pct(labor, rates.industrialAccident)
  const employment = pct(labor, rates.employment)
  const health = pct(labor, rates.health)
  const pension = pct(labor, rates.pension)
  const longTermCare = pct(health, rates.longTermCare)
  const retirement = pct(labor, rates.retirement)
  const safety = pct(materialTotal + labor, rates.safety)
  const expenseTotal = industrialAccident + employment + health + pension + longTermCare + retirement + safety
  const environment = pct(materialTotal + labor + expenseTotal, rates.environment)
  const otherExpense = pct(materialTotal + labor, rates.otherExpense)
  const overhead = pct(materialTotal + labor + (rates.overheadIncludesExpense ? expenseTotal : 0), rates.overhead)
  const profit = pct(labor + expenseTotal + overhead, rates.profit)
  const total = materialTotal + labor + expenseTotal + environment + otherExpense + overhead + profit
  const step = roundTo > 1 ? roundTo : 1
  return { directMaterial, directExpense, materialTotal, labor, industrialAccident, employment, health, pension, longTermCare, retirement, safety, expenseTotal, environment, otherExpense, overhead, profit, total, applied: Math.floor(total / step) * step }
}

/** Everything the estimate screen and the Excel file show. */
export function estimateTotals(estimate: Estimate) {
  const sections = estimate.sections.map(section => ({ section, ...sectionAmounts(section) }))
  const mat = sections.reduce((sum, row) => sum + row.mat, 0)
  const lab = sections.reduce((sum, row) => sum + row.lab, 0)
  const exp = sections.reduce((sum, row) => sum + row.exp, 0)
  const cost = sections.reduce((sum, row) => sum + row.cost, 0)
  const sheet = costSheet(mat, exp, lab, estimate.rates, estimate.roundTo)
  const direct = mat + lab + exp
  return {
    sections, mat, lab, exp, direct, sheet, cost,
    /** What the 배율 added on top of 원가. */
    markupAmount: direct - cost,
    /** What the 원가계산서 added on top of the direct costs (after the cut). */
    sheetAmount: sheet.applied - direct,
    margin: sheet.applied - cost,
    marginRate: sheet.applied ? (sheet.applied - cost) / sheet.applied : 0,
  }
}

const pad = (value: number) => String(value).padStart(2, '0')
/** 견적번호 like 261109-01A: the date and the next free number that day. */
export function nextEstimateNo(date: string, taken: string[]) {
  const prefix = date.replace(/-/g, '').slice(2)
  for (let n = 1; n < 100; n++) {
    const no = `${prefix}-${pad(n)}A`
    if (!taken.includes(no)) return no
  }
  return `${prefix}-99A`
}
