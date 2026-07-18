-- 상태 메타(작업없음·해당사항 없음·공사 준비/중지) 제외 보강: 분류 함수 갱신 + 저장코드 재백필
-- 선행 적용: database/20260718-1120_add_inspection_finding_category_codes.sql
-- 재실행 안전: CREATE OR REPLACE + 전량 재계산 UPDATE. 트리거·CHECK는 건드리지 않음.
-- Supabase 콘솔에서 수동 적용. 이 파일 작성만 수행하며 MCP/원격 DML 금지.
--
-- 전국 F19 잔류 메타 10변형 (적용 전 실측, DEFECT 없을 때 NULL 기대)
--   작업 없음
--   작업없음
--   현장 작업 없음
--   현장 작업없음. 안전관리 사항 점검 실시
--   작업없음(공사 중지된 상태)
--   현재 공사 중지 기간으로 작업없음
--   착공계 제출예정(26.3.6)으로 작업없음
--   점검 당일 작업 없음 (지적사항 별도 없음)
--   현장사무실 설치 준비 + 현장 작업 없음
--   공사 준비중으로 해당사항 없음
-- =============================================================================
CREATE OR REPLACE FUNCTION public.classify_inspection_finding(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t TEXT;
  compact TEXT;
  -- TS DEFECT_SIGNAL 과 동일. 메타 제외 3분기에서 공통 사용
  defect_re TEXT := '미착용|미설치|미배치|미흡|불량|누락|미확보|부적정|필요|교체|지시|위험|미사용|미준수|미비';
BEGIN
  -- 줄바꿈·연속 공백 정규화
  t := BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(p_text, ''), E'[\\r\\n]+', ' ', 'g'), E'[[:space:]]+', ' ', 'g'));
  IF t = '' THEN
    RETURN NULL;
  END IF;

  compact := LOWER(REGEXP_REPLACE(t, E'[[:space:]]+', '', 'g'));

  -- 확정 제외·메타·상태 문구 (NULL). 점검사진 중복 없음
  IF compact IN (
    '양호', '적정', '이상없음', '지적없음', '해당없음', '해당사항없음', '없음',
    '특이사항없음', '특이시항없음', 'n/a', 'na',
    '지적사항없음', '점검사항없음', '조치', '지적', '사례', '.', '-',
    '현장점검', '서류점검', '현장및서류점검', '안전점검사진', '서류점검사진',
    '안전서류확인', '현장점검사진', '조치사항없음',
    '점검사진', '현장전경',
    '현장안전점검실시', '현장안전관리사항점검', '점검표참고',
    '작업없음', '현장작업없음'
  ) THEN
    RETURN NULL;
  END IF;

  -- 없음·해당 계열 (해당사항 없음 포함 — 해당[[:space:]]*없 만으로는 '해당사항' 미매칭)
  IF t ~* '지적[[:space:]]*사항[[:space:]]*없음'
     OR t ~* '특이[[:space:]]*[사시][[:space:]]*항[[:space:]]*없음'
     OR t ~* '해당사항[[:space:]]*없음'
     OR t ~* '해당[[:space:]]*사항[[:space:]]*없음'
     OR t ~* '해당[[:space:]]*없'
     OR t ~* '점검[[:space:]]*사항[[:space:]]*없음'
     OR t ~* '지적[[:space:]]*사항[[:space:]]*별도[[:space:]]*없음'
  THEN
    RETURN NULL;
  END IF;

  IF t ~* '^점검[[:space:]]*사진$'
     OR t ~* '^점검사진$'
     OR t ~* '^현장[[:space:]]*전경$'
     OR t ~* '현장[[:space:]]*안전점검[[:space:]]*실시'
     OR t ~* '현장[[:space:]]*안전관리사항[[:space:]]*점검'
     OR t ~* '점검표[[:space:]]*참고'
  THEN
    RETURN NULL;
  END IF;

  -- 공사 상태·준비·중지 등 메타 서술 (DEFECT 신호 없을 때만)
  IF (
       t ~* '미착공'
    OR t ~* '일시[[:space:]]*중지'
    OR t ~* '양생[[:space:]]*중'
    OR t ~* '시공[[:space:]]*예정'
    OR t ~* '준비단계'
    OR t ~* '건축공사[[:space:]]*완료'
    OR t ~* '기존[[:space:]]*수로[[:space:]]*면처리[[:space:]]*작업'
  ) AND t !~* defect_re
  THEN
    RETURN NULL;
  END IF;

  -- 작업없음·공사 준비/중지 상태 메타 (전국 F19 잔류 10변형 커버, DEFECT 없을 때만)
  -- 변형 예: 작업 없음, 작업없음, 현장 작업 없음/작업없음, 작업없음(공사 중지된 상태),
  -- 현재 공사 중지 기간으로 작업없음, 착공계 … 작업없음, 점검 당일 작업 없음,
  -- 현장사무실 설치 준비+현장 작업 없음, 공사 준비중으로 해당사항 없음
  IF (
       t ~* '작업[[:space:]]*없음'
    OR t ~* '공사[[:space:]]*준비중'
    OR t ~* '준비중으로'
    OR t ~* '공사[[:space:]]*중지'
    OR t ~* '중지[[:space:]]*기간'
    OR t ~* '중지된[[:space:]]*상태'
  ) AND t !~* defect_re
  THEN
    RETURN NULL;
  END IF;

  -- "현장 점검" 단독 계열 (DEFECT 신호 없을 때만)
  IF t ~* '^(현장|서류|안전)[[:space:]]*(점검|확인|사진)'
     AND t !~* defect_re
  THEN
    RETURN NULL;
  END IF;

  -- 양호·적정 (DEFECT 신호 없을 때만)
  IF t ~* '양호|적정'
     AND t !~* defect_re
  THEN
    RETURN NULL;
  END IF;

  -- exact data override — 일반 F01→F18 키워드보다 선행 (TS classifyFinding 과 동일)
  -- 넘어짐(통행인·돌출부위·안전시설물 연계) → F10 (F02 안전시설보다 먼저)
  IF t ~* '넘어짐' THEN
    RETURN 'F10_HOUSEKEEP';
  END IF;

  -- 공사 구간 안전 울타리 → F08 (일반 안전시설 F02와 구분)
  IF t ~* '공사[[:space:]]*구간[[:space:]]*안전[[:space:]]*울타리|안전[[:space:]]*울타리' THEN
    RETURN 'F08_ACCESS_CTRL';
  END IF;

  -- 회전톱·보안경·안전핀·그라인더·작업대 안전규칙 → F14 (덮개=F11·장비=F05보다 먼저)
  IF t ~* '회전[[:space:]]*톱|회전톱|보안경|안전핀|그라인더|핸드그라인더|작업대[[:space:]]*안전규칙|안전규칙[[:space:]]*부적격' THEN
    RETURN 'F14_TOOL';
  END IF;

  -- 구름 방지 장치 → F06 (장비/차량 키워드보다 먼저)
  IF t ~* '구름[[:space:]]*방지' THEN
    RETURN 'F06_LIFTING';
  END IF;

  -- 레미콘 박스 → F11 (레미콘 시간 F18보다 먼저 — 박스는 자재 취급)
  IF t ~* '레미콘[[:space:]]*박스' THEN
    RETURN 'F11_MATERIAL';
  END IF;

  -- F01 개인보호구
  IF t ~* '안전모|안전대|안전화|안전띠|안전벨트|보호구|보호복|턱끈|턱근|안전복|용접[[:space:]]*안전|안전장화|구명조끼|구명환|구명줄' THEN
    RETURN 'F01_PPE';
  END IF;

  -- F02 추락·개구부 방지 (+ 일반 안전시설/공백형 안전 시설. 울타리·넘어짐은 위 override)
  IF t ~* '추락|개구부|안전난간|난간|추락방지|안전줄|타이거|낙하방지|중간난간|난간[[:space:]]*캡|안전캡|방호벽|안전[[:space:]]*휀스|안전휀스|추락[[:space:]]*주의|안전시설|안전[[:space:]]*시설' THEN
    RETURN 'F02_FALL';
  END IF;

  -- F03 가설통로·계단·사다리 (+ 공백 통로·통행 조치)
  IF t ~* '가설[[:space:]]*통로|안전[[:space:]]*계단|가설[[:space:]]*계단|사다리|작업발판|이동[[:space:]]*통로|안전[[:space:]]*통로|통행로|진입로|경사로|계단|발판|아웃트리거|말비계|작업[[:space:]]*통로|작업통로|이동용[[:space:]]*통로|통로|통행[[:space:]]*조치' THEN
    RETURN 'F03_ACCESS';
  END IF;

  -- F04 비계·동바리
  IF t ~* '비계|동바리|시스템[[:space:]]*비계|강관[[:space:]]*비계|수평재|받침철물' THEN
    RETURN 'F04_SCAFFOLD';
  END IF;

  -- F05 건설기계·중장비·차량 (구름방지·라바콘은 override/F08 쪽)
  IF t ~* '건설기계|굴삭기|굴착기|차량계|중장비|후방[[:space:]]*경고|후방영상|후사경|버킷|스카이|장비|운전자|전조등|덤프트럭|하차차량|적재차량|차량' THEN
    RETURN 'F05_MACHINERY';
  END IF;

  -- F06 인양·줄걸이 (+ 실링 벨트 공백·과상승·구름 방지 — 구름은 override에서도 처리)
  IF t ~* '인양|슬링|실링[[:space:]]*벨트|실링벨트|줄걸이|훅|인양벨트|인양밴드|인양로프|와이어|과상승|구름[[:space:]]*방지' THEN
    RETURN 'F06_LIFTING';
  END IF;

  -- F07 신호수·작업지휘
  IF t ~* '신호수|작업지휘|유도원|교통[[:space:]]*유도' THEN
    RETURN 'F07_SIGNAL';
  END IF;

  -- F08 출입·접근 통제 (+ 접금 오탈자·라바콘 교통 안전조치)
  IF t ~* '출입|접근금지|접근[[:space:]]*금지|접금[[:space:]]*금지|접금금지|통제|민간인|출입금지|시건|휀스|펜스|통행[[:space:]]*금지|공간[[:space:]]*분리|라바콘|교통[[:space:]]*안전' THEN
    RETURN 'F08_ACCESS_CTRL';
  END IF;

  -- F09 안전표지·안내간판
  IF t ~* '안전보건[[:space:]]*표지|안전[[:space:]]*보건[[:space:]]*표지|안전표지|안내[[:space:]]*간판|공사[[:space:]]*안내|표지판|간판|실명제|사전[[:space:]]*작업[[:space:]]*허가|허가제[[:space:]]*간판|현수막|속도[[:space:]]*제한[[:space:]]*표지|MSDS[[:space:]]*표지|경고등|표지' THEN
    RETURN 'F09_SIGNAGE';
  END IF;

  -- F10 정리정돈·폐기물 (+ 도로정비·이음부·수목·잔여물. 넘어짐은 상단 override)
  IF t ~* '정리|폐기물|부산물|쓰레기|방치|주변정리|현장[[:space:]]*정리|청소|잔여물|이음부|수목|도로[[:space:]]*부문[[:space:]]*정비|도로부문[[:space:]]*정비|도로[[:space:]]*정비|낙엽' THEN
    RETURN 'F10_HOUSEKEEP';
  END IF;

  -- F11 자재 적치·보관 (+ 쌓기·단적재·레미콘 박스)
  IF t ~* '자재|적치|덮개|보관|철근|파이프|노출|야적|단[[:space:]]*적재|단적재|쌓기|레미콘[[:space:]]*박스|적재' THEN
    RETURN 'F11_MATERIAL';
  END IF;

  -- F12 수방·우기·사면 (+ 굴착·해빙·붕괴)
  IF t ~* '수방|우기|사면|법면|배수|물넘이|성토|침하|유실|되메|터파기|굴착면|흙막이|굴착[[:space:]]*구간|굴착구간|해빙|붕괴[[:space:]]*위험|붕괴위험' THEN
    RETURN 'F12_FLOOD';
  END IF;

  -- F13 전기·감전
  IF t ~* '전선|감전|콘센트|배전|전기|꽂음접속|누전|발전기' THEN
    RETURN 'F13_ELEC';
  END IF;

  -- F14 수공구·기계안전 (+ 회전톱·안전핀·작업대 안전규칙·보안경)
  IF t ~* '그라인더|핸드그라인더|회전[[:space:]]*날|회전[[:space:]]*톱|회전톱|안전덮개|가공[[:space:]]*기구|절단|안전핀|작업대[[:space:]]*안전규칙|안전규칙[[:space:]]*부적격|보안경' THEN
    RETURN 'F14_TOOL';
  END IF;

  -- F15 위험물·MSDS
  IF t ~* '위험물|MSDS|유류|소화기|위험[[:space:]]*물품' THEN
    RETURN 'F15_HAZMAT';
  END IF;

  -- F16 서류·계획·평가 (+ 비상·점검표·계획서·작업가능상태)
  IF t ~* '작업계획서|위험성[[:space:]]*평가|위험성평가|윗넘성평가|허가|서류|일지|대장|규정|실시규정|산업안전|안전관리계획|시공안전계획|재해예방|VAR|검교정|성적서|품질검사|수불부|시험|명단|조직도|휴게시설[[:space:]]*운영|폭염[[:space:]]*관리|법령|비상|점검표|안전점검[[:space:]]*미실시|일일[[:space:]]*안전점검|작업가능상태' THEN
    RETURN 'F16_DOC';
  END IF;

  -- F17 휴게·보건시설 (+ 환기)
  IF t ~* '휴게|생수|온도계|쉼터|환기' THEN
    RETURN 'F17_WELFARE';
  END IF;

  -- F18 품질·환경 기타 (+ 레미콘 시간/송장. 레미콘 박스는 override/F11)
  IF t ~* '품질|환경|비산|분진|오염|레미콘.{0,20}(시간|시각|송장|도착)' THEN
    RETURN 'F18_QUALITY';
  END IF;

  -- F20 작업방법 미준수. 상하…동시 / 동시…상하 / 명시적 작업방법 미준수만
  -- 단독 '동시 진행'·'동시작업'은 분류하지 않음 (사용자 확정 상하 동시작업 한정)
  IF t ~* '상하.*동시|동시.*상하|작업방법[[:space:]]*미준수|작업[[:space:]]*방법[[:space:]]*미준수' THEN
    RETURN 'F20_WORK_METHOD';
  END IF;

  -- F19 기타 (CCTV 등 잔여)
  RETURN 'F19_OTHER';
END;
$$;

COMMENT ON FUNCTION public.classify_inspection_finding(TEXT) IS
  '점검 지적 원문을 F01_PPE~F20_WORK_METHOD로 분류한다. 빈 값·메타/상태 문구(작업없음·해당사항 없음·공사 준비/중지 등, DEFECT 없을 때)는 NULL. F20 표시명은 작업방법 미준수.';

-- -----------------------------------------------------------------------------
-- 기존 저장 코드 재백필 (트리거 가드는 원문 변경 시에만 재계산하므로 UPDATE 코드 직접 수행)
-- 정기: findings 빈 값이면 field_item fallback (원 마이그레이션과 동일)
-- -----------------------------------------------------------------------------
UPDATE public.safety_inspection_results
SET finding_category_code = public.classify_inspection_finding(
  COALESCE(NULLIF(BTRIM(findings), ''), field_item)
);

UPDATE public.headquarters_inspections
SET
  issue1_category_code = public.classify_inspection_finding(issue_content1),
  issue2_category_code = public.classify_inspection_finding(issue_content2);

-- -----------------------------------------------------------------------------
-- 적용 후 검증 쿼리 (SELECT only, 수동 실행)
-- -----------------------------------------------------------------------------
-- 1) 10변형 NULL
-- SELECT public.classify_inspection_finding('작업 없음'); -- NULL
-- SELECT public.classify_inspection_finding('작업없음'); -- NULL
-- SELECT public.classify_inspection_finding('현장 작업 없음'); -- NULL
-- SELECT public.classify_inspection_finding('현장 작업없음. 안전관리 사항 점검 실시'); -- NULL
-- SELECT public.classify_inspection_finding('작업없음(공사 중지된 상태)'); -- NULL
-- SELECT public.classify_inspection_finding('현재 공사 중지 기간으로 작업없음'); -- NULL
-- SELECT public.classify_inspection_finding('착공계 제출예정(26.3.6)으로 작업없음'); -- NULL
-- SELECT public.classify_inspection_finding('점검 당일 작업 없음 (지적사항 별도 없음)'); -- NULL
-- SELECT public.classify_inspection_finding('현장사무실 설치 준비 현장 작업 없음'); -- NULL
-- SELECT public.classify_inspection_finding('공사 준비중으로 해당사항 없음'); -- NULL
-- SELECT public.classify_inspection_finding('작업 없음 구간 난간 미설치'); -- F02_FALL (DEFECT 유지)
-- SELECT public.classify_inspection_finding('이동형cctv 설치위치를 작업구간으로 조정 필요'); -- F19_OTHER
-- SELECT public.classify_inspection_finding('Cctv 공사현장을 비추도록 설치할 것'); -- F19_OTHER
--
-- 2) 저장 F19 잔여 (CCTV만 기대; 메타 0)
-- SELECT finding_category_code, LEFT(COALESCE(NULLIF(BTRIM(findings),''), field_item), 80), COUNT(*)
-- FROM safety_inspection_results WHERE finding_category_code = 'F19_OTHER' GROUP BY 1,2;
-- SELECT issue1_category_code, LEFT(issue_content1,80), COUNT(*)
-- FROM headquarters_inspections WHERE issue1_category_code = 'F19_OTHER' GROUP BY 1,2;
--
-- 3) 경기·2026-01-01~2026-07-18 사고분석 UI 규칙 기대치: F19 = CCTV 2건
-- SELECT COUNT(*) AS gyeonggi_period_f19
-- FROM (
--   SELECT r.finding_category_code AS code
--   FROM safety_inspection_results r
--   JOIN safety_inspections s ON s.id = r.inspection_id
--   JOIN projects p ON p.id = s.project_id
--   WHERE s.inspection_date BETWEEN '2026-01-01' AND '2026-07-18'
--     AND p.managing_hq = '경기'
--     AND ((r.photo_url IS NOT NULL AND BTRIM(r.photo_url) <> '')
--       OR (r.findings IS NOT NULL AND BTRIM(r.findings) <> ''))
--     AND r.finding_category_code = 'F19_OTHER'
--   UNION ALL
--   SELECT h.issue1_category_code
--   FROM headquarters_inspections h
--   JOIN projects p ON p.id = h.project_id
--   WHERE h.inspection_date BETWEEN '2026-01-01' AND '2026-07-18'
--     AND p.managing_hq = '경기'
--     AND h.issue1_category_code = 'F19_OTHER'
-- ) x; -- 기대 2
-- =============================================================================
