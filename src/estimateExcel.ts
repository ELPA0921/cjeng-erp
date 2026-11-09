import { estimateTotals, lineAmounts, quoted } from './estimateCalc.ts'
import type { Estimate } from './estimateTypes.ts'
import { buildXlsx, xlsxStyles as S, type XlsxCell, type XlsxSheet } from './xlsxWriter.ts'

const company = [
  '창조이엔지㈜',
  '본사 공장 : 경기도 김포시 양촌읍 삼도공단로49번길 50',
  'Tel. 031-981-0266, Fax. 031-981-0267',
  '사업소 : 인천시 서구 검단로 502번길 1, 문정빌딩 4층',
  'Tel. 032-565-0266, Fax. 032-565-0267',
  'http://www.cjeng.kr',
]
const cutLabel = (roundTo: number) => roundTo >= 1000000 ? '(백만단위절사)' : roundTo >= 100000 ? '(십만단위절사)' : roundTo >= 10000 ? '(만단위절사)' : roundTo >= 1000 ? '(천단위절사)' : ''
const num = (v: number, s: number = S.number): XlsxCell => ({ v, s })
const txt = (v: string, s: number = S.text): XlsxCell => ({ v, s })
const dash = (v: number, s: number = S.number): XlsxCell => v ? { v, s } : { v: '-', s: S.center }

function cover(estimate: Estimate, applied: number, total: number): XlsxSheet {
  const [year, month, day] = estimate.date.split('-')
  const rows: XlsxCell[][] = [
    [txt('견 적 서', S.title)],
    [],
    [txt(`${estimate.client} 귀하`, S.subtitle), null, null, null, txt(company[0], S.subtitle)],
    [txt('견적번호 :', S.bold), estimate.no, null, null, company[1]],
    [txt('건    명 :', S.bold), estimate.title, null, null, company[2]],
    [txt('총 금 액 :', S.bold), txt(`₩${applied.toLocaleString('ko-KR')} (부가세 별도)`, S.bold), null, null, company[3]],
    [txt('지불조건 :', S.bold), estimate.paymentTerms, null, null, company[4]],
    [txt('공급기간 :', S.bold), estimate.supplyPeriod, null, null, company[5]],
    [txt('운반조건 :', S.bold), estimate.delivery],
    [txt('유효기간 :', S.bold), estimate.validity, null, null, `작성일자 : ${year}년 ${Number(month)}월 ${Number(day)}일`],
    [],
    [txt('NO', S.header), txt('품 명 (DESCRIPTION)', S.header), txt('', S.header), txt('수량', S.header), txt('단위', S.header), txt('단 가', S.header), txt('금 액', S.header)],
    [txt('1', S.center), txt(estimate.title), txt(''), num(1, S.decimal), txt('LOT', S.center), num(total), num(total)],
    [txt(`총 합 계 ${cutLabel(estimate.roundTo)}`, S.header), txt('', S.header), txt('', S.header), txt('', S.header), txt('', S.header), txt('', S.header), num(applied, S.boldNumber)],
    [],
    [txt('* REMARK', S.bold)],
    ...estimate.remarks.split(/\r?\n/).filter(line => line.trim()).map((line): XlsxCell[] => [line.trim()]),
  ]
  return { name: '갑지', rows, cols: [11, 30, 8, 8, 8, 16, 18], merges: ['A1:G1', 'B12:C12', 'B13:C13', 'A14:F14'], heights: { 0: 40 } }
}

function costSheetTab(estimate: Estimate, totals: ReturnType<typeof estimateTotals>): XlsxSheet {
  const { sheet } = totals
  const r = estimate.rates
  const share = (value: number) => sheet.total ? Math.round(value / sheet.total * 1000) / 10 : 0
  const line = (group: string, kind: string, name: string, amount: number, note = '', ratio?: number): XlsxCell[] =>
    [txt(group, S.center), txt(kind, S.center), txt(name), dash(amount), ratio === undefined ? txt('') : num(ratio, S.decimal), txt(note)]
  const rows: XlsxCell[][] = [
    [txt('공 사 원 가 계 산 서', S.title)],
    [txt(`■ 품명 : ${estimate.title}`, S.subtitle)],
    [txt('비 목', S.header), txt('구 분', S.header), txt('', S.header), txt('금 액', S.header), txt('구성비 (%)', S.header), txt('비 고', S.header)],
    line('순공사원가', '재료비', '직 접 재 료 비', sheet.directMaterial),
    line('', '', '직 접 경 비', sheet.directExpense),
    line('', '', '소 계', sheet.materialTotal, '내역참조', share(sheet.materialTotal)),
    line('', '노무비', '직 접 노 무 비', sheet.labor),
    line('', '', '소 계', sheet.labor, '', share(sheet.labor)),
    line('', '경비', '산재 보험료', sheet.industrialAccident, `직노×${r.industrialAccident}%`),
    line('', '', '고용 보험료', sheet.employment, `직노×${r.employment}%`),
    line('', '', '건강 보험료', sheet.health, `직노×${r.health}%`),
    line('', '', '연금 보험료', sheet.pension, `직노×${r.pension}%`),
    line('', '', '노인장기 요양보험료', sheet.longTermCare, `건보×${r.longTermCare}%`),
    line('', '', '퇴직공제 부금비', sheet.retirement, `직노×${r.retirement}%`),
    line('', '', '산업안전 보건관리비', sheet.safety, `(재+직노)×${r.safety}%`),
    line('', '', '소 계', sheet.expenseTotal, '', share(sheet.expenseTotal)),
    line('환 경 보 전 비', '', '', sheet.environment, `(재+직노+산출경비)×${r.environment}%`, share(sheet.environment)),
    line('기 타 경 비', '', '', sheet.otherExpense, `(재+노)×${r.otherExpense}%`, share(sheet.otherExpense)),
    line('일 반 관 리 비', '', '', sheet.overhead, `${r.overheadIncludesExpense ? '(재+노+경비)' : '(재+노)'}×${r.overhead}%`, share(sheet.overhead)),
    line('이 윤', '', '', sheet.profit, `(노무비+경비+일반관리비)×${r.profit}%`, share(sheet.profit)),
    [txt('순 공 사 원 가', S.header), txt('', S.header), txt('', S.header), num(sheet.total, S.boldNumber), num(100, S.decimal), txt('')],
    [txt('적 용 총 원 가', S.header), txt('', S.header), txt('', S.header), num(sheet.applied, S.boldNumber), txt(''), txt(cutLabel(estimate.roundTo))],
  ]
  return { name: '원가계산서', rows, cols: [14, 10, 20, 18, 11, 30], merges: ['A1:F1', 'B3:C3', 'A4:A16', 'B4:B6', 'B7:B8', 'B9:B16', 'A17:C17', 'A18:C18', 'A19:C19', 'A20:C20', 'A21:C21', 'A22:C22'], heights: { 0: 36 } }
}

const tableHead: XlsxCell[][] = [
  ['품 명', '규 격', '단위', '수 량', '재 료 비', '', '노 무 비', '', '경 비', '', '합 계', '비고'].map(label => txt(label, S.header)),
  ['', '', '', '', '단 가', '금 액', '단 가', '금 액', '단 가', '금 액', '금 액', ''].map(label => txt(label, S.header)),
]
const tableMerges = (top: number) => [`A${top}:A${top + 1}`, `B${top}:B${top + 1}`, `C${top}:C${top + 1}`, `D${top}:D${top + 1}`, `E${top}:F${top}`, `G${top}:H${top}`, `I${top}:J${top}`, `K${top}:K${top + 1}`, `L${top}:L${top + 1}`]
const tableCols = [26, 24, 7, 8, 12, 14, 12, 14, 11, 13, 15, 12]

function summary(estimate: Estimate, totals: ReturnType<typeof estimateTotals>): XlsxSheet {
  const rows: XlsxCell[][] = [
    [txt('집 계 표', S.title)],
    [txt(`공 사 명 : ${estimate.title}`, S.subtitle)],
    ...tableHead,
    ...totals.sections.map((row, index): XlsxCell[] => [txt(`${index + 1}. ${row.section.name}`), txt(''), txt('LOT', S.center), num(1, S.decimal), dash(row.mat), dash(row.mat), dash(row.lab), dash(row.lab), dash(row.exp), dash(row.exp), num(row.total), txt('')]),
    [txt('합 계', S.header), txt('', S.header), txt('', S.header), txt('', S.header), txt('', S.header), num(totals.mat, S.boldNumber), txt('', S.header), num(totals.lab, S.boldNumber), txt('', S.header), num(totals.exp, S.boldNumber), num(totals.direct, S.boldNumber), txt('', S.header)],
  ]
  return { name: '집계표', rows, cols: tableCols, merges: ['A1:L1', ...tableMerges(3)], heights: { 0: 36 } }
}

function detail(estimate: Estimate, totals: ReturnType<typeof estimateTotals>): XlsxSheet {
  const rows: XlsxCell[][] = [[txt('상 세 내 역 서', S.title)], [txt(`공 사 명 : ${estimate.title}`, S.subtitle)], ...tableHead]
  totals.sections.forEach((row, index) => {
    rows.push([txt(`${index + 1}. ${row.section.name}`, S.boldText), txt(''), txt(''), txt(''), txt(''), dash(row.mat, S.boldNumber), txt(''), dash(row.lab, S.boldNumber), txt(''), dash(row.exp, S.boldNumber), num(row.total, S.boldNumber), txt('')])
    for (const line of row.section.lines) {
      const amounts = lineAmounts(line)
      const price = (cost: number) => cost ? num(quoted(cost, line.markup)) : txt('')
      const amount = (value: number, cost: number) => cost ? num(value) : txt('')
      rows.push([txt(line.name), txt(line.spec), txt(line.unit, S.center), num(line.qty, S.decimal), price(line.matCost), amount(amounts.mat, line.matCost), price(line.labCost), amount(amounts.lab, line.labCost), price(line.expCost), amount(amounts.exp, line.expCost), num(amounts.total), txt('')])
    }
    if (row.misc) rows.push([txt('잡자재비'), txt(`재료비의 ${row.section.miscRate}%`), txt('%', S.center), num(row.section.miscRate, S.decimal), txt(''), num(row.misc), txt(''), txt(''), txt(''), txt(''), num(row.misc), txt('')])
  })
  rows.push([txt('합 계', S.header), txt('', S.header), txt('', S.header), txt('', S.header), txt('', S.header), num(totals.mat, S.boldNumber), txt('', S.header), num(totals.lab, S.boldNumber), txt('', S.header), num(totals.exp, S.boldNumber), num(totals.direct, S.boldNumber), txt('', S.header)])
  return { name: '상세내역서', rows, cols: tableCols, merges: ['A1:L1', ...tableMerges(3)], heights: { 0: 36 } }
}

/** Internal sheet: 원가, 배율 and what the estimate leaves after 원가. Never for the client. */
function costAnalysis(estimate: Estimate, totals: ReturnType<typeof estimateTotals>): XlsxSheet {
  const rows: XlsxCell[][] = [
    [txt('원가 분석 (내부용)', S.title)],
    [txt(`공 사 명 : ${estimate.title}`, S.subtitle)],
    ['품 명', '규 격', '구분', '수 량', '원가 단가', '배율', '견적 단가', '원가 금액', '견적 금액', '차액'].map(label => txt(label, S.header)),
  ]
  for (const row of totals.sections) {
    rows.push([txt(row.section.name, S.boldText), txt(''), txt(''), txt(''), txt(''), txt(''), txt(''), num(row.cost, S.boldNumber), num(row.total, S.boldNumber), num(row.total - row.cost, S.boldNumber)])
    for (const line of row.section.lines) {
      const amounts = lineAmounts(line)
      const unitCost = line.matCost + line.labCost + line.expCost
      rows.push([txt(line.name), txt(line.spec), txt(line.grade, S.center), num(line.qty, S.decimal), num(unitCost), num(line.markup, S.decimal), num(quoted(line.matCost, line.markup) + quoted(line.labCost, line.markup) + quoted(line.expCost, line.markup)), num(amounts.cost), num(amounts.total), num(amounts.total - amounts.cost)])
    }
  }
  rows.push([], [txt('원가 합계', S.bold), null, null, null, null, null, null, num(totals.cost, S.boldNumber)])
  rows.push([txt('배율로 붙은 금액', S.bold), null, null, null, null, null, null, num(totals.markupAmount, S.boldNumber)])
  rows.push([txt('원가계산서로 붙은 금액 (절사 후)', S.bold), null, null, null, null, null, null, num(totals.sheetAmount, S.boldNumber)])
  rows.push([txt('견적 총액', S.bold), null, null, null, null, null, null, num(totals.sheet.applied, S.boldNumber)])
  rows.push([txt('예상 이익 / 이익률', S.bold), null, null, null, null, null, null, num(totals.margin, S.boldNumber), txt(`${(totals.marginRate * 100).toFixed(1)}%`, S.center)])
  return { name: '원가분석(내부용)', rows, cols: [26, 24, 7, 8, 12, 7, 12, 14, 14, 13], merges: ['A1:J1'], heights: { 0: 36 } }
}

export function estimateWorkbook(estimate: Estimate, options: { includeCost?: boolean } = {}) {
  const totals = estimateTotals(estimate)
  const sheets = [cover(estimate, totals.sheet.applied, totals.sheet.total), costSheetTab(estimate, totals), summary(estimate, totals), detail(estimate, totals)]
  if (options.includeCost) sheets.push(costAnalysis(estimate, totals))
  return buildXlsx(sheets)
}

export function downloadEstimate(estimate: Estimate, options: { includeCost?: boolean } = {}) {
  const bytes = estimateWorkbook(estimate, options)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  const name = `${estimate.client ? `${estimate.client}_` : ''}${estimate.title || '견적서'}_${estimate.no}${options.includeCost ? '_원가분석' : ''}`.replace(/[\\/:*?"<>|]/g, ' ')
  link.href = url
  link.download = `${name}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
