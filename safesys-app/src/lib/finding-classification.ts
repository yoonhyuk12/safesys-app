// 정기·본부불시점검 개별 지적 텍스트를 데이터 근거의 고정 코드로 분류하는 순수 모듈
// 규칙 출처: database/20260718-1120_add_inspection_finding_category_codes.sql 의 classify_inspection_finding
//           + database/20260727-1430_refine_finding_classification_plan_signal.sql (작업계획서·신호수 override)
// 우선순위: 제외 → exact data override → F01→F18→F20 → F19_OTHER (SQL과 동일)

export type FindingCode =
  | 'F01_PPE'
  | 'F02_FALL'
  | 'F03_ACCESS'
  | 'F04_SCAFFOLD'
  | 'F05_MACHINERY'
  | 'F06_LIFTING'
  | 'F07_SIGNAL'
  | 'F08_ACCESS_CTRL'
  | 'F09_SIGNAGE'
  | 'F10_HOUSEKEEP'
  | 'F11_MATERIAL'
  | 'F12_FLOOD'
  | 'F13_ELEC'
  | 'F14_TOOL'
  | 'F15_HAZMAT'
  | 'F16_DOC'
  | 'F17_WELFARE'
  | 'F18_QUALITY'
  | 'F19_OTHER'
  | 'F20_WORK_METHOD'

export interface FindingCodeDefinition {
  code: FindingCode
  name: string
}

interface FindingCodeRule extends FindingCodeDefinition {
  /** 이 코드로 판정하는 키워드 정규식. F19는 폴백이라 비어 있다. */
  patterns: RegExp[]
}

/** 공백 제거·소문자 compact 비교용 확정 제외 문구(사용자 확정 29건 계열). */
const EXCLUSION_COMPACT = new Set([
  '양호',
  '적정',
  '이상없음',
  '지적없음',
  '해당없음',
  '해당사항없음',
  '없음',
  '특이사항없음',
  '특이시항없음',
  'n/a',
  'na',
  '지적사항없음',
  '점검사항없음',
  '조치',
  '지적',
  '사례',
  '.',
  '-',
  '현장점검',
  '서류점검',
  '현장및서류점검',
  '안전점검사진',
  '서류점검사진',
  '안전서류확인',
  '현장점검사진',
  '조치사항없음',
  '점검사진',
  '현장전경',
  '현장안전점검실시',
  '현장안전관리사항점검',
  '점검표참고',
  '작업없음',
  '현장작업없음',
])

/** 결함 신호가 있으면 상태 메타 제외를 덮어쓰지 않는다(SQL defect_re 와 동일). */
const DEFECT_SIGNAL =
  /미착용|미설치|미배치|미흡|불량|누락|미확보|부적정|필요|교체|지시|위험|미사용|미준수|미비/

/**
 * SQL classify_inspection_finding 과 동일한 코드 규칙(F01→F18→F20).
 * exact override(넘어짐·울타리)는 classifyFinding 안에서 이 배열보다 먼저 적용한다.
 */
const FINDING_CODE_RULES: readonly FindingCodeRule[] = [
  {
    code: 'F01_PPE',
    name: '개인보호구',
    patterns: [
      /안전모/, /안전대/, /안전화/, /안전띠/, /안전벨트/, /보호구/, /보호복/, /턱끈/, /턱근/,
      /안전복/, /용접\s*안전/, /안전장화/, /구명조끼/, /구명환/, /구명줄/,
    ],
  },
  {
    code: 'F02_FALL',
    name: '추락·개구부 방지',
    patterns: [
      /추락/, /개구부/, /안전난간/, /난간/, /추락방지/, /안전줄/, /타이거/, /낙하방지/,
      /중간난간/, /난간\s*캡/, /안전캡/, /방호벽/, /안전\s*휀스/, /안전휀스/, /추락\s*주의/,
      /안전시설/, /안전\s*시설/,
    ],
  },
  {
    code: 'F03_ACCESS',
    name: '가설통로·계단·사다리',
    patterns: [
      /가설\s*통로/, /안전\s*계단/, /가설\s*계단/, /사다리/, /작업발판/, /이동\s*통로/, /안전\s*통로/,
      /통행로/, /진입로/, /경사로/, /계단/, /발판/, /아웃트리거/, /말비계/,
      /작업\s*통로/, /작업통로/, /이동용\s*통로/, /통로/, /통행\s*조치/,
    ],
  },
  {
    code: 'F04_SCAFFOLD',
    name: '비계·동바리',
    patterns: [/비계/, /동바리/, /시스템\s*비계/, /강관\s*비계/, /수평재/, /받침철물/],
  },
  {
    code: 'F05_MACHINERY',
    name: '건설기계·중장비',
    patterns: [
      /건설기계/, /굴삭기/, /굴착기/, /차량계/, /중장비/, /후방\s*경고/, /후방영상/,
      /후사경/, /버킷/, /스카이/, /장비/, /운전자/, /전조등/, /덤프트럭/, /하차차량/, /적재차량/, /차량/,
    ],
  },
  {
    code: 'F06_LIFTING',
    name: '인양·줄걸이',
    patterns: [
      /인양/, /슬링/, /실링\s*벨트/, /실링벨트/, /줄걸이/, /훅/, /인양벨트/, /인양밴드/, /인양로프/,
      /와이어/, /과상승/, /구름\s*방지/,
    ],
  },
  {
    code: 'F07_SIGNAL',
    name: '신호수·작업지휘',
    patterns: [/신호수/, /작업지휘/, /유도원/, /교통\s*유도/],
  },
  {
    code: 'F08_ACCESS_CTRL',
    name: '출입·접근 통제',
    patterns: [
      /출입/, /접근금지/, /접근\s*금지/, /접금\s*금지/, /접금금지/, /통제/, /민간인/, /출입금지/,
      /시건/, /휀스/, /펜스/, /통행\s*금지/, /공간\s*분리/, /라바콘/, /교통\s*안전/,
    ],
  },
  {
    code: 'F09_SIGNAGE',
    name: '안전표지·안내간판',
    patterns: [
      /안전보건\s*표지/, /안전\s*보건\s*표지/, /안전표지/, /안내\s*간판/, /공사\s*안내/, /표지판/,
      /간판/, /실명제/, /사전\s*작업\s*허가/, /허가제\s*간판/, /현수막/, /속도\s*제한\s*표지/,
      /MSDS\s*표지/, /경고등/, /표지/,
    ],
  },
  {
    code: 'F10_HOUSEKEEP',
    name: '정리정돈·폐기물',
    patterns: [
      /정리/, /폐기물/, /부산물/, /쓰레기/, /방치/, /주변정리/, /현장\s*정리/, /청소/,
      /잔여물/, /이음부/, /수목/, /도로\s*부문\s*정비/, /도로부문\s*정비/, /도로\s*정비/, /낙엽/,
    ],
  },
  {
    code: 'F11_MATERIAL',
    name: '자재 적치·보관',
    patterns: [
      /자재/, /적치/, /덮개/, /보관/, /철근/, /파이프/, /노출/, /야적/,
      /단\s*적재/, /단적재/, /쌓기/, /레미콘\s*박스/, /적재/,
    ],
  },
  {
    code: 'F12_FLOOD',
    name: '수방·우기·사면',
    patterns: [
      /수방/, /우기/, /사면/, /법면/, /배수/, /물넘이/, /성토/, /침하/, /유실/, /되메/, /터파기/,
      /굴착면/, /흙막이/, /굴착\s*구간/, /굴착구간/, /해빙/, /붕괴\s*위험/, /붕괴위험/,
    ],
  },
  {
    code: 'F13_ELEC',
    name: '전기·감전',
    patterns: [/전선/, /감전/, /콘센트/, /배전/, /전기/, /꽂음접속/, /누전/, /발전기/],
  },
  {
    code: 'F14_TOOL',
    name: '수공구·기계안전',
    patterns: [
      /그라인더/, /핸드그라인더/, /회전\s*날/, /회전\s*톱/, /회전톱/, /안전덮개/, /가공\s*기구/,
      /절단/, /안전핀/, /작업대\s*안전규칙/, /안전규칙\s*부적격/, /보안경/,
    ],
  },
  {
    code: 'F15_HAZMAT',
    name: '위험물·MSDS',
    patterns: [/위험물/, /MSDS/i, /유류/, /소화기/, /위험\s*물품/],
  },
  {
    code: 'F16_DOC',
    name: '서류·계획·평가',
    patterns: [
      /작업계획서/, /위험성\s*평가/, /위험성평가/, /윗넘성평가/, /허가/, /서류/, /일지/, /대장/,
      /규정/, /실시규정/, /산업안전/, /안전관리계획/, /시공안전계획/, /재해예방/, /VAR/i,
      /검교정/, /성적서/, /품질검사/, /수불부/, /시험/, /명단/, /조직도/, /휴게시설\s*운영/,
      /폭염\s*관리/, /법령/, /비상/, /점검표/, /안전점검\s*미실시/, /일일\s*안전점검/,
      /작업가능상태/,
    ],
  },
  {
    code: 'F17_WELFARE',
    name: '휴게·보건시설',
    patterns: [/휴게/, /생수/, /온도계/, /쉼터/, /환기/],
  },
  {
    code: 'F18_QUALITY',
    name: '품질·환경 기타',
    // 레미콘은 송장·도착·타설 완료시각 등 시간 계열만 F18. 레미콘 박스는 F11.
    patterns: [/품질/, /환경/, /비산/, /분진/, /오염/, /레미콘.{0,20}(시간|시각|송장|도착)/],
  },
  {
    code: 'F20_WORK_METHOD',
    name: '작업방법 미준수',
    // 사용자 확정: 상하+동시가 함께 있거나 명시적 작업방법 미준수만. 단독 동시 진행/동시작업은 F20 아님.
    // 작업대 안전규칙은 F14 early override.
    patterns: [
      /상하.*동시/,
      /동시.*상하/,
      /작업방법\s*미준수/,
      /작업\s*방법\s*미준수/,
    ],
  },
  {
    code: 'F19_OTHER',
    name: '기타 안전관리',
    patterns: [],
  },
]

export const FINDING_CODE_DEFINITIONS: readonly FindingCodeDefinition[] = FINDING_CODE_RULES.map(
  ({ code, name }) => ({ code, name }),
)

/** F01 보호구 키워드. 신호수 override가 보호구 결함을 가로채지 않도록 예외 판정에 쓴다. */
const PPE_PATTERNS: readonly RegExp[] =
  FINDING_CODE_RULES.find((rule) => rule.code === 'F01_PPE')?.patterns ?? []

const FINDING_CODE_NAME = new Map<FindingCode, string>(FINDING_CODE_RULES.map((rule) => [rule.code, rule.name]))
const FINDING_CODE_ORDER = new Map<FindingCode, number>(FINDING_CODE_RULES.map((rule, index) => [rule.code, index]))
const FINDING_CODE_SET = new Set<string>(FINDING_CODE_RULES.map((rule) => rule.code))

/** 코드의 표시명. 미정의 코드는 코드 문자열을 그대로 돌려준다. */
export const findingCodeName = (code: FindingCode): string => FINDING_CODE_NAME.get(code) ?? code

/** DB·외부 입력이 F01~F20 유효 코드면 정규화해 돌려주고, 아니면 null. */
export const parseStoredFindingCode = (value: unknown): FindingCode | null => {
  if (typeof value !== 'string') return null
  const code = value.trim()
  if (!code) return null
  return FINDING_CODE_SET.has(code) ? (code as FindingCode) : null
}

/** 줄바꿈·연속 공백을 하나로 접고 앞뒤 공백을 제거한다(SQL BTRIM+REGEXP_REPLACE와 동일 취지). */
const normalizeFindingText = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

const toCompact = (value: string): string => value.replace(/\s+/g, '').toLowerCase()

/** 사용자 확정 메타·상태 문구 또는 통계 제외 대상이면 true (SQL NULL과 동일). */
export const isExcludedFindingText = (text: string): boolean => {
  const normalized = normalizeFindingText(text)
  if (!normalized) return true

  const compact = toCompact(normalized)
  if (EXCLUSION_COMPACT.has(compact) || EXCLUSION_COMPACT.has(normalized)) return true

  // 없음·해당 계열 (SQL 1200 early NULL — DEFECT 무관)
  if (
    /지적\s*사항\s*없음/i.test(normalized) ||
    /특이\s*[사시]\s*항\s*없음/i.test(normalized) ||
    /해당사항\s*없음/i.test(normalized) ||
    /해당\s*사항\s*없음/i.test(normalized) ||
    /해당\s*없/i.test(normalized) ||
    /점검\s*사항\s*없음/i.test(normalized) ||
    /지적사항\s*별도\s*없음/i.test(normalized) ||
    /지적\s*사항\s*별도\s*없음/i.test(normalized)
  ) {
    return true
  }

  // 점검 사진·현장 전경·현장 안전점검 실시 계열
  if (
    /^점검\s*사진$/i.test(normalized) ||
    /^점검사진$/i.test(normalized) ||
    /^현장\s*전경$/i.test(normalized) ||
    /현장\s*안전점검\s*실시/i.test(normalized) ||
    /현장\s*안전관리사항\s*점검/i.test(normalized) ||
    /점검표\s*참고/i.test(normalized)
  ) {
    return true
  }

  // 공사 상태·준비·중지 등 메타 (SQL 1차 블록, DEFECT 없을 때만)
  if (
    (
      /미착공/i.test(normalized) ||
      /일시\s*중지/i.test(normalized) ||
      /양생\s*중/i.test(normalized) ||
      /시공\s*예정/i.test(normalized) ||
      /준비단계/i.test(normalized) ||
      /건축공사\s*완료/i.test(normalized) ||
      /기존\s*수로\s*면처리\s*작업/i.test(normalized)
    ) &&
    !DEFECT_SIGNAL.test(normalized)
  ) {
    return true
  }

  // 작업없음·공사 준비/중지 상태 메타 (SQL 1200 2차 블록, DEFECT 없을 때만)
  // bare 준비중 전역 매칭은 하지 않는다 (설비/자재 준비중 과잉제외 방지).
  if (
    (
      /작업\s*없음/i.test(normalized) ||
      /공사\s*준비중/i.test(normalized) ||
      /준비중으로/i.test(normalized) ||
      /공사\s*중지/i.test(normalized) ||
      /중지\s*기간/i.test(normalized) ||
      /중지된\s*상태/i.test(normalized)
    ) &&
    !DEFECT_SIGNAL.test(normalized)
  ) {
    return true
  }

  // "현장 점검" 단독 계열 (결함 신호 없을 때)
  if (
    /^(현장|서류|안전)\s*(점검|확인|사진)/i.test(normalized) &&
    !DEFECT_SIGNAL.test(normalized)
  ) {
    return true
  }

  // 양호·적정 (결함 신호 없을 때)
  if (/양호|적정/i.test(normalized) && !DEFECT_SIGNAL.test(normalized)) {
    return true
  }

  return false
}

/**
 * 지적 텍스트 하나를 고정 코드로 분류한다.
 * SQL classify_inspection_finding 과 동일 순서: 제외 → exact override → F01..F20 → F19.
 * 확정 제외 문구면 null(통계 미포함).
 */
export const classifyFinding = (text: string): FindingCode | null => {
  const normalized = normalizeFindingText(text)
  if (!normalized) return null
  if (isExcludedFindingText(normalized)) return null

  // exact data override — 일반 F01→F18 키워드보다 선행 (SQL 113~122행 + 확정 충돌 보정)
  // 넘어짐(통행인·돌출부위·안전시설물 연계) → F10 (F02 안전시설보다 먼저)
  if (/넘어짐/.test(normalized)) return 'F10_HOUSEKEEP'
  // 공사 구간 안전 울타리 → F08 (일반 안전시설 F02와 구분)
  if (/공사\s*구간\s*안전\s*울타리|안전\s*울타리/.test(normalized)) return 'F08_ACCESS_CTRL'
  // 회전톱·보안경·안전핀·그라인더·작업대 안전규칙 → F14 (덮개=F11보다 먼저)
  if (
    /회전\s*톱|회전톱|보안경|안전핀|그라인더|핸드그라인더|작업대\s*안전규칙|안전규칙\s*부적격/.test(
      normalized,
    )
  ) {
    return 'F14_TOOL'
  }
  // 구름 방지 장치 → F06 (장비/차량 키워드보다 먼저)
  if (/구름\s*방지/.test(normalized)) return 'F06_LIFTING'
  // 레미콘 박스 → F11 (레미콘 시간 F18보다 먼저 — 박스는 자재 취급)
  if (/레미콘\s*박스/.test(normalized)) return 'F11_MATERIAL'
  // 작업계획서 → F16 (건설기계·차량계 F05보다 먼저 — 결함의 본질이 서류 미비)
  if (/작업계획서/.test(normalized)) return 'F16_DOC'
  // 신호수·유도원·작업지휘 → F07 (장비 F05보다 먼저).
  // 단 보호구 결함이 함께 있으면 F01을 유지한다(신호수 안전모 미착용 등).
  if (/신호수|유도원|작업지휘/.test(normalized) && !PPE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'F07_SIGNAL'
  }

  for (const rule of FINDING_CODE_RULES) {
    if (rule.code === 'F19_OTHER') continue
    if (rule.patterns.some((pattern) => pattern.test(normalized))) return rule.code
  }
  return 'F19_OTHER'
}

/**
 * DB 저장 코드를 우선 사용하고, 없거나 무효면 원문 분류기로 fallback한다.
 * 제외 대상이면 null.
 */
export const resolveFindingCode = (text: string, storedCode?: unknown): FindingCode | null => {
  const fromDb = parseStoredFindingCode(storedCode)
  if (fromDb) return fromDb
  return classifyFinding(text)
}

/** 집계 입력. 분류 코드와 원천(정기/본부불시)만 있으면 된다. 관리자점검은 호출 측에서 제외한다. */
export interface FindingClassificationInput {
  code: FindingCode
  source: 'safety' | 'headquarters'
}

export interface FindingClassificationRow {
  code: FindingCode
  name: string
  count: number
  /** 전체 지적 대비 비율(%). 분모는 totalFindings */
  ratio: number
  /** 정기안전점검 기여 건수 */
  regularCount: number
  /** 본부불시점검 기여 건수 */
  headquartersCount: number
}

export interface FindingClassificationSummary {
  totalFindings: number
  regularFindings: number
  headquartersFindings: number
  /** 건수 내림차순, 동률이면 고정 코드 우선순위 오름차순 */
  rows: FindingClassificationRow[]
}

/**
 * 개별 지적을 코드별로 집계한다. 분모는 입력 총건수이며, 코드별 정기·본부 기여를 함께 담는다.
 * 동률은 고정 코드 우선순위(F01→F20, F19 포함)로 안정 정렬한다.
 */
export const aggregateFindingClassification = (
  findings: readonly FindingClassificationInput[],
): FindingClassificationSummary => {
  const counters = new Map<FindingCode, { count: number; regularCount: number; headquartersCount: number }>()
  let regularFindings = 0
  let headquartersFindings = 0

  for (const finding of findings) {
    const current = counters.get(finding.code) ?? { count: 0, regularCount: 0, headquartersCount: 0 }
    const isRegular = finding.source === 'safety'
    counters.set(finding.code, {
      count: current.count + 1,
      regularCount: current.regularCount + (isRegular ? 1 : 0),
      headquartersCount: current.headquartersCount + (isRegular ? 0 : 1),
    })
    if (isRegular) regularFindings += 1
    else headquartersFindings += 1
  }

  const totalFindings = findings.length
  const rows = Array.from(counters.entries())
    .map(([code, value]) => ({
      code,
      name: findingCodeName(code),
      count: value.count,
      ratio: totalFindings > 0 ? (value.count / totalFindings) * 100 : 0,
      regularCount: value.regularCount,
      headquartersCount: value.headquartersCount,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        (FINDING_CODE_ORDER.get(left.code) ?? Number.MAX_SAFE_INTEGER) -
          (FINDING_CODE_ORDER.get(right.code) ?? Number.MAX_SAFE_INTEGER),
    )

  return { totalFindings, regularFindings, headquartersFindings, rows }
}
