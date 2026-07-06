# 지적사항 관리대장 컨텍스트 노트

## 2026-07-06 설계 결정

- **카드 이동 (A→C)**: 기존 A(조치) 그룹에 "(자동) 지적사항 관리대장" 준비중 카드가 이미 있었음. 사용자 피드백이 C(점검) 그룹 테두리를 지목했으므로 카드를 C로 이동하고 기존 `/issue-management` 라우트를 재사용. 중복 카드를 만들지 않음.
- **자동 집계는 read-time**: 본부·정기점검 지적을 별도 테이블에 복제하지 않고 조회 시 집계. 조치 등록은 원본 테이블 컬럼에 write-back → 원본 화면과 관리대장 간 동기화가 저절로 보장됨 (단일 출처 원칙).
  - 본부: `action_photo_issueN` + `issueN_status`. '해당 사항 없음' 문자열 = 해당없음 처리 (본부점검 페이지 관례).
  - 정기 결과: `safety_inspection_results.after_photo_url` ('N/A' = 해당없음, null = 미조치).
  - 해빙기/우기/특별 추가항목: `safety_inspections.additional_items` JSONB 배열 통째 갱신 (`updateSpecialItem` 패턴).
- **실지적 판별**: projects.ts의 기존 로직 재사용 — photo_url 있거나 findings가 NO_FINDING_KEYWORDS(양호/적정/이상없음 등)가 아니면 지적. additional_items는 action ≠ '해당없음'.
- **정기점검 4종 모두 포함**: 사용자는 "해빙기 우기 대비 점검"만 언급했으나 같은 테이블의 종합·특별도 동일 코드 경로라 포함. 문제 시 필터로 제외 가능.
- **별지 7호 출력 = ExcelJS**: 20260703 단속·점검방문일지에서 "별지 서식 재현은 ExcelJS A4 1건 1시트, html2canvas PDF 미사용" 방침 확립. 사진 임베드는 addImage 선례 10건.
- **조치완료일**: 원본 테이블(본부·정기)에 조치일 컬럼이 없음 (본부 `action_date`는 코드에서 세팅 안 함 — 조사 확인). 직접 등록건은 `action_date` 저장. 소스 유래 건은 처음엔 공란으로 했으나 2026-07-06 사용자 피드백으로 **조치사진 파일명의 Date.now() 타임스탬프에서 업로드 날짜를 파싱**해 사용 (모든 업로드 경로가 타임스탬프 접두 관례라 가능. 사진 편집 재업로드 시 편집일로 바뀌는 한계 인지).
- **점검자 소속/직급**: 별지 7호 양식엔 있으나 원본 데이터에 없음 → 성명만 출력, 소속·직급 공란.
- **수급인**: projects 테이블에 시공사명 컬럼 없음. 정기점검 유래 = `safety_inspections.contractor` 스냅샷, 그 외 = 프로젝트 `created_by`의 `user_profiles.company_name` (SafetyInspectionForm.tsx:275-296 패턴).
- **서명**: 직접 등록건에 `contractor_signature`(현장대리인)/`supervisor_signature`(감독원) base64 컬럼 → bulk-sign 레지스트리 등록 (CLAUDE.md 필수). 정기점검 유래는 `signatures` JSONB(roleArray)의 현장대리인/공사감독원 재사용. 본부 유래는 대응 서명이 없어 공란.
- **Storage**: 직접 등록건 사진은 `inspection-photos` 버킷 `issue-direct` 폴더 (본부점검과 동일 버킷). URL 컬럼이므로 프로젝트 삭제 라우트의 URL 수집에 테이블 추가 필요. 서명은 base64 TEXT라 수집 불필요.
- **권한**: 조치 등록은 전 역할 허용 (본부점검 페이지에서 조치사진 업로드에 role 게이트 없음 — 조사 확인). 직접 지적 등록은 발주청·감리단 (시정조치요구서 발행 주체는 점검부서).

## 조사 결과 요약 (구현 시 참조)

- 본부점검 업로드 유틸은 페이지 로컬 `uploadFileToStorage(file, folder)` (버킷 inspection-photos, `${folder}/${Date.now()}-rand.ext`), `resizeImageToJpeg(file, 1920, 1440, 0.95)` 후 업로드. 공용 lib 유틸 없음 (3개 파일에 중복 정의된 상태).
- 정기점검 조치후 사진 핸들러는 safety-inspection-ledger/page.tsx에 위치 (Detail 컴포넌트는 조회 전용): `handleAfterPhotoUpload`(186-211), `toggleNotApplicable`(213-227), `removeAfterPhoto`(246-271), 특별점검용 `updateSpecialItem`(274-283). 버킷 safety-inspection-photos — **정기점검 유래 조치사진은 이 버킷에 올려야 원본 화면과 삭제 로직이 일관됨**.
- inspection_type 값: '해빙기' | '우기' | '종합' | '특별점검(안전혁신건설-287)'. 종합은 additional_items 없음.
- headquarters_inspections 지적사진 = site_photo_issueN, 상태 배지는 getOverallStatus (action_photo 존재 + issueN_status).
