import type { Expense } from './workspaceTypes.ts'

/**
 * 장비·운반비 내역: 장비(크레인·지게차·고소작업대·스카이·사다리차·포크레인) and 운반비(화물차) spending,
 * picked out of the expenses by their 거래처 and 내용 as soon as they are registered. 택배 is not part
 * of it. An expense's `freight` field overrides the guess: one of the categories, or '제외' to keep it
 * off the list.
 */
export const equipmentCategories = ['크레인', '지게차', '고소작업대', '스카이', '사다리차', '포크레인'] as const
export const freightCategories = [...equipmentCategories, '화물차'] as const
export type FreightCategory = typeof freightCategories[number]
export type EquipmentCategory = typeof equipmentCategories[number]
export const freightSettings = [...freightCategories, '제외'] as const
export type FreightSetting = typeof freightSettings[number]
export const freightGroupOf = (category: FreightCategory): '장비' | '운반비' => category === '화물차' ? '운반비' : '장비'

// 포크레인 comes before 크레인, which its name contains; 사다리차 and 스카이 before 화물, since their
// vendors are often called 화물 or 크레인.
const ladder = /사다리차/
const excavator = /포크레인|포클레인|굴삭기|굴착기/
// '스카이' is read in the 내용 ("5t 스카이", "스카이 사용료") or at the end of the 거래처 ("우진스카이"),
// so 스카이물류, 스카이주유소 and the like stay out.
const skyMemo = /스카이차|스카이 ?사용료|\d+(\.\d+)?t ?스카이|^\s*스카이\s*$/
const skyVendor = /.스카이\s*$/
const aerial = /고소작업|고소장비|시저리프트/
const rental = /렌탈/
const crane = /크레인|크래인|기중기/
const forklift = /지게차|중기|건설기계/
// Carrying a piece of equipment somewhere ("고소작업대 外 운송비") is 운반비.
const moving = /운송|운반|운임/
// Parcel and small-freight services, mostly paid by card for a part or two: left out.
const parcel = /택배|대신(정기)?화물|경동화물|합동화물|천일화물|우체국|퀵서비스|퀵배송/
const truck = /화물|운반|운송|운임|물류|통운|상운|운수|용달|탁송/

/** What the 거래처 and 내용 say the expense is, or null when it is none of them. */
export function guessFreight(expense: Pick<Expense, 'vendor' | 'memo'>): FreightCategory | null {
  const text = `${expense.memo} ${expense.vendor}`
  const carried = moving.test(expense.memo)
  if (!carried) {
    if (ladder.test(text)) return '사다리차'
    if (excavator.test(text)) return '포크레인'
    if (aerial.test(text)) return '고소작업대'
    if (skyMemo.test(expense.memo) || (skyVendor.test(expense.vendor) && !crane.test(expense.memo))) return '스카이'
  }
  if (crane.test(text)) return '크레인'
  if (forklift.test(text)) return '지게차'
  if (!carried && rental.test(text)) return '고소작업대'
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

/**
 * 출발지 and 목적지 read from a 내용 like "공장 -> 일산실업 화물비" or "운반비(공장->영광)":
 * an arrow between the two, with order numbers in brackets and words like 운반비 dropped.
 */
export function guessRoute(memo: string): { from: string; to: string } | null {
  const text = memo.replace(/\((오더|주문)[^)]*\)/g, ' ')
  const inner = /\(([^()]*(->|→|➝|⇒)[^()]*)\)/.exec(text)?.[1] ?? text
  const parts = inner.split(/\s*(?:->|→|➝|⇒)\s*/)
  if (parts.length !== 2) return null
  const clean = (value: string) => value.replace(/(화물비|운반비|운송비|운송료|운임|운반|화물)\s*$/, '').replace(/^\s*(화물비|운반비|운송비|운송료|운임)\s*/, '').trim()
  const from = clean(parts[0]), to = clean(parts[1])
  return from && to ? { from, to } : null
}
