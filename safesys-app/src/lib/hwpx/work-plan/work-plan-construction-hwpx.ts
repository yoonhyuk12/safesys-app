// 붙임2-2 차량계 건설기계 등 사용 작업계획서를 한글문서(hwpx)로 조립·다운로드 (PDF 페이지 구성과 동일 내용·순서)
import {
    CONSTRUCTION_CHECKLIST,
    CONSTRUCTION_SURVEY_ITEMS,
    CONSTRUCTION_SURVEY_TYPE_OPTIONS,
} from '@/lib/work-plan/constants'
import type { WorkPlanRecord } from '@/lib/work-plan/types'
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
    buildTextParagraph,
    checklistRows,
    clampRowHeights,
    col12,
    fitImage,
    mapSectionRows,
    paginateRows,
    resetHwpxSeqs,
    riskControlRows,
    signatureFloat,
    triggerDownload,
} from './work-plan-hwpx-common'

type ConstructionForm = NonNullable<WorkPlanRecord['form_data']['construction']>

const DOC_TITLE = '차량계 건설기계 등 사용 작업계획서'

// ── 사전조사표 — 선택된 surveyType의 항목만, 조사내용=finding, photoUrl 있으면 이미지 셀 ──

const SURVEY_ROW_H = 11339 // 항목 행 약 40mm

function buildSurveyParts(form: ConstructionForm, collector: ImageCollector, photoIds: (string | null)[], tblId: number): string[] {
    const items = CONSTRUCTION_SURVEY_ITEMS[form.surveyType] || []
    const typeLabel = CONSTRUCTION_SURVEY_TYPE_OPTIONS.find(o => o.value === form.surveyType)?.label || ''
    const byIndex = new Map(form.surveyEntries?.map(entry => [entry.itemIndex, entry]) || [])

    const rows: Row[] = [
        {
            height: 1400,
            cells: [
                { text: '사전조사 항목', span: 5, header: true, cp: 4, align: 'center' },
                { text: '조사내용', span: 4, header: true, cp: 4, align: 'center' },
                { text: '현장사진', span: 3, header: true, cp: 4, align: 'center' },
            ],
        },
        ...items.map((label, i) => {
            const entry = byIndex.get(i)
            const photoId = photoIds[i]
            const photoCell = photoId
                ? (() => {
                    const size = fitImage(collector.find(photoId), col12(3) - CELL_PAD, SURVEY_ROW_H - 800)
                    return { picId: photoId, picW: size.w, picH: size.h, span: 3 }
                })()
                : { text: '', span: 3 }
            return {
                height: SURVEY_ROW_H,
                cells: [
                    { text: `◦ ${label}`, span: 5, cp: 7, top: true },
                    { text: entry?.finding || '', span: 4, cp: 7, top: true },
                    photoCell,
                ],
            }
        }),
    ]

    return [
        buildTextParagraph('□ 사전조사표', { cp: 6, pageBreak: true }),
        buildTextParagraph(`❍ ${typeLabel}`),
        buildTableParagraph(COLS12, rows, tblId, 2),
    ]
}

// ── 본표(결재란·기본정보) + 작업계획도(지도) + 종류·성능 ──

function buildMainParts(
    form: ConstructionForm,
    collector: ImageCollector,
    sigIds: Partial<Record<'approvalManager' | 'approvalApprover' | 'workDirector' | 'operator' | 'guide', string | null>>,
    mapId: string | null,
    tblIdBase: number,
): string[] {
    const parts: string[] = []
    const floats: string[] = approvalSignatureFloats(collector, sigIds.approvalManager, sigIds.approvalApprover)
    const approvalRows = approvalHeaderRows('차량계 건설기계 등 작업계획서', form.approvalNames)

    const workers = (form.workerNames || []).join(', ')
    const period = [form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ ')
    const sequence = (form.workSequence || []).join(' → ')
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
                { text: '차량 번호', span: 2, header: true, cp: 4, align: 'center' },
                { text: '', span: 4 },
                { text: '작업시간', span: 2, header: true, cp: 4, align: 'center' },
                { text: '', span: 4 },
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
        {
            height: BASE_H,
            cells: [
                { text: '작업지휘자', span: 2, header: true, cp: 4, align: 'center' },
                { text: '성명', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.workDirector?.name || '', span: 4, align: 'center' },
                { text: '연락처', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.workDirector?.phone || '', span: 3, align: 'center' },
            ],
        },
        {
            height: BASE_H,
            cells: [
                { text: '운전원', span: 2, header: true, cp: 4, align: 'center' },
                { text: '성명', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.operator?.name || '', span: 3, align: 'center' },
                { text: '연락처', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.operator?.phone || '', span: 2, align: 'center' },
                { text: '면허', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.operatorLicense, span: 2, align: 'center' },
            ],
        },
        {
            height: BASE_H,
            cells: [
                { text: '유도자', span: 2, header: true, cp: 4, align: 'center' },
                { text: '성명', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.guide?.name || '', span: 3, align: 'center' },
                { text: '연락처', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.guide?.phone || '', span: 2, align: 'center' },
                { text: '신호방법', span: 1, header: true, cp: 4, align: 'center' },
                { text: form.guideSignalMethod, span: 2, align: 'center' },
            ],
        },
        {
            height: BASE_H,
            cells: [
                { text: '작업방법', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.workMethod, span: 10 },
            ],
        },
        {
            height: BASE_H,
            cells: [
                { text: '작업순서', span: 2, header: true, cp: 4, align: 'center' },
                { text: sequence, span: 10 },
            ],
        },
    ]
    // 내용이 긴 셀(면허·작업방법 등)이 행을 키우면 아래 행 y가 밀리므로 선언 높이를 추정 렌더 높이로 끌어올린다
    const mainRows = clampRowHeights(rawRows, COLS12)

    // 성명 위 서명 겹침 — 지휘자는 4열 폭, 운전원·유도자는 3열 폭 성명 셀 (인물 행은 3번 행부터)
    const mainTop = PAGE_CONTENT_TOP + APPROVAL_HEAD_H + APPROVAL_SIGN_H
    const personFloats: Array<{ role: 'workDirector' | 'operator' | 'guide'; span: number; rowIndex: number }> = [
        { role: 'workDirector', span: 4, rowIndex: 3 },
        { role: 'operator', span: 3, rowIndex: 4 },
        { role: 'guide', span: 3, rowIndex: 5 },
    ]
    for (const p of personFloats) {
        const picId = sigIds[p.role]
        if (picId) {
            floats.push(signatureFloat(collector, {
                picId,
                cellX: PAGE_LEFT + col12(3),
                cellW: col12(p.span),
                rowY: mainTop + mainRows.slice(0, p.rowIndex).reduce((a, r) => a + r.height, 0),
                rowH: mainRows[p.rowIndex].height,
                maxW: 4200,
                maxH: 1500,
            }))
        }
    }

    // 종류·성능 표
    const e = form.equipment
    const specRows: Row[] = [
        bannerRow('<차량계 건설기계 종류 및 성능>'),
        {
            height: 1500,
            cells: [
                { text: '장비명', span: 3, header: true, cp: 4, align: 'center' },
                { text: e.equipmentName, span: 3, align: 'center' },
                { text: '등록번호', span: 3, header: true, cp: 4, align: 'center' },
                { text: e.registrationNumber, span: 3, align: 'center' },
            ],
        },
        {
            height: 1500,
            cells: [
                { text: '차체중량', span: 3, header: true, cp: 4, align: 'center' },
                { text: e.bodyWeight, span: 3, align: 'center' },
                { text: '능력', span: 3, header: true, cp: 4, align: 'center' },
                { text: e.capacity, span: 3, align: 'center' },
            ],
        },
    ]

    parts.push(buildTableParagraph(COLS_APPROVAL, approvalRows, tblIdBase + 1, 3, { pageBreak: true, floats }))
    parts.push(buildTableParagraph(COLS12, mainRows, tblIdBase + 2, 4))
    parts.push(buildTableParagraph(COLS12, mapSectionRows('차량계 건설기계 작업계획도', collector, mapId), tblIdBase + 3, 5))
    parts.push(buildTableParagraph(COLS12, specRows, tblIdBase + 4, 6))
    return parts
}

// ── 위험요인 + 체크리스트 (PDF 3쪽과 동일하게 한 쪽에서 이어 배치) ──

function buildRiskAndChecklistParts(form: ConstructionForm, tblIdBase: number): string[] {
    const parts: string[] = []
    const riskRows = riskControlRows('<위험요인 및 개선대책>', '작업순서', form.riskControls || [])
    const riskPages = paginateRows(riskRows, CONTENT_HEIGHT)
    riskPages.forEach((rows, i) => {
        parts.push(buildTableParagraph(COLS12, rows, tblIdBase + i, 10 + i, { pageBreak: true }))
    })

    // 위험표 마지막 쪽의 남은 예산부터 체크리스트를 이어 담는다
    const lastRiskH = riskPages[riskPages.length - 1].reduce((a, r) => a + r.height, 0)
    const rows = checklistRows('<산업재해 예방을 위한 체크리스트>', CONSTRUCTION_CHECKLIST, form.checklist || [])
    paginateRows(rows, CONTENT_HEIGHT - lastRiskH).forEach((pageRows, i) => {
        parts.push(buildTableParagraph(COLS12, pageRows, tblIdBase + 5 + i, 15 + i, { pageBreak: i > 0 }))
    })
    return parts
}

// ── 다운로드 진입점 ──

export async function downloadConstructionWorkPlanHwpx(record: WorkPlanRecord): Promise<void> {
    const form = record.form_data.construction
    if (!form) throw new Error('건설기계 작업계획서 데이터가 없습니다.')

    resetHwpxSeqs()
    const collector = new ImageCollector()
    // 지도·현장사진은 흰 배경 JPEG로 정규화, 서명은 투명 PNG 원본 그대로 수집
    const mapId = await collector.collect(record.map_image_url, false)
    const items = CONSTRUCTION_SURVEY_ITEMS[form.surveyType] || []
    const byIndex = new Map(form.surveyEntries?.map(entry => [entry.itemIndex, entry]) || [])
    const photoIds: (string | null)[] = []
    for (let i = 0; i < items.length; i++) {
        const url = byIndex.get(i)?.photoUrl
        photoIds.push(url ? await collector.collect(url, false) : null)
    }
    const s = form.signatures
    const sigIds = {
        approvalManager: s?.approvalManager ? await collector.collect(s.approvalManager, true) : null,
        approvalApprover: s?.approvalApprover ? await collector.collect(s.approvalApprover, true) : null,
        workDirector: s?.workDirector ? await collector.collect(s.workDirector, true) : null,
        operator: s?.operator ? await collector.collect(s.operator, true) : null,
        guide: s?.guide ? await collector.collect(s.guide, true) : null,
    }

    const parts: string[] = [
        ...buildCoverParts('construction', 1000000000),
        ...buildSurveyParts(form, collector, photoIds, 1000000050),
        ...buildMainParts(form, collector, sigIds, mapId, 1000000100),
        ...buildRiskAndChecklistParts(form, 1000000200),
    ]

    const blob = await assembleHwpxBlob(parts, collector, DOC_TITLE)
    const fileName = buildFileName('construction', record.title, record.work_start_date).replace(/\.pdf$/, '.hwpx')
    triggerDownload(blob, fileName)
}
