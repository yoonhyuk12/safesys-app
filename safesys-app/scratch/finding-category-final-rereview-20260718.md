# 최종 재검수 — 상태 메타 제외 Blocker 수정 후

- 검수: Grok, 읽기 전용
- 일자: 2026-07-18
- 대상: `database/20260718-1120_…sql`, `database/20260718-1200_…sql`, `safesys-app/src/lib/finding-classification.ts`

## 판정: **PASS** (코드 차단 없음)

| 검사 | 결과 |
|------|------|
| 이전 7 mismatch → 0 | **PASS** |
| 1120 vs 1200 함수 본문 동일 | **PASS** (sha256 prefix `c7b64522f2ef482f`, len 6948, IDENTICAL) |
| 지적( )사항 별도 없음 공백형 | **PASS** (양쪽 NULL) |
| 전국 10변형 | **PASS** 전부 NULL |
| bare 준비중 과잉제외 반례 | **PASS** (설비 F19 / 자재 F11 / 발전기 F13, 제외 아님) |
| 공사중지 과소제외 반례 | **PASS** 전부 NULL |
| DEFECT 반례 | **PASS** (F02/F08/F01 유지) |
| 기존 37 핵심 + 확장 골든 | **PASS** |
| F20 양성 / 단독 동시 음성 | **PASS** |
| CCTV F19 | **PASS** |
| SQL↔TS 불일치 | **0 / 73** |

## TS 수정 반영 확인

- bare `/준비중/` 제거, 주석으로 과잉제외 방지 명시
- SQL 동형: `공사\s*준비중`, `준비중으로`, `공사\s*중지`, `중지\s*기간`, `중지된\s*상태`, `작업\s*없음`
- compact: `작업없음`, `현장작업없음` (관련작업없음 제거 — 작업 없음 정규식으로 커버)
- early NULL: `해당사항\s*없음` / `해당\s*사항\s*없음` / `해당\s*없` / `지적사항\s*별도\s*없음` / `지적\s*사항\s*별도\s*없음`
- 넓은 `공사…(없|해당)` 복합 패턴 제거됨

## 1120 / 1200

`CREATE OR REPLACE FUNCTION public.classify_inspection_finding` 본문 **바이트 동일**.  
1200의 추가 가치는 **이미 적용된 DB에 대한 재백필 UPDATE** (트리거 가드 때문에 코드-only UPDATE 필요).

## 테스트 요약 (73건, fail 0)

- prev7: 공사중지·중지 기간·중지된 상태 → NULL; bare 준비중 3건 → 분류 유지
- 10변형 전부 NULL
- 지적사항/지적 사항/compact 별도 없음 → NULL
- DEFECT 4건 코드 유지
- F20 3양성 3음성
- CCTV 2건 F19
- golden 코어 + compound_over 회귀

## 남은 절차 (코드 blocker 아님)

1. Supabase 콘솔에 **최신 함수 적용**(1120 또는 1200) + **1200 재백필**이 운영 DB에 반영됐는지 확인  
2. 적용 후 SELECT로 10변형 NULL·F19=CCTV 잔여 실측  
3. 컬럼 SELECT 하는 앱 배포는 SQL 적용 **이후**

## 결론

직전 Blocker는 해소됐고 SQL/TS 동형성이 복구됐다. **최종 코드 재검수 PASS.**
