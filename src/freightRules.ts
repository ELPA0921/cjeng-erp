import type { Expense } from './workspaceTypes.ts'

/**
 * 장비·운반비 내역: 장비(크레인·지게차·고소작업대) and 운반비(화물차) spending, picked out of the expenses by
 * their 거래처 and 내용 as soon as they are registered. 택배 is not part of it. An expense's
 * `freight` field overrides the guess: one of the categories, or '제외' to keep it off the list.
 */
export const freightCategories = ['크레인', '지게차', '고소작업대', '화물차'] as const
export type FreightCategory = typeof freightCategories[number]
export const freightSettings = [...freightCategories, '제외'] as const
export type FreightSetting = typeof freightSettings[number]
export const freightGroups: Record<FreightCategory, '장비' | '운반비'> = { 크레인: '장비', 지게차: '장비', 고소작업대: '장비', 화물차: '운반비' }

const crane = /크레인|크래인|기중기/
const forklift = /지게차|중기|건설기계/
// 고소작업대 rentals (often from a 고소작업대렌탈 vendor) and 스카이차; '스카이' alone is only read in the
// 내용, since 스카이물류, 스카이주유소 and the like are other things. Moving one by truck is 운반비.
const aerial = /고소작업|고소장비|시저리프트/
const skyMemo = /스카이차|스카이 ?사용료|\d+(\.\d+)?t ?스카이|^\s*스카이\s*$/
const moving = /운송|운반|운임/
// Parcel and small-freight services, mostly paid by card for a part or two: left out.
const parcel = /택배|대신(정기)?화물|경동화물|합동화물|천일화물|우체국|퀵서비스|퀵배송/
const truck = /화물|운반|운송|운임|물류|통운|상운|운수|용달|탁송/

/** What the 거래처 and 내용 say the expense is, or null when it is none of them. */
export function guessFreight(expense: Pick<Expense, 'vendor' | 'memo'>): FreightCategory | null {
  const text = `${expense.memo} ${expense.vendor}`
  if ((aerial.test(text) || skyMemo.test(expense.memo)) && !moving.test(expense.memo)) return '고소작업대'
  if (crane.test(text)) return '크레인'
  if (forklift.test(text)) return '지게차'
  if (parcel.test(text)) return null
  if (truck.test(text)) return '화물차'
  return null
}

/** The category the expense is listed under: the one set by hand, else the guess. */
export function freightOf(expense: Pick<Expense, 'vendor' | 'memo' | 'freight'>): FreightCategory | null {
  if (expense.freight === '제외') return null
  if (expense.freight && (freightCategories as readonly string[]).includes(expense.freight)) return expense.freight as FreightCategory
  return guessFreight(expense)
}

export const isFreightSetting = (value: unknown): value is FreightSetting => (freightSettings as readonly unknown[]).includes(value)

/** 운반비 has one kind (화물차), so it is shown by the group's name. */
export const freightLabel = (category: FreightCategory) => category === '화물차' ? '운반비' : category
