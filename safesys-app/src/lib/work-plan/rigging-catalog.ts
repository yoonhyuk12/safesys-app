// 줄걸이 용구 종류별 표준 규격(직경·절단하중·정격하중) 퀵 입력 데이터를 제공한다.

import type { RiggingCapacityReview, RiggingTool } from './types'

export interface RiggingSpecItem {
  label: string
  patch: Partial<RiggingCapacityReview>
}

export interface RiggingSpecGroup {
  tool: RiggingTool
  note: string
  items: RiggingSpecItem[]
}

// 와이어로프 절단하중: KS D 3514 6×24 마심(FC) G종 인장강도표 기준 (출처: 화산로프 ropeshop.co.kr, 2026-07-11 확인)
const WIRE_ROPE_SPECS: RiggingSpecItem[] = [
  [10, 4.64],
  [12, 6.68],
  [14, 9.09],
  [16, 11.9],
  [18, 15.0],
  [20, 18.5],
  [22.4, 23.3],
  [24, 26.7],
].map(([diameterMm, breakingLoadTon]) => ({
  label: `Φ${diameterMm}·절단 ${breakingLoadTon}t`,
  patch: { diameterMm, breakingLoadTon },
}))

// 섬유로프(벨트·라운드슬링): 시판 정격하중 클래스 기준, 절단하중은 안전계수 7:1 표준에 따라 정격×7로 환산
const FIBER_SLING_SPECS: RiggingSpecItem[] = [1, 2, 3, 5].map((ratedTon) => ({
  label: `정격 ${ratedTon}t`,
  patch: { safeLoadPerToolTon: ratedTon, breakingLoadTon: ratedTon * 7 },
}))

// 체인블럭: 제조사 공통 정격하중 라인업(개당 안전하중으로 입력)
const CHAIN_BLOCK_SPECS: RiggingSpecItem[] = [0.5, 1, 1.5, 2, 3, 5].map((ratedTon) => ({
  label: `정격 ${ratedTon}t`,
  patch: { safeLoadPerToolTon: ratedTon },
}))

// 훅 용구 이름 프리셋 — 무엇을 써야 할지 모를 때 제안하는 대표 용구
export const HOOK_TOOL_PRESETS = ['샤클', '훅', '마스터링크', '아이볼트'] as const

// 샤클 사용하중: 단조샤클(BC형) 호칭경(inch)별 사용하중 기준 (출처: 태진로프산업 taejin112.com, 2026-07-11 확인)
const SHACKLE_SIZES = [
  { fraction: '3/8', inch: 0.375, ton: 1 },
  { fraction: '1/2', inch: 0.5, ton: 2 },
  { fraction: '5/8', inch: 0.625, ton: 3.25 },
  { fraction: '3/4', inch: 0.75, ton: 4.75 },
  { fraction: '7/8', inch: 0.875, ton: 6.5 },
  { fraction: '1', inch: 1, ton: 8.5 },
]

export const SHACKLE_SPECS: RiggingSpecItem[] = SHACKLE_SIZES.map(({ fraction, inch, ton }) => ({
  label: `${fraction}″·${ton}t`,
  patch: { hookTool: '샤클', hookDiameterInch: inch, hookSafeLoadTon: ton },
}))

export const SHACKLE_NOTE = '단조샤클(BC형) 호칭경별 사용하중 기준입니다. 제품 각인으로 확인하세요.'

export const RIGGING_STANDARD_SPECS: RiggingSpecGroup[] = [
  {
    tool: '와이어로프',
    note: 'KS D 3514 6×24(G종) 직경별 절단하중 기준입니다. 실제 제품 성적서로 확인하세요.',
    items: WIRE_ROPE_SPECS,
  },
  {
    tool: '섬유로프',
    note: '벨트·라운드슬링 정격하중 기준(안전계수 7:1, 절단하중=정격×7)입니다. 제품 라벨로 확인하세요.',
    items: FIBER_SLING_SPECS,
  },
  {
    tool: '체인블럭',
    note: '체인블럭 정격하중을 개당 안전하중으로 입력합니다. 명판으로 확인하세요.',
    items: CHAIN_BLOCK_SPECS,
  },
]
