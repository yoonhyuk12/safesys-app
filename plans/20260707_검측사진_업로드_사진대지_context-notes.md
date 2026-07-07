# 검측 사진 업로드 + 사진대지 컨텍스트 노트

## 결정 사항

- **photos JSONB 단일 컬럼** (`[{ url, caption }]`) — photo_url_1/2 개별 컬럼 대신. checklist_items가 이미 JSONB 패턴을 쓰고 있고, 설명(캡션)까지 한 구조로 담긴다.
- **`safety-inspection-photos` 버킷 재사용 (계획 변경)** — 처음엔 `inspection-photos` 버킷을 검토했으나, 그 버킷의 DELETE 정책이 "첫 폴더 = 본인 uid"라서 `inspection-request/{projectId}/` 경로의 클라이언트 삭제가 조용히 실패한다. `safety-inspection-photos`는 인증 사용자 삭제가 허용되고, 프로젝트 삭제 라우트가 `{projectId}/` 폴더를 통째로 list·삭제하므로 평면 경로(`{projectId}/{ts}_inspection_request_{rand}.{ext}`)로 저장하면 별도 URL 수집도 필요 없다. issue-management도 이미 이 버킷을 교차 사용 중.
- **저장 시 사진 필수 검증 없음** — "최소 1컷"은 안내 문구로만 표기. 사진 없는 기존 레코드 수정이 막히면 안 되고, 체크리스트도 선택사항인 것과 일관성 유지.
- **사진대지 출력 2경로** — (1) 대장 헤더 "사진대지" 버튼: 사진 있는 전체 건을 한 파일로(건당 1페이지, 작성순), (2) 건별 엑셀(요청서+체크리스트)에 사진 있으면 시트3 추가. 같은 시트 빌더(addPhotoSheet) 공유.
- **자율 양식 레이아웃** — 별지 서식이 없으므로 제목 + 헤더표(공종/위치/부위/일자/번호) + 세로 2칸 사진 영역(칸별 설명 행). 품질시험 사진대지(PDF)와 유사한 구성.
- **삭제 시 Storage 정리** — 검측건 삭제 시 photos URL의 파일 제거(safety-inspection-ledger 선례). 프로젝트 삭제 라우트 URL 수집은 추가하지 않음 — safety-inspection-photos/{projectId}/ 폴더 일괄 정리(라우트 4번 단계)가 이미 커버해서 중복. 라우트에 설명 주석만 추가.
- **merge_projects 갱신 불필요** — 새 테이블이 아닌 기존 자식 테이블 컬럼 추가라서 UPDATE 목록·개수 가드에 영향 없음.
- **일괄서명 레지스트리 무관** — 서명 컬럼 추가가 아니므로 bulk-sign-targets.ts 변경 없음.

- **크롭/회전 (후속 요청)** — 공용 `ui/ImageEditor.tsx`(90° 회전 + 드래그 크롭, Blob 반환) 재사용. safety-inspection-ledger의 통합 패턴을 따라 새 파일 업로드 → 기존 파일 삭제 → URL 교체(설명 유지) 순서로 처리. 편집 결과는 jpg 0.95 품질로 저장.

## 진행 기록

- (작성 시점) 계획 수립 완료, 구현 시작.
- 구현 완료. tsc·lint·개발 서버 컴파일 검증 통과.
- **마이그레이션 미적용 상태** — Supabase MCP가 읽기 전용이라 `apply_migration`이 거부됨. `database/20260707-2305_add_inspection_request_photos.sql`을 웹 콘솔 SQL Editor에서 실행해야 한다. **적용 전에는 이 페이지의 저장이 photos 컬럼 부재로 실패하므로, 마이그레이션 적용 전에 main에 푸시(=운영 배포)하면 안 된다.**
- 로컬 3000·3001·3002 포트의 기존 Next 서버들이 모든 경로에 플레인 500을 반환하는 좀비 상태였음(이번 변경과 무관). 검증은 3105 포트에 새 서버를 띄워 수행 후 종료.
