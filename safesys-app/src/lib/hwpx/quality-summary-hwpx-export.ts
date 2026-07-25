// 품질검사 성과 총괄표(별지 2호)를 한글문서(hwpx/OWPML)로 조립·다운로드하는 모듈
import JSZip from 'jszip'
import {
  QualitySummaryFormData,
  settlementCumulative,
} from '@/lib/quality/quality-test-types'

// ── 공통 헬퍼 (tbm-submission-hwpx-export 패턴 답습) ──

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

// data URL → Blob (fetch 폴백·Node 스텁 환경 대비)
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl)
  if (!m) return null
  const mime = m[1] || 'image/png'
  const isBase64 = !!m[2]
  const payload = m[3]
  try {
    if (isBase64) {
      const bin = atob(payload)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new Blob([bytes], { type: mime })
    }
    return new Blob([decodeURIComponent(payload)], { type: mime })
  } catch {
    return null
  }
}

async function fetchImageAsBuffer(
  url: string,
  raw: boolean
): Promise<{ data: Uint8Array; ext: string; wPx?: number; hPx?: number } | null> {
  try {
    let blob: Blob | null = null
    if (url.startsWith('data:')) {
      blob = dataUrlToBlob(url)
    } else {
      const res = await fetch(url)
      if (!res.ok) return null
      blob = await res.blob()
    }
    if (!blob) return null
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
      } catch {
        /* 측정 실패 시 비율 유지 없이 셀 채움 */
      }
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
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } catch {
    return null
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    img.src = url
  })
}

class ImageCollector {
  private idx = 0
  images: ImageEntry[] = []

  // raw=true: 정규화 없이 원본 바이트 유지(서명 PNG 투명도 보존)
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
}

// 그림 개체 일련번호. 필수 자식 요소 순서가 빠지면 한글 2020이 열다 죽는다.
let _picSeq = 0
function resetPicSeq(): void {
  _picSeq = 0
}

function buildPicXml(binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
  _picSeq++
  const id = 1149648000 + _picSeq
  const instid = 75906000 + _picSeq
  const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
  return `<hp:pic id="${id}" zOrder="${10 + _picSeq}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

// "(인)" 문구 위에 겹치는 떠 있는 그림. PAPER 절대좌표 + IN_FRONT_OF_TEXT.
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

const PRV_TEXT = '품질검사 성과 총괄표'

const SEC_XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`

// A4 세로 페이지 본문 폭(HWPUNIT): 59528 - 좌우여백 15mm(4252)*2 = 51024
const CONTENT_WIDTH = 51024
// A4 세로 본문 세로: 84188 - 상하 (3600+3600)*2
const CONTENT_HEIGHT = 69788
const PAGE_LEFT = 4252
const PAGE_CONTENT_TOP = 7200

// 서명 이미지 표준 크기(HWPUNIT)
const SIG_W = 3500
const SIG_H = 1400

// 9열 그리드(합=51024) — 엑셀 A~I 비율 근사
const COLS_9 = [7059, 9627, 7059, 4171, 4171, 4171, 4171, 4171, 6424]

const MIN_SETTLEMENT_ROWS = 3
const MIN_QUALITY_ROWS = 4
const MIN_VERIFICATION_ROWS = 3

const ROW_H_HEADER = 1800
const ROW_H_DATA = 1600
const LINE_H = 1300 // 10pt × 줄간격 130%
const CELL_PAD = 282

// 첫 문단에 들어가는 구역 속성(A4 세로)
const SECPR = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="3600" footer="3600" gutter="0" left="4252" right="4252" top="3600" bottom="3600"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`

// charPr: 0=본문10, 1=굵게10, 2=제목16굵게, 3=작게7, 4=굵게9, 5=굵게11, 6=굵게12, 7=본문9, 8=작게8
const CP_HEIGHT: Record<number, number> = {
  0: 1000,
  1: 1000,
  2: 1600,
  3: 700,
  4: 900,
  5: 1100,
  6: 1200,
  7: 900,
  8: 800,
}

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
    buildCharPr(8, 800, false),
  ].join('')
  return `<hh:charProperties itemCnt="9">${items}</hh:charProperties>`
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
  const meta = `<opf:metadata><opf:title>품질검사 성과 총괄표</opf:title><opf:language>ko</opf:language></opf:metadata>`
  const manifest = `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>${imageItems}</opf:manifest>`
  const spine = `<opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0" linear="yes"/></opf:spine>`
  return `${open}${meta}${manifest}${spine}</opf:package>`
}

// ── 문단·표 조립 ──

let _idSeq = 2147483648
function nextId(): string {
  return String(_idSeq++)
}

function lineseg(width: number, height: number): string {
  return `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${height}" textheight="${height}" baseline="${Math.round(height * 0.85)}" spacing="${Math.round(height * 0.35)}" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>`
}

interface Cell {
  text?: string
  span?: number
  header?: boolean
  cp?: number
  center?: boolean
  top?: boolean
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

function buildCellBody(cell: Cell, cellW: number): string {
  const cp = cell.cp ?? 0
  const pp = cell.center ? 1 : 0
  const h = CP_HEIGHT[cp] ?? 1000
  const innerW = Math.max(1, cellW - 282)
  const lines = (cell.text ?? '').split('\n')
  return lines
    .map(
      (line) =>
        `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(line)}</hp:t></hp:run>${lineseg(innerW, h)}</hp:p>`
    )
    .join('')
}

function buildCellXml(cell: Cell, colAddr: number, rowAddr: number, width: number, height: number): string {
  const span = cell.span ?? 1
  const bf = cell.header ? 3 : 2
  const valign = cell.top ? 'TOP' : 'CENTER'
  const subList = `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${buildCellBody(cell, width)}</hp:subList>`
  return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">${subList}<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
}

function buildTableParagraph(
  colWidths: number[],
  rows: Row[],
  tblId: number,
  zOrder: number,
  floats: string[] = []
): string {
  const colCnt = colWidths.length
  const trs = rows
    .map((row, r) => {
      let colAddr = 0
      const tcs = row.cells
        .map((cell) => {
          const span = cell.span ?? 1
          const width = sumRange(colWidths, colAddr, span)
          const tc = buildCellXml(cell, colAddr, r, width, row.height)
          colAddr += span
          return tc
        })
        .join('')
      return `<hp:tr>${tcs}</hp:tr>`
    })
    .join('')
  const totalW = colWidths.reduce((a, b) => a + b, 0)
  const tbl = `<hp:tbl id="${tblId}" zOrder="${zOrder}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`
  return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${floats.join('')}${tbl}<hp:t/></hp:run>${lineseg(CONTENT_WIDTH, 1000)}</hp:p>`
}

function buildTextParagraph(text: string, cp: number, center: boolean, pageBreak: boolean): string {
  const pp = center ? 1 : 0
  const h = CP_HEIGHT[cp] ?? 1000
  const pb = pageBreak ? '1' : '0'
  return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pb}" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// 첫 문단(구역 속성 포함)
function buildFirstParagraph(text: string, cp: number): string {
  const h = CP_HEIGHT[cp] ?? 700
  const ctrl = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
  return `<hp:p id="${nextId()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}">${SECPR}${ctrl}</hp:run><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>${lineseg(CONTENT_WIDTH, h)}</hp:p>`
}

// 작성일시 한국식 표기 (엑셀 formatReportDate와 동일)
const formatReportDate = (dateStr?: string | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '        년        월        일'
  const [y, m, d] = dateStr.split('-')
  return `${y}년  ${m}월  ${d}일`
}

function paraLineH(cp: number): number {
  return Math.round((CP_HEIGHT[cp] ?? 1000) * 1.3)
}

function tableHeight(rows: Row[]): number {
  return rows.reduce((s, r) => s + r.height, 0)
}

// 셀 폭 기준 표시 줄 수 추정 — 글자 폭을 여유 있게(1100) 잡아 줄바꿈 과소평가를 줄인다.
function estDisplayLines(text: string, cellW: number): number {
  const charsPerLine = Math.max(8, Math.floor((cellW - CELL_PAD) / 1100))
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

// 선언 최소 높이와 셀 내용 높이 중 큰 값
function estRenderRowH(row: Row): number {
  let colAddr = 0
  let maxH = row.height
  for (const cell of row.cells) {
    const span = cell.span ?? 1
    const w = sumRange(COLS_9, colAddr, span)
    colAddr += span
    const t = cell.text ?? ''
    if (!t) continue
    maxH = Math.max(maxH, estDisplayLines(t, w) * LINE_H + CELL_PAD)
  }
  return maxH
}

// 표 밖 고정 문단 높이 합(조립 순서와 동일). 표 행 배분 예산 계산에 사용.
// 빈 간격 문단은 두지 않는다 — 페이지 넘김 원인이 되기 쉽다.
function fixedNonTableHeight(): number {
  return (
    paraLineH(3) + // [별지 2호]
    paraLineH(2) + // 제목
    paraLineH(3) + // 부제
    paraLineH(0) + // 1. 공사명
    paraLineH(0) + // 2. 공사기간
    paraLineH(1) + // 3. 기성…
    paraLineH(1) + // 4. 품질검사…
    paraLineH(1) + // 5. 확인시험…
    paraLineH(0) + // 작성일시
    3 * paraLineH(0) + // 작성·검토·확인자
    4 * paraLineH(8) + // 기입요령
    // 표 래퍼 문단·줄간격 실측 오차 버퍼(표 3개)
    3 * 800
  )
}

// 세 표 행 높이를 1페이지 예산에 맞춰 비례 배분한다.
// - 내용이 짧으면 확대해 하단 여백을 줄이고
// - 내용이 길면 축소해 반드시 1페이지 이내로 맞춘다
// 합이 capacity를 절대 넘지 않게 floor + 잔여 분배한다.
function fitTablesToOnePage(
  settlementRows: Row[],
  qualityRows: Row[],
  verificationRows: Row[]
): [Row[], Row[], Row[]] {
  const tables = [settlementRows, qualityRows, verificationRows]
  const estTables = tables.map((rows) => rows.map(estRenderRowH))
  const flat = estTables.flat()
  const tableTotal = flat.reduce((a, b) => a + b, 0)
  // 한글이 행 선언값을 최소로만 쓰고 내용을 키우거나, 문단 간격이 더 클 수 있어 여유를 둔다.
  const SAFETY = 2400
  const capacity = Math.max(10000, CONTENT_HEIGHT - fixedNonTableHeight() - SAFETY)
  if (tableTotal <= 0) return [settlementRows, qualityRows, verificationRows]

  const scale = capacity / tableTotal
  // floor로 예산 이하 → 남는 분을 앞에서부터 +1 해 합이 capacity에 도달(초과 금지)
  const heights: number[] = flat.map((h) => Math.max(900, Math.floor(h * scale)))
  let sum = heights.reduce((a, b) => a + b, 0)
  let remain = capacity - sum
  let i = 0
  while (remain > 0 && heights.length > 0) {
    heights[i % heights.length] += 1
    remain -= 1
    i += 1
  }
  // 방어: 합이 capacity 초과 시 뒤에서 깎음
  sum = heights.reduce((a, b) => a + b, 0)
  let over = sum - capacity
  i = heights.length - 1
  while (over > 0 && i >= 0) {
    const cut = Math.min(over, Math.max(0, heights[i] - 900))
    heights[i] -= cut
    over -= cut
    i -= 1
  }

  let idx = 0
  return tables.map((rows) =>
    rows.map((row) => {
      const height = heights[idx++]
      return { ...row, height }
    })
  ) as [Row[], Row[], Row[]]
}

function buildSettlementRows(report: QualitySummaryFormData): Row[] {
  const rows: Row[] = []
  rows.push({
    height: ROW_H_HEADER,
    cells: [
      { text: '공 종', header: true, cp: 4, center: true },
      { text: '계획량\n(㎥)', header: true, cp: 4, center: true },
      { text: '전회까지 시공량(㎥)', span: 2, header: true, cp: 4, center: true },
      { text: '금회 시공량(㎥)', span: 2, header: true, cp: 4, center: true },
      { text: '누 계', span: 2, header: true, cp: 4, center: true },
      { text: '비 고', header: true, cp: 4, center: true },
    ],
  })
  const count = Math.max(report.settlement_rows.length, MIN_SETTLEMENT_ROWS)
  for (let i = 0; i < count; i++) {
    const row = report.settlement_rows[i]
    rows.push({
      height: ROW_H_DATA,
      cells: [
        { text: row?.work_type || '', cp: 7, center: true },
        { text: row?.plan_qty || '', cp: 7, center: true },
        { text: row?.prev_qty || '', span: 2, cp: 7, center: true },
        { text: row?.current_qty || '', span: 2, cp: 7, center: true },
        { text: row ? settlementCumulative(row) : '', span: 2, cp: 7, center: true },
        { text: row?.note || '', cp: 7, center: true },
      ],
    })
  }
  return rows
}

function buildQualityRows(report: QualitySummaryFormData): Row[] {
  const rows: Row[] = []
  // 헤더 1행 단순화 (rowSpan 미사용)
  rows.push({
    height: ROW_H_HEADER,
    cells: [
      { text: '공 종', header: true, cp: 4, center: true },
      { text: '시험ㆍ검사 종류(재료)', span: 2, header: true, cp: 4, center: true },
      { text: '계획', header: true, cp: 4, center: true },
      { text: '실시', header: true, cp: 4, center: true },
      { text: '합격', header: true, cp: 4, center: true },
      { text: '불합격', header: true, cp: 4, center: true },
      { text: '재시험', header: true, cp: 4, center: true },
      { text: '비 고', header: true, cp: 4, center: true },
    ],
  })
  const count = Math.max(report.quality_rows.length, MIN_QUALITY_ROWS)
  for (let i = 0; i < count; i++) {
    const row = report.quality_rows[i]
    rows.push({
      height: ROW_H_DATA,
      cells: [
        { text: row?.work_type || '', cp: 7, center: true },
        { text: row?.test_item || '', span: 2, cp: 7, center: true },
        { text: row?.plan || '', cp: 7, center: true },
        { text: row?.done || '', cp: 7, center: true },
        { text: row?.pass || '', cp: 7, center: true },
        { text: row?.fail || '', cp: 7, center: true },
        { text: row?.retest || '', cp: 7, center: true },
        { text: row?.note || '', cp: 7, center: true },
      ],
    })
  }
  return rows
}

function buildVerificationRows(report: QualitySummaryFormData): Row[] {
  const rows: Row[] = []
  rows.push({
    height: ROW_H_HEADER,
    cells: [
      { text: '공 종', header: true, cp: 4, center: true },
      { text: '시험ㆍ검사 종류(재료)①', header: true, cp: 4, center: true },
      { text: '확인시험 구분②', header: true, cp: 4, center: true },
      { text: '계획', header: true, cp: 4, center: true },
      { text: '실시', header: true, cp: 4, center: true },
      { text: '합격', header: true, cp: 4, center: true },
      { text: '불합격', header: true, cp: 4, center: true },
      { text: '재시험', header: true, cp: 4, center: true },
      { text: '비 고', header: true, cp: 4, center: true },
    ],
  })
  const count = Math.max(report.verification_rows.length, MIN_VERIFICATION_ROWS)
  for (let i = 0; i < count; i++) {
    const row = report.verification_rows[i]
    rows.push({
      height: ROW_H_DATA,
      cells: [
        { text: row?.work_type || '', cp: 7, center: true },
        { text: row?.test_item || '', cp: 7, center: true },
        { text: row?.verification_type || '', cp: 7, center: true },
        { text: row?.plan || '', cp: 7, center: true },
        { text: row?.done || '', cp: 7, center: true },
        { text: row?.pass || '', cp: 7, center: true },
        { text: row?.fail || '', cp: 7, center: true },
        { text: row?.retest || '', cp: 7, center: true },
        { text: row?.note || '', cp: 7, center: true },
      ],
    })
  }
  return rows
}

async function buildQualitySummaryHwpxBlob(
  report: QualitySummaryFormData,
  projectName: string
): Promise<Blob> {
  resetPicSeq()
  _idSeq = 2147483648
  const collector = new ImageCollector()

  const signers = [
    {
      label: '작 성 자③',
      affiliation: report.writer_affiliation,
      position: report.writer_position,
      name: report.writer_name,
      signature: report.writer_signature,
    },
    {
      label: '검 토 자④',
      affiliation: report.reviewer_affiliation,
      position: report.reviewer_position,
      name: report.reviewer_name,
      signature: report.reviewer_signature,
    },
    {
      label: '확 인 자⑤',
      affiliation: report.confirmer_affiliation,
      position: report.confirmer_position,
      name: report.confirmer_name,
      signature: report.confirmer_signature,
    },
  ]

  const sigIds: (string | null)[] = []
  for (const s of signers) {
    sigIds.push(s.signature ? await collector.collect(s.signature, true) : null)
  }

  const [settlementRows, qualityRows, verificationRows] = fitTablesToOnePage(
    buildSettlementRows(report),
    buildQualityRows(report),
    buildVerificationRows(report)
  )

  // 본문 높이 누적 → 서명 줄 Y 추정 (1페이지 맞춤 반영 후)
  let yCursor = PAGE_CONTENT_TOP
  yCursor += paraLineH(3) // [별지 2호]
  yCursor += paraLineH(2) // 제목
  yCursor += paraLineH(3) // 부제
  yCursor += paraLineH(0) // 1. 공사명
  yCursor += paraLineH(0) // 2. 공사기간
  yCursor += paraLineH(1) // 3. 기성…
  yCursor += tableHeight(settlementRows)
  yCursor += paraLineH(1) // 4. 품질검사…
  yCursor += tableHeight(qualityRows)
  yCursor += paraLineH(1) // 5. 확인시험…
  yCursor += tableHeight(verificationRows)
  yCursor += paraLineH(0) // 작성일시

  // 서명 줄 Y (각 줄 시작 기준, 세로 가운데 근처 보정)
  const signerLineH = paraLineH(0)
  const signerYs: number[] = []
  for (let i = 0; i < signers.length; i++) {
    signerYs.push(yCursor + Math.round((signerLineH - SIG_H) / 2))
    yCursor += signerLineH
  }

  // (인) 근처 = 페이지 오른쪽
  const sigX = PAGE_LEFT + CONTENT_WIDTH - SIG_W - 400

  // 서명 floating pic — 마지막 표(또는 서명부 근처 문단)에 앵커. 작성일시 다음 첫 서명 줄 표 없이
  // 문단 래퍼로 앵커: 서명 줄들을 텍스트 문단으로 두고 floats는 마지막 확인시험 표에 붙이지 않고
  // 빈 표 없이 첫 서명 문단 run에 넣는 방식. 표가 아니면 buildTableParagraph floats를 쓸 수 없으므로
  // 서명 블록을 한 문단 묶음으로 만들고 floats를 별도 문단 run에 삽입.
  const floats: string[] = []
  sigIds.forEach((id, i) => {
    if (!id) return
    floats.push(buildFloatingPicXml(id, SIG_W, SIG_H, sigX, signerYs[i]))
  })

  const period =
    report.construction_period || '    .    .    . ~    .    .    .'
  const progress = report.progress_rate || '     '

  const parts: string[] = []
  parts.push(buildFirstParagraph('[별지 2호]', 3))
  parts.push(buildTextParagraph('품질검사 성과 총괄표', 2, true, false))
  parts.push(buildTextParagraph('(지침 제14조 1항 관련)', 3, true, false))
  parts.push(buildTextParagraph(`1. 공사명 :  ${projectName || ''}`, 0, false, false))
  parts.push(
    buildTextParagraph(`2. 공사기간 :  ${period}      공정 :  ${progress} %`, 0, false, false)
  )
  parts.push(buildTextParagraph('3. 기성 또는 정산량', 1, false, false))
  parts.push(buildTableParagraph(COLS_9, settlementRows, 1000000001, 1))
  parts.push(buildTextParagraph('4. 품질검사 종류 및 실적', 1, false, false))
  parts.push(buildTableParagraph(COLS_9, qualityRows, 1000000002, 2))
  parts.push(buildTextParagraph('5. 확인시험 종류 및 실적', 1, false, false))
  // 서명 floats를 확인시험 표 앵커에 부착 (PAPER 절대좌표라 표 위치에 무관)
  parts.push(buildTableParagraph(COLS_9, verificationRows, 1000000003, 3, floats))
  parts.push(
    buildTextParagraph(`작성일시 :        ${formatReportDate(report.report_date)}`, 0, true, false)
  )

  for (const s of signers) {
    const line = `${s.label}   소속 : ${s.affiliation || ''}   직위 : ${s.position || ''}   성명 : ${s.name || ''}      (인)`
    parts.push(buildTextParagraph(line, 0, false, false))
  }

  const notes = [
    '(기입요령)',
    ' ① 시험검사종류는 기성 또는 정산물량에 대하여 실시한 시험종목 전부를 기입한다.',
    ' ② 확인시험의 구분은 제16조의 구분에 따라 기입한다.',
    ' ③ 작성자 : 건설업자    ④ 검토자 : 품질시험업무담당자    ⑤ 확인자 : 감독소장',
  ]
  for (const note of notes) {
    parts.push(buildTextParagraph(note, 8, false, false))
  }

  const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SEC_XMLNS}>${parts.join('')}</hs:sec>`

  const imageItems = collector.images
    .map(
      (img) =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    )
    .join('')
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

/** 품질검사 성과 총괄표를 한글문서(hwpx)로 다운로드 */
export async function downloadQualitySummaryHwpx(
  report: QualitySummaryFormData,
  projectName: string,
  filename?: string
): Promise<void> {
  const blob = await buildQualitySummaryHwpxBlob(report, projectName)
  const dateStr = report.report_date || new Date().toISOString().split('T')[0]
  const defaultFilename = `품질검사성과총괄표_${dateStr}.hwpx`
  triggerDownload(blob, filename || defaultFilename)
}
