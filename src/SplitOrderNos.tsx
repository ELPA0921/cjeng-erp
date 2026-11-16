import { useState } from 'react'
import type { Order } from './orderTypes'
import { findOrder } from './cardAccounting'

/**
 * A split posting's order numbers as "26027 외"; hovering (or focusing) lists them all as
 * "26027 · 수주처" (관리비 and 연구비 have no 수주처, so their name stands in).
 * The list is fixed to the viewport so the scrolling table around it cannot clip it.
 */
export default function SplitOrderNos({ orderNos, orders }: { orderNos: string[]; orders: Order[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const show = (target: HTMLElement) => { const box = target.getBoundingClientRect(); setAt({ left: box.left, top: box.bottom + 6 }) }
  const label = (orderNo: string) => { const order = findOrder(orders, orderNo); const client = order?.client1 || order?.projectName; return client ? `${orderNo} · ${client}` : orderNo }
  return <span className="card-split-orders" tabIndex={0} aria-label={`분할 수주번호 ${orderNos.map(label).join(', ')}`}
    onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setAt(null)}
    onFocus={event => show(event.currentTarget)} onBlur={() => setAt(null)}>
    {orderNos[0]} 외
    {at && <span className="card-split-tooltip" role="tooltip" style={{ left: at.left, top: at.top }}>
      {orderNos.map(orderNo => <span key={orderNo}>{label(orderNo)}</span>)}
    </span>}
  </span>
}
