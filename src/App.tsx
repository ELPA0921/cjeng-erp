import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { parseNavigationHash, type NavigationRoute } from './navigation'
import { useBrowserNavigation } from './useBrowserNavigation'
import './App.css'
import './design.css'
import { getWorkCategory, workCategories, workProjectLabel, type WorkCategory } from './workLogCategories'
import DeliveryPerformance from './DeliveryPerformance'
import CorporateCards from './CorporateCards'
import TaxInvoices from './TaxInvoices'
import VendorCleanup from './VendorCleanup'
import VendorField from './VendorField'
import { frequentVendors } from './vendors'
import { printExpenseSheet } from './expensePrint'
import { planColumns } from './printLayout'
import { adminOrder, adminOrders, adminProjectId, adminYearOfProject, isAdminProject } from './adminExpenses'
import { isLegacyProjectId, isLegacyYear, legacyProjects } from './legacyExpenses'
import ModalClose from './ModalClose'
import OutputMenu from './OutputMenu'
import ExpenseSearch from './ExpenseSearch'
import { emptyExpenseSearch } from './expenseSearchFilters'
import { moveWithinDate, sameDateOrder } from './expenseOrder'
import { syncEditedExpense, unlinkDeletedExpenses } from './cardAccounting'
import type { Order, SharedOrderStore } from './orderTypes'
import type { CardAccounting, Expense, WorkLog, SharedWorkspaceStore, WorkspaceData } from './workspaceTypes'
import { defaultOrders, defaultExpenses, defaultWorkLogs, defaultPurchaseOrders } from './sampleData'
import { remapProjectReferences, sharedProjectIdMap } from './orderMigration'
import { defaultOrderStatus, getOrderStatus, importedOrderStatus, isOrderStatus, orderStatuses, type OrderStatus } from './orderStatus'
import {
  orderVendorContacts,
  purchaseVendorContacts,
  type VendorContact,
} from './vendorData'

type WorkLogWorkerInput = {
  worker: string
  workerType: WorkLog['workerType']
}

type ExportCell = string | number

type ExportTable = {
  columns: string[]
  rows: ExportCell[][]
  title: string
  totals?: ExportCell[][]
}

type CsvRecord = Record<string, string>

type View = NavigationRoute['view']
const expenseMenus = [
  ['expenses', '공사별 지출내역'],
  ['adminExpenses', '관리비 지출내역'],
  ['legacyExpenses', '22년 이전 지출내역'],
  ['taxInvoices', '전자세금계산서 조회'],
  ['corporateCards', '법인카드 조회'],
] as const
// 거래관리: 물품구입처 and 발주처 are the two halves of the contacts screen; 납품실적 comes last.
const tradeMenus = [
  ['contacts', '물품구입처'],
  ['orderContacts', '발주처'],
  ['deliveries', '납품실적'],
] as const
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
  | 'region'
  | 'projectName'
  | 'note'
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

const formatProjectOption = (project: Pick<Order, 'orderNo' | 'client1' | 'region' | 'projectName'>) =>
  [project.orderNo, project.client1 || '-', project.region || '-', project.projectName].join(' · ')

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

const buildExportTableHtml = (table: ExportTable) => {
  const line = (row: ExportCell[], tag: 'th' | 'td' = 'td') => `<tr>${row.map((value) => `<${tag}>${escapeHtml(value)}</${tag}>`).join('')}</tr>`
  return `
  <table>
    <thead>${line(table.columns, 'th')}</thead>
    <tbody>${table.rows.map((row) => line(row)).join('')}</tbody>
    ${table.totals?.length ? `<tfoot>${table.totals.map((row) => line(row)).join('')}</tfoot>` : ''}
  </table>
`
}

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
          .page { width: 277mm; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
          th, td { border: 1px solid #9ca3af; padding: 5px 6px; text-align: center; word-break: keep-all; overflow-wrap: anywhere; }
          table.measuring { width: auto; table-layout: auto; }
          table.measuring th, table.measuring td, .nowrap { white-space: nowrap; overflow-wrap: normal; }
          th { background: #eef2f7; font-weight: 700; }
          td { vertical-align: middle; }
          tfoot td { background: #f7f8fa; font-weight: 700; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <main class="page">
          <h1>${escapeHtml(table.title)}</h1>
          ${buildExportTableHtml(table)}
        </main>
        <script>
          // Size columns from their measured one-line widths so short values never wrap.
          var planColumns = (${planColumns.toString()});
          function layoutColumns() {
            var table = document.querySelector('table');
            table.classList.add('measuring');
            var natural = Array.prototype.map.call(table.tHead.rows[0].cells, function (cell) { return Math.ceil(cell.getBoundingClientRect().width) + 1 });
            table.classList.remove('measuring');
            var plan = planColumns(natural, table.parentElement.clientWidth);
            var group = document.createElement('colgroup');
            plan.widths.forEach(function (width) { var col = document.createElement('col'); col.style.width = width + 'px'; group.append(col) });
            table.prepend(group);
            Array.prototype.forEach.call(table.rows, function (row) {
              Array.prototype.forEach.call(row.cells, function (cell, index) { if (plan.nowrap[index]) cell.classList.add('nowrap') });
            });
          }
          window.addEventListener('load', function () {
            (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
              layoutColumns();
              window.focus();
              window.print();
            });
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
  return kind === '세금계산서' || kind === '전자세금계산서' || kind === '종이세금계산서'
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
  return getOrderStatus(order, today)
}

type IconName = 'home' | 'orders' | 'dashboard' | 'expenses' | 'worklogs' | 'deliveries' | 'contacts' | 'arrow' | 'plus'
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    orders: 'M8 4H5v17h14V4h-3M9 3h6v4H9zM9 11h6M9 15h6',
    dashboard: 'M4 20V10h4v10M10 20V4h4v16M16 20v-8h4v8',
    expenses: 'M3 6h18v14H3zM3 10h18M15 15h3M6 3v3',
    worklogs: 'M4 5h16v16H4zM8 3v4M16 3v4M4 11h16M8 15h2M14 15h2',
    deliveries: 'M3 4h12v13H3zM15 9h4l3 4v4h-7M5 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0M3 8h12',
    contacts: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-3.87',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
  }
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

function App({ orderStore, workspaceStore }: { orderStore?: SharedOrderStore; workspaceStore?: SharedWorkspaceStore } = {}) {
  const [initialNavigation] = useState(() => parseNavigationHash(window.location.hash))
  const [view, setView] = useState<View>(initialNavigation?.view ?? 'home')
  const [orderYear, setOrderYear] = useState(initialNavigation?.year ?? currentYear)
  const [localOrders, setLocalOrders] = useState(() =>
    loadStoredData('cost-app-orders', defaultOrders),
  )
  const orders = orderStore?.orders ?? localOrders
  const migratedProjectIds = sharedProjectIdMap(localOrders, orderStore?.orders ?? localOrders)
  const [orderEditRevision, setOrderEditRevision] = useState<number | string | undefined>()
  const [bulkOrderRevision, setBulkOrderRevision] = useState<number | string | undefined>()
  async function setOrders(update: (orders: Order[]) => Order[], revision = orderStore?.revision) {
    const next = update(orders)
    if (orderStore) return orderStore.save(next, revision ?? orderStore.revision)
    setLocalOrders(next)
    return true
  }
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [isBulkOrderStatusOpen, setIsBulkOrderStatusOpen] = useState(false)
  const [bulkOrderStatus, setBulkOrderStatus] = useState<'' | OrderStatus>('')
  const [orderStatusMessage, setOrderStatusMessage] = useState('')
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [orderSort, setOrderSort] = useState<{
    key: OrderSortKey
    direction: SortDirection
  }>({ key: 'orderNo', direction: 'asc' })
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialNavigation?.projectId || (orderStore?.orders.find(order=>getOrderYear(order)===currentYear)?.id ?? orderStore?.orders[0]?.id ?? defaultProjectId),
  )
  const [projectDetailTab, setProjectDetailTab] =
    useState<ProjectDetailTab>(initialNavigation?.projectTab ?? 'worklogs')
  const [selectedVendorKeys, setSelectedVendorKeys] = useState<string[]>([])
  const [vendorSearchScope, setVendorSearchScope] =
    useState<VendorSearchScope>('all')
  const [vendorSearchText, setVendorSearchText] = useState('')
  const [vendorSort, setVendorSort] = useState<{
    key: VendorSortKey
    direction: SortDirection
  }>({ key: 'company', direction: 'asc' })
  const [localInactiveVendorKeys, setLocalInactiveVendorKeys] = useState<string[]>(() =>
    loadStoredData('cost-app-inactive-vendors', []),
  )
  const [localDeletedVendorKeys, setLocalDeletedVendorKeys] = useState<string[]>(() =>
    loadStoredData('cost-app-deleted-vendors', []),
  )
  const [localVendorEdits, setLocalVendorEdits] = useState<Record<string, VendorContact>>(
    () => loadStoredData<Record<string, VendorContact>>('cost-app-vendor-edits', {}),
  )
  const [localCustomVendorContacts, setLocalCustomVendorContacts] = useState<
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
  const [localExpenses, setLocalExpenses] = useState(() =>
    remapProjectReferences(loadStoredData('cost-app-expenses', defaultExpenses), migratedProjectIds),
  )
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([])
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [expenseSort, setExpenseSort] = useState<{
    key: ExpenseSortKey
    direction: SortDirection
  }>({ key: 'date', direction: 'desc' })
  const [workLogMonth, setWorkLogMonth] = useState(initialNavigation?.month ?? today.slice(0, 7))
  const [workLogSort, setWorkLogSort] = useState<{
    key: WorkLogSortKey
    direction: SortDirection
  }>({ key: 'date', direction: 'asc' })
  const [selectedCalendarWork, setSelectedCalendarWork] = useState<{
    date: string
    category: WorkCategory
  } | null>(null)
  const [workAssignmentFilter, setWorkAssignmentFilter] = useState('all')
  const [workAssignmentMessage, setWorkAssignmentMessage] = useState('')
  const [workAssignmentBusy, setWorkAssignmentBusy] = useState(false)
  const [assigningWorkLog, setAssigningWorkLog] = useState<WorkLog | null>(null)
  const [assignmentProjectId, setAssignmentProjectId] = useState('work-unassigned')
  const [workLogListYear, setWorkLogListYear] = useState('all')
  const [projectSort, setProjectSort] = useState<{
    key: ProjectSortKey
    direction: SortDirection
  }>({ key: 'orderNo', direction: 'asc' })
  const [purchaseOrderSort, setPurchaseOrderSort] = useState<{
    key: PurchaseOrderSortKey
    direction: SortDirection
  }>({ key: 'orderDate', direction: 'desc' })
  const [localWorkLogs, setLocalWorkLogs] = useState(() =>
    remapProjectReferences(loadStoredData('cost-app-worklogs-v2', defaultWorkLogs), migratedProjectIds),
  )
  const [localCardAccounting, setLocalCardAccounting] = useState<CardAccounting[]>(() =>
    loadStoredData('cost-app-card-accounting', []),
  )
  const inactiveVendorKeys = workspaceStore?.data.inactiveVendorKeys ?? localInactiveVendorKeys
  const deletedVendorKeys = workspaceStore?.data.deletedVendorKeys ?? localDeletedVendorKeys
  const vendorEdits = workspaceStore?.data.vendorEdits ?? localVendorEdits
  const customVendorContacts = workspaceStore?.data.customVendorContacts ?? localCustomVendorContacts
  const expenses = workspaceStore?.data.expenses ?? localExpenses
  const workLogs = workspaceStore?.data.workLogs ?? localWorkLogs
  const purchaseOrders = workspaceStore?.data.purchases ?? defaultPurchaseOrders
  const cardAccounting = workspaceStore?.data.cardAccounting ?? localCardAccounting
  // Vendors with 5+ expenses since 2025 across every project are suggested in the 거래처 field.
  // 거래처명 정리 looks at every year and also reads where each name came from, so the tax
  // invoice and card spellings are kept.
  const postedExpenseIds = new Set(cardAccounting.map(entry => entry.expenseId))
  const vendorUses = expenses.map(expense => ({ vendor: expense.vendor, source: postedExpenseIds.has(expense.id) && isTaxInvoiceKind(expense.kind) ? '전자세금계산서' as const : postedExpenseIds.has(expense.id) ? '법인카드' as const : '' as const }))
  const vendorSuggestionsSince = '2025-01-01'
  const expenseVendors = frequentVendors(vendorUses.filter((_, index) => expenses[index].date >= vendorSuggestionsSince))
  const [cleaningVendors, setCleaningVendors] = useState(false)
  // 거래처명 정리 reads the tax invoice and card lists back to the first expense, but Barobill
  // holds nothing before 2026-05-01, so earlier periods are not asked for.
  const barobillFirstDate = '2026-05-01'
  const firstExpenseDate = expenses.reduce((first, expense) => /^\d{4}-\d{2}-\d{2}$/.test(expense.date) && expense.date < first ? expense.date : first, today)
  const vendorCleanupSince = firstExpenseDate < barobillFirstDate ? barobillFirstDate : firstExpenseDate
  // 거래처명 정리: rewrites every expense whose vendor is one of the old spellings.
  async function renameVendors(renames: Record<string, string>) {
    const renamed = (vendor: string) => Object.hasOwn(renames, vendor.trim()) ? renames[vendor.trim()] : vendor
    const saved = await setExpenses(current => current.map(expense => renamed(expense.vendor) === expense.vendor ? expense : { ...expense, vendor: renamed(expense.vendor) }))
    if (saved) setCleaningVendors(false)
    return saved
  }
  const [expenseEditRevision, setExpenseEditRevision] = useState<string | undefined>()
  const [vendorEditRevision, setVendorEditRevision] = useState<string | undefined>()
  async function updateWorkspace(patch: Partial<WorkspaceData>, revision=workspaceStore?.revision) {
    if(workspaceStore)return workspaceStore.save(patch,revision ?? workspaceStore.revision)
    if(patch.expenses)setLocalExpenses(patch.expenses)
    if(patch.workLogs)setLocalWorkLogs(patch.workLogs)
    if(patch.inactiveVendorKeys)setLocalInactiveVendorKeys(patch.inactiveVendorKeys)
    if(patch.deletedVendorKeys)setLocalDeletedVendorKeys(patch.deletedVendorKeys)
    if(patch.vendorEdits)setLocalVendorEdits(patch.vendorEdits)
    if(patch.customVendorContacts)setLocalCustomVendorContacts(patch.customVendorContacts)
    if(patch.cardAccounting){setLocalCardAccounting(patch.cardAccounting);localStorage.setItem('cost-app-card-accounting',JSON.stringify(patch.cardAccounting))}
    return true
  }
  async function setExpenses(update:(current:Expense[])=>Expense[], revision=workspaceStore?.revision) {
    return updateWorkspace({expenses:update(expenses)},revision)
  }
  async function setWorkLogs(update:(current:WorkLog[])=>WorkLog[]) {
    return updateWorkspace({workLogs:update(workLogs)})
  }
  const [expenseForm, setExpenseForm] = useState({
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
  })
  const [workLogForm, setWorkLogForm] = useState({
    projectId: selectedProjectId,
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
    note: '',
    status: '' as '' | OrderStatus,
  })

  useEffect(() => {
    if (!workspaceStore) localStorage.setItem('cost-app-expenses', JSON.stringify(expenses))
  }, [expenses, workspaceStore])

  useEffect(() => {
    if (!orderStore) localStorage.setItem('cost-app-orders', JSON.stringify(localOrders))
  }, [localOrders, orderStore])

  useEffect(() => {
    if (!workspaceStore) localStorage.setItem('cost-app-worklogs-v2', JSON.stringify(workLogs))
  }, [workLogs, workspaceStore])

  useEffect(() => {
    if (!workspaceStore) localStorage.setItem(
      'cost-app-inactive-vendors',
      JSON.stringify(inactiveVendorKeys),
    )
  }, [inactiveVendorKeys, workspaceStore])

  useEffect(() => {
    if (!workspaceStore) localStorage.setItem(
      'cost-app-deleted-vendors',
      JSON.stringify(deletedVendorKeys),
    )
  }, [deletedVendorKeys, workspaceStore])

  useEffect(() => {
    if (!workspaceStore) localStorage.setItem('cost-app-vendor-edits', JSON.stringify(vendorEdits))
  }, [vendorEdits, workspaceStore])

  useEffect(() => {
    if (!workspaceStore) localStorage.setItem(
      'cost-app-custom-vendors',
      JSON.stringify(customVendorContacts),
    )
  }, [customVendorContacts, workspaceStore])

  const restoreNavigation = useCallback((route: NavigationRoute) => {
    setView(route.view)
    setOrderYear(route.year)
    setSelectedProjectId(route.projectId)
    setProjectDetailTab(route.projectTab)
    setWorkLogMonth(route.month)
    setIsOrderModalOpen(false)
    setIsExpenseModalOpen(false)
    setIsWorkLogModalOpen(false)
    setIsVendorModalOpen(false)
    setIsBulkOrderStatusOpen(false)
    setSelectedCalendarWork(null)
    setAssigningWorkLog(null)
    setExpenseForm(current => ({ ...current, projectId: route.projectId }))
    setWorkLogForm(current => ({ ...current, projectId: route.projectId }))
  }, [])
  const isContactsView = view === 'contacts' || view === 'orderContacts'
  const contactTab: ContactTab = view === 'orderContacts' ? 'order' : 'purchase'
  // Selections and open forms belong to one contact list; drop them whenever the list
  // changes, including through the browser's back and forward buttons.
  const [shownContactTab, setShownContactTab] = useState<ContactTab>(contactTab)
  if (shownContactTab !== contactTab) {
    setShownContactTab(contactTab)
    setSelectedVendorKeys([])
    setEditingVendorKey(null)
    setIsVendorModalOpen(false)
    if (contactTab === 'order' && vendorSearchScope === 'item') setVendorSearchScope('all')
  }
  const { canGoBack, canGoForward } = useBrowserNavigation({ view, year: orderYear, projectId: selectedProjectId, projectTab: projectDetailTab, month: workLogMonth }, restoreNavigation)
  const navigateTo = (nextView: View) => { setSelectedExpenseIds([]); setView(nextView) }
  const goBack = () => window.history.back()
  const goForward = () => window.history.forward()

  const projectTotals = new Map<string,{cost:number;hours:number;purchaseAmount:number;records:number}>()
  const totalFor=(id:string)=>{
    let total=projectTotals.get(id)
    if(!total){total={cost:0,hours:0,purchaseAmount:0,records:0};projectTotals.set(id,total)}
    return total
  }
  for(const expense of expenses){const total=totalFor(expense.projectId);total.cost+=expense.amount;total.records++}
  for(const work of workLogs){const total=totalFor(work.projectId);total.hours+=work.hours;total.records++}
  for(const purchase of purchaseOrders){const total=totalFor(purchase.projectId);total.purchaseAmount+=purchase.amount;total.records++}
  const projectSummaries=orders.map(order=>{
    const total=totalFor(order.id)
    return {...order,...total,year:getOrderYear(order),manDays:total.hours/8,status:getProjectStatus(order)}
  })

  // 2019~2022 공사 show up only under 22년 이전 지출내역; every other screen starts at 2023.
  const recentOrders = orders.filter(order => !isLegacyYear(getOrderYear(order)))
  const orderYears = [...new Set([...recentOrders.map((order) => getOrderYear(order)), orderYear])]
    .filter(year => year && !isLegacyYear(year)).sort((a, b) => compareText(a, b))
  // An old link or back button may still carry year=2020; land on this year instead.
  if (isLegacyYear(orderYear)) setOrderYear(currentYear)
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
  // 관리비 지출내역 shows the selected year's 관리비 (YY000) in place of a 공사.
  const adminSummary = (order: Order) => {
    const total = totalFor(order.id)
    return { ...order, ...total, year: getOrderYear(order), manDays: total.hours / 8, status: getProjectStatus(order) }
  }
  // 22년 이전 지출내역 lists every 공사 and 관리비 up to 2022 in one picker ("2020 · 경인양행");
  // 공사별·관리비 지출내역 show only the years after it.
  const legacy = legacyProjects(orders, getOrderYear)
  const legacyOrderIds = new Set(legacy.map(project => project.order.id))
  const legacyProjectId = legacy.some(project => project.order.id === selectedProjectId) ? selectedProjectId : legacy[0]?.order.id ?? ''
  // Its year buttons follow the picked 공사, so back and forward keep the year with it.
  const legacyYears = [...new Set(legacy.map(project => project.year))]
  const legacyYear = legacy.find(project => project.order.id === legacyProjectId)?.year ?? ''
  const shownLegacy = legacy.filter(project => project.year === legacyYear)
  const expenseProjectId = view === 'adminExpenses' ? adminProjectId(orderYear) : view === 'legacyExpenses' ? legacyProjectId : selectedProjectId
  const selectedProject = view === 'adminExpenses'
    ? adminSummary(adminOrder(orderYear))
    : view === 'legacyExpenses' && isAdminProject(legacyProjectId)
      ? adminSummary(adminOrder(adminYearOfProject(legacyProjectId) ?? orderYear))
      : projectSummaries.find((project) => project.id === expenseProjectId)
  const expenseProjectOptions = view === 'adminExpenses' ? adminOrders(orders).filter(order => !isLegacyYear(order.year)).map(adminSummary)
    : view === 'legacyExpenses' ? legacy.map(project => adminSummary(project.order))
    : yearlyProjectSummaries
  const legacyLabel = new Map(legacy.map(project => [project.order.id, project.label]))
  // Rows sharing a date keep the order set with ▲▼ in both sort directions and on paper.
  // ▲▼ rearrange rows on screen first; 적용 saves the new order and 초기화 drops it. The draft
  // belongs to one project, so it disappears when another project is shown.
  const [orderDraft, setOrderDraft] = useState<{ projectId: string; sequences: Record<string, number> } | null>(null)
  const draftSequences = orderDraft?.projectId === expenseProjectId ? orderDraft.sequences : null
  const shownExpenses = draftSequences
    ? expenses.map(expense => Object.hasOwn(draftSequences, expense.id) ? { ...expense, sequence: draftSequences[expense.id] } : expense)
    : expenses
  const sameDate = sameDateOrder(shownExpenses)
  const filteredExpenses = [...shownExpenses]
    .filter((expense) => expense.projectId === expenseProjectId)
    .sort((a, b) => {
      if (expenseSort.key === 'date') {
        const byDate = compareText(a.date, b.date)
        return (expenseSort.direction === 'asc' ? byDate : -byDate) || sameDate(a, b)
      }
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
  // 지출 검색 looks through every project's expenses; its conditions stay while the window is closed.
  const [searchingExpenses, setSearchingExpenses] = useState(false)
  const [expenseSearchFilters, setExpenseSearchFilters] = useState(emptyExpenseSearch)
  // The search covers the menu it was opened from: 22년 이전 or the years after it.
  const searchableExpenses = expenses.filter(expense => isLegacyProjectId(expense.projectId, legacyOrderIds) === (view === 'legacyExpenses'))
  function openSearchedExpense(expense: Expense) {
    const adminYear = adminYearOfProject(expense.projectId)
    const order = orders.find((candidate) => candidate.id === expense.projectId)
    if (isLegacyProjectId(expense.projectId, legacyOrderIds)) selectProject(expense.projectId)
    else if (adminYear) setOrderYear(adminYear)
    else if (order) { setOrderYear(getOrderYear(order)); selectProject(order.id) }
    setView(isLegacyProjectId(expense.projectId, legacyOrderIds) ? 'legacyExpenses' : adminYear ? 'adminExpenses' : 'expenses')
    setExpenseSort({ key: 'date', direction: 'desc' })
    setSelectedExpenseIds([expense.id])
    setSearchingExpenses(false)
    // Bring the checked row into view once the list has rendered.
    window.setTimeout(() => document.querySelector(`[data-expense-id="${CSS.escape(expense.id)}"]`)?.scrollIntoView({ block: 'center' }), 50)
  }
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
  const activeProjects = projectSummaries
    .filter(project => project.status === '진행중')
    .sort((a, b) => compareText(b.orderDate, a.orderDate))
  const activeProjectCount = activeProjects.length
  // Enough to fill the panel beside 진행중인 공사; the list shows only the rows that fit.
  const recentProjects = [...projectSummaries]
    .sort((a, b) => compareText(b.orderDate, a.orderDate))
    .slice(0, 20)
  const calendarDays = getMonthDays(workLogMonth)
  const calendarWorkLogs = workLogs.filter((workLog) =>
    workLog.date.startsWith(workLogMonth),
  )
  const selectedCalendarWorkLogs = selectedCalendarWork
    ? [...workLogs]
        .filter(
          (workLog) =>
            workLog.date === selectedCalendarWork.date &&
            getWorkCategory(workLog) === selectedCalendarWork.category,
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
  const workLogYears = Array.from(
    new Set(workLogs.map((workLog) => workLog.date.slice(0, 4)).filter(Boolean)),
  ).sort((a, b) => compareText(b, a))
  const workLogCalendarYears = Array.from(
    new Set([...orderYears, ...workLogYears, workLogMonth.slice(0, 4)]),
  ).sort((a, b) => compareText(b, a))
  const filteredWorkLogsForList = [...workLogs]
    .filter(
      (workLog) =>
        (workLogListYear === 'all' || workLog.date.startsWith(workLogListYear)) &&
        (workAssignmentFilter === 'all' || workLog.projectId === workAssignmentFilter),
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
  // ▲▼ move the one checked row among the rows of its date, while the table is sorted by 일자.
  const [savingOrder, setSavingOrder] = useState(false)
  const expenseMove = (direction: -1 | 1) => selectedExpenseCount === 1 && expenseSort.key === 'date'
    ? moveWithinDate(filteredExpenses, selectedExpenseIds[0], direction) : null
  function moveSelectedExpense(direction: -1 | 1) {
    const sequences = expenseMove(direction)
    if (!sequences || savingOrder) return
    setOrderDraft({ projectId: expenseProjectId, sequences: { ...draftSequences, ...Object.fromEntries(sequences) } })
  }
  async function applyExpenseOrder() {
    if (!draftSequences || savingOrder) return
    setSavingOrder(true)
    const saved = await setExpenses(current => current.map(expense => Object.hasOwn(draftSequences, expense.id) ? { ...expense, sequence: draftSequences[expense.id] } : expense))
    setSavingOrder(false)
    if (saved) setOrderDraft(null)
  }
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
      '수주처',
      '공사현장',
      '공사명',
      '비고',
    ],
    rows: filteredOrders.map((order) => [
      getOrderYear(order),
      order.orderNo,
      order.orderDate,
      order.expectedCompletionDate,
      getProjectStatus(order),
      order.manager,
      order.client1,
      order.region,
      order.projectName,
      order.note ?? '',
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
  // The paper 지출내역서 lists supply amounts in date order regardless of the on-screen sort.
  // Rows on the same date print in the order the screen shows them.
  // A personal card's "card number" holds the owner's name, so it moves to 비고.
  // 관리비 sheets are titled by their name alone ("2026년 관리비 지출내역"), without the 26000_ prefix.
  const printExpenses = () => printExpenseSheet(
    selectedProject && isAdminProject(selectedProject.id) ? selectedProject.projectName
      // 22년 이전 공사 use the 공사명 as their 수주번호; print it once.
      : [...new Set([selectedProject?.orderNo, selectedProject?.client1, selectedProject?.projectName].filter(Boolean))].join('_'),
    [...filteredExpenses].sort((a, b) => a.date.localeCompare(b.date) || sameDate(a, b)).map(expense => {
      const personal = normalizeExpenseKind(expense.kind) === '개인카드'
      return {
        date: expense.date,
        vendor: expense.vendor,
        memo: expense.memo,
        supplyAmount: getExpenseSupplyAmount(expense),
        cardNumber: personal ? '개인카드' : expense.cardNumber ?? '',
        note: personal ? expense.cardNumber ?? '' : '',
      }
    }),
  )
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
      expense.date,
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
      workLog.date,
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
      return [
        workLog.date,
        workLog.worker,
        workLog.workerType,
        workLog.startTime,
        workLog.endTime,
        workLog.overtimeHours.toFixed(1),
        workLog.location || '-',
        workLog.task,
        workProjectLabel(workLog.projectId, projectSummaries),
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
    setSelectedExpenseIds([])
    setSelectedProjectId(projectId)
    setExpenseForm((current) => ({ ...current, projectId }))
    setWorkLogForm((current) => ({ ...current, projectId }))
  }

  function switchOrderYear(nextYear: string) {
    setOrderYear(nextYear)
    setSelectedOrderIds([])
    setSelectedExpenseIds([])
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

  async function importOrdersFromCsv(records: CsvRecord[]) {
    const invalidStatusIndex = records.findIndex(record => {
      const status = getCsvValue(record, ['상태']).trim()
      return status !== '' && !isOrderStatus(status)
    })
    if (invalidStatusIndex >= 0) {
      window.alert(`${invalidStatusIndex + 2}행의 상태를 확인하세요. 예정, 진행중, 보류, 준공, 취소만 입력할 수 있습니다. 아직 저장되지 않았습니다.`)
      return
    }
    const importedOrders = records.reduce<Order[]>((ordersToImport, record) => {
        const orderNo = getCsvValue(record, ['수주번호']).trim()
        const year = getCsvValue(record, ['년도']).trim() || orderNo.slice(0, 4)
        const projectName = getCsvValue(record, ['공사명']).trim()

        if (!orderNo || !projectName) return ordersToImport

        const existing = orders.find(
          (order) => order.orderNo === orderNo && getOrderYear(order) === year,
        )
        const rawOrderDate = getCsvValue(record, ['수주일자']).trim()
        const rawCompletionDate = getCsvValue(record, ['준공예정일']).trim()
        const orderDate = rawOrderDate ? parseCsvDate(rawOrderDate) : ''

        ordersToImport.push({
          id: existing?.id ?? `o-${orderNo}-${crypto.randomUUID()}`,
          year,
          orderNo,
          orderDate,
          status: importedOrderStatus(record['상태'], orderDate, today, existing),
          expectedCompletionDate: rawCompletionDate ? parseCsvDate(rawCompletionDate) : '',
          manager: getCsvValue(record, ['담당자']),
          client1: getCsvValue(record, ['수주처', '수주처1']),
          client2: record['수주처2'] === undefined
            ? existing?.client2 ?? ''
            : getCsvValue(record, ['수주처2']),
          region: getCsvValue(record, ['공사현장', '공사지역']),
          projectName,
          note: record['비고'] === undefined
            ? existing?.note ?? ''
            : getCsvValue(record, ['비고']),
        })

        return ordersToImport
      }, [])

    if (importedOrders.length === 0) return

    const saved = await setOrders((current) => {
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
    if (!saved) return
    setOrderYear(getOrderYear(importedOrders[0]))
    selectProject(importedOrders[0].id)
  }

  async function importExpensesFromCsv(records: CsvRecord[]) {
    const importedExpenses = records
      .filter((record) => getCsvValue(record, ['일자', '거래처', '내용']))
      .map((record) => {
        const supplyAmount = parseCsvNumber(getCsvValue(record, ['공급가액']))
        const vatAmount = parseCsvNumber(getCsvValue(record, ['부가세']))
        const amount =
          parseCsvNumber(getCsvValue(record, ['금액'])) || supplyAmount + vatAmount

        return {
          id: `e-${crypto.randomUUID()}`,
          projectId: expenseProjectId,
          date: parseCsvDate(getCsvValue(record, ['일자'])),
          kind: normalizeExpenseKind(getCsvValue(record, ['구분']) || '기타'),
          vendor: getCsvValue(record, ['거래처']),
          memo: getCsvValue(record, ['내용']),
          cardNumber: getCsvValue(record, ['카드번호']),
          supplyAmount,
          vatAmount,
          amount,
        } satisfies Expense
      })

    if (importedExpenses.length === 0) return

    await setExpenses((current) => [...importedExpenses, ...current])
  }

  async function importWorkLogsFromCsv(records: CsvRecord[], projectId?: string) {
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

    await setWorkLogs((current) => [...importedWorkLogs, ...current])
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
    onPrint = () => printExportTable(table),
  ) {
    return (
      <OutputMenu
        empty={table.rows.length === 0}
        onPrint={onPrint}
        onExport={() => exportTableToCsv(table)}
        onImportFile={onImport && ((file) => readCsvFile(file, onImport))}
      />
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
    setVendorEditRevision(workspaceStore?.revision)
    const vendor = vendorRows.find((row) => row.key === selectedVendorKeys[0])

    if (!vendor || selectedVendorKeys.length !== 1) return

    setVendorForm(vendor.contact)
    setEditingVendorKey(vendor.key)
    setIsVendorModalOpen(true)
    setSelectedVendorKeys([])
  }

  function openNewVendorModal() {
    setVendorEditRevision(workspaceStore?.revision)
    setEditingVendorKey(null)
    setVendorForm(emptyVendorContact)
    setSelectedVendorKeys([])
    setIsVendorModalOpen(true)
  }

  function closeVendorModal() {
    setEditingVendorKey(null)
    setIsVendorModalOpen(false)
  }

  async function saveVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!vendorForm.company.trim())return
    const patch=editingVendorKey ? {vendorEdits:{...vendorEdits,[editingVendorKey]:vendorForm}} : {customVendorContacts:{...customVendorContacts,[contactTab]:[...customVendorContacts[contactTab],vendorForm]}}
    if(await updateWorkspace(patch,vendorEditRevision))closeVendorModal()
  }
  async function deleteSelectedVendors() {
    if(!selectedVendorKeys.length || !window.confirm(`선택한 거래처 ${selectedVendorKeys.length}건을 삭제할까요?`))return
    const nextEdits={...vendorEdits}
    selectedVendorKeys.forEach(key=>{delete nextEdits[key]})
    const saved=await updateWorkspace({
      deletedVendorKeys:[...new Set([...deletedVendorKeys,...selectedVendorKeys])],
      inactiveVendorKeys:inactiveVendorKeys.filter(key=>!selectedVendorKeys.includes(key)),vendorEdits:nextEdits,
    })
    if(saved)setSelectedVendorKeys([])
  }
  async function toggleSelectedVendorsInactive() {
    if(!selectedVendorKeys.length)return
    const restore=selectedVendorKeys.every(key=>inactiveVendorKeys.includes(key))
    const saved=await updateWorkspace({inactiveVendorKeys:restore?inactiveVendorKeys.filter(key=>!selectedVendorKeys.includes(key)):[...new Set([...inactiveVendorKeys,...selectedVendorKeys])]})
    if(saved)setSelectedVendorKeys([])
  }

  function openProject(projectId: string) {
    selectProject(projectId)
    setProjectDetailTab('worklogs')
    navigateTo('project')
  }

  function openNewOrderModal() {
    setOrderEditRevision(orderStore?.revision)
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
      note: '',
      status: '',
    })
    setIsOrderModalOpen(true)
  }

  // Set while the order modal is opened from another screen that wants the new order back.
  const orderCreatedHandler = useRef<((order: Order) => void) | null>(null)

  function closeOrderModal() {
    orderCreatedHandler.current = null
    setEditingOrderId(null)
    setIsOrderModalOpen(false)
  }

  function openNewOrderModalFor(onCreated: (order: Order) => void) {
    openNewOrderModal()
    orderCreatedHandler.current = onCreated
  }

  function openOrderEditor() {
    const order = orders.find((item) => item.id === selectedOrderIds[0])

    if (!order || selectedOrderIds.length !== 1) return
    setOrderEditRevision(orderStore?.revision)

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
      note: order.note ?? '',
      status: getProjectStatus(order),
    })
    setIsOrderModalOpen(true)
  }

  async function applyBulkOrderStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isOrderStatus(bulkOrderStatus) || selectedOrderIds.length === 0) return

    const selectedIds = new Set(selectedOrderIds)
    const count = orders.filter(order => selectedIds.has(order.id)).length
    const saved = await setOrders(current => current.map(order =>
      selectedIds.has(order.id) ? { ...order, status: bulkOrderStatus } : order,
    ), bulkOrderRevision)
    if (!saved) return
    setOrderStatusMessage(`수주 ${count}건 상태 변경 완료: ${bulkOrderStatus}`)
    setIsBulkOrderStatusOpen(false)
    setSelectedOrderIds([])
  }

  async function deleteSelectedOrders() {
    if (selectedOrderIds.length === 0) return

    const canDelete = window.confirm(
      `선택한 수주 ${selectedOrderIds.length}건을 삭제할까요?`,
    )
    if (!canDelete) return

    const saved = await setOrders((current) => {
      const next = current.filter((order) => !selectedOrderIds.includes(order.id))
      if (!next.some((order) => order.id === selectedProjectId)) {
        setSelectedProjectId(next[0]?.id ?? defaultProjectId)
      }
      return next
    })
    if (!saved) return
    setSelectedOrderIds([])
  }

  async function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!orderForm.orderNo.trim() || !orderForm.projectName.trim()) return

    if (editingOrderId) {
      const saved = await setOrders((current) =>
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
                  note: orderForm.note,
                  status: orderForm.status || defaultOrderStatus(orderForm.orderDate, today),
                }
              : order,
          )
          .sort((a, b) => a.orderNo.localeCompare(b.orderNo)), orderEditRevision,
      )
      if (!saved) return
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
      note: orderForm.note,
      status: orderForm.status || defaultOrderStatus(orderForm.orderDate, today),
    }

    const saved = await setOrders((current) =>
      [...current, newOrder].sort((a, b) => a.orderNo.localeCompare(b.orderNo)),
      orderEditRevision,
    )
    if (!saved) return
    const onCreated = orderCreatedHandler.current
    orderCreatedHandler.current = null
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
      note: '',
      status: '',
    }))
    setIsOrderModalOpen(false)
    if (onCreated) onCreated(newOrder)
    else navigateTo('orders')
  }

  function openExpenseEditor() {
    setExpenseEditRevision(workspaceStore?.revision)
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

  async function deleteSelectedExpenses() {
    if (selectedExpenseIds.length === 0) return

    const canDelete = window.confirm(
      `선택한 지출 ${selectedExpenseIds.length}건을 삭제할까요?`,
    )
    if (!canDelete) return

    // Removing a posted card or tax invoice expense also sends that row back to 미반영.
    const deleted = new Set(selectedExpenseIds)
    const saved = await updateWorkspace({
      expenses: expenses.filter((expense) => !deleted.has(expense.id)),
      cardAccounting: unlinkDeletedExpenses(cardAccounting, deleted),
    })
    if (!saved) return
    setSelectedExpenseIds([])
    setEditingExpenseId(null)
  }

  function cancelExpenseEdit() {
    setEditingExpenseId(null)
    setIsExpenseModalOpen(false)
    setExpenseForm((current) => ({
      ...current,
      projectId: expenseProjectId,
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
    setExpenseEditRevision(workspaceStore?.revision)
    setEditingExpenseId(null)
    setExpenseForm((current) => ({
      ...current,
      projectId: expenseProjectId,
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

  async function addExpense(event: FormEvent<HTMLFormElement>) {
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
      const adminYear = adminYearOfProject(expenseForm.projectId)
      const orderNo = adminYear ? adminOrder(adminYear).orderNo : orders.find((order) => order.id === expenseForm.projectId)?.orderNo ?? ''
      const saved = await updateWorkspace({
        expenses: expenses.map((expense) =>
          expense.id === editingExpenseId
            ? {
                ...expense,
                // A row moved to another date or project loses its place in the old one.
                sequence: expense.date === expenseForm.date && expense.projectId === expenseForm.projectId ? expense.sequence : undefined,
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
        cardAccounting: syncEditedExpense(cardAccounting, { id: editingExpenseId, memo: expenseForm.memo }, orderNo),
      }, expenseEditRevision)
      if (!saved) return
      if (!isAdminProject(expenseForm.projectId)) setSelectedProjectId(expenseForm.projectId)
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

    const saved = await setExpenses((current) => [
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
    ], expenseEditRevision)
    if (!saved) return
    if (!isAdminProject(expenseForm.projectId)) setSelectedProjectId(expenseForm.projectId)
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

  async function addWorkLog(event: FormEvent<HTMLFormElement>) {
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

    const saved = await setWorkLogs((current) => [...newWorkLogs, ...current])
    if (!saved) return
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

  async function assignWorkLog(id: string, projectId: string) {
    if (workAssignmentBusy) return
    setWorkAssignmentBusy(true)
    try {
      const saved = await setWorkLogs(current => current.map(log => log.id === id ? { ...log, projectId } : log))
      setWorkAssignmentMessage(saved ? '공사 연결을 저장했습니다.' : '저장되지 않았습니다. 자료를 새로 불러온 뒤 다시 연결하세요.')
      if (saved) setAssigningWorkLog(null)
    } catch {
      setWorkAssignmentMessage('저장되지 않았습니다. 다시 시도하세요.')
    } finally {
      setWorkAssignmentBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-home" type="button" aria-label="홈으로 이동" onClick={() => navigateTo('home')}>
          <img src="/changjo-logo.png" alt="주식회사 창조이엔지" width="994" height="284" />
        </button>
        <p className="nav-caption">워크스페이스</p>
        <nav className="nav-tabs" aria-label="주요 메뉴">
          {([
            ['home', '홈'], ['orders', '수주대장'], ['dashboard', '공사현황'],
            ['expenses', '지출내역'], ['worklogs', '작업일보'], ['contacts', '거래관리'],
          ] as const).map(([target, label]) => {
            // 지출내역 and 거래관리 open their sub-menu while one of their screens is shown.
            const menus = target === 'expenses' ? expenseMenus : target === 'contacts' ? tradeMenus : null
            const inGroup = view === target || (target === 'worklogs' && view === 'worklogList') || !!menus?.some(([screen]) => screen === view)
            return <Fragment key={target}>
            <button className={inGroup ? 'active' : ''}
              aria-current={inGroup ? 'page' : undefined}
              type="button" onClick={() => navigateTo(target)}>
              <Icon name={target} /><span>{label}</span>{target === 'orders' && <small>{recentOrders.length}</small>}
            </button>
            {menus && inGroup && (
              <nav className="expense-subnav" aria-label={`${label} 하위 메뉴`}>
                {menus.map(([screen, title]) => (
                  <button key={screen} type="button" className={view === screen ? 'active' : ''}
                    aria-current={view === screen ? 'page' : undefined} onClick={() => navigateTo(screen)}>
                    {title}
                  </button>
                ))}
              </nav>
            )}
            </Fragment>
          })}
        </nav>
        <div className="sidebar-footer"><span className="workspace-avatar">창</span><span>주식회사 창조이엔지<small>공사 관리 시스템</small></span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="history-actions" aria-label="화면 이동">
            <button
              aria-label="뒤로가기"
              disabled={!canGoBack}
              title="뒤로가기"
              type="button"
              onClick={goBack}
            >
              ←
            </button>
            <button
              aria-label="앞으로가기"
              disabled={!canGoForward}
              title="앞으로가기"
              type="button"
              onClick={goForward}
            >
              →
            </button>
          </div>
          <div>
            <p className="eyebrow">
              {expenseMenus.some(([screen]) => screen === view) ? '지출내역' : tradeMenus.some(([screen]) => screen === view) ? '거래관리' : view === 'home'
                ? '홈'
                : view === 'orders'
                ? '수주대장'
                : view === 'project'
                  ? '공사 상세'
                    : view === 'dashboard'
                      ? '공사현황'
                      : view === 'expenses'
                        ? '지출내역'
                        : view === 'worklogList'
                          ? '작업일보 전체조회'
                        : '작업일보'}
            </p>
            <h2>
              {view === 'taxInvoices' ? '전자세금계산서 조회' : view === 'corporateCards' ? '법인카드 조회' : tradeMenus.find(([screen]) => screen === view)?.[1] ?? (view === 'home'
                ? '전체 현황'
                : view === 'orders'
                ? `${orderYear}년 수주대장`
                  : view === 'dashboard'
                    ? `${orderYear}년 공사별 원가 현황`
                    : view === 'expenses'
                      ? `${orderYear}년 공사 내역`
                      : view === 'adminExpenses'
                        ? `${orderYear}년 관리비 지출내역`
                      : view === 'legacyExpenses'
                        ? '22년 이전 지출내역'
                      : view === 'worklogList'
                        ? '작업일보 전체조회'
                      : view === 'worklogs'
                        ? '작업일보 달력'
                        : selectedProject?.projectName)}
            </h2>
          </div>
          <div className="topbar-actions">
            {view === 'deliveries' ? <span>납품실적 관리</span> : view === 'home' ? (
              <>
                <span>진행중 {activeProjectCount}건</span>
                <span>전체 {recentOrders.length}건</span>
              </>
            ) : isContactsView ? (
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
              view === 'expenses' ||
              view === 'adminExpenses' ? (
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
            ) : view === 'legacyExpenses' ? (
              <div className="year-switch" aria-label="22년 이전 년도">
                {legacyYears.map((year) => (
                  <button className={legacyYear === year ? 'active' : ''} key={year} type="button"
                    onClick={() => selectProject(legacy.find(project => project.year === year)?.order.id ?? legacyProjectId)}>
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
            ) : view === 'worklogs' || view === 'taxInvoices' || view === 'corporateCards' ? null : (
              <>
                <span>{selectedProject?.orderNo}</span>
                <span>{selectedProject?.client1}</span>
                <span>{selectedProject?.region}</span>
              </>
            )}
          </div>
        </header>

        {view === 'corporateCards' && <CorporateCards
            orders={recentOrders}
            expenses={expenses}
            cardAccounting={cardAccounting}
            onSave={patch => updateWorkspace(patch)}
            onCreateOrder={openNewOrderModalFor}
          />}
        {view === 'taxInvoices' && <TaxInvoices
            orders={recentOrders}
            expenses={expenses}
            cardAccounting={cardAccounting}
            onSave={patch => updateWorkspace(patch)}
            onCreateOrder={openNewOrderModalFor}
          />}

        {view === 'deliveries' && <DeliveryPerformance workspaceStore={workspaceStore} />}
        {view === 'home' && (
          <section className="home-view">
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
                <div className="home-list home-list-fill">
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
                      <em className="status" data-order-status={project.status}>{project.status}</em>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel home-panel">
                <div className="panel-heading">
                  <div>
                    <h3>진행중인 공사 내역</h3>
                    <span>진행중 {activeProjectCount}건 · 최근 수주일 순</span>
                  </div>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => navigateTo('dashboard')}
                  >
                    현황보기
                  </button>
                </div>
                <div className="home-list">
                  {activeProjects.map((project) => (
                    <button
                      className="home-list-item"
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project.id)}
                    >
                      <span>
                        <strong>{project.projectName}</strong>
                        <small>{project.orderNo} · {project.client1}</small>
                        <small>{[project.region, project.expectedCompletionDate ? `준공예정 ${project.expectedCompletionDate}` : ''].filter(Boolean).join(' · ')}</small>
                      </span>
                      <em className="status" data-order-status={project.status}>{project.status}</em>
                    </button>
                  ))}
                  {activeProjects.length === 0 && <p>진행중인 공사가 없습니다.</p>}
                </div>
              </article>
            </section>

            <section className="home-shortcuts" aria-label="빠른 업무 시작">
              {([['orders', '수주대장', '새로운 공사의 시작'], ['expenses', '지출내역', '꼼꼼하게 살피는 공사비'], ['worklogs', '작업일보', '매일 쌓이는 현장 기록'], ['contacts', '거래처 확인', '함께하는 파트너']] as const).map(([target, label, description]) => <button key={target} type="button" onClick={() => navigateTo(target)}><Icon name={target} /><span><strong>{label}</strong><small>{description}</small></span><Icon name="arrow" /></button>)}
            </section>
          </section>
        )}

        {isContactsView && (
          <section className="content-grid single">
            <div className="panel wide">
              <div className="panel-heading">
                <div>
                  <h3>{contactTab === 'purchase' ? '물품구입처' : '발주처'}</h3>
                  <span>
                    {contactTab === 'purchase'
                      ? purchaseVendorContacts.length + customVendorContacts.purchase.length
                      : orderVendorContacts.length + customVendorContacts.order.length}
                    건
                  </span>
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
                      <ModalClose onClose={closeVendorModal} />
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
                    onClick={() => {
                      setBulkOrderRevision(orderStore?.revision)
                      setBulkOrderStatus('')
                      setIsBulkOrderStatusOpen(true)
                    }}
                  >
                    상태 일괄 변경
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
              {orderStore && orders.length === 0 && localOrders.length > 0 && (
                <div className="shared-order-migration">
                  <p>공유 수주대장이 비어 있습니다. 현재 브라우저에 저장된 수주 {localOrders.length}건을 가져오면 직원들이 함께 볼 수 있습니다.</p>
                  <button className="ghost-button" type="button" onClick={async () => {
                    if (!window.confirm(`이 브라우저의 수주 ${localOrders.length}건을 공용 수주대장으로 가져올까요? 수주번호와 공사명을 먼저 확인해 주세요.`)) return
                    const saved = await setOrders(() => localOrders)
                    if (saved) setOrderStatusMessage(`${localOrders.length}건을 공용 수주대장으로 가져왔습니다.`)
                  }}>이 브라우저의 수주 {localOrders.length}건 가져오기</button>
                </div>
              )}
              <p className="order-status-message" role="status">{orderStatusMessage}</p>
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
                    <col className="orders-col-region" />
                    <col className="orders-col-project" />
                    <col className="orders-col-note" />
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
                      <th>{renderOrderSortButton('client1', '수주처')}</th>
                      <th>{renderOrderSortButton('region', '공사현장')}</th>
                      <th>{renderOrderSortButton('projectName', '공사명')}</th>
                      <th>{renderOrderSortButton('note', '비고')}</th>
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
                        <td className="order-center date-cell">{order.orderDate}</td>
                        <td className="order-center date-cell">
                          {order.expectedCompletionDate}
                        </td>
                        <td className="order-center">
                          <span className="status" data-order-status={getProjectStatus(order)}>{getProjectStatus(order)}</span>
                        </td>
                        <td className="order-center">{order.manager}</td>
                        <td className="order-center">{order.client1}</td>
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
                        <td className="order-note">{order.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {isBulkOrderStatusOpen && (
          <div className="modal-backdrop" role="presentation">
            <form
              className="modal-panel form-panel bulk-order-status-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-order-status-title"
              onSubmit={applyBulkOrderStatus}
            >
              <div className="modal-heading">
                <div>
                  <h3 id="bulk-order-status-title">상태 일괄 변경</h3>
                  <span>선택한 수주 {selectedOrderCount}건에 같은 상태를 적용합니다.</span>
                </div>
                <ModalClose onClose={() => setIsBulkOrderStatusOpen(false)} />
              </div>
              <p className="bulk-order-status-targets">
                {orders.filter(order => selectedOrderIds.includes(order.id)).map(order => order.orderNo).join(', ')}
              </p>
              <label>
                변경할 상태
                <select
                  autoFocus
                  required
                  value={bulkOrderStatus}
                  onChange={event => {
                    const value = event.target.value
                    if (value === '' || isOrderStatus(value)) setBulkOrderStatus(value)
                  }}
                >
                  <option value="" disabled>상태를 선택하세요</option>
                  {orderStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={() => setIsBulkOrderStatusOpen(false)}>취소</button>
                <button className="primary-button" type="submit" disabled={!bulkOrderStatus || selectedOrderCount === 0}>
                  {selectedOrderCount}건 상태 변경
                </button>
              </div>
            </form>
          </div>
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
                <ModalClose onClose={closeOrderModal} />
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
                <label>
                  상태
                  <select
                    value={orderForm.status || defaultOrderStatus(orderForm.orderDate, today)}
                    onChange={event => {
                      if (isOrderStatus(event.target.value)) setOrderForm({ ...orderForm, status: event.target.value })
                    }}
                  >
                    {orderStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
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
                  수주처
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
              </div>

              <div className="two-columns">
                <label>
                  공사현장
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

              <label>
                비고
                <textarea
                  rows={3}
                  value={orderForm.note}
                  onChange={(event) => setOrderForm({ ...orderForm, note: event.target.value })}
                  placeholder="추가로 기록할 내용을 입력하세요"
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
                  <div className="table-wrap selected-worklog-scroll" role="region" aria-label="선택 공사 작업일보 목록" tabIndex={0}>
                    <table className="selected-worklog-table">
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
                            <td className="date-cell">{workLog.date}</td>
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
                    <table className="expense-data-table">
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
                            <td className="date-cell">{expense.date}</td>
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
                            <td className="date-cell">{purchaseOrder.orderDate}</td>
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
              <div className="table-wrap dashboard-scroll">
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

        {(view === 'expenses' || view === 'adminExpenses' || view === 'legacyExpenses') && (
          <section className="content-grid single">
            {view === 'legacyExpenses' ? (
            <div className="panel full">
              <div className="panel-heading">
                <h3>22년 이전 공사 내역</h3>
                <span>2019~2022년 법인카드 명세서에서 가져온 공사와 관리비입니다</span>
              </div>
              <label className="project-select-control">
                공사 선택
                <select value={legacyProjectId} onChange={(event) => selectProject(event.target.value)}>
                  {shownLegacy.map((project) => (
                    <option key={project.order.id} value={project.order.id}>{project.label}</option>
                  ))}
                </select>
              </label>
            </div>
            ) : view === 'adminExpenses' ? (
            <div className="panel full">
              <div className="panel-heading">
                <h3>{orderYear}년 관리비 지출내역 ({selectedProject?.orderNo})</h3>
                <span>공사가 아닌 회사 운영 비용입니다. 수주번호 {selectedProject?.orderNo}(으)로 회계반영한 내역이 이곳에 모입니다</span>
              </div>
            </div>
            ) : (
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
                      {formatProjectOption(project)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            )}
            <div className="panel full">
              <div className="panel-heading">
                <h3>{selectedProject && isAdminProject(selectedProject.id) ? '관리비 지출내역' : '선택 공사 지출내역'}</h3>
                <span>{formatMoney(selectedProject?.cost ?? 0)}</span>
              </div>
              <div className="contact-actions">
                <div className="expense-selection">
                  <div className="expense-search">
                    <span>선택 {selectedExpenseCount}건</span>
                    <button className="ghost-button expense-search-open" type="button" title={view === 'legacyExpenses' ? '22년 이전 공사와 관리비의 지출내역에서 찾습니다' : '모든 공사와 관리비의 지출내역에서 찾습니다'} onClick={() => setSearchingExpenses(true)}>
                      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                      지출 검색
                    </button>
                  </div>
                  <div className="expense-move" role="group" aria-label="같은 날짜 안에서 순서 바꾸기">
                    <button className="ghost-button" type="button" title="같은 날짜 안에서 위로 (일자 정렬에서 한 건 선택)"
                      disabled={savingOrder || !expenseMove(-1)} onClick={() => moveSelectedExpense(-1)}>▲ 위</button>
                    <button className="ghost-button" type="button" title="같은 날짜 안에서 아래로 (일자 정렬에서 한 건 선택)"
                      disabled={savingOrder || !expenseMove(1)} onClick={() => moveSelectedExpense(1)}>▼ 아래</button>
                    <button className="primary-button" type="button" title="바꾼 순서를 저장합니다"
                      disabled={savingOrder || !draftSequences} onClick={() => void applyExpenseOrder()}>{savingOrder ? '저장 중…' : '적용'}</button>
                    <button className="ghost-button" type="button" title="적용하기 전 순서로 되돌립니다"
                      disabled={savingOrder || !draftSequences} onClick={() => setOrderDraft(null)}>초기화</button>
                    {draftSequences && <small>순서를 바꿨습니다. 적용을 눌러야 저장됩니다.</small>}
                  </div>
                </div>
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
                  <button className="ghost-button" type="button" onClick={() => setCleaningVendors(true)}>
                    거래처명 정리
                  </button>
                  {renderOutputButtons(expensesExportTable, importExpensesFromCsv, printExpenses)}
                </div>
              </div>
              <div className="table-wrap">
                <table className="expenses-table expense-data-table">
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
                      <tr key={expense.id} data-expense-id={expense.id}>
                        <td className="check-cell">
                          <input
                            aria-label={`지출 선택 ${expense.vendor}`}
                            checked={selectedExpenseIds.includes(expense.id)}
                            type="checkbox"
                            onChange={() => toggleSelectedExpense(expense.id)}
                          />
                        </td>
                        <td className="expense-center date-cell">{expense.date}</td>
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

            {searchingExpenses && <ExpenseSearch expenses={searchableExpenses} orders={orders} kinds={expenseKindOptions} kindOf={normalizeExpenseKind}
              scope={view === 'legacyExpenses' ? '22년 이전 공사와 관리비' : '모든 공사와 관리비'}
              filters={expenseSearchFilters} onFilters={setExpenseSearchFilters} onOpen={openSearchedExpense} onClose={() => setSearchingExpenses(false)} />}
            {cleaningVendors && <VendorCleanup uses={vendorUses} since={vendorCleanupSince} until={today} onApply={renameVendors} onClose={() => setCleaningVendors(false)} />}
            {isExpenseModalOpen && (
              <div className="modal-backdrop" role="presentation">
                <form className="modal-panel form-panel" onSubmit={addExpense}>
                  <div className="modal-heading">
                    <div>
                      <h3>{editingExpenseId ? '지출 수정' : '지출 등록'}</h3>
                      <span>카드사용 또는 세금계산서</span>
                    </div>
                    <ModalClose onClose={cancelExpenseEdit} />
                  </div>
                  <label>
                    {view === 'adminExpenses' ? '관리비 년도' : '공사'}
                    <select
                      value={expenseForm.projectId}
                      onChange={(event) =>
                        setExpenseForm({
                          ...expenseForm,
                          projectId: event.target.value,
                        })
                      }
                    >
                      {expenseProjectOptions.map((order) => (
                        <option key={order.id} value={order.id}>
                          {view === 'adminExpenses' ? `${order.orderNo} · ${order.projectName}` : legacyLabel.get(order.id) ?? formatProjectOption(order)}
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
                      <VendorField
                        value={expenseForm.vendor}
                        vendors={expenseVendors}
                        onChange={(vendor) => setExpenseForm({ ...expenseForm, vendor })}
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
              <div className="work-category-legend" aria-label="작업 구분 색상">
                {workCategories.map(category => <span key={category} data-work-category={category}>{category}</span>)}
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
                  const dayGroups = workCategories.map(category => ({
                    category, logs: dayLogs.filter(log => getWorkCategory(log) === category),
                  })).filter(group => group.logs.length > 0).map(group => ({
                    ...group,
                    orderNumbers: [...new Set(group.logs.flatMap(log => {
                      const order = projectSummaries.find(project => project.id === log.projectId)
                      return order ? [order.orderNo] : []
                    }))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })),
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
                        {dayGroups.map((group) => (
                          <button
                            className="calendar-entry"
                            data-work-category={group.category}
                            key={`${day.date}-${group.category}`}
                            title={`${group.category} · ${new Set(group.logs.map(log => log.worker)).size}명 · ${(group.logs.reduce((sum, log) => sum + log.hours, 0) / 8).toFixed(2)}공수`}
                            type="button"
                            onClick={() =>
                              setSelectedCalendarWork({
                                date: day.date,
                                category: group.category,
                              })
                            }
                          >
                            {group.category} · {new Set(group.logs.map(log => log.worker)).size}명
                            {group.orderNumbers.length > 0 && <small className="calendar-order-numbers">{group.orderNumbers.join(', ')}</small>}
                            <small>{(group.logs.reduce((sum, log) => sum + log.hours, 0) / 8).toFixed(2)}공수</small>
                          </button>
                        ))}
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
                      {formatProjectOption(project)}
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
                        {selectedCalendarWork.category}
                      </span>
                    </div>
                    <ModalClose onClose={() => setSelectedCalendarWork(null)} />
                  </div>
                  <div className="table-wrap">
                    <table className="worklog-detail-table">
                      <thead>
                        <tr>
                          <th>{renderWorkLogSortButton('worker', '작업자')}</th>
                          <th>공사</th>
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
                            <td>{workProjectLabel(workLog.projectId, projectSummaries)}</td>
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
                <ModalClose onClose={() => setIsWorkLogModalOpen(false)} />
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
                  <option value="work-unassigned">공사 미지정</option>
                  <option value="work-common">공통업무</option>
                  {yearlyProjectSummaries.map((order) => (
                    <option key={order.id} value={order.id}>
                      {formatProjectOption(order)}
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
              <div className="table-wrap selected-worklog-scroll" role="region" aria-label="선택 공사 작업일보 목록" tabIndex={0}>
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
                        <td className="date-cell">{workLog.date}</td>
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
                <label>공사 배정
                  <select aria-label="공사 배정 필터" value={workAssignmentFilter} onChange={event => setWorkAssignmentFilter(event.target.value)}>
                    <option value="all">전체</option><option value="work-unassigned">공사 미지정</option><option value="work-common">공통업무</option>
                  </select>
                </label>
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
                      return (
                        <tr key={workLog.id}>
                          <td className="date-cell">{workLog.date}</td>
                          <td>{workLog.worker}</td>
                          <td>{workLog.workerType}</td>
                          <td>{workLog.startTime}</td>
                          <td>{workLog.endTime}</td>
                          <td>{workLog.overtimeHours.toFixed(1)}</td>
                          <td>{workLog.location || '-'}</td>
                          <td>{workLog.task}</td>
                          <td>
                            <button className="text-link" type="button" aria-label={`${workLog.date} ${workLog.worker} 공사 연결`} onClick={() => { setAssigningWorkLog(workLog); setAssignmentProjectId(workLog.projectId) }}>
                              {workProjectLabel(workLog.projectId, projectSummaries)} · 연결 변경
                            </button>
                          </td>
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
              <p role="status">{workAssignmentMessage}</p>
              {assigningWorkLog && <div className="modal-backdrop" role="presentation">
                <form className="modal-panel small-modal form-panel" role="dialog" aria-modal="true" aria-labelledby="work-assignment-title" onSubmit={event => { event.preventDefault(); void assignWorkLog(assigningWorkLog.id, assignmentProjectId) }}>
                  <h3 id="work-assignment-title">작업일보 공사 연결</h3>
                  <p>{assigningWorkLog.date} · {assigningWorkLog.worker} · {assigningWorkLog.task}</p>
                  <label>연결할 공사<select value={assignmentProjectId} disabled={workAssignmentBusy} onChange={event => setAssignmentProjectId(event.target.value)}>
                    <option value="work-unassigned">공사 미지정</option><option value="work-common">공통업무</option>
                    {projectSummaries.map(order => <option key={order.id} value={order.id}>{formatProjectOption(order)}</option>)}
                  </select></label>
                  <div className="modal-actions"><button type="button" className="ghost-button" disabled={workAssignmentBusy} onClick={() => setAssigningWorkLog(null)}>취소</button><button type="submit" className="primary-button" disabled={workAssignmentBusy}>연결 저장</button></div>
                </form>
              </div>}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
