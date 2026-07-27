// 프로젝트명에서 위험요인 DB의 사업별(16종)을 유추하는 순수 함수 — projects.project_category는 부서 축이라 쓸 수 없다

// 표기 요동(띄어쓰기·중점·괄호)을 없애고 소문자로 맞춘다
const normalize = (name: string): string => name.replace(/[\s·ㆍ・.,()[\]{}-]/g, '').toLowerCase()

// 위에서부터 먼저 걸리는 규칙을 쓴다 — 포괄 키워드(수리시설·배수개선)는 뒤에 둔다
const RULES: Array<{ businessType: string; keywords: string[] }> = [
  { businessType: '새만금지구 국가산업단지 개발사업', keywords: ['새만금'] },
  { businessType: '제주 농업용수 통합광역화사업', keywords: ['통합광역화'] },
  // 어촌뉴딜300 후속이 어촌신활력증진사업이라 같은 사업별로 묶는다
  { businessType: '어촌뉴딜300사업', keywords: ['어촌뉴딜', '어촌신활력'] },
  { businessType: '지역특화임대형 스마트팜사업', keywords: ['스마트팜'] },
  { businessType: '방조제개보수사업', keywords: ['방조제'] },
  { businessType: '대단위 농업개발사업', keywords: ['대단위농업개발'] },
  { businessType: '농업기반시설 치수능력확대사업', keywords: ['치수능력'] },
  { businessType: '대구획 경지정리사업', keywords: ['경지정리'] },
  { businessType: '농촌용수 이용체계재편사업', keywords: ['농촌용수이용체계', '용수이용체계', '이용체계재편', '농촌용수체계'] },
  { businessType: '다목적 농촌용수개발사업', keywords: ['농촌용수개발', '다목적농촌'] },
  { businessType: '배수개선사업', keywords: ['배수개선'] },
  // 계측·유지관리 용역이 섞이지 않도록 "수리시설"만으로는 매칭하지 않는다
  { businessType: '수리시설 개보수사업', keywords: ['수리시설개보수', '수리시설정비'] },
  { businessType: '취약지역생활 여건개조사업', keywords: ['취약지역'] },
  // 일반농산어촌 개발사업의 세부 유형 별칭들
  {
    businessType: '일반농산어촌 개발사업',
    keywords: ['일반농산어촌', '농산어촌개발', '농촌중심지', '기초생활거점', '기초거점', '마을만들기', '권역단위거점'],
  },
  { businessType: '농업용수 수질개선사업', keywords: ['수질개선'] },
  { businessType: '신재생에너지 개발사업', keywords: ['신재생에너지', '태양광', 're100'] },
]

/** 프로젝트명에서 사업별을 유추한다. 16종 밖이거나 근거가 없으면 null */
export function inferBusinessType(projectName: string): string | null {
  const target = normalize(projectName || '')
  if (!target) return null

  const matched = RULES.find((rule) => rule.keywords.some((keyword) => target.includes(keyword)))
  return matched ? matched.businessType : null
}
