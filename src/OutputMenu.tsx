import { useEffect, useRef, useState } from 'react'

/**
 * "인쇄 / CSV" button that opens 인쇄, 현재 페이지 인쇄 (when onPrintPage is given), CSV 내보내기
 * and (when onImportFile is given) CSV 가져오기.
 * Clicking outside or pressing Esc closes it.
 */
export default function OutputMenu({ empty, onPrint, onPrintPage, onExport, onImportFile }: {
  /** No rows to print or export. */
  empty: boolean
  onPrint: () => void
  /** Prints only the rows of the page shown on screen. */
  onPrintPage?: () => void
  onExport: () => void
  onImportFile?: (file: File) => void
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])
  const run = (action: () => void) => () => { setOpen(false); action() }

  return <details ref={menu} className="output-menu" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="ghost-button compact-button">인쇄 / CSV</summary>
    <div className="output-menu-list" role="menu">
      <button type="button" role="menuitem" disabled={empty} onClick={run(onPrint)}>인쇄</button>
      {onPrintPage && <button type="button" role="menuitem" disabled={empty} onClick={run(onPrintPage)}>현재 페이지 인쇄</button>}
      <button type="button" role="menuitem" disabled={empty} onClick={run(onExport)}>CSV 내보내기</button>
      {onImportFile && <label role="menuitem">
        CSV 가져오기
        <input accept=".csv,text/csv" type="file" onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          setOpen(false)
          if (file) onImportFile(file)
        }} />
      </label>}
    </div>
  </details>
}
