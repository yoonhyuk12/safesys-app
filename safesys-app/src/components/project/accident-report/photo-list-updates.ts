// 사고발생보고서 사진 목록을 최신 목록에서 새로 계산하는 순수 함수 모음

import { ACCIDENT_REPORT_MAX_PHOTOS, type AccidentReportPhoto } from '@/lib/accident-report'

/** 압축이 끝난 사진을 이어 붙이되 한도를 넘는 분량은 버린다. */
export function appendPhotos(
  current: AccidentReportPhoto[],
  added: AccidentReportPhoto[],
): AccidentReportPhoto[] {
  return [...current, ...added].slice(0, ACCIDENT_REPORT_MAX_PHOTOS)
}

/** 지정한 자리의 설명만 바꾼 새 목록을 준다. */
export function updatePhotoCaption(
  current: AccidentReportPhoto[],
  index: number,
  caption: string,
): AccidentReportPhoto[] {
  return current.map((photo, position) => (position === index ? { ...photo, caption } : photo))
}

/** 지정한 자리의 사진을 뺀 새 목록을 준다. */
export function removePhoto(current: AccidentReportPhoto[], index: number): AccidentReportPhoto[] {
  return current.filter((_, position) => position !== index)
}
