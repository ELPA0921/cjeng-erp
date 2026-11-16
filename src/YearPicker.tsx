import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import './YearPicker.css'

/**
 * The year switch folded into one button ("2026 ▼") in the green year-switch style; clicking it
 * drops a scrolling list of the years. Clicking outside or pressing Esc closes it.
 */
export default function YearPicker({ value, options, onChange, ariaLabel }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    // The picked year starts in view and focused, so the arrow keys and Enter work at once.
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])
  const current = options.find(option => option.value === value)

  function move(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return <div className="year-picker" ref={box}>
    <button type="button" className="year-picker-current" aria-label={`${ariaLabel}: ${current?.label ?? value}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
      {current?.label ?? value}<span aria-hidden="true">▼</span>
    </button>
    {open && <ul className="year-picker-list" role="listbox" aria-label={ariaLabel} ref={list} onKeyDown={move}>
      {options.map(option => <li key={option.value}>
        <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'active' : ''}
          onClick={() => { setOpen(false); if (option.value !== value) onChange(option.value) }}>
          {option.label}
        </button>
      </li>)}
    </ul>}
  </div>
}
