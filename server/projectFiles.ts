import type { NeonQueryFunction } from '@neondatabase/serverless'

// Pictures that belong to a 공사: scanned 발주서 and the 사진대지 album. They live in their own
// table, apart from the workspace rows, so the polled workspace never carries image bytes.
type Sql = NeonQueryFunction<false, false>

export const fileKinds = ['purchaseOrder', 'photo'] as const
export type FileKind = typeof fileKinds[number]
export type ProjectFileMeta = Record<string, string>
export type ProjectFile = { id: string; projectId: string; kind: FileKind; meta: ProjectFileMeta; contentType: string; size: number; createdAt: string; createdBy: string }

// Text fields each kind keeps, with their longest allowed length.
const metaFields: Record<FileKind, Record<string, number>> = {
  // A 발주서 of several pages keeps one picture per row tied together by the same group.
  purchaseOrder: { vendor: 200, item: 500, date: 10, poNumber: 50, fileName: 200, group: 100 },
  photo: { caption: 500, date: 10, fileName: 200, group: 100 },
}
// Uploads arrive as base64 JSON, so the decoded picture stays under Vercel's 4.5MB request body.
export const maxFileBytes = 3_000_000
const maxThumbBytes = 300_000
const signatures: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': bytes => bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP',
}

export class FileInputError extends Error {}

function text(value: unknown, max: number, required = false) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new FileInputError('입력값을 확인해 주세요.')
  return value.trim()
}

export function validateKind(value: unknown): FileKind {
  if (!(fileKinds as readonly unknown[]).includes(value)) throw new FileInputError('파일 종류를 확인해 주세요.')
  return value as FileKind
}

export function validateMeta(kind: FileKind, value: unknown): ProjectFileMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FileInputError('입력값을 확인해 주세요.')
  const input = value as Record<string, unknown>
  const meta = Object.fromEntries(Object.entries(metaFields[kind]).map(([field, max]) => [field, text(input[field], max)]))
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new FileInputError('날짜를 확인해 주세요.')
  return meta
}

function image(value: unknown, contentType: string, max: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > Math.ceil(max / 3) * 4) throw new FileInputError('사진 파일을 확인해 주세요.')
  const bytes = Buffer.from(value, 'base64')
  if (!bytes.length || bytes.length > max || !signatures[contentType]?.(bytes)) throw new FileInputError('사진 파일을 확인해 주세요.')
  return bytes
}

/** Checks an upload; the picture must really be the JPEG, PNG or WebP it claims to be. */
export function validateUpload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FileInputError('입력값을 확인해 주세요.')
  const input = value as Record<string, unknown>
  const kind = validateKind(input.kind)
  const contentType = text(input.contentType, 20, true)
  if (!signatures[contentType]) throw new FileInputError('JPG, PNG, WebP 사진만 올릴 수 있습니다.')
  return {
    projectId: text(input.projectId, 200, true),
    // The 공사's folder name in the shared drive, such as "24012 집진시스템 개선 공사".
    folder: text(input.folder, 200),
    kind,
    meta: validateMeta(kind, input.meta ?? {}),
    contentType,
    data: image(input.data, contentType, maxFileBytes),
    thumb: input.thumb === undefined ? null : image(input.thumb, 'image/jpeg', maxThumbBytes),
  }
}

export async function ensureFileSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS cjeng_project_files (id text PRIMARY KEY, project_id text NOT NULL, kind text NOT NULL, meta jsonb NOT NULL, content_type text NOT NULL, data bytea NOT NULL, thumb bytea, size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by text)`
  await sql`CREATE INDEX IF NOT EXISTS cjeng_project_files_project ON cjeng_project_files (project_id, kind)`
  // A picture kept in the shared drive has its Drive file id here and no bytes of its own; its preview stays.
  await sql`ALTER TABLE cjeng_project_files ADD COLUMN IF NOT EXISTS drive_id text`
  await sql`ALTER TABLE cjeng_project_files ALTER COLUMN data DROP NOT NULL`
}

const extension = (contentType: string) => contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'

/** The file name a picture gets in the shared drive, from its details and the name it was uploaded with. */
export function pictureName(kind: FileKind, meta: ProjectFileMeta, contentType: string) {
  const stem = (meta.fileName ?? '').replace(/\.[^.]*$/, '')
  const parts = kind === 'purchaseOrder' ? [meta.poNumber || meta.date, meta.vendor, stem] : [meta.date, meta.caption, stem]
  return `${parts.filter(Boolean).join('_') || (kind === 'purchaseOrder' ? '발주서' : '사진')}.${extension(contentType)}`
}
export const kindFolder = (kind: FileKind) => kind === 'purchaseOrder' ? '발주서' : '사진대지'

const toFile = (row: Record<string, unknown>): ProjectFile => ({
  id: String(row.id), projectId: String(row.project_id), kind: row.kind as FileKind, meta: row.meta as ProjectFileMeta,
  contentType: String(row.content_type), size: Number(row.size), createdAt: new Date(row.created_at as string).toISOString(), createdBy: String(row.created_by ?? ''),
})

export async function listFiles(sql: Sql, projectId: string) {
  const rows = await sql`SELECT id, project_id, kind, meta, content_type, size, created_at, created_by FROM cjeng_project_files WHERE project_id = ${projectId} ORDER BY created_at, id`
  return rows.map(toFile)
}

/**
 * The picture itself, or its small JPEG preview when one was stored. A picture kept in the shared
 * drive comes back with no data and its driveId, for the caller to fetch.
 */
export async function readFile(sql: Sql, id: string, thumb: boolean) {
  const [row] = thumb
    ? await sql`SELECT CASE WHEN thumb IS NULL THEN content_type ELSE 'image/jpeg' END AS content_type, encode(coalesce(thumb, data), 'base64') AS data, drive_id FROM cjeng_project_files WHERE id = ${id}`
    : await sql`SELECT content_type, encode(data, 'base64') AS data, drive_id FROM cjeng_project_files WHERE id = ${id}`
  if (!row) return null
  return { contentType: String(row.content_type), data: row.data == null ? null : Buffer.from(String(row.data), 'base64'), driveId: row.drive_id == null ? null : String(row.drive_id) }
}

/** Stores a picture; with a driveId the original already sits in the shared drive and only its preview is kept here. */
export async function insertFile(sql: Sql, id: string, upload: ReturnType<typeof validateUpload>, email: string, driveId: string | null = null) {
  const [row] = await sql`INSERT INTO cjeng_project_files (id, project_id, kind, meta, content_type, data, thumb, size, created_by, drive_id)
    VALUES (${id}, ${upload.projectId}, ${upload.kind}, ${JSON.stringify(upload.meta)}::jsonb, ${upload.contentType}, decode(${driveId ? null : upload.data.toString('base64')}::text, 'base64'),
      decode(${upload.thumb?.toString('base64') ?? null}::text, 'base64'), ${upload.data.length}, ${email}, ${driveId})
    RETURNING id, project_id, kind, meta, content_type, size, created_at, created_by`
  return toFile(row)
}

export async function updateFileMeta(sql: Sql, id: string, meta: unknown) {
  const [current] = await sql`SELECT kind FROM cjeng_project_files WHERE id = ${id}`
  if (!current) return null
  const [row] = await sql`UPDATE cjeng_project_files SET meta = ${JSON.stringify(validateMeta(validateKind(current.kind), meta))}::jsonb WHERE id = ${id}
    RETURNING id, project_id, kind, meta, content_type, size, created_at, created_by`
  return row ? toFile(row) : null
}

/** Removes a picture; the result says where its original was, so a shared drive copy can be trashed too. */
export async function deleteFile(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM cjeng_project_files WHERE id = ${id} RETURNING drive_id`
  return row ? { driveId: row.drive_id == null ? null : String(row.drive_id) } : null
}

/** A few pictures still kept in the database, oldest first, for moving to the shared drive. */
export async function listUnmoved(sql: Sql, limit: number) {
  const rows = await sql`SELECT id, project_id, kind, meta, content_type, size, created_at, created_by, encode(data, 'base64') AS data FROM cjeng_project_files
    WHERE drive_id IS NULL AND data IS NOT NULL ORDER BY created_at, id LIMIT ${limit}`
  const [count] = await sql`SELECT count(*)::int AS left FROM cjeng_project_files WHERE drive_id IS NULL AND data IS NOT NULL`
  return { files: rows.map(row => ({ ...toFile(row), data: Buffer.from(String(row.data), 'base64') })), left: Number(count.left) }
}

/** Points a picture at its shared drive copy and lets go of the bytes kept here. */
export async function markMoved(sql: Sql, id: string, driveId: string) {
  const rows = await sql`UPDATE cjeng_project_files SET drive_id = ${driveId}, data = NULL WHERE id = ${id} AND drive_id IS NULL RETURNING id`
  return rows.length > 0
}
