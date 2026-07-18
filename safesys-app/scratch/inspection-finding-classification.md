# 정기·본부불시점검 지적사항 분류 분석

- 작성일. 2026-07-18
- 범위. **정기안전점검**(`safety_inspections` + 자식)과 **본부불시점검**(`headquarters_inspections`)만. **관리자점검은 제외**
- 방법. Supabase 읽기 전용 SQL로 실데이터 조회 → 유효 지적 텍스트 필터 → 고정 분류 코드 키워드 1순위 매칭
- 데이터 변경 없음 (SELECT only)

---

## 1. 데이터 원천·JSON 경로

| 구분 | 테이블 | 지적 텍스트 경로 | 사진 경로 | 유효 판정 (코드와 정합) |
|------|--------|------------------|-----------|------------------------|
| 정기 결과행 | `safety_inspection_results` | `findings` (+ 참고 `field_item`) | `photo_url` (조치 후 `after_photo_url`) | `photo_url` 비어 있지 않음 **또는** `isMeaningfulFindingText(findings)` |
| 정기 추가항목 | `safety_inspections.additional_items` (jsonb 배열) | `elem.action` (+ `elem.item`/`title`) | `elem.photo_url` | `action`이 무의미 키워드가 아님. 특별점검(안전혁신건설-287) 중심 |
| 본부 사진 지적 | `headquarters_inspections` | `issue_content1`, `issue_content2` | `site_photo_issue1/2` (조치 `action_photo_issue1/2`) | 사진과 함께 입력되는 **주 지적 텍스트** |
| 본부 체크리스트 | 동일 테이블 jsonb | `critical_items` / `caution_items` / `other_items` / `five_key_items` 각 원소의 `remarks`·`findings`·`issue_content` | 항목별 사진 컬럼 없음 (본문 사진과 별개) | `status/result ∈ {bad,no,false,부,미이행,불이행}` **또는** `grade ∈ {4,5}` **또는** 의미 있는 remarks |

관련 앱 로직. `safesys-app/src/lib/accident-analysis.ts`의 `isRegularFinding` / `isHeadquartersItemFinding` / `normalizeHeadquartersInspection`.  
무의미 텍스트 집합. `accident-analysis-utils.ts`의 `NO_FINDING_KEYWORDS` (양호, 이상없음, 해당없음, 특이사항없음 등).

### 조직·기간 조인 키

- 프로젝트. `project_id` → `projects.project_name`, `projects.managing_hq`, `projects.managing_branch`
- 점검일. 정기 `safety_inspections.inspection_date`, 본부 `headquarters_inspections.inspection_date`
- 사고분석 화면 필터와 동일 축. **기간(`startDate`~`endDate`) · 본부(`managing_hq`) · 지사(`managing_branch`) · 프로젝트(`project_id`)**

---

## 2. 규모·기간 (실측)

조회 시점 기준 누적.

| 지표 | 정기안전점검 | 본부불시점검 |
|------|-------------|-------------|
| 점검 건수 | 219 | 469 |
| 프로젝트 수 | 101 | 244 |
| 점검일 범위 | 2026-02-26 ~ 2026-05-13 | 2025-08-27 ~ 2026-07-16 |
| 유형 분포 | 해빙기 94 · 우기 88 · 특별점검(안전혁신건설-287) 37 | (단일 유형) |

조직 분포 (두 유형 점검을 가진 프로젝트, `managing_hq`). 경기 136 · 경북 107 · 충북 1 · 경남 1.  
실무 볼륨은 **경기 본부 관할**에 집중.

### 지적 레코드 원천별 건수

| 원천 | 원본 행 | 유효 지적(필터 후) | 사진 동반 |
|------|---------|-------------------|-----------|
| `safety_inspection_results` (텍스트/사진 있음) | 284 | **271** | 264 |
| `additional_items` 의미 action (해당없음 등 제외) | 148 | 결함 신호 있는 것만 **62** | 6 |
| `issue_content1/2` | 617 | **515** (준공·특이사항 없음·현장점검 등 메타 문구 제외) | 514 |
| jsonb status=bad / grade 4·5 | 504 | **504** (텍스트 없으면 항목 제목으로 대체) | 0 |

**권장 집계 코퍼스 (사진 지적 중심, 제품 1차 지표).**  
`safety_inspection_results` 유효 지적 + `issue_content1/2` 유효 지적 = **786건** (그중 사진 동반 **778건**, 99.0%).

확장 코퍼스 (체크리스트 부적합·추가항목 포함). 786 + 504 + 62 = **1,352건**.  
관리자점검(`manager_inspections`)은 본 분석에서 제외.

### 유효 지적 필터 규칙 (분석용, 코드 확장)

앱의 `isMeaningfulFindingText`에 더해 실데이터 노이즈를 제거했다.

- 제외. `지적사항 없음`, `특이사항 없음`, `공사 준공/미착공/준비중으로 … 없음`, `현장 점검`/`서류 점검` 단독, `.`/`조치`/`지적` 등 1~2글자 메타
- 유지. 위 문구가 있어도 `미설치|미착용|미배치|미흡|불량|누락|필요|…` 등 **결함 신호**가 분명하면 유지
- 본부 jsonb는 **status=bad 또는 grade 4/5**만 포함 (status=good 인데 remarks만 있는 확인 문구는 과집계를 유발해 제외)

---

## 3. 고정 분류 코드 체계

단일 라벨, **위에서 아래 우선 매칭**. 복합 문장(예. “안전모 미착용, 외줄걸이 인양”)은 선행 코드 1개만 부여. 운영 시 multi-label을 권장 (5절).

| 코드 | 코드명 | 정의 | 키워드·판정 규칙 (요약) |
|------|--------|------|-------------------------|
| `F01_PPE` | 개인보호구 | 안전모·안전대·안전화·안전띠·보호복 등 미착용/부적정 | 안전모, 안전대, 안전화, 안전띠/벨트, 보호구/복, 턱끈, 용접 안전 |
| `F02_FALL` | 추락·개구부 방지 | 난간·개구부·추락방지·낙하방지 등 | 추락, 개구부, 난간, 추락방지, 안전줄, 낙하방지, 중간난간, 난간/안전캡, 방호벽, 안전휀스 |
| `F03_ACCESS` | 가설통로·계단·사다리 | 이동로·계단·사다리·발판 부적정 | 가설/안전통로, 안전/가설계단, 사다리, 작업발판, 이동/통행/진입로, 경사로, 아웃트리거, 말비계 |
| `F04_SCAFFOLD` | 비계·동바리 | 비계·동바리 구조·설치 기준 | 비계, 동바리, 수평재, 받침철물 |
| `F05_MACHINERY` | 건설기계·중장비 | 장비 안전장치·방치·작업반경 | 건설기계, 굴삭/굴착기, 차량계, 후방경고/영상, 버킷, 스카이, 장비, 운전자 |
| `F06_LIFTING` | 인양·줄걸이 | 슬링·인양로프·훅·줄걸이 | 인양, 슬링/실링벨트, 줄걸이, 훅, 인양벨트/밴드/로프 |
| `F07_SIGNAL` | 신호수·작업지휘 | 신호수·작업지휘자 미배치 | 신호수, 작업지휘, 유도원 |
| `F08_ACCESS_CTRL` | 출입·접근 통제 | 출입통제·접근금지·휀스 | 출입, 접근금지, 통제, 민간인, 시건, 휀스/펜스 |
| `F09_SIGNAGE` | 안전표지·안내간판 | 안전보건표지·공사안내·실명제 간판 | 안전(보건)표지, 안내/공사 간판, 실명제, 허가제 간판, 현수막, 속도제한 표지 |
| `F10_HOUSEKEEP` | 정리정돈·폐기물 | 정리·폐기물·방치 | 정리, 폐기물, 부산물, 쓰레기, 방치 |
| `F11_MATERIAL` | 자재 적치·보관 | 자재 적치·덮개·보관 | 자재, 적치, 덮개, 보관, 철근, 야적 |
| `F12_FLOOD` | 수방·우기·사면 | 수방자재·사면·배수·우기 | 수방, 우기, 사면/법면, 배수, 성토, 침하, 유실, 되메, 터파기, 흙막이 |
| `F13_ELEC` | 전기·감전 | 전선·콘센트·배전·감전 | 전선, 감전, 콘센트, 배전, 전기, 꽂음접속, 발전기 |
| `F14_TOOL` | 수공구·기계안전 | 그라인더 등 방호장치 | 그라인더, 회전 날, 안전덮개, 가공 기구 |
| `F15_HAZMAT` | 위험물·MSDS | 위험물 보관·MSDS·소화기 | 위험물, MSDS, 유류, 소화기 |
| `F16_DOC` | 서류·계획·평가 | 계획서·위험성평가·허가·법정서류 | 작업계획서, 위험성평가, 허가, 서류/일지/대장, 검교정, 성적서, 법령, VAR 등 |
| `F17_WELFARE` | 휴게·보건시설 | 휴게실·생수·온도계 | 휴게, 생수, 온도계, 쉼터 |
| `F18_QUALITY` | 품질·환경 기타 | 품질·환경 관리 지적 | 품질, 환경, 비산, 분진 |
| `F19_OTHER` | 기타 안전관리 | 위 규칙에 안 걸린 잔여 | 폴백. 수동 검수·규칙 보강 대상 |

### 판정 의사코드

```
text = trim(finding)
if empty or non_finding(text): drop
for code in F01..F18:   # 고정 우선순위
  if any(keyword regex matches text): return code
return F19_OTHER
```

**알려진 1순위 매칭 한계 (수동 검수 시 보정).**

- “그라인더 **덮개**” → `F11_MATERIAL`(덮개)로 잡힐 수 있음 → 의도 라벨은 `F14_TOOL`
- “위험물 **보관**” → `F11` 선행 → 의도는 `F15_HAZMAT`
- “전선 **정리**” → `F10` 선행 → 의도는 `F13_ELEC`
- 공백 변형(“안전 통로”)·오탈자(“실링벨트”)는 일부 `F19`로 잔류

운영 시 키워드 우선순위 테이블을 코드 상수로 두고 샘플 골든셋으로 회귀 테스트하는 것을 권장.

---

## 4. 분류 결과 (권장 코퍼스 786건)

대상. 정기 `safety_inspection_results` 유효 271 + 본부 `issue_content` 유효 515.  
기간. 2025-08-27 ~ 2026-07-16. 관리자점검 제외.

| 순위 | 코드 | 코드명 | 건수 | 비율 |
|------|------|--------|------|------|
| 1 | `F02_FALL` | 추락·개구부 방지 | 111 | 14.1% |
| 2 | `F19_OTHER` | 기타 안전관리 | 91 | 11.6% |
| 3 | `F10_HOUSEKEEP` | 정리정돈·폐기물 | 76 | 9.7% |
| 3 | `F11_MATERIAL` | 자재 적치·보관 | 76 | 9.7% |
| 5 | `F03_ACCESS` | 가설통로·계단·사다리 | 72 | 9.2% |
| 6 | `F09_SIGNAGE` | 안전표지·안내간판 | 68 | 8.7% |
| 7 | `F16_DOC` | 서류·계획·평가 | 62 | 7.9% |
| 8 | `F08_ACCESS_CTRL` | 출입·접근 통제 | 42 | 5.3% |
| 9 | `F05_MACHINERY` | 건설기계·중장비 | 37 | 4.7% |
| 10 | `F06_LIFTING` | 인양·줄걸이 | 29 | 3.7% |
| 11 | `F01_PPE` | 개인보호구 | 28 | 3.6% |
| 12 | `F07_SIGNAL` | 신호수·작업지휘 | 25 | 3.2% |
| 12 | `F12_FLOOD` | 수방·우기·사면 | 25 | 3.2% |
| 14 | `F15_HAZMAT` | 위험물·MSDS | 12 | 1.5% |
| 15 | `F18_QUALITY` | 품질·환경 기타 | 9 | 1.1% |
| 16 | `F04_SCAFFOLD` | 비계·동바리 | 8 | 1.0% |
| 16 | `F13_ELEC` | 전기·감전 | 8 | 1.0% |
| 18 | `F17_WELFARE` | 휴게·보건시설 | 5 | 0.6% |
| 19 | `F14_TOOL` | 수공구·기계안전 | 2 | 0.3% |
| | **합계** | | **786** | **100%** |

### 정기 vs 본부 (권장 코퍼스 내부)

| 코드 | 정기 271건 | 본부 515건 | 해석 |
|------|-----------|-----------|------|
| `F10_HOUSEKEEP` | 54 (19.9%) | 22 (4.3%) | 정기(특히 우기)에서 정리·폐기물 비중이 큼 |
| `F11_MATERIAL` | 40 (14.8%) | 36 (7.0%) | 정기에서 자재 적치 지적 다수 |
| `F12_FLOOD` | 20 (7.4%) | 5 (1.0%) | 우기·사면은 정기 특화 |
| `F16_DOC` | 36 (13.3%) | 26 (5.0%) | 정기에서 서류·평가 지적 상대적 다수 |
| `F02_FALL` | 24 (8.9%) | 87 (16.9%) | 본부 불시가 추락·난간을 더 자주 적발 |
| `F03_ACCESS` | 8 (3.0%) | 64 (12.4%) | 본부에서 통로·계단·사다리 집중 |
| `F09_SIGNAGE` | 14 (5.2%) | 54 (10.5%) | 본부에서 표지·간판 집중 |
| `F01_PPE` | 3 (1.1%) | 25 (4.9%) | 본부에서 보호구 미착용 적발 비중 큼 |

### 확장 코퍼스 참고 (1,352건)

본부 jsonb 부적합 504건을 합치면 `F16_DOC`(11.0%), `F03_ACCESS`(10.7%), `F09_SIGNAGE`(9.5%) 비중이 올라간다.  
체크리스트 항목 제목(작업계획서·가설통로 등)이 텍스트 없이도 bad로 잡히기 때문. **사진 지적 트렌드와 체크리스트 부적합 트렌드는 지표를 분리**하는 것이 맞다.

---

## 5. 대표 익명 예시 (프로젝트명·인명 미포함)

지사명만 참고용. 원문 일부 축약.

| 코드 | 예시 1 | 예시 2 |
|------|--------|--------|
| `F01_PPE` | 안전모 미착용 | 작업시 안전벨트 미착용 |
| `F02_FALL` | 안전난간 간격 미흡 | 추락 구간 안전 조치 미흡 |
| `F03_ACCESS` | 굴착부 진입 계단 미설치 | 안전통로 미확보 |
| `F04_SCAFFOLD` | 이동식 비계 표준 설치 미준수 | 시스템비계 수평재 누락부분 보강 |
| `F05_MACHINERY` | 미사용 스카이 방치 | 후방 경고등 미설치 |
| `F06_LIFTING` | 끊어진 슬링벨트 사용으로 교체지시 | 외줄걸이로 자재인양 |
| `F07_SIGNAL` | 신호수 미배치 | 작업지휘자 미배치 |
| `F08_ACCESS_CTRL` | 공사장 출입금지 및 교통안전 표기 미흡 | 관계자 외 출입 차단 미흡 |
| `F09_SIGNAGE` | 공사 안내 간판 추가 설치 필요 | 안전 실명제 미설치 |
| `F10_HOUSEKEEP` | 현장 정리 미흡 | 폐기물 관리 및 반출 미흡 |
| `F11_MATERIAL` | 자재 적치 시 천막 등 보호덮개 설치 필요 | 적치 자재 보관상태 미흡 |
| `F12_FLOOD` | 성토사면 불안정 | 수방자재 미구비 |
| `F13_ELEC` | 우천 대비 전기선로 감전 방지 조치 필요 | 콘센트 불량(피복 벗겨짐) |
| `F14_TOOL` | 그라인더 덮개 미설치 (의도 라벨, 규칙상 F11 혼동 가능) | 회전 날 덮개 미부착 |
| `F15_HAZMAT` | 위험물 관리자 정부 표시 미흡 | MSDS물질안전보건자료 미게시 |
| `F16_DOC` | 폭염 관리 대장 미작성(2시간 단위) | 건설기계 작업계획서 작성 미흡 |
| `F17_WELFARE` | 작업장내 온도계 미비치 | 근로자 휴게시설 없음 |
| `F18_QUALITY` | 시험실 검교정 현황판 현행화 | 품질검사대장 작성 미흡 |
| `F19_OTHER` | 과상승방지 폴 미사용 | 비상연락망 미비치 · CCTV 각도 조정 등 |

---

## 6. 사고분석 화면 연동 집계 설계

현재 사고분석(`AccidentAnalysisView` + `getAccidentAnalysisData`)은

- 필터. `startDate` / `endDate` / `selectedHq` / `selectedBranch` / `selectedProjectId`
- 점검을 `NormalizedSafetyInspection`으로 정규화하되 **finding_count 숫자만** 사용하고 지적 텍스트 분류는 없음
- 관리자점검을 포함 (`source_type: manager | safety | headquarters`)

### 6.1 제안. 지적 분류 집계 파이프라인

```
filters (기간·본부·지사·프로젝트)
    → project_id set  (기존 organizationProjects 로직 재사용)
    → 점검 원천 로드
         A. safety_inspections + safety_inspection_results
            [+ optional additional_items]
         B. headquarters_inspections (issue_content + optional jsonb bad)
         ※ manager_inspections 제외 (본 요구) 또는 토글로 분리
    → 행 단위 FindingRecord 전개
    → non_finding 필터 + classify(text) → finding_code
    → 집계
```

### 6.2 FindingRecord (정규화 행)

| 필드 | 설명 |
|------|------|
| `finding_id` | 안정 키. 예. `sir:{result_id}`, `hqiss:{inspection_id}:1`, `hqjson:{inspection_id}:{bucket}:{idx}` |
| `source_type` | `safety` \| `headquarters` |
| `inspection_id` | 부모 점검 id |
| `project_id` | 필터·조인 |
| `inspected_at` | `inspection_date` |
| `finding_text` | 익명화 전 원문 (화면 상세/툴팁, 권한 있는 사용자만) |
| `finding_code` | `F01_PPE` … `F19_OTHER` |
| `has_photo` | boolean |
| `field_item` / `bucket` | 점검 항목명 (선택) |
| `unresolved` | 정기. `after_photo_url` 공백. 본부. status≠completed & action_photo 없음 |

### 6.3 필터 매핑

| 화면 필터 | SQL/로직 |
|-----------|----------|
| 기간 | `inspection_date BETWEEN startDate AND endDate` (기존 점검 조회와 동일. 사고 조회는 종료일 exclusive 패턴 유지) |
| 본부 | `projects.managing_hq = selectedHq` |
| 지사 | `projects.managing_branch = selectedBranch` |
| 프로젝트 | `project_id = selectedProjectId` |
| (신규) 점검유형 | `safety` / `headquarters` / `both` |
| (신규) 사진 동반만 | `has_photo = true` — 기본 ON 권장 |
| (신규) 분류 코드 | multi-select on `finding_code` |

### 6.4 집계 API 응답 스케치

```ts
type FindingClassificationAgg = {
  totalFindings: number
  photoFindings: number
  byCode: Array<{
    code: string
    name: string
    count: number
    ratio: number
    regularCount: number
    headquartersCount: number
    unresolvedCount: number
  }>
  byMonth: Array<{ month: string; code: string; count: number }>
  topProjects: Array<{ projectId: string; projectName: string; count: number; topCode: string }>
}
```

기존 `calculateAccidentAnalysis` KPI 옆에 **「지적 유형 분포」** 카드/막대·월별 스택을 붙이면, 사고 건수·점검 건수와 같은 필터 컨텍스트를 공유한다.

### 6.5 구현 옵션

| 옵션 | 내용 | 장점 | 단점 |
|------|------|------|------|
| A. 클라이언트 분류 | 기존 fetch에 findings 텍스트를 더 실어 오고 프론트/유틸에서 classify | 마이그레이션 없음, 빠른 실험 | 대량 시 페이로드·CPU |
| B. 뷰/RPC | `v_inspection_findings` SQL 뷰 또는 RPC가 전개+필터 | 필터 서버 측, 권한 RLS 일관 | 분류 로직 SQL 유지보수 |
| C. 저장 컬럼 | 저장 시 `finding_code` 기록 | 조회 빠름 | 과거 데이터 백필·규칙 변경 비용 |

**1단계 권장.** A 또는 B로 읽기 전용 집계 → 규칙 안정화 후 C 백필.  
분류 함수는 `accident-analysis-utils.ts` 옆에 `finding-classification.ts`로 공유해 사고분석·본부 현황·정기 현황이 동일 코드를 쓰게 한다.

### 6.6 중복·노이즈 주의

1. 본부 `issue_content`와 jsonb bad remarks가 **같은 지적을 이중 서술**할 수 있음 → 기본 지표는 issue_content(+사진)만, jsonb는 “체크리스트 부적합” 별도 시리즈
2. 정기 `additional_items`의 “양호/설치함” 확인 문구는 결함 신호가 없으면 제외
3. `F19_OTHER` 비율 >10%이면 키워드 보강 스프린트 트리거
4. 개인정보. 집계·공개 예시에는 프로젝트명·인명·서명·사진 URL을 넣지 않음 (본 문서 준수)

### 6.7 사고와의 연결 (후속)

정규화된 `FindingRecord`를 사고 `accident_at` 전 30/90일과 `project_id`로 조인하면  
“사고 전 구간에 어떤 지적 코드가 많았는지”를 기존 prior30/prior90 카운트 옆에 코드 분포로 확장할 수 있다.  
샘플 수 부족 시(`AccidentAnalysisSampleSize.isInsufficient`) 코드 분포도 동일 경고를 공유한다.

---

## 7. 요약 인사이트

1. **사진과 함께 쌓인 실질 지적**은 약 **780건** 규모이며, 본부 불시(2025-08~)가 기간·건수 모두 더 넓다. 정기(2026-02~05, 해빙기·우기·특별)는 정리·자재·수방·서류 비중이 높다.
2. 공통 Top 테마는 **추락·난간(`F02`) · 통로·계단(`F03`) · 표지·간판(`F09`) · 정리·자재(`F10`/`F11`)** 이다. 본부 단독으로는 보호구·인양·신호수도 두드러진다.
3. 사고분석 연동은 **기존 기간·본부·지사·프로젝트 필터 + project_id 스코프**를 그대로 쓰고, 관리자점검을 뺀 FindingRecord 전개·고정 코드 집계를 붙이면 된다. 체크리스트 bad와 사진 지적은 지표를 분리한다.

---

## 8. 산출물·재현

| 파일 | 용도 |
|------|------|
| `safesys-app/scratch/inspection-finding-classification.md` | 본 보고서 |
| `safesys-app/scratch/inspection-finding-classification-data.json` | 코드별 건수·예시 머신 가독 덤프 |
| `safesys-app/scratch/_classify_findings.py` | 재분류 스크립트 (로컬 MCP 덤프 의존, 분석용) |

재조회 SQL 핵심은 Supabase MCP `execute_sql`로 수행했으며 DB DML/DDL은 사용하지 않았다.

---

## 9. 남은 일 (구현 시)

- [ ] `finding-classification.ts` 골든 샘플 20~50건 고정 테스트
- [ ] 키워드 우선순위 보정 (그라인더 덮개→F14, 위험물 보관→F15, 전선 정리→F13, 공백 통로→F03)
- [ ] 사고분석 UI. 코드별 막대 + 월별 스택 + 소스(정기/본부) 토글
- [ ] (선택) multi-label 또는 1차/2차 코드
- [ ] (선택) 관리자점검 위험요인 텍스트를 별 코드 체계로 확장
