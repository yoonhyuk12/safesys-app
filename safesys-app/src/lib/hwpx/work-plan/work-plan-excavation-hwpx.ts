// 표준 양식 지반 굴착 작업계획서를 한글문서(hwpx)로 조립·다운로드 (PDF 블록 구성과 동일 내용·순서)
import { CONSTRUCTION_SURVEY_ITEMS } from '@/lib/work-plan/constants'
import {
    EXCAVATION_ALARM_CONDITIONS,
    EXCAVATION_ALARM_EQUIPMENT,
    EXCAVATION_ALARM_SIGNALS,
    EXCAVATION_BLASTING_SAFETY,
    EXCAVATION_CHECKLIST,
    EXCAVATION_DIRECTOR_RULES,
    EXCAVATION_EMERGENCY_AGENCY_PRESETS,
    EXCAVATION_SAMPLE_NOTE,
    EXCAVATION_SHORING_SAFETY,
    EXCAVATION_STAGE_SAFETY,
    EXCAVATION_STANDARD_FLOW,
    EXCAVATION_STANDARD_PROCEDURES,
    EXCAVATION_TOC,
    EXCAVATION_TRAFFIC_RULES,
    EXCAVATION_UTILITY_SAFETY_RULES,
} from '@/lib/work-plan/excavation-constants'
import type { PersonContact, RiskControlRow, WorkPlanRecord } from '@/lib/work-plan/types'
import { buildFileName } from '@/lib/reports/work-plan/work-plan-pdf-common'
import {
    CONTENT_HEIGHT,
    PAGE_CONTENT_TOP,
    PAGE_LEFT,
    COLS12,
    ImageCollector,
    type Row,
    assembleHwpxBlob,
    bannerRow,
    buildTableParagraph,
    buildTextParagraph,
    checklistRows,
    clampRowHeights,
    mapSectionRows,
    resetHwpxSeqs,
    riskControlRows,
    signatureFloat,
    triggerDownload,
} from './work-plan-hwpx-common'

type ExcavationForm = NonNullable<WorkPlanRecord['form_data']['excavation']>

const DOC_TITLE = '지반 굴착 작업계획서'
// 쪽 예산 — 배너(11pt) 등 큰 글씨 행의 추정 오차를 흡수할 안전 마진을 둔다
const PAGE_BUDGET = CONTENT_HEIGHT - 2000
// 표지 그리드 — PDF 결재표 열비(21% / 49% / 30%)
const COLS_COVER = [10715, 25002, 15307]

// 빈 표 행 수 — 출력 후 수기 작성 여유 (PDF와 동일)
const BLANK_EQUIPMENT_ROWS = 3
const BLANK_MANPOWER_ROWS = 3
const BLANK_RISK_ROWS = 5
const BLANK_MATERIAL_ROWS = 3
const BLANK_INSTRUMENT_ROWS = 3

function personBlockText(p: PersonContact | undefined): string {
    if (!p) return ''
    const head = [p.position, p.name].filter(Boolean).join(' ')
    return p.phone ? (head ? `${head}\n(${p.phone})` : `(${p.phone})`) : head
}

function padBlankRows<T>(rows: T[], blankCount: number, blank: T): T[] {
    if (rows.length > 0) return rows
    return Array.from({ length: blankCount }, () => blank)
}

// 배너(11pt)는 공통 선언 높이(1300)보다 실제 줄 높이가 커서 여유를 준다
function banner(text: string): Row {
    return { ...bannerRow(text), height: 1800 }
}

// 섹션 안 소제목 — 표 밖 문단은 표만 다음 쪽으로 밀리는 함정이 있어 무테 행으로 넣는다
function subtitleRow(text: string): Row {
    return { height: 1700, cells: [{ text, span: 12, bf: 1, cp: 1 }] }
}

// 번호·글머리 목록 무테 행
function listRow(items: readonly string[], numbered = false): Row {
    const text = items.map((item, i) => (numbered ? `${i + 1}. ${item}` : `• ${item}`)).join('\n')
    return { height: 1300, cells: [{ text, span: 12, bf: 1, cp: 7 }] }
}

function labelCell(text: string, span: number): Row['cells'][number] {
    return { text, span, header: true, cp: 4, align: 'center' }
}

// ── 표지 (목차·원청 결재표·파란 주석) — 단독 쪽, 무테+테두리 혼합 표 ──

function buildCoverParts(
    form: ExcavationForm,
    record: WorkPlanRecord,
    collector: ImageCollector,
    sigIds: Partial<Record<'approvalManager' | 'approvalReviewer1' | 'approvalReviewer2' | 'approvalApprover', string | null>>,
    tblId: number,
): string[] {
    const createdDate = record.work_start_date || new Date().toISOString().slice(0, 10)
    const blank = (height: number): Row => ({ height, cells: [{ text: '', span: 3, bf: 1 }] })
    const APPROVAL_ROW_H = 2200

    const approvalRows: Array<[string, string, 'approvalManager' | 'approvalReviewer1' | 'approvalReviewer2' | 'approvalApprover']> = [
        ['작성자', form.approvalNames?.approvalManager || '', 'approvalManager'],
        ['검토자', form.approvalNames?.approvalReviewer1 || '', 'approvalReviewer1'],
        ['검토자', form.approvalNames?.approvalReviewer2 || '', 'approvalReviewer2'],
        ['현장소장', form.approvalNames?.approvalApprover || '', 'approvalApprover'],
    ]

    // 목차는 11pt(1430/줄)라 10pt 기준 추정보다 크게 자라므로 선언 높이를 직접 준다
    const tocText = EXCAVATION_TOC.map(item => `  ${item}`).join('\n')
    const upperRows: Row[] = [
        blank(3600),
        { height: 3200, cells: [{ text: '지반 굴착 작업계획서', span: 3, bf: 1, cp: 8, align: 'center' }] },
        blank(2200),
        { height: 1800, cells: [{ text: '[목 차]', span: 3, bf: 1, cp: 6, align: 'center' }] },
        { height: EXCAVATION_TOC.length * 1430 + 400, cells: [{ text: tocText, span: 3, bf: 1, cp: 10 }] },
    ]
    const lowerRows: Row[] = [
        { height: 1700, cells: [{ text: '[원청업체 작성 및 검토]', span: 3, bf: 1, cp: 5 }] },
        { height: 1500, cells: [labelCell('회사명', 1), { text: form.companyName, span: 2 }] },
        { height: 1500, cells: [labelCell('현장명', 1), { text: form.title, span: 2 }] },
        { height: 1500, cells: [labelCell('작성일', 1), { text: createdDate, span: 2 }] },
        ...approvalRows.map(([role, name]) => ({
            height: APPROVAL_ROW_H,
            cells: [
                labelCell(role, 1),
                { text: `직위        성명 ${name}`, span: 1 },
                { text: '(인)', span: 1, align: 'center' as const },
            ],
        })),
        { height: 2900, cells: [{ text: EXCAVATION_SAMPLE_NOTE, span: 3, bf: 1, cp: 9 }] },
    ]

    // 결재표를 쪽 하단에 붙이도록 남은 높이를 무테 여백 행으로 채운다.
    // 행별 실제 렌더가 선언(최소값)보다 커지는 몫(셀 패딩 등)을 흡수하도록 버퍼를 넉넉히 둔다 —
    // 표가 한 쪽을 넘치면 표 전체가 다음 쪽으로 밀리고 서명 float만 첫 쪽에 남는다.
    const NOTE_PARA_H = 1300 // 첫 문단(파란 주석 텍스트)의 렌더 높이
    const upper = clampRowHeights(upperRows, COLS_COVER)
    const lower = clampRowHeights(lowerRows, COLS_COVER)
    const usedH = [...upper, ...lower].reduce((a, r) => a + r.height, 0)
    const spacerH = Math.max(0, CONTENT_HEIGHT - NOTE_PARA_H - usedH - 6000)
    const rows: Row[] = [...upper, blank(spacerH), ...lower]

    // (인) 문구 위 서명 겹침 — 결재 행 y를 누적 높이로 계산 (쪽 기준 절대좌표)
    const floats: string[] = []
    const lowerTop = PAGE_CONTENT_TOP + NOTE_PARA_H + upper.reduce((a, r) => a + r.height, 0) + spacerH
    const approvalTop = lowerTop + lower.slice(0, 4).reduce((a, r) => a + r.height, 0)
    approvalRows.forEach(([, , role], i) => {
        const picId = sigIds[role]
        if (picId) {
            floats.push(signatureFloat(collector, {
                picId,
                cellX: PAGE_LEFT + COLS_COVER[0] + COLS_COVER[1],
                cellW: COLS_COVER[2],
                rowY: approvalTop + APPROVAL_ROW_H * i,
                rowH: APPROVAL_ROW_H,
                maxW: 4200,
                maxH: 1800,
            }))
        }
    })

    // 첫 문단(구역 속성 포함)은 파란 주석 텍스트, 표지 표는 별도 문단 — 검증된 TBM·타 4종 패턴
    return [
        buildTextParagraph('지반 굴착 작업계획서_고용노동부 표준 양식(2021)', { cp: 11, right: true, secPr: true }),
        buildTableParagraph(COLS_COVER, rows, tblId, 1, { floats }),
    ]
}

// ── 본문 행 스트림 (블록 순서 = PDF 블록 순서) ──

interface BodyStream {
    rows: Row[]
    // 이 인덱스 행 "앞"에서는 쪽을 나누지 않는다 (rowSpan 그룹 내부·배너-지도 결합)
    forbidden: Set<number>
}

function buildBodyRows(form: ExcavationForm, collector: ImageCollector, mapId: string | null): BodyStream {
    const rows: Row[] = []
    const forbidden = new Set<number>()
    const overview = form.overview

    // 1. 작업개요
    rows.push(banner('1. 작업개요'))
    rows.push(subtitleRow('현장 개요'))
    rows.push({ height: 1500, cells: [labelCell('회사명', 2), { text: form.companyName, span: 4, align: 'center' }, labelCell('현장 전화번호', 2), { text: overview.sitePhone, span: 4, align: 'center' }] })
    rows.push({ height: 1500, cells: [labelCell('현장명', 2), { text: form.title, span: 4, align: 'center' }, labelCell('공사규모', 2), { text: overview.siteScale, span: 4, align: 'center' }] })
    rows.push({
        height: 1500,
        cells: [
            labelCell('공사기간', 2),
            { text: [form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ '), span: 4, align: 'center' },
            labelCell('현장관계자', 2),
            { text: personBlockText(form.workDirector), span: 4, align: 'center' },
        ],
    })
    rows.push(subtitleRow('굴착작업 개요'))
    rows.push({ height: 1500, cells: [labelCell('협력업체명', 2), { text: overview.partnerCompany, span: 4, align: 'center' }, labelCell('업체 전화번호', 2), { text: overview.partnerPhone, span: 4, align: 'center' }] })
    rows.push({ height: 1500, cells: [labelCell('작업담당자', 2), { text: personBlockText(overview.partnerManager), span: 10 }] })
    rows.push({ height: 1500, cells: [labelCell('굴착공사 기간', 2), { text: [form.workStartDate, form.workEndDate].filter(Boolean).join(' ~ '), span: 10 }] })
    rows.push({
        height: 1500,
        cells: [
            labelCell('굴착 깊이', 2), { text: overview.depth, span: 2, align: 'center' },
            labelCell('굴착면적', 2), { text: overview.area, span: 2, align: 'center' },
            labelCell('터파기 물량', 2), { text: overview.volume, span: 2, align: 'center' },
        ],
    })
    rows.push({ height: 1500, cells: [labelCell('굴착방법', 2), { text: overview.method, span: 4 }, labelCell('사용기계 및 장비', 2), { text: overview.equipmentSummary, span: 4 }] })
    if (form.shoring.applied) {
        rows.push({ height: 1500, cells: [labelCell('흙막이공법', 2), { text: form.shoring.wallMethod, span: 4 }, labelCell('수량', 2), { text: form.shoring.wallQuantity, span: 4 }] })
        rows.push({ height: 1500, cells: [labelCell('흙막이 지보공법', 2), { text: form.shoring.supportMethod, span: 4 }, labelCell('수량', 2), { text: form.shoring.supportQuantity, span: 4 }] })
    } else {
        rows.push({ height: 1500, cells: [labelCell('흙막이 가시설', 2), { text: '해당없음', span: 10 }] })
    }
    if (form.sharedWorkContent.trim()) {
        rows.push({ height: 1500, cells: [labelCell('공통 작업내용', 2), { text: form.sharedWorkContent, span: 10 }] })
    }

    // 2. 사전조사
    rows.push(banner('2. 사전조사'))
    rows.push(subtitleRow('지하매설물 조사'))
    rows.push({ height: 1400, cells: [labelCell('지중매설물', 3), labelCell('확인결과(위치)', 3), labelCell('조치여부', 3), labelCell('담당기관(연락처)', 3)] })
    const utilities = form.utilities.length > 0 ? form.utilities : [{ kind: '', finding: '', action: '', agency: '' }]
    for (const u of utilities) {
        rows.push({
            height: 1400,
            cells: [
                { text: u.kind, span: 3, cp: 7, align: 'center' },
                { text: u.finding, span: 3, cp: 7 },
                { text: u.action, span: 3, cp: 7 },
                { text: u.agency, span: 3, cp: 7 },
            ],
        })
    }
    rows.push(subtitleRow('지하매설물 작업 안전수칙'))
    rows.push(listRow(EXCAVATION_UTILITY_SAFETY_RULES))
    rows.push(subtitleRow('지질·지반 조사 결과 요약'))
    rows.push({ height: 1400, cells: [labelCell('조사항목', 5), labelCell('조사결과', 7)] })
    for (const item of CONSTRUCTION_SURVEY_ITEMS.excavation) {
        rows.push({ height: 1500, cells: [{ text: item, span: 5, cp: 7 }, { text: '', span: 7 }] })
    }

    // 3. 필요 인원 및 장비 사용계획 — 구분 열은 rowSpan 세로 병합(그룹 중간에서 쪽을 나누지 않는다)
    rows.push(banner('3. 필요 인원 및 장비 사용계획'))
    rows.push({
        height: 1400,
        cells: [labelCell('구분', 1), labelCell('항목', 2), labelCell('규격', 2), labelCell('수량', 1), labelCell('용도', 3), labelCell('작업기간', 2), labelCell('비고', 1)],
    })
    const equipmentRows = padBlankRows(form.equipmentRows, BLANK_EQUIPMENT_ROWS, { name: '', spec: '', quantity: '', purpose: '', period: '', note: '' })
    equipmentRows.forEach((e, i) => {
        const cells: Row['cells'] = []
        if (i === 0) cells.push({ text: '장비', rowSpan: equipmentRows.length, header: true, cp: 4, align: 'center' })
        else forbidden.add(rows.length)
        cells.push(
            { text: e.name, span: 2, cp: 7, align: 'center' },
            { text: e.spec, span: 2, cp: 7, align: 'center' },
            { text: e.quantity, span: 1, cp: 7, align: 'center' },
            { text: e.purpose, span: 3, cp: 7 },
            { text: e.period, span: 2, cp: 7, align: 'center' },
            { text: e.note, span: 1, cp: 7 },
        )
        rows.push({ height: 1500, cells })
    })
    const manpowerRows = padBlankRows(form.manpowerRows, BLANK_MANPOWER_ROWS, { role: '', task: '', count: '', period: '', note: '' })
    manpowerRows.forEach((m, i) => {
        const cells: Row['cells'] = []
        if (i === 0) cells.push({ text: '인원', rowSpan: manpowerRows.length, header: true, cp: 4, align: 'center' })
        else forbidden.add(rows.length)
        cells.push(
            { text: m.role, span: 2, cp: 7, align: 'center' },
            { text: m.task, span: 2, cp: 7, align: 'center' },
            { text: m.count, span: 1, cp: 7, align: 'center' },
            { text: '', span: 3, cp: 7 },
            { text: m.period, span: 2, cp: 7, align: 'center' },
            { text: m.note, span: 1, cp: 7 },
        )
        rows.push({ height: 1500, cells })
    })

    // 4. 표준 절차 (흐름도 + 절차 그룹)
    rows.push(banner('4. 굴착공사 계획 — 표준 절차'))
    rows.push(subtitleRow('굴착 작업 흐름'))
    rows.push({ height: 3200, cells: [{ text: EXCAVATION_STANDARD_FLOW.join(' → '), span: 12, cp: 1, align: 'center' }] })
    EXCAVATION_STANDARD_PROCEDURES.forEach((group, i) => {
        rows.push(subtitleRow(`${i + 1}) ${group.heading}`))
        rows.push(listRow(group.items, true))
    })

    // 4. 작업계획도 — 배너와 지도 행은 같은 쪽에 붙인다
    const mapRows = mapSectionRows('4. 굴착공사 계획 — 굴착 작업계획도', collector, mapId)
    rows.push(mapRows[0])
    forbidden.add(rows.length)
    rows.push(mapRows[1])

    // 4. 배수·차량 운행
    rows.push(banner('4. 굴착공사 계획 — 배수·차량 운행'))
    rows.push(subtitleRow('배수·양수 계획'))
    rows.push({ height: 1500, cells: [labelCell('배수방법', 3), { text: form.drainagePlan, span: 9 }] })
    rows.push(subtitleRow('ㅇ 차량 운행·유도 기준'))
    rows.push(listRow(EXCAVATION_TRAFFIC_RULES))

    // 스테이지형 안전대책 표 공통 조립
    const pushStageRows = (stages: ReadonlyArray<{ stage: string; items: readonly string[] }>) => {
        rows.push({ height: 1400, cells: [labelCell('작업순서', 3), labelCell('안전작업계획', 9)] })
        for (const stage of stages) {
            rows.push({
                height: 1500,
                cells: [
                    { text: stage.stage, span: 3, header: true, cp: 4, align: 'center' },
                    { text: stage.items.map((item, i) => `${i + 1}. ${item}`).join('\n'), span: 9, cp: 7 },
                ],
            })
        }
    }

    // 4. 단계별 안전대책
    rows.push(banner('4. 굴착공사 계획 — 단계별 안전대책'))
    rows.push(subtitleRow('굴착 단계별 안전대책'))
    pushStageRows(EXCAVATION_STAGE_SAFETY)

    // 발파작업 (조건부)
    if (form.blasting.applied) {
        const b = form.blasting
        rows.push(banner('4. 굴착공사 계획 — 발파작업'))
        rows.push({ height: 1500, cells: [labelCell('발파공법', 3), { text: b.method, span: 3 }, labelCell('발파구역', 3), { text: b.area, span: 3 }] })
        rows.push({ height: 1500, cells: [labelCell('발파량', 3), { text: b.amount, span: 3 }, labelCell('화약관리자', 3), { text: b.managerName, span: 3 }] })
        rows.push({ height: 1500, cells: [labelCell('통제·비산방지 대책', 3), { text: b.controlMeasure, span: 9 }] })
        rows.push(subtitleRow('발파작업 안전대책'))
        pushStageRows(EXCAVATION_BLASTING_SAFETY)
    }

    // 흙막이 및 지보공 (조건부, PDF의 2블록 구성 유지)
    if (form.shoring.applied) {
        const s = form.shoring
        rows.push(banner('5. 흙막이 및 지보공 설치계획'))
        rows.push({ height: 1500, cells: [labelCell('흙막이공법', 3), { text: s.wallMethod, span: 3 }, labelCell('수량', 3), { text: s.wallQuantity, span: 3 }] })
        rows.push({ height: 1500, cells: [labelCell('지보공법', 3), { text: s.supportMethod, span: 3 }, labelCell('수량', 3), { text: s.supportQuantity, span: 3 }] })
        rows.push(subtitleRow('사용재료'))
        rows.push({ height: 1400, cells: [labelCell('품목', 3), labelCell('규격', 3), labelCell('단위', 3), labelCell('수량', 3)] })
        const materials = padBlankRows(s.materials, BLANK_MATERIAL_ROWS, { item: '', spec: '', unit: '', quantity: '' })
        for (const m of materials) {
            rows.push({
                height: 1400,
                cells: [
                    { text: m.item, span: 3, cp: 7, align: 'center' },
                    { text: m.spec, span: 3, cp: 7, align: 'center' },
                    { text: m.unit, span: 3, cp: 7, align: 'center' },
                    { text: m.quantity, span: 3, cp: 7, align: 'center' },
                ],
            })
        }
        const pushShoringGroup = (index: number) => {
            const group = EXCAVATION_SHORING_SAFETY[index]
            rows.push(subtitleRow(group.group))
            pushStageRows(group.stages)
        }
        pushShoringGroup(0)
        rows.push(banner('5. 흙막이 및 지보공 안전대책(계속)'))
        pushShoringGroup(1)
        pushShoringGroup(2)
    }

    // 6. 지반 계측계획 (조건부)
    if (form.instrumentation.applied) {
        rows.push(banner('6. 지반 계측계획'))
        rows.push({
            height: 1400,
            cells: [labelCell('계측항목', 2), labelCell('설치위치', 2), labelCell('수량', 2), labelCell('측정시기', 2), labelCell('측정빈도', 2), labelCell('비고', 2)],
        })
        const instruments = padBlankRows(form.instrumentation.rows, BLANK_INSTRUMENT_ROWS, { item: '', location: '', quantity: '', timing: '', frequency: '', note: '' })
        for (const r of instruments) {
            rows.push({
                height: 1400,
                cells: [
                    { text: r.item, span: 2, cp: 7, align: 'center' },
                    { text: r.location, span: 2, cp: 7, align: 'center' },
                    { text: r.quantity, span: 2, cp: 7, align: 'center' },
                    { text: r.timing, span: 2, cp: 7, align: 'center' },
                    { text: r.frequency, span: 2, cp: 7, align: 'center' },
                    { text: r.note, span: 2, cp: 7 },
                ],
            })
        }
        rows.push({ height: 1300, cells: [{ text: '※ 관리기준치는 구조기술자 승인값 기준', span: 12, bf: 1, cp: 7 }] })
    }

    // 7. 작업지휘자 배치계획
    rows.push(banner('7. 작업지휘자 배치계획'))
    rows.push(subtitleRow('작업지휘자 배치기준'))
    rows.push(listRow(EXCAVATION_DIRECTOR_RULES))
    rows.push({ height: 1400, cells: [labelCell('구분', 4), labelCell('성명·직책·연락처', 8)] })
    const directors: Array<[string, PersonContact | undefined]> = [
        ['작업지휘자', form.workDirector],
        ['장비운전원', form.operator],
        ['유도자', form.guide],
    ]
    for (const [role, person] of directors) {
        rows.push({ height: 1500, cells: [labelCell(role, 4), { text: personBlockText(person), span: 8, cp: 7 }] })
    }

    // 8. 연락·신호
    rows.push(banner('8. 사업장 내 연락방법 및 신호방법'))
    rows.push(subtitleRow('비상경보 발령조건'))
    rows.push(listRow(EXCAVATION_ALARM_CONDITIONS))
    rows.push(subtitleRow('비상경보 신호'))
    rows.push({ height: 1400, cells: [labelCell('구분', 6), labelCell('경보방법', 6)] })
    for (const signal of EXCAVATION_ALARM_SIGNALS) {
        rows.push({ height: 1400, cells: [{ text: signal.condition, span: 6, cp: 7 }, { text: signal.signal, span: 6, cp: 7 }] })
    }
    rows.push(subtitleRow('경보시설'))
    rows.push({ height: 1400, cells: [labelCell('구분', 6), labelCell('관리방법', 6)] })
    for (const equip of EXCAVATION_ALARM_EQUIPMENT) {
        rows.push({ height: 1400, cells: [{ text: equip.equipment, span: 6, cp: 7 }, { text: equip.management, span: 6, cp: 7 }] })
    }
    rows.push(subtitleRow('비상연락망'))
    rows.push({ height: 1400, cells: [labelCell('기관·업체', 6), labelCell('전화번호', 6)] })
    for (const contact of EXCAVATION_EMERGENCY_AGENCY_PRESETS) {
        rows.push({ height: 1400, cells: [{ text: contact.agency, span: 6, cp: 7 }, { text: '', span: 6, cp: 7 }] })
    }

    // 9. 위험요인 및 개선대책 — 입력 없으면 수기용 빈 행 5개 (PDF와 동일)
    const risks: RiskControlRow[] = form.riskControls.length > 0
        ? form.riskControls
        : Array.from({ length: BLANK_RISK_ROWS }, () => ({ workStep: '', riskFactor: '', improvementMeasure: '' }))
    rows.push(...riskControlRows('9. 중점 안전·보건 대책 — 위험요인 및 개선대책', '작업단계', risks))

    // 9. 체크리스트 15항목 — PDF와 동일하게 빈 체크 상태로 출력
    rows.push(...checklistRows('9. 중점 안전·보건 대책 — 안전점검 체크리스트', EXCAVATION_CHECKLIST, []))

    return { rows, forbidden }
}

// 쪽 예산 단위로 스트림을 나눈다. forbidden 인덱스 앞에서는 자르지 않고 허용 지점까지 후퇴한다.
function paginateRowsSafe(rows: Row[], capacity: number, forbidden: Set<number>): Row[][] {
    const pages: Row[][] = []
    let start = 0
    while (start < rows.length) {
        let used = 0
        let end = rows.length
        for (let i = start; i < rows.length; i++) {
            if (i > start && used + rows[i].height > capacity) {
                end = i
                break
            }
            used += rows[i].height
        }
        if (end < rows.length) {
            let cut = end
            while (cut > start + 1 && forbidden.has(cut)) cut--
            if (cut > start) end = cut
        }
        pages.push(rows.slice(start, end))
        start = end
    }
    return pages
}

// ── 다운로드 진입점 ──

export async function downloadExcavationWorkPlanHwpx(record: WorkPlanRecord): Promise<void> {
    const form = record.form_data.excavation
    if (!form) throw new Error('굴착 작업계획서 데이터가 없습니다.')

    resetHwpxSeqs()
    const collector = new ImageCollector()
    // 지도는 흰 배경 JPEG로 정규화, 서명은 투명 PNG 원본 그대로 수집
    const mapId = await collector.collect(record.map_image_url, false)
    const s = form.signatures
    const sigIds = {
        approvalManager: s?.approvalManager ? await collector.collect(s.approvalManager, true) : null,
        approvalReviewer1: s?.approvalReviewer1 ? await collector.collect(s.approvalReviewer1, true) : null,
        approvalReviewer2: s?.approvalReviewer2 ? await collector.collect(s.approvalReviewer2, true) : null,
        approvalApprover: s?.approvalApprover ? await collector.collect(s.approvalApprover, true) : null,
    }

    const parts: string[] = buildCoverParts(form, record, collector, sigIds, 1000000000)

    // 본문은 단일 12열 행 스트림으로 만들어 쪽 단위 표로 나눈다 (행 잘림 방지)
    const stream = buildBodyRows(form, collector, mapId)
    const clamped = clampRowHeights(stream.rows, COLS12)
    paginateRowsSafe(clamped, PAGE_BUDGET, stream.forbidden).forEach((pageRows, i) => {
        parts.push(buildTableParagraph(COLS12, pageRows, 1000000100 + i, 2 + i, { pageBreak: true }))
    })

    const blob = await assembleHwpxBlob(parts, collector, DOC_TITLE)
    const fileName = buildFileName('excavation', form.title, record.work_start_date).replace(/\.pdf$/, '.hwpx')
    triggerDownload(blob, fileName)
}
