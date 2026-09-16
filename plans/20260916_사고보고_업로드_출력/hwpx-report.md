# 사고발생보고 HWPX 구현·검증 보고

2026-09-16 최종 구현 기준. 사용자가 확정한 `safesys-app/public/사고/사고보고_평택지사(20260610).hwpx`에서 만든 정제 양식에 입력값을 치환한다. 이전 유사 양식의 코드 조립과 그 검증 결과는 이 보고서로 대체한다.

외부 계약 `buildAccidentReportHwpx(accident, projectName): Promise<Blob>` 및 `downloadAccidentReportHwpx(accident, projectName): Promise<void>`를 유지한다. 브라우저가 가져오는 양식은 `/사고발생보고_양식.hwpx`다.

## 파일과 역할

| 파일 | 역할 |
|---|---|
| `safesys-app/scripts/accident-report-template.mjs` | 확정 원본을 읽어 개인정보·이미지·미리보기·문서 작성자 메타데이터를 정제하고 자리표시자를 심는 생성 스크립트 |
| `safesys-app/public/사고발생보고_양식.hwpx` | 부모 메인 컨텍스트가 생성한 런타임 양식. 저장소/배포에 반드시 포함해야 하는 필수 자산 |
| `safesys-app/src/lib/hwpx/accident-report-hwpx-export.ts` | 입력 필드 치환, 사진 수집·비율 유지, 다운로드 |
| `safesys-app/src/lib/hwpx/accident-report-layout.ts` | 원본 상자·머리 행을 복제하는 쪽 분할, 내용에 맞는 표 높이 계산 |
| `safesys-app/src/lib/hwpx/accident-report-xml.ts` | 중첩 XML 요소를 원문 문자열로 읽고 부분 치환하는 도우미 |
| `safesys-app/tests/accident-report-hwpx.test.mjs` | 정제 양식 필수 로드, 메모리 생성, 빈 입력·사진·장문·초장문 회귀검증 |
| `safesys-app/tests/fixtures/accident-report-photo-landscape.jpg`, `accident-report-photo-portrait.jpg` | 개인정보 없는 합성 가로·세로 사진 |

exporter와 layout 파일은 각각 약 500줄로 분리했다. UI/API/SQL/package.json/docs는 이 작업에서 변경하지 않았다. 실제 원본·정제 양식·샘플 HWPX의 디스크 쓰기와 한글 COM은 부모만 단독·순차 수행했으며, 복구 워커는 소스·테스트·이 보고서만 수정했다. 커밋·푸시·프로덕션 빌드는 실행하지 않았다.

## 원본 보존 및 정제

원본 SHA256은 `04DE7CE17F6FA74B9F540F7330FAE5D3A372218F160F2437BBDCCE1FECB59588`이며 복구 전후 동일하다. 원본 파일을 수정하거나 Git에 추가하지 않는다. 코드와 테스트는 원본 인명·전화번호·주소·사고 문장을 하드코딩하지 않고 문단/셀 위치와 일반 항목 라벨로 치환 지점을 찾는다.

정제 양식은 원본의 표 개수, 전체 폭, 셀 폭·높이·주소·병합 시퀀스와 `Contents/header.xml` 바이트를 보존한다. 제목·항목의 글꼴과 문단 스타일, 장식 아이콘과 체크 항목 배치는 원본을 사용한다. `pageBreak="CELL"`은 적용 지침에 따라 `NONE`으로 바꾸고 장문 분할은 exporter가 수행한다.

정제 대상은 제목·보고자·피해자 등 입력 영역, 사진과 사진 위 주석 도형, `BinData/*`, 사진 manifest 항목, `Preview/PrvImage.png`, 미리보기 본문, `opf:title` 및 creator/lastsaveby/날짜 메타데이터다. 미리보기 텍스트와 문서 제목 메타데이터는 일반 문구 `사고발생보고`만 남긴다. 원본의 나머지 메타데이터(subject/description/keyword)가 비어 있는 것도 읽기 전용으로 확인했다. 피해자 3개 예시 문단은 단일 입력 슬롯으로 정제하고 출력 시 입력 줄 수만큼 원본 문단을 복제한다.

정제 스크립트는 30개 토큰이 각 1회 존재하는지, 사진·주석·이미지 참조·전화번호 패턴이 남지 않는지, 원본 격자와 헤더가 유지되는지 검사한다. 한글 호환성을 위해 ZIP 첫 항목 `mimetype`은 비압축 STORE를 사용한다.

## 입력값 배치

| 원본 위치 | 출력값 |
|---|---|
| 제목·보고일자 | reportTitle(없으면 사업명 기반 기본 제목), reportDate |
| 보고자 셀 | reporterPosition, reporterName, reporterPhone |
| 보고요지 상자 | summary |
| 지구·일시·장소 | projectName(대체 external_project_name), accident_at, accidentTime, location |
| 피해자 인적사항 | injured_count, fatal_count, lost_workdays, accident_type, severity와 victimDetails |
| 인명 외 피해상황 | propertyDamage |
| 사고내용 | work_description, description, cause, damageDetails, responsibility |
| 신고·연락 및 사고자 조치 체크칸 | notifications 4종, victimActions 3종 |
| 미신고·보상 | noNotificationReason, workers_comp_claim, compensationDetails |
| 조치사항 | actionDetails, prevention_action |
| 언론보도 등 기타 특이사항 | otherNotes |
| 유관기관 연락처 상자 | relatedContacts |
| 원본 사진대지 2칸 | photos[0..1]의 사진과 caption |

원본에 별도 칸이 없는 통계·중대도·귀책사유·향후 계획은 관련 항목에 함께 적는다. 원본 항목 라벨은 유지하며 추가 정보인 피해현황·귀책사유·조치내용은 값이 없으면 빈 대시 행을 만들지 않는다. API의 최대 2장 계약을 적용하고, 사진이 0장 또는 1장이어도 사진대지 두 칸은 유지한다. 입력 사진을 불러오지 못하면 사진·설명을 조용히 누락하지 않고 한국어 오류로 알린다.

사진은 흰 배경 JPEG 정규화(max edge 1200)를 사용하며 가로·세로 원본 비율을 유지해 칸에 맞춘다. 200자 설명으로 캡션 행이 커지면 전체 사진 표 높이와 열폭은 유지하고 사진 칸 높이를 줄인다. 설명은 편집 가능한 HWPX 텍스트다.

## 장문과 쪽 분할

첫 본문 표의 고정 최소 높이를 제거했다. 원본 제목의 20pt·170% 줄간격과 보고자 셀의 실제 폭에서 예상 줄 수를 계산해 첫 쪽 가용 높이에서 차감한다. 본문 표·셀의 명시 높이는 해당 쪽에 배정한 내용으로 갱신한다. 이 변경으로 보고자 직책과 성명이 길 때 제목만 첫 쪽에 남던 문제가 해결됐다.

문단의 글자 모양·크기는 원본에서 읽어 확인한 상수를 사용한다. 한글·전각, ASCII 비례폭, 체크 기호·장식 아이콘, 문단 줄간격 및 앞 간격을 반영해 높이를 추정한다. 한글의 어절 단위 조판을 고려한 94% 폭과 쪽 여유를 적용한다. 이는 실제 글리프 측정의 대체 추정이므로 최종 판정은 부모의 한글 재조판 PDF로 한다.

보통 본문은 문단 또는 표시 줄 경계에서 나누고, 다음 쪽에 원본 바깥 표를 복제한다. 복제 표의 내용 셀 폭·병합은 유지하고 행 주소·높이와 표 ID를 맞춘다. 긴 요지·연락처는 원본 중첩 상자의 마지막 내용 셀 문단을 나누며 제목·장식 격자를 함께 복제한다. 반복 머리 문구를 제외하면 모든 입력 문자가 복원된다. 200자 성명·직책·전화번호는 원본 3열 보고자 머리 행을 쪽별로 나눠 제목 아래부터 이어 쓴다.

변경 문단과 영향을 받는 바깥 표·사진·참고1 앵커의 `linesegarray`를 제거한다. 글꼴 축소나 본문 삭제로 쪽을 맞추지 않으며 `pageBreak="CELL"`을 사용하지 않는다. 원본 머리 행 셀 합계(44499)가 바깥 표 폭(47630)과 다른 점은 원본 그대로 보존한다.

## 자동 검증

복구 워커가 HWPX_SAMPLE_DIR 환경변수 없이 실행한 최종 결과다.

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, 저장소 기존 경고 존재 |
| `npx eslint src/lib/hwpx/accident-report-hwpx-export.ts src/lib/hwpx/accident-report-layout.ts src/lib/hwpx/accident-report-xml.ts tests/accident-report-hwpx.test.mjs scripts/accident-report-template.mjs` | exit 0, 경고 없음 |
| `node --test tests/accident-report-hwpx.test.mjs` | 44 tests / 44 pass / 0 fail / 0 skip |

원본이 없는 CI에서도 정제 양식을 필수로 읽어 exporter 검증을 수행한다. 원본 대조 테스트 하나만 선택적으로 건너뛰며, 정제 양식 자산 자체가 없으면 실패한다. 원본이 있을 때에는 스크립트로 메모리에서 다시 정제한 section XML도 런타임 양식과 대조한다.

검증 범위는 ZIP MIME/압축, 그림 필수 요소와 manifest/BinData 참조, 표 ID 유일성, 원본 셀 폭, 전 입력 문자열, 체크 기호 수, 사진 비율과 두 슬롯, 본문 쪽 분할, 표 높이, 실패한 사진의 오류 처리다. nested 표본은 요지와 연락처 각 4,000자·각 사진설명 200자를 사용하며 반복 글자 수와 끝 마커까지 검사한다. heading 표본은 제목·성명·직책·전화 각각 200자다. long 표본은 사고내용 4,000자·피해자 30줄·조치 60줄·계획 40줄이다.

## 실제 한글 검증 — 부모 수행 증거

부모가 별도 한글 COM 객체에서 RegisterModule → Open → SaveAs(HWPX) → 재개방 → PDF 저장을 순차 수행하고 모든 단계 True 및 전체 페이지 육안 검증 결과를 전달했다. 워커는 COM을 실행하지 않았다.

| 표본/증거 경로 | 부모 결과 |
|---|---|
| `safesys-app/scratch/accident-samples/browser-v4-resaved.pdf` | 2쪽. 제목 고립 해결, 본문 1쪽과 사진 두 컷 1쪽 정상 |
| `safesys-app/scratch/accident-v4/long.pdf` | 10쪽 전부 확인. 제목 고립·테두리 밖 마지막 줄 해결 |
| `safesys-app/scratch/accident-v4/nested.pdf` | 10쪽 전부 확인. 4,000자 요지/연락처 상자 복제, 요지끝·연락처끝·설명하나·설명둘끝 보존. 캡션 높이 조정 전 표본 |
| `safesys-app/scratch/accident-final-v2/heading.pdf` | 4쪽 전부 확인. 제목·성명·직책·전화 200자 보존, 끝 마커를 공백 정규화한 PDF 텍스트로 대조 |

부모 최종 확인을 완료했다. `scratch/accident-final-v2`의 empty 2쪽, one/two 각각 3쪽, heading 4쪽 모두 정상이다. long 10쪽은 육안 확인한 v4와 모든 페이지 픽셀이 동일하다. 최신 nested는 9쪽이며 변경된 1·5·6·8·9쪽을 다시 육안 확인했고 나머지 쪽은 v4와 픽셀이 동일하다. 요지끝·연락처끝·설명하나·설명둘끝이 모두 보존되며 사진 설명 각 200자와 사진 두 컷이 마지막 한쪽에 함께 배치된다. 부모 전체 사고 테스트는 205개 중 204개 통과, 실패 0개, 기존 계정 삭제 트리거 TODO 1개다.

독립 code-reviewer 및 worker-opus의 초기 구현/리뷰는 이전 디스패치에서 수행됐다. 이후 Claude 세션한도로 중단된 작업은 부모의 명시적 복구 지시에 따라 Codex 워커가 직접 보완하고 부모가 독립 코드·타입·린트·브라우저·한글 실측을 검증했다. 잔여 실측 결함인 제목 고립, 중첩 장문 미분할, 본문 마지막 줄 넘침, 원본 부재 시 테스트 전체 skip을 해결했다.

## 부모 실행 명령

아래 명령의 HWPX 디스크 쓰기와 COM은 부모만 실행한다. 반드시 원본과 다른 출력 경로를 지정한다.

```powershell
Set-Location 'C:/Users/User/Documents/2026 개발관련/02. safesys/safesys-app'
node scripts/accident-report-template.mjs 'public/사고/사고보고_평택지사(20260610).hwpx' 'public/사고발생보고_양식.hwpx'
$env:HWPX_SAMPLE_DIR = 'scratch/accident-final-v2'
node --test tests/accident-report-hwpx.test.mjs
Remove-Item Env:HWPX_SAMPLE_DIR
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'scratch/verify-accident-hwpx.ps1' -InputPath 'scratch/accident-final-v2/heading.hwpx' -ResavedPath 'scratch/accident-final-v2/heading-resaved.hwpx' -PdfPath 'scratch/accident-final-v2/heading.pdf'
```

COM 검증은 같은 명령에서 표본 이름을 empty/one/two/long/nested로 바꿔 순차 실행한다. PDF의 모든 쪽·마지막 행·이어지는 상자·사진과 설명을 확인하고, 재저장본에서 글꼴과 입력 끝 마커 및 반복 횟수를 대조한다. 원본은 배포·Git 대상에서 제외하고 정제 양식만 포함한다. 이 복구 작업에서는 정제 스크립트를 변경하지 않아 이미 부모가 재생성한 양식을 그대로 사용한다.
