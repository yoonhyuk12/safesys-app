// TBM 전체 일보 생성 — 2단계 처리
// 1단계 classifyTbmForGeneration: TBM이 입력된 모든 날짜(일보 없는 날짜)에 대해
//    금일/명일작업·날씨를 준비하고 장비/인력을 AI로 분류 (날짜순 분류 명칭 일관성 유지)
// 2단계 saveGeneratedReports: 사용자가 검토(드래그 병합)한 분류로 일보를 일괄 저장 후 누계 재계산
// 기존 일보는 건드리지 않으므로 재실행 시 남은 날짜만 처리된다.

import { supabase } from '@/lib/supabase'
import {
  EquipmentRow,
  PersonnelRow,
  ensureUnclassifiedEquipment,
  ensureUnclassifiedPersonnel,
  isRealWorkReport,
} from './work-daily-report-types'
import { recalculateCumulativeForProject } from './recalculate-cumulative'

export interface GenerateProgress {
  current: number
  total: number
  date: string
}

export interface GeneratedItem {
  name: string   // 장비명 또는 직종명
  spec: string   // 규격 (인력은 '')
  count: string  // 금일 투입 수량
}

export interface GeneratedDay {
  date: string
  existingId?: string   // 공정률 전용 앵커 행이 있던 날짜면 그 row id (INSERT 대신 UPDATE로 채움)
  todayWork: string
  tomorrowWork: string
  weather: string
  tempHigh: string
  tempLow: string
  rainfall: string
  equipment: GeneratedItem[]
  personnel: GeneratedItem[]
}

export interface ClassifyResult {
  days: GeneratedDay[]
  skippedExisting: number
  failedDates: string[]
}

interface TBMRow {
  id: string
  meeting_date?: string
  today_work?: string
  personnel_count?: string
  equipment_input?: string
  status?: string
}

interface ExistingReportRow {
  id: string
  report_date: string
  today_work?: string
  tomorrow_work?: string
  participants?: string
  equipment_rows?: EquipmentRow[]
  personnel_rows?: PersonnelRow[]
}

// ── 1단계: TBM 수집 + AI 분류 (저장 안 함)
export async function classifyTbmForGeneration(params: {
  projectId: string
  projectName: string
  managingHq?: string
  managingBranch?: string
  latitude?: number | null
  longitude?: number | null
  endDate?: string               // 이 날짜(YYYY-MM-DD)보다 큰 TBM 날짜는 대상에서 제외 (미지정 시 제한 없음)
  seedEquipmentVocab?: string[]  // AI 분류 명칭 일관성용 초기 어휘 (기준 일보 명단)
  seedPersonnelVocab?: string[]
  realReportDatesOnly?: boolean  // true면 공정률 전용 앵커 행은 '미생성'으로 보고 대상에 포함(채우기)
  onProgress?: (p: GenerateProgress) => void
}): Promise<ClassifyResult> {
  const { projectId, projectName, managingHq, managingBranch, latitude, longitude, endDate, seedEquipmentVocab, seedPersonnelVocab, realReportDatesOnly, onProgress } = params

  // 전체 TBM 조회 (이중 조회 + 중복 제거)
  const fields = 'id, meeting_date, today_work, personnel_count, equipment_input, status'
  const [{ data: byId, error: errorById }, byNameResult] = await Promise.all([
    supabase.from('tbm_submissions').select(fields).eq('project_id', projectId).limit(2000),
    managingHq && managingBranch
      ? supabase.from('tbm_submissions').select(fields)
          .eq('project_name', projectName)
          .eq('headquarters', managingHq)
          .eq('branch', managingBranch)
          .limit(2000)
      : Promise.resolve({ data: [] as TBMRow[], error: null }),
  ])
  if (errorById) throw new Error(errorById.message)
  if (byNameResult.error) throw new Error(byNameResult.error.message)

  const tbmRows: TBMRow[] = [...(byId || []), ...(byNameResult.data || [])]
    .filter((item, index, self) => index === self.findIndex(t => t.id === item.id))

  // 날짜별 그룹 (정식 제출 우선)
  const byDate = new Map<string, TBMRow[]>()
  for (const row of tbmRows) {
    const date = row.meeting_date?.slice(0, 10)
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(row)
  }
  for (const [date, rows] of byDate) {
    const submitted = rows.filter(r => r.status !== 'draft')
    if (submitted.length > 0) byDate.set(date, submitted)
  }
  const tbmDates = Array.from(byDate.keys()).sort()
  if (tbmDates.length === 0) {
    return { days: [], skippedExisting: 0, failedDates: [] }
  }

  // 기존 일보 날짜는 건너뜀
  // realReportDatesOnly: 공정률만 입력된 앵커 행은 '실제 일보 아님'으로 보고 대상에 포함(채우기).
  //                      그 행 id는 progressOnlyByDate에 보관해 저장 시 INSERT 대신 UPDATE한다.
  const { data: existingData, error: existingError } = await supabase
    .from('work_daily_reports')
    .select('id, report_date, today_work, tomorrow_work, participants, equipment_rows, personnel_rows')
    .eq('project_id', projectId)
  if (existingError) throw new Error(existingError.message)

  const progressOnlyByDate = new Map<string, string>() // 공정률 전용 앵커 행: 날짜 → row id
  let existingDates: Set<string>
  if (realReportDatesOnly) {
    const realDates = new Set<string>()
    for (const r of (existingData || []) as unknown as ExistingReportRow[]) {
      if (isRealWorkReport(r)) realDates.add(r.report_date)
      else progressOnlyByDate.set(r.report_date, r.id)
    }
    existingDates = realDates
  } else {
    existingDates = new Set((existingData || []).map(r => r.report_date))
  }

  const targetDates = tbmDates
    .filter(d => !existingDates.has(d))
    .filter(d => !endDate || d <= endDate)
  if (targetDates.length === 0) {
    return { days: [], skippedExisting: tbmDates.length, failedDates: [] }
  }

  // 기상청 ASOS 일괄 조회 (1회 호출)
  const weatherMap = new Map<string, { sky: string; tempMaxC: number | null; tempMinC: number | null; rainSumMm: number | null }>()
  if (latitude != null && longitude != null) {
    try {
      const start = targetDates[0].replace(/-/g, '')
      const end = targetDates[targetDates.length - 1].replace(/-/g, '')
      const res = await fetch(`/api/weather/asos-range?lat=${latitude}&lon=${longitude}&start=${start}&end=${end}`)
      if (res.ok) {
        const result = await res.json()
        for (const day of result.data || []) {
          const dateKey = `${day.date.slice(0, 4)}-${day.date.slice(4, 6)}-${day.date.slice(6, 8)}`
          weatherMap.set(dateKey, day)
        }
      }
    } catch (err) {
      console.error('기상청 일괄 조회 실패 (날씨 없이 진행):', err)
    }
  }

  // 날짜순 AI 분류 — 분류 명칭 어휘를 다음 날짜에 누적 전달해 일관성 유지
  // (시드 어휘가 있으면 기준 일보 명단을 출발점으로 삼아 기존 일보와 분류명을 맞춘다)
  const vocabEquipment: string[] = [...(seedEquipmentVocab ?? [])]
  const vocabPersonnel: string[] = [...(seedPersonnelVocab ?? [])]
  const failedDates: string[] = []
  const days: GeneratedDay[] = []

  for (let i = 0; i < targetDates.length; i++) {
    const date = targetDates[i]
    onProgress?.({ current: i + 1, total: targetDates.length, date })

    try {
      const dayRows = byDate.get(date) || []
      const works = dayRows.map(r => r.today_work?.trim()).filter(Boolean) as string[]
      const personnelText = dayRows.map(r => r.personnel_count?.trim()).filter(Boolean).join(', ')
      const equipmentText = dayRows.map(r => r.equipment_input?.trim()).filter(Boolean).join(', ')

      const nextDate = tbmDates.find(d => d > date)
      const nextWorks = nextDate
        ? (byDate.get(nextDate) || []).map(r => r.today_work?.trim()).filter(Boolean) as string[]
        : []

      let equipment: GeneratedItem[] = []
      let personnel: GeneratedItem[] = []
      if (personnelText || equipmentText) {
        const response = await fetch('/api/ai/supervisor-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'work-daily-classify',
            data: {
              personnel: personnelText,
              equipment: equipmentText,
              existingEquipment: vocabEquipment,
              existingPersonnel: vocabPersonnel,
            },
          }),
        })
        if (!response.ok) throw new Error(`AI 분류 실패 (${response.status})`)
        const result = await response.json()
        if (!result.success) throw new Error(result.error || 'AI 분류 실패')

        const equipItems = Array.isArray(result.content?.equipment) ? result.content.equipment : []
        const personItems = Array.isArray(result.content?.personnel) ? result.content.personnel : []

        equipment = equipItems
          .map((item: { name?: string; spec?: string; count?: string | number }) => ({
            name: String(item.name || '').trim(),
            spec: String(item.spec || '').trim(),
            count: String(item.count ?? '').trim(),
          }))
          .filter((r: GeneratedItem) => r.name)
        personnel = personItems
          .map((item: { category?: string; count?: string | number }) => ({
            name: String(item.category || '').trim(),
            spec: '',
            count: String(item.count ?? '').trim(),
          }))
          .filter((r: GeneratedItem) => r.name)

        equipment.forEach(r => { if (!vocabEquipment.includes(r.name)) vocabEquipment.push(r.name) })
        personnel.forEach(r => { if (!vocabPersonnel.includes(r.name)) vocabPersonnel.push(r.name) })
      }

      const weather = weatherMap.get(date)
      const hasWeather = !!weather && weather.sky !== '자료부족'

      days.push({
        date,
        existingId: progressOnlyByDate.get(date),
        todayWork: works.join('\n'),
        tomorrowWork: nextWorks.join('\n'),
        weather: hasWeather ? weather!.sky : '',
        tempHigh: weather?.tempMaxC != null ? String(weather.tempMaxC) : '',
        tempLow: weather?.tempMinC != null ? String(weather.tempMinC) : '',
        rainfall: weather?.rainSumMm != null && hasWeather ? String(weather.rainSumMm) : '',
        equipment,
        personnel,
      })
    } catch (err) {
      console.error(`분류 실패 (${date}):`, err)
      failedDates.push(date)
    }
  }

  return { days, skippedExisting: tbmDates.length - targetDates.length, failedDates }
}

// ── 2단계: 검토 완료된 분류로 일보 일괄 저장 + 누계 재계산
export async function saveGeneratedReports(params: {
  projectId: string
  userId: string
  ownerName?: string
  days: GeneratedDay[]
  onProgress?: (p: GenerateProgress) => void
}): Promise<{ created: number; failedDates: string[] }> {
  const { projectId, userId, ownerName, days, onProgress } = params
  const failedDates: string[] = []
  let created = 0

  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    onProgress?.({ current: i + 1, total: days.length, date: day.date })

    try {
      const workPayload = {
        weather: day.weather,
        temp_high: day.tempHigh,
        temp_low: day.tempLow,
        rainfall: day.rainfall,
        author_name: ownerName || '',
        checker_name: ownerName || '',
        today_work: day.todayWork,
        tomorrow_work: day.tomorrowWork,
        equipment_rows: ensureUnclassifiedEquipment(day.equipment.map(item => ({
          name: item.name,
          spec: item.spec,
          prevCount: '',
          todayCount: item.count,
          cumulativeCount: item.count,
        }))),
        personnel_rows: ensureUnclassifiedPersonnel(day.personnel.map(item => ({
          category: item.name,
          prevCount: '',
          todayCount: item.count,
          cumulativeCount: item.count,
          remarks: '',
        }))),
      }

      if (day.existingId) {
        // 공정률 전용 앵커 행을 실제 일보로 채움 — progress_rate/progress_rate_manual은 미포함하여 보존
        const { error } = await supabase
          .from('work_daily_reports')
          .update({ ...workPayload, updated_at: new Date().toISOString() })
          .eq('id', day.existingId)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('work_daily_reports').insert({
          project_id: projectId,
          report_date: day.date,
          ...workPayload,
          progress_rate: '',
          progress_rate_manual: false,
          participants: '',
          created_by: userId,
        })
        if (error) throw new Error(error.message)
      }
      created++
    } catch (err) {
      console.error(`일보 저장 실패 (${day.date}):`, err)
      failedDates.push(day.date)
    }
  }

  // 전체 누계 재계산 (생성분 + 기존분 날짜순 일관성)
  if (created > 0) {
    await recalculateCumulativeForProject(projectId)
  }

  return { created, failedDates }
}
