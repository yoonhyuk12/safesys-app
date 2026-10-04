// 프로젝트 진입 시 자동으로 띄우는 안전 공지 내용 — 공지를 바꾸려면 이 상수만 고친다

export interface SafetyNotice {
  title: string
  headline: string
  items: string[]
}

export const CURRENT_SAFETY_NOTICE: SafetyNotice | null = {
  title: '00본부 00지사 사고 공유',
  headline: '26.10.02(금) 13:48 굴삭기 버킷 탈락 사망사고 발생',
  items: [
    '현장에서는 굴삭기 안전핀 체결 확인',
    '유도자 및 작업지휘자 배치 철저',
    '작업계획서 작성 철저',
  ],
}
