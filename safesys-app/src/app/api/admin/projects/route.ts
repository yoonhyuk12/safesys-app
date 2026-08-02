// 관리자용 프로젝트 전체 목록과 조직별 집계를 제공하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const PROJECT_BATCH_SIZE = 1000
const RECENT_DAYS = 30
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

type ActivityValue = boolean | Record<string, unknown> | null

interface CreatorProfile {
  full_name: string | null
  company_name: string | null
}

interface ProjectQueryRow {
  id: string
  project_name: string | null
  managing_hq: string | null
  managing_branch: string | null
  created_by: string
  created_at: string
  is_active: ActivityValue
  creator: CreatorProfile | CreatorProfile[] | null
}

interface AdminProject {
  id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  created_by: string
  created_at: string
  is_active: ActivityValue
  isActive: boolean
  creator: {
    fullName: string
    companyName: string
  } | null
}

interface ProjectStats {
  total: number
  active: number
  inactive: number
  recent30d: number
  byHq: Record<string, number>
  byBranch: Record<string, number>
}

function isProjectActive(value: ActivityValue): boolean {
  if (typeof value === 'boolean') return value
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some((status) => status === true)
}

function normalizeDivision(value: string | null): string {
  return value?.trim() || '미지정'
}

function normalizeProject(row: ProjectQueryRow): AdminProject {
  const creator = Array.isArray(row.creator) ? row.creator[0] ?? null : row.creator

  return {
    id: row.id,
    project_name: row.project_name?.trim() || '이름 없는 프로젝트',
    managing_hq: normalizeDivision(row.managing_hq),
    managing_branch: normalizeDivision(row.managing_branch),
    created_by: row.created_by,
    created_at: row.created_at,
    is_active: row.is_active,
    isActive: isProjectActive(row.is_active),
    creator: creator
      ? {
          fullName: creator.full_name?.trim() || '이름 미등록',
          companyName: creator.company_name?.trim() || '회사 미등록',
        }
      : null,
  }
}

function calculateStats(projects: AdminProject[]): ProjectStats {
  const now = Date.now()
  const recentThreshold = now - RECENT_DAYS * MILLISECONDS_PER_DAY

  return projects.reduce<ProjectStats>(
    (stats, project) => {
      const createdAt = Date.parse(project.created_at)
      const isRecent = Number.isFinite(createdAt) && createdAt >= recentThreshold && createdAt <= now

      return {
        total: stats.total + 1,
        active: stats.active + (project.isActive ? 1 : 0),
        inactive: stats.inactive + (project.isActive ? 0 : 1),
        recent30d: stats.recent30d + (isRecent ? 1 : 0),
        byHq: {
          ...stats.byHq,
          [project.managing_hq]: (stats.byHq[project.managing_hq] ?? 0) + 1,
        },
        byBranch: {
          ...stats.byBranch,
          [project.managing_branch]: (stats.byBranch[project.managing_branch] ?? 0) + 1,
        },
      }
    },
    { total: 0, active: 0, inactive: 0, recent30d: 0, byHq: {}, byBranch: {} }
  )
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    )
  }

  try {
    let offset = 0
    let rows: ProjectQueryRow[] = []

    while (true) {
      const { data, error } = await supabaseAdmin
        .from('projects')
        .select(`
          id,
          project_name,
          managing_hq,
          managing_branch,
          created_by,
          created_at,
          is_active,
          creator:user_profiles!projects_created_by_fkey (
            full_name,
            company_name
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + PROJECT_BATCH_SIZE - 1)

      if (error) throw error

      const batch = (data ?? []) as ProjectQueryRow[]
      rows = [...rows, ...batch]
      if (batch.length < PROJECT_BATCH_SIZE) break
      offset += PROJECT_BATCH_SIZE
    }

    const projects = rows.map(normalizeProject)

    return NextResponse.json({
      success: true,
      projects,
      stats: calculateStats(projects),
    })
  } catch (error) {
    console.error('관리자 프로젝트 현황 조회 오류', error)
    return NextResponse.json(
      { success: false, error: '프로젝트 현황을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
