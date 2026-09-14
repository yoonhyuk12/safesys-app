// 장비 일일점검 기록을 서명과 명시적 페이지 분할을 포함한 HWPX로 조립한다.
import JSZip from 'jszip'
import type { EquipmentInspection } from '../equipment-inspection-types'

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

// 셀 안에 넣는 인라인 그림 (사진용, 최종 크기를 직접 지정)
function buildInlinePicXml(binItemId: string, imgW: number, imgH: number): string {
    const pos = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    return buildPicXml(binItemId, Math.max(1, imgW), Math.max(1, imgH), 'TOP_AND_BOTTOM', pos)
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

// A4 세로 페이지 본문 폭(HWPUNIT): 59528 - 좌우여백 15mm(4252)*2 = 51024
const CONTENT_WIDTH = 51024

// 첫 문단에 들어가는 구역 속성(A4 세로)
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="3600" footer="3600" gutter="0" left="4252" right="4252" top="3600" bottom="3600"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

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

interface Cell {
    text?: string
    span?: number          // colSpan (기본 1)
    header?: boolean       // 회색 머리셀 여부
    cp?: number            // charPrIDRef (기본 0)
    center?: boolean       // 가로 가운데 정렬
    picId?: string | null  // 인라인 그림(사진·서명)
    picW?: number          // 인라인 그림 너비(HWPUNIT, 생략 시 셀 폭 맞춤)
    picH?: number          // 인라인 그림 높이(HWPUNIT)
}

interface Row {
    height: number
    cells: Cell[]
    /** 쪽 하단 빈 공간을 나눠 받을 가변 행(점검 본문·비고). 제목·서명·기본사항·표머리는 늘리지 않는다. */
    flexible?: boolean
}

function sumRange(widths: number[], start: number, count: number): number {
    let s = 0
    for (let i = start; i < start + count; i++) s += widths[i] || 0
    return s
}

// 셀 텍스트 정규화 — 줄 끝 공백과 문자열 뒤쪽 공백·빈 줄을 제거한다(줄 앞 들여쓰기는 의도일 수 있어 보존).
// 높이 추정과 실제 렌더가 같은 문자열을 보도록 양쪽에서 동일하게 적용한다.
function trimCellText(text: string): string {
    const lines = text.split('\n').map(line => line.replace(/\s+$/, ''))
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
}

// 셀 내부 본문(여러 줄이면 문단 분리) 조립
function buildCellBody(cell: Cell, cellW: number): string {
    const cp = cell.cp ?? 0
    const pp = cell.center ? 1 : 0
    const h = CP_HEIGHT[cp] ?? 1000
    const innerW = Math.max(1, cellW - 282)

    if (cell.picId) {
        const pic = buildInlinePicXml(cell.picId, cell.picW ?? cellW - 282, cell.picH ?? 4000)
        return `<hp:p id="${nextId()}" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${pic}</hp:run>${lineseg(innerW, 1000)}</hp:p>`
    }

    const lines = trimCellText(cell.text ?? '').split('\n')
    return lines.map(line =>
        `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    ).join('')
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number): string {
    const span = cell.span ?? 1
    const bf = cell.header ? 3 : 2
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
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

const COLS = [6500, 36000, 8524]
// A4 세로 84188에서 위(여백 3600 + 머리말 3600)와 아래(꼬리말 3600 + 여백 3600)를 뺀 본문 높이.
// 쪽 분할과 하단 채움이 이 값을 함께 쓴다. 한글 2022 실측에서 이 높이를 다 쓰는 표도 한 쪽에 들어갔다.
const PAGE_CAPACITY = 69788
const LINE_HEIGHT = 1300

// 한글 9pt 기준으로 보수적으로 미리 줄바꿈한다. 긴 한 셀도 여러 행·쪽으로 나눈다.
function wrapText(text: string, width: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
        let line = ''
        let used = 0
        for (const char of paragraph) {
            const charWidth = char === '\t' ? 3600 : char.charCodeAt(0) <= 127 ? 500 : 1000
            if (used + charWidth > width - 600 && line) {
                lines.push(line)
                line = ''
                used = 0
            }
            line += char === '\t' ? '    ' : char
            used += charWidth
        }
        lines.push(line)
    }
    return lines
}

function textRows(cells: Cell[], flexible = false): Row[] {
    let column = 0
    const wrapped = cells.map(cell => {
        const width = sumRange(COLS, column, cell.span ?? 1)
        column += cell.span ?? 1
        return wrapText(cell.text ?? '', width)
    })
    const rows: Row[] = []
    const count = Math.max(...wrapped.map(lines => lines.length))
    for (let start = 0; start < count; start += 8) {
        const chunks = wrapped.map(lines => lines.slice(start, start + 8))
        rows.push({
            height: Math.max(...chunks.map(lines => lines.length), 1) * LINE_HEIGHT + 400,
            flexible,
            cells: cells.map((cell, i) => ({ ...cell, cp: 7, text: chunks[i].join('\n') })),
        })
    }
    return rows
}

// 쪽 하단에 빈 공간이 남지 않도록 남는 높이를 가변 행(점검 본문·비고)에 비례 배분한다.
// 제목·서명·기본사항·표머리는 필요 이상으로 늘리지 않는다. 원본 행은 바꾸지 않고 새 배열을 돌려준다.
function stretchRowsToFillPage(rows: Row[]): Row[] {
    const remaining = PAGE_CAPACITY - rows.reduce((sum, row) => sum + row.height, 0)
    if (remaining <= 0) return rows
    const flexibleTotal = rows.reduce((sum, row) => sum + (row.flexible ? row.height : 0), 0)
    if (flexibleTotal <= 0) return rows
    const lastFlexible = rows.reduce((last, row, index) => (row.flexible ? index : last), -1)
    let given = 0
    return rows.map((row, index) => {
        if (!row.flexible) return row
        const add = index === lastFlexible ? remaining - given : Math.floor((row.height / flexibleTotal) * remaining)
        given += add
        return { ...row, height: row.height + add }
    })
}

function titleRow(continuation = false): Row {
    return { height: 4000, cells: [{ text: `장비 일일점검표${continuation ? ' (계속)' : ''}`, span: 3, cp: 2, center: true, header: true }] }
}

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
    // 비동기 이미지 수집 뒤부터 XML 조립까지는 동기 구간이므로 동시 다운로드 간 ID가 섞이지 않는다.
    resetPicSeq()
    _idSeq = 2147483648
    const inspectorLines = wrapText(`점검자  ${record.inspector_name}`, COLS[0] + COLS[1])
    const signatureHeight = Math.max(4000, inspectorLines.length * LINE_HEIGHT + 600)
    const firstRows: Row[] = [titleRow(), {
        height: signatureHeight,
        cells: [{ text: inspectorLines.join('\n'), span: 2, cp: 7 }, { text: '(서명 또는 인)', center: true, cp: 7 }],
    }]
    const detailRows: Row[] = []
    for (const text of [
        `현장명  ${projectName}`,
        `장비종류  ${record.equipment_name}    점검일  ${record.inspection_date}`,
        `협력업체명  ${record.company_name}`,
        `차량번호  ${record.vehicle_number}    기계번호  ${record.machine_number}`,
    ]) detailRows.push(...textRows([{ text, span: 3 }]))
    const columnHeader: Row = { height: 2300, cells: [
        { text: '구분', header: true, center: true, cp: 7 },
        { text: '검사 내용', header: true, center: true, cp: 7 },
        { text: '점검 결과', header: true, center: true, cp: 7 },
    ] }
    detailRows.push(columnHeader)
    const results = { pass: '적합', fail: '부적합', na: '해당없음' }
    record.answers.forEach((answer, index) => {
        detailRows.push(...textRows([
            { text: answer.category }, { text: `${index + 1}. ${answer.text}` }, { text: results[answer.result], center: true },
        ], true))
        if (answer.note) detailRows.push(...textRows([{ text: `${index + 1}번 비고  ${answer.note}`, span: 3 }], true))
    })
    detailRows.push(...textRows([{ text: `종합 비고  ${record.remarks || '-'}`, span: 3 }], true))
    // 쪽 분할 뒤 마지막 쪽만 헐거워지면 늘어난 행이 과하게 커지므로, 쪽 수가 늘지 않는 가장 작은 예산으로 고르게 나눈다.
    const paginate = (budget: number): Row[][] => {
        const result: Row[][] = [[...firstRows]]
        let pageHeight = firstRows.reduce((sum, row) => sum + row.height, 0)
        for (const row of detailRows) {
            if (pageHeight + row.height > budget) {
                const continuationRows = [titleRow(true), ...textRows([{ text: `${record.equipment_name} / ${record.inspection_date}`, span: 3 }]), columnHeader]
                result.push(continuationRows)
                pageHeight = continuationRows.reduce((sum, item) => sum + item.height, 0)
            }
            result[result.length - 1].push(row)
            pageHeight += row.height
        }
        return result
    }
    const pageCount = paginate(PAGE_CAPACITY).length
    let low = 1
    let high = PAGE_CAPACITY
    while (low < high) {
        const mid = Math.floor((low + high) / 2)
        if (paginate(mid).length <= pageCount) high = mid
        else low = mid + 1
    }
    const filledPages = paginate(low).map(stretchRowsToFillPage)
    const signatureImage = collector.find(signatureId)
    const ratio = signatureImage?.wPx && signatureImage.hPx ? signatureImage.wPx / signatureImage.hPx : 3
    const signatureWidth = Math.round(Math.min(COLS[2] - 600, 2400 * ratio))
    const signaturePicHeight = Math.round(signatureWidth / ratio)
    const [finalTitleRow, finalSignatureRow] = filledPages[0]
    const signature = signatureId ? buildFloatingPicXml(signatureId, signatureWidth, signaturePicHeight,
        4252 + COLS[0] + COLS[1] + Math.round((COLS[2] - signatureWidth) / 2),
        7200 + finalTitleRow.height + Math.round((finalSignatureRow.height - signaturePicHeight) / 2)) : ''
    const parts = filledPages.map((rows, index) => {
        const xml = buildTableParagraph(COLS, rows, 1000000000 + index, index, index === 0 && signature ? [signature] : [], index > 0)
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
