# Worker B HWPX 구현·검증 보고.

- 구현 파일. `safesys-app/src/lib/hwpx/patrol-ledger-hwpx-export.ts`.
- 테스트. `safesys-app/tests/patrol-ledger-hwpx.test.mjs`.
- 스크립트. `safesys-app/package.json`에 `test:patrol-ledger-hwpx` 한 항목 추가. 다른 Worker의 `test:patrol-ledger`는 보존.

## 구현 결과.

템플릿 표 셀 본문을 교체하면서 기존 문단/문자 스타일, 셀 크기·병합·여백, 헤더와 로고 바이트를 유지한다. 점검 항목을 no 순으로 채우고 남는 행은 비우며, 날짜·기본정보·다중 문단 지적사항을 반영한다. 사진은 흰 바탕 JPEG(maxEdge 1200)로 변환하고 원본 비율을 유지하며, 서명 PNG는 원본 바이트 그대로 수록한다. mimetype 첫 항목/STORE, 매니페스트 이미지 등록, 다운로드 파일명 금지문자 치환을 구현했다. 이미지 읽기 실패는 오류로 반환한다.

## 브리프에서 승인받은 변경.

질문 `msg_e0446d2ae658`에 대한 코디네이터 승인에 따라 서명 앵커를 표2 래퍼 대신 표1 래퍼 문단 run으로 옮겼다. 표2 문단에 떠 있는 그림을 넣으면 한글 2022가 별도 줄을 생성해 표 또는 서명을 2쪽으로 넘겼다. 첫 문단 앵커는 PAPER 기준 좌표를 첫 쪽에 유지하며 표2 문단 서식 변경 없이 해결했다.

서명 위치는 PDF에서 문구 중심 (521.67, 742.81)pt와 초기 그림 중심 (520.04, 733.48)pt를 비교해 +163/+934 HWPUNIT로 보정했다. 근거를 구현 코드 주석에 남겼다. 셀 본문에서만 lineseg가 제거되며 원본 래퍼 문단과 변경하지 않은 셀의 lineseg는 유지한다.

## 검증.

- RED. 구현 파일 부재로 최초 테스트 3건 실패 확인.
- GREEN. `npm run test:patrol-ledger-hwpx` 최종 5/5 통과.
- `npx eslint src/lib/hwpx/patrol-ledger-hwpx-export.ts tests/patrol-ledger-hwpx.test.mjs` 통과, 경고 없음.
- `npx tsc --noEmit` 통과.
- `npm run lint` 종료코드 0, 저장소 기존 경고 있음.
- 한글 2022 최종 sample.hwpx 실행 후 12초 생존 `FINAL ALIVE`, 해당 검증에서 생성한 Hwp 프로세스만 종료.
- COM Open/SaveAs PDF 모두 성공. 사진+서명/사진 없음/사진만/서명만 네 표본 PDF가 모두 1쪽.
- PDF를 PyMuPDF로 PNG 렌더 후 네 표본 및 원본 양식을 직접 육안 비교. 표 위치·지적사항 3줄·사진 셀 내부 배치·서명 문구 겹침 확인.
- 원본 셀 그리드/문단 서식/로고 바이트, 동시 생성 동일 XML, PNG 원본 바이트와 JPEG 크기 1200×750을 자동 검증.

## 표본 경로.

`safesys-app/scratch/patrol-ledger/`는 기존 gitignore 적용을 확인했다. 다음 파일을 생성했다.

- `sample.hwpx`, `sample.pdf`, `sample-1.png` — 사진·서명·지적사항 3줄.
- `no-images.hwpx`, `no-images.pdf`, `no-images-1.png` — 이미지 없음·부족한 항목·특수문자.
- `photo-only.hwpx`, `photo-only.pdf`, `photo-only-1.png`.
- `signature-only.hwpx`, `signature-only.pdf`, `signature-only-1.png`.
- `template.pdf`, `template-1.png` — 원본 비교용.

재생성은 `PATROL_LEDGER_HWPX_SAMPLES=1` 환경변수를 설정하고 테스트를 실행한다. PDF는 한글 COM으로 별도 생성해야 한다.

## 범위와 남은 한계.

빌드·커밋·푸시는 실행하지 않았다. 과도하게 긴 점검 문장이나 많은 지적사항이 고정 양식의 행 높이를 늘리는 입력은 페이지 재배치/동적 서명 좌표 대상으로 구현하지 않았으며, 현 표본은 짧은 10개 항목과 지적사항 3줄이다. 원본 양식 자체의 서식(일부 결과의 파란색/기울임, 지구명 빨간색, 성명/서명 회색)은 그대로 보존된다.
