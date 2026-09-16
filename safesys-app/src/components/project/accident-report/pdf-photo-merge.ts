// PDF 사진 후보를 기존 사진과 비동기 입력을 보존하며 빈 목록에만 적용한다.
import { ACCIDENT_REPORT_MAX_PHOTOS, type AccidentReportPhoto } from '@/lib/accident-report'

export function mergePdfPhotos(
  current: AccidentReportPhoto[],
  candidates: AccidentReportPhoto[],
  atUploadStart: AccidentReportPhoto[],
): AccidentReportPhoto[] {
  if (current.length > 0 || current !== atUploadStart || candidates.length === 0) return current
  return candidates.slice(0, ACCIDENT_REPORT_MAX_PHOTOS)
}
