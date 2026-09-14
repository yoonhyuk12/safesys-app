// 신규지구 안전컨설팅에 필요한 대표 계약·본부 불시점검을 Supabase에서 읽어 집계 결과로 돌려주는 모듈이다.
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'
import {
  aggregateNewDistrictConsulting,
  resolveNewDistrictCohort,
} from '@/lib/new-district-consulting-utils'
import type {
  ConsultingContractRow,
  ConsultingInspectionRow,
  NewDistrictConsultingResult,
} from '@/lib/new-district-consulting-utils'

export type {
  ConsultingContractRow,
  ConsultingInspectionRow,
  NewDistrictBranchGroup,
  NewDistrictCohort,
  NewDistrictCohortEntry,
  NewDistrictConsultingResult,
  NewDistrictExcludeReason,
  NewDistrictHqGroup,
  NewDistrictProjectInput,
  NewDistrictProjectRow,
  NewDistrictSubtotal,
  RepresentativeStartDate,
} from '@/lib/new-district-consulting-utils'

export {
  DEFAULT_CONSULTING_MONTHS,
  MIN_CONSULTING_MONTHS,
  addMonthsToDateText,
  aggregateNewDistrictConsulting,
  buildNewDistrictConsulting,
  clampConsultingMonths,
  ctrtNoFromUrl,
  isThtmPartial,
  nameGroupKey,
  resolveNewDistrictCohort,
  resolveRepresentativeContractId,
  resolveRepresentativeStartDate,
} from '@/lib/new-district-consulting-utils'

/** PostgREST 한 페이지 최대 행수. */
const PAGE_SIZE = 1000

/** in() 필터 URL이 지나치게 길어지지 않도록 프로젝트 id를 나눠 조회한다. */
const PROJECT_ID_CHUNK = 80

// projects를 임베드하면 FK가 둘이라 모호성 오류가 나므로 계약 컬럼만 읽는다.
const CONTRACT_COLUMNS =
  'id, project_id, contract_type, cntrct_nm, cntrct_no, unty_cntrct_no, cntrct_info_url, start_date, tot_cntrct_amt, thtm_cntrct_amt'

const INSPECTION_COLUMNS = 'id, project_id, inspection_date'

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/** 대표 계약 해석에 필요한 계약 행을 관할 프로젝트 전부에 대해 누락 없이 읽는다. */
async function fetchContracts(projectIds: string[]): Promise<ConsultingContractRow[]> {
  const collected: ConsultingContractRow[] = []

  for (const ids of chunk(projectIds, PROJECT_ID_CHUNK)) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from('project_contracts')
        .select(CONTRACT_COLUMNS)
        .in('project_id', ids)
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (error) {
        throw new Error(error.message || '계약 조회에 실패했습니다.')
      }

      const rows = (data ?? []) as unknown as ConsultingContractRow[]
      collected.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }
  }

  return collected
}

/** 인정 구간을 덮는 본부 불시점검을 읽는다. 패트롤 여부와 무관하게 전부 컨설팅 실적이다. */
async function fetchInspections(
  projectIds: string[],
  startDate: string,
  endDate: string
): Promise<ConsultingInspectionRow[]> {
  const collected: ConsultingInspectionRow[] = []

  for (const ids of chunk(projectIds, PROJECT_ID_CHUNK)) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from('headquarters_inspections')
        .select(INSPECTION_COLUMNS)
        .in('project_id', ids)
        .gte('inspection_date', startDate)
        .lte('inspection_date', endDate)
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (error) {
        throw new Error(error.message || '본부 점검 조회에 실패했습니다.')
      }

      const rows = (data ?? []) as unknown as ConsultingInspectionRow[]
      collected.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }
  }

  return collected
}

/**
 * 관할 프로젝트 목록을 받아 선택 연도 신규지구의 컨설팅 실적을 집계한다.
 * 관할 범위 적용은 호출자(getProjectsByUserBranch)의 몫이라 이 모듈은 프로젝트를 조회하지 않는다.
 */
export async function getNewDistrictConsulting(
  projects: Project[],
  year: number,
  months: number
): Promise<NewDistrictConsultingResult> {
  const projectIds = Array.from(new Set(projects.map((project) => project.id).filter(Boolean)))
  const contracts = projectIds.length > 0 ? await fetchContracts(projectIds) : []

  const cohort = resolveNewDistrictCohort(projects, contracts, year, months)
  const targetIds = cohort.entries.filter((entry) => !entry.excluded).map((entry) => entry.project.id)

  const inspections =
    targetIds.length > 0 && cohort.minStartDate && cohort.maxDeadlineDate
      ? await fetchInspections(targetIds, cohort.minStartDate, cohort.maxDeadlineDate)
      : []

  return aggregateNewDistrictConsulting(cohort, inspections)
}
