# 감독 일괄서명 — 컨텍스트 노트

계획서: `plans/20260702_감독일괄서명.md`

## 2026-07-02

- 사용자 요청: 발주청 캐비넷에서 감독이 미서명 건을 전체/부분 선택해 일괄 서명. "supabase를 통해서 감독이 서명해야 하는 스키마를 찾아봐" 지시에 따라 information_schema로 서명 컬럼 전수 조사 후 코드 라벨로 서명 주체 판별.
- **서명 저장 형식**: SignaturePad(`src/components/ui/SignaturePad.tsx`)의 `canvas.toDataURL('image/png')` base64, 건당 약 20KB. 목록 조회 시 서명 컬럼을 select하면 안 됨(수 MB) — id·표시용 필드만 조회.
- **manager_inspections.has_signature는 GENERATED 컬럼** (signature 존재 여부 자동 계산) — update에 넣으면 오류. 미서명 필터로만 사용.
- **service-role API가 필수인 이유**: inspection_requests·quality_* 테이블의 UPDATE RLS가 `created_by = auth.uid()`(작성자 본인)라 감독 계정으로는 직접 update 불가. manager-inspections/bulk-sign 선례와 동일하게 admin 클라이언트 사용하되, 그 선례에 없던 Bearer 인증 + 발주청 role 확인을 merge 라우트 패턴으로 추가.
- **기존 서명 보호**: update WHERE에 미서명 조건을 포함해, 클라이언트가 잘못된 id를 보내도 이미 서명된 문서를 덮어쓰지 않게 함.
- **remarks 미변경**: 기존 manager-inspections/bulk-sign은 remarks='일괄서명완료'로 덮어쓰지만, 본 라우트는 사용자 입력 필드를 건드리지 않기로 함(외과적 변경 원칙).
- **PTW·정기안전점검 제외 판단**: PTW 서명은 허가(permitter)/이행확인(confirmer) 행위 자체라 밀린 서명 일괄 처리에 부적합. 정기안전점검 signatures는 이름·직급 지정 배열이라 개별 문서에서 서명하는 게 맞다고 판단. 모달 하단에 안내 문구로 명시.

## 2026-07-02 (확장: 현장소장 일괄서명 + 펜통 버튼)

- 사용자 요청으로 **현장소장(시공사) 일괄서명** 추가 + 진입 버튼을 **만년필 펜통 모양**으로 캐비넷 좌측 배치. 이어서 "기존 감독 서명도 펜통 버튼으로" 지시 → 발주청 캐비넷의 감독 일괄서명 서류철을 제거하고 펜통 버튼 2개(감독=보라, 현장소장=파랑)로 통일.
- **API 일반화**: `/api/supervisor-bulk-sign` → `/api/bulk-sign` (body에 `signer: 'supervisor'|'site_manager'`). 서명 주체별 대상 테이블·컬럼·허용 역할을 서버 화이트리스트로 고정.
- **현장소장 대상 5종**: 검측요청서 field_agent_signature(현장대리인), 신규근로자 둘러보기 manager_signature(확인자), 품질검사 실시대장 quality_engineer_signature(품질관리기술인), 확인시험 의뢰서 sender_signature(보냄=시공자), 성과총괄표 writer_signature(작성자=건설업자). 품질관리기술인은 현장소장과 다른 사람일 수 있으나 부분선택이 가능하므로 라벨을 명확히 하고 포함.
- **허용 역할**: supervisor=발주청, site_manager=시공사+발주청(발주청은 시스템 관리 주체라 허용). 감독 펜통 버튼은 발주청 사용자에게만 노출, 현장소장 펜통은 전체 노출(권한은 API에서 차단).
- **펜통 버튼**: `PenHolderButton.tsx` — CSS로 그린 금촉 만년필 + 컵 + 명판, 호버 시 펜이 살짝 뽑히는 효과. 캐비넷 행(flex items-end) 맨 앞에 배치.
- **배치 조정(사용자 지시)**: 감독 펜통은 발주청 캐비넷 서랍 안(공사감독 일지 옆, size="sm" self-end)으로 이동. 펜통 기본 크기도 한 단계 축소(w-14~lg:w-20). 기존 md 사이즈의 `sm:w-18`은 Tailwind에 없는 무효 클래스였음 — 수정하며 제거.
- **현장소장 → 시공사 개명(사용자 지시)**: signer 키 site_manager → `contractor`, 라벨 "시공사 일괄서명". 시공사 측 기타 확인자 서명도 포함하도록 성과총괄표 검토자(reviewer_signature, 품질시험담당자)를 대상에 추가 — 시공사 대상 총 6종.
- **TBM 안전활동 점검표 감독 대상 제외(사용자 지시)**: 이 점검표는 매일 생기는 기록이 아니라 감독이 TBM 입회 점검 시 그때그때 작성·즉시 서명하는 수시 문서라서 일괄서명 대상에서 제외 — 감독 대상 4종으로 축소. 모달 안내 문구에 명시.

## 2026-07-02 (확장 2차: 레지스트리 통합·지급자재·JSONB·뱃지)

- **단일 레지스트리 도입(사용자 "자동 포함" 요청)**: 대상 정의를 `src/lib/bulk-sign/bulk-sign-targets.ts` 하나로 모아 API·모달·건수집계가 공유. 새 서류는 이 파일에 항목 추가만 하면 됨. CLAUDE.md "일괄서명 대상 등록 규칙 (필수)" 신설.
- **지급자재 수불부 추가(사용자 발견)**: 서명 컬럼명이 `supervisor_confirm`이라 `%signature%` 전수조사에서 누락됐던 것. `material_ledger_entries`는 project_id가 없어 `projectScope`(materials 조인)와 `hasUpdatedAt: false` 옵션을 레지스트리에 신설해 지원.
- **제외 4종 재포함(사용자 지시 번복)**: "등록됐는데 서명 안 됐으면 여기서도" — TBM 점검표(재포함), 폭염점검(확인자, 시공사 그룹), 정기안전점검(roleArray: 공사감독원/현장대리인 역할별), PTW(keyedObject: permitter·confirmer=감독, writer·applicant=시공사). 이제 제외는 점검자·감시인·작업자 등 개인 지정 서명뿐.
- **JSONB 처리 방식**: keyedObject는 PostgREST JSON 경로 필터(`signatures->key->>signature`)로 서버 필터·head count 가능(실 DB 검증: PTW 허가자 미서명 4건). roleArray는 배열 내부 조건이라 서버 필터 불가 — 행을 받아 클라이언트 판정(프로젝트 단위 소량). API 적용은 둘 다 행별 read-modify-write이며 `applyJsonbSignature`가 미서명 항목에만 채워 덮어쓰기 방지.
- **폭염점검 서명 형식 주의**: 기존 개별 제출은 Storage URL을 저장하지만 일괄서명은 base64 data URL을 저장 — 표시는 `<img src>`라 둘 다 동작.
- **펜통 빨간 뱃지(사용자 요청)**: `bulk-sign-counts.ts`의 head count 집계로 미서명 총건수를 펜통 우측 상단에 표시, 모달 닫을 때 재조회.
- **관리자 점검**: 처음부터 포함되어 있음(has_signature=false 필터) — 사용자 확인 요청에 재확인.
