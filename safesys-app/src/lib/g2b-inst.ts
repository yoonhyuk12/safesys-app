// 프로젝트 본부·지사명 → 조달청 수요기관 검색어 추정 유틸 (계약현황·자재 수불부 조달청 조회 공용)

// 복합 지사의 조달청 표기는 지사마다 달라('여주.이천지사'는 마침표, '강화옹진지사'는 붙여쓰기 —
// 2026-07-07 실호출 확인) 마지막 지명+지사만 반환한다. 조달청 조회가 부분일치라 두 표기 모두에 매칭된다.
// 도 단위 본부는 '경기지역본부' 형태.
export const guessInstName = (branch: string): string => {
  const b = branch.trim()
  if (b.endsWith('지사')) {
    const parts = b.split(/[·.]/)
    return (parts[parts.length - 1] || '').trim()
  }
  if (/^(경기|강원|충북|충남|전북|전남|경북|경남|제주)본부$/.test(b)) return b.replace('본부', '지역본부')
  if (b && b !== '본사') return b.replace(/·/g, '.')
  return ''
}
