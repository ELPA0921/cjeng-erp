import { grades, type CostRates, type Estimate, type EstimateItem, type EstimateLine, type EstimateSection, type EstimateSettings, type Grade, type MaterialQuote, type MaterialQuoteLine, type QuotedPrice } from './estimateTypes.ts'

const round = (value: number) => Math.round(value)

/** The item's 원가 per unit in the grade, or undefined when it has no price in that grade. */
export function itemUnitCost(item: EstimateItem, grade: Grade, settings: EstimateSettings) {
  // A price from a vendor quote beats the weight formula and the typed-in price.
  const quote = item.quoted?.[grade]
  if (quote) return quote.price
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

/** Same 품명·규격·단위 ignoring spaces and case: the same 단가표 item. */
export const itemKey = (row: { name: string; spec: string; unit: string }) => [row.name, row.spec, row.unit].map(text => text.replace(/\s+/g, '').toUpperCase()).join('|')

/** The latest vendor price of each item per grade (by 견적일, then by when it was entered). */
export function quotedPrices(quotes: MaterialQuote[]) {
  const prices = new Map<string, Partial<Record<Grade, QuotedPrice>>>()
  const ordered = [...quotes].sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt))
  for (const quote of ordered) for (const line of quote.lines) {
    if (!line.itemId || !(line.price > 0)) continue
    const entry = prices.get(line.itemId) ?? {}
    for (const grade of line.grade === '공통' ? grades : [line.grade]) entry[grade] = { price: line.price, vendor: quote.vendor, date: quote.date, quoteId: quote.id }
    prices.set(line.itemId, entry)
  }
  return prices
}

/** Items with their latest vendor prices attached; the 단가표 and estimates read these. */
export function withQuotes(items: EstimateItem[], quotes: MaterialQuote[]): EstimateItem[] {
  const prices = quotedPrices(quotes)
  return items.map(item => prices.has(item.id) ? { ...item, quoted: prices.get(item.id) } : item)
}

/**
 * Links each line of a quote to its 단가표 item: the one it already points at, else the one with
 * the same 품명·규격·단위, else a new item. Returns the linked quote and the items to add.
 */
export function linkQuote(quote: MaterialQuote, items: EstimateItem[], newId: () => string) {
  const byKey = new Map(items.map(item => [itemKey(item), item.id]))
  const known = new Set(items.map(item => item.id))
  const added: EstimateItem[] = []
  const lines = quote.lines.map(line => {
    if (line.itemId && known.has(line.itemId)) return line
    const key = itemKey(line)
    let itemId = byKey.get(key)
    if (!itemId) {
      itemId = newId()
      added.push({ id: itemId, category: line.category || '기타', name: line.name.trim(), spec: line.spec.trim(), unit: line.unit.trim(), kind: line.kind, markup: 1, vendor: quote.vendor, priceDate: quote.date, note: '업체 견적에서 추가' })
      byKey.set(key, itemId)
      known.add(itemId)
    }
    return { ...line, itemId }
  })
  return { quote: { ...quote, lines }, added }
}

const unitPattern = /^(EA|SET|M|KG|LOT|식|式|개|본|매|SHEET|대|M\/D|M2|㎡|롤|ROLL|BOX|조|PCS|장|L|DAY|회|TON|톤|인|공|평|BAG|포|통|병|M3|㎥|SQ)$/i
const numeric = (text: string) => {
  const cleaned = text.replace(/[,₩\\원\s]/g, '')
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}

/**
 * Reads rows copied from a vendor's Excel quote (품명, 규격, 단위, 수량, 단가, 금액 in any usual
 * order) into quote lines. Rows without a price are skipped; everything stays editable.
 */
export function parsePastedLines(text: string): Omit<MaterialQuoteLine, 'id'>[] {
  const result: Omit<MaterialQuoteLine, 'id'>[] = []
  for (const raw of text.split(/\r?\n/)) {
    let cells = (raw.includes('\t') ? raw.split('\t') : raw.split(/\s{2,}/)).map(cell => cell.trim())
    if (!cells.some(Boolean)) continue
    // A leading row number (1, 2, 3…) is not part of the item.
    if (cells.length > 3 && /^\d{1,3}$/.test(cells[0]) && cells.slice(1).some(cell => cell && numeric(cell) === null)) cells = cells.slice(1)
    const numbers = cells.map(numeric).filter((value): value is number => value !== null)
    const words = cells.filter(cell => cell && numeric(cell) === null)
    if (!numbers.length || !words.length) continue
    const unit = words.find(word => unitPattern.test(word.replace(/\./g, ''))) ?? ''
    const [name = '', spec = ''] = words.filter(word => word !== unit)
    let qty: number | undefined
    let price: number
    const [a, b, c] = numbers.slice(-3)
    if (numbers.length >= 3 && Math.abs(a * b - c) <= Math.max(1, Math.abs(c) * 0.01)) { qty = a; price = b }
    else if (numbers.length >= 2) {
      // 단가 and 금액 without 수량 (금액 a whole multiple of a 단가 of 100원 or more), else 수량 then 단가.
      const [x, y] = numbers.slice(-2)
      if (x >= 100 && y > x && y % x === 0) { qty = y / x; price = x } else { qty = x; price = y }
    } else price = numbers[0]
    if (!(price > 0) || !name) continue
    // 합계·소계·부가세 rows are totals, not items.
    if (/^(합|소|총)?계$|^(부가세|부가가치세|VAT|공급가액|합계금액)/i.test(name.replace(/\s+/g, ''))) continue
    // 인건비 goes in 노무비 and 운반·장비 in 경비; neither depends on 일반/스텐.
    const labor = /기공|조공|인건|노무|인부|기능공|용접공|배관공|기술자/.test(name) || /^(인|공|MD|M\/D)$/i.test(unit)
    const expense = !labor && /운반|운송|크레인|카고|장비|지게차|스카이|렌탈|임대/.test(name)
    const kind = labor ? '노무비' : expense ? '경비' : '재료비'
    const grade = kind !== '재료비' ? '공통' : /STS|SUS|스텐|스테인/i.test(`${name} ${spec}`) ? '스텐' : '일반'
    result.push({ category: '', name, spec, unit, kind, grade, ...(qty !== undefined ? { qty } : {}), price, note: '' })
  }
  return result
}
