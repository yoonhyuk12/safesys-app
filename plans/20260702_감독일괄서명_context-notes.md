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
