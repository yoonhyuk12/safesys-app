# 작업 결정과 근거

- `accidentDetailEntries`가 `description` 전체를 출력한 뒤 작업·원인·피해·귀책 필드를 다시 출력한다. 저장 성공/파일 열림 오류가 아니라 콘텐츠 중복이다.
- 최초 브리프의 페이지 분할 개선은 coordinator의 후속 지시에 따라 제외했다. 사용자 답변은 “텍스트 추출이 2번 들어간 경우가 있네”이다.
- 추출 모듈/테스트 수정 권한이 후속 지시로 추가되었다. 향후 추출에는 명시 하위 필드 분리 프롬프트와 보수적 정규화를 적용한다.
- 기존 저장 데이터·원본 양식·사용자 다운로드 파일은 읽기 전용이며, HWPX 생성과 한컴 COM은 coordinator가 담당한다.
- 테스트에 실제 사용자 정보를 넣지 않는다. 새 helper는 외부 패키지가 필요 없는 명시 라벨 블록 비교에만 한정한다.

## 2026-09-16 모델 변경 인계 상태

- coordinator가 사용자 지시에 따라 `gpt-6 --effort low` worker로 교체하므로 구현을 중지했다. 제품 코드 변경은 아직 없으며 rollback하지 않는다.
- 변경 파일은 이 계획 3개와 `safesys-app/tests/accident-report-extraction.test.mjs`뿐이다. 추출 테스트에 합성 5건을 추가했다.
- RED 명령은 `safesys-app`에서 `node --test tests/accident-report-extraction.test.mjs`이다. 총 30건 중 26 통과, 신규 4 실패이며 중복 제거·부분 보존·전체 중복 시 description 누락·프롬프트 규칙이 미구현이라 실패했다.
- 기존 `accident-report-hwpx.test.mjs`는 실행 즉시 메모리에서 HWPX를 생성한다. worker의 HWPX 생성 금지 때문에 실행하지 않았고 parent가 실행해야 한다. 새 helper import를 추가하면 테스트 수동 transpile 의존성 맵에도 등록해야 한다.
- 실제 문단은 `safesys-app/scratch/user-download-paragraphs.json`에 있다. 개인정보가 있으므로 tracked fixture에 복사하지 않는다.
- 실제 추가 중복은 `damageDetails` 선두에 `victimDetails` 전체가 붙어 있는 경우와 `actionDetails`가 `미신고 사유 : ...`로 `noNotificationReason` 전체를 반복하는 경우이다. 새 helper는 이 두 경우도 다뤄야 한다. 피해자 전체와 정확히 같은 선두 줄 묶음만 제거하고 뒤의 고유 부상 상세는 보존한다. 미신고 사유는 명시 라벨 블록 전체 일치만 제거한다.
- 실제 description 피해현황은 전용 damageDetails와 쉼표/줄바꿈·부가 인적사항 때문에 다르다. 의미 추정으로 제거하지 말고 불일치 블록을 보존한다.
- **확정 정책**. 정리 후 description이 전부 비면 초안에는 키를 넣지 않고 기존 CORE_FIELD_LABELS 경고로 사용자가 보완하게 한다. 원인을 다시 복사하거나 필수칸용 임의 사실/참조 문구를 채우지 않는다. worker가 제안했던 참조 문구는 채택하지 않는다.
- 다음 구현은 공통 pure helper를 `src/lib/`에 추가해 출력 시 객체 복사본과 AI 정규화 양쪽에 적용하는 방식이다. source 입력과 DB행은 변경하지 않는다. 프롬프트는 상위 사고내용 전체 복사 금지, 명시 하위 필드 분리, 별도 경위가 없으면 null 원칙을 명시한다.
- 아직 GREEN, 타입검사, 린트, HWPX 통합 테스트와 실제 재다운로드 COM 검증은 미수행이다. 원본 양식·다운로드 파일·페이지 분할기·기존 PDF/저장오류 작업·다른 테스트는 변경하지 않았다.

## 2026-09-16 구현 및 검증 인계

- `src/lib/accident-report-content.ts`에 pure helper를 추가했다. 줄 시작의 허용 라벨과 콜론으로 블록을 구분하고 개행 형식·바깥 공백만 정규화해 전용 필드 전체와 비교한다. 미확인 라벨·부분 일치·공백 차이·추가 설명은 그대로 보존한다.
- 피해현황 선두의 피해자 전체 줄 묶음은 줄 경계까지 일치할 때만 제거하며 고유 부상 설명을 보존한다. 조치사항의 미신고 사유는 명시 라벨 블록이 전용 필드와 같을 때만 제거한다.
- HWPX 생성 진입점에서 출력용 복사본에 적용하므로 기존 저장 데이터는 재다운로드만으로 개선된다. AI 정규화에도 적용하고 내용 전체가 비면 description 키를 제거해 기존 누락 경고를 표시한다. 프롬프트는 상위 항목 전체 복사 금지·하위 항목 분리·경위 미기재 시 null을 명시한다.
- RED를 다시 실행해 신규 4건 실패를 확인한 뒤 GREEN 32/32를 확인했다. 피해자 중복·미신고 중복·불일치 및 초장문 보존 회귀를 추가했다.
- `node --test tests/accident-report-extraction.test.mjs`, `npx tsc --noEmit`, `npx eslint src/lib/accident-report-content.ts src/lib/accident-report-extraction.ts src/lib/hwpx/accident-report-hwpx-export.ts` 모두 성공했다. `git diff --check`는 공백 오류 없이 통과했다.
- `tests/accident-report-hwpx.test.mjs`에 helper 의존성 등록과 기존 데이터 재출력의 중복 1회·고유 내용·입력 불변성 통합 회귀를 추가했다. HWPX 생성 금지 경계에 따라 worker는 실행하지 않았다. 부모가 기존 전체 HWPX 테스트와 실제 다운로드·COM 검증을 실행해야 한다.
- 소스 freeze checkpoint `msg_4e2672b5192b`를 전송했다. 제품 코드·테스트 5개 및 계획 산출물 3개가 작업 범위이며 페이지 분할·양식·DB·다운로드 원본은 변경하지 않았다.
- 부모 리뷰에서 피해자 선두 제거 전후 비교 순서의 재정규화 차이를 지적했다. 동시 입력 회귀 RED 후 피해현황 원본 전체와 정리된 전체 두 후보를 비교하도록 수정해 재정규화 일관성을 검증했다.
- 부모 실측 추가 요청과 승인에 따라 피해현황에만 2개 이상 목록 항목의 글머리·개행/쉼표+공백 형식 차이를 허용했다. 항목 전체 텍스트와 순서가 같아야 하며 내부 공백 차이·추가 내용·부분 일치·순서 변경은 보존한다. 다른 필드는 목록 정규화를 적용하지 않는다.
- 최종 추출 회귀 34/34 GREEN, 전체 tsc와 관련 소스 ESLint 재실행 성공. HWPX 테스트는 `node --check` 문법 확인만 수행했고 실행/COM은 부모에게 남겼다. 부모는 직전 버전에서 실제 원본 PDF AI 추출과 브라우저 중복 입력 보정 및 재다운로드 COM 3쪽 열림 정상이라고 보고했다. 최종 목록 정리 반영분의 실측은 부모 확인 대상이다.

## 부모 최종 검증

- 사용자 다운로드에서 역매핑한 로컬 재현 데이터의 수정 전 출력은 실제 다운로드와 공백 제외 전체 텍스트가 같고 3쪽이었다. 재현 데이터는 scratch에만 보관했다.
- 파주 원본 PDF를 최신 프롬프트로 실제 Gemini 1회 분석했다. HTTP 200이며 별도 경위는 null, 원인은 cause 한 곳에 추출되었다. 없는 경위는 사용자 보완 안내로 남긴다.
- 실제 브라우저에서 기존 중복 AI 응답과 원본 PDF 업로드를 재현해 원인·피해자 인적사항·미신고 사유의 중복 방지 및 사진 2컷을 확인했다. 자동 저장은 없다.
- 기존 저장 내용으로 다시 다운로드한 HWPX는 Hancom2022 COM 등록·열기·재저장·재개방·PDF 변환 모두 true다. 3쪽 전체 육안 확인과 텍스트 비교에서 작업·원인·귀책·미신고 사유·피해자·부상 상세 2개까지 7개 문구가 각각 1회 출력되었으며 사진 2컷이 유지된다. 원본 다운로드와 DB는 수정하지 않았다.
- 부모 전체 사고 회귀 234개 중 233 PASS·기존 TODO 1, tsc와 변경 소스 ESLint 및 diff check 통과.
- 모델 변경 인계 1회 후 Worker가 구현을 완료했다. 실제 provider 모델은 gpt-6-astra이고 사용자 인계된 터미널은 Orca user_takeover 상태에 따라 보존했다. 최초 low 실행 설정은 확인했고 전환 이후 effort는 별도 증명되지 않는다. CLAUDE의 기본 모델은 사용자 지정 gpt-6-astra/low로 정정 완료했다.
