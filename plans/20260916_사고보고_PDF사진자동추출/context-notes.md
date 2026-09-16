<!-- PDF 사진 추출 설계 결정과 조사 근거 -->
# 컨텍스트

- `gh search code 'paintImageXObject repo:mozilla/pdf.js'`와 [Mozilla webpack 예제](https://github.com/mozilla/pdf.js/blob/master/examples/webpack/main.mjs), [API 문서](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)를 확인했다.
- npm 최신 6.x는 Node 22 이상을 요구하므로 Node 20.19도 지원하는 5.6.205를 exact pin한다. 설치된 해당 버전 타입과 구현에서 안전 옵션을 재확인한다.
- AI 정규화의 사진 차단은 유지하고 import 모듈의 `AccidentDocumentPrefillResult.photos`만 로컬 추출 경로로 채운다.
- 사진이 이미 있거나 업로드 시작 이후 목록 참조가 변경되었으면 자동 후보를 병합하지 않는다. 사진을 삭제한 사용자 의도도 보존한다.
- 실문서 원본, HWPX 출력 코드와 산재요양 필드 worker 소유 파일은 수정하지 않는다. 사용안내.md 편집 경계는 부모에게 메시지로 요청했다.
- 부모가 별도 `result.photos` 계약과 사용안내 PDF 부분 편집을 승인했다. 저장오류 담당 완료 후 `project-accident-report.test.mjs`의 PDF helper loader 경계만 수정하도록 소유권을 전달받았다.
- 합성 PDF는 jsPDF와 dev dependency `@napi-rs/canvas` 0.1.100 exact pin으로 메모리에서 생성한다. 실제 개인정보·사진은 테스트 산출물에 넣지 않는다.
- PDF.js 5.6.205 타입에서 `isEvalSupported:false`, `enableXfa:false`, `useWasm:false`, `useWorkerFetch:false`, `maxImageSize`와 `canvasMaxAreaInBytes`를 확인했다. worker URL은 Webpack이 same-origin 자산으로 처리하는 정적 `new URL(..., import.meta.url)`이다.
- 사진 변환 실패/손상/암호/timeout 안내와 `loadingTask.destroy()`를 회귀로 확인한다. AI 본문 요청이 실패하면 기존처럼 전체 업로드 오류로 끝나며 사진만 별도 적용하지 않는다.
- 부모가 준비한 `scratch/accident-photo-{none,two,three,scan}.pdf`는 브라우저 검증용이고, 본 작업의 테스트는 별도 메모리 합성 PDF를 사용한다.
- 실제 Next15 개발 브라우저에서 직접 `import('pdfjs-dist')`가 `Object.defineProperty called on non-object`로 실패함을 부모가 CDP로 확인했다. [Webpack URL assets](https://webpack.js.org/guides/asset-modules/#url-assets)와 [webpackIgnore](https://webpack.js.org/api/module-methods/#webpackignore) 공식 문서에 따라 PDF.js main도 `new URL('pdfjs-dist/build/pdf.min.mjs', import.meta.url)` 자산으로 내보내고 브라우저 native import로 읽는다. worker도 같은 패키지의 same-origin 자산을 사용하며 동기화 스크립트/복사 파일은 없다.
- 부모가 17:50 KST 실제 Next 브라우저 합성 PDF 시나리오 및 HWPX 2컷 반영 통과를 전달했다. 원본 PDF·실제 한글 COM 최종 검증 중 소스를 고정하라는 요청에 따라 추가 코드 변경 없이 인계한다.
