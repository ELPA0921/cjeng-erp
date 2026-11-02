import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expenseSheetHtml, paginateSheet, sheetRowsPerPage } from './expensePrint.ts'

const row = (n) => ({ date: '2026-10-05', vendor: `거래처${n}`, memo: '<내용>', supplyAmount: 1000, cardNumber: '3888', note: '' })

test('the last page always keeps a slot for the total row', () => {
  assert.deepEqual(paginateSheet([], 25).map(page => page.length), [0])
  assert.deepEqual(paginateSheet(Array(24).fill(1), 25).map(page => page.length), [24])
  assert.deepEqual(paginateSheet(Array(25).fill(1), 25).map(page => page.length), [25, 0])
  assert.deepEqual(paginateSheet(Array(60).fill(1), 25).map(page => page.length), [25, 25, 10])
})

test('every page has a full 25-row grid and only the last page has the 합계 row', () => {
  const html = expenseSheetHtml('25001_ 공사', Array.from({ length: 30 }, (_, i) => row(i)))
  const pages = html.split('<section class="sheet">').slice(1)
  assert.equal(pages.length, 2)
  for (const page of pages) assert.equal((page.match(/<tr>|<tr class="total">/g) ?? []).length - 1, sheetRowsPerPage)
  assert.doesNotMatch(pages[0], /합계/)
  assert.ok(pages[0].includes('<div class="page-number">1</div>'))
  assert.ok(pages[1].includes('<div class="page-number">2</div>'))
  assert.match(pages[1], /<td colspan="3" class="center">합계<\/td><td class="num"><span class="fit">30,000<\/span><\/td>/)
  assert.doesNotMatch(html, /V\.A\.T|<내용>/)
  assert.match(html, /&lt;내용&gt;/)
  for (const label of ['일자', '거래처', '내용', '공급가액', '카드번호', '비고']) assert.match(pages[0], new RegExp(`<th>${label}</th>`))
})

test('the 비고 column prints the row note, used for personal card owners', () => {
  const html = expenseSheetHtml('t', [{ ...row(1), cardNumber: '개인카드', note: '김해운' }])
  assert.ok(html.includes('<span class="fit">개인카드</span></td><td class="center"><span class="fit">김해운</span>'))
})
