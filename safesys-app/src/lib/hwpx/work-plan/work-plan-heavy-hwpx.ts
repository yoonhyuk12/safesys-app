// 붙임2-4 중량물 취급 작업계획서를 한글문서(hwpx)로 조립·다운로드 (PDF 페이지 구성과 동일 내용·순서)
import { HEAVY_CHECKLIST } from '@/lib/work-plan/constants'
import type { WorkPlanRecord } from '@/lib/work-plan/types'
import { buildFileName } from '@/lib/reports/work-plan/work-plan-pdf-common'
import {
    CONTENT_HEIGHT,
    PAGE_CONTENT_TOP,
    PAGE_LEFT,
    APPROVAL_HEAD_H,
    APPROVAL_SIGN_H,
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
    checklistRows,
    clampRowHeights,
    col12,
    estRowH,
    liftingReviewRows,
    mapSectionRows,
    paginateRows,
    resetHwpxSeqs,
    riggingReviewRows,
    riskControlRows,
    signatureFloat,
    triggerDownload,
} from './work-plan-hwpx-common'

type HeavyForm = NonNullable<WorkPlanRecord['form_data']['heavy']>

const DOC_TITLE = '중량물 취급 작업계획서'

// ── 본표(결재란·기본정보) + 운반경로(지도) ──

function buildMainParts(
    form: HeavyForm,
    collector: ImageCollector,
    sigIds: Partial<Record<'approvalManager' | 'approvalApprover' | 'workDirector' | 'operator' | 'guide', string | null>>,
    mapId: string | null,
    tblIdBase: number,
): string[] {
    const parts: string[] = []
    const floats: string[] = approvalSignatureFloats(collector, sigIds.approvalManager, sigIds.approvalApprover)
    const approvalRows = approvalHeaderRows('중량물 취급 작업계획서', form.approvalNames)

    const workers = (form.workerNames || []).join(', ')
    const period = [form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ ')
    const BASE_H = 1700
    const rawRows: Row[] = [
        {
            height: BASE_H,
            cells: [
                { text: '작업명(장소)', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.title, span: 4, align: 'center' },
                { text: '작업기간', span: 2, header: true, cp: 4, align: 'center' },
                { text: period, span: 4, align: 'center' },
            ],
        },
        {
            height: BASE_H,
            cells: [
                { text: '작업업체', span: 2, header: true, cp: 4, align: 'center' },
                { text: '업체명', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.companyName, span: 3, align: 'center' },
                { text: '작업자', span: 2, header: true, cp: 4, align: 'center' },
                { text: workers, span: 3, align: 'center' },
            ],
        },
    ]
    const persons = [
        { label: '작업지휘자', role: 'workDirector' as const, person: form.workDirector },
        { label: '운전원', role: 'operator' as const, person: form.operator },
        { label: '유도자', role: 'guide' as const, person: form.guide },
    ]
    for (const p of persons) {
        rawRows.push({
            height: BASE_H,
            cells: [
                { text: p.label, span: 2, header: true, cp: 4, align: 'center' },
                { text: '성명', span: 1, header: true, cp: 4, align: 'center' },
                { text: p.person?.name || '', span: 4, align: 'center' },
                { text: '연락처', span: 2, header: true, cp: 4, align: 'center' },
                { text: p.person?.phone || '', span: 3, align: 'center' },
            ],
        })
    }
    rawRows.push({
        height: BASE_H,
        cells: [
            { text: '작업내용 공유', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.sharedWorkContent, span: 10 },
        ],
    })
    // 내용이 긴 셀이 행을 키우면 아래 행 y가 밀리므로 선언 높이를 추정 렌더 높이로 끌어올린다
    const mainRows = clampRowHeights(rawRows, COLS12)

    // 성명 위 서명 겹침 (인물 행은 2번 행부터)
    const mainTop = PAGE_CONTENT_TOP + APPROVAL_HEAD_H + APPROVAL_SIGN_H
    persons.forEach((p, i) => {
        const picId = sigIds[p.role]
        if (picId) {
            const rowIndex = 2 + i
            floats.push(signatureFloat(collector, {
                picId,
                cellX: PAGE_LEFT + col12(3),
                cellW: col12(4),
                rowY: mainTop + mainRows.slice(0, rowIndex).reduce((a, r) => a + r.height, 0),
                rowH: mainRows[rowIndex].height,
                maxW: 4200,
                maxH: 1500,
            }))
        }
    })

    parts.push(buildTableParagraph(COLS_APPROVAL, approvalRows, tblIdBase + 1, 1, { pageBreak: true, floats }))
    parts.push(buildTableParagraph(COLS12, mainRows, tblIdBase + 2, 2))
    parts.push(buildTableParagraph(COLS12, mapSectionRows('<운반경로 등>', collector, mapId), tblIdBase + 3, 3))
    return parts
}

// ── 중량물/기계 제원 + 인양·줄걸이 검토 + 작업별 위험요인 ──

function buildSpecParts(form: HeavyForm, tblIdBase: number): string[] {
    const parts: string[] = []
    const l = form.load
    const m = form.machine
    const SPEC_H = 1500

    const loadRows: Row[] = [
        bannerRow('<중량물제원>'),
        {
            height: SPEC_H,
            cells: [
                { text: '품 명', span: 3, header: true, cp: 4, align: 'center' },
                { text: l.itemName, span: 3, align: 'center' },
                { text: '중량물 형상', span: 3, header: true, cp: 4, align: 'center' },
                { text: l.shape, span: 3, align: 'center' },
            ],
        },
        {
            height: SPEC_H,
            cells: [
                { text: '중량물 규격', span: 3, header: true, cp: 4, align: 'center' },
                { text: l.dimensions || '(너비)×(길이)×(높이)', span: 9 },
            ],
        },
        {
            height: SPEC_H,
            cells: [
                { text: '중량', span: 3, header: true, cp: 4, align: 'center' },
                { text: l.weightKg ? `${l.weightKg} kg` : ' kg', span: 3, align: 'center' },
                { text: '1회 운반중량', span: 3, header: true, cp: 4, align: 'center' },
                { text: l.transportWeightKg ? `${l.transportWeightKg} kg` : ' kg', span: 3, align: 'center' },
            ],
        },
        {
            height: estRowH(SPEC_H, l.fixingMethod, col12(9)),
            cells: [
                { text: '고정방법', span: 3, header: true, cp: 4, align: 'center' },
                { text: l.fixingMethod, span: 9 },
            ],
        },
    ]

    const machinePairs: Array<[string, string, string, string]> = [
        ['기계명(장비)', m.machineName, '형식번호', m.modelNumber],
        ['거더형식', m.girderType, '기계규격', m.machineSpecification],
        ['제조년월일', m.manufacturedDate, '보험가입여부', m.insured],
        ['정격하중', m.ratedLoad, '조작방식', m.controlMethod],
        ['검사여부', m.inspectionResult, '유효기간', m.validityPeriod],
    ]
    const machineRows: Row[] = [bannerRow('<기계제원(크레인 등)>')]
    for (const [l1, v1, l2, v2] of machinePairs) {
        machineRows.push({
            height: SPEC_H,
            cells: [
                { text: l1, span: 3, header: true, cp: 4, align: 'center' },
                { text: v1, span: 3, align: 'center' },
                { text: l2, span: 3, header: true, cp: 4, align: 'center' },
                { text: v2, span: 3, align: 'center' },
            ],
        })
    }

    parts.push(buildTableParagraph(COLS12, loadRows, tblIdBase + 1, 4, { pageBreak: true }))
    parts.push(buildTableParagraph(COLS12, machineRows, tblIdBase + 2, 5))
    parts.push(buildTableParagraph(COLS12, liftingReviewRows(form.liftingReview), tblIdBase + 3, 6))
    parts.push(buildTableParagraph(COLS12, riggingReviewRows(form.riggingReview), tblIdBase + 4, 7))

    // 위험표는 흐름에 이어 배치 — 한 쪽 예산을 넘는 표만 분할해 잘림을 막는다
    const riskRows = riskControlRows('<작업별 위험요인 및 개선대책>', '작업', form.riskControls || [])
    paginateRows(riskRows, CONTENT_HEIGHT).forEach((rows, i) => {
        parts.push(buildTableParagraph(COLS12, rows, tblIdBase + 5 + i, 8 + i, { pageBreak: i > 0 }))
    })
    return parts
}

// ── 다운로드 진입점 ──

export async function downloadHeavyWorkPlanHwpx(record: WorkPlanRecord): Promise<void> {
    const form = record.form_data.heavy
    if (!form) throw new Error('중량물 취급 작업계획서 데이터가 없습니다.')

    resetHwpxSeqs()
    const collector = new ImageCollector()
    // 지도는 흰 배경 JPEG로 정규화, 서명은 투명 PNG 원본 그대로 수집
    const mapId = await collector.collect(record.map_image_url, false)
    const s = form.signatures
    const sigIds = {
        approvalManager: s?.approvalManager ? await collector.collect(s.approvalManager, true) : null,
        approvalApprover: s?.approvalApprover ? await collector.collect(s.approvalApprover, true) : null,
        workDirector: s?.workDirector ? await collector.collect(s.workDirector, true) : null,
        operator: s?.operator ? await collector.collect(s.operator, true) : null,
        guide: s?.guide ? await collector.collect(s.guide, true) : null,
    }

    const checklistParts = paginateRows(
        checklistRows('<산업재해 예방을 위한 체크리스트>', HEAVY_CHECKLIST, form.checklist || []),
        CONTENT_HEIGHT,
    ).map((rows, i) => buildTableParagraph(COLS12, rows, 1000000300 + i, 20 + i, { pageBreak: true }))

    const parts: string[] = [
        ...buildCoverParts('heavy', 1000000000),
        ...buildMainParts(form, collector, sigIds, mapId, 1000000100),
        ...buildSpecParts(form, 1000000200),
        ...checklistParts,
    ]

    const blob = await assembleHwpxBlob(parts, collector, DOC_TITLE)
    const fileName = buildFileName('heavy', record.title, record.work_start_date).replace(/\.pdf$/, '.hwpx')
    triggerDownload(blob, fileName)
}
