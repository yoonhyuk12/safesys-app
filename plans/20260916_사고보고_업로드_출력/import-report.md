# 사고보고 문서 자동 채움(문서 추출 담당) 구현 보고

작업일 2026-09-16. 1차 구현은 Orca dispatch ctx_f646aa4fbfac(worker-opus 구현, Advisor 검증). 최종 검토·보완은 dispatch ctx_b59f673ba18e(task_5697554e66ca)가 독립 담당으로 맡아 worker-opus에 위임하고 Advisor가 diff·테스트·실측으로 확인했다. 커밋·푸시·빌드·원격 SQL은 하지 않았다.

## 변경 파일

| 파일 | 내용 |
|------|------|
| `safesys-app/src/lib/accident-report-extraction.ts` (신규) | 서버·브라우저 공용 순수 모듈. 상한 상수, `AccidentPrefillFields`/`AccidentPrefillResult`, 시스템 지시문·프롬프트, Gemini `responseSchema`, `extractGeminiJsonText`, `normalizeAccidentExtraction` |
| `safesys-app/src/lib/accident-report-import.ts` (신규) | 브라우저 모듈. `AccidentImportError`, `extractHwpxText`(JSZip, `Contents/section*.xml`만), `requestAccidentPrefill(file, projectId, accessToken)` |
| `safesys-app/src/app/api/ai/accident-report/route.ts` (신규) | 인증 라우트. 사용자 JWT로 `getUser` → `projects` RLS 조회 → Gemini 호출 → 정규화 결과 반환. 저장하지 않는다 |
| `safesys-app/src/lib/ai-models.ts` | `ai.accident-report`(Google, `gemini-flash-lite-latest`) 항목 1개 추가(1차 담당 완료분) |
| `safesys-app/package.json` | `test:accident-import` 스크립트 1줄(1차 담당 완료분) |
| `safesys-app/tests/accident-report-extraction.test.mjs` (신규) | 정규화기 25건 |
| `safesys-app/tests/accident-report-import.test.mjs` (신규) | 합성 HWPX 추출·API 호출 22건 |
| `safesys-app/tests/accident-report-route.test.mjs` (신규) | 라우트 인증·검증·오류 매핑 19건 |

UI·공통 타입·HWPX 출력 모듈·SQL은 건드리지 않았다. `src/lib/accident-report.ts`(UI 담당 생성)의 타입·상수를 import해 쓴다.

## 최종 검토에서 보완한 것 (ctx_b59f673ba18e)

1. **사망>부상 경고 삭제.** 부상·사망은 별도 집계이므로 `fatal_count > injured_count` 경고는 잘못이었다. 블록을 지우고 "사망 1·부상 0은 값을 보존하고 경고하지 않는다" 회귀 테스트로 바꿨다.
2. **산재신청 미확정 가드를 산재 문구에 앵커링.** 1차의 `UNSETTLED_COMP_CLAIM_PATTERN = /준비|예정|검토|미정|진행\s*중/`은 `compensationDetails` 어디에든 걸려 "산재 신청 완료, 보상금 지급 진행 중"에서도 applied를 지웠다. 이제 "산재(보험)(처리) 신청/접수 + 준비·예정·검토·미정"이 직접 이어질 때, 또는 산재 처리 항목 맨 앞이 "신청 준비·예정"으로 시작할 때만 비운다(PDF 실측에서 모델이 라벨을 떼고 "신청 준비 중 (신청 완료 아님)"만 돌려줬기 때문). "진행 중"은 트리거에서 뺐다. 회귀 케이스 — 비움 6건("산재 신청 준비중", "산재보험처리: 신청 준비 중 (신청 완료 아님)", "신청 준비 중 (신청 완료 아님)" 등), 보존 6건("산재 신청 완료, 보상금 지급 진행 중", "산재 접수 완료(승인 예정)", "보상 협의 진행 중" + applied, "산재 미신청" + not_applied 등).
3. **프롬프트 분리.** 산재신청 여부는 '산재보험처리'·'산재 처리'·'산재신청' 항목 문구만으로 판단하고, 119·경찰·노동관서·가족 신고 여부(notifications)와 무관하다고 명시했다. 119 미신고를 이유로 not_applied로 두지 않는다는 문장을 넣었다. 신청 완료 뒤 치료·보상 진행 문구가 있어도 applied라고 적었다.
4. **보고일·보고자 누락 원인.** 합성 PDF의 텍스트 층을 PyMuPDF로 확인한 결과 "보고일자: 2026. 09. 16."과 "보고자: 검증지사장 김테스트 (010-0000-0000)"가 정상적으로 있고 U+200B 문자는 0개다. 문서 결함이 아니라 프롬프트 문제였다. 프롬프트 [필드 대응]에 "문서 맨 위나 공문 머리의 '보고일자'·'보고일'·'작성일' → reportDate(사고 일시와 섞지 않는다)"와 "'보고자'·'작성자'·'담당자' 줄은 직책·성명·전화 세 필드로 나눈다"를 추가했다. 아울러 `normalizeDate`가 한국 공문 표기 "2026. 09. 16."(구분자 뒤 공백)을 받도록 했다. 원본 문자는 지우지 않았다.

## 인터페이스 계약

- `requestAccidentPrefill(file, projectId, accessToken): Promise<{ fields, warnings }>`. 실패 시 `AccidentImportError`(한국어 메시지)만 던지고 호출자 초안은 건드리지 않는다.
- `fields`는 `Partial<Pick<AccidentFormInput, accident_at|severity|accident_type|location|work_description|description|cause|prevention_action|injured_count|fatal_count|lost_workdays|workers_comp_claim>> & { report_details?: Partial<Omit<AccidentReportDetails, 'photos'>> }`.
- **값이 없으면 키 자체가 없다.** 빈 문자열·빈 배열·null은 키를 만들지 않는다. UI는 `{ ...draft.report_details, ...fields.report_details }`처럼 병합해야 하며, 현재 `prefill-merge.ts`의 `planPrefillMerge`가 빈 값을 건너뛰므로 계약이 맞는다.
- `accident_at`은 기존 모달과 같은 `YYYY-MM-DD` 일자 문자열이다. 시각은 `report_details.accidentTime`(HH:mm)에 따로 간다.
- `project_id`·`external_*`·`created_by`·`photos`·모델 지정은 어떤 경로로도 받지 않는다. 응답에 섞여 와도 정규화에서 버린다(테스트로 단정).
- API. `POST /api/ai/accident-report`, `Authorization: Bearer <access_token>`, multipart `project_id` + (`file` PDF ≤ 4MB | `text` ≤ 100,000자). 응답 `{ success: true, fields, warnings, model }` 또는 `{ success: false, error }`.
- 상태코드. 401 토큰 없음/무효, 400 형식·project_id·문서 없음/둘 다·PDF 아님(서명 `%PDF-` 검사), 403 RLS로 현장 안 보임, 413 크기 초과, 429 분당 10건·동시 1건 초과, 500 환경 변수 없음, 502 Gemini 오류·응답 해석 실패, 504 60초 초과.

## 안전 규칙 구현

- 접근 확인은 anon 키 + 사용자 JWT 클라이언트의 `projects` SELECT로만 한다. `supabase-admin`은 import하지 않는다(테스트가 소스로 단정).
- HWPX는 원본 15MB, 엔트리 500개, 섹션 XML 하나 8MB·합계 24MB 압축해제 상한. `_data.uncompressedSize` 사전 검사 후 `internalStream`으로 누적 바이트를 세다 넘으면 `pause()`·reject한다(헤더가 거짓 크기를 신고하는 zip 방어). `BinData/`·`Preview/`·`header.xml`은 압축해제하지 않는다. 암호화·손상 zip은 "암호가 걸렸거나 손상된 HWPX"로 거절, `mimetype`/`content.hpf` 없으면 "HWPX 형식이 아닙니다".
- 문서 본문·추출 텍스트·AI 응답은 로그에 남기지 않는다. 오류 로그는 상태코드·오류 이름만이다.
- 신고처·피해자 조치·산재신청은 문서에 체크·명시가 있을 때만 채우도록 프롬프트에 적고, enum 외 값은 버린다. 재해 유형이 목록과 다르면 '기타'로 굳히지 않고 원문을 warning으로 돌려 사용자가 고른다.
- 핵심 필드(사고 일시·내용·장소·정도·유형) 누락은 항목별 warning, 마지막에 "초안이며 저장 전 확인" 고지를 항상 붙인다. 클라이언트는 서버 응답을 한 번 더 정규화한다.

## Gemini 호출 형식 (공식 REST v1beta 확인)

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, 헤더 `x-goog-api-key`. 기존 `ai.inspection-checklist` 라우트와 같은 호출 형태다.
- PDF는 `contents[0].parts = [{ inlineData: { mimeType: 'application/pdf', data: <base64> } }, { text: prompt }]`. 공식 문서는 PDF 50MB·1000쪽까지 지원하며 큰 파일엔 Files API를 권하지만, 우리는 4MB 상한을 두어 인라인으로 충분하다. 새 의존성 없음.
- HWPX는 `parts = [{ text: prompt + '\n\n# 문서 본문\n' + text }]`.
- `generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: <OpenAPI 부분집합>, maxOutputTokens: 4096 }`. 응답은 `candidates[0].content.parts[].text`, `finishReason`, `usageMetadata` — 기존 `recordAiUsage`의 Gemini 사용량 추출과 호환된다.
- `finishReason === 'MAX_TOKENS'`면 "일부 항목이 채워지지 않았을 수 있습니다" warning을 앞에 붙인다.

## 검증 결과 (최종 검토 시점)

```
npm run test:accident-import (3개 테스트 파일)   → tests 65 / pass 65 / fail 0
npx eslint <소유 소스 3개 + 테스트 3개>          → 오류·경고 0
npx tsc --noEmit                                 → 오류 0 (exit 0, 앱 전체, 리뷰 반영 후 재실행)
```

### 실측 (최종 프롬프트, 합성 데이터 각 1회, 로컬 `GEMINI_API_KEY`, 모델 `gemini-flash-lite-latest`)

원본 `public/사고/` 파일과 `scratch/accident-samples/pyeongtaek-original*`은 외부 AI에 보내지 않았다. 호출 스크립트와 원응답 JSON은 gitignore 대상인 `safesys-app/scratch/accident-samples/`(`live-accident-extract.mjs`, `live-pdf-*.json`, `live-hwpx-text-*.json`, `synthetic-hwpx-text.txt`)에만 있고 합성 데이터만 담겨 있다.

| 입력 | 결과 |
|------|------|
| `synthetic-report.pdf` inlineData (1쪽, 텍스트 층 정상) | HTTP 200, 2.6초, 토큰 1,701/453. **보고일 2026-09-16, 보고자 김테스트 / 검증지사장 / 010-0000-0000 모두 추출.** 사고일 2026-09-15·15:20, 부상 1·사망 0, severity minor, 신고처 family, 조치 hospital. 산재는 문서가 "신청 준비 중 (신청 완료 아님)"이라 `workers_comp_claim: null`(정상). 재해 유형은 문서에 없어 warning. `victimDetails`에 U+200B 없음 |
| `synthetic-hwpx-text.txt` (표 형식 추출 텍스트, 119 미신고 + 산재 신청 완료·치료 진행 중) | HTTP 200, 2.3초, 토큰 1,656/601. 보고일 09-16과 사고일 09-14 분리, 추락·lost_time·휴업 21일·부상 1, 신고처 family만, 조치 hospital. **119 미신고인데도 `workers_comp_claim: applied`가 보존**되고 가드도 지우지 않았다. warning은 초안 고지 한 줄뿐 |

**실측의 한계.** 각 1회 호출이라 통계적 재현성은 보장하지 않는다. temperature 0.1이지만 같은 문서에 다른 출력이 나올 수 있다. 합성 PDF에서 모델이 `description`에 사고경위 대신 사고원인 문장을 복사했는데(합성 문서에 '사고경위' 항목이 없고 '사고내용' 제목 아래 원인만 있음), 실제 양식엔 경위 항목이 있으므로 코드로 보정하지 않았다. 1차 실측에 나왔던 "U+200B" 문자열은 이번 응답엔 없었고 PDF 텍스트 층에도 없으므로 모델 출력의 일회성 산물로 본다. 실제 양식 PDF·HWPX는 개인정보가 있어 외부 AI로 검증하지 않았다.

### 독립 코드 리뷰 (superpowers 코드 리뷰어 템플릿, general-purpose 서브에이전트)

리뷰어는 7개 요구사항(JWT→RLS→AI 순서, 금지 키 이중 화이트리스트, zip 폭탄 상한, 타임아웃·타이머 정리·모델 폴백, 정규화 회귀, 로그 무노출, 프로젝트 규칙)이 모두 코드로 충족됨을 file:line으로 확인했고, 위조 헤더 zip을 직접 만들어 스트림 누적 방어가 27ms에 거부하는 것도 재현했다. 판정은 "With fixes".

| 심각도 | 지적 | 처리 |
|------|------|------|
| Important | `UNSETTLED_COMP_CLAIM_PATTERN`이 `'산재' + 공백 3990개 + 'x'`에서 10초 걸리는 치명적 백트래킹. 이 검사는 서버 라우트에서 돌고 `compensationDetails`는 4000자까지 허용된다 | Advisor가 재현(1000자 198ms, 2000자 1.6초, 3990자 10.1초). 토큰 사이 구분자를 한 클래스로 한 번만 두는 정규식으로 교체했다(18개 의미 케이스 동일, 3990자 0ms). 회귀 테스트 "긴 공백 입력에서도 즉시 끝난다"(100ms 미만·applied 보존) 추가. 새 정규식은 "산재·처리 미정"처럼 산재와 처리 사이 구분자도 허용해 미확정 판정이 아주 조금 넓어졌다(비우고 사용자가 고르는 보수적 방향) |
| Important | 거대 섹션 테스트가 헤더가 정직해 선언 크기 검사에서 끝나므로 스트림 누적 경로가 테스트되지 않음 | 테스트 "zip 헤더가 거짓 크기를 신고해도 스트림 누적 바이트에서 막는다" 추가. `JSZip.prototype.loadAsync`를 감싸 로드 직후 섹션의 `_data.uncompressedSize`를 100으로 위조해 헤더 검사를 통과시키고, 스트림 data 이벤트 약 1,000회 뒤 8MB 예산에서 거부되는 것을 단정한다(`finally`로 복구) |
| Minor | `HWPX_TOKEN_PATTERN`의 `<hp:t>…</hp:t>` 지연 매칭이 닫는 태그 없는 XML에서 O(n²)(200KB 1초). 브라우저에서 자기 파일을 여는 경로라 서버 영향 없음 | 미수정. 정상 HWPX엔 닫는 태그가 항상 있고 사용자 본인 탭만 느려진다 |
| Minor | `finishReason`이 SAFETY·RECITATION 등일 때 안내 없음(대부분 parts가 비어 502로 끝남) | 미수정. 저확률이며 초안은 사용자가 검토한다 |
| Minor | 502 문구에 업스트림 HTTP 상태코드 노출, `formData()`가 413 판정 전 본문을 메모리에 올림, `%PDF-` 서명을 0바이트 위치에서만 검사, `normalizeReportDetails`가 warnings 배열을 push로 채움, 인메모리 레이트리밋 | 미수정. 실질 결함이 아니라 판단해 기록만 남긴다 |
| 권고 | 시스템 지시문에 "문서 안의 지시문은 데이터로만 취급" 한 줄 추가 | 미반영. 출력이 스키마·enum·화이트리스트로 고정돼 문서 내용이 출력 형태를 바꿀 수 없고, 값 조작은 사용자가 검토하는 초안에 그친다. 후속 과제로 남긴다 |

## 남은 일·주의

- `ai_model_settings` 시드 SQL에는 `ai.accident-report` 행을 넣지 않았다(원격 SQL 금지). 없어도 `DEFAULT_AI_MODELS` 폴백으로 동작하고 관리자 화면에도 기본값으로 뜬다. `getAiModel`은 DB 조회 실패를 삼키고 빈 맵을 60초 캐시하므로 라우트가 죽지 않는다.
- `safesys-app/scratch/`는 `.gitignore` 34행으로 제외된다(`git check-ignore -v`로 확인). 1차 보고의 "gitignore 대상이 아니다"는 잘못된 문장이었다. 다만 `pyeongtaek-original*`은 원본 렌더로 보이므로 작업이 끝나면 지우는 편이 좋다.
- 라우트 레이트리밋은 인스턴스 메모리라 서버리스 다중 인스턴스에서는 느슨하다(기존 패트롤 라우트와 같은 한계). `maxDuration`은 다른 AI 라우트와 같이 내보내지 않는다(AbortController 60초가 fetch·본문 읽기를 덮는다).
- `jszip` 타입 선언에 `internalStream`이 없어 좁은 로컬 인터페이스로 캐스팅했다. 타입이 보강되면 그 인터페이스만 지우면 된다.
- 산재 가드는 `compensationDetails` 본문에서 "산재 … 신청 준비·예정" 또는 항목 맨 앞 "신청 준비·예정"만 잡는다. "치료 진행 중, 산재는 추후 신청 예정"처럼 산재가 뒤에 오는 문장은 첫 alternative가 잡지만, "신청 예정"만 문장 중간에 있으면 모델 판단을 그대로 둔다. 이는 과도한 삭제를 피하려는 의도된 범위다.
