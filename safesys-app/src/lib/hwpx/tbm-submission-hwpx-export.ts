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

const PRV_TEXT = '일일안전교육일지(TBM 회의록)'

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
    picId?: string | null  // 인라인 그림(사진·서명)
    picW?: number          // 인라인 그림 너비(HWPUNIT, 생략 시 셀 폭 맞춤)
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

    const lines = (cell.text ?? '').split('\n')
    return lines.map(line =>
        `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    ).join('')
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number): string {
    const span = cell.span ?? 1
    const bf = cell.header ? 3 : 2
    const valign = cell.top ? 'TOP' : 'CENTER'
    const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
}

// 표를 감싼 문단 XML 반환. floats는 이 표가 놓인 쪽에 겹칠 떠 있는 그림 XML 목록.
function buildTableParagraph(colWidths: number[], rows: Row[], tblId: number, zOrder: number, floats: string[] = []): string {
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
    return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${floats.join('')}${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
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

// 9열 그리드 폭(합 = 51024) — 사용자 수정본(성남 골프장 _직접수정.hwpx) 열 비율을 15mm 여백 본문 폭으로 스케일
const COLS_MAIN = [3189, 3189, 14883, 599, 6542, 4744, 2397, 8041, 7440]

function getDayOfWeek(dateStr: string): string {
    const days = ['일', '월', '화', '수', '목', '금', '토']
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? '' : days[d.getDay()]
}

// 1페이지 표 행 높이(HWPUNIT) — 사용자 수정본(성남 골프장 _직접수정.hwpx) 실측값.
// 선언 높이는 최소값이라 작업내용·기타사항이 길면 행이 내용만큼 자라 페이지를 채운다.
const ROW_H = {
    leader: 2600, datetime: 1700, workName: 1700, workDesc: 3600, place: 1800,
    riskHead: 1800, risk: 2200, mainRisk: 2400, checkHead: 1700, factorHead: 1700,
    factor: 2000, dailyCheck: 1700, etcHead: 1700, etcBody: 5368, photoHead: 1700, photoBody: 11280,
} as const

const LINE_H = 1300   // 10pt × 줄간격 130%
const CELL_PAD = 282  // 셀 상하 여백

// 셀 폭 기준 표시 줄 수 추정(줄바꿈 + 자동 줄바꿈) — 10pt 한글 글자 폭 약 1000 HWPUNIT 가정
function estDisplayLines(text: string, cellW: number): number {
    const charsPerLine = Math.max(10, Math.floor((cellW - CELL_PAD) / 1000))
    return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

// 내용이 자라는 행의 예상 렌더 높이 (선언 높이는 최소값)
function estRowH(nominal: number, text: string, cellW: number): number {
    return Math.max(nominal, estDisplayLines(text, cellW) * LINE_H + CELL_PAD)
}

// 가변 내용(작업내용·기타사항·투입인원/장비)을 반영한 1페이지 예상 높이가 수용 한계를 넘으면 true.
// 넘칠 땐 작업내용 데이터 칸을 좌우 2칸으로 나눠 높이를 절반 수준으로 줄인다.
function shouldSplitWorkDesc(workDesc: string, etcBody: string, personnel: string, equipment: string): boolean {
    if (!workDesc.includes('\n')) return false
    const fixedRows = ROW_H.leader + ROW_H.datetime + ROW_H.workName + ROW_H.place + ROW_H.riskHead
        + ROW_H.risk * 3 + ROW_H.mainRisk + ROW_H.checkHead + ROW_H.factorHead + ROW_H.factor * 3
        + ROW_H.dailyCheck + ROW_H.etcHead + ROW_H.photoHead
    const wWork = COLS_MAIN.slice(2).reduce((a, b) => a + b, 0)
    const wPersonnel = COLS_MAIN.slice(4, 7).reduce((a, b) => a + b, 0)
    const wEquip = COLS_MAIN.slice(7).reduce((a, b) => a + b, 0)
    const est = fixedRows
        + estRowH(ROW_H.workDesc, workDesc, wWork)
        + estRowH(ROW_H.etcBody, etcBody, CONTENT_WIDTH)
        + Math.max(estRowH(ROW_H.photoBody, personnel, wPersonnel), estRowH(ROW_H.photoBody, equipment, wEquip))
    // 수용 한계 = 본문 세로(69788) - 법조문·제목·붙임 줄(약 4420) - 안전 버퍼(2000)
    return est > 69788 - 4420 - 2000
}

// 좌우 칸의 표시 높이가 비슷해지도록 줄 단위 분할 지점을 찾는다
function splitWorkDescLines(text: string): [string, string] {
    const lines = text.split('\n')
    const halfW = COLS_MAIN.slice(2, 5).reduce((a, b) => a + b, 0)
    const disp = lines.map(l => estDisplayLines(l, halfW))
    const total = disp.reduce((a, b) => a + b, 0)
    let acc = 0
    let cut = lines.length
    for (let i = 0; i < lines.length; i++) {
        acc += disp[i]
        if (acc >= total / 2) { cut = i + 1; break }
    }
    return [lines.slice(0, cut).join('\n'), lines.slice(cut).join('\n')]
}

function buildTbmTableRows(f: TBMSubmissionFormData, photo: { id: string; w: number; h: number } | null): Row[] {
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

    // TBM리더 — 서명 이미지는 쪽 기준 떠 있는 그림으로 "(서명)" 위에 겹친다
    rows.push({
        height: ROW_H.leader,
        cells: [
            { text: 'TBM리더', span: 2, header: true, cp: 1, center: true },
            { text: `◆ 소속 : ${f.constructionCompany || ''}`, span: 3 },
            { text: '이름', header: true, cp: 1, center: true },
            { text: f.name || '', span: 2, center: true },
            { text: '(서명)', center: true },
        ],
    })
    // TBM 일시
    rows.push({ height: ROW_H.datetime, cells: [{ text: 'TBM 일시', span: 2, header: true, cp: 1, center: true }, { text: dateTime, span: 7 }] })
    // 작업명
    rows.push({ height: ROW_H.workName, cells: [{ text: '작업명', span: 2, header: true, cp: 1, center: true }, { text: workName, span: 7 }] })
    // 작업내용 — 가변 내용을 합쳐 1페이지를 넘길 상황이면 데이터 칸을 좌우 2칸으로 나눠 담는다
    const workDesc = f.todayWork || ''
    if (shouldSplitWorkDesc(workDesc, (f.otherRemarks || '').trimStart(), personnel, equipment)) {
        const [left, right] = splitWorkDescLines(workDesc)
        rows.push({
            height: ROW_H.workDesc,
            cells: [
                { text: '작업내용', span: 2, header: true, cp: 1, center: true },
                { text: left, span: 3, top: true },
                { text: right, span: 4, top: true },
            ],
        })
    } else {
        rows.push({ height: ROW_H.workDesc, cells: [{ text: '작업내용', span: 2, header: true, cp: 1, center: true }, { text: workDesc, span: 7, top: true }] })
    }
    // TBM 장소
    rows.push({
        height: ROW_H.place,
        cells: [
            { text: 'TBM 장소', span: 2, header: true, cp: 1, center: true },
            { text: f.address || '', span: 3 },
            { text: '위험성평가\n실시여부', span: 2, header: true, cp: 4, center: true },
            { text: '예 ☑  아니오 ☐', span: 2, center: true },
        ],
    })
    // 잠재위험요인 머리
    rows.push({
        height: ROW_H.riskHead,
        cells: [
            { text: '잠재위험요인(수시위험성평가와 연계)', span: 3, header: true, cp: 1, center: true },
            { text: '대책(제거>대체>통제 순서고려)', span: 6, header: true, cp: 1, center: true },
        ],
    })
    // 잠재위험요인 1~3
    risks.forEach((it, i) => {
        rows.push({
            height: ROW_H.risk,
            cells: [
                { text: `${i + 1}. ${(it.r || '').trim()}`, span: 3, top: true },
                { text: `${i + 1}. ${(it.s || '').trim()}`, span: 6, top: true },
            ],
        })
    })
    // 중점위험요인
    rows.push({
        height: ROW_H.mainRisk,
        cells: [
            { text: '중점위험\n요인', span: 2, header: true, cp: 1, center: true },
            { text: `선정: ${(f.mainRiskSelection || '').trim()}`, span: 3, top: true },
            { text: `대책: ${(f.mainRiskSolution || '').trim()}`, span: 4, top: true },
        ],
    })
    // 안전조치 확인 머리
    rows.push({ height: ROW_H.checkHead, cells: [{ text: '■ 작업 전 안전조치 확인 ※ 위 잠재위험요인(중점위험 포함) 안전조치 여부 재확인', span: 9, header: true, cp: 1 }] })
    // 잠재위험요소 머리
    rows.push({
        height: ROW_H.factorHead,
        cells: [
            { text: '잠재위험요소(중점위험 포함)', span: 7, header: true, cp: 1, center: true },
            { text: '조치여부', span: 2, header: true, cp: 1, center: true },
        ],
    })
    // 잠재위험요소 1~3
    factors.forEach((fa, i) => {
        rows.push({
            height: ROW_H.factor,
            cells: [
                { text: `${i + 1}. ${(fa || '').trim()}`, span: 7, top: true },
                { text: '예 ☑ 아니오 ☐', span: 2, center: true },
            ],
        })
    })
    // 일일안전점검
    rows.push({ height: ROW_H.dailyCheck, cells: [{ text: '■ 작업 전 일일 안전점검 시행 결과 ※ 공사현장 일일안전점검을 통해 위험성평가 이행 확인', span: 9, header: true, cp: 1 }] })
    // 기타사항 머리
    rows.push({ height: ROW_H.etcHead, cells: [{ text: '■ 기타사항(교육내용, 제안제도, 아차사고 등)', span: 9, header: true, cp: 1 }] })
    // 기타사항 내용
    rows.push({ height: ROW_H.etcBody, cells: [{ text: (f.otherRemarks || '').trimStart(), span: 9, top: true }] })
    // 사진/투입 머리
    rows.push({
        height: ROW_H.photoHead,
        cells: [
            { text: 'TBM 실시사진', span: 4, header: true, cp: 1, center: true },
            { text: '투입인원', span: 3, header: true, cp: 1, center: true },
            { text: '투입장비', span: 2, header: true, cp: 1, center: true },
        ],
    })
    // 사진/투입 데이터 — 사진은 원본 비율을 유지해 셀에 맞춘다
    rows.push({
        height: ROW_H.photoBody,
        cells: [
            photo
                ? { span: 4, picId: photo.id, picW: photo.w, picH: photo.h, center: true }
                : { text: '사진 없음', span: 4, cp: 7, center: true },
            { text: personnel, span: 3, top: true },
            { text: equipment, span: 2, top: true },
        ],
    })

    return rows
}

// ── 근로자 교육 확인 서명부(별지) 표 구성 ──

const COLS_SIG = [2804, 6727, 6168, 5046, 5607, 5607, 5607, 5607, 7851]

// 서명 이미지 표준 크기(HWPUNIT)
const SIG_W = 3000
const SIG_H = 1100

function buildSignatureRows(entries: TBMWorkerSignatureEntry[]): Row[] {
    const rows: Row[] = []
    const headers = ['NO.', '성 명', 'TBM\n위.평확인', '음주여부', '혈압여부', '보호구\n착용여부', 'CCTV\n촬영동의', '몸(부상)\n여 부', '서 명']
    rows.push({ height: 2200, cells: headers.map(h => ({ text: h, header: true, cp: 1, center: true })) })

    const count = Math.max(entries.length, 15)
    for (let i = 0; i < count; i++) {
        const e = entries[i]
        const vals = e
            ? [String(i + 1), e.worker_name || '', e.tbm_confirmed ? '확인' : '', e.no_alcohol ? 'X' : '', e.blood_pressure_ok ? '150미만' : '', e.ppe_worn ? '착용' : '', e.cctv_consent ? '동의' : '', e.body_ok ? '이상없음' : '', '']
            : [String(i + 1), '', '', '', '', '', '', '', '']
        rows.push({ height: 1600, cells: vals.map(v => ({ text: v, center: true })) })
    }
    return rows
}

// ── 최종 조립 ──

async function buildTbmHwpxBlob(
    formData: TBMSubmissionFormData,
    signatures: TBMWorkerSignatureEntry[]
): Promise<Blob> {
    resetPicSeq()
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
    // 쪽 기준 절대 배치 상수 (A4 세로, HWPUNIT). 왼쪽 여백 15mm=4252, 본문 시작 = 위 여백 3600 + 머리말 3600.
    const PAGE_LEFT = 4252
    const PAGE_CONTENT_TOP = 7200
    const line = (cpHeight: number) => Math.round(cpHeight * 1.3) // 줄간격 130%

    // 사진은 원본 비율을 유지해 사진 셀(20646×photoBody) 안에 맞춘다. 크기 측정 불가 환경은 셀 채움.
    let photo: { id: string; w: number; h: number } | null = null
    if (photoId) {
        const availW = COLS_MAIN.slice(0, 4).reduce((a, b) => a + b, 0) - 282
        const availH = ROW_H.photoBody - 282
        const entry = collector.find(photoId)
        let w = availW
        let h = availH
        if (entry?.wPx && entry?.hPx) {
            const scale = Math.min(availW / entry.wPx, availH / entry.hPx)
            w = Math.round(entry.wPx * scale)
            h = Math.round(entry.hPx * scale)
        }
        photo = { id: photoId, w, h }
    }

    parts.push(buildFirstParagraph('건설기술 진흥법 시행령 103조(안전교육) 제3항에 따른 안전교육내용 기록'))
    parts.push(buildTextParagraph('일일안전교육일지(TBM 회의록)', 2, true, false))
    // 작성자 서명: "(서명)" 문구 위에 크게 겹침. 크기·좌표는 사용자 수정본 실측값(표 오른쪽 밖 일부 돌출 허용).
    const mainFloats: string[] = []
    if (sigId) {
        // "(서명)" 셀 왼쪽 973 앞에서 시작해 표 오른쪽 밖까지 겹침 — 사용자 수정본의 상대 위치를 유지
        const sigX = PAGE_LEFT + COLS_MAIN.slice(0, 8).reduce((a, b) => a + b, 0) - 973
        mainFloats.push(buildFloatingPicXml(sigId, 10260, 3762, sigX, 10149))
    }
    parts.push(buildTableParagraph(COLS_MAIN, buildTbmTableRows(formData, photo), 1000000001, 1, mainFloats))
    parts.push(buildTextParagraph('붙임) TBM 참여 서명부 _ 작업장 출입 전.후 근로자 작업가능상태 점검', 5, false, false))

    if (signatures.length > 0) {
        const dow = formData.educationDate ? getDayOfWeek(formData.educationDate) : ''
        parts.push(buildTextParagraph('일일안전교육 서명부', 2, true, true))
        parts.push(buildTextParagraph('작업장 출입 전 근로자 작업가능상태 점검', 6, true, false))
        parts.push(buildTextParagraph(`일자: ${formData.educationDate || ''}(${dow})`, 1, false, false))
        // 근로자 서명: 2페이지 서명부 표의 서명 칸 위 (쪽 기준 좌표라 2페이지를 넘는 행은 생략)
        const sigFloats: string[] = []
        // 마지막 항은 한글 2020 렌더 실측 보정값
        const sigX = PAGE_LEFT + COLS_SIG.slice(0, 8).reduce((a, b) => a + b, 0) + Math.round((COLS_SIG[8] - SIG_W) / 2) + 350
        const sigTableTop = PAGE_CONTENT_TOP + line(1600) + line(1200) + line(1000) + 1250
        workerSigIds.forEach((id, i) => {
            if (!id || i >= 38) return
            sigFloats.push(buildFloatingPicXml(id, SIG_W, SIG_H, sigX, sigTableTop + 2200 + i * 1600 + Math.round((1600 - SIG_H) / 2)))
        })
        parts.push(buildTableParagraph(COLS_SIG, buildSignatureRows(signatures), 1000000002, 2, sigFloats))
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
