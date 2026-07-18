# 최종 재검수 — finding category F01~F20 (선행 보정 후)

- 검수: Grok, 읽기 전용
- 일자: 2026-07-18
- 대상: `database/20260718-1120_add_inspection_finding_category_codes.sql`, `safesys-app/src/lib/finding-classification.ts` (+ accident-analysis 저장코드 우선 집계)

## 판정 요약

| 항목 | 결과 |
|------|------|
| 기존 H1 6문장 패리티 | **PASS** (SQL=TS=기대값) |
| 사용자 골든 문장 | **PASS** |
| 제외 메타 | **PASS** (compact + 정규식 + DEFECT 가드) |
| F20 상하…동시 양성 / 단독 동시진행 음성 | **PASS** |
| 긴 DEFECT 3분기 동형 | **PASS** |
| exact override 순서 동형 | **PASS** (넘어짐→울타리→F14→구름방지→레미콘박스) |
| 백필·트리거·CHECK | **보존 확인** |
| accident-analysis 저장코드 우선 | **보존 확인** |
| tsc | 종료 코드 0 (에러 없음으로 판단) |
| lint | 기존 전역 Warning만. finding 분류 관련 신규 error 없음 |
| 운영 적용 전 코드 차단 | **없음** (배포 순서·실측만 절차 차단) |

## 패리티 결과 (37/37)

### 기존 H1 6문장

| 문장 | 기대 | SQL | TS |
|------|------|-----|-----|
| 그라인더 덮개 미설치 | F14_TOOL | ✓ | ✓ |
| 장비 구름 방지 장치 미흡 | F06_LIFTING | ✓ | ✓ |
| 보안경 미착용 | F14_TOOL | ✓ | ✓ |
| 작업가능상태 확인 미흡 | F16_DOC | ✓ | ✓ |
| 작업 방법 미준수 | F20_WORK_METHOD | ✓ | ✓ |
| 안전 시설 미흡 | F02_FALL | ✓ | ✓ |

### 사용자 골든

점검사진→NULL, 이동형cctv/CCTV→F19, 상하작업 동시진행→F20, 안전시설물→F02, 울타리→F08, 구름 방지→F06, 라바콘→F08, 작업대 안전규칙→F14, 넘어짐 2건→F10 전부 일치.

### F20

- 양성: `상하작업 동시진행`, `상하 동시 작업`, `동시 상하작업`, `작업방법 미준수`, `작업 방법 미준수` → F20
- 음성: `동시 진행으로 인한 간섭 주의`, `동시작업`, `동시 진행` → F19 (단독 동시 키워드 제거 반영)

### DEFECT

SQL `defect_re` 변수와 TS `DEFECT_SIGNAL` 문자열 동일:  
`미착용|미설치|미배치|미흡|불량|누락|미확보|부적정|필요|교체|지시|위험|미사용|미준수|미비`  
세 분기(공사상태 메타 / 현장·서류·안전 접두 / 양호·적정) 모두 이 집합 사용.

## 인프라 보존

1. **백필**: findings→field_item `COALESCE(NULLIF(BTRIM(findings),''), field_item)` · HQ issue1/2 독립
2. **트리거**: INSERT 항상 · UPDATE는 findings/field_item 또는 issue_content1/2 `IS DISTINCT FROM` 시에만
3. **CHECK**: F01~F20 + NULL, 세 컬럼 동일 집합
4. **앱**: `resolveFindingCode(stored 우선)` · `aggregateFindingClassification` · 관리자점검 제외 · SELECT에 category 컬럼 포함

## tsc / lint

- `npx tsc --noEmit`: 프로세스 exit 0
- `npm run lint`: 다수 기존 unused-vars / img / hooks Warning. **finding-classification / accident-analysis 관련 error 없음**

## 운영 적용 전 남은 사항 (절차, 코드 차단 아님)

1. **배포 순서 (필수).** Supabase 콘솔에서 SQL 수동 적용 → 골든 SELECT 검증 → 그다음 앱 main 배포. SELECT는 재계산하지 않으며 컬럼 없으면 사고분석 조회 실패.
2. **실측 (수용 기준).** F19 잔여·NULL 제외·F20 건수를 라이브에서 확인하고 사용자 확정(NULL 29 / 재분류 60 / CCTV F19 2) 대조. 정적 패리티만으로는 91건 수치 미증명.
3. **알려진 1순위 한계 (문서화, 비차단).** `위험물 보관`→F11, `전선 정리`→F10 등 복합 문장 한계는 의도적 단일 라벨 우선순위 특성.
4. **코퍼스 진입 vs 분류 제외 (LOW).** `isMeaningfulFindingText`는 좁고 `isExcludedFindingText`는 넓어 finding_count와 분류 분모가 어긋날 수 있음. 분류 순위 자체는 제외 규칙을 따름.
5. **단위 테스트 부재 (LOW).** 골든셋 자동화 권장.

## 결론

선행 보정으로 **H1 동형성 문제는 해소**됐다. 코드 관점 Go.  
운영 적용 차단은 **SQL 선적용 + 적용 후 분포 실측** 두 절차뿐이다.
