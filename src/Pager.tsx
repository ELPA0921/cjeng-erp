import { pageNumbers } from './pagination'

/** Page buttons under a long list, with which rows of how many are shown. Nothing when it all fits on one page. */
export default function Pager({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (page: number) => void }) {
  const pageCount = Math.ceil(total / perPage)
  if (pageCount < 2) return null
  return <nav className="pager" aria-label="쪽 이동">
    <button className="ghost-button compact-button" type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>‹ 이전</button>
    {pageNumbers(page, pageCount).map((number, index) => number === null
      ? <span key={`gap-${index}`} className="pager-gap">…</span>
      : <button key={number} className={number === page ? 'primary-button compact-button' : 'ghost-button compact-button'} type="button"
        aria-current={number === page ? 'page' : undefined} onClick={() => onPage(number)}>{number + 1}</button>)}
    <button className="ghost-button compact-button" type="button" disabled={page === pageCount - 1} onClick={() => onPage(page + 1)}>다음 ›</button>
    <span className="pager-range">{total}건 중 {page * perPage + 1}–{Math.min(total, (page + 1) * perPage)}</span>
  </nav>
}
