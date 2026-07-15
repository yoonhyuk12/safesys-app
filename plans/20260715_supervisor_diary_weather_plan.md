# 공사감독일지 기상정보 개선 — AWS 우선·ASOS 보완 설계

## 1. 배경과 문제

공사감독일지의 '금일 날씨'는 현재 전국 78개 하드코딩 ASOS 관측소 중 최근접 지점의 일자료로 채워진다. ASOS는 전국 약 100지점뿐이라 현장에서 관측소까지 수십 km 떨어지는 경우가 흔하고, 국지성 강우·산간 기온이 현장 체감과 어긋난다. 또한 어느 관측소의 자료를 썼는지(관측망 종류·거리)가 결과물에 남지 않아 감사 시 확인이 불가능하다.

이 계획은 **기상정보의 대표성(거리)** 과 **출처 추적성(관측소명·관측망·직선거리)** 을 개선하되, 기존 감독일지 엑셀 양식과 생성 흐름은 그대로 유지하는 설계다.

## 2. 현재 코드 흐름 (추적 결과)

| 단계 | 파일 · 위치 | 내용 |
|------|------------|------|
| ① 좌표 확보 | `src/components/project/SupervisorDiaryGenerator.tsx:593-607` | 기간 내 TBM 제출 중 첫 좌표 사용, 없으면 `projectLatitude/Longitude`(프로젝트 등록 좌표) 폴백, 그래도 없으면 undefined |
| ② 날씨 조회 | `src/lib/excel/supervisor-diary-export.ts:119-162` | `/api/weather/asos-range?lat&lon&start&end` 단일 호출, 실패 시 "날씨 정보 없이 계속 진행" |
| ③ 관측소 선택 | `src/app/api/weather/asos-range/route.ts:187-210` | 하드코딩 `ASOS_STATIONS`(78지점)에서 하버사인 최근접 1지점 (거리값은 버림) |
| ④ KMA 호출 | 같은 파일 `:299-312` | `kma_sfcdd3.php`(ASOS 일자료 기간조회)를 31일 단위 분할 호출, 고정 컬럼 인덱스 파싱(TA_AVG=10, TA_MAX=11, TA_MIN=13, CA_TOT=31, RN_DAY=38) |
| ⑤ 요약 생성 | 같은 파일 `:329-344` | 운량→sky(≤2 맑음/≤7 구름많음/>7 흐림), `"${sky}\n(${온도}℃, ${강수}mm)"` |
| ⑥ 엑셀 기입 | `supervisor-diary-export.ts:443` (`createSupervisorDiarySheet`) | '금일 날씨' 셀(B열)에 summary 문자열 기입, 진행 UI subStatus에 `(기상정보 : ○○관측소)` 표기 |

같은 엔진을 `/tbm`의 AI공감일지(`TBMStatus.tsx`)도 사용하므로, `supervisor-diary-export.ts` 내부 개선은 두 진입점 모두에 적용된다.

**주의.** `/api/weather/asos-range`는 작업일보 2곳(`src/lib/work-daily-report/generate-from-tbm.ts:153`, `src/components/project/WorkDailyReportForm.tsx:265`)에서도 사용한다. 이 라우트를 직접 수정하면 영향 범위가 감독일지를 벗어나므로 **수정하지 않는다**.

## 3. ASOS vs AWS 비교 (2026-07-15 API허브 실측 검증)

저장소의 허브 키(`lib/kma-auth.ts`의 `getKmaHubKey()`)로 직접 호출해 확인한 결과다.

| 항목 | ASOS (종관기상관측) | AWS (방재기상관측) |
|------|--------------------|--------------------|
| 지점 수 | 약 100 (코드엔 78개 하드코딩) | 통합 지점목록 `stn_inf.php?inf=AWS` 기준 **745지점** (ASOS 포함 전 지상관측망) |
| 현장~관측소 거리 | 평균 수십 km 수준 | 지점 밀도 약 7배 → 통상 수 km 이내 |
| 일자료(일통계) API | `kma_sfcdd3.php` 기간조회 제공 (TA_AVG/MAX/MIN, CA_TOT, RN_DAY) | **없음** — AWS 지점번호를 `kma_sfcdd3.php`에 넣으면 헤더만 반환(데이터 0행). `awsdd.php`·`nph-aws2_day`·`nph-aws2_hr` 등 후보는 전부 404 |
| 분자료 API | `nph-aws2_min`이 ASOS 지점(예: 108 서울)도 반환함을 확인 | `nph-aws2_min` 기간조회(tm1~tm2) 지원. TA(1분 평균기온), RN-DAY(일 누적강수), RE, HM, 바람, 기압 제공 |
| 운량(CA) | 제공 (sky 판정의 원천) | **미제공** — 분자료에 운량 없음 |
| 과거 자료 보존 | 수십 년 (기간 제약 없음) | 실측 결과 6·12·18개월 전 조회 가능, **24개월 전은 빈 응답** → 보존 약 18~24개월 |
| 응답 형식·크기 | 일자료 텍스트, 1개월 수 KB | 분단위 고정(`itv` 파라미터 무시됨 확인), 1지점 1일 ≈ 189KB. 복수 지점 `stn=42:43`은 첫 지점만 반환 |
| 결측 표기 | `-99` 등 | 헤더 명시 규칙 — **-50 이하는 결측** (실측에서 HM `-99.2` 확인) |
| 인코딩 | 데이터부 ASCII | 지점목록(`stn_inf.php`)은 **EUC-KR** — UTF-8로 읽으면 지점명 깨짐 |

## 4. 결정: AWS 우선(기온·강수) + ASOS 보완(운량·폴백)

**채택 조합.**

- **기온(일 평균·최고·최저)·일강수량 → 통합 지점목록 최근접 1지점의 분자료(`nph-aws2_min`)로 산출.** 최근접 지점이 ASOS여도 같은 분자료 API로 조회 가능하므로 로직이 단일화된다. 지점 밀도 7배로 거리가 대폭 짧아져 국지성 강우·기온의 현장 대표성이 개선된다.
- **sky(운량) → 기존대로 최근접 ASOS 지점의 `kma_sfcdd3.php` CA_TOT 유지.** AWS엔 운량이 없다. 운량은 광역적 성격이 강해 ASOS 거리로도 충분하다.
- **AWS 결측·보존기간 초과·호출 실패 시 해당 일자만 ASOS 일자료 값으로 폴백.** ASOS 일자료는 어차피 sky용으로 항상 함께 조회하므로 폴백 비용이 0이다.

**기각한 대안.**

- *AWS 단독*: 운량 부재로 sky 판정 불가, 과거 18~24개월 초과 기간 조회 불가 → 단독 불가.
- *기존 ASOS 유지 + 강수만 AWS*: 기온도 산간·해안 현장에서 수 ℃ 차이가 나며, 어차피 분자료 1콜에 TA·RN-DAY가 함께 오므로 강수만 취할 이유가 없다.
- *asos-range 라우트 직접 개조*: 작업일보 2곳이 공유 → 회귀 위험. 신규 라우트로 격리한다(기존 `hourly-feels-like` 라우트도 같은 이유로 복사-격리한 선례가 있다).

## 5. 상세 설계

### 5.1 신규 API 라우트 — `src/app/api/weather/site-daily/route.ts`

감독일지 전용. `asos-range`는 한 줄도 수정하지 않는다.

```
GET /api/weather/site-daily?lat=37.39&lon=127.23&start=20260601&end=20260630
```

**응답 타입.**

```typescript
type StationMeta = {
  network: 'AWS' | 'ASOS'
  stnId: string
  stnName: string
  distanceKm: number   // 현장 좌표와의 하버사인 직선거리, 소수 1자리
}

type SiteDailyWeather = {
  date: string                       // YYYYMMDD
  sky: '맑음' | '구름많음' | '흐림' | '자료부족'
  tempAvgC: number | null
  tempMaxC: number | null
  tempMinC: number | null
  rainSumMm: number | null
  cloudAvg: number | null
  source: 'AWS' | 'ASOS' | null      // 이 날짜의 기온·강수 출처 (null=자료부족)
  summary: string                    // 기존과 동일한 "맑음\n(25℃, 0mm)" 형식 유지
}

type SiteDailyResponse = {
  tempStation: StationMeta | null    // 기온·강수 주 관측소 (분자료 지점)
  cloudStation: StationMeta          // 운량(sky)·폴백 관측소 (ASOS)
  stnName: string                    // 하위 호환 표시용 — tempStation?.stnName ?? cloudStation.stnName
  data: SiteDailyWeather[]
}
```

**처리 순서.**

1. **지점목록 로드.** `stn_inf.php?inf=AWS&help=0` 호출 → `res.arrayBuffer()` + `new TextDecoder('euc-kr')`로 디코딩(함정: UTF-8로 읽으면 지점명 깨짐) → `{stnId, name, lat, lon}` 배열 파싱. 글로벌 Map 캐시 TTL 7일. **호출 실패 시 기존 하드코딩 `ASOS_STATIONS` 목록으로 폴백**(이때 tempStation은 ASOS가 됨).
2. **최근접 지점 2개 산정.** (a) 통합목록 최근접 1지점 = tempStation, (b) 하드코딩 ASOS 목록 최근접 1지점 = cloudStation. 각각 하버사인 거리를 소수 1자리로 보존. tempStation의 network 판별은 stnId가 하드코딩 ASOS 목록에 있으면 'ASOS', 아니면 'AWS'.
3. **ASOS 일자료 조회.** 기존 `asos-range`의 `splitDateRange`(31일 분할)·`parseDailyData`(고정 컬럼)·`fetchText`(5s 타임아웃, 2회 재시도) 로직을 복사해 cloudStation으로 조회. sky와 폴백용 TA/RN 값의 원천.
4. **AWS 분자료 일자별 조회.** 날짜마다 `nph-aws2_min?tm1=YYYYMMDD0000&tm2=YYYYMMDD2359&stn={tempStation.stnId}&disp=0&help=0` 1콜(≈189KB). 동시 3개 병렬 배치(KMA 부하·타임아웃 고려), 각 콜 타임아웃 8s·재시도 1회. 일자별 산출 규칙은 5.2.
5. **병합.** 날짜별로 AWS 산출값이 유효하면 `source='AWS'`, 아니면 ASOS 일자료 값으로 채우고 `source='ASOS'`, 둘 다 없으면 `source=null`·"자료부족". sky는 항상 ASOS CA_TOT 기반(기존 `skyFromCloud` 동일). summary 문자열 형식은 기존과 완전 동일하게 생성한다(엑셀 셀 출력 불변 보장).
6. **캐시.** 글로벌 Map 2종. (a) 지점목록 7일, (b) 일별 결과 `stnId_YYYYMMDD` 키 — 지난 날짜는 TTL 7일, 당일은 TTL 1시간(미완결 데이터). 기존 라우트들의 `declare global` 패턴을 따르되 **캐시 변수명은 신규로**(`siteDailyStationCache` 등) — 기존 라우트의 글로벌과 충돌 금지.
7. **오류 처리.** ASOS 일자료 조회 실패 + AWS도 실패 → 500 `{ error }`. 어느 한쪽만 실패하면 성공한 쪽으로 응답(부분 성공 허용). 서버 로그에 실패 단계·지점·기간을 남긴다.

**런타임 설정.** 60일 요청 시 AWS 분자료 약 60콜 × 189KB. 배치 3 병렬 기준 예상 10~20s → 라우트에 `export const maxDuration = 60` 선언(Vercel 함수 시간 확보). 클라이언트가 31일 초과 기간을 요청해도 동작하되, 5.3의 클라이언트 분할 호출로 평상시 실행 시간을 짧게 유지한다.

### 5.2 AWS 분자료 → 일값 산출 규칙

- 결측 판정은 **-50 이하 → null** (분자료 헤더 명시 규칙. 기존 `parseNumber`의 `> -90` 기준을 쓰면 -50~-90 구간 오염 — 신규 함수로 분리).
- `tempAvgC` = 유효 TA 샘플 평균, `tempMaxC`/`tempMinC` = 유효 샘플 최대/최소. **유효 샘플이 720개(하루의 50%) 미만이면 그 날 기온 전체를 무효 처리**하고 ASOS 폴백(부분 결측일의 왜곡 방지).
- `rainSumMm` = RN-DAY 컬럼의 **그날 마지막 유효값**(23시대 우선). RN-DAY는 일 누적값이므로 합산하지 않는다. 유효값이 없으면 ASOS RN_DAY 폴백.
- 응답이 빈 데이터(보존기간 초과·미래 날짜)면 그 날은 조용히 ASOS 폴백 — 오류가 아니다.

### 5.3 클라이언트 수정 — `src/lib/excel/supervisor-diary-export.ts`

수정 범위는 날씨 조회 블록(119-162행)과 시트 생성 시 메모 추가에 한정한다.

1. **호출 교체 + 기간 분할.** `/api/weather/site-daily`를 31일 단위로 분할 호출(라우트 실행 시간 단축, 실패 격리). 각 청크 응답의 `data`를 기존 `weatherMap`(date→summary)에 동일하게 적재 — 시트 기입 코드(443행)는 무변경.
2. **2차 폴백.** `site-daily`가 어떤 이유로든 실패(!ok/throw)하면 **기존 `/api/weather/asos-range` 호출 코드를 그대로 실행**한다. 신규 라우트 장애가 감독일지 생성을 막지 않는 최후 안전망이며, 이 폴백 경로가 곧 기존 동작이다.
3. **관측소 표기(진행 UI).** `weatherStationName`을 메타 기반 문자열로 확장한다.
   - AWS·ASOS 지점이 다를 때 — `(기상정보 : ○○ AWS 3.2km · 운량 ○○관측소 18.4km)`
   - 같거나 ASOS 단독일 때 — `(기상정보 : ○○관측소 ASOS 18.4km)`
4. **관측소 표기(엑셀 산출물).** '금일 날씨' 셀(B열)에 exceljs 셀 메모(`cell.note`)로 `기온·강수: ○○(AWS, 3.2km) / 운량: ○○(ASOS, 18.4km) / 자료: 기상청 API허브` + 일자별 `source`가 ASOS 폴백이면 그 사실을 기록한다. 셀 메모는 인쇄·양식에 나타나지 않으므로 **기존 일지 외형이 1픽셀도 변하지 않으면서** 파일 자체에 출처가 남는다. `createSupervisorDiarySheet`에 선택 파라미터(`weatherNote?: string`) 하나를 끝에 추가(내부 함수라 외부 시그니처 영향 없음).

### 5.4 변경하지 않는 것 (비범위)

- `/api/weather/asos-range`, `/api/weather/historical`, `hourly-feels-like` 라우트 — 무수정.
- `SupervisorDiaryGenerator.tsx`·`TBMStatus.tsx`의 좌표 확보·모달 흐름 — 무수정 (좌표 누락 시 "날씨 없이 진행"하는 기존 동작 유지).
- 감독일지 엑셀 양식(열 구성·병합·인쇄영역·summary 문자열 형식) — 무수정.
- 공용 헬퍼 추출 리팩터링(하버사인·fetchText 등) — 하지 않는다. `hourly-feels-like` 선례대로 신규 라우트에 복사한다.
- DB 마이그레이션 — 없음.

### 5.5 신규/수정 파일 요약

| 파일 | 구분 | 내용 |
|------|------|------|
| `src/app/api/weather/site-daily/route.ts` | 신규 (~300줄) | 통합 지점목록·AWS 분자료·ASOS 일자료 병합 라우트. 첫 줄 한국어 헤더 주석 필수 |
| `src/lib/excel/supervisor-diary-export.ts` | 수정 | 날씨 조회 블록 교체(분할 호출+2차 폴백), 관측소 메타 문자열, 날씨 셀 메모 |

## 6. 인수조건 (Acceptance Criteria)

1. 좌표가 있는 프로젝트에서 최근 1개월 감독일지를 생성하면 '금일 날씨'가 기존과 동일한 형식(`맑음\n(25℃, 0mm)`)으로 채워진다.
2. 생성 진행 UI에 사용 관측소명·관측망 종류(AWS/ASOS)·직선거리(km, 소수 1자리)가 표시된다.
3. 산출 엑셀의 '금일 날씨' 셀 메모에서 기온·강수 관측소와 운량 관측소, 각 거리와 관측망을 확인할 수 있고, 인쇄 미리보기 외형은 개선 전과 동일하다.
4. `site-daily` 응답에서 tempStation의 거리가 cloudStation(ASOS) 거리 이하다(최근접 통합 지점이므로 항상 성립).
5. 2년 이전 기간을 요청하면 전 일자가 `source='ASOS'`로 채워지고 값이 기존 `asos-range` 결과와 일치한다.
6. AWS 분자료 호출을 강제로 실패시켜도(예: 엔드포인트 차단) 일지 생성이 완주하고 해당 일자는 ASOS 값이 들어간다. `site-daily` 라우트 전체가 500이어도 `asos-range` 2차 폴백으로 기존과 동일하게 완주한다.
7. 좌표가 없는 프로젝트는 기존처럼 날씨 없이 일지가 생성된다(오류·중단 없음).
8. `asos-range` 라우트의 git diff가 0이고, 작업일보 기상 조회 2곳이 기존과 동일하게 동작한다.
9. `/tbm` AI공감일지(TBMStatus 경유)에서도 1~3이 동일하게 성립한다.
10. `npm run lint`·`npx tsc --noEmit` 통과. (`npm run build`는 사용자 동의 후에만)

## 7. 테스트 항목

**라우트 단위 (curl, 실 키 사용).**

- 최근 1개월: `data` 전 일자 존재, `source='AWS'` 다수, tempStation.network='AWS', 거리 합리성(예: 판교 좌표 → 수 km 지점).
- 18개월 전 1주: AWS 유지 여부와 폴백 혼재 확인. 24개월 전 1주: 전 일자 `source='ASOS'`.
- 당일 포함 기간: 당일 강수 누적이 조회 시점 기준으로 반영되고 캐시 TTL 1시간 적용.
- 파라미터 오류(lat 누락, start>end): 400과 명확한 메시지.
- 동일 기간 2회 호출: 2회차가 캐시로 즉시 응답(서버 로그로 KMA 재호출 없음 확인).
- 60일 기간: maxDuration 내 완료.

**결측·폴백 단위.**

- -50 이하 값 결측 처리(-99.2 HM 실측 사례 재현), 유효 샘플 720 미만 일자의 기온 무효화, RN-DAY 마지막 유효값 선택.
- 지점목록(stn_inf) 호출 실패 시 하드코딩 ASOS 폴백 + 지점명 EUC-KR 정상 디코딩 확인(깨진 문자열 미출현).

**E2E 수동 시나리오.**

- 좌표 보유 프로젝트: 감독일지 생성 → 진행 UI 관측소 표기 → 엑셀 열어 날씨 셀 값·메모·인쇄 미리보기 확인.
- 좌표 없는 프로젝트, AI작성/DB만 입력 두 모드 각각 생성 완주 확인.
- 작업일보 폼·작업일보 자동생성의 날씨 표시 회귀 확인(무변경 기대).

## 8. 리스크와 대응

| 리스크 | 대응 |
|--------|------|
| KMA 분자료 응답 지연·부하 제한 | 배치 3 병렬 + 타임아웃 8s + 재시도 1회, 일자별 실패는 ASOS 폴백으로 국지화 |
| 장기간 요청으로 함수 타임아웃 | 클라이언트 31일 분할 호출 + `maxDuration=60` 이중 방어 |
| stn_inf 응답 포맷·인코딩 변동 | 파싱 실패 시 하드코딩 ASOS 목록 폴백(즉 기존 동작) |
| AWS 보존기간 경계의 불확실성(18~24개월) | 빈 응답을 오류가 아닌 정상 폴백 경로로 설계 |
| 신규 라우트 자체 장애 | 클라이언트 2차 폴백이 기존 asos-range 경로 그대로 |

## 9. 구현 착수 체크리스트 (2단계 Worker용)

- [ ] `site-daily/route.ts` 작성 — 지점목록 로더(EUC-KR)·최근접 2지점·ASOS 일자료·AWS 분자료 일별 산출·병합·캐시·오류 처리
- [ ] curl 시나리오(7절 라우트 단위) 전체 통과
- [ ] `supervisor-diary-export.ts` 수정 — 분할 호출, 2차 폴백, 관측소 문자열, 셀 메모
- [ ] 좌표 유/무 프로젝트 E2E, `/tbm` 경유 E2E
- [ ] lint·tsc 통과 후 의미 단위 커밋 2개(라우트 신설 / 엑셀 연동)로 분리
