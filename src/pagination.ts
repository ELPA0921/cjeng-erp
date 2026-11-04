// Long lists show one page of rows at a time.

/** The page numbers to offer, 0-based: the first, the last and the two either side of the current one, with null for a gap. */
export function pageNumbers(page: number, pageCount: number): (number | null)[] {
  const shown = [...new Set([0, pageCount - 1, ...[-2, -1, 0, 1, 2].map(step => page + step)])]
    .filter(number => number >= 0 && number < pageCount)
    .sort((a, b) => a - b)
  return shown.flatMap((number, index) => index && number - shown[index - 1] > 1 ? [null, number] : [number])
}

/**
 * The page to show: the one holding the focused row when there is one, otherwise the asked page kept
 * within the pages there are now (rows may have been deleted since).
 */
export function currentPage(total: number, perPage: number, asked: number, focusIndex = -1) {
  if (focusIndex >= 0) return Math.floor(focusIndex / perPage)
  return Math.max(0, Math.min(asked, Math.ceil(total / perPage) - 1))
}
