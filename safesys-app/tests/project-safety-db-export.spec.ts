// 프로젝트 DB 엑셀의 정렬과 안전 대상 판정 규칙을 검증한다
import { expect, test } from '@playwright/test'
import type { Project } from '../src/lib/projects'
import { buildProjectSafetyDbExcelRows } from '../src/lib/excel/project-safety-db-export'

const createProject = (overrides: Partial<Project>): Project => ({
  id: 'project-1',
  project_name: '기본 사업',
  managing_hq: '한강유역본부',
  managing_branch: '경기동북권지사',
  site_address: '',
  site_address_detail: '',
  created_by: 'user-1',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...overrides,
})

test('본부와 지사, 표시 순서, 사업명 순으로 프로젝트를 정렬한다', () => {
  const rows = buildProjectSafetyDbExcelRows([
    createProject({ id: '5', managing_hq: '충남', managing_branch: '천안지사', project_name: '충남 사업', display_order: 0 }),
    createProject({ id: '4', managing_hq: '경기', managing_branch: '여주·이천지사', project_name: '나 사업', display_order: 1 }),
    createProject({ id: '3', managing_hq: '경기', managing_branch: '여주·이천지사', project_name: '가 사업', display_order: 1 }),
    createProject({ id: '2', managing_hq: '경기', managing_branch: '여주·이천지사', project_name: '먼저 사업', display_order: 0 }),
    createProject({ id: '1', managing_hq: '경기', managing_branch: '경기본부', project_name: '본부 사업', display_order: 9 }),
  ], [], [])

  expect(rows.map((row) => row.사업명)).toEqual(['본부 사업', '먼저 사업', '가 사업', '나 사업', '충남 사업'])
})

test('유해위험방지 대상은 최신 비어 있지 않은 점검 값을 사용한다', () => {
  const rows = buildProjectSafetyDbExcelRows([
    createProject({ id: 'project-1' }),
    createProject({ id: 'project-2', project_name: '대상 없음' }),
  ], [
    { project_id: 'project-1', inspection_date: '2026-04-01', has_special_construction1: '' },
    { project_id: 'project-1', inspection_date: '2026-03-01', has_special_construction1: '예' },
    { project_id: 'project-1', inspection_date: '2026-02-01', has_special_construction1: '아니오' },
  ], [])

  expect(rows.map((row) => row.유해위험방지대상여부)).toEqual(['O', ''])
})

test('법적이행 대상 두 필드는 각각 최신 비어 있지 않은 값을 독립적으로 사용한다', () => {
  const rows = buildProjectSafetyDbExcelRows([
    createProject({ id: 'project-1' }),
  ], [], [
    {
      project_id: 'project-1',
      check_year: 2026,
      check_quarter: 2,
      form_data: {
        overview: { safetyPlanTarget: '' },
        ownerBasic: { designSafetyReview: { applicable: '부' } },
      },
    },
    {
      project_id: 'project-1',
      check_year: 2026,
      check_quarter: 1,
      form_data: {
        overview: { safetyPlanTarget: '③' },
        ownerBasic: { designSafetyReview: { applicable: '' } },
      },
    },
    {
      project_id: 'project-1',
      check_year: 2025,
      check_quarter: 4,
      form_data: {
        overview: { safetyPlanTarget: '해당없음' },
        ownerBasic: { designSafetyReview: { applicable: '여' } },
      },
    },
  ])

  expect(rows[0].건진법안전관리비대상여부).toBe('O')
  expect(rows[0].설계안전성검토대상여부).toBe('X')
})
