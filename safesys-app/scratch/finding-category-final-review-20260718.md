# 최종 독립 검수 보고서 — inspection finding category codes (F01~F20)

- 검수자: Grok (읽기 전용)
- 일자: 2026-07-18
- 대상:
  - `database/20260718-1120_add_inspection_finding_category_codes.sql`
  - `safesys-app/src/lib/finding-classification.ts`
  - `safesys-app/src/lib/accident-analysis.ts`
  - `safesys-app/src/lib/accident-analysis-types.ts`
  - (연동) `accident-analysis-calculation.ts`, `AccidentAnalysisView.tsx`, 저장 경로들
  - (참고) `safesys-app/scratch/inspection-finding-classification.md` / `.json`
- 사용자 확정 기준: F19 기존 91건 → 메타/상태 29건 NULL 제외 · 60건 지정 코드 재분류 · CCTV 2건만 F19 유지 · 신규 `F20_WORK_METHOD` 표시명 **작업방법 미준수**

---

## 1. 요약 판정

| 영역 | 판정 | 비고 |
|------|------|------|
| 마이그레이션 순서(컬럼→함수→백필→트리거→CHECK) | 양호 | 재실행 안전 패턴 사용 |
| 정기 findings→field_item fallback | 양호 | 백필·트리거 모두 `COALESCE(NULLIF(BTRIM(findings),''), field_item)` |
| 본부 issue1/2 | 양호 | 각각 독립 분류, issue2 공백 → NULL |
| UPDATE 시 원문 변경 때만 재분류 | 양호 | `IS DISTINCT FROM` on findings/field_item 또는 issue_content1/2 |
| F01~F20 CHECK (NULL 허용) | 양호 | 세 컬럼 모두 동일 집합 |
| F20 표시명 | 양호 | TS `작업방법 미준수` / SQL COMMENT 일치 |
| UI 집계 연결 | 양호 | SELECT 컬럼 → resolveFindingCode → aggregate → AccidentAnalysisView |
| 모든 저장 경로 트리거 적용 | 양호(조건부) | 테이블 INSERT/UPDATE 경유 시 BEFORE 트리거. 조치사진·action_items만 갱신 시 원문 불변 → 코드 유지(의도 부합) |
| PostgREST SELECT | 주의 | SELECT는 재계산 안 함. **컬럼 선적용(마이그레이션) 필수**. 앱은 NULL 시 클라이언트 fallback |
| SQL ↔ TS 규칙 동일성 | **미달** | 골든 샘플 34건 중 **6건 불일치** (아래 HIGH/MEDIUM) |
| F19 91=29+60+2 실측 | 미검증 | 정적 규칙·주석만 확인. 라이브 백필 카운트 필요 |

**실행 전 권고.** SQL을 프로덕션에 적용하기 전에 SQL을 TS 쪽 early override·공백 패턴에 맞추거나, TS를 SQL에 맞추는 **단일 소스 정렬**이 선행되어야 한다. 정렬 없이 적용하면 저장 코드(SQL)와 미적용 시 클라이언트 fallback(TS)이 어긋난다.

---

## 2. HIGH

### H1. SQL·TS 분류 불일치 6건 (규칙 동형성 깨짐)

로컬 패리티 스크립트로 대표 문장을 양쪽 로직에 통과시킨 결과.

| 원문 | SQL | TS | 원인 |
|------|-----|----|------|
| 그라인더 덮개 미설치 | F11_MATERIAL | F14_TOOL | TS만 F14 early override. SQL은 F11 `덮개`가 F14보다 선행 |
| 장비 구름 방지 장치 미흡 | F05_MACHINERY | F06_LIFTING | TS만 `구름 방지` early override. SQL은 F05 `장비` 선행 |
| 보안경 미착용 | F19_OTHER | F14_TOOL | TS F14에만 `보안경` |
| 작업가능상태 확인 미흡 | F19_OTHER | F16_DOC | TS F16에만 `작업가능상태` |
| 작업 방법 미준수 | F19_OTHER | F20_WORK_METHOD | TS만 `작업\s*방법\s*미준수`. SQL은 `작업방법[[:space:]]*미준수` (작업·방법 사이 공백 불가) |
| 안전 시설 미흡 | F19_OTHER | F02_FALL | TS만 `안전\s*시설`. SQL은 `안전시설` 붙여쓰기만 |

마이그레이션 주석의 확정 샘플(점검사진→NULL, CCTV→F19, 상하작업→F20, 울타리→F08, 넘어짐→F10 등)은 **양쪽 일치**. 문제는 “주석 골든셋 밖” 충돌 보정·공백 변형.

**영향.** 적용 후 UI는 `resolveFindingCode`가 **DB 저장 코드를 우선**하므로 SQL 결과가 화면에 고정된다. 미적용·NULL fallback 구간만 TS를 타 이중 기준이 생긴다.

**권고.** SQL `classify_inspection_finding`에 TS early override와 동일 분기를 넣거나, TS extra를 제거하고 SQL을 정본으로 못 박은 뒤 골든셋 재실행.

### H2. 앱 배포 전에 SQL 미적용 시 PostgREST SELECT 실패

`accident-analysis.ts`가 다음을 **항상 SELECT** 한다.

- `safety_inspection_results.finding_category_code`
- `headquarters_inspections.issue1_category_code`, `issue2_category_code`

컬럼이 없으면 사고분석 데이터 로드가 실패한다.  
**PostgREST는 SELECT 시 트리거/함수를 돌리지 않는다.** 분류 값은 (1) 마이그레이션 백필 + (2) INSERT/UPDATE 트리거로만 채워진다.

**차단 조건.** 앱(메인 푸시=운영 배포) 전에 반드시 Supabase 콘솔에서 해당 SQL 수동 적용. 파일 헤더: “MCP 적용 대상 아님”.

### H3. F19 91건(NULL 29 / 재분류 60 / CCTV F19 2) 미실측

SQL 주석과 설계 의도는 반영됐으나, 이 검수는 **라이브 SELECT 없이** 정적 검토만 했다.  
scratch 1차 분석(`inspection-finding-classification-data.json`)은 **구 규칙(F19=91, F20 없음)** 시점 스냅샷이라 재분류 후 수치 검증 자료로 쓸 수 없다.

**차단 조건(운영 수용 기준).** 적용 직후 아래 검증 쿼리로 29/60/2(또는 현재 코퍼스 기준 동등 비율)를 확인하기 전에는 “사용자 확정 충족”을 선언하지 말 것.

---

## 3. MEDIUM

### M1. 제외 신호(DEFECT) 집합 SQL 내부 이중 기준 + TS 단일 집합

- SQL 공사상태 메타·`^(현장|서류|안전)(점검|확인|사진)`: `미착용|미설치|미배치|미흡|불량|누락|미확보|부적정` (짧음)
- SQL `양호|적정`: 위에 `필요|교체|지시|위험|미사용|미준수|미비` 추가 (김)
- TS `DEFECT_SIGNAL`: 긴 집합을 메타·양호·현장 접두에 **공통** 사용

대부분 실데이터에서 어긋나지 않으나, 예: `미착공 … 필요` 형태는 SQL에서 NULL 제외, TS에서 제외 해제 후 재분류될 수 있다.

### M2. 코퍼스 진입 필터(`isMeaningfulFindingText`) ≠ 분류 제외(`isExcludedFindingText`)

`accident-analysis-utils.NO_FINDING_KEYWORDS`는 양호·해당없음 등 소수만 담는다.  
`점검사진`, `현장전경`, `조치`, `현장점검` 등은 **finding_count에는 잡힐 수 있고**, `toFinding`→`classifyFinding`에서 null로 **분류 집계에서만 제외**된다.  
분류 순위 UI 분모와 finding_count KPI가 어긋날 수 있다(기존 구조 + 강화된 제외 규칙 간 갭).

### M3. 의도적 1순위 한계 미해소 (스크래치 분석 5절)

양쪽 공통.

- `그라인더 덮개` → SQL F11 (TS는 H1로 F14)
- `위험물 보관` → F11 (`보관`이 F15보다 선행)
- `전선 정리` → F10 (`정리`가 F13보다 선행)

사용자 확정 범위 밖이면 문서화만으로 충분. 확정 목록에 포함됐다면 SQL early override 필요.

### M4. `resolveFindingCode`가 잘못된 저장 코드를 영구 우선

DB에 `F19_OTHER`가 이미 있으면 클라이언트가 더 나은 규칙으로도 덮지 않는다.  
규칙 수정 후 **재백필(UPDATE … classify …)** 없이는 과거 행이 고착된다.  
현재 트리거는 원문 불변 시 재분류하지 않으므로(요구사항 부합) 규칙 핫픽스 시 수동 재백필 절차가 필요하다.

### M5. 수동 카테고리 컬럼만 UPDATE 하면 트리거가 재계산하지 않음

원문 불변 + `finding_category_code`만 바꾸면 유지된다. 현재 폼은 카테고리 컬럼을 쓰지 않아 실무 위험은 낮음. 향후 수동 수정 UI를 넣을 때 정책 결정 필요.

---

## 4. LOW

### L1. SQL EXCLUSION `IN` 목록에 `점검사진` 중복

동작 무해. 정리 권장.

### L2. TS F02에 `안전\s*시설` 추가, SQL 미반영

H1의 `안전 시설 미흡`과 동일 계열.

### L3. 스크래치 문서/코드 체계에 F20 미기재

`inspection-finding-classification.md` 코드표는 F01~F19까지. 구현은 F20 추가됨. 문서 후행 갱신 권장(기능 차단 아님).

### L4. 골든셋 단위 테스트 부재

`finding-classification.ts`에 Jest/Vitest 골든셋이 없다. SQL 주석 검증 SELECT와 TS 동일 케이스를 테스트로 고정하면 회귀를 막는다.

---

## 5. 요구사항별 체크리스트

| 요구 | 결과 |
|------|------|
| 제외 신호 동일성 | 부분 충족 — compact 집합·정규식 대부분 동일, DEFECT 이중 기준·TS 확장 키워드 차이 (H1, M1) |
| 우선순위 F01→F18→F20→F19 | 충족 — 양측 동일 골격. TS만 추가 early override |
| 정규식 동일성 | 부분 충족 — H1 표 |
| 정기 findings→field_item fallback | 충족 — SQL 백필/트리거, 앱 `finding \|\| field` |
| 본부 issue1/2 | 충족 |
| UPDATE 원문 변경 시에만 재분류 | 충족 |
| 모든 저장 경로 트리거 | 충족 — SafetyInspectionForm insert/update findings/field_item, HQ issue_content insert/update, 조치사진·action_items만 갱신은 원문 불변으로 코드 유지 |
| PostgREST SELECT = SQL 선적용 필요 | **예** — 컬럼·백필 선행 필수. SELECT 자체는 재분류 안 함. NULL 시 앱 TS fallback |
| F01~F20 CHECK | 충족 |
| UI 집계 연결 | 충족 — `findingClassification` → 순위 섹션, 표시명 `findingCodeName` (F20=작업방법 미준수) |
| F19: NULL29 / 재분류60 / CCTV2 | 설계 반영·정적 샘플 일치, **실측 미완** (H3) |

---

## 6. 저장 경로 트리거 적용 맵

| 경로 | 테이블 | 갱신 컬럼 | 트리거 재분류 |
|------|--------|-----------|---------------|
| `SafetyInspectionForm` 저장 | `safety_inspection_results` | findings, field_item, … | INSERT 항상 / UPDATE 원문 변경 시 |
| `safety-inspection-ledger` 조치 | 동 | after_photo_url, action_items | 아니오(원문 불변) |
| `issue-management` 조치 | 동 + HQ | after_photo_url, action_photo, status | 아니오 |
| HQ 페이지 생성/수정 | `headquarters_inspections` | issue_content1/2 | INSERT 항상 / content 변경 시 |
| 마이그레이션 백필 | 양쪽 | category 컬럼 | 트리거 전 일괄 UPDATE(함수 직접 호출) |

클라이언트는 category 컬럼을 쓰지 않으므로, 적용 후 신규·수정 행은 트리거가 권위 있는 값을 기록한다.

---

## 7. 실행 전 차단 사항 (Go / No-Go)

1. **No-Go (권고).** H1 6건 정렬 없이 운영 적용 시 DB vs 클라이언트 이중 기준 확정.
2. **No-Go.** 앱 배포(main 푸시) 전 SQL 미적용 → SELECT 컬럼 오류.
3. **조건부 Go.** SQL 단독 콘솔 적용은 가능하나, 적용 직후 H3 검증 쿼리로 F19 잔여·NULL·F20을 확인하기 전 “91건 확정 충족” 선언 금지.
4. **Go 가능 항목.** 컬럼/CHECK/트리거 골격, fallback, UPDATE 가드, UI 파이프라인, F20 표시명 문자열.

---

## 8. 권장 검증 명령

### 8.1 SQL (Supabase SQL editor, 적용 직후)

```sql
-- 분포
SELECT finding_category_code, COUNT(*) FROM safety_inspection_results GROUP BY 1 ORDER BY 2 DESC;
SELECT issue1_category_code, COUNT(*) FROM headquarters_inspections GROUP BY 1 ORDER BY 2 DESC;
SELECT issue2_category_code, COUNT(*) FROM headquarters_inspections GROUP BY 1 ORDER BY 2 DESC;

-- 골든 샘플 (주석과 동일)
SELECT public.classify_inspection_finding('점검사진');                    -- NULL
SELECT public.classify_inspection_finding('이동형cctv 설치');              -- F19_OTHER
SELECT public.classify_inspection_finding('CCTV 각도 조정');               -- F19_OTHER
SELECT public.classify_inspection_finding('상하작업 동시진행');            -- F20_WORK_METHOD
SELECT public.classify_inspection_finding('안전시설물 설치 미흡');         -- F02_FALL
SELECT public.classify_inspection_finding('공사 구간 안전 울타리 미설치'); -- F08_ACCESS_CTRL
SELECT public.classify_inspection_finding('구름 방지 장치 조치 미흡');     -- F06_LIFTING
SELECT public.classify_inspection_finding('라바콘 등 교통 안전조치 미흡'); -- F08_ACCESS_CTRL
SELECT public.classify_inspection_finding('근로자 작업대 안전규칙 부적격'); -- F14_TOOL
SELECT public.classify_inspection_finding('작업 종료 후 안전시설물 등으로 통행인 넘어짐 사고 등 방지조치 필요'); -- F10
SELECT public.classify_inspection_finding('돌출부위 주변 넘어짐 위험 발생 가능'); -- F10

-- 패리티 실패 후보 (정렬 전후 비교)
SELECT public.classify_inspection_finding('그라인더 덮개 미설치');
SELECT public.classify_inspection_finding('장비 구름 방지 장치 미흡');
SELECT public.classify_inspection_finding('보안경 미착용');
SELECT public.classify_inspection_finding('작업가능상태 확인 미흡');
SELECT public.classify_inspection_finding('작업 방법 미준수');
SELECT public.classify_inspection_finding('안전 시설 미흡');

-- 정기 fallback: findings 공백 + field_item만 있는 행
SELECT id, findings, field_item, finding_category_code
FROM safety_inspection_results
WHERE COALESCE(BTRIM(findings), '') = '' AND COALESCE(BTRIM(field_item), '') <> ''
LIMIT 20;

-- 트리거 존재
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('public.safety_inspection_results'::regclass, 'public.headquarters_inspections'::regclass);
```

### 8.2 앱 (로컬, 읽기 전용 점검)

```bash
cd safesys-app
npx tsc --noEmit
npm run lint
# 사고분석 화면에서 분류 순위 섹션: F20 표시명 "작업방법 미준수", 관리자점검 제외, 기간 필터 반영
```

### 8.3 규칙 핫픽스 후 재백필 (필요 시)

```sql
UPDATE public.safety_inspection_results
SET finding_category_code = public.classify_inspection_finding(
  COALESCE(NULLIF(BTRIM(findings), ''), field_item)
);

UPDATE public.headquarters_inspections
SET
  issue1_category_code = public.classify_inspection_finding(issue_content1),
  issue2_category_code = public.classify_inspection_finding(issue_content2);
```

---

## 9. 남긴 일 (구현 담당용, 본 검수는 수정 안 함)

1. H1 6건 SQL↔TS 정렬 (권장: SQL에 TS early override·공백 패턴 이식 후 TS 주석 “SQL 정본” 재확인).
2. DEFECT 신호 집합 단일화.
3. 라이브에서 F19 잔여·NULL 제외·F20 건수 실측 및 사용자 확정(29/60/2) 대조.
4. 골든셋 단위 테스트 추가.
5. 배포 순서 문서화: **SQL 콘솔 적용 → 검증 쿼리 → 앱 main 배포**.
6. scratch 분석 문서에 F20 반영(선택).

---

## 10. 결론

골격(컬럼·백필·트리거 가드·CHECK·UI 파이프라인·F20 표시명·fallback)은 요구에 맞게 잘 짜여 있다.  
**차단급 이슈는 (1) SQL/TS 동형성 6건 붕괴, (2) 앱 SELECT 전 마이그레이션 필수, (3) F19 확정 수치 미실측**이다.  
동형성 정렬과 적용 후 카운트 검증을 끝낸 뒤 운영 적용을 권한다.
