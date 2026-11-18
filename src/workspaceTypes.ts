import type { VendorContact } from './vendorData.ts'
import type { Delivery } from './deliveryData.ts'
import type { Estimate, EstimateItem, EstimateSettings, MaterialQuote } from './estimateTypes.ts'

export type Expense = {
  id: string
  projectId: string
  date: string
  kind: string
  vendor: string
  category?: string
  memo: string
  cardNumber?: string
  /** 비고: printed in the 지출내역서's 비고 column. */
  note?: string
  supplyAmount?: number
  vatAmount?: number
  amount: number
  /** Position among the same project's expenses on the same date, once someone arranges them. */
  sequence?: number
  /** 장비·운반비 내역: a category set by hand ('크레인', '지게차', '화물차') or '제외'; unset means guessed. */
  freight?: string
  /** 장비·운반비 내역 details typed in: 장비's 장소 and 사용시간, 운반비's 출발지, 목적지 and 연락처, and a 비고 for either. */
  freightPlace?: string
  freightHours?: string
  freightFrom?: string
  freightTo?: string
  freightContact?: string
  freightNote?: string
}

export type WorkLog = {
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

/** One line of a 공사's 발주 및 견적 현황: a quote asked for, ordered and delivered. Any date may still be blank. */
export type PurchaseOrder = {
  id: string
  projectId: string
  quoteDate: string
  orderDate: string
  completedDate: string
  vendor: string
  manager: string
  item: string
  amount?: number
  note: string
}

export const cardAccountingStatuses = ['회계반영', '강제회계반영'] as const
export type CardAccountingStatus = typeof cardAccountingStatuses[number]
// Keyed by the Barobill approval id; a missing entry means the row is still 미반영.
export type CardAccounting = {
  id: string
  status: CardAccountingStatus
  orderNo: string
  memo: string
  expenseId?: string
  updatedAt: string
  /** 분할 회계반영: the row's 공급가액 shared out over several orders, one expense each. */
  splits?: CardAccountingSplit[]
  /**
   * '대조': the row was matched against expenses entered by hand beforehand (a month's tax
   * invoice); those expenses belong to the user, so undoing the posting only unlinks them.
   */
  mode?: '대조'
}
/** date: the day the share's expense is filed under (the invoice's date unless changed). */
export type CardAccountingSplit = { expenseId: string; orderNo: string; memo: string; supplyAmount: number; date?: string }

/**
 * 장비·운반비 내역 up to the day the 「장비 사용 내역」 and 「화물차 사용내역」 Excel files end: one line per
 * day of use or per trip, as recorded there. Later 장비·운반비 come from the expenses.
 * category is one of the freight categories, or '제외' to leave the line off the list.
 */
export type FreightRecord = {
  id: string
  date: string
  category: string
  orderNo: string
  /** 사용처 */
  client: string
  vendor: string
  /** 장비: its kind and size ("25t 크레인"); 운반비: what was carried. */
  item: string
  /** 운반비: the truck ("5t", "1대"). */
  vehicle?: string
  place?: string
  hours?: string
  from?: string
  to?: string
  contact?: string
  note?: string
  amount: number
  /** '제외': kept off the list, its category kept for when it is put back. */
  excluded?: string
}

/** 연구비: one 연구 registered under a 269NN number (26901, 26902, ...). */
export type ResearchProject = { id: string; orderNo: string; name: string }

export type WorkspaceData = {
  expenses: Expense[]
  workLogs: WorkLog[]
  purchases: PurchaseOrder[]
  inactiveVendorKeys: string[]
  deletedVendorKeys: string[]
  vendorEdits: Record<string, VendorContact>
  customVendorContacts: Record<'purchase' | 'order', VendorContact[]>
  deliveries: Delivery[]
  cardAccounting: CardAccounting[]
  /** 견적산출: 원가 단가표, 견적서, and the kg prices and 원가계산서 rates. Older snapshots have none. */
  estimateItems?: EstimateItem[]
  estimates?: Estimate[]
  /** 자재비용: quotes received from vendors, whose prices feed the 단가표. */
  materialQuotes?: MaterialQuote[]
  estimateSettings?: Partial<EstimateSettings>
  /** 연구비: the 연구 registered under 269NN numbers. Older snapshots have none. */
  researchProjects?: ResearchProject[]
  /** 장비·운반비 내역 brought over from the Excel files. Older snapshots have none. */
  freightRecords?: FreightRecord[]
}
export type WorkspaceSnapshot = { data: WorkspaceData; revision: string; initialized: boolean; mode?: 'rows' }
export type SharedWorkspaceStore = WorkspaceSnapshot & {
  save: (patch: Partial<WorkspaceData>, revision: string) => Promise<boolean>
}
export const emptyWorkspace = (): WorkspaceData => ({expenses:[],workLogs:[],purchases:[],inactiveVendorKeys:[],deletedVendorKeys:[],vendorEdits:{},customVendorContacts:{purchase:[],order:[]},deliveries:[],cardAccounting:[],estimateItems:[],estimates:[],materialQuotes:[],estimateSettings:{},researchProjects:[],freightRecords:[]})
