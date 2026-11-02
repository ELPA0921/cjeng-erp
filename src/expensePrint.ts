// Printable 지출내역서 matching the company's paper form: A4 portrait, a fixed
// 25-row grid on every page, and the 합계 row only at the foot of the last page.
export type ExpenseSheetRow = { date: string; vendor: string; memo: string; supplyAmount: number; cardNumber: string; note: string }

export const sheetRowsPerPage = 25
const columns = [
  { label: '일자', width: 13.8, className: 'center' },
  { label: '거래처', width: 22.4, className: 'left' },
  { label: '내용', width: 31.2, className: 'left' },
  { label: '공급가액', width: 12.4, className: 'num' },
  { label: '카드번호', width: 10.1, className: 'center' },
  { label: '비고', width: 10.1, className: 'center' },
]

/** Splits rows into pages; the last page always keeps one slot for the 합계 row. */
export function paginateSheet<T>(rows: T[], perPage = sheetRowsPerPage) {
  const pageCount = Math.max(1, Math.ceil((rows.length + 1) / perPage))
  return Array.from({ length: pageCount }, (_, index) => rows.slice(index * perPage, (index + 1) * perPage))
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const money = (value: number) => new Intl.NumberFormat('ko-KR').format(value)
const cell = (text: string, className: string) => `<td class="${className}"><span class="fit">${escapeHtml(text)}</span></td>`

export function expenseSheetHtml(title: string, rows: ExpenseSheetRow[]) {
  const total = rows.reduce((sum, row) => sum + row.supplyAmount, 0)
  const pages = paginateSheet(rows)
  const head = `<colgroup>${columns.map(column => `<col style="width:${column.width}%">`).join('')}</colgroup>
    <thead><tr>${columns.map(column => `<th>${column.label}</th>`).join('')}</tr></thead>`
  const body = pages.map((pageRows, index) => {
    const last = index === pages.length - 1
    const blanks = (last ? sheetRowsPerPage - 1 : sheetRowsPerPage) - pageRows.length
    const lines = [
      ...pageRows.map(row => `<tr>${[row.date, row.vendor, row.memo, money(row.supplyAmount), row.cardNumber, row.note].map((text, column) => cell(text, columns[column].className)).join('')}</tr>`),
      ...Array.from({ length: blanks }, () => `<tr>${columns.map(() => '<td></td>').join('')}</tr>`),
      ...(last ? [`<tr class="total"><td colspan="3" class="center">합계</td>${cell(money(total), 'num')}<td colspan="2"></td></tr>`] : []),
    ]
    return `<section class="sheet"><h1><span class="fit">${escapeHtml(title)}</span></h1><table>${head}<tbody>${lines.join('')}</tbody></table><div class="page-number">${index + 1}</div></section>`
  }).join('')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    /* A zero page margin leaves the browser no room for its date/title/URL header
       and footer; each sheet draws its own margins and page number instead.
       The deep top margin keeps the title clear of binder punch holes. */
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; color: #000; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; }
    .sheet { position: relative; width: 210mm; height: 296mm; padding: 25mm 10mm 10mm; overflow: hidden; break-after: page; page-break-after: always; }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
    h1 { height: 14mm; margin: 0; overflow: hidden; font-size: 16pt; font-weight: 700; line-height: 14mm; text-align: center; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { height: 9.4mm; padding: 0 1.5mm; overflow: hidden; border: 0.6pt solid #000; font-size: 10pt; white-space: nowrap; }
    th { height: 10.5mm; font-weight: 700; text-align: center; }
    .center { text-align: center; } .left { text-align: left; } .num { text-align: right; }
    .fit { display: inline-block; max-width: none; }
    .page-number { position: absolute; right: 10mm; bottom: 3.5mm; font-size: 8pt; }
    @media screen { body { background: #e5e7eb; } .sheet { margin: 12px auto; background: #fff; } }
  </style></head><body>${body}<script>
    // Shrink text that would overflow its cell so the grid keeps its exact size.
    function fitText() {
      document.querySelectorAll('.fit').forEach(function (span) {
        var box = span.parentElement, style = getComputedStyle(box)
        var room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        var size = parseFloat(getComputedStyle(span).fontSize)
        while (span.scrollWidth > room && size > 5) { size -= 0.25; span.style.fontSize = size + 'px' }
      })
    }
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { fitText(); window.focus(); window.print() })
  </script></body></html>`
}

export function printExpenseSheet(title: string, rows: ExpenseSheetRow[]) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000')
  if (!printWindow) return
  printWindow.document.write(expenseSheetHtml(title, rows))
  printWindow.document.close()
}
