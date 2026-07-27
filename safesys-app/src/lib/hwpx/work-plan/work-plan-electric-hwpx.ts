// 붙임2-3 전기 작업계획서를 한글문서(hwpx)로 조립·다운로드 (PDF 페이지 구성과 동일 내용·순서, 사진은 별지)
import {
    ELECTRIC_ATTACHMENT_OPTIONS,
    ELECTRIC_CHECKLIST,
    ELECTRIC_PRE_WORK_INSTRUCTIONS,
    ELECTRIC_PROTECTIVE_EQUIPMENT,
    ELECTRIC_PROTECTIVE_EQUIPMENT_NOTE,
} from '@/lib/work-plan/constants'
import type { PersonContact, WorkPlanRecord } from '@/lib/work-plan/types'
import { buildFileName } from '@/lib/reports/work-plan/work-plan-pdf-common'
import {
    CONTENT_HEIGHT,
    PAGE_CONTENT_TOP,
    PAGE_LEFT,
    APPROVAL_HEAD_H,
    APPROVAL_SIGN_H,
    CELL_PAD,
    COLS12,
    COLS_APPROVAL,
    ImageCollector,
    type Row,
    approvalHeaderRows,
    approvalSignatureFloats,
    assembleHwpxBlob,
    bannerRow,
    buildCoverParts,
    buildTableParagraph,
    checkbox,
    checklistRows,
    clampRowHeights,
    col12,
    estRowH,
    fitImage,
    paginateRows,
    resetHwpxSeqs,
    signatureFloat,
    triggerDownload,
} from './work-plan-hwpx-common'

type ElectricForm = NonNullable<WorkPlanRecord['form_data']['electric']>

const DOC_TITLE = '전기 작업계획서'
const BASE_H = 1500

// 담당자·작업책임자 칸 — 직위 성명 + 연락처
function personBlockText(p: PersonContact | undefined): string {
    if (!p) return ''
    const head = [p.position, p.name].filter(Boolean).join(' ')
    return p.phone ? (head ? `${head}\n(${p.phone})` : `(${p.phone})`) : head
}

// 사용장비 rowSpan 묶음이 쪽 경계에 걸리지 않도록, 섹션 머리 행에서만 표를 나눈다
function splitAtBoundaries(rows: Row[], boundaries: number[], firstCapacity: number, restCapacity: number): Row[][] {
    const chunks: Row[][] = []
    let start = 0
    let cap = firstCapacity
    while (start < rows.length) {
        let used = 0
        let end = rows.length
        for (let i = start; i < rows.length; i++) {
            if (i > start && used + rows[i].height > cap) {
                end = i
                break
            }
            used += rows[i].height
        }
        if (end < rows.length) {
            const candidates = boundaries.filter(b => b > start && b < end)
            if (candidates.length > 0) end = candidates[candidates.length - 1]
        }
        chunks.push(rows.slice(start, end))
        start = end
        cap = restCapacity
    }
    return chunks
}

// ── 본표 (결재란 + ①~⑦ 기본정보·작업자·교육·보호구·지시사항) ──

function buildMainParts(
    form: ElectricForm,
    collector: ImageCollector,
    sigIds: Partial<Record<'approvalManager' | 'approvalApprover' | 'instructionManager' | 'instructionWorker', string | null>>,
    tblIdBase: number,
): string[] {
    const rows: Row[] = []
    const boundaries: number[] = []
    const sectionHeader = (text: string) => {
        boundaries.push(rows.length)
        rows.push({ height: 1300, cells: [{ text, span: 12, header: true, cp: 1 }] })
    }

    rows.push({
        height: estRowH(BASE_H, form.title, col12(4)),
        cells: [
            { text: '작업명(장소)', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.title, span: 4, align: 'center' },
            { text: '작업일자', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.workDate, span: 4, align: 'center' },
        ],
    })
    rows.push({
        height: estRowH(BASE_H, personBlockText(form.manager), col12(4)),
        cells: [
            { text: '발주처', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.clientName, span: 4, align: 'center' },
            { text: '담당자', span: 2, header: true, cp: 4, align: 'center' },
            { text: personBlockText(form.manager), span: 4, align: 'center' },
        ],
    })
    rows.push({
        height: estRowH(BASE_H, personBlockText(form.workLeader), col12(4)),
        cells: [
            { text: '공사(용역)업체', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.companyName, span: 4, align: 'center' },
            { text: '작업책임자', span: 2, header: true, cp: 4, align: 'center' },
            { text: personBlockText(form.workLeader), span: 4, align: 'center' },
        ],
    })
    rows.push({
        height: estRowH(BASE_H, form.purposeAndContent, col12(10)),
        cells: [
            { text: '작업목적 및 내용', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.purposeAndContent, span: 10 },
        ],
    })
    rows.push({
        height: estRowH(BASE_H, form.workScope, col12(10)),
        cells: [
            { text: '공사범위', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.workScope, span: 10 },
        ],
    })

    // ② 작업자 (2명씩 한 행)
    sectionHeader('② 작업자')
    const workerHeader = ['연번', '성명', '보유자격', '근로형태']
    rows.push({
        height: 1300,
        cells: [...workerHeader, ...workerHeader].map((t, i) => ({
            text: t,
            span: i % 4 === 1 || i % 4 === 2 ? 2 : 1,
            header: true,
            cp: 4,
            align: 'center' as const,
        })),
    })
    const workers = form.workers || []
    if (workers.length === 0) {
        rows.push({
            height: 1400,
            cells: [
                { text: '', span: 1 }, { text: '', span: 2 }, { text: '', span: 2 }, { text: '', span: 1 },
                { text: '', span: 1 }, { text: '', span: 2 }, { text: '', span: 2 }, { text: '', span: 1 },
            ],
        })
    }
    for (let i = 0; i < workers.length; i += 2) {
        const a = workers[i]
        const b = workers[i + 1]
        rows.push({
            height: 1400,
            cells: [
                { text: String(i + 1), span: 1, cp: 7, align: 'center' },
                { text: a.name, span: 2, cp: 7, align: 'center' },
                { text: a.qualification, span: 2, cp: 7, align: 'center' },
                { text: a.employmentType, span: 1, cp: 7, align: 'center' },
                { text: b ? String(i + 2) : '', span: 1, cp: 7, align: 'center' },
                { text: b?.name || '', span: 2, cp: 7, align: 'center' },
                { text: b?.qualification || '', span: 2, cp: 7, align: 'center' },
                { text: b?.employmentType || '', span: 1, cp: 7, align: 'center' },
            ],
        })
    }

    // 안전보건교육 계획
    sectionHeader('안전보건교육 계획')
    const attendee = form.education?.attendeeCount != null ? `${form.education.attendeeCount}명` : ''
    rows.push({
        height: BASE_H,
        cells: [
            { text: '교육일자', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.education?.date || '', span: 4, align: 'center' },
            { text: '교육장소', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.education?.place || '', span: 4, align: 'center' },
        ],
    })
    rows.push({
        height: BASE_H,
        cells: [
            { text: '교육자', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.education?.instructor || '', span: 4, align: 'center' },
            { text: '인원', span: 2, header: true, cp: 4, align: 'center' },
            { text: attendee, span: 4, align: 'center' },
        ],
    })
    rows.push({
        height: estRowH(BASE_H, form.education?.content || '', col12(10)),
        cells: [
            { text: '교육내용', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.education?.content || '', span: 10 },
        ],
    })

    // 보호구 지급 및 사용 장비
    sectionHeader('보호구 지급 및 사용 장비')
    const selected = new Set(form.protectiveEquipment || [])
    const boxes = ELECTRIC_PROTECTIVE_EQUIPMENT.map(item =>
        item === '기타' ? `${checkbox('기타', selected.has('기타'))}( ${form.otherProtectiveEquipment || ''} )` : checkbox(item, selected.has(item)),
    ).join('  ')
    const protectiveText = `${boxes}\n* ${ELECTRIC_PROTECTIVE_EQUIPMENT_NOTE}`
    rows.push({
        height: estRowH(2400, protectiveText, col12(10)),
        cells: [
            { text: '지급보호구', span: 2, header: true, cp: 4, align: 'center' },
            { text: protectiveText, span: 10, cp: 7 },
        ],
    })
    const equipRows: Array<[string, string]> = [
        ['측정장비', form.measurementEquipment],
        ['활선기구/장비', form.liveLineEquipment],
        ['방호구', form.protectiveDevices],
        ['기타', form.otherEquipment],
    ]
    equipRows.forEach(([label, value], i) => {
        const cells: Row['cells'] = []
        if (i === 0) cells.push({ text: '사용장비', span: 2, rowSpan: 4, header: true, cp: 4, align: 'center' })
        cells.push({ text: label, span: 2, header: true, cp: 4, align: 'center' })
        cells.push({ text: value, span: 8, cp: 7 })
        rows.push({ height: 1400, cells })
    })

    // 작업 전 지시/협의사항 + 확인 서명 행
    sectionHeader('작업 전 지시/협의사항')
    for (const instruction of ELECTRIC_PRE_WORK_INSTRUCTIONS) {
        rows.push({ height: 1300, cells: [{ text: instruction, span: 12, cp: 7 }] })
    }
    const ACK_H = 1700
    rows.push({
        height: ACK_H,
        cells: [
            { text: `담당자 : ${form.instructionAcknowledgement?.managerName || ''} (인)`, span: 6, align: 'right' },
            { text: `작업자 : ${form.instructionAcknowledgement?.workerName || ''} (인)`, span: 6, align: 'right' },
        ],
    })

    // 내용이 긴 셀(근로형태 머리셀 등)이 행을 키우면 아래 행 y가 밀리므로 선언 높이를 추정 렌더 높이로 끌어올린다
    const clampedRows = clampRowHeights(rows, COLS12)

    // 표가 한 쪽 예산을 넘으면 섹션 머리 행에서 나눠 이어지는 표로 담는다 (rowSpan 묶음 보존)
    const approvalH = APPROVAL_HEAD_H + APPROVAL_SIGN_H
    const chunks = splitAtBoundaries(clampedRows, boundaries, CONTENT_HEIGHT - approvalH, CONTENT_HEIGHT)

    // 확인 행(마지막 청크 끝)의 (인) 문구 위 서명 겹침 — 청크가 놓인 쪽 기준 y 계산
    const lastChunk = chunks[chunks.length - 1]
    const lastChunkTop = chunks.length === 1 ? PAGE_CONTENT_TOP + approvalH : PAGE_CONTENT_TOP
    const ackY = lastChunkTop + lastChunk.slice(0, -1).reduce((a, r) => a + r.height, 0)
    const ackFloats: string[] = []
    const ackSpecs: Array<[string | null | undefined, number]> = [
        [sigIds.instructionManager, PAGE_LEFT + col12(6) - 4800],
        [sigIds.instructionWorker, PAGE_LEFT + col12(12) - 4800],
    ]
    for (const [picId, cellX] of ackSpecs) {
        if (picId) ackFloats.push(signatureFloat(collector, { picId, cellX, cellW: 4400, rowY: ackY, rowH: ACK_H, maxW: 3600, maxH: 1400 }))
    }

    const parts: string[] = []
    const approvalFloats = approvalSignatureFloats(collector, sigIds.approvalManager, sigIds.approvalApprover)
    if (chunks.length === 1) approvalFloats.push(...ackFloats)
    parts.push(buildTableParagraph(COLS_APPROVAL, approvalHeaderRows('전기 작업계획서', form.approvalNames), tblIdBase + 1, 1, { pageBreak: true, floats: approvalFloats }))
    chunks.forEach((chunkRows, i) => {
        const isLast = i === chunks.length - 1
        parts.push(buildTableParagraph(COLS12, chunkRows, tblIdBase + 2 + i, 2 + i, {
            pageBreak: i > 0,
            floats: chunks.length > 1 && isLast ? ackFloats : [],
        }))
    })
    return parts
}

// ── ③④ 작업순서 및 안전작업 방법 + 체크리스트 ──

function buildStepsAndChecklistParts(form: ElectricForm, tblIdBase: number): string[] {
    const parts: string[] = []
    const steps = form.workSteps || []
    const stepRows: Row[] = [
        bannerRow('③④ 작업순서 및 안전작업 방법'),
        {
            height: 1400,
            cells: [
                { text: '작업명', span: 2, header: true, cp: 4, align: 'center' },
                { text: '작업순서 및 작업내용', span: 4, header: true, cp: 4, align: 'center' },
                { text: '위험요소', span: 2, header: true, cp: 4, align: 'center' },
                { text: '안전작업방법', span: 3, header: true, cp: 4, align: 'center' },
                { text: '비고', span: 1, header: true, cp: 4, align: 'center' },
            ],
        },
    ]
    const stepEntries = steps.length > 0 ? steps : [{ workName: '', sequenceAndContent: '', riskFactor: '', safeMethod: '', note: '' }]
    for (const step of stepEntries) {
        stepRows.push({
            height: Math.max(
                estRowH(1400, step.workName, col12(2)),
                estRowH(1400, step.sequenceAndContent, col12(4)),
                estRowH(1400, step.riskFactor, col12(2)),
                estRowH(1400, step.safeMethod, col12(3)),
                estRowH(1400, step.note, col12(1)),
            ),
            cells: [
                { text: step.workName, span: 2, cp: 7 },
                { text: step.sequenceAndContent, span: 4, cp: 7 },
                { text: step.riskFactor, span: 2, cp: 7 },
                { text: step.safeMethod, span: 3, cp: 7 },
                { text: step.note, span: 1, cp: 7, align: 'center' },
            ],
        })
    }
    const stepPages = paginateRows(stepRows, CONTENT_HEIGHT)
    stepPages.forEach((rows, i) => {
        parts.push(buildTableParagraph(COLS12, rows, tblIdBase + i, 10 + i, { pageBreak: true }))
    })

    // 작업순서 표 마지막 쪽의 남은 예산부터 체크리스트를 이어 담는다
    const lastStepsH = stepPages[stepPages.length - 1].reduce((a, r) => a + r.height, 0)
    const rows = checklistRows('산업재해 예방을 위한 체크리스트', ELECTRIC_CHECKLIST, form.checklist || [])
    paginateRows(rows, CONTENT_HEIGHT - lastStepsH).forEach((pageRows, i) => {
        parts.push(buildTableParagraph(COLS12, pageRows, tblIdBase + 5 + i, 15 + i, { pageBreak: i > 0 }))
    })
    return parts
}

// ── 인계·인수 + ⑩ 첨부자료 (서명 좌표 고정을 위해 전용 쪽) ──

function buildHandoverParts(
    form: ElectricForm,
    collector: ImageCollector,
    sigIds: Partial<Record<'handoverDeliverer' | 'handoverReceiver', string | null>>,
    tblIdBase: number,
): string[] {
    const details = form.handover?.details || ''
    const contentH = estRowH(6803, details, col12(6)) // 내용 칸 약 24mm
    const SIGN_H = 1700
    const handoverRows: Row[] = [
        bannerRow('인계·인수사항'),
        {
            height: 1400,
            cells: [
                { text: '인계사항', span: 6, header: true, cp: 4, align: 'center' },
                { text: '인수사항', span: 6, header: true, cp: 4, align: 'center' },
            ],
        },
        {
            height: contentH,
            cells: [
                { text: details, span: 6, cp: 7, top: true },
                { text: '', span: 6, top: true },
            ],
        },
        {
            height: SIGN_H,
            cells: [
                { text: `인계자 : ${form.handover?.deliverer || ''} (인)`, span: 6, align: 'right' },
                { text: `인수자 : ${form.handover?.receiver || ''} (인)`, span: 6, align: 'right' },
            ],
        },
    ]

    // (인) 문구 위 서명 겹침 — 이 표는 항상 쪽 최상단이라 y가 고정된다
    const signY = PAGE_CONTENT_TOP + 1300 + 1400 + contentH
    const floats: string[] = []
    const specs: Array<[string | null | undefined, number]> = [
        [sigIds.handoverDeliverer, PAGE_LEFT + col12(6) - 4800],
        [sigIds.handoverReceiver, PAGE_LEFT + col12(12) - 4800],
    ]
    for (const [picId, cellX] of specs) {
        if (picId) floats.push(signatureFloat(collector, { picId, cellX, cellW: 4400, rowY: signY, rowH: SIGN_H, maxW: 3600, maxH: 1400 }))
    }

    const selected = new Set(form.attachments || [])
    const facBoxes = ELECTRIC_ATTACHMENT_OPTIONS.facility.map(t => checkbox(t, selected.has(t))).join('  ')
    const safBoxes = ELECTRIC_ATTACHMENT_OPTIONS.safety.map(t => checkbox(t, selected.has(t))).join('  ')
    const attachRows: Row[] = [
        bannerRow('⑩ <첨부자료>'),
        {
            height: estRowH(1500, facBoxes, col12(10)),
            cells: [
                { text: '설  비', span: 2, header: true, cp: 4, align: 'center' },
                { text: facBoxes, span: 10, cp: 7 },
            ],
        },
        {
            height: estRowH(1500, safBoxes, col12(10)),
            cells: [
                { text: '안  전', span: 2, header: true, cp: 4, align: 'center' },
                { text: safBoxes, span: 10, cp: 7 },
            ],
        },
    ]

    return [
        buildTableParagraph(COLS12, handoverRows, tblIdBase + 1, 20, { pageBreak: true, floats }),
        buildTableParagraph(COLS12, attachRows, tblIdBase + 2, 21),
    ]
}

// ── 전기도면·현장사진 별지 (2열 격자, 없으면 생략) ──

const PHOTO_ROW_H = 26929 // 사진 칸 약 95mm

function buildPhotoParts(collector: ImageCollector, photoIds: string[], tblIdBase: number): string[] {
    if (photoIds.length === 0) return []
    const photoCell = (id: string | undefined): Row['cells'][number] => {
        if (!id) return { text: '', span: 6 }
        const size = fitImage(collector.find(id), col12(6) - CELL_PAD, PHOTO_ROW_H - 600)
        return { picId: id, picW: size.w, picH: size.h, span: 6 }
    }
    const rows: Row[] = [bannerRow('<전기도면, 현장사진 등>')]
    for (let i = 0; i < photoIds.length; i += 2) {
        rows.push({ height: PHOTO_ROW_H, cells: [photoCell(photoIds[i]), photoCell(photoIds[i + 1])] })
    }
    return paginateRows(rows, CONTENT_HEIGHT).map((pageRows, i) =>
        buildTableParagraph(COLS12, pageRows, tblIdBase + i, 30 + i, { pageBreak: true }),
    )
}

// ── 다운로드 진입점 ──

export async function downloadElectricWorkPlanHwpx(record: WorkPlanRecord): Promise<void> {
    const form = record.form_data.electric
    if (!form) throw new Error('전기 작업계획서 데이터가 없습니다.')

    resetHwpxSeqs()
    const collector = new ImageCollector()
    // 서명은 투명 PNG 원본 그대로, 현장사진은 흰 배경 JPEG로 정규화해 수집
    const s = form.signatures
    const sigIds = {
        approvalManager: s?.approvalManager ? await collector.collect(s.approvalManager, true) : null,
        approvalApprover: s?.approvalApprover ? await collector.collect(s.approvalApprover, true) : null,
        instructionManager: s?.instructionManager ? await collector.collect(s.instructionManager, true) : null,
        instructionWorker: s?.instructionWorker ? await collector.collect(s.instructionWorker, true) : null,
        handoverDeliverer: s?.handoverDeliverer ? await collector.collect(s.handoverDeliverer, true) : null,
        handoverReceiver: s?.handoverReceiver ? await collector.collect(s.handoverReceiver, true) : null,
    }
    const photoIds: string[] = []
    for (const url of record.site_photo_urls || []) {
        const id = await collector.collect(url, false)
        if (id) photoIds.push(id)
    }

    const parts: string[] = [
        ...buildCoverParts('electric', 1000000000),
        ...buildMainParts(form, collector, sigIds, 1000000100),
        ...buildStepsAndChecklistParts(form, 1000000200),
        ...buildHandoverParts(form, collector, sigIds, 1000000300),
        ...buildPhotoParts(collector, photoIds, 1000000400),
    ]

    const blob = await assembleHwpxBlob(parts, collector, DOC_TITLE)
    const fileName = buildFileName('electric', record.title, record.work_start_date).replace(/\.pdf$/, '.hwpx')
    triggerDownload(blob, fileName)
}
