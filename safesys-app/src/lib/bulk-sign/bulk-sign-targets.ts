// 일괄서명(펜통 버튼) 대상 서류 레지스트리 — API 라우트와 모달이 함께 쓰는 단일 출처
//
// ★ 새 서류 테이블에 감독(공사감독원) 또는 시공사(소장·확인자·담당자) 서명 컬럼을 만들면
//   여기에 대상 항목을 추가한다 (CLAUDE.md "일괄서명 대상 등록 규칙" 참조).
//   점검자·감시인·작업자 등 개인 지정 서명(이름이 특정된 개인의 서명)은 등록하지 않는다.

export type BulkSignSigner = 'supervisor' | 'contractor'

// JSONB 서명 구조 지원
// - roleArray: [{role, name, position, dataUrl}] 배열에서 role이 일치하고 dataUrl이 빈 항목에 서명 (예: safety_inspections)
// - keyedObject: { key: {name, signature} } 객체에서 해당 key의 field가 빈 경우 서명 (예: ptw_permits)
export type BulkSignJsonbSpec =
  | { kind: 'roleArray'; role: string }
  | { kind: 'keyedObject'; key: string; field: string }

export interface BulkSignTarget {
  type: string // API items 키 (서명 주체 내에서 고유)
  title: string // 모달 그룹 제목
  table: string
  signColumn: string // 서명 컬럼 (TEXT base64 또는 jsonb 지정 시 JSONB 컬럼)
  jsonb?: BulkSignJsonbSpec // JSONB 서명 구조면 지정
  unsignedBoolColumn?: string // 미서명 판정 boolean 컬럼(예: has_signature). 없으면 signColumn null/'' 판정
  selectColumns: string // 미서명 목록 조회 컬럼 (id 필수. roleArray는 signColumn 포함 필요, TEXT 서명 컬럼은 용량 때문에 금지)
  orderColumn: string // 목록 정렬 기준(내림차순)
  toItem: (row: Record<string, unknown>) => { date: string; label: string } // 표시용 변환
  // 테이블에 project_id가 없고 부모 테이블을 경유해 프로젝트에 속하는 경우 지정 (예: material_ledger_entries → materials)
  projectScope?: { joinTable: string }
  // updated_at 컬럼이 없는 테이블은 false (기본 true)
  hasUpdatedAt?: boolean
}

export interface BulkSignSignerConfig {
  title: string // 모달 제목 (펜통 라벨과 동일)
  note: string // 모달 하단 안내 문구
  allowedRoles: string[] // API 허용 역할
  targets: BulkSignTarget[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// JSONB 서명 값이 "해당 주체 미서명" 상태인지 판정
export function isJsonbUnsigned(value: unknown, spec: BulkSignJsonbSpec): boolean {
  if (spec.kind === 'roleArray') {
    if (!Array.isArray(value)) return false // 서명 구조가 없으면 대상 판단 불가 — 제외
    return value.some((e) => e && typeof e === 'object' && (e as { role?: string }).role === spec.role && !(e as { dataUrl?: string }).dataUrl)
  }
  const obj = value as Record<string, Record<string, unknown> | undefined> | null | undefined
  const entry = obj?.[spec.key]
  if (!entry || typeof entry !== 'object') return false // 해당 역할 슬롯이 없는 서식(허가서 종류별 상이) — 제외
  return !entry[spec.field]
}

// JSONB 서명 값에 서명을 채워 새 값을 반환. 채울 곳이 없으면 null (이미 서명됨/구조 없음 → 덮어쓰기 방지)
export function applyJsonbSignature(value: unknown, spec: BulkSignJsonbSpec, signatureData: string): unknown | null {
  if (!isJsonbUnsigned(value, spec)) return null
  if (spec.kind === 'roleArray') {
    return (value as Array<Record<string, unknown>>).map((e) =>
      e && e.role === spec.role && !e.dataUrl ? { ...e, dataUrl: signatureData } : e
    )
  }
  const obj = value as Record<string, Record<string, unknown>>
  return { ...obj, [spec.key]: { ...obj[spec.key], [spec.field]: signatureData } }
}

export const BULK_SIGN_SIGNERS: Record<BulkSignSigner, BulkSignSignerConfig> = {
  // 감독(공사감독원)
  supervisor: {
    title: '감독 일괄서명',
    note: '※ 이미 서명된 문서는 목록에 나오지 않으며 덮어쓰지 않습니다. 점검자·감시인 등 개인 지정 서명은 각 문서에서 개별 서명해주세요.',
    allowedRoles: ['발주청'],
    targets: [
      {
        type: 'manager_inspection',
        title: '관리자 일상점검',
        table: 'manager_inspections',
        signColumn: 'signature',
        unsignedBoolColumn: 'has_signature',
        selectColumns: 'id, inspection_date, inspector_name',
        orderColumn: 'inspection_date',
        toItem: (r) => ({ date: str(r.inspection_date), label: r.inspector_name ? `점검자 ${str(r.inspector_name)}` : '' }),
      },
      {
        type: 'tbm_safety_inspection',
        title: 'TBM 안전활동 점검표',
        table: 'tbm_safety_inspections',
        signColumn: 'signature',
        selectColumns: 'id, tbm_date, work_content',
        orderColumn: 'tbm_date',
        toItem: (r) => ({ date: str(r.tbm_date), label: str(r.work_content) }),
      },
      {
        type: 'safety_inspection_supervisor',
        title: '정기안전점검 (공사감독원 서명)',
        table: 'safety_inspections',
        signColumn: 'signatures',
        jsonb: { kind: 'roleArray', role: '공사감독원' },
        selectColumns: 'id, inspection_type, inspection_date, signatures',
        orderColumn: 'inspection_date',
        toItem: (r) => ({ date: str(r.inspection_date), label: str(r.inspection_type) ? `${str(r.inspection_type)} 점검` : '' }),
      },
      {
        type: 'ptw_permitter',
        title: 'PTW 작업허가서 (허가자 서명)',
        table: 'ptw_permits',
        signColumn: 'signatures',
        jsonb: { kind: 'keyedObject', key: 'permitter', field: 'signature' },
        selectColumns: 'id, permit_date, work_content',
        orderColumn: 'permit_date',
        toItem: (r) => ({ date: str(r.permit_date), label: str(r.work_content) }),
      },
      {
        type: 'ptw_confirmer',
        title: 'PTW 작업허가서 (이행확인 서명)',
        table: 'ptw_permits',
        signColumn: 'signatures',
        jsonb: { kind: 'keyedObject', key: 'confirmer', field: 'signature' },
        selectColumns: 'id, permit_date, work_content',
        orderColumn: 'permit_date',
        toItem: (r) => ({ date: str(r.permit_date), label: str(r.work_content) }),
      },
      {
        type: 'inspection_request',
        title: '검사/검측 요청서 (공사감독원 서명)',
        table: 'inspection_requests',
        signColumn: 'supervisor_signature',
        selectColumns: 'id, request_no, request_date, location_and_type',
        orderColumn: 'request_date',
        toItem: (r) => ({ date: str(r.request_date), label: [str(r.request_no), str(r.location_and_type)].filter(Boolean).join(' · ') }),
      },
      {
        type: 'quality_test_record',
        title: '품질검사 실시대장 (건설사업관리기술인 서명)',
        table: 'quality_test_records',
        signColumn: 'supervision_engineer_signature',
        selectColumns: 'id, test_date, test_item, target_material',
        orderColumn: 'test_date',
        toItem: (r) => ({ date: str(r.test_date), label: [str(r.target_material), str(r.test_item)].filter(Boolean).join(' · ') }),
      },
      {
        type: 'quality_summary_report',
        title: '품질검사 성과총괄표 (확인자 서명)',
        table: 'quality_summary_reports',
        signColumn: 'confirmer_signature',
        selectColumns: 'id, report_date',
        orderColumn: 'report_date',
        toItem: (r) => ({ date: str(r.report_date), label: '성과총괄표' }),
      },
      {
        type: 'material_ledger_entry',
        title: '지급자재 수불부 (감독 확인 서명)',
        table: 'material_ledger_entries',
        signColumn: 'supervisor_confirm',
        selectColumns: 'id, receive_date, release_date, name_or_spec, receive_qty, materials!inner(project_id, name, unit)',
        orderColumn: 'receive_date',
        projectScope: { joinTable: 'materials' },
        hasUpdatedAt: false,
        toItem: (r) => {
          const mat = (r.materials ?? {}) as { name?: string; unit?: string }
          const qty = r.receive_qty != null ? `수령 ${String(r.receive_qty)}${str(mat.unit)}` : ''
          return {
            date: str(r.receive_date) || str(r.release_date),
            label: [str(mat.name), str(r.name_or_spec), qty].filter(Boolean).join(' · '),
          }
        },
      },
    ],
  },
  // 시공사(현장소장·품질관리기술인 등 기타 확인자 포함)
  contractor: {
    title: '시공사 일괄서명',
    note: '※ 이미 서명된 문서는 목록에 나오지 않으며 덮어쓰지 않습니다. 점검자·감시인·작업자 등 개인 지정 서명은 각 문서에서 개별 서명해주세요.',
    allowedRoles: ['시공사', '발주청'],
    targets: [
      {
        type: 'inspection_request_field_agent',
        title: '검사/검측 요청서 (현장대리인 서명)',
        table: 'inspection_requests',
        signColumn: 'field_agent_signature',
        selectColumns: 'id, request_no, request_date, location_and_type',
        orderColumn: 'request_date',
        toItem: (r) => ({ date: str(r.request_date), label: [str(r.request_no), str(r.location_and_type)].filter(Boolean).join(' · ') }),
      },
      {
        type: 'heat_wave_check',
        title: '폭염점검 (확인자 서명)',
        table: 'heat_wave_checks',
        signColumn: 'signature',
        selectColumns: 'id, check_time, inspector_name',
        orderColumn: 'check_time',
        hasUpdatedAt: false,
        toItem: (r) => ({
          date: str(r.check_time).slice(0, 16).replace('T', ' '),
          label: r.inspector_name ? `점검자 ${str(r.inspector_name)}` : '',
        }),
      },
      {
        type: 'safety_inspection_field_agent',
        title: '정기안전점검 (현장대리인 서명)',
        table: 'safety_inspections',
        signColumn: 'signatures',
        jsonb: { kind: 'roleArray', role: '현장대리인' },
        selectColumns: 'id, inspection_type, inspection_date, signatures',
        orderColumn: 'inspection_date',
        toItem: (r) => ({ date: str(r.inspection_date), label: str(r.inspection_type) ? `${str(r.inspection_type)} 점검` : '' }),
      },
      {
        type: 'ptw_writer',
        title: 'PTW 작업허가서 (작성자 서명)',
        table: 'ptw_permits',
        signColumn: 'signatures',
        jsonb: { kind: 'keyedObject', key: 'writer', field: 'signature' },
        selectColumns: 'id, permit_date, work_content',
        orderColumn: 'permit_date',
        toItem: (r) => ({ date: str(r.permit_date), label: str(r.work_content) }),
      },
      {
        type: 'ptw_applicant',
        title: 'PTW 작업허가서 (신청인 서명)',
        table: 'ptw_permits',
        signColumn: 'signatures',
        jsonb: { kind: 'keyedObject', key: 'applicant', field: 'signature' },
        selectColumns: 'id, permit_date, work_content',
        orderColumn: 'permit_date',
        toItem: (r) => ({ date: str(r.permit_date), label: str(r.work_content) }),
      },
      {
        type: 'new_worker_orientation',
        title: '신규근로자 둘러보기 일지 (확인자 서명)',
        table: 'new_worker_orientations',
        signColumn: 'manager_signature',
        selectColumns: 'id, orientation_date, workers',
        orderColumn: 'orientation_date',
        toItem: (r) => ({
          date: str(r.orientation_date),
          label: Array.isArray(r.workers) && r.workers.length > 0 ? `신규근로자 ${r.workers.length}명` : '',
        }),
      },
      {
        type: 'quality_test_record_engineer',
        title: '품질검사 실시대장 (품질관리기술인 서명)',
        table: 'quality_test_records',
        signColumn: 'quality_engineer_signature',
        selectColumns: 'id, test_date, test_item, target_material',
        orderColumn: 'test_date',
        toItem: (r) => ({ date: str(r.test_date), label: [str(r.target_material), str(r.test_item)].filter(Boolean).join(' · ') }),
      },
      {
        type: 'quality_verification_request',
        title: '확인시험 의뢰서 (보냄 서명)',
        table: 'quality_verification_requests',
        signColumn: 'sender_signature',
        selectColumns: 'id, request_no, request_date, test_items',
        orderColumn: 'request_date',
        toItem: (r) => ({ date: str(r.request_date), label: [str(r.request_no), str(r.test_items)].filter(Boolean).join(' · ') }),
      },
      {
        type: 'quality_summary_report_writer',
        title: '품질검사 성과총괄표 (작성자 서명)',
        table: 'quality_summary_reports',
        signColumn: 'writer_signature',
        selectColumns: 'id, report_date',
        orderColumn: 'report_date',
        toItem: (r) => ({ date: str(r.report_date), label: '성과총괄표' }),
      },
      {
        type: 'quality_summary_report_reviewer',
        title: '품질검사 성과총괄표 (검토자 서명)',
        table: 'quality_summary_reports',
        signColumn: 'reviewer_signature',
        selectColumns: 'id, report_date',
        orderColumn: 'report_date',
        toItem: (r) => ({ date: str(r.report_date), label: '성과총괄표' }),
      },
    ],
  },
}
