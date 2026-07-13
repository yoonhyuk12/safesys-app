// 법적이행 확인(안전활동 점검표) 공용 유틸 — 미이행(부) 항목 카운트와 form_data 타입 재노출
// View·엑셀 내보내기 양쪽에서 재사용한다. 타입/하이드레이트는 점검표 페이지 상수를 단일 출처로 참조.

import {
  hydrateFormData,
  type LegalComplianceFormData,
  type LegalComplianceRecord,
  type YN,
} from '@/app/project/[id]/legal-compliance/lib/constants'

export type { LegalComplianceFormData, LegalComplianceRecord, YN }
export { hydrateFormData }

// 위험공종 작업허가제 대상공종 순서 — 엑셀 AN~AV 열 매핑 기준(①~⑨)
export const RISK_WORK_ORDER = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'] as const

const isNo = (v: YN | string | undefined): boolean => v === '부'
// 그룹 해당여부가 '부'면 종속 필드는 카운트 제외
const isOff = (v: YN | string | undefined): boolean => v === '부'

// 미이행(부) 항목 수 — 그룹 해당여부='부'면 종속 필드 제외, 나머지 필드는 값이 '부'일 때 1건씩 누계.
// 규칙 출처: plans/20260714_법적이행확인_현황_엑셀.md
export function countNonCompliance(raw: Partial<LegalComplianceFormData> | null | undefined): number {
  const fd = hydrateFormData(raw)
  let n = 0

  const ob = fd.ownerBasic
  if (!isOff(ob.basicLedger.applicable)) {
    if (isNo(ob.basicLedger.implemented)) n++
    if (isNo(ob.basicLedger.adequacy)) n++
  }
  // 설계대장 제공(공문)은 기본대장 해당='부'면 제외
  if (!isOff(ob.basicLedger.applicable) && isNo(ob.designLedger.provided)) n++
  if (!isOff(ob.designLedger.applicable)) {
    if (isNo(ob.designLedger.implemented)) n++
    if (isNo(ob.designLedger.adequacy)) n++
  }
  // 공사대장 제공(공문)은 설계대장 해당='부'면 제외
  if (!isOff(ob.designLedger.applicable) && isNo(ob.constructionLedger.provided)) n++
  if (!isOff(ob.constructionLedger.applicable)) {
    if (isNo(ob.constructionLedger.implemented)) n++
    if (isNo(ob.constructionLedger.adequacy)) n++
  }
  if (!isOff(ob.designSafetyReview.applicable) && isNo(ob.designSafetyReview.implemented)) n++
  if (!isOff(ob.safetyMgmtPlan.applicable) && isNo(ob.safetyMgmtPlan.implemented)) n++
  if (!isOff(ob.coordinator.applicable)) {
    if (isNo(ob.coordinator.designated)) n++
    if (isNo(ob.coordinator.notified)) n++
  }

  const od = fd.ownerDetail
  if (isNo(od.dailySelfCheck)) n++
  if (!isOff(od.riskWorkPermit.applicable) && isNo(od.riskWorkPermit.planConfirmed)) n++
  if (isNo(od.workDirector)) n++
  if (!isOff(od.coordinatorActivity.multiDiscipline)) {
    if (isNo(od.coordinatorActivity.meeting)) n++
    if (isNo(od.coordinatorActivity.jointInspection)) n++
  }
  if (isNo(od.ledgerImplCheck)) n++
  if (isNo(od.safetyCostCheck)) n++
  if (isNo(od.industrialCostCheck)) n++
  if (isNo(od.educationCheck)) n++
  if (!isOff(od.implMeeting.applicable) && isNo(od.implMeeting.implemented)) n++
  const ra = od.riskAssessment
  if (isNo(ra.conducted)) n++
  if (isNo(ra.participants)) n++
  if (isNo(ra.nearMiss)) n++
  if (isNo(ra.reduction)) n++
  if (isNo(ra.sharing)) n++

  if (fd.isContractedWork === '여') {
    for (const v of Object.values(fd.contractChecks)) {
      if (isNo(v)) n++
    }
  }

  return n
}
