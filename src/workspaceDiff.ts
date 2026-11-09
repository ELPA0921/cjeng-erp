import type { WorkspaceData } from './workspaceTypes'

const collections = ['expenses', 'workLogs', 'purchases', 'deliveries', 'cardAccounting', 'estimateItems', 'estimates'] as const
type Collection = typeof collections[number]
export type WorkspaceOps = {
  upsert: Partial<Record<Collection, unknown[]>>
  delete: Partial<Record<Collection, string[]>>
  settings: Partial<Record<string, unknown>>
}

/**
 * Turns a save (whole collections, as the screens produce them) into only the rows
 * that were added, changed or removed, so the database writes just those.
 */
export function workspaceOps(before: WorkspaceData, patch: Partial<WorkspaceData>): WorkspaceOps {
  const ops: WorkspaceOps = { upsert: {}, delete: {}, settings: {} }
  for (const [key, value] of Object.entries(patch)) {
    if ((collections as readonly string[]).includes(key)) {
      const name = key as Collection
      const previous = new Map(((before[name] ?? []) as { id: string }[]).map(row => [row.id, JSON.stringify(row)]))
      const next = value as { id: string }[]
      const changed = next.filter(row => previous.get(row.id) !== JSON.stringify(row))
      const kept = new Set(next.map(row => row.id))
      const removed = [...previous.keys()].filter(id => !kept.has(id))
      if (changed.length) ops.upsert[name] = changed
      if (removed.length) ops.delete[name] = removed
    } else if (JSON.stringify(before[key as keyof WorkspaceData]) !== JSON.stringify(value)) {
      ops.settings[key] = value
    }
  }
  return ops
}

export const hasOps = (ops: WorkspaceOps) => [ops.upsert, ops.delete, ops.settings].some(group => Object.keys(group).length > 0)
