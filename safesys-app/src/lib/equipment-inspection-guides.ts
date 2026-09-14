// 장비 일일점검 안내 이미지(원본 PDF에서 추출한 도해)를 장비 ID로 연결한다.

/** public 정적 자산의 안내 이미지 뿌리 경로. */
export const EQUIPMENT_GUIDE_BASE = '/equipment-inspection/guides'

export interface EquipmentGuideImage {
  /** public 기준 절대 경로. 원본 PDF에서 뽑은 바이트를 그대로 보관한 파일이다. */
  src: string
  /** 원본 픽셀 크기. DOM 없이 비율을 계산해야 하는 HWPX 출력이 이 값을 쓴다. */
  width: number
  height: number
}

/**
 * 장비 ID별 안내 이미지. 원본에 도해가 없는 준설선(equipment-20)·쇄석기(equipment-21)는 항목 자체가 없다.
 * 덤프트럭(equipment-23)만 두 장이며 두 장 모두 보여 준다.
 */
export const EQUIPMENT_GUIDE_IMAGES: Record<string, EquipmentGuideImage[]> = {
  'equipment-01': [ // 타워크레인 — 원본 6쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-01/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-02': [ // 이동식 크레인 — 원본 7쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-02/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-03': [ // 클램셀 — 원본 8쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-03/guide-01.jpeg`, width: 627, height: 468 },
  ],
  'equipment-04': [ // 항타항발기 — 원본 9쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-04/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-05': [ // 천공기 — 원본 10쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-05/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-06': [ // 굴착기 — 원본 11쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-06/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-07': [ // 지게차 — 원본 12쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-07/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-08': [ // 고소작업대 (테이블 리프트) — 원본 13쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-08/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-09': [ // 고소작업대 (차량탑재형) — 원본 14쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-09/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-10': [ // 건설용 리프트 — 원본 15쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-10/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-11': [ // 곤돌라 — 원본 16쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-11/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-12': [ // 콘크리트 펌프카 — 원본 17쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-12/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-13': [ // 콘크리트 플레이싱 붐(CPB) — 원본 18쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-13/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-14': [ // 로더 — 원본 19쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-14/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-15': [ // 롤러 — 원본 20쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-15/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-16': [ // 불도저 — 원본 21쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-16/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-17': [ // 모터그레이더 — 원본 22쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-17/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-18': [ // 스크레퍼 — 원본 23쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-18/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-19': [ // 공기압축기 — 원본 24쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-19/guide-01.jpeg`, width: 1000, height: 419 },
  ],
  'equipment-22': [ // 믹서트럭 — 원본 27쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-22/guide-01.jpeg`, width: 899, height: 411 },
  ],
  'equipment-23': [ // 덤프트럭 — 원본 28쪽
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-23/guide-01.jpeg`, width: 974, height: 643 },
    { src: `${EQUIPMENT_GUIDE_BASE}/equipment-23/guide-02.jpeg`, width: 996, height: 631 },
  ],
}

/** 알 수 없는 장비나 도해가 없는 장비는 빈 배열이다 — 빈 자리를 만들지 않는다. */
export function equipmentGuideImages(equipmentId: string | null | undefined): EquipmentGuideImage[] {
  if (!equipmentId || !Object.hasOwn(EQUIPMENT_GUIDE_IMAGES, equipmentId)) return []
  return EQUIPMENT_GUIDE_IMAGES[equipmentId]
}
