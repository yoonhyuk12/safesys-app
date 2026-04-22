import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, BorderStyle, HeightRule,
  ImageRun, VerticalAlign, TableLayoutType,
} from 'docx'

interface InspectionData {
  id: string
  inspection_type: string
  inspection_date: string
  inspection_team: string | null
  management_entity: string | null
  district_name: string | null
  location_province: string | null
  location_city: string | null
  total_budget: number | null
  construction_start: string | null
  construction_end_planned: string | null
  progress_rate: number | null
  major_work_type: string | null
  contractor: string | null
  supervisor_name: string | null
  additional_items?: any[] | null
  signatures?: any[]
  safety_inspection_photos?: any[] | null
}

// ── helpers ──

const fmtDate = (s: string | null) => {
  if (!s) return ''
  const p = s.split('-')
  return p.length === 3 ? `${p[0]}. ${p[1]}. ${p[2]}` : s
}

const fmtDateShort = (s: string | null) => {
  if (!s) return ''
  const p = s.split('-')
  return p.length >= 2 ? `${p[0].slice(2)}.${p[1]}` : s
}

/** "태리지구 수리시설개보수사업" → "태리지구" */
const shortenDistrict = (name: string): string => {
  if (!name) return ''
  const sp = name.indexOf(' ')
  return sp > 0 ? name.substring(0, sp) : name
}

const FONT = 'Malgun Gothic'
const SZ = 18 // 9pt
const SZ_SM = 16 // 8pt
const B = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
const BD = { top: B, bottom: B, left: B, right: B }

// PT to twips: 1pt = 20twips
const ROW_H_HEADER = 500     // 25pt - 점검결과 헤더행
const ROW_H_DATA = 540       // 27pt - 점검결과 데이터행 (균일)
const ROW_H_INFO = 480       // 24pt - 점검지구현황 데이터행
const ROW_H_PHOTO_HDR = 440  // 22pt - 사진대지 헤더행
const ROW_H_PHOTO = 4800     // 240pt - 사진 셀 (한 페이지에 2개 수용)

function hCell(text: string, opts?: { colSpan?: number; rowSpan?: number; width?: number }): TableCell {
  const lines = text.split('\n')
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 20, after: 20 },
      children: lines.flatMap((line, i) =>
        i === 0
          ? [new TextRun({ text: line, bold: true, size: SZ, font: FONT })]
          : [new TextRun({ break: 1 }), new TextRun({ text: line, bold: true, size: SZ, font: FONT })]
      ),
    })],
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: { fill: 'F2F2F2' },
    borders: BD,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts?.colSpan,
    rowSpan: opts?.rowSpan,
  })
}

function dCell(text: string, opts?: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; fontSize?: number; width?: number; colSpan?: number }): TableCell {
  return new TableCell({
    children: [new Paragraph({
      alignment: opts?.align ?? AlignmentType.CENTER,
      spacing: { before: 20, after: 20 },
      children: [new TextRun({ text, size: opts?.fontSize ?? SZ, font: FONT })],
    })],
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: BD,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts?.colSpan,
  })
}

async function fetchImg(url: string): Promise<{ buf: ArrayBuffer; w: number; h: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const buf = await blob.arrayBuffer()
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      const u = URL.createObjectURL(blob)
      i.onload = () => { URL.revokeObjectURL(u); resolve(i) }
      i.onerror = () => { URL.revokeObjectURL(u); reject() }
      i.src = u
    })
    return { buf, w: img.naturalWidth, h: img.naturalHeight }
  } catch { return null }
}

function fitSize(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h, 1)
  return { w: Math.round(w * s), h: Math.round(h * s) }
}

const CATEGORIES = [
  { key: '가. 사전조사 및 작업 전 점검', label: '사전조사 및\n작업 전 점검', rows: 3 },
  { key: '나. 가설통로의 구조', label: '가설통로의\n구조', rows: 3 },
  { key: '다. 사다리식 통로의 구조', label: '사다리식\n통로의 구조', rows: 3 },
  { key: '라. 기타점검사항', label: '기타 점검 사항', rows: 2 },
]

// ── Column widths (DXA) from PDF proportions ──
// Project info: total ~9640 DXA at 100%
const W_INFO = [2270, 690, 670, 1100, 980, 900, 1600, 1430]
// Photo page: 4 columns
const W_PHOTO = [1260, 3330, 1620, 3570]

// ── Main ──

type DocxSection = { properties: any; children: (Paragraph | Table)[] }

const DEFAULT_PAGE_MARGIN = { top: 1440, bottom: 1440, left: 1080, right: 1080 }

async function buildInspectionSections(inspection: InspectionData, photos?: any[]): Promise<DocxSection[]> {
  const items: any[] = inspection.additional_items || []
  const findings = items.filter((it: any) => it.action && it.action !== '해당없음')
  const allPhotos: any[] = photos || inspection.safety_inspection_photos || []
  const sitePhotos = allPhotos.filter((p: any) => p.photo_type === 'site_before')

  const grouped: Record<string, any[]> = {}
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  let teamStr = inspection.inspection_team || ''
  if (inspection.signatures?.length) {
    const fmtPos = (p: string) => p && /^\d+$/.test(p) ? `${p}급` : p
    const fromSig = inspection.signatures
      .filter((s: any) => s.role === '점검자')
      .map((s: any) => `${fmtPos(s.position || '')} ${s.name}`.trim())
      .filter(Boolean).join(', ')
    if (fromSig) teamStr = fromSig
  }

  const supervisorName = inspection.supervisor_name || ''
  let supervisorTitle = ''
  let supervisorPureName = supervisorName
  const nameParts = supervisorName.trim().split(/\s+/)
  if (nameParts.length >= 2) { supervisorTitle = nameParts[0]; supervisorPureName = nameParts.slice(1).join(' ') }
  const supervisorFull = (supervisorTitle ? supervisorTitle + ' ' : '') + supervisorPureName

  const distFull = inspection.district_name || ''
  const dist = shortenDistrict(distFull)

  // ═══════════════════════════════════════
  // Page 1
  // ═══════════════════════════════════════
  const page1: (Paragraph | Table)[] = []

  // Header: [붙임 3] 지사 및 사업단 특별점검 결과
  const B_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const B_BOTTOM_ONLY = { top: B_NONE, left: B_NONE, right: B_NONE, bottom: { style: BorderStyle.SINGLE, size: 2, color: '000000' } }
  page1.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [
      new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20, after: 20 }, children: [new TextRun({ text: '붙임 3', bold: true, size: 20, font: FONT, color: 'FFFFFF' })] })],
        width: { size: 1134, type: WidthType.DXA },  // 2cm
        shading: { fill: '4C94D8' },  // RGB 76,148,216
        borders: BD,
        verticalAlign: VerticalAlign.CENTER,
      }),
      new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 200 }, children: [new TextRun({ text: '지사 및 사업단 특별점검 결과', bold: true, size: 24, font: FONT })] })],
        width: { size: 7888, type: WidthType.DXA },  // 13.92cm
        borders: B_BOTTOM_ONLY,
        verticalAlign: VerticalAlign.CENTER,
      }),
    ] })],
  }))
  page1.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 300 }, children: [new TextRun({ text: `건설현장  점검카드(${distFull})`, bold: true, size: 32, font: FONT, underline: {} })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: '1. 점검개요', bold: true, size: 24, font: FONT })] }),
    new Paragraph({ spacing: { after: 60 }, indent: { left: 200 }, children: [new TextRun({ text: `○ 점검일시 : ${fmtDate(inspection.inspection_date)}`, size: 20, font: FONT })] }),
    new Paragraph({ spacing: { after: 60 }, indent: { left: 200 }, children: [new TextRun({ text: `○ 점 검 반 : ${teamStr}`, size: 20, font: FONT })] }),
    new Paragraph({ spacing: { after: 120 }, indent: { left: 200 }, children: [new TextRun({ text: '○ 점검지구 현황', size: 20, font: FONT })] }),
  )

  // ── 점검지구 현황 (8 cols, 3 rows) ──
  const W = W_INFO
  page1.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ height: { value: ROW_H_HEADER, rule: HeightRule.ATLEAST }, children: [
        hCell('지구명', { width: W[0], rowSpan: 2 }),
        hCell('위 치', { colSpan: 2 }),
        hCell('총사업비\n(백만원)', { width: W[3], rowSpan: 2 }),
        hCell('공사추진실적', { colSpan: 2 }),
        hCell('점검공종', { width: W[6], rowSpan: 2 }),
        hCell('비고\n(시공사)', { width: W[7], rowSpan: 2 }),
      ] }),
      new TableRow({ height: { value: ROW_H_HEADER, rule: HeightRule.ATLEAST }, children: [
        hCell('도', { width: W[1] }),
        hCell('시군', { width: W[2] }),
        hCell('착공', { width: W[4] }),
        hCell('준공\n(예정)', { width: W[5] }),
      ] }),
      new TableRow({ height: { value: ROW_H_INFO, rule: HeightRule.ATLEAST }, children: [
        dCell(dist, { width: W[0] }),
        dCell(inspection.location_province || '', { width: W[1] }),
        dCell(inspection.location_city || '', { width: W[2] }),
        dCell(inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : '', { width: W[3] }),
        dCell(fmtDateShort(inspection.construction_start), { width: W[4], fontSize: SZ_SM }),
        dCell(fmtDateShort(inspection.construction_end_planned), { width: W[5], fontSize: SZ_SM }),
        dCell(inspection.major_work_type || '', { width: W[6], fontSize: SZ_SM }),
        dCell(inspection.contractor || '', { width: W[7] }),
      ] }),
    ],
  }))

  // ── 2. 점검결과 (3 cols, 12 rows) ──
  page1.push(
    new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: '2. 점검결과', bold: true, size: 24, font: FONT })] }),
  )

  const fRows: TableRow[] = [
    new TableRow({ height: { value: ROW_H_HEADER, rule: HeightRule.ATLEAST }, children: [
      hCell('항 목'),
      hCell('지적사항'),
      hCell('조치(예정) 사항'),
    ] }),
  ]

  for (const cat of CATEGORIES) {
    const catItems = (grouped[cat.key] || []).filter((it: any) => it.action && it.action !== '해당없음' && !it.custom)
    const customItem = (grouped[cat.key] || []).find((it: any) => it.custom && it.action && it.action !== '해당없음')
    const all = [...catItems]
    if (customItem) all.push(customItem)

    for (let i = 0; i < cat.rows; i++) {
      const f = all[i]
      const ft = f ? (f.item || '') : ''
      const at = f ? (f.action || '') : ''
      const cells: TableCell[] = []

      if (i === 0) {
        const lines = cat.label.split('\n')
        cells.push(new TableCell({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: lines.flatMap((l, li) =>
              li === 0
                ? [new TextRun({ text: l, bold: true, size: SZ, font: FONT })]
                : [new TextRun({ break: 1 }), new TextRun({ text: l, bold: true, size: SZ, font: FONT })]
            ),
          })],
          shading: { fill: 'F2F2F2' },
          borders: BD,
          verticalAlign: VerticalAlign.CENTER,
          rowSpan: cat.rows,
        }))
      }

      cells.push(dCell(ft ? '- ' + ft : '', { align: AlignmentType.LEFT }))
      cells.push(dCell(at ? '- ' + at : '', { align: AlignmentType.LEFT }))
      fRows.push(new TableRow({ height: { value: ROW_H_DATA, rule: HeightRule.EXACT }, children: cells }))
    }
  }

  page1.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: fRows,
  }))

  // ═══════════════════════════════════════
  // Photo pages (each finding = 1 page)
  // ═══════════════════════════════════════
  const photoSections: DocxSection[] = []

  for (const f of findings) {
    const ft = f.item || ''
    const at = f.action || ''
    const children: (Paragraph | Table)[] = []

    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: '<지적사항 및 조치사항 사진대지>', bold: true, size: 28, font: FONT, underline: {} })],
    }))

    const P = W_PHOTO

    // ── 조치 전 ──
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ height: { value: ROW_H_PHOTO_HDR, rule: HeightRule.ATLEAST }, children: [
          hCell('지구명', { width: P[0] }),
          dCell(dist, { width: P[1] }),
          hCell('공사감독원', { width: P[2] }),
          dCell(supervisorFull, { width: P[3] }),
        ] }),
        new TableRow({ height: { value: ROW_H_PHOTO_HDR, rule: HeightRule.ATLEAST }, children: [
          hCell('일  시', { width: P[0] }),
          dCell(fmtDate(inspection.inspection_date), { width: P[1] }),
          hCell('설  명', { width: P[2] }),
          dCell(`(조치 전) ${ft}`, { width: P[3], align: AlignmentType.LEFT }),
        ] }),
        // 사진 행 (조치전 사진 없으면 전경사진 사용)
        new TableRow({ height: { value: ROW_H_PHOTO, rule: HeightRule.EXACT }, children: [
          await buildPhotoCell(f.photo_url || f.site_photo_url || null, 4),
        ] }),
      ],
    }))

    children.push(new Paragraph({ spacing: { before: 40, after: 40 } }))

    // ── 조치 후 ──
    const hasAfter = f.after_photo_url && f.after_photo_url !== 'N/A'
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ height: { value: ROW_H_PHOTO_HDR, rule: HeightRule.ATLEAST }, children: [
          hCell('지구명', { width: P[0] }),
          dCell(dist, { width: P[1] }),
          hCell('공사감독원', { width: P[2] }),
          dCell(supervisorFull, { width: P[3] }),
        ] }),
        new TableRow({ height: { value: ROW_H_PHOTO_HDR, rule: HeightRule.ATLEAST }, children: [
          hCell('일  시', { width: P[0] }),
          dCell(fmtDate(inspection.inspection_date), { width: P[1] }),
          hCell('설  명', { width: P[2] }),
          dCell(`(조치 후) ${at}`, { width: P[3], align: AlignmentType.LEFT }),
        ] }),
        new TableRow({ height: { value: ROW_H_PHOTO, rule: HeightRule.EXACT }, children: [
          await buildPhotoCell(hasAfter ? f.after_photo_url : null, 4),
        ] }),
      ],
    }))

    photoSections.push({
      properties: { page: { margin: DEFAULT_PAGE_MARGIN } },
      children,
    })
  }

  // ═══════════════════════════════════════
  // 지적사항이 없는 경우 전경 사진 사진대지 (2장씩 한 페이지)
  // ═══════════════════════════════════════
  if (findings.length === 0 && sitePhotos.length > 0) {
    const P = W_PHOTO
    const pageCount = Math.ceil(sitePhotos.length / 2)

    for (let pg = 0; pg < pageCount; pg++) {
      const children: (Paragraph | Table)[] = []

      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: '건설현장 점검사진', bold: true, size: 28, font: FONT, underline: {} })],
      }))

      for (let slot = 0; slot < 2; slot++) {
        const photo = sitePhotos[pg * 2 + slot]
        const has = !!photo?.photo_url

        if (slot > 0) {
          children.push(new Paragraph({ spacing: { before: 40, after: 40 } }))
        }

        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ height: { value: ROW_H_PHOTO_HDR, rule: HeightRule.ATLEAST }, children: [
              hCell('지구명', { width: P[0] }),
              dCell(has ? dist : '', { width: P[1] }),
              hCell('공사감독원', { width: P[2] }),
              dCell(has ? supervisorFull : '', { width: P[3] }),
            ] }),
            new TableRow({ height: { value: ROW_H_PHOTO_HDR, rule: HeightRule.ATLEAST }, children: [
              hCell('일  시', { width: P[0] }),
              dCell(has ? fmtDate(inspection.inspection_date) : '', { width: P[1] }),
              hCell('설  명', { width: P[2] }),
              dCell(has ? (photo?.description || '점검 전경사진') : '', { width: P[3], align: AlignmentType.LEFT }),
            ] }),
            new TableRow({ height: { value: ROW_H_PHOTO, rule: HeightRule.EXACT }, children: [
              await buildPhotoCell(has ? photo.photo_url : null, 4),
            ] }),
          ],
        }))
      }

      photoSections.push({
        properties: { page: { margin: DEFAULT_PAGE_MARGIN } },
        children,
      })
    }
  }

  return [
    { properties: { page: { margin: DEFAULT_PAGE_MARGIN } }, children: page1 },
    ...photoSections,
  ]
}

async function downloadDocx(sections: DocxSection[], fileName: string): Promise<void> {
  const doc = new Document({ sections })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export async function generateSpecialInspectionDocx(inspection: InspectionData, photos?: any[]): Promise<void> {
  const sections = await buildInspectionSections(inspection, photos)
  const dateStr = (inspection.inspection_date || '').replace(/-/g, '')
  await downloadDocx(sections, `특별점검_${dateStr}.docx`)
}

export async function generateSpecialInspectionDocxBulk(
  inspections: InspectionData[],
  fileName: string,
  onProgress?: (current: number, total: number, title?: string) => void,
): Promise<void> {
  const allSections: DocxSection[] = []
  for (let i = 0; i < inspections.length; i++) {
    const ins = inspections[i]
    onProgress?.(i + 1, inspections.length, ins.district_name || '')
    const sections = await buildInspectionSections(ins)
    allSections.push(...sections)
  }
  if (allSections.length === 0) return
  await downloadDocx(allSections, fileName)
}

// ── 사진 셀 ──

async function buildPhotoCell(photoUrl: string | null, colSpan: number): Promise<TableCell> {
  let children: Paragraph[]
  // docx ImageRun transformation 단위 = pixels(96DPI)
  // 셀 높이 4800twips = 240pt = 8.47cm → 96DPI 픽셀: 8.47/2.54*96 ≈ 320px
  // 목표 높이 8.3cm → 313px, 셀 너비(A4-마진) ≈ 640px
  const maxW = 640
  const maxH = 315

  if (photoUrl) {
    const img = await fetchImg(photoUrl)
    if (img) {
      const sz = fitSize(img.w, img.h, maxW, maxH)
      children = [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: img.buf, transformation: { width: sz.w, height: sz.h }, type: 'jpg' })],
      })]
    } else {
      children = [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '(사진 로드 실패)', color: 'AAAAAA', size: 20, font: FONT })] })]
    }
  } else {
    children = [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '(사진 없음)', color: 'AAAAAA', size: 20, font: FONT })] })]
  }

  return new TableCell({
    children,
    borders: BD,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: colSpan,
  })
}
