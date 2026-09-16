// 사고보고 원본 표와 글꼴을 보존하며 장문을 쪽별 복제 표로 나눈다.
import { indexOfTag, topLevelRanges, rebuild, stripLineseg, type Range } from './accident-report-xml'

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 쪽 분할 (표의 pageBreak를 NONE으로 두므로 코드가 직접 쪽을 나눈다) ──

const BODY_CELL_MARGIN = 850
const OUTER_TABLE_WIDTH = 47630
const BODY_INNER_WIDTH = OUTER_TABLE_WIDTH - BODY_CELL_MARGIN * 2
const CELL_PAD = 282
// 첫 쪽은 제목과 보고자 머리 행의 예상 높이를 빼고, 이어지는 쪽은 본문 전체를 쓴다.
// 본문 한 줄이 테두리 밖으로 넘었던 한글 실측을 반영해 조판 여유를 둔다.
const SAFETY_BUFFER_FIRST = 3000
const SAFETY_BUFFER_CLONE = 4500
const BODY_CELL_HEIGHT_CLONE = 65451
const PAGE_BUDGET_CLONE = BODY_CELL_HEIGHT_CLONE - CELL_PAD - SAFETY_BUFFER_CLONE

// 양식 header.xml의 글자 크기·문단 모양을 상수로 고정한다(양식을 읽어 계산하지 않는다).
const CHAR_HEIGHT: Record<number, number> = {
    0: 1000, 10: 1300, 11: 500, 12: 2000, 14: 1200, 15: 1300, 16: 1200, 17: 1400, 18: 1600, 19: 1600, 20: 1100, 21: 1100, 22: 1100,
    23: 1600, 24: 1400, 25: 1400, 26: 1400, 27: 1300, 28: 1300, 30: 1000, 32: 1100,
    33: 1100, 34: 1100, 35: 1100, 36: 1100, 37: 1400, 38: 1300,
}
const DEFAULT_CHAR_HEIGHT = 1400
const PARA_PREV: Record<number, number> = { 40: 500, 41: 700 }
const PARA_SPACING: Record<number, number> = { 22: 1.7, 23: 1.1, 24: 1.6, 25: 1.4, 26: 1.4, 27: 1.5, 28: 0.6, 29: 1.2, 30: 1.2, 32: 1.6, 33: 2, 34: 1.6, 35: 1, 36: 1.6, 37: 1.6, 38: 1.2 }

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
function paragraphUnits(paragraph: string): Unit[] {
    const units: Unit[] = []
    const runs = topLevelRanges(paragraph, 'hp:run')
    runs.forEach(([start, end], runIndex) => {
        let run = paragraph.slice(start, end)
        const height = charHeightOf(runCharPr(run))
        const icons = topLevelRanges(run, 'hp:container')
        for (let i = 0; i < icons.length; i++) units.push({ ch: '', w: 1417, run: runIndex })
        run = rebuild(run, icons, icons.map(() => ''))
        for (const m of run.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)) {
            const text = unescapeXml(m[1].replace(/<hp:fwSpace\/>/g, '\u3000'))
            for (const ch of text) {
                units.push({ ch, w: charWidthOf(ch, height), run: runIndex })
            }
        }
    })
    return units
}

function paragraphAdvance(paragraph: string): number {
    const runs = topLevelRanges(paragraph, 'hp:run')
    let height = 0
    for (const [start, end] of runs) height = Math.max(height, charHeightOf(runCharPr(paragraph.slice(start, end))))
    return Math.round((height || DEFAULT_CHAR_HEIGHT) * (PARA_SPACING[paragraphParaPr(paragraph)] ?? 1.3))
}

function paragraphParaPr(paragraph: string): number {
    const m = /paraPrIDRef="(\d+)"/.exec(paragraph)
    return m ? Number(m[1]) : 21
}

/**
 * 표시 줄이 시작되는 글자 인덱스 목록.
 * 원본의 linesegarray가 본문 셀 모든 줄에서 horzpos=0 / horzsize=45928을 쓰므로
 * paraPr의 내어쓰기는 폭에 반영하지 않는다(반영하면 쪽이 실제보다 일찍 넘어간다).
 */
function wrapStarts(units: Unit[], width: number): number[] {
    const starts = [0]
    let used = 0
    for (let i = 0; i < units.length; i++) {
        const w = units[i].w
        if (i > starts[starts.length - 1] && used + w > width) {
            starts.push(i)
            used = w
        } else {
            used += w
        }
    }
    return starts
}

/** 안쪽 표 문단은 표 높이로, 글줄 문단은 표시 줄 수로 높이를 잡는다. */
export function paragraphHeight(paragraph: string, width: number = BODY_INNER_WIDTH): number {
    const tables = topLevelRanges(paragraph, 'hp:tbl')
    if (tables.length > 0) return innerTableHeight(paragraph.slice(tables[0][0], tables[0][1])) + CELL_PAD
    const paraPr = paragraphParaPr(paragraph)
    // 한글의 어절 단위 줄바꿈과 장평 차이를 위한 보수적 폭 여유.
    const starts = wrapStarts(paragraphUnits(paragraph), width * 0.94)
    return starts.length * paragraphAdvance(paragraph) + (PARA_PREV[paraPr] ?? 0)
}

/**
 * 안쪽 표(보고요지·연락처) 높이. 선언된 hp:sz는 최소값이라 값이 여러 줄이면 표가 자란다.
 * 선언값과 셀 내용 추정값 중 큰 쪽을 써야 쪽 예산이 실제보다 헐거워지지 않는다.
 */
function innerTableHeight(table: string): number {
    const declared = Number(/<hp:sz [^>]*height="(\d+)"/.exec(table)?.[1] ?? 0)
    let total = 0
    for (const [rowStart, rowEnd] of topLevelRanges(table, 'hp:tr')) {
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
                content += paragraphHeight(inner.slice(start, end), cellWidth)
            }
            rowHeight = Math.max(rowHeight, Number(size[2]), content)
        }
        total += rowHeight
    }
    return Math.max(declared, total)
}

/** 원본 상자의 마지막 내용 셀만 나누고 제목·병합 격자·폭은 복제본에 보존한다. */
function splitNestedParagraph(paragraph: string, available: number): { head: string; tail: string } | null {
    const [tableRange] = topLevelRanges(paragraph, 'hp:tbl')
    const table = paragraph.slice(...tableRange)
    const cells = topLevelRanges(table, 'hp:tc')
    const cellRange = cells[cells.length - 1]
    const cell = table.slice(...cellRange)
    const [subRange] = topLevelRanges(cell, 'hp:subList')
    const sub = cell.slice(...subRange)
    const ranges = topLevelRanges(sub, 'hp:p')
    const paragraphs = ranges.map(range => sub.slice(...range))
    const width = Number(/<hp:cellSz width="(\d+)"/.exec(cell)?.[1]) - CELL_PAD
    const isContacts = topLevelRanges(table, 'hp:tr').length === 1
    const prefix = isContacts ? paragraphs.slice(0, 2) : []
    const content = isContacts ? paragraphs.slice(2) : paragraphs
    // 보고요지의 장식 머리 두 행(1682), 연락처 제목 문단을 복제한다.
    const overhead = (isContacts ? prefix.reduce((sum, p) => sum + paragraphHeight(p, width), 0) : 1682) + CELL_PAD * 3 + 1000
    const budget = available - overhead
    const head: string[] = []
    let tail = content.slice()
    let used = 0
    while (tail.length > 0) {
        const next = tail[0]
        const height = paragraphHeight(next, width)
        if (used + height <= budget) {
            head.push(next)
            used += height
            tail.shift()
            continue
        }
        const split = splitParagraph(next, budget - used, width)
        if (split) {
            head.push(split.head)
            tail = [split.tail, ...tail.slice(1)]
        }
        break
    }
    if (head.length === 0 || tail.length === 0) return null
    const render = (body: string[]) => {
        const items = [...prefix, ...body]
        const height = items.reduce((sum, p) => sum + paragraphHeight(p, width), CELL_PAD + 500)
        const nextSub = rebuild(sub, ranges, ranges.map(() => ''))
            .replace('</hp:subList>', () => `${items.join('')}</hp:subList>`)
        const nextCell = cell.slice(0, subRange[0]) + nextSub + cell.slice(subRange[1])
            .replace(/(<hp:cellSz width="\d+" height=")\d+/, `$1${height}`)
        const nextTable = rebuild(table, [cellRange], [nextCell])
            .replace(/(<hp:sz [^>]*height=")\d+/, `$1${height + (isContacts ? 0 : 1682)}`)
        return stripLineseg(rebuild(paragraph, [tableRange], [nextTable]))
    }
    return { head: render(head), tail: render(tail) }
}

function renderRuns(paragraph: string, units: Unit[], from: number, to: number): string {
    const runs = topLevelRanges(paragraph, 'hp:run')
    const texts = runs.map(() => '')
    for (let i = from; i < to; i++) texts[units[i].run] += units[i].ch
    const next = runs.map(([start, end], index) => {
        let run = paragraph.slice(start, end)
        if (from > 0) {
            const icons = topLevelRanges(run, 'hp:container')
            run = rebuild(run, icons, icons.map(() => ''))
        }
        let first = true
        return run.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, () => {
            const text = first ? esc(texts[index]) : ''
            first = false
            return `<hp:t>${text}</hp:t>`
        })
    })
    return stripLineseg(rebuild(paragraph, runs, next))
}

/** 남은 높이에 맞춰 표시 줄 경계에서 문단을 자른다. 조각을 이어 붙이면 원문이 그대로 복원된다. */
function splitParagraph(paragraph: string, available: number, width = BODY_INNER_WIDTH): { head: string; tail: string } | null {
    if (indexOfTag(paragraph, 'hp:tbl', 0) >= 0) return splitNestedParagraph(paragraph, available)
    const paraPr = paragraphParaPr(paragraph)
    const advance = paragraphAdvance(paragraph)
    const maxRows = Math.floor((available - (PARA_PREV[paraPr] ?? 0)) / advance)
    if (maxRows < 1) return null
    const units = paragraphUnits(paragraph)
    const starts = wrapStarts(units, width * 0.94)
    if (starts.length <= maxRows) return null
    const cut = starts[maxRows]
    if (cut <= 0) return null
    return {
        head: renderRuns(paragraph, units, 0, cut),
        tail: renderRuns(paragraph, units, cut, units.length),
    }
}

interface BodyPage {
    paragraphs: string[]
    height: number   // 그 쪽 문단 높이 추정 합(셀 패딩 제외)
}

function paginateParagraphs(paragraphs: string[], firstBudget: number): BodyPage[] {
    const pages: BodyPage[] = []
    const queue = paragraphs.slice()
    let current: string[] = []
    let used = 0
    let budget = firstBudget

    while (queue.length > 0) {
        const paragraph = queue[0]
        const height = paragraphHeight(paragraph)
        if (used + height <= budget) {
            current.push(paragraph)
            used += height
            queue.shift()
            continue
        }
        const split = splitParagraph(paragraph, budget - used)
        if (split) {
            current.push(split.head)
            used += paragraphHeight(split.head)
            queue[0] = split.tail
        } else if (current.length === 0 && budget === PAGE_BUDGET_CLONE) {
            throw new Error('사고보고 항목을 한 쪽 안에 나눠 배치하지 못했습니다.')
        }
        pages.push({ paragraphs: current, height: used })
        current = []
        used = 0
        budget = PAGE_BUDGET_CLONE
    }
    if (current.length > 0) pages.push({ paragraphs: current, height: used })
    return pages.length > 0 ? pages : [{ paragraphs: [], height: 0 }]
}

/** 이어지는 쪽의 본문 셀 최소 높이. 마지막 쪽이 몇 줄뿐이면 상자도 그만큼만 그린다(선언 높이는 최소값이라 내용이 길면 자란다). */
const BODY_CELL_HEIGHT_CLONE_MIN = 6000
function cloneCellHeight(contentHeight: number): number {
    return Math.min(BODY_CELL_HEIGHT_CLONE, Math.max(BODY_CELL_HEIGHT_CLONE_MIN, contentHeight + CELL_PAD))
}

// ── 바깥 표 렌더링 ──

interface OuterTableView {
    tableRange: Range
    tableId: number
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
        tableId: Number(idMatch[1]),
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

/**
 * 한 쪽 분량의 문단을 담은 바깥 표 문단을 만든다.
 * clone이 참이면 보고일자 행을 뺀 1행짜리 표를 새 쪽에 올린다(표 id는 원본 id + index, 높이는 그 쪽 내용만큼).
 */
function renderOuterTable(anchor: string, view: OuterTableView, page: BodyPage, tableId: number | null, headerHeight: number): string {
    const clone = tableId !== null
    const paragraphs = page.paragraphs
    const cloneHeight = cloneCellHeight(page.height + 1200)
    const table = anchor.slice(view.tableRange[0], view.tableRange[1])
    let row = table.slice(view.rowRanges[1][0], view.rowRanges[1][1])
    const cell = row.slice(view.cellRange[0], view.cellRange[1])
    const inner = cell.slice(view.subListRange[0], view.subListRange[1])

    const nextInner = rebuild(inner, view.paragraphRanges, view.paragraphRanges.map(() => ''))
        .replace('</hp:subList>', () => `${paragraphs.join('')}</hp:subList>`)
    // 셀 자신의 주소·높이는 subList 뒤에 있다. 안쪽 표의 셀을 건드리지 않도록 그 뒤쪽만 고친다.
    let cellTail = cell.slice(view.subListRange[1])
    if (clone) {
        cellTail = cellTail
            .replace(/<hp:cellAddr colAddr="(\d+)" rowAddr="\d+"\/>/, (_all, col: string) => `<hp:cellAddr colAddr="${col}" rowAddr="0"/>`)
            .replace(/(<hp:cellSz width="\d+" height=")\d+(")/, `$1${cloneHeight}$2`)
    }
    cellTail = cellTail.replace(/(<hp:cellSz width="\d+" height=")\d+(")/, `$1${cloneHeight}$2`)
    const nextCell = cell.slice(0, view.subListRange[0]) + nextInner + cellTail
    row = row.slice(0, view.cellRange[0]) + nextCell + row.slice(view.cellRange[1])

    let nextTable = clone
        ? rebuild(table, view.rowRanges, ['', row])
        : rebuild(table, view.rowRanges, [table.slice(view.rowRanges[0][0], view.rowRanges[0][1]), row])
    if (clone) {
        nextTable = nextTable
            .replace(/(<hp:tbl id=")\d+(")/, `$1${tableId}$2`)
            .replace(/rowCnt="\d+"/, 'rowCnt="1"')
            .replace(/(<hp:tbl [^>]*>\s*<hp:sz [^>]*height=")\d+(")/, `$1${cloneHeight}$2`)
    }

    if (!clone) {
        const firstRow = topLevelRanges(nextTable, 'hp:tr')[0]
        const head = nextTable.slice(...firstRow).replace(/(<hp:cellSz width="\d+" height=")\d+/g, `$1${headerHeight}`)
        nextTable = rebuild(nextTable, [firstRow], [head])
    }
    nextTable = nextTable.replace(/(<hp:tbl [^>]*>\s*<hp:sz [^>]*height=")\d+/, `$1${cloneHeight + (clone ? 0 : headerHeight)}`)

    let out = anchor.slice(0, view.tableRange[0]) + nextTable + anchor.slice(view.tableRange[1])
    const openEnd = out.indexOf('>') + 1
    const open = out.slice(0, openEnd).replace(/pageBreak="\d+"/, `pageBreak="${clone ? 1 : 0}"`)
    out = open + out.slice(openEnd)
    // 앵커 문단의 조판 정보는 내용이 바뀌었으므로 버린다(한글이 다시 계산한다)
    const linesegs = topLevelRanges(out, 'hp:linesegarray')
    return rebuild(out, linesegs, linesegs.map(() => ''))
}

export function paginateSection(section: string): string {
    const openEnd = section.indexOf('>', section.indexOf('<hs:sec')) + 1
    const closeStart = section.lastIndexOf('</hs:sec>')
    const body = section.slice(openEnd, closeStart)
    const ranges = topLevelRanges(body, 'hp:p')
    if (ranges.length < 2) throw new Error('사고발생보고 양식의 본문 구조가 예상과 다릅니다.')
    const title = body.slice(...ranges[0])
    const firstAvailable = Math.max(0, 70018 - paragraphHeight(title, 48190) - 566 - CELL_PAD - SAFETY_BUFFER_FIRST)
    const prepared = paginateHeader(body.slice(...ranges[1]), firstAvailable)
    const anchor = prepared.anchor
    const view = readOuterTable(anchor)
    const table = anchor.slice(...view.tableRange)
    const header = table.slice(...view.rowRanges[0])
    const headerHeight = rowContentHeight(header)
    const firstBudget = Math.max(0, prepared.available - headerHeight - 1600)
    const pages = paginateParagraphs(bodyParagraphsOf(anchor, view), firstBudget)
    // 복제 표 id는 원본 id에서 한 칸씩 밀되 다른 개체(표·아이콘·그림) id와 부딪히지 않게 비켜 쓴다.
    const usedIds = new Set([...section.matchAll(/<hp:(?:tbl|container|pic|ellipse) id="(\d+)"/g)].map(m => Number(m[1])))
    const rendered = pages
        .map((page, i) => {
            const rendered = renderOuterTable(anchor, view, page, i === 0 ? null : nextTableId(usedIds, view.tableId + i), headerHeight)
            return i === 0 && prepared.prefix ? rendered.replace(/pageBreak="0"/, 'pageBreak="1"') : rendered
        })
        .join('')
    const next = rebuild(body, ranges.slice(1), [
        prepared.prefix + rendered,
        ...ranges.slice(2).map(range => stripLineseg(body.slice(...range))),
    ])
    return uniqueTableIds(section.slice(0, openEnd) + next + section.slice(closeStart))
}

function nextTableId(used: Set<number>, candidate: number): number {
    let id = candidate
    while (used.has(id)) id++
    used.add(id)
    return id
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

/** 아주 긴 보고자도 원본 3열 머리 행을 복제하여 제목 아래부터 순서대로 출력한다. */
function paginateHeader(anchor: string, firstAvailable: number): { anchor: string; prefix: string; available: number } {
    const view = readOuterTable(anchor)
    const table = anchor.slice(...view.tableRange)
    let row = table.slice(...view.rowRanges[0])
    let available = firstAvailable
    let prefix = ''
    while (rowContentHeight(row) > available - 2500) {
        const split = splitHeaderRow(row, available - 1600)
        if (!split) throw new Error('보고자 정보를 쪽 안에 나눠 배치하지 못했습니다.')
        const height = rowContentHeight(split.head)
        const head = split.head.replace(/(<hp:cellSz width="\d+" height=")\d+/g, `$1${height}`)
        const nextTable = rebuild(table, view.rowRanges, [head, ''])
            .replace('rowCnt="2"', 'rowCnt="1"')
            .replace(/(<hp:sz [^>]*height=")\d+/, `$1${height}`)
        let next = stripLineseg(rebuild(anchor, [view.tableRange], [nextTable]))
        if (prefix) next = next.replace(/pageBreak="0"/, 'pageBreak="1"')
        prefix += next
        row = split.tail
        available = 70018 - 566 - CELL_PAD - SAFETY_BUFFER_CLONE
    }
    return { anchor: rebuild(anchor, [view.tableRange], [rebuild(table, [view.rowRanges[0]], [row])]), prefix, available }
}

function splitHeaderRow(row: string, available: number): { head: string; tail: string } | null {
    const ranges = topLevelRanges(row, 'hp:tc')
    let hasTail = false
    let hasHead = false
    const parts = ranges.map(range => {
        const cell = row.slice(...range)
        const width = Number(/<hp:cellSz width="(\d+)"/.exec(cell)?.[1]) - CELL_PAD
        const subRange = topLevelRanges(cell, 'hp:subList')[0]
        const sub = cell.slice(...subRange)
        const paraRanges = topLevelRanges(sub, 'hp:p')
        const tail = paraRanges.map(r => sub.slice(...r))
        const head: string[] = []
        let used = CELL_PAD
        while (tail.length > 0) {
            const p = tail[0]
            const height = paragraphHeight(p, width)
            if (used + height <= available) {
                head.push(p)
                tail.shift()
                used += height
            } else {
                const split = splitParagraph(p, available - used, width)
                if (split) { head.push(split.head); tail[0] = split.tail }
                break
            }
        }
        hasHead ||= head.length > 0
        hasTail ||= tail.length > 0
        const render = (items: string[]) => {
            const empty = stripLineseg(sub.slice(...paraRanges[0]).replace(/<hp:t>[\s\S]*?<\/hp:t>/g, '<hp:t/>'))
            const nextSub = rebuild(sub, paraRanges, paraRanges.map(() => '')).replace('</hp:subList>', () => `${items.join('') || empty}</hp:subList>`)
            return cell.slice(0, subRange[0]) + nextSub + cell.slice(subRange[1]).replace(/(<hp:cellSz width="\d+" height=")\d+/, '$13014')
        }
        return { head: render(head), tail: render(tail) }
    })
    return hasHead && hasTail ? { head: rebuild(row, ranges, parts.map(p => p.head)), tail: rebuild(row, ranges, parts.map(p => p.tail)) } : null
}

function uniqueTableIds(section: string): string {
    const used = new Set<number>()
    const all = [...section.matchAll(/<hp:tbl id="(\d+)"/g)].map(m => Number(m[1]))
    let next = Math.max(...all) + 1
    return section.replace(/(<hp:tbl id=")(\d+)(")/g, (_all, before: string, value: string, after: string) => {
        let id = Number(value)
        if (used.has(id)) id = next++
        used.add(id)
        return `${before}${id}${after}`
    })
}
