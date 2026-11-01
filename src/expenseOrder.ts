import type { Expense } from './workspaceTypes'

/**
 * Order of expenses that share a date, newest first, the way the 지출내역 lists them by default.
 * Sorting oldest first, the printout and the CSV of that sort read it backwards, so the paper is
 * the newest-first screen turned upside down.
 * Rows someone has arranged with ▲▼ keep that order (their sequence counts from the top of the
 * newest-first list); rows added afterwards go above them, the latest on top.
 */
export function newestFirstOrder(expenses: Expense[]) {
  const stored = new Map(expenses.map((expense, index) => [expense.id, index]))
  return (a: Expense, b: Expense) => {
    const arranged = Number(a.sequence !== undefined) - Number(b.sequence !== undefined)
    if (arranged) return arranged
    if (a.sequence !== undefined && b.sequence !== undefined && a.sequence !== b.sequence) return a.sequence - b.sequence
    return (stored.get(b.id) ?? 0) - (stored.get(a.id) ?? 0)
  }
}

/**
 * Moves one row up (-1) or down (1) among the shown rows that share its date. Returns the new
 * sequence of every row on that date, or null when the neighbour in that direction is another
 * date (or there is none). Shown oldest first, the positions count from the bottom instead.
 */
export function moveWithinDate(shown: Expense[], id: string, direction: -1 | 1, oldestFirst = false) {
  const index = shown.findIndex(expense => expense.id === id)
  const neighbour = shown[index + direction]
  if (index < 0 || !neighbour || neighbour.date !== shown[index].date) return null
  const group = shown.filter(expense => expense.date === shown[index].date).map(expense => expense.id)
  const at = group.indexOf(id)
  ;[group[at], group[at + direction]] = [group[at + direction], group[at]]
  if (oldestFirst) group.reverse()
  return new Map(group.map((rowId, position) => [rowId, position]))
}
