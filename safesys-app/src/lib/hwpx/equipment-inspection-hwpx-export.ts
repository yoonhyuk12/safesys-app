// 장비 일일점검 기록을 안내 그림·서명과 함께 A4 한 장에 담은 HWPX로 조립한다.
import JSZip from 'jszip'
import type { EquipmentInspection } from '../equipment-inspection-types'
import { equipmentGuideImages } from '../equipment-inspection-guides'

// TBM 정본의 패키지·표·완전한 그림 XML 헬퍼를 재사용한다.

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
            } catch { /* 측정 실패 시 비율 유지 없이 셀 채움 */ }
        }
        const buf = await blob.arrayBuffer()
        const mime = (blob.type || '').toLowerCase()
        const ext = mime.includes('png') ? 'png' : 'jpg'
        if (ext === 'png' && buf.byteLength >= 24) {
            const view = new DataView(buf)
            if (view.getUint32(0) === 0x89504e47) {
                wPx = view.getUint32(16)
                hPx = view.getUint32(20)
            }
        }
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

    // raw=true: 정규화 없이 원본 바이트 유지(서명 PNG 투명도 보존). raw=false: 흰 배경 JPEG로 정규화(사진).
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

// 문단·그림 개체 번호표. id/instid는 문서 안에서만 유일하면 되므로 출력 한 건에 하나씩 새로 만든다.
// 모듈 전역 카운터를 쓰면 동시에 두 건을 내려받을 때 서로의 번호를 밀어 버린다.
class DocumentIds {
    private para = 2147483648
    private pic = 0
    nextParaId(): string { return String(this.para++) }
    nextPicSeq(): number { return ++this.pic }
}

// 한글이 직접 저장한 hwpx의 hp:pic 구조를 그대로 답습한 공통 골격 (요소 순서 포함)
// 필수 자식 요소가 빠지면 한글 2020이 파일을 열다 죽는다.
function buildPicXml(ids: DocumentIds, binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
    const seq = ids.nextPicSeq()
    const id = 1149648000 + seq
    const instid = 75906000 + seq
    const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
    return `<hp:pic id="${id}" zOrder="${10 + seq}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

// "(서명)" 문구 위에 겹치는 떠 있는 그림(서명용). 쪽(PAPER) 기준 절대 좌표라 표 밖 돌출도 허용된다.
// textWrap은 반드시 IN_FRONT_OF_TEXT(글 앞으로) — THROUGH는 한글 2020이 자리차지로 처리해 표를 밀어낸다.
function buildFloatingPicXml(ids: DocumentIds, binItemId: string, imgW: number, imgH: number, xPaper: number, yPaper: number): string {
    const pos = `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${yPaper}" horzOffset="${xPaper}"/>`
    return buildPicXml(ids, binItemId, imgW, imgH, 'IN_FRONT_OF_TEXT', pos)
}

// ── OWPML 부속 파일(고정 보일러플레이트) ──

const MIMETYPE = 'application/hwp+zip'

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 7936 WIN32LEWindows_10"/>`

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`

const CONTAINER_RDF = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`

const PRV_TEXT = '장비 일일점검표'

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 용지와 여백(HWPUNIT). 구역 속성·쪽 예산·서명 절대 좌표가 모두 이 값에서 나온다.
const PAGE_WIDTH = 59528
const PAGE_HEIGHT = 84188
const MARGIN_LEFT = 4252
const MARGIN_RIGHT = 4252
// 세로 여백은 위·아래 각각 12mm(여백 8.5mm + 머리말/꼬리말 3.5mm)다. 한글 기본 25.4mm로는 안내 그림과
// 점검 행이 한 장에 들어가지 않아 줄였다. 가로 여백 15mm는 본문 폭 180mm를 지키려고 그대로 둔다.
const MARGIN_TOP = 2400
const MARGIN_BOTTOM = 2400
const HEADER_HEIGHT = 1000
const FOOTER_HEIGHT = 1000
// 본문 폭 51024, 본문 시작 3400, 본문 높이 77388.
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const BODY_TOP = MARGIN_TOP + HEADER_HEIGHT
const PAGE_CAPACITY = PAGE_HEIGHT - (MARGIN_TOP + HEADER_HEIGHT) - (MARGIN_BOTTOM + FOOTER_HEIGHT)

// 첫 문단에 들어가는 구역 속성(A4 세로)
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" gutterType="LEFT_ONLY"><hp:margin header="${HEADER_HEIGHT}" footer="${FOOTER_HEIGHT}" gutter="0" left="${MARGIN_LEFT}" right="${MARGIN_RIGHT}" top="${MARGIN_TOP}" bottom="${MARGIN_BOTTOM}"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// ── 한 장 맞춤 조판 단계 ──

/**
 * 한 장에 담으려고 차례로 시도하는 조판 단계. 읽기 좋은 9pt·줄 간격 130%를 먼저 쓰고,
 * 그것으로 넘칠 때만 더 촘촘한 단계로 내려간다. 마지막 단계(8pt)가 읽기 하한이며
 * 그래도 못 담으면 글자를 잘라 내지 않고 출력을 거부한다.
 */
interface FitProfile {
    name: string
    bodyHeight: number          // 본문 글자 크기(HWPUNIT, 100 = 1pt)
    titleHeight: number         // 제목 글자 크기
    lineSpacing: number         // 줄 간격 백분율
    cellMargin: number          // 셀 안쪽 여백(상·하·좌·우)
    rowSlack: number            // 줄 수 추정 오차를 흡수하는 행 여유
    titleRowHeight: number
    infoRowHeight: number
    signatureRowHeight: number
}

const FIT_PROFILES: readonly FitProfile[] = [
    { name: '9pt', bodyHeight: 900, titleHeight: 1600, lineSpacing: 130, cellMargin: 141, rowSlack: 200, titleRowHeight: 3400, infoRowHeight: 2000, signatureRowHeight: 3400 },
    { name: '9pt 좁게', bodyHeight: 900, titleHeight: 1500, lineSpacing: 120, cellMargin: 120, rowSlack: 140, titleRowHeight: 3100, infoRowHeight: 1850, signatureRowHeight: 3200 },
    { name: '8.5pt', bodyHeight: 850, titleHeight: 1400, lineSpacing: 120, cellMargin: 110, rowSlack: 120, titleRowHeight: 2900, infoRowHeight: 1750, signatureRowHeight: 3100 },
    { name: '8pt', bodyHeight: 800, titleHeight: 1400, lineSpacing: 115, cellMargin: 100, rowSlack: 100, titleRowHeight: 2700, infoRowHeight: 1650, signatureRowHeight: 3000 },
]

const CP_BODY = 0
const CP_TITLE = 1

const charHeightOf = (profile: FitProfile, cp: number): number => (cp === CP_TITLE ? profile.titleHeight : profile.bodyHeight)
const cellPadding = (profile: FitProfile): number => profile.cellMargin * 2
const lineAdvance = (profile: FitProfile, charHeight: number): number => Math.round((charHeight * profile.lineSpacing) / 100)

// ── header.xml 조립 ──
// borderFill: 1=테두리없음, 2=실선 사방테두리(셀), 3=실선+회색채움(머리셀)
// charPr: 0=본문, 1=제목(굵게) — 두 크기 모두 조판 단계에서 온다.
// paraPr: 0=왼쪽정렬, 1=가운데정렬

// 사용자 지정 글꼴. 모든 언어 항목이 같은 얼굴을 참조해야 한글이 본문 일부를 다른 글꼴로 대체하지 않는다.
const DOCUMENT_FONT = '휴먼명조'

function buildFontfaces(): string {
    const langs = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']
    const one = (lang: string) =>
        `<hh:fontface lang="${lang}" fontCnt="1"><hh:font id="0" face="${DOCUMENT_FONT}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_MYUNGJO" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font></hh:fontface>`
    return `<hh:fontfaces itemCnt="7">${langs.map(one).join('')}</hh:fontfaces>`
}

function buildBorderFills(): string {
    const none = `<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`
    const solid = `<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.12 mm" color="#000000"/></hh:borderFill>`
    const header = `<hh:borderFill id="3" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.12 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="#F0F0F0" hatchColor="#000000" alpha="0"/></hc:fillBrush></hh:borderFill>`
    return `<hh:borderFills itemCnt="3">${none}${solid}${header}</hh:borderFills>`
}

function buildCharPr(id: number, height: number, bold: boolean): string {
    return `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>`
}

function buildCharProperties(profile: FitProfile): string {
    const items = [
        buildCharPr(CP_BODY, profile.bodyHeight, false),
        buildCharPr(CP_TITLE, profile.titleHeight, true),
    ].join('')
    return `<hh:charProperties itemCnt="2">${items}</hh:charProperties>`
}

function buildParaPr(id: number, align: string, lineSpacing: number): string {
    const margin = `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>`
    const spacing = `<hh:lineSpacing type="PERCENT" value="${lineSpacing}" unit="HWPUNIT"/>`
    const sw = `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}${spacing}</hp:case><hp:default>${margin}${spacing}</hp:default></hp:switch>`
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/>${sw}<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`
}

function buildParaProperties(profile: FitProfile): string {
    return `<hh:paraProperties itemCnt="2">${buildParaPr(0, 'LEFT', profile.lineSpacing)}${buildParaPr(1, 'CENTER', profile.lineSpacing)}</hh:paraProperties>`
}

function buildNumberings(): string {
    const heads = Array.from({ length: 7 }, (_, i) => {
        const lv = i + 1
        return `<hh:paraHead start="1" level="${lv}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^${lv}.</hh:paraHead>`
    }).join('')
    return `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">${heads}</hh:numbering></hh:numberings>`
}

function buildHeaderXml(profile: FitProfile): string {
    const open = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" version="1.4" secCnt="1">`
    const begin = `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>`
    const tabProps = `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>`
    const styles = `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>`
    const memo = `<hh:memoProperties itemCnt="1"><hh:memoPr id="1" width="15591" lineWidth="1" lineType="SOLID" lineColor="#000000" fillColor="#CCFF99" activeColor="#FFFF99" memoType="NOMAL"/></hh:memoProperties>`
    const refList = `<hh:refList>${buildFontfaces()}${buildBorderFills()}${buildCharProperties(profile)}${tabProps}${buildNumberings()}${buildParaProperties(profile)}${styles}${memo}</hh:refList>`
    const tail = `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:trackchageConfig flags="56"/></hh:head>`
    return `${open}${begin}${refList}${tail}`
}

function buildContentHpf(imageItems: string): string {
    const open = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><opf:package xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" version="" unique-identifier="" id="">`
    const meta = `<opf:metadata><opf:title>장비 일일점검표</opf:title><opf:language>ko</opf:language></opf:metadata>`
    const manifest = `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>${imageItems}</opf:manifest>`
    const spine = `<opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0" linear="yes"/></opf:spine>`
    return `${open}${meta}${manifest}${spine}</opf:package>`
}

// ── 문단·표 조립 ──

function lineseg(width: number, height: number): string {
    return `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${height}" textheight="${height}" baseline="${Math.round(height * 0.85)}" spacing="${Math.round(height * 0.35)}" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>`
}

// 기본정보(항목명/값)와 점검표(구분/검사 내용/점검 결과)가 함께 쓰는 단일 열 그리드.
// 경계 0 ─6500─ 25512 ─6500─ 32012 ─10488─ 42500 ─8524─ 51024 (합계 = 본문 폭).
// 셀 폭은 반드시 이 배열의 구간 합으로만 만든다 — 그리드와 어긋나면 한글이 행을 재배치해 표가 깨진다.
const GRID = [6500, 19012, 6500, 10488, 8524]
const LABEL_SPAN = 1          // 항목명 셀
const VALUE_SPAN = 1          // 짝 배치의 왼쪽 값 셀
const WIDE_VALUE_SPAN = 2     // 짝 배치의 오른쪽 값 셀(왼쪽 값과 같은 폭)
const SUBJECT_SPAN = 3        // 검사 내용·점검자 이름
const GUIDE_COLUMN = GRID.length - 1  // 서명 안내문구 열

// 조판 단계와 무관하게 고정인 배치 상수.
const SUMMARY_ROW_HEIGHT = 3000 // 종합 의견이 비어 있어도 약 11mm의 작성 공간을 확보한다.
const SIGNATURE_MAX_HEIGHT = 2400
// 안내 그림 묶음의 최대 높이(약 67mm). 원본 비율로 키우더라도 여기서 멈춘다.
const GUIDE_MAX_HEIGHT = 19000
// 안내 그림을 줄일 수 있는 하한(약 32mm). 이보다 작아져야 한 장에 들어간다면 그림을 더 줄이는 대신
// 다음 조판 단계로 내려가 본문을 촘촘하게 만든다 — 도해가 알아볼 수 없게 되는 쪽이 더 나쁘다.
const GUIDE_MIN_HEIGHT = 9000
// 마지막 조판 단계에서만 쓰는 절대 하한(약 14mm). 더 내려갈 단계가 없을 때는 그림을 여기까지 줄여서라도
// 담는다 — 그림이 작아지는 것이 출력을 거부당하는 것보다 낫다.
const GUIDE_FLOOR_HEIGHT = 4000
const GUIDE_GAP = 600                          // 그림을 나란히 둘 때의 간격

function sumRange(widths: number[], start: number, count: number): number {
    let s = 0
    for (let i = start; i < start + count; i++) s += widths[i] || 0
    return s
}

// 셀 텍스트 정규화 — 줄 끝 공백과 문자열 뒤쪽 빈 줄을 제거한다(줄 앞 들여쓰기는 의도일 수 있어 보존).
// 블록을 만들 때 원문에 한 번만 적용한다. 조각마다 다시 다듬으면 쪽 경계의 공백이 사라져 원문과 달라진다.
function trimCellText(text: string): string {
    const lines = text.split('\n').map(line => line.replace(/\s+$/, ''))
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
}

// PDF 원문의 줄바꿈은 양식 폭에 맞춘 배치 흔적이라 문장 의미가 아니다.
// 공백으로 되돌려 한글이 셀 폭에 맞춰 스스로 접게 한다 — 글자는 하나도 버리지 않는다.
const flattenSourceBreaks = (text: string): string => text.replace(/\s*\n\s*/g, ' ')

/** 표시 한 줄. `hard`는 이 조각 끝이 원문 개행이라는 뜻이며, 이어 붙이면 원문이 복원된다. */
interface TextSegment {
    text: string
    hard: boolean
}

// 한글의 어절 단위 자동 줄바꿈(KEEP_WORD)을 흉내 내어 높이 추정용 표시 줄을 만든다.
// 출력 문자열에는 이 분할을 넣지 않는다 — 행 높이 계산과 매우 긴 셀의 쪽 분할에만 쓴다.
function splitDisplayLines(text: string, cellWidth: number, charHeight: number, padding: number): TextSegment[] {
    // 한 글자만큼 좁게 잡아, 한글이 실제로 접는 줄 수가 추정을 넘지 않게 한다.
    const usable = Math.max(charHeight, cellWidth - padding - charHeight)
    const widthOf = (chunk: string): number => {
        let total = 0
        for (const char of chunk) {
            total += char === '\t' ? charHeight * 2 : char.codePointAt(0)! <= 0x7f ? charHeight / 2 : charHeight
        }
        return total
    }
    const segments: TextSegment[] = []
    const paragraphs = text.replace(/\r\n?/g, '\n').split('\n')
    paragraphs.forEach((paragraph, index) => {
        let line = ''
        let used = 0
        for (let token of paragraph.match(/\S+\s*|\s+/g) ?? []) {
            if (used > 0 && used + widthOf(token) > usable) {
                segments.push({ text: line, hard: false })
                line = ''
                used = 0
            }
            // 한 어절이 줄보다 길면 한글도 글자 단위로 끊는다.
            while (widthOf(token) > usable) {
                let taken = ''
                let takenWidth = 0
                for (const char of token) {
                    const next = widthOf(char)
                    if (taken && takenWidth + next > usable) break
                    taken += char
                    takenWidth += next
                }
                segments.push({ text: taken, hard: false })
                token = token.slice(taken.length)
            }
            line += token
            used += widthOf(token)
        }
        segments.push({ text: line, hard: index < paragraphs.length - 1 })
    })
    return segments
}

// 조각의 마지막 개행은 넣지 않는다 — 쪽이 바뀌면 행 자체가 줄바꿈이라 빈 문단만 남는다.
const joinSegments = (segments: TextSegment[]): string =>
    segments.map((segment, index) => segment.text + (segment.hard && index < segments.length - 1 ? '\n' : '')).join('')

type RowKind = 'fixed' | 'item' | 'note'

interface Cell {
    text?: string
    span?: number          // colSpan (기본 1)
    header?: boolean       // 회색 머리셀 여부
    cp?: number            // charPrIDRef (기본 0)
    center?: boolean       // 가로 가운데 정렬
}

interface Row {
    height: number
    cells: Cell[]
    /** item = 같은 쪽에서 높이를 균등하게 나눠 받는 점검 항목 행, note = 남는 높이를 받는 비고 행. */
    kind: RowKind
    signature?: boolean    // 서명 이미지를 겹칠 행
    guide?: boolean        // 장비 안내 그림을 겹칠 행
}

/** 아직 쪽에 배치하지 않은 표 행. 셀마다 표시 줄을 들고 있어 남은 공간만큼 잘라 넣을 수 있다. */
interface Block {
    kind: RowKind
    minHeight: number
    signature?: boolean
    guide?: boolean
    cells: { spec: Cell; segments: TextSegment[] }[]
}

function makeBlock(profile: FitProfile, kind: RowKind, minHeight: number, cells: Cell[]): Block {
    let column = 0
    const padding = cellPadding(profile)
    const measured = cells.map(spec => {
        const span = spec.span ?? 1
        const width = sumRange(GRID, column, span)
        column += span
        return { spec, segments: splitDisplayLines(trimCellText(spec.text ?? ''), width, charHeightOf(profile, spec.cp ?? CP_BODY), padding) }
    })
    return { kind, minHeight, cells: measured }
}

const blockLines = (block: Block): number => Math.max(1, ...block.cells.map(cell => cell.segments.length))

function blockRowHeight(profile: FitProfile, block: Block): number {
    const advance = Math.max(...block.cells.map(cell => lineAdvance(profile, charHeightOf(profile, cell.spec.cp ?? CP_BODY))))
    return Math.max(block.minHeight, blockLines(block) * advance + cellPadding(profile) + profile.rowSlack)
}

// 블록을 통째로 한 행으로 만든다. 조각내지 않으므로 원문이 한 글자도 줄지 않는다.
function blockToRow(profile: FitProfile, block: Block): Row {
    return {
        kind: block.kind,
        signature: block.signature,
        guide: block.guide,
        height: blockRowHeight(profile, block),
        cells: block.cells.map(cell => ({ ...cell.spec, text: joinSegments(cell.segments) })),
    }
}

// 점검 항목 행에 남는 높이를 균등하게 나눠 준다 — 행 높이 차이는 최대 1 HWPUNIT이다.
// 비고 행은 최소 높이를 지키고, 점검 행이 하나도 없을 때만 남는 높이를 비례로 받는다.
function fillPage(rows: Row[]): Row[] {
    const items = rows.filter(row => row.kind === 'item')
    if (items.length === 0) return stretchNoteRows(rows)
    const others = rows.reduce((sum, row) => sum + (row.kind === 'item' ? 0 : row.height), 0)
    const free = PAGE_CAPACITY - others
    if (free < items.length * Math.max(...items.map(row => row.height))) return rows
    const base = Math.floor(free / items.length)
    let extra = free - base * items.length
    return rows.map(row => {
        if (row.kind !== 'item') return row
        const bonus = extra > 0 ? 1 : 0
        extra -= bonus
        return { ...row, height: base + bonus }
    })
}

function stretchNoteRows(rows: Row[]): Row[] {
    const remaining = PAGE_CAPACITY - rows.reduce((sum, row) => sum + row.height, 0)
    if (remaining <= 0) return rows
    const total = rows.reduce((sum, row) => sum + (row.kind === 'note' ? row.height : 0), 0)
    if (total <= 0) return rows
    const last = rows.reduce((found, row, index) => (row.kind === 'note' ? index : found), -1)
    let given = 0
    return rows.map((row, index) => {
        if (row.kind !== 'note') return row
        const add = index === last ? remaining - given : Math.floor((row.height / total) * remaining)
        given += add
        return { ...row, height: row.height + add }
    })
}

// 셀 내부 본문(원문 개행마다 문단 분리) 조립
function buildCellBody(ids: DocumentIds, profile: FitProfile, cell: Cell, cellW: number): string {
    const cp = cell.cp ?? CP_BODY
    const pp = cell.center ? 1 : 0
    const h = charHeightOf(profile, cp)
    const innerW = Math.max(1, cellW - cellPadding(profile))
    return (cell.text ?? '').split('\n').map(line =>
        `<hp:p id="${ids.nextParaId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    ).join('')
}

function buildCellXml(ids: DocumentIds, profile: FitProfile, cell: Cell, colAddr: number, rowAddr: number, width: number, height: number): string {
    const span = cell.span ?? 1
    const bf = cell.header ? 3 : 2
    const m = profile.cellMargin
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(ids, profile, cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="${m}" right="${m}" top="${m}" bottom="${m}"/></hp:tc>`
}

// 표를 감싼 문단 XML 반환. floats는 이 표 위에 겹칠 떠 있는 그림 XML 목록이다.
function buildTableParagraph(ids: DocumentIds, profile: FitProfile, colWidths: number[], rows: Row[], floats: string[]): string {
    const colCnt = colWidths.length
    const trs = rows.map((row, r) => {
        let colAddr = 0
        const tcs = row.cells.map(cell => {
            const span = cell.span ?? 1
            const width = sumRange(colWidths, colAddr, span)
            const tc = buildCellXml(ids, profile, cell, colAddr, r, width, row.height)
            colAddr += span
            return tc
        }).join('')
        return `<hp:tr>${tcs}</hp:tr>`
    }).join('')
    const totalW = colWidths.reduce((a, b) => a + b, 0)
    const tbl = `<hp:tbl id="1000000000" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`
    return `<hp:p id="${ids.nextParaId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${CP_BODY}">${floats.join('')}${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, profile.bodyHeight)}</hp:p>`
}

// ── 행 구성 ──

const titleBlock = (profile: FitProfile): Block =>
    makeBlock(profile, 'fixed', profile.titleRowHeight, [{ text: '장비 일일점검표', span: GRID.length, cp: CP_TITLE, center: true, header: true }])

/** 항목명 셀과 값 셀을 두 쌍 배치한다. 두 값 셀의 폭은 그리드에서 같게 잡혀 있다. */
const infoPairRow = (profile: FitProfile, label: string, value: string, rightLabel: string, rightValue: string): Block =>
    makeBlock(profile, 'fixed', profile.infoRowHeight, [
        { text: label, span: LABEL_SPAN, center: true, header: true },
        { text: value, span: VALUE_SPAN },
        { text: rightLabel, span: LABEL_SPAN, center: true, header: true },
        { text: rightValue, span: WIDE_VALUE_SPAN },
    ])

const columnHeaderRow = (profile: FitProfile): Block =>
    makeBlock(profile, 'fixed', profile.infoRowHeight, [
        { text: '구분', center: true, header: true },
        { text: '검사 내용', span: SUBJECT_SPAN, center: true, header: true },
        { text: '점검 결과', center: true, header: true },
    ])

// 서명 이미지는 안내문구 셀 위에 겹치고 이름 셀은 가리지 않는다.
function signatureRow(profile: FitProfile, inspectorName: string): Block {
    const block = makeBlock(profile, 'fixed', profile.signatureRowHeight, [
        { text: '점검자', span: LABEL_SPAN, center: true, header: true },
        { text: inspectorName, span: SUBJECT_SPAN },
        { text: '(서명 또는 인)', center: true },
    ])
    return { ...block, signature: true }
}

/** 묶음에 넣을 안내 그림 한 장 — 수집한 이미지 id와 알려진 원본 픽셀 크기. */
interface GuideSource {
    imageId: string
    width: number
    height: number
}

/** 안내 그림 한 장을 실제로 놓을 크기(HWPUNIT). 원본 픽셀 비율을 그대로 유지한다. */
interface GuidePlacement {
    imageId: string
    width: number
    height: number
}

/**
 * 안내 그림을 본문 폭 안에 나란히 눕힌다. 원본 픽셀 크기만으로 계산하므로 DOM 없이도 결과가 같다.
 * 두 장이면 폭을 반씩 나눠 가지며, 높이는 어느 장도 `maxHeight`를 넘지 않는다.
 * `maxHeight`는 한 장에 남은 자리에서 나오므로 점검 항목이 많을수록 그림이 비율 그대로 작아진다.
 */
function layoutGuideImages(profile: FitProfile, images: GuideSource[], maxHeight: number): { rowHeight: number; placed: GuidePlacement[] } {
    const padding = cellPadding(profile)
    const slot = Math.floor((CONTENT_WIDTH - padding - GUIDE_GAP * (images.length - 1)) / images.length)
    const placed = images.map(image => {
        const scale = Math.min(slot / image.width, maxHeight / image.height)
        return {
            imageId: image.imageId,
            width: Math.max(1, Math.round(image.width * scale)),
            height: Math.max(1, Math.round(image.height * scale)),
        }
    })
    return { rowHeight: Math.max(...placed.map(item => item.height)) + padding, placed }
}

/** 안내 그림을 겹칠 빈 행. 글자를 넣지 않아 그림이 문구를 가리지 않는다. */
function guideRow(profile: FitProfile, height: number): Block {
    const block = makeBlock(profile, 'fixed', height, [{ text: '', span: GRID.length, center: true }])
    return { ...block, guide: true }
}

/** 안내 그림들을 행 안에서 가로 가운데·세로 가운데로 늘어놓는다. */
function buildGuideFloats(ids: DocumentIds, placed: GuidePlacement[], rowTop: number, rowHeight: number): string[] {
    const total = placed.reduce((sum, item) => sum + item.width, 0) + GUIDE_GAP * (placed.length - 1)
    let x = MARGIN_LEFT + Math.round((CONTENT_WIDTH - total) / 2)
    return placed.map(item => {
        const xml = buildFloatingPicXml(ids, item.imageId, item.width, item.height, x,
            rowTop + Math.round((rowHeight - item.height) / 2))
        x += item.width + GUIDE_GAP
        return xml
    })
}

const noteRow = (profile: FitProfile, label: string, note: string, minHeight = 0): Block =>
    makeBlock(profile, 'note', minHeight, [
        { text: label, span: LABEL_SPAN, center: true, header: true },
        { text: note, span: GRID.length - LABEL_SPAN },
    ])

const RESULT_LABELS: Record<string, string> = { pass: '적합', fail: '부적합', na: '해당없음' }

const answerRow = (profile: FitProfile, category: string, index: number, text: string, result: string): Block =>
    makeBlock(profile, 'item', 0, [
        { text: category, center: true },
        { text: `${index + 1}. ${flattenSourceBreaks(text)}`, span: SUBJECT_SPAN },
        { text: RESULT_LABELS[result], center: true },
    ])

// 서명된 원문을 임의 치환하지 않고 XML 1.0에서 표현할 수 없는 입력을 거부한다.
function validateExportText(text: string): void {
    if (typeof text !== 'string') throw new Error('출력할 수 없는 문자 또는 잘못된 텍스트가 있습니다.')
    for (const char of text) {
        const code = char.codePointAt(0)!
        if (code === 9 || code === 10 || code === 13 ||
            (code >= 0x20 && code <= 0xD7FF) ||
            (code >= 0xE000 && code <= 0xFFFD) ||
            (code >= 0x10000 && code <= 0x10FFFF)) continue
        throw new Error('출력할 수 없는 문자가 있습니다. 입력 내용을 확인해 주세요.')
    }
}

/** 한 장에 담은 결과. `placed`가 비어 있으면 안내 그림이 없는 장비다. */
interface SinglePageLayout {
    profile: FitProfile
    rows: Row[]
    placed: GuidePlacement[]
}

/** 표에 들어갈 내용을 조판 단계와 무관하게 서술한 값. 단계마다 이 서술로 블록을 다시 잰다. */
interface PageContent {
    projectName: string
    record: EquipmentInspection
}

/** 점검 행·비고를 뺀 고정 골격(제목·기본정보·서명·표머리·종합 비고). 안내 그림 행은 뒤에 따로 끼운다. */
function chromeBlocks({ projectName, record }: PageContent, profile: FitProfile): { head: Block[]; tail: Block[] } {
    return {
        head: [
            titleBlock(profile),
            infoPairRow(profile, '현장명', projectName, '협력업체명', record.company_name),
            infoPairRow(profile, '장비종류', record.equipment_name, '점검일', record.inspection_date),
            infoPairRow(profile, '차량번호', record.vehicle_number, '기계번호', record.machine_number),
            signatureRow(profile, record.inspector_name),
        ],
        tail: [columnHeaderRow(profile)],
    }
}

/**
 * 한 조판 단계로 A4 한 장에 담아 본다. 담기면 행 목록을, 넘치면 null을 돌려준다.
 *
 * 점검 항목 행은 모두 같은 높이가 되므로 자리도 "가장 높은 점검 행 × 항목 수"로 잡는다. 자연 높이 합으로
 * 재면 두 줄짜리 문장이 한 줄 높이로 눌려 한글이 스스로 행을 늘리고 쪽이 넘어간다.
 * 그러고도 남는 높이는 먼저 안내 그림이 비율 그대로 받고(GUIDE_MAX_HEIGHT까지), 마지막에 점검 행이
 * 고르게 나눠 가져 표가 쪽 아래까지 닿는다. 어떤 글자도 잘라 내지 않으므로 "담긴다"는 판단은 원문이 전부 실린다는 뜻이다.
 *
 * `lastResort`면 안내 그림을 GUIDE_MIN_HEIGHT 밑으로도 줄인다 — 더 내려갈 조판 단계가 없을 때,
 * 그림을 조금 더 줄이면 담을 수 있는 기록까지 거부하지 않기 위해서다.
 */
function layoutSinglePage(content: PageContent, profile: FitProfile, guideSources: GuideSource[], lastResort: boolean): SinglePageLayout | null {
    const { record } = content
    const { head, tail } = chromeBlocks(content, profile)
    const body: Block[] = []
    record.answers.forEach((answer, index) => {
        body.push(answerRow(profile, answer.category, index, answer.text, answer.result))
        if (answer.note) body.push(noteRow(profile, `${index + 1}번 비고`, answer.note))
    })
    body.push(noteRow(profile, '종합 비고', record.remarks, SUMMARY_ROW_HEIGHT))

    const headRows = head.map(block => blockToRow(profile, block))
    const restRows = [...tail, ...body].map(block => blockToRow(profile, block))
    const itemRows = restRows.filter(row => row.kind === 'item')
    const used = [...headRows, ...restRows].reduce((sum, row) => sum + (row.kind === 'item' ? 0 : row.height), 0)
        + itemRows.length * Math.max(0, ...itemRows.map(row => row.height))
    const available = PAGE_CAPACITY - used
    if (available < 0) return null

    if (guideSources.length === 0) {
        return { profile, rows: fillPage([...headRows, ...restRows]), placed: [] }
    }
    // 그림이 쓸 수 있는 높이는 "남은 자리에서 셀 여백을 뺀 만큼"이다. 하한을 밑돌면 이 단계로는 담지 않는다.
    const imageBudget = Math.min(GUIDE_MAX_HEIGHT, available - cellPadding(profile))
    if (imageBudget < (lastResort ? GUIDE_FLOOR_HEIGHT : GUIDE_MIN_HEIGHT)) return null
    const guide = layoutGuideImages(profile, guideSources, imageBudget)
    const rows = [...headRows, blockToRow(profile, guideRow(profile, guide.rowHeight)), ...restRows]
    return { profile, rows: fillPage(rows), placed: guide.placed }
}

/** 저장된 항목 스냅샷을 그대로 출력한다. 카탈로그 변경은 과거 제출에 영향을 주지 않는다. */
export async function buildEquipmentInspectionHwpxBlob(record: EquipmentInspection, projectName: string): Promise<Blob> {
    for (const text of [projectName, record.equipment_name, record.inspection_date,
        record.company_name, record.vehicle_number, record.machine_number, record.inspector_name, record.remarks]) {
        validateExportText(text)
    }
    if (Array.from(record.inspector_name).length > 100) throw new Error('점검자명은 100자 이내로 입력해 주세요.')
    if (/[\r\n]/.test(record.inspector_name)) throw new Error('점검자명은 한 줄로 입력해 주세요.')
    for (const answer of record.answers) {
        if (answer.result !== 'pass' && answer.result !== 'fail' && answer.result !== 'na') {
            throw new Error('점검 결과는 적합, 부적합, 해당없음 중 하나여야 합니다.')
        }
        for (const text of [answer.category, answer.text, answer.note]) validateExportText(text)
    }
    const collector = new ImageCollector()
    const signatureId = await collector.collect(record.signature, true)
    if (record.signature && !signatureId) throw new Error('점검자 서명 이미지를 불러오지 못했습니다.')
    // 안내 그림은 원본 바이트 그대로 싣고(raw) 비율은 알려진 픽셀 크기로 계산한다 — 브라우저 밖에서도 결과가 같다.
    const guideSources: GuideSource[] = []
    for (const asset of equipmentGuideImages(record.equipment_type)) {
        const imageId = await collector.collect(asset.src, true)
        if (!imageId) throw new Error('장비 안내 그림을 불러오지 못했습니다.')
        guideSources.push({ imageId, width: asset.width, height: asset.height })
    }
    const content: PageContent = { projectName, record }

    // 제목·기본정보·서명·표머리·종합 비고는 통째로 들어가야 한다. 현장명 등이 지나치게 길어 가장 촘촘한
    // 단계에서도 점검 행 한 줄이 남지 않으면, 조용히 넘치게 두지 않고 어느 입력을 고쳐야 하는지 알린다.
    const tightest = FIT_PROFILES[FIT_PROFILES.length - 1]
    const { head, tail } = chromeBlocks(content, tightest)
    const chromeHeight = [...head, ...tail, noteRow(tightest, '종합 비고', '', SUMMARY_ROW_HEIGHT)]
        .reduce((sum, block) => sum + blockRowHeight(tightest, block), 0)
    const minimumBodyRow = lineAdvance(tightest, tightest.bodyHeight) + cellPadding(tightest) + tightest.rowSlack
    if (chromeHeight + minimumBodyRow > PAGE_CAPACITY) {
        throw new Error('현장명·업체명 등 기본정보가 너무 길어 한 쪽에 들어가지 않습니다. 내용을 줄여 주세요.')
    }

    // 읽기 좋은 단계부터 시도해 처음으로 한 장에 담기는 조판을 쓴다. 마지막 단계로도 담기지 않으면
    // 글자를 잘라 내거나 조용히 두 쪽으로 늘리지 않고 내용을 줄이도록 알린다.
    let layout: SinglePageLayout | null = null
    for (const [index, profile] of FIT_PROFILES.entries()) {
        layout = layoutSinglePage(content, profile, guideSources, index === FIT_PROFILES.length - 1)
        if (layout) break
    }
    if (!layout) {
        throw new Error('점검 항목과 비고가 많아 A4 한 장에 담을 수 없습니다. 비고 등 입력 내용을 줄여 주세요.')
    }
    const { profile, rows, placed } = layout

    // 출력 한 건에서만 쓰는 번호표라 동시에 여러 건을 내려받아도 서로의 개체 번호를 건드리지 않는다.
    const ids = new DocumentIds()

    // 서명 좌표는 최종 그리드에서 도출한다 — 안내문구 열의 가로 중앙, 서명 행의 세로 중앙.
    const signatureImage = collector.find(signatureId)
    const ratio = signatureImage?.wPx && signatureImage.hPx ? signatureImage.wPx / signatureImage.hPx : 3
    const noticeWidth = GRID[GUIDE_COLUMN]
    const signatureWidth = Math.round(Math.min(noticeWidth - 600, SIGNATURE_MAX_HEIGHT * ratio))
    const signatureHeight = Math.round(signatureWidth / ratio)
    const signatureIndex = rows.findIndex(row => row.signature)
    const heightAbove = rows.slice(0, signatureIndex).reduce((sum, row) => sum + row.height, 0)
    const signatureRowHeight = rows[signatureIndex].height
    const signature = signatureId ? buildFloatingPicXml(ids, signatureId, signatureWidth, signatureHeight,
        MARGIN_LEFT + sumRange(GRID, 0, GUIDE_COLUMN) + Math.round((noticeWidth - signatureWidth) / 2),
        BODY_TOP + heightAbove + Math.round((signatureRowHeight - signatureHeight) / 2)) : ''

    // 안내 그림도 같은 방식으로 최종 그리드에서 좌표를 도출한다 — 안내 행 한가운데다.
    const guideIndex = placed.length > 0 ? rows.findIndex(row => row.guide) : -1
    const guideFloats = guideIndex >= 0
        ? buildGuideFloats(ids, placed,
            BODY_TOP + rows.slice(0, guideIndex).reduce((sum, row) => sum + row.height, 0),
            rows[guideIndex].height)
        : []

    const section = `${SECPR}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
    const table = buildTableParagraph(ids, profile, GRID, rows, [...guideFloats, ...(signature ? [signature] : [])])
    const body = table.replace(`<hp:run charPrIDRef="${CP_BODY}">`, `<hp:run charPrIDRef="${CP_BODY}">${section}`)
    const zip = new JSZip()
    zip.file('mimetype', MIMETYPE, { compression: 'STORE' })
    zip.file('version.xml', VERSION_XML)
    zip.file('settings.xml', SETTINGS_XML)
    zip.file('Contents/header.xml', buildHeaderXml(profile))
    zip.file('Contents/section0.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SEC_XMLNS}>${body}</hs:sec>`)
    zip.file('Contents/content.hpf', buildContentHpf(collector.images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')))
    zip.file('Preview/PrvText.txt', PRV_TEXT)
    zip.file('META-INF/container.xml', CONTAINER_XML)
    zip.file('META-INF/container.rdf', CONTAINER_RDF)
    zip.file('META-INF/manifest.xml', MANIFEST_XML)
    for (const img of collector.images) zip.file(`BinData/${img.filename}`, img.data)
    return zip.generateAsync({ type: 'blob', mimeType: MIMETYPE, compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export async function downloadEquipmentInspectionHwpx(record: EquipmentInspection, projectName: string): Promise<void> {
    const blob = await buildEquipmentInspectionHwpxBlob(record, projectName)
    const name = `${projectName}_${record.equipment_name}_일일점검_${record.inspection_date}`.replace(/[\\/:*?"<>|]/g, '_')
    triggerDownload(blob, `${name}.hwpx`)
}
