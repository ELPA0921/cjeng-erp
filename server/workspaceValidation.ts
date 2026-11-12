import { cardAccountingStatuses, type WorkspaceData } from '../src/workspaceTypes.ts'
import { costKinds, grades, quoteGrades, steelShapes } from '../src/estimateTypes.ts'
import { packWorkspace, unpackExpense, unpackWorkLog } from './workspaceCodec.ts'

const vendorFields = ['company','contact','mobile','tel','fax','email','address','item']
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('자료 형식을 확인하세요.')
  return value as Record<string, unknown>
}
function text(value: unknown, required = false) {
  if (typeof value !== 'string' || value.length > 10000 || (required && !value.trim())) throw new Error('문자 항목을 확인하세요.')
  return value
}
function day(value: unknown) {
  const result = text(value, true)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0,10) !== result) throw new Error('날짜 형식을 확인하세요.')
}
function rows(value: unknown) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('자료 건수를 확인하세요.')
  const ids = new Set<string>()
  return value.map(item => {
    const row = object(item), id = text(row.id, true)
    if (ids.has(id)) throw new Error('중복된 내부 ID가 있습니다.')
    ids.add(id)
    return row
  })
}
function records(value: unknown, strings: string[], numbers: string[], required: string[], dates: string[]) {
  return rows(value).map(row => {
    const next: Record<string, string | number> = {id:text(row.id,true)}
    for (const field of strings) {
      if (row[field] !== undefined) next[field] = text(row[field], required.includes(field) && ['projectId','date','orderDate','kind','vendor','worker','workerType','task','item','status'].includes(field))
      else if (required.includes(field)) throw new Error('필수 항목을 확인하세요.')
    }
    for (const field of numbers) {
      const cell = row[field]
      if (cell !== undefined && (typeof cell !== 'number' || !Number.isFinite(cell) || Math.abs(cell) > 1e15)) throw new Error('숫자 항목을 확인하세요.')
      if (cell !== undefined) next[field] = cell as number
      else if (required.includes(field)) throw new Error('필수 금액·시간을 확인하세요.')
    }
    for (const field of dates) day(next[field])
    return next
  })
}
function vendor(value: unknown) {
  const row=object(value)
  return Object.fromEntries(vendorFields.map(field=>[field,text(row[field],field==='company')]))
}
function vendorList(value: unknown) {
  if (!Array.isArray(value) || value.length>10000) throw new Error('거래처 목록을 확인하세요.')
  return value.map(vendor)
}
function keys(value: unknown) {
  if (!Array.isArray(value) || value.length>20000) throw new Error('거래처 상태를 확인하세요.')
  return [...new Set(value.map(item=>text(item,true)))]
}
function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) throw new Error(`${label} 숫자를 확인하세요.`)
  return value
}
function rates(value: unknown) {
  const row = object(value)
  const result: Record<string, number | boolean> = {}
  for (const field of ['industrialAccident', 'employment', 'health', 'pension', 'longTermCare', 'retirement', 'safety', 'environment', 'otherExpense', 'overhead', 'profit']) result[field] = finite(row[field], '원가계산서 요율')
  result.overheadIncludesExpense = row.overheadIncludesExpense === true
  return result
}
function estimateItems(value: unknown) {
  const items = records(value ?? [], ['category', 'name', 'spec', 'unit', 'kind', 'shape', 'vendor', 'priceDate', 'note'], ['kgPerUnit', 'costGeneral', 'costStainless', 'expense', 'markup'], ['name', 'kind', 'markup'], [])
  for (const item of items) {
    if (!(costKinds as readonly string[]).includes(String(item.kind)) || (item.shape !== undefined && !(steelShapes as readonly string[]).includes(String(item.shape)))) throw new Error('단가표 항목을 확인하세요.')
    if (!String(item.name).trim()) throw new Error('단가표 품명을 확인하세요.')
    if (item.priceDate) day(item.priceDate)
  }
  return items
}
function estimates(value: unknown) {
  return rows(value ?? []).map(row => {
    if (JSON.stringify(row).length > 500000) throw new Error('견적서가 너무 큽니다.')
    const result: Record<string, unknown> = {}
    for (const field of ['id', 'no', 'title', 'client', 'date', 'paymentTerms', 'supplyPeriod', 'delivery', 'validity', 'remarks', 'grade', 'updatedAt']) result[field] = text(row[field], field === 'id')
    day(result.date)
    if (!(grades as readonly string[]).includes(String(result.grade))) throw new Error('견적서 구분(일반/스텐)을 확인하세요.')
    result.roundTo = finite(row.roundTo, '절사 단위')
    result.rates = rates(row.rates)
    if (!Array.isArray(row.sections) || row.sections.length > 200) throw new Error('견적서 구간을 확인하세요.')
    result.sections = row.sections.map(item => {
      const section = object(item)
      if (!Array.isArray(section.lines) || section.lines.length > 2000) throw new Error('견적서 품목을 확인하세요.')
      return {
        id: text(section.id, true), name: text(section.name), miscRate: finite(section.miscRate, '잡자재비'),
        lines: section.lines.map(entry => {
          const line = object(entry)
          if (!(grades as readonly string[]).includes(String(line.grade))) throw new Error('견적서 품목의 일반/스텐을 확인하세요.')
          return {
            id: text(line.id, true), ...(line.itemId !== undefined ? { itemId: text(line.itemId) } : {}),
            name: text(line.name), spec: text(line.spec), unit: text(line.unit), grade: line.grade,
            qty: finite(line.qty, '수량'), matCost: finite(line.matCost, '재료비'), labCost: finite(line.labCost, '노무비'), expCost: finite(line.expCost, '경비'), markup: finite(line.markup, '배율'),
          }
        }),
      }
    })
    return result
  })
}
function estimateSettings(value: unknown) {
  if (value === undefined || value === null) return {}
  const row = object(value)
  const result: Record<string, unknown> = {}
  if (row.kgPrices !== undefined) {
    const prices = object(row.kgPrices)
    result.kgPrices = Object.fromEntries(grades.flatMap(grade => steelShapes.map(shape => [`${grade}${shape}`, finite(prices[`${grade}${shape}`], 'kg 단가')])))
  }
  if (row.rates !== undefined) result.rates = rates(row.rates)
  if (row.kgNote !== undefined) result.kgNote = text(row.kgNote)
  return result
}
function materialQuotes(value: unknown) {
  return rows(value ?? []).map(row => {
    if (JSON.stringify(row).length > 500000) throw new Error('업체 견적이 너무 큽니다.')
    const result: Record<string, unknown> = {}
    for (const field of ['id', 'date', 'vendor', 'quoteNo', 'memo', 'updatedAt']) result[field] = text(row[field], field === 'id')
    day(result.date)
    if (!Array.isArray(row.lines) || row.lines.length > 2000) throw new Error('업체 견적 품목을 확인하세요.')
    result.lines = row.lines.map(entry => {
      const line = object(entry)
      if (!(quoteGrades as readonly string[]).includes(String(line.grade)) || !(costKinds as readonly string[]).includes(String(line.kind))) throw new Error('업체 견적 품목의 구분을 확인하세요.')
      if (!text(line.name).trim()) throw new Error('업체 견적 품명을 확인하세요.')
      return {
        id: text(line.id, true), ...(line.itemId !== undefined ? { itemId: text(line.itemId) } : {}),
        category: text(line.category), name: text(line.name), spec: text(line.spec), unit: text(line.unit), kind: line.kind, grade: line.grade,
        ...(line.qty !== undefined ? { qty: finite(line.qty, '수량') } : {}), price: finite(line.price, '단가'), note: text(line.note),
      }
    })
    return result
  })
}

export const workspaceCollections = ['expenses', 'workLogs', 'purchases', 'deliveries', 'cardAccounting', 'estimateItems', 'estimates', 'materialQuotes', 'researchProjects'] as const
export const workspaceSettings = ['inactiveVendorKeys', 'deletedVendorKeys', 'vendorEdits', 'customVendorContacts', 'estimateSettings'] as const
export type WorkspaceCollection = typeof workspaceCollections[number]
export type WorkspaceSetting = typeof workspaceSettings[number]

/** Validates one list of rows (whole collection or just the rows being saved). */
export function validateCollection(name: WorkspaceCollection, value: unknown) {
  if (name === 'expenses') {
    const rows = Array.isArray(value) ? value.map(unpackExpense) : value
    const expenses=records(rows,['projectId','date','kind','vendor','category','memo','cardNumber','note'],['supplyAmount','vatAmount','amount','sequence'],['projectId','date','kind','vendor','memo','amount'],['date'])
    for (const expense of expenses) if (expense.kind === '세금계산서') expense.kind = '전자세금계산서'
    return expenses
  }
  if (name === 'workLogs') {
    const rows = Array.isArray(value) ? value.map(unpackWorkLog) : value
    const workLogs=records(rows,['projectId','date','worker','workerType','startTime','endTime','location','task','note'],['overtimeHours','hours'],['projectId','date','worker','workerType','startTime','endTime','location','task','note','overtimeHours','hours'],['date'])
    for (const row of workLogs) {
      if (!['직원','인력'].includes(String(row.workerType)) || !/^\d{2}:\d{2}$/.test(String(row.startTime)) || !/^\d{2}:\d{2}$/.test(String(row.endTime)) || Number(row.hours)<0 || Number(row.overtimeHours)<0) throw new Error('작업일보 항목을 확인하세요.')
    }
    return workLogs
  }
  if (name === 'purchases') {
    const dates=['quoteDate','orderDate','completedDate']
    const purchases=records(value,['projectId',...dates,'vendor','manager','item','note'],['amount'],['projectId'],[])
    for (const row of purchases) {
      for (const field of [...dates,'vendor','manager','item','note']) row[field] ??= ''
      for (const field of dates) if (row[field]) day(row[field])
    }
    return purchases
  }
  if (name === 'deliveries') {
    const deliveries=records(value,['date','client','company','address','item','specification','airflow','note'],[],['date','item'],['date'])
    for (const row of deliveries) for (const field of ['client','company','address','specification','airflow','note']) row[field] ??= ''
    return deliveries
  }
  if (name === 'estimateItems') return estimateItems(value)
  if (name === 'estimates') return estimates(value)
  if (name === 'materialQuotes') return materialQuotes(value)
  if (name === 'researchProjects') {
    // 연구비 numbers are 269NN (26901–26999), each used once.
    const projects=records(value ?? [],['orderNo','name'],[],['orderNo','name'],[])
    const numbers=new Set<string>()
    for (const row of projects) {
      const orderNo=String(row.orderNo).trim()
      if (!/^\d{2}9\d{2}$/.test(orderNo) || orderNo.endsWith('900') || !String(row.name).trim() || numbers.has(orderNo)) throw new Error('연구비 번호와 연구명을 확인하세요.')
      numbers.add(orderNo)
    }
    return projects
  }
  // Older shared snapshots predate card accounting, so a missing list means nothing has been posted yet.
  const cardAccounting=records(value ?? [],['status','orderNo','memo','expenseId','updatedAt'],[],['status','orderNo','memo','updatedAt'],[])
  for (const row of cardAccounting) if (!(cardAccountingStatuses as readonly string[]).includes(String(row.status))) throw new Error('회계반영 상태를 확인하세요.')
  return cardAccounting
}

export function validateSetting(name: WorkspaceSetting, value: unknown) {
  if (name === 'inactiveVendorKeys' || name === 'deletedVendorKeys') return keys(value)
  if (name === 'estimateSettings') return estimateSettings(value)
  if (name === 'vendorEdits') {
    const edits=object(value)
    if (Object.keys(edits).length>20000) throw new Error('거래처 수정 자료가 너무 많습니다.')
    return Object.fromEntries(Object.entries(edits).map(([key,row])=>[text(key,true),vendor(row)]))
  }
  const custom=object(value)
  return {purchase:vendorList(custom.purchase),order:vendorList(custom.order)}
}

export function validateWorkspace(value: unknown): WorkspaceData {
  const input=object(value)
  const result = {
    ...Object.fromEntries(workspaceCollections.map(name => [name, validateCollection(name, input[name])])),
    ...Object.fromEntries(workspaceSettings.map(name => [name, validateSetting(name, input[name])])),
  } as WorkspaceData
  return result
}

/** The Google Sheets store keeps everything in one cell range with a fixed size limit. */
export function checkSheetsSize(data: WorkspaceData) {
  if (JSON.stringify(packWorkspace(data)).length > 1500000) throw new Error('공유 자료가 너무 큽니다.')
}
