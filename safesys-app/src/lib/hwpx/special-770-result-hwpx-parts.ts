// 특별점검(굴삭기 버킷 사고) 결과 HWPX의 셀 채우기·그림 XML·글자 스타일 복제 보조 함수
import { topLevelRanges, rebuild } from './accident-report-xml'

export function esc(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 사진 1장. width/height(px)를 모르면 4:3으로 보고 칸에 맞춘다. */
export interface Special770Picture {
  id: string
  data: Uint8Array
  ext: 'jpg' | 'png'
  width?: number
  height?: number
}

export function fitPicture(picture: Special770Picture, boxW: number, boxH: number): { w: number; h: number } {
  const width = picture.width && picture.width > 0 ? picture.width : 4
  const height = picture.height && picture.height > 0 ? picture.height : 3
  const scale = Math.min(boxW / width, boxH / height)
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

// TBM 정본(tbm-submission-hwpx-export)의 완전한 hp:pic 골격을 복사한다. 자식 순서가 어긋나면 한글이 열다 죽는다.
// 번호는 이미지 ID(imageN)에서 얻어 문서 안에서 유일하게 한다.
export function buildInlinePicXml(binItemId: string, imgW: number, imgH: number): string {
  const seq = Number(binItemId.replace('image', '')) || 1
  const id = 1149648000 + seq
  const instid = 75906000 + seq
  const w = Math.max(1, imgW)
  const h = Math.max(1, imgH)
  const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
  const pos = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
  return `<hp:pic id="${id}" zOrder="${10 + seq}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

/**
 * 문단 스타일 하나를 가운데 정렬 복제본으로 만들어 header.xml paraProperties 끝에 덧붙이고 새 id를 돌려준다.
 * 원본의 줄 간격·여백은 유지하되 오른쪽 여백은 0으로 두어 실제 가운데에 오게 한다.
 */
export function appendCenteredParaPr(header: string, sourceId: string): { header: string; id: string } {
  const count = header.match(/<hh:paraProperties itemCnt="(\d+)"/)?.[1]
  const source = header.match(new RegExp(`<hh:paraPr id="${sourceId}"[^>]*>[\\s\\S]*?</hh:paraPr>`))?.[0]
  if (!count || !source) throw new Error('특별점검 결과 양식의 문단 스타일을 찾지 못했습니다.')
  const id = count
  const clone = source.replace(`id="${sourceId}"`, `id="${id}"`)
    .replace(/<hh:align horizontal="[A-Z_]+"/, '<hh:align horizontal="CENTER"')
    .replace(/<hc:right value="\d+"/g, '<hc:right value="0"')
  return {
    id,
    header: header.replace('</hh:paraProperties>', `${clone}</hh:paraProperties>`)
      .replace(/<hh:paraProperties itemCnt="\d+"/, `<hh:paraProperties itemCnt="${Number(count) + 1}"`),
  }
}

/**
 * 양식의 칸이 회색·파랑 기울임 안내문 스타일을 물려주므로, 채워 넣는 글자는 같은 스타일의 검정·바로 선 복제본을 쓴다.
 * 복제본은 header.xml charProperties 끝에 덧붙인다(순회점검 모듈과 같은 방식).
 */
export class PlainCharPrMap {
  private readonly clones = new Map<string, string>()
  private nextId: number
  constructor(private header: string) {
    const count = header.match(/<hh:charProperties itemCnt="(\d+)"/)?.[1]
    if (!count) throw new Error('특별점검 결과 양식의 글자 스타일 목록을 찾지 못했습니다.')
    this.nextId = Number(count)
  }
  resolve(id: string): string {
    const cached = this.clones.get(id)
    if (cached) return cached
    const source = this.header.match(new RegExp(`<hh:charPr id="${id}"[^>]*>[\\s\\S]*?</hh:charPr>`))?.[0]
    if (!source || (/textColor="#000000"/i.test(source) && !source.includes('<hh:italic/>'))) return id
    const cloneId = String(this.nextId++)
    const clone = source.replace(`id="${id}"`, `id="${cloneId}"`)
      .replace(/textColor="#[0-9A-Fa-f]{6}"/, 'textColor="#000000"')
      .replace('<hh:italic/>', '')
    this.header = this.header.replace('</hh:charProperties>', `${clone}</hh:charProperties>`)
      .replace(/<hh:charProperties itemCnt="\d+"/, `<hh:charProperties itemCnt="${this.nextId}"`)
    this.clones.set(id, cloneId)
    return cloneId
  }
  get xml(): string { return this.header }
}

/**
 * 셀 본문(subList)을 통째로 다시 쓴다. 한 줄 = 한 문단이고 첫 문단 서식·첫 run 글자 스타일(검정)을 따른다.
 * 기존 setCellText처럼 run 일부만 바꾸지 않으므로 안내문 run이 섞인 칸에서도 XML이 깨지지 않는다.
 */
export function fillCell(cell: string, lines: string[], charPrs: PlainCharPrMap, picture = ''): string {
  const sub = topLevelRanges(cell, 'hp:subList')[0]
  if (!sub) throw new Error('특별점검 결과 양식의 셀 본문을 찾지 못했습니다.')
  const source = cell.slice(...sub)
  const paragraph = source.match(/<hp:p\s[^>]*>/)?.[0]
  const sourceCharPr = source.match(/<hp:run\s[^>]*charPrIDRef="([^"]+)"/)?.[1]
  if (!paragraph || !sourceCharPr) throw new Error('특별점검 결과 양식의 문단 서식을 찾지 못했습니다.')
  const charPr = charPrs.resolve(sourceCharPr)
  const rows = lines.length ? lines : ['']
  const content = rows.map((line, index) =>
    `${paragraph}<hp:run charPrIDRef="${charPr}">${index === 0 ? picture : ''}<hp:t>${esc(line)}</hp:t></hp:run></hp:p>`).join('')
  const openEnd = source.indexOf('>') + 1
  return rebuild(cell, [sub], [source.slice(0, openEnd) + content + '</hp:subList>'])
}

export type CellFill = { lines: string[]; picture?: string }

/** 표의 최상위 셀 중 "행,열" 키가 values에 있는 칸만 채운다. */
export function fillTable(table: string, values: Map<string, CellFill>, charPrs: PlainCharPrMap): string {
  const ranges = topLevelRanges(table, 'hp:tc')
  return rebuild(table, ranges, ranges.map(range => {
    const cell = table.slice(...range)
    const address = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/)
    if (!address) throw new Error('특별점검 결과 양식의 셀 주소를 찾지 못했습니다.')
    const fill = values.get(`${address[2]},${address[1]}`)
    return fill ? fillCell(cell, fill.lines, charPrs, fill.picture) : cell
  }))
}

/**
 * 머리 행(0행)을 뺀 모든 행의 선언 높이를 rowHeight로 바꾸고 표 전체 높이를 다시 맞춘다.
 * 선언 높이는 최소값이라 내용이 길면 한글이 행을 다시 키운다.
 */
export function compactRowHeights(table: string, rowHeight: number): string {
  const rows = Number(table.match(/<hp:tbl\s[^>]*rowCnt="(\d+)"/)?.[1] ?? 0)
  let headerHeight = 0
  const resized = table.replace(
    /(<hp:cellAddr colAddr="\d+" rowAddr="(\d+)"\/><hp:cellSpan colSpan="\d+" rowSpan="(\d+)"\/><hp:cellSz width="\d+" height=")(\d+)("\/>)/g,
    (_, head: string, row: string, span: string, height: string, tail: string) => {
      if (row === '0') { headerHeight = Math.max(headerHeight, Number(height)); return head + height + tail }
      return head + rowHeight * Number(span) + tail
    })
  const total = headerHeight + rowHeight * Math.max(0, rows - 1)
  return resized.replace(/(<hp:tbl\s[^>]*>\s*<hp:sz width="\d+" widthRelTo="\w+" height=")\d+"/, `$1${total}"`)
}

/** 한 행(rowSpan 1 셀들)의 선언 높이를 height로 바꾸고, 바뀐 만큼 표 전체 높이도 맞춘다. */
export function setRowHeight(table: string, row: number, height: number): string {
  let delta = 0
  const resized = table.replace(
    new RegExp(String.raw`(<hp:cellAddr colAddr="\d+" rowAddr="${row}"/><hp:cellSpan colSpan="\d+" rowSpan="1"/><hp:cellSz width="\d+" height=")(\d+)(")`, 'g'),
    (_, head: string, old: string, tail: string) => { delta = height - Number(old); return head + height + tail })
  return resized.replace(/(<hp:tbl\s[^>]*>\s*<hp:sz width="\d+" widthRelTo="\w+" height=")(\d+)"/, (_, head: string, total: string) => `${head}${Number(total) + delta}"`)
}

/** 표 여는 태그의 행·열 수. 표 id 대신 구조로 표를 찾는 데 쓴다. */
export function tableShape(table: string): string {
  const open = table.match(/<hp:tbl\s[^>]*>/)?.[0] ?? ''
  return `${open.match(/rowCnt="(\d+)"/)?.[1]}x${open.match(/colCnt="(\d+)"/)?.[1]}`
}

/**
 * 사업명에서 지구명을 뽑는다. "지구"까지, 없으면 첫 공백 앞 단어(관리자점검 HWPX extractDistrict와 같은 규칙).
 * 예: '점동지구 다목적 농촌용수 개발사업 토목공사' → '점동지구'
 */
export function districtName(projectName: string | null | undefined): string {
  const name = (projectName ?? '').trim()
  if (!name) return ''
  const m = name.match(/^(.+?지구)/)
  if (m) return m[1]
  const i = name.indexOf(' ')
  return i > 0 ? name.slice(0, i) : name
}

/** 'YYYY-MM-DD' → '’YY. MM. DD.' (양식 원문 표기). 형식이 다르면 그대로 돌려준다. */
export function formatDotDate(date: string | null | undefined): string {
  const m = (date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `’${m[1].slice(2)}. ${m[2]}. ${m[3]}.` : (date ?? '')
}

/** 'YYYY-MM-DD' → ['YYYY.', 'MM.DD.'] (좁은 표 칸은 한 줄에 다 들어가지 않아 두 문단으로 나눈다) */
export function formatNarrowDate(date: string | null | undefined): string[] {
  const m = (date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? [`${m[1]}.`, `${m[2]}.${m[3]}.`] : [date ?? '']
}

const PROVINCE_SHORT = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']

// 도 칸은 두 글자 폭이라 정식 명칭을 약칭으로 줄인다.
const PROVINCE_ALIAS: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
  세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북',
  전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주',
}

/** 현장 주소에서 도(광역, 약칭)와 시군을 뽑는다. 주소가 시군부터 시작하면 도는 빈칸이다. */
export function splitAddress(address: string | null | undefined): { province: string; city: string } {
  const tokens = (address ?? '').trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return { province: '', city: '' }
  const isProvince = /(도|특별시|광역시|특별자치시|특별자치도)$/.test(tokens[0]) || PROVINCE_SHORT.includes(tokens[0])
  const isCity = (token?: string) => !!token && /(시|군|구)$/.test(token)
  if (isProvince) return { province: PROVINCE_ALIAS[tokens[0]] ?? tokens[0], city: isCity(tokens[1]) ? tokens[1] : '' }
  return { province: '', city: isCity(tokens[0]) ? tokens[0] : '' }
}

/** projects.total_budget(백만원, 문자열·쉼표 허용) 또는 나라장터 총계약금액(원)을 백만원 단위 문자열로 */
export function budgetInMillion(project: Record<string, any>): string {
  const raw = String(project.total_budget ?? '').replace(/,/g, '').trim()
  const budget = raw ? Number(raw) : NaN
  if (Number.isFinite(budget)) return budget.toLocaleString('ko-KR')
  const g2b = Number(project.g2b_tot_amt)
  if (project.g2b_tot_amt != null && Number.isFinite(g2b)) return Math.round(g2b / 1_000_000).toLocaleString('ko-KR')
  return ''
}
