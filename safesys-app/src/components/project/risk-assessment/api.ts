// 수시 위험성평가 마법사가 쓰는 위험요인 DB 조회·AI 판정 호출 래퍼

import { supabase } from '@/lib/supabase'
import type {
  RiskAiJudgement,
  RiskAiRequest,
  RiskAiResponse,
  RiskHazard,
  RiskHazardsResponse,
  RiskTaxonomyResponse,
} from '@/lib/risk-assessment/types'

// 인덱스 시그니처가 필요한 toQuery에 그대로 넘기려고 인터페이스 대신 타입 별칭으로 둔다.
export type TaxonomyFilter = {
  businessType?: string
  construction?: string
  unitWork?: string
}

function toQuery(filter: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** 위험요인 DB 조회 API는 Bearer 세션 토큰 인증을 요구한다. */
async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.')
  return { Authorization: `Bearer ${session.access_token}` }
}

/** 캐스케이드 다음 단계 목록 — 파라미터가 없으면 사업별, businessType만 주면 공사 목록을 받는다. */
export async function fetchTaxonomy(filter: TaxonomyFilter): Promise<string[]> {
  const response = await fetch(`/api/risk-db/taxonomy${toQuery(filter)}`, { headers: await authHeaders() })
  const result = (await response.json()) as RiskTaxonomyResponse
  if (!response.ok || !result.success) {
    throw new Error(result.error || '분류 목록을 불러오지 못했습니다.')
  }
  return result.data || []
}

/** 선택한 세부단위작업의 위험요인 원문을 받는다. */
export async function fetchHazards(filter: {
  businessType?: string
  construction: string
  unitWork: string
  detailWork: string
}): Promise<RiskHazard[]> {
  const response = await fetch(`/api/risk-db/hazards${toQuery(filter)}`, { headers: await authHeaders() })
  const result = (await response.json()) as RiskHazardsResponse
  if (!response.ok || !result.success) {
    throw new Error(result.error || '위험요인을 불러오지 못했습니다.')
  }
  return result.data || []
}

/** Gemini 판정 요청 — 선별·빈도·강도·장비만 받아온다. */
export async function requestAiJudgement(payload: RiskAiRequest): Promise<RiskAiJudgement[]> {
  const response = await fetch('/api/ai/risk-assessment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = (await response.json()) as RiskAiResponse
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'AI 판정에 실패했습니다.')
  }
  return result.data || []
}
