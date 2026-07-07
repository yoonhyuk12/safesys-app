# 검측 사진 업로드 + 사진대지 체크리스트

- [x] DB 마이그레이션 파일 작성 (photos JSONB)
- [ ] 마이그레이션 적용 — **MCP 읽기 전용으로 거부됨. 사용자가 Supabase 웹 콘솔에서 `database/20260707-2305_add_inspection_request_photos.sql` 실행 필요**
- [x] inspection-types.ts — InspectionPhoto 타입·photos 필드·normalizeInspectionPhotos
- [x] InspectionPhotoTab.tsx — 업로드/미리보기/설명/삭제 (최대 2컷)
- [x] InspectionRequestForm.tsx — "검측 사진" 탭 추가, projectId prop
- [x] page.tsx — projectId 전달, photos 정규화, 검측건 삭제 시 Storage 정리
- [x] inspection-photo-report.ts — 사진대지 시트 빌더 + 전체 출력 함수
- [x] page.tsx — 헤더 "사진대지" 버튼 (사진 있는 건이 없으면 비활성)
- [x] inspection-checklist-export.ts — 건별 다운로드에 사진대지 시트3
- [x] delete/route.ts — URL 수집 불필요로 결론 (safety-inspection-photos/{projectId}/ 폴더 정리가 커버, 주석만 추가)
- [x] npx tsc --noEmit 통과 (변경 파일 오류 0건 — 기존 오류만 존재)
- [x] npm run lint 통과 (변경 파일 신규 오류 0건 — page.tsx의 any 4건은 기존 코드)
- [x] 개발 서버 컴파일 검증 (페이지 200 응답)
- [x] 사진 크롭/회전 — 공용 ImageEditor 연동 (후속 요청)
- [ ] 커밋
- [ ] 마이그레이션 적용 후 main 푸시 (푸시 = 운영 배포이므로 마이그레이션 선적용 필수)
