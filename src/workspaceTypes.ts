import type { VendorContact } from './vendorData.ts'
import type { Delivery } from './deliveryData.ts'

export type Expense = {
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
  /** Position among the same project's expenses on the same date, once someone arranges them. */
  sequence?: number
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
}

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
}
export type WorkspaceSnapshot = { data: WorkspaceData; revision: string; initialized: boolean; mode?: 'rows' }
export type SharedWorkspaceStore = WorkspaceSnapshot & {
  save: (patch: Partial<WorkspaceData>, revision: string) => Promise<boolean>
}
export const emptyWorkspace = (): WorkspaceData => ({expenses:[],workLogs:[],purchases:[],inactiveVendorKeys:[],deletedVendorKeys:[],vendorEdits:{},customVendorContacts:{purchase:[],order:[]},deliveries:[],cardAccounting:[]})
