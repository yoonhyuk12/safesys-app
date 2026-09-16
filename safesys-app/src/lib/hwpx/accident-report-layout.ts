// 사고보고의 역할별 글꼴·내어쓰기를 유지하며 본문 1쪽과 사진대지 1쪽으로 맞춘다.
import { indexOfTag, topLevelRanges, rebuild, stripLineseg, type Range } from './accident-report-xml'

// ── 본문 1쪽 적합 계산 ──

const BODY_CELL_MARGIN = 850
const OUTER_TABLE_WIDTH = 47630
const BODY_INNER_WIDTH = OUTER_TABLE_WIDTH - BODY_CELL_MARGIN * 2
const CELL_PAD = 282
// 제목과 보고자 머리 행의 높이를 제외하여 본문 한 쪽 예산을 구한다.
// 본문 한 줄이 테두리 밖으로 넘었던 한글 실측을 반영해 조판 여유를 둔다.
const SAFETY_BUFFER_FIRST = 3000
const BODY_CELL_HEIGHT_MAX = 65451

// 양식 header.xml의 글자 크기·문단 모양을 상수로 고정한다(양식을 읽어 계산하지 않는다).
const CHAR_HEIGHT: Record<number, number> = {
    0: 1000, 10: 1300, 11: 500, 12: 2000, 14: 1200, 15: 1300, 16: 1200, 17: 1400, 18: 1600, 19: 1600, 20: 1100, 21: 1100, 22: 1100,
    23: 1600, 24: 1400, 25: 1400, 26: 1400, 27: 1300, 28: 1300, 30: 1000, 32: 1100,
    33: 1100, 34: 1100, 35: 1100, 36: 1100, 37: 1400, 38: 1300,
}
const DEFAULT_CHAR_HEIGHT = 1400
const PARA_PREV: Record<number, number> = { 40: 500, 41: 700 }
const PARA_SPACING: Record<number, number> = { 22: 1.7, 23: 1.1, 24: 1.6, 25: 1.4, 26: 1.4, 27: 1.5, 28: 0.6, 29: 1.2, 30: 1.2, 32: 1.6, 33: 2, 34: 1.6, 35: 1, 36: 1.6, 37: 1.6, 38: 1.2 }

// 첫 줄은 left, 이어지는 줄은 left + hanging에서 시작한다(한글의 내어쓰기).
// 헤더 생성과 폭/쪽 분할 계산이 같은 정의를 사용한다. 홀수 ID는 첫 문단, 다음 ID는 이어쓰기다.
const BODY_FORMATS = [
    ['summary', '○ ', 490, 1400, 1.3],
    ['bullet', '○ ', 1470, 1400, 1.3],
    ['detail', '○ 작업내용 : ', 1470, 1400, 1.3],
    ['plan', '○ 향후 추진계획 : ', 1470, 1400, 1.3],
    ['victim', '', 3360, 1400, 1.3],
    ['reason', '- 미신고 사유 : ', 2940, 1400, 1.3],
    ['compensation', '- 산재보험처리 등 보상관련 : ', 2940, 1400, 1.3],
    ['district', '○ 지구 : ', 1470, 1400, 1.3],
    ['date', '○ 일시 : ', 1470, 1400, 1.3],
    ['location', '○ 장소 : ', 1470, 1400, 1.3],
    ['contacts', '▸ ', 385, 1100, 1.2],
    ['notes', ' 언론보도 등 기타 특이사항 : ', 0, 1400, 1.3],
    ['checks', '', 1960, 1400, 1.3],
] as const
export type BodyFormat = typeof BODY_FORMATS[number][0]
const FORMATS = BODY_FORMATS.flatMap(([name, prefix, left, height, spacing], index) => {
    const hanging = [...prefix].reduce((sum, ch) => sum + charWidthOf(ch, height), name === 'notes' ? 1907 : 0)
    const id = 45 + index * 2
    return [{ name, id, left, hanging, spacing }, { name, id: id + 1, left: left + hanging, hanging: 0, spacing }]
})

export function bodyParaPr(name: BodyFormat, continuation = false): number {
    return FORMATS.find(format => format.name === name)!.id + Number(continuation)
}

/** 원본 글꼴·문단 정의를 보존하고 출력 본문용 문단 모양만 뒤에 추가한다. */
export function appendBodyParagraphStyles(header: string): string {
    const source = /<hh:paraPr id="21"[\s\S]*?<\/hh:paraPr>/.exec(header)?.[0]
    if (!source) throw new Error('사고발생보고 양식의 본문 문단 모양이 없습니다.')
    const added = FORMATS.map(format => {
        let branch = 0
        return source.replace('id="21"', `id="${format.id}"`)
            .replace('horizontal="JUSTIFY"', 'horizontal="LEFT"')
            .replace('breakLatinWord="KEEP_WORD"', 'breakLatinWord="BREAK_WORD"')
            .replace('breakNonLatinWord="KEEP_WORD"', 'breakNonLatinWord="BREAK_WORD"')
            .replace(/<hh:margin>[\s\S]*?<\/hh:margin>/g, margin => {
                const scale = branch++ === 0 ? 1 : 2
                return margin.replace(/(<hc:intent value=")[^"]+/, `$1${-format.hanging * scale}`)
                    .replace(/(<hc:left value=")[^"]+/, `$1${format.left * scale}`)
            })
            .replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, `$1${Math.round(format.spacing * 100)}`)
    }).join('')
    return header.replace(/(<hh:paraProperties itemCnt=")(\d+)/, (_all, before: string, count: string) => `${before}${Number(count) + FORMATS.length}`)
        .replace('</hh:paraProperties>', `${added}</hh:paraProperties>`)
}

interface Fit { spacing: number; ratio: number; tracking: number; height: number }
const DEFAULT_FIT: Fit = { spacing: 1.3, ratio: 1, tracking: 0, height: 1400 }
const FIT_STEPS: Fit[] = [
    DEFAULT_FIT,
    { spacing: 1.2, ratio: 1, tracking: 0, height: 1400 },
    { spacing: 1.1, ratio: 1, tracking: 0, height: 1400 },
    { spacing: 1, ratio: 1, tracking: 0, height: 1400 },
    { spacing: 1, ratio: 0.95, tracking: -2, height: 1400 },
    { spacing: 1, ratio: 0.9, tracking: -4, height: 1400 },
    { spacing: 1, ratio: 0.85, tracking: -5, height: 1400 },
    { spacing: 1, ratio: 0.85, tracking: -5, height: 1300 },
    { spacing: 1, ratio: 0.85, tracking: -5, height: 1200 },
]

function fittedFormat(id: number, fit: Fit) {
    const format = FORMATS.find(item => item.id === id)
    if (!format || format.name === 'contacts') return format
    const [, prefix, left] = BODY_FORMATS[Math.floor((id - 45) / 2)]
    const height = fit.height
    const hanging = Math.round([...prefix].reduce((sum, ch) => sum + charWidthOf(ch, height) * fit.ratio + height * fit.tracking / 100, format.name === 'notes' ? 1417 + charWidthOf(' ', height) * fit.ratio + height * fit.tracking / 100 : 0))
    const continuation = (id - 45) % 2 === 1
    return { ...format, left: continuation ? left + hanging : left, hanging: continuation ? 0 : hanging, spacing: fit.spacing }
}

interface Unit {
    ch: string
    w: number
    run: number
}

function unescapeXml(text: string): string {
    return text
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
}

function runCharPr(run: string): number {
    const m = /charPrIDRef="(\d+)"/.exec(run)
    return m ? Number(m[1]) : 17
}

function charHeightOf(cp: number): number {
    return CHAR_HEIGHT[cp] ?? DEFAULT_CHAR_HEIGHT
}

/**
 * 글자 폭 추정. 한글·전각은 글자 높이(휴먼명조 한글은 전각), 체크 기호(PUA)는 0.7배,
 * ASCII는 비례폭 명조 기준으로 공백·구두점 0.35배·나머지 0.55배.
 * 원본 lineseg 대조에서 ASCII를 일괄 0.5배로 두면 폭 100% 근처 줄 두 개가 2줄로 과다 계산돼 쪽이 일찍 넘어갔다.
 */
function charWidthOf(ch: string, height: number): number {
    const code = ch.charCodeAt(0)
    if (code >= 0xF000 && code <= 0xF0FF) return Math.round(height * 0.7)
    if (code >= 128) return height
    if (' :/.,()-'.includes(ch)) return Math.round(height * 0.35)
    return Math.round(height * 0.55)
}

/** 문단을 글자 단위로 편다. 아이콘 도형은 고정 폭 한 글자로 센다. */
function paragraphUnits(paragraph: string, fit = DEFAULT_FIT): Unit[] {
    const units: Unit[] = []
    const runs = topLevelRanges(paragraph, 'hp:run')
    runs.forEach(([start, end], runIndex) => {
        let run = paragraph.slice(start, end)
        const height = runCharPr(run) === 17 ? fit.height : charHeightOf(runCharPr(run))
        const icons = topLevelRanges(run, 'hp:container')
        for (let i = 0; i < icons.length; i++) units.push({ ch: '', w: 1417, run: runIndex })
        run = rebuild(run, icons, icons.map(() => ''))
        for (const m of run.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)) {
            const text = unescapeXml(m[1].replace(/<hp:fwSpace\/>/g, '\u3000'))
            for (const ch of text) {
                const width = charWidthOf(ch, height)
                units.push({ ch, w: runCharPr(run) === 17 ? width * fit.ratio + height * fit.tracking / 100 : width, run: runIndex })
            }
        }
    })
    return units
}

function paragraphAdvance(paragraph: string, fit = DEFAULT_FIT): number {
    const runs = topLevelRanges(paragraph, 'hp:run')
    let height = 0
    for (const [start, end] of runs) {
        const cp = runCharPr(paragraph.slice(start, end))
        height = Math.max(height, cp === 17 ? fit.height : charHeightOf(cp))
    }
    const id = paragraphParaPr(paragraph)
    const spacing = fittedFormat(id, fit)?.spacing ?? ([21, 40, 41].includes(id) ? fit.spacing : PARA_SPACING[id] ?? 1.3)
    return Math.round((height || DEFAULT_CHAR_HEIGHT) * spacing)
}

function paragraphParaPr(paragraph: string): number {
    const m = /paraPrIDRef="(\d+)"/.exec(paragraph)
    return m ? Number(m[1]) : 21
}

/**
 * 표시 줄이 시작되는 글자 인덱스 목록.
 * 신규 문단 모양의 첫 줄 여백과 이어지는 줄 내어쓰기를 각각 반영한다.
 */
function wrapStarts(units: Unit[], width: number, paraPr: number, fit = DEFAULT_FIT): number[] {
    const starts = [0]
    const format = fittedFormat(paraPr, fit)
    let used = 0
    for (let i = 0; i < units.length; i++) {
        const w = units[i].w
        const available = width - (format?.left ?? 0) - (starts.length > 1 ? format?.hanging ?? 0 : 0)
        if (i > starts[starts.length - 1] && used + w > available) {
            starts.push(i)
            used = w
        } else {
            used += w
        }
    }
    return starts
}

/** 안쪽 표 문단은 표 높이로, 글줄 문단은 표시 줄 수로 높이를 잡는다. */
export function paragraphHeight(paragraph: string, width: number = BODY_INNER_WIDTH, fit = DEFAULT_FIT): number {
    const tables = topLevelRanges(paragraph, 'hp:tbl')
    if (tables.length > 0) return innerTableHeight(paragraph.slice(tables[0][0], tables[0][1]), fit) + CELL_PAD
    const paraPr = paragraphParaPr(paragraph)
    // 한글의 어절 단위 줄바꿈과 장평 차이를 위한 보수적 폭 여유.
    const starts = wrapStarts(paragraphUnits(paragraph, fit), width * 0.94, paraPr, fit)
    return starts.length * paragraphAdvance(paragraph, fit) + (PARA_PREV[paraPr] ?? 0)
}

/**
 * 안쪽 표(보고요지·연락처) 높이. 선언된 hp:sz는 최소값이라 값이 여러 줄이면 표가 자란다.
 * 선언값과 셀 내용 추정값 중 큰 쪽을 써야 쪽 예산이 실제보다 헐거워지지 않는다.
 */
function innerTableHeight(table: string, fit = DEFAULT_FIT): number {
    const declared = Number(/<hp:sz [^>]*height="(\d+)"/.exec(table)?.[1] ?? 0)
    let total = 0
    const rows = topLevelRanges(table, 'hp:tr')
    for (const [rowIndex, [rowStart, rowEnd]] of rows.entries()) {
        const row = table.slice(rowStart, rowEnd)
        let rowHeight = 0
        for (const [cellStart, cellEnd] of topLevelRanges(row, 'hp:tc')) {
            const cell = row.slice(cellStart, cellEnd)
            if (indexOfTag(cell, 'hp:tbl', 0) >= 0) return declared   // 표 속 표는 추정하지 않는다
            const size = /<hp:cellSz width="(\d+)" height="(\d+)"\/>/.exec(cell)
            if (!size) return declared
            // 여러 행에 걸친 셀(보고요지 제목)은 자기 행 높이가 아니라 걸친 행들의 합이라 행 높이 계산에서 뺀다
            if (/<hp:cellSpan colSpan="\d+" rowSpan="([2-9]|\d{2,})"\/>/.test(cell)) continue
            const cellWidth = Math.max(1, Number(size[1]) - CELL_PAD)
            const subLists = topLevelRanges(cell, 'hp:subList')
            const inner = subLists.length === 1 ? cell.slice(subLists[0][0], subLists[0][1]) : ''
            let content = CELL_PAD
            for (const [start, end] of topLevelRanges(inner, 'hp:p')) {
                const paragraph = inner.slice(start, end)
                // 보고요지 상단의 빈 장식 셀은 글줄 높이가 아니라 원본 격자 높이를 따른다.
                const summaryDecoration = rows.length === 3 && rowIndex < 2
                if (!summaryDecoration || /<hp:t>[^<]+<\/hp:t>/.test(paragraph)) content += paragraphHeight(paragraph, cellWidth, fit)
            }
            rowHeight = Math.max(rowHeight, Number(size[2]), content)
        }
        total += rowHeight
    }
    return Math.max(declared, total)
}

/** 보고요지의 내용 행만 실제 줄 높이에 맞추고 상단 장식·병합 격자는 보존한다. */
function sizeSummary(paragraph: string, fit: Fit): string {
    const [tableRange] = topLevelRanges(paragraph, 'hp:tbl')
    if (!tableRange) return paragraph
    const table = paragraph.slice(...tableRange)
    const rows = topLevelRanges(table, 'hp:tr')
    if (rows.length !== 3) return paragraph
    const row = table.slice(...rows[2])
    const [cellRange] = topLevelRanges(row, 'hp:tc')
    const cell = row.slice(...cellRange)
    const size = /<hp:cellSz width="(\d+)" height="\d+"/.exec(cell)!
    const [subRange] = topLevelRanges(cell, 'hp:subList')
    const sub = cell.slice(...subRange)
    const height = topLevelRanges(sub, 'hp:p').reduce((sum, range) => sum + paragraphHeight(sub.slice(...range), Number(size[1]) - CELL_PAD, fit), CELL_PAD)
    const nextCell = cell.replace(/(<hp:cellSz width="\d+" height=")\d+/, `$1${height}`)
    const nextTable = rebuild(table, [rows[2]], [rebuild(row, [cellRange], [nextCell])])
        .replace(/(<hp:sz [^>]*height=")\d+/, `$1${1682 + height}`)
    return stripLineseg(rebuild(paragraph, [tableRange], [nextTable]))
}

interface BodyPage {
    paragraphs: string[]
    height: number   // 그 쪽 문단 높이 추정 합(셀 패딩 제외)
}

/** 내용 높이에 맞춰 본문 셀의 최소 높이를 지정한다. */
const BODY_CELL_HEIGHT_MIN = 6000
function bodyCellHeight(contentHeight: number): number {
    return Math.min(BODY_CELL_HEIGHT_MAX, Math.max(BODY_CELL_HEIGHT_MIN, contentHeight + CELL_PAD))
}

// ── 바깥 표 렌더링 ──

interface OuterTableView {
    tableRange: Range
    rowRanges: Range[]
    cellRange: Range
    subListRange: Range
    paragraphRanges: Range[]
}

function readOuterTable(anchor: string): OuterTableView {
    const tables = topLevelRanges(anchor, 'hp:tbl')
    if (tables.length !== 1) throw new Error('사고발생보고 양식의 바깥 표를 찾지 못했습니다.')
    const table = anchor.slice(tables[0][0], tables[0][1])
    const idMatch = /<hp:tbl id="(\d+)"/.exec(table)
    if (!idMatch) throw new Error('사고발생보고 양식의 표 id를 찾지 못했습니다.')
    const rowRanges = topLevelRanges(table, 'hp:tr')
    if (rowRanges.length !== 2) throw new Error('사고발생보고 양식의 바깥 표 행 수가 다릅니다.')
    const row = table.slice(rowRanges[1][0], rowRanges[1][1])
    const cellRanges = topLevelRanges(row, 'hp:tc')
    if (cellRanges.length !== 1) throw new Error('사고발생보고 양식의 본문 셀을 찾지 못했습니다.')
    const cell = row.slice(cellRanges[0][0], cellRanges[0][1])
    const subLists = topLevelRanges(cell, 'hp:subList')
    if (subLists.length !== 1) throw new Error('사고발생보고 양식의 본문 subList를 찾지 못했습니다.')
    const inner = cell.slice(subLists[0][0], subLists[0][1])
    return {
        tableRange: tables[0],
        rowRanges,
        cellRange: cellRanges[0],
        subListRange: subLists[0],
        paragraphRanges: topLevelRanges(inner, 'hp:p'),
    }
}

function bodyParagraphsOf(anchor: string, view: OuterTableView): string[] {
    const table = anchor.slice(view.tableRange[0], view.tableRange[1])
    const row = table.slice(view.rowRanges[1][0], view.rowRanges[1][1])
    const cell = row.slice(view.cellRange[0], view.cellRange[1])
    const inner = cell.slice(view.subListRange[0], view.subListRange[1])
    return view.paragraphRanges.map(([start, end]) => inner.slice(start, end))
}

/** 본문 셀 높이를 적합 결과에 맞추고 원본 머리 행·격자·표 ID를 보존한다. */
function renderOuterTable(anchor: string, view: OuterTableView, page: BodyPage, headerHeight: number): string {
    const bodyHeight = bodyCellHeight(page.height + 1200)
    const table = anchor.slice(...view.tableRange)
    const row = table.slice(...view.rowRanges[1])
    const cell = row.slice(...view.cellRange)
    const inner = cell.slice(...view.subListRange)
    const nextInner = rebuild(inner, view.paragraphRanges, view.paragraphRanges.map(() => ''))
        .replace('</hp:subList>', () => `${page.paragraphs.join('')}</hp:subList>`)
    const cellTail = cell.slice(view.subListRange[1])
        .replace(/(<hp:cellSz width="\d+" height=")\d+/, `$1${bodyHeight}`)
    const nextCell = cell.slice(0, view.subListRange[0]) + nextInner + cellTail
    const nextRow = rebuild(row, [view.cellRange], [nextCell])
    const head = table.slice(...view.rowRanges[0])
        .replace(/(<hp:cellSz width="\d+" height=")\d+/g, `$1${headerHeight}`)
    const nextTable = rebuild(table, view.rowRanges, [head, nextRow])
        .replace(/(<hp:tbl [^>]*>\s*<hp:sz [^>]*height=")\d+/, `$1${bodyHeight + headerHeight}`)
    return stripLineseg(rebuild(anchor, [view.tableRange], [nextTable]))
}

/** 내용을 생략하지 않고 본문 한 쪽에 들어가는 가장 느슨한 서식을 선택한다. */
export function fitReportSection(section: string, header: string): { section: string; header: string } {
    const openEnd = section.indexOf('>', section.indexOf('<hs:sec')) + 1
    const closeStart = section.lastIndexOf('</hs:sec>')
    const body = section.slice(openEnd, closeStart)
    const ranges = topLevelRanges(body, 'hp:p')
    const title = body.slice(...ranges[0])
    const anchor = body.slice(...ranges[1])
    const view = readOuterTable(anchor)
    const table = anchor.slice(...view.tableRange)
    const headerHeight = rowContentHeight(table.slice(...view.rowRanges[0]))
    const budget = 70018 - paragraphHeight(title, 48190) - headerHeight - 566 - CELL_PAD - SAFETY_BUFFER_FIRST - 1600
    const sourceParagraphs = bodyParagraphsOf(anchor, view)
    for (const fit of FIT_STEPS) {
        const paragraphs = sourceParagraphs.map(paragraph => sizeSummary(paragraph, fit))
        const height = paragraphs.reduce((sum, paragraph) => sum + paragraphHeight(paragraph, BODY_INNER_WIDTH, fit), 0)
        if (height > budget) continue
        const rendered = renderOuterTable(anchor, view, { paragraphs, height }, headerHeight)
        const next = rebuild(body, ranges.slice(1), [rendered, ...ranges.slice(2).map(range => stripLineseg(body.slice(...range)))])
        return { section: section.slice(0, openEnd) + next + section.slice(closeStart), header: fittedHeader(header, fit) }
    }
    throw new Error('사고보고 본문이 1쪽 분량을 초과했습니다. 입력 내용을 줄인 뒤 다시 내려받아 주세요. 보고서 1쪽과 사진대지 1쪽으로 출력됩니다.')
}

function fittedHeader(header: string, fit: Fit): string {
    return header.replace(/<hh:charPr id="17"[\s\S]*?<\/hh:charPr>/, charPr => charPr
        .replace(/height="\d+"/, `height="${fit.height}"`)
        .replace(/<hh:ratio [^>]*\/>/, tag => tag.replace(/="100"/g, `="${Math.round(fit.ratio * 100)}"`))
        .replace(/<hh:spacing [^>]*\/>/, tag => tag.replace(/="0"/g, `="${fit.tracking}"`)))
        .replace(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g, (para, value: string) => {
            const id = Number(value)
            const format = fittedFormat(id, fit)
            if (!format && ![21, 40, 41].includes(id)) return para
            let branch = 0
            return para.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, `$1${Math.round((format?.spacing ?? fit.spacing) * 100)}`)
                .replace(/<hh:margin>[\s\S]*?<\/hh:margin>/g, (margin: string) => {
                    if (!format) return margin
                    const scale = branch++ === 0 ? 1 : 2
                    return margin.replace(/(<hc:intent value=")[^"]+/, `$1${-format.hanging * scale}`)
                        .replace(/(<hc:left value=")[^"]+/, `$1${format.left * scale}`)
                })
        })
}

/** 보고자 줄바꿈을 포함한 머리 행 높이. 셀의 원본 폭·안쪽 여백을 사용한다. */
function rowContentHeight(row: string): number {
    return Math.max(...topLevelRanges(row, 'hp:tc').map(range => {
        const cell = row.slice(...range)
        const size = /<hp:cellSz width="(\d+)" height="(\d+)"/.exec(cell)!
        const subRange = topLevelRanges(cell, 'hp:subList')[0]
        const sub = cell.slice(...subRange)
        const height = topLevelRanges(sub, 'hp:p').reduce((sum, r) => sum + paragraphHeight(sub.slice(...r), Number(size[1]) - CELL_PAD), CELL_PAD)
        return Math.max(Number(size[2]), height)
    }))
}
