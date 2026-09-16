// 사용자가 확정한 사고발생보고 양식 hwpx를 열어 값만 치환·복제해 내려받는 모듈
import JSZip from 'jszip'
import { topLevelRanges, rebuild, stripLineseg } from './accident-report-xml'
import { fitReportSection, paragraphHeight, bodyParaPr, appendBodyParagraphStyles, type BodyFormat } from './accident-report-layout'
import type { ProjectAccident } from '@/lib/accident-analysis-types'
import { normalizeAccidentReportDetails, type AccidentReportDetails } from '@/lib/accident-report'
import { cleanAccidentReportContent } from '@/lib/accident-report-content'
import { compClaimLabel, severityLabel } from '@/lib/accident-report-format'

// ── 공통 헬퍼 (TBM 정본 모듈에서 복사) ──

function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
}

interface ImageEntry {
    id: string
    filename: string
    data: Uint8Array
    ext: string
    wPx?: number   // 원본 픽셀 크기(측정 가능한 환경에서만) — 사진 비율 유지 배치에 사용
    hPx?: number
}

async function fetchImageAsBuffer(url: string, raw: boolean): Promise<{ data: Uint8Array; ext: string; wPx?: number; hPx?: number } | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        let blob = await res.blob()
        if (!raw) {
            const normalized = await normalizeImageBlob(blob)
            if (normalized) blob = normalized
        }
        let wPx: number | undefined
        let hPx: number | undefined
        if (typeof document !== 'undefined') {
            try {
                const img = await loadImageFromBlob(blob)
                wPx = img.naturalWidth || undefined
                hPx = img.naturalHeight || undefined
            } catch { /* 측정 실패 시 비율 유지 없이 칸 채움 */ }
        }
        const buf = await blob.arrayBuffer()
        const mime = (blob.type || '').toLowerCase()
        const ext = mime.includes('png') ? 'png' : 'jpg'
        return { data: new Uint8Array(buf), ext, wPx, hPx }
    } catch {
        return null
    }
}

async function normalizeImageBlob(blob: Blob): Promise<Blob | null> {
    if (typeof document === 'undefined') return null
    try {
        const image = await loadImageFromBlob(blob)
        const maxEdge = 1200
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    } catch {
        return null
    }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
        img.src = url
    })
}

class ImageCollector {
    private idx = 0
    images: ImageEntry[] = []

    // raw=true: 정규화 없이 원본 바이트 유지. raw=false: 흰 배경 JPEG로 정규화(사진).
    async collect(url: string | null | undefined, raw = false): Promise<string | null> {
        if (!url || !url.trim() || url.trim() === 'N/A') return null
        const img = await fetchImageAsBuffer(url, raw)
        if (!img) return null
        this.idx++
        const id = `image${this.idx}`
        const filename = `${id}.${img.ext}`
        this.images.push({ id, filename, data: img.data, ext: img.ext, wPx: img.wPx, hPx: img.hPx })
        return id
    }

    find(id: string | null): ImageEntry | null {
        return id ? this.images.find(img => img.id === id) ?? null : null
    }
}

// 그림 개체 일련번호. id/instid는 문서 내 유일해야 하며, 필수 자식 요소가 빠지면 한글 2020이 열다 죽는다.
let _picSeq = 0
function resetPicSeq(): void { _picSeq = 0 }

// 한글이 직접 저장한 hwpx의 hp:pic 구조를 그대로 답습한 공통 골격 (요소 순서 포함 — 변경 금지)
function buildPicXml(binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
    _picSeq++
    const id = 1149648000 + _picSeq
    const instid = 75906000 + _picSeq
    const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
    return `<hp:pic id="${id}" zOrder="${10 + _picSeq}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

// 셀 안에 넣는 인라인 그림 (사진용, 최종 크기를 직접 지정)
function buildInlinePicXml(binItemId: string, imgW: number, imgH: number): string {
    const pos = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    return buildPicXml(binItemId, Math.max(1, imgW), Math.max(1, imgH), 'TOP_AND_BOTTOM', pos)
}

/** 원본 비율을 유지해 주어진 공간에 맞춘다. 크기 측정 불가 환경은 공간 채움. */
function fitPhoto(entry: ImageEntry | null, availW: number, availH: number): { w: number; h: number } {
    if (!entry?.wPx || !entry?.hPx) return { w: availW, h: availH }
    const scale = Math.min(availW / entry.wPx, availH / entry.hPx)
    return { w: Math.max(1, Math.round(entry.wPx * scale)), h: Math.max(1, Math.round(entry.hPx * scale)) }
}

// ── 날짜 표기 ──

const SEOUL_TIME_ZONE = 'Asia/Seoul'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** YYYY-MM-DD → "2026. 09. 15.(화)". 형식이 아니면 '-' */
function fmtDate(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
    if (!m) return '-'
    const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return '-'
    return `${m[1]}. ${m[2]}. ${m[3]}.(${WEEKDAYS[date.getUTCDay()]})`
}

/** 사고일시(ISO)를 서울 기준 "2026. 09. 15.(화)"로. 값이 잘못됐으면 '-' */
function fmtAccidentDate(iso: string | null | undefined): string {
    if (!iso) return '-'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '-'
    return fmtDate(seoulYmd(date))
}

/** 서울 기준 YYYY-MM-DD */
function seoulYmd(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: SEOUL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date)
}

// ── 값 치환 ──

export const ACCIDENT_REPORT_TEMPLATE_PATH = '/사고발생보고_양식.hwpx'

const MIMETYPE = 'application/hwp+zip'
const CHECKED = '\uF0FE'
const UNCHECKED = '\uF06F'

/** 문단 복제 한 줄. text는 토큰이 든 `<hp:t>` 전체를, inline은 토큰 자리만 대체한다. */
interface ParagraphEntry {
    pre?: string
    text?: string
    inline?: string
    paraPr?: number
    charPr?: number
}

function paragraphRegex(token: string): RegExp {
    return new RegExp(`<hp:p [^>]*>(?:(?!<hp:p |</hp:p>).)*?${token}(?:(?!<hp:p ).)*?</hp:p>`, 's')
}

function findParagraph(xml: string, token: string): { source: string; index: number } {
    const m = paragraphRegex(token).exec(xml)
    if (!m) throw new Error(`사고발생보고 양식에서 ${token} 자리를 찾지 못했습니다.`)
    return { source: m[0], index: m.index }
}

/** 토큰이 든 문단을 entries 수만큼 복제한다. entries가 비면 그 문단을 지운다. */
function expandParagraph(xml: string, token: string, entries: ParagraphEntry[]): string {
    const { source, index } = findParagraph(xml, token)
    const copies = entries.map(entry => fillParagraph(source, token, entry)).join('')
    return xml.slice(0, index) + copies + xml.slice(index + source.length)
}

function fillParagraph(source: string, token: string, entry: ParagraphEntry): string {
    const at = source.indexOf(token)
    const textStart = source.lastIndexOf('<hp:t>', at)
    const textEnd = source.indexOf('</hp:t>', at) + '</hp:t>'.length
    if (textStart < 0 || textEnd < textStart) throw new Error(`${token} 문단 구조가 예상과 다릅니다.`)

    const edits: Array<[number, number, string]> = []
    if (entry.inline !== undefined) {
        edits.push([at, at + token.length, esc(entry.inline)])
    } else {
        edits.push([textStart, textEnd, `<hp:t>${esc(entry.text ?? '')}</hp:t>`])
    }
    if (entry.pre !== undefined) {
        const runStart = source.lastIndexOf('<hp:run ', textStart)
        const prevRun = runStart > 0 ? source.lastIndexOf('<hp:run ', runStart - 1) : -1
        if (prevRun < 0) throw new Error(`${token} 앞 run을 찾지 못했습니다.`)
        const preStart = source.indexOf('<hp:t>', prevRun)
        if (preStart < 0 || preStart > runStart) throw new Error(`${token} 앞 run에 글머리가 없습니다.`)
        const preEnd = source.indexOf('</hp:t>', preStart) + '</hp:t>'.length
        edits.push([preStart, preEnd, `<hp:t>${esc(entry.pre)}</hp:t>`])
    }

    edits.sort((a, b) => b[0] - a[0])
    let out = source
    for (const [start, end, next] of edits) out = out.slice(0, start) + next + out.slice(end)
    if (entry.paraPr !== undefined) out = out.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${entry.paraPr}"`)
    if (entry.charPr !== undefined) out = out.replace(/(<hp:run charPrIDRef=")\d+/g, `$1${entry.charPr}`)
    return stripLineseg(out)
}

function replaceToken(xml: string, token: string, value: string): string {
    if (!xml.includes(token)) throw new Error(`사고발생보고 양식에서 ${token} 자리를 찾지 못했습니다.`)
    return xml.replace(token, () => esc(value))
}

/** 고정 머리·체크줄도 글자 공백 대신 문단 여백으로 이어줄을 정렬한다. */
function alignFixedParagraph(xml: string, token: string, format: BodyFormat): string {
    const { source, index } = findParagraph(xml, token)
    let leading = true
    const paragraph = stripLineseg(source.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${bodyParaPr(format)}"`)
        .replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (_all, text: string) => {
            const trimmed = leading ? text.trimStart() : text
            if (trimmed) leading = false
            return `<hp:t>${trimmed}</hp:t>`
        }))
    return xml.slice(0, index) + paragraph + xml.slice(index + source.length)
}

/** 플랫폼별 개행을 통일하며 입력 문단 사이 빈 줄과 공백은 보존한다. */
function valueLines(value: string | null | undefined): string[] {
    return value?.trim() ? value.replace(/\r\n?/g, '\n').split('\n') : []
}

/** 자동 줄바꿈과 명시 개행 모두 같은 본문 시작 위치를 사용한다. */
function bodyEntries(value: string | null | undefined, format: BodyFormat, prefix = '', charPr = 17): ParagraphEntry[] {
    const lines = valueLines(value)
    return (lines.length ? lines : ['-']).map((line, index) => ({
        text: `${index === 0 ? prefix : ''}${line}`,
        paraPr: bodyParaPr(format, index > 0), charPr,
    }))
}

// ── 사진 ──

const PHOTO_AVAIL_WIDTH = 47337 - 510 * 2
const PHOTO_SLOTS = 2

interface PhotoItem {
    id: string
    caption: string
}

function applyPhotos(section: string, collector: ImageCollector, items: PhotoItem[]): string {
    let out = section
    for (let slot = 1; slot <= PHOTO_SLOTS; slot++) {
        const item = items[slot - 1] ?? null
        const captionToken = `{{CAPTION_${slot}}}`
        const captionParagraph = findParagraph(out, captionToken).source
        const captionLines = valueLines(item?.caption).map(line => ({ inline: line }))
        const captionHeight = Math.max(3142, 782 + captionLines.reduce((sum, line) =>
            sum + paragraphHeight(fillParagraph(captionParagraph, captionToken, line), 36849 - 1020), 0))
        // 설명이 길면 같은 사진대지 전체 높이 안에서 사진 칸 높이를 내준다.
        const photoHeight = 30032 - captionHeight
        const tableRange = topLevelRanges(out, 'hp:tbl').find(([start, end]) => out.slice(start, end).includes(captionToken))
        if (!tableRange || photoHeight < 3000) throw new Error('사진 설명을 사진대지 안에 배치하지 못했습니다.')
        const table = out.slice(...tableRange)
        let row = 0
        const resized = table.replace(/(<hp:cellSz width="\d+" height=")\d+/g, (_all, before: string) =>
            `${before}${row++ === 0 ? photoHeight : captionHeight}`)
        out = rebuild(out, [tableRange], [stripLineseg(resized)])
        const placeholder = `<hp:run charPrIDRef="0"><hp:t>{{PHOTO_${slot}}}</hp:t></hp:run>`
        if (!out.includes(placeholder)) throw new Error(`사고발생보고 양식의 사진 ${slot} 자리를 찾지 못했습니다.`)
        let run = '<hp:run charPrIDRef="0"><hp:t/></hp:run>'
        if (item) {
            const fit = fitPhoto(collector.find(item.id), PHOTO_AVAIL_WIDTH, photoHeight - 282)
            run = `<hp:run charPrIDRef="0">${buildInlinePicXml(item.id, fit.w, fit.h)}<hp:t/></hp:run>`
        }
        out = out.replace(placeholder, () => run)
        out = expandParagraph(out, captionToken, captionLines.length ? captionLines : [{ inline: '' }])
    }
    return out
}

// ── 값 채우기 ──

function fillSingleValues(section: string, accident: ProjectAccident, details: AccidentReportDetails, projectName: string): string {
    const project = projectName || accident.external_project_name || ''
    const fatal = accident.severity === 'fatal'
    const fallbackTitle = `${project} 사고(${fatal ? '사망' : '부상'}) 발생 보고`.trim()
    const reporter = `${details.reporterPosition} ${details.reporterName}`.trim() || '-'
    const phone = details.reporterPhone.trim()
    const time = details.accidentTime.trim()

    let out = section
    out = replaceToken(out, '{{TITLE}}', details.reportTitle.trim() || fallbackTitle)
    out = replaceToken(out, '{{REPORT_DATE}}', fmtDate(details.reportDate.trim() || seoulYmd(new Date())))
    out = replaceToken(out, '{{REPORTER}}', reporter)
    out = replaceToken(out, '{{REPORTER_PHONE}}', phone ? `(${phone})` : '')
    out = expandParagraph(out, '{{DISTRICT}}', bodyEntries(project, 'district', '○ 지구 : '))
    out = expandParagraph(out, '{{ACCIDENT_DATETIME}}', bodyEntries(`${fmtAccidentDate(accident.accident_at)}${time ? `  ${time}경` : ''}`, 'date', '○ 일시 : '))
    out = expandParagraph(out, '{{LOCATION}}', bodyEntries(accident.location, 'location', '○ 장소 : '))
    out = alignFixedParagraph(out, '{{CASUALTIES}}', 'bullet')
    out = replaceToken(out, '{{CASUALTIES}}', ` (${casualtySummary(accident)})`)
    out = replaceToken(out, '{{PHOTO_TITLE}}', `${fatal ? '사망' : '부상'}사고 발생 현장 사진`)

    const mark = (on: boolean) => (on ? CHECKED : UNCHECKED)
    const notified = (value: string) => (details.notifications as readonly string[]).includes(value)
    const acted = (value: string) => (details.victimActions as readonly string[]).includes(value)
    out = alignFixedParagraph(out, '{{NOTIFY_119}}', 'checks')
    out = alignFixedParagraph(out, '{{ACT_HOSPITAL}}', 'checks')
    out = replaceToken(out, '{{NOTIFY_119}}', mark(notified('emergency119')))
    out = replaceToken(out, '{{NOTIFY_POLICE}}', mark(notified('police')))
    out = replaceToken(out, '{{NOTIFY_LABOR}}', mark(notified('laborOffice')))
    out = replaceToken(out, '{{NOTIFY_FAMILY}}', mark(notified('family')))
    out = replaceToken(out, '{{ACT_HOSPITAL}}', mark(acted('hospital')))
    out = replaceToken(out, '{{ACT_FUNERAL}}', mark(acted('funeralHome')))
    out = replaceToken(out, '{{ACT_HOME}}', mark(acted('home')))
    return out
}

function summaryEntries(details: AccidentReportDetails): ParagraphEntry[] {
    return bodyEntries(details.summary, 'summary', '○ ')
}

function victimEntries(details: AccidentReportDetails): ParagraphEntry[] {
    const lines = valueLines(details.victimDetails)
    const body = lines.length === 0 ? ['-'] : lines
    const treatment = details.expectedTreatmentDays === '' ? [] : [`산재요양 예상 ${details.expectedTreatmentDays}일`]
    return [...body, ...treatment].map(line => ({ text: line, paraPr: bodyParaPr('victim'), charPr: 17 }))
}

/** 통계 컬럼(인명피해 수·사고유형·중대도)은 양식에 없는 정보라 `○ 피해자 인적사항` 줄 끝에 괄호로 붙인다(줄을 늘리지 않는다). */
function casualtySummary(accident: ProjectAccident): string {
    return `부상 ${accident.injured_count}명 / 사망 ${accident.fatal_count}명 / 휴업 ${accident.lost_workdays}일`
        + ` · ${accident.accident_type || '-'} (${severityLabel(accident.severity)})`
}

function bulletEntries(value: string | null | undefined): ParagraphEntry[] {
    return bodyEntries(value, 'bullet', '○ ')
}

function accidentDetailEntries(accident: ProjectAccident, details: AccidentReportDetails): ParagraphEntry[] {
    const items: Array<[string, string | null | undefined]> = [
        ['작업내용', accident.work_description],
        ['사고내용', accident.description],
        ['사고원인', accident.cause],
        ['피해현황', details.damageDetails],
        ['귀책사유', details.responsibility],
    ]
    const entries: ParagraphEntry[] = []
    for (const [label, value] of items) {
        const lines = valueLines(value)
        if (lines.length === 0 && (label === '피해현황' || label === '귀책사유')) continue
        entries.push(...bodyEntries(value, 'detail', `○ ${label} : `).map(entry => ({ ...entry, pre: '' })))
    }
    return entries
}

function actionEntries(accident: ProjectAccident, details: AccidentReportDetails): ParagraphEntry[] {
    const entries = valueLines(details.actionDetails).length ? bodyEntries(details.actionDetails, 'detail', '○ 조치내용 : ') : []
    entries.push(...bodyEntries(accident.prevention_action, 'plan', '○ 향후 추진계획 : '))
    return entries
}

function fillMultilineValues(section: string, accident: ProjectAccident, details: AccidentReportDetails): string {
    // 특이사항 이어지는 줄에 쓸 평문 문단 서식을 먼저 떠 둔다(paraPr 21 / charPr 17)
    const plain = findParagraph(section, '{{VICTIM_DETAILS}}').source

    let out = section
    out = expandParagraph(out, '{{SUMMARY}}', summaryEntries(details))
    out = expandParagraph(out, '{{VICTIM_DETAILS}}', victimEntries(details))
    out = expandParagraph(out, '{{PROPERTY_DAMAGE}}', bulletEntries(details.propertyDamage))
    out = expandParagraph(out, '{{ACCIDENT_DETAILS}}', accidentDetailEntries(accident, details))

    out = expandParagraph(out, '{{NO_NOTIFICATION_REASON}}', bodyEntries(details.noNotificationReason, 'reason', '- 미신고 사유 : ').map(entry => ({ ...entry, pre: '' })))

    const compensation = valueLines(details.compensationDetails)
    const claim = `산재 ${compClaimLabel(accident.workers_comp_claim)}`
    const compensationText = compensation.length ? `${claim} / ${compensation.join('\n')}` : claim
    out = expandParagraph(out, '{{COMPENSATION}}', bodyEntries(compensationText, 'compensation', '- 산재보험처리 등 보상관련 : ').map(entry => ({ ...entry, pre: '' })))
    out = expandParagraph(out, '{{COMPENSATION_MORE}}', [])

    out = expandParagraph(out, '{{ACTION_DETAILS}}', actionEntries(accident, details))

    const notes = valueLines(details.otherNotes)
    const extra = notes.slice(1).map(line => fillParagraph(plain, '{{VICTIM_DETAILS}}', { text: line, paraPr: bodyParaPr('notes', true), charPr: 17 })).join('')
    if (extra !== '') {
        const found = findParagraph(out, '{{OTHER_NOTES}}')
        out = out.slice(0, found.index + found.source.length) + extra + out.slice(found.index + found.source.length)
    }
    out = expandParagraph(out, '{{OTHER_NOTES}}', [{ inline: notes[0] ?? '-', paraPr: bodyParaPr('notes') }])

    out = expandParagraph(out, '{{CONTACTS}}', bodyEntries(details.relatedContacts, 'contacts', '▸ ', 36))
    return out
}

// ── 최종 조립 ──

async function loadTemplate(): Promise<JSZip> {
    let response: Response
    try {
        response = await fetch(encodeURI(ACCIDENT_REPORT_TEMPLATE_PATH))
    } catch {
        throw new Error('사고발생보고 양식 파일을 불러오지 못했습니다.')
    }
    if (!response.ok) throw new Error('사고발생보고 양식 파일을 불러오지 못했습니다.')
    return JSZip.loadAsync(await response.arrayBuffer())
}

async function readText(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path)
    if (!file) throw new Error('사고발생보고 양식 파일을 불러오지 못했습니다.')
    return file.async('string')
}

/** 사고발생보고 hwpx를 양식 치환으로 만든다. */
export async function buildAccidentReportHwpx(accident: ProjectAccident, projectName: string): Promise<Blob> {
    resetPicSeq()
    const originalDetails = normalizeAccidentReportDetails(accident.report_details)
    const cleaned = cleanAccidentReportContent(accident, originalDetails)
    const details = { ...originalDetails, damageDetails: cleaned.damageDetails, actionDetails: cleaned.actionDetails }
    const outputAccident = { ...accident, description: cleaned.description }
    const template = await loadTemplate()
    let header = appendBodyParagraphStyles(await readText(template, 'Contents/header.xml'))
    const collector = new ImageCollector()

    const photoItems: PhotoItem[] = []
    for (const photo of details.photos.slice(0, PHOTO_SLOTS)) {
        const id = await collector.collect(photo.dataUrl, false)
        if (!id) throw new Error('첨부 사진을 불러오지 못했습니다. 사진을 확인하고 다시 내려받아 주세요.')
        photoItems.push({ id, caption: photo.caption })
    }

    let section = await readText(template, 'Contents/section0.xml')
    section = fillSingleValues(section, outputAccident, details, projectName)
    section = fillMultilineValues(section, outputAccident, details)
    section = applyPhotos(section, collector, photoItems)
    const fitted = fitReportSection(section, header)
    section = fitted.section
    header = fitted.header

    const imageItems = collector.images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')
    const hpf = (await readText(template, 'Contents/content.hpf'))
        .replace('<opf:item id="section0"', () => `${imageItems}<opf:item id="section0"`)

    const order: string[] = []
    template.forEach((path, entry) => { if (!entry.dir) order.push(path) })

    // OWPML zip 조립 (mimetype은 반드시 첫 항목 + 비압축 STORE)
    const zip = new JSZip()
    zip.file('mimetype', MIMETYPE, { compression: 'STORE', createFolders: false })
    const deflate = { compression: 'DEFLATE' as const, createFolders: false }
    for (const path of order) {
        if (path === 'mimetype') continue
        if (path === 'Contents/section0.xml') zip.file(path, section, deflate)
        else if (path === 'Contents/header.xml') zip.file(path, header, deflate)
        else if (path === 'Contents/content.hpf') zip.file(path, hpf, deflate)
        else zip.file(path, await template.file(path)!.async('uint8array'), deflate)
    }
    for (const img of collector.images) zip.file(`BinData/${img.filename}`, img.data, deflate)

    return zip.generateAsync({
        type: 'blob',
        mimeType: MIMETYPE,
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    })
}

/** 사고발생보고를 한글문서(hwpx)로 내려받는다. */
export async function downloadAccidentReportHwpx(accident: ProjectAccident, projectName: string): Promise<void> {
    const blob = await buildAccidentReportHwpx(accident, projectName)
    const details = normalizeAccidentReportDetails(accident.report_details)
    const accidentDate = accident.accident_at && !Number.isNaN(new Date(accident.accident_at).getTime())
        ? seoulYmd(new Date(accident.accident_at))
        : ''
    const base = (projectName || accident.external_project_name || '사고보고').replace(/[\\/:*?"<>|]/g, '_')
    triggerDownload(blob, `${base}_사고발생보고_${details.reportDate.trim() || accidentDate}.hwpx`)
}
