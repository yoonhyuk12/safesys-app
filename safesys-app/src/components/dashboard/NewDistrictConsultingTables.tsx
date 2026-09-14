// 신규지구 안전컨설팅의 본부·지사·지구 표를 그리는 순수 표시 컴포넌트 모음이다. 의존성이 없어 node:test에서 그대로 렌더해 검증한다.
import type {
  NewDistrictBranchGroup,
  NewDistrictExcludeReason,
  NewDistrictHqGroup,
  NewDistrictProjectRow,
  NewDistrictSubtotal,
} from '@/lib/new-district-consulting-utils'

/** 연도 코호트가 비었을 때 보여줄 문구. 본부 표와 프로젝트 표가 함께 쓴다. */
export const EMPTY_MESSAGE = '해당 연도에 착공한 신규지구가 없습니다.'

export const hqDisplay = (hq: string): string =>
  hq !== '본사' && hq !== '기타' && !hq.endsWith('본부') ? `${hq}본부` : hq

export const formatDate = (value: string | null | undefined): string => {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  return text.slice(0, 10).replace(/-/g, '.')
}

/** 실시율은 0~1 소수라 백분율 한 자리로 바꿔 보여준다. */
export const formatRate = (rate: number): string => `${(rate * 100).toFixed(1)}%`

/** 점검 0건은 사용자 지시에 따라 `-`로 보여준다. 내부 원수와 실시율 계산은 그대로다. */
export const formatInspectionCount = (count: number): string => (count === 0 ? '-' : `${count}건`)

const excludeReasonLabel = (reason: NewDistrictExcludeReason | null): string => {
  if (reason === 'no_representative') return '대표 계약 미지정'
  if (reason === 'no_start_date') return '계약 시작일 없음'
  return '판정 근거 없음'
}

const SUBTOTAL_ROW_CLASS = 'bg-blue-50 font-semibold border-b-2 border-blue-200'
const CELL_CLASS = 'whitespace-nowrap px-3 py-2.5 text-center text-sm tabular-nums'
const HEAD_CELL_CLASS = 'whitespace-nowrap px-3 py-2.5 text-center text-xs font-medium text-gray-500'
/** 장갑 낀 손으로 누르는 화면이라 표 안의 선택 버튼도 44px 터치 영역을 지킨다. */
const SELECT_BUTTON_CLASS =
  'inline-flex min-h-[44px] items-center justify-center rounded px-2 text-sm font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500'

/** 본부·지사 표가 함께 쓰는 수치 5칸(신규지구·점검 지구·점검 건수·실시율·제외). */
const GroupStatCells = ({
  subtotal,
  textClass,
}: {
  subtotal: NewDistrictSubtotal
  textClass: string
}) => (
  <>
    <td className={`${CELL_CLASS} ${textClass}`}>{`${subtotal.districtCount}개`}</td>
    <td className={`${CELL_CLASS} ${textClass}`}>{`${subtotal.inspectedDistrictCount}개`}</td>
    <td className={`${CELL_CLASS} ${textClass}`}>
      {formatInspectionCount(subtotal.inspectionCount)}
    </td>
    <td className={`${CELL_CLASS} ${textClass}`}>{formatRate(subtotal.rate)}</td>
    <td className={`${CELL_CLASS} ${textClass}`}>
      {subtotal.excludedCount === 0 ? '-' : `${subtotal.excludedCount}개`}
    </td>
  </>
)

const GroupTableHead = ({ firstLabel }: { firstLabel: string }) => (
  <thead className="bg-gray-50">
    <tr>
      <th className={HEAD_CELL_CLASS}>{firstLabel}</th>
      <th className={HEAD_CELL_CLASS}>신규지구</th>
      <th className={HEAD_CELL_CLASS}>점검 지구</th>
      <th className={HEAD_CELL_CLASS}>점검 건수</th>
      <th className={HEAD_CELL_CLASS}>실시율</th>
      <th className={HEAD_CELL_CLASS}>제외</th>
    </tr>
  </thead>
)

/** 선택 연도 코호트가 비었을 때 세 표가 함께 쓰는 안내 행. */
const EmptyCohortRow = () => (
  <tr>
    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
      {EMPTY_MESSAGE}
    </td>
  </tr>
)

const SubtotalRow = ({ subtotal }: { subtotal: NewDistrictSubtotal }) => (
  <tr className={SUBTOTAL_ROW_CLASS}>
    <td className="px-3 py-2 text-sm text-center text-blue-800">소계</td>
    <GroupStatCells subtotal={subtotal} textClass="text-blue-800" />
  </tr>
)

const InspectedBadge = ({ row }: { row: NewDistrictProjectRow }) => {
  const badgeClass = row.excluded
    ? 'bg-gray-100 text-gray-800'
    : row.inspected
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'
  const label = row.excluded ? '판정 불가' : row.inspected ? '점검' : '미점검'
  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}
    >
      {label}
    </span>
  )
}

export interface NewDistrictHqTableProps {
  total: NewDistrictSubtotal
  hqs: NewDistrictHqGroup[]
  onSelectHq: (hq: string) => void
}

/** 본부 표 — 최상단 소계는 전체 원수 합산 실시율이다. */
export const NewDistrictHqTable = ({ total, hqs, onSelectHq }: NewDistrictHqTableProps) => (
  <table className="w-full min-w-[720px] divide-y divide-gray-200">
    <GroupTableHead firstLabel="본부" />
    <tbody className="divide-y divide-gray-200 bg-white">
      <SubtotalRow subtotal={total} />
      {/* 제외 행만 있는 본부도 행으로 남으므로 빈 결과는 hqs 길이가 아니라 코호트 원수로 판정한다 */}
      {total.districtCount === 0 && <EmptyCohortRow />}
      {hqs.map((group) => (
        <tr
          key={group.hq}
          onClick={() => onSelectHq(group.hq)}
          className="cursor-pointer transition-colors hover:bg-blue-50/50"
        >
          <td className="whitespace-nowrap px-3 py-2.5 text-center">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelectHq(group.hq)
              }}
              className={SELECT_BUTTON_CLASS}
            >
              {hqDisplay(group.hq)}
            </button>
          </td>
          <GroupStatCells subtotal={group.subtotal} textClass="text-gray-700" />
        </tr>
      ))}
    </tbody>
  </table>
)

export interface NewDistrictBranchTableProps {
  subtotal: NewDistrictSubtotal
  branches: NewDistrictBranchGroup[]
  onSelectBranch: (branch: string) => void
}

/** 지사 표 — 순서는 라이브러리가 조직 순서로 정렬해 준 그대로 쓰고 다시 정렬하지 않는다. */
export const NewDistrictBranchTable = ({
  subtotal,
  branches,
  onSelectBranch,
}: NewDistrictBranchTableProps) => (
  <table className="w-full min-w-[720px] divide-y divide-gray-200">
    <GroupTableHead firstLabel="지사" />
    <tbody className="divide-y divide-gray-200 bg-white">
      <SubtotalRow subtotal={subtotal} />
      {/* 제외 행만 있는 지사도 행으로 남으므로 빈 결과는 코호트 원수로 판정한다 */}
      {subtotal.districtCount === 0 && <EmptyCohortRow />}
      {branches.map((group) => (
        <tr
          key={group.branch}
          onClick={() => onSelectBranch(group.branch)}
          className="cursor-pointer transition-colors hover:bg-blue-50/50"
        >
          <td className="whitespace-nowrap px-3 py-2.5 text-center">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelectBranch(group.branch)
              }}
              className={SELECT_BUTTON_CLASS}
            >
              {group.branch}
            </button>
          </td>
          <GroupStatCells subtotal={group.subtotal} textClass="text-gray-700" />
        </tr>
      ))}
    </tbody>
  </table>
)

const ProjectRowCells = ({ row, showHq }: { row: NewDistrictProjectRow; showHq: boolean }) => (
  <>
    <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
      {row.projectName || '-'}
      {showHq && row.managingHq && (
        <span className="mt-0.5 block text-xs font-normal text-gray-500">
          {hqDisplay(row.managingHq)}
        </span>
      )}
      {row.excluded && (
        <span className="mt-0.5 block text-xs font-normal text-gray-500">
          {excludeReasonLabel(row.excludeReason)}
        </span>
      )}
    </td>
    <td className={`${CELL_CLASS} text-gray-600`}>{formatDate(row.representativeStartDate)}</td>
    <td className={`${CELL_CLASS} text-gray-600`}>{formatDate(row.deadlineDate)}</td>
    <td className="whitespace-pre-line px-3 py-2.5 text-center text-sm tabular-nums text-gray-600">
      {row.inspectionDates.length === 0
        ? '-'
        : row.inspectionDates.map((date) => formatDate(date)).join('\n')}
    </td>
    <td className={`${CELL_CLASS} text-gray-700`}>{formatInspectionCount(row.inspectionCount)}</td>
    <td className="whitespace-nowrap px-3 py-2.5 text-center">
      <InspectedBadge row={row} />
    </td>
  </>
)

export interface NewDistrictProjectTableProps {
  subtotal: NewDistrictSubtotal
  projects: NewDistrictProjectRow[]
  /** 동명 지사로 바로 들어와 본부를 고르지 못했을 때 소속 본부를 함께 보여준다. */
  showHq?: boolean
}

const ProjectTableHead = () => (
  <thead className="bg-gray-50">
    <tr>
      <th className="min-w-[220px] px-3 py-2.5 text-left text-xs font-medium text-gray-500">
        지구명
      </th>
      <th className={HEAD_CELL_CLASS}>대표 계약 시작일</th>
      <th className={HEAD_CELL_CLASS}>인정 기한</th>
      <th className={HEAD_CELL_CLASS}>점검일</th>
      <th className={HEAD_CELL_CLASS}>점검 건수</th>
      <th className={HEAD_CELL_CLASS}>점검 여부</th>
    </tr>
  </thead>
)

/**
 * 프로젝트(지구) 표 — 연도 코호트 행만 본표에 싣고,
 * 관할의 대부분을 차지하는 판정 불가 행은 아래 접힌 구역으로 내려 본표를 덮지 않게 한다.
 */
export const NewDistrictProjectTable = ({
  subtotal,
  projects,
  showHq = false,
}: NewDistrictProjectTableProps) => {
  const cohortRows = projects.filter((row) => !row.excluded)
  const excludedRows = projects.filter((row) => row.excluded)

  return (
    <>
      <table className="w-full min-w-[900px] divide-y divide-gray-200">
        <ProjectTableHead />
        <tbody className="divide-y divide-gray-200 bg-white">
          {/* 열 머리글이 지구 단위라 소계는 각 칸에 무엇을 센 값인지 함께 적는다 */}
          <tr className={SUBTOTAL_ROW_CLASS}>
            <td className="px-3 py-2 text-sm text-center text-blue-800">소계</td>
            <td className={`${CELL_CLASS} text-blue-800`}>{`신규 ${subtotal.districtCount}개`}</td>
            <td className={`${CELL_CLASS} text-blue-800`}>
              {subtotal.excludedCount === 0 ? '-' : `제외 ${subtotal.excludedCount}개`}
            </td>
            <td className={`${CELL_CLASS} text-blue-800`}>
              {`점검 ${subtotal.inspectedDistrictCount}개`}
            </td>
            <td className={`${CELL_CLASS} text-blue-800`}>
              {formatInspectionCount(subtotal.inspectionCount)}
            </td>
            <td className={`${CELL_CLASS} text-blue-800`}>{formatRate(subtotal.rate)}</td>
          </tr>
          {subtotal.districtCount === 0 && <EmptyCohortRow />}
          {cohortRows.map((row) => (
            <tr key={row.projectId} className="transition-colors hover:bg-blue-50/50">
              <ProjectRowCells row={row} showHq={showHq} />
            </tr>
          ))}
        </tbody>
      </table>
      {excludedRows.length > 0 && (
        <details className="border-t border-gray-200 bg-gray-50">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-xs font-medium text-gray-600">
            {`대표 계약 미확인으로 착공연도 판정 불가 (${excludedRows.length}개)`}
          </summary>
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="w-full min-w-[900px] divide-y divide-gray-200">
              <ProjectTableHead />
              <tbody className="divide-y divide-gray-200 bg-white">
                {excludedRows.map((row) => (
                  <tr key={row.projectId} className="bg-gray-50/40">
                    <ProjectRowCells row={row} showHq={showHq} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  )
}
