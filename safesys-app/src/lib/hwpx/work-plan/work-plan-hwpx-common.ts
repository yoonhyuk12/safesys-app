// AI 작업계획서 5종 HWPX 공용 헬퍼 — OWPML 패키지 조립·표/문단 빌더·이미지 수집·공용 섹션(표지·결재란·검토표 등)
import JSZip from 'jszip'
import {
    WORK_PLAN_COVERS,
    MAP_LEGEND,
    MAP_FOCUS_ITEMS,
    MAP_FOOTNOTE,
    LIFTING_CAPACITY_NOTES,
    LIFTING_CAPACITY_FORMULA,
    RIGGING_CAPACITY_FORMULA,
    RIGGING_SAFETY_RATIO_FORMULA,
    CAPACITY_WARNING,
    SAFETY_FACTORS,
    TENSION_FACTORS,
} from '@/lib/work-plan/constants'
import type {
    ChecklistAnswer,
    ChecklistResult,
    LiftingCapacityReview,
    PlanType,
    RiggingCapacityReview,
    RiskControlRow,
    WorkPlanApprovalNames,
} from '@/lib/work-plan/types'

// ── 기본 유틸 ──

export function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function triggerDownload(blob: Blob, fileName: string): void {
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

// ── 이미지 수집 ──

export interface ImageEntry {
    id: string
    filename: string
    data: Uint8Array
    ext: string
    wPx?: number   // 원본 픽셀 크기(측정 가능한 환경에서만) — 비율 유지 배치에 사용
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
            } catch { /* 측정 실패 시 비율 유지 없이 셀 채움 */ }
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

export class ImageCollector {
    private idx = 0
    images: ImageEntry[] = []

    // raw=true: 정규화 없이 원본 바이트 유지(서명 PNG 투명도 보존). raw=false: 흰 배경 JPEG로 정규화(사진·지도).
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

// 원본 픽셀 비율을 유지하며 maxW×maxH 상자에 맞춘 크기(HWPUNIT). 측정 불가면 상자 채움.
export function fitImage(entry: ImageEntry | null, maxW: number, maxH: number): { w: number; h: number } {
    if (entry?.wPx && entry?.hPx) {
        const scale = Math.min(maxW / entry.wPx, maxH / entry.hPx)
        return { w: Math.max(1, Math.round(entry.wPx * scale)), h: Math.max(1, Math.round(entry.hPx * scale)) }
    }
    return { w: maxW, h: maxH }
}

// ── 그림 개체 XML ──
// id/instid는 문서 내 유일해야 하며, 필수 자식 요소가 빠지면 한글 2020이 열다 죽는다.

let _picSeq = 0

// 한글이 직접 저장한 hwpx의 hp:pic 구조를 그대로 답습한 공통 골격 (요소 순서 포함, TBM 정본)
function buildPicXml(binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
    _picSeq++
    const id = 1149648000 + _picSeq
    const instid = 75906000 + _picSeq
    const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
    return `<hp:pic id="${id}" zOrder="${10 + _picSeq}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

// 셀 안에 넣는 인라인 그림 (사진·지도용, 최종 크기를 직접 지정)
export function buildInlinePicXml(binItemId: string, imgW: number, imgH: number): string {
    const pos = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    return buildPicXml(binItemId, Math.max(1, imgW), Math.max(1, imgH), 'TOP_AND_BOTTOM', pos)
}

// 성명·"(서명)" 문구 위에 겹치는 떠 있는 그림(서명용). 쪽(PAPER) 기준 절대 좌표라 표 밖 돌출도 허용된다.
// textWrap은 반드시 IN_FRONT_OF_TEXT(글 앞으로) — THROUGH는 한글 2020이 자리차지로 처리해 표를 밀어낸다.
export function buildFloatingPicXml(binItemId: string, imgW: number, imgH: number, xPaper: number, yPaper: number): string {
    const pos = `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${yPaper}" horzOffset="${xPaper}"/>`
    return buildPicXml(binItemId, imgW, imgH, 'IN_FRONT_OF_TEXT', pos)
}

// ── OWPML 부속 파일(고정 보일러플레이트) ──

const MIMETYPE = 'application/hwp+zip'

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 7936 WIN32LEWindows_10"/>`

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`

const CONTAINER_RDF = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 본문 폭(HWPUNIT): 59528 - 좌우여백 15mm(4252)*2
export const CONTENT_WIDTH = 51024
// A4 세로 본문 세로: 84188 - 상하 (여백 3600 + 머리말/꼬리말 3600)*2
export const CONTENT_HEIGHT = 69788
// 쪽 기준 절대좌표 원점 — 왼쪽 여백, 본문 시작(위 여백 3600 + 머리말 3600)
export const PAGE_LEFT = 4252
export const PAGE_CONTENT_TOP = 7200
// 10pt 기준 줄 전진 높이(130%)와 셀 상하 패딩
export const LINE_H = 1300
export const CELL_PAD = 282

// 첫 문단에 들어가는 구역 속성(A4 세로)
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="3600" footer="3600" gutter="0" left="4252" right="4252" top="3600" bottom="3600"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// ── header.xml 조립 ──
// borderFill: 1=테두리없음, 2=실선 사방테두리(셀), 3=실선+회색채움(머리셀), 4=두꺼운 실선 사방(표지 제목 상자)
// charPr(및 CP_HEIGHT): 0=본문10, 1=굵게10, 2=제목16굵게, 3=작게7, 4=굵게9, 5=굵게11, 6=굵게12,
//   7=본문9, 8=표지제목20굵게, 9=파랑9, 10=본문11, 11=파랑10굵게

export const CP_HEIGHT: Record<number, number> = { 0: 1000, 1: 1000, 2: 1600, 3: 700, 4: 900, 5: 1100, 6: 1200, 7: 900, 8: 2000, 9: 900, 10: 1100, 11: 1000 }

function buildFontfaces(): string {
    const langs = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']
    const one = (lang: string) =>
        `<hh:fontface lang="${lang}" fontCnt="1"><hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font></hh:fontface>`
    return `<hh:fontfaces itemCnt="7">${langs.map(one).join('')}</hh:fontfaces>`
}

function buildBorderFills(): string {
    const none = `<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`
    const solid = `<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.12 mm" color="#000000"/></hh:borderFill>`
    const header = `<hh:borderFill id="3" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.12 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="#F0F0F0" hatchColor="#000000" alpha="0"/></hc:fillBrush></hh:borderFill>`
    const thick = `<hh:borderFill id="4" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.5 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.5 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.5 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.5 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.12 mm" color="#000000"/></hh:borderFill>`
    return `<hh:borderFills itemCnt="4">${none}${solid}${header}${thick}</hh:borderFills>`
}

function buildCharPr(id: number, height: number, bold: boolean, color = '#000000'): string {
    return `<hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>`
}

function buildCharProperties(): string {
    const items = [
        buildCharPr(0, 1000, false),
        buildCharPr(1, 1000, true),
        buildCharPr(2, 1600, true),
        buildCharPr(3, 700, false),
        buildCharPr(4, 900, true),
        buildCharPr(5, 1100, true),
        buildCharPr(6, 1200, true),
        buildCharPr(7, 900, false),
        buildCharPr(8, 2000, true),
        buildCharPr(9, 900, false, '#0000C0'),
        buildCharPr(10, 1100, false),
        buildCharPr(11, 1000, true, '#0000C0'),
    ].join('')
    return `<hh:charProperties itemCnt="12">${items}</hh:charProperties>`
}

function buildParaPr(id: number, align: string, borderFill = 1, connect = 0): string {
    const margin = `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>`
    const sw = `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:case><hp:default>${margin}<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:default></hp:switch>`
    // 테두리를 쓰는 문단만 상하 1mm 여백을 둬 글자와 선이 붙지 않게 한다
    const off = borderFill === 1 ? 0 : 283
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/>${sw}<hh:border borderFillIDRef="${borderFill}" offsetLeft="0" offsetRight="0" offsetTop="${off}" offsetBottom="${off}" connect="${connect}" ignoreMargin="0"/></hh:paraPr>`
}

// paraPr 0~2 = 테두리 없음(왼쪽·가운데·오른쪽), 3~5 = 같은 정렬에 표지 사각 테두리(이어진 문단 연결)
const BOXED_PP_OFFSET = 3

function buildParaProperties(): string {
    const items = [
        buildParaPr(0, 'LEFT'), buildParaPr(1, 'CENTER'), buildParaPr(2, 'RIGHT'),
        buildParaPr(3, 'LEFT', 4, 1), buildParaPr(4, 'CENTER', 4, 1), buildParaPr(5, 'RIGHT', 4, 1),
    ].join('')
    return `<hh:paraProperties itemCnt="6">${items}</hh:paraProperties>`
}

function buildNumberings(): string {
    const heads = Array.from({ length: 7 }, (_, i) => {
        const lv = i + 1
        return `<hh:paraHead start="1" level="${lv}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^${lv}.</hh:paraHead>`
    }).join('')
    return `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">${heads}</hh:numbering></hh:numberings>`
}

function buildHeaderXml(): string {
    const open = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head ${SEC_XMLNS} version="1.4" secCnt="1">`
    const begin = `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>`
    const tabProps = `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>`
    const styles = `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>`
    const memo = `<hh:memoProperties itemCnt="1"><hh:memoPr id="1" width="15591" lineWidth="1" lineType="SOLID" lineColor="#000000" fillColor="#CCFF99" activeColor="#FFFF99" memoType="NOMAL"/></hh:memoProperties>`
    const refList = `<hh:refList>${buildFontfaces()}${buildBorderFills()}${buildCharProperties()}${tabProps}${buildNumberings()}${buildParaProperties()}${styles}${memo}</hh:refList>`
    const tail = `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:trackchageConfig flags="56"/></hh:head>`
    return `${open}${begin}${refList}${tail}`
}

function buildContentHpf(docTitle: string, imageItems: string): string {
    const open = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><opf:package ${SEC_XMLNS} version="" unique-identifier="" id="">`
    const meta = `<opf:metadata><opf:title>${esc(docTitle)}</opf:title><opf:language>ko</opf:language></opf:metadata>`
    const manifest = `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>${imageItems}</opf:manifest>`
    const spine = `<opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0" linear="yes"/></opf:spine>`
    return `${open}${meta}${manifest}${spine}</opf:package>`
}

// ── 문단·표 조립 ──

let _idSeq = 2147483648
function nextId(): string { return String(_idSeq++) }

// 새 문서 조립을 시작할 때 호출 — 그림·문단 일련번호 초기화
export function resetHwpxSeqs(): void {
    _picSeq = 0
    _idSeq = 2147483648
}

function lineseg(width: number, height: number): string {
    return `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${height}" textheight="${height}" baseline="${Math.round(height * 0.85)}" spacing="${Math.round(height * 0.35)}" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>`
}

export type CellAlign = 'left' | 'center' | 'right'

export interface Cell {
    text?: string
    bodyXml?: string       // 셀 본문을 직접 지정(문단 XML) — innerParagraph/innerPicParagraph로 조립
    span?: number          // colSpan (기본 1)
    rowSpan?: number       // rowSpan (세로 병합, 기본 1) — 높이는 병합된 행 높이 합으로 자동 산출
    header?: boolean       // 회색 머리셀 여부
    bf?: number            // borderFill id 직접 지정(무테=1, 실선=2, 머리=3, 두꺼운 실선=4)
    cp?: number            // charPrIDRef (기본 0)
    align?: CellAlign      // 가로 정렬 (기본 left)
    top?: boolean          // 세로 위 정렬(기본 가운데)
    picId?: string | null  // 인라인 그림(사진·지도)
    picW?: number          // 인라인 그림 너비(HWPUNIT, 생략 시 셀 폭 맞춤)
    picH?: number          // 인라인 그림 높이(HWPUNIT)
}

export interface Row {
    height: number
    cells: Cell[]
}

export function sumRange(widths: number[], start: number, count: number): number {
    let s = 0
    for (let i = start; i < start + count; i++) s += widths[i] || 0
    return s
}

const ALIGN_PP: Record<CellAlign, number> = { left: 0, center: 1, right: 2 }

// 셀 본문용 문단 XML (bodyXml 조립에 사용). innerW는 셀 안쪽 폭(HWPUNIT).
export function innerParagraph(text: string, cp: number, align: CellAlign = 'left', innerW: number = CONTENT_WIDTH): string {
    const h = CP_HEIGHT[cp] ?? 1000
    return (text || '').split('\n').map(line =>
        `<hp:p id="${nextId()}" paraPrIDRef="${ALIGN_PP[align]}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    ).join('')
}

// 셀 본문용 인라인 그림 문단 XML (bodyXml 조립에 사용)
export function innerPicParagraph(picId: string, picW: number, picH: number, innerW: number = CONTENT_WIDTH): string {
    const pic = buildInlinePicXml(picId, picW, picH)
    return `<hp:p id="${nextId()}" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${pic}</hp:run>${lineseg(innerW, Math.max(1000, picH))}</hp:p>`
}

// 셀 내부 본문(여러 줄이면 문단 분리) 조립
function buildCellBody(cell: Cell, cellW: number): string {
    const innerW = Math.max(1, cellW - CELL_PAD)
    if (cell.bodyXml) return cell.bodyXml
    if (cell.picId) return innerPicParagraph(cell.picId, cell.picW ?? cellW - CELL_PAD, cell.picH ?? 4000, innerW)
    return innerParagraph(cell.text ?? '', cell.cp ?? 0, cell.align ?? 'left', innerW)
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number, rowSpan: number): string {
    const span = cell.span ?? 1
    const bf = cell.bf ?? (cell.header ? 3 : 2)
    const valign = cell.top ? 'TOP' : 'CENTER'
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="${rowSpan}"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
}

export interface TableParagraphOptions {
    floats?: string[]      // 이 표가 놓인 쪽에 겹칠 떠 있는 그림 XML 목록
    pageBreak?: boolean    // 이 표부터 새 쪽 시작
    secPr?: boolean        // 구역 속성 포함(문서 첫 문단에만)
    center?: boolean       // 표를 가로 가운데 배치(표 폭 < 본문 폭일 때)
    borderFill?: number    // 표 바깥 테두리 borderFill (기본 2)
    boxed?: boolean        // 표지 사각 테두리(이어진 문단 테두리)에 포함
}

// 표를 감싼 문단 XML 반환. rowSpan은 그리드 점유 추적으로 처리(병합에 덮이는 후속 셀은 생략, colAddr은 그리드 유지).
export function buildTableParagraph(colWidths: number[], rows: Row[], tblId: number, zOrder: number, opts: TableParagraphOptions = {}): string {
    const colCnt = colWidths.length
    const spanRemaining = new Array<number>(colCnt).fill(0)  // 위 행의 rowSpan이 이 열을 덮고 있는 남은 행 수
    const trs = rows.map((row, r) => {
        let colAddr = 0
        const newSpans: { from: number; to: number; extra: number }[] = []
        const tcs = row.cells.map(cell => {
            while (colAddr < colCnt && spanRemaining[colAddr] > 0) colAddr++
            const span = cell.span ?? 1
            const rowSpan = cell.rowSpan ?? 1
            const width = sumRange(colWidths, colAddr, span)
            let height = 0
            for (let rr = r; rr < r + rowSpan && rr < rows.length; rr++) height += rows[rr].height
            const tc = buildCellXml(cell, colAddr, r, width, height, rowSpan)
            if (rowSpan > 1) newSpans.push({ from: colAddr, to: colAddr + span, extra: rowSpan - 1 })
            colAddr += span
            return tc
        }).join('')
        // 이 행을 소비: 기존 덮개 1 감소 → 이번 행에서 시작된 rowSpan은 이후 (rowSpan-1) 행을 덮음
        for (let c = 0; c < colCnt; c++) if (spanRemaining[c] > 0) spanRemaining[c]--
        for (const ns of newSpans) for (let c = ns.from; c < ns.to; c++) spanRemaining[c] = ns.extra
        return `<hp:tr>${tcs}</hp:tr>`
    }).join('')
    const totalW = colWidths.reduce((a, b) => a + b, 0)
    const tbl = `<hp:tbl id="${tblId}" zOrder="${zOrder}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${opts.borderFill ?? 2}" noAdjust="0"><hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`
    const pp = (opts.center ? 1 : 0) + (opts.boxed ? BOXED_PP_OFFSET : 0)
    const secPr = opts.secPr ? SECPR : ''
    const floats = opts.floats ?? []
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${opts.pageBreak ? 1 : 0}" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${secPr}${floats.join('')}${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
}

export interface TextParagraphOptions {
    cp?: number
    center?: boolean
    right?: boolean
    pageBreak?: boolean
    secPr?: boolean        // 구역 속성 포함(문서 첫 문단에만)
    boxed?: boolean        // 표지 사각 테두리(이어진 문단 테두리)에 포함
}

// 표 밖 단독 문단(제목·주석·여백 채움 등)
export function buildTextParagraph(text: string, opts: TextParagraphOptions = {}): string {
    const cp = opts.cp ?? 0
    const pp = (opts.center ? 1 : opts.right ? 2 : 0) + (opts.boxed ? BOXED_PP_OFFSET : 0)
    const h = CP_HEIGHT[cp] ?? 1000
    const secPr = opts.secPr ? `${SECPR}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>` : ''
    const runs = opts.secPr
        ? `<hp:run charPrIDRef="${cp}">${secPr}</hp:run><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>`
        : `<hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>`
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${opts.pageBreak ? 1 : 0}" columnBreak="0" merged="0">${runs}${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// ── 쪽 예산 추정·표 분할 ──

// 셀 폭 기준 표시 줄 수 추정(줄바꿈 + 자동 줄바꿈) — 한글·기호 1000, ASCII 600 HWPUNIT 폭 가정.
// 실제보다 작게 추정하면 행이 선언값보다 자라 서명 좌표가 밀리므로, 폭 가정은 넉넉하게 잡는다.
export function estDisplayLines(text: string, cellW: number): number {
    const innerW = Math.max(1000, cellW - CELL_PAD)
    return (text || '').split('\n').reduce((n, line) => {
        let w = 0
        for (const ch of line) w += ch.charCodeAt(0) < 0x2000 ? 600 : 1000
        return n + Math.max(1, Math.ceil(w / innerW))
    }, 0)
}

// 내용이 자라는 행의 예상 렌더 높이 (선언 높이는 최소값)
export function estRowH(nominal: number, text: string, cellW: number): number {
    return Math.max(nominal, estDisplayLines(text, cellW) * LINE_H + CELL_PAD)
}

// 행 배열의 선언 높이를 셀 내용 추정 높이 이상으로 끌어올린다.
// 행이 선언값보다 자라면 아래 행들의 쪽 기준 y가 밀려 떠 있는 서명이 어긋나므로,
// 서명 좌표 계산에 쓰는 표는 반드시 이걸 거친다. (bodyXml·그림·rowSpan 병합 셀은 추정에서 제외.
// colAddr은 셀 span 누적으로 근사하므로 균등 그리드가 아니면 병합 이후 행의 폭 추정이 어긋날 수 있다.)
export function clampRowHeights(rows: Row[], colWidths: number[]): Row[] {
    return rows.map(row => {
        let colAddr = 0
        let height = row.height
        for (const cell of row.cells) {
            const span = cell.span ?? 1
            const width = sumRange(colWidths, colAddr, span)
            colAddr += span
            if ((cell.rowSpan ?? 1) > 1 || cell.bodyXml || cell.picId || !cell.text) continue
            height = Math.max(height, estDisplayLines(cell.text, width) * LINE_H + CELL_PAD)
        }
        return { ...row, height }
    })
}

// 한글은 글자처럼 취급(treatAsChar)되는 표가 한 쪽을 넘으면 넘친 행을 이어 그리지 않고 잘라버린다.
// 그래서 예산을 넘는 표는 여기서 직접 쪽 단위로 나눠 이어지는 표로 내보낸다(내용 유실 방지).
export function paginateRows(rows: Row[], capacity: number): Row[][] {
    const total = rows.reduce((a, r) => a + r.height, 0)
    if (total <= capacity) return [rows]

    const pages: Row[][] = []
    let current: Row[] = []
    let used = 0
    for (const row of rows) {
        if (current.length > 0 && used + row.height > capacity) {
            pages.push(current)
            current = []
            used = 0
        }
        current.push(row)
        used += row.height
    }
    if (current.length > 0) pages.push(current)
    return pages
}

// ── 패키지 조립 진입점 ──

// 섹션 문단 XML 목록과 수집된 이미지를 받아 hwpx Blob을 만든다 (mimetype은 반드시 비압축 STORE 첫 항목)
export async function assembleHwpxBlob(parts: string[], collector: ImageCollector, docTitle: string): Promise<Blob> {
    const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SEC_XMLNS}>${parts.join('')}</hs:sec>`

    const imageItems = collector.images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')

    const zip = new JSZip()
    zip.file('mimetype', MIMETYPE, { compression: 'STORE' })
    zip.file('version.xml', VERSION_XML)
    zip.file('settings.xml', SETTINGS_XML)
    zip.file('Contents/header.xml', buildHeaderXml())
    zip.file('Contents/section0.xml', sectionXml)
    zip.file('Contents/content.hpf', buildContentHpf(docTitle, imageItems))
    zip.file('Preview/PrvText.txt', docTitle)
    zip.file('META-INF/container.xml', CONTAINER_XML)
    zip.file('META-INF/container.rdf', CONTAINER_RDF)
    zip.file('META-INF/manifest.xml', MANIFEST_XML)
    for (const img of collector.images) {
        zip.file(`BinData/${img.filename}`, img.data)
    }

    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/hwp+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    })
}

// ── 작업계획서 공용 섹션 빌더 (5종 공용) ──

// 12열 균등 그리드 (합 = 51024)
export const COLS12 = Array.from({ length: 12 }, () => 4252)
export const col12 = (span: number): number => sumRange(COLS12, 0, span)

export function numOrBlank(n: number | null | undefined): string {
    return n === null || n === undefined || Number.isNaN(n) ? '' : String(n)
}

export function checkbox(label: string, checked: boolean): string {
    return `${checked ? '■' : '□'} ${label}`
}

// 회색 배너 행(섹션 제목) — 표 밖 문단 제목은 표만 다음 쪽으로 밀리는 함정이 있어 표의 첫 행으로 넣는다
export function bannerRow(text: string): Row {
    return { height: 1300, cells: [{ text, span: 12, header: true, cp: 5, align: 'center' }] }
}

// ── 표지 (원본 붙임 양식 1쪽 재현, 종별 고정 문구는 WORK_PLAN_COVERS) ──

export function buildCoverParts(planType: PlanType, tblId: number): string[] {
    const cover = WORK_PLAN_COVERS[planType]
    const parts: string[] = []
    // 표지 문단은 모두 이어진 문단 테두리(boxed)로 묶어 PDF의 전체 사각 테두리를 재현한다
    const spacer = (n: number) => {
        for (let i = 0; i < Math.max(0, n); i++) parts.push(buildTextParagraph('', { boxed: true }))
    }

    // 상단 파란 개정 주석 — 문서 첫 문단이므로 구역 속성 포함
    parts.push(buildTextParagraph(cover.headerNote, { cp: 11, secPr: true, boxed: true }))
    spacer(8)

    // 중앙 제목 상자 (두꺼운 테두리, 제목 줄 수에 맞춰 높이 조정)
    const boxW = 30000
    const boxH = cover.titleLines.length * 2600 + 3000
    const titleBody = cover.titleLines.map(line => innerParagraph(line, 8, 'center', boxW - CELL_PAD)).join('')
    parts.push(buildTableParagraph([boxW], [
        { height: boxH, cells: [{ bodyXml: titleBody, bf: 4 }] },
    ], tblId, 1, { center: true, boxed: true }))
    spacer(6)

    // 목록 섹션들 — 사용 높이를 추정해 하단 ※주석 위치를 계산한다
    let used = LINE_H * (1 + 8 + 6) + boxH
    cover.sections.forEach((section, index) => {
        if (index > 0) {
            spacer(2)
            used += LINE_H * 2
        }
        parts.push(buildTextParagraph(section.heading, { cp: 6, center: true, boxed: true }))
        parts.push(buildTextParagraph('', { boxed: true }))
        used += Math.round(1200 * 1.3) + LINE_H
        for (const item of section.items) {
            parts.push(buildTextParagraph(item, { cp: 10, center: true, boxed: true }))
            used += estDisplayLines(item, CONTENT_WIDTH) * Math.round(1100 * 1.3)
        }
    })

    // 남은 높이를 여백 문단으로 채운다 — ※주석을 쪽 하단에 붙이고, 주석이 없는 종별도 테두리가 쪽 전체를 감싸게 한다 (안전 버퍼 2줄)
    const footnoteH = cover.footnote ? LINE_H : 0
    spacer(Math.floor((CONTENT_HEIGHT - used - footnoteH) / LINE_H) - 2)
    if (cover.footnote) parts.push(buildTextParagraph(cover.footnote, { cp: 11, boxed: true }))
    return parts
}

// ── 결재란 (제목 + 결재/담당/승인, rowSpan 세로 병합) ──

// PDF 열비(72% / 5% / 11.5% / 11.5%)를 본문 폭으로 환산
export const COLS_APPROVAL = [36737, 2551, 5868, 5868]
export const APPROVAL_HEAD_H = 1200
export const APPROVAL_SIGN_H = 3600

export function approvalHeaderRows(mainTitle: string, approvalNames?: WorkPlanApprovalNames): Row[] {
    const titleBody = innerParagraph(mainTitle, 2, 'center', COLS_APPROVAL[0] - CELL_PAD)
        + innerParagraph('(수급업체용)', 7, 'center', COLS_APPROVAL[0] - CELL_PAD)
    return [
        {
            height: APPROVAL_HEAD_H,
            cells: [
                { bodyXml: titleBody, rowSpan: 2 },
                { text: '결\n재', rowSpan: 2, header: true, cp: 1, align: 'center' },
                { text: '담당', header: true, cp: 4, align: 'center' },
                { text: '승인', header: true, cp: 4, align: 'center' },
            ],
        },
        {
            height: APPROVAL_SIGN_H,
            cells: [
                { text: approvalNames?.approvalManager || '', cp: 7, align: 'center' },
                { text: approvalNames?.approvalApprover || '', cp: 7, align: 'center' },
            ],
        },
    ]
}

export interface SignatureFloatSpec {
    picId: string
    cellX: number      // 서명이 놓일 셀의 시작 x (쪽 기준)
    cellW: number
    rowY: number       // 행 시작 y (쪽 기준)
    rowH: number
    maxW: number
    maxH: number
}

// 성명·(인) 문구 위에 손글씨 서명을 겹친다 (쪽 기준 절대좌표, 셀 중앙)
export function signatureFloat(collector: ImageCollector, spec: SignatureFloatSpec): string {
    const size = fitImage(collector.find(spec.picId), spec.maxW, spec.maxH)
    const x = spec.cellX + Math.round((spec.cellW - size.w) / 2)
    const y = spec.rowY + Math.round((spec.rowH - size.h) / 2)
    return buildFloatingPicXml(spec.picId, size.w, size.h, x, y)
}

// 결재란 담당·승인 칸 서명 — 결재란은 항상 쪽 최상단이므로 y가 고정된다
export function approvalSignatureFloats(
    collector: ImageCollector,
    managerSigId: string | null | undefined,
    approverSigId: string | null | undefined,
): string[] {
    const rowY = PAGE_CONTENT_TOP + APPROVAL_HEAD_H
    const cells: Array<[string | null | undefined, number]> = [
        [managerSigId, PAGE_LEFT + COLS_APPROVAL[0] + COLS_APPROVAL[1]],
        [approverSigId, PAGE_LEFT + COLS_APPROVAL[0] + COLS_APPROVAL[1] + COLS_APPROVAL[2]],
    ]
    const floats: string[] = []
    for (const [picId, cellX] of cells) {
        if (picId) floats.push(signatureFloat(collector, { picId, cellX, cellW: 5868, rowY, rowH: APPROVAL_SIGN_H, maxW: 5000, maxH: 2800 }))
    }
    return floats
}

// ── 건설기계 인양능력 검토 (2-1·2-4 공용) ──

export function liftingReviewRows(review: LiftingCapacityReview | undefined): Row[] {
    const total = numOrBlank(review?.totalLoadTon)
    const capacity = numOrBlank(review?.maxCapacityTon)
    const pct = numOrBlank(review?.safetyRatioPercent)
    const expr = LIFTING_CAPACITY_FORMULA.replace('안전율 = ', '')
    const formulaText = `${expr} = ( ${pct} )% ※ ${CAPACITY_WARNING}`
    return [
        bannerRow('<건설기계 인양능력 검토>'),
        {
            height: 1500,
            cells: [
                { text: '중량물 총 하중', span: 3, header: true, cp: 4, align: 'center' },
                { text: `${total} ton`, span: 3, align: 'right' },
                { text: '최대 양중능력', span: 3, header: true, cp: 4, align: 'center' },
                { text: `${capacity} ton`, span: 3, align: 'right' },
            ],
        },
        ...LIFTING_CAPACITY_NOTES.map(note => ({
            height: estRowH(1200, `※ ${note}`, CONTENT_WIDTH),
            cells: [{ text: `※ ${note}`, span: 12, cp: 7 }],
        })),
        {
            height: estRowH(1500, formulaText, col12(9)),
            cells: [
                { text: '안전율', span: 3, header: true, cp: 4, align: 'center' },
                { text: formulaText, span: 9, cp: 7 },
            ],
        },
    ]
}

// ── 줄걸이 인양능력 검토 (2-1·2-4 공용) ──

export function riggingReviewRows(r: RiggingCapacityReview | undefined): Row[] {
    const tools = r?.tools || []
    const toolBox = `${checkbox('와이어로프', tools.includes('와이어로프'))} ${checkbox('섬유로프', tools.includes('섬유로프'))}\n${checkbox('체인블럭', tools.includes('체인블럭'))} ${checkbox('기타', tools.includes('기타'))}( ${r?.otherTool || ''} )`
    const spec = `D : ( ${numOrBlank(r?.diameterMm)} )mm, L : ( ${numOrBlank(r?.lengthM)} )m, ( ${numOrBlank(r?.quantity)} )EA\n각 안전하중 : ( ${numOrBlank(r?.safeLoadPerToolTon)} )ton`
    const methodBox = `${checkbox('1줄걸이', r?.slingMethod === '1줄걸이')} ${checkbox('2줄걸이', r?.slingMethod === '2줄걸이')}\n${checkbox('3줄걸이', r?.slingMethod === '3줄걸이')} ${checkbox('4줄걸이', r?.slingMethod === '4줄걸이')}`
    const hookLabel = r?.hookTool || '훅/샤클/아이볼트'
    const hookSpec = `${hookLabel} : D ( ${numOrBlank(r?.hookDiameterInch)} )in, ( ${numOrBlank(r?.hookQuantity)} )EA\n각 안전하중 : ( ${numOrBlank(r?.hookSafeLoadTon)} )ton`
    const breaking = numOrBlank(r?.breakingLoadTon)
    const safeLoad = numOrBlank(r?.safeLoadTon)
    const slingCount = r?.slingMethod ? (r.slingMethod.match(/(\d)/)?.[1] ?? '') : ''
    const formulaText = `※ ${RIGGING_CAPACITY_FORMULA} → 절단하중 ( ${breaking} ) × 줄걸이 수 ( ${slingCount} ) ÷ ( 안전계수 ( ${numOrBlank(r?.safetyFactor)} ) × 장력계수 ( ${numOrBlank(r?.tensionFactor)} ) ) = ( ${safeLoad} ) ton`
    const ratioExpr = RIGGING_SAFETY_RATIO_FORMULA.replace('안전율 = ', '')
    const ratioText = `${ratioExpr} = ( ${numOrBlank(r?.safetyRatioPercent)} )% ※ ${CAPACITY_WARNING}`
    const sf = SAFETY_FACTORS
    return [
        bannerRow('<줄걸이 인양능력 검토>'),
        {
            height: 3000,
            cells: [
                { text: '줄걸이 용구', span: 2, header: true, cp: 4, align: 'center' },
                { text: toolBox, span: 4, cp: 7 },
                { text: '줄걸이 규격', span: 2, header: true, cp: 4, align: 'center' },
                { text: spec, span: 4, cp: 7 },
            ],
        },
        {
            height: 3000,
            cells: [
                { text: '줄걸이 방법', span: 2, header: true, cp: 4, align: 'center' },
                { text: methodBox, span: 4, cp: 7 },
                { text: '고리걸이용구/규격', span: 2, header: true, cp: 4, align: 'center' },
                { text: hookSpec, span: 4, cp: 7 },
            ],
        },
        {
            height: 1500,
            cells: [
                { text: '줄걸이 절단하중', span: 2, header: true, cp: 4, align: 'center' },
                { text: `${breaking} ton`, span: 4, align: 'right' },
                { text: '줄걸이 안전하중', span: 2, header: true, cp: 4, align: 'center' },
                { text: `${safeLoad} ton`, span: 4, align: 'right' },
            ],
        },
        {
            height: 1200,
            cells: [{ text: '※ 줄걸이 절단하중 : 줄걸이 제조사별 구조계산서 등 제원 확인 후 기재', span: 12, cp: 7 }],
        },
        {
            height: estRowH(1200, formulaText, CONTENT_WIDTH),
            cells: [{ text: formulaText, span: 12, cp: 7 }],
        },
        {
            height: 1200,
            cells: [
                { text: '※ 안전계수', span: 6, cp: 4 },
                { text: '※ 장력계수', span: 6, cp: 4 },
            ],
        },
        {
            height: estRowH(1400, sf.workerBoarding.label, col12(2)),
            cells: [
                { text: '작업구분', span: 2, header: true, cp: 4, align: 'center' },
                { text: sf.workerBoarding.label, span: 2, header: true, cp: 7, align: 'center' },
                { text: sf.rigging.label, span: 2, header: true, cp: 7, align: 'center' },
                { text: '각도', span: 1, header: true, cp: 7, align: 'center' },
                ...TENSION_FACTORS.map(t => ({ text: `${t.angleDegree}°`, span: 1, header: true, cp: 7, align: 'center' as const })),
            ],
        },
        {
            height: 1400,
            cells: [
                { text: '안전계수', span: 2, header: true, cp: 4, align: 'center' },
                { text: String(sf.workerBoarding.value), span: 2, cp: 7, align: 'center' },
                { text: `${sf.rigging.value}(섬유로프: ${sf.fiberRopeRigging.value})`, span: 2, cp: 7, align: 'center' },
                { text: '장력계수', span: 1, header: true, cp: 7, align: 'center' },
                ...TENSION_FACTORS.map(t => ({ text: String(t.value), span: 1, cp: 7, align: 'center' as const })),
            ],
        },
        {
            height: estRowH(1500, ratioText, col12(10)),
            cells: [
                { text: '안전율', span: 2, header: true, cp: 4, align: 'center' },
                { text: ratioText, span: 10, cp: 7 },
            ],
        },
    ]
}

// ── 작업계획도(지도) 섹션 — 좌측 지도 셀 fit + 우측 범례·중점관리사항 ──

export const MAP_ROW_H = 34016 // 지도 영역 약 120mm

export function mapSectionRows(bannerTitle: string, collector: ImageCollector, mapId: string | null): Row[] {
    const mapCellW = col12(8)
    const mapInnerW = mapCellW - CELL_PAD
    let mapBody = ''
    if (mapId) {
        const size = fitImage(collector.find(mapId), mapInnerW, MAP_ROW_H - 2000)
        mapBody += innerPicParagraph(mapId, size.w, size.h, mapInnerW)
    } else {
        mapBody += innerParagraph('', 0, 'center', mapInnerW)
    }
    mapBody += innerParagraph(MAP_FOOTNOTE, 9, 'center', mapInnerW)

    const legendInnerW = col12(4) - CELL_PAD
    let legendBody = innerParagraph('범  례', 1, 'center', legendInnerW)
    for (const l of MAP_LEGEND) {
        legendBody += innerParagraph(`${l.symbol} ${l.label}`, 7, 'left', legendInnerW)
    }
    legendBody += innerParagraph('', 7, 'left', legendInnerW)
    legendBody += innerParagraph('ㅇ 중점관리사항', 4, 'left', legendInnerW)
    MAP_FOCUS_ITEMS.forEach((item, i) => {
        legendBody += innerParagraph(`${i + 1}. ${item}`, 7, 'left', legendInnerW)
    })

    return [
        bannerRow(bannerTitle),
        {
            height: MAP_ROW_H,
            cells: [
                { bodyXml: mapBody, span: 8 },
                { bodyXml: legendBody, span: 4, top: true },
            ],
        },
    ]
}

// ── 위험요인 및 개선대책 표 ──

export function riskControlRows(bannerTitle: string, firstColLabel: string, risks: RiskControlRow[]): Row[] {
    const rows: RiskControlRow[] = risks.length > 0 ? risks : [{ workStep: '', riskFactor: '', improvementMeasure: '' }]
    return [
        bannerRow(bannerTitle),
        {
            height: 1400,
            cells: [
                { text: '연번', span: 1, header: true, cp: 4, align: 'center' },
                { text: firstColLabel, span: 3, header: true, cp: 4, align: 'center' },
                { text: '위험요인', span: 4, header: true, cp: 4, align: 'center' },
                { text: '개선대책', span: 4, header: true, cp: 4, align: 'center' },
            ],
        },
        ...rows.map((row, i) => ({
            height: Math.max(
                estRowH(1400, row.workStep, col12(3)),
                estRowH(1400, row.riskFactor, col12(4)),
                estRowH(1400, row.improvementMeasure, col12(4)),
            ),
            cells: [
                { text: String(i + 1), span: 1, align: 'center' as const },
                { text: row.workStep, span: 3, cp: 7 },
                { text: row.riskFactor, span: 4, cp: 7 },
                { text: row.improvementMeasure, span: 4, cp: 7 },
            ],
        })),
    ]
}

// ── 체크리스트 표 (양호/미흡/해당없음 ■·□, 특이사항은 └ 줄) ──

function checkMark(target: ChecklistResult, current: ChecklistResult | undefined): string {
    return current === target ? '■' : '□'
}

export function checklistRows(bannerTitle: string, items: readonly string[], answers: ChecklistAnswer[]): Row[] {
    const byIndex = new Map<number, ChecklistAnswer>(answers.map(a => [a.itemIndex, a]))
    return [
        bannerRow(bannerTitle),
        {
            height: 1400,
            cells: [
                { text: '점검사항', span: 9, header: true, cp: 4, align: 'center' },
                { text: '양호', span: 1, header: true, cp: 4, align: 'center' },
                { text: '미흡', span: 1, header: true, cp: 4, align: 'center' },
                { text: '해당없음', span: 1, header: true, cp: 4, align: 'center' },
            ],
        },
        ...items.map((q, i) => {
            const a = byIndex.get(i)
            const question = a?.note ? `${q}\n└ ${a.note}` : q
            return {
                height: estRowH(1600, question, col12(9)),
                cells: [
                    { text: question, span: 9, cp: 7 },
                    { text: checkMark('양호', a?.result), span: 1, align: 'center' as const },
                    { text: checkMark('미흡', a?.result), span: 1, align: 'center' as const },
                    { text: checkMark('해당없음', a?.result), span: 1, align: 'center' as const },
                ],
            }
        }),
    ]
}
