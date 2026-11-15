import { useState } from 'react'

/**
 * A split posting's order numbers as "26027 외"; hovering (or focusing) lists them all.
 * The list is fixed to the viewport so the scrolling table around it cannot clip it.
 */
export default function SplitOrderNos({ orderNos }: { orderNos: string[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const show = (target: HTMLElement) => { const box = target.getBoundingClientRect(); setAt({ left: box.left, top: box.bottom + 6 }) }
  return <span className="card-split-orders" tabIndex={0} aria-label={`분할 수주번호 ${orderNos.join(', ')}`}
    onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setAt(null)}
    onFocus={event => show(event.currentTarget)} onBlur={() => setAt(null)}>
    {orderNos[0]} 외
    {at && <span className="card-split-tooltip" role="tooltip" style={{ left: at.left, top: at.top }}>
      {orderNos.map(orderNo => <span key={orderNo}>{orderNo}</span>)}
    </span>}
  </span>
}
