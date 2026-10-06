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

// 한글 10pt 기준 폭에 여유를 두고 명시적으로 줄을 나누어 원본 고정 높이를 넘지 않는다.
function lines(text: string, width = 34): string[] {
  return text.replace(/\r/g, '').split('\n').flatMap(line => {
    const chars = Array.from(line)
    return chars.length ? Array.from({ length: Math.ceil(chars.length / width) }, (_, i) => chars.slice(i * width, (i + 1) * width).join('')) : ['']
  })
}
function pages(text: string, count: number, width = 34): string[] {
  const all = lines(text, width)
  return Array.from({ length: Math.max(1, Math.ceil(all.length / count)) }, (_, i) => all.slice(i * count, (i + 1) * count).join('\n'))
}

function fill(cell: string, text: string, charId: number, picture = ''): string {
  const range = topLevelRanges(cell, 'hp:subList')[0]
  if (!range) throw new Error('양식의 셀 본문을 찾지 못했습니다.')
  const sub = cell.slice(...range)
  const p = /<hp:p\s[^>]*>/.exec(sub)?.[0]
  if (!p) throw new Error('양식의 문단 서식이 없습니다.')
  const content = text.split('\n').map(line => `${p}<hp:run charPrIDRef="${charId}"><hp:t>${esc(line)}</hp:t></hp:run></hp:p>`).join('')
  const image = picture ? `${p}<hp:run charPrIDRef="${charId}">${picture}<hp:t/></hp:run></hp:p>` : ''
  return rebuild(cell, [range], [sub.slice(0, sub.indexOf('>') + 1) + content + image + '</hp:subList>'])
}

function fillTable(table: string, values: Record<string, string>, charId: number, pictures: Record<string, string> = {}): string {
  const ranges = topLevelRanges(table, 'hp:tc')
  return rebuild(table, ranges, ranges.map(range => {
    const cell = table.slice(...range)
    const addr = /<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/.exec(cell)
    const key = addr ? `${addr[2]},${addr[1]}` : ''
    return key in values ? fill(cell, values[key], charId, pictures[key]) : cell
  }))
}

function textStyle(header: string): { header: string; id: number } {
  const styles = Array.from(header.matchAll(/<hh:charPr id="(\d+)"[^>]*>[\s\S]*?<\/hh:charPr>/g))
  if (!styles.length) throw new Error('양식의 글자 서식을 찾지 못했습니다.')
  const id = Math.max(...styles.map(style => Number(style[1]))) + 1
  const clone = styles[0][0].replace(/id="\d+"/, `id="${id}"`).replace(/height="\d+"/, 'height="1000"').replace(/textColor="[^"]*"/, 'textColor="#000000"')
  return { id, header: header.replace('</hh:charProperties>', clone + '</hh:charProperties>').replace(/(<hh:charProperties itemCnt=")(\d+)/, (_, start, n) => start + (Number(n) + 1)) }
}

function resultFacts(section: string, row: PatrolInspection, charId: number): string {
  const ranges = topLevelRanges(section, 'hp:p')
  return rebuild(section, ranges, ranges.map(range => {
    const paragraph = section.slice(...range)
    if (topLevelRanges(paragraph, 'hp:tbl').length) return paragraph
    const text = Array.from(paragraph.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g), match => match[1]).join('')
    let value: string | undefined
    if (text.includes('1. 공사명')) value = `1. 공사명 : ${row.project_name || ''}    2. 수급인 : ${row.contractor_name || ''}`
    if (text.includes('3. 점검자')) value = `3. 점검자 : ${row.inspector_name || ''}`
    if (text.includes('4. 점검일')) value = `4. 점검일 : ${row.inspection_date}    5. 조치완료일 : `
    if (!value) return paragraph
    const open = /<hp:p\b[^>]*>/.exec(paragraph)![0]
    return `${open}<hp:run charPrIDRef="${charId}"><hp:t>${esc(value)}</hp:t></hp:run></hp:p>`
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
  const common = { '1,1': '', '1,3': 'KRC 패트롤 점검', '2,1': row.inspector_name || '', '2,3': row.inspection_date, '3,1': lines(row.project_name || '', 34).join('\n') }
  if (kind === 'result') {
    const issues = [{ text: row.issue_content1, before: row.site_photo_issue1, after: row.action_photo_issue1, status: row.issue1_status }]
    if (hasPatrolSecondIssue(row)) issues.push({ text: row.issue_content2 || '', before: row.site_photo_issue2, after: row.action_photo_issue2, status: row.issue2_status || 'pending' })
    for (const [index, issue] of issues.entries()) {
      const chunks = pages(issue.text || '지적내용 미기록', 5)
      for (const [part, text] of chunks.entries()) {
        const tables = topLevelRanges(original, 'hp:tbl')
        const state = getPatrolActionState({ action_photo_issue1: issue.after })
        const status = state.notApplicable ? '해당 사항 없음' : state.completed ? '조치사진 등록' : '조치사진 미등록'
        const values = { '0,1': row.actual_work_address || row.site_address || '', '1,2': `지적 ${index + 1} · 점검일 ${row.inspection_date}`, '2,1': text, '3,2': status, '4,1': state.notApplicable ? '해당 사항 없음' : state.completed ? '' : '조치사진 미등록' }
        const pictures: Record<string, string> = part === 0 ? { '2,1': await picture(issue.before, 8000), '4,1': await picture(issue.after, 13500) } : {}
        const section = rebuild(original, tables, tables.map((r, i) => i === 1 ? fillTable(original.slice(...r), values, style.id, pictures) : original.slice(...r)))
        sections.push(resultFacts(section, row, style.id))
      }
    }
  } else {
    const issueText = buildPatrolIssueContent(row) || '지적내용 미기록'
    const requestText = row.finding_type === 'not_applicable' ? '해당 사항 없음' : buildPatrolIssueContent(row) ? `${issueText}\n\n위 지적사항에 대한 시정조치 및 결과 제출을 요청합니다.` : issueText
    const content = kind === 'plan' ? `시정조치계획\n${plan!.action}\n재발방지·확인계획\n${plan!.prevention}` : requestText
    const rightPages = pages(content, kind === 'plan' ? 11 : 27)
    const leftPages = kind === 'plan' ? pages(issueText, 11, 5) : []
    for (let page = 0; page < Math.max(rightPages.length, leftPages.length); page++) {
      const tables = topLevelRanges(original, 'hp:tbl')
      const values = kind === 'plan' ? { ...common, '5,0': leftPages[page] || '', '5,1': rightPages[page] || '' } : { ...common, '4,1': rightPages[page] }
      let section = rebuild(original, tables, tables.map(r => fillTable(original.slice(...r), values, style.id)))
      section = section.replace(/OO지사장/g, esc(row.managing_branch ? `${row.managing_branch}장` : '________지사장'))
      sections.push(section)
    }
  }
  const section = combine(sections)
  output.file('Contents/section0.xml', section)
  output.file('Contents/header.xml', style.header)
  output.file('Contents/content.hpf', manifest)
  output.file('Preview/PrvText.txt', `${PATROL_CORRECTIVE_LABELS[kind]}\n${row.project_name || ''}\n${buildPatrolIssueContent(row)}`)
  return output.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: MIME })
}
