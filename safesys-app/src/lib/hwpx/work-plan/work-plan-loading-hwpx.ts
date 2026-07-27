// 붙임2-1 차량계 하역운반기계 등 사용 작업계획서를 한글문서(hwpx)로 조립·다운로드 (PDF 페이지 구성과 동일 내용·순서)
import {
    LOADING_CHECKLIST,
    WORK_PLAN_COVERS,
    MAP_LEGEND,
    MAP_FOCUS_ITEMS,
    MAP_FOOTNOTE,
    LIFTING_CAPACITY_NOTES,
    LIFTING_CAPACITY_FORMULA,
    RIGGING_CAPACITY_FORMULA,
    RIGGING_SAFETY_RATIO_FORMULA,
    CAPACITY_WARNING,
    SAFETY_FACTORS,
    TENSION_FACTORS,
} from '@/lib/work-plan/constants'
import type { ChecklistAnswer, ChecklistResult, RiskControlRow, WorkPlanRecord } from '@/lib/work-plan/types'
import { buildFileName } from '@/lib/reports/work-plan/work-plan-pdf-common'
import {
    CONTENT_HEIGHT,
    CONTENT_WIDTH,
    PAGE_CONTENT_TOP,
    PAGE_LEFT,
    CELL_PAD,
    ImageCollector,
    type Row,
    assembleHwpxBlob,
    buildFloatingPicXml,
    buildTableParagraph,
    buildTextParagraph,
    estRowH,
    fitImage,
    innerParagraph,
    innerPicParagraph,
    paginateRows,
    resetHwpxSeqs,
    sumRange,
    triggerDownload,
} from './work-plan-hwpx-common'

type LoadingForm = NonNullable<WorkPlanRecord['form_data']['loading']>

const DOC_TITLE = '차량계 하역운반기계 등 사용 작업계획서'

// 12열 균등 그리드 (합 = 51024)
const COLS12 = Array.from({ length: 12 }, () => 4252)
// 결재란 그리드 — PDF 열비(72% / 5% / 11.5% / 11.5%)를 본문 폭으로 환산
const COLS_APPROVAL = [36737, 2551, 5868, 5868]

const col12 = (span: number) => sumRange(COLS12, 0, span)

function numOrBlank(n: number | null | undefined): string {
    return n === null || n === undefined || Number.isNaN(n) ? '' : String(n)
}

function checkbox(label: string, checked: boolean): string {
    return `${checked ? '■' : '□'} ${label}`
}

// 회색 배너 행(섹션 제목) — 표 밖 문단 제목은 표만 다음 쪽으로 밀리는 함정이 있어 표의 첫 행으로 넣는다
function bannerRow(text: string): Row {
    return { height: 1300, cells: [{ text, span: 12, header: true, cp: 5, align: 'center' }] }
}

// ── 표지 (원본 붙임 양식 1쪽 재현) ──

function buildCoverParts(tblId: number): string[] {
    const cover = WORK_PLAN_COVERS.loading
    const parts: string[] = []
    const spacer = (n: number) => {
        for (let i = 0; i < n; i++) parts.push(buildTextParagraph(''))
    }

    // 상단 파란 개정 주석 — 문서 첫 문단이므로 구역 속성 포함
    parts.push(buildTextParagraph(cover.headerNote, { cp: 11, secPr: true }))
    spacer(8)

    // 중앙 제목 상자 (두꺼운 테두리)
    const boxW = 30000
    const titleBody = cover.titleLines.map(line => innerParagraph(line, 8, 'center', boxW - CELL_PAD)).join('')
    parts.push(buildTableParagraph([boxW], [
        { height: 8200, cells: [{ bodyXml: titleBody, bf: 4 }] },
    ], tblId, 1, { center: true }))
    spacer(6)

    // [작업계획서 내용] 목록
    for (const section of cover.sections) {
        parts.push(buildTextParagraph(section.heading, { cp: 6, center: true }))
        parts.push(buildTextParagraph(''))
        for (const item of section.items) {
            parts.push(buildTextParagraph(item, { cp: 10, center: true }))
        }
    }
    spacer(18)

    // 하단 파란 ※주석
    if (cover.footnote) parts.push(buildTextParagraph(cover.footnote, { cp: 11 }))
    return parts
}

// ── 본표(결재란·기본정보·제원·인양/줄걸이 검토) ──

interface SignatureFloatSpec {
    picId: string
    cellX: number      // 서명이 놓일 셀의 시작 x (쪽 기준)
    cellW: number
    rowY: number       // 행 시작 y (쪽 기준)
    rowH: number
    maxW: number
    maxH: number
}

// 성명 텍스트 위에 손글씨 서명을 겹친다 (쪽 기준 절대좌표, 셀 중앙)
function signatureFloat(collector: ImageCollector, spec: SignatureFloatSpec): string {
    const size = fitImage(collector.find(spec.picId), spec.maxW, spec.maxH)
    const x = spec.cellX + Math.round((spec.cellW - size.w) / 2)
    const y = spec.rowY + Math.round((spec.rowH - size.h) / 2)
    return buildFloatingPicXml(spec.picId, size.w, size.h, x, y)
}

function buildMainAndSpecParts(
    form: LoadingForm,
    collector: ImageCollector,
    sigIds: Partial<Record<'approvalManager' | 'approvalApprover' | 'workDirector' | 'operator' | 'guide', string | null>>,
    tblIdBase: number,
): string[] {
    const parts: string[] = []
    const floats: string[] = []

    // ── 결재란 + 제목 ──
    const APPROVAL_HEAD_H = 1200
    const APPROVAL_SIGN_H = 3600
    const titleBody = innerParagraph('차량계 하역운반기계 작업계획서', 2, 'center', COLS_APPROVAL[0] - CELL_PAD)
        + innerParagraph('(수급업체용)', 7, 'center', COLS_APPROVAL[0] - CELL_PAD)
    const approvalRows: Row[] = [
        {
            height: APPROVAL_HEAD_H,
            cells: [
                { bodyXml: titleBody, rowSpan: 2 },
                { text: '결\n재', rowSpan: 2, header: true, cp: 1, align: 'center' },
                { text: '담당', header: true, cp: 4, align: 'center' },
                { text: '승인', header: true, cp: 4, align: 'center' },
            ],
        },
        {
            height: APPROVAL_SIGN_H,
            cells: [
                { text: form.approvalNames?.approvalManager || '', cp: 7, align: 'center' },
                { text: form.approvalNames?.approvalApprover || '', cp: 7, align: 'center' },
            ],
        },
    ]
    const approvalSignY = PAGE_CONTENT_TOP + APPROVAL_HEAD_H
    const approvalCells: Array<['approvalManager' | 'approvalApprover', number]> = [
        ['approvalManager', PAGE_LEFT + COLS_APPROVAL[0] + COLS_APPROVAL[1]],
        ['approvalApprover', PAGE_LEFT + COLS_APPROVAL[0] + COLS_APPROVAL[1] + COLS_APPROVAL[2]],
    ]
    for (const [role, cellX] of approvalCells) {
        const picId = sigIds[role]
        if (picId) floats.push(signatureFloat(collector, { picId, cellX, cellW: 5868, rowY: approvalSignY, rowH: APPROVAL_SIGN_H, maxW: 5000, maxH: 2800 }))
    }

    // ── 기본정보 표 ──
    const workers = (form.workerNames || []).join(', ')
    const period = [form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ ')
    const BASE_H = 1700
    const h1 = estRowH(BASE_H, form.title, col12(4))
    const h2 = BASE_H
    const h3 = estRowH(BASE_H, workers, col12(3))
    const h7 = estRowH(BASE_H, form.sharedWorkContent, col12(10))
    const mainRows: Row[] = [
        {
            height: h1,
            cells: [
                { text: '작업명(장소)', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.title, span: 4, align: 'center' },
                { text: '작업기간', span: 2, header: true, cp: 4, align: 'center' },
                { text: period, span: 4, align: 'center' },
            ],
        },
        {
            height: h2,
            cells: [
                { text: '차량 번호', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.vehicleNumber, span: 4, align: 'center' },
                { text: '작업시간', span: 2, header: true, cp: 4, align: 'center' },
                { text: form.workTime, span: 4, align: 'center' },
            ],
        },
        {
            height: h3,
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
        mainRows.push({
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
    mainRows.push({
        height: h7,
        cells: [
            { text: '작업내용 공유', span: 2, header: true, cp: 4, align: 'center' },
            { text: form.sharedWorkContent, span: 10 },
        ],
    })

    // 성명 위 서명 겹침 — 성명 값 셀(4열 시작, 폭 4열)의 행 y를 누적 높이로 계산
    const mainTop = PAGE_CONTENT_TOP + APPROVAL_HEAD_H + APPROVAL_SIGN_H
    const personTop = mainTop + h1 + h2 + h3
    const personRowYs = [personTop, personTop + BASE_H, personTop + BASE_H * 2]
    persons.forEach((p, i) => {
        const picId = sigIds[p.role]
        if (picId) {
            floats.push(signatureFloat(collector, {
                picId,
                cellX: PAGE_LEFT + col12(3),
                cellW: col12(4),
                rowY: personRowYs[i],
                rowH: BASE_H,
                maxW: 4200,
                maxH: 1500,
            }))
        }
    })

    // ── 장비 제원 표 ──
    const e = form.equipment
    const SPEC_H = 1500
    const specPairs: Array<[string, string, string, string]> = [
        ['장비명', e.equipmentName, '차량/장비번호', e.registrationNumber],
        ['모델명/생산년도', e.modelAndYear, '보험기간', e.insurancePeriod],
        ['소유회사명', e.ownerCompany, '검사유효기간', e.inspectionValidity],
        ['차체 중량', e.bodyWeightTon ? `${e.bodyWeightTon} ton` : ' ton', '장비폭', e.widthM ? `${e.widthM} m` : ' m'],
        ['최소선회반경', e.minimumTurningRadiusM ? `${e.minimumTurningRadiusM} m` : ' m', '최대인양높이', e.maximumLiftingHeightM ? `${e.maximumLiftingHeightM} m` : ' m'],
        ['작업반경', e.workingRadiusM ? `${e.workingRadiusM} m` : ' m', '인양·운반하중', e.maxAndRatedLoadTon || '최대( )t / 정격( )t'],
    ]
    const specRows: Row[] = [bannerRow('<차량계 하역운반기계 제원>')]
    for (const [l1, v1, l2, v2] of specPairs) {
        specRows.push({
            height: SPEC_H,
            cells: [
                { text: l1, span: 3, header: true, cp: 4, align: 'center' },
                { text: v1, span: 3, align: 'center' },
                { text: l2, span: 3, header: true, cp: 4, align: 'center' },
                { text: v2, span: 3, align: 'center' },
            ],
        })
    }

    // ── 건설기계 인양능력 검토 ──
    const lifting = form.liftingReview
    const total = numOrBlank(lifting?.totalLoadTon)
    const capacity = numOrBlank(lifting?.maxCapacityTon)
    const liftPct = numOrBlank(lifting?.safetyRatioPercent)
    const liftExpr = LIFTING_CAPACITY_FORMULA.replace('안전율 = ', '')
    const liftFormulaText = `${liftExpr} = ( ${liftPct} )% ※ ${CAPACITY_WARNING}`
    const liftingRows: Row[] = [
        bannerRow('<건설기계 인양능력 검토>'),
        {
            height: SPEC_H,
            cells: [
                { text: '중량물 총 하중', span: 3, header: true, cp: 4, align: 'center' },
                { text: `${total} ton`, span: 3, align: 'right' },
                { text: '최대 양중능력', span: 3, header: true, cp: 4, align: 'center' },
                { text: `${capacity} ton`, span: 3, align: 'right' },
            ],
        },
        ...LIFTING_CAPACITY_NOTES.map(note => ({
            height: estRowH(1200, `※ ${note}`, CONTENT_WIDTH),
            cells: [{ text: `※ ${note}`, span: 12, cp: 7 }],
        })),
        {
            height: estRowH(SPEC_H, liftFormulaText, col12(9)),
            cells: [
                { text: '안전율', span: 3, header: true, cp: 4, align: 'center' },
                { text: liftFormulaText, span: 9, cp: 7 },
            ],
        },
    ]

    // ── 줄걸이 인양능력 검토 ──
    const r = form.riggingReview
    const tools = r?.tools || []
    const toolBox = `${checkbox('와이어로프', tools.includes('와이어로프'))} ${checkbox('섬유로프', tools.includes('섬유로프'))}\n${checkbox('체인블럭', tools.includes('체인블럭'))} ${checkbox('기타', tools.includes('기타'))}( ${r?.otherTool || ''} )`
    const spec = `D : ( ${numOrBlank(r?.diameterMm)} )mm, L : ( ${numOrBlank(r?.lengthM)} )m, ( ${numOrBlank(r?.quantity)} )EA\n각 안전하중 : ( ${numOrBlank(r?.safeLoadPerToolTon)} )ton`
    const methodBox = `${checkbox('1줄걸이', r?.slingMethod === '1줄걸이')} ${checkbox('2줄걸이', r?.slingMethod === '2줄걸이')}\n${checkbox('3줄걸이', r?.slingMethod === '3줄걸이')} ${checkbox('4줄걸이', r?.slingMethod === '4줄걸이')}`
    const hookLabel = r?.hookTool || '훅/샤클/아이볼트'
    const hookSpec = `${hookLabel} : D ( ${numOrBlank(r?.hookDiameterInch)} )in, ( ${numOrBlank(r?.hookQuantity)} )EA\n각 안전하중 : ( ${numOrBlank(r?.hookSafeLoadTon)} )ton`
    const breaking = numOrBlank(r?.breakingLoadTon)
    const safeLoad = numOrBlank(r?.safeLoadTon)
    const slingCount = r?.slingMethod ? (r.slingMethod.match(/(\d)/)?.[1] ?? '') : ''
    const riggingFormulaText = `※ ${RIGGING_CAPACITY_FORMULA} → 절단하중 ( ${breaking} ) × 줄걸이 수 ( ${slingCount} ) ÷ ( 안전계수 ( ${numOrBlank(r?.safetyFactor)} ) × 장력계수 ( ${numOrBlank(r?.tensionFactor)} ) ) = ( ${safeLoad} ) ton`
    const ratioExpr = RIGGING_SAFETY_RATIO_FORMULA.replace('안전율 = ', '')
    const ratioText = `${ratioExpr} = ( ${numOrBlank(r?.safetyRatioPercent)} )% ※ ${CAPACITY_WARNING}`
    const sf = SAFETY_FACTORS
    const PAIR_H = 3000
    const riggingRows: Row[] = [
        bannerRow('<줄걸이 인양능력 검토>'),
        {
            height: PAIR_H,
            cells: [
                { text: '줄걸이 용구', span: 2, header: true, cp: 4, align: 'center' },
                { text: toolBox, span: 4, cp: 7 },
                { text: '줄걸이 규격', span: 2, header: true, cp: 4, align: 'center' },
                { text: spec, span: 4, cp: 7 },
            ],
        },
        {
            height: PAIR_H,
            cells: [
                { text: '줄걸이 방법', span: 2, header: true, cp: 4, align: 'center' },
                { text: methodBox, span: 4, cp: 7 },
                { text: '고리걸이용구/규격', span: 2, header: true, cp: 4, align: 'center' },
                { text: hookSpec, span: 4, cp: 7 },
            ],
        },
        {
            height: SPEC_H,
            cells: [
                { text: '줄걸이 절단하중', span: 2, header: true, cp: 4, align: 'center' },
                { text: `${breaking} ton`, span: 4, align: 'right' },
                { text: '줄걸이 안전하중', span: 2, header: true, cp: 4, align: 'center' },
                { text: `${safeLoad} ton`, span: 4, align: 'right' },
            ],
        },
        {
            height: 1200,
            cells: [{ text: '※ 줄걸이 절단하중 : 줄걸이 제조사별 구조계산서 등 제원 확인 후 기재', span: 12, cp: 7 }],
        },
        {
            height: estRowH(1200, riggingFormulaText, CONTENT_WIDTH),
            cells: [{ text: riggingFormulaText, span: 12, cp: 7 }],
        },
        {
            height: 1200,
            cells: [
                { text: '※ 안전계수', span: 6, cp: 4 },
                { text: '※ 장력계수', span: 6, cp: 4 },
            ],
        },
        {
            height: estRowH(1400, sf.workerBoarding.label, col12(2)),
            cells: [
                { text: '작업구분', span: 2, header: true, cp: 4, align: 'center' },
                { text: sf.workerBoarding.label, span: 2, header: true, cp: 7, align: 'center' },
                { text: sf.rigging.label, span: 2, header: true, cp: 7, align: 'center' },
                { text: '각도', span: 1, header: true, cp: 7, align: 'center' },
                ...TENSION_FACTORS.map(t => ({ text: `${t.angleDegree}°`, span: 1, header: true, cp: 7, align: 'center' as const })),
            ],
        },
        {
            height: 1400,
            cells: [
                { text: '안전계수', span: 2, header: true, cp: 4, align: 'center' },
                { text: String(sf.workerBoarding.value), span: 2, cp: 7, align: 'center' },
                { text: `${sf.rigging.value}(섬유로프: ${sf.fiberRopeRigging.value})`, span: 2, cp: 7, align: 'center' },
                { text: '장력계수', span: 1, header: true, cp: 7, align: 'center' },
                ...TENSION_FACTORS.map(t => ({ text: String(t.value), span: 1, cp: 7, align: 'center' as const })),
            ],
        },
        {
            height: estRowH(SPEC_H, ratioText, col12(10)),
            cells: [
                { text: '안전율', span: 2, header: true, cp: 4, align: 'center' },
                { text: ratioText, span: 10, cp: 7 },
            ],
        },
    ]

    // 떠 있는 서명은 이 쪽 첫 표(결재란) 문단에 앵커 — 쪽 기준 절대좌표라 표 어디에 있든 같은 쪽에 겹친다
    parts.push(buildTableParagraph(COLS_APPROVAL, approvalRows, tblIdBase + 1, 1, { pageBreak: true, floats }))
    parts.push(buildTableParagraph(COLS12, mainRows, tblIdBase + 2, 2))
    parts.push(buildTableParagraph(COLS12, specRows, tblIdBase + 3, 3))
    parts.push(buildTableParagraph(COLS12, liftingRows, tblIdBase + 4, 4))
    parts.push(buildTableParagraph(COLS12, riggingRows, tblIdBase + 5, 5))
    return parts
}

// ── 운반경로(지도) + 위험요인 ──

function buildMapAndRiskParts(record: WorkPlanRecord, form: LoadingForm, collector: ImageCollector, mapId: string | null, tblIdBase: number): string[] {
    const parts: string[] = []

    // 지도 셀(8열)과 범례·중점관리 셀(4열)
    const MAP_ROW_H = 34016 // 지도 영역 약 120mm
    const mapCellW = col12(8)
    const mapInnerW = mapCellW - CELL_PAD
    let mapBody = ''
    if (mapId) {
        const size = fitImage(collector.find(mapId), mapInnerW, MAP_ROW_H - 2000)
        mapBody += innerPicParagraph(mapId, size.w, size.h, mapInnerW)
    } else {
        mapBody += innerParagraph('', 0, 'center', mapInnerW)
    }
    mapBody += innerParagraph(MAP_FOOTNOTE, 9, 'center', mapInnerW)

    const legendInnerW = col12(4) - CELL_PAD
    let legendBody = innerParagraph('범  례', 1, 'center', legendInnerW)
    for (const l of MAP_LEGEND) {
        legendBody += innerParagraph(`${l.symbol} ${l.label}`, 7, 'left', legendInnerW)
    }
    legendBody += innerParagraph('', 7, 'left', legendInnerW)
    legendBody += innerParagraph('ㅇ 중점관리사항', 4, 'left', legendInnerW)
    MAP_FOCUS_ITEMS.forEach((item, i) => {
        legendBody += innerParagraph(`${i + 1}. ${item}`, 7, 'left', legendInnerW)
    })

    const mapRows: Row[] = [
        bannerRow('<운반경로 및 작업방법>'),
        {
            height: MAP_ROW_H,
            cells: [
                { bodyXml: mapBody, span: 8 },
                { bodyXml: legendBody, span: 4, top: true },
            ],
        },
    ]
    parts.push(buildTableParagraph(COLS12, mapRows, tblIdBase + 1, 6, { pageBreak: true }))

    // 위험요인 및 개선대책 — 입력 없으면 수기용 빈 행
    const risks: RiskControlRow[] = (form.riskControls?.length ? form.riskControls : [{ workStep: '', riskFactor: '', improvementMeasure: '' }])
    const riskRows: Row[] = [
        bannerRow('<위험요인 및 개선대책>'),
        {
            height: 1400,
            cells: [
                { text: '연번', span: 1, header: true, cp: 4, align: 'center' },
                { text: '작업순서', span: 3, header: true, cp: 4, align: 'center' },
                { text: '위험요인', span: 4, header: true, cp: 4, align: 'center' },
                { text: '개선대책', span: 4, header: true, cp: 4, align: 'center' },
            ],
        },
        ...risks.map((row, i) => ({
            height: Math.max(
                estRowH(1400, row.workStep, col12(3)),
                estRowH(1400, row.riskFactor, col12(4)),
                estRowH(1400, row.improvementMeasure, col12(4)),
            ),
            cells: [
                { text: String(i + 1), span: 1, align: 'center' as const },
                { text: row.workStep, span: 3, cp: 7 },
                { text: row.riskFactor, span: 4, cp: 7 },
                { text: row.improvementMeasure, span: 4, cp: 7 },
            ],
        })),
    ]
    // 지도 아래 남은 예산을 넘으면 이어지는 표로 분할(내용 유실 방지)
    const remaining = CONTENT_HEIGHT - 1300 - MAP_ROW_H
    paginateRows(riskRows, remaining).forEach((rows, i) => {
        parts.push(buildTableParagraph(COLS12, rows, tblIdBase + 2 + i, 7 + i, { pageBreak: i > 0 }))
    })
    return parts
}

// ── 체크리스트 ──

function mark(target: ChecklistResult, current: ChecklistResult | undefined): string {
    return current === target ? '■' : '□'
}

function buildChecklistParts(form: LoadingForm, tblIdBase: number): string[] {
    const byIndex = new Map<number, ChecklistAnswer>((form.checklist || []).map(a => [a.itemIndex, a]))
    const rows: Row[] = [
        bannerRow('<산업재해 예방을 위한 체크리스트>'),
        {
            height: 1400,
            cells: [
                { text: '점검사항', span: 9, header: true, cp: 4, align: 'center' },
                { text: '양호', span: 1, header: true, cp: 4, align: 'center' },
                { text: '미흡', span: 1, header: true, cp: 4, align: 'center' },
                { text: '해당없음', span: 1, header: true, cp: 4, align: 'center' },
            ],
        },
        ...LOADING_CHECKLIST.map((q, i) => {
            const a = byIndex.get(i)
            const question = a?.note ? `${q}\n└ ${a.note}` : q
            return {
                height: estRowH(1600, question, col12(9)),
                cells: [
                    { text: question, span: 9, cp: 7 },
                    { text: mark('양호', a?.result), span: 1, align: 'center' as const },
                    { text: mark('미흡', a?.result), span: 1, align: 'center' as const },
                    { text: mark('해당없음', a?.result), span: 1, align: 'center' as const },
                ],
            }
        }),
    ]
    return paginateRows(rows, CONTENT_HEIGHT).map((pageRows, i) =>
        buildTableParagraph(COLS12, pageRows, tblIdBase + i, 20 + i, { pageBreak: true }),
    )
}

// ── 다운로드 진입점 ──

export async function downloadLoadingWorkPlanHwpx(record: WorkPlanRecord): Promise<void> {
    const form = record.form_data.loading
    if (!form) throw new Error('하역운반기계 작업계획서 데이터가 없습니다.')

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

    const parts: string[] = [
        ...buildCoverParts(1000000000),
        ...buildMainAndSpecParts(form, collector, sigIds, 1000000100),
        ...buildMapAndRiskParts(record, form, collector, mapId, 1000000200),
        ...buildChecklistParts(form, 1000000300),
    ]

    const blob = await assembleHwpxBlob(parts, collector, DOC_TITLE)
    const fileName = buildFileName('loading', record.title, record.work_start_date).replace(/\.pdf$/, '.hwpx')
    triggerDownload(blob, fileName)
}
