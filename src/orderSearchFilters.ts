import type { Order } from './orderTypes'
import { foldVendor } from './vendors.ts'

/** Conditions of the 수주 검색 window; kept by App so they survive closing and reopening it. */
export type OrderSearchFilters = { keyword: string; client: string; region: string; project: string; manager: string; status: string; year: string }
export const emptyOrderSearch: OrderSearchFilters = { keyword: '', client: '', region: '', project: '', manager: '', status: '', year: '' }

// (주), 주식회사, spaces and punctuation never decide a match, so "진영 (주)" finds "(주)진영".
const words = (text: string) => text.split(/\s+/).map(foldVendor).filter(Boolean)
const has = (text: string, wanted: string[]) => { const folded = foldVendor(text); return wanted.every(word => folded.includes(word)) }

export const isSearchingOrders = (filters: OrderSearchFilters) => Object.values(filters).some(value => value.trim() !== '')

/**
 * The orders matching every filled condition, newest 수주번호 first. Each field's words may appear in
 * any order; the keyword's words may each be in 수주번호, 수주처, 공사현장, 공사명, 담당자 or 비고.
 */
export function searchOrders(orders: Order[], filters: OrderSearchFilters, { yearOf, statusOf }: { yearOf: (order: Order) => string; statusOf: (order: Order) => string }) {
  if (!isSearchingOrders(filters)) return []
  const keyword = words(filters.keyword), client = words(filters.client), region = words(filters.region), project = words(filters.project), manager = words(filters.manager)
  return orders.filter(order => {
    if (filters.year && yearOf(order) !== filters.year) return false
    if (filters.status && statusOf(order) !== filters.status) return false
    if (!has(`${order.client1} ${order.client2}`, client)) return false
    if (!has(order.region, region)) return false
    if (!has(order.projectName, project)) return false
    if (!has(order.manager, manager)) return false
    return has([order.orderNo, order.client1, order.client2, order.region, order.projectName, order.manager, order.note ?? ''].join(' '), keyword)
  }).sort((a, b) => yearOf(b).localeCompare(yearOf(a)) || b.orderNo.localeCompare(a.orderNo, 'ko-KR', { numeric: true }))
}
