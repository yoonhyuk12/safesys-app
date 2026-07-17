// TBM 일괄 텔레그램 발송 — 대상 현장의 소관사업·텔레그램 수신 가능 여부를 조회하는 API
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '../auth'
import { isProjectItemRef, resolveProjects, type ProjectItemRef } from '../resolve-projects'

const MAX_PREPARE_ITEMS = 100

interface PrepareResult {
  projectId: string | null
  projectName: string
  projectCategory: string
  hasClientTelegram: boolean
  hasContractorTelegram: boolean
}

export async function POST(request: NextRequest) {
  try {
    const authentication = await authenticateRequest(request)
    if (!authentication.ok) return authentication.response

    const body: unknown = await request.json().catch(() => null)
    const itemsValue = body && typeof body === 'object'
      ? (body as Record<string, unknown>).items
      : null

    if (Array.isArray(itemsValue) && itemsValue.length > MAX_PREPARE_ITEMS) {
      return NextResponse.json(
        { error: 'prepare 대상은 최대 100개까지 요청할 수 있습니다.' },
        { status: 400 }
      )
    }
    if (
      !Array.isArray(itemsValue) ||
      itemsValue.length === 0 ||
      !itemsValue.every(isProjectItemRef)
    ) {
      return NextResponse.json(
        { error: 'items에는 유효한 프로젝트 항목이 하나 이상 필요합니다.' },
        { status: 400 }
      )
    }
    const items: ProjectItemRef[] = itemsValue

    const resolved = await resolveProjects(authentication.supabase, items)

    const results: PrepareResult[] = items.map((item, index) => {
      const project = resolved[index]
      return {
        projectId: project?.id ?? null,
        projectName: item.projectName,
        projectCategory: project?.project_category?.trim() ? project.project_category : '미분류',
        hasClientTelegram: Boolean(project?.client_telegram_id?.trim()),
        hasContractorTelegram: Boolean(project?.contractor_telegram_id?.trim()),
      }
    })

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('TBM 텔레그램 prepare API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
