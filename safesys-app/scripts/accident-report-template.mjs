// 사용자가 확정한 사고발생보고 hwpx 원본에서 개인정보·이미지를 지우고 값 자리표시자만 남긴 양식을 만든다.
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'

// ── XML 요소 스캐너 (정규식으로는 중첩 표를 못 가린다) ──

/** `<tag` 다음 글자가 공백/닫힘이어야 같은 태그다. `<hp:p`가 `<hp:pic`을 물지 않게 한다. */
function indexOfTag(xml, tag, from) {
    let i = from
    for (;;) {
        const at = xml.indexOf(`<${tag}`, i)
        if (at < 0) return -1
        const next = xml[at + tag.length + 1]
        if (next === ' ' || next === '>' || next === '/' || next === '\t' || next === '\n' || next === '\r') return at
        i = at + 1
    }
}

/** `start`에서 열린 요소의 끝(닫는 태그 뒤) 위치. 같은 이름의 중첩 요소를 깊이로 센다. */
function matchEnd(xml, tag, start) {
    const openEnd = xml.indexOf('>', start)
    if (openEnd < 0) throw new Error(`${tag} 여는 태그가 닫히지 않음`)
    if (xml[openEnd - 1] === '/') return openEnd + 1
    const closeToken = `</${tag}>`
    let depth = 1
    let i = openEnd + 1
    while (depth > 0) {
        const nextOpen = indexOfTag(xml, tag, i)
        const nextClose = xml.indexOf(closeToken, i)
        if (nextClose < 0) throw new Error(`${tag} 닫는 태그를 찾지 못함`)
        if (nextOpen >= 0 && nextOpen < nextClose) {
            const q = xml.indexOf('>', nextOpen)
            if (xml[q - 1] !== '/') depth++
            i = q + 1
        } else {
            depth--
            i = nextClose + closeToken.length
        }
    }
    return i
}

/** 주어진 문자열 안에서 한 단계 깊이의 `tag` 요소 범위 목록 */
function topLevelRanges(xml, tag) {
    const ranges = []
    let i = 0
    for (;;) {
        const start = indexOfTag(xml, tag, i)
        if (start < 0) return ranges
        const end = matchEnd(xml, tag, start)
        ranges.push([start, end])
        i = end
    }
}

/** 범위별 새 문자열로 갈아 끼운다. 빈 문자열을 주면 그 요소는 삭제된다. */
function rebuild(xml, ranges, replacements) {
    let out = ''
    let prev = 0
    ranges.forEach(([start, end], i) => {
        out += xml.slice(prev, start) + replacements[i]
        prev = end
    })
    return out + xml.slice(prev)
}

function sliceAll(xml, ranges) {
    return ranges.map(([start, end]) => xml.slice(start, end))
}

function fail(label) {
    throw new Error(`${label} 구조가 예상과 다름`)
}

// ── 텍스트 치환 도우미 (값이 아니라 라벨 접두어로만 찾는다) ──

const TEXT_PATTERN = /<hp:t>([\s\S]*?)<\/hp:t>/g

function textMatches(xml) {
    return [...xml.matchAll(TEXT_PATTERN)]
}

/** 라벨 접두어로 `<hp:t>` 하나를 찾아 통째로 바꾼다. 0개거나 2개 이상이면 실패다. */
function replaceTextByPrefix(xml, prefix, next, label) {
    const hits = textMatches(xml).filter(m => m[1].startsWith(prefix))
    if (hits.length !== 1) fail(`${label} 라벨`)
    const hit = hits[0]
    return xml.slice(0, hit.index) + `<hp:t>${next}</hp:t>` + xml.slice(hit.index + hit[0].length)
}

/** 라벨을 포함한 `<hp:t>` 하나를 찾아 통째로 바꾼다. */
function replaceTextByIncludes(xml, needle, next, label) {
    const hits = textMatches(xml).filter(m => m[1].includes(needle))
    if (hits.length !== 1) fail(`${label} 라벨`)
    const hit = hits[0]
    return xml.slice(0, hit.index) + `<hp:t>${next}</hp:t>` + xml.slice(hit.index + hit[0].length)
}

const CHECK_MARKS = /[\uF06F\uF0FE]/g

/** 체크 기호(PUA)만 순서대로 토큰으로 바꾼다. 라벨 문구는 건드리지 않는다. */
function replaceCheckMarks(xml, needle, tokens, label) {
    const hits = textMatches(xml).filter(m => m[1].includes(needle))
    if (hits.length !== 1) fail(`${label} 체크줄`)
    const hit = hits[0]
    const marks = hit[1].match(CHECK_MARKS) ?? []
    if (marks.length !== tokens.length) fail(`${label} 체크 기호 수`)
    let i = 0
    const next = hit[1].replace(CHECK_MARKS, () => tokens[i++])
    return xml.slice(0, hit.index) + `<hp:t>${next}</hp:t>` + xml.slice(hit.index + hit[0].length)
}

/** 문단의 run을 전부 지우고 지정한 run 하나만 남긴다(연락처·캡션처럼 서식이 잘게 쪼개진 줄). */
function collapseRuns(paragraph, charPr, text, label) {
    const runs = topLevelRanges(paragraph, 'hp:run')
    if (runs.length === 0) fail(`${label} run`)
    const single = `<hp:run charPrIDRef="${charPr}"><hp:t>${text}</hp:t></hp:run>`
    return rebuild(paragraph, runs, runs.map((_, i) => (i === 0 ? single : '')))
}

/** 두 번째 run의 `<hp:t>`만 바꾼다(앞 run의 글머리 `   ○ `는 그대로 둔다). */
function replaceSecondRunText(paragraph, next, label) {
    const runs = topLevelRanges(paragraph, 'hp:run')
    if (runs.length < 2) fail(`${label} run 구성`)
    const [start, end] = runs[1]
    const run = paragraph.slice(start, end)
    const hits = textMatches(run)
    if (hits.length !== 1) fail(`${label} 둘째 run`)
    const replaced = run.slice(0, hits[0].index) + `<hp:t>${next}</hp:t>` + run.slice(hits[0].index + hits[0][0].length)
    return paragraph.slice(0, start) + replaced + paragraph.slice(end)
}

/** 셀(`hp:tc`) 안 subList의 한 단계 문단 목록 */
function cellParagraphs(cell) {
    const subLists = topLevelRanges(cell, 'hp:subList')
    if (subLists.length !== 1) fail('셀 subList')
    const [start, end] = subLists[0]
    const inner = cell.slice(start, end)
    const ranges = topLevelRanges(inner, 'hp:p')
    return { start, end, inner, ranges, paragraphs: sliceAll(inner, ranges) }
}

function replaceCellParagraphs(cell, view, replacements) {
    const next = rebuild(view.inner, view.ranges, replacements)
    return cell.slice(0, view.start) + next + cell.slice(view.end)
}

// ── 본문 셀 문단 변환 ──

const BODY_PARAGRAPH_COUNT = 24

function transformBodyCell(cell) {
    const view = cellParagraphs(cell)
    if (view.paragraphs.length !== BODY_PARAGRAPH_COUNT) fail('본문 셀 문단 수')
    const p = view.paragraphs
    const out = p.slice()

    // 보고요지 안쪽 표 — ' ○' + 전각공백 뒤 요지만 토큰으로
    out[0] = replaceTextByPrefix(p[0], ' ○<hp:fwSpace/>', ' ○<hp:fwSpace/>{{SUMMARY}}', '보고요지')

    out[2] = replaceTextByPrefix(p[2], '   ○ 지구 : ', '   ○ 지구 : {{DISTRICT}}', '지구')
    out[3] = replaceTextByPrefix(p[3], '   ○ 일시 : ', '   ○ 일시 : {{ACCIDENT_DATETIME}}', '일시')
    out[4] = replaceTextByPrefix(p[4], '   ○ 장소 : ', '   ○ 장소 : {{LOCATION}}', '장소')

    // 통계 컬럼(인명피해 수·사고유형)은 양식에 없는 정보라 이 머리 줄 끝에 괄호로 붙는다
    out[5] = replaceTextByPrefix(p[5], '   ○ 피해자 인적사항', '   ○ 피해자 인적사항{{CASUALTIES}}', '피해자 인적사항 머리')
    // 피해자 줄 3개(구분/성명/주소)를 한 문단으로 합치고 성명·주소 문단은 버린다
    out[6] = collapseRuns(p[6], 17, '      {{VICTIM_DETAILS}}', '피해자 인적사항')
    out[7] = ''
    out[8] = ''

    out[10] = replaceTextByPrefix(p[10], '   ○ ', '   ○ {{PROPERTY_DAMAGE}}', '인명 외 피해상황')

    out[12] = replaceSecondRunText(p[12], '{{ACCIDENT_DETAILS}}', '사고내용')

    if (!textMatches(p[14]).some(m => m[1].startsWith('   ○ 신고'))) fail('신고·연락사항 머리')
    out[15] = replaceCheckMarks(p[15], '119신고', ['{{NOTIFY_119}}', '{{NOTIFY_POLICE}}', '{{NOTIFY_LABOR}}', '{{NOTIFY_FAMILY}}'], '신고·연락사항')
    out[16] = replaceSecondRunText(p[16], '미신고 사유 : {{NO_NOTIFICATION_REASON}}', '미신고 사유')

    if (!textMatches(p[17]).some(m => m[1].startsWith('   ○ 사고자 조치사항'))) fail('사고자 조치사항 머리')
    out[18] = replaceCheckMarks(p[18], '병원진료', ['{{ACT_HOSPITAL}}', '{{ACT_FUNERAL}}', '{{ACT_HOME}}'], '사고자 조치사항')

    out[19] = replaceSecondRunText(p[19], '{{COMPENSATION}}', '보상관련')
    out[20] = replaceTextByPrefix(p[20], '        ', '        {{COMPENSATION_MORE}}', '보상 이어쓰기')
    out[21] = replaceTextByPrefix(p[21], '   ○ ', '   ○ {{ACTION_DETAILS}}', '조치내용')

    out[22] = replaceTextByIncludes(p[22], '언론보도', ' 언론보도 등 기타 특이사항 : {{OTHER_NOTES}}', '언론보도')

    out[23] = transformContactsTable(p[23])

    return replaceCellParagraphs(cell, view, out)
}

/** 연락처 안쪽 표 — 마지막 문단의 run 나열을 토큰 run 하나로 */
function transformContactsTable(paragraph) {
    const tables = topLevelRanges(paragraph, 'hp:tbl')
    if (tables.length !== 1) fail('연락처 표')
    const [tblStart, tblEnd] = tables[0]
    const table = paragraph.slice(tblStart, tblEnd)
    const cells = topLevelRanges(table, 'hp:tc')
    if (cells.length !== 1) fail('연락처 셀')
    const [cellStart, cellEnd] = cells[0]
    const cell = table.slice(cellStart, cellEnd)
    const view = cellParagraphs(cell)
    if (view.paragraphs.length !== 3) fail('연락처 문단 수')
    if (!textMatches(view.paragraphs[0]).some(m => m[1].includes('유관기관'))) fail('유관기관 머리')
    const next = view.paragraphs.slice()
    next[2] = collapseRuns(view.paragraphs[2], 36, ' ▸ {{CONTACTS}}', '연락처')
    const nextCell = replaceCellParagraphs(cell, view, next)
    const nextTable = table.slice(0, cellStart) + nextCell + table.slice(cellEnd)
    return paragraph.slice(0, tblStart) + nextTable + paragraph.slice(tblEnd)
}

// ── 바깥 표(제목·보고자·본문) 변환 ──

function transformOuterTableParagraph(paragraph) {
    const tables = topLevelRanges(paragraph, 'hp:tbl')
    if (tables.length !== 1) fail('바깥 표')
    const [tblStart, tblEnd] = tables[0]
    const table = paragraph.slice(tblStart, tblEnd)
    const rowRanges = topLevelRanges(table, 'hp:tr')
    if (rowRanges.length !== 2) fail('바깥 표 행 수')
    const rows = sliceAll(table, rowRanges)

    // 머리 행 — 보고일자 / 보고자 / 직책·성명·전화
    const headCellRanges = topLevelRanges(rows[0], 'hp:tc')
    if (headCellRanges.length !== 3) fail('머리 행 셀 수')
    const headCells = sliceAll(rows[0], headCellRanges)
    const nextHead = headCells.slice()
    nextHead[0] = replaceTextByPrefix(headCells[0], '보고일자 : ', '보고일자 : {{REPORT_DATE}}', '보고일자')
    if (!textMatches(headCells[1]).some(m => m[1] === '보고자')) fail('보고자 머리')
    const reporterView = cellParagraphs(headCells[2])
    if (reporterView.paragraphs.length !== 2) fail('보고자 문단 수')
    const reporterNext = [
        replaceTextByPrefix(reporterView.paragraphs[0], '', '{{REPORTER}}', '보고자 성명'),
        replaceTextByPrefix(reporterView.paragraphs[1], '(', '{{REPORTER_PHONE}}', '보고자 연락처'),
    ]
    nextHead[2] = replaceCellParagraphs(headCells[2], reporterView, reporterNext)
    const nextHeadRow = rebuild(rows[0], headCellRanges, nextHead)

    // 본문 행 — 3열 병합 셀 하나
    const bodyCellRanges = topLevelRanges(rows[1], 'hp:tc')
    if (bodyCellRanges.length !== 1) fail('본문 행 셀 수')
    const bodyCell = rows[1].slice(bodyCellRanges[0][0], bodyCellRanges[0][1])
    const nextBodyRow = rebuild(rows[1], bodyCellRanges, [transformBodyCell(bodyCell)])

    const nextTable = rebuild(table, rowRanges, [nextHeadRow, nextBodyRow])
    return paragraph.slice(0, tblStart) + nextTable + paragraph.slice(tblEnd)
}

// ── 참고1 머리·사진 표 변환 ──

function transformPhotoHeaderParagraph(paragraph) {
    return replaceTextByIncludes(paragraph, '현장 사진', ' {{PHOTO_TITLE}}', '참고1 제목')
}

function removeElements(xml, tag) {
    let out = xml
    for (;;) {
        const start = indexOfTag(out, tag, 0)
        if (start < 0) return out
        out = out.slice(0, start) + out.slice(matchEnd(out, tag, start))
    }
}

function transformPhotoTableParagraph(paragraph, index) {
    // 사진 위에 얹힌 주석 도형은 양식에 남기지 않는다
    let out = removeElements(paragraph, 'hp:ellipse')
    const tables = topLevelRanges(out, 'hp:tbl')
    if (tables.length !== 1) fail(`사진 표 ${index}`)
    const [tblStart, tblEnd] = tables[0]
    const table = out.slice(tblStart, tblEnd)
    const rowRanges = topLevelRanges(table, 'hp:tr')
    if (rowRanges.length !== 2) fail(`사진 표 ${index} 행 수`)
    const rows = sliceAll(table, rowRanges)

    // 사진 행 — 병합 셀 문단의 그림을 토큰 run으로
    const picCellRanges = topLevelRanges(rows[0], 'hp:tc')
    if (picCellRanges.length !== 1) fail(`사진 표 ${index} 사진 셀`)
    const picCell = rows[0].slice(picCellRanges[0][0], picCellRanges[0][1])
    const picView = cellParagraphs(picCell)
    if (picView.paragraphs.length !== 1) fail(`사진 표 ${index} 사진 문단`)
    if (topLevelRanges(picView.paragraphs[0], 'hp:pic').length === 0) fail(`사진 표 ${index} 그림`)
    const picNext = [collapseRuns(removeElements(picView.paragraphs[0], 'hp:pic'), 0, `{{PHOTO_${index}}}`, `사진 ${index}`)]
    const nextPicRow = rebuild(rows[0], picCellRanges, [replaceCellParagraphs(picCell, picView, picNext)])

    // 캡션 행 — '사진설명' 머리 셀은 그대로, 설명 셀만 토큰 run으로
    const capCellRanges = topLevelRanges(rows[1], 'hp:tc')
    if (capCellRanges.length !== 2) fail(`사진 표 ${index} 캡션 셀 수`)
    const capCells = sliceAll(rows[1], capCellRanges)
    if (!textMatches(capCells[0]).some(m => m[1] === '사진설명')) fail(`사진 표 ${index} 사진설명 머리`)
    const capView = cellParagraphs(capCells[1])
    if (capView.paragraphs.length !== 1) fail(`사진 표 ${index} 캡션 문단`)
    const capNext = [collapseRuns(capView.paragraphs[0], 28, `{{CAPTION_${index}}}`, `캡션 ${index}`)]
    const nextCapCells = capCells.slice()
    nextCapCells[1] = replaceCellParagraphs(capCells[1], capView, capNext)
    const nextCapRow = rebuild(rows[1], capCellRanges, nextCapCells)

    const nextTable = rebuild(table, rowRanges, [nextPicRow, nextCapRow])
    out = out.slice(0, tblStart) + nextTable + out.slice(tblEnd)
    return out
}

// ── linesegarray 제거 (내용이 바뀐 문단은 한글이 다시 조판하게 둔다) ──

const LINESEG_TAG = 'hp:linesegarray'

function stripOwnLineseg(paragraph) {
    const ranges = topLevelRanges(paragraph, LINESEG_TAG)
    return rebuild(paragraph, ranges, ranges.map(() => ''))
}

/** 토큰이 직접 들어 있는 문단만 골라 자기 linesegarray를 지운다(바깥 문단은 건드리지 않는다). */
function stripLinesegOfTokenParagraphs(xml) {
    let out = ''
    let i = 0
    for (;;) {
        const start = indexOfTag(xml, 'hp:p', i)
        if (start < 0) return out + xml.slice(i)
        const end = matchEnd(xml, 'hp:p', start)
        out += xml.slice(i, start) + transformParagraphTree(xml.slice(start, end))
        i = end
    }
}

function transformParagraphTree(paragraph) {
    const openEnd = paragraph.indexOf('>') + 1
    const closeStart = paragraph.lastIndexOf('</hp:p>')
    const inner = paragraph.slice(openEnd, closeStart)
    const childRanges = topLevelRanges(inner, 'hp:p')
    const ownText = rebuild(inner, childRanges, childRanges.map(() => ''))
    let next = stripLinesegOfTokenParagraphs(inner)
    if (ownText.includes('{{')) next = stripOwnLineseg(next)
    return paragraph.slice(0, openEnd) + next + '</hp:p>'
}

// ── section0.xml 전체 변환 ──

const TOP_PARAGRAPH_COUNT = 5

function sanitizeSection(section) {
    const openEnd = section.indexOf('>', section.indexOf('<hs:sec')) + 1
    const closeStart = section.lastIndexOf('</hs:sec>')
    if (openEnd <= 0 || closeStart < 0) fail('section0 루트')
    const body = section.slice(openEnd, closeStart)
    const ranges = topLevelRanges(body, 'hp:p')
    if (ranges.length !== TOP_PARAGRAPH_COUNT) fail('section0 최상위 문단 수')
    const paragraphs = sliceAll(body, ranges)

    const titleHits = textMatches(paragraphs[0]).filter(m => m[1].endsWith('보고'))
    if (titleHits.length !== 1) fail('제목')
    const next = [
        replaceTextByIncludes(paragraphs[0], titleHits[0][1], '{{TITLE}}', '제목'),
        transformOuterTableParagraph(paragraphs[1]),
        transformPhotoHeaderParagraph(paragraphs[2]),
        transformPhotoTableParagraph(paragraphs[3], 1),
        transformPhotoTableParagraph(paragraphs[4], 2),
    ]

    let out = section.slice(0, openEnd) + rebuild(body, ranges, next) + section.slice(closeStart)
    out = stripLinesegOfTokenParagraphs(out)
    return out.replace(/pageBreak="CELL"/g, 'pageBreak="NONE"')
}

// ── 부속 파일 정리 ──

function sanitizeContentHpf(hpf) {
    let out = hpf.replace(/<opf:item id="image\d+"[^>]*\/>/g, '')
    out = out.replace(/(<opf:title>)[\s\S]*?(<\/opf:title>)/, '$1사고발생보고$2')
    for (const name of ['creator', 'lastsaveby', 'CreatedDate', 'ModifiedDate', 'date']) {
        const pattern = new RegExp(`(<opf:meta name="${name}"[^>]*>)[\\s\\S]*?(</opf:meta>)`, 'g')
        out = out.replace(pattern, '$1$2')
    }
    return out
}

// ── 자체 검증 ──

const TOKENS = [
    '{{TITLE}}', '{{REPORT_DATE}}', '{{REPORTER}}', '{{REPORTER_PHONE}}', '{{SUMMARY}}',
    '{{DISTRICT}}', '{{ACCIDENT_DATETIME}}', '{{LOCATION}}', '{{CASUALTIES}}', '{{VICTIM_DETAILS}}', '{{PROPERTY_DAMAGE}}',
    '{{ACCIDENT_DETAILS}}', '{{NOTIFY_119}}', '{{NOTIFY_POLICE}}', '{{NOTIFY_LABOR}}', '{{NOTIFY_FAMILY}}',
    '{{NO_NOTIFICATION_REASON}}', '{{ACT_HOSPITAL}}', '{{ACT_FUNERAL}}', '{{ACT_HOME}}',
    '{{COMPENSATION}}', '{{COMPENSATION_MORE}}', '{{ACTION_DETAILS}}', '{{OTHER_NOTES}}', '{{CONTACTS}}',
    '{{PHOTO_TITLE}}', '{{PHOTO_1}}', '{{PHOTO_2}}', '{{CAPTION_1}}', '{{CAPTION_2}}',
]

const PHONE_PATTERN = /\d{2,3}-\d{3,4}-\d{4}/

function countOf(xml, needle) {
    return xml.split(needle).length - 1
}

function attributeSequence(xml, pattern) {
    return [...xml.matchAll(pattern)].map(m => m[0]).join('|')
}

/** 표 격자 지문 — 셀 크기·주소·병합과 표 폭이 원본과 한 글자도 달라지면 안 된다. */
function gridFingerprint(xml) {
    return [
        attributeSequence(xml, /<hp:cellSz width="\d+" height="\d+"\/>/g),
        attributeSequence(xml, /<hp:cellAddr colAddr="\d+" rowAddr="\d+"\/>/g),
        attributeSequence(xml, /<hp:cellSpan colSpan="\d+" rowSpan="\d+"\/>/g),
        [...xml.matchAll(/<hp:tbl [^>]*>\s*<hp:sz width="(\d+)"/g)].map(m => m[1]).join('|'),
    ].join('\n')
}

function verify(originalSection, section, hpf, prvText) {
    for (const token of TOKENS) {
        const count = countOf(section, token)
        if (count !== 1) throw new Error(`자리표시자 ${token}가 ${count}개다`)
    }
    for (const [needle, label] of [['<hp:pic', '그림'], ['<hp:ellipse', '도형'], ['BinData/', '이미지 참조']]) {
        if (countOf(section, needle) !== 0) throw new Error(`양식에 ${label}가 남았다`)
    }
    if (countOf(hpf, 'BinData/') !== 0) throw new Error('content.hpf에 이미지 항목이 남았다')
    if (countOf(section, 'pageBreak="CELL"') !== 0) throw new Error('pageBreak="CELL"이 남았다')
    for (const [text, label] of [[section, 'section0'], [hpf, 'content.hpf'], [prvText, 'PrvText']]) {
        if (PHONE_PATTERN.test(text)) throw new Error(`${label}에 전화번호가 남았다`)
    }
    if (countOf(section, '<hp:tbl ') !== countOf(originalSection, '<hp:tbl ')) throw new Error('표 개수가 달라졌다')
    if (gridFingerprint(section) !== gridFingerprint(originalSection)) throw new Error('표 격자가 달라졌다')
}

// ── 공개 API ──

const BINARY_PREFIX = 'BinData/'
const PREVIEW_IMAGE = 'Preview/PrvImage.png'
const PRV_TEXT = '사고발생보고'

/**
 * 원본 hwpx 바이트를 받아 값 자리표시자만 남은 양식 hwpx 바이트를 돌려준다.
 * @param {Uint8Array | ArrayBuffer} source
 * @returns {Promise<Uint8Array>}
 */
export async function sanitizeAccidentReportTemplate(source) {
    const zip = await JSZip.loadAsync(source)
    const sectionFile = zip.file('Contents/section0.xml')
    const hpfFile = zip.file('Contents/content.hpf')
    const headerFile = zip.file('Contents/header.xml')
    if (!sectionFile || !hpfFile || !headerFile) fail('hwpx 패키지 구성')

    const originalSection = await sectionFile.async('string')
    const section = sanitizeSection(originalSection)
    const hpf = sanitizeContentHpf(await hpfFile.async('string'))
    const originalHeader = await headerFile.async('uint8array')
    verify(originalSection, section, hpf, PRV_TEXT)

    const order = []
    zip.forEach((path, entry) => { if (!entry.dir) order.push(path) })

    const out = new JSZip()
    out.file('mimetype', await zip.file('mimetype').async('uint8array'), { compression: 'STORE', createFolders: false })
    const deflate = { compression: 'DEFLATE', createFolders: false }
    for (const path of order) {
        if (path === 'mimetype' || path === PREVIEW_IMAGE || path.startsWith(BINARY_PREFIX)) continue
        if (path === 'Contents/section0.xml') out.file(path, section, deflate)
        else if (path === 'Contents/content.hpf') out.file(path, hpf, deflate)
        else if (path === 'Preview/PrvText.txt') out.file(path, PRV_TEXT, deflate)
        else out.file(path, await zip.file(path).async('uint8array'), deflate)
    }

    const bytes = await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const check = await JSZip.loadAsync(bytes)
    const writtenHeader = await check.file('Contents/header.xml').async('uint8array')
    if (Buffer.compare(Buffer.from(writtenHeader), Buffer.from(originalHeader)) !== 0) {
        throw new Error('header.xml이 원본과 다르다')
    }
    return bytes
}

async function main() {
    const [input, output] = process.argv.slice(2)
    if (!input || !output) {
        throw new Error('사용법: node scripts/accident-report-template.mjs <원본.hwpx> <출력.hwpx>')
    }
    const bytes = await sanitizeAccidentReportTemplate(await readFile(input))
    await writeFile(output, bytes)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main()
}
