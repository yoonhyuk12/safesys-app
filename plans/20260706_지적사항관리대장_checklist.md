# 지적사항 관리대장 체크리스트

## 1. DB 마이그레이션
- [x] `corrective_action_issues` 테이블 SQL 작성 (project_id CASCADE, RLS, updated_at 트리거 여부 확인)
- [x] `merge_projects` 함수 UPDATE 목록 + 개수 가드 20→21 갱신 SQL 포함
- [ ] 사용자에게 SQL Editor 실행 요청 → 실행 확인

## 2. 관리대장 페이지 (issue-management/page.tsx)
- [x] 통합 지적 로딩: headquarters_inspections (issue1/2) 집계
- [x] 통합 지적 로딩: safety_inspection_results 실지적 필터 집계
- [x] 통합 지적 로딩: additional_items (해빙기/우기/특별) 지적 집계
- [x] 직접 등록건 로딩 (corrective_action_issues)
- [x] 통합 테이블 렌더 (출처·점검일·점검자·부위·지적사항·사진·조치·상태)
- [x] 조치사진 업로드 write-back: 본부 (action_photo_issueN + issueN_status)
- [x] 조치사진 업로드 write-back: 정기 결과 (after_photo_url)
- [x] 조치사진 업로드 write-back: additional_items JSONB
- [x] 조치사진 업로드/조치내용/조치완료일: 직접 등록건
- [x] 해당없음 토글·조치사진 삭제 (출처별)
- [x] 조치내용 인라인 편집 (정기 action_items / 직접 action_content)
- [x] 직접 등록 모달 (별지 6호 필드 + 지적사진 업로드)
- [x] 직접 등록건 수정·삭제 (발주청·감리단, 삭제는 작성자)
- [x] 미조치만 보기 필터
- [x] 권한 게이트 (직접 등록 = 발주청·감리단)

## 3. 별지 7호 엑셀 출력
- [x] `issue-action-report-export.ts` — A4 1건 1시트 서식 재현
- [x] 사진 임베드 (시정 전/후)
- [x] 수급인·점검자·조치완료일 소스별 매핑
- [x] 서명 겹침 렌더 (직접=컬럼, 정기=signatures JSONB, 본부=공란)

## 4. 연동
- [x] 프로젝트 상세 카드 A→C 이동, 제목 "지적사항 관리대장", isPending 제거
- [x] bulk-sign-targets.ts contractor/supervisor 등록
- [x] 프로젝트 삭제 라우트에 before/after_photo_url 수집 추가
- [x] CLAUDE.md 자식 테이블 개수(20→21) 문구 갱신

## 5. 검증
- [x] `npx tsc --noEmit` 타입체크 (새 파일 오류 0 — 기존 파일의 사전 존재 오류만 잔존)
- [x] ESLint (변경 파일 — no-explicit-any만 지적, 코드베이스 관례와 동일)
- [ ] 시맨틱 커밋 (마이그레이션/페이지/출력/카드 등 논리 단위)
- [ ] 마이그레이션 적용 후 실동작 확인 (직접 등록·조치 write-back·별지 7호 다운로드)
