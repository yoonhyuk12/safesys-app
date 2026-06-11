'use client'

import React, { useState } from 'react'
import { History, Loader2, Sparkles } from 'lucide-react'
import { TbmCandidate, fetchRecentTbm } from '@/lib/ptw/recent-tbm'
import {
  HighRiskPermitFormData,
  HIGH_RISK_TARGET_WORKS,
  HIGH_RISK_EQUIPMENT_CHECKS,
} from '@/lib/ptw/permit-types'

interface HighRiskPermitFormProps {
  formData: HighRiskPermitFormData
  onChange: (formData: HighRiskPermitFormData) => void
  projectId?: string
  projectName?: string
}

const labelCls = 'bg-gray-100 px-2 py-2 font-semibold text-xs sm:text-sm min-w-[80px] border-r border-gray-300 shrink-0 flex items-center'
const inputCls = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'

export default function HighRiskPermitForm({ formData, onChange, projectId, projectName }: HighRiskPermitFormProps) {
  const [aiLoading, setAiLoading] = useState(false)

  // 최근 TBM 가져오기
  const [tbmListOpen, setTbmListOpen] = useState(false)
  const [tbmLoading, setTbmLoading] = useState(false)
  const [tbmApplying, setTbmApplying] = useState(false)
  const [tbmCandidates, setTbmCandidates] = useState<TbmCandidate[]>([])

  const loadTbmCandidates = async () => {
    if (!projectId) return
    setTbmLoading(true)
    try {
      setTbmCandidates(await fetchRecentTbm(projectId, projectName))
      setTbmListOpen(true)
    } catch {
      alert('TBM 제출 내역을 불러오지 못했습니다.')
    } finally {
      setTbmLoading(false)
    }
  }

  // TBM 선택 → 작업내용 채우고 AI로 공종/인원/장비/규격/대상공종 정리
  const applyTbmCandidate = async (tbm: TbmCandidate) => {
    setTbmListOpen(false)
    const location =
      [tbm.address, tbm.detail_address].filter(Boolean).join(' ') || formData.work.location

    const base: HighRiskPermitFormData = {
      ...formData,
      work: {
        ...formData.work,
        work_detail: tbm.today_work || '',
        location,
        personnel: tbm.personnel_count || formData.work.personnel,
      },
      equipment: {
        ...formData.equipment,
        equipment_type: tbm.equipment_input || formData.equipment.equipment_type,
      },
    }
    onChange(base)

    setTbmApplying(true)
    try {
      // 1차: 공종명/인원/장비/규격/대상공종 AI 정리
      let enriched = base
      try {
        const response = await fetch('/api/ai/ptw-work-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            todayWork: tbm.today_work,
            personnel: tbm.personnel_count,
            equipment: tbm.equipment_input,
          }),
        })
        const result = await response.json()
        if (response.ok && result.success && result.data) {
          // 해당공종 번호 파싱 → 대상공종 자동 체크
          const indices = String(result.data.targetIndices || '')
            .split(',')
            .map((part: string) => parseInt(part.trim(), 10))
            .filter((n: number) => n >= 1 && n <= HIGH_RISK_TARGET_WORKS.length)
          const targetChecks =
            indices.length > 0
              ? base.work.target_checks.map((_, i) => indices.includes(i + 1))
              : base.work.target_checks

          const clean = (value?: string) => (value && value !== '-' ? value : '')
          enriched = {
            ...base,
            work: {
              ...base.work,
              work_type: clean(result.data.workType) || base.work.work_type,
              personnel: clean(result.data.personnel) || base.work.personnel,
              target_checks: targetChecks,
            },
            equipment: {
              ...base.equipment,
              equipment_type: clean(result.data.equipmentType) || base.equipment.equipment_type,
              spec: clean(result.data.spec) || base.equipment.spec,
            },
          }
          onChange(enriched)
        }
      } catch {
        // 1차 정리 실패해도 TBM 원본 값은 이미 채워짐
      }

      // 2차: 위험요소~조치결과까지 이어서 AI 작성
      setAiLoading(true)
      try {
        const withRisk = await fetchRiskAnalysis(enriched)
        if (withRisk) onChange(withRisk)
      } catch {
        // 2차 실패해도 1차 결과는 유지
      } finally {
        setAiLoading(false)
      }
    } finally {
      setTbmApplying(false)
    }
  }

  // 위험요소~조치결과 AI 작성 (입력 데이터 기준으로 호출 후 병합 결과 반환)
  const fetchRiskAnalysis = async (data: HighRiskPermitFormData): Promise<HighRiskPermitFormData | null> => {
    const targetWorks = HIGH_RISK_TARGET_WORKS.filter((_, i) => data.work.target_checks[i])
    const response = await fetch('/api/ai/ptw-risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workType: data.work.work_type,
        workDetail: data.work.work_detail,
        targetWorks,
        equipmentType: data.equipment.equipment_type,
        personnel: data.work.personnel,
        location: data.work.location,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || 'AI 작성 중 오류가 발생했습니다.')
    }
    if (!result.success || !result.data) return null

    return {
      ...data,
      risk: {
        factor: result.data.riskFactor || data.risk.factor,
        measure: result.data.improvement || data.risk.measure,
        disaster_type: result.data.disasterType || data.risk.disaster_type,
      },
      supervisor: {
        opinion: result.data.reviewOpinion || data.supervisor.opinion,
        action: result.data.actionResult || data.supervisor.action,
      },
    }
  }

  // AI 작성하기 버튼
  const handleAIWrite = async () => {
    if (!formData.work.work_detail && !formData.work.work_type) {
      alert('공종명 또는 작업세부공종을 먼저 입력해주세요.')
      return
    }

    setAiLoading(true)
    try {
      const updated = await fetchRiskAnalysis(formData)
      if (updated) onChange(updated)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('AI 작성 실패: ' + message)
    } finally {
      setAiLoading(false)
    }
  }

  const setOverview = (field: keyof HighRiskPermitFormData['overview'], value: string) =>
    onChange({ ...formData, overview: { ...formData.overview, [field]: value } })

  // 작업기간: "YYYY-MM-DD ~ YYYY-MM-DD" 문자열을 날짜 2개로 분리/조합
  const periodParts = (formData.overview.work_period || '').split('~').map((part) => part.trim())
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  const periodStart = isDate(periodParts[0] || '') ? periodParts[0] : ''
  const periodEnd = isDate(periodParts[1] || '') ? periodParts[1] : ''
  const setPeriod = (start: string, end: string) =>
    setOverview('work_period', start || end ? `${start} ~ ${end}` : '')

  // 공사비: 숫자만 입력하면 "백만원" 자동 부착
  const costDigits = (formData.overview.cost || '').replace(/[^0-9.,]/g, '')
  const setCost = (value: string) => {
    const digits = value.replace(/[^0-9.,]/g, '')
    setOverview('cost', digits ? `${digits}백만원` : '')
  }

  const setWork = (field: keyof HighRiskPermitFormData['work'], value: string) =>
    onChange({ ...formData, work: { ...formData.work, [field]: value } })

  const toggleTargetCheck = (index: number) => {
    const newChecks = formData.work.target_checks.map((c, i) => (i === index ? !c : c))
    onChange({ ...formData, work: { ...formData.work, target_checks: newChecks } })
  }

  const setEquipment = (field: 'equipment_type' | 'spec', value: string) =>
    onChange({ ...formData, equipment: { ...formData.equipment, [field]: value } })

  const toggleEquipmentCheck = (index: number) => {
    const newChecks = formData.equipment.checks.map((c, i) => (i === index ? !c : c))
    onChange({ ...formData, equipment: { ...formData.equipment, checks: newChecks } })
  }

  const setRisk = (field: keyof HighRiskPermitFormData['risk'], value: string) =>
    onChange({ ...formData, risk: { ...formData.risk, [field]: value } })

  const setSupervisor = (field: keyof HighRiskPermitFormData['supervisor'], value: string) =>
    onChange({ ...formData, supervisor: { ...formData.supervisor, [field]: value } })

  return (
    <div className="space-y-4">
      {/* 1. 공사개요 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">1. 공사개요</div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {([
            ['managing_dept', '관리부서', '00지역본부 00지사'],
            ['project_name', '공사명', ''],
          ] as [keyof HighRiskPermitFormData['overview'], string, string][]).map(([field, label, placeholder]) => (
            <div key={field} className="flex border-b sm:odd:border-r border-gray-300">
              <div className={labelCls}>{label}</div>
              <div className="flex-1 px-2 py-1.5">
                <input
                  type="text"
                  value={formData.overview[field]}
                  onChange={(e) => setOverview(field, e.target.value)}
                  placeholder={placeholder}
                  className={inputCls}
                />
              </div>
            </div>
          ))}
          {/* 작업기간: 캘린더 선택 (필수) */}
          <div className="flex border-b sm:odd:border-r border-gray-300">
            <div className={labelCls}>작업기간<span className="text-red-500 ml-0.5">*</span></div>
            <div className="flex-1 flex flex-wrap items-center gap-1 px-2 py-1.5">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriod(e.target.value, periodEnd)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <span className="text-gray-500 text-sm">~</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriod(periodStart, e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div className="flex border-b sm:odd:border-r border-gray-300">
            <div className={labelCls}>수급인</div>
            <div className="flex-1 px-2 py-1.5">
              <input
                type="text"
                value={formData.overview.contractor}
                onChange={(e) => setOverview('contractor', e.target.value)}
                placeholder="원도급사"
                className={inputCls}
              />
            </div>
          </div>
          {/* 공사비: 숫자 입력 → 백만원 자동 (필수) */}
          <div className="flex border-b sm:odd:border-r border-gray-300">
            <div className={labelCls}>공 사 비<span className="text-red-500 ml-0.5">*</span></div>
            <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5">
              <input
                type="text"
                inputMode="numeric"
                value={costDigits}
                onChange={(e) => setCost(e.target.value)}
                placeholder="000"
                className={`${inputCls} text-right max-w-[140px]`}
              />
              <span className="text-sm text-gray-600 shrink-0">백만원</span>
            </div>
          </div>
          <div className="flex border-b sm:odd:border-r border-gray-300">
            <div className={labelCls}>책임자</div>
            <div className="flex-1 px-2 py-1.5">
              <input
                type="text"
                value={formData.overview.manager}
                onChange={(e) => setOverview('manager', e.target.value)}
                placeholder="성명(연락처)"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. 위험공종 작업 내용 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 border-b border-gray-300 flex items-center gap-3">
          <span className="font-semibold text-sm">2. 위험공종 작업 내용</span>
          {projectId && (
            <div className="relative">
              <button
                type="button"
                onClick={() => (tbmListOpen ? setTbmListOpen(false) : loadTbmCandidates())}
                disabled={tbmLoading || tbmApplying}
                className="flex items-center gap-1 px-2.5 py-1 text-xs sm:text-sm text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {tbmLoading || tbmApplying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <History className="h-3.5 w-3.5" />
                )}
                {tbmApplying ? 'AI 정리 중...' : '최근 TBM 가져오기'}
              </button>
              {tbmListOpen && (
                <div className="absolute left-0 top-full mt-1 w-80 max-h-72 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg z-20">
                  {tbmCandidates.length === 0 ? (
                    <div className="p-4 text-xs text-gray-400 text-center">제출된 TBM이 없습니다.</div>
                  ) : (
                    tbmCandidates.map((tbm) => {
                      const preview = (tbm.today_work || '').replace(/\s+/g, ' ').trim()
                      return (
                        <button
                          key={tbm.id}
                          type="button"
                          onClick={() => applyTbmCandidate(tbm)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                        >
                          <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{tbm.meeting_date}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            {preview.slice(0, 10)}{preview.length > 10 ? '…' : ''}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="flex border-b sm:border-r border-gray-300">
            <div className={labelCls}>공종명</div>
            <div className="flex-1 px-2 py-1.5">
              <input type="text" value={formData.work.work_type} onChange={(e) => setWork('work_type', e.target.value)} placeholder="예) 토공사" className={inputCls} />
            </div>
          </div>
          <div className="flex border-b border-gray-300">
            <div className={labelCls}>작업업체명<span className="text-red-500 ml-0.5">*</span></div>
            <div className="flex-1 px-2 py-1.5">
              <input type="text" value={formData.work.sub_contractor} onChange={(e) => setWork('sub_contractor', e.target.value)} placeholder="하도급사" className={inputCls} />
            </div>
          </div>
        </div>

        {/* 작업허가제 대상공종 (좌) + 작업세부공종 (우) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-gray-300">
          <div className="sm:border-r border-b sm:border-b-0 border-gray-300">
            <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200">작업허가제 대상공종 (관련공종 ✓)</div>
            <div className="px-2 py-1">
              {HIGH_RISK_TARGET_WORKS.map((work, index) => (
                <label key={index} className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={formData.work.target_checks[index] || false}
                    onChange={() => toggleTargetCheck(index)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{'①②③④⑤⑥⑦⑧'[index]} {work}</span>
                </label>
              ))}
            </div>
            {formData.work.target_checks[7] && (
              <div className="px-3 pb-2">
                <input type="text" value={formData.work.target_other} onChange={(e) => setWork('target_other', e.target.value)} placeholder="대상작업 기록" className={inputCls} />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-200">작업세부공종</div>
            <div className="flex-1 px-2 py-1.5">
              <textarea
                value={formData.work.work_detail}
                onChange={(e) => setWork('work_detail', e.target.value)}
                placeholder="예) 높이 3.7m의 00배수장 거푸집 해체"
                className={`${inputCls} h-full min-h-[120px] resize-none`}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="flex border-b sm:border-r border-gray-300">
            <div className={labelCls}>작업인원</div>
            <div className="flex-1 px-2 py-1.5">
              <input type="text" value={formData.work.personnel} onChange={(e) => setWork('personnel', e.target.value)} placeholder="총 0명 (00공 0인, 00공 0인)" className={inputCls} />
            </div>
          </div>
          <div className="flex border-b border-gray-300">
            <div className={labelCls}>작업위치</div>
            <div className="flex-1 px-2 py-1.5">
              <input type="text" value={formData.work.location} onChange={(e) => setWork('location', e.target.value)} placeholder="예) 00배수장 전면부" className={inputCls} />
            </div>
          </div>
        </div>

        {/* 중장비 작업 */}
        <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-b border-gray-300">
          중장비 작업 (타워크레인, 차량계 하역운반기계, 차량계 건설기계 작성)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="flex border-b sm:border-r border-gray-300">
            <div className={labelCls}>장비종류</div>
            <div className="flex-1 px-2 py-1.5">
              <input type="text" value={formData.equipment.equipment_type} onChange={(e) => setEquipment('equipment_type', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex border-b border-gray-300">
            <div className={labelCls}>규 격</div>
            <div className="flex-1 px-2 py-1.5">
              <input type="text" value={formData.equipment.spec} onChange={(e) => setEquipment('spec', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="border-b border-gray-300">
          <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">검토내용</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 px-2 py-1">
            {HIGH_RISK_EQUIPMENT_CHECKS.map((check, index) => (
              <label key={index} className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer hover:bg-gray-50 rounded">
                <input
                  type="checkbox"
                  checked={formData.equipment.checks[index] || false}
                  onChange={() => toggleEquipmentCheck(index)}
                  className="h-4 w-4 shrink-0"
                />
                <span>{check}</span>
              </label>
            ))}
          </div>
        </div>

        {/* AI 작성 (위험요소 ~ 공사감독 검토내용) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-green-50 border-b border-gray-300 px-3 py-2">
          <span className="text-xs text-gray-600">
            위험요소 · 개선대책 · 재해형태 · 검토의견 · 조치결과를 AI가 작성합니다
          </span>
          <button
            type="button"
            onClick={handleAIWrite}
            disabled={aiLoading}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {aiLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 분석 중...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                AI 작성하기
              </>
            )}
          </button>
        </div>

        {/* 위험요소/개선대책/재해형태 */}
        <div className="grid grid-cols-1 sm:grid-cols-3">
          <div className="border-b sm:border-r border-gray-300">
            <div className="bg-gray-100 px-2 py-1.5 text-xs font-semibold text-center border-b border-gray-300">위험요소</div>
            <div className="p-1.5">
              <textarea value={formData.risk.factor} onChange={(e) => setRisk('factor', e.target.value)} placeholder="위험성 평가 결과 요약" rows={2} className={inputCls} />
            </div>
          </div>
          <div className="border-b sm:border-r border-gray-300">
            <div className="bg-gray-100 px-2 py-1.5 text-xs font-semibold text-center border-b border-gray-300">개선대책</div>
            <div className="p-1.5">
              <textarea value={formData.risk.measure} onChange={(e) => setRisk('measure', e.target.value)} placeholder="개선대책 결과 요약" rows={2} className={inputCls} />
            </div>
          </div>
          <div className="border-b border-gray-300">
            <div className="bg-gray-100 px-2 py-1.5 text-xs font-semibold text-center border-b border-gray-300">재해형태</div>
            <div className="p-1.5">
              <textarea value={formData.risk.disaster_type} onChange={(e) => setRisk('disaster_type', e.target.value)} placeholder="관련재해 (예: 비래/추락)" rows={2} className={inputCls} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 공사감독 검토내용 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">3. 공사감독 검토내용</div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="sm:border-r border-b sm:border-b-0 border-gray-300">
            <div className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-center border-b border-gray-300">검토의견</div>
            <div className="p-1.5">
              <textarea value={formData.supervisor.opinion} onChange={(e) => setSupervisor('opinion', e.target.value)} rows={2} className={inputCls} />
            </div>
          </div>
          <div>
            <div className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-center border-b border-gray-300">조치결과</div>
            <div className="p-1.5">
              <textarea value={formData.supervisor.action} onChange={(e) => setSupervisor('action', e.target.value)} rows={2} className={inputCls} />
            </div>
          </div>
        </div>
      </div>

      {/* 허가일자 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden flex">
        <div className={labelCls}>허가일자</div>
        <div className="flex-1 px-2 py-1.5 flex justify-center items-center">
          <input
            type="date"
            value={formData.permit_date || ''}
            onChange={(e) => onChange({ ...formData, permit_date: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      <p className="text-xs text-gray-400 px-1">
        붙임: 1. 해당공종 수시 위험성평가표 / 2. 개선대책 확인자료(사진 등) / 3. 차량계 건설기계 작업계획서
      </p>
    </div>
  )
}
