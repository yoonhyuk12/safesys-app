// 관리자용 프로젝트 전체 목록과 조직별 집계를 제공하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const PROJECT_BATCH_SIZE = 1000
const RECENT_DAYS = 30
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const CLIENT_ROLE = '발주청'

interface CreatorProfile {
  full_name: string | null
  company_name: string | null
  role: string | null
  hq_division: string | null
  branch_division: string | null
}

interface ProjectQueryRow {
  id: string
  project_name: string | null
  managing_hq: string | null
  managing_branch: string | null
  created_by: string
  created_at: string
  creator: CreatorProfile | CreatorProfile[] | null
}

interface AdminProject {
  id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  created_by: string
  created_at: string
  isHandedOver: boolean
  creator: {
    fullName: string
    affiliation: string
  } | null
}

interface ProjectStats {
  total: number
  handedOver: number
  notHandedOver: number
  recent30d: number
  byHq: Record<string, number>
  byBranch: Record<string, number>
}

// 인계는 소유권 이전(transfer_project_ownership이 created_by를 교체)이라 별도 이력이 남지 않는다.
// 그래서 현재 소유자의 역할로 판별한다 — 발주청이 들고 있으면 미인계, 시공사·감리단이면 인계 완료.
function isHandedOver(role: string | null | undefined): boolean {
  return Boolean(role) && role !== CLIENT_ROLE
}

function normalizeDivision(value: string | null): string {
  return value?.trim() || '미지정'
}

// 발주청 등록자는 회사명 대신 본부·지사로 소속을 밝힌다 — 회사명이 없으면 "발주청 (전남본부/나주지사)" 형태로 대체한다.
function formatAffiliation(creator: CreatorProfile): string {
  const companyName = creator.company_name?.trim()
  if (companyName) return companyName

  const role = creator.role?.trim()
  const division = [creator.hq_division, creator.branch_division]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join('/')

  if (role && division) return `${role} (${division})`
  return role || division || '소속 미등록'
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
    isHandedOver: isHandedOver(creator?.role),
    creator: creator
      ? {
          fullName: creator.full_name?.trim() || '이름 미등록',
          affiliation: formatAffiliation(creator),
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
        handedOver: stats.handedOver + (project.isHandedOver ? 1 : 0),
        notHandedOver: stats.notHandedOver + (project.isHandedOver ? 0 : 1),
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
    { total: 0, handedOver: 0, notHandedOver: 0, recent30d: 0, byHq: {}, byBranch: {} }
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
          creator:user_profiles!projects_created_by_fkey (
            full_name,
            company_name,
            role,
            hq_division,
            branch_division
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
