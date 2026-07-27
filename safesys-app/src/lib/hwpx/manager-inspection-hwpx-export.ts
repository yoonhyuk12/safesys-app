// 관리자 점검(일상점검표) 보고서·사진대지·총괄표를 한글문서(hwpx/OWPML)로 조립·다운로드하는 모듈
import JSZip from 'jszip'
import type { Project, ManagerInspection } from '@/lib/projects'

// ── 공통 헬퍼 (TBM hwpx 정본 모듈 패턴 복사) ──

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
    wPx?: number
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

// 그림 개체 일련번호. 필수 자식 요소가 빠지면 한글 2020이 열다 죽는다(TBM 정본 buildPicXml 골격 복사).
let _picSeq = 0
function resetPicSeq(): void { _picSeq = 0 }

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

// "( 서명 )" 문구 위에 겹치는 떠 있는 그림(서명용). 쪽(PAPER) 기준 절대 좌표.
// textWrap은 반드시 IN_FRONT_OF_TEXT(글 앞으로) — THROUGH는 한글 2020이 자리차지로 처리해 표를 밀어낸다.
function buildFloatingPicXml(binItemId: string, imgW: number, imgH: number, xPaper: number, yPaper: number): string {
    const pos = `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${yPaper}" horzOffset="${xPaper}"/>`
    return buildPicXml(binItemId, imgW, imgH, 'IN_FRONT_OF_TEXT', pos)
}

// ── OWPML 부속 파일(고정 보일러플레이트, TBM 정본 복사) ──

const MIMETYPE = 'application/hwp+zip'

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 7936 WIN32LEWindows_10"/>`

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`

const CONTAINER_RDF = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`

const PRV_TEXT = '일상점검표(관리자 점검)'

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 페이지 본문 폭(HWPUNIT): 59528 - 좌우여백 15mm(4252)*2 = 51024
const CONTENT_WIDTH = 51024
// A4 세로 본문 세로 높이(HWPUNIT): 84188 - 상하 (3600+3600)*2
const CONTENT_HEIGHT = 69788
// 쪽 기준 절대 배치 상수 — 왼쪽 여백 15mm, 본문 시작 = 위 여백 3600 + 머리말 3600
const PAGE_LEFT = 4252
const PAGE_CONTENT_TOP = 7200

// 첫 문단에 들어가는 구역 속성(A4 세로) — TBM 정본 복사
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="3600" footer="3600" gutter="0" left="4252" right="4252" top="3600" bottom="3600"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// ── header.xml 조립 ──
// borderFill: 1=테두리없음, 2=실선, 3=실선+회색(머리셀), 4=실선+진회색(사진대지 섹션배너),
//             5=실선+연회색(사진대지 라벨), 6=실선+연파랑(재해예방 머리), 7=실선+아주연회색(총괄표 계)
// charPr: 0=본문10, 1=굵게10, 2=굵게13, 3=작게7, 4=굵게9, 5=굵게11, 6=굵게12, 7=본문9, 8=굵게15밑줄, 9=굵게22

const CP_HEIGHT: Record<number, number> = { 0: 1000, 1: 1000, 2: 1300, 3: 700, 4: 900, 5: 1100, 6: 1200, 7: 900, 8: 1500, 9: 2200 }

function buildFontfaces(): string {
    const langs = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']
    const one = (lang: string) =>
        `<hh:fontface lang="${lang}" fontCnt="1"><hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font></hh:fontface>`
    return `<hh:fontfaces itemCnt="7">${langs.map(one).join('')}</hh:fontfaces>`
}

function borderFillSolid(id: number, faceColor?: string): string {
    const fill = faceColor
        ? `<hc:fillBrush><hc:winBrush faceColor="${faceColor}" hatchColor="#000000" alpha="0"/></hc:fillBrush>`
        : ''
    return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.12 mm" color="#000000"/>${fill}</hh:borderFill>`
}

function buildBorderFills(): string {
    const none = `<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`
    const items = [none, borderFillSolid(2), borderFillSolid(3, '#F0F0F0'), borderFillSolid(4, '#E8E8E8'),
        borderFillSolid(5, '#F2F2F2'), borderFillSolid(6, '#E3F2FD'), borderFillSolid(7, '#F9F9F9')].join('')
    return `<hh:borderFills itemCnt="7">${items}</hh:borderFills>`
}

function buildCharPr(id: number, height: number, bold: boolean, underline: boolean): string {
    return `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}<hh:underline type="${underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>`
}

function buildCharProperties(): string {
    const items = [
        buildCharPr(0, 1000, false, false),
        buildCharPr(1, 1000, true, false),
        buildCharPr(2, 1300, true, false),
        buildCharPr(3, 700, false, false),
        buildCharPr(4, 900, true, false),
        buildCharPr(5, 1100, true, false),
        buildCharPr(6, 1200, true, false),
        buildCharPr(7, 900, false, false),
        buildCharPr(8, 1500, true, true),
        buildCharPr(9, 2200, true, false),
    ].join('')
    return `<hh:charProperties itemCnt="10">${items}</hh:charProperties>`
}

function buildParaPr(id: number, align: string): string {
    const margin = `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>`
    const sw = `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:case><hp:default>${margin}<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:default></hp:switch>`
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/>${sw}<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`
}

function buildParaProperties(): string {
    return `<hh:paraProperties itemCnt="3">${buildParaPr(0, 'LEFT')}${buildParaPr(1, 'CENTER')}${buildParaPr(2, 'RIGHT')}</hh:paraProperties>`
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
    const meta = `<opf:metadata><opf:title>일상점검표(관리자 점검)</opf:title><opf:language>ko</opf:language></opf:metadata>`
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
    sub?: string           // 본문 아래 작은 글씨(7pt) 부가 설명 줄
    span?: number          // colSpan (기본 1)
    rowSpan?: number       // rowSpan (세로 병합, 기본 1)
    header?: boolean       // 회색 머리셀 여부
    bf?: number            // borderFill id 직접 지정(무테=1, 배너=4 등)
    cp?: number            // charPrIDRef (기본 0)
    align?: 'left' | 'center' | 'right'  // 가로 정렬 (기본 left)
    top?: boolean          // 세로 위 정렬(기본 가운데)
    picId?: string | null  // 인라인 그림(사진)
    picW?: number          // 인라인 그림 너비(HWPUNIT)
    picH?: number          // 인라인 그림 높이(HWPUNIT)
}

interface Row {
    height: number
    cells: Cell[]
    grow?: boolean         // 하단 여백 채우기 배분 대상
    blank?: boolean        // 넘칠 때 뒤에서부터 제거 가능한 빈 행
    photo?: boolean        // 사진 행(최종 높이 확정 후 그림 크기 재산출)
}

function sumRange(widths: number[], start: number, count: number): number {
    let s = 0
    for (let i = start; i < start + count; i++) s += widths[i] || 0
    return s
}

function alignPara(align: Cell['align']): number {
    return align === 'center' ? 1 : align === 'right' ? 2 : 0
}

function paraLineH(cp: number): number {
    return Math.round((CP_HEIGHT[cp] ?? 1000) * 1.3)
}

// 셀 내부 본문(여러 줄이면 문단 분리) 조립
function buildCellBody(cell: Cell, cellW: number): string {
    const cp = cell.cp ?? 0
    const pp = alignPara(cell.align)
    const h = CP_HEIGHT[cp] ?? 1000
    const innerW = Math.max(1, cellW - CELL_PAD)

    if (cell.picId) {
        const pic = buildInlinePicXml(cell.picId, cell.picW ?? cellW - CELL_PAD, cell.picH ?? 4000)
        return `<hp:p id="${nextId()}" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${pic}</hp:run>${lineseg(innerW, Math.max(1000, cell.picH ?? 1000))}</hp:p>`
    }

    const para = (line: string, lcp: number) =>
        `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${lcp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, CP_HEIGHT[lcp] ?? h)}</hp:p>`
    const main = (cell.text ?? '').split('\n').map(line => para(line, cp)).join('')
    const sub = cell.sub ? cell.sub.split('\n').map(line => para(line, 3)).join('') : ''
    return main + sub
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number, rowSpan: number): string {
    const span = cell.span ?? 1
    const bf = cell.bf ?? (cell.header ? 3 : 2)
    const valign = cell.top ? 'TOP' : 'CENTER'
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="${rowSpan}"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
}

interface TableParaOptions {
    floats?: string[]      // 이 표가 놓인 쪽에 겹칠 떠 있는 그림 XML 목록
    pageBreak?: boolean    // 새 쪽에서 표를 시작
    secPr?: boolean        // 문서 첫 문단일 때 구역 속성을 함께 싣는다
}

// 표를 감싼 문단 XML 반환.
// rowSpan은 그리드 점유 추적으로 처리(병합에 덮이는 후속 셀은 생략, colAddr은 그리드 유지).
function buildTableParagraph(colWidths: number[], rows: Row[], tblId: number, zOrder: number, opts: TableParaOptions = {}): string {
    const floats = opts.floats ?? []
    const colCnt = colWidths.length
    const spanRemaining = new Array(colCnt).fill(0)
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
        for (let c = 0; c < colCnt; c++) if (spanRemaining[c] > 0) spanRemaining[c]--
        for (const ns of newSpans) for (let c = ns.from; c < ns.to; c++) spanRemaining[c] = ns.extra
        return `<hp:tr>${tcs}</hp:tr>`
    }).join('')
    const totalW = colWidths.reduce((a, b) => a + b, 0)
    const tbl = `<hp:tbl id="${tblId}" zOrder="${zOrder}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`
    const ctrl = opts.secPr ? `${SECPR}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>` : ''
    const pb = opts.pageBreak ? '1' : '0'
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="${pb}" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${ctrl}${floats.join('')}${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
}

// 표 밖 단독 문단(제목·주석 등)
function buildTextParagraph(text: string, cp: number, align: Cell['align'], pageBreak: boolean): string {
    const pp = alignPara(align)
    const h = CP_HEIGHT[cp] ?? 1000
    const pb = pageBreak ? '1' : '0'
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pb}" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// 문서 첫 문단(구역 속성 포함)
function buildFirstParagraph(text: string, cp: number, align: Cell['align']): string {
    const ctrl = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
    const pp = alignPara(align)
    const h = CP_HEIGHT[cp] ?? 1000
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}">${SECPR}${ctrl}</hp:run><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// ── 행 높이 추정·페이지 채움 ──

const CELL_PAD = 282       // 셀 상하 여백
const LINE_RATIO = 1.3     // 줄간격 130%
const PHOTO_MIN_H = 7000   // 내용이 넘칠 때 사진 행을 줄일 수 있는 하한

// 셀 폭 기준 표시 줄 수 추정(줄바꿈 + 폭 기반 자동 줄바꿈). 한글 글자 폭 ≈ 글자 크기.
function estDisplayLines(text: string, cellW: number, charW: number): number {
    const charsPerLine = Math.max(6, Math.floor((cellW - CELL_PAD) / charW))
    return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

// 행의 예상 렌더 높이 — 선언 최소 높이와 셀 내용 높이 중 큰 값 (선언 높이는 최소값이라 내용이 길면 자란다)
function estRowH(row: Row, cols: number[]): number {
    let colAddr = 0
    let maxH = row.height
    for (const cell of row.cells) {
        const span = cell.span ?? 1
        const w = sumRange(cols, colAddr, span)
        colAddr += span
        if (cell.picId) continue
        const cp = cell.cp ?? 0
        const fh = CP_HEIGHT[cp] ?? 1000
        let h = CELL_PAD
        if (cell.text) h += estDisplayLines(cell.text, w, fh) * Math.round(fh * LINE_RATIO)
        if (cell.sub) h += estDisplayLines(cell.sub, w, 700) * Math.round(700 * LINE_RATIO)
        if (cell.text || cell.sub) maxH = Math.max(maxH, h)
    }
    return maxH
}

interface RowGroup {
    rows: Row[]
    cols: number[]
}

// 한 쪽에 놓일 표들의 행 높이를 예산에 맞춘다.
// 1) 예상 합이 예산을 넘으면 뒤쪽 빈 행(blank)부터 제거해 다음 쪽으로 밀리는 것을 막는다.
// 2) 남으면 grow 행에 잔여 높이를 비례 배분해 하단 여백을 채운다.
function fitRowGroups(groups: RowGroup[], capacity: number): Row[][] {
    let work = groups.map(g => g.rows.slice())
    const estAll = () => work.map((rows, gi) => rows.map(row => estRowH(row, groups[gi].cols)))
    let est = estAll()
    const sumEst = () => est.reduce((a, g) => a + g.reduce((x, y) => x + y, 0), 0)

    // 1차: 넘치면 뒤쪽 빈 행부터 제거
    let guard = 200
    while (guard-- > 0 && sumEst() > capacity) {
        let gi = -1
        let ri = -1
        for (let g = work.length - 1; g >= 0 && ri < 0; g--) {
            for (let r = work[g].length - 1; r >= 0; r--) {
                if (work[g][r].blank) { gi = g; ri = r; break }
            }
        }
        if (ri < 0) break
        work = work.map((rows, g) => (g === gi ? rows.filter((_, r) => r !== ri) : rows))
        est = estAll()
    }

    // 2차: 그래도 넘치면 사진 행을 최소 높이까지 줄인다(본문 글은 줄일 수 없다)
    let over = sumEst() - capacity
    if (over > 0) {
        const photoRefs: { g: number; r: number }[] = []
        work.forEach((rows, g) => rows.forEach((row, r) => { if (row.photo) photoRefs.push({ g, r }) }))
        for (const ref of photoRefs) {
            if (over <= 0) break
            const cut = Math.min(over, Math.max(0, est[ref.g][ref.r] - PHOTO_MIN_H))
            est[ref.g][ref.r] -= cut
            over -= cut
        }
    }

    // 남는 높이를 grow 행에 비례 배분
    const slack = capacity - sumEst()
    const growRefs: { g: number; r: number }[] = []
    work.forEach((rows, g) => rows.forEach((row, r) => { if (row.grow) growRefs.push({ g, r }) }))
    if (slack > 0 && growRefs.length > 0) {
        const base = growRefs.reduce((a, ref) => a + est[ref.g][ref.r], 0)
        let used = 0
        growRefs.forEach((ref, i) => {
            const add = i === growRefs.length - 1 ? slack - used : Math.floor((slack * est[ref.g][ref.r]) / base)
            est[ref.g][ref.r] += add
            used += add
        })
    }

    return work.map((rows, g) => rows.map((row, r) => ({ ...row, height: est[g][r] })))
}

// 한글은 글자처럼 취급(treatAsChar)되는 표가 한 쪽을 넘으면 넘친 행을 이어 그리지 않고 잘라버린다.
// 그래서 예산을 넘는 표는 여기서 직접 쪽 단위로 나눠 이어지는 표로 내보낸다(내용 유실 방지).
function paginateRows(rows: Row[], capacity: number): Row[][] {
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

// 인라인 그림 크기: 셀 안에 원본 비율을 유지해 맞춘다(측정 불가 시 셀 채움)
function fitImage(entry: ImageEntry | null, availW: number, availH: number): { w: number; h: number } {
    const w0 = Math.max(1, availW)
    const h0 = Math.max(1, availH)
    if (entry?.wPx && entry?.hPx) {
        const scale = Math.min(w0 / entry.wPx, h0 / entry.hPx)
        return { w: Math.max(1, Math.round(entry.wPx * scale)), h: Math.max(1, Math.round(entry.hPx * scale)) }
    }
    return { w: w0, h: h0 }
}

// ── 데이터 로직 (reports/manager-inspection-report.ts 복사) ──

function getQuarterLabel(dateStr: string): string {
    const month = new Date(dateStr).getMonth() + 1
    if (month >= 1 && month <= 3) return '1분기'
    if (month >= 4 && month <= 6) return '2분기'
    if (month >= 7 && month <= 9) return '3분기'
    return '4분기'
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}.   ${d.getMonth() + 1}.   ${d.getDate()}.`
}

// 사업명에서 지구명 추출: "지구" 키워드까지, 없으면 첫 공백 앞까지
function extractDistrict(projectName: string): string {
    if (!projectName) return '-'
    const m = projectName.match(/^(.+?지구)/)
    if (m) return m[1]
    const i = projectName.indexOf(' ')
    return i > 0 ? projectName.substring(0, i) : projectName
}

function firstPhoto(top: string | undefined, arr: any): string | null {
    if (top && String(top).trim()) return top
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null
}

function factorFields(f: any) {
    return {
        detailWork: f?.detail_work || '',
        riskFactor: f?.risk_factor || '',
        details: f?.details ?? f?.reduction_measure ?? '',
        implemented: f?.implementation === 'yes' || f?.implementation_yes === true,
        remarks: f?.remarks || '',
        photo1: f?.photo_1 || '',
        photo2: f?.photo_2 || '',
    }
}

// ── 1페이지: 일상점검표 ──

// 12열 그리드(합 51024). 원본 HTML 표의 열 경계(12/8/12/18/15/35, 위험성평가 15/20/35/15/15,
// 사진 2분할·3분할)를 모두 표현할 수 있는 최소 공통 그리드.
const COLS_MAIN = [6123, 1531, 2551, 6123, 680, 850, 7654, 7654, 850, 1701, 7653, 7654]

const TITLE_H = 3400       // 제목 줄 + 표와의 간격
const SUBTITLE_H = 1500
const INFO_H = 1500
const PHOTO_LABEL_H = 1500
const PHOTO_H = 15000
const RISK_TITLE_H = 2600
const RISK_HEAD_H = 2600
const RISK_ROW_H = 1500

// 서명 블록(무테 표) — 오른쪽에 날짜 / 점검자·이름·(서명) 배치
const COLS_SIGN = [30024, 13000, 8000]
const SIGN_DATE_H = 1600
const SIGN_NAME_H = 2400

interface MainPageData {
    sequenceNumber: number
    branch: string
    projectName: string
    supervisor: string
    contractor: string
    photoIds: { inspection: string | null; risk: string | null; disaster: string | null }
    riskFactors: any[]
    disasterFactors: any[]
    hasDisaster: boolean
}

// 사진 행 셀 — 최종 행 높이에 맞춰 원본 비율 유지 배치.
// 셀 폭은 반드시 자기 시작 열부터의 그리드 합으로 구한다(0열부터 합산하면 폭이 어긋난다).
function buildPhotoCells(rowH: number, d: MainPageData, collector: ImageCollector): Cell[] {
    const availH = rowH - CELL_PAD
    // 재해예방 보고서 사진이 있으면 3분할(5/4/3열), 없으면 2분할(7/5열)
    const layout: { id: string | null; span: number; placeholder: string }[] = d.hasDisaster
        ? [
            { id: d.photoIds.inspection, span: 5, placeholder: '점검사진' },
            { id: d.photoIds.risk, span: 4, placeholder: '위험성평가서 사진' },
            { id: d.photoIds.disaster, span: 3, placeholder: '재해예방기술지도 보고서' },
        ]
        : [
            { id: d.photoIds.inspection, span: 7, placeholder: '점검사진' },
            { id: d.photoIds.risk, span: 5, placeholder: '위험성평가서 사진' },
        ]

    let colAddr = 0
    return layout.map(({ id, span, placeholder }) => {
        const width = sumRange(COLS_MAIN, colAddr, span)
        colAddr += span
        if (!id) return { text: placeholder, span, cp: 7, align: 'center' }
        const fit = fitImage(collector.find(id), width - CELL_PAD, availH)
        return { span, picId: id, picW: fit.w, picH: fit.h, align: 'center' }
    })
}

// 위험성평가/기술지도 표의 데이터 행(빈 행은 blank 표시로 넘칠 때 제거 대상)
function buildFactorRows(factors: any[], rowCount: number): Row[] {
    return Array.from({ length: rowCount }, (_, i) => {
        const raw = factors[i]
        const f = raw ? factorFields(raw) : null
        return {
            height: RISK_ROW_H,
            grow: true,
            blank: !raw,
            cells: [
                { text: f ? f.detailWork : '', span: 2, cp: 7, align: 'center' },
                { text: f ? f.riskFactor : '', span: 4, cp: 7, align: 'center' },
                { text: f ? f.details : '', span: 4, cp: 7, align: 'center' },
                { text: f ? (f.implemented ? '☑' : '☐') : '', cp: 7, align: 'center' },
                { text: f ? f.remarks : '', cp: 7, align: 'center' },
            ],
        }
    })
}

function buildMainRows(d: MainPageData, title: string): Row[] {
    const rows: Row[] = []

    // 제목·부제는 표 안의 무테 행으로 둔다 — 표가 다음 쪽으로 밀려도 제목만 홀로 남지 않는다
    rows.push({ height: TITLE_H, cells: [{ text: title, span: 12, bf: 1, cp: 8, align: 'center' }] })
    if (d.hasDisaster) {
        rows.push({ height: SUBTITLE_H, cells: [{ text: '※재해예방기술지도 수행 현장 점검표', span: 12, bf: 1, cp: 0, align: 'center' }] })
    }

    // 기본정보 2행
    rows.push({
        height: INFO_H,
        cells: [
            { text: '연 번', header: true, cp: 4, align: 'center' },
            { text: String(d.sequenceNumber), span: 2, cp: 7, align: 'center' },
            { text: '지 사', header: true, cp: 4, align: 'center' },
            { text: d.branch, span: 3, cp: 7, align: 'center' },
            { text: '공 사 명', header: true, cp: 4, align: 'center' },
            { text: d.projectName, span: 4, cp: 7, align: 'center' },
        ],
    })
    rows.push({
        height: INFO_H,
        cells: [
            { text: '공사감독', span: 3, header: true, cp: 4, align: 'center' },
            { text: d.supervisor, span: 4, cp: 7, align: 'center' },
            { text: '시 공 사', header: true, cp: 4, align: 'center' },
            { text: d.contractor, span: 4, cp: 7, align: 'center' },
        ],
    })

    // 사진 라벨 + 사진 행
    rows.push({
        height: PHOTO_LABEL_H,
        cells: d.hasDisaster
            ? [
                { text: '□ 점검사진', span: 5, cp: 4, align: 'left' },
                { text: '□ 위험성평가서 사진', span: 4, cp: 4, align: 'left' },
                { text: '□ 재해예방기술지도 보고서', span: 3, cp: 4, align: 'left' },
            ]
            : [
                { text: '□ 점검사진', span: 7, cp: 4, align: 'left' },
                { text: '□ 위험성평가서 사진', span: 5, cp: 4, align: 'left' },
            ],
    })
    rows.push({ height: PHOTO_H, grow: true, photo: true, cells: [{ text: '', span: 12 }] })

    // 위험성평가 제목·머리·데이터
    rows.push({
        height: RISK_TITLE_H,
        cells: [{
            text: '□ 위험성평가 주요 유해위험요인 및 위험성 감소대책(위험등급 중, 상만 기재)',
            sub: '※ 재해취약 3개 사고유형(물체에맞음, 부딪힘, 추락) 관련 작업에 대해서는 필수 작성',
            span: 12, cp: 4, align: 'left',
        }],
    })
    rows.push({
        height: RISK_HEAD_H,
        cells: [
            { text: '세부작업', span: 2, header: true, cp: 4, align: 'center' },
            { text: '유해위험요인', span: 4, header: true, cp: 4, align: 'center' },
            { text: '위험성 감소대책\n세부내용', span: 4, header: true, cp: 4, align: 'center' },
            { text: '이행여부', header: true, cp: 4, align: 'center' },
            { text: '비고', header: true, cp: 4, align: 'center' },
        ],
    })
    rows.push(...buildFactorRows(d.riskFactors, d.hasDisaster ? 5 : 10))

    // 재해예방 기술지도 (보고서 사진이 있을 때만)
    if (d.hasDisaster) {
        rows.push({
            height: RISK_TITLE_H,
            cells: [{
                text: '□ 기술지도 결과보고서의 주요 유해·위험요인 및 예방대책',
                sub: '※ 재해취약 3대 사고유형(물체에맞음, 부딪힘, 추락) 관련 작업에 대해서는 필수 작성',
                span: 12, cp: 4, align: 'left',
            }],
        })
        rows.push({
            height: RISK_HEAD_H,
            cells: [
                { text: '세부작업', span: 2, bf: 6, cp: 4, align: 'center' },
                { text: '유해위험요인', span: 4, bf: 6, cp: 4, align: 'center' },
                { text: '예방대책\n세부내용', span: 4, bf: 6, cp: 4, align: 'center' },
                { text: '이행여부', bf: 6, cp: 4, align: 'center' },
                { text: '비고', bf: 6, cp: 4, align: 'center' },
            ],
        })
        rows.push(...buildFactorRows(d.disasterFactors, 5))
    }

    return rows
}

// ── 사진대지 (일상점검_양식.xlsx 스타일: 위험성평가 + 재해예방 각 1쌍) ──

const COLS_SHEET = [8164, 17348, 8164, 17348]
const SHEET_BANNER_H = 1800
const SHEET_INFO_H = 1500
const SHEET_PHOTO_LABEL_H = 1400
const SHEET_PHOTO_H = 16000
const SHEET_TEXT_H = 1600

interface SheetSectionData {
    title: string
    factor: any | null
    isDisaster: boolean
    projectName: string
    branch: string
    inspectionDate: string
    supervisor: string
    photo1Id: string | null
    photo2Id: string | null
}

function buildSheetSectionRows(s: SheetSectionData): Row[] {
    const f = s.factor ? factorFields(s.factor) : null
    // 재해예방 섹션에 예방조치 사진이 없으면 데이터 칸을 공란 처리한다(PDF 동일 규칙).
    const blankData = s.isDisaster && !(s.photo1Id || s.photo2Id)
    const label = s.isDisaster ? '예방대책 사진' : '위험성감소대책 이행 사진'
    const v = (text: string) => (blankData ? '' : text)

    return [
        { height: SHEET_BANNER_H, cells: [{ text: s.title, span: 4, bf: 4, cp: 2, align: 'left' }] },
        {
            height: SHEET_INFO_H,
            cells: [
                { text: '지구명', bf: 5, cp: 4, align: 'center' },
                { text: v(s.projectName || s.branch), cp: 7, align: 'center' },
                { text: '세부작업', bf: 5, cp: 4, align: 'center' },
                { text: v(f?.detailWork || ''), cp: 7, align: 'center' },
            ],
        },
        {
            height: SHEET_INFO_H,
            cells: [
                { text: '일시(조치완료)', bf: 5, cp: 4, align: 'center' },
                { text: v(s.inspectionDate), cp: 7, align: 'center' },
                { text: '확 인 자', bf: 5, cp: 4, align: 'center' },
                { text: v(s.supervisor), cp: 7, align: 'center' },
            ],
        },
        {
            height: SHEET_PHOTO_LABEL_H,
            cells: [
                { text: label, span: 2, bf: 5, cp: 4, align: 'center' },
                { text: label, span: 2, bf: 5, cp: 4, align: 'center' },
            ],
        },
        { height: SHEET_PHOTO_H, grow: true, photo: true, cells: [{ text: '', span: 4 }] },
        {
            height: SHEET_TEXT_H, grow: true,
            cells: [
                { text: '유해위험요인', bf: 5, cp: 4, align: 'center' },
                { text: v(f?.riskFactor || ''), span: 3, cp: 7, align: 'left' },
            ],
        },
        {
            height: SHEET_TEXT_H, grow: true,
            cells: [
                { text: s.isDisaster ? '예방대책 세부내용' : '위험성 감소대책', bf: 5, cp: 4, align: 'center' },
                { text: v(f?.details || ''), span: 3, cp: 7, align: 'left' },
            ],
        },
        {
            height: SHEET_TEXT_H, grow: true,
            cells: [
                { text: '조치사항', bf: 5, cp: 4, align: 'center' },
                { text: blankData ? '' : (s.factor?.implementation === 'no' ? '미조치' : '조치완료'), span: 3, cp: 7, align: 'left' },
            ],
        },
    ]
}

// 사진대지 사진 행 셀 — 최종 높이에 맞춰 좌우 2칸에 원본 비율 유지 배치
function buildSheetPhotoCells(rowH: number, photo1Id: string | null, photo2Id: string | null, collector: ImageCollector): Cell[] {
    const availW = sumRange(COLS_SHEET, 0, 2) - CELL_PAD
    const availH = rowH - CELL_PAD
    const cell = (id: string | null): Cell => {
        if (!id) return { text: '사진 없음', span: 2, cp: 7, align: 'center' }
        const fit = fitImage(collector.find(id), availW, availH)
        return { span: 2, picId: id, picW: fit.w, picH: fit.h, align: 'center' }
    }
    return [cell(photo1Id), cell(photo2Id)]
}

// ── 총괄표(지사별 벌크 앞장) ──

const COLS_SUMMARY = [4082, 6123, 14287, 12246, 9184, 5102]
const SUMMARY_HEAD_H = 2200
const SUMMARY_ROW_H = 1800
const SUMMARY_MAX_ROWS = 26  // 한 쪽에 담는 데이터+빈 행 수(PDF 동일)

interface SummaryEntry {
    date: string
    project: string
    district: string
    checkItems: number
    note: string
}

function buildSummaryRows(entries: SummaryEntry[], startIndex: number, totalCount: number, totalCheckItems: number): Row[] {
    const head = ['연번', '점검일', '사업명', '지구명', '주요\n유해위험요인\n(개수)', '비고']
    const rows: Row[] = [{
        height: SUMMARY_HEAD_H,
        cells: head.map(t => ({ text: t, header: true, cp: 1, align: 'center' as const })),
    }]
    rows.push({
        height: SUMMARY_ROW_H,
        cells: [
            { text: '계', bf: 7, cp: 1, align: 'center' },
            { text: '', bf: 7 },
            { text: `${totalCount}건`, bf: 7, cp: 0, align: 'center' },
            { text: '', bf: 7 },
            { text: `${totalCheckItems}개`, bf: 7, cp: 0, align: 'center' },
            { text: '', bf: 7 },
        ],
    })
    entries.forEach((e, i) => {
        rows.push({
            height: SUMMARY_ROW_H, grow: true,
            cells: [
                { text: String(startIndex + i + 1), cp: 0, align: 'center' },
                { text: e.date, cp: 0, align: 'center' },
                { text: e.project, cp: 0, align: 'center' },
                { text: e.district, cp: 0, align: 'center' },
                { text: `${e.checkItems}개`, cp: 0, align: 'center' },
                { text: e.note, cp: 0, align: 'center' },
            ],
        })
    })
    const emptyCount = Math.max(0, SUMMARY_MAX_ROWS - entries.length)
    for (let i = 0; i < emptyCount; i++) {
        rows.push({
            height: SUMMARY_ROW_H, grow: true, blank: true,
            cells: Array.from({ length: 6 }, () => ({ text: '' })),
        })
    }
    return rows
}

// ── 점검 1건(점검표 1쪽 + 사진대지 n쪽) 조립 ──

async function buildInspectionParts(
    collector: ImageCollector,
    inspection: ManagerInspection,
    project: Project,
    sequenceNumber: number,
    first: boolean,
    tblIdBase: number
): Promise<string[]> {
    const ins = inspection as any
    const proj = project as any
    const hasDisaster = !!ins.disaster_prevention_report_photo

    // 이미지 수집: 사진(정규화 JPEG), 서명(원본 PNG-투명)
    const photoIds = {
        inspection: await collector.collect(firstPhoto(ins.inspection_photo, ins.form_data?.inspection_photos), false),
        risk: await collector.collect(firstPhoto(ins.risk_assessment_photo, ins.form_data?.risk_assessment_photos), false),
        disaster: hasDisaster ? await collector.collect(ins.disaster_prevention_report_photo, false) : null,
    }
    const sigId = await collector.collect(ins.signature || ins.form_data?.signature, true)

    const projectName = project?.project_name || ''
    const branch = proj?.managing_branch || ''
    const supervisor = ins.construction_supervisor || ins.form_data?.supervisor || inspection.inspector_name || ''
    const data: MainPageData = {
        sequenceNumber,
        branch,
        projectName,
        supervisor,
        contractor: proj?.user_profiles?.company_name || ins.form_data?.contractor || '',
        photoIds,
        riskFactors: Array.isArray(ins.risk_factors_json) ? ins.risk_factors_json : (Array.isArray(ins.form_data?.risk_items) ? ins.form_data.risk_items : []),
        disasterFactors: Array.isArray(ins.disaster_prevention_risk_factors_json) ? ins.disaster_prevention_risk_factors_json : [],
        hasDisaster,
    }

    const parts: string[] = []
    let tblId = tblIdBase

    // ── 점검표 쪽 (제목은 표 첫 행) ──
    const title = `${projectName || '000000사업'} ${getQuarterLabel(inspection.inspection_date)} 일상점검표`
    // 서명 블록을 뺀 나머지가 표 예산. 하단 여백을 남기지 않되 다음 쪽으로 넘기지 않는다.
    const mainCapacity = CONTENT_HEIGHT - SIGN_DATE_H - SIGN_NAME_H - 2200
    const fittedMain = fitRowGroups([{ rows: buildMainRows(data, title), cols: COLS_MAIN }], mainCapacity)[0]
    // 사진 행은 최종 높이가 정해진 뒤에야 그림 크기를 확정할 수 있다
    const mainRows = fittedMain.map(row => (row.photo ? { ...row, cells: buildPhotoCells(row.height, data, collector) } : row))
    // 위험요인 글이 아주 길어 한 쪽을 넘으면 이어지는 표로 나눠 담는다
    const mainPages = paginateRows(mainRows, mainCapacity)
    mainPages.forEach((rows, pi) => {
        parts.push(buildTableParagraph(COLS_MAIN, rows, ++tblId, 1, { pageBreak: !first || pi > 0, secPr: first && pi === 0 }))
    })

    // ── 서명 블록: "( 서명 )" 문구 위에 서명 이미지를 겹친다(핵심 제약 #5) ──
    // 서명은 마지막 쪽 표 아래에 오므로 y 기준도 그 쪽의 표 높이다.
    const tableH = mainPages[mainPages.length - 1].reduce((a, r) => a + r.height, 0)
    const floats: string[] = []
    if (sigId) {
        const sig = fitImage(collector.find(sigId), 6600, 2000)
        // 쪽 기준 절대 좌표. x·y 보정값은 한글 2020 렌더 실측치.
        const sigX = PAGE_LEFT + COLS_SIGN[0] + COLS_SIGN[1] + Math.round((COLS_SIGN[2] - sig.w) / 2) + 600
        // y = 본문 시작 + 표 높이(제목 포함) + 날짜 행 + 서명 행 내 수직 중앙
        const sigY = PAGE_CONTENT_TOP + tableH + SIGN_DATE_H + Math.round((SIGN_NAME_H - sig.h) / 2) + 500
        floats.push(buildFloatingPicXml(sigId, sig.w, sig.h, sigX, sigY))
    }
    const signRows: Row[] = [
        { height: SIGN_DATE_H, cells: [{ text: formatDate(inspection.inspection_date), span: 3, bf: 1, cp: 0, align: 'right' }] },
        {
            height: SIGN_NAME_H,
            cells: [
                { text: '', bf: 1 },
                { text: `점검자 ${inspection.inspector_name || '홍 길 동'}`, bf: 1, cp: 6, align: 'right' },
                { text: '( 서명 )', bf: 1, cp: 6, align: 'center' },
            ],
        },
    ]
    parts.push(buildTableParagraph(COLS_SIGN, signRows, ++tblId, 2, { floats }))

    // ── 사진대지 쪽 (위험요인 카드에 사진이 있는 경우) ──
    const pairs: { rf: any | null; df: any | null }[] = []
    const pairCount = Math.max(data.riskFactors.length, data.disasterFactors.length)
    for (let p = 0; p < pairCount; p++) {
        const rf = data.riskFactors[p] || null
        const df = data.disasterFactors[p] || null
        if (rf?.photo_1 || rf?.photo_2 || df?.photo_1 || df?.photo_2) pairs.push({ rf, df })
    }

    const dateText = formatDate(inspection.inspection_date)
    for (let p = 0; p < pairs.length; p++) {
        const { rf, df } = pairs[p]
        const ids = {
            rf1: await collector.collect(rf?.photo_1, false),
            rf2: await collector.collect(rf?.photo_2, false),
            df1: await collector.collect(df?.photo_1, false),
            df2: await collector.collect(df?.photo_2, false),
        }
        const base: Omit<SheetSectionData, 'title' | 'factor' | 'isDisaster' | 'photo1Id' | 'photo2Id'> = {
            projectName, branch, inspectionDate: dateText, supervisor,
        }
        const sections: SheetSectionData[] = [
            { ...base, title: '1. 위험성평가  예방대책  조치  후  사진', factor: rf, isDisaster: false, photo1Id: ids.rf1, photo2Id: ids.rf2 },
            { ...base, title: '2. 재해예방기술지도  예방대책  조치  후  사진(기술지도 수행 현장)', factor: df, isDisaster: true, photo1Id: ids.df1, photo2Id: ids.df2 },
        ]

        parts.push(buildTextParagraph(`${projectName} ${getQuarterLabel(inspection.inspection_date)} 위험성평가 및`, 2, 'center', true))
        parts.push(buildTextParagraph('기술지도 조치 후 사진대지', 2, 'center', false))
        const noteText = pairs.length > 1 ? `${p + 1} / ${pairs.length}` : ''
        if (noteText) parts.push(buildTextParagraph(noteText, 3, 'right', false))

        const sheetCapacity = CONTENT_HEIGHT - paraLineH(2) * 2 - (noteText ? paraLineH(3) : 0) - 2600
        const fitted = fitRowGroups(sections.map(s => ({ rows: buildSheetSectionRows(s), cols: COLS_SHEET })), sheetCapacity)
        // 두 섹션 합이 한 쪽을 넘으면 2번 섹션을 다음 쪽에서 시작한다(잘림 방지)
        const sheetTotal = fitted.reduce((a, rows) => a + rows.reduce((x, r) => x + r.height, 0), 0)
        fitted.forEach((rows, si) => {
            const s = sections[si]
            const withPhotos = rows.map(row => (row.photo ? { ...row, cells: buildSheetPhotoCells(row.height, s.photo1Id, s.photo2Id, collector) } : row))
            parts.push(buildTableParagraph(COLS_SHEET, withPhotos, ++tblId, 3 + si, { pageBreak: si > 0 && sheetTotal > sheetCapacity }))
        })
    }

    return parts
}

// ── 총괄표 쪽 조립 ──

function buildSummaryParts(branchName: string, quarter: string, entries: SummaryEntry[], first: boolean, tblIdBase: number): string[] {
    const m = quarter.match(/(\d{4})Q(\d)/)
    const q = m ? parseInt(m[2], 10) : Math.ceil((new Date().getMonth() + 1) / 3)
    const totalCheckItems = entries.reduce((s, e) => s + e.checkItems, 0)

    const pages: SummaryEntry[][] = []
    for (let i = 0; i < entries.length; i += SUMMARY_MAX_ROWS) pages.push(entries.slice(i, i + SUMMARY_MAX_ROWS))
    if (pages.length === 0) pages.push([])

    const parts: string[] = []
    pages.forEach((pageEntries, pi) => {
        const headLine = `붙임    ${branchName} 일상점검 점검표`
        parts.push(first && pi === 0 ? buildFirstParagraph(headLine, 6, 'left') : buildTextParagraph(headLine, 6, 'left', true))
        parts.push(buildTextParagraph(`${branchName} ${q}분기 일상점검 총괄표`, 9, 'center', false))
        const capacity = CONTENT_HEIGHT - paraLineH(6) - paraLineH(9) - 2600
        const rows = fitRowGroups(
            [{ rows: buildSummaryRows(pageEntries, pi * SUMMARY_MAX_ROWS, entries.length, totalCheckItems), cols: COLS_SUMMARY }],
            capacity
        )[0]
        parts.push(buildTableParagraph(COLS_SUMMARY, rows, tblIdBase + pi, 1))
    })
    return parts
}

function toSummaryEntries(projectInspections: ProjectInspections[]): SummaryEntry[] {
    const entries: SummaryEntry[] = []
    projectInspections.forEach(pi => {
        pi.inspections.forEach(inspection => {
            entries.push({
                date: new Date(inspection.inspection_date)
                    .toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
                    .replace(/\. /g, '.').replace(/\.$/, ''),
                project: pi.project.project_name || '미지정',
                district: extractDistrict(pi.project.project_name || ''),
                checkItems: Array.isArray(inspection.risk_factors_json) ? inspection.risk_factors_json.length : 0,
                note: (pi.project as any).disaster_prevention_target ? '재해' : '',
            })
        })
    })
    return entries.sort((a, b) => summaryDateKey(a.date) - summaryDateKey(b.date))
}

function summaryDateKey(dateStr: string): number {
    const parts = dateStr.split('.').filter(p => p)
    if (parts.length < 3) return 0
    return new Date(parseInt(parts[0], 10) + 2000, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime()
}

// ── 최종 조립 ──

async function assembleZip(collector: ImageCollector, parts: string[]): Promise<Blob> {
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
    zip.file('Contents/content.hpf', buildContentHpf(imageItems))
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

export interface ManagerInspectionHwpxParams {
    project: Project
    inspections: ManagerInspection[]
    selectedRecords?: string[]  // 선택된 점검 ID들 (없으면 전체)
}

// 관리자 점검(선택 건들)을 하나의 hwpx로 다운로드 — 건마다 새 쪽에서 시작
export async function downloadManagerInspectionHwpx(params: ManagerInspectionHwpxParams, filename?: string): Promise<void> {
    const { project, inspections, selectedRecords } = params
    if (inspections.length === 0) throw new Error('생성할 점검 항목이 없습니다.')

    const targets = selectedRecords && selectedRecords.length > 0
        ? inspections.filter(i => selectedRecords.includes(i.id))
        : inspections
    if (targets.length === 0) throw new Error('다운로드할 점검 항목을 선택해주세요.')

    const sorted = targets.slice().sort((a, b) => new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime())
    const allSorted = inspections.slice().sort((a, b) => new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime())

    resetPicSeq()
    const collector = new ImageCollector()
    const parts: string[] = []
    for (let i = 0; i < sorted.length; i++) {
        const seq = allSorted.findIndex(r => r.id === sorted[i].id) + 1
        parts.push(...await buildInspectionParts(collector, sorted[i], project, seq, i === 0, 1000000000 + i * 1000))
    }

    const blob = await assembleZip(collector, parts)
    const d = new Date(sorted[0].inspection_date)
    const dateStr = isNaN(d.getTime())
        ? new Date().toISOString().split('T')[0]
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    triggerDownload(blob, filename || `${project.project_name || '사업명'}_관리자점검_${dateStr}.hwpx`)
}

interface ProjectInspections {
    project: Project
    inspections: ManagerInspection[]
}

export interface ManagerInspectionBulkHwpxParams {
    projectInspections: ProjectInspections[]
    filename?: string
    summary?: { branchName?: string; quarter: string }
}

export type ManagerInspectionHwpxOptions = {
    signal?: AbortSignal
    onProgress?: (current: number, total: number) => void
}

function ensureNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('cancelled')
}

// 여러 사업의 관리자 점검을 하나의 hwpx로 묶어 다운로드 (지사·본부 벌크 출력용)
export async function downloadManagerInspectionBulkHwpx(
    params: ManagerInspectionBulkHwpxParams,
    options?: ManagerInspectionHwpxOptions
): Promise<void> {
    const { projectInspections, filename, summary } = params
    if (projectInspections.length === 0) throw new Error('생성할 프로젝트가 없습니다.')

    const signal = options?.signal
    const onProgress = options?.onProgress
    const total = projectInspections.reduce((n, pi) => n + pi.inspections.length, 0)

    // 총괄표 유무·범위에 따라 그룹을 나눈다 (PDF 벌크와 동일 규칙)
    // - branchName 지정: 단일 지사 총괄표 + 해당 지사 전체
    // - quarter만 지정: 지사별로 그룹핑해 각 지사 총괄표 뒤에 그 지사 점검표
    // - summary 없음: 총괄표 없이 전체 순회
    const groups: { branchName: string | null; items: ProjectInspections[] }[] = []
    if (summary?.branchName) {
        groups.push({ branchName: summary.branchName, items: projectInspections })
    } else if (summary?.quarter) {
        const map = new Map<string, ProjectInspections[]>()
        for (const item of projectInspections) {
            const branch = (item.project as any)?.managing_branch || '미지정'
            if (!map.has(branch)) map.set(branch, [])
            map.get(branch)!.push(item)
        }
        for (const [branchName, items] of map.entries()) groups.push({ branchName, items })
    } else {
        groups.push({ branchName: null, items: projectInspections })
    }

    resetPicSeq()
    const collector = new ImageCollector()
    const parts: string[] = []
    let done = 0
    let first = true

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g]
        ensureNotCancelled(signal)
        if (group.branchName && summary) {
            parts.push(...buildSummaryParts(group.branchName, summary.quarter, toSummaryEntries(group.items), first, 900000000 + g * 1000))
            first = false
            onProgress?.(done, total)
        }
        // 총괄표 순서와 동일하게 날짜 오름차순으로 펼친다
        const flat = group.items
            .flatMap(({ project, inspections }) => inspections.map(inspection => ({ project, inspection })))
            .sort((a, b) => new Date(a.inspection.inspection_date).getTime() - new Date(b.inspection.inspection_date).getTime())

        for (let i = 0; i < flat.length; i++) {
            ensureNotCancelled(signal)
            parts.push(...await buildInspectionParts(collector, flat[i].inspection, flat[i].project, i + 1, first, 1000000000 + done * 1000))
            first = false
            done++
            onProgress?.(done, total)
        }
    }

    const blob = await assembleZip(collector, parts)
    triggerDownload(blob, filename || defaultBulkFilename(summary, projectInspections))
}

function defaultBulkFilename(summary: ManagerInspectionBulkHwpxParams['summary'], projectInspections: ProjectInspections[]): string {
    if (!summary?.quarter) {
        return `관리자점검표_일괄_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}.hwpx`
    }
    const m = summary.quarter.match(/(\d{4})Q(\d)/)
    const year = m ? m[1] : String(new Date().getFullYear())
    const q = m ? parseInt(m[2], 10) : Math.ceil((new Date().getMonth() + 1) / 3)
    const branchName = summary.branchName || (projectInspections[0]?.project as any)?.managing_branch || '미지정'
    return `${branchName}_${year.slice(-2)}년${q}분기_관리자점검.hwpx`
}

function isInQuarter(dateStr?: string, quarterYear?: string): boolean {
    if (!dateStr || !quarterYear) return false
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return false
    const [yearStr, qStr] = quarterYear.split('Q')
    const year = parseInt(yearStr, 10)
    const q = parseInt(qStr, 10)
    if (!year || !q) return true
    const start = new Date(year, (q - 1) * 3, 1)
    const end = new Date(year, (q - 1) * 3 + 3, 0, 23, 59, 59, 999)
    return d >= start && d <= end
}

export interface BranchManagerHwpxParams {
    projects: Project[]
    inspections: ManagerInspection[]
    selectedProjectIds: string[]
    selectedQuarter: string   // 예: 2025Q3
    selectedHq?: string
    selectedSafetyBranch: string
}

// 지사 단위 벌크 hwpx (reports/manager-inspection-branch.ts의 hwpx 대응 경로)
export async function downloadBranchManagerReportsHwpx(
    params: BranchManagerHwpxParams,
    options?: ManagerInspectionHwpxOptions
): Promise<void> {
    const { projects, inspections, selectedProjectIds, selectedQuarter, selectedHq, selectedSafetyBranch } = params

    const branchProjects = projects.filter(p => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
    const targetProjects = selectedProjectIds.length > 0
        ? branchProjects.filter(p => selectedProjectIds.includes(p.id))
        : branchProjects

    const projectInspections = targetProjects
        .map(p => ({ project: p, inspections: inspections.filter(i => i.project_id === p.id && isInQuarter(i.inspection_date, selectedQuarter)) }))
        .filter(pi => pi.inspections.length > 0)

    if (projectInspections.length === 0) throw new Error('선택한 조건에 해당하는 점검 결과가 없습니다.')

    const m = selectedQuarter.match(/(\d{4})Q(\d)/)
    const year = m ? m[1] : String(new Date().getFullYear())
    const q = m ? parseInt(m[2], 10) : Math.ceil((new Date().getMonth() + 1) / 3)
    const filename = `${selectedSafetyBranch}_${year.slice(-2)}년${q}분기_관리자점검.hwpx`

    await downloadManagerInspectionBulkHwpx({ projectInspections, filename }, options)
}
