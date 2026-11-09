import type { EstimateItem } from './estimateTypes.ts'

// First 원가 단가표, read from the company's own quotes (D:\창조이엔지, 2024–2026).
// "원가" notes mark prices from a 협력업체 quote (what we pay); "우리 견적" marks prices taken
// from our own quotes, which may already include a markup and should be checked.
type Seed = Omit<EstimateItem, 'id' | 'markup' | 'vendor' | 'priceDate' | 'note' | 'spec'> & Partial<Pick<EstimateItem, 'markup' | 'vendor' | 'priceDate' | 'note' | 'spec'>>

const rows: Seed[] = [
  // 판재·형강: priced by weight from the kg prices in 기준 설정.
  { category: '판재·형강', name: 'PLATE', spec: '판재 (두께 무관)', unit: 'KG', kind: '재료비', kgPerUnit: 1, shape: '판재', note: 'kg 단가 × 중량' },
  { category: '판재·형강', name: 'ANGLE', spec: '40×40×5T', unit: 'M', kind: '재료비', kgPerUnit: 2.95, shape: '형강', note: '단위중량 2.95kg/m' },
  { category: '판재·형강', name: 'ANGLE', spec: '50×50×6T', unit: 'M', kind: '재료비', kgPerUnit: 4.43, shape: '형강', note: '단위중량 4.43kg/m' },
  { category: '판재·형강', name: 'ANGLE', spec: '65×65×6T', unit: 'M', kind: '재료비', kgPerUnit: 5.91, shape: '형강', note: '단위중량 5.91kg/m' },
  { category: '판재·형강', name: 'FLAT BAR', spec: '50×6T', unit: 'M', kind: '재료비', kgPerUnit: 2.36, shape: '형강', note: '단위중량 2.36kg/m' },
  { category: '판재·형강', name: 'CHANNEL', spec: '100×50×5×7.5T', unit: 'M', kind: '재료비', kgPerUnit: 9.36, shape: '형강', note: '단위중량 9.36kg/m' },
  { category: '판재·형강', name: 'H-BEAM', spec: '150×150×7×10T', unit: 'M', kind: '재료비', kgPerUnit: 31.5, shape: '형강', note: '단위중량 31.5kg/m' },
  { category: '판재·형강', name: 'CHECK PLATE', spec: '3T', unit: 'KG', kind: '재료비', costGeneral: 1750, priceDate: '2026-07-28', note: '우리 견적 (LG화학 75CMM)' },
  { category: '판재·형강', name: '스테인리스 강판', spec: 'STS304 4×8×1.5T', unit: 'SHEET', kind: '재료비', costStainless: 160000, vendor: '성원테크', priceDate: '2024-10-22', note: '원가 (CJ진천 서브호퍼)' },

  // 덕트: CJ진천 견적 옆 칸에 남아 있던 원가, 견적에는 ×1.4로 들어감.
  ...([
    ['스파이럴 덕트 직관', 'Ø250', 'M', 62700], ['스파이럴 덕트 직관', 'Ø150', 'M', 37000], ['스파이럴 덕트 직관', 'Ø125', 'M', 37000],
    ['스파이럴 덕트 엘보', 'Ø250', 'EA', 67200], ['스파이럴 덕트 엘보', 'Ø150', 'EA', 39900], ['스파이럴 덕트 엘보', 'Ø125', 'EA', 39900],
    ['스파이럴 덕트 Y-TEE', 'Ø150×Ø125', 'EA', 52600], ['스파이럴 덕트 Y-TEE', 'Ø250×Ø150', 'EA', 87600],
    ['스파이럴 덕트 소켓', 'Ø250', 'EA', 15400], ['스파이럴 덕트 소켓', 'Ø150', 'EA', 10100], ['스파이럴 덕트 소켓', 'Ø125', 'EA', 10100],
    ['매뉴얼 댐퍼', 'Ø125', 'EA', 33000], ['덕트 행거', 'Ø250', 'EA', 11800], ['덕트 행거', 'Ø150', 'EA', 9400], ['덕트 행거', 'Ø125', 'EA', 9400],
  ] as const).map(([name, spec, unit, cost]): Seed => ({ category: '덕트·배관', name, spec: `STS304 ${spec}`, unit, kind: '재료비', costStainless: cost, markup: 1.4, priceDate: '2025-01-17', note: '원가 (CJ진천 햇반동 견적 원가 칸), 견적 배율 1.4' })),

  // 기기류
  { category: '기기류', name: '에어펄스형 집진기', spec: 'BAP-050 SUS304 60CMM×230mmAq×3.7kW', unit: 'SET', kind: '재료비', costStainless: 7080000, vendor: '비엠아이코리아', priceDate: '2026-08-12', note: '원가 (일반형, 운송·설치 별도)' },
  { category: '기기류', name: '에어펄스형 집진기 (비표준)', spec: 'BAP-050 SUS304 외부폴리싱, 테프론 필터', unit: 'SET', kind: '재료비', costStainless: 8500000, vendor: '비엠아이코리아', priceDate: '2025-01-15', note: '원가 (CJ진천 햇반동)' },
  { category: '기기류', name: 'TURBO FAN (방진가대 포함)', spec: '150CMM×100mmAq', unit: 'SET', kind: '재료비', costStainless: 6500000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM) — 원가 확인 필요' },
  { category: '기기류', name: 'EXHAUST FAN', spec: '80㎥/min×300mmAq×10HP', unit: 'SET', kind: '재료비', costStainless: 5800000, note: '우리 견적 중앙값 (13건) — 원가 확인 필요' },
  { category: '기기류', name: '오존발생기', spec: '60g/hr', unit: 'SET', kind: '재료비', costGeneral: 15000000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM) — 원가 확인 필요' },
  { category: '기기류', name: 'DBD 플라즈마 방전 모듈', unit: 'EA', kind: '재료비', costGeneral: 1500000, priceDate: '2026-07-28', note: '우리 견적 (LG화학 75CMM)' },
  { category: '기기류', name: '망간옥사이드계열 촉매', spec: '90%', unit: 'KG', kind: '재료비', costGeneral: 80000, priceDate: '2026-07-28', note: '우리 견적 (LG화학 75CMM)' },
  { category: '기기류', name: '활성탄', spec: '4~8#', unit: 'KG', kind: '재료비', costGeneral: 1600, priceDate: '2025-12-03', note: '우리 견적 (김포 진영 300CMM)' },
  { category: '기기류', name: '캔버스', unit: 'SET', kind: '재료비', costGeneral: 700000, costStainless: 700000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM)' },
  { category: '기기류', name: 'MANHOLE', spec: '400×400', unit: 'SET', kind: '재료비', costGeneral: 450000, costStainless: 450000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM)' },
  { category: '기기류', name: '관측창 (FLANGE / GLASS)', spec: '206×356', unit: 'EA', kind: '재료비', costGeneral: 200000, costStainless: 200000, priceDate: '2026-07-28', note: '우리 견적 (LG화학 75CMM)' },

  // 전기 (화성파워텍 견적을 그대로 재료비로 쓴 LG화학 건)
  { category: '전기', name: 'Main Control Panel', spec: 'SUS 900×1200×250', unit: 'EA', kind: '재료비', costStainless: 750000, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: '변압기 Panel', spec: 'SUS 1000×1200×250', unit: 'EA', kind: '재료비', costStainless: 650000, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: '고주파 인버터 SET', spec: 'AC220V 15kHz 3kW', unit: 'SET', kind: '재료비', costGeneral: 700000, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: '고주파 변압기', spec: '15kHz 250/10,000V 2KVA', unit: 'SET', kind: '재료비', costGeneral: 500000, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: 'MCCB', spec: 'ABE 32b 50A', unit: 'EA', kind: '재료비', costGeneral: 45500, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: 'M/G Contactor', spec: 'MC-9b', unit: 'EA', kind: '재료비', costGeneral: 11000, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: 'WHM', spec: 'GiMAC1000', unit: 'EA', kind: '재료비', costGeneral: 350000, vendor: '화성파워텍', priceDate: '2026-07-27', note: '원가' },
  { category: '전기', name: '제어판넬', spec: 'STS304 옥외 이중도어', unit: 'LOT', kind: '재료비', costStainless: 7000000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM) — 원가 확인 필요' },

  // 가공·부자재
  { category: '가공·부자재', name: '레이저 모형가공', unit: 'SET', kind: '재료비', costGeneral: 150000, costStainless: 150000, vendor: '성원테크', priceDate: '2024-10-22', note: '원가 (서브호퍼 1대분)' },
  { category: '가공·부자재', name: '절단 및 절곡', unit: 'SET', kind: '재료비', costGeneral: 80000, costStainless: 80000, vendor: '성원테크', priceDate: '2024-10-22', note: '원가 (서브호퍼 1대분)' },
  { category: '가공·부자재', name: '실리콘 패킹', spec: '1000×2000×10T', unit: 'SHEET', kind: '재료비', costGeneral: 220000, costStainless: 220000, vendor: '성원테크', priceDate: '2024-10-22', note: '원가' },
  { category: '가공·부자재', name: '용접봉 및 가스', unit: 'LOT', kind: '재료비', costGeneral: 200000, costStainless: 200000, note: '우리 견적 중앙값' },
  { category: '가공·부자재', name: '도장공사', unit: 'LOT', kind: '재료비', costGeneral: 900000, note: '우리 견적 중앙값 (49건)' },

  // 노무 (기공 300,000 / 조공 250,000이 90건 이상으로 가장 많음)
  { category: '노무', name: '제작비 기공', unit: 'M/D', kind: '노무비', costGeneral: 300000, costStainless: 300000, expense: 30000, note: '경비 30,000/일 포함' },
  { category: '노무', name: '제작비 조공', unit: 'M/D', kind: '노무비', costGeneral: 250000, costStainless: 250000, expense: 30000, note: '경비 30,000/일 포함' },
  { category: '노무', name: '설치비 기공', unit: 'M/D', kind: '노무비', costGeneral: 300000, costStainless: 300000, expense: 70000, note: '경비 70,000/일 포함' },
  { category: '노무', name: '설치비 조공', unit: 'M/D', kind: '노무비', costGeneral: 250000, costStainless: 250000, expense: 70000, note: '경비 70,000/일 포함' },
  { category: '노무', name: '용접사', unit: 'M/D', kind: '노무비', costGeneral: 300000, costStainless: 300000 },
  { category: '노무', name: '제관사', unit: 'M/D', kind: '노무비', costGeneral: 300000, costStainless: 300000 },
  { category: '노무', name: '공사감독관', unit: 'M/D', kind: '노무비', costGeneral: 300000, costStainless: 300000 },
  { category: '노무', name: '화기감시자', unit: 'M/D', kind: '노무비', costGeneral: 250000, costStainless: 250000 },

  // 장비·운반
  { category: '장비·운반', name: '크레인', spec: '100TON', unit: 'DAY', kind: '경비', costGeneral: 2000000, costStainless: 2000000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM)' },
  { category: '장비·운반', name: '지게차', spec: '5TON', unit: 'DAY', kind: '경비', costGeneral: 800000, costStainless: 800000, priceDate: '2025-11-07', note: '우리 견적 (정읍 150CMM)' },
  { category: '장비·운반', name: '운송비', spec: '5TON', unit: '회', kind: '경비', costGeneral: 1000000, costStainless: 1000000, priceDate: '2025-01-17', note: '우리 견적 (CJ진천 햇반동)' },
]

export const seedItems = (): EstimateItem[] => rows.map((row, index) => ({
  spec: '', markup: 1, vendor: '', priceDate: '', note: '', ...row, id: `item-seed-${String(index + 1).padStart(3, '0')}`,
}))
