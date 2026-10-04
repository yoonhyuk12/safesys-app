// 붙임2 점검표 양식을 굴착기마다 채워 붙임3 결과 문서 앞에 붙이도록 header 스타일을 합치고 본문 문단을 재매핑하는 보조 모듈
import { topLevelRanges, rebuild } from './accident-report-xml'
import { esc, tableShape, type PlainCharPrMap } from './special-770-result-hwpx-parts'
import {
  SPECIAL_770_CHECKLIST,
  SPECIAL_770_ETC_CODE,
  type Special770Excavator,
  type Special770Judgement,
} from '@/lib/special-inspection-770/types'

type IdMap = Map<string, string>

const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'] as const
/** 글자 모양 없음을 뜻하는 예약값(번호 문단 머리) */
const NO_REF = '4294967295'

// ── header.xml 목록 다루기 ──

function itemsOf(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<hh:${tag}\\s[^>]*?(?:/>|>[\\s\\S]*?</hh:${tag}>)`, 'g')) ?? []
}

function idOf(item: string): string {
  const id = item.match(/\bid="(\d+)"/)?.[1]
  if (id === undefined) throw new Error('붙임2 양식 header 항목에 id가 없습니다.')
  return id
}

/** 목록(<hh:listTag itemCnt>) 끝에 항목들을 덧붙이고 itemCnt를 늘린다. */
function appendToList(header: string, listTag: string, items: string[]): string {
  if (!items.length) return header
  const open = header.match(new RegExp(`<hh:${listTag} itemCnt="(\\d+)"`))
  if (!open) throw new Error(`붙임3 양식 header에 ${listTag} 목록이 없습니다.`)
  const count = Number(open[1]) + items.length
  return header
    .replace(`</hh:${listTag}>`, `${items.join('')}</hh:${listTag}>`)
    .replace(open[0], `<hh:${listTag} itemCnt="${count}"`)
}

function nextId(header: string, itemTag: string): number {
  return Math.max(-1, ...itemsOf(header, itemTag).map(item => Number(idOf(item)))) + 1
}

function mapAttr(xml: string, attr: string, map: IdMap): string {
  return xml.replace(new RegExp(`\\b${attr}="(\\d+)"`, 'g'), (whole, id: string) => {
    if (id === NO_REF) return whole
    const mapped = map.get(id)
    if (mapped === undefined) throw new Error(`붙임2 양식의 ${attr}=${id}를 옮기지 못했습니다.`)
    return `${attr}="${mapped}"`
  })
}

function setId(item: string, id: string): string {
  return item.replace(/\bid="\d+"/, `id="${id}"`)
}

/** 항목들을 새 id로 덧붙이고 옛 id → 새 id 표를 돌려준다. */
function appendMapped(header: string, listTag: string, itemTag: string, items: string[], transform: (item: string) => string = item => item) {
  const map: IdMap = new Map()
  let id = nextId(header, itemTag)
  const moved = items.map(item => {
    const newId = String(id++)
    map.set(idOf(item), newId)
    return { item, newId }
  })
  const out = moved.map(({ item, newId }) => setId(transform(item), newId))
  return { header: appendToList(header, listTag, out), map }
}

interface HeaderMaps {
  borderFill: IdMap
  charPr: IdMap
  paraPr: IdMap
  style: IdMap
  numbering: IdMap
}

// 같은 언어·같은 이름·같은 종류의 글꼴은 기존 글꼴을 다시 쓰고, 없는 것만 덧붙인다.
function mergeFonts(base: string, add: string): { header: string; maps: Record<string, IdMap> } {
  let header = base
  const maps: Record<string, IdMap> = {}
  for (const lang of LANGS) {
    const pattern = new RegExp(`<hh:fontface lang="${lang}" fontCnt="(\\d+)">([\\s\\S]*?)</hh:fontface>`)
    const baseFace = header.match(pattern)
    const addFace = add.match(pattern)
    const map: IdMap = new Map()
    maps[lang.toLowerCase()] = map
    if (!baseFace || !addFace) throw new Error(`${lang} 글꼴 목록을 찾지 못했습니다.`)
    const baseFonts = itemsOf(baseFace[2], 'font')
    const key = (font: string) => `${font.match(/\bface="([^"]*)"/)?.[1]}|${font.match(/\btype="([^"]*)"/)?.[1]}`
    let count = Number(baseFace[1])
    const appended: string[] = []
    for (const font of itemsOf(addFace[2], 'font')) {
      const same = baseFonts.find(existing => key(existing) === key(font))
      if (same) { map.set(idOf(font), idOf(same)); continue }
      const newId = String(count++)
      map.set(idOf(font), newId)
      appended.push(setId(font, newId))
    }
    header = header.replace(baseFace[0], `<hh:fontface lang="${lang}" fontCnt="${count}">${baseFace[2]}${appended.join('')}</hh:fontface>`)
  }
  return { header, maps }
}

/**
 * 붙임2 header의 글꼴·테두리·글자·탭·번호·문단 모양과 본문에 쓰인 스타일을 붙임3 header 끝에 덧붙인다.
 * 붙임3의 기존 id는 그대로 두므로 붙임3 본문은 손대지 않아도 된다.
 */
function mergeHeader(base: string, add: string, usedStyles: Set<string>): { header: string; maps: HeaderMaps } {
  const fonts = mergeFonts(base, add)
  let header = fonts.header
  const borderFill = appendMapped(header, 'borderFills', 'borderFill', itemsOf(add, 'borderFill'))
  header = borderFill.header
  const charPr = appendMapped(header, 'charProperties', 'charPr', itemsOf(add, 'charPr'), item =>
    mapAttr(item, 'borderFillIDRef', borderFill.map).replace(/<hh:fontRef\s[^>]*\/>/, ref =>
      ref.replace(/\b(hangul|latin|hanja|japanese|other|symbol|user)="(\d+)"/g, (whole, lang: string, id: string) => {
        const mapped = fonts.maps[lang].get(id)
        if (mapped === undefined) throw new Error(`붙임2 양식 글꼴 ${lang}=${id}를 옮기지 못했습니다.`)
        return `${lang}="${mapped}"`
      })))
  header = charPr.header
  const tabPr = appendMapped(header, 'tabProperties', 'tabPr', itemsOf(add, 'tabPr'))
  header = tabPr.header
  const numbering = appendMapped(header, 'numberings', 'numbering', itemsOf(add, 'numbering'), item => mapAttr(item, 'charPrIDRef', charPr.map))
  header = numbering.header
  if (itemsOf(add, 'bullet').length) throw new Error('붙임2 양식의 글머리표는 아직 옮기지 못합니다.')
  const paraPr = appendMapped(header, 'paraProperties', 'paraPr', itemsOf(add, 'paraPr'), item =>
    mapAttr(mapAttr(item, 'tabPrIDRef', tabPr.map), 'borderFillIDRef', borderFill.map)
      .replace(/<hh:heading type="NUMBER" idRef="(\d+)"/, (whole, id: string) => {
        const mapped = numbering.map.get(id)
        if (!mapped) throw new Error(`붙임2 양식 문단 번호 ${id}를 옮기지 못했습니다.`)
        return `<hh:heading type="NUMBER" idRef="${mapped}"`
      }))
  header = paraPr.header
  // 스타일은 본문에 쓰인 것만 옮긴다. 0(바탕글)은 붙임3 바탕글을 그대로 쓴다. 이름이 겹치지 않게 꼬리표를 붙인다.
  const styleItems = itemsOf(add, 'style').filter(item => idOf(item) !== '0' && usedStyles.has(idOf(item)))
  const styleIds = new Set(styleItems.map(idOf))
  const style = appendMapped(header, 'styles', 'style', styleItems, item => item
    .replace(/\bname="([^"]*)"/, (whole, name: string) => `name="${name}(붙임2)"`))
  const styleMap: IdMap = new Map([['0', '0'], ...style.map])
  header = style.header.replace(/<hh:style\s[^>]*\/>/g, item => {
    const newId = idOf(item)
    const oldId = [...style.map].find(([, v]) => v === newId)?.[0]
    if (!oldId || !styleIds.has(oldId)) return item
    const next = item.match(/\bnextStyleIDRef="(\d+)"/)?.[1] ?? '0'
    return item
      .replace(/\bparaPrIDRef="(\d+)"/, (w, id: string) => `paraPrIDRef="${paraPr.map.get(id)}"`)
      .replace(/\bcharPrIDRef="(\d+)"/, (w, id: string) => `charPrIDRef="${charPr.map.get(id)}"`)
      .replace(/\bnextStyleIDRef="\d+"/, `nextStyleIDRef="${styleMap.get(next) ?? '0'}"`)
  })
  return { header, maps: { borderFill: borderFill.map, charPr: charPr.map, paraPr: paraPr.map, style: styleMap, numbering: numbering.map } }
}

// ── 본문 ──

/** 붙임2 section의 최상위 문단들(첫 문단의 쪽 설정 secPr·단 설정 run은 버린다) */
function bodyParagraphs(section: string): string {
  const paragraphs = topLevelRanges(section, 'hp:p')
  if (!paragraphs.length) throw new Error('붙임2 양식 본문 문단을 찾지 못했습니다.')
  const body = section.slice(paragraphs[0][0], paragraphs[paragraphs.length - 1][1])
  const secPrRun = /<hp:run charPrIDRef="\d+"><hp:secPr\b[\s\S]*?<\/hp:secPr>(?:<hp:ctrl>[\s\S]*?<\/hp:ctrl>)*<\/hp:run>/
  if (!secPrRun.test(body)) throw new Error('붙임2 양식의 쪽 설정 문단을 찾지 못했습니다.')
  return body.replace(secPrRun, '')
}

function remapBody(body: string, maps: HeaderMaps): string {
  return mapAttr(mapAttr(mapAttr(mapAttr(body, 'paraPrIDRef', maps.paraPr), 'charPrIDRef', maps.charPr), 'borderFillIDRef', maps.borderFill), 'styleIDRef', maps.style)
}

/** 굴착기 2대째부터는 번호 문단(1. 2.)이 이어 세지 않도록 번호 모양·문단 모양을 복제해 따로 센다. */
function restartNumbering(header: string, body: string, numberingMap: IdMap): { header: string; body: string } {
  let out = header
  let next = body
  const numberingIds = new Set(numberingMap.values())
  const usedParaPrs = new Set(Array.from(body.matchAll(/\bparaPrIDRef="(\d+)"/g), m => m[1]))
  const clonedNumbering = new Map<string, string>()
  for (const paraPrId of usedParaPrs) {
    const paraPr = itemsOf(out, 'paraPr').find(item => idOf(item) === paraPrId)
    const numberingId = paraPr?.match(/<hh:heading type="NUMBER" idRef="(\d+)"/)?.[1]
    if (!paraPr || !numberingId || !numberingIds.has(numberingId)) continue
    if (!clonedNumbering.has(numberingId)) {
      const source = itemsOf(out, 'numbering').find(item => idOf(item) === numberingId)!
      const newNumberingId = String(nextId(out, 'numbering'))
      out = appendToList(out, 'numberings', [setId(source, newNumberingId)])
      clonedNumbering.set(numberingId, newNumberingId)
    }
    const newParaPrId = String(nextId(out, 'paraPr'))
    const clone = setId(paraPr, newParaPrId).replace(/(<hh:heading type="NUMBER" idRef=")\d+"/, `$1${clonedNumbering.get(numberingId)}"`)
    out = appendToList(out, 'paraProperties', [clone])
    next = next.replace(new RegExp(`\\bparaPrIDRef="${paraPrId}"`, 'g'), `paraPrIDRef="${newParaPrId}"`)
  }
  return { header: out, body: next }
}

/**
 * 쪽 설정이 붙임3 것(위·아래 여백+머리말 7200)으로 바뀌면 원본(7086)보다 본문 높이가 228 줄어,
 * 원래도 여유가 거의 없던 점검 항목 표가 통째로 다음 쪽으로 밀린다. 최상위 문단(머리띠·현장명·차량번호·표 문단)의
 * 문단 위 간격만 절반으로 줄여 한 쪽에 맞춘다. 이 문단 모양들은 붙임2에서 옮겨 온 것이라 붙임3에는 영향이 없다.
 */
function tightenTopLevelSpacing(header: string, body: string): string {
  const ids = new Set(topLevelRanges(body, 'hp:p').map(range => body.slice(...range).match(/^<hp:p\s[^>]*?paraPrIDRef="(\d+)"/)?.[1]))
  return header.replace(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g, (item, id: string) =>
    ids.has(id) ? item.replace(/<hc:prev value="(\d+)"/g, (w, value: string) => `<hc:prev value="${Math.round(Number(value) / 2)}"`) : item)
}

export interface ChecklistBlocks {
  header: string
  /** 굴착기 순서대로 채우기 전 본문(재매핑 완료) */
  bodies: string[]
}

/** 붙임2 header를 붙임3 header에 합치고 굴착기 대수만큼 본문 사본을 만든다. */
export function prepareChecklistBlocks(baseHeader: string, checklistHeader: string, checklistSection: string, count: number): ChecklistBlocks {
  if (count <= 0) return { header: baseHeader, bodies: [] }
  const raw = bodyParagraphs(checklistSection)
  const usedStyles = new Set(Array.from(raw.matchAll(/\bstyleIDRef="(\d+)"/g), m => m[1]))
  const merged = mergeHeader(baseHeader, checklistHeader, usedStyles)
  const body = remapBody(raw, merged.maps)
  let header = tightenTopLevelSpacing(merged.header, body)
  const bodies = [body]
  for (let k = 1; k < count; k++) {
    const restarted = restartNumbering(header, body, merged.maps.numbering)
    header = restarted.header
    bodies.push(restarted.body)
  }
  return { header, bodies }
}

const JUDGEMENT_COLUMN: Record<Special770Judgement, number> = { 적정: 2, 부적정: 3, 해당없음: 4 }
/** 점검표 행(1~16) → 항목 코드. 15항목은 SPECIAL_770_CHECKLIST 순서, 16행은 기타 */
const ROW_CODES = [...SPECIAL_770_CHECKLIST.map(item => item.code), SPECIAL_770_ETC_CODE]

function replaceRequired(xml: string, pattern: RegExp | string, next: string, label: string): string {
  const found = typeof pattern === 'string' ? xml.includes(pattern) : pattern.test(xml)
  if (!found) throw new Error(`붙임2 양식에서 ${label} 문구를 찾지 못했습니다.`)
  return xml.replace(pattern, next)
}

/**
 * 굴착기 한 대의 점검표를 채운다. 판정 칸의 □를 ■로 바꾸고, 기타 행 회색 안내문은 현장 기재 내용(검정)으로 바꾸거나 지운다.
 * index가 1 이상이면 새 쪽에서 시작하고 표 id를 고유하게 바꾼다.
 */
export function fillChecklistBody(body: string, excavator: Special770Excavator, projectName: string, charPrs: PlainCharPrMap, index: number): string {
  let out = body
  out = replaceRequired(out, '<hp:t>현장명:</hp:t>', `<hp:t>현장명: ${esc(projectName)}</hp:t>`, '현장명')
  out = replaceRequired(out, '<hp:t>건설기계 등록번호(차량번호):</hp:t>', `<hp:t>건설기계 등록번호(차량번호): ${esc(excavator.vehicle_no ?? '')}</hp:t>`, '차량번호')
  const etc = (excavator.etc_text ?? '').replace(/\s*\n\s*/g, ' ').trim()
  out = replaceRequired(out, /<hp:run charPrIDRef="(\d+)"><hp:t>\(현장 의견에 따라[^<]*<\/hp:t><\/hp:run>/,
    etc ? `<hp:run charPrIDRef="$1"><hp:t>${esc(etc)}</hp:t></hp:run>` : '', '기타 안내문')
  if (etc) {
    // 안내문 글자 스타일(회색)을 검정·바로 선 복제본으로 바꾼다.
    out = out.replace(new RegExp(`<hp:run charPrIDRef="(\\d+)"><hp:t>${escapeRegExp(esc(etc))}</hp:t>`), (whole, id: string) =>
      whole.replace(`charPrIDRef="${id}"`, `charPrIDRef="${charPrs.resolve(id)}"`))
  }

  const tables = topLevelRanges(out, 'hp:tbl')
  const tableIndex = tables.findIndex(range => tableShape(out.slice(...range)) === '17x5')
  if (tableIndex < 0) throw new Error('붙임2 양식의 점검 항목 표를 찾지 못했습니다.')
  const table = out.slice(...tables[tableIndex])
  const cells = topLevelRanges(table, 'hp:tc')
  const filled = rebuild(table, cells, cells.map(range => {
    const cell = table.slice(...range)
    const address = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/)
    if (!address) return cell
    const [col, row] = [Number(address[1]), Number(address[2])]
    const code = ROW_CODES[row - 1]
    if (!code || col < 2) return cell
    const judgement = excavator.items?.[code]?.judgement
    return judgement && JUDGEMENT_COLUMN[judgement] === col ? cell.replace('<hp:t>□</hp:t>', '<hp:t>■</hp:t>') : cell
  }))
  out = rebuild(out, [tables[tableIndex]], [filled])

  // 표 id는 문서 안에서 유일해야 한다(붙임3 표 id와도 겹치지 않는 대역).
  let tableNo = 0
  out = out.replace(/(<hp:tbl\s[^>]*?\bid=")\d+"/g, (whole, head: string) => `${head}${2117000000 + index * 10 + tableNo++}"`)
  if (index > 0) out = out.replace(/(<hp:p\s[^>]*?)pageBreak="0"/, '$1pageBreak="1"')
  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 붙임3 section 앞에 붙임2 본문들을 넣는다. 붙임3 첫 문단의 쪽 설정 run을 문서 첫 문단(붙임2 첫 장)으로 옮기고,
 * 붙임3은 새 쪽에서 시작한다.
 */
export function prependChecklists(section: string, bodies: string[]): string {
  if (!bodies.length) return section
  const paragraphs = topLevelRanges(section, 'hp:p')
  const first = section.slice(...paragraphs[0])
  const secPrRun = first.match(/<hp:run charPrIDRef="\d+"><hp:secPr\b[\s\S]*?<\/hp:secPr>(?:<hp:ctrl>[\s\S]*?<\/hp:ctrl>)*<\/hp:run>/)
  if (!secPrRun) throw new Error('붙임3 양식의 쪽 설정 문단을 찾지 못했습니다.')
  const resultFirst = first.replace(secPrRun[0], '').replace(/^(<hp:p\s[^>]*?)pageBreak="0"/, '$1pageBreak="1"')
  const lead = bodies[0].replace(/^(<hp:p\s[^>]*>)/, `$1${secPrRun[0]}`)
  return rebuild(section, [paragraphs[0]], [[lead, ...bodies.slice(1)].join('') + resultFirst])
}
