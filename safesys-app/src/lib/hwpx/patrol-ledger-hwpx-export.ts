// 순회점검 한글 양식의 셀 본문과 사진·서명을 채워 HWPX로 내려받는다.
import JSZip from 'jszip'
import { topLevelRanges, rebuild } from './accident-report-xml'
import { PATROL_LEDGER_ITEM_COUNT, type PatrolLedgerInspection } from '@/lib/patrol-ledger/types'

export const PATROL_LEDGER_TEMPLATE_PATH = '/순회점검 양식.hwpx'
export interface PatrolLedgerHwpxOptions { projectName: string; templateUrl?: string }
const MIMETYPE = 'application/hwp+zip'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('점검 이미지를 읽지 못했습니다.')) }
    image.src = url
  })
}

interface Picture { id: string; data: Uint8Array; ext: 'png' | 'jpg'; width: number; height: number }
async function collectImage(url: string, id: string, raw: boolean): Promise<Picture> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('점검 사진 또는 서명 이미지를 가져오지 못했습니다.')
  let blob = await response.blob()
  const image = await loadImage(blob)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) throw new Error('점검 이미지의 크기를 읽지 못했습니다.')
  if (!raw) {
    const scale = Math.min(1, 1200 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('점검 사진을 변환하지 못했습니다.')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => {
      if (result) resolve(result)
      else reject(new Error('점검 사진을 JPEG로 변환하지 못했습니다.'))
    }, 'image/jpeg', 0.85))
  }
  return { id, data: new Uint8Array(await blob.arrayBuffer()), ext: raw ? 'png' : 'jpg', width, height }
}

function fit(picture: Picture, width: number, height: number): { w: number; h: number } {
  const scale = Math.min(width / picture.width, height / picture.height)
  return { w: Math.max(1, Math.round(picture.width * scale)), h: Math.max(1, Math.round(picture.height * scale)) }
}

// TBM 정본의 완전한 그림 XML을 복사한다. 번호는 이미지 ID에서 얻어 동시 다운로드끼리 공유하지 않는다.
function buildPicXml(binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
    const _picSeq = Number(binItemId.replace('image', ''))
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


const CHAR_PR_LANGS = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'] as const
function langAttrs(tag: 'ratio' | 'spacing', value: number): string {
  return `<hh:${tag} ${CHAR_PR_LANGS.map(lang => `${lang}="${value}"`).join(' ')}/>`
}

// 한글·CJK는 글자 크기만큼, 공백은 그 1/3, 나머지(영문·숫자·기호)는 절반 남짓 차지한다고 본다.
const WIDE_CHAR = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/
function estimateTextWidth(line: string, height: number): number {
  let width = 0
  for (const char of line) width += (WIDE_CHAR.test(char) ? 1 : char === ' ' ? 0.33 : 0.55) * height
  return width
}

interface CharPrFit { ratio: number; spacing: number }

/**
 * 양식의 빈 칸이 파랑·빨강·회색 글자 스타일을 물려주므로, 채워 넣는 글자는 같은 스타일의 검정 복제본을 쓴다.
 * "(서명)" 칸은 채우지 않으므로 원본 회색이 그대로 남는다. 복제본은 header.xml charProperties 끝에 덧붙인다.
 * 장평·자간을 줄여야 하는 칸은 색이 이미 검정이라도 그 값만 바꾼 복제본을 따로 만든다.
 */
class BlackCharPrMap {
  private readonly clones = new Map<string, string>()
  private nextId: number
  constructor(private header: string) {
    const count = /<hh:charProperties itemCnt="(\d+)"/.exec(header)?.[1]
    if (!count) throw new Error('순회점검 한글 양식의 글자 스타일 목록을 찾지 못했습니다.')
    this.nextId = Number(count)
  }
  private find(id: string): string | null {
    return new RegExp(`<hh:charPr id="${id}"[^>]*>[\\s\\S]*?</hh:charPr>`).exec(this.header)?.[0] ?? null
  }
  height(id: string): number {
    return Number(/height="(\d+)"/.exec(this.find(id) ?? '')?.[1] ?? 0)
  }
  resolve(id: string, fit?: CharPrFit): string {
    const key = `${id}:${fit?.ratio ?? 100}:${fit?.spacing ?? 0}`
    const cached = this.clones.get(key)
    if (cached) return cached
    const source = this.find(id)
    if (!source) return id
    if (!fit && /textColor="#000000"/i.test(source)) return id
    const cloneId = String(this.nextId++)
    let clone = source.replace(`id="${id}"`, `id="${cloneId}"`).replace(/textColor="#[0-9A-Fa-f]{6}"/, 'textColor="#000000"')
    if (fit) {
      clone = clone.replace(/<hh:ratio [^>]*\/>/, langAttrs('ratio', fit.ratio))
        .replace(/<hh:spacing [^>]*\/>/, langAttrs('spacing', fit.spacing))
    }
    this.header = this.header.replace('</hh:charProperties>', `${clone}</hh:charProperties>`)
      .replace(/<hh:charProperties itemCnt="\d+"/, `<hh:charProperties itemCnt="${this.nextId}"`)
    this.clones.set(key, cloneId)
    return cloneId
  }
  get xml(): string { return this.header }
}

interface FillCellOptions { picture?: string; fitWidth?: number; paraPr?: string }

// 글줄 폭을 넘는 문장은 자간 -5와 장평 축소로 한 줄에 눌러 담는다. 장평은 한글 허용 범위 50% 아래로 내리지 않는다.
// 한글 2022 실측(2026-09-22)에서 장평이 낮을수록 실제 폭이 추정보다 넓어 여유를 5% 두고, 자간 효과는 장평 계산에 넣지 않는다.
// 50%로도 모자라면 자간을 -15까지 내린다(84자 표본).
function fitCharPr(text: string, fitWidth: number, height: number): CharPrFit | undefined {
  let widest = 0
  for (const line of text.split('\n')) widest = Math.max(widest, estimateTextWidth(line, height))
  if (!widest || widest <= fitWidth) return undefined
  const raw = Math.floor(fitWidth * 0.95 / widest * 100)
  return { ratio: Math.max(50, raw), spacing: raw < 50 ? -15 : -5 }
}

function fillCell(cell: string, text: string, charPrs: BlackCharPrMap, options: FillCellOptions = {}): string {
  const sub = topLevelRanges(cell, 'hp:subList')[0]
  if (!sub) throw new Error('순회점검 양식의 셀 본문을 찾지 못했습니다.')
  const source = cell.slice(...sub)
  let paragraph = /<hp:p\s[^>]*>/.exec(source)?.[0]
  const sourceCharPr = /<hp:run\s[^>]*charPrIDRef="([^"]+)"/.exec(source)?.[1]
  if (!paragraph || !sourceCharPr) throw new Error('순회점검 양식의 문단 서식을 찾지 못했습니다.')
  if (options.paraPr) paragraph = paragraph.replace(/paraPrIDRef="[^"]*"/, `paraPrIDRef="${options.paraPr}"`)
  const normalized = text.replace(/\r\n?/g, '\n')
  const fitted = options.fitWidth ? fitCharPr(normalized, options.fitWidth, charPrs.height(sourceCharPr)) : undefined
  const charPr = charPrs.resolve(sourceCharPr, fitted)
  const picture = options.picture ?? ''
  const content = normalized.split('\n').map((line, index) =>
    `${paragraph}<hp:run charPrIDRef="${charPr}">${index === 0 ? picture : ''}<hp:t>${esc(line)}</hp:t></hp:run></hp:p>`).join('')
  const openEnd = source.indexOf('>') + 1
  return rebuild(cell, [sub], [source.slice(0, openEnd) + content + '</hp:subList>'])
}

interface FillTableOptions { photo?: Picture | null; cellOptions?: (key: string) => FillCellOptions }

function fillTable(table: string, values: Map<string, string>, charPrs: BlackCharPrMap, options: FillTableOptions = {}): string {
  const ranges = topLevelRanges(table, 'hp:tc')
  const photo = options.photo ?? null
  return rebuild(table, ranges, ranges.map(range => {
    const cell = table.slice(...range)
    const address = /<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/.exec(cell)
    if (!address) throw new Error('순회점검 양식의 셀 주소를 찾지 못했습니다.')
    const key = `${address[2]},${address[1]}`
    if (photo && key === '16,1') {
      // 사진 행은 항목 13행을 넣으며 18750에서 15870으로 줄었다. 셀보다 큰 사진은 행을 키워 2쪽으로 밀린다.
      const size = fit(photo, 26198 - 1020, 15870 - 282)
      return fillCell(cell, '', charPrs, { picture: buildInlinePicXml(photo.id, size.w, size.h) })
    }
    return values.has(key) ? fillCell(cell, values.get(key)!, charPrs, options.cellOptions?.(key) ?? {}) : cell
  }))
}

export async function buildPatrolLedgerHwpxBlob(record: PatrolLedgerInspection, options: PatrolLedgerHwpxOptions): Promise<Blob> {
  const response = await fetch(options.templateUrl ?? PATROL_LEDGER_TEMPLATE_PATH)
  if (!response.ok) throw new Error('순회점검 한글 양식을 가져오지 못했습니다.')
  const template = await JSZip.loadAsync(await response.arrayBuffer())
  const sectionFile = template.file('Contents/section0.xml')
  const manifestFile = template.file('Contents/content.hpf')
  const headerFile = template.file('Contents/header.xml')
  if (!sectionFile || !manifestFile || !headerFile) throw new Error('순회점검 한글 양식의 필수 파일이 없습니다.')
  const charPrs = new BlackCharPrMap(await headerFile.async('string'))
  let section = await sectionFile.async('string')
  let manifest = await manifestFile.async('string')
  let imageNo = Math.max(0, ...Array.from(manifest.matchAll(/id="image(\d+)"/g), match => Number(match[1])))
  const photo = record.finding_photo_url ? await collectImage(record.finding_photo_url, `image${++imageNo}`, false) : null
  const signature = record.signature ? await collectImage(record.signature, `image${++imageNo}`, true) : null
  const values = new Map<string, string>([['16,3', record.finding_text]])
  if (record.contractor_name) values.set('0,0', `작업장 순회 점검표(${record.contractor_name})`)
  const items = [...record.items].sort((a, b) => a.no - b.no)
  for (let index = 0; index < PATROL_LEDGER_ITEM_COUNT; index++) {
    const item = items[index]
    // 출력물에서는 "작업장 공통"을 "작업장"으로 줄여 적는다. DB 카테고리 값은 그대로 둔다.
    values.set(`${index + 3},1`, item ? ` (${item.category === '작업장 공통' ? '작업장' : item.category}) ${item.text}` : '')
    values.set(`${index + 3},4`, item?.result ?? '')
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(record.inspection_date)
  if (!date) throw new Error('순회점검 일자 형식이 올바르지 않습니다.')
  const details = new Map<string, string>([
    ['0,1', `${date[1]}년 ${Number(date[2])}월 ${Number(date[3])}일`], ['1,1', record.district_name],
    ['2,2', record.inspector_affiliation], ['2,4', record.inspector_position], ['2,6', record.inspector_name],
  ])
  const tables = topLevelRanges(section, 'hp:tbl')
  if (tables.length !== 2) throw new Error('순회점검 한글 양식의 표 구성이 다릅니다.')
  // 점검사항 칸(3~15행 1열)은 셀 폭 38236에서 좌우 여백 510을 뺀 37216 HWPUNIT 안에 한 줄로 담는다.
  const itemKeys = new Set(Array.from({ length: PATROL_LEDGER_ITEM_COUNT }, (_, index) => `${index + 3},1`))
  section = rebuild(section, tables, [
    fillTable(section.slice(...tables[0]), values, charPrs, { photo, cellOptions: key => (itemKeys.has(key) ? { fitWidth: 37216 } : {}) }),
    // 성명 칸은 오른쪽 정렬(24) 대신 줄간격이 같은 가운데 정렬(22) 문단을 쓴다.
    fillTable(section.slice(...tables[1]), details, charPrs, { cellOptions: key => (key === '2,6' ? { paraPr: '22' } : {}) }),
  ])
  if (signature) {
    const size = fit(signature, 6441 - 1020, 3589 - 282)
    // PAPER 좌표 = 여백 + 앞 열/행 합계. 한글 2022 PDF 실측에서 (서명) 중심은 (521.67, 742.81)pt.
    // 최초 계산 그림 중심 (520.04, 733.48)pt와의 차이를 +163/+934 HWPUNIT로 보정했다.
    // 표2 문단은 떠 있는 그림 추가 시 줄이 갈라져 2쪽으로 밀리므로 첫 표 run에 앵커한다(코디네이터 승인).
    const x = 4251 + 44559 + 163 + Math.round((6441 - size.w) / 2)
    const y = 4251 + 2834 + 56291 + 800 + 282 + 3589 * 2 + 934 + Math.round((3589 - size.h) / 2)
    const tableStart = topLevelRanges(section, 'hp:tbl')[0][0]
    section = section.slice(0, tableStart) + buildFloatingPicXml(signature.id, size.w, size.h, x, y) + section.slice(tableStart)
  }

  const output = new JSZip()
  output.file('mimetype', MIMETYPE, { compression: 'STORE' })
  for (const entry of Object.values(template.files)) {
    if (entry.name !== 'mimetype' && !entry.dir) output.file(entry.name, await entry.async('uint8array'))
  }
  for (const picture of [photo, signature]) {
    if (!picture) continue
    const filename = `BinData/${picture.id}.${picture.ext}`
    output.file(filename, picture.data)
    manifest = manifest.replace('</opf:manifest>', `<opf:item id="${picture.id}" href="${filename}" media-type="image/${picture.ext === 'png' ? 'png' : 'jpeg'}" isEmbeded="1"/></opf:manifest>`)
  }
  output.file('Contents/section0.xml', section)
  output.file('Contents/header.xml', charPrs.xml)
  output.file('Contents/content.hpf', manifest)
  return output.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: MIMETYPE })
}

export async function downloadPatrolLedgerHwpx(record: PatrolLedgerInspection, options: PatrolLedgerHwpxOptions): Promise<void> {
  const blob = await buildPatrolLedgerHwpxBlob(record, options)
  const filename = `${options.projectName}_순회점검_${record.inspection_date}.hwpx`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}




