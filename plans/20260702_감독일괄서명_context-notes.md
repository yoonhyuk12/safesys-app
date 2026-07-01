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
