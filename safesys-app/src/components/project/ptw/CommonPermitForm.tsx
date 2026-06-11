'use client'

import React, { useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { TbmCandidate, fetchRecentTbm } from '@/lib/ptw/recent-tbm'
import {
  CommonPermitFormData,
  PermitTypeConfig,
  ChecklistResult,
  HotWorkGasRow,
  ConfinedGasRow,
  ElectricalDeviceRow,
  HotWorkDeviceRow,
} from '@/lib/ptw/permit-types'

interface CommonPermitFormProps {
  config: PermitTypeConfig
  formData: CommonPermitFormData
  onChange: (formData: CommonPermitFormData) => void
  projectId?: string
  projectName?: string
}

const labelCls = 'bg-gray-100 px-2 py-2 font-semibold text-xs sm:text-sm min-w-[80px] border-r border-gray-300 shrink-0 flex items-center'
const inputCls = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'
const cellInputCls = 'w-full px-1.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'

const CHECKLIST_RESULTS: ChecklistResult[] = ['적정', '부적정', '해당없음']

export default function CommonPermitForm({ config, formData, onChange, projectId, projectName }: CommonPermitFormProps) {
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

  // TBM 선택 → 작업장소 채우고 AI가 허가서 종류에 맞는 작업내용 한 줄 정리
  const applyTbmCandidate = async (tbm: TbmCandidate) => {
    setTbmListOpen(false)
    const location =
      [tbm.address, tbm.detail_address].filter(Boolean).join(' ') || formData.location
    const base: CommonPermitFormData = { ...formData, location }
    onChange(base)

    setTbmApplying(true)
    try {
      const response = await fetch('/api/ai/ptw-work-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todayWork: tbm.today_work,
          permitLabel: config.label,
        }),
      })
      const result = await response.json()
      const aiContent =
        response.ok && result.success && result.data?.content ? result.data.content : ''
      onChange({ ...base, content: aiContent || tbm.today_work || base.content })
    } catch {
      // AI 정리 실패 시 TBM 원본 작업내용으로 대체
      onChange({ ...base, content: tbm.today_work || base.content })
    } finally {
      setTbmApplying(false)
    }
  }

  const setField = <K extends keyof CommonPermitFormData>(field: K, value: CommonPermitFormData[K]) =>
    onChange({ ...formData, [field]: value })

  const setApplicant = (field: keyof CommonPermitFormData['applicant'], value: string) =>
    onChange({ ...formData, applicant: { ...formData.applicant, [field]: value } })

  const setWatcher = (field: keyof CommonPermitFormData['watcher'], value: string) =>
    onChange({ ...formData, watcher: { ...formData.watcher, [field]: value } })

  const setPreAnswer = (index: number, value: string) =>
    setField('pre_answers', formData.pre_answers.map((a, i) => (i === index ? value : a)))

  const setChecklistResult = (index: number, result: ChecklistResult) =>
    setField('checklist', formData.checklist.map((entry, i) =>
      i === index ? { ...entry, result: entry.result === result ? ('' as ChecklistResult) : result } : entry
    ))

  const setChecklistNote = (index: number, note: string) =>
    setField('checklist', formData.checklist.map((entry, i) => (i === index ? { ...entry, note } : entry)))

  const setHotGasRow = (index: number, field: keyof HotWorkGasRow, value: string) =>
    setField('hot_gas_rows', formData.hot_gas_rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  const setConfinedGasRow = (index: number, field: keyof ConfinedGasRow, value: string) =>
    setField('confined_gas_rows', formData.confined_gas_rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  const setElectricalDevice = (index: number, field: keyof ElectricalDeviceRow, value: string) =>
    setField('electrical_devices', formData.electrical_devices.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  const setHotDevice = (index: number, field: keyof HotWorkDeviceRow, value: string) =>
    setField('hot_devices', formData.hot_devices.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  return (
    <div className="space-y-4">
      {/* 신청인 / 감시인 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="flex flex-col sm:flex-row border-b border-gray-300">
          <div className={labelCls}>신청인</div>
          <div className="flex-1 grid grid-cols-3 gap-1.5 px-2 py-1.5">
            <input type="text" value={formData.applicant.company} onChange={(e) => setApplicant('company', e.target.value)} placeholder="업체명" className={inputCls} />
            <input type="text" value={formData.applicant.position} onChange={(e) => setApplicant('position', e.target.value)} placeholder="직책" className={inputCls} />
            <input type="text" value={formData.applicant.name} onChange={(e) => setApplicant('name', e.target.value)} placeholder="성명" className={inputCls} />
          </div>
        </div>
        {config.hasWatcher && (
          <div className="flex flex-col sm:flex-row border-b border-gray-300">
            <div className={labelCls}>감시인</div>
            <div className="flex-1 grid grid-cols-3 gap-1.5 px-2 py-1.5">
              <input type="text" value={formData.watcher.dept} onChange={(e) => setWatcher('dept', e.target.value)} placeholder="부서" className={inputCls} />
              <input type="text" value={formData.watcher.position} onChange={(e) => setWatcher('position', e.target.value)} placeholder="직책" className={inputCls} />
              <input type="text" value={formData.watcher.name} onChange={(e) => setWatcher('name', e.target.value)} placeholder="성명" className={inputCls} />
            </div>
          </div>
        )}
        {/* 작업허가시간 */}
        <div className="flex flex-col sm:flex-row border-b border-gray-300">
          <div className={labelCls}>작업허가시간</div>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 px-2 py-1.5">
            <input type="date" value={formData.permit_date} onChange={(e) => setField('permit_date', e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
            <input type="time" value={formData.start_time} onChange={(e) => setField('start_time', e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm w-[100px]" />
            <span className="text-gray-500 text-sm">~</span>
            <input type="time" value={formData.end_time} onChange={(e) => setField('end_time', e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm w-[100px]" />
            <span className="text-xs text-gray-400">(종료시간은 사후기재)</span>
          </div>
        </div>
        <div className="flex border-b border-gray-300">
          <div className={labelCls}>작업장소</div>
          <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5">
            <input type="text" value={formData.location} onChange={(e) => setField('location', e.target.value)} className={inputCls} />
            {projectId && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => (tbmListOpen ? setTbmListOpen(false) : loadTbmCandidates())}
                  disabled={tbmLoading || tbmApplying}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {tbmLoading || tbmApplying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <History className="h-3.5 w-3.5" />
                  )}
                  {tbmApplying ? 'AI 정리 중...' : '최근 TBM'}
                </button>
                {tbmListOpen && (
                  <div className="absolute right-0 top-full mt-1 w-80 max-h-72 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg z-20">
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
        </div>
        <div className="flex border-b border-gray-300">
          <div className={labelCls}>작업내용</div>
          <div className="flex-1 px-2 py-1.5">
            <input type="text" value={formData.content} onChange={(e) => setField('content', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex">
          <div className={labelCls}>출입자 명단</div>
          <div className="flex-1 px-2 py-1.5">
            <textarea value={formData.entrants} onChange={(e) => setField('entrants', e.target.value)} rows={2} placeholder="출입자 성명 (쉼표로 구분)" className={inputCls} />
          </div>
        </div>
      </div>

      <p className="text-center text-sm font-semibold text-gray-700">위 공간에서의 작업을 다음의 조건하에서만 허가함.</p>

      {/* 사전 필요유무 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        {config.preQuestions.map((question, index) => (
          <div key={index} className="flex flex-col sm:flex-row sm:items-center border-b last:border-b-0 border-gray-300 bg-green-50/50">
            <div className="px-3 py-2 text-sm font-medium flex-1">
              {index + 1}. {question.label}
            </div>
            <div className="flex items-center gap-4 px-3 pb-2 sm:py-2">
              {question.options.map((option) => (
                <label key={option} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`pre-question-${index}`}
                    checked={formData.pre_answers[index] === option}
                    onChange={() => setPreAnswer(index, option)}
                    className="h-4 w-4"
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 안전조치 체크리스트 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">
          {config.checklistTitle} <span className="text-xs font-normal text-gray-500">(확인: 용역감독)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600 border-b border-gray-300">
                <th className="px-2 py-1.5 text-left font-semibold">확인항목</th>
                {CHECKLIST_RESULTS.map((result) => (
                  <th key={result} className="px-1 py-1.5 font-semibold w-14 text-center">{result}</th>
                ))}
                <th className="px-2 py-1.5 font-semibold w-24 text-center">비고</th>
              </tr>
            </thead>
            <tbody>
              {config.checklistItems.map((item, index) => (
                <tr key={index} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                  <td className="px-2 py-1">{item}</td>
                  {CHECKLIST_RESULTS.map((result) => (
                    <td key={result} className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={formData.checklist[index]?.result === result}
                        onChange={() => setChecklistResult(index, result)}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={formData.checklist[index]?.note || ''}
                      onChange={(e) => setChecklistNote(index, e.target.value)}
                      className="w-full border border-gray-200 rounded px-1 py-0.5 text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {config.checklistFootnote && (
          <p className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-200">{config.checklistFootnote}</p>
        )}
      </div>

      {/* 화기작업: 산소 및 유해가스 농도 측정결과 */}
      {config.gasTable === 'hot_work' && (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">산소 및 유해가스 농도 측정결과</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm text-center">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600 border-b border-gray-300">
                  <th className="px-1 py-1.5 font-semibold">측정물질명</th>
                  <th className="px-1 py-1.5 font-semibold">측정농도</th>
                  <th className="px-1 py-1.5 font-semibold">측정시간</th>
                  <th className="px-1 py-1.5 font-semibold">측정자</th>
                  <th className="px-1 py-1.5 font-semibold">감시인 확인</th>
                </tr>
              </thead>
              <tbody>
                {formData.hot_gas_rows.map((row, index) => (
                  <tr key={index} className="border-b border-gray-200 last:border-b-0 divide-x divide-gray-200">
                    <td><input type="text" value={row.substance} onChange={(e) => setHotGasRow(index, 'substance', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.concentration} onChange={(e) => setHotGasRow(index, 'concentration', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.time} onChange={(e) => setHotGasRow(index, 'time', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.measurer} onChange={(e) => setHotGasRow(index, 'measurer', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.watcher_confirm} onChange={(e) => setHotGasRow(index, 'watcher_confirm', e.target.value)} className={cellInputCls} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 밀폐공간: 산소 및 유해가스 농도 측정결과 (전/중/중) */}
      {config.gasTable === 'confined_space' && (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">
            산소 및 유해가스 농도 측정결과
            <span className="block text-xs font-normal text-gray-500">
              적정수치 O₂(18~23.5%) CO₂(1.5%미만) H₂S(10ppm미만) CO(30ppm미만) EX(10%미만)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm text-center">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600 border-b border-gray-300">
                  <th className="px-1 py-1.5 font-semibold w-10">구분</th>
                  <th className="px-1 py-1.5 font-semibold w-20">시간</th>
                  <th className="px-1 py-1.5 font-semibold">O₂(%)</th>
                  <th className="px-1 py-1.5 font-semibold">CO₂(%)</th>
                  <th className="px-1 py-1.5 font-semibold">H₂S(ppm)</th>
                  <th className="px-1 py-1.5 font-semibold">CO(ppm)</th>
                  <th className="px-1 py-1.5 font-semibold">EX(%)</th>
                  <th className="px-1 py-1.5 font-semibold">측정자</th>
                  <th className="px-1 py-1.5 font-semibold w-14">입(명)</th>
                  <th className="px-1 py-1.5 font-semibold w-14">출(명)</th>
                </tr>
              </thead>
              <tbody>
                {formData.confined_gas_rows.map((row, index) => (
                  <tr key={index} className="border-b border-gray-200 last:border-b-0 divide-x divide-gray-200">
                    <td className="bg-gray-50 font-medium text-xs">{row.phase}{index > 0 ? '*' : ''}</td>
                    <td><input type="time" value={row.time} onChange={(e) => setConfinedGasRow(index, 'time', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.o2} onChange={(e) => setConfinedGasRow(index, 'o2', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.co2} onChange={(e) => setConfinedGasRow(index, 'co2', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.h2s} onChange={(e) => setConfinedGasRow(index, 'h2s', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.co} onChange={(e) => setConfinedGasRow(index, 'co', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.ex} onChange={(e) => setConfinedGasRow(index, 'ex', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.measurer} onChange={(e) => setConfinedGasRow(index, 'measurer', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.in_count} onChange={(e) => setConfinedGasRow(index, 'in_count', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.out_count} onChange={(e) => setConfinedGasRow(index, 'out_count', e.target.value)} className={cellInputCls} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 정전작업: 점검 확인 결과 */}
      {config.deviceTable === 'electrical' && (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">점검 확인 결과</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm text-center">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600 border-b border-gray-300">
                  <th className="px-1 py-1.5 font-semibold">점검 기기</th>
                  <th className="px-1 py-1.5 font-semibold">차단확인자</th>
                  <th className="px-1 py-1.5 font-semibold">전기담당자</th>
                  <th className="px-1 py-1.5 font-semibold">현장정비</th>
                </tr>
              </thead>
              <tbody>
                {formData.electrical_devices.map((row, index) => (
                  <tr key={index} className="border-b border-gray-200 last:border-b-0 divide-x divide-gray-200">
                    <td><input type="text" value={row.device} onChange={(e) => setElectricalDevice(index, 'device', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.breaker_confirmer} onChange={(e) => setElectricalDevice(index, 'breaker_confirmer', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.electric_manager} onChange={(e) => setElectricalDevice(index, 'electric_manager', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.site_maintenance} onChange={(e) => setElectricalDevice(index, 'site_maintenance', e.target.value)} className={cellInputCls} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 화기작업: 기기점검 결과 */}
      {config.deviceTable === 'hot_work' && (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">기기점검 결과</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm text-center">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600 border-b border-gray-300">
                  <th className="px-1 py-1.5 font-semibold">점검기기명</th>
                  <th className="px-1 py-1.5 font-semibold">점검자</th>
                  <th className="px-1 py-1.5 font-semibold">입회자</th>
                  <th className="px-1 py-1.5 font-semibold">작업자</th>
                  <th className="px-1 py-1.5 font-semibold">조치사항</th>
                </tr>
              </thead>
              <tbody>
                {formData.hot_devices.map((row, index) => (
                  <tr key={index} className="border-b border-gray-200 last:border-b-0 divide-x divide-gray-200">
                    <td><input type="text" value={row.device} onChange={(e) => setHotDevice(index, 'device', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.inspector} onChange={(e) => setHotDevice(index, 'inspector', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.witness} onChange={(e) => setHotDevice(index, 'witness', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.worker} onChange={(e) => setHotDevice(index, 'worker', e.target.value)} className={cellInputCls} /></td>
                    <td><input type="text" value={row.action} onChange={(e) => setHotDevice(index, 'action', e.target.value)} className={cellInputCls} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 특별조치 필요사항 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300">특별조치 필요사항</div>
        <div className="p-1.5">
          <textarea value={formData.special_note} onChange={(e) => setField('special_note', e.target.value)} rows={2} className={inputCls} />
        </div>
      </div>
    </div>
  )
}
