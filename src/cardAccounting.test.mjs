import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCardAccounting, cardExpenseId, cardPostingSource, findOrder, invalidOrderRows, missingOrderMessage } from './cardAccounting.ts'

const orders = [{ id: 'o-1', orderNo: '26006', projectName: '공사' }, { id: 'o-2', orderNo: '26007', projectName: '다른 공사' }]
const approval = { id: 'approval-1', dateTime: '2026-10-05 09:10:44', approvalType: '승인', approvalNumber: '1', store: '주유소', storeNumber: '', amount: 88000, currency: 'KRW', supplyAmount: 0, vatAmount: 8000, serviceCharge: 0, memo: '', cardNumber: '3888' }
const row = cardPostingSource(approval)
const empty = { cardAccounting: [], expenses: [], orders }

test('order numbers must match the order ledger exactly after trimming', () => {
  assert.equal(findOrder(orders, ' 26006 ')?.id, 'o-1')
  assert.equal(findOrder(orders, ''), undefined)
  assert.equal(findOrder(orders, '2600'), undefined)
  const inputs = [{ row, status: '회계반영', orderNo: '99999', memo: '' }, { row: { ...row, id: 'b' }, status: '강제회계반영', orderNo: '', memo: '' }]
  assert.deepEqual(invalidOrderRows(inputs, orders), ['approval-1'])
  assert.throws(() => applyCardAccounting(inputs, empty), { message: missingOrderMessage })
})

test('posting creates one card expense on the order and re-posting updates it in place', () => {
  const first = applyCardAccounting([{ row, status: '회계반영', orderNo: '26006', memo: ' 유류비 ' }], empty, 'T1')
  assert.deepEqual(first.cardAccounting, [{ id: 'approval-1', status: '회계반영', orderNo: '26006', memo: '유류비', updatedAt: 'T1', expenseId: cardExpenseId('approval-1') }])
  assert.deepEqual(first.expenses, [{ id: cardExpenseId('approval-1'), projectId: 'o-1', date: '2026-10-05', kind: '법인카드', vendor: '주유소', memo: '유류비', cardNumber: '3888', supplyAmount: 80000, vatAmount: 8000, amount: 88000 }])
  const withCategory = { ...first, expenses: [{ ...first.expenses[0], category: '유류' }], orders }
  const moved = applyCardAccounting([{ row, status: '회계반영', orderNo: '26007', memo: '수정' }], withCategory, 'T2')
  assert.equal(moved.expenses.length, 1)
  assert.equal(moved.expenses[0].projectId, 'o-2')
  assert.equal(moved.expenses[0].memo, '수정')
  assert.equal(moved.expenses[0].category, '유류')
})

test('forced posting and reverting remove the linked expense but keep other expenses', () => {
  const other = { id: 'manual', projectId: 'o-1', date: '2026-10-01', kind: '현금', vendor: 'x', memo: '', amount: 1 }
  const posted = applyCardAccounting([{ row, status: '회계반영', orderNo: '26006', memo: '' }], { ...empty, expenses: [other] }, 'T1')
  const forced = applyCardAccounting([{ row, status: '강제회계반영', orderNo: '', memo: '' }], { ...posted, orders }, 'T2')
  assert.deepEqual(forced.expenses, [other])
  assert.deepEqual(forced.cardAccounting, [{ id: 'approval-1', status: '강제회계반영', orderNo: '', memo: '', updatedAt: 'T2' }])
  const reverted = applyCardAccounting([{ row, status: '미반영', orderNo: '', memo: '' }], { ...posted, orders })
  assert.deepEqual(reverted, { cardAccounting: [], expenses: [other] })
})

test('tax invoices post as 전자세금계산서 expenses without a card number', () => {
  const invoice = { id: 'inv-1', date: '2026-10-07', vendor: '연일종합철강(주)', supplyAmount: 1000000, vatAmount: 100000, amount: 1100000, kind: '전자세금계산서', cardNumber: '' }
  const posted = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '26006', memo: '철판' }], empty, 'T1')
  assert.deepEqual(posted.expenses, [{ id: 'tax-inv-1', projectId: 'o-1', date: '2026-10-07', kind: '전자세금계산서', vendor: '연일종합철강(주)', memo: '철판', supplyAmount: 1000000, vatAmount: 100000, amount: 1100000 }])
  assert.equal(posted.cardAccounting[0].expenseId, 'tax-inv-1')
})

test('YY000 order numbers post to that year\'s 관리비 without a 수주대장 entry', () => {
  assert.equal(findOrder(orders, '26000')?.id, 'admin-2026')
  assert.equal(findOrder(orders, '23000')?.projectName, '2023년 관리비 지출내역')
  assert.equal(findOrder(orders, '26001'), undefined)
  assert.deepEqual(invalidOrderRows([{ row, status: '회계반영', orderNo: '25000', memo: '' }], orders), [])
  const posted = applyCardAccounting([{ row, status: '회계반영', orderNo: '26000', memo: '사무용품' }], empty, 'T1')
  assert.equal(posted.expenses[0].projectId, 'admin-2026')
  assert.equal(posted.cardAccounting[0].orderNo, '26000')
})

test('deleting a posted expense returns its row to 미반영 and editing keeps the posting in step', async () => {
  const { unlinkDeletedExpenses, syncEditedExpense } = await import('./cardAccounting.ts')
  const posted = applyCardAccounting([{ row, status: '회계반영', orderNo: '26000', memo: '사무용품' }], empty, 'T1')
  const forced = { id: 'f', status: '강제회계반영', orderNo: '', memo: '', updatedAt: 'T1' }
  const all = [...posted.cardAccounting, forced]
  assert.deepEqual(unlinkDeletedExpenses(all, new Set([posted.expenses[0].id])), [forced])
  assert.deepEqual(unlinkDeletedExpenses(all, new Set(['other'])), all)
  const edited = syncEditedExpense(all, { id: posted.expenses[0].id, memo: ' 문구류 ' }, '26006', 'T2')
  assert.deepEqual(edited[0], { ...posted.cardAccounting[0], orderNo: '26006', memo: '문구류', updatedAt: 'T2' })
  assert.deepEqual(edited[1], forced)
})

test('분할 회계반영 shares one invoice over several orders and the shares add up exactly', async () => {
  const { splitAmounts, splitError, withSplitSiblings, unlinkDeletedExpenses, syncEditedExpense, entryOrderNos } = await import('./cardAccounting.ts')
  const invoice = { id: 'inv-9', date: '2026-11-13', vendor: '대한카고크레인', supplyAmount: 1400000, vatAmount: 140000, amount: 1540000, kind: '전자세금계산서', cardNumber: '' }
  assert.deepEqual(splitAmounts({ supplyAmount: 1000, vatAmount: 100, amount: 1100 }, [333, 333, 334]), [
    { supplyAmount: 333, vatAmount: 33, amount: 366 }, { supplyAmount: 333, vatAmount: 33, amount: 366 }, { supplyAmount: 334, vatAmount: 34, amount: 368 },
  ])
  assert.match(splitError(invoice, [{ orderNo: '26006', memo: '', supplyAmount: 700000 }, { orderNo: '26007', memo: '', supplyAmount: 600000 }], orders), /맞지 않습니다/)
  assert.equal(splitError(invoice, [{ orderNo: '26006', memo: '', supplyAmount: 700000 }, { orderNo: '99999', memo: '', supplyAmount: 700000 }], orders), missingOrderMessage)
  assert.deepEqual(invalidOrderRows([{ row: invoice, status: '회계반영', orderNo: '', memo: '', splits: [{ orderNo: '26006', memo: '', supplyAmount: 1 }, { orderNo: '99999', memo: '', supplyAmount: 1 }] }], orders), ['inv-9'])

  // An earlier single posting is replaced by the shares.
  const single = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '26006', memo: '김포' }], empty, 'T1')
  const splits = [{ orderNo: '26006', memo: '김포 1일', supplyAmount: 600000 }, { orderNo: '26007', memo: '진영 1일', supplyAmount: 800000 }]
  const split = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '26006', memo: '김포', splits }], { ...single, orders }, 'T2')
  assert.deepEqual(split.expenses.map(e => [e.id, e.projectId, e.memo, e.supplyAmount, e.vatAmount, e.amount]), [
    ['tax-inv-9-1', 'o-1', '김포 1일', 600000, 60000, 660000], ['tax-inv-9-2', 'o-2', '진영 1일', 800000, 80000, 880000],
  ])
  const entry = split.cardAccounting[0]
  assert.equal(entry.expenseId, undefined)
  assert.equal(entry.orderNo, '26006, 26007')
  assert.equal(entry.memo, '김포 1일 / 진영 1일')
  assert.deepEqual(entryOrderNos(entry), ['26006', '26007'])

  // Deleting one share takes the other along and sends the invoice back to 미반영.
  const all = withSplitSiblings(split.cardAccounting, new Set(['tax-inv-9-2']))
  assert.deepEqual([...all].sort(), ['tax-inv-9-1', 'tax-inv-9-2'])
  assert.deepEqual(unlinkDeletedExpenses(split.cardAccounting, all), [])

  // Editing a share in 지출내역 keeps the split in step.
  const edited = syncEditedExpense(split.cardAccounting, { id: 'tax-inv-9-2', memo: '진영', supplyAmount: 800000 }, '26000', 'T3')[0]
  assert.equal(edited.splits[1].orderNo, '26000')
  assert.equal(edited.orderNo, '26006, 26000')

  // Undoing the split goes back to one expense; 미반영 removes every share.
  const merged = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '26007', memo: '합침' }], { ...split, orders }, 'T4')
  assert.deepEqual(merged.expenses.map(e => [e.id, e.projectId, e.amount]), [['tax-inv-9', 'o-2', 1540000]])
  assert.equal(merged.cardAccounting[0].splits, undefined)
  const reverted = applyCardAccounting([{ row: invoice, status: '미반영', orderNo: '', memo: '' }], { ...split, orders })
  assert.deepEqual(reverted, { cardAccounting: [], expenses: [] })
})

test('지출 대조 posts a month\'s invoice onto the expenses entered by hand, keeping them', async () => {
  const { applyInvoiceMatch, matchTotals, withSplitSiblings, unlinkDeletedExpenses } = await import('./cardAccounting.ts')
  const invoice = { id: 'inv-m', date: '2026-10-31', vendor: '(주)승우레이져', supplyAmount: 100000, vatAmount: 10000, amount: 110000, kind: '전자세금계산서', cardNumber: '' }
  const handA = { id: 'hand-a', projectId: 'o-1', date: '2026-10-05', kind: '전자세금계산서', vendor: '승우레이져', memo: 'STS 가공', supplyAmount: 30000, vatAmount: 3000, amount: 33000, sequence: 2 }
  const handB = { id: 'hand-b', projectId: 'o-2', date: '2026-10-20', kind: '현금', vendor: '승우 레이져', memo: '벤딩', cardNumber: '1234', amount: 55000 }
  const lines = [
    { expenseId: 'hand-a', date: handA.date, orderNo: '26006', memo: 'STS 가공', supplyAmount: 30000, amount: 33000 },
    { expenseId: 'hand-b', date: handB.date, orderNo: '26007', memo: '벤딩', supplyAmount: 50000, amount: 55000 },
  ]
  // 20,000 short: the window shows the gap and saving is refused.
  assert.equal(matchTotals(invoice, lines).supplyDiff, -20000)
  assert.equal(matchTotals(invoice, lines).matches, false)
  assert.throws(() => applyInvoiceMatch(invoice, lines, { cardAccounting: [], expenses: [handA, handB], orders }), /맞지 않습니다/)

  // A missing line is added for 26006; now it matches.
  const full = [...lines, { date: '2026-10-28', orderNo: '26006', memo: '추가 가공', supplyAmount: 20000, amount: 22000 }]
  assert.equal(matchTotals(invoice, full).matches, true)
  const posted = applyInvoiceMatch(invoice, full, { cardAccounting: [], expenses: [handA, handB], orders }, 'T1')
  const byId = Object.fromEntries(posted.expenses.map(e => [e.id, e]))
  assert.deepEqual(byId['hand-a'], { ...handA, kind: '전자세금계산서', vendor: '(주)승우레이져', vatAmount: 3000, amount: 33000 })
  assert.equal(byId['hand-b'].date, '2026-10-20')
  assert.equal(byId['hand-b'].projectId, 'o-2')
  assert.equal(byId['hand-b'].cardNumber, undefined)
  assert.equal(byId['hand-b'].kind, '전자세금계산서')
  assert.equal(byId['tax-inv-m-m3'].projectId, 'o-1')
  assert.equal(byId['tax-inv-m-m3'].date, '2026-10-28')
  assert.equal(posted.expenses.reduce((sum, e) => sum + e.amount, 0), 110000)
  const entry = posted.cardAccounting[0]
  assert.equal(entry.mode, '대조')
  assert.equal(entry.orderNo, '26006, 26007')
  assert.deepEqual(entry.splits.map(s => s.expenseId), ['hand-a', 'hand-b', 'tax-inv-m-m3'])

  // Deleting one matched expense leaves the others and unlinks the invoice.
  const gone = withSplitSiblings(posted.cardAccounting, new Set(['hand-a']))
  assert.deepEqual([...gone], ['hand-a'])
  assert.deepEqual(unlinkDeletedExpenses(posted.cardAccounting, gone), [])

  // Sending a matched invoice back to 미반영 keeps every hand-entered expense.
  const reverted = applyCardAccounting([{ row: invoice, status: '미반영', orderNo: '', memo: '' }], { ...posted, orders })
  assert.deepEqual(reverted.cardAccounting, [])
  assert.equal(reverted.expenses.length, 3)

  // Saving the 수정 window unchanged keeps the same expenses and their days.
  const resaved = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: entry.orderNo, memo: entry.memo, splits: entry.splits.map(({ orderNo, memo, supplyAmount }) => ({ orderNo, memo, supplyAmount })) }], { ...posted, orders }, 'T2')
  assert.deepEqual(resaved.expenses.map(e => [e.id, e.date]).sort(), posted.expenses.map(e => [e.id, e.date]).sort())
  assert.equal(resaved.cardAccounting[0].mode, '대조')

  // An expense already linked to another invoice cannot be counted twice.
  assert.throws(() => applyInvoiceMatch({ ...invoice, id: 'inv-other' }, full, { ...posted, orders }), /이미 반영된/)
})

test('지출 대조 also matches on 합계 when per-line 부가세 rounding moves 공급가액', async () => {
  const { applyInvoiceMatch } = await import('./cardAccounting.ts')
  const invoice = { id: 'inv-r', date: '2026-10-31', vendor: 'v', supplyAmount: 1000, vatAmount: 100, amount: 1100, kind: '전자세금계산서', cardNumber: '' }
  const a = { id: 'a', projectId: 'o-1', date: '2026-10-01', kind: '전자세금계산서', vendor: 'v', memo: '', amount: 550 }
  const b = { id: 'b', projectId: 'o-1', date: '2026-10-02', kind: '전자세금계산서', vendor: 'v', memo: '', amount: 550 }
  const lines = [{ expenseId: 'a', date: a.date, orderNo: '26006', memo: '', supplyAmount: 501, amount: 550 }, { expenseId: 'b', date: b.date, orderNo: '26006', memo: '', supplyAmount: 501, amount: 550 }]
  const posted = applyInvoiceMatch(invoice, lines, { cardAccounting: [], expenses: [a, b], orders })
  assert.deepEqual(posted.expenses.map(e => [e.supplyAmount, e.vatAmount, e.amount]), [[500, 50, 550], [500, 50, 550]])
  // A single matched expense is linked directly, without shares.
  const one = applyInvoiceMatch({ ...invoice, amount: 550, supplyAmount: 500, vatAmount: 50 }, [lines[0]], { cardAccounting: [], expenses: [a], orders })
  assert.deepEqual(one.cardAccounting[0].expenseId, 'a')
  assert.equal(one.cardAccounting[0].splits, undefined)
})

test('분할회계반영 shares take the invoice date by default and keep a changed one', async () => {
  const { syncEditedExpense } = await import('./cardAccounting.ts')
  const invoice = { id: 'inv-d', date: '2026-11-13', vendor: '대한카고크레인', supplyAmount: 1400000, vatAmount: 140000, amount: 1540000, kind: '전자세금계산서', cardNumber: '' }
  const parts = [{ date: '2026-11-11', orderNo: '26006', memo: '김포', supplyAmount: 700000 }, { orderNo: '26007', memo: '진영', supplyAmount: 700000 }]
  const posted = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '', memo: '', splits: parts }], empty, 'T1')
  assert.deepEqual(posted.expenses.map(e => e.date), ['2026-11-11', '2026-11-13'])
  assert.deepEqual(posted.cardAccounting[0].splits.map(s => s.date), ['2026-11-11', '2026-11-13'])
  // Resaving from the 수정 window (no dates) keeps each share's day.
  const resaved = applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '', memo: '', splits: parts.map(({ date: _d, ...part }) => part) }], { ...posted, orders }, 'T2')
  assert.deepEqual(resaved.expenses.map(e => e.date), ['2026-11-11', '2026-11-13'])
  // A day changed in 지출내역 is kept on the share.
  assert.equal(syncEditedExpense(posted.cardAccounting, { id: 'tax-inv-d-2', memo: '진영', date: '2026-11-12' }, '26007')[0].splits[1].date, '2026-11-12')
  assert.throws(() => applyCardAccounting([{ row: invoice, status: '회계반영', orderNo: '', memo: '', splits: [{ ...parts[0], date: '2026-13-40' }, parts[1]] }], empty), /일자/)
})
