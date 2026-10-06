// 패트롤 시정조치 세 원본 양식의 셀을 채우고 점검별 HWPX를 생성한다.
import JSZip from 'jszip'
import type { PatrolInspection } from '@/lib/patrol-inspections'
import { buildPatrolIssueContent, hasPatrolSecondIssue, getPatrolActionState } from '@/lib/patrol-inspection-utils'
import { topLevelRanges, rebuild, stripLineseg } from './accident-report-xml'
import { collectImage, fit, buildInlinePicXml } from './patrol-corrective-photo'

export type PatrolCorrectiveKind = 'request' | 'result' | 'plan'
export interface PatrolCorrectivePlan { action: string; prevention: string }
export const PATROL_CORRECTIVE_LABELS = { request: '시정조치요구서', result: '조치결과 보고서', plan: '시정조치계획서' } as const
const MIME = 'application/hwp+zip'
const esc = (text: string) => text.replace(/[&<>"\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? ''))

// 13pt 전각 글자 폭(1300)에 여유를 둔다. 본문 셀 유효 폭은 약 40000이다.
function lines(text: string, width = 28): string[] {
  return text.replace(/\r/g, '').split('\n').flatMap(line => {
    const chars = Array.from(line)
    return chars.length ? Array.from({ length: Math.ceil(chars.length / width) }, (_, i) => chars.slice(i * width, (i + 1) * width).join('')) : ['']
  })
}
function pages(text: string, count: number, width = 28): string[] {
  const all = lines(text, width)
  return Array.from({ length: Math.max(1, Math.ceil(all.length / count)) }, (_, i) => all.slice(i * count, (i + 1) * count).join('\n'))
}

interface DocumentStyle { header: string; id: number; bodyId: number; photoId: number; signatureId: number; dateId: number; planHeadingId: number; planItemId: number }

const PLAN_BODY_HEIGHT = 27396
const PLAN_LINE_HEIGHT = 2730 // 참조 13pt·210% 문단의 줄 전진.
const PLAN_HANGING = 2688
const CELL_PADDING = 282

// 한양신명조 13pt의 전각/영문/공백 폭을 구분한다. 자동 줄바꿈은 한글에 맡긴다.
function textWidth(char: string): number {
  if (/\s/.test(char)) return char === '\t' ? 2600 : 650
  return /[\u0021-\u007e]/.test(char) ? 780 : 1300
}

function wrappedLines(text: string, width: number, hanging = 0): string[] {
  const result: string[] = []
  let line = ''
  let used = 0
  for (const char of Array.from(text)) {
    const limit = Math.max(1300, width - (result.length ? hanging : 0))
    if (line && used + textWidth(char) > limit) {
      // 한글은 공백으로 구분된 어절을 우선 이동한다. 글자 수만 세면 좁은 요구사항 셀이 늘어난다.
      const boundary = line.lastIndexOf(' ')
      const split = boundary > 0 ? boundary + 1 : line.length
      result.push(line.slice(0, split))
      line = line.slice(split)
      used = Array.from(line).reduce((sum, value) => sum + textWidth(value), 0)
    }
    line += char
    used += textWidth(char)
  }
  result.push(line)
  return result
}

function planPages(text: string, width: number, height: number, hanging = 0, lineHeight = PLAN_LINE_HEIGHT): string[] {
  const capacity = Math.max(1, Math.floor((height - CELL_PADDING - 1300) / lineHeight) + 1)
  const output: string[] = []
  let paragraphs: string[] = []
  let used = 0
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    const wrapped = wrappedLines(paragraph, width - CELL_PADDING, paragraph.startsWith('□') ? 0 : hanging)
    while (wrapped.length) {
      if (used === capacity) { output.push(paragraphs.join('\n')); paragraphs = []; used = 0 }
      const chunk = wrapped.splice(0, capacity - used)
      paragraphs.push(chunk.join(''))
      used += chunk.length
    }
  }
  if (paragraphs.length) output.push(paragraphs.join('\n'))
  return output
}

function planBodyHeight(row: PatrolInspection): number {
  const height = (text: string, width: number) => wrappedLines(text, width - CELL_PADDING).length * 2080 + CELL_PADDING
  const projectGrowth = Math.max(0, height(row.project_name || '', 40913) - 3096)
  const inspectorGrowth = Math.max(0, height(row.inspector_name || '', 16777) - 2997)
  const author = `작 성 자 : 현장대리인 ${row.owner_name || ''}    󰄫`
  const reviewer = `검 토 자 : 공사감독 ${row.supervisor_position || ''} ${row.supervisor_name || ''}    󰄫`
  const recipient = `한국농어촌공사 ${row.managing_branch || '________지사'}장  귀하`
  const footerGrowth = [author, reviewer, recipient].reduce((sum, text) => sum + Math.max(0, height(text, 47927 - 2000) - 2362), 0)
  return Math.max(PLAN_LINE_HEIGHT + CELL_PADDING, PLAN_BODY_HEIGHT - projectGrowth - inspectorGrowth - footerGrowth)
}

// 13pt·160% 본문, 셀 위아래 여백 282, 그림 기준선 여유 13pt를 제외한다.
function photoHeight(cellHeight: number, text: string): number {
  return Math.max(1, cellHeight - (text ? lines(text).length * 2080 : 0) - 282 - 1300)
}

function fill(cell: string, text: string, style: DocumentStyle, picture = '', body = false, paragraphId?: number, plan = false): string {
  const range = topLevelRanges(cell, 'hp:subList')[0]
  if (!range) throw new Error('양식의 셀 본문을 찾지 못했습니다.')
  const sub = cell.slice(...range)
  const p = /<hp:p\s[^>]*>/.exec(sub)?.[0]
  if (!p) throw new Error('양식의 문단 서식이 없습니다.')
  const textP = paragraphId !== undefined || body ? p.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${paragraphId ?? style.bodyId}"`) : p
  const content = (picture && !text ? [] : text.split('\n')).map(line => {
    const open = plan ? p.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${line.startsWith('□') ? style.planHeadingId : style.planItemId}"`) : textP
    return `${open}<hp:run charPrIDRef="${style.id}"><hp:t>${esc(line)}</hp:t></hp:run></hp:p>`
  }).join('')
  const imageP = p.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${style.photoId}"`)
  const image = picture ? `${imageP}<hp:run charPrIDRef="${style.id}">${picture}<hp:t/></hp:run></hp:p>` : ''
  return rebuild(cell, [range], [sub.slice(0, sub.indexOf('>') + 1) + content + image + '</hp:subList>'])
}

function fillTable(table: string, values: Record<string, string>, style: DocumentStyle, pictures: Record<string, string> = {}, planHeight?: number): string {
  if (planHeight) table = table.replace(/(<hp:sz\b[^>]*height=")\d+/, `$1${56432 - 21453 + planHeight}`)
  const ranges = topLevelRanges(table, 'hp:tc')
  return rebuild(table, ranges, ranges.map(range => {
    let cell = table.slice(...range)
    const addr = /<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/.exec(cell)
    const key = addr ? `${addr[2]},${addr[1]}` : ''
    const height = Number(/height="(\d+)"/.exec(cell.match(/<hp:cellSz[^>]*>/)?.[0] || '')?.[1])
    const isBody = ['2,1', '4,1', '5,1'].includes(key) && height > 5000
    if (planHeight && key.startsWith('5,')) cell = cell.replace(/(<hp:cellSz\b[^>]*height=")\d+/, `$1${planHeight}`)
    const inspector = key === '2,1' && height < 5000
    const paragraphId = inspector ? style.dateId : planHeight && key === '3,1' ? style.bodyId : undefined
    return key in values ? fill(cell, values[key], style, pictures[key], isBody, paragraphId, !!planHeight && key === '5,1') : cell
  }))
}

function textStyle(header: string): DocumentStyle {
  // 한글에 등록된 신명조의 HFT 이름. exact '신명조'는 네이티브에서 적용되지 않는다.
  const fontName = '한양신명조'
  const fallbackFont = Array.from(header.matchAll(/<hh:font\b[^>]*>[\s\S]*?<\/hh:font>/g)).find(font => font[0].includes(`face="${fontName}"`))?.[0]
  const fonts: Record<string, number> = {}
  header = header.replace(/<hh:fontface\b[^>]*>[\s\S]*?<\/hh:fontface>/g, face => {
    const lang = /lang="([^"]+)"/.exec(face)![1].toLowerCase()
    const entries = Array.from(face.matchAll(/<hh:font\b[^>]*>[\s\S]*?<\/hh:font>/g))
    const existing = entries.find(font => font[0].includes(`face="${fontName}"`))
    const id = existing ? Number(/id="(\d+)"/.exec(existing[0])![1]) : Math.max(-1, ...entries.map(font => Number(/id="(\d+)"/.exec(font[0])![1]))) + 1
    fonts[lang] = id
    if (existing) return face
    const base = fallbackFont
    if (!base) throw new Error('양식의 언어별 글꼴을 찾지 못했습니다.')
    const font = base.replace(/id="\d+"/, `id="${id}"`)
    return face.replace('</hh:fontface>', font + '</hh:fontface>').replace(/fontCnt="\d+"/, `fontCnt="${entries.length + 1}"`)
  })
  const styles = Array.from(header.matchAll(/<hh:charPr id="(\d+)"[^>]*>[\s\S]*?<\/hh:charPr>/g))
  if (!styles.length) throw new Error('양식의 글자 서식을 찾지 못했습니다.')
  const id = Math.max(...styles.map(style => Number(style[1]))) + 1
  const clone = styles[0][0].replace(/id="\d+"/, `id="${id}"`).replace(/height="\d+"/, 'height="1300"').replace(/textColor="[^"]*"/, 'textColor="#000000"')
    .replace(/<hh:fontRef[^>]*\/>/, `<hh:fontRef ${Object.entries(fonts).map(([lang, fontId]) => `${lang}="${fontId}"`).join(' ')}/>`)
  header = header.replace('</hh:charProperties>', clone + '</hh:charProperties>').replace(/(<hh:charProperties itemCnt=")(\d+)/, (_, start, n) => start + (Number(n) + 1))
  const paragraphs = Array.from(header.matchAll(/<hh:paraPr id="(\d+)"[^>]*>[\s\S]*?<\/hh:paraPr>/g))
  const bodyId = Math.max(...paragraphs.map(p => Number(p[1]))) + 1
  const paragraph = (id: number, align: string, spacing: number) => paragraphs[0][0]
    .replace(/id="\d+"/, `id="${id}"`).replace(/horizontal="[^"]*"/, `horizontal="${align}"`)
    .replace(/<hh:lineSpacing[^>]*\/>/g, `<hh:lineSpacing type="PERCENT" value="${spacing}" unit="HWPUNIT"/>`)
    .replace(/breakLatinWord="[^"]*"/g, 'breakLatinWord="BREAK_WORD"').replace(/breakNonLatinWord="[^"]*"/g, 'breakNonLatinWord="BREAK_WORD"')
  const signature = paragraph(bodyId + 2, 'RIGHT', 160)
    .replace(/<hc:(intent|left|right)\b[^>]*\/>/g, (_, tag) => `<hc:${tag} value="${tag === 'right' ? 2000 : 0}" unit="HWPUNIT"/>`)
    // 구형 기본 분기의 문단 여백은 HwpUnitChar 분기의 두 배 단위다.
    .replace(/<hp:default>[\s\S]*?<\/hp:default>/g, value => value.replace(/<hc:right value="2000"/g, '<hc:right value="4000"'))
  const date = paragraph(bodyId + 3, 'CENTER', 160)
    .replace(/<hc:(intent|left|right)\b[^>]*\/>/g, (_, tag) => `<hc:${tag} value="0" unit="HWPUNIT"/>`)
  const planParagraph = (id: number, hanging: boolean) => paragraph(id, 'LEFT', 210)
    .replace(/snapToGrid="\d+"/, 'snapToGrid="0"')
    .replace(/<hc:(intent|left|right|prev|next)\b[^>]*\/>/g, (_, tag) => `<hc:${tag} value="${hanging && tag === 'intent' ? -PLAN_HANGING : 0}" unit="HWPUNIT"/>`)
    .replace(/<hp:default>[\s\S]*?<\/hp:default>/g, value => value.replace(/value="-2688"/g, 'value="-5376"'))
  header = header.replace('</hh:paraProperties>', paragraph(bodyId, 'LEFT', 160) + paragraph(bodyId + 1, 'CENTER', 100) + signature + date + planParagraph(bodyId + 4, false) + planParagraph(bodyId + 5, true) + '</hh:paraProperties>')
    .replace(/(<hh:paraProperties itemCnt=")(\d+)/, (_, start, n) => start + (Number(n) + 6))
  return { id, bodyId, photoId: bodyId + 1, signatureId: bodyId + 2, dateId: bodyId + 3, planHeadingId: bodyId + 4, planItemId: bodyId + 5, header }
}

function planDate(section: string, date: string, style: DocumentStyle): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const value = parts ? `${parts[1]}년 ${parts[2]}월 ${parts[3]}일` : ''
  return section.replace(/<hp:p\b[^>]*>(?:(?!<hp:p\b)[\s\S])*?<\/hp:p>/g, paragraph => {
    const text = Array.from(paragraph.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g), m => m[1]).join('')
    if (!/^\s*년\s*월\s*일\s*$/.test(text)) return paragraph
    const open = /<hp:p\b[^>]*>/.exec(paragraph)![0]
    return `${open}<hp:run charPrIDRef="${style.id}"><hp:t>${esc(value)}</hp:t></hp:run></hp:p>`
  })
}

function identities(section: string, row: PatrolInspection, style: DocumentStyle): string {
  const author = `작 성 자 : 현장대리인 ${row.owner_name?.trim() || ''}`
  const reviewer = `검 토 자 : 공사감독 ${[row.supervisor_position?.trim(), row.supervisor_name?.trim()].filter(Boolean).join(' ')}`
  const paragraph = (open: string, text: string) => `${open}<hp:run charPrIDRef="${style.id}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`
  // 서명 문단만 치환한다. 표를 감싼 상위 문단과 수신자·서명 기호는 보존한다.
  return section.replace(/<hp:p\b[^>]*>(?:(?!<hp:p\b)[\s\S])*?<\/hp:p>/g, p => {
    const text = Array.from(p.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g), m => m[1].replace(/<[^>]*>/g, '')).join('')
    if (text.includes('한국농어촌공사') && text.includes('귀하')) return p.replace(/charPrIDRef="\d+"/g, `charPrIDRef="${style.id}"`)
    const marker = text.includes('󰄫') ? '󰄫' : text.includes('(인)') ? '(인)' : ''
    if (!marker) return p
    const value = /^\s*(?:작\s*성|입\s*회)\s*자\s*:/.test(text) ? author : /^\s*(?:검\s*토|확\s*인)\s*자\s*:/.test(text) ? reviewer : null
    if (!value) return p
    return paragraph(/<hp:p\b[^>]*>/.exec(p)![0].replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${style.signatureId}"`), `${value}    ${marker}`)
  })
}

function resultFacts(section: string, row: PatrolInspection, style: DocumentStyle, completedDate: string | null): string {
  const ranges = topLevelRanges(section, 'hp:p')
  return rebuild(section, ranges, ranges.map(range => {
    const paragraph = section.slice(...range)
    if (topLevelRanges(paragraph, 'hp:tbl').length) return paragraph
    const text = Array.from(paragraph.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g), match => match[1].replace(/<[^>]*>/g, '')).join('')
    const isDate = /^\s*\.\s*\.\s*\.\s*$/.test(text)
    let value: string | undefined
    if (text.includes('1. 공사명')) value = `1. 공사명 : ${row.project_name || ''}    2. 수급인 : ${row.contractor_name || ''}`
    if (text.includes('3. 점검자')) value = `3. 점검자 : ${row.inspector_name || ''}`
    if (text.includes('4. 점검일')) value = `4. 점검일 : ${row.inspection_date}    5. 조치완료일 : ${completedDate || ''}`
    if (isDate) value = completedDate ? `${completedDate.replace(/-/g, '. ')}.` : '.    .    .'
    if (!value) return paragraph
    const open = /<hp:p\b[^>]*>/.exec(paragraph)![0]
    const formatted = isDate ? open.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${style.dateId}"`) : open
    return `${formatted}<hp:run charPrIDRef="${style.id}"><hp:t>${esc(value)}</hp:t></hp:run></hp:p>`
  }))
}

// 같은 섹션에서 원본 문단을 쪽 단위로 복제한다. secPr는 첫 쪽에만 남긴다.
function combine(sections: string[]): string {
  let nextId = 1200000000
  const parts = sections.map((section, index) => {
    const body = section.slice(section.indexOf('>', section.indexOf('<hs:sec')) + 1, section.lastIndexOf('</hs:sec>'))
    let result = body.replace(/<(hp:tbl|hp:pic)\b([^>]*?)\bid="\d+"/g, (_, tag, rest) => `<${tag}${rest}id="${nextId++}"`)
    if (index) {
      result = result.replace(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/g, '').replace(/<hp:ctrl>\s*<hp:colPr\b[\s\S]*?<\/hp:ctrl>/g, '')
      result = result.replace(/<hp:p\b[^>]*>/, p => p.replace('pageBreak="0"', 'pageBreak="1"'))
    }
    return result
  })
  return sections[0].slice(0, sections[0].indexOf('>', sections[0].indexOf('<hs:sec')) + 1) + parts.join('') + '</hs:sec>'
}

export async function buildPatrolCorrectiveHwpx(row: PatrolInspection, kind: PatrolCorrectiveKind, plan?: PatrolCorrectivePlan): Promise<Blob> {
  if (kind === 'plan' && !plan) throw new Error('시정조치계획 초안이 필요합니다.')
  const response = await fetch(`/patrol-corrective/${kind}.hwpx`)
  if (!response.ok) throw new Error('시정조치 한글 양식을 가져오지 못했습니다.')
  const template = await JSZip.loadAsync(await response.arrayBuffer())
  const sectionFile = template.file('Contents/section0.xml')
  const headerFile = template.file('Contents/header.xml')
  const manifestFile = template.file('Contents/content.hpf')
  if (!sectionFile || !headerFile || !manifestFile) throw new Error('한글 양식의 필수 파일이 없습니다.')
  const original = stripLineseg(await sectionFile.async('string'))
  const style = textStyle(await headerFile.async('string'))
  let manifest = await manifestFile.async('string')
  const output = new JSZip()
  output.file('mimetype', MIME, { compression: 'STORE' })
  for (const entry of Object.values(template.files)) {
    if (!entry.dir && entry.name !== 'mimetype' && !entry.name.startsWith('Preview/')) output.file(entry.name, await entry.async('uint8array'))
  }
  let imageId = Math.max(0, ...Array.from(manifest.matchAll(/id="image(\d+)"/g), m => Number(m[1])))
  const picture = async (url: string | null | undefined, height: number) => {
    if (!url || !/^https?:\/\//i.test(url)) return ''
    const photo = await collectImage(url, `image${++imageId}`, false)
    const size = fit(photo, 38500, height)
    const filename = `BinData/${photo.id}.${photo.ext}`
    output.file(filename, photo.data)
    manifest = manifest.replace('</opf:manifest>', `<opf:item id="${photo.id}" href="${filename}" media-type="image/jpeg" isEmbeded="1"/></opf:manifest>`)
    return buildInlinePicXml(photo.id, size.w, size.h)
  }
  const sections: string[] = []
  const common = { '1,1': '', '1,3': 'KRC 패트롤 점검', '2,1': row.inspector_name || '', '2,3': row.inspection_date, '3,1': lines(row.project_name || '').join('\n') }
  if (kind === 'result') {
    const issues = [{ text: row.issue_content1, before: row.site_photo_issue1, after: row.action_photo_issue1, status: row.issue1_status }]
    if (hasPatrolSecondIssue(row)) issues.push({ text: row.issue_content2 || '', before: row.site_photo_issue2, after: row.action_photo_issue2, status: row.issue2_status || 'pending' })
    for (const [index, issue] of issues.entries()) {
      // 16891 높이 셀에서 13pt 160% 본문은 세 줄씩 유지하고 남는 높이를 사진에 쓴다.
      const chunks = pages(issue.text || '지적내용 미기록', 3)
      for (const [part, text] of chunks.entries()) {
        const tables = topLevelRanges(original, 'hp:tbl')
        const state = getPatrolActionState({ action_photo_issue1: issue.after })
        const status = state.notApplicable ? '해당 사항 없음' : state.completed ? '조치사진 등록' : '조치사진 미등록'
        const values = { '0,1': row.actual_work_address || row.site_address || '', '1,2': `지적 ${index + 1} · 점검일 ${row.inspection_date}`, '2,1': text, '3,2': status, '4,1': state.notApplicable ? '해당 사항 없음' : state.completed ? '' : '조치사진 미등록' }
        const pictures: Record<string, string> = part === 0 ? { '2,1': await picture(issue.before, photoHeight(16891, text)), '4,1': await picture(issue.after, photoHeight(15846, values['4,1'])) } : {}
        const section = rebuild(original, tables, tables.map((r, i) => i === 1 ? fillTable(original.slice(...r), values, style, pictures) : original.slice(...r)))
        sections.push(resultFacts(section, row, style, state.completedDate))
      }
    }
  } else if (kind === 'request' && [row.site_photo_issue1, hasPatrolSecondIssue(row) ? row.site_photo_issue2 : null].some(url => url && /^https?:\/\//i.test(url))) {
    const issues = [{ text: row.issue_content1, photo: row.site_photo_issue1 }]
    if (hasPatrolSecondIssue(row)) issues.push({ text: row.issue_content2 || '', photo: row.site_photo_issue2 })
    for (const [index, issue] of issues.entries()) {
      // 긴 공사명으로 늘어난 상단 행만큼 본문 셀을 줄여 전체 표 높이를 유지한다.
      const headerGrowth = Math.max(0, lines(row.project_name || '').length * 2080 + 282 - 3096)
      const bodyHeight = Math.max(15000, 43231 - headerGrowth)
      const chunks = pages(issue.text || '지적내용 미기록', 7)
      for (const [part, text] of chunks.entries()) {
        const content = `지적 ${index + 1}${part ? ' (계속)' : ''}\n${text}\n\n위 지적사항에 대한 시정조치 및 결과\n제출을 요청합니다.`
        const pictures: Record<string, string> = part === 0 ? { '4,1': await picture(issue.photo, photoHeight(bodyHeight, content)) } : {}
        const tables = topLevelRanges(original, 'hp:tbl')
        const values = { ...common, '4,1': content }
        const section = rebuild(original, tables, tables.map(r => {
          const table = fillTable(original.slice(...r), values, style, pictures)
          const cells = topLevelRanges(table, 'hp:tc')
          return rebuild(table, cells, cells.map(range => {
            const cell = table.slice(...range)
            return /<hp:cellAddr colAddr="\d+" rowAddr="4"/.test(cell)
              ? cell.replace(/(<hp:cellSz\b[^>]*height=")\d+/, `$1${bodyHeight}`) : cell
          }))
        }))
        sections.push(section)
      }
    }
  } else {
    const issueText = buildPatrolIssueContent(row) || '지적내용 미기록'
    const requestText = row.finding_type === 'not_applicable' ? '해당 사항 없음' : buildPatrolIssueContent(row) ? `${issueText}\n\n위 지적사항에 대한 시정조치 및 결과 제출을 요청합니다.` : issueText
    const bullets = (text: string) => text.split(/\r?\n/).filter(line => line.trim()).map(line => `  - ${line.trim().replace(/^[-•]\s*/, '')}`).join('\n')
    const content = kind === 'plan' ? `□ 시정조치계획\n${bullets(plan!.action)}\n□ 재발방지·확인계획\n${bullets(plan!.prevention)}` : requestText
    const bodyHeight = kind === 'plan' ? planBodyHeight(row) : undefined
    const rightPages = bodyHeight ? planPages(content, 40913, bodyHeight, PLAN_HANGING) : pages(content, 19)
    const leftPages = bodyHeight ? planPages(issueText, 7014, bodyHeight, 0, 2080) : []
    for (let page = 0; page < Math.max(rightPages.length, leftPages.length); page++) {
      const tables = topLevelRanges(original, 'hp:tbl')
      const values = kind === 'plan' ? { ...common, '3,1': row.project_name || '', '5,0': leftPages[page] || '', '5,1': rightPages[page] || '' } : { ...common, '4,1': rightPages[page] }
      let section = rebuild(original, tables, tables.map(r => fillTable(original.slice(...r), values, style, {}, bodyHeight)))
      if (kind === 'plan') section = planDate(section, row.inspection_date, style)
      section = section.replace(/OO지사장/g, esc(row.managing_branch ? `${row.managing_branch}장` : '________지사장'))
      sections.push(section)
    }
  }
  const section = combine(sections.map(section => identities(section, row, style)))
  output.file('Contents/section0.xml', section)
  output.file('Contents/header.xml', style.header)
  output.file('Contents/content.hpf', manifest)
  output.file('Preview/PrvText.txt', `${PATROL_CORRECTIVE_LABELS[kind]}\n${row.project_name || ''}\n${buildPatrolIssueContent(row)}`)
  return output.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: MIME })
}
