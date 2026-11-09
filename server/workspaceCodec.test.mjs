import { test } from 'node:test'
import assert from 'node:assert/strict'
import { packWorkspace, unpackExpense } from './workspaceCodec.ts'
import { validateCollection, validateWorkspace } from './workspaceValidation.ts'

const log = { id:'w1', projectId:'work-unassigned', date:'2023-01-05', worker:'작업자', workerType:'인력', startTime:'07:30', endTime:'11:30', overtimeHours:0, location:'인천공장', task:'배관 보수', note:'원본 공사 보존', hours:4 }
const data = { expenses:[], workLogs:[log], purchases:[], deliveries:[], inactiveVendorKeys:[], deletedVendorKeys:[], vendorEdits:{}, customVendorContacts:{purchase:[],order:[]}, cardAccounting:[], estimateItems:[], estimates:[], materialQuotes:[], estimateSettings:{} }

test('compact work logs round-trip all fields and retain legacy object support', () => {
  assert.deepEqual(validateWorkspace(packWorkspace(data)), data)
  assert.deepEqual(validateWorkspace(data), data)
  assert.ok(JSON.stringify(packWorkspace(data)).length < JSON.stringify(data).length)
})

test('compact data still rejects invalid dates, types, duplicate IDs and malformed tuples', () => {
  for (const change of [{date:'2023-02-30'}, {hours:'4'}, {workerType:'알수없음'}]) {
    assert.throws(() => validateWorkspace(packWorkspace({...data,workLogs:[{...log,...change}]})))
  }
  assert.throws(() => validateWorkspace(packWorkspace({...data,workLogs:[log,log]})))
  assert.throws(() => validateWorkspace({...data,workLogs:[['incomplete']]}))
})

test('compact expenses round-trip required and optional fields and stay much smaller', () => {
  const full = { id:'e1', projectId:'admin-2026', date:'2026-10-02', kind:'법인카드', vendor:'오피스디포', memo:'', amount:33000, supplyAmount:30000, vatAmount:3000, cardNumber:'3888', category:'사무' }
  const bare = { id:'e2', projectId:'o-1', date:'2026-10-03', kind:'기타', vendor:'현금', memo:'메모, "인용"', amount:-500 }
  const withCard = { id:'e3', projectId:'o-1', date:'2026-10-04', kind:'개인카드', vendor:'식당', memo:'', amount:1000, cardNumber:'김해운' }
  const withExpenses = { ...data, expenses:[full, bare, withCard] }
  const packed = packWorkspace(withExpenses)
  assert.deepEqual(packed.expenses[1], ['e2','o-1','2026-10-03','기타','현금','메모, "인용"',-500])
  assert.deepEqual(validateWorkspace(packed), withExpenses)
  assert.deepEqual(validateWorkspace(withExpenses), withExpenses)
  assert.ok(JSON.stringify(packed.expenses).length < JSON.stringify(withExpenses.expenses).length * 0.65)
  assert.throws(() => validateWorkspace({ ...data, expenses:[['e1','o-1','2026-10-01']] }), /지출내역 저장 형식/)
  assert.throws(() => validateWorkspace(packWorkspace({ ...data, expenses:[{ ...bare, date:'2026-02-30' }] })))
})

test('an arranged expense keeps its same-date sequence through packing and validation', () => {
  const arranged = { id:'e4', projectId:'o-1', date:'2026-10-26', kind:'전자세금계산서', vendor:'서강테크', memo:'', amount:1000, sequence:2 }
  const withSequence = { ...data, expenses:[arranged] }
  assert.deepEqual(validateWorkspace(packWorkspace(withSequence)), withSequence)
  assert.throws(() => validateWorkspace({ ...data, expenses:[{ ...arranged, sequence:'2' }] }))
})

test('a 발주 및 견적 현황 line may leave its dates and amount blank, but a filled date must be real', () => {
  const quote = { id:'p1', projectId:'o-1', quoteDate:'2023-09-01', orderDate:'', completedDate:'', vendor:'케이디엠에스', manager:'김용선', item:'TOC 자동측정기', note:'' }
  assert.deepEqual(validateWorkspace({ ...data, purchases:[quote] }).purchases, [quote])
  assert.deepEqual(validateWorkspace({ ...data, purchases:[{ id:'p2', projectId:'o-1', amount:1000 }] }).purchases, [{ id:'p2', projectId:'o-1', amount:1000, quoteDate:'', orderDate:'', completedDate:'', vendor:'', manager:'', item:'', note:'' }])
  assert.throws(() => validateWorkspace({ ...data, purchases:[{ ...quote, orderDate:'23.04.25' }] }))
  assert.throws(() => validateWorkspace({ ...data, purchases:[{ ...quote, amount:'1,000' }] }))
})

test('an expense 비고 survives packing, unpacking and validation', () => {
  const expense = { id: 'e1', projectId: 'p1', date: '2026-11-09', kind: '법인카드', vendor: '다일전기', memo: '전선', amount: 1100, note: '학운점' }
  const [row] = packWorkspace({ expenses: [expense], workLogs: [] }).expenses
  assert.deepEqual(unpackExpense(row), expense)
  assert.deepEqual(validateCollection('expenses', [row]), [expense])
})
