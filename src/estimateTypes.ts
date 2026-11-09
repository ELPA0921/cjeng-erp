// 견적산출: the company's own cost price list (원가 단가표) and the estimates built from it.
// Costs are what the company pays (협력업체 견적·발주 금액); markup turns them into quoted prices.

export const grades = ['일반', '스텐'] as const
export type Grade = typeof grades[number]
export const costKinds = ['재료비', '노무비', '경비'] as const
export type CostKind = typeof costKinds[number]
export const steelShapes = ['판재', '형강'] as const
export type SteelShape = typeof steelShapes[number]
export const itemCategories = ['판재·형강', '덕트·배관', '기기류', '전기', '가공·부자재', '노무', '장비·운반', '기타'] as const

/** One row of the 원가 단가표. */
export type EstimateItem = {
  id: string
  category: string
  name: string
  spec: string
  unit: string
  kind: CostKind
  /** Weight per unit: the cost is kgPerUnit × the grade's kg price for its shape (판재 / 형강). */
  kgPerUnit?: number
  shape?: SteelShape
  /** Fixed 원가 per unit; leave one blank when the item only exists in the other grade. */
  costGeneral?: number
  costStainless?: number
  /** 경비 per unit that comes with it (제작 30,000 / 설치 70,000 per M/D). */
  expense?: number
  /** Default 배율 (견적 단가 = 원가 × 배율). */
  markup: number
  vendor: string
  /** 단가 기준일 (YYYY-MM-DD or blank). */
  priceDate: string
  note: string
}

/** 원가계산서 rates in percent. */
export type CostRates = {
  industrialAccident: number
  employment: number
  health: number
  pension: number
  /** Percent of 건강보험료. */
  longTermCare: number
  retirement: number
  /** Percent of (재료비 + 직접노무비). */
  safety: number
  environment: number
  otherExpense: number
  overhead: number
  /** Whether 일반관리비 is taken on 재료비 + 노무비 + 경비 (else 재료비 + 노무비). */
  overheadIncludesExpense: boolean
  profit: number
}

export type KgPrices = Record<`${Grade}${SteelShape}`, number>

export type EstimateSettings = {
  kgPrices: KgPrices
  rates: CostRates
  /** Where the kg prices came from. */
  kgNote: string
}

export type EstimateLine = {
  id: string
  /** The 단가표 row it came from; blank for a line typed by hand. */
  itemId?: string
  name: string
  spec: string
  unit: string
  qty: number
  grade: Grade
  /** 원가 단가 for each column. */
  matCost: number
  labCost: number
  expCost: number
  markup: number
}

export type EstimateSection = {
  id: string
  name: string
  /** 잡자재비 as a percent of the section's 재료비 (0 = none). */
  miscRate: number
  lines: EstimateLine[]
}

export type Estimate = {
  id: string
  no: string
  title: string
  client: string
  date: string
  paymentTerms: string
  supplyPeriod: string
  delivery: string
  validity: string
  remarks: string
  /** 일반 / 스텐: the grade new lines take, and the one 전체 전환 applies. */
  grade: Grade
  /** 총 합계 is cut down to a multiple of this (1 = no cut). */
  roundTo: number
  rates: CostRates
  sections: EstimateSection[]
  updatedAt: string
}

// Latest 원가계산서 (LG화학 75CMM, 2026-07).
export const defaultRates = (): CostRates => ({
  industrialAccident: 3.56,
  employment: 1.01,
  health: 3.545,
  pension: 4.5,
  longTermCare: 12.95,
  retirement: 2.3,
  safety: 2.93,
  environment: 0.5,
  otherExpense: 3,
  overhead: 6,
  overheadIncludesExpense: false,
  profit: 15,
})

export const defaultSettings = (): EstimateSettings => ({
  kgPrices: { 일반판재: 1600, 일반형강: 1300, 스텐판재: 4800, 스텐형강: 7500 },
  rates: defaultRates(),
  kgNote: '2026년 견적 기준 (일반 판재: 담배박 26-09, 일반 형강: LG화학 26-07, 스텐 판재: 담배박 26-09, 스텐 형강: LG화학 STS ANGLE 26-07)',
})

/** Stored settings may be partial (or missing in older snapshots); fills the gaps with the defaults. */
export function normalizeSettings(raw: Partial<EstimateSettings> | undefined | null): EstimateSettings {
  const defaults = defaultSettings()
  return {
    kgPrices: { ...defaults.kgPrices, ...raw?.kgPrices },
    rates: { ...defaults.rates, ...raw?.rates },
    kgNote: raw?.kgNote ?? defaults.kgNote,
  }
}
