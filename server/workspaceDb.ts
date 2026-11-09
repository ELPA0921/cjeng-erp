import { randomUUID } from 'node:crypto'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { WorkspaceData, WorkspaceSnapshot } from '../src/workspaceTypes.ts'
import { validateCollection, validateSetting, workspaceCollections, workspaceSettings, type WorkspaceCollection, type WorkspaceSetting } from './workspaceValidation.ts'

// Shared workspace stored row by row: saving one expense writes one row instead of the
// whole workspace. One revision covers the workspace so concurrent saves still conflict
// the same way they did on Google Sheets.
type Sql = NeonQueryFunction<false, false>
export type WorkspaceOps = {
  upsert: Partial<Record<WorkspaceCollection, unknown[]>>
  delete: Partial<Record<WorkspaceCollection, string[]>>
  settings: Partial<Record<WorkspaceSetting, unknown>>
}

export function workspaceSql(url: string | undefined): Sql {
  if (!url) throw new Error('데이터베이스 연결 설정이 필요합니다.')
  return neon(url)
}

export async function ensureWorkspaceSchema(sql: Sql) {
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS cjeng_workspace_meta (id integer PRIMARY KEY CHECK (id = 1), revision bigint NOT NULL DEFAULT 0, initialized boolean NOT NULL DEFAULT false, write_token text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`,
    sql`CREATE TABLE IF NOT EXISTS cjeng_workspace_records (collection text NOT NULL, id text NOT NULL, seq bigserial, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, PRIMARY KEY (collection, id))`,
    sql`CREATE TABLE IF NOT EXISTS cjeng_workspace_settings (key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS cjeng_order_workspace (id integer PRIMARY KEY CHECK (id = 1), orders jsonb NOT NULL DEFAULT '[]'::jsonb, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`,
    sql`INSERT INTO cjeng_workspace_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
    sql`INSERT INTO cjeng_order_workspace (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  ])
}

export async function readWorkspaceRevision(sql: Sql) {
  const [meta] = await sql`SELECT revision::text AS revision FROM cjeng_workspace_meta WHERE id = 1`
  return meta ? String(meta.revision) : null
}

export async function readWorkspaceRows(sql: Sql): Promise<WorkspaceSnapshot> {
  const [metaRows, records, settings] = await sql.transaction([
    sql`SELECT revision::text AS revision, initialized FROM cjeng_workspace_meta WHERE id = 1`,
    sql`SELECT collection, data FROM cjeng_workspace_records ORDER BY seq`,
    sql`SELECT key, data FROM cjeng_workspace_settings`,
  ], { readOnly: true })
  const meta = metaRows[0]
  if (!meta) throw new Error('공유 자료 데이터베이스 초기 설정이 필요합니다.')
  const data = Object.fromEntries(workspaceCollections.map(name => [name, [] as unknown[]])) as Record<string, unknown>
  for (const row of records) (data[String(row.collection)] as unknown[] | undefined)?.push(row.data)
  const stored = new Map(settings.map(row => [String(row.key), row.data]))
  for (const name of workspaceSettings) data[name] = stored.get(name) ?? (name === 'vendorEdits' || name === 'estimateSettings' ? {} : name === 'customVendorContacts' ? { purchase: [], order: [] } : [])
  return { data: data as WorkspaceData, revision: String(meta.revision), initialized: meta.initialized === true }
}

/** Checks and normalizes a save request before anything touches the database. */
export function validateOps(input: unknown): WorkspaceOps {
  const ops = input && typeof input === 'object' ? input as Record<string, Record<string, unknown>> : {}
  const result: WorkspaceOps = { upsert: {}, delete: {}, settings: {} }
  for (const [name, rows] of Object.entries(ops.upsert ?? {})) {
    if (!(workspaceCollections as readonly string[]).includes(name)) throw new Error('저장할 자료 종류를 확인하세요.')
    result.upsert[name as WorkspaceCollection] = validateCollection(name as WorkspaceCollection, rows)
  }
  for (const [name, ids] of Object.entries(ops.delete ?? {})) {
    if (!(workspaceCollections as readonly string[]).includes(name) || !Array.isArray(ids) || ids.length > 20000 || !ids.every(id => typeof id === 'string' && id && id.length <= 200)) throw new Error('삭제할 자료를 확인하세요.')
    result.delete[name as WorkspaceCollection] = [...new Set(ids as string[])]
  }
  for (const [name, value] of Object.entries(ops.settings ?? {})) {
    if (!(workspaceSettings as readonly string[]).includes(name)) throw new Error('저장할 설정을 확인하세요.')
    result.settings[name as WorkspaceSetting] = validateSetting(name as WorkspaceSetting, value)
  }
  return result
}

function rowsOf(ops: WorkspaceOps) {
  return {
    upserts: Object.entries(ops.upsert).flatMap(([collection, rows]) => (rows ?? []).map(row => ({ collection, id: String((row as { id: unknown }).id), data: row }))),
    deletes: Object.entries(ops.delete).flatMap(([collection, ids]) => (ids ?? []).map(id => ({ collection, id }))),
    settings: Object.entries(ops.settings).map(([key, data]) => ({ key, data })),
  }
}

/**
 * Applies the changes in one transaction if nobody saved since `revision`.
 * Every write is guarded by the token the revision bump set, so a stale save writes nothing.
 * Returns the new revision, or null on a conflict.
 */
export async function applyWorkspaceOps(sql: Sql, ops: WorkspaceOps, revision: string, email: string, options: { replace?: boolean } = {}) {
  if (!/^\d+$/.test(revision)) return null
  const token = randomUUID()
  const { upserts, deletes, settings } = rowsOf(ops)
  const queries = [
    sql`UPDATE cjeng_workspace_meta SET revision = revision + 1, initialized = true, write_token = ${token}, updated_at = now(), updated_by = ${email} WHERE id = 1 AND revision = ${revision}::bigint RETURNING revision::text AS revision`,
    ...(options.replace ? [
      sql`DELETE FROM cjeng_workspace_records WHERE EXISTS (SELECT 1 FROM cjeng_workspace_meta WHERE id = 1 AND write_token = ${token})`,
      sql`DELETE FROM cjeng_workspace_settings WHERE EXISTS (SELECT 1 FROM cjeng_workspace_meta WHERE id = 1 AND write_token = ${token})`,
    ] : []),
    ...(deletes.length ? [sql`DELETE FROM cjeng_workspace_records r USING jsonb_to_recordset(${JSON.stringify(deletes)}::jsonb) AS x(collection text, id text) WHERE r.collection = x.collection AND r.id = x.id AND EXISTS (SELECT 1 FROM cjeng_workspace_meta WHERE id = 1 AND write_token = ${token})`] : []),
    // Insert in chunks so one statement never carries the whole workspace.
    ...chunk(upserts, 1000).map(part => sql`INSERT INTO cjeng_workspace_records (collection, id, data, updated_by)
      SELECT x.value->>'collection', x.value->>'id', x.value->'data', ${email} FROM jsonb_array_elements(${JSON.stringify(part)}::jsonb) WITH ORDINALITY AS x(value, n)
      WHERE EXISTS (SELECT 1 FROM cjeng_workspace_meta WHERE id = 1 AND write_token = ${token}) ORDER BY x.n
      ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`),
    ...(settings.length ? [sql`INSERT INTO cjeng_workspace_settings (key, data) SELECT x.key, x.data FROM jsonb_to_recordset(${JSON.stringify(settings)}::jsonb) AS x(key text, data jsonb) WHERE EXISTS (SELECT 1 FROM cjeng_workspace_meta WHERE id = 1 AND write_token = ${token})
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`] : []),
  ]
  const [bumped] = await sql.transaction(queries)
  return bumped[0] ? String(bumped[0].revision) : null
}

function chunk<T>(rows: T[], size: number) {
  const parts: T[][] = []
  for (let start = 0; start < rows.length; start += size) parts.push(rows.slice(start, start + size))
  return parts
}

/** Ops that replace the whole workspace with `data` (first connection and the one-time copy). */
export function replaceOps(data: WorkspaceData): WorkspaceOps {
  return {
    upsert: Object.fromEntries(workspaceCollections.map(name => [name, data[name]])),
    delete: {},
    settings: Object.fromEntries(workspaceSettings.map(name => [name, data[name]])),
  }
}
