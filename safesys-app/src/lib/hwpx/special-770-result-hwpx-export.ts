// 특별점검(굴삭기 버킷 사고) 1건을 붙임3 「지사 및 사업단 특별점검 결과」 한글 양식(HWPX)으로 채워 내려받는 모듈
import JSZip from 'jszip'
import { topLevelRanges, rebuild, stripLineseg } from './accident-report-xml'
import {
  PlainCharPrMap,
  appendCenteredParaPr,
  buildInlinePicXml,
  budgetInMillion,
  compactRowHeights,
  districtName,
  esc,
  setRowHeight,
  fillTable,
  fitPicture,
  formatDotDate,
  formatNarrowDate,
  splitAddress,
  tableShape,
  type CellFill,
  type Special770Picture,
} from './special-770-result-hwpx-parts'
import { fillChecklistBody, prepareChecklistBlocks, prependChecklists } from './special-770-checklist-hwpx'
import type { Special770InspectionData } from '@/lib/special-inspection-770/types'
import { inspectionFindings, type Special770Finding } from '@/lib/special-inspection-770/summary'
import { SPECIAL_770_TYPE } from '@/lib/safety-inspection-types'
import { prepareSpecial770Actions } from '@/lib/special-inspection-770/ai-actions'
import { requestSpecial770Actions } from '@/lib/special-inspection-770/ai-actions-client'

export { districtName }

export const SPECIAL_770_RESULT_TEMPLATE_PATH = '/특별점검(굴삭기) 결과 양식.hwpx'
/** 붙임2 점검표 양식(굴착기 1대당 1쪽으로 결과 문서 앞에 붙는다) */
export const SPECIAL_770_CHECKLIST_TEMPLATE_PATH = '/특별점검(굴삭기 버킷 사고) 점검표.hwpx'
const MIMETYPE = 'application/hwp+zip'
// 결과표 아래 여백을 줄이되 여러 지적 문단도 제목·현황표와 한 쪽에 들어가도록 한글 PDF로 확인한 높이.
const RESULT_ROW_HEIGHT = 2500
// 사진대지 제목(한 줄 2520)을 첫 사진표와 같은 쪽에 두고, 설명이 두세 줄로 늘어날 여유까지 남기려고
// 사진 칸 높이를 양식(조치 전 27698, 조치 후 27425)보다 2500씩 줄인다. 모든 사진표에 같게 적용한다.
const PHOTO_BEFORE_HEIGHT = 27698 - 2500
const PHOTO_AFTER_HEIGHT = 27425 - 2500

export interface Special770ResultInput {
  inspectionId?: string
  /** YYYY-MM-DD */
  inspectionDate: string
  data: Special770InspectionData
  /** projects 행 전체 */
  project: Record<string, any>
}

export interface Special770FetchedImage {
  data: Uint8Array
  ext: 'jpg' | 'png'
  /** 원본 픽셀 크기. 모르면 4:3으로 칸에 맞춘다. */
  width?: number
  height?: number
}

export interface Special770ResultOptions {
  /** 사진 URL을 바이트로 가져온다. 테스트에서 주입한다. null이면 사진 누락 오류로 중단한다. */
  fetchImage?: (url: string) => Promise<Special770FetchedImage | null>
}

// ── 사진 가져오기(브라우저 기본 구현) ──

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    image.src = url
  })
}

// 흰 배경 JPEG(긴 변 1200px)로 정규화하고 원본 비율을 돌려준다. 측정할 수 없는 환경이면 원본 바이트 그대로.
async function defaultFetchImage(url: string): Promise<Special770FetchedImage | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    if (typeof document !== 'undefined') {
      try {
        const image = await loadImage(blob)
        const width = image.naturalWidth || 1
        const height = image.naturalHeight || 1
        const scale = Math.min(1, 1200 / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
          if (jpeg) return { data: new Uint8Array(await jpeg.arrayBuffer()), ext: 'jpg', width, height }
        }
      } catch { /* 정규화 실패 시 원본 바이트 사용 */ }
    }
    const ext = (blob.type || '').toLowerCase().includes('png') ? 'png' : 'jpg'
    return { data: new Uint8Array(await blob.arrayBuffer()), ext }
  } catch {
    return null
  }
}

class PictureCollector {
  readonly pictures: Special770Picture[] = []
  constructor(private next: number, private readonly fetchImage: (url: string) => Promise<Special770FetchedImage | null>) {}

  async collect(url: string | null | undefined): Promise<Special770Picture | null> {
    if (!url || !url.trim() || url.trim() === 'N/A') return null
    const image = await this.fetchImage(url)
    if (!image) throw new Error('등록된 사진을 불러오지 못했습니다. 점검 내용을 수정하여 사진을 다시 첨부하고 저장한 뒤 다운로드해 주세요.')
    const picture: Special770Picture = { id: `image${++this.next}`, ...image }
    this.pictures.push(picture)
    return picture
  }
}

// ── 문구 ──

/** 점검결과 표 대분류 → 지적·조치 행 번호(양식 고정 3·3·3·2칸) */
const CATEGORY_ROWS: Record<1 | 2 | 3 | 4, number[]> = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11] }

function findingText(finding: Special770Finding): string {
  const text = finding.result.finding?.trim() || finding.itemText
  const vehicle = finding.vehicleNo?.trim()
  return vehicle ? `[${vehicle}] ${text}` : text
}

function actionText(finding: Special770Finding): string {
  if (!finding.result.finding?.trim()) return ''
  const action = finding.result.action?.trim() ?? ''
  const due = finding.result.action_due_date
  if (finding.completed || !due) return action
  return action ? `${action} (${formatDotDate(due)} 예정)` : `조치예정(${formatDotDate(due)})`
}

/** 사진대지 조치 후 설명. 조치 후 사진이 있으면 조치 내용, 없으면 조치완료 예정일 */
function afterDescription(finding: Special770Finding): string {
  if (finding.completed) return ` (조치 후) ${finding.result.action?.trim() || '조치 완료'}`
  const due = finding.result.action_due_date
  return due ? ` (조치 후) 조치완료 예정일 ${formatDotDate(due)}` : ' (조치 후) 미조치'
}

function supervisorOf(project: Record<string, any>): string {
  return [project.supervisor_position, project.supervisor_name].filter(v => typeof v === 'string' && v.trim()).join(' ')
}

// ── 표 채우기 ──

function infoTableValues(input: Special770ResultInput): Map<string, CellFill> {
  const { project, data } = input
  const { province, city } = splitAddress(project.site_address || project.actual_work_address)
  const row: string[][] = [
    [districtName(project.project_name)],
    [province],
    [city],
    [budgetInMillion(project)],
    formatNarrowDate(project.construction_start_date),
    formatNarrowDate(project.construction_end_date),
    [data.inspected_work ?? ''],
    [project.g2b_corp_nm ?? ''],
  ]
  return new Map(row.map((lines, col) => [`2,${col}`, { lines: lines.map(String) }]))
}

function resultTableValues(findings: Special770Finding[]): Map<string, CellFill> {
  const values = new Map<string, CellFill>()
  for (const [key, rows] of Object.entries(CATEGORY_ROWS)) {
    const inCategory = findings.filter(f => f.category === Number(key))
    rows.forEach((row, index) => {
      // 칸보다 지적이 많으면 행을 늘리지 않고 마지막 칸에 문단으로 이어 쓴다.
      const slot = index === rows.length - 1 ? inCategory.slice(index) : inCategory.slice(index, index + 1)
      values.set(`${row},1`, { lines: slot.map(f => `- ${findingText(f)}`) })
      values.set(`${row},2`, { lines: slot.map(actionText).filter(Boolean).map(text => `- ${text}`) })
    })
  }
  return values
}

interface PhotoSheet {
  beforeText: string
  afterText: string
  before: Special770Picture | null
  after: Special770Picture | null
}

// 사진 칸 크기는 PHOTO_*_HEIGHT로 줄인 값이다. 셀 여백과 오차를 감안해 가로·세로 1000씩 뺀 상자에 비율을 유지해 맞춘다.
function photoCell(picture: Special770Picture | null, cellW: number, cellH: number): CellFill {
  if (!picture) return { lines: [''] }
  const size = fitPicture(picture, cellW - 1000, cellH - 1000)
  return { lines: [''], picture: buildInlinePicXml(picture.id, size.w, size.h) }
}

function photoTableValues(sheet: PhotoSheet, input: Special770ResultInput): Map<string, CellFill> {
  const district = { lines: [districtName(input.project.project_name)] }
  const supervisor = { lines: [supervisorOf(input.project)] }
  const date = { lines: [formatDotDate(input.inspectionDate)] }
  return new Map<string, CellFill>([
    ['0,1', district], ['0,5', supervisor], ['1,1', date], ['1,4', { lines: [sheet.beforeText] }],
    ['2,0', photoCell(sheet.before, 47900, PHOTO_BEFORE_HEIGHT)],
    ['4,1', district], ['4,6', supervisor], ['5,1', date], ['5,4', { lines: [sheet.afterText] }],
    ['6,0', photoCell(sheet.after, 47900, PHOTO_AFTER_HEIGHT)],
  ])
}

function replaceOnce(xml: string, pattern: RegExp, next: string, label: string): string {
  if (!pattern.test(xml)) throw new Error(`특별점검 결과 양식에서 ${label} 문구를 찾지 못했습니다.`)
  return xml.replace(pattern, next)
}

// ── 조립 ──

/**
 * 붙임2 점검표(굴착기마다 1쪽) + 붙임3 점검 결과를 한글 문서 하나로 만든다.
 * 붙임3 패키지를 기준으로 붙임2 header 스타일을 덧붙이고, 붙임2 본문을 문서 앞에 넣는다. 쪽 설정은 붙임3 것을 쓴다.
 */
export async function buildSpecial770ResultHwpx(
  input: Special770ResultInput,
  templateBytes: ArrayBuffer | Uint8Array,
  checklistTemplateBytes: ArrayBuffer | Uint8Array,
  options: Special770ResultOptions = {},
): Promise<Uint8Array> {
  const template = await JSZip.loadAsync(templateBytes)
  const checklist = await JSZip.loadAsync(checklistTemplateBytes)
  const checklistHeader = await checklist.file('Contents/header.xml')?.async('string')
  const checklistSection = await checklist.file('Contents/section0.xml')?.async('string')
  if (!checklistHeader || !checklistSection) throw new Error('특별점검 점검표 양식의 필수 파일이 없습니다.')
  const sectionFile = template.file('Contents/section0.xml')
  const manifestFile = template.file('Contents/content.hpf')
  const headerFile = template.file('Contents/header.xml')
  if (!sectionFile || !manifestFile || !headerFile) throw new Error('특별점검 결과 양식의 필수 파일이 없습니다.')
  let section = await sectionFile.async('string')
  let manifest = await manifestFile.async('string')
  // 사진대지 제목은 제목답게 가운데 정렬한다. 양식 문단 스타일(양쪽 정렬)의 가운데 정렬 복제본을 만들어 쓴다.
  const titleParaPrId = section.match(/<hp:p\s[^>]*?paraPrIDRef="(\d+)"[^>]*>(?:(?!<\/hp:p>)[\s\S])*?사진대지&gt;<\/hp:t>/)?.[1]
  if (!titleParaPrId) throw new Error('특별점검 결과 양식의 사진대지 제목을 찾지 못했습니다.')
  const centeredTitle = appendCenteredParaPr(await headerFile.async('string'), titleParaPrId)
  const excavators = input.data.excavators ?? []
  // 붙임2 스타일을 붙임3 header 끝에 덧붙인다(붙임3 기존 id는 그대로). 그 뒤 검정 글자 복제도 같은 header에 쌓는다.
  const checklistBlocks = prepareChecklistBlocks(centeredTitle.header, checklistHeader, checklistSection, excavators.length)
  const charPrs = new PlainCharPrMap(checklistBlocks.header)

  const findings = inspectionFindings(input.data)
  // 제목·미리보기에는 사업명 전체 대신 지구명만 쓴다(긴 사업명이 두 줄로 늘어 점검결과 표를 2쪽으로 밀어낸다).
  const district = districtName(input.project.project_name)
  const excavatorCount = input.data.excavators?.length ?? 0

  // 사진 수집(지적 1건 = 조치 전·후 1쌍, 지적이 없으면 현장점검사진 최대 2장)
  const firstImageNo = Math.max(0, ...Array.from(manifest.matchAll(/id="image(\d+)"/g), m => Number(m[1])))
  const collector = new PictureCollector(firstImageNo, options.fetchImage ?? defaultFetchImage)
  const sheets: PhotoSheet[] = []
  if (findings.length) {
    for (const finding of findings) {
      sheets.push({
        beforeText: ` (조치 전) ${findingText(finding)}`,
        afterText: afterDescription(finding),
        before: await collector.collect(finding.result.before_photo_url),
        after: await collector.collect(finding.result.after_photo_url),
      })
    }
  } else {
    const sitePhotos = input.data.site_photo_urls ?? []
    sheets.push({
      beforeText: ' 현장점검 사진',
      afterText: ' 현장점검 사진',
      before: await collector.collect(sitePhotos[0]),
      after: await collector.collect(sitePhotos[1]),
    })
  }

  // 표 4개를 id 대신 행×열 구조로 찾는다(양식마다 표 id가 다르다).
  const tables = topLevelRanges(section, 'hp:tbl')
  const shapes = tables.map(range => tableShape(section.slice(...range)))
  const expected = ['1x4', '3x8', '12x3', '7x7']
  if (expected.some((shape, index) => shapes[index] !== shape)) {
    throw new Error(`특별점검 결과 양식의 표 구성이 다릅니다(${shapes.join(', ')}).`)
  }
  const bandTable = section.slice(...tables[0])
    .replace(/결과\(양식\)\s*/, '결과')
    .replace(/<hp:t>\*\s*지사→지역본부<\/hp:t>/, '<hp:t></hp:t>')
  section = rebuild(section, tables.slice(0, 3), [
    bandTable,
    fillTable(section.slice(...tables[1]), infoTableValues(input), charPrs),
    // 결과표 행을 넓히면서 여러 줄 지적이 들어갈 여유를 두고, 제목·현황표와 같은 쪽에 배치한다.
    compactRowHeights(fillTable(section.slice(...tables[2]), resultTableValues(findings), charPrs), RESULT_ROW_HEIGHT),
  ])

  // 사진대지 제목은 1쪽 끝에 남지 않게 새 쪽 첫 줄에서 시작하고(첫 사진표와 같은 쪽), 가운데 정렬 문단 스타일을 쓴다.
  section = replaceOnce(
    section,
    /(<hp:p\s[^>]*?)paraPrIDRef="\d+"([^>]*?)pageBreak="0"([^>]*>(?:(?!<\/hp:p>)[\s\S])*?사진대지&gt;<\/hp:t>)/,
    `$1paraPrIDRef="${centeredTitle.id}"$2pageBreak="1"$3`,
    '사진대지 제목',
  )

  // 사진대지: 사진표를 담은 최상위 문단을 장수만큼 복제한다. 복제본 표 id는 고유하게 바꾼다.
  const paragraphs = topLevelRanges(section, 'hp:p')
  const photoParagraph = paragraphs.find(range => {
    const para = section.slice(...range)
    return para.includes('<hp:tbl') && topLevelRanges(para, 'hp:tbl').some(t => tableShape(para.slice(...t)) === '7x7')
  })
  if (!photoParagraph) throw new Error('특별점검 결과 양식의 사진대지 표를 찾지 못했습니다.')
  const photoRaw = section.slice(...photoParagraph)
  const photoTableRange = topLevelRanges(photoRaw, 'hp:tbl')[0]
  const photoSource = rebuild(photoRaw, [photoTableRange], [
    setRowHeight(setRowHeight(photoRaw.slice(...photoTableRange), 2, PHOTO_BEFORE_HEIGHT), 6, PHOTO_AFTER_HEIGHT),
  ])
  const copies = sheets.map((sheet, index) => {
    const para = index === 0 ? photoSource : photoSource.replace(/(<hp:tbl\s[^>]*?\bid=")\d+"/, `$1${2116800000 + index}"`)
    const tbl = topLevelRanges(para, 'hp:tbl')[0]
    return rebuild(para, [tbl], [fillTable(para.slice(...tbl), photoTableValues(sheet, input), charPrs)])
  })
  section = rebuild(section, [photoParagraph], [copies.join('')])

  // 표 밖 본문 문단(제목·점검일시·점검반·굴착기 대수). 예시값이 남지 않도록 문구 전체를 바꾼다.
  section = replaceOnce(section, /<hp:t>건설현장 점검카드\(사업명\)<\/hp:t>/, `<hp:t>건설현장 점검카드(${esc(district)})</hp:t>`, '제목')
  section = replaceOnce(section, /<hp:t> ○ 점검일시 :[^<]*<\/hp:t>/, `<hp:t> ○ 점검일시 : ${esc(formatDotDate(input.inspectionDate))}</hp:t>`, '점검일시')
  section = replaceOnce(section, /<hp:t> ○ 점 검 반 :[^<]*<\/hp:t>/, `<hp:t> ○ 점 검 반 : ${esc(input.data.inspection_team ?? '')}</hp:t>`, '점검반')
  section = replaceOnce(section, /<hp:t>2\. 점검결과\(굴착기 사용 대수:[^<]*\)<\/hp:t>/, `<hp:t>2. 점검결과(굴착기 사용 대수: ${excavatorCount}대)</hp:t>`, '굴착기 대수')
  // 붙임2 점검표(굴착기마다 1쪽)를 문서 앞에 넣고 붙임3은 새 쪽에서 시작한다. 현장명은 사업명 전체를 쓴다.
  const checklistBodies = checklistBlocks.bodies.map((body, index) =>
    fillChecklistBody(body, excavators[index], String(input.project.project_name ?? ''), charPrs, index))
  section = prependChecklists(section, checklistBodies)
  // 글자를 바꾼 문단의 줄 배치 정보는 낡으므로 지워 한글이 다시 계산하게 한다.
  section = stripLineseg(section)

  const output = new JSZip()
  output.file('mimetype', MIMETYPE, { compression: 'STORE' })
  // Scripts/headerScripts.js 등 manifest·spine에 등록된 부속 파일까지 그대로 옮긴다.
  for (const entry of Object.values(template.files)) {
    if (entry.name !== 'mimetype' && !entry.dir) output.file(entry.name, await entry.async('uint8array'))
  }
  for (const picture of collector.pictures) {
    const href = `BinData/${picture.id}.${picture.ext}`
    output.file(href, picture.data)
    manifest = manifest.replace('</opf:manifest>', `<opf:item id="${picture.id}" href="${href}" media-type="image/${picture.ext === 'png' ? 'png' : 'jpeg'}" isEmbeded="1"/></opf:manifest>`)
  }
  output.file('Contents/section0.xml', section)
  output.file('Contents/header.xml', charPrs.xml)
  output.file('Contents/content.hpf', manifest)
  // 미리보기 문구에 양식 예시값(예시 실명)이 남지 않도록 실제 값으로 다시 쓴다.
  output.file('Preview/PrvText.txt', [
    `건설현장 점검카드(${district})`,
    ` ○ 점검일시 : ${formatDotDate(input.inspectionDate)}`,
    ` ○ 점 검 반 : ${input.data.inspection_team ?? ''}`,
    `2. 점검결과(굴착기 사용 대수: ${excavatorCount}대)`,
  ].join('\r\n'))
  return output.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: MIMETYPE })
}

// ── 다운로드 ──

function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
}

function resultFileName(input: Special770ResultInput): string {
  return safeFileName(`${SPECIAL_770_TYPE}_결과_${input.project.project_name ?? '현장'}_${input.inspectionDate}.hwpx`)
}

/** 일괄 zip 안의 파일명. 지사명_점검일자_지구명.hwpx (지구명은 문서 제목과 같은 규칙) */
export function special770BulkResultFileName(input: Special770ResultInput): string {
  const branch = input.project.managing_branch || '지사'
  const district = districtName(input.project.project_name) || '현장'
  return safeFileName(`${branch}_${input.inspectionDate}_${district}.hwpx`)
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

async function fetchBytes(path: string, label: string): Promise<ArrayBuffer> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`특별점검 ${label} 양식을 가져오지 못했습니다(${response.status}).`)
  return response.arrayBuffer()
}

async function fetchTemplates(): Promise<[ArrayBuffer, ArrayBuffer]> {
  return Promise.all([fetchBytes(SPECIAL_770_RESULT_TEMPLATE_PATH, '결과'), fetchBytes(SPECIAL_770_CHECKLIST_TEMPLATE_PATH, '점검표')])
}

function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as BlobPart], { type })
}

export async function downloadSpecial770ResultHwpx(input: Special770ResultInput): Promise<void> {
  const prepared = await prepareSpecial770Actions(input, requestSpecial770Actions)
  const [template, checklist] = await fetchTemplates()
  const bytes = await buildSpecial770ResultHwpx(prepared, template, checklist)
  triggerDownload(toBlob(bytes, MIMETYPE), resultFileName(input))
}

/** 여러 건을 hwpx 파일 여러 개로 만들어 zip 하나로 내려받는다. */
export async function downloadSpecial770ResultHwpxBulk(inputs: Special770ResultInput[], zipName?: string): Promise<void> {
  if (!inputs.length) throw new Error('내려받을 특별점검 결과가 없습니다.')
  const [template, checklist] = await fetchTemplates()
  const zip = new JSZip()
  const used = new Set<string>()
  for (const input of inputs) {
    const base = special770BulkResultFileName(input)
    let name = base
    for (let n = 2; used.has(name); n++) name = base.replace(/\.hwpx$/, `_${n}.hwpx`)
    used.add(name)
    const prepared = await prepareSpecial770Actions(input, requestSpecial770Actions)
    zip.file(name, await buildSpecial770ResultHwpx(prepared, template, checklist))
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const today = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, safeFileName(zipName || `${SPECIAL_770_TYPE}_결과_${today}.zip`))
}
