// TBM 일일안전교육일지(회의록)를 한글문서(hwpx/OWPML)로 조립·다운로드하는 모듈
import JSZip from 'jszip'
import type { TBMSubmissionFormData } from '@/lib/reports/tbm-submission-report'
import type { TBMWorkerSignatureEntry } from '@/lib/excel/tbm-worker-signature-export'

// ── 공통 헬퍼 (기존 hwpx 모듈 패턴 답습) ──

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
}

async function fetchImageAsBuffer(url: string, raw: boolean): Promise<{ data: Uint8Array; ext: string } | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        let blob = await res.blob()
        if (!raw) {
            const normalized = await normalizeImageBlob(blob)
            if (normalized) blob = normalized
        }
        const buf = await blob.arrayBuffer()
        const mime = (blob.type || '').toLowerCase()
        const ext = mime.includes('png') ? 'png' : 'jpg'
        return { data: new Uint8Array(buf), ext }
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
        this.images.push({ id, filename, data: img.data, ext: img.ext })
        return id
    }
}

// 셀 안에 꽉 채우는 인라인 그림(사진용)
function buildInlinePicXml(binItemId: string, cellW: number, cellH: number): string {
    const margin = 282
    const imgW = Math.max(1, cellW - margin)
    const imgH = Math.max(1, cellH - margin)
    return `<hp:pic reverse="0"><hp:sz width="${imgW}" height="${imgH}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:imgRect x="0" y="0" cx="${imgW}" cy="${imgH}"/><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>`
}

// "(서명)" 안내 문구 위에 겹쳐 놓는 떠 있는 그림(서명용). treatAsChar="0"으로 텍스트와 겹침.
function buildFloatingPicXml(binItemId: string, imgW: number, imgH: number, horzOffset: number, vertOffset: number): string {
    return `<hp:pic reverse="0"><hp:sz width="${imgW}" height="${imgH}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="${vertOffset}" horzOffset="${horzOffset}"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:imgRect x="0" y="0" cx="${imgW}" cy="${imgH}"/><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:shapeComment>signature</hp:shapeComment><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>`
}

// ── OWPML 부속 파일(고정 보일러플레이트) ──

const MIMETYPE = 'application/hwp+zip'

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 7936 WIN32LEWindows_10"/>`

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`

const CONTAINER_RDF = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`

const PRV_TEXT = '일일안전교육일지(TBM 회의록)'

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 페이지 본문 폭(HWPUNIT): 59528 - 좌우여백 5669*2 = 48190
const CONTENT_WIDTH = 48190

// 첫 문단에 들어가는 구역 속성(A4 세로)
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="3600" footer="3600" gutter="0" left="5669" right="5669" top="3600" bottom="3600"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// ── header.xml 조립 ──
// borderFill: 1=테두리없음, 2=실선 사방테두리(셀), 3=실선+회색채움(머리셀)
// charPr: 0=본문10, 1=굵게10, 2=제목16굵게, 3=작게7, 4=굵게9, 5=굵게11, 6=굵게12, 7=본문9
// paraPr: 0=왼쪽정렬, 1=가운데정렬

const CP_HEIGHT: Record<number, number> = { 0: 1000, 1: 1000, 2: 1600, 3: 700, 4: 900, 5: 1100, 6: 1200, 7: 900 }

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
    const meta = `<opf:metadata><opf:title>일일안전교육일지(TBM 회의록)</opf:title><opf:language>ko</opf:language></opf:metadata>`
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

interface Cell {
    text?: string
    span?: number          // colSpan (기본 1)
    header?: boolean       // 회색 머리셀 여부
    cp?: number            // charPrIDRef (기본 0)
    center?: boolean       // 가로 가운데 정렬
    top?: boolean          // 세로 위 정렬(기본 가운데)
    picId?: string | null  // 인라인 그림(사진)
    picH?: number          // 인라인 그림 높이(HWPUNIT)
    floatPicId?: string | null // 떠 있는 그림(서명)
}

interface Row {
    height: number
    cells: Cell[]
}

function sumRange(widths: number[], start: number, count: number): number {
    let s = 0
    for (let i = start; i < start + count; i++) s += widths[i] || 0
    return s
}

// 셀 내부 본문(여러 줄이면 문단 분리) 조립
function buildCellBody(cell: Cell, cellW: number): string {
    const cp = cell.cp ?? 0
    const pp = cell.center ? 1 : 0
    const h = CP_HEIGHT[cp] ?? 1000
    const innerW = Math.max(1, cellW - 282)

    if (cell.picId) {
        const pic = buildInlinePicXml(cell.picId, cellW, cell.picH ?? 4000)
        return `<hp:p id="${nextId()}" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${pic}</hp:run>${lineseg(innerW, 1000)}</hp:p>`
    }

    const lines = (cell.text ?? '').split('\n')
    const floatRun = cell.floatPicId
        ? `<hp:run charPrIDRef="${cp}">${buildFloatingPicXml(cell.floatPicId, 3000, 1100, Math.max(0, Math.round((innerW - 3000) / 2)), 150)}</hp:run>`
        : ''
    return lines.map((line, idx) => {
        const fr = idx === 0 ? floatRun : ''
        return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${fr}<hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    }).join('')
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number): string {
    const span = cell.span ?? 1
    const bf = cell.header ? 3 : 2
    const valign = cell.top ? 'TOP' : 'CENTER'
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
}

// 표를 감싼 문단 XML 반환
function buildTableParagraph(colWidths: number[], rows: Row[], tblId: number, zOrder: number): string {
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
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
}

// 표 밖 단독 문단(법조문·제목·하단메모·서명부 제목 등)
function buildTextParagraph(text: string, cp: number, center: boolean, pageBreak: boolean): string {
    const pp = center ? 1 : 0
    const h = CP_HEIGHT[cp] ?? 1000
    const pb = pageBreak ? '1' : '0'
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pb}" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// 첫 문단(구역 속성 포함) — 법조문 텍스트를 담는다
function buildFirstParagraph(lawText: string): string {
    const ctrl = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="3">${SECPR}${ctrl}</hp:run><hp:run charPrIDRef="3"><hp:t>${esc(lawText)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, 700)}</hp:p>`
}

// ── 본문(TBM 일지) 표 구성 ──

// 8열 그리드 폭(합 = 48190)
const COLS_MAIN = [3012, 3012, 7028, 7028, 7028, 7028, 7028, 7026]

function getDayOfWeek(dateStr: string): string {
    const days = ['일', '월', '화', '수', '목', '금', '토']
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? '' : days[d.getDay()]
}

function buildTbmTableRows(f: TBMSubmissionFormData, photoId: string | null, sigId: string | null): Row[] {
    const dateTime = `${f.educationDate || ''} ${f.educationStartTime || ''} (20분) 작업 날짜와 동일함`
    const workName = `${f.projectName || ''} (${f.headquarters || ''}-${f.branch || ''})`

    let personnel = (f.personnelInput || '').trimStart()
    if (f.newWorkerCount && f.newWorkerCount !== '0') {
        personnel += personnel ? `\n\n신규근로자: ${f.newWorkerCount}명` : `신규근로자: ${f.newWorkerCount}명`
    }
    const equipment = (f.equipmentInput || '').trimStart()

    const risks = [
        { r: f.potentialRisk1, s: f.solution1 },
        { r: f.potentialRisk2, s: f.solution2 },
        { r: f.potentialRisk3, s: f.solution3 },
    ]
    const factors = [f.riskFactor1, f.riskFactor2, f.riskFactor3]

    const rows: Row[] = []

    // TBM리더
    rows.push({
        height: 2600,
        cells: [
            { text: 'TBM리더', span: 2, header: true, cp: 1, center: true },
            { text: `◆ 소속 : ${f.constructionCompany || ''}`, span: 3 },
            { text: '이름', header: true, cp: 1, center: true },
            { text: f.name || '', center: true },
            { text: '(서명)', center: true, floatPicId: sigId },
        ],
    })
    // TBM 일시
    rows.push({ height: 1500, cells: [{ text: 'TBM 일시', span: 2, header: true, cp: 1, center: true }, { text: dateTime, span: 6 }] })
    // 작업명
    rows.push({ height: 1500, cells: [{ text: '작업명', span: 2, header: true, cp: 1, center: true }, { text: workName, span: 6 }] })
    // 작업내용
    rows.push({ height: 2400, cells: [{ text: '작업내용', span: 2, header: true, cp: 1, center: true }, { text: f.todayWork || '', span: 6, top: true }] })
    // TBM 장소
    rows.push({
        height: 1600,
        cells: [
            { text: 'TBM 장소', span: 2, header: true, cp: 1, center: true },
            { text: f.address || '', span: 3 },
            { text: '위험성평가\n실시여부', header: true, cp: 4, center: true },
            { text: '예 ☑  아니오 ☐', span: 2, center: true },
        ],
    })
    // 잠재위험요인 머리
    rows.push({
        height: 1600,
        cells: [
            { text: '잠재위험요인(수시위험성평가와 연계)', span: 4, header: true, cp: 1, center: true },
            { text: '대책(제거>대체>통제 순서고려)', span: 4, header: true, cp: 1, center: true },
        ],
    })
    // 잠재위험요인 1~3
    risks.forEach((it, i) => {
        rows.push({
            height: 1600,
            cells: [
                { text: `${i + 1}. ${(it.r || '').trim()}`, span: 4, top: true },
                { text: `${i + 1}. ${(it.s || '').trim()}`, span: 4, top: true },
            ],
        })
    })
    // 중점위험요인
    rows.push({
        height: 2000,
        cells: [
            { text: '중점위험\n요인', span: 2, header: true, cp: 1, center: true },
            { text: `선정: ${(f.mainRiskSelection || '').trim()}`, span: 3, top: true },
            { text: `대책: ${(f.mainRiskSolution || '').trim()}`, span: 3, top: true },
        ],
    })
    // 안전조치 확인 머리
    rows.push({ height: 1500, cells: [{ text: '■ 작업 전 안전조치 확인 ※ 위 잠재위험요인(중점위험 포함) 안전조치 여부 재확인', span: 8, header: true, cp: 1 }] })
    // 잠재위험요소 머리
    rows.push({
        height: 1500,
        cells: [
            { text: '잠재위험요소(중점위험 포함)', span: 6, header: true, cp: 1, center: true },
            { text: '조치여부', span: 2, header: true, cp: 1, center: true },
        ],
    })
    // 잠재위험요소 1~3
    factors.forEach((fa, i) => {
        rows.push({
            height: 1500,
            cells: [
                { text: `${i + 1}. ${(fa || '').trim()}`, span: 6, top: true },
                { text: '예 ☑ 아니오 ☐', span: 2, center: true },
            ],
        })
    })
    // 일일안전점검
    rows.push({ height: 1500, cells: [{ text: '■ 작업 전 일일 안전점검 시행 결과 ※ 공사현장 일일안전점검을 통해 위험성평가 이행 확인', span: 8, header: true, cp: 1 }] })
    // 기타사항 머리
    rows.push({ height: 1500, cells: [{ text: '■ 기타사항(교육내용, 제안제도, 아차사고 등)', span: 8, header: true, cp: 1 }] })
    // 기타사항 내용
    rows.push({ height: 3200, cells: [{ text: (f.otherRemarks || '').trimStart(), span: 8, top: true }] })
    // 사진/투입 머리
    rows.push({
        height: 1500,
        cells: [
            { text: 'TBM 실시사진', span: 3, header: true, cp: 1, center: true },
            { text: '투입인원', span: 2, header: true, cp: 1, center: true },
            { text: '투입장비', span: 3, header: true, cp: 1, center: true },
        ],
    })
    // 사진/투입 데이터
    rows.push({
        height: 9500,
        cells: [
            photoId ? { span: 3, picId: photoId, picH: 9000, center: true } : { text: '사진 없음', span: 3, cp: 7, center: true },
            { text: personnel, span: 2, top: true },
            { text: equipment, span: 3, top: true },
        ],
    })

    return rows
}

// ── 근로자 교육 확인 서명부(별지) 표 구성 ──

const COLS_SIG = [2648, 6353, 5825, 4766, 5296, 5296, 5296, 5296, 7414]

function buildSignatureRows(entries: TBMWorkerSignatureEntry[], sigIds: (string | null)[]): Row[] {
    const rows: Row[] = []
    const headers = ['NO.', '성 명', 'TBM\n위.평확인', '음주여부', '혈압여부', '보호구\n착용여부', 'CCTV\n촬영동의', '몸(부상)\n여 부', '서 명']
    rows.push({ height: 2200, cells: headers.map(h => ({ text: h, header: true, cp: 1, center: true })) })

    const count = Math.max(entries.length, 15)
    for (let i = 0; i < count; i++) {
        const e = entries[i]
        const sigId = sigIds[i] || null
        const vals = e
            ? [String(i + 1), e.worker_name || '', e.tbm_confirmed ? '확인' : '', e.no_alcohol ? 'X' : '', e.blood_pressure_ok ? '150미만' : '', e.ppe_worn ? '착용' : '', e.cctv_consent ? '동의' : '', e.body_ok ? '이상없음' : '', '']
            : [String(i + 1), '', '', '', '', '', '', '', '']
        rows.push({
            height: 1600,
            cells: vals.map((v, c) => c === 8
                ? { text: v, center: true, floatPicId: sigId }
                : { text: v, center: true }),
        })
    }
    return rows
}

// ── 최종 조립 ──

async function buildTbmHwpxBlob(
    formData: TBMSubmissionFormData,
    signatures: TBMWorkerSignatureEntry[]
): Promise<Blob> {
    const collector = new ImageCollector()

    // 이미지 수집: 사진(정규화 JPEG), 작성자 서명(원본 PNG-투명), 근로자 서명(원본 PNG-투명)
    const photoId = await collector.collect(formData.photo, false)
    const sigId = formData.signature ? await collector.collect(formData.signature, true) : null

    const workerSigIds: (string | null)[] = []
    for (const e of signatures) {
        workerSigIds.push(e.signature ? await collector.collect(e.signature, true) : null)
    }

    // section0.xml 본문 조립
    const parts: string[] = []
    parts.push(buildFirstParagraph('건설기술 진흥법 시행령 103조(안전교육) 제3항에 따른 안전교육내용 기록'))
    parts.push(buildTextParagraph('일일안전교육일지(TBM 회의록)', 2, true, false))
    parts.push(buildTableParagraph(COLS_MAIN, buildTbmTableRows(formData, photoId, sigId), 1000000001, 1))
    parts.push(buildTextParagraph('붙임) TBM 참여 서명부 _ 작업장 출입 전.후 근로자 작업가능상태 점검', 5, false, false))

    if (signatures.length > 0) {
        const dow = formData.educationDate ? getDayOfWeek(formData.educationDate) : ''
        parts.push(buildTextParagraph('일일안전교육 서명부', 2, true, true))
        parts.push(buildTextParagraph('작업장 출입 전 근로자 작업가능상태 점검', 6, true, false))
        parts.push(buildTextParagraph(`일자: ${formData.educationDate || ''}(${dow})`, 1, false, false))
        parts.push(buildTableParagraph(COLS_SIG, buildSignatureRows(signatures, workerSigIds), 1000000002, 2))
        parts.push(buildTextParagraph('※ 작업가능 혈압 : 수축기 150미만, 단, 의사 소견서 첨부 시 작업 가능(심혈관질환자포함)', 7, false, false))
        parts.push(buildTextParagraph('    CCTV 촬영 : 근로자 재해예방 목적의 안전관리 모니터링 CCTV 촬영(개인정보 보호법 제15조 1항)', 7, false, false))
    }

    const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SEC_XMLNS}>${parts.join('')}</hs:sec>`

    // content.hpf 이미지 항목
    const imageItems = collector.images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')
    const contentHpf = buildContentHpf(imageItems)

    // OWPML zip 조립 (mimetype은 반드시 비압축 STORE)
    const zip = new JSZip()
    zip.file('mimetype', MIMETYPE, { compression: 'STORE' })
    zip.file('version.xml', VERSION_XML)
    zip.file('settings.xml', SETTINGS_XML)
    zip.file('Contents/header.xml', buildHeaderXml())
    zip.file('Contents/section0.xml', sectionXml)
    zip.file('Contents/content.hpf', contentHpf)
    zip.file('Preview/PrvText.txt', PRV_TEXT)
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

// TBM 일지를 한글문서(hwpx)로 다운로드
export async function downloadTBMSubmissionHwpx(
    formData: TBMSubmissionFormData,
    filename?: string,
    options?: { signatures?: TBMWorkerSignatureEntry[] }
): Promise<void> {
    const signatures = options?.signatures ?? []
    const blob = await buildTbmHwpxBlob(formData, signatures)
    const defaultFilename = `${formData.projectName || '사업명'}_TBM_${formData.educationDate || new Date().toISOString().split('T')[0]}.hwpx`
    triggerDownload(blob, filename || defaultFilename)
}
