import { useLayoutEffect, useRef, useState } from 'react'
import { matchVendors, type FrequentVendor } from './vendors'

/**
 * 거래처 (or 수주처) input that suggests frequent names while typing, each with how often it was used
 * (in unit). Picking one by click or Enter fills it in; anything else typed is kept as is, so new
 * names can still be entered.
 */
export default function VendorField({ value, vendors, onChange, placeholder, unit = '회' }: {
  value: string
  vendors: FrequentVendor[]
  onChange: (vendor: string) => void
  placeholder?: string
  unit?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // The list shows only while the user is typing, not for a value that was already there.
  const [typing, setTyping] = useState(false)
  const [active, setActive] = useState(0)
  const matches = typing ? matchVendors(vendors, value) : []

  // Fixed to the viewport so the modal cannot clip it; re-anchored on every render, scroll and resize.
  const open = matches.length > 0
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = input.current?.getBoundingClientRect()
      if (rect && list.current) Object.assign(list.current.style, { top: `${rect.bottom + 4}px`, left: `${rect.left}px`, width: `${Math.max(rect.width, 240)}px` })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  })
  function pick(vendor: FrequentVendor) { onChange(vendor.name); setTyping(false); setActive(0) }

  return <>
    <input ref={input} value={value} placeholder={placeholder} aria-autocomplete="list" aria-expanded={open} autoComplete="off"
      onChange={event => { onChange(event.target.value); setTyping(true); setActive(0) }}
      onBlur={() => setTyping(false)}
      onKeyDown={event => {
        // Keys pressed while a Korean syllable is still being composed belong to the IME.
        if (!open || event.nativeEvent.isComposing) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(current => (current + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length) }
        if (event.key === 'Enter') { event.preventDefault(); pick(matches[Math.min(active, matches.length - 1)]) }
        if (event.key === 'Escape') { event.preventDefault(); setTyping(false) }
      }} />
    {open && <div ref={list} className="order-suggest vendor-suggest" role="listbox">
      {matches.map((vendor, index) => <button key={vendor.name} type="button" role="option" aria-selected={index === active} tabIndex={-1}
        onMouseDown={event => { event.preventDefault(); pick(vendor) }} onMouseEnter={() => setActive(index)}>
        <span>{vendor.name}</span><small>{vendor.count}{unit}</small>
      </button>)}
    </div>}
  </>
}
