# 조사 기록

- 대상 3개 파일 원본은 `%TEMP%/safesys-special770-photo-task_88fa21c4c463`에 백업했다.
- `buildInlinePicXml`은 TBM 정본과 속성·자식 순서가 같다.
- 결과 템플릿 사진 셀은 `lineWrap=BREAK`, `vertAlign=CENTER`, `textWidth=0`, `textHeight=0`이다. 문단 49는 가운데 정렬·160% 줄 간격이며 고정 줄 높이나 숨김 설정은 없다.
- 기존 테스트는 `fetchImage`를 주입하므로 브라우저 기본 fetch 동작을 검증하지 않는다.
- 브라우저, 한컴 렌더, 린트·타입 검사는 코디네이터 담당이다. 추가 위임 및 커밋은 하지 않는다.

## 확인한 원인과 수정

- 코디네이터가 실제 현장 사진 URL에서 HTTP 400 및 `NoSuchKey`/`Object not found` 응답을 확인했다. 최신 HWPX에는 이미지가 없고 과거 다운로드에는 동일 이미지 바이트가 남아 있었다. 따라서 이번 누락은 XML 렌더 결함이 아닌 원본 파일 소실과 수집 실패 은폐 문제다.
- `Special770PhotoSlot.handleEdited`는 새 사진 업로드 직후 기존 파일을 삭제하고 나서 폼 값을 변경했다. `handleRemove`도 폼 저장 전에 파일을 삭제했다. 이후 폼 취소 또는 저장 실패 시 DB의 기존 URL이 삭제된 파일을 참조한다.
- 편집과 삭제 이벤트는 입력값만 변경하고 기존 저장 파일을 유지하게 수정했다. 미사용 파일 정리는 이번 범위 밖이다. 추가 대상 TSX 2개도 같은 외부 백업 폴더에 복사했다.
- `PictureCollector.collect`는 실제 URL을 읽지 못하면 재첨부·저장 안내 오류를 발생시킨다. URL 미등록 및 `N/A`는 계속 빈칸을 허용한다. 관리대장 다운로드 핸들러는 이 오류 메시지를 보여준다.
- parts 파일과 XML 생성은 수정하지 않았다. 코디네이터가 과거 HWPX에서 원본 이미지를 추출해 복구 및 육안 검증을 별도로 진행한다.

## 검증

- 수정 전 `node --test tests/special-770-result-hwpx.test.mjs` 결과 5개 통과·3개 실패. HTTP 오류 테스트는 `Missing expected rejection`, 편집·삭제 테스트는 원본 URL이 삭제 함수에 전달되어 실패했다.
- 수정 후 `npm run test:special-770` 결과 19개 통과·0개 실패. 총괄표의 기존 실패 URL 테스트가 출력하는 404 경고는 예상 로그다.
- 컴포넌트 테스트는 실제 TSX를 변환하여 편집 완료와 삭제 버튼 이벤트를 실행하고 스토리지 삭제 호출 및 변경된 입력값을 검사한다. fetch 테스트는 주입 fetchImage 대신 실제 기본 수집 경로에 HTTP 400 응답을 전달한다.
- 기존 정상 사진·미등록 사진·스타일 참조·패키지 무결성 테스트도 모두 유지했다. 기존 missing URL fixture는 미등록 사진 fixture로 바꾸어 새 실패 정책과 구분했다.
- 외부 백업과 diff를 직접 비교했다. 린트·타입·실제 한컴 렌더 검증은 코디네이터에게 인계했다.

공식 Storage 삭제 문서도 파일 삭제가 영구적임을 명시한다. https://supabase.com/docs/guides/storage/management/delete-objects

## 코디네이터 최종 검증 및 복구

- 동일 현장·날짜의 기존 다운로드 3개에 동일한 `BinData/image1.jpg`(234,920바이트)가 있고 최신 다운로드에는 그림이 없었다. 이전 보고서에서 추출한 사진을 기존 누락 경로에 덮어쓰기 없이 복원했고 공개 URL HTTP 200과 바이트 수를 확인했다.
- 복구 사진 URL을 실제 기본 fetch 경로로 읽어 `test-files/770-photo-recovery/recovered-photo-validation.hwpx` 표본을 생성했다. 한글 2022 COM에서 Open=True, PDF=True, 프로세스 Responding=True를 확인했다. PDF 3쪽의 이미지 수는 0·0·1이며 모든 페이지를 렌더하여 사진대지에 사진이 표시됨을 직접 확인했다.
- `npm run lint`는 종료 코드 0(기존 경고), `npx tsc --noEmit`는 종료 코드 0, `npm run test:special-770`는 19개 통과·0개 실패다.
- 브라우저 새로고침 이후 별도 기존 라우팅 동작으로 `/tbm`에 이동되어 수정 후 관리대장 버튼 클릭까지의 재검증은 수행하지 못했다. 저장소 복구와 실제 내보내기 함수·한글 렌더를 검증했다.
- 대상 소스·테스트 파일 모두 작업 시작 전부터 미추적 파일로 존재했다. 이번 수정만 커밋하려면 사용자 기존 기능 전체를 함께 포함하게 되므로 기존 작업 보존을 위해 커밋·푸시하지 않았다.
- 독립 읽기 전용 Worker가 작업 전 백업과 소스·테스트 네 파일의 차이를 검토했으며 High/Critical 차단 결함이 없음을 보고했다.

## 변경 경로

- `safesys-app/src/lib/hwpx/special-770-result-hwpx-export.ts`
- `safesys-app/src/components/project/special-770/Special770PhotoSlot.tsx`
- `safesys-app/src/components/project/special-770/Special770LedgerRows.tsx`
- `safesys-app/tests/special-770-result-hwpx.test.mjs`
- `plans/20261004_특별점검770_사진누락.md`
- `plans/20261004_특별점검770_사진누락/checklist.md`
- `plans/20261004_특별점검770_사진누락/context-notes.md`
