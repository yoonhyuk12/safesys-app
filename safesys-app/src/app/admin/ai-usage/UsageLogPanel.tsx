'use client'
// 관리자 AI 사용현황 화면의 「사용 기록」 탭 — 기간별 호출 수·토큰·추정 비용(원)을 집계해 보여준다

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PERIODS: readonly { days: number; label: string }[] = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
]

interface Totals {
  calls: number
  successCalls: number
  failedCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  unpricedCalls: number
}

interface FeatureSummary extends Totals {
  featureKey: string
  feature: string
  provider: string
  model: string
}

interface ModelSummary extends Totals {
  model: string
}

interface UsageLogData {
  days: number
  priced: boolean
  truncated: boolean
  totals: Totals
  byFeature: FeatureSummary[]
  byModel: ModelSummary[]
}

type LogsResponse = ({ success: true } & UsageLogData) | { success: false; error?: string }

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('ko-KR')
}

/** 비용은 정수 원으로 버림 표시한다. 그 묶음 전체가 단가 미입력이면 0원이 아니라 '-'다. */
function formatCost(cost: number, unpricedCalls: number, calls: number): string {
  if (calls > 0 && unpricedCalls === calls) return '-'
  return `${Math.floor(cost).toLocaleString('ko-KR')}원`
}

async function requireAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')
  return session.access_token
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function SectionTable({
  title,
  headers,
  children,
  minWidth,
}: {
  title: string
  headers: readonly string[]
  children: ReactNode
  minWidth: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">{title}</p>
      <div className="overflow-x-auto">
        <table className={`w-full ${minWidth} border-collapse text-left text-sm`}>
          <thead className="border-b border-slate-200 text-xs">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className={`px-3 py-2 font-semibold text-slate-600 ${index === 0 ? '' : 'text-right'}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export default function UsageLogPanel() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<UsageLogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLogs = useCallback(async (period: number) => {
    setLoading(true)
    setError(null)

    try {
      const token = await requireAccessToken()
      const response = await fetch(`/api/admin/ai-usage/logs?days=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = (await response.json()) as LogsResponse

      if (!response.ok || !result.success) {
        throw new Error(!result.success ? result.error || 'AI 호출 기록을 불러오지 못했습니다.' : 'AI 호출 기록을 불러오지 못했습니다.')
      }

      setData(result)
    } catch (loadError) {
      setData(null)
      setError(loadError instanceof Error ? loadError.message : 'AI 호출 기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLogs(days)
  }, [loadLogs, days])

  const totals = data?.totals ?? null
  const unpricedFeatures = data ? data.byFeature.filter((item) => item.unpricedCalls > 0).length : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              onClick={() => setDays(period.days)}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                days === period.days ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadLogs(days)}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadLogs(days)}
            className="shrink-0 rounded-lg px-1 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-red-400"
          >
            다시 시도
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          AI 호출 기록을 불러오는 중입니다.
        </div>
      ) : !data ? null : (
        <>
          {unpricedFeatures > 0 && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {unpricedFeatures}개 기능은 단가가 없어 비용에서 빠졌습니다.
                <span className="mt-0.5 block text-xs font-medium text-amber-700">
                  「모델 설정」 탭에서 해당 기능의 입력·출력 단가를 입력하면 추정 비용에 반영됩니다.
                  빠진 호출은 {formatCount(totals?.unpricedCalls ?? 0)}건입니다.
                </span>
              </span>
            </div>
          )}

          {data.truncated && (
            <div
              role="status"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600"
            >
              기록이 많아 최근 50,000건만 집계했습니다. 기간을 좁혀 조회해주세요.
            </div>
          )}

          {totals && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="총 호출" value={`${formatCount(totals.calls)}건`} />
              <SummaryCard
                label="성공 / 실패"
                value={`${formatCount(totals.successCalls)} / ${formatCount(totals.failedCalls)}`}
                hint="실패한 호출의 토큰도 비용에 포함합니다."
              />
              <SummaryCard
                label="총 토큰"
                value={formatCount(totals.totalTokens)}
                hint={`입력 ${formatCount(totals.promptTokens)} · 출력 ${formatCount(totals.completionTokens)}`}
              />
              <SummaryCard
                label="추정 비용"
                value={formatCost(totals.cost, totals.unpricedCalls, totals.calls)}
                hint={data.priced ? '조회 시점 단가로 계산합니다.' : '단가를 입력하면 계산합니다.'}
              />
            </div>
          )}

          <SectionTable
            title="기능별"
            headers={['기능', '제조사', '모델', '호출', '입력 토큰', '출력 토큰', '비용']}
            minWidth="min-w-[820px]"
          >
            {data.byFeature.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                  아직 기록된 호출이 없습니다.
                </td>
              </tr>
            )}
            {data.byFeature.map((item) => (
              <tr key={item.featureKey} className="transition hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800">{item.feature}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-500">{item.provider}</td>
                <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-500">{item.model}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(item.calls)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCount(item.promptTokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCount(item.completionTokens)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                  {formatCost(item.cost, item.unpricedCalls, item.calls)}
                </td>
              </tr>
            ))}
          </SectionTable>

          <SectionTable
            title="모델별"
            headers={['모델', '호출', '입력 토큰', '출력 토큰', '비용']}
            minWidth="min-w-[620px]"
          >
            {data.byModel.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">
                  아직 기록된 호출이 없습니다.
                </td>
              </tr>
            )}
            {data.byModel.map((item) => (
              <tr key={item.model} className="transition hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900">{item.model}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(item.calls)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCount(item.promptTokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCount(item.completionTokens)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                  {formatCost(item.cost, item.unpricedCalls, item.calls)}
                </td>
              </tr>
            ))}
          </SectionTable>
        </>
      )}
    </div>
  )
}
