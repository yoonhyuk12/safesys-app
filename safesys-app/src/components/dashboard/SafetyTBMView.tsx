'use client'

import React from 'react'
import { ChevronLeft, Activity, Calendar, FileText, Printer, X, FileDown, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, TBMSafetyInspection } from '@/lib/projects'
import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/constants'
import { generateTBMSafetyInspectionBulkReport } from '@/lib/reports/tbm-safety-inspection-report'
import { supabase } from '@/lib/supabase'
import { downloadTBMSafetyInspectionExcel } from '@/lib/excel/tbm-safety-inspection-export'

interface SafetyTBMViewProps {
  loading: boolean
  projects: Project[]
  tbmInspections: TBMSafetyInspection[]
  selectedDate: string
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  onBack: () => void
  onBackToHqLevel: () => void
  onBackToAllBranches: () => void
  onDateChange: (date: string) => void
  onSelectSafetyHq: (hq: string) => void
  onSelectSafetyBranch: (branch: string) => void
  onRowClickProject: (projectId: string) => void
}

const SafetyTBMView: React.FC<SafetyTBMViewProps> = ({
  loading,
  projects,
  tbmInspections,
  selectedDate,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  onBack,
  onBackToHqLevel,
  onBackToAllBranches,
  onDateChange,
  onSelectSafetyHq,
  onSelectSafetyBranch,
  onRowClickProject
}) => {
  const [isSelectionMode, setIsSelectionMode] = React.useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set())
  const [isGeneratingReport, setIsGeneratingReport] = React.useState(false)
  const [showExcelDateModal, setShowExcelDateModal] = React.useState(false)
  const [excelStartDate, setExcelStartDate] = React.useState('')
  const [excelEndDate, setExcelEndDate] = React.useState('')
  const [isDownloadingExcel, setIsDownloadingExcel] = React.useState(false)
  // 선택한 날짜에 해당하는 TBM 점검만 필터링
  const filteredTbmInspections = React.useMemo(() => {
    if (!selectedDate) return tbmInspections
    return tbmInspections.filter((insp: TBMSafetyInspection) => {
      if (!insp.tbm_date) return false
      const inspectionDate = new Date(insp.tbm_date).toISOString().split('T')[0]
      return inspectionDate === selectedDate
    })
  }, [tbmInspections, selectedDate])

  // 전일 날짜 계산
  const previousDate = React.useMemo(() => {
    if (!selectedDate) return null
    const date = new Date(selectedDate)
    date.setDate(date.getDate() - 1)
    return date.toISOString().split('T')[0]
  }, [selectedDate])

  // 전일 날짜에 해당하는 TBM 점검만 필터링
  const previousDayTbmInspections = React.useMemo(() => {
    if (!previousDate) return []
    return tbmInspections.filter((insp: TBMSafetyInspection) => {
      if (!insp.tbm_date) return false
      const inspectionDate = new Date(insp.tbm_date).toISOString().split('T')[0]
      return inspectionDate === previousDate
    })
  }, [tbmInspections, previousDate])

  // 본부 단위: 지사별 집계 데이터 계산
  const branchStats = React.useMemo(() => {
    const stats = new Map<string, {
      tbmCount: number // TBM 실시수
      previousTbmCount: number // 전일 TBM 실시수
      attendedCount: number // 입회수
      nonAttendedCount: number // 미입회수
      workersTotal: number // 총 근로자 수 합계
      newWorkersTotal: number // 신규근로자 수 합계
      equipmentTotal: number // 총 장비 수 합계
      signalWorkersTotal: number // 신호수 합계
      tomorrowWorkYes: number // 명일작업여부 "예" 개수
      tomorrowAttendedCount: number // 입회예정 개수
      tomorrowNonAttendedCount: number // 미입회예정 개수
      attendees: Array<{ district: string; attendee: string }> // 입회 정보 배열 (지구명:입회자)
    }>()

    // 필터링된 프로젝트
    const filteredProjects = projects.filter((p: Project) => {
      if (selectedSafetyHq && p.managing_hq !== selectedSafetyHq) return false
      if (selectedHq && p.managing_hq !== selectedHq) return false
      if (selectedBranch && p.managing_branch !== selectedBranch) return false
      return true
    })

    // 각 지사별로 집계
    filteredProjects.forEach((project: Project) => {
      const branch = project.managing_branch
      if (!branch) return

      if (!stats.has(branch)) {
        stats.set(branch, {
          tbmCount: 0,
          previousTbmCount: 0,
          attendedCount: 0,
          nonAttendedCount: 0,
          workersTotal: 0,
          newWorkersTotal: 0,
          equipmentTotal: 0,
          signalWorkersTotal: 0,
          tomorrowWorkYes: 0,
          tomorrowAttendedCount: 0,
          tomorrowNonAttendedCount: 0,
          attendees: []
        })
      }

      const branchStat = stats.get(branch)!

      // 해당 지사의 프로젝트에 대한 TBM 점검 데이터 집계 (날짜 필터링된 데이터 사용)
      const projectInspections = filteredTbmInspections.filter(
        (insp: TBMSafetyInspection) => insp.project_id === project.id
      )

      // 전일 TBM 점검 데이터 집계
      const previousDayProjectInspections = previousDayTbmInspections.filter(
        (insp: TBMSafetyInspection) => insp.project_id === project.id
      )
      branchStat.previousTbmCount += previousDayProjectInspections.length

      projectInspections.forEach((insp: TBMSafetyInspection) => {
        branchStat.tbmCount++
        if (insp.is_attended) {
          branchStat.attendedCount++
          
          // 입회 정보 추가 (지구명:입회자)
          if (insp.attendee && insp.attendee.trim() !== '') {
            const district = insp.district || '알 수 없음'
            // 중복 제거: 같은 지구명과 입회자 조합이 이미 있는지 확인
            const exists = branchStat.attendees.some(
              a => a.district === district && a.attendee === insp.attendee
            )
            if (!exists) {
              branchStat.attendees.push({
                district,
                attendee: insp.attendee
              })
            }
          }
        } else {
          branchStat.nonAttendedCount++
        }

        // 총 근로자 수 합계 (숫자로 변환 시도)
        if (insp.workers) {
          const num = parseInt(String(insp.workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            branchStat.workersTotal += num
          }
        }

        // 신규근로자 수 합계 (숫자로 변환 시도)
        if (insp.new_workers) {
          const num = parseInt(String(insp.new_workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            branchStat.newWorkersTotal += num
          }
        }

        // 총 장비 수 합계 (숫자로 변환 시도)
        if (insp.equipment) {
          const num = parseInt(String(insp.equipment).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            branchStat.equipmentTotal += num
          }
        }

        // 신호수 합계
        if (insp.signal_workers) {
          const num = parseInt(String(insp.signal_workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            branchStat.signalWorkersTotal += num
          }
        }

        // 명일작업여부
        if (insp.tomorrow_work_status === true) {
          branchStat.tomorrowWorkYes++
        }

        // 명일 입회예정/미입회예정
        if (insp.tomorrow_is_attended === true) {
          branchStat.tomorrowAttendedCount++
        } else if (insp.tomorrow_is_attended === false) {
          branchStat.tomorrowNonAttendedCount++
        }
      })
    })

    const result = Array.from(stats.entries()).map(([branch, stat]) => ({
      branch,
      ...stat
    }))

    // 지제순(목록순)으로 정렬
    const targetHq = selectedSafetyHq || selectedHq
    if (targetHq && BRANCH_OPTIONS[targetHq]) {
      const branchOrder = BRANCH_OPTIONS[targetHq]
      result.sort((a, b) => {
        const aIndex = branchOrder.indexOf(a.branch)
        const bIndex = branchOrder.indexOf(b.branch)
        // 목록에 없는 경우는 뒤로
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      })
    }

    return result
  }, [projects, filteredTbmInspections, previousDayTbmInspections, selectedSafetyHq, selectedHq, selectedBranch])

  // 본부 단위: 소계 계산 (특정 본부의 지사별 집계에 대한 소계)
  const hqSummary = React.useMemo(() => {
    if (branchStats.length === 0) {
      return null
    }
    
    return branchStats.reduce((acc, stat) => ({
      tbmCount: acc.tbmCount + stat.tbmCount,
      previousTbmCount: acc.previousTbmCount + stat.previousTbmCount,
      attendedCount: acc.attendedCount + stat.attendedCount,
      nonAttendedCount: acc.nonAttendedCount + stat.nonAttendedCount,
      workersTotal: acc.workersTotal + stat.workersTotal,
      newWorkersTotal: acc.newWorkersTotal + stat.newWorkersTotal,
      equipmentTotal: acc.equipmentTotal + stat.equipmentTotal,
      signalWorkersTotal: acc.signalWorkersTotal + stat.signalWorkersTotal,
      tomorrowWorkYes: acc.tomorrowWorkYes + stat.tomorrowWorkYes,
      tomorrowAttendedCount: acc.tomorrowAttendedCount + stat.tomorrowAttendedCount,
      tomorrowNonAttendedCount: acc.tomorrowNonAttendedCount + stat.tomorrowNonAttendedCount
    }), {
      tbmCount: 0,
      previousTbmCount: 0,
      attendedCount: 0,
      nonAttendedCount: 0,
      workersTotal: 0,
      newWorkersTotal: 0,
      equipmentTotal: 0,
      signalWorkersTotal: 0,
      tomorrowWorkYes: 0,
      tomorrowAttendedCount: 0,
      tomorrowNonAttendedCount: 0
    })
  }, [branchStats])

  // 본부별 집계 데이터 계산 (전체 본부 뷰용)
  const hqStats = React.useMemo(() => {
    if (selectedSafetyHq) return [] // 특정 본부가 선택된 경우는 빈 배열 반환
    
    const stats = new Map<string, {
      hq: string
      tbmCount: number
      previousTbmCount: number
      attendedCount: number
      nonAttendedCount: number
      workersTotal: number
      newWorkersTotal: number
      equipmentTotal: number
      signalWorkersTotal: number
      tomorrowWorkYes: number
      tomorrowAttendedCount: number
      tomorrowNonAttendedCount: number
      branchCount: number
    }>()

    // 필터링된 프로젝트
    const filteredProjects = projects.filter((p: Project) => {
      if (selectedHq && p.managing_hq !== selectedHq) return false
      if (selectedBranch && p.managing_branch !== selectedBranch) return false
      return true
    })

    // 각 본부별로 집계
    filteredProjects.forEach((project: Project) => {
      const hq = project.managing_hq
      if (!hq) return

      if (!stats.has(hq)) {
        stats.set(hq, {
          hq,
          tbmCount: 0,
          previousTbmCount: 0,
          attendedCount: 0,
          nonAttendedCount: 0,
          workersTotal: 0,
          newWorkersTotal: 0,
          equipmentTotal: 0,
          signalWorkersTotal: 0,
          tomorrowWorkYes: 0,
          tomorrowAttendedCount: 0,
          tomorrowNonAttendedCount: 0,
          branchCount: 0
        })
      }

      const hqStat = stats.get(hq)!

      // 해당 본부의 프로젝트에 대한 TBM 점검 데이터 집계
      const projectInspections = filteredTbmInspections.filter(
        (insp: TBMSafetyInspection) => insp.project_id === project.id
      )

      // 전일 TBM 점검 데이터 집계
      const previousDayProjectInspections = previousDayTbmInspections.filter(
        (insp: TBMSafetyInspection) => insp.project_id === project.id
      )
      hqStat.previousTbmCount += previousDayProjectInspections.length

      projectInspections.forEach((insp: TBMSafetyInspection) => {
        hqStat.tbmCount++
        if (insp.is_attended) {
          hqStat.attendedCount++
        } else {
          hqStat.nonAttendedCount++
        }

        // 총 근로자 수 합계
        if (insp.workers) {
          const num = parseInt(String(insp.workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            hqStat.workersTotal += num
          }
        }

        // 신규근로자 수 합계
        if (insp.new_workers) {
          const num = parseInt(String(insp.new_workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            hqStat.newWorkersTotal += num
          }
        }

        // 총 장비 수 합계
        if (insp.equipment) {
          const num = parseInt(String(insp.equipment).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            hqStat.equipmentTotal += num
          }
        }

        // 신호수 합계
        if (insp.signal_workers) {
          const num = parseInt(String(insp.signal_workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            hqStat.signalWorkersTotal += num
          }
        }

        // 명일작업여부
        if (insp.tomorrow_work_status === true) {
          hqStat.tomorrowWorkYes++
        }

        // 명일 입회예정/미입회예정
        if (insp.tomorrow_is_attended === true) {
          hqStat.tomorrowAttendedCount++
        } else if (insp.tomorrow_is_attended === false) {
          hqStat.tomorrowNonAttendedCount++
        }
      })
    })

    // 지사 수 계산
    filteredProjects.forEach((project: Project) => {
      const hq = project.managing_hq
      if (!hq) return
      const hqStat = stats.get(hq)
      if (hqStat) {
        // 지사별로 카운트 (중복 제거)
        const branches = new Set<string>()
        filteredProjects.forEach((p: Project) => {
          if (p.managing_hq === hq && p.managing_branch) {
            branches.add(p.managing_branch)
          }
        })
        hqStat.branchCount = branches.size
      }
    })

    const result = Array.from(stats.entries()).map(([hq, stat]) => ({
      hq,
      ...stat
    }))

    // 본부 순서대로 정렬
    result.sort((a, b) => {
      const aIndex = HEADQUARTERS_OPTIONS.indexOf(a.hq as any)
      const bIndex = HEADQUARTERS_OPTIONS.indexOf(b.hq as any)
      if (aIndex === -1 && bIndex === -1) return 0
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    return result
  }, [projects, filteredTbmInspections, previousDayTbmInspections, selectedSafetyHq, selectedHq, selectedBranch])

  // 지사 선택 시: 프로젝트별 최신 TBM 점검 데이터
  const projectInspectionsData = React.useMemo(() => {
    if (!selectedSafetyBranch) return []

    const filteredProjects = projects
      .filter((p: Project) => {
        if (selectedSafetyHq && p.managing_hq !== selectedSafetyHq) return false
        if (p.managing_branch !== selectedSafetyBranch) return false
        return true
      })
      .sort((a, b) => {
        // display_order로 정렬 (지사 내에서만)
        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
        
        if (aOrder !== bOrder) {
          return aOrder - bOrder
        }
        
        // display_order가 같거나 둘 다 없는 경우 프로젝트명으로 정렬
        return (a.project_name || '').localeCompare(b.project_name || '', 'ko-KR')
      })

    // 각 프로젝트별로 최신 TBM 점검 데이터를 가져옴
    const result: Array<{
      projectId: string
      projectName: string
      latestInspection: TBMSafetyInspection | null
      previousDayInspection: TBMSafetyInspection | null
    }> = []

    filteredProjects.forEach((project: Project) => {
      const projectInspections = filteredTbmInspections.filter(
        (insp: TBMSafetyInspection) => insp.project_id === project.id
      )

      // 최신 점검 데이터 (날짜 기준 내림차순 정렬 후 첫 번째)
      const latestInspection = projectInspections.length > 0
        ? projectInspections.sort((a, b) => 
            new Date(b.tbm_date).getTime() - new Date(a.tbm_date).getTime()
          )[0]
        : null

      // 전일 TBM 점검 데이터
      const previousDayProjectInspections = previousDayTbmInspections.filter(
        (insp: TBMSafetyInspection) => insp.project_id === project.id
      )
      const previousDayInspection = previousDayProjectInspections.length > 0
        ? previousDayProjectInspections.sort((a, b) => 
            new Date(b.tbm_date).getTime() - new Date(a.tbm_date).getTime()
          )[0]
        : null

      result.push({
        projectId: project.id,
        projectName: project.project_name,
        latestInspection,
        previousDayInspection
      })
    })

    return result
  }, [projects, filteredTbmInspections, previousDayTbmInspections, selectedSafetyBranch, selectedSafetyHq])

  // 행 클릭 핸들러 (선택 모드일 때는 선택/해제, 아닐 때는 프로젝트 페이지로 이동)
  const handleRowClick = (projectId: string) => {
    if (isSelectionMode) {
      setSelectedProjectIds(prev => {
        const newSet = new Set(prev)
        if (newSet.has(projectId)) {
          newSet.delete(projectId)
        } else {
          newSet.add(projectId)
        }
        return newSet
      })
    } else {
      onRowClickProject(projectId)
    }
  }

  // 보고서 아이콘 클릭 핸들러
  const handleReportIconClick = () => {
    if (isSelectionMode) {
      // 프린터 아이콘 클릭 시 벌크 보고서 생성
      handleGenerateBulkReport()
    } else {
      // 보고서 아이콘 클릭 시 선택 모드 활성화
      setIsSelectionMode(true)
      setSelectedProjectIds(new Set())
    }
  }

  // 벌크 보고서 생성
  const handleGenerateBulkReport = async () => {
    if (selectedProjectIds.size === 0) {
      alert('선택된 프로젝트가 없습니다.')
      return
    }

    setIsGeneratingReport(true)
    try {
      // 선택된 프로젝트들의 정보와 TBM 점검 데이터 가져오기
      const selectedProjects = projects.filter(p => selectedProjectIds.has(p.id))
      
      const projectInspections = await Promise.all(
        selectedProjects.map(async (project) => {
          // 해당 프로젝트의 TBM 점검 데이터 가져오기 (날짜 필터링 적용)
          const projectInspections = filteredTbmInspections.filter(
            (insp: TBMSafetyInspection) => insp.project_id === project.id
          )

          // 프로젝트 정보에 user_profiles 정보 추가
          const { data: projectData } = await supabase
            .from('projects')
            .select(`
              *,
              user_profiles!projects_created_by_fkey (
                company_name
              )
            `)
            .eq('id', project.id)
            .single()

          return {
            project: projectData || project,
            inspections: projectInspections
          }
        })
      )

      // TBM 점검이 있는 프로젝트만 필터링
      const validProjectInspections = projectInspections.filter(
        pi => pi.inspections.length > 0
      )

      if (validProjectInspections.length === 0) {
        alert('선택된 프로젝트 중 TBM 점검 데이터가 있는 프로젝트가 없습니다.')
        return
      }

      // 벌크 보고서 생성
      const branchName = selectedSafetyBranch || ''
      const dateStr = selectedDate ? selectedDate.replace(/-/g, '') : new Date().toLocaleDateString('ko-KR').replace(/\./g, '')
      const filename = `TBM안전활동점검표_${branchName}_${dateStr}.pdf`

      await generateTBMSafetyInspectionBulkReport({
        projectInspections: validProjectInspections,
        filename
      })

      // 선택 모드 해제
      setIsSelectionMode(false)
      setSelectedProjectIds(new Set())
    } catch (error: any) {
      console.error('벌크 보고서 생성 오류:', error)
      alert(`보고서 생성 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setIsGeneratingReport(false)
    }
  }

  // 지사 선택 시: 소계 계산
  const branchSummary = React.useMemo(() => {
    if (!selectedSafetyBranch || projectInspectionsData.length === 0) {
      return null
    }

    let tbmCount = 0 // TBM 실시 수
    let attendedCount = 0 // 입회 수
    let totalCount = 0 // 전체 수
    let totalWorkers = 0 // 총 근로자 수
    let totalNewWorkers = 0 // 총 신규 근로자 수
    let totalEquipment = 0 // 총 장비 수
    let totalSignalWorkers = 0 // 총 신호수 수
    let tomorrowWorkYes = 0 // 명일 작업 예정 수
    let tomorrowAttendedYes = 0 // 명일 입회 예정 수
    let attendeeCount = 0 // 입회자 수 (이름이 있으면 1명씩)
    let tomorrowAttendeeCount = 0 // 명일 입회예정자 수 (이름이 있으면 1명씩)

    projectInspectionsData.forEach((projectData) => {
      const insp = projectData.latestInspection
      if (insp) {
        totalCount++
        if (insp.tbm_date) {
          tbmCount++
        }
        if (insp.is_attended) {
          attendedCount++
        }
        // workers는 문자열이므로 숫자로 변환하여 집계
        if (insp.workers) {
          const workersNum = parseInt(String(insp.workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(workersNum)) {
            totalWorkers += workersNum
          }
        }
        // new_workers는 문자열이므로 숫자로 변환하여 집계
        if (insp.new_workers) {
          const newWorkersNum = parseInt(String(insp.new_workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(newWorkersNum)) {
            totalNewWorkers += newWorkersNum
          }
        }
        // equipment는 문자열이므로 숫자로 변환하여 집계
        if (insp.equipment) {
          const equipmentNum = parseInt(String(insp.equipment).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(equipmentNum)) {
            totalEquipment += equipmentNum
          }
        }
        // signal_workers는 문자열이므로 숫자로 변환하여 집계
        if (insp.signal_workers) {
          const signalWorkersNum = parseInt(String(insp.signal_workers).replace(/[^0-9]/g, ''), 10)
          if (!isNaN(signalWorkersNum)) {
            totalSignalWorkers += signalWorkersNum
          }
        }
        if (insp.tomorrow_work_status === true) {
          tomorrowWorkYes++
        }
        if (insp.tomorrow_is_attended === true) {
          tomorrowAttendedYes++
        }
        // 입회자 이름이 있으면 1명씩 카운트
        if (insp.attendee && insp.attendee.trim() !== '') {
          attendeeCount++
        }
        // 명일 입회예정자 이름이 있으면 1명씩 카운트
        if (insp.tomorrow_attendee && insp.tomorrow_attendee.trim() !== '') {
          tomorrowAttendeeCount++
        }
      }
    })

    return {
      tbmCount,
      attendedCount,
      totalCount,
      totalWorkers,
      totalNewWorkers,
      totalEquipment,
      totalSignalWorkers,
      tomorrowWorkYes,
      tomorrowAttendedYes,
      attendeeCount,
      tomorrowAttendeeCount
    }
  }, [projectInspectionsData, selectedSafetyBranch])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="flex justify-center items-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  console.log('🔍 SafetyTBMView 렌더링:', { loading, tbmInspections: tbmInspections?.length, projects: projects?.length, selectedSafetyBranch, selectedSafetyHq })

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <ChevronLeft className="h-4 w-4 mr-1" />
          안전현황으로 돌아가기
        </button>
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Activity className="h-5 w-5 text-blue-600 mr-2" />
            TBM 안전활동점검 현황
          </h3>
        </div>

        {selectedSafetyBranch ? (
          // 지사 선택 시: 프로젝트별 TBM 점검 상세 테이블 (한 개 테이블)
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={onBackToHqLevel}
                className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                title={`${selectedSafetyBranch} 지사로 돌아가기`}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                {isSelectionMode && (
                  <button
                    onClick={() => {
                      setIsSelectionMode(false)
                      setSelectedProjectIds(new Set())
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    title="선택 모드 취소"
                  >
                    <X className="h-4 w-4" />
                    <span className="text-sm">취소</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowExcelDateModal(true)
                    // 오늘 날짜를 기본값으로 설정
                    const today = new Date().toISOString().split('T')[0]
                    setExcelStartDate(today)
                    setExcelEndDate(today)
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                  title="엑셀 다운로드"
                >
                  <FileDown className="h-4 w-4" />
                  <span className="text-sm">엑셀</span>
                </button>
                <button
                  onClick={handleReportIconClick}
                  disabled={true}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors bg-gray-100 text-gray-400 cursor-not-allowed opacity-50"
                  title="보고서 기능은 비활성화되어 있습니다"
                >
                  {isSelectionMode ? (
                    <>
                      <Printer className="h-4 w-4" />
                      <span className="text-sm">보고서 생성 ({selectedProjectIds.size})</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      <span className="text-sm">보고서</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full divide-y divide-gray-200" style={{ minWidth: '700px' }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 w-[100px] max-w-[100px] lg:w-[20%] lg:max-w-none">프로젝트명</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-100 w-[80px] lg:w-[10%]">(전일)<br/>TBM<br/>확인여부</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap lg:w-[10%]">TBM확인여부</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap lg:w-[10%]">입회여부</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap lg:w-[20%]">미입회사유</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap lg:w-[15%]">입회자</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap lg:w-[15%]">비고</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {projectInspectionsData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* 소계행 */}
                      {branchSummary && (() => {
                        // 전일 TBM 확인 수 계산
                        const previousTbmCount = projectInspectionsData.filter(
                          (projectData) => projectData.previousDayInspection?.tbm_date
                        ).length
                        
                        return (
                          <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                            <td className="sticky left-0 z-10 bg-blue-50 px-3 py-2 text-xs text-center font-bold text-blue-900 border-r border-blue-200 w-[100px] max-w-[100px] lg:w-[20%] lg:max-w-none">
                              <div className="truncate lg:whitespace-normal" title={`소계(${projectInspectionsData.length}지구)`}>
                                소계({projectInspectionsData.length}지구)
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs text-center font-bold text-blue-900 border-r border-blue-200 bg-yellow-100 w-[80px] lg:w-[10%]">
                              {previousTbmCount === 0 ? '-' : previousTbmCount}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[10%]">
                              {branchSummary.tbmCount === 0 ? '-' : branchSummary.tbmCount}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[10%]">
                              {branchSummary.totalCount === 0 ? '-' : `${branchSummary.attendedCount === 0 ? '-' : branchSummary.attendedCount} / ${branchSummary.totalCount}`}
                            </td>
                            <td className="px-3 py-2 text-xs text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[20%]">
                              -
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[15%]">
                              {branchSummary.attendeeCount === 0 ? '-' : branchSummary.attendeeCount}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-center font-bold text-blue-900 lg:w-[15%]">
                              -
                            </td>
                          </tr>
                        )
                      })()}
                      {/* 데이터행 */}
                      {projectInspectionsData.map((projectData) => {
                      const insp = projectData.latestInspection
                      const previousInsp = projectData.previousDayInspection
                      const isSelected = selectedProjectIds.has(projectData.projectId)
                      return (
                        <tr
                          key={projectData.projectId}
                          onClick={() => handleRowClick(projectData.projectId)}
                          className={`group hover:bg-gray-50 cursor-pointer ${
                            isSelectionMode && isSelected ? 'bg-blue-100' : ''
                          }`}
                        >
                          <td className={`sticky left-0 z-10 px-3 py-2 text-xs text-center font-medium text-gray-900 border-r border-gray-200 w-[100px] max-w-[100px] lg:w-[20%] lg:max-w-none ${
                            isSelectionMode && isSelected ? 'bg-blue-100 group-hover:bg-blue-100' : 'bg-white group-hover:bg-gray-50'
                          }`}>
                            <div className="truncate lg:whitespace-normal" title={projectData.projectName}>
                              {projectData.projectName}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-center text-gray-900 bg-yellow-50 w-[80px] lg:w-[10%]">
                            {previousInsp?.tbm_date ? 'O' : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-center text-gray-900 lg:w-[10%]">
                            {insp?.tbm_date ? 'O' : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-center text-gray-900 lg:w-[10%]">
                            {insp ? (insp.is_attended ? '예' : '아니오') : '-'}
                          </td>
                          <td className="px-3 py-2 text-xs text-center text-gray-900 max-w-xs truncate lg:w-[20%] lg:max-w-none lg:whitespace-normal" title={insp?.non_attendance_reason || ''}>
                            {insp?.non_attendance_reason || '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-center text-gray-900 lg:w-[15%]">
                            {insp?.attendee || '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-center text-gray-900 lg:w-[15%]">
                            -
                          </td>
                        </tr>
                      )
                    })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : selectedSafetyHq ? (
          // 특정 본부 선택 시: 지사별 집계 테이블
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={onBackToAllBranches}
                className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                title="전체 본부로 돌아가기"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setShowExcelDateModal(true)
                  // 오늘 날짜를 기본값으로 설정
                  const today = new Date().toISOString().split('T')[0]
                  setExcelStartDate(today)
                  setExcelEndDate(today)
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors ml-auto"
                title="엑셀 다운로드"
              >
                <FileDown className="h-4 w-4" />
                <span className="text-sm">엑셀</span>
              </button>
            </div>
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full divide-y divide-gray-200" style={{ minWidth: '600px' }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 lg:w-[15%]">지사</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-100 w-[80px] lg:w-[10%]">(전일)<br/>TBM<br/>확인수</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[10%]">TBM확인수</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[15%]">입회/미입회</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[35%]">입회 정보<br/>(지구명:입회자)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[15%]">비고</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {branchStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* 소계행 */}
                    {hqSummary && (
                      <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                        <td className="sticky left-0 z-10 bg-blue-50 px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[15%]">
                          소계({branchStats.length}지사)
                        </td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-blue-900 border-r border-blue-200 bg-yellow-100 w-[80px] lg:w-[10%]">
                          {hqSummary.previousTbmCount === 0 ? '-' : hqSummary.previousTbmCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[10%]">
                          {hqSummary.tbmCount === 0 ? '-' : hqSummary.tbmCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[15%]">
                          {hqSummary.attendedCount === 0 ? '-' : hqSummary.attendedCount} / {hqSummary.nonAttendedCount === 0 ? '-' : hqSummary.nonAttendedCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 border-r border-blue-200 lg:w-[35%]">
                          -
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-bold text-blue-900 lg:w-[15%]">
                          -
                        </td>
                      </tr>
                    )}
                    {/* 데이터행 */}
                    {branchStats.map((stat) => (
                    <tr
                      key={stat.branch}
                      onClick={() => onSelectSafetyBranch(stat.branch)}
                      className="group hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-3 whitespace-nowrap text-sm text-center font-medium text-gray-900 border-r border-gray-200 lg:w-[15%]">
                        {stat.branch}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-900 bg-yellow-50 w-[80px] lg:w-[10%]">
                        {stat.previousTbmCount === 0 ? '-' : stat.previousTbmCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[10%]">
                        {stat.tbmCount === 0 ? '-' : stat.tbmCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[15%]">
                        {stat.attendedCount === 0 ? '-' : stat.attendedCount} / {stat.nonAttendedCount === 0 ? '-' : stat.nonAttendedCount}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 lg:w-[35%]">
                        {stat.attendees.length === 0 ? (
                          '-'
                        ) : (
                          <div className="space-y-1">
                            {stat.attendees.map((item, index) => (
                              <div key={index} className="text-center">
                                {item.district}:{item.attendee}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[15%]">
                        -
                      </td>
                    </tr>
                  ))}
                  </>
                )}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          // 전체 본부: 본부별 집계 테이블
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowExcelDateModal(true)
                  // 오늘 날짜를 기본값으로 설정
                  const today = new Date().toISOString().split('T')[0]
                  setExcelStartDate(today)
                  setExcelEndDate(today)
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors ml-auto"
                title="엑셀 다운로드"
              >
                <FileDown className="h-4 w-4" />
                <span className="text-sm">엑셀</span>
              </button>
            </div>
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full divide-y divide-gray-200" style={{ minWidth: '600px' }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 lg:w-[15%]">본부</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-100 w-[80px] lg:w-[10%]">(전일)<br/>TBM<br/>확인수</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[10%]">TBM확인수</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[15%]">입회/미입회</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[10%]">지사수</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider lg:w-[15%]">비고</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {hqStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* 데이터행 */}
                    {hqStats.map((stat) => (
                    <tr
                      key={stat.hq}
                      onClick={() => onSelectSafetyHq(stat.hq)}
                      className="group hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-3 whitespace-nowrap text-sm text-center font-medium text-gray-900 border-r border-gray-200 lg:w-[15%]">
                        {stat.hq}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-900 bg-yellow-50 w-[80px] lg:w-[10%]">
                        {stat.previousTbmCount === 0 ? '-' : stat.previousTbmCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[10%]">
                        {stat.tbmCount === 0 ? '-' : stat.tbmCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[15%]">
                        {stat.attendedCount === 0 ? '-' : stat.attendedCount} / {stat.nonAttendedCount === 0 ? '-' : stat.nonAttendedCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[10%]">
                        {stat.branchCount === 0 ? '-' : stat.branchCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 lg:w-[15%]">
                        -
                      </td>
                    </tr>
                  ))}
                  </>
                )}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* 엑셀 다운로드 날짜 선택 모달 */}
      {showExcelDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">엑셀 다운로드 기간 선택</h3>
                <button
                  onClick={() => setShowExcelDateModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={excelStartDate}
                    onChange={(e) => setExcelStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={excelEndDate}
                    onChange={(e) => setExcelEndDate(e.target.value)}
                    min={excelStartDate}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={async () => {
                    if (!excelStartDate || !excelEndDate) {
                      alert('시작일과 종료일을 모두 선택해주세요.')
                      return
                    }
                    
                    setIsDownloadingExcel(true)
                    try {
                      const filteredProjects = projects.filter((p: Project) => {
                        if (selectedSafetyHq && p.managing_hq !== selectedSafetyHq) return false
                        if (selectedSafetyBranch && p.managing_branch !== selectedSafetyBranch) return false
                        if (selectedHq && p.managing_hq !== selectedHq) return false
                        if (selectedBranch && p.managing_branch !== selectedBranch) return false
                        return true
                      })
                      await downloadTBMSafetyInspectionExcel(filteredProjects, tbmInspections, excelStartDate, excelEndDate, undefined, selectedSafetyHq, selectedSafetyBranch)
                      setShowExcelDateModal(false)
                    } catch (error) {
                      console.error('엑셀 다운로드 오류:', error)
                      alert('엑셀 다운로드 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
                    } finally {
                      setIsDownloadingExcel(false)
                    }
                  }}
                  disabled={isDownloadingExcel}
                  className={`flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 ${
                    isDownloadingExcel ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isDownloadingExcel ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>다운로드 중...</span>
                    </>
                  ) : (
                    '다운로드'
                  )}
                </button>
                <button
                  onClick={() => setShowExcelDateModal(false)}
                  disabled={isDownloadingExcel}
                  className={`flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors ${
                    isDownloadingExcel ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SafetyTBMView

