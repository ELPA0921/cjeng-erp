import type { IncomingMessage } from 'node:http'

/** The commit this deployment was built from ('' when run locally). */
export const serverBuild = () => process.env.VERCEL_GIT_COMMIT_SHA ?? ''

/**
 * A screen loaded before the latest deployment still runs that version's rules, so its saves
 * could undo what the new version protects. Such a screen is asked to reload before saving.
 */
export const outdatedClient = (req: IncomingMessage) => { const build = serverBuild(); return !!build && req.headers['x-app-build'] !== build }

export const outdatedMessage = '프로그램이 새 버전으로 바뀌었습니다. 저장되지 않았습니다. 새로고침(F5)한 뒤 다시 저장해 주세요.'
