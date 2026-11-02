import { cardAccountingStatuses, type WorkspaceData } from '../src/workspaceTypes.ts'
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
export const workspaceCollections = ['expenses', 'workLogs', 'purchases', 'deliveries', 'cardAccounting'] as const
export const workspaceSettings = ['inactiveVendorKeys', 'deletedVendorKeys', 'vendorEdits', 'customVendorContacts'] as const
export type WorkspaceCollection = typeof workspaceCollections[number]
export type WorkspaceSetting = typeof workspaceSettings[number]

/** Validates one list of rows (whole collection or just the rows being saved). */
export function validateCollection(name: WorkspaceCollection, value: unknown) {
  if (name === 'expenses') {
    const rows = Array.isArray(value) ? value.map(unpackExpense) : value
    const expenses=records(rows,['projectId','date','kind','vendor','category','memo','cardNumber'],['supplyAmount','vatAmount','amount','sequence'],['projectId','date','kind','vendor','memo','amount'],['date'])
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
  // Older shared snapshots predate card accounting, so a missing list means nothing has been posted yet.
  const cardAccounting=records(value ?? [],['status','orderNo','memo','expenseId','updatedAt'],[],['status','orderNo','memo','updatedAt'],[])
  for (const row of cardAccounting) if (!(cardAccountingStatuses as readonly string[]).includes(String(row.status))) throw new Error('회계반영 상태를 확인하세요.')
  return cardAccounting
}

export function validateSetting(name: WorkspaceSetting, value: unknown) {
  if (name === 'inactiveVendorKeys' || name === 'deletedVendorKeys') return keys(value)
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
