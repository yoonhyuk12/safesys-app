// 본부불시점검 보고서(건당 3페이지)를 한글문서(hwpx/OWPML)로 조립·다운로드하는 모듈
import JSZip from 'jszip'

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

// 셀 안에 넣는 인라인 그림 (사진·서명용, 최종 크기를 직접 지정)
function buildInlinePicXml(binItemId: string, imgW: number, imgH: number): string {
    const pos = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    return buildPicXml(binItemId, Math.max(1, imgW), Math.max(1, imgH), 'TOP_AND_BOTTOM', pos)
}

// ── OWPML 부속 파일(고정 보일러플레이트, TBM 정본 복사) ──

const MIMETYPE = 'application/hwp+zip'

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 7936 WIN32LEWindows_10"/>`

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`

const CONTAINER_RDF = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`

const PRV_TEXT = '본부불시점검 보고서'

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 페이지 본문 폭(HWPUNIT): 59528 - 좌우여백 15mm(4252)*2 = 51024
const CONTENT_WIDTH = 51024
// A4 세로 본문 세로 높이(HWPUNIT): 84188 - 상하 (3600+3600)*2
const CONTENT_HEIGHT = 69788

// 첫 문단에 들어가는 구역 속성(A4 세로) — TBM 정본 복사
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="3600" footer="3600" gutter="0" left="4252" right="4252" top="3600" bottom="3600"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// ── header.xml 조립 ──
// borderFill: 1=테두리없음, 2=실선, 3=실선+회색채움(머리셀), 4=실선+주황채움(배너), 5=실선+연노랑채움(카테고리)
// charPr: 0=본문10, 1=굵게10, 2=제목16굵게, 3=작게7, 4=굵게9, 5=굵게11, 6=굵게12, 7=본문9, 8=굵게14밑줄
// paraPr: 0=왼쪽정렬, 1=가운데정렬, 2=오른쪽정렬

const CP_HEIGHT: Record<number, number> = { 0: 1000, 1: 1000, 2: 1600, 3: 700, 4: 900, 5: 1100, 6: 1200, 7: 900, 8: 1400 }

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
    const solid = borderFillSolid(2)
    const header = borderFillSolid(3, '#F0F0F0')
    const banner = borderFillSolid(4, '#FFEDD5')
    const category = borderFillSolid(5, '#FFF8E1')
    return `<hh:borderFills itemCnt="5">${none}${solid}${header}${banner}${category}</hh:borderFills>`
}

function buildCharPr(id: number, height: number, bold: boolean, underline: boolean): string {
    return `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}<hh:underline type="${underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>`
}

function buildCharProperties(): string {
    const items = [
        buildCharPr(0, 1000, false, false),
        buildCharPr(1, 1000, true, false),
        buildCharPr(2, 1600, true, false),
        buildCharPr(3, 700, false, false),
        buildCharPr(4, 900, true, false),
        buildCharPr(5, 1100, true, false),
        buildCharPr(6, 1200, true, false),
        buildCharPr(7, 900, false, false),
        buildCharPr(8, 1400, true, true),
    ].join('')
    return `<hh:charProperties itemCnt="9">${items}</hh:charProperties>`
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
    const meta = `<opf:metadata><opf:title>본부불시점검 보고서</opf:title><opf:language>ko</opf:language></opf:metadata>`
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
    rowSpan?: number       // rowSpan (세로 병합, 기본 1) — 높이는 병합된 행 높이 합으로 자동 산출
    header?: boolean       // 회색 머리셀 여부
    bf?: number            // borderFill id 직접 지정(무테=1, 배너=4, 카테고리=5 등)
    cp?: number            // charPrIDRef (기본 0)
    align?: 'left' | 'center' | 'right'  // 가로 정렬 (기본 left)
    top?: boolean          // 세로 위 정렬(기본 가운데)
    picId?: string | null  // 인라인 그림(사진·서명)
    picW?: number          // 인라인 그림 너비(HWPUNIT)
    picH?: number          // 인라인 그림 높이(HWPUNIT)
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

function alignPara(align: Cell['align']): number {
    return align === 'center' ? 1 : align === 'right' ? 2 : 0
}

// 셀 내부 본문(여러 줄이면 문단 분리) 조립
function buildCellBody(cell: Cell, cellW: number): string {
    const cp = cell.cp ?? 0
    const pp = alignPara(cell.align)
    const h = CP_HEIGHT[cp] ?? 1000
    const innerW = Math.max(1, cellW - 282)

    if (cell.picId) {
        const pic = buildInlinePicXml(cell.picId, cell.picW ?? cellW - 282, cell.picH ?? 4000)
        return `<hp:p id="${nextId()}" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${pic}</hp:run>${lineseg(innerW, Math.max(1000, cell.picH ?? 1000))}</hp:p>`
    }

    const lines = (cell.text ?? '').split('\n')
    return lines.map(line =>
        `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    ).join('')
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number, rowSpan: number): string {
    const span = cell.span ?? 1
    const bf = cell.bf ?? (cell.header ? 3 : 2)
    const valign = cell.top ? 'TOP' : 'CENTER'
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="${rowSpan}"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
}

// 표를 감싼 문단 XML 반환. rowSpan은 그리드 점유 추적으로 처리(병합에 덮이는 후속 셀은 생략, colAddr은 그리드 유지).
function buildTableParagraph(colWidths: number[], rows: Row[], tblId: number, zOrder: number): string {
    const colCnt = colWidths.length
    const spanRemaining = new Array(colCnt).fill(0)  // 위 행의 rowSpan이 이 열을 덮고 있는 남은 행 수
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
    const tbl = `<hp:tbl id="${tblId}" zOrder="${zOrder}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
}

// 표 밖 단독 문단(제목·머리라인·하단메모 등)
function buildTextParagraph(text: string, cp: number, align: Cell['align'], pageBreak: boolean): string {
    const pp = alignPara(align)
    const h = CP_HEIGHT[cp] ?? 1000
    const pb = pageBreak ? '1' : '0'
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pb}" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// 문서 첫 문단(구역 속성 포함) — 첫 점검 1페이지 제목 첫 줄을 담는다
function buildFirstParagraph(text: string, cp: number, align: Cell['align']): string {
    const ctrl = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
    const pp = alignPara(align)
    const h = CP_HEIGHT[cp] ?? 1000
    return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}">${SECPR}${ctrl}</hp:run><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// 빈 문단(간격 확보)
function buildSpacer(h: number): string {
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t/></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// ── 데이터 로직 (reports/headquarters-inspection.ts 복사) ──

function getQuarterLabel(dateStr?: string): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const m = d.getMonth() + 1
    const q = m <= 3 ? '1분기' : m <= 6 ? '2분기' : m <= 9 ? '3분기' : '4분기'
    return `${d.getFullYear()}년 ${q}`
}

function yesNo(status: 'good' | 'bad' | '' | undefined, target: 'yes' | 'no'): string {
    if (!status) return '□'
    if (status === 'good' && target === 'yes') return '☑'
    if (status === 'bad' && target === 'no') return '☑'
    return '□'
}

function formatDotDate(dateStr?: string): string {
    if (!dateStr) {
        return `${new Date().getFullYear()}.    .    .`
    }
    const d = new Date(dateStr)
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

const CIRCLED = ['➊', '➋', '➌', '➍', '➎', '➏', '➐', '➑', '➒', '➓']

// 5대 핵심 안전수칙 기본 항목 (5개 카테고리, 17개 항목)
const DEFAULT_FIVE_KEY_REPORT_ITEMS: { category: string; title: string; description: string }[] = [
    { category: '① TBM 실시', title: '1) TBM 실시', description: '· TBM 작업 시작 전 실시 여부' },
    { category: '① TBM 실시', title: '2) 위험성평가 사항 공유', description: '· 당일 작업에 대한 위험성평가 사항 공유 여부' },
    { category: '① TBM 실시', title: '3) 위험성평가 사항 대책의 적절성', description: '· 유해위험요인별 감소대책이 구체적이고 실행 가능한지 여부' },
    { category: '① TBM 실시', title: '4) 관리자 입회 횟수', description: '· 관리자 입회 횟수' },
    { category: '② 신규근로자 작업 전 현장 둘러보기', title: '1) 신규근로자 작업 전 현장 둘러보기 실시', description: '· 작업 투입 전 현장 둘러보기 실시 여부' },
    { category: '② 신규근로자 작업 전 현장 둘러보기', title: '2) 신규근로자 현장 안내 일지 작성 및 관리', description: '· 현장 안내 일지 작성 및 관리 여부' },
    { category: '② 신규근로자 작업 전 현장 둘러보기', title: '3) 관리자 동행 횟수', description: '· 관리자 동행 횟수' },
    { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '1) 건설기계 후사경 및 후방영상 표시장치 등 부착상태 및 작동상태', description: '· 후사경·후방카메라 부착 상태 및 정상 작동 여부, 화면 선명도 확인' },
    { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '2) 작업계획서 작성 및 PTW 승인', description: '· 건설기계 작업계획서 작성 여부 및 PTW 승인 절차 이행 확인' },
    { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '3) 차량동선과 근로자동선 구분 및 분리', description: '· 차량 이동경로와 보행자 통로가 분리되어 있는지 확인' },
    { category: '③ 건설기계 주변 접근금지, 신호수 배치', title: '4) 건설기계 주변 신호수 배치', description: '· 장비 작업반경 내 신호수 배치 여부' },
    { category: '④ 개인보호구 착용 철저', title: '1) 작업별 적정 개인보호구 착용', description: '· 안전모·안전화·안전대 등 작업별 적정 보호구 착용 여부 및 착용 상태(턱끈 체결 등) 확인' },
    { category: '④ 개인보호구 착용 철저', title: '2) 개인보호구 지급·관리', description: '· 보호구 지급대장 관리 여부, 마모·파손 보호구 교체 및 예비 보호구 비치 현황 확인' },
    { category: '④ 개인보호구 착용 철저', title: '3) 고소작업 시 안전대 부착설비 설치', description: '· 안전대 부착설비(구명줄·걸이설비) 설치 상태 및 안전대 정상 작동 여부 확인' },
    { category: '⑤ 안전보건표지 설치', title: '1) 현장 맞춤형 안전보건표지 제작·설치', description: '· 현장 위험요인(추락·낙하·감전 등)에 맞는 표지가 적정 위치에 설치되어 있는지 확인' },
    { category: '⑤ 안전보건표지 설치', title: '2) 훼손등에 대한 지속적 관리', description: '· 훼손·오염·탈락된 안전보건표지의 적정 관리 여부' },
    { category: '⑤ 안전보건표지 설치', title: '3) 외국인근로자 대상 다국어 표지 설치', description: '· 외국인 근로자 국적별 다국어 표기 여부' },
]

const OTHER_DEFAULT_TITLES = ['법적이행사항 확인', 'VAR 매뉴얼 작동성 확인', '취약근로자 안전관리 확인', '재해예방기술지도 지적사항 이행 확인', '안전보건표지 설치', 'TBM 실시 확인', '기타 현장 안전관리에 관한 사항 (산업안전보건 기준에 관한 규칙 등)']

// ── 서명 블록(무테 소형 표, 오른쪽 정렬 셀들: 날짜 / 점검자·이름·서명그림) ──

// 서명 인라인 그림 크기(서명 셀에 비율 유지해 맞춤)
function fitSignature(entry: ImageEntry | null): { w: number; h: number } {
    const availW = 7718  // 서명 셀 폭(8000) - 여백
    const availH = 2118  // 서명 행(2400) - 여백
    if (entry?.wPx && entry?.hPx) {
        const scale = Math.min(availW / entry.wPx, availH / entry.hPx)
        return { w: Math.max(1, Math.round(entry.wPx * scale)), h: Math.max(1, Math.round(entry.hPx * scale)) }
    }
    return { w: 5000, h: 1800 }
}

function buildSignatureBlock(dateText: string, inspectorName: string, sigId: string | null, sigEntry: ImageEntry | null, tblId: number): string {
    const colWidths = [30024, 5000, 8000, 8000]  // 합 51024 — 넓은 스페이서로 오른쪽에 붙임
    const sig = fitSignature(sigEntry)
    const rows: Row[] = [
        { height: 1600, cells: [{ text: dateText, span: 4, bf: 1, cp: 5, align: 'right' }] },
        {
            height: 2400,
            cells: [
                { text: '', bf: 1 },
                { text: '점검자', bf: 1, cp: 5, align: 'center' },
                { text: inspectorName || '', bf: 1, cp: 5, align: 'center' },
                sigId
                    ? { picId: sigId, picW: sig.w, picH: sig.h, bf: 1, align: 'center' }
                    : { text: '(인)', bf: 1, cp: 0, align: 'center' },
            ],
        },
    ]
    return buildTableParagraph(colWidths, rows, tblId, 5)
}

// 인라인 사진 크기: 셀 안에 원본 비율을 유지해 맞춘다(측정 불가 시 셀 채움)
function fitPhoto(entry: ImageEntry | null, availW: number, availH: number): { w: number; h: number } {
    if (entry?.wPx && entry?.hPx) {
        const scale = Math.min(availW / entry.wPx, availH / entry.hPx)
        return { w: Math.max(1, Math.round(entry.wPx * scale)), h: Math.max(1, Math.round(entry.hPx * scale)) }
    }
    return { w: availW, h: availH }
}

// ── 1페이지: 체크리스트 ──

const COLS_P1 = [15307, 2551, 2551, 30615]  // 점검항목30 / 여5 / 부5 / 점검결과60 (합 51024)

const LINE_H = 1300
const CELL_PAD = 282

function estDisplayLines(text: string, cellW: number): number {
    const charsPerLine = Math.max(8, Math.floor((cellW - CELL_PAD) / 1000))
    return (text || '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

// 1페이지 표: 헤더 2행 + 주황 배너 2행 + 데이터 행. 데이터 행을 늘려 한 페이지를 채운다.
function buildPage1Rows(ins: any): Row[] {
    const rows: Row[] = []

    // 헤더 1행: 점검항목(rowSpan2) / 이행여부(colSpan2) / 점검결과(rowSpan2)
    rows.push({
        height: 2600,
        cells: [
            { text: '점 검 항 목\n[3대 유형(부딪힘, 물체에맞음, 추락)]', rowSpan: 2, header: true, cp: 1, align: 'center' },
            { text: '이행여부', span: 2, header: true, cp: 1, align: 'center' },
            { text: '점검 결과', rowSpan: 2, header: true, cp: 1, align: 'center' },
        ],
    })
    // 헤더 2행: 여 / 부
    rows.push({ height: 1300, cells: [{ text: '여', header: true, cp: 7, align: 'center' }, { text: '부', header: true, cp: 7, align: 'center' }] })

    // 데이터 행 빌더
    const dataRow = (title: string, status: any, remarks: string): Row => ({
        height: 2600,
        cells: [
            { text: title, cp: 7, align: 'left' },
            { text: yesNo(status, 'yes'), cp: 0, align: 'center' },
            { text: yesNo(status, 'no'), cp: 0, align: 'center' },
            { text: remarks || '', cp: 7, align: 'left' },
        ],
    })

    // 배너 1: 중요 (부딪힘, 물체에맞음)
    rows.push({ height: 2600, cells: [{ text: '【중요】 (부딪힘, 물체에맞음) 굴착기 등 사용 작업', span: 4, bf: 4, cp: 4, align: 'left' }] })
    ;(ins.critical_items || []).forEach((it: any, idx: number) => {
        rows.push(dataRow(`${CIRCLED[idx] || (idx + 1)} ${it.title || ''}`, it.status, it.remarks))
    })
    // 배너 2: 중요 (추락)
    rows.push({ height: 2600, cells: [{ text: '【중요】 (추락) 가설구조물, 고소작업 등', span: 4, bf: 4, cp: 4, align: 'left' }] })
    ;(ins.caution_items || []).forEach((it: any, idx: number) => {
        rows.push(dataRow(`${CIRCLED[idx] || (idx + 1)} ${it.title || ''}`, it.status, it.remarks))
    })
    // 기타 7개(기본 제목 병합)
    const rawOthers = (ins.other_items || []) as any[]
    const otherMap = new Map(rawOthers.map(it => [it.title, it]))
    OTHER_DEFAULT_TITLES.forEach(title => {
        const it: any = otherMap.get(title) || { title, status: '', remarks: '' }
        rows.push(dataRow(it.title || title, it.status, it.remarks))
    })

    return stretchPage1Rows(rows)
}

// 데이터 행(인덱스 2부터)을 늘려 한 페이지를 채운다. 헤더 2행은 고정.
function stretchPage1Rows(rows: Row[]): Row[] {
    const capacity = CONTENT_HEIGHT - 3800 - 1300 - 4200 - 1200  // 제목2줄 - 각주 - 서명블록 - 버퍼
    const est = rows.map((row) => {
        let maxH = row.height
        let colAddr = 0
        for (const cell of row.cells) {
            const span = cell.span ?? 1
            const w = sumRange(COLS_P1, colAddr, span)
            colAddr += span
            if (cell.text) maxH = Math.max(maxH, estDisplayLines(cell.text, w) * LINE_H + CELL_PAD)
        }
        return maxH
    })
    const headerH = est[0] + est[1]
    const total = est.reduce((a, b) => a + b, 0)
    if (total >= capacity) return rows.map((row, i) => ({ ...row, height: est[i] }))
    const dataSum = total - headerH
    const scale = (capacity - headerH) / dataSum
    return rows.map((row, i) => (i < 2 ? { ...row, height: est[i] } : { ...row, height: Math.round(est[i] * scale) }))
}

// ── 2페이지: 점검사진 ──

const COLS_P2 = [6123, 19389, 6123, 19389]  // 12 / 38 / 12 / 38 (합 51024, 좌2칸=우2칸=50%)
const P2_OVERVIEW_H = 23000
const P2_ISSUE_H = 15000

function buildPage2Rows(
    ins: any,
    projectName: string,
    photos: { overview: string | null; issue1: string | null; action1: string | null; issue2: string | null; action2: string | null },
    collector: ImageCollector
): Row[] {
    const dateText = ins.inspection_date ? new Date(ins.inspection_date).toLocaleDateString('ko-KR') : ''
    const rows: Row[] = []

    rows.push({ height: 2600, cells: [{ text: '지구명', header: false, cp: 1, align: 'center' }, { text: projectName, span: 3, cp: 0, align: 'left' }] })
    rows.push({
        height: 2600,
        cells: [
            { text: '일 시', cp: 1, align: 'center' },
            { text: dateText, cp: 0, align: 'left' },
            { text: '점 검 자', cp: 1, align: 'center' },
            { text: ins.inspector_name || '', cp: 0, align: 'left' },
        ],
    })
    // 전경사진(있으면 인라인, 없으면 안내 문구)
    const ovEntry = collector.find(photos.overview)
    const ov = fitPhoto(ovEntry, CONTENT_WIDTH - 282, P2_OVERVIEW_H - 282)
    rows.push({
        height: P2_OVERVIEW_H,
        cells: [photos.overview
            ? { span: 4, picId: photos.overview, picW: ov.w, picH: ov.h, align: 'center' }
            : { text: '현재 작업 중인 주요 공종의 전경이 보이도록 촬영', span: 4, cp: 7, align: 'center' }],
    })
    // 지적사항 1
    rows.push({
        height: 2600,
        cells: [
            { text: '지적사항', cp: 1, align: 'center' },
            { text: `(조치 전) ${ins.issue_content1 || ''}`, cp: 1, align: 'left' },
            { text: '(조치 후)', span: 2, cp: 1, align: 'left' },
        ],
    })
    rows.push({ height: P2_ISSUE_H, cells: [buildIssuePhotoCell(photos.issue1, collector), buildActionPhotoCell(ins.action_photo_issue1, photos.action1, collector)] })
    // 지적사항 2
    rows.push({
        height: 2600,
        cells: [
            { text: '지적사항', cp: 1, align: 'center' },
            { text: `(조치 전) ${ins.issue_content2 || ''}`, cp: 1, align: 'left' },
            { text: '(조치 후)', span: 2, cp: 1, align: 'left' },
        ],
    })
    rows.push({ height: P2_ISSUE_H, cells: [buildIssuePhotoCell(photos.issue2, collector), buildActionPhotoCell(ins.action_photo_issue2, photos.action2, collector)] })

    return rows
}

function buildIssuePhotoCell(photoId: string | null, collector: ImageCollector): Cell {
    if (!photoId) return { text: '', span: 2, cp: 7, align: 'center' }
    const entry = collector.find(photoId)
    const fit = fitPhoto(entry, sumRange(COLS_P2, 0, 2) - 800, P2_ISSUE_H - 800)
    return { span: 2, picId: photoId, picW: fit.w, picH: fit.h, align: 'center' }
}

function buildActionPhotoCell(rawAction: any, photoId: string | null, collector: ImageCollector): Cell {
    if (rawAction === '해당 사항 없음') return { text: '해당 사항 없음', span: 2, cp: 6, align: 'center' }
    if (!photoId) return { text: '', span: 2, cp: 7, align: 'center' }
    const entry = collector.find(photoId)
    const fit = fitPhoto(entry, sumRange(COLS_P2, 2, 2) - 800, P2_ISSUE_H - 800)
    return { span: 2, picId: photoId, picW: fit.w, picH: fit.h, align: 'center' }
}

// ── 3페이지: 5대 핵심 안전수칙 점검표 ──

const COLS_P3 = [2041, 15307, 2551, 2551, 2551, 2551, 2551, 3061, 17860]  // 구분4 항목30 등급5×5 해당없음6 결과35 (합 51024)
const P3_HEADER1_H = 2000
const P3_HEADER2_H = 1500
const P3_CAT_H = 1900
const P3_ITEM_H = 2500

function isCountItem(title: string): boolean { return title.trim().endsWith('횟수') }

function buildPage3Rows(ins: any): Row[] {
    const rawItems = (ins.five_key_items || []) as any[]
    const existingMap = new Map(rawItems.map(it => [it.title, it]))
    const items = DEFAULT_FIVE_KEY_REPORT_ITEMS.map(def => {
        const existing: any = existingMap.get(def.title)
        const rawGrade = existing?.grade
        return {
            ...def,
            grade: (rawGrade && rawGrade !== '' ? rawGrade : '1') as string,
            remarks: existing?.remarks ?? '',
            count: existing?.count,
        }
    })
    // 카테고리 그룹핑
    const groups: { category: string; items: typeof items }[] = []
    items.forEach(it => {
        const last = groups[groups.length - 1]
        if (last && last.category === it.category) last.items.push(it)
        else groups.push({ category: it.category, items: [it] })
    })
    const totalBodyRows = items.length + groups.length  // 17 + 5 = 22

    const rows: Row[] = []
    // 헤더 1행
    rows.push({
        height: P3_HEADER1_H,
        cells: [
            { text: '구 분', rowSpan: 2, header: true, cp: 1, align: 'center' },
            { text: '주 요 항 목', rowSpan: 2, header: true, cp: 1, align: 'center' },
            { text: '이행여부', span: 6, header: true, cp: 1, align: 'center' },
            { text: '점검 결과', rowSpan: 2, header: true, cp: 1, align: 'center' },
        ],
    })
    // 헤더 2행: 등급
    rows.push({
        height: P3_HEADER2_H,
        cells: ['1등급', '2등급', '3등급', '4등급', '5등급', '해당없음'].map(t => ({ text: t, header: true, cp: 3, align: 'center' as const })),
    })

    const gradeCheck = (grade: string, target: string): string => (grade === target ? '☑' : '')
    let firstBodyRow = true
    groups.forEach(group => {
        // 카테고리 헤더행: 첫 행에만 구분 rowSpan 셀
        const catCells: Cell[] = []
        if (firstBodyRow) catCells.push({ text: '5대 핵심\n안전수칙', rowSpan: totalBodyRows, bf: 5, cp: 1, align: 'center' })
        catCells.push({ text: group.category, bf: 5, cp: 1, align: 'left' })
        for (let i = 0; i < 7; i++) catCells.push({ text: '', bf: 5 })  // 등급5 + 해당없음 + 결과 = 7칸
        rows.push({ height: P3_CAT_H, cells: catCells })
        firstBodyRow = false

        group.items.forEach(it => {
            const trimmed = (it.remarks || '').trim()
            const resultText = trimmed && trimmed !== '특이사항 없음' ? trimmed : '특이사항 없음'
            const cells: Cell[] = [{ text: it.title, cp: 3, align: 'left' }]
            if (isCountItem(it.title)) {
                const cnt = typeof it.count === 'number' ? it.count : 0
                cells.push({ text: `${cnt}건`, span: 6, cp: 1, align: 'center' })
            } else {
                ;['1', '2', '3', '4', '5', 'N/A'].forEach(g => cells.push({ text: gradeCheck(it.grade, g), cp: 5, align: 'center' }))
            }
            cells.push({ text: resultText, cp: 3, align: 'left' })
            rows.push({ height: P3_ITEM_H, cells })
        })
    })

    return rows
}

// ── 점검 1건(3페이지) 조립 ──

async function buildInspectionParts(
    collector: ImageCollector,
    ins: any,
    projectName: string,
    branchName: string | undefined,
    hqName: string | undefined,
    first: boolean,
    tblIdBase: number
): Promise<string[]> {
    // 이미지 수집: 서명(원본 PNG-투명), 사진(정규화 JPEG)
    const sigId = await collector.collect(ins.signature, true)
    const sigEntry = collector.find(sigId)
    const photos = {
        overview: await collector.collect(ins.site_photo_overview, false),
        issue1: await collector.collect(ins.site_photo_issue1, false),
        action1: ins.action_photo_issue1 && ins.action_photo_issue1 !== '해당 사항 없음' ? await collector.collect(ins.action_photo_issue1, false) : null,
        issue2: await collector.collect(ins.site_photo_issue2, false),
        action2: ins.action_photo_issue2 && ins.action_photo_issue2 !== '해당 사항 없음' ? await collector.collect(ins.action_photo_issue2, false) : null,
    }

    const parts: string[] = []

    // ── 1페이지 ──
    const branch = branchName || ins.managing_branch || ins.branch || ''
    const titleLine1 = `[${branch ? branch + ' ' : ''}${projectName}]`
    const titleLine2 = `${getQuarterLabel(ins.inspection_date)} 특별 및 불시점검 결과`
    parts.push(first ? buildFirstParagraph(titleLine1, 8, 'center') : buildTextParagraph(titleLine1, 8, 'center', true))
    parts.push(buildTextParagraph(titleLine2, 8, 'center', false))
    parts.push(buildSpacer(600))
    parts.push(buildTableParagraph(COLS_P1, buildPage1Rows(ins), tblIdBase + 1, 1))
    parts.push(buildTextParagraph('※ 점검표는 항목 변경 될 수 있음(변경 시 분기 시작 전 알림 예정)', 3, 'left', false))
    parts.push(buildSignatureBlock(formatDotDate(ins.inspection_date), ins.inspector_name || '', sigId, sigEntry, tblIdBase + 2))

    // ── 2페이지 ──
    parts.push(buildTextParagraph('건설현장 점검사진', 2, 'center', true))
    parts.push(buildSpacer(500))
    parts.push(buildTableParagraph(COLS_P2, buildPage2Rows(ins, projectName, photos, collector), tblIdBase + 3, 2))

    // ── 3페이지 ──
    const hq = hqName || ins.managing_hq || ''
    const tag = (s: string | undefined, fallback: string) => (s && s.trim() ? s : fallback)
    const headerLine = `☑ ${tag(hq, 'OO본부')} ${tag(branch, 'OO지사')} ${tag(projectName, 'OO사업')}`
    parts.push(buildTextParagraph('붙임 2', 3, 'left', true))
    parts.push(buildTextParagraph('건설현장  5대  핵심  안전수칙  점검표', 2, 'center', false))
    parts.push(buildTextParagraph(headerLine, 0, 'left', false))
    parts.push(buildTableParagraph(COLS_P3, buildPage3Rows(ins), tblIdBase + 4, 3))
    parts.push(buildTextParagraph('※ 각 항목의 세부 평가기준은 본부별 특성 및 현장 여건에 맞게 자체 기준(1~5등급)으로 평가하며, 5등급은 미이행 또는 확인 불가한 경우 적용한다.', 3, 'left', false))
    parts.push(buildSignatureBlock(formatDotDate(ins.inspection_date), ins.inspector_name || '', sigId, sigEntry, tblIdBase + 5))

    return parts
}

// ── 최종 조립 ──

export interface HeadquartersInspectionHwpxParams {
    projectName: string
    inspections: any[]
    branchName?: string
    hqName?: string
}

async function buildHwpxBlob(params: HeadquartersInspectionHwpxParams): Promise<Blob> {
    resetPicSeq()
    const { projectName, inspections, branchName, hqName } = params
    const collector = new ImageCollector()
    const parts: string[] = []
    for (let i = 0; i < inspections.length; i++) {
        parts.push(...await buildInspectionParts(collector, inspections[i], projectName, branchName, hqName, i === 0, 1000000000 + i * 10))
    }

    const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SEC_XMLNS}>${parts.join('')}</hs:sec>`

    const imageItems = collector.images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')
    const contentHpf = buildContentHpf(imageItems)

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

// 본부불시점검 보고서(선택 건들)를 하나의 hwpx로 다운로드 (건마다 3페이지, 새 쪽 시작)
export async function downloadHeadquartersInspectionHwpx(params: HeadquartersInspectionHwpxParams): Promise<void> {
    const blob = await buildHwpxBlob(params)
    triggerDownload(blob, `${params.projectName || 'project'}_본부불시점검_보고서.hwpx`)
}
