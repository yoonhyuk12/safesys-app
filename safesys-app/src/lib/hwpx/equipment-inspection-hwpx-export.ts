// 장비 일일점검 기록을 서명과 명시적 페이지 분할을 포함한 HWPX로 조립한다.
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

// 그림 개체 일련번호. id/instid는 문서 내 유일해야 하며, 필수 자식 요소가 빠지면 한글 2020이 열다 죽는다.
let _picSeq = 0
function resetPicSeq(): void { _picSeq = 0 }

// 한글이 직접 저장한 hwpx의 hp:pic 구조를 그대로 답습한 공통 골격 (요소 순서 포함)
function buildPicXml(binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
    _picSeq++
    const id = 1149648000 + _picSeq
    const instid = 75906000 + _picSeq
    const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
    return `<hp:pic id="${id}" zOrder="${10 + _picSeq}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

// "(서명)" 문구 위에 겹치는 떠 있는 그림(서명용). 쪽(PAPER) 기준 절대 좌표라 표 밖 돌출도 허용된다.
// textWrap은 반드시 IN_FRONT_OF_TEXT(글 앞으로) — THROUGH는 한글 2020이 자리차지로 처리해 표를 밀어낸다.
function buildFloatingPicXml(binItemId: string, imgW: number, imgH: number, xPaper: number, yPaper: number): string {
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

const PRV_TEXT = '장비 일일점검표'

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 용지와 여백(HWPUNIT). 구역 속성·쪽 예산·서명 절대 좌표가 모두 이 값에서 나온다.
const PAGE_WIDTH = 59528
const PAGE_HEIGHT = 84188
const MARGIN_LEFT = 4252
const MARGIN_RIGHT = 4252
const MARGIN_TOP = 3600
const MARGIN_BOTTOM = 3600
const HEADER_HEIGHT = 3600
const FOOTER_HEIGHT = 3600
// 본문 폭 51024, 본문 시작 7200, 본문 높이 69788.
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const BODY_TOP = MARGIN_TOP + HEADER_HEIGHT
const PAGE_CAPACITY = PAGE_HEIGHT - (MARGIN_TOP + HEADER_HEIGHT) - (MARGIN_BOTTOM + FOOTER_HEIGHT)

// 첫 문단에 들어가는 구역 속성(A4 세로)
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" gutterType="LEFT_ONLY"><hp:margin header="${HEADER_HEIGHT}" footer="${FOOTER_HEIGHT}" gutter="0" left="${MARGIN_LEFT}" right="${MARGIN_RIGHT}" top="${MARGIN_TOP}" bottom="${MARGIN_BOTTOM}"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// ── header.xml 조립 ──
// borderFill: 1=테두리없음, 2=실선 사방테두리(셀), 3=실선+회색채움(머리셀)
// charPr: 0=본문10, 1=굵게10, 2=제목16굵게, 3=작게7, 4=굵게9, 5=굵게11, 6=굵게12, 7=본문9
// paraPr: 0=왼쪽정렬, 1=가운데정렬

const CP_HEIGHT: Record<number, number> = { 0: 1000, 1: 1000, 2: 1600, 3: 700, 4: 900, 5: 1100, 6: 1200, 7: 900 }

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
    ].join('')
    return `<hh:charProperties itemCnt="8">${items}</hh:charProperties>`
}

function buildParaPr(id: number, align: string): string {
    const margin = `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>`
    const sw = `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:case><hp:default>${margin}<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:default></hp:switch>`
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/>${sw}<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`
}

function buildParaProperties(): string {
    return `<hh:paraProperties itemCnt="2">${buildParaPr(0, 'LEFT')}${buildParaPr(1, 'CENTER')}</hh:paraProperties>`
}

function buildNumberings(): string {
    const heads = Array.from({ length: 7 }, (_, i) => {
        const lv = i + 1
        return `<hh:paraHead start="1" level="${lv}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^${lv}.</hh:paraHead>`
    }).join('')
    return `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">${heads}</hh:numbering></hh:numberings>`
}

function buildHeaderXml(): string {
    const open = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" version="1.4" secCnt="1">`
    const begin = `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>`
    const tabProps = `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>`
    const styles = `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>`
    const memo = `<hh:memoProperties itemCnt="1"><hh:memoPr id="1" width="15591" lineWidth="1" lineType="SOLID" lineColor="#000000" fillColor="#CCFF99" activeColor="#FFFF99" memoType="NOMAL"/></hh:memoProperties>`
    const refList = `<hh:refList>${buildFontfaces()}${buildBorderFills()}${buildCharProperties()}${tabProps}${buildNumberings()}${buildParaProperties()}${styles}${memo}</hh:refList>`
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

let _idSeq = 2147483648
function nextId(): string { return String(_idSeq++) }

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

// 글자 크기에서 유도하는 배치 상수.
const CELL_MARGIN = 141                        // 셀 안쪽 여백(상·하·좌·우)
const CELL_PADDING = CELL_MARGIN * 2
const ROW_SLACK = 200                          // 줄 수 추정 오차를 흡수하는 여유
const TITLE_ROW_HEIGHT = 3400
const INFO_ROW_HEIGHT = 2000
const SUMMARY_ROW_HEIGHT = 3000 // 종합 의견이 비어 있어도 약 11mm의 작성 공간을 확보한다.
const SIGNATURE_ROW_HEIGHT = 3400
const SIGNATURE_MAX_HEIGHT = 2400
const MIN_SPLIT_LINES = 3                      // 이보다 적게 남은 쪽엔 비고를 쪼개 넣지 않는다
// 안내 그림 묶음의 최대 높이(약 67mm). 이보다 커지면 첫 쪽 점검 행이 지나치게 밀린다.
const GUIDE_MAX_HEIGHT = 19000
const GUIDE_GAP = 600                          // 그림을 나란히 둘 때의 간격

const lineAdvance = (charHeight: number): number => Math.round(charHeight * 1.3)

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
function splitDisplayLines(text: string, cellWidth: number, charHeight: number): TextSegment[] {
    // 한 글자만큼 좁게 잡아, 한글이 실제로 접는 줄 수가 추정을 넘지 않게 한다.
    const usable = Math.max(charHeight, cellWidth - CELL_PADDING - charHeight)
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

function makeBlock(kind: RowKind, minHeight: number, cells: Cell[]): Block {
    let column = 0
    const measured = cells.map(spec => {
        const span = spec.span ?? 1
        const width = sumRange(GRID, column, span)
        column += span
        return { spec, segments: splitDisplayLines(trimCellText(spec.text ?? ''), width, CP_HEIGHT[spec.cp ?? 0] ?? 1000) }
    })
    return { kind, minHeight, cells: measured }
}

const blockLines = (block: Block): number => Math.max(1, ...block.cells.map(cell => cell.segments.length))

function blockRowHeight(block: Block, lines: number): number {
    const advance = Math.max(...block.cells.map(cell => lineAdvance(CP_HEIGHT[cell.spec.cp ?? 0] ?? 1000)))
    return Math.max(block.minHeight, lines * advance + CELL_PADDING + ROW_SLACK)
}

// 블록 앞쪽 `lines`줄만 행으로 떼어내고 남은 줄은 다음 쪽으로 넘길 블록으로 돌려준다.
// 잘린 조각을 이어 붙이면 원문이 그대로라 쪽 경계에서 글자가 사라지지 않는다.
function sliceBlock(block: Block, lines: number): { row: Row; rest: Block | null } {
    const used = Math.min(Math.max(1, lines), blockLines(block))
    const taken = block.cells.map(cell => cell.segments.slice(0, used))
    const remain = block.cells.map(cell => cell.segments.slice(used))
    const row: Row = {
        kind: block.kind,
        signature: block.signature,
        guide: block.guide,
        height: blockRowHeight(block, Math.max(1, ...taken.map(segments => segments.length))),
        cells: block.cells.map((cell, index) => ({ ...cell.spec, text: joinSegments(taken[index]) })),
    }
    const rest = remain.some(segments => segments.length > 0)
        ? { ...block, cells: block.cells.map((cell, index) => ({ spec: cell.spec, segments: remain[index] })) }
        : null
    return { row, rest }
}

// 쪽이 실제로 차지하는 높이. 점검 항목 행은 같은 쪽에서 모두 같은 높이가 되므로 가장 높은 행 기준으로 센다.
function pageHeight(rows: Row[]): number {
    const items = rows.filter(row => row.kind === 'item')
    const others = rows.reduce((sum, row) => sum + (row.kind === 'item' ? 0 : row.height), 0)
    return others + (items.length ? items.length * Math.max(...items.map(row => row.height)) : 0)
}

// 이 쪽에 블록을 몇 줄까지 넣을 수 있는지. 0이면 한 줄도 들어가지 않는다.
function maxLinesThatFit(rows: Row[], block: Block, budget: number): number {
    let low = 0
    let high = blockLines(block)
    while (low < high) {
        const mid = Math.ceil((low + high) / 2)
        if (pageHeight([...rows, sliceBlock(block, mid).row]) <= budget) low = mid
        else high = mid - 1
    }
    return low
}

function paginate(prefixRows: (first: boolean) => Row[], blocks: Block[], budget: number): Row[][] {
    const pages: Row[][] = []
    let current = prefixRows(true)
    let prefixLength = current.length
    const startNewPage = (): void => {
        pages.push(current)
        current = prefixRows(false)
        prefixLength = current.length
    }
    for (const block of blocks) {
        let pending: Block | null = block
        while (pending) {
            const total = blockLines(pending)
            const fit = maxLinesThatFit(current, pending, budget)
            if (fit >= total) {
                current.push(sliceBlock(pending, total).row)
                break
            }
            // 표머리만 있는 빈 쪽에서도 안 들어가면 더 미룰 곳이 없으니 여기서 쪼갠다.
            const isFresh = current.length === prefixLength
            if (isFresh || (pending.kind === 'note' && fit >= MIN_SPLIT_LINES)) {
                const { row, rest } = sliceBlock(pending, Math.max(1, fit))
                current.push(row)
                pending = rest
                if (pending) startNewPage()
                continue
            }
            startNewPage()
        }
    }
    pages.push(current)
    return pages
}

// 점검 항목 행에 남는 높이를 균등하게 나눠 준다 — 같은 쪽 행 높이 차이는 최대 1 HWPUNIT이다.
// 비고 행은 최소 높이를 지키고, 점검 행이 없는 쪽에서만 남는 높이를 비례로 받는다.
function fillPage(rows: Row[]): Row[] {
    const items = rows.filter(row => row.kind === 'item')
    if (items.length === 0) return stretchNoteRows(rows)
    const others = rows.reduce((sum, row) => sum + (row.kind === 'item' ? 0 : row.height), 0)
    const free = PAGE_CAPACITY - others
    if (free < items.reduce((sum, row) => sum + row.height, 0)) return rows
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
function buildCellBody(cell: Cell, cellW: number): string {
    const cp = cell.cp ?? 0
    const pp = cell.center ? 1 : 0
    const h = CP_HEIGHT[cp] ?? 1000
    const innerW = Math.max(1, cellW - CELL_PADDING)
    return (cell.text ?? '').split('\n').map(line =>
        `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    ).join('')
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number): string {
    const span = cell.span ?? 1
    const bf = cell.header ? 3 : 2
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="${CELL_MARGIN}" right="${CELL_MARGIN}" top="${CELL_MARGIN}" bottom="${CELL_MARGIN}"/></hp:tc>`
}

// 표를 감싼 문단 XML 반환. floats는 이 표가 놓인 쪽에 겹칠 떠 있는 그림 XML 목록.
// pageBreak=true면 이 표가 새 쪽에서 시작한다.
function buildTableParagraph(colWidths: number[], rows: Row[], tblId: number, zOrder: number, floats: string[] = [], pageBreak = false): string {
    const colCnt = colWidths.length
    const trs = rows.map((row, r) => {
        let colAddr = 0
        const tcs = row.cells.map(cell => {
            const span = cell.span ?? 1
            const width = sumRange(colWidths, colAddr, span)
            const tc = buildCellXml(cell, colAddr, r, width, row.height)
            colAddr += span
            return tc
        }).join('')
        return `<hp:tr>${tcs}</hp:tr>`
    }).join('')
    const totalW = colWidths.reduce((a, b) => a + b, 0)
    const tbl = `<hp:tbl id="${tblId}" zOrder="${zOrder}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="${pageBreak ? '1' : '0'}" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${floats.join('')}${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
}

// ── 행 구성 ──

const BODY_CP = 7

const titleBlock = (continuation: boolean): Block =>
    makeBlock('fixed', TITLE_ROW_HEIGHT, [{ text: `장비 일일점검표${continuation ? ' (계속)' : ''}`, span: GRID.length, cp: 2, center: true, header: true }])

/** 항목명 셀과 값 셀을 두 쌍 배치한다. 두 값 셀의 폭은 그리드에서 같게 잡혀 있다. */
const infoPairRow = (label: string, value: string, rightLabel: string, rightValue: string): Block =>
    makeBlock('fixed', INFO_ROW_HEIGHT, [
        { text: label, span: LABEL_SPAN, cp: BODY_CP, center: true, header: true },
        { text: value, span: VALUE_SPAN, cp: BODY_CP },
        { text: rightLabel, span: LABEL_SPAN, cp: BODY_CP, center: true, header: true },
        { text: rightValue, span: WIDE_VALUE_SPAN, cp: BODY_CP },
    ])

const columnHeaderRow = (): Block =>
    makeBlock('fixed', INFO_ROW_HEIGHT, [
        { text: '구분', cp: BODY_CP, center: true, header: true },
        { text: '검사 내용', span: SUBJECT_SPAN, cp: BODY_CP, center: true, header: true },
        { text: '점검 결과', cp: BODY_CP, center: true, header: true },
    ])

// 서명 이미지는 안내문구 셀 위에 겹치고 이름 셀은 가리지 않는다.
function signatureRow(inspectorName: string): Block {
    const block = makeBlock('fixed', SIGNATURE_ROW_HEIGHT, [
        { text: '점검자', span: LABEL_SPAN, cp: BODY_CP, center: true, header: true },
        { text: inspectorName, span: SUBJECT_SPAN, cp: BODY_CP },
        { text: '(서명 또는 인)', cp: BODY_CP, center: true },
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
 * 두 장이면 폭을 반씩 나눠 가지며, 높이는 묶음 전체가 GUIDE_MAX_HEIGHT를 넘지 않는다.
 */
function layoutGuideImages(images: GuideSource[]): { rowHeight: number; placed: GuidePlacement[] } {
    const slot = Math.floor((CONTENT_WIDTH - CELL_PADDING - GUIDE_GAP * (images.length - 1)) / images.length)
    const placed = images.map(image => {
        const scale = Math.min(slot / image.width, GUIDE_MAX_HEIGHT / image.height)
        return {
            imageId: image.imageId,
            width: Math.max(1, Math.round(image.width * scale)),
            height: Math.max(1, Math.round(image.height * scale)),
        }
    })
    return { rowHeight: Math.max(...placed.map(item => item.height)) + CELL_PADDING, placed }
}

/** 안내 그림을 겹칠 빈 행. 글자를 넣지 않아 그림이 문구를 가리지 않는다. */
function guideRow(height: number): Block {
    const block = makeBlock('fixed', height, [{ text: '', span: GRID.length, cp: BODY_CP, center: true }])
    return { ...block, guide: true }
}

/** 안내 그림들을 행 안에서 가로 가운데·세로 가운데로 늘어놓는다. */
function buildGuideFloats(placed: GuidePlacement[], rowTop: number, rowHeight: number): string[] {
    const total = placed.reduce((sum, item) => sum + item.width, 0) + GUIDE_GAP * (placed.length - 1)
    let x = MARGIN_LEFT + Math.round((CONTENT_WIDTH - total) / 2)
    return placed.map(item => {
        const xml = buildFloatingPicXml(item.imageId, item.width, item.height, x,
            rowTop + Math.round((rowHeight - item.height) / 2))
        x += item.width + GUIDE_GAP
        return xml
    })
}

const noteRow = (label: string, note: string, minHeight = 0): Block =>
    makeBlock('note', minHeight, [
        { text: label, span: LABEL_SPAN, cp: BODY_CP, center: true, header: true },
        { text: note, span: GRID.length - LABEL_SPAN, cp: BODY_CP },
    ])

const RESULT_LABELS: Record<string, string> = { pass: '적합', fail: '부적합', na: '해당없음' }

const answerRow = (category: string, index: number, text: string, result: string): Block =>
    makeBlock('item', 0, [
        { text: category, cp: BODY_CP, center: true },
        { text: `${index + 1}. ${flattenSourceBreaks(text)}`, span: SUBJECT_SPAN, cp: BODY_CP },
        { text: RESULT_LABELS[result], cp: BODY_CP, center: true },
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
    // 비동기 이미지 수집 뒤부터 XML 조립까지는 동기 구간이므로 동시 다운로드 간 ID가 섞이지 않는다.
    resetPicSeq()
    _idSeq = 2147483648
    const guideLayout = guideSources.length > 0 ? layoutGuideImages(guideSources) : null

    const equipmentPair = (): Block => infoPairRow('장비종류', record.equipment_name, '점검일', record.inspection_date)
    const firstPageBlocks = (): Block[] => [
        titleBlock(false),
        infoPairRow('현장명', projectName, '협력업체명', record.company_name),
        equipmentPair(),
        infoPairRow('차량번호', record.vehicle_number, '기계번호', record.machine_number),
        signatureRow(record.inspector_name),
        // 안내 그림은 첫 쪽 점검 항목 바로 위에 한 번만 넣는다. 계속 쪽에는 반복하지 않는다.
        ...(guideLayout ? [guideRow(guideLayout.rowHeight)] : []),
        columnHeaderRow(),
    ]
    const continuationBlocks = (): Block[] => [titleBlock(true), equipmentPair(), columnHeaderRow()]
    const prefixRows = (first: boolean): Row[] =>
        (first ? firstPageBlocks() : continuationBlocks()).map(block => sliceBlock(block, blockLines(block)).row)

    // 제목·기본정보·서명·표머리는 쪽마다 통째로 들어가야 한다. 현장명 등이 지나치게 길어 점검 행 한 줄도
    // 남지 않으면 조용히 넘치게 두지 않고 입력을 고치도록 알린다.
    const minimumBodyRow = lineAdvance(CP_HEIGHT[BODY_CP]) + CELL_PADDING + ROW_SLACK
    for (const first of [true, false]) {
        const used = prefixRows(first).reduce((sum, row) => sum + row.height, 0)
        if (used + minimumBodyRow > PAGE_CAPACITY) {
            throw new Error('현장명·업체명 등 기본정보가 너무 길어 한 쪽에 들어가지 않습니다. 내용을 줄여 주세요.')
        }
    }

    const blocks: Block[] = []
    record.answers.forEach((answer, index) => {
        blocks.push(answerRow(answer.category, index, answer.text, answer.result))
        if (answer.note) blocks.push(noteRow(`${index + 1}번 비고`, answer.note))
    })
    blocks.push(noteRow('종합 비고', record.remarks, SUMMARY_ROW_HEIGHT))

    // 쪽 예산을 줄이면 앞 쪽이 덜 담고 뒤 쪽이 더 담는다. 쪽 수가 늘지 않는 배치들 가운데 가장 고르게
    // 나뉜 것을 고른다 — 첫 쪽에만 있는 안내 그림 때문에 행 높이가 한쪽으로 쏠리지 않게 하려는 것이다.
    // 비용은 "쪽을 채우려고 점검 행 하나가 늘어나야 하는 높이"의 최댓값이다. 한 쪽에 점검 행이 몰리면
    // 나머지 쪽의 비고 한 칸이 남는 높이를 통째로 받으므로 그 쪽도 같은 잣대로 비싸게 매겨진다.
    // 같은 배치를 내는 예산은 구간으로 뭉치므로, 배치마다 그 배치가 성립하는 가장 작은 예산 바로 아래로 건너뛴다.
    const worstStretch = (pages: Row[][]): number => Math.max(...pages.map(rows => {
        const free = Math.max(0, PAGE_CAPACITY - pageHeight(rows))
        return free / Math.max(1, rows.filter(row => row.kind === 'item').length)
    }))
    let best = paginate(prefixRows, blocks, PAGE_CAPACITY)
    const pageCount = best.length
    let bestCost = worstStretch(best)
    let pages = best
    let budget = PAGE_CAPACITY
    for (;;) {
        const next = Math.min(budget, Math.max(...pages.map(pageHeight))) - 1
        if (next <= 0) break
        budget = next
        pages = paginate(prefixRows, blocks, budget)
        if (pages.length > pageCount) break
        const cost = worstStretch(pages)
        if (cost < bestCost) {
            best = pages
            bestCost = cost
        }
    }
    const filledPages = best.map(fillPage)

    // 서명 좌표는 최종 그리드에서 도출한다 — 안내문구 열의 가로 중앙, 서명 행의 세로 중앙.
    const signatureImage = collector.find(signatureId)
    const ratio = signatureImage?.wPx && signatureImage.hPx ? signatureImage.wPx / signatureImage.hPx : 3
    const noticeWidth = GRID[GUIDE_COLUMN]
    const signatureWidth = Math.round(Math.min(noticeWidth - 600, SIGNATURE_MAX_HEIGHT * ratio))
    const signatureHeight = Math.round(signatureWidth / ratio)
    const signatureIndex = filledPages[0].findIndex(row => row.signature)
    const heightAbove = filledPages[0].slice(0, signatureIndex).reduce((sum, row) => sum + row.height, 0)
    const signatureRowHeight = filledPages[0][signatureIndex].height
    const signature = signatureId ? buildFloatingPicXml(signatureId, signatureWidth, signatureHeight,
        MARGIN_LEFT + sumRange(GRID, 0, GUIDE_COLUMN) + Math.round((noticeWidth - signatureWidth) / 2),
        BODY_TOP + heightAbove + Math.round((signatureRowHeight - signatureHeight) / 2)) : ''

    // 안내 그림도 같은 방식으로 최종 그리드에서 좌표를 도출한다 — 첫 쪽의 안내 행 한가운데다.
    const guideIndex = guideLayout ? filledPages[0].findIndex(row => row.guide) : -1
    const guideFloats = guideLayout && guideIndex >= 0
        ? buildGuideFloats(guideLayout.placed,
            BODY_TOP + filledPages[0].slice(0, guideIndex).reduce((sum, row) => sum + row.height, 0),
            filledPages[0][guideIndex].height)
        : []
    const firstPageFloats = [...guideFloats, ...(signature ? [signature] : [])]

    const parts = filledPages.map((rows, index) => {
        const xml = buildTableParagraph(GRID, rows, 1000000000 + index, index, index === 0 ? firstPageFloats : [], index > 0)
        if (index > 0) return xml
        const section = `${SECPR}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
        return xml.replace('<hp:run charPrIDRef="0">', `<hp:run charPrIDRef="0">${section}`)
    })
    const zip = new JSZip()
    zip.file('mimetype', MIMETYPE, { compression: 'STORE' })
    zip.file('version.xml', VERSION_XML)
    zip.file('settings.xml', SETTINGS_XML)
    zip.file('Contents/header.xml', buildHeaderXml())
    zip.file('Contents/section0.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SEC_XMLNS}>${parts.join('')}</hs:sec>`)
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
