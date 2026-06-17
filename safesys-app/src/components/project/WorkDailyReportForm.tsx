'use client'

// 작업일보 (공사작업일지, 별지 제60호 서식) 입력 폼
// 선택한 날짜의 기록을 불러오고, 없으면 직전 작업일보의 누계를 전일까지 항목으로 이월
// 날씨/기온: 기상청 자동 조회 (과거 날짜 ASOS 관측자료, 오늘 이후 단기예보)

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CloudSun, Download, Eye, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  WorkDailyReport,
  EquipmentRow,
  PersonnelRow,
  emptyEquipmentRow,
  emptyPersonnelRow,
  defaultPersonnelRows,
  defaultEquipmentRows,
  sortEquipmentByCumulative,
  sortPersonnelByCumulative,
  UNCLASSIFIED_LABEL,
  getWeekdayKorean,
  computeCumulative,
  computeProgressRate,
  ProgressAnchor,
} from '@/lib/work-daily-report/work-daily-report-types'
import { invalidateProgressAnchors, getProgressAnchors } from '@/lib/work-daily-report/progress-anchors'
import { downloadWorkDailyReportExcel } from '@/lib/excel/work-daily-report-export'
import { getDailyForecastSummary } from '@/lib/weather'
import ProgressRateModal from '@/components/project/ProgressRateModal'

interface WorkDailyReportFormProps {
  projectId: string
  projectName: string
  reportDate: string
  userId: string
  managingHq?: string                // TBM 제출 기록 조회용 (프로젝트명+본부+지사 매칭)
  managingBranch?: string
  latitude?: number | null
  longitude?: number | null
  constructionStart?: string | null  // 착공일 (공정률 0%)
  constructionEnd?: string | null    // 준공일 (공정률 100%)
  ownerName?: string                 // 프로젝트 소유자 이름 (작성자/확인자 기본값)
  onSaved: () => void
  onDeleted: () => void
  onClose?: () => void               // 일지 닫기 (목록/추가 화면으로 복귀)
}

const thCls = 'border border-gray-300 bg-gray-100 px-1 py-1.5 text-xs font-semibold text-gray-700 text-center whitespace-nowrap'
const tdCls = 'border border-gray-300 p-0'
const inputCls = 'w-full px-1.5 py-1.5 text-xs text-center bg-transparent focus:outline-none focus:bg-blue-50'

const hasContent = (row: Record<string, string>) => Object.values(row).some(v => v.trim() !== '')

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : '알 수 없는 오류'

// TBM 제출 기록에서 가져오는 필드
interface TBMDayData {
  id: string
  meeting_date?: string
  today_work?: string
  personnel_count?: string
  equipment_input?: string
  reporter_name?: string
  status?: string
}

export default function WorkDailyReportForm({
  projectId,
  projectName,
  reportDate,
  userId,
  managingHq,
  managingBranch,
  latitude,
  longitude,
  constructionStart,
  constructionEnd,
  ownerName,
  onSaved,
  onDeleted,
  onClose,
}: WorkDailyReportFormProps) {
  const [existingId, setExistingId] = useState<string | null>(null)
  const [weather, setWeather] = useState('')
  const [tempHigh, setTempHigh] = useState('')
  const [tempLow, setTempLow] = useState('')
  const [rainfall, setRainfall] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [checkerName, setCheckerName] = useState('')
  const [manualRate, setManualRate] = useState('')             // 사용자가 직접 입력한 공정률
  const [isManualRate, setIsManualRate] = useState(false)
  const [progressAnchors, setProgressAnchors] = useState<ProgressAnchor[]>([]) // 다른 날짜의 수동 입력 기준점들 (수동 입력 모달용)
  const [autoAnchors, setAutoAnchors] = useState<ProgressAnchor[]>([]) // 자동 공정률 계산용 — 예정공정표 우선(getProgressAnchors)
  const [todayWork, setTodayWork] = useState('')
  const [tomorrowWork, setTomorrowWork] = useState('')
  const [equipmentRows, setEquipmentRows] = useState<EquipmentRow[]>(defaultEquipmentRows())
  const [personnelRows, setPersonnelRows] = useState<PersonnelRow[]>(defaultPersonnelRows())
  const [participants, setParticipants] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherSource, setWeatherSource] = useState('') // 기상정보 출처 (관측소명 등)
  const [tbmViewLoading, setTbmViewLoading] = useState(false)
  const [tbmView, setTbmView] = useState<TBMDayData[] | null>(null) // 해당일자 TBM 보기 모달 데이터
  const [tbmFilling, setTbmFilling] = useState(false) // 내용 맞춰 채우기 진행 중
  const [progressModalOpen, setProgressModalOpen] = useState(false)

  // 날짜 빠른 전환 시 늦게 도착한 기상청 응답이 다른 날짜에 적용되는 것 방지
  const reportDateRef = useRef(reportDate)
  reportDateRef.current = reportDate

  // 공정률 자동 계산: 착공(0%)~준공(100%) 사이를 수동 입력 기준점들을 지나도록 구간별 보간
  // (현재 날짜 자신의 기준점은 제외 — 수동 입력값은 manualRate로 직접 표시)
  const autoRate = computeProgressRate(
    constructionStart,
    constructionEnd,
    reportDate,
    autoAnchors.filter(a => a.date !== reportDate)
  )
  const isManualActive = isManualRate && manualRate.trim() !== ''
  const progressRate = isManualActive ? manualRate.trim() : autoRate

  const applyReport = (report: WorkDailyReport) => {
    setExistingId(report.id)
    setWeather(report.weather || '')
    setTempHigh(report.temp_high || '')
    setTempLow(report.temp_low || '')
    setRainfall(report.rainfall || '')
    setWeatherSource('')
    setAuthorName(report.author_name || '')
    setCheckerName(report.checker_name || '')
    setIsManualRate(!!report.progress_rate_manual)
    setManualRate(report.progress_rate_manual ? (report.progress_rate || '') : '')
    setTodayWork(report.today_work || '')
    setTomorrowWork(report.tomorrow_work || '')
    setEquipmentRows(sortEquipmentByCumulative(report.equipment_rows || []))
    setPersonnelRows(sortPersonnelByCumulative(report.personnel_rows || []))
    setParticipants(report.participants || '')
  }

  // 직전 작업일보의 누계를 전일까지 항목으로 이월한 새 양식
  const applyCarryOver = (prev: WorkDailyReport | null) => {
    setExistingId(null)
    setWeather('')
    setTempHigh('')
    setTempLow('')
    setRainfall('')
    setWeatherSource('')
    // 직전 일보의 이름 우선, 없으면 프로젝트 소유자 이름 기본
    setAuthorName(prev?.author_name || ownerName || '')
    setCheckerName(prev?.checker_name || ownerName || '')
    setIsManualRate(false)
    setManualRate('')
    setParticipants('')

    // 직전 작업일보의 명일작업을 금일작업으로 이월
    setTodayWork(prev?.tomorrow_work || '')
    setTomorrowWork('')

    // 분류는 직전 일보에서 이월 (기타(미분류)는 항상 마지막에 고정)
    if (prev?.equipment_rows?.length) {
      setEquipmentRows(sortEquipmentByCumulative(prev.equipment_rows.map(row => ({
        ...emptyEquipmentRow(),
        name: row.name,
        spec: row.spec,
        prevCount: row.cumulativeCount || row.prevCount,
        cumulativeCount: row.cumulativeCount || row.prevCount,
      }))))
    } else {
      setEquipmentRows(defaultEquipmentRows())
    }

    if (prev?.personnel_rows?.length) {
      setPersonnelRows(sortPersonnelByCumulative(prev.personnel_rows.map(row => ({
        ...emptyPersonnelRow(row.category),
        prevCount: row.cumulativeCount || row.prevCount,
        cumulativeCount: row.cumulativeCount || row.prevCount,
      }))))
    } else {
      setPersonnelRows(defaultPersonnelRows())
    }
  }

  const loadReport = useCallback(async () => {
    try {
      setLoading(true)

      // 수동 입력 공정률 기준점 조회 (보간 계산용 — 실패해도 본 조회에 영향 없음)
      try {
        const { data: anchorData, error: anchorError } = await supabase
          .from('work_daily_reports')
          .select('report_date, progress_rate')
          .eq('project_id', projectId)
          .eq('progress_rate_manual', true)
        if (anchorError) throw new Error(anchorError.message)
        setProgressAnchors((anchorData || [])
          .map(row => ({ date: row.report_date as string, rate: parseFloat(row.progress_rate) }))
          .filter(a => a.date && !isNaN(a.rate)))
      } catch (anchorErr) {
        console.error('공정률 기준점 조회 오류:', anchorErr)
        setProgressAnchors([])
      }

      // 자동 공정률 계산용 앵커 — 예정공정표가 있으면 그 곡선, 없으면 수동 기준점 (캐비넷·목록과 동일 출처)
      getProgressAnchors(projectId).then(setAutoAnchors).catch(() => setAutoAnchors([]))

      const { data, error } = await supabase
        .from('work_daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .eq('report_date', reportDate)
        .maybeSingle()

      if (error) throw new Error(error.message)

      if (data) {
        applyReport(data as WorkDailyReport)
        return
      }

      const { data: prevData, error: prevError } = await supabase
        .from('work_daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .lt('report_date', reportDate)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (prevError) throw new Error(prevError.message)

      applyCarryOver((prevData as WorkDailyReport) || null)
    } catch (err: unknown) {
      console.error('작업일보 조회 오류:', err)
      applyCarryOver(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, reportDate])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  // 기상청 날씨/기온 조회 — 과거 날짜는 ASOS 관측자료, 오늘 이후는 단기예보
  const fetchKmaWeather = useCallback(async (silent: boolean) => {
    if (latitude == null || longitude == null) {
      if (!silent) alert('프로젝트 좌표(위도/경도)가 등록되어 있지 않아 기상청 정보를 가져올 수 없습니다.')
      return
    }

    const requestDate = reportDate
    const isStale = () => reportDateRef.current !== requestDate

    try {
      setWeatherLoading(true)
      const today = new Date()
      const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      if (requestDate < todayDateStr) {
        // 과거 날짜: ASOS 일자료 (관측값)
        const dateApi = requestDate.replace(/-/g, '')
        const res = await fetch(`/api/weather/asos-range?lat=${latitude}&lon=${longitude}&start=${dateApi}&end=${dateApi}`)
        if (!res.ok) throw new Error(`기상청 ASOS 조회 실패 (${res.status})`)
        const result = await res.json()
        const day = result.data?.[0]
        if (isStale()) return

        const hasData = day && (day.sky !== '자료부족' || day.tempMaxC != null || day.tempMinC != null)
        if (hasData) {
          if (result.stnName) {
            setWeatherSource(`기상청 ${result.stnName} 관측소 (ASOS 일자료)`)
          }
          if (day.sky && day.sky !== '자료부족') {
            setWeather(day.rainSumMm > 0 ? `${day.sky}(비)` : day.sky)
          }
          if (day.tempMaxC != null) setTempHigh(String(day.tempMaxC))
          if (day.tempMinC != null) setTempLow(String(day.tempMinC))
          if (day.rainSumMm != null) setRainfall(String(day.rainSumMm))
        } else if (!silent) {
          alert('해당 날짜의 기상 관측 자료가 아직 없습니다.')
        }
      } else {
        // 오늘 이후: 단기예보 (오늘부터 2~3일까지 제공)
        // 당일은 기상청 일자료(ASOS)가 아직 취합되지 않아 조회 불가 항목은 "금일조회X" 표시
        const summary = await getDailyForecastSummary(Number(latitude), Number(longitude), requestDate)
        if (isStale()) return

        const NOT_AVAILABLE = '금일조회X'
        if (summary) {
          setWeatherSource('기상청 단기예보 (현장 좌표 격자 기준)')
        }
        setWeather(summary?.sky || NOT_AVAILABLE)
        setTempHigh(summary?.tempMax != null ? String(summary.tempMax) : NOT_AVAILABLE)
        setTempLow(summary?.tempMin != null ? String(summary.tempMin) : NOT_AVAILABLE)
        // 강우량은 일 단위 취합값이라 당일 조회 불가
        setRainfall(NOT_AVAILABLE)
      }
    } catch (err: unknown) {
      console.error('기상청 정보 조회 오류:', err)
      if (!silent) alert(`기상청 정보를 가져오는 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setWeatherLoading(false)
    }
  }, [latitude, longitude, reportDate])

  // 미등록 날짜를 열었을 때 날씨가 비어 있으면 자동 조회
  useEffect(() => {
    if (!loading && !existingId && !weather && !tempHigh && !tempLow) {
      fetchKmaWeather(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, existingId, reportDate])

  // 선택 날짜의 TBM 제출 기록 조회 (TBM 페이지와 동일하게 project_id + 프로젝트명/본부/지사 이중 조회)
  const fetchTbmForDate = async (): Promise<TBMDayData[]> => {
    const fields = 'id, meeting_date, today_work, personnel_count, equipment_input, reporter_name, status'
    const dayEnd = `${reportDate}T23:59:59`

    const { data: byId, error: errorById } = await supabase
      .from('tbm_submissions')
      .select(fields)
      .eq('project_id', projectId)
      .gte('meeting_date', reportDate)
      .lte('meeting_date', dayEnd)

    let byName: TBMDayData[] = []
    if (managingHq && managingBranch) {
      const { data, error: errorByName } = await supabase
        .from('tbm_submissions')
        .select(fields)
        .eq('project_name', projectName)
        .eq('headquarters', managingHq)
        .eq('branch', managingBranch)
        .gte('meeting_date', reportDate)
        .lte('meeting_date', dayEnd)
      if (errorByName) console.error('TBM 조회 오류(이름):', errorByName)
      byName = data || []
    }

    if (errorById) console.error('TBM 조회 오류(ID):', errorById)

    const combined = [...(byId || []), ...byName]
    const unique = combined.filter((item, index, self) =>
      item.meeting_date?.startsWith(reportDate) &&
      index === self.findIndex(t => t.id === item.id)
    )

    // 정식 제출 우선, 없으면 임시저장 사용
    const submitted = unique.filter(s => s.status !== 'draft')
    return submitted.length > 0 ? submitted : unique
  }

  // 해당일자 TBM 작업현황/인원/장비 보기
  const handleViewTbm = async () => {
    try {
      setTbmViewLoading(true)
      const subs = await fetchTbmForDate()
      if (subs.length === 0) {
        alert('해당 날짜의 TBM 제출 기록이 없습니다.')
        return
      }
      setTbmView(subs)
    } catch (err: unknown) {
      console.error('TBM 보기 오류:', err)
      alert(`TBM 기록을 불러오는 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setTbmViewLoading(false)
    }
  }

  // 선택 날짜 이후 가장 가까운 TBM 보고일의 작업내용 조회 (명일작업용 — +1일이 아니라 다음 TBM 보고된 날)
  const fetchNextTbmWorks = async (): Promise<string[]> => {
    const fields = 'id, meeting_date, today_work, status'
    const dayEnd = `${reportDate}T23:59:59`

    const { data: byId, error: errorById } = await supabase
      .from('tbm_submissions')
      .select(fields)
      .eq('project_id', projectId)
      .gt('meeting_date', dayEnd)
      .order('meeting_date', { ascending: true })
      .limit(20)

    let byName: TBMDayData[] = []
    if (managingHq && managingBranch) {
      const { data, error: errorByName } = await supabase
        .from('tbm_submissions')
        .select(fields)
        .eq('project_name', projectName)
        .eq('headquarters', managingHq)
        .eq('branch', managingBranch)
        .gt('meeting_date', dayEnd)
        .order('meeting_date', { ascending: true })
        .limit(20)
      if (errorByName) console.error('다음 TBM 조회 오류(이름):', errorByName)
      byName = data || []
    }

    if (errorById) console.error('다음 TBM 조회 오류(ID):', errorById)

    const combined = [...(byId || []), ...byName].filter((item, index, self) =>
      index === self.findIndex(t => t.id === item.id)
    )
    if (combined.length === 0) return []

    const nextDate = combined
      .map(s => s.meeting_date?.slice(0, 10))
      .filter(Boolean)
      .sort()[0]
    if (!nextDate) return []

    const nextDaySubs = combined.filter(s => s.meeting_date?.startsWith(nextDate))
    const submitted = nextDaySubs.filter(s => s.status !== 'draft')
    const target = submitted.length > 0 ? submitted : nextDaySubs
    return target.map(s => s.today_work?.trim()).filter(Boolean) as string[]
  }

  // 내용 맞춰 채우기 — 금일/명일작업 자동 입력 + 장비/인원 AI 분류 (기존 분류 우선, 없으면 새 분류 추가)
  const handleFillFromTbm = async () => {
    if (!tbmView || tbmView.length === 0) return

    try {
      setTbmFilling(true)

      // 1) 금일작업 = 해당일자 TBM 작업현황
      const works = tbmView.map(s => s.today_work?.trim()).filter(Boolean) as string[]
      if (works.length > 0) {
        setTodayWork(works.join('\n'))
      }

      // 2) 명일작업 = 다음 TBM 보고일의 작업내용
      const nextWorks = await fetchNextTbmWorks()
      if (nextWorks.length > 0) {
        setTomorrowWork(nextWorks.join('\n'))
      }

      // 3) 장비/인원 AI 분류 → 기존 분류에 매칭, 없으면 새 분류 행 추가
      const personnel = tbmView.map(s => s.personnel_count?.trim()).filter(Boolean).join(', ')
      const equipment = tbmView.map(s => s.equipment_input?.trim()).filter(Boolean).join(', ')

      if (personnel || equipment) {
        const existingEquipment = equipmentRows.map(r => r.name.trim()).filter(Boolean)
        const existingPersonnel = personnelRows.map(r => r.category.trim()).filter(Boolean)

        const response = await fetch('/api/ai/supervisor-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'work-daily-classify',
            data: { personnel, equipment, existingEquipment, existingPersonnel },
          }),
        })
        if (!response.ok) throw new Error('AI 분류 요청 실패')
        const result = await response.json()
        if (!result.success) throw new Error(result.error || 'AI 분류 실패')

        const equipItems: { name?: string; spec?: string; count?: string | number }[] =
          Array.isArray(result.content?.equipment) ? result.content.equipment : []
        const personItems: { category?: string; count?: string | number }[] =
          Array.isArray(result.content?.personnel) ? result.content.personnel : []

        if (equipItems.length > 0) {
          setEquipmentRows(rows => {
            const next = [...rows]
            equipItems.forEach(item => {
              const name = String(item.name || '').trim()
              if (!name) return
              const today = String(item.count ?? '').trim()
              const idx = next.findIndex(r => r.name.trim() === name)
              if (idx >= 0) {
                next[idx] = {
                  ...next[idx],
                  spec: next[idx].spec || String(item.spec || '').trim(),
                  todayCount: today,
                  cumulativeCount: computeCumulative(next[idx].prevCount, today),
                }
              } else {
                next.push({
                  name,
                  spec: String(item.spec || '').trim(),
                  prevCount: '',
                  todayCount: today,
                  cumulativeCount: computeCumulative('', today),
                })
              }
            })
            const filled = next.filter(r => hasContent({ ...r }))
            return sortEquipmentByCumulative(filled)
          })
        }

        if (personItems.length > 0) {
          setPersonnelRows(rows => {
            const next = [...rows]
            personItems.forEach(item => {
              const category = String(item.category || '').trim()
              if (!category) return
              const today = String(item.count ?? '').trim()
              const idx = next.findIndex(r => r.category.trim() === category)
              if (idx >= 0) {
                next[idx] = {
                  ...next[idx],
                  todayCount: today,
                  cumulativeCount: computeCumulative(next[idx].prevCount, today),
                }
              } else {
                next.push({
                  ...emptyPersonnelRow(category),
                  todayCount: today,
                  cumulativeCount: computeCumulative('', today),
                })
              }
            })
            return sortPersonnelByCumulative(next)
          })
        }
      }

      setTbmView(null)
    } catch (err: unknown) {
      console.error('내용 맞춰 채우기 오류:', err)
      alert(`내용을 채우는 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setTbmFilling(false)
    }
  }

  const buildReport = (): WorkDailyReport => ({
    id: existingId || '',
    project_id: projectId,
    report_date: reportDate,
    weather,
    temp_high: tempHigh,
    temp_low: tempLow,
    rainfall,
    author_name: authorName,
    checker_name: checkerName,
    progress_rate: progressRate,
    progress_rate_manual: isManualActive,
    today_work: todayWork,
    tomorrow_work: tomorrowWork,
    equipment_rows: equipmentRows.filter(row => hasContent({ ...row })),
    personnel_rows: personnelRows.filter(row => hasContent({ ...row })),
    participants,
  })

  const handleSave = async () => {
    if (isManualActive && isNaN(parseFloat(manualRate))) {
      alert('공정률은 숫자로 입력해주세요.')
      return
    }

    try {
      setSaving(true)
      const report = buildReport()
      const payload = {
        project_id: report.project_id,
        report_date: report.report_date,
        weather: report.weather,
        temp_high: report.temp_high,
        temp_low: report.temp_low,
        rainfall: report.rainfall,
        author_name: report.author_name,
        checker_name: report.checker_name,
        progress_rate: report.progress_rate,
        progress_rate_manual: report.progress_rate_manual,
        today_work: report.today_work,
        tomorrow_work: report.tomorrow_work,
        equipment_rows: report.equipment_rows,
        personnel_rows: report.personnel_rows,
        participants: report.participants,
        updated_at: new Date().toISOString(),
      }

      if (existingId) {
        const { error } = await supabase
          .from('work_daily_reports')
          .update(payload)
          .eq('id', existingId)
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase
          .from('work_daily_reports')
          .insert({ ...payload, created_by: userId })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        setExistingId(data.id)
      }

      // 수동 공정률 기준점 갱신 — 다른 날짜의 자동 계산에 즉시 반영
      const manualValue = parseFloat(manualRate)
      setProgressAnchors(prev => {
        const others = prev.filter(a => a.date !== reportDate)
        return isManualActive && !isNaN(manualValue)
          ? [...others, { date: reportDate, rate: manualValue }]
          : others
      })
      // 프로젝트 카드/상세 페이지의 공정률 표시 캐시 갱신
      invalidateProgressAnchors(projectId)
      getProgressAnchors(projectId).then(setAutoAnchors).catch(() => {})

      alert('저장되었습니다.')
      onSaved()
    } catch (err: unknown) {
      console.error('작업일보 저장 오류:', err)
      alert(`저장 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existingId) return
    if (!confirm(`${reportDate} 작업일보를 삭제하시겠습니까?`)) return

    try {
      setDeleting(true)
      const { error } = await supabase
        .from('work_daily_reports')
        .delete()
        .eq('id', existingId)
      if (error) throw new Error(error.message)

      // 삭제된 일보가 수동 기준점이었을 수 있음 — 카드/상세 공정률 캐시 갱신
      invalidateProgressAnchors(projectId)
      getProgressAnchors(projectId).then(setAutoAnchors).catch(() => {})

      alert('삭제되었습니다.')
      applyCarryOver(null)
      onDeleted()
      loadReport()
    } catch (err: unknown) {
      console.error('작업일보 삭제 오류:', err)
      alert(`삭제 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleExcelDownload = async () => {
    try {
      await downloadWorkDailyReportExcel(buildReport(), projectName)
    } catch (err: unknown) {
      console.error('엑셀 생성 오류:', err)
      alert(`엑셀 생성 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    }
  }

  // 행 수정 헬퍼 — 전일/금일 변경 시 누계 자동 계산
  const updateEquipmentRow = (index: number, field: keyof EquipmentRow, value: string) => {
    setEquipmentRows(rows => rows.map((row, i) => {
      if (i !== index) return row
      const next = { ...row, [field]: value }
      if (field === 'prevCount' || field === 'todayCount') {
        next.cumulativeCount = computeCumulative(next.prevCount, next.todayCount)
      }
      return next
    }))
  }

  const updatePersonnelRow = (index: number, field: keyof PersonnelRow, value: string) => {
    setPersonnelRows(rows => rows.map((row, i) => {
      if (i !== index) return row
      const next = { ...row, [field]: value }
      if (field === 'prevCount' || field === 'todayCount') {
        next.cumulativeCount = computeCumulative(next.prevCount, next.todayCount)
      }
      return next
    }))
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      {/* 상단 타이틀 + 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">공사작업일지</h3>
          <p className="text-xs text-gray-500">[별지 제60호 서식] {existingId ? '· 등록됨' : '· 미등록'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExcelDownload}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            title="엑셀 다운로드"
          >
            <Download className="h-3.5 w-3.5" />
            엑셀
          </button>
          {existingId && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              삭제
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {existingId ? '수정 저장' : '저장'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium transition-colors"
              title="일지 닫기"
            >
              <X className="h-3.5 w-3.5" />
              닫기
            </button>
          )}
        </div>
      </div>

      {/* 상단 정보 (표 형태) */}
      <table className="w-full border-collapse mb-4">
        <colgroup>
          <col className="w-[14%]" />
          <col className="w-[23%]" />
          <col className="w-[14%]" />
          <col className="w-[21%]" />
          <col className="w-[11%]" />
          <col className="w-[17%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={thCls}>공 사 명</th>
            <td className={`${tdCls} px-2 py-1.5 text-xs text-gray-900`} colSpan={5}>{projectName}</td>
          </tr>
          <tr>
            <th className={thCls}>일 자</th>
            <td className={`${tdCls} px-2 py-1.5 text-xs text-center text-gray-900`}>
              {reportDate} ({getWeekdayKorean(reportDate)}요일)
            </td>
            <th className={thCls}>날 씨</th>
            <td className={tdCls} colSpan={3}>
              <div className="flex items-center">
                <input className={inputCls} value={weather} onChange={e => setWeather(e.target.value)} placeholder="맑음" />
                <button
                  onClick={() => fetchKmaWeather(false)}
                  disabled={weatherLoading}
                  className="shrink-0 p-1.5 mr-1 text-sky-600 hover:bg-sky-50 rounded transition-colors disabled:opacity-50"
                  title="기상청 날씨/기온 가져오기"
                >
                  {weatherLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
                  ) : (
                    <CloudSun className="h-4 w-4" />
                  )}
                </button>
              </div>
            </td>
          </tr>
          <tr>
            <th className={thCls}>기온(최고)</th>
            <td className={tdCls}>
              <div className="flex items-center">
                <input className={inputCls} value={tempHigh} onChange={e => setTempHigh(e.target.value)} placeholder="0" />
                <span className="shrink-0 pr-1.5 text-xs text-gray-500">℃</span>
              </div>
            </td>
            <th className={thCls}>기온(최저)</th>
            <td className={tdCls}>
              <div className="flex items-center">
                <input className={inputCls} value={tempLow} onChange={e => setTempLow(e.target.value)} placeholder="0" />
                <span className="shrink-0 pr-1.5 text-xs text-gray-500">℃</span>
              </div>
            </td>
            <th className={thCls}>강우량</th>
            <td className={tdCls}>
              <div className="flex items-center">
                <input className={inputCls} value={rainfall} onChange={e => setRainfall(e.target.value)} placeholder="0" />
                <span className="shrink-0 pr-1.5 text-xs text-gray-500">mm</span>
              </div>
            </td>
          </tr>
          <tr>
            <th className={thCls}>작성자<br />(담당자)</th>
            <td className={tdCls}>
              <input className={inputCls} value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="성명" />
            </td>
            <th className={thCls}>확인자<br />(현장대리인)</th>
            <td className={tdCls}>
              <input className={inputCls} value={checkerName} onChange={e => setCheckerName(e.target.value)} placeholder="성명" />
            </td>
            <th className={thCls}>공정률</th>
            <td
              className={`${tdCls} ${isManualActive ? 'bg-amber-50/60' : 'bg-blue-50/50'}`}
              title="클릭하면 공정률 입력 그래프가 열립니다 (착공 0% → 준공 100% 직선보간)"
            >
              <button
                onClick={() => setProgressModalOpen(true)}
                className="w-full flex items-center justify-center gap-1 px-1.5 py-1.5 hover:bg-blue-100/50 transition-colors"
              >
                <span className={`text-xs font-semibold ${progressRate ? (isManualActive ? 'text-amber-700' : 'text-blue-700') : 'text-gray-400'}`}>
                  {progressRate ? `${progressRate} %` : '입력'}
                </span>
                <span className={`text-[10px] ${isManualActive ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                  {isManualActive ? '수동' : '자동'}
                </span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      {weatherSource && (
        <p className="text-[11px] text-gray-400 -mt-3 mb-4 text-right">기상정보: {weatherSource}</p>
      )}

      {/* 1. 공사추진상황 (금일작업/명일작업 좌우 배치) */}
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-bold text-gray-900">1. 공사추진상황</h4>
        <button
          onClick={handleViewTbm}
          disabled={tbmViewLoading}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
          title="해당 날짜에 제출된 TBM의 작업현황, 투입인원, 투입장비를 보여줍니다"
        >
          {tbmViewLoading ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          해당일자 TBM 보기
        </button>
      </div>
      <table className="w-full border-collapse mb-4">
        <colgroup>
          <col className="w-1/2" />
          <col className="w-1/2" />
        </colgroup>
        <thead>
          <tr>
            <th className={thCls}>금일작업</th>
            <th className={thCls}>명일작업</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`${tdCls} align-top`}>
              <textarea
                value={todayWork}
                onChange={e => setTodayWork(e.target.value)}
                rows={5}
                className="w-full px-2 py-1.5 text-xs bg-transparent resize-y focus:outline-none focus:bg-blue-50"
                placeholder="금일 작업 내용을 입력하세요"
              />
            </td>
            <td className={`${tdCls} align-top`}>
              <textarea
                value={tomorrowWork}
                onChange={e => setTomorrowWork(e.target.value)}
                rows={5}
                className="w-full px-2 py-1.5 text-xs bg-transparent resize-y focus:outline-none focus:bg-blue-50"
                placeholder="명일 작업 계획을 입력하세요 (다음 작업일보의 금일작업으로 이월됩니다)"
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 2·3. 장비/인력투입상황 — AI 분류 미리보기 오버레이 영역 */}
      <div className="relative">
      {/* 2. 장비투입상황 */}
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-bold text-gray-900">2. 장비투입상황 <span className="text-xs font-normal text-gray-500">(단위: 대)</span></h4>
        <button
          onClick={() => setEquipmentRows(rows => {
            const next = [...rows]
            const idx = next.findIndex(r => r.name.trim() === UNCLASSIFIED_LABEL)
            next.splice(idx >= 0 ? idx : next.length, 0, emptyEquipmentRow())
            return next
          })}
          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> 행 추가
        </button>
      </div>
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr>
            <th className={`${thCls} w-[24%]`}>장비명</th>
            <th className={`${thCls} w-[20%]`}>규 격</th>
            <th className={`${thCls} w-[16%]`}>전일까지<br />투입</th>
            <th className={`${thCls} w-[16%]`}>금일<br />투입</th>
            <th className={`${thCls} w-[16%]`}>누계<br />투입</th>
            <th className={`${thCls} w-8`} />
          </tr>
        </thead>
        <tbody>
          {equipmentRows.map((row, i) => (
            <tr key={i}>
              <td className={tdCls}><input className={inputCls} value={row.name} onChange={e => updateEquipmentRow(i, 'name', e.target.value)} /></td>
              <td className={tdCls}><input className={inputCls} value={row.spec} onChange={e => updateEquipmentRow(i, 'spec', e.target.value)} /></td>
              <td className={tdCls}><input className={inputCls} value={row.prevCount} onChange={e => updateEquipmentRow(i, 'prevCount', e.target.value)} /></td>
              <td className={tdCls}><input className={inputCls} value={row.todayCount} onChange={e => updateEquipmentRow(i, 'todayCount', e.target.value)} /></td>
              <td className={tdCls}><input className={`${inputCls} bg-gray-50`} value={row.cumulativeCount} onChange={e => updateEquipmentRow(i, 'cumulativeCount', e.target.value)} /></td>
              <td className={`${tdCls} text-center`}>
                {row.name.trim() !== UNCLASSIFIED_LABEL && (
                  <button
                    onClick={() => setEquipmentRows(rows => {
                      const next = rows.filter((_, idx) => idx !== i)
                      return next.length > 0 ? next : defaultEquipmentRows()
                    })}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="행 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 3. 인력투입상황 */}
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-bold text-gray-900">3. 인력투입상황 <span className="text-xs font-normal text-gray-500">(단위: 명)</span></h4>
        <button
          onClick={() => setPersonnelRows(rows => {
            const next = [...rows]
            const idx = next.findIndex(r => r.category.trim() === UNCLASSIFIED_LABEL)
            next.splice(idx >= 0 ? idx : next.length, 0, emptyPersonnelRow())
            return next
          })}
          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> 행 추가
        </button>
      </div>
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr>
            <th className={`${thCls} w-[20%]`}>구 분</th>
            <th className={`${thCls} w-[18%]`}>전일까지<br />투입인원</th>
            <th className={`${thCls} w-[18%]`}>금일<br />투입인원</th>
            <th className={`${thCls} w-[18%]`}>누계<br />투입인원</th>
            <th className={thCls}>비 고</th>
            <th className={`${thCls} w-8`} />
          </tr>
        </thead>
        <tbody>
          {personnelRows.map((row, i) => (
            <tr key={i}>
              <td className={tdCls}><input className={inputCls} value={row.category} onChange={e => updatePersonnelRow(i, 'category', e.target.value)} placeholder="구분" /></td>
              <td className={tdCls}><input className={inputCls} value={row.prevCount} onChange={e => updatePersonnelRow(i, 'prevCount', e.target.value)} /></td>
              <td className={tdCls}><input className={inputCls} value={row.todayCount} onChange={e => updatePersonnelRow(i, 'todayCount', e.target.value)} /></td>
              <td className={tdCls}><input className={`${inputCls} bg-gray-50`} value={row.cumulativeCount} onChange={e => updatePersonnelRow(i, 'cumulativeCount', e.target.value)} /></td>
              <td className={tdCls}><input className={inputCls} value={row.remarks} onChange={e => updatePersonnelRow(i, 'remarks', e.target.value)} /></td>
              <td className={`${tdCls} text-center`}>
                {row.category.trim() !== UNCLASSIFIED_LABEL && (
                  <button
                    onClick={() => setPersonnelRows(rows => {
                      const next = rows.filter((_, idx) => idx !== i)
                      return next.length > 0 ? next : defaultPersonnelRows()
                    })}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="행 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      </div>

      {/* 4. 기타 특이사항 */}
      <h4 className="text-sm font-bold text-gray-900 mb-1">4. 기타 특이사항</h4>
      <textarea
        value={participants}
        onChange={e => setParticipants(e.target.value)}
        rows={3}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="기타 특이사항을 입력하세요"
      />

      {/* 해당일자 TBM 보기 모달 */}
      {tbmView && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setTbmView(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-gray-900">{reportDate} TBM 입력 현황</h3>
              <button onClick={() => setTbmView(null)} className="p-1.5 hover:bg-gray-100 rounded-full">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">해당 날짜에 제출된 TBM {tbmView.length}건의 작업현황·투입인원·투입장비 원문입니다.</p>

            <div className="space-y-3">
              {tbmView.map((sub, i) => (
                <div key={sub.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-900">
                      #{i + 1} {sub.reporter_name || '작성자 미입력'}
                    </span>
                    {sub.status === 'draft' && (
                      <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">임시저장</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-0.5">작업현황</div>
                      <div className="text-xs text-gray-800 border border-gray-200 rounded p-2 bg-gray-50 whitespace-pre-wrap break-words min-h-[36px]">
                        {sub.today_work?.trim() || <span className="text-gray-400">입력 없음</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-0.5">투입인원</div>
                      <div className="text-xs text-gray-800 border border-gray-200 rounded p-2 bg-gray-50 whitespace-pre-wrap break-words min-h-[36px]">
                        {sub.personnel_count?.trim() || <span className="text-gray-400">입력 없음</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-0.5">투입장비</div>
                      <div className="text-xs text-gray-800 border border-gray-200 rounded p-2 bg-gray-50 whitespace-pre-wrap break-words min-h-[36px]">
                        {sub.equipment_input?.trim() || <span className="text-gray-400">입력 없음</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setTbmView(null)}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium transition-colors"
              >
                닫기
              </button>
              <button
                onClick={handleFillFromTbm}
                disabled={tbmFilling}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                title="금일/명일작업을 자동 입력하고, 장비/인원을 AI가 기존 분류에 맞춰(없으면 새 분류 추가) 채웁니다"
              >
                {tbmFilling ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                내용 맞춰 채우기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공정률 입력 모달 */}
      <ProgressRateModal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        projectId={projectId}
        userId={userId}
        reportDate={reportDate}
        constructionStart={constructionStart}
        constructionEnd={constructionEnd}
        anchors={progressAnchors}
        currentManual={isManualActive ? manualRate : ''}
        onSaved={({ anchors: newAnchors, currentRate }) => {
          setProgressAnchors(newAnchors)
          setManualRate(currentRate ?? '')
          setIsManualRate(currentRate != null)
        }}
      />
    </div>
  )
}
