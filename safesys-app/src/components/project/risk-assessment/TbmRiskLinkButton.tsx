'use client'

// TBM 제출 모달에서 실시한 수시위험성평가를 골라 잠재위험요인·해결방안을 채우는 연계 버튼

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RiskAssessmentRow, TbmRiskLinkItem, TbmRiskLinkResponse } from '@/lib/risk-assessment/types'

interface RiskAssessmentOption {
  id: string
  title: string
  created_at: string
  rows: RiskAssessmentRow[]
}

interface TbmRiskLinkButtonProps {
  projectId: string
  todayWork: string
  disabled: boolean
  onApply: (items: TbmRiskLinkItem[]) => void
}

const LIMIT = 20

const formatDate = (value: string) => value.slice(0, 10).replace(/-/g, '.')

export default function TbmRiskLinkButton({ projectId, todayWork, disabled, onApply }: TbmRiskLinkButtonProps) {
  const [assessments, setAssessments] = useState<RiskAssessmentOption[]>([])
  const [open, setOpen] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)

  const loadAssessments = useCallback(async () => {
    const { data, error } = await supabase
      .from('risk_assessments')
      .select('id, title, created_at, rows')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    if (error) {
      // 조회 실패는 버튼을 비활성 모양으로 두고 안내로 처리한다
      console.error('수시위험성평가 목록 조회 실패:', error)
      setAssessments([])
      return
    }
    setAssessments((data || []) as unknown as RiskAssessmentOption[])
  }, [projectId])

  useEffect(() => {
    if (projectId) loadAssessments()
  }, [projectId, loadAssessments])

  const hasAssessment = assessments.length > 0

  // 비활성 모양이어도 클릭은 받아 안내를 띄운다 (disabled 속성을 쓰면 클릭이 막힌다)
  const handleButtonClick = () => {
    if (!hasAssessment) {
      alert('수시 위험성평가를 실시해주세요.')
      return
    }
    setOpen((current) => !current)
  }

  const handleSelect = async (assessment: RiskAssessmentOption) => {
    if (linkingId) return
    if (!todayWork.trim()) {
      alert('금일 작업내용을 먼저 입력해주세요.')
      return
    }
    if (!confirm(`「${assessment.title}」의 위험요인으로 잠재위험요인 1~3과 해결방안 1~3을 채웁니다.\n기존에 입력된 내용은 덮어씁니다. 계속할까요?`)) return

    setLinkingId(assessment.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.')

      const response = await fetch('/api/ai/tbm-risk-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          todayWork: todayWork.trim(),
          rows: (assessment.rows || []).map((row) => ({
            hazard: row.hazard,
            disasterType: row.disasterType,
            measures: row.measures,
            frequency: row.frequency,
            intensity: row.intensity,
          })),
        }),
      })

      const result = (await response.json()) as TbmRiskLinkResponse
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '위험성평가 연계에 실패했습니다.')
      }

      onApply(result.data)
      setOpen(false)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : '위험성평가 연계에 실패했습니다.')
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || linkingId !== null}
        className={`flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
          hasAssessment
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
        }`}
      >
        {linkingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
        {linkingId ? '연계 중...' : '수시위험성평가 연계'}
        {hasAssessment && !linkingId && (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
      </button>

      {open && hasAssessment && (
        <>
          {/* 목록 밖을 눌러도 닫히도록 투명 배경을 깐다 */}
          <button type="button" aria-label="위험성평가 목록 닫기" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 z-20 mt-1 w-[min(24rem,calc(100vw-3rem))] rounded-lg border border-gray-200 bg-white shadow-lg">
            <p className="border-b border-gray-100 px-3 py-2 text-xs text-amber-700">
              선택하면 금일 작업과 관련된 위험요인 최대 3건으로 잠재위험요인·해결방안을 덮어씁니다.
            </p>
            <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto">
              {assessments.map((assessment) => (
                <li key={assessment.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(assessment)}
                    disabled={linkingId !== null}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 disabled:opacity-50"
                  >
                    <span className="block truncate text-sm text-gray-900">{assessment.title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {formatDate(assessment.created_at)} · {(assessment.rows || []).length}행
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
