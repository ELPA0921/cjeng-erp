import type { WorkspaceData } from '../src/workspaceTypes.ts'

// Store repeated field names once in code, while the API keeps named objects.
const fields = ['id', 'projectId', 'date', 'worker', 'workerType', 'startTime', 'endTime', 'overtimeHours', 'location', 'task', 'note', 'hours'] as const
// Optional expense fields come last so empty trailing slots can be dropped.
const expenseFields = ['id', 'projectId', 'date', 'kind', 'vendor', 'memo', 'amount', 'supplyAmount', 'vatAmount', 'cardNumber', 'category', 'sequence', 'note'] as const
const requiredExpenseFields = 7

export function unpackWorkLog(row: unknown): unknown {
  if (!Array.isArray(row)) return row
  if (row.length !== fields.length) throw new Error('작업일보 저장 형식을 확인하세요.')
  return Object.fromEntries(fields.map((key, index) => [key, row[index]]))
}

export function unpackExpense(row: unknown): unknown {
  if (!Array.isArray(row)) return row
  if (row.length < requiredExpenseFields || row.length > expenseFields.length) throw new Error('지출내역 저장 형식을 확인하세요.')
  return Object.fromEntries(expenseFields.flatMap((key, index) => row[index] === null || row[index] === undefined ? [] : [[key, row[index]]]))
}

function packExpense(expense: WorkspaceData['expenses'][number]) {
  const row: unknown[] = expenseFields.map(key => expense[key] ?? null)
  while (row.length > requiredExpenseFields && row[row.length - 1] === null) row.pop()
  return row
}

export function packWorkspace(data: WorkspaceData) {
  return { ...data, expenses: data.expenses.map(packExpense), workLogs: data.workLogs.map(row => fields.map(key => row[key])) }
}
