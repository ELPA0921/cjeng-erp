import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'
import './design.css'
import {
  orderVendorContacts,
  purchaseVendorContacts,
  type VendorContact,
} from './vendorData'

type Order = {
  id: string
  year?: string
  orderNo: string
  orderDate: string
  expectedCompletionDate: string
  manager: string
  client1: string
  client2: string
  region: string
  projectName: string
}

type Expense = {
  id: string
  projectId: string
  date: string
  kind: string
  vendor: string
  category?: string
  memo: string
  cardNumber?: string
  supplyAmount?: number
  vatAmount?: number
  amount: number
}

type WorkLog = {
  id: string
  projectId: string
  date: string
  worker: string
  workerType: '직원' | '인력'
  startTime: string
  endTime: string
  overtimeHours: number
  location: string
  task: string
  note: string
  hours: number
}

type WorkLogWorkerInput = {
  worker: string
  workerType: WorkLog['workerType']
}

type PurchaseOrder = {
  id: string
  projectId: string
  orderDate: string
  vendor: string
  item: string
  quantity: string
  amount: number
  status: '요청' | '발주완료' | '입고완료'
}

type ExportCell = string | number

type ExportTable = {
  columns: string[]
  rows: ExportCell[][]
  title: string
  totals?: ExportCell[][]
}

type CsvRecord = Record<string, string>

type View =
  | 'home'
  | 'orders'
  | 'project'
  | 'dashboard'
  | 'expenses'
  | 'worklogs'
  | 'worklogList'
  | 'contacts'
type ProjectDetailTab = 'worklogs' | 'expenses' | 'purchases'
type ContactTab = 'purchase' | 'order'
type SortDirection = 'asc' | 'desc'
type VendorSearchScope = 'all' | 'company' | 'contact' | 'item'
type VendorSortKey =
  | 'company'
  | 'contact'
  | 'mobile'
  | 'tel'
  | 'fax'
  | 'email'
  | 'address'
  | 'item'
type OrderSortKey =
  | 'year'
  | 'orderNo'
  | 'orderDate'
  | 'expectedCompletionDate'
  | 'manager'
  | 'client1'
  | 'client2'
  | 'region'
  | 'projectName'
type ExpenseSortKey =
  | 'date'
  | 'kind'
  | 'vendor'
  | 'memo'
  | 'cardNumber'
  | 'supplyAmount'
  | 'vatAmount'
  | 'amount'
type WorkLogSortKey =
  | 'date'
  | 'projectOrderNo'
  | 'worker'
  | 'workerType'
  | 'startTime'
  | 'endTime'
  | 'overtimeHours'
  | 'location'
  | 'task'
  | 'note'
  | 'hours'
type ProjectSortKey =
  | 'orderNo'
  | 'projectName'
  | 'client1'
  | 'region'
  | 'status'
  | 'cost'
  | 'manDays'
  | 'purchaseAmount'
type PurchaseOrderSortKey =
  | 'orderDate'
  | 'vendor'
  | 'item'
  | 'quantity'
  | 'status'
  | 'amount'

const emptyVendorContact: VendorContact = {
  company: '',
  contact: '',
  mobile: '',
  tel: '',
  fax: '',
  email: '',
  address: '',
  item: '',
}

const defaultOrders: Order[] = [
  {
    id: 'o-2025-001',
    orderNo: '2025-001',
    orderDate: '2025-01-14',
    expectedCompletionDate: '2025-03-28',
    manager: '김현수',
    client1: '태광산업',
    client2: '환경안전팀',
    region: '경기 안산',
    projectName: '흡착탑 교체 및 배관 보수공사',
  },
  {
    id: 'o-2025-002',
    orderNo: '2025-002',
    orderDate: '2025-02-03',
    expectedCompletionDate: '2025-04-15',
    manager: '박민재',
    client1: '동림화학',
    client2: '공무팀',
    region: '충남 천안',
    projectName: '폐수처리장 약품탱크 증설공사',
  },
  {
    id: 'o-2025-003',
    orderNo: '2025-003',
    orderDate: '2025-03-21',
    expectedCompletionDate: '2025-05-30',
    manager: '이준호',
    client1: '세림금속',
    client2: '설비보전팀',
    region: '인천 남동',
    projectName: '집진기 덕트라인 개선공사',
  },
  {
    id: 'o-2025-004',
    orderNo: '2025-004',
    orderDate: '2025-06-10',
    expectedCompletionDate: '2025-08-22',
    manager: '최유진',
    client1: '한빛산업',
    client2: '생산기술팀',
    region: '경기 화성',
    projectName: '스크러버 순환펌프 교체공사',
  },
  {
    id: 'o-2025-005',
    orderNo: '2025-005',
    orderDate: '2025-09-02',
    expectedCompletionDate: '2025-11-18',
    manager: '정도윤',
    client1: '우진바이오',
    client2: '시설관리팀',
    region: '충북 청주',
    projectName: '악취방지시설 후드 설치공사',
  },
  {
    id: 'o-2026-001',
    orderNo: '2026-001',
    orderDate: '2026-01-09',
    expectedCompletionDate: '2026-02-27',
    manager: '김현수',
    client1: '한빛산업',
    client2: '환경안전팀',
    region: '경기 화성',
    projectName: '대기방지시설 개선공사',
  },
  {
    id: 'o-2026-002',
    orderNo: '2026-002',
    orderDate: '2026-02-16',
    expectedCompletionDate: '2026-04-24',
    manager: '박민재',
    client1: '동서화학',
    client2: '공무팀',
    region: '울산 남구',
    projectName: '폐수처리장 배관 교체',
  },
  {
    id: 'o-2026-003',
    orderNo: '2026-003',
    orderDate: '2026-03-05',
    expectedCompletionDate: '2026-05-29',
    manager: '이준호',
    client1: '세림금속',
    client2: '설비보전팀',
    region: '인천 서구',
    projectName: '집진설비 신규 설치',
  },
  {
    id: 'o-2026-004',
    orderNo: '2026-004',
    orderDate: '2026-04-18',
    expectedCompletionDate: '2026-07-10',
    manager: '최유진',
    client1: '대영제지',
    client2: '안전환경팀',
    region: '전북 군산',
    projectName: 'RTO 전처리 필터박스 보강공사',
  },
  {
    id: 'o-2026-005',
    orderNo: '2026-005',
    orderDate: '2026-05-11',
    expectedCompletionDate: '2026-08-21',
    manager: '정도윤',
    client1: '우진바이오',
    client2: '시설관리팀',
    region: '충북 청주',
    projectName: '폐수 유량조정조 방수 보수공사',
  },
]

const defaultExpenses: Expense[] = [
  {
    id: 'e-001',
    projectId: 'o-2026-001',
    date: '2026-05-13',
    kind: '카드',
    vendor: '대성철물',
    category: '자재비',
    memo: '덕트 보강 자재',
    amount: 1280000,
  },
  {
    id: 'e-002',
    projectId: 'o-2026-001',
    date: '2026-05-17',
    kind: '세금계산서',
    vendor: '태영렌탈',
    category: '장비대',
    memo: '고소작업대 2일',
    amount: 740000,
  },
  {
    id: 'e-003',
    projectId: 'o-2026-002',
    date: '2026-05-18',
    kind: '카드',
    vendor: '우리배관',
    category: '자재비',
    memo: 'SUS 배관 및 밸브',
    amount: 2165000,
  },
  {
    id: 'e-004',
    projectId: 'o-2026-003',
    date: '2026-05-20',
    kind: '세금계산서',
    vendor: '세명환경기계',
    category: '외주비',
    memo: '집진기 본체 제작',
    amount: 12600000,
  },
  {
    id: 'e-005',
    projectId: 'o-2025-004',
    date: '2025-07-02',
    kind: '카드',
    vendor: '한성펌프',
    category: '자재비',
    memo: '순환펌프 부품',
    amount: 980000,
  },
]

const defaultWorkLogs: WorkLog[] = [
  {
    id: 'w-001',
    projectId: 'o-2026-001',
    date: '2026-05-14',
    worker: '김현수',
    workerType: '직원',
    startTime: '08:00',
    endTime: '17:00',
    overtimeHours: 0,
    location: '집진기실',
    task: '기존 설비 철거 및 덕트 보강',
    note: '안전난간 설치 후 작업',
    hours: 8,
  },
  {
    id: 'w-002',
    projectId: 'o-2026-001',
    date: '2026-05-15',
    worker: '박민재',
    workerType: '직원',
    startTime: '08:00',
    endTime: '16:00',
    overtimeHours: 0,
    location: '송풍기 기초부',
    task: '송풍기 베이스 설치',
    note: '',
    hours: 7,
  },
  {
    id: 'w-003',
    projectId: 'o-2026-002',
    date: '2026-05-19',
    worker: '이준호',
    workerType: '인력',
    startTime: '08:00',
    endTime: '17:30',
    overtimeHours: 0.5,
    location: '폐수처리장 1층',
    task: '배관 절단 및 플랜지 용접',
    note: '용접 화기감시 배치',
    hours: 8.5,
  },
  {
    id: 'w-004',
    projectId: 'o-2026-003',
    date: '2026-05-21',
    worker: '최유진',
    workerType: '직원',
    startTime: '08:30',
    endTime: '17:30',
    overtimeHours: 0,
    location: '집진설비 설치구역',
    task: '집진기 하부 프레임 설치',
    note: '',
    hours: 8,
  },
  {
    id: 'w-005',
    projectId: 'o-2025-004',
    date: '2025-07-08',
    worker: '정도윤',
    workerType: '인력',
    startTime: '09:00',
    endTime: '16:30',
    overtimeHours: 0,
    location: '스크러버실',
    task: '스크러버 순환펌프 교체',
    note: '시운전 완료',
    hours: 6.5,
  },
]

const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-001',
    projectId: 'o-2026-001',
    orderDate: '2026-05-10',
    vendor: '세명환경기계',
    item: '덕트 보강 플랜지 및 브라켓',
    quantity: '1식',
    amount: 1850000,
    status: '입고완료',
  },
  {
    id: 'po-002',
    projectId: 'o-2026-001',
    orderDate: '2026-05-12',
    vendor: '태영렌탈',
    item: '고소작업대 임대',
    quantity: '2일',
    amount: 740000,
    status: '발주완료',
  },
  {
    id: 'po-003',
    projectId: 'o-2026-002',
    orderDate: '2026-05-15',
    vendor: '우리배관',
    item: 'SUS 배관, 밸브, 플랜지',
    quantity: '1식',
    amount: 2580000,
    status: '입고완료',
  },
  {
    id: 'po-004',
    projectId: 'o-2026-003',
    orderDate: '2026-05-18',
    vendor: '세명환경기계',
    item: '집진기 본체 및 하부 호퍼',
    quantity: '1대',
    amount: 12600000,
    status: '발주완료',
  },
  {
    id: 'po-005',
    projectId: 'o-2026-004',
    orderDate: '2026-05-02',
    vendor: '대영필터',
    item: '전처리 필터박스 제작',
    quantity: '2대',
    amount: 5400000,
    status: '요청',
  },
]

const formatDateOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

const formatMonthOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)

const formatTableDate = (value: string) =>
  value ? `${value.replaceAll('-', '. ')}.` : ''

const escapeHtml = (value: ExportCell) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const makeExportFileName = (title: string) =>
  `${title.replace(/[\\/:*?"<>|]/g, '_')}_${formatDateOnly(new Date())}`

const escapeCsvCell = (value: ExportCell) => {
  const text = String(value)

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const parseCsvText = (text: string) => {
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(cell.trim())
      if (row.some((item) => item)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell.trim())
  if (row.some((item) => item)) rows.push(row)

  return rows
}

const parseCsvRecords = (text: string): CsvRecord[] => {
  const rows = parseCsvText(text.replace(/^\ufeff/, ''))
  const headers = rows[0] ?? []

  return rows.slice(1).map((row) =>
    headers.reduce<CsvRecord>((record, header, index) => {
      record[header] = row[index] ?? ''
      return record
    }, {}),
  )
}

const readCsvFile = (file: File, onImport: (records: CsvRecord[]) => void) => {
  const reader = new FileReader()
  reader.onload = () => onImport(parseCsvRecords(String(reader.result ?? '')))
  reader.readAsText(file, 'utf-8')
}

const getCsvValue = (record: CsvRecord, names: string[]) =>
  names.map((name) => record[name]).find((value) => value !== undefined) ?? ''

const parseCsvDate = (value: string) => {
  const normalized = value
    .replaceAll('.', '-')
    .replaceAll('/', '-')
    .replace(/\s+/g, '')
    .replace(/-$/, '')
  const parts = normalized.split('-').filter(Boolean)
  if (parts.length < 3) return value || today

  return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
}

const parseCsvNumber = (value: string) =>
  Number(value.replaceAll(',', '').replace(/[^\d.-]/g, '')) || 0

const exportTableToCsv = (table: ExportTable) => {
  const rows = [
    table.columns,
    ...table.rows,
    ...(table.totals ?? []),
  ].map((row) => row.map(escapeCsvCell).join(','))
  const blob = new Blob(['\ufeff', rows.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${makeExportFileName(table.title)}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

const buildExportTableHtml = (table: ExportTable) => `
  <table>
    <thead>
      <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${table.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
        )
        .join('')}
    </tbody>
    ${
      table.totals?.length
        ? `<tfoot>${table.totals
            .map(
              (row) =>
                `<tr>${row
                  .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                  .join('')}</tr>`,
            )
            .join('')}</tfoot>`
        : ''
    }
  </table>
`

const printExportTable = (table: ExportTable) => {
  const printWindow = window.open('', '_blank', 'width=1200,height=800')
  if (!printWindow) return

  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(table.title)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; }
          h1 { margin: 0 0 10px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
          th, td { border: 1px solid #9ca3af; padding: 5px 6px; text-align: center; word-break: keep-all; overflow-wrap: anywhere; }
          th { background: #eef2f7; font-weight: 700; }
          td { vertical-align: middle; }
          tfoot td { background: #f7f8fa; font-weight: 700; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(table.title)}</h1>
        ${buildExportTableHtml(table)}
        <script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>`)
  printWindow.document.close()
}

const expenseKindOptions = [
  '법인카드',
  '전자세금계산서',
  '종이세금계산서',
  '개인카드',
  '기타',
]

const calendarMonthOptions = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)

function normalizeExpenseKind(kind: string) {
  if (kind === '카드') return '법인카드'
  if (kind === '세금계산서') return '전자세금계산서'

  return kind
}

function isTaxInvoiceKind(kind: string) {
  return kind === '전자세금계산서' || kind === '종이세금계산서'
}

const parseMoneyInput = (value: string) => Math.max(0, Number(value) || 0)
const normalizeMoneyInput = (value: string) => value.replace(/[^\d]/g, '')
const formatMoneyInput = (value: string) => {
  const normalized = normalizeMoneyInput(value)
  if (!normalized) return ''

  return new Intl.NumberFormat('ko-KR').format(Number(normalized))
}

function getExpenseSupplyAmount(expense: Expense) {
  return expense.supplyAmount ?? Math.round(expense.amount / 1.1)
}

function getExpenseVatAmount(expense: Expense) {
  return expense.vatAmount ?? expense.amount - getExpenseSupplyAmount(expense)
}

function calculateExpenseAmountFields<
  T extends {
    supplyAmount: string
    vatAmount: string
    amount: string
    manualSupplyAmount: boolean
    manualVatAmount: boolean
    manualAmount: boolean
  },
>(
  source: 'supplyAmount' | 'vatAmount' | 'amount',
  values: T,
) {
  let supplyAmount = parseMoneyInput(normalizeMoneyInput(values.supplyAmount))
  let vatAmount = parseMoneyInput(normalizeMoneyInput(values.vatAmount))
  let amount = parseMoneyInput(normalizeMoneyInput(values.amount))

  if (source === 'supplyAmount') {
    if (!values.manualVatAmount) {
      vatAmount = Math.round(supplyAmount * 0.1)
    }
    if (!values.manualAmount) {
      amount = supplyAmount + vatAmount
    }
  }

  if (source === 'amount') {
    if (!values.manualSupplyAmount && !values.manualVatAmount) {
      supplyAmount = Math.round(amount / 1.1)
      vatAmount = amount - supplyAmount
    } else if (!values.manualSupplyAmount) {
      supplyAmount = Math.max(0, amount - vatAmount)
    } else if (!values.manualVatAmount) {
      vatAmount = Math.max(0, amount - supplyAmount)
    }
  }

  if (source === 'vatAmount') {
    if (!values.manualAmount) {
      amount = supplyAmount + vatAmount
    } else if (!values.manualSupplyAmount) {
      supplyAmount = Math.max(0, amount - vatAmount)
    }
  }

  return {
    ...values,
    supplyAmount: String(supplyAmount),
    vatAmount: String(vatAmount),
    amount: String(amount),
  }
}

const today = formatDateOnly(new Date())
const currentYear = today.slice(0, 4)
const defaultProjectId = defaultOrders[5].id
const koreanSolarHolidayNames = new Map([
  ['01-01', '신정'],
  ['03-01', '삼일절'],
  ['05-05', '어린이날'],
  ['06-06', '현충일'],
  ['08-15', '광복절'],
  ['10-03', '개천절'],
  ['10-09', '한글날'],
  ['12-25', '성탄절'],
])
const koreanDatedPublicHolidayNames = new Map([
  ['2025-01-27', '임시공휴일'],
  ['2025-01-28', '설연휴'],
  ['2025-01-29', '설날'],
  ['2025-01-30', '설연휴'],
  ['2025-03-03', '대체공휴일'],
  ['2025-05-05', '어린이날/부처님오신날'],
  ['2025-05-06', '대체공휴일'],
  ['2025-06-03', '선거일'],
  ['2025-10-05', '추석연휴'],
  ['2025-10-06', '추석'],
  ['2025-10-07', '추석연휴'],
  ['2025-10-08', '대체공휴일'],
  ['2026-02-16', '설연휴'],
  ['2026-02-17', '설날'],
  ['2026-02-18', '설연휴'],
  ['2026-03-02', '대체공휴일'],
  ['2026-05-24', '부처님오신날'],
  ['2026-05-25', '대체공휴일'],
  ['2026-06-03', '선거일'],
  ['2026-08-17', '대체공휴일'],
  ['2026-09-24', '추석연휴'],
  ['2026-09-25', '추석'],
  ['2026-09-26', '추석연휴'],
  ['2026-10-05', '대체공휴일'],
])

function getOrderYear(order: Order) {
  if (order.year) return order.year
  if (order.orderDate) return order.orderDate.slice(0, 4)

  const yyOrderNo = order.orderNo.match(/^(\d{2})\d+$/)
  if (yyOrderNo) return `20${yyOrderNo[1]}`

  return order.orderNo.match(/^\d{4}/)?.[0] ?? '기타'
}

function getNextOrderNo(year: string, orders: Order[]) {
  const prefix = year.slice(-2)
  const maxSequence = orders
    .filter((order) => getOrderYear(order) === year)
    .map((order) => {
      const yyMatch = order.orderNo.match(new RegExp(`^${prefix}(\\d+)$`))
      const yyyyMatch = order.orderNo.match(new RegExp(`^${year}-(\\d+)$`))
      return Number(yyMatch?.[1] ?? yyyyMatch?.[1] ?? 0)
    })
    .reduce((max, sequence) => Math.max(max, sequence), 0)

  return `${prefix}${String(maxSequence + 1).padStart(3, '0')}`
}

function getMonthDays(monthText: string) {
  const [year, month] = monthText.split('-').map(Number)
  const firstDate = new Date(year, month - 1, 1)
  const lastDate = new Date(year, month, 0)
  const leadingDays = firstDate.getDay()
  const days: Array<{ date: string; isCurrentMonth: boolean }> = []

  for (let index = leadingDays - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1, -index)
    days.push({
      date: formatDateOnly(date),
      isCurrentMonth: false,
    })
  }

  for (let day = 1; day <= lastDate.getDate(); day += 1) {
    const date = new Date(year, month - 1, day)
    days.push({
      date: formatDateOnly(date),
      isCurrentMonth: true,
    })
  }

  let trailingDay = 1

  while (days.length % 7 !== 0) {
    const date = new Date(year, month, trailingDay)
    days.push({
      date: formatDateOnly(date),
      isCurrentMonth: false,
    })
    trailingDay += 1
  }

  return days
}

function getDateWeekday(dateText: string) {
  const [year, month, day] = dateText.split('-').map(Number)

  return new Date(year, month - 1, day).getDay()
}

function getKoreanPublicHolidayName(dateText: string) {
  const year = Number(dateText.slice(0, 4))
  const monthDay = dateText.slice(5)

  if (year >= 2026 && monthDay === '05-01') return '노동절'
  if (year >= 2026 && monthDay === '07-17') return '제헌절'

  return (
    koreanDatedPublicHolidayNames.get(dateText) ??
    koreanSolarHolidayNames.get(monthDay)
  )
}

function moveMonth(monthText: string, amount: number) {
  const [year, month] = monthText.split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1)

  return formatMonthOnly(date)
}

const createWorkerInput = (): WorkLogWorkerInput => ({
  worker: '',
  workerType: '직원',
})

function calculateWorkHours(
  startTime: string,
  endTime: string,
  overtimeHours: number,
) {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  const regularHours = Math.max(0, (end - start) / 60 - 1)

  return Number((regularHours + overtimeHours).toFixed(2))
}

function loadStoredData<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key)
  if (!stored) return fallback

  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function compareText(a: string | number, b: string | number) {
  return String(a).localeCompare(String(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function getSortDirectionLabel(
  active: boolean,
  direction: SortDirection,
) {
  if (!active) return ''

  return direction === 'asc' ? ' ↑' : ' ↓'
}

function getProjectStatus(order: Order) {
  if (order.expectedCompletionDate < today) return '준공'
  if (order.orderDate > today) return '예정'
  return '진행중'
}

type IconName = 'home' | 'orders' | 'dashboard' | 'expenses' | 'worklogs' | 'contacts' | 'arrow' | 'plus'
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    orders: 'M8 4H5v17h14V4h-3M9 3h6v4H9zM9 11h6M9 15h6',
    dashboard: 'M4 20V10h4v10M10 20V4h4v16M16 20v-8h4v8',
    expenses: 'M3 6h18v14H3zM3 10h18M15 15h3M6 3v3',
    worklogs: 'M4 5h16v16H4zM8 3v4M16 3v4M4 11h16M8 15h2M14 15h2',
    contacts: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-3.87',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
  }
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

function App() {
  const [view, setView] = useState<View>('home')
  const [viewHistory, setViewHistory] = useState<View[]>([])
  const [orderYear, setOrderYear] = useState(currentYear)
  const [orders, setOrders] = useState(() =>
    loadStoredData('cost-app-orders', defaultOrders),
  )
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [orderSort, setOrderSort] = useState<{
    key: OrderSortKey
    direction: SortDirection
  }>({ key: 'orderNo', direction: 'asc' })
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId)
  const [projectDetailTab, setProjectDetailTab] =
    useState<ProjectDetailTab>('worklogs')
  const [contactTab, setContactTab] = useState<ContactTab>('purchase')
  const [selectedVendorKeys, setSelectedVendorKeys] = useState<string[]>([])
  const [vendorSearchScope, setVendorSearchScope] =
    useState<VendorSearchScope>('all')
  const [vendorSearchText, setVendorSearchText] = useState('')
  const [vendorSort, setVendorSort] = useState<{
    key: VendorSortKey
    direction: SortDirection
  }>({ key: 'company', direction: 'asc' })
  const [inactiveVendorKeys, setInactiveVendorKeys] = useState<string[]>(() =>
    loadStoredData('cost-app-inactive-vendors', []),
  )
  const [deletedVendorKeys, setDeletedVendorKeys] = useState<string[]>(() =>
    loadStoredData('cost-app-deleted-vendors', []),
  )
  const [vendorEdits, setVendorEdits] = useState<Record<string, VendorContact>>(
    () => loadStoredData<Record<string, VendorContact>>('cost-app-vendor-edits', {}),
  )
  const [customVendorContacts, setCustomVendorContacts] = useState<
    Record<ContactTab, VendorContact[]>
  >(() =>
    loadStoredData<Record<ContactTab, VendorContact[]>>(
      'cost-app-custom-vendors',
      {
        purchase: [],
        order: [],
      },
    ),
  )
  const [editingVendorKey, setEditingVendorKey] = useState<string | null>(null)
  const [vendorForm, setVendorForm] =
    useState<VendorContact>(emptyVendorContact)
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [isWorkLogModalOpen, setIsWorkLogModalOpen] = useState(false)
  const [expenses, setExpenses] = useState(() =>
    loadStoredData('cost-app-expenses', defaultExpenses),
  )
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([])
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [expenseSort, setExpenseSort] = useState<{
    key: ExpenseSortKey
    direction: SortDirection
  }>({ key: 'date', direction: 'desc' })
  const [workLogMonth, setWorkLogMonth] = useState(today.slice(0, 7))
  const [workLogSort, setWorkLogSort] = useState<{
    key: WorkLogSortKey
    direction: SortDirection
  }>({ key: 'date', direction: 'desc' })
  const [selectedCalendarWork, setSelectedCalendarWork] = useState<{
    date: string
    projectId: string
  } | null>(null)
  const [workLogListYear, setWorkLogListYear] = useState('all')
  const [projectSort, setProjectSort] = useState<{
    key: ProjectSortKey
    direction: SortDirection
  }>({ key: 'orderNo', direction: 'asc' })
  const [purchaseOrderSort, setPurchaseOrderSort] = useState<{
    key: PurchaseOrderSortKey
    direction: SortDirection
  }>({ key: 'orderDate', direction: 'desc' })
  const [workLogs, setWorkLogs] = useState(() =>
    loadStoredData('cost-app-worklogs-v2', defaultWorkLogs),
  )
  const [expenseForm, setExpenseForm] = useState({
    projectId: defaultProjectId,
    date: today,
    kind: '법인카드',
    customKind: '',
    vendor: '',
    memo: '',
    cardNumber: '',
    supplyAmount: '',
    vatAmount: '',
    amount: '',
    manualSupplyAmount: true,
    manualVatAmount: false,
    manualAmount: false,
  })
  const [workLogForm, setWorkLogForm] = useState({
    projectId: defaultProjectId,
    date: today,
    workerCount: '1',
    startTime: '07:30',
    endTime: '16:30',
    overtimeHours: '0',
    location: '',
    task: '',
    note: '',
    workers: [createWorkerInput()],
  })
  const [orderForm, setOrderForm] = useState({
    year: '2026',
    orderNo: '26006',
    orderDate: today,
    expectedCompletionDate: today,
    manager: '',
    client1: '',
    client2: '',
    region: '',
    projectName: '',
  })

  useEffect(() => {
    localStorage.setItem('cost-app-expenses', JSON.stringify(expenses))
  }, [expenses])

  useEffect(() => {
    localStorage.setItem('cost-app-orders', JSON.stringify(orders))
  }, [orders])

  useEffect(() => {
    localStorage.setItem('cost-app-worklogs-v2', JSON.stringify(workLogs))
  }, [workLogs])

  useEffect(() => {
    localStorage.setItem(
      'cost-app-inactive-vendors',
      JSON.stringify(inactiveVendorKeys),
    )
  }, [inactiveVendorKeys])

  useEffect(() => {
    localStorage.setItem(
      'cost-app-deleted-vendors',
      JSON.stringify(deletedVendorKeys),
    )
  }, [deletedVendorKeys])

  useEffect(() => {
    localStorage.setItem('cost-app-vendor-edits', JSON.stringify(vendorEdits))
  }, [vendorEdits])

  useEffect(() => {
    localStorage.setItem(
      'cost-app-custom-vendors',
      JSON.stringify(customVendorContacts),
    )
  }, [customVendorContacts])

  const navigateTo = (nextView: View) => {
    if (nextView === view) return

    setViewHistory((current) => [...current, view])
    setView(nextView)
  }

  const goToList = () => {
    navigateTo(viewHistory.findLast((item) => item !== 'project') ?? 'orders')
  }

  const projectSummaries = useMemo(
    () =>
      orders.map((order) => {
        const year = getOrderYear(order)
        const projectExpenses = expenses.filter(
          (expense) => expense.projectId === order.id,
        )
        const projectWorkLogs = workLogs.filter(
          (workLog) => workLog.projectId === order.id,
        )
        const projectPurchaseOrders = purchaseOrders.filter(
          (purchaseOrder) => purchaseOrder.projectId === order.id,
        )
        const cost = projectExpenses.reduce(
          (total, expense) => total + expense.amount,
          0,
        )
        const hours = projectWorkLogs.reduce(
          (total, workLog) => total + workLog.hours,
          0,
        )
        const purchaseAmount = projectPurchaseOrders.reduce(
          (total, purchaseOrder) => total + purchaseOrder.amount,
          0,
        )

        return {
          ...order,
          year,
          cost,
          hours,
          manDays: hours / 8,
          purchaseAmount,
          status: getProjectStatus(order),
          records:
            projectExpenses.length +
            projectWorkLogs.length +
            projectPurchaseOrders.length,
        }
      }),
    [expenses, orders, workLogs],
  )

  const orderYears = useMemo(
    () =>
      [...new Set([...orders.map((order) => getOrderYear(order)), orderYear])]
        .filter(Boolean)
        .sort((a, b) => compareText(a, b)),
    [orderYear, orders],
  )
  const filteredOrders = [...orders]
    .filter((order) => getOrderYear(order) === orderYear)
    .sort((a, b) => {
      const aValue = orderSort.key === 'year' ? getOrderYear(a) : a[orderSort.key]
      const bValue = orderSort.key === 'year' ? getOrderYear(b) : b[orderSort.key]
      const result = compareText(aValue ?? '', bValue ?? '')

      return orderSort.direction === 'asc' ? result : -result
    })
  const yearlyProjectSummaries = [...projectSummaries]
    .filter((project) => getOrderYear(project) === orderYear)
    .sort((a, b) => {
      const aValue = a[projectSort.key]
      const bValue = b[projectSort.key]
      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : compareText(aValue, bValue)

      return projectSort.direction === 'asc' ? result : -result
    })
  const selectedProject = projectSummaries.find(
    (project) => project.id === selectedProjectId,
  )
  const filteredExpenses = [...expenses]
    .filter((expense) => expense.projectId === selectedProjectId)
    .sort((a, b) => {
      const aValue =
        expenseSort.key === 'amount'
          ? a.amount
          : expenseSort.key === 'supplyAmount'
            ? getExpenseSupplyAmount(a)
            : expenseSort.key === 'vatAmount'
              ? getExpenseVatAmount(a)
              : String(a[expenseSort.key])
      const bValue =
        expenseSort.key === 'amount'
          ? b.amount
          : expenseSort.key === 'supplyAmount'
            ? getExpenseSupplyAmount(b)
            : expenseSort.key === 'vatAmount'
              ? getExpenseVatAmount(b)
              : String(b[expenseSort.key])
      const result =
        expenseSort.key === 'amount' ||
        expenseSort.key === 'supplyAmount' ||
        expenseSort.key === 'vatAmount'
          ? Number(aValue) - Number(bValue)
          : compareText(aValue, bValue)

      return expenseSort.direction === 'asc' ? result : -result
    })
  const expenseTotals = filteredExpenses.reduce(
    (totals, expense) => ({
      supplyAmount: totals.supplyAmount + getExpenseSupplyAmount(expense),
      vatAmount: totals.vatAmount + getExpenseVatAmount(expense),
      amount: totals.amount + expense.amount,
    }),
    { supplyAmount: 0, vatAmount: 0, amount: 0 },
  )
  const filteredWorkLogs = [...workLogs]
    .filter((workLog) => workLog.projectId === selectedProjectId)
    .sort((a, b) => {
      const aValue = getWorkLogSortValue(a, workLogSort.key)
      const bValue = getWorkLogSortValue(b, workLogSort.key)
      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : compareText(aValue, bValue)

      return workLogSort.direction === 'asc' ? result : -result
    })
  const filteredWorkLogTotals = filteredWorkLogs.reduce(
    (totals, workLog) => ({
      days: totals.days.add(workLog.date),
      hours: totals.hours + workLog.hours,
    }),
    { days: new Set<string>(), hours: 0 },
  )
  const filteredPurchaseOrders = [...purchaseOrders]
    .filter((purchaseOrder) => purchaseOrder.projectId === selectedProjectId)
    .sort((a, b) => {
      const aValue = a[purchaseOrderSort.key]
      const bValue = b[purchaseOrderSort.key]
      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : compareText(aValue, bValue)

      return purchaseOrderSort.direction === 'asc' ? result : -result
    })
  const totalCost = projectSummaries.reduce(
    (total, project) => total + project.cost,
    0,
  )
  const totalHours = projectSummaries.reduce(
    (total, project) => total + project.hours,
    0,
  )
  const activeProjectCount = projectSummaries.filter(
    (project) => project.status === '진행중',
  ).length
  const recentProjects = [...projectSummaries]
    .sort((a, b) => compareText(b.orderDate, a.orderDate))
    .slice(0, 5)
  const highCostProjects = [...projectSummaries]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
  const calendarDays = getMonthDays(workLogMonth)
  const calendarWorkLogs = workLogs.filter((workLog) =>
    workLog.date.startsWith(workLogMonth),
  )
  const selectedCalendarWorkLogs = selectedCalendarWork
    ? [...workLogs]
        .filter(
          (workLog) =>
            workLog.date === selectedCalendarWork.date &&
            workLog.projectId === selectedCalendarWork.projectId,
        )
        .sort((a, b) => {
          const aValue = getWorkLogSortValue(a, workLogSort.key)
          const bValue = getWorkLogSortValue(b, workLogSort.key)
          const result =
            typeof aValue === 'number' && typeof bValue === 'number'
              ? aValue - bValue
              : compareText(aValue, bValue)

          return workLogSort.direction === 'asc' ? result : -result
        })
    : []
  const selectedCalendarProject = selectedCalendarWork
    ? projectSummaries.find(
        (project) => project.id === selectedCalendarWork.projectId,
      )
    : undefined
  const workLogYears = Array.from(
    new Set(workLogs.map((workLog) => workLog.date.slice(0, 4)).filter(Boolean)),
  ).sort((a, b) => compareText(b, a))
  const workLogCalendarYears = Array.from(
    new Set([...orderYears, ...workLogYears, workLogMonth.slice(0, 4)]),
  ).sort((a, b) => compareText(b, a))
  const filteredWorkLogsForList = [...workLogs]
    .filter(
      (workLog) =>
        workLogListYear === 'all' || workLog.date.startsWith(workLogListYear),
    )
    .sort((a, b) => {
      const aValue = getWorkLogSortValue(a, workLogSort.key)
      const bValue = getWorkLogSortValue(b, workLogSort.key)
      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : compareText(aValue, bValue)

      return workLogSort.direction === 'asc' ? result : -result
    })
  const activeVendorContacts =
    contactTab === 'purchase'
      ? [...purchaseVendorContacts, ...customVendorContacts.purchase]
      : [...orderVendorContacts, ...customVendorContacts.order]
  const vendorSearchQuery = normalizeSearchText(vendorSearchText)
  const vendorRows = activeVendorContacts
    .map((contact, index) => {
      const key = getVendorContactKey(contact, index)

      return {
        contact: vendorEdits[key] ?? contact,
        key,
      }
    })
    .filter((vendor) => !deletedVendorKeys.includes(vendor.key))
    .filter(({ contact }) => {
      if (!vendorSearchQuery) return true

      const fields =
        vendorSearchScope === 'all'
          ? [
              contact.company,
              contact.contact,
              contact.mobile,
              contact.tel,
              contact.fax,
              contact.email,
              contact.address,
              contact.item,
            ]
          : [contact[vendorSearchScope]]

      return fields.some((field) =>
        normalizeSearchText(field).includes(vendorSearchQuery),
      )
    })
    .sort((a, b) => {
      const result = compareText(
        a.contact[vendorSort.key],
        b.contact[vendorSort.key],
      )

      return vendorSort.direction === 'asc' ? result : -result
    })
  const selectedVendorCount = selectedVendorKeys.length
  const allVendorsSelected =
    vendorRows.length > 0 &&
    vendorRows.every((vendor) => selectedVendorKeys.includes(vendor.key))
  const selectedOrderCount = selectedOrderIds.length
  const allOrdersSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((order) => selectedOrderIds.includes(order.id))
  const selectedExpenseCount = selectedExpenseIds.length
  const allExpensesSelected =
    filteredExpenses.length > 0 &&
    filteredExpenses.every((expense) => selectedExpenseIds.includes(expense.id))
  const ordersExportTable: ExportTable = {
    title: `${orderYear}년 수주대장`,
    columns: [
      '년도',
      '수주번호',
      '수주일자',
      '준공예정일',
      '상태',
      '담당자',
      '수주처1',
      '수주처2',
      '공사지역',
      '공사명',
    ],
    rows: filteredOrders.map((order) => [
      getOrderYear(order),
      order.orderNo,
      formatTableDate(order.orderDate),
      formatTableDate(order.expectedCompletionDate),
      getProjectStatus(order),
      order.manager,
      order.client1,
      order.client2,
      order.region,
      order.projectName,
    ]),
  }
  const dashboardExportTable: ExportTable = {
    title: `${orderYear}년 공사별 현황`,
    columns: [
      '수주번호',
      '공사명',
      '수주처',
      '공사지역',
      '지출금액',
      '작업공수',
      '발주금액',
    ],
    rows: yearlyProjectSummaries.map((project) => [
      project.orderNo,
      project.projectName,
      project.client1,
      project.region,
      formatNumber(project.cost),
      project.manDays.toFixed(2),
      formatNumber(project.purchaseAmount),
    ]),
  }
  const expensesExportTable: ExportTable = {
    title: `${selectedProject?.orderNo ?? ''} 지출내역`,
    columns: [
      '일자',
      '거래처',
      '내용',
      '공급가액',
      '부가세',
      '금액',
      '구분',
      '카드번호',
    ],
    rows: filteredExpenses.map((expense) => [
      formatTableDate(expense.date),
      expense.vendor,
      expense.memo || '-',
      formatNumber(getExpenseSupplyAmount(expense)),
      formatNumber(getExpenseVatAmount(expense)),
      formatNumber(expense.amount),
      normalizeExpenseKind(expense.kind),
      expense.cardNumber || '-',
    ]),
    totals:
      filteredExpenses.length > 0
        ? [
            [
              '총합',
              '',
              '',
              formatNumber(expenseTotals.supplyAmount),
              formatNumber(expenseTotals.vatAmount),
              formatNumber(expenseTotals.amount),
              '',
              '',
            ],
          ]
        : undefined,
  }
  const selectedWorkLogsExportTable: ExportTable = {
    title: `${selectedProject?.orderNo ?? ''} 작업일보`,
    columns: [
      '일자',
      '작업자',
      '구분',
      '시작',
      '종료',
      '잔업',
      '장소',
      '작업내용',
      '비고',
      '시간',
      '공수',
    ],
    rows: filteredWorkLogs.map((workLog) => [
      formatTableDate(workLog.date),
      workLog.worker,
      workLog.workerType,
      workLog.startTime,
      workLog.endTime,
      workLog.overtimeHours.toFixed(1),
      workLog.location || '-',
      workLog.task,
      workLog.note || '-',
      workLog.hours.toFixed(1),
      (workLog.hours / 8).toFixed(2),
    ]),
    totals:
      filteredWorkLogs.length > 0
        ? [
            [
              '총합',
              '',
              '',
              '',
              '',
              '',
              '',
              `작업일수 ${filteredWorkLogTotals.days.size}`,
              '',
              filteredWorkLogTotals.hours.toFixed(1),
              (filteredWorkLogTotals.hours / 8).toFixed(2),
            ],
          ]
        : undefined,
  }
  const allWorkLogsExportTable: ExportTable = {
    title: '작업일보 전체조회',
    columns: [
      '작업일',
      '작업자',
      '구분',
      '작업시작',
      '작업종료',
      '잔업시간',
      '작업장소',
      '작업내용',
      '수주번호',
      '비고',
      '작업시간',
      '공수',
    ],
    rows: filteredWorkLogsForList.map((workLog) => {
      const project = projectSummaries.find((item) => item.id === workLog.projectId)

      return [
        formatTableDate(workLog.date),
        workLog.worker,
        workLog.workerType,
        workLog.startTime,
        workLog.endTime,
        workLog.overtimeHours.toFixed(1),
        workLog.location || '-',
        workLog.task,
        project?.orderNo ?? '-',
        workLog.note || '-',
        workLog.hours.toFixed(1),
        (workLog.hours / 8).toFixed(2),
      ]
    }),
  }
  const contactsExportTable: ExportTable = {
    title: contactTab === 'purchase' ? '물품구입처' : '발주처',
    columns:
      contactTab === 'purchase'
        ? ['업체명', '이름', 'H.P', 'TEL', 'FAX', 'E-Mail', '주소', '취급품목']
        : ['업체명', '이름', 'H.P', 'TEL', 'FAX', 'E-Mail', '주소'],
    rows: vendorRows.map(({ contact }) =>
      contactTab === 'purchase'
        ? [
            contact.company || '-',
            contact.contact || '-',
            contact.mobile || '-',
            contact.tel || '-',
            contact.fax || '-',
            contact.email || '-',
            contact.address || '-',
            contact.item || '-',
          ]
        : [
            contact.company || '-',
            contact.contact || '-',
            contact.mobile || '-',
            contact.tel || '-',
            contact.fax || '-',
            contact.email || '-',
            contact.address || '-',
          ],
    ),
  }

  function getVendorContactKey(contact: VendorContact, index: number) {
    return [
      contactTab,
      contact.company,
      contact.contact,
      contact.tel,
      contact.mobile,
      index,
    ].join('|')
  }

  function toggleSelectedVendor(vendorKey: string) {
    setSelectedVendorKeys((current) =>
      current.includes(vendorKey)
        ? current.filter((key) => key !== vendorKey)
        : [...current, vendorKey],
    )
  }

  function updateVendorSort(key: VendorSortKey) {
    setVendorSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function updateOrderSort(key: OrderSortKey) {
    setOrderSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId)
    setExpenseForm((current) => ({ ...current, projectId }))
    setWorkLogForm((current) => ({ ...current, projectId }))
  }

  function switchOrderYear(nextYear: string) {
    setOrderYear(nextYear)
    setSelectedOrderIds([])
    const firstProject = orders.find((order) => getOrderYear(order) === nextYear)
    if (firstProject) {
      selectProject(firstProject.id)
    }
  }

  function updateWorkLogCalendarMonth(nextYear: string, nextMonth: string) {
    const nextWorkLogMonth = `${nextYear}-${nextMonth}`
    const currentDay = Number(workLogForm.date.slice(8, 10)) || 1
    const lastDay = new Date(Number(nextYear), Number(nextMonth), 0).getDate()
    const nextDay = String(Math.min(currentDay, lastDay)).padStart(2, '0')

    setWorkLogMonth(nextWorkLogMonth)
    setWorkLogForm((current) => ({
      ...current,
      date: `${nextWorkLogMonth}-${nextDay}`,
    }))
  }

  function updateExpenseSort(key: ExpenseSortKey) {
    setExpenseSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function updateWorkLogSort(key: WorkLogSortKey) {
    setWorkLogSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function updateProjectSort(key: ProjectSortKey) {
    setProjectSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function updatePurchaseOrderSort(key: PurchaseOrderSortKey) {
    setPurchaseOrderSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function switchContactTab(nextTab: ContactTab) {
    setContactTab(nextTab)
    setSelectedVendorKeys([])
    setEditingVendorKey(null)
    setIsVendorModalOpen(false)
    if (nextTab === 'order' && vendorSearchScope === 'item') {
      setVendorSearchScope('all')
    }
  }

  function toggleAllVendors() {
    setSelectedVendorKeys(
      allVendorsSelected ? [] : vendorRows.map((vendor) => vendor.key),
    )
  }

  function toggleSelectedOrder(orderId: string) {
    setSelectedOrderIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId],
    )
  }

  function toggleAllOrders() {
    setSelectedOrderIds(
      allOrdersSelected ? [] : filteredOrders.map((order) => order.id),
    )
  }

  function toggleSelectedExpense(expenseId: string) {
    setSelectedExpenseIds((current) =>
      current.includes(expenseId)
        ? current.filter((id) => id !== expenseId)
        : [...current, expenseId],
    )
  }

  function toggleAllExpenses() {
    setSelectedExpenseIds(
      allExpensesSelected
        ? []
        : filteredExpenses.map((expense) => expense.id),
    )
  }

  function importOrdersFromCsv(records: CsvRecord[]) {
    const importedOrders = records.reduce<Order[]>((ordersToImport, record) => {
        const orderNo = getCsvValue(record, ['수주번호']).trim()
        const year = getCsvValue(record, ['년도']).trim() || orderNo.slice(0, 4)
        const projectName = getCsvValue(record, ['공사명']).trim()

        if (!orderNo || !projectName) return ordersToImport

        ordersToImport.push({
          id: `o-${orderNo}-${crypto.randomUUID()}`,
          year,
          orderNo,
          orderDate: parseCsvDate(getCsvValue(record, ['수주일자'])),
          expectedCompletionDate: parseCsvDate(
            getCsvValue(record, ['준공예정일']),
          ),
          manager: getCsvValue(record, ['담당자']),
          client1: getCsvValue(record, ['수주처1']),
          client2: getCsvValue(record, ['수주처2']),
          region: getCsvValue(record, ['공사지역']),
          projectName,
        })

        return ordersToImport
      }, [])

    if (importedOrders.length === 0) return

    setOrders((current) => {
      const withoutDuplicates = current.filter(
        (order) =>
          !importedOrders.some(
            (importedOrder) =>
              importedOrder.orderNo === order.orderNo &&
              getOrderYear(importedOrder) === getOrderYear(order),
          ),
      )

      return [...importedOrders, ...withoutDuplicates].sort((a, b) =>
        a.orderNo.localeCompare(b.orderNo),
      )
    })
    setOrderYear(getOrderYear(importedOrders[0]))
    selectProject(importedOrders[0].id)
  }

  function importExpensesFromCsv(records: CsvRecord[]) {
    const importedExpenses = records
      .filter((record) => getCsvValue(record, ['일자', '거래처', '내용']))
      .map((record) => {
        const supplyAmount = parseCsvNumber(getCsvValue(record, ['공급가액']))
        const vatAmount = parseCsvNumber(getCsvValue(record, ['부가세']))
        const amount =
          parseCsvNumber(getCsvValue(record, ['금액'])) || supplyAmount + vatAmount

        return {
          id: `e-${crypto.randomUUID()}`,
          projectId: selectedProjectId,
          date: parseCsvDate(getCsvValue(record, ['일자'])),
          kind: getCsvValue(record, ['구분']) || '기타',
          vendor: getCsvValue(record, ['거래처']),
          memo: getCsvValue(record, ['내용']),
          cardNumber: getCsvValue(record, ['카드번호']),
          supplyAmount,
          vatAmount,
          amount,
        } satisfies Expense
      })

    if (importedExpenses.length === 0) return

    setExpenses((current) => [...importedExpenses, ...current])
  }

  function importWorkLogsFromCsv(records: CsvRecord[], projectId?: string) {
    const importedWorkLogs = records
      .map((record) => {
        const orderNo = getCsvValue(record, ['수주번호'])
        const matchedProject = projectSummaries.find(
          (project) => project.orderNo === orderNo,
        )
        const targetProjectId = projectId ?? matchedProject?.id ?? selectedProjectId
        const task = getCsvValue(record, ['작업내용'])
        const worker = getCsvValue(record, ['작업자'])

        if (!worker || !task) return null

        return {
          id: `w-${crypto.randomUUID()}`,
          projectId: targetProjectId,
          date: parseCsvDate(getCsvValue(record, ['작업일', '일자'])),
          worker,
          workerType:
            getCsvValue(record, ['구분']) === '인력' ? '인력' : '직원',
          startTime: getCsvValue(record, ['작업시작', '시작']) || '08:00',
          endTime: getCsvValue(record, ['작업종료', '종료']) || '17:00',
          overtimeHours: parseCsvNumber(getCsvValue(record, ['잔업시간', '잔업'])),
          location: getCsvValue(record, ['작업장소', '장소']),
          task,
          note: getCsvValue(record, ['비고']),
          hours: parseCsvNumber(getCsvValue(record, ['작업시간', '시간'])),
        } satisfies WorkLog
      })
      .filter((workLog): workLog is WorkLog => Boolean(workLog))

    if (importedWorkLogs.length === 0) return

    setWorkLogs((current) => [...importedWorkLogs, ...current])
  }

  function renderVendorSortButton(key: VendorSortKey, label: string) {
    return (
      <button
        className="sort-button"
        type="button"
        onClick={() => updateVendorSort(key)}
      >
        {label}
        {getSortDirectionLabel(vendorSort.key === key, vendorSort.direction)}
      </button>
    )
  }

  function renderOrderSortButton(key: OrderSortKey, label: string) {
    return (
      <button
        className="sort-button"
        type="button"
        onClick={() => updateOrderSort(key)}
      >
        {label}
        {getSortDirectionLabel(orderSort.key === key, orderSort.direction)}
      </button>
    )
  }

  function renderExpenseSortButton(key: ExpenseSortKey, label: string) {
    return (
      <button
        className="sort-button"
        type="button"
        onClick={() => updateExpenseSort(key)}
      >
        {label}
        {getSortDirectionLabel(expenseSort.key === key, expenseSort.direction)}
      </button>
    )
  }

  function renderOutputButtons(
    table: ExportTable,
    onImport?: (records: CsvRecord[]) => void,
  ) {
    return (
      <div className="output-actions">
        <button
          className="ghost-button compact-button"
          disabled={table.rows.length === 0}
          type="button"
          onClick={() => exportTableToCsv(table)}
        >
          CSV 내보내기
        </button>
        {onImport && (
          <label className="ghost-button compact-button file-import-button">
            CSV 가져오기
            <input
              accept=".csv,text/csv"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) readCsvFile(file, onImport)
                event.target.value = ''
              }}
            />
          </label>
        )}
        <button
          className="ghost-button compact-button"
          disabled={table.rows.length === 0}
          type="button"
          onClick={() => printExportTable(table)}
        >
          인쇄
        </button>
      </div>
    )
  }

  function renderWorkLogSortButton(key: WorkLogSortKey, label: string) {
    return (
      <button
        className="sort-button"
        type="button"
        onClick={() => updateWorkLogSort(key)}
      >
        {label}
        {getSortDirectionLabel(workLogSort.key === key, workLogSort.direction)}
      </button>
    )
  }

  function renderProjectSortButton(key: ProjectSortKey, label: string) {
    return (
      <button
        className="sort-button"
        type="button"
        onClick={() => updateProjectSort(key)}
      >
        {label}
        {getSortDirectionLabel(projectSort.key === key, projectSort.direction)}
      </button>
    )
  }

  function renderPurchaseOrderSortButton(
    key: PurchaseOrderSortKey,
    label: string,
  ) {
    return (
      <button
        className="sort-button"
        type="button"
        onClick={() => updatePurchaseOrderSort(key)}
      >
        {label}
        {getSortDirectionLabel(
          purchaseOrderSort.key === key,
          purchaseOrderSort.direction,
        )}
      </button>
    )
  }

  function openVendorEditor() {
    const vendor = vendorRows.find((row) => row.key === selectedVendorKeys[0])

    if (!vendor || selectedVendorKeys.length !== 1) return

    setVendorForm(vendor.contact)
    setEditingVendorKey(vendor.key)
    setIsVendorModalOpen(true)
    setSelectedVendorKeys([])
  }

  function openNewVendorModal() {
    setEditingVendorKey(null)
    setVendorForm(emptyVendorContact)
    setSelectedVendorKeys([])
    setIsVendorModalOpen(true)
  }

  function closeVendorModal() {
    setEditingVendorKey(null)
    setIsVendorModalOpen(false)
  }

  function saveVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!vendorForm.company.trim()) return

    if (editingVendorKey) {
      setVendorEdits((current) => ({
        ...current,
        [editingVendorKey]: vendorForm,
      }))
      closeVendorModal()
      return
    }

    setCustomVendorContacts((current) => ({
      ...current,
      [contactTab]: [vendorForm, ...current[contactTab]],
    }))
    closeVendorModal()
  }

  function deleteSelectedVendors() {
    if (selectedVendorKeys.length === 0) return

    const canDelete = window.confirm(
      `선택한 거래처 ${selectedVendorKeys.length}건을 삭제할까요?`,
    )
    if (!canDelete) return

    setDeletedVendorKeys((current) => [
      ...new Set([...current, ...selectedVendorKeys]),
    ])
    setInactiveVendorKeys((current) =>
      current.filter((key) => !selectedVendorKeys.includes(key)),
    )
    setVendorEdits((current) => {
      const next = { ...current }
      selectedVendorKeys.forEach((key) => {
        delete next[key]
      })
      return next
    })
    setSelectedVendorKeys([])
  }

  function toggleSelectedVendorsInactive() {
    if (selectedVendorKeys.length === 0) return

    const shouldRestore = selectedVendorKeys.every((key) =>
      inactiveVendorKeys.includes(key),
    )

    setInactiveVendorKeys((current) =>
      shouldRestore
        ? current.filter((key) => !selectedVendorKeys.includes(key))
        : [...new Set([...current, ...selectedVendorKeys])],
    )
    setSelectedVendorKeys([])
  }

  function openProject(projectId: string) {
    selectProject(projectId)
    setProjectDetailTab('worklogs')
    navigateTo('project')
  }

  function openNewOrderModal() {
    setEditingOrderId(null)
    setOrderForm({
      year: orderYear === '기타' ? new Date().getFullYear().toString() : orderYear,
      orderNo: getNextOrderNo(
        orderYear === '기타' ? new Date().getFullYear().toString() : orderYear,
        orders,
      ),
      orderDate: today,
      expectedCompletionDate: today,
      manager: '',
      client1: '',
      client2: '',
      region: '',
      projectName: '',
    })
    setIsOrderModalOpen(true)
  }

  function closeOrderModal() {
    setEditingOrderId(null)
    setIsOrderModalOpen(false)
  }

  function openOrderEditor() {
    const order = orders.find((item) => item.id === selectedOrderIds[0])

    if (!order || selectedOrderIds.length !== 1) return

    setEditingOrderId(order.id)
    setOrderForm({
      year: getOrderYear(order),
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      expectedCompletionDate: order.expectedCompletionDate,
      manager: order.manager,
      client1: order.client1,
      client2: order.client2,
      region: order.region,
      projectName: order.projectName,
    })
    setIsOrderModalOpen(true)
  }

  function deleteSelectedOrders() {
    if (selectedOrderIds.length === 0) return

    const canDelete = window.confirm(
      `선택한 수주 ${selectedOrderIds.length}건을 삭제할까요?`,
    )
    if (!canDelete) return

    setOrders((current) => {
      const next = current.filter((order) => !selectedOrderIds.includes(order.id))
      if (!next.some((order) => order.id === selectedProjectId)) {
        setSelectedProjectId(next[0]?.id ?? defaultProjectId)
      }
      return next
    })
    setSelectedOrderIds([])
  }

  function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!orderForm.orderNo.trim() || !orderForm.projectName.trim()) return

    if (editingOrderId) {
      setOrders((current) =>
        current
          .map((order) =>
            order.id === editingOrderId
              ? {
                  ...order,
                  year: orderForm.year,
                  orderNo: orderForm.orderNo,
                  orderDate: orderForm.orderDate,
                  expectedCompletionDate: orderForm.expectedCompletionDate,
                  manager: orderForm.manager,
                  client1: orderForm.client1,
                  client2: orderForm.client2,
                  region: orderForm.region,
                  projectName: orderForm.projectName,
                }
              : order,
          )
          .sort((a, b) => a.orderNo.localeCompare(b.orderNo)),
      )
      setOrderYear(orderForm.year)
      setSelectedOrderIds([])
      setEditingOrderId(null)
      setIsOrderModalOpen(false)
      return
    }

    const newOrder: Order = {
      id: `o-${orderForm.orderNo}-${crypto.randomUUID()}`,
      year: orderForm.year,
      orderNo: orderForm.orderNo,
      orderDate: orderForm.orderDate,
      expectedCompletionDate: orderForm.expectedCompletionDate,
      manager: orderForm.manager,
      client1: orderForm.client1,
      client2: orderForm.client2,
      region: orderForm.region,
      projectName: orderForm.projectName,
    }

    setOrders((current) =>
      [...current, newOrder].sort((a, b) => a.orderNo.localeCompare(b.orderNo)),
    )
    setOrderYear(orderForm.year)
    setSelectedProjectId(newOrder.id)
    setExpenseForm((current) => ({ ...current, projectId: newOrder.id }))
    setWorkLogForm((current) => ({ ...current, projectId: newOrder.id }))
    setOrderForm((current) => ({
      ...current,
      orderNo: getNextOrderNo(current.year, [...orders, newOrder]),
      orderDate: today,
      expectedCompletionDate: today,
      manager: '',
      client1: '',
      client2: '',
      region: '',
      projectName: '',
    }))
    setIsOrderModalOpen(false)
    navigateTo('orders')
  }

  function openExpenseEditor() {
    const expense = expenses.find((item) => item.id === selectedExpenseIds[0])

    if (!expense || selectedExpenseIds.length !== 1) return
    const normalizedKind = normalizeExpenseKind(expense.kind)
    const isKnownKind = expenseKindOptions.includes(normalizedKind)

    setEditingExpenseId(expense.id)
    setExpenseForm({
      projectId: expense.projectId,
      date: expense.date,
      kind: isKnownKind ? normalizedKind : '기타',
      customKind: isKnownKind ? '' : normalizedKind,
      vendor: expense.vendor,
      memo: expense.memo,
      cardNumber: expense.cardNumber ?? '',
      supplyAmount: String(getExpenseSupplyAmount(expense)),
      vatAmount: String(getExpenseVatAmount(expense)),
      amount: String(expense.amount),
      manualSupplyAmount: true,
      manualVatAmount: false,
      manualAmount: false,
    })
    setIsExpenseModalOpen(true)
  }

  function deleteSelectedExpenses() {
    if (selectedExpenseIds.length === 0) return

    const canDelete = window.confirm(
      `선택한 지출 ${selectedExpenseIds.length}건을 삭제할까요?`,
    )
    if (!canDelete) return

    setExpenses((current) =>
      current.filter((expense) => !selectedExpenseIds.includes(expense.id)),
    )
    setSelectedExpenseIds([])
    setEditingExpenseId(null)
  }

  function cancelExpenseEdit() {
    setEditingExpenseId(null)
    setIsExpenseModalOpen(false)
    setExpenseForm((current) => ({
      ...current,
      projectId: selectedProjectId,
      date: today,
      kind: '법인카드',
      customKind: '',
      vendor: '',
      memo: '',
      cardNumber: '',
      supplyAmount: '',
      vatAmount: '',
      amount: '',
      manualSupplyAmount: true,
      manualVatAmount: false,
      manualAmount: false,
    }))
  }

  function getWorkLogSortValue(workLog: WorkLog, key: WorkLogSortKey) {
    if (key === 'projectOrderNo') {
      return (
        projectSummaries.find((project) => project.id === workLog.projectId)
          ?.orderNo ?? ''
      )
    }

    return workLog[key]
  }

  function openNewExpenseModal() {
    setEditingExpenseId(null)
    setExpenseForm((current) => ({
      ...current,
      projectId: selectedProjectId,
      date: today,
      kind: '법인카드',
      customKind: '',
      vendor: '',
      memo: '',
      cardNumber: '',
      supplyAmount: '',
      vatAmount: '',
      amount: '',
      manualSupplyAmount: true,
      manualVatAmount: false,
      manualAmount: false,
    }))
    setIsExpenseModalOpen(true)
  }

  function updateExpenseAmountField(
    field: 'supplyAmount' | 'vatAmount' | 'amount',
    value: string,
  ) {
    setExpenseForm((current) =>
      calculateExpenseAmountFields(field, {
        ...current,
        [field]: normalizeMoneyInput(value),
      }),
    )
  }

  function toggleExpenseAmountManual(
    field: 'manualSupplyAmount' | 'manualVatAmount' | 'manualAmount',
    checked: boolean,
  ) {
    setExpenseForm((current) => {
      const next = {
        ...current,
        [field]: checked,
      }

      if (checked && field === 'manualAmount') {
        next.manualSupplyAmount = false
        next.manualVatAmount = false
      }

      if (checked && field === 'manualSupplyAmount') {
        next.manualAmount = false
      }

      if (checked) return next

      return calculateExpenseAmountFields(
        next.manualAmount && !next.manualSupplyAmount ? 'amount' : 'supplyAmount',
        next,
      )
    })
  }

  function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const resolvedExpenseKind =
      expenseForm.kind === '기타'
        ? expenseForm.customKind.trim() || '기타'
        : expenseForm.kind
    const cardNumber = isTaxInvoiceKind(resolvedExpenseKind)
      ? ''
      : expenseForm.cardNumber
    const calculatedExpense = calculateExpenseAmountFields('supplyAmount', {
      ...expenseForm,
    })
    const supplyAmount = parseMoneyInput(
      normalizeMoneyInput(calculatedExpense.supplyAmount),
    )
    const vatAmount = parseMoneyInput(
      normalizeMoneyInput(calculatedExpense.vatAmount),
    )
    const amount = parseMoneyInput(normalizeMoneyInput(calculatedExpense.amount))

    if (!expenseForm.vendor.trim() || !amount) return

    if (editingExpenseId) {
      setExpenses((current) =>
        current.map((expense) =>
          expense.id === editingExpenseId
            ? {
                ...expense,
                projectId: expenseForm.projectId,
                date: expenseForm.date,
                kind: resolvedExpenseKind,
                vendor: expenseForm.vendor,
                memo: expenseForm.memo,
                cardNumber,
                supplyAmount,
                vatAmount,
                amount,
              }
            : expense,
        ),
      )
      setSelectedProjectId(expenseForm.projectId)
      setEditingExpenseId(null)
      setSelectedExpenseIds([])
      setExpenseForm((current) => ({
        ...current,
        kind: '법인카드',
        customKind: '',
        vendor: '',
        memo: '',
        cardNumber: '',
        supplyAmount: '',
        vatAmount: '',
        amount: '',
      }))
      setIsExpenseModalOpen(false)
      return
    }

    setExpenses((current) => [
      {
        id: crypto.randomUUID(),
        projectId: expenseForm.projectId,
        date: expenseForm.date,
        kind: resolvedExpenseKind,
        vendor: expenseForm.vendor,
        memo: expenseForm.memo,
        cardNumber,
        supplyAmount,
        vatAmount,
        amount,
      },
      ...current,
    ])
    setSelectedProjectId(expenseForm.projectId)
    setExpenseForm((current) => ({
      ...current,
      kind: '법인카드',
      customKind: '',
      vendor: '',
      memo: '',
      cardNumber: '',
      supplyAmount: '',
      vatAmount: '',
      amount: '',
    }))
    setIsExpenseModalOpen(false)
  }

  function updateWorkerCount(countText: string) {
    const count = Math.max(1, Math.min(20, Number(countText) || 1))

    setWorkLogForm((current) => ({
      ...current,
      workerCount: String(count),
      workers: Array.from({ length: count }, (_, index) =>
        current.workers[index] ? current.workers[index] : createWorkerInput(),
      ),
    }))
  }

  function updateWorkerInput(
    index: number,
    field: keyof WorkLogWorkerInput,
    value: string,
  ) {
    setWorkLogForm((current) => ({
      ...current,
      workers: current.workers.map((worker, workerIndex) =>
        workerIndex === index ? { ...worker, [field]: value } : worker,
      ),
    }))
  }

  function addWorkLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const overtimeHours = Number(workLogForm.overtimeHours) || 0
    const hours = calculateWorkHours(
      workLogForm.startTime,
      workLogForm.endTime,
      overtimeHours,
    )
    const validWorkers = workLogForm.workers
      .map((worker) => ({ ...worker, hours }))
      .filter((worker) => worker.worker.trim() && worker.hours > 0)

    if (!workLogForm.task.trim() || validWorkers.length === 0) return

    const newWorkLogs: WorkLog[] = validWorkers.map((worker) => ({
      id: crypto.randomUUID(),
      projectId: workLogForm.projectId,
      date: workLogForm.date,
      worker: worker.worker,
      workerType: worker.workerType,
      startTime: workLogForm.startTime,
      endTime: workLogForm.endTime,
      overtimeHours,
      location: workLogForm.location,
      task: workLogForm.task,
      note: workLogForm.note,
      hours: worker.hours,
    }))

    setWorkLogs((current) => [...newWorkLogs, ...current])
    setSelectedProjectId(workLogForm.projectId)
    setWorkLogForm((current) => ({
      ...current,
      workerCount: '1',
      startTime: '07:30',
      endTime: '16:30',
      overtimeHours: '0',
      location: '',
      task: '',
      note: '',
      workers: [createWorkerInput()],
    }))
    setIsWorkLogModalOpen(false)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-home" type="button" aria-label="홈으로 이동" onClick={() => navigateTo('home')}>
          <span className="brand-symbol" aria-hidden="true">c<span>.</span></span>
          <span className="brand-wordmark">창조이엔지<small>CONSTRUCTION WORKSPACE</small></span>
        </button>
        <div className="workspace-label"><span className="workspace-avatar">CJ</span><span>공사 관리 워크스페이스<small>CHANGJO ENGINEERING</small></span></div>
        <p className="nav-caption">워크스페이스</p>
        <nav className="nav-tabs" aria-label="주요 메뉴">
          {([
            ['home', '홈'], ['orders', '수주대장'], ['dashboard', '공사현황'],
            ['expenses', '지출내역'], ['worklogs', '작업일보'], ['contacts', '거래처내역'],
          ] as const).map(([target, label]) => (
            <button key={target} className={view === target || (target === 'worklogs' && view === 'worklogList') ? 'active' : ''}
              aria-current={view === target || (target === 'worklogs' && view === 'worklogList') ? 'page' : undefined}
              type="button" onClick={() => navigateTo(target)}>
              <Icon name={target} /><span>{label}</span>{target === 'orders' && <small>{orders.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note"><span className="note-mark">✳</span><strong>현장의 모든 흐름을 한곳에.</strong><p>수주부터 작업일보까지,<br />더 가볍고 명확하게 관리하세요.</p><button type="button" onClick={() => navigateTo('worklogs')}>작업일보 열기 <Icon name="arrow" /></button></div>
        <div className="sidebar-footer"><span className="workspace-avatar">창</span><span>주식회사 창조이엔지<small>공사 관리 시스템</small></span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {view === 'home'
                ? '홈'
                : view === 'orders'
                ? '수주대장'
                : view === 'project'
                  ? '공사 상세'
                  : view === 'contacts'
                    ? '거래처 내역'
                    : view === 'dashboard'
                      ? '공사현황'
                      : view === 'expenses'
                        ? '지출내역'
                        : view === 'worklogList'
                          ? '작업일보 전체조회'
                        : '작업일보'}
            </p>
            <h2>
              {view === 'home'
                ? '전체 현황'
                : view === 'orders'
                ? `${orderYear}년 수주대장`
                : view === 'contacts'
                  ? '거래처 내역'
                  : view === 'dashboard'
                    ? `${orderYear}년 공사별 원가 현황`
                    : view === 'expenses'
                      ? `${orderYear}년 공사 내역`
                      : view === 'worklogList'
                        ? '작업일보 전체조회'
                      : view === 'worklogs'
                        ? '작업일보 달력'
                        : selectedProject?.projectName}
            </h2>
          </div>
          <div className="topbar-actions">
            {view === 'home' ? (
              <>
                <span>진행중 {activeProjectCount}건</span>
                <span>전체 {orders.length}건</span>
              </>
            ) : view === 'contacts' ? (
              <>
                <span>
                  물품구입처{' '}
                  {purchaseVendorContacts.length +
                    customVendorContacts.purchase.length}
                  건
                </span>
                <span>
                  발주처 {orderVendorContacts.length + customVendorContacts.order.length}
                  건
                </span>
              </>
            ) : view === 'orders' ||
              view === 'dashboard' ||
              view === 'expenses' ? (
              <div className="year-switch" aria-label="수주년도">
                {orderYears.map((year) => (
                  <button
                    className={orderYear === year ? 'active' : ''}
                    key={year}
                    type="button"
                    onClick={() => switchOrderYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            ) : view === 'worklogList' ? (
              <>
                <span>{filteredWorkLogsForList.length}건</span>
                <span>
                  {workLogListYear === 'all' ? '전체년도' : `${workLogListYear}년`}
                </span>
              </>
            ) : view === 'worklogs' ? null : (
              <>
                <span>{selectedProject?.orderNo}</span>
                <span>{selectedProject?.client1}</span>
                <span>{selectedProject?.region}</span>
              </>
            )}
          </div>
          {view === 'project' && (
            <button className="list-button" type="button" onClick={goToList}>
              목록
            </button>
          )}
        </header>

        {view === 'home' && (
          <section className="home-view">
            <section className="welcome-banner">
              <div><p className="section-kicker">YOUR WORK, IN VIEW</p><h1>오늘의 현장, 한눈에.</h1><p>진행 중인 공사와 지출 흐름을 살펴보고<br className="mobile-break" /> 다음 업무를 시작하세요.</p><button className="welcome-action" type="button" onClick={openNewOrderModal}><Icon name="plus" /> 수주 등록하기 <Icon name="arrow" /></button></div>
              <div className="progress-visual"><div className="progress-ring" role="img" aria-label={`전체 수주 중 진행 중 공사 ${activeProjectCount}건`} style={{ background: `conic-gradient(#527d25 0% ${orders.length ? activeProjectCount / orders.length * 100 : 0}%, #d6e9ad 0% 100%)` }}><div><span>진행 중인 공사</span><strong>{activeProjectCount}<small>건</small></strong><span>전체 {orders.length}건 중</span></div></div><span className="visual-caption"><i /> 현장 진행 현황</span></div>
            </section>
            <div className="section-label"><h3>전체 업무 요약</h3><span>모든 연도 기준</span></div>
            <section className="metric-grid" aria-label="전체 요약">
              <article><div className="metric-icon"><Icon name="orders" /></div>
                <span>전체 수주</span>
                <strong>{orders.length}건</strong>
              </article>
              <article><div className="metric-icon"><Icon name="dashboard" /></div>
                <span>진행중 공사</span>
                <strong>{activeProjectCount}건</strong>
              </article>
              <article><div className="metric-icon"><Icon name="expenses" /></div>
                <span>전체 공사비</span>
                <strong>{formatMoney(totalCost)}</strong>
              </article>
              <article><div className="metric-icon"><Icon name="contacts" /></div>
                <span>전체 공수</span>
                <strong>{(totalHours / 8).toFixed(2)}명</strong>
              </article>
            </section>

            <section className="home-grid">
              <article className="panel home-panel">
                <div className="panel-heading">
                  <div>
                    <h3>최근 수주</h3>
                    <span>최근 등록된 공사 기준</span>
                  </div>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => navigateTo('orders')}
                  >
                    전체보기
                  </button>
                </div>
                <div className="home-list">
                  {recentProjects.map((project) => (
                    <button
                      className="home-list-item"
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project.id)}
                    >
                      <span>
                        <strong>{project.projectName}</strong>
                        <small>
                          {project.orderNo} · {project.client1}
                        </small>
                      </span>
                      <em>{project.status}</em>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel home-panel">
                <div className="panel-heading">
                  <div>
                    <h3>공사비 상위</h3>
                    <span>지출금액 기준</span>
                  </div>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => navigateTo('dashboard')}
                  >
                    현황보기
                  </button>
                </div>
                <div className="home-list cost-list">
                  {highCostProjects.map((project) => (
                    <button
                      className="home-list-item"
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project.id)}
                    >
                      <span>
                        <strong>{project.projectName}</strong>
                        <small>{project.region}</small><span className="cost-track" aria-hidden="true"><span style={{ width: `${project.cost / Math.max(1, ...highCostProjects.map(item => item.cost)) * 100}%` }} /></span>
                      </span>
                      <b>{formatMoney(project.cost)}</b>
                    </button>
                  ))}
                </div>
              </article>
            </section>

            <section className="home-shortcuts" aria-label="빠른 업무 시작">
              {([['orders', '수주대장', '새로운 공사의 시작'], ['expenses', '지출내역', '꼼꼼하게 살피는 공사비'], ['worklogs', '작업일보', '매일 쌓이는 현장 기록'], ['contacts', '거래처 확인', '함께하는 파트너']] as const).map(([target, label, description]) => <button key={target} type="button" onClick={() => navigateTo(target)}><Icon name={target} /><span><strong>{label}</strong><small>{description}</small></span><Icon name="arrow" /></button>)}
            </section>
          </section>
        )}

        {view === 'contacts' && (
          <section className="content-grid single">
            <div className="panel wide">
              <div className="panel-heading">
                <div>
                  <h3>거래처 내역</h3>
                  <span>물품구입처와 발주처 탭만 표시</span>
                </div>
                <div className="contact-tabs" aria-label="거래처 구분">
                  <button
                    className={contactTab === 'purchase' ? 'active' : ''}
                    type="button"
                    onClick={() => switchContactTab('purchase')}
                  >
                    물품구입처
                    <span>
                      {purchaseVendorContacts.length +
                        customVendorContacts.purchase.length}
                      건
                    </span>
                  </button>
                  <button
                    className={contactTab === 'order' ? 'active' : ''}
                    type="button"
                    onClick={() => switchContactTab('order')}
                  >
                    발주처
                    <span>
                      {orderVendorContacts.length + customVendorContacts.order.length}
                      건
                    </span>
                  </button>
                </div>
              </div>

              <div className="table-toolbar">
                <label className="search-control">
                  <span>검색</span>
                  <select
                    value={vendorSearchScope}
                    onChange={(event) =>
                      setVendorSearchScope(
                        event.target.value as VendorSearchScope,
                      )
                    }
                  >
                    <option value="all">전체</option>
                    <option value="company">업체명</option>
                    <option value="contact">이름</option>
                    {contactTab === 'purchase' && (
                      <option value="item">취급품목</option>
                    )}
                  </select>
                  <input
                    value={vendorSearchText}
                    onChange={(event) => setVendorSearchText(event.target.value)}
                    placeholder="검색어 입력"
                  />
                </label>
                <span>
                  표시 {vendorRows.length}건 / 전체 {activeVendorContacts.length}
                  건
                </span>
              </div>

              <div className="contact-actions">
                <span>선택 {selectedVendorCount}건</span>
                <div>
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={openNewVendorModal}
                  >
                    {contactTab === 'purchase' ? '물품구입처 등록' : '발주처 등록'}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={selectedVendorCount !== 1}
                    type="button"
                    onClick={openVendorEditor}
                  >
                    수정
                  </button>
                  <button
                    className="ghost-button"
                    disabled={selectedVendorCount === 0}
                    type="button"
                    onClick={deleteSelectedVendors}
                  >
                    삭제
                  </button>
                  <button
                    className="primary-button compact-button"
                    disabled={selectedVendorCount === 0}
                    type="button"
                    onClick={toggleSelectedVendorsInactive}
                  >
                    미사용
                  </button>
                  {renderOutputButtons(contactsExportTable)}
                </div>
              </div>

              <div className="table-wrap contacts-scroll">
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <label className="select-all-cell">
                          <input
                            aria-label="전체선택"
                            checked={allVendorsSelected}
                            type="checkbox"
                            onChange={toggleAllVendors}
                          />
                        </label>
                      </th>
                      <th>{renderVendorSortButton('company', '업체명')}</th>
                      <th>{renderVendorSortButton('contact', '이름')}</th>
                      <th>{renderVendorSortButton('mobile', 'H.P')}</th>
                      <th>{renderVendorSortButton('tel', 'TEL')}</th>
                      <th>{renderVendorSortButton('fax', 'FAX')}</th>
                      <th>{renderVendorSortButton('email', 'E-Mail')}</th>
                      <th>{renderVendorSortButton('address', '주소')}</th>
                      {contactTab === 'purchase' && (
                        <th>{renderVendorSortButton('item', '취급품목')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {vendorRows.map(({ contact, key: vendorKey }, index) => {
                      const isInactive = inactiveVendorKeys.includes(vendorKey)
                      const isSelected = selectedVendorKeys.includes(vendorKey)

                      return (
                        <tr
                          className={isInactive ? 'inactive-row' : ''}
                          key={vendorKey}
                        >
                          <td className="check-cell">
                            <input
                              aria-label={`선택 ${
                                contact.company || index + 1
                              }`}
                              checked={isSelected}
                              type="checkbox"
                              onChange={() => toggleSelectedVendor(vendorKey)}
                            />
                          </td>
                          <td>{contact.company || '-'}</td>
                          <td>{contact.contact || '-'}</td>
                          <td>{contact.mobile || '-'}</td>
                          <td>{contact.tel || '-'}</td>
                          <td>{contact.fax || '-'}</td>
                          <td>{contact.email || '-'}</td>
                          <td>{contact.address || '-'}</td>
                          {contactTab === 'purchase' && (
                            <td>{contact.item || '-'}</td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {isVendorModalOpen && (
                <div className="modal-backdrop" role="presentation">
                  <form
                    className="modal-panel form-panel"
                    onSubmit={saveVendor}
                  >
                    <div className="modal-heading">
                      <div>
                        <h3>{editingVendorKey ? '거래처 수정' : '거래처 등록'}</h3>
                        <span>{vendorForm.company || '업체명 없음'}</span>
                      </div>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={closeVendorModal}
                      >
                        닫기
                      </button>
                    </div>

                    <div className="two-columns">
                      <label>
                        업체명
                        <input
                          value={vendorForm.company}
                          onChange={(event) =>
                            setVendorForm({
                              ...vendorForm,
                              company: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        이름
                        <input
                          value={vendorForm.contact}
                          onChange={(event) =>
                            setVendorForm({
                              ...vendorForm,
                              contact: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="three-columns">
                      <label>
                        H.P
                        <input
                          value={vendorForm.mobile}
                          onChange={(event) =>
                            setVendorForm({
                              ...vendorForm,
                              mobile: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        TEL
                        <input
                          value={vendorForm.tel}
                          onChange={(event) =>
                            setVendorForm({
                              ...vendorForm,
                              tel: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        FAX
                        <input
                          value={vendorForm.fax}
                          onChange={(event) =>
                            setVendorForm({
                              ...vendorForm,
                              fax: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <label>
                      E-Mail
                      <input
                        value={vendorForm.email}
                        onChange={(event) =>
                          setVendorForm({
                            ...vendorForm,
                            email: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      주소
                      <input
                        value={vendorForm.address}
                        onChange={(event) =>
                          setVendorForm({
                            ...vendorForm,
                            address: event.target.value,
                          })
                        }
                      />
                    </label>
                    {contactTab === 'purchase' && (
                      <label>
                        취급품목
                        <input
                          value={vendorForm.item}
                          onChange={(event) =>
                            setVendorForm({
                              ...vendorForm,
                              item: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}

                    <div className="modal-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={closeVendorModal}
                      >
                        취소
                      </button>
                      <button className="primary-button" type="submit">
                        {editingVendorKey ? '저장' : '등록'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'orders' && (
          <section className="content-grid single">
            <div className="panel wide">
              <div className="panel-heading">
                <div>
                  <h3>수주대장</h3>
                  <span>공사명을 클릭하면 해당 공사 상세로 이동</span>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={openNewOrderModal}
                >
                  수주 등록
                </button>
              </div>
              <div className="contact-actions">
                <span>선택 {selectedOrderCount}건</span>
                <div>
                  <button
                    className="ghost-button"
                    disabled={selectedOrderCount !== 1}
                    type="button"
                    onClick={openOrderEditor}
                  >
                    수정
                  </button>
                  <button
                    className="ghost-button"
                    disabled={selectedOrderCount === 0}
                    type="button"
                    onClick={deleteSelectedOrders}
                  >
                    삭제
                  </button>
                  {renderOutputButtons(ordersExportTable, importOrdersFromCsv)}
                </div>
              </div>
              <div className="table-wrap">
                <table className="orders-table">
                  <colgroup>
                    <col className="orders-col-check" />
                    <col className="orders-col-year" />
                    <col className="orders-col-order-no" />
                    <col className="orders-col-date" />
                    <col className="orders-col-date" />
                    <col className="orders-col-status" />
                    <col className="orders-col-manager" />
                    <col className="orders-col-client" />
                    <col className="orders-col-client" />
                    <col className="orders-col-region" />
                    <col className="orders-col-project" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <label className="select-all-cell">
                          <input
                            aria-label="수주 전체선택"
                            checked={allOrdersSelected}
                            type="checkbox"
                            onChange={toggleAllOrders}
                          />
                        </label>
                      </th>
                      <th>{renderOrderSortButton('year', '년도')}</th>
                      <th>{renderOrderSortButton('orderNo', '수주번호')}</th>
                      <th>{renderOrderSortButton('orderDate', '수주일자')}</th>
                      <th>
                        {renderOrderSortButton(
                          'expectedCompletionDate',
                          '준공예정일',
                        )}
                      </th>
                      <th>상태</th>
                      <th>{renderOrderSortButton('manager', '담당자')}</th>
                      <th>{renderOrderSortButton('client1', '수주처1')}</th>
                      <th>{renderOrderSortButton('client2', '수주처2')}</th>
                      <th>{renderOrderSortButton('region', '공사지역')}</th>
                      <th>{renderOrderSortButton('projectName', '공사명')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="check-cell">
                          <input
                            aria-label={`수주 선택 ${order.orderNo}`}
                            checked={selectedOrderIds.includes(order.id)}
                            type="checkbox"
                            onChange={() => toggleSelectedOrder(order.id)}
                          />
                        </td>
                        <td className="order-center">{getOrderYear(order)}</td>
                        <td className="order-center">{order.orderNo}</td>
                        <td className="order-center">{order.orderDate}</td>
                        <td className="order-center">
                          {order.expectedCompletionDate}
                        </td>
                        <td className="order-center">
                          <span className="status">{getProjectStatus(order)}</span>
                        </td>
                        <td className="order-center">{order.manager}</td>
                        <td className="order-center">{order.client1}</td>
                        <td className="order-center">{order.client2}</td>
                        <td className="order-center">{order.region}</td>
                        <td className="order-project-name">
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => openProject(order.id)}
                          >
                            {order.projectName}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {isOrderModalOpen && (
          <div className="modal-backdrop" role="presentation">
            <form className="modal-panel form-panel" onSubmit={addOrder}>
              <div className="modal-heading">
                <div>
                  <h3>{editingOrderId ? '수주 수정' : '수주 등록'}</h3>
                  <span>
                    {editingOrderId
                      ? '선택한 수주 내용을 수정'
                      : '수주대장에 새 공사를 추가'}
                  </span>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeOrderModal}
                >
                  닫기
                </button>
              </div>

              <div className="three-columns">
                <label>
                  년도
                  <input
                    maxLength={4}
                    value={orderForm.year}
                    onChange={(event) => {
                      const year = event.target.value
                      setOrderForm({
                        ...orderForm,
                        year,
                        orderNo:
                          editingOrderId || year.length !== 4
                            ? orderForm.orderNo
                            : getNextOrderNo(year, orders),
                      })
                    }}
                    placeholder="예: 2026"
                  />
                </label>
                <label>
                  수주번호
                  <input
                    value={orderForm.orderNo}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        orderNo: event.target.value,
                      })
                    }
                    placeholder="예: 26001"
                  />
                </label>
                <label>
                  수주일자
                  <input
                    type="date"
                    value={orderForm.orderDate}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        orderDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  준공예정일
                  <input
                    type="date"
                    value={orderForm.expectedCompletionDate}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        expectedCompletionDate: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="two-columns">
                <label>
                  담당자
                  <input
                    value={orderForm.manager}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        manager: event.target.value,
                      })
                    }
                    placeholder="예: 김현수"
                  />
                </label>
                <label>
                  공사지역
                  <input
                    value={orderForm.region}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        region: event.target.value,
                      })
                    }
                    placeholder="예: 경기 화성"
                  />
                </label>
              </div>

              <div className="two-columns">
                <label>
                  수주처1
                  <input
                    value={orderForm.client1}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        client1: event.target.value,
                      })
                    }
                    placeholder="예: 한빛산업"
                  />
                </label>
                <label>
                  수주처2
                  <input
                    value={orderForm.client2}
                    onChange={(event) =>
                      setOrderForm({
                        ...orderForm,
                        client2: event.target.value,
                      })
                    }
                    placeholder="예: 환경안전팀"
                  />
                </label>
              </div>

              <label>
                공사명
                <input
                  value={orderForm.projectName}
                  onChange={(event) =>
                    setOrderForm({
                      ...orderForm,
                      projectName: event.target.value,
                    })
                  }
                  placeholder="예: 대기방지시설 개선공사"
                />
              </label>

              <div className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeOrderModal}
                >
                  취소
                </button>
                <button className="primary-button" type="submit">
                  {editingOrderId ? '수정 저장' : '수주 추가'}
                </button>
              </div>
            </form>
          </div>
        )}

        {view === 'project' && selectedProject && (
          <section className="detail-stack">
            <section className="project-hero">
              <div>
                <p className="eyebrow">공사 기본정보</p>
                <h3>{selectedProject.projectName}</h3>
              </div>
              <dl>
                <div>
                  <dt>수주번호</dt>
                  <dd>{selectedProject.orderNo}</dd>
                </div>
                <div>
                  <dt>담당자</dt>
                  <dd>{selectedProject.manager}</dd>
                </div>
                <div>
                  <dt>준공예정일</dt>
                  <dd>{selectedProject.expectedCompletionDate}</dd>
                </div>
                <div>
                  <dt>공사지역</dt>
                  <dd>{selectedProject.region}</dd>
                </div>
              </dl>
            </section>

            <section className="metric-grid project-metrics">
              <article>
                <span>작업시간</span>
                <strong>{selectedProject.hours.toFixed(1)}h</strong>
              </article>
              <article>
                <span>작업공수</span>
                <strong>{selectedProject.manDays.toFixed(2)}명</strong>
              </article>
              <article>
                <span>지출금액</span>
                <strong>{formatMoney(selectedProject.cost)}</strong>
              </article>
              <article>
                <span>발주금액</span>
                <strong>{formatMoney(selectedProject.purchaseAmount)}</strong>
              </article>
            </section>

            <section className="panel tab-panel">
              <div className="detail-tabs" aria-label="공사 상세 데이터">
                <button
                  className={projectDetailTab === 'worklogs' ? 'active' : ''}
                  type="button"
                  onClick={() => setProjectDetailTab('worklogs')}
                >
                  작업일보
                  <span>{selectedProject.manDays.toFixed(2)}명</span>
                </button>
                <button
                  className={projectDetailTab === 'expenses' ? 'active' : ''}
                  type="button"
                  onClick={() => setProjectDetailTab('expenses')}
                >
                  지출내역
                  <span>{formatMoney(selectedProject.cost)}</span>
                </button>
                <button
                  className={projectDetailTab === 'purchases' ? 'active' : ''}
                  type="button"
                  onClick={() => setProjectDetailTab('purchases')}
                >
                  발주내역
                  <span>{formatMoney(selectedProject.purchaseAmount)}</span>
                </button>
              </div>

              {projectDetailTab === 'worklogs' && (
                <>
                  <div className="panel-heading">
                    <h3>작업일보 및 작업공수</h3>
                    <span>작업시간을 8시간 기준 공수로 환산</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{renderWorkLogSortButton('date', '작업일')}</th>
                          <th>{renderWorkLogSortButton('worker', '작업자')}</th>
                          <th>{renderWorkLogSortButton('workerType', '구분')}</th>
                          <th>{renderWorkLogSortButton('startTime', '작업시작')}</th>
                          <th>{renderWorkLogSortButton('endTime', '작업종료')}</th>
                          <th>{renderWorkLogSortButton('overtimeHours', '잔업')}</th>
                          <th>{renderWorkLogSortButton('location', '작업장소')}</th>
                          <th>{renderWorkLogSortButton('task', '작업내용')}</th>
                          <th>{renderWorkLogSortButton('note', '비고')}</th>
                          <th>{renderWorkLogSortButton('hours', '작업시간')}</th>
                          <th>{renderWorkLogSortButton('hours', '공수')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkLogs.map((workLog) => (
                          <tr key={workLog.id}>
                            <td>{workLog.date}</td>
                            <td>{workLog.worker}</td>
                            <td>{workLog.workerType}</td>
                            <td>{workLog.startTime}</td>
                            <td>{workLog.endTime}</td>
                            <td>{workLog.overtimeHours.toFixed(1)}h</td>
                            <td>{workLog.location || '-'}</td>
                            <td>{workLog.task}</td>
                            <td>{workLog.note || '-'}</td>
                            <td>{workLog.hours.toFixed(1)}h</td>
                            <td>{(workLog.hours / 8).toFixed(2)}명</td>
                          </tr>
                        ))}
                        {filteredWorkLogs.length === 0 && (
                          <tr>
                            <td colSpan={11}>등록된 작업일보가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {projectDetailTab === 'expenses' && (
                <>
                  <div className="panel-heading">
                    <h3>공사비용 지출내역</h3>
                    <span>카드사용 및 세금계산서</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{renderExpenseSortButton('date', '일자')}</th>
                          <th>{renderExpenseSortButton('vendor', '거래처')}</th>
                          <th>{renderExpenseSortButton('memo', '내용')}</th>
                          <th>
                            {renderExpenseSortButton('supplyAmount', '공급가액')}
                          </th>
                          <th>{renderExpenseSortButton('vatAmount', '부가세')}</th>
                          <th>{renderExpenseSortButton('amount', '금액')}</th>
                          <th>{renderExpenseSortButton('kind', '구분')}</th>
                          <th>{renderExpenseSortButton('cardNumber', '카드번호')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpenses.map((expense) => (
                          <tr key={expense.id}>
                            <td>{formatTableDate(expense.date)}</td>
                            <td>{expense.vendor}</td>
                            <td className="expense-content">{expense.memo || '-'}</td>
                            <td className="numeric-cell">
                              {formatNumber(getExpenseSupplyAmount(expense))}
                            </td>
                            <td className="numeric-cell">
                              {formatNumber(getExpenseVatAmount(expense))}
                            </td>
                            <td className="numeric-cell">
                              {formatNumber(expense.amount)}
                            </td>
                            <td>{normalizeExpenseKind(expense.kind)}</td>
                            <td>{expense.cardNumber || '-'}</td>
                          </tr>
                        ))}
                        {filteredExpenses.length === 0 && (
                          <tr>
                            <td colSpan={8}>등록된 지출내역이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                      {filteredExpenses.length > 0 && (
                        <tfoot>
                          <tr>
                            <td colSpan={3}>총합</td>
                            <td className="numeric-cell">
                              {formatNumber(expenseTotals.supplyAmount)}
                            </td>
                            <td className="numeric-cell">
                              {formatNumber(expenseTotals.vatAmount)}
                            </td>
                            <td className="numeric-cell">
                              {formatNumber(expenseTotals.amount)}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}

              {projectDetailTab === 'purchases' && (
                <>
                  <div className="panel-heading">
                    <h3>발주 내역</h3>
                    <span>이 공사에 연결된 발주서 내용</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            {renderPurchaseOrderSortButton('orderDate', '발주일')}
                          </th>
                          <th>{renderPurchaseOrderSortButton('vendor', '발주처')}</th>
                          <th>{renderPurchaseOrderSortButton('item', '품목')}</th>
                          <th>{renderPurchaseOrderSortButton('quantity', '수량')}</th>
                          <th>{renderPurchaseOrderSortButton('status', '상태')}</th>
                          <th>{renderPurchaseOrderSortButton('amount', '금액')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPurchaseOrders.map((purchaseOrder) => (
                          <tr key={purchaseOrder.id}>
                            <td>{purchaseOrder.orderDate}</td>
                            <td>{purchaseOrder.vendor}</td>
                            <td>{purchaseOrder.item}</td>
                            <td>{purchaseOrder.quantity}</td>
                            <td>
                              <span className="status">
                                {purchaseOrder.status}
                              </span>
                            </td>
                            <td>{formatMoney(purchaseOrder.amount)}</td>
                          </tr>
                        ))}
                        {filteredPurchaseOrders.length === 0 && (
                          <tr>
                            <td colSpan={6}>등록된 발주 내역이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </section>
        )}

        {view === 'dashboard' && (
          <section className="content-grid">
            <div className="panel wide">
              <div className="panel-heading">
                <h3>공사별 현황</h3>
                {renderOutputButtons(dashboardExportTable)}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{renderProjectSortButton('orderNo', '수주번호')}</th>
                      <th>{renderProjectSortButton('projectName', '공사명')}</th>
                      <th>{renderProjectSortButton('client1', '수주처')}</th>
                      <th>{renderProjectSortButton('region', '공사지역')}</th>
                      <th>{renderProjectSortButton('cost', '지출금액')}</th>
                      <th>{renderProjectSortButton('manDays', '작업공수')}</th>
                      <th>
                        {renderProjectSortButton('purchaseAmount', '발주금액')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyProjectSummaries.map((project) => (
                      <tr
                        className={
                          project.id === selectedProjectId ? 'selected-row' : ''
                        }
                        key={project.id}
                      >
                        <td>{project.orderNo}</td>
                        <td>
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => selectProject(project.id)}
                          >
                            {project.projectName}
                          </button>
                        </td>
                        <td>{project.client1}</td>
                        <td>{project.region}</td>
                        <td>{formatMoney(project.cost)}</td>
                        <td>{project.manDays.toFixed(2)}명</td>
                        <td>{formatMoney(project.purchaseAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h3>선택 공사 요약</h3>
                <span>{selectedProject?.orderNo}</span>
              </div>
              <dl className="summary-list">
                <div>
                  <dt>지출금액</dt>
                  <dd>{formatMoney(selectedProject?.cost ?? 0)}</dd>
                </div>
                <div>
                  <dt>작업시간</dt>
                  <dd>{(selectedProject?.hours ?? 0).toFixed(1)}h</dd>
                </div>
                <div>
                  <dt>환산 공수</dt>
                  <dd>{(selectedProject?.manDays ?? 0).toFixed(2)}명</dd>
                </div>
                <div>
                  <dt>발주금액</dt>
                  <dd>{formatMoney(selectedProject?.purchaseAmount ?? 0)}</dd>
                </div>
              </dl>
            </div>
          </section>
        )}

        {view === 'expenses' && (
          <section className="content-grid single">
            <div className="panel full">
              <div className="panel-heading">
                <h3>{orderYear}년 공사 내역</h3>
                <span>공사를 선택하면 지출내역이 표시됩니다</span>
              </div>
              <label className="project-select-control">
                공사 선택
                <select
                  value={selectedProjectId}
                  onChange={(event) => selectProject(event.target.value)}
                >
                  {yearlyProjectSummaries.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.orderNo} · {project.projectName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="panel full">
              <div className="panel-heading">
                <h3>선택 공사 지출내역</h3>
                <span>{formatMoney(selectedProject?.cost ?? 0)}</span>
              </div>
              <div className="contact-actions">
                <span>선택 {selectedExpenseCount}건</span>
                <div>
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={openNewExpenseModal}
                  >
                    지출 등록
                  </button>
                  <button
                    className="ghost-button"
                    disabled={selectedExpenseCount !== 1}
                    type="button"
                    onClick={openExpenseEditor}
                  >
                    수정
                  </button>
                  <button
                    className="ghost-button"
                    disabled={selectedExpenseCount === 0}
                    type="button"
                    onClick={deleteSelectedExpenses}
                  >
                    삭제
                  </button>
                  {renderOutputButtons(expensesExportTable, importExpensesFromCsv)}
                </div>
              </div>
              <div className="table-wrap">
                <table className="expenses-table">
                  <colgroup>
                    <col className="expenses-col-check" />
                    <col className="expenses-col-date" />
                    <col className="expenses-col-vendor" />
                    <col className="expenses-col-memo" />
                    <col className="expenses-col-amount" />
                    <col className="expenses-col-amount" />
                    <col className="expenses-col-amount" />
                    <col className="expenses-col-kind" />
                    <col className="expenses-col-card" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <label className="select-all-cell">
                          <input
                            aria-label="지출 전체선택"
                            checked={allExpensesSelected}
                            type="checkbox"
                            onChange={toggleAllExpenses}
                          />
                        </label>
                      </th>
                      <th>{renderExpenseSortButton('date', '일자')}</th>
                      <th>{renderExpenseSortButton('vendor', '거래처')}</th>
                      <th>{renderExpenseSortButton('memo', '내용')}</th>
                      <th>{renderExpenseSortButton('supplyAmount', '공급가액')}</th>
                      <th>{renderExpenseSortButton('vatAmount', '부가세')}</th>
                      <th>{renderExpenseSortButton('amount', '금액')}</th>
                      <th>{renderExpenseSortButton('kind', '구분')}</th>
                      <th>{renderExpenseSortButton('cardNumber', '카드번호')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td className="check-cell">
                          <input
                            aria-label={`지출 선택 ${expense.vendor}`}
                            checked={selectedExpenseIds.includes(expense.id)}
                            type="checkbox"
                            onChange={() => toggleSelectedExpense(expense.id)}
                          />
                        </td>
                        <td className="expense-center">{formatTableDate(expense.date)}</td>
                        <td className="expense-center">{expense.vendor}</td>
                        <td className="expense-content">{expense.memo || '-'}</td>
                        <td className="numeric-cell">
                          {formatNumber(getExpenseSupplyAmount(expense))}
                        </td>
                        <td className="numeric-cell">
                          {formatNumber(getExpenseVatAmount(expense))}
                        </td>
                        <td className="numeric-cell">
                          {formatNumber(expense.amount)}
                        </td>
                        <td className="expense-center">
                          {normalizeExpenseKind(expense.kind)}
                        </td>
                        <td className="expense-center">{expense.cardNumber || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredExpenses.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={4}>총합</td>
                        <td className="numeric-cell">
                          {formatNumber(expenseTotals.supplyAmount)}
                        </td>
                        <td className="numeric-cell">
                          {formatNumber(expenseTotals.vatAmount)}
                        </td>
                        <td className="numeric-cell">
                          {formatNumber(expenseTotals.amount)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {isExpenseModalOpen && (
              <div className="modal-backdrop" role="presentation">
                <form className="modal-panel form-panel" onSubmit={addExpense}>
                  <div className="modal-heading">
                    <div>
                      <h3>{editingExpenseId ? '지출 수정' : '지출 등록'}</h3>
                      <span>카드사용 또는 세금계산서</span>
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={cancelExpenseEdit}
                    >
                      닫기
                    </button>
                  </div>
                  <label>
                    공사
                    <select
                      value={expenseForm.projectId}
                      onChange={(event) =>
                        setExpenseForm({
                          ...expenseForm,
                          projectId: event.target.value,
                        })
                      }
                    >
                      {yearlyProjectSummaries.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.orderNo} · {order.projectName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="two-columns">
                    <label>
                      사용일
                      <input
                        type="date"
                        value={expenseForm.date}
                        onChange={(event) =>
                          setExpenseForm({
                            ...expenseForm,
                            date: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      구분
                      <select
                        value={expenseForm.kind}
                        onChange={(event) =>
                          setExpenseForm({
                            ...expenseForm,
                            kind: event.target.value,
                            cardNumber: isTaxInvoiceKind(event.target.value)
                              ? ''
                              : expenseForm.cardNumber,
                          })
                        }
                      >
                        {expenseKindOptions.map((kind) => (
                          <option key={kind}>{kind}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {expenseForm.kind === '기타' && (
                    <label>
                      기타 구분
                      <input
                        value={expenseForm.customKind}
                        onChange={(event) =>
                          setExpenseForm({
                            ...expenseForm,
                            customKind: event.target.value,
                          })
                        }
                        placeholder="구분 입력"
                      />
                    </label>
                  )}
                  <div className="two-columns">
                    <label>
                      거래처
                      <input
                        value={expenseForm.vendor}
                        onChange={(event) =>
                          setExpenseForm({
                            ...expenseForm,
                            vendor: event.target.value,
                          })
                        }
                        placeholder="예: 대성철물"
                      />
                    </label>
                    <label>
                      카드번호
                      <input
                        disabled={isTaxInvoiceKind(expenseForm.kind)}
                        value={expenseForm.cardNumber}
                        onChange={(event) =>
                          setExpenseForm({
                            ...expenseForm,
                            cardNumber: event.target.value,
                          })
                        }
                        placeholder="카드번호"
                      />
                    </label>
                  </div>
                  <div className="three-columns amount-fields">
                    <label>
                      <span className="manual-field-label">
                        공급가액
                        <input
                          aria-label="공급가액 직접 입력"
                          checked={expenseForm.manualSupplyAmount}
                          type="checkbox"
                          onChange={(event) =>
                            toggleExpenseAmountManual(
                              'manualSupplyAmount',
                              event.target.checked,
                            )
                          }
                        />
                      </span>
                      <input
                        disabled={!expenseForm.manualSupplyAmount}
                        inputMode="numeric"
                        type="text"
                        value={formatMoneyInput(expenseForm.supplyAmount)}
                        onChange={(event) =>
                          updateExpenseAmountField(
                            'supplyAmount',
                            event.target.value,
                          )
                        }
                        placeholder="공급가액"
                      />
                    </label>
                    <label>
                      <span className="manual-field-label">
                        부가세
                        <input
                          aria-label="부가세 직접 입력"
                          checked={expenseForm.manualVatAmount}
                          type="checkbox"
                          onChange={(event) =>
                            toggleExpenseAmountManual(
                              'manualVatAmount',
                              event.target.checked,
                            )
                          }
                        />
                      </span>
                      <input
                        disabled={!expenseForm.manualVatAmount}
                        inputMode="numeric"
                        type="text"
                        value={formatMoneyInput(expenseForm.vatAmount)}
                        onChange={(event) =>
                          updateExpenseAmountField('vatAmount', event.target.value)
                        }
                        placeholder="부가세"
                      />
                    </label>
                    <label>
                      <span className="manual-field-label">
                        금액
                        <input
                          aria-label="금액 직접 입력"
                          checked={expenseForm.manualAmount}
                          type="checkbox"
                          onChange={(event) =>
                            toggleExpenseAmountManual(
                              'manualAmount',
                              event.target.checked,
                            )
                          }
                        />
                      </span>
                      <input
                        disabled={!expenseForm.manualAmount}
                        inputMode="numeric"
                        type="text"
                        value={formatMoneyInput(expenseForm.amount)}
                        onChange={(event) =>
                          updateExpenseAmountField('amount', event.target.value)
                        }
                        placeholder="금액"
                      />
                    </label>
                  </div>
                  <label>
                    내용
                    <input
                      value={expenseForm.memo}
                      onChange={(event) =>
                        setExpenseForm({
                          ...expenseForm,
                          memo: event.target.value,
                        })
                      }
                      placeholder="사용 내역"
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={cancelExpenseEdit}
                    >
                      취소
                    </button>
                    <button className="primary-button" type="submit">
                      {editingExpenseId ? '수정 저장' : '지출 추가'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        )}

        {view === 'worklogs' && (
          <section className="content-grid single">
            <div className="panel calendar-panel">
              <div className="calendar-controls">
                <div className="calendar-month-pickers">
                  <select
                    aria-label="작업일보 년도"
                    value={workLogMonth.slice(0, 4)}
                    onChange={(event) =>
                      updateWorkLogCalendarMonth(
                        event.target.value,
                        workLogMonth.slice(5, 7),
                      )
                    }
                  >
                    {workLogCalendarYears.map((year) => (
                      <option key={year} value={year}>
                        {year}년
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="작업일보 월"
                    value={workLogMonth.slice(5, 7)}
                    onChange={(event) =>
                      updateWorkLogCalendarMonth(
                        workLogMonth.slice(0, 4),
                        event.target.value,
                      )
                    }
                  >
                    {calendarMonthOptions.map((month) => (
                      <option key={month} value={month}>
                        {month}월
                      </option>
                    ))}
                  </select>
                </div>
                <div className="calendar-toolbar-row">
                  <div className="calendar-nav-buttons">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setWorkLogMonth(moveMonth(workLogMonth, -1))}
                    >
                      이전
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setWorkLogMonth(today.slice(0, 7))}
                    >
                      오늘
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setWorkLogMonth(moveMonth(workLogMonth, 1))}
                    >
                      다음
                    </button>
                  </div>
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={() => navigateTo('worklogList')}
                  >
                    전체조회
                  </button>
                </div>
              </div>
              <div className="calendar-grid">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div className="calendar-weekday" key={day}>
                    {day}
                  </div>
                ))}
                {calendarDays.map((day) => {
                  const weekday = getDateWeekday(day.date)
                  const holidayName = getKoreanPublicHolidayName(day.date)
                  const dayClassNames = [
                    'calendar-day',
                    day.isCurrentMonth ? '' : 'muted',
                    day.date === today ? 'today' : '',
                    weekday === 0 ? 'sunday' : '',
                    weekday === 6 ? 'saturday' : '',
                    holidayName ? 'holiday' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  const dayLogs = calendarWorkLogs.filter(
                    (workLog) => workLog.date === day.date,
                  )
                  const dayProjectGroups = Array.from(
                    dayLogs
                      .reduce((groups, workLog) => {
                        const current = groups.get(workLog.projectId) ?? []
                        groups.set(workLog.projectId, [...current, workLog])
                        return groups
                      }, new Map<string, WorkLog[]>())
                      .entries(),
                  ).map(([projectId, logs]) => ({
                    logs,
                    project: projectSummaries.find(
                      (project) => project.id === projectId,
                    ),
                    projectId,
                  }))

                  return (
                    <div
                      className={dayClassNames}
                      key={day.date}
                    >
                      <div className="calendar-date-row">
                        <button
                          className="calendar-date-button"
                          type="button"
                          onClick={() =>
                            setWorkLogForm((current) => ({
                              ...current,
                              date: day.date,
                            }))
                          }
                        >
                          {Number(day.date.slice(8, 10))}
                        </button>
                        {holidayName && (
                          <span className="calendar-holiday-name">
                            {holidayName}
                          </span>
                        )}
                      </div>
                      <div className="calendar-day-events">
                        {dayProjectGroups.slice(0, 2).map((group) => (
                          <button
                            className="calendar-entry"
                            key={`${day.date}-${group.projectId}`}
                            type="button"
                            onClick={() =>
                              setSelectedCalendarWork({
                                date: day.date,
                                projectId: group.projectId,
                              })
                            }
                          >
                            {group.project?.orderNo ?? '공사'} ·{' '}
                            {group.logs.length}명
                          </button>
                        ))}
                        {dayProjectGroups.length > 2 && (
                          <span className="calendar-more">
                            외 {dayProjectGroups.length - 2}건
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="panel full">
              <div className="worklog-project-controls">
                <div className="project-year-switch" aria-label="작업일보 공사 년도">
                  {orderYears.map((year) => (
                    <button
                      className={orderYear === year ? 'active' : ''}
                      key={year}
                      type="button"
                      onClick={() => switchOrderYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
                <button
                  className="primary-button compact-button"
                  type="button"
                  onClick={() => setIsWorkLogModalOpen(true)}
                >
                  작업일보 등록
                </button>
              </div>
              <label className="project-picker">
                <select
                  aria-label="공사 선택"
                  value={selectedProjectId}
                  onChange={(event) => selectProject(event.target.value)}
                >
                  {yearlyProjectSummaries.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.orderNo} · {project.projectName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedCalendarWork && (
              <div className="modal-backdrop" role="presentation">
                <div className="modal-panel small-modal">
                  <div className="modal-heading">
                    <div>
                      <h3>{selectedCalendarWork.date} 작업일보</h3>
                      <span>
                        {selectedCalendarProject?.orderNo} ·{' '}
                        {selectedCalendarProject?.projectName}
                      </span>
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setSelectedCalendarWork(null)}
                    >
                      닫기
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{renderWorkLogSortButton('worker', '작업자')}</th>
                          <th>{renderWorkLogSortButton('workerType', '구분')}</th>
                          <th>{renderWorkLogSortButton('startTime', '시간')}</th>
                          <th>{renderWorkLogSortButton('location', '장소')}</th>
                          <th>{renderWorkLogSortButton('task', '작업내용')}</th>
                          <th>{renderWorkLogSortButton('note', '비고')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCalendarWorkLogs.map((workLog) => (
                          <tr key={workLog.id}>
                            <td>{workLog.worker}</td>
                            <td>{workLog.workerType}</td>
                            <td>
                              {workLog.startTime}-{workLog.endTime}
                              {workLog.overtimeHours > 0
                                ? ` / 잔업 ${workLog.overtimeHours}h`
                                : ''}
                            </td>
                            <td>{workLog.location || '-'}</td>
                            <td>{workLog.task}</td>
                            <td>{workLog.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {isWorkLogModalOpen && (
              <div className="modal-backdrop" role="presentation">
                <form className="modal-panel form-panel" onSubmit={addWorkLog}>
              <div className="modal-heading">
                <div>
                  <h3>작업일보 등록</h3>
                  <span>공통 작업정보를 한 번 입력하고 작업자만 추가</span>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setIsWorkLogModalOpen(false)}
                >
                  닫기
                </button>
              </div>
              <label>
                공사
                <select
                  value={workLogForm.projectId}
                  onChange={(event) =>
                    setWorkLogForm({
                      ...workLogForm,
                      projectId: event.target.value,
                    })
                  }
                >
                  {yearlyProjectSummaries.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNo} · {order.projectName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="two-columns">
                <label>
                  작업일자
                  <input
                    type="date"
                    value={workLogForm.date}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        date: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  작업자 수
                  <input
                    min="1"
                    max="20"
                    type="number"
                    value={workLogForm.workerCount}
                    onChange={(event) => updateWorkerCount(event.target.value)}
                  />
                </label>
              </div>
              <div className="three-columns">
                <label>
                  작업시작
                  <input
                    type="time"
                    value={workLogForm.startTime}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        startTime: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  작업종료
                  <input
                    type="time"
                    value={workLogForm.endTime}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        endTime: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  잔업시간
                  <input
                    min="0"
                    step="0.5"
                    type="number"
                    value={workLogForm.overtimeHours}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        overtimeHours: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="calculation-note">
                1인 작업시간:{' '}
                {calculateWorkHours(
                  workLogForm.startTime,
                  workLogForm.endTime,
                  Number(workLogForm.overtimeHours) || 0,
                ).toFixed(1)}
                h / 점심 휴게 1시간 자동 차감
              </div>
              <div className="two-columns">
                <label>
                  작업장소
                  <input
                    value={workLogForm.location}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        location: event.target.value,
                      })
                    }
                    placeholder="예: 집진기실"
                  />
                </label>
                <label>
                  비고
                  <input
                    value={workLogForm.note}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        note: event.target.value,
                      })
                    }
                    placeholder="예: 안전교육 후 작업"
                  />
                </label>
              </div>
              <label>
                작업내용
                <input
                  value={workLogForm.task}
                  onChange={(event) =>
                    setWorkLogForm({
                      ...workLogForm,
                      task: event.target.value,
                    })
                  }
                  placeholder="예: 덕트 설치 및 용접"
                />
              </label>

              <div className="worker-entry-list">
                {workLogForm.workers.map((worker, index) => (
                  <div className="worker-entry compact" key={index}>
                    <strong>작업자 {index + 1}</strong>
                    <label>
                      작업자
                      <input
                        value={worker.worker}
                        onChange={(event) =>
                          updateWorkerInput(
                            index,
                            'worker',
                            event.target.value,
                          )
                        }
                        placeholder="예: 김현수"
                      />
                    </label>
                    <label>
                      직원/인력
                      <select
                        value={worker.workerType}
                        onChange={(event) =>
                          updateWorkerInput(
                            index,
                            'workerType',
                            event.target.value,
                          )
                        }
                      >
                        <option>직원</option>
                        <option>인력</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setIsWorkLogModalOpen(false)}
                >
                  취소
                </button>
                <button className="primary-button" type="submit">
                  작업일보 추가
                </button>
              </div>
            </form>
          </div>
        )}

            <div className="panel wide">
              <div className="panel-heading">
                <div>
                  <h3>선택 공사 작업일보</h3>
                  <span>{(selectedProject?.manDays ?? 0).toFixed(2)}명</span>
                </div>
                {renderOutputButtons(selectedWorkLogsExportTable, (records) =>
                  importWorkLogsFromCsv(records, selectedProjectId),
                )}
              </div>
              <div className="table-wrap">
                <table className="selected-worklog-table">
                  <thead>
                    <tr>
                      <th>{renderWorkLogSortButton('date', '일자')}</th>
                      <th>{renderWorkLogSortButton('worker', '작업자')}</th>
                      <th>{renderWorkLogSortButton('workerType', '구분')}</th>
                      <th>{renderWorkLogSortButton('startTime', '시작')}</th>
                      <th>{renderWorkLogSortButton('endTime', '종료')}</th>
                      <th>{renderWorkLogSortButton('overtimeHours', '잔업')}</th>
                      <th>{renderWorkLogSortButton('location', '장소')}</th>
                      <th>{renderWorkLogSortButton('task', '작업내용')}</th>
                      <th>{renderWorkLogSortButton('note', '비고')}</th>
                      <th>{renderWorkLogSortButton('hours', '시간')}</th>
                      <th>{renderWorkLogSortButton('hours', '공수')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkLogs.map((workLog) => (
                      <tr key={workLog.id}>
                        <td>{formatTableDate(workLog.date)}</td>
                        <td>{workLog.worker}</td>
                        <td>{workLog.workerType}</td>
                        <td>{workLog.startTime}</td>
                        <td>{workLog.endTime}</td>
                        <td>{workLog.overtimeHours.toFixed(1)}</td>
                        <td>{workLog.location || '-'}</td>
                        <td>{workLog.task}</td>
                        <td>{workLog.note || '-'}</td>
                        <td>{workLog.hours.toFixed(1)}</td>
                        <td>{(workLog.hours / 8).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredWorkLogs.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={7}>총합</td>
                        <td>작업일수 {filteredWorkLogTotals.days.size}</td>
                        <td></td>
                        <td>{filteredWorkLogTotals.hours.toFixed(1)}</td>
                        <td>{(filteredWorkLogTotals.hours / 8).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </section>
        )}

        {view === 'worklogList' && (
          <section className="content-grid single">
            <div className="panel full worklog-list-panel">
              <div className="panel-heading">
                <div>
                  <h3>작업일보 전체조회</h3>
                  <span>
                    {workLogListYear === 'all' ? '전체년도' : `${workLogListYear}년`}
                    {' '}
                    작업일보 {filteredWorkLogsForList.length}건
                  </span>
                </div>
                <button
                  className="ghost-button compact-button"
                  type="button"
                  onClick={() => navigateTo('worklogs')}
                >
                  달력으로
                </button>
                {renderOutputButtons(allWorkLogsExportTable, (records) =>
                  importWorkLogsFromCsv(records),
                )}
              </div>

              <div className="worklog-list-toolbar">
                <div className="project-year-switch" aria-label="작업일보 조회 년도">
                  <button
                    className={workLogListYear === 'all' ? 'active' : ''}
                    type="button"
                    onClick={() => setWorkLogListYear('all')}
                  >
                    전체
                  </button>
                  {workLogYears.map((year) => (
                    <button
                      className={workLogListYear === year ? 'active' : ''}
                      key={year}
                      type="button"
                      onClick={() => setWorkLogListYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrap worklog-list-wrap">
                <table className="worklog-list-table">
                  <thead>
                    <tr>
                      <th>{renderWorkLogSortButton('date', '작업일')}</th>
                      <th>{renderWorkLogSortButton('worker', '작업자')}</th>
                      <th>{renderWorkLogSortButton('workerType', '구분')}</th>
                      <th>{renderWorkLogSortButton('startTime', '작업시작')}</th>
                      <th>{renderWorkLogSortButton('endTime', '작업종료')}</th>
                      <th>{renderWorkLogSortButton('overtimeHours', '잔업시간')}</th>
                      <th>{renderWorkLogSortButton('location', '작업장소')}</th>
                      <th>{renderWorkLogSortButton('task', '작업내용')}</th>
                      <th>{renderWorkLogSortButton('projectOrderNo', '수주번호')}</th>
                      <th>{renderWorkLogSortButton('note', '비고')}</th>
                      <th>{renderWorkLogSortButton('hours', '작업시간')}</th>
                      <th>{renderWorkLogSortButton('hours', '공수')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkLogsForList.map((workLog) => {
                      const project = projectSummaries.find(
                        (item) => item.id === workLog.projectId,
                      )

                      return (
                        <tr key={workLog.id}>
                          <td>{formatTableDate(workLog.date)}</td>
                          <td>{workLog.worker}</td>
                          <td>{workLog.workerType}</td>
                          <td>{workLog.startTime}</td>
                          <td>{workLog.endTime}</td>
                          <td>{workLog.overtimeHours.toFixed(1)}</td>
                          <td>{workLog.location || '-'}</td>
                          <td>{workLog.task}</td>
                          <td>{project?.orderNo ?? '-'}</td>
                          <td>{workLog.note || '-'}</td>
                          <td>{workLog.hours.toFixed(1)}</td>
                          <td>{(workLog.hours / 8).toFixed(2)}</td>
                        </tr>
                      )
                    })}
                    {filteredWorkLogsForList.length === 0 && (
                      <tr>
                        <td colSpan={12}>조회할 작업일보가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
