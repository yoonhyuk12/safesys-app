'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, Calendar, Users, FileText, ChevronRight, AlertTriangle, Building2, Eye, Video, RefreshCw, ArrowUp, Phone, Copy, X, CheckCircle, Trash2, Download } from 'lucide-react'
import KakaoMap from '@/components/ui/KakaoMap'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import NavigationSelector from '@/components/ui/NavigationSelector'
import { getTBMRecords, getTBMStats, type TBMRecord } from '@/lib/tbm'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { usePathname } from 'next/navigation'
import type { TBMSafetyInspection } from '@/lib/projects'
import { generateSupervisorDiaryExcel } from '@/lib/excel/supervisor-diary-export'

// TBMRecord와 TBMStats는 lib/tbm.ts에서 import하므로 제거

interface TBMStatusProps {
  projects: any[]
  selectedHq?: string
  selectedBranch?: string
  onProjectClick?: (project: any) => void
  onBranchSelect?: (branchName: string) => void
  onHqSelect?: (hqName: string) => void
  onProgressUpdate?: (percentage: number, timeRemaining: number) => void
  onManualRefreshReady?: (refreshFn: () => Promise<void>) => void
  offices?: any[] // 사무실 위치 데이터 추가
}

const TBMStatus: React.FC<TBMStatusProps> = ({
  projects,
  selectedHq,
  selectedBranch,
  onProjectClick,
  onBranchSelect,
  onHqSelect,
  onProgressUpdate,
  onManualRefreshReady,
  offices = []
}) => {
  const { userProfile } = useAuth()
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)
  const lastLoadedParams = useRef<{ date: string; hq?: string; branch?: string } | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [tbmRecords, setTbmRecords] = useState<TBMRecord[]>([])
  const [allTbmRecords, setAllTbmRecords] = useState<TBMRecord[]>([]) // 전체 캐시된 데이터
  const [tbmSafetyInspections, setTbmSafetyInspections] = useState<TBMSafetyInspection[]>([]) // TBM 안전활동 점검 데이터
  const [error, setError] = useState<string>('')
  const [navigationModal, setNavigationModal] = useState<{
    isOpen: boolean
    address: string
  }>({
    isOpen: false,
    address: ''
  })
  const [phoneModal, setPhoneModal] = useState<{
    isOpen: boolean
    name: string
    phone: string
  }>({
    isOpen: false,
    name: '',
    phone: ''
  })
  // 삭제 모드 관련 state
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  // 보고서 다운로드 관련 state
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')
  const [reportModeActive, setReportModeActive] = useState(false) // 보고서 모드 활성화 여부
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const [reportProgress, setReportProgress] = useState({ current: 0, total: 0 }) // 보고서 생성 진행률
  const [reportStatus, setReportStatus] = useState('') // 보고서 생성 상태 메시지
  const [reportSubStatus, setReportSubStatus] = useState('') // 보고서 생성 하위 상태 (기상정보 등)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [supervisorName, setSupervisorName] = useState('')
  const [supervisorSignature, setSupervisorSignature] = useState('')
  const [pendingReportData, setPendingReportData] = useState<{
    projectName: string
    tbmSubmissions: any[]
    latitude?: number
    longitude?: number
  } | null>(null)
  const cancelReportRef = useRef(false) // 보고서 생성 취소 플래그
  // 새로운 AI 공감일지 다운로드 플로우를 위한 상태
  const [showProjectSelectionModal, setShowProjectSelectionModal] = useState(false)
  const [selectedProjectForReport, setSelectedProjectForReport] = useState<{ name: string; hq: string; branch: string } | null>(null)
  const [tbmSubmissionDates, setTbmSubmissionDates] = useState<string[]>([])
  const [showDateSelectionModal, setShowDateSelectionModal] = useState(false)
  const [showOptionsModal, setShowOptionsModal] = useState(false)
  const [useAI, setUseAI] = useState(true)
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  const [focusedProjectId, setFocusedProjectId] = useState<string | undefined>()
  const [hoveredBranchName, setHoveredBranchName] = useState<string | undefined>()
  const [hoveredHqName, setHoveredHqName] = useState<string | undefined>()
  const [isProjectTableScrolled, setIsProjectTableScrolled] = useState(false)
  const [infoModal, setInfoModal] = useState<{
    isOpen: boolean
    title: string
    content: string
    position: { x: number; y: number }
  }>({
    isOpen: false,
    title: '',
    content: '',
    position: { x: 0, y: 0 }
  })
  // NodeJS.Timeout 타입 의존성을 피하기 위해 setInterval의 반환 타입을 사용
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // onProgressUpdate를 ref로 저장하여 항상 최신 값을 참조하도록 함
  const onProgressUpdateRef = useRef(onProgressUpdate)

  // 프로그레스 바 상태
  const [timeRemaining, setTimeRemaining] = useState<number>(15 * 60) // 15분 = 900초
  const [progressPercentage, setProgressPercentage] = useState<number>(100)

  // onProgressUpdate ref 업데이트
  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate
  }, [onProgressUpdate])
  // 전체 화면/리사이즈 대응을 위한 가용 높이 계산
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const [dynamicContainerHeight, setDynamicContainerHeight] = useState<number>(700)

  // 필터링된 프로젝트 (사용되지 않음)
  // const filteredProjects = projects.filter(project => {
  //   if (selectedHq && project.managing_hq !== selectedHq) return false
  //   if (selectedBranch && project.managing_branch !== selectedBranch) return false
  //   return true
  // })

  // 지도용 프로젝트 데이터 (TBM 기록에서 추출) - useMemo로 최적화
  const projectsForMap = React.useMemo(() => {
    // 안전현황 페이지에서는 로그 출력 및 데이터 처리 스킵
    if (pathname && pathname.startsWith('/safe')) {
      return []
    }

    console.log('TBM 기록 총 개수:', tbmRecords.length)
    const withCoordinates = tbmRecords.filter(record => record.latitude && record.longitude)
    console.log('위도/경도가 있는 기록:', withCoordinates.length)

    const mapped = withCoordinates.map(record => ({
      id: record.project_id,
      name: record.project_name,
      address: record.location,
      lat: record.latitude!,
      lng: record.longitude!,
      managingHq: record.managing_hq,
      managingBranch: record.managing_branch,
      riskWorkType: record.risk_work_type || '해당없음', // 위험공종 정보 추가
      todayWork: record.today_work || '' // 오늘 작업내용 추가
    }))

    console.log('지도용 프로젝트 데이터:', mapped)
    return mapped
  }, [tbmRecords, pathname])

  // 본부별 통계 계산 - useMemo로 최적화  
  const hqStats = React.useMemo(() => {
    if (selectedHq || selectedBranch) return [] // 전체 본부이면서 전체 지사일 때만 표시

    const hqStatsMap = new Map()

    // HEADQUARTERS_OPTIONS에서 모든 본부를 0으로 초기화
    const { HEADQUARTERS_OPTIONS } = require('@/lib/constants')
    HEADQUARTERS_OPTIONS.forEach((hqName: string) => {
      hqStatsMap.set(hqName, {
        hqName,
        tbmCount: 0,
        tbmInspectionCount: 0, // TBM 안전활동 점검 확인 수
        riskWorkCount: 0,
        cctvUsageCount: 0,
        newWorkersCount: 0 // 신규인원 명수 합계
      })
    })

    // TBM 기록을 통해 본부별 통계 계산
    tbmRecords.forEach(record => {
      const hqName = record.managing_hq
      if (!hqName) return

      if (!hqStatsMap.has(hqName)) {
        // 목록에 없는 본부는 새로 추가
        hqStatsMap.set(hqName, {
          hqName,
          tbmCount: 0,
          tbmInspectionCount: 0,
          riskWorkCount: 0,
          cctvUsageCount: 0
        })
      }

      const stats = hqStatsMap.get(hqName)
      stats.tbmCount++

      // 위험공종 수 계산
      if (record.risk_work_type && record.risk_work_type !== '해당없음') {
        stats.riskWorkCount++
      }

      // CCTV 사용 수 계산
      if (record.cctv_usage && record.cctv_usage.includes('사용중')) {
        stats.cctvUsageCount++
      }

      // 신규인원 명수 합계 계산 (숫자만 추출하여 합산)
      const newWorkersValue = record.new_workers != null ? String(record.new_workers).trim() : ''
      if (newWorkersValue !== '' && newWorkersValue !== '0' && newWorkersValue !== '-') {
        const match = newWorkersValue.match(/\d+/)
        if (match) {
          stats.newWorkersCount += parseInt(match[0], 10)
        }
      }
    })

    // TBM 안전활동 점검 데이터를 통해 확인 수 계산
    tbmSafetyInspections.forEach(inspection => {
      const hqName = inspection.managing_hq
      if (!hqName) return

      if (!hqStatsMap.has(hqName)) {
        hqStatsMap.set(hqName, {
          hqName,
          tbmCount: 0,
          tbmInspectionCount: 0,
          riskWorkCount: 0,
          cctvUsageCount: 0
        })
      }

      const stats = hqStatsMap.get(hqName)
      // 선택된 날짜의 TBM 안전활동 점검만 카운트
      if (inspection.tbm_date === selectedDate) {
        stats.tbmInspectionCount++
      }
    })

    // HEADQUARTERS_OPTIONS 순서에 따라 정렬
    const statsArray = Array.from(hqStatsMap.values())

    return statsArray.sort((a, b) => {
      const aIndex = HEADQUARTERS_OPTIONS.indexOf(a.hqName)
      const bIndex = HEADQUARTERS_OPTIONS.indexOf(b.hqName)

      // 목록에 있는 본부는 해당 순서대로, 없는 본부는 맨 뒤에 알파벳순
      if (aIndex === -1 && bIndex === -1) {
        return a.hqName.localeCompare(b.hqName)
      } else if (aIndex === -1) {
        return 1
      } else if (bIndex === -1) {
        return -1
      } else {
        return aIndex - bIndex
      }
    })
  }, [tbmRecords, tbmSafetyInspections, selectedDate, selectedHq, selectedBranch])

  // 지사별 통계 계산 - useMemo로 최적화
  const branchStats = React.useMemo(() => {
    if (!selectedHq || selectedBranch) return [] // 특정 본부이면서 전체 지사일 때만 표시

    const branchStatsMap = new Map()

    // 먼저 드롭다운에 있는 모든 지사를 0으로 초기화
    const branchOrder = BRANCH_OPTIONS[selectedHq] || []
    branchOrder.forEach(branchName => {
      branchStatsMap.set(branchName, {
        branchName,
        tbmCount: 0,
        tbmInspectionCount: 0, // TBM 안전활동 점검 확인 수
        riskWorkCount: 0,
        cctvUsageCount: 0,
        newWorkersCount: 0 // 신규인원 수
      })
    })

    // TBM 기록을 통해 통계 계산
    tbmRecords.forEach(record => {
      if (record.managing_hq !== selectedHq) return

      const branchName = record.managing_branch
      if (!branchStatsMap.has(branchName)) {
        // 드롭다운에 없는 지사는 새로 추가
        branchStatsMap.set(branchName, {
          branchName,
          tbmCount: 0,
          tbmInspectionCount: 0,
          riskWorkCount: 0,
          cctvUsageCount: 0,
          newWorkersCount: 0
        })
      }

      const stats = branchStatsMap.get(branchName)
      stats.tbmCount++

      // 위험공종 수 계산
      if (record.risk_work_type && record.risk_work_type !== '해당없음') {
        stats.riskWorkCount++
      }

      // CCTV 사용 수 계산 (cctv_usage 필드 직접 확인)
      if (record.cctv_usage && record.cctv_usage.includes('사용중')) {
        stats.cctvUsageCount++
      }

      // 신규인원 명수 합계 계산 (숫자만 추출하여 합산)
      const newWorkersValue = record.new_workers != null ? String(record.new_workers).trim() : ''
      if (newWorkersValue !== '' && newWorkersValue !== '0' && newWorkersValue !== '-') {
        const match = newWorkersValue.match(/\d+/)
        if (match) {
          stats.newWorkersCount += parseInt(match[0], 10)
        }
      }
    })

    // TBM 안전활동 점검 데이터를 통해 확인 수 계산
    tbmSafetyInspections.forEach(inspection => {
      if (inspection.managing_hq !== selectedHq) return

      const branchName = inspection.managing_branch
      if (!branchStatsMap.has(branchName)) {
        branchStatsMap.set(branchName, {
          branchName,
          tbmCount: 0,
          tbmInspectionCount: 0,
          riskWorkCount: 0,
          cctvUsageCount: 0,
          newWorkersCount: 0
        })
      }

      const stats = branchStatsMap.get(branchName)
      // 오늘 날짜의 TBM 안전활동 점검만 카운트
      if (inspection.tbm_date === selectedDate) {
        stats.tbmInspectionCount++
      }
    })

    // 드롭다운 목록 순서에 따라 정렬
    const statsArray = Array.from(branchStatsMap.values())

    return statsArray.sort((a, b) => {
      const aIndex = branchOrder.indexOf(a.branchName)
      const bIndex = branchOrder.indexOf(b.branchName)

      // 드롭다운에 있는 지사는 해당 순서대로, 없는 지사는 맨 뒤에 알파벳순
      if (aIndex === -1 && bIndex === -1) {
        return a.branchName.localeCompare(b.branchName)
      } else if (aIndex === -1) {
        return 1
      } else if (bIndex === -1) {
        return -1
      } else {
        return aIndex - bIndex
      }
    })
  }, [tbmRecords, tbmSafetyInspections, selectedHq, selectedBranch, selectedDate])

  // 현재 분기
  const currentQuarter = React.useMemo(() => {
    const month = new Date().getMonth() + 1
    return Math.ceil(month / 3)
  }, [])

  // 분기 공사중 프로젝트 수: 본부/지사별 집계
  const activeQuarterCountByHq = React.useMemo(() => {
    const map = new Map<string, number>()
      ; (projects || []).forEach((p: any) => {
        const hq = p?.managing_hq
        if (!hq) return
        const ia: any = p?.is_active
        let active = false
        if (typeof ia === 'object' && ia) {
          const key = `q${currentQuarter}`
          active = !!ia[key] && !ia.completed
        } else {
          // 과거 boolean 호환
          active = ia !== false
        }
        if (active) map.set(hq, (map.get(hq) || 0) + 1)
      })
    return map
  }, [projects, currentQuarter])

  const activeQuarterCountByBranch = React.useMemo(() => {
    const map = new Map<string, number>()
      ; (projects || []).forEach((p: any) => {
        const hq = p?.managing_hq
        const br = p?.managing_branch
        if (!hq || !br) return
        const ia: any = p?.is_active
        let active = false
        if (typeof ia === 'object' && ia) {
          const key = `q${currentQuarter}`
          active = !!ia[key] && !ia.completed
        } else {
          active = ia !== false
        }
        if (active) {
          const k = `${hq}||${br}`
          map.set(k, (map.get(k) || 0) + 1)
        }
      })
    return map
  }, [projects, currentQuarter])

  // 현재 분기 공사중 총 지구수 (헤더 통계용)
  const activeQuarterTotal = React.useMemo(() => {
    if (!selectedHq) {
      let sum = 0
      activeQuarterCountByHq.forEach((v) => { sum += v || 0 })
      return sum
    }
    return activeQuarterCountByHq.get(selectedHq) || 0
  }, [activeQuarterCountByHq, selectedHq])

  // 전체 합산 통계 계산
  const totalStats = React.useMemo(() => {
    const filteredRecords = tbmRecords.filter(record => {
      if (selectedHq && record.managing_hq !== selectedHq) return false
      if (selectedBranch && record.managing_branch !== selectedBranch) return false
      return true
    })

    const totalTBM = filteredRecords.length
    const totalRiskWork = filteredRecords.filter(record =>
      record.risk_work_type && record.risk_work_type !== '해당없음'
    ).length
    const totalCCTV = filteredRecords.filter(record =>
      record.cctv_usage && record.cctv_usage.includes('사용중')
    ).length
    // 신규근로자 명수 합계 계산 (숫자만 추출하여 합산)
    const totalNewWorkers = filteredRecords.reduce((sum, record) => {
      const newWorkersValue = record.new_workers != null ? String(record.new_workers).trim() : ''
      if (newWorkersValue === '' || newWorkersValue === '0' || newWorkersValue === '-') {
        return sum
      }
      // 숫자만 추출 (예: "2명" -> 2, "3" -> 3)
      const match = newWorkersValue.match(/\d+/)
      if (match) {
        return sum + parseInt(match[0], 10)
      }
      return sum
    }, 0)

    // TBM확인 수 계산 (해당 지사의 TBM 안전활동 점검 수)
    const totalTBMInspection = selectedBranch
      ? tbmSafetyInspections.filter(inspection =>
        inspection.managing_branch === selectedBranch &&
        inspection.tbm_date === selectedDate
      ).length
      : 0

    return {
      totalTBM,
      totalTBMInspection,
      totalRiskWork,
      totalCCTV,
      totalNewWorkers
    }
  }, [tbmRecords, tbmSafetyInspections, selectedHq, selectedBranch, selectedDate])

  // 동적 높이 및 테이블 행 높이 계산
  const { containerHeight, tableRowHeight } = React.useMemo(() => {
    const isShowingBranchStats = selectedHq && !selectedBranch && branchStats.length > 0
    const isShowingHqStats = !selectedHq && !selectedBranch && hqStats.length > 0

    if (isShowingBranchStats && branchStats.length > 0) {
      // 가용 높이 기반 컨테이너 높이
      const baseHeight = Math.max(600, dynamicContainerHeight)

      // 좌측 지도 프레임의 실제 높이 계산
      // 지도 컨테이너 전체 높이(500px) - 지도 패널 헤더(57px) = 지도 프레임 높이(443px)
      const mapFrameHeight = baseHeight - 57

      // 우측 패널에서 테이블 헤더(49px) 제외한 나머지 공간을 행들로 균등 분배
      // 지도 프레임 높이와 동일하게 맞춤
      // 제목행, 소계행, 데이터 행을 모두 포함하여 계산 (소계행 1개 + 데이터 행 branchStats.length개)
      const totalRows = 1 + branchStats.length + 1 // 제목행 + 소계행 + 데이터 행들
      const availableTableBodyHeight = mapFrameHeight

      // 제목행, 소계행, 데이터 행의 높이를 동일하게 계산
      const calculatedRowHeight = availableTableBodyHeight / totalRows

      return {
        containerHeight: baseHeight,
        tableRowHeight: calculatedRowHeight
      }
    } else if (isShowingHqStats && hqStats.length > 0) {
      // 본부별 통계 표시 시
      const baseHeight = Math.max(600, dynamicContainerHeight)
      const mapFrameHeight = baseHeight - 57
      const availableTableBodyHeight = mapFrameHeight - 49 // 테이블 헤더 49px 제외
      const calculatedRowHeight = availableTableBodyHeight / hqStats.length

      return {
        containerHeight: baseHeight,
        tableRowHeight: calculatedRowHeight
      }
    } else {
      // 기본 높이 (TBM 기록 리스트일 때)
      return {
        containerHeight: Math.max(600, dynamicContainerHeight),
        tableRowHeight: 0 // 사용하지 않음
      }
    }
  }, [selectedHq, selectedBranch, branchStats, hqStats, dynamicContainerHeight])

  // 화면 리사이즈/전체화면 전환 시 가용 높이 재계산
  useEffect(() => {
    const recalc = () => {
      // 데스크톱 레이아웃(전체 지사 보기)에서만 동적 계산 적용
      if (typeof window === 'undefined') return
      if (!gridContainerRef.current) return
      const rect = gridContainerRef.current.getBoundingClientRect()
      // 하단 여백 약간(16px)을 두고 나머지를 모두 사용
      const available = Math.floor(window.innerHeight - rect.top - 16)
      if (!Number.isNaN(available) && available > 0) {
        setDynamicContainerHeight(available)
      }
    }

    // 최초 계산
    recalc()
    // 리사이즈 및 전체화면 변경 이벤트 대응
    window.addEventListener('resize', recalc)
    document.addEventListener('fullscreenchange', recalc)
    return () => {
      window.removeEventListener('resize', recalc)
      document.removeEventListener('fullscreenchange', recalc)
    }
  }, [])

  // 필터/데이터 변화로 레이아웃이 밀릴 수 있으므로 재계산 트리거
  useEffect(() => {
    // 약간의 지연 후 재계산하여 DOM 반영을 기다림
    const t = setTimeout(() => {
      if (gridContainerRef.current) {
        const rect = gridContainerRef.current.getBoundingClientRect()
        const available = Math.floor(window.innerHeight - rect.top - 16)
        if (!Number.isNaN(available) && available > 0) {
          setDynamicContainerHeight(available)
        }
      }
    }, 50)
    return () => clearTimeout(t)
  }, [selectedHq, selectedBranch, branchStats.length, hqStats.length])



  // 전체 데이터를 로드하는 함수 (API 호출)
  const loadAllTBMData = useCallback(async (force = false, resetInterval = false) => {
    // 날짜가 변경되지 않았고 이미 로드가 완료되었으면 스킵 (force가 아닌 경우)
    // 데이터가 비어있어도 로드가 완료되었으면 재조회하지 않음
    const currentDate = selectedDate
    if (!force && lastLoadedParams.current &&
      lastLoadedParams.current.date === currentDate) {
      console.log('동일한 날짜로 이미 전체 데이터 로딩됨. 스킵:', currentDate)
      return
    }

    // 이미 로딩 중이면 중복 실행 방지
    if (loadingRef.current) {
      console.log('이미 로딩 중입니다. 중복 실행 방지.')
      return
    }

    try {
      loadingRef.current = true
      setLoading(true)
      setError('')

      console.log('TBM 전체 데이터 로드 시작:', { selectedDate })

      // 전체 데이터 호출 (본부/지사 필터 없이)
      const [recordsResponse, statsResponse] = await Promise.all([
        getTBMRecords(selectedDate), // hq, branch 파라미터 제거
        getTBMStats(selectedDate)    // hq, branch 파라미터 제거
      ])

      console.log('TBM 전체 기록 응답:', recordsResponse)
      console.log('TBM 전체 통계 응답:', statsResponse)

      if (recordsResponse.success) {
        const allRecords = recordsResponse.records || []
        setAllTbmRecords(allRecords) // 전체 데이터 캐시
        console.log('전체 TBM 데이터 캐시됨:', allRecords.length, '건')
        setError('') // 성공 시 에러 메시지 초기화
      } else {
        console.error('TBM 기록 조회 실패:', recordsResponse.message)
        // API 키 관련 에러는 무시하고 기존 데이터 유지
        if (recordsResponse.message?.includes('API key') || recordsResponse.message?.includes('apikey')) {
          console.warn('API 키 관련 에러이지만 기존 데이터 유지:', recordsResponse.message)
          return // 기존 데이터 유지
        }
        // 기타 에러는 모의 데이터로 폴백
        console.warn('API 실패, 모의 데이터로 대체')
        const { getMockTBMRecords } = await import('@/lib/tbm')
        const mockData = getMockTBMRecords(selectedDate)
        setAllTbmRecords(mockData)
        setError(`API 연결 실패: ${recordsResponse.message}`)
      }

      if (statsResponse.success) {
        // setTbmStats(statsResponse.stats || null) // 통계 사용하지 않음
      } else {
        console.error('TBM 통계 조회 실패:', statsResponse.message)
        // API 실패 시 모의 데이터로 폴백
        // const { getMockTBMStats } = await import('@/lib/tbm')
        // setTbmStats(getMockTBMStats())
      }

      // 로딩 완료 후 파라미터 저장
      lastLoadedParams.current = { date: currentDate, hq: undefined, branch: undefined }
      // setIsInitialized(true) // 사용하지 않음

      // interval 리셋이 요청된 경우 타이머 재시작
      if (resetInterval) {
        startAutoRefresh()
      }

    } catch (err) {
      console.error('TBM 데이터 로드 중 오류:', err)
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [selectedDate])

  // 캐시된 데이터를 필터링하는 함수 (API 호출 없음)
  const filterTBMData = useCallback(() => {
    console.log('캐시된 데이터 필터링 시작:', { selectedDate, selectedHq, selectedBranch, totalRecords: allTbmRecords.length })

    if (selectedHq) {
      console.log('본부 필터 적용:', selectedHq)
      const hqMatches = allTbmRecords.filter(record => record.managing_hq === selectedHq)
      console.log('본부 매칭 레코드:', hqMatches.length, '건')
    }

    if (selectedBranch) {
      console.log('지사 필터 적용:', selectedBranch)
      const branchMatches = allTbmRecords.filter(record => record.managing_branch === selectedBranch)
      console.log('지사 매칭 레코드:', branchMatches.length, '건')
    }

    const filteredRecords = allTbmRecords.filter(record => {
      // 날짜 필터링: meeting_date와 selectedDate 비교
      const recordDate = record.meeting_date ? new Date(record.meeting_date).toISOString().split('T')[0] : ''
      const dateMatch = !selectedDate || recordDate === selectedDate

      // 본부/지사 필터링
      const hqMatch = !selectedHq || record.managing_hq === selectedHq
      const branchMatch = !selectedBranch || record.managing_branch === selectedBranch

      if (selectedHq || selectedBranch || selectedDate) {
        console.log(`레코드 ${record.project_name}: 날짜(${recordDate}) vs 선택(${selectedDate}) = ${dateMatch}, 본부(${record.managing_hq}) vs 선택(${selectedHq}) = ${hqMatch}, 지사(${record.managing_branch}) vs 선택(${selectedBranch}) = ${branchMatch}`)
      }

      return dateMatch && hqMatch && branchMatch
    })

    console.log('최종 필터링 결과:', filteredRecords.length, '건')
    setTbmRecords(filteredRecords)
  }, [allTbmRecords, selectedDate, selectedHq, selectedBranch])

  // 자동 새로고침 중지 함수
  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      console.log('TBM 자동 새로고침 타이머 중지')
    }
  }, [])

  // 프로그레스 타이머 중지 함수
  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
      console.log('TBM 프로그레스 타이머 중지')
    }
  }, [])

  // 세션 체크 함수
  const checkSession = useCallback(async () => {
    const retry = async (times: number, delayMs: number): Promise<boolean> => {
      for (let i = 0; i < times; i++) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) return true
        } catch { }
        await new Promise(res => setTimeout(res, delayMs))
      }
      return false
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) return true

      // 즉시 세션이 없으면 짧게 재시도 (토큰 자동갱신/회전 타이밍 보호)
      const ok = await retry(3, 1000)
      if (!ok) {
        console.log('세션 없음으로 판단되어 자동 새로고침 중지 및 로그인 페이지로 이동')
        stopAutoRefresh()
        stopProgressTimer()
        window.location.href = '/login'
        return false
      }
      return true
    } catch (error) {
      console.error('세션 체크 중 오류:', error)
      return false
    }
  }, [stopAutoRefresh, stopProgressTimer, supabase])

  // TBM 안전활동 점검 데이터 로드 함수
  const loadTbmSafetyInspections = useCallback(async () => {
    // 안전현황 페이지(/safe)에서는 TBM 데이터를 로드하지 않음
    if (pathname && pathname.startsWith('/safe')) {
      console.log('안전현황 페이지에서는 TBM 안전활동 점검 데이터 로드 스킵:', pathname)
      return
    }

    try {
      const { data, error } = await supabase
        .from('tbm_safety_inspections')
        .select(`
          *,
          projects!inner (
            managing_hq,
            managing_branch
          )
        `)
        .eq('tbm_date', selectedDate)
        .order('tbm_date', { ascending: false })

      if (error) {
        console.error('TBM 안전활동 점검 데이터 조회 오류:', error)
        setTbmSafetyInspections([])
        return
      }

      // 데이터 변환
      const transformedInspections: TBMSafetyInspection[] = (data || []).map((item: any) => ({
        id: item.id,
        project_id: item.project_id,
        managing_hq: item.projects?.managing_hq,
        managing_branch: item.projects?.managing_branch,
        tbm_date: item.tbm_date,
        // 필요한 필드만 포함
      } as TBMSafetyInspection))

      setTbmSafetyInspections(transformedInspections)
    } catch (err) {
      console.error('TBM 안전활동 점검 데이터 로드 중 오류:', err)
      setTbmSafetyInspections([])
    }
  }, [selectedDate, pathname])

  // 메인 데이터 로드 함수
  const loadTBMData = useCallback(async (force = false, resetInterval = false) => {
    // 세션 체크 먼저 수행
    const hasValidSession = await checkSession()
    if (!hasValidSession) {
      return
    }

    // 1. 먼저 전체 데이터 로드 (필요한 경우만)
    await loadAllTBMData(force, resetInterval)

    // 2. 그 다음 필터링 적용
    filterTBMData()
  }, [loadAllTBMData, filterTBMData, checkSession])

  // 프로그레스 타이머 시작 함수
  const startProgressTimer = useCallback(() => {
    // 기존 타이머 정리
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
    }

    // 프로그레스 바 초기화
    setTimeRemaining(15 * 60) // 15분 = 900초
    setProgressPercentage(100)

    // 초기화는 useEffect에서 별도로 처리하므로 여기서는 호출하지 않음

    // 1초마다 업데이트
    progressTimerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1
        if (newTime <= 0) {
          // 타이머 완료 시 데이터 새로고침 실행
          checkSession().then(async (hasValidSession) => {
            if (hasValidSession) {
              try {
                await loadAllTBMData(true, false)
                filterTBMData()
                // TBM 확인 컬럼 데이터도 함께 새로고침
                await loadTbmSafetyInspections()
              } catch (error) {
                console.error('프로그레스 타이머 새로고침 중 오류:', error)
              }
            }
          })
          // 타이머 재시작
          setTimeRemaining(15 * 60)
          setProgressPercentage(100)
          // ref를 통해 최신 콜백 호출 (비동기로 처리하여 렌더링 중 호출 방지)
          if (onProgressUpdateRef.current) {
            requestAnimationFrame(() => {
              if (onProgressUpdateRef.current) {
                onProgressUpdateRef.current(100, 15 * 60)
              }
            })
          }
          return 15 * 60
        }

        // 퍼센테지 업데이트 (15분 = 900초 기준)
        const percentage = (newTime / (15 * 60)) * 100
        setProgressPercentage(percentage)
        // Dashboard로 프로그레스 업데이트 전달 (비동기로 처리하여 렌더링 중 호출 방지)
        if (onProgressUpdateRef.current) {
          requestAnimationFrame(() => {
            if (onProgressUpdateRef.current) {
              onProgressUpdateRef.current(percentage, newTime)
            }
          })
        }

        return newTime
      })
    }, 1000)

    console.log('TBM 프로그레스 타이머 시작 (15분 간격)')
  }, [loadAllTBMData, filterTBMData, loadTbmSafetyInspections, checkSession])

  // 자동 새로고침 시작 함수
  const startAutoRefresh = useCallback(() => {
    // 기존 interval 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // 15분(900000ms)마다 데이터 새로고침
    intervalRef.current = setInterval(async () => {
      console.log('TBM 데이터 자동 새로고침 실행')

      // 세션 체크 먼저 수행
      const hasValidSession = await checkSession()
      if (!hasValidSession) {
        return
      }

      try {
        await loadAllTBMData(true, false) // force=true, resetInterval=false
        filterTBMData() // 새로고침 후 현재 필터 적용
        // TBM 확인 컬럼 데이터도 함께 새로고침
        await loadTbmSafetyInspections()
      } catch (error) {
        console.error('자동 새로고침 중 오류:', error)
      }
    }, 15 * 60 * 1000) // 15분

    console.log('TBM 자동 새로고침 타이머 시작 (15분 간격)')
  }, [loadAllTBMData, filterTBMData, loadTbmSafetyInspections, checkSession])

  // TBM 안전활동 점검 데이터 로드 (날짜 변경 시)
  useEffect(() => {
    loadTbmSafetyInspections()
  }, [loadTbmSafetyInspections])

  // 초기 TBM 데이터 로드 (날짜가 변경되거나 최초 로드 시에만)
  const lastSelectedDateRef = useRef<string>('')
  useEffect(() => {
    // 안전현황 페이지(/safe)에서는 TBM 데이터를 로드하지 않음
    if (pathname && pathname.startsWith('/safe')) {
      console.log('안전현황 페이지에서는 TBM 데이터 로드 스킵:', pathname)
      return
    }

    // 동일한 날짜면 중복 실행 방지 (데이터가 비어있어도 이미 로드되었으면 재조회하지 않음)
    if (lastSelectedDateRef.current === selectedDate) {
      console.log('동일한 날짜로 이미 데이터 로딩됨. 스킵:', selectedDate)
      return
    }
    lastSelectedDateRef.current = selectedDate

    // 이미 로딩 중이면 중복 실행 방지
    if (loadingRef.current) {
      console.log('이미 로딩 중입니다. 중복 실행 방지.')
      return
    }

    loadTBMData()
  }, [selectedDate, loadTBMData, pathname])

  // 본부/지사 선택이 변경될 때는 캐시된 데이터만 필터링
  useEffect(() => {
    // 안전현황 페이지(/safe)에서는 필터링 실행하지 않음
    if (pathname && pathname.startsWith('/safe')) {
      return
    }

    if (allTbmRecords.length > 0) {
      console.log('본부/지사 변경으로 인한 필터링 실행')
      filterTBMData()
    }
  }, [selectedHq, selectedBranch, filterTBMData, pathname, allTbmRecords.length])

  // 컴포넌트 마운트 시 자동 새로고침과 프로그레스 타이머 시작
  useEffect(() => {
    // 안전현황 페이지(/safe)에서는 타이머 시작하지 않음
    if (pathname && pathname.startsWith('/safe')) {
      return
    }

    startAutoRefresh()
    startProgressTimer()

    // 초기 프로그레스 바 업데이트는 다음 프레임에 실행 (렌더링 중 호출 방지)
    // setTimeout보다 requestAnimationFrame이 렌더링 완료 후 실행을 더 잘 보장할 수 있음
    const rafId = requestAnimationFrame(() => {
      if (onProgressUpdateRef.current) {
        onProgressUpdateRef.current(100, 15 * 60)
      }
    })

    // cleanup: 컴포넌트 언마운트 시 interval 정리
    return () => {
      cancelAnimationFrame(rafId)
      stopAutoRefresh()
      stopProgressTimer()
    }
  }, [startAutoRefresh, stopAutoRefresh, startProgressTimer, stopProgressTimer, pathname])

  // 페이지 visibility 변경 감지 (탭 전환, 창 최소화 등)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // 페이지가 비활성화되면 타이머 중지
        console.log('페이지 비활성화 - TBM 자동 새로고침 중지')
        stopAutoRefresh()
        stopProgressTimer()
      } else {
        // 페이지가 다시 활성화되면 세션 체크 후 타이머 재시작
        console.log('페이지 활성화 - 세션 체크 후 TBM 자동 새로고침 재시작')
        const hasValidSession = await checkSession()
        if (hasValidSession) {
          startAutoRefresh()
          startProgressTimer()
          // 초기 프로그레스 바 업데이트는 다음 프레임에 실행 (렌더링 중 호출 방지)
          setTimeout(() => {
            if (onProgressUpdateRef.current) {
              onProgressUpdateRef.current(100, 15 * 60)
            }
          }, 0)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [startAutoRefresh, stopAutoRefresh, startProgressTimer, stopProgressTimer, checkSession])

  // 인포창 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (infoModal.isOpen) {
        const target = event.target as HTMLElement
        // 인포창 내부 클릭이 아니면 닫기
        if (!target.closest('.info-modal')) {
          handleCloseInfoModal()
        }
      }
    }

    if (infoModal.isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [infoModal.isOpen])

  const handleMapProjectClick = (project: any) => {
    // TBM에서는 지사 선택만 수행하고 프로젝트 대시보드로는 이동하지 않음
    console.log('마커 클릭된 프로젝트:', project)
    console.log('현재 selectedHq:', selectedHq, 'selectedBranch:', selectedBranch)

    // 지사 단위 TBM 보기에서 마커 클릭 시 네비게이션 모달 표시
    if (selectedBranch && project.address) {
      console.log('지사 단위 TBM에서 마커 클릭 - 네비게이션 모달 표시:', project.address)
      setNavigationModal({
        isOpen: true,
        address: project.address
      })
      return
    }

    // 전체 본부 뷰에서 마커 클릭 시, 본부와 지사를 순차적으로 선택
    if (!selectedHq && project.managingHq && project.managingBranch && onHqSelect && onBranchSelect) {
      console.log('전체 본부 뷰에서 본부 선택:', project.managingHq)
      onHqSelect(project.managingHq)

      // 본부 선택 후 지사 선택을 지연시켜 상태 업데이트 완료 후 실행
      setTimeout(() => {
        console.log('지도 마커 클릭으로 지사 선택:', project.managingBranch)
        onBranchSelect(project.managingBranch)

        // 상태 업데이트 완료 후 필터링 재실행 (현재 상태값이 아닌 클릭된 프로젝트 정보 사용)
        setTimeout(() => {
          if (allTbmRecords.length > 0) {
            console.log('마커 클릭 후 명시적 필터링 실행 - 특정 지사:', project.managingBranch)
            const filteredRecords = allTbmRecords.filter(record => {
              return record.managing_hq === project.managingHq && record.managing_branch === project.managingBranch
            })
            console.log('명시적 필터링 결과:', filteredRecords.length, '건')
            setTbmRecords(filteredRecords)
          }
        }, 200)
      }, 100)
    } else if (selectedHq && !selectedBranch && project.managingBranch && onBranchSelect) {
      // 본부만 선택된 상태(지사 미선택)에서는 지사만 선택
      console.log('본부 선택된 상태에서 지사 선택:', project.managingBranch)
      onBranchSelect(project.managingBranch)
    }
  }

  const handleTBMRecordClick = (record: TBMRecord) => {
    // 삭제 모드일 때는 선택/해제 토글
    if (deleteMode) {
      toggleDeleteSelection(record.id)
      return
    }

    console.log('TBM 기록 클릭:', record)
    console.log('클릭한 project_id:', record.project_id)
    console.log('현재 지도에 있는 프로젝트들:', projectsForMap)

    // 해당 프로젝트가 지도에 있는지 확인
    const matchingProject = projectsForMap.find(p => p.id === record.project_id)
    if (matchingProject) {
      console.log('매칭된 프로젝트 찾음:', matchingProject)
      setFocusedProjectId(record.project_id)
    } else {
      console.log('매칭되는 프로젝트를 지도에서 찾을 수 없음')
      console.log('지도 프로젝트 IDs:', projectsForMap.map(p => p.id))
      console.log('클릭한 record의 project_id:', record.project_id)
    }
  }

  // 삭제 선택 토글
  const toggleDeleteSelection = (recordId: string) => {
    setSelectedForDeletion(prev => {
      const newSet = new Set(prev)
      if (newSet.has(recordId)) {
        newSet.delete(recordId)
      } else {
        newSet.add(recordId)
      }
      return newSet
    })
  }

  // 삭제 모드 종료
  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelectedForDeletion(new Set())
  }

  // 선택된 TBM 레코드 삭제
  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0) {
      alert('삭제할 항목을 선택해주세요.')
      return
    }

    const confirmDelete = confirm(`선택한 ${selectedForDeletion.size}건의 TBM 제출을 삭제하시겠습니까?`)
    if (!confirmDelete) return

    setIsDeleting(true)
    try {
      const idsToDelete = Array.from(selectedForDeletion)

      // 삭제 대상의 교육사진 및 서명 URL 조회
      const { data: photoRows } = await supabase
        .from('tbm_submissions')
        .select('education_photo_url, signature_url')
        .in('id', idsToDelete)

      // Storage에서 사진 및 서명 파일 삭제
      if (photoRows && photoRows.length > 0) {
        const marker = '/object/public/tbm-photos/'
        const filePaths = photoRows
          .flatMap(r => [r.education_photo_url, r.signature_url])
          .filter((url): url is string => !!url)
          .map(url => {
            const idx = url.indexOf(marker)
            return idx !== -1 ? url.substring(idx + marker.length) : null
          })
          .filter((p): p is string => !!p)

        if (filePaths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from('tbm-photos')
            .remove(filePaths)
          if (storageError) {
            console.error('파일 삭제 오류:', storageError)
          }
        }
      }

      const { error } = await supabase
        .from('tbm_submissions')
        .delete()
        .in('id', idsToDelete)

      if (error) {
        console.error('삭제 오류:', error)
        alert('삭제 중 오류가 발생했습니다.')
        return
      }

      // 로컬 상태에서도 제거
      setTbmRecords(prev => prev.filter(r => !selectedForDeletion.has(r.id)))
      setAllTbmRecords(prev => prev.filter(r => !selectedForDeletion.has(r.id)))

      alert(`${selectedForDeletion.size}건이 삭제되었습니다.`)
      exitDeleteMode()
    } catch (err) {
      console.error('삭제 실패:', err)
      alert('삭제에 실패했습니다.')
    } finally {
      setIsDeleting(false)
    }
  }

  // 빈 공간 클릭 시 전체뷰로 복귀
  const handleContainerClick = (e: React.MouseEvent) => {
    // 포커스된 프로젝트가 있을 때만 처리
    if (!focusedProjectId) return

    const target = e.target as HTMLElement

    // 클릭된 요소가 다음 중 하나라면 전체뷰로 복귀하지 않음
    const interactiveElements = [
      'tr', 'button', 'a', 'input', 'select', 'textarea',
      '.info-modal', 'svg', 'path', 'circle'
    ]

    const shouldNotReset = interactiveElements.some(selector => target.closest(selector))

    if (!shouldNotReset) {
      console.log('빈 공간 클릭 - 전체뷰로 복귀')
      setFocusedProjectId(undefined)
    }
  }


  const handleBranchClick = (branchName: string) => {
    console.log('지사 클릭:', branchName)
    if (onBranchSelect) {
      onBranchSelect(branchName)
    }
  }

  const handleHqClick = (hqName: string) => {
    console.log('본부 클릭:', hqName)
    if (onHqSelect) {
      onHqSelect(hqName)
    }
  }

  const handleBranchRowMouseEnter = (branchName: string) => {
    setHoveredBranchName(branchName)
  }
  const handleBranchRowMouseLeave = () => {
    setHoveredBranchName(undefined)
  }

  const handleHqRowMouseEnter = (hqName: string) => {
    setHoveredHqName(hqName)
  }
  const handleHqRowMouseLeave = () => {
    setHoveredHqName(undefined)
  }

  const handleCellClick = async (title: string, content: string, projectName: string, event: React.MouseEvent) => {
    event.stopPropagation() // 행 클릭 이벤트 방지

    // 보고서 모드가 활성화되어 있고 사업명 클릭인 경우
    if (reportModeActive && title === '사업명') {
      try {
        // tbm_submissions 테이블에서 해당 프로젝트의 데이터 조회
        const { data: tbmSubmissions, error } = await supabase
          .from('tbm_submissions')
          .select('*')
          .eq('project_name', projectName)
          .gte('meeting_date', reportStartDate)
          .lte('meeting_date', reportEndDate)
          .order('meeting_date', { ascending: true })

        if (error) {
          console.error('TBM 데이터 조회 오류:', error)
          alert('데이터 조회 중 오류가 발생했습니다.')
          return
        }

        if (!tbmSubmissions || tbmSubmissions.length === 0) {
          alert(`선택한 기간(${reportStartDate} ~ ${reportEndDate})에\n"${projectName}" 사업의 TBM 제출 내역이 없습니다.`)
          return
        }

        // tbm_submissions에서 위경도 가져오기 (첫날부터 순차적으로 확인)
        let latitude: number | undefined
        let longitude: number | undefined
        for (const submission of tbmSubmissions) {
          if (submission.latitude && submission.longitude) {
            latitude = submission.latitude
            longitude = submission.longitude
            break
          }
        }

        // 데이터 저장 후 서명 모달 표시
        setPendingReportData({
          projectName,
          tbmSubmissions,
          latitude,
          longitude
        })
        setShowSignatureModal(true)
      } catch (error) {
        console.error('데이터 조회 오류:', error)
        alert('데이터 조회 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
      }
      return
    }

    if (!content || content === '-') return // 내용이 없으면 인포창을 표시하지 않음

    const rect = event.currentTarget.getBoundingClientRect()
    const scrollY = window.scrollY

    setInfoModal({
      isOpen: true,
      title: projectName,
      content: `${title}\n${content}`,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top + scrollY - 10 // 셀 위쪽에 표시
      }
    })
  }

  const handleCloseInfoModal = () => {
    setInfoModal(prev => ({ ...prev, isOpen: false }))
  }

  const handleAddressClick = (address: string) => {
    setNavigationModal({
      isOpen: true,
      address
    })
  }

  const handleNavigationModalClose = () => {
    setNavigationModal({
      isOpen: false,
      address: ''
    })
  }

  const openKakaoMap = (address: string) => {
    window.open(`https://map.kakao.com/link/search/${encodeURIComponent(address)}`)
    handleNavigationModalClose()
  }

  const openTMap = (address: string) => {
    window.open(`https://apis.openapi.sk.com/tmap/app/poi?appKey=hTKnKnSYyD4ljeMriScKD4M74VX1Nm6S7KRbyLfw&name=${encodeURIComponent(address)}`)
    handleNavigationModalClose()
  }

  const openNaverMap = (address: string) => {
    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`)
    handleNavigationModalClose()
  }

  const handleManualRefresh = useCallback(async () => {
    console.log('수동 새로고침 실행 - interval 리셋')

    // 세션 체크 먼저 수행
    const hasValidSession = await checkSession()
    if (!hasValidSession) {
      return
    }

    try {
      await loadAllTBMData(true, true) // force=true, resetInterval=true
      filterTBMData() // 새로고침 후 현재 필터 적용
      // TBM 확인 컬럼 데이터도 함께 새로고침
      await loadTbmSafetyInspections()
      // 프로그레스 타이머도 리셋
      startProgressTimer()
    } catch (error) {
      console.error('수동 새로고침 중 오류:', error)
    }
  }, [checkSession, loadAllTBMData, filterTBMData, loadTbmSafetyInspections, startProgressTimer])

  // handleManualRefresh 함수를 부모 컴포넌트에 전달
  useEffect(() => {
    if (onManualRefreshReady) {
      onManualRefreshReady(handleManualRefresh)
    }
  }, [onManualRefreshReady, handleManualRefresh])

  // 프로젝트 테이블 좌우 스크롤 감지
  useEffect(() => {
    // 지사 선택 변경 시 스크롤 상태 초기화
    setIsProjectTableScrolled(false)
  }, [selectedBranch])

  const handleProjectTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft
    setIsProjectTableScrolled(scrollLeft > 0)
  }

  // 시간을 MM:SS 형태로 포맷하는 함수
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // 행 높이에 맞춘 멀티라인 클램프 처리를 위한 참조 및 계산 상태
  const workRefs = React.useRef<Record<string, HTMLSpanElement | null>>({})
  const eduRefs = React.useRef<Record<string, HTMLSpanElement | null>>({})
  const [rowClampLines, setRowClampLines] = React.useState<Record<string, number>>({})

  // TBM 레코드 변경 시, 각 행의 기준 높이(작업내용/교육내용 중 더 큰 높이)를 측정하여
  // 같은 행의 '투입인원'과 '투입장비'에 적용할 클램프 라인 수를 계산
  React.useEffect(() => {
    if (!tbmRecords || tbmRecords.length === 0) {
      setRowClampLines({})
      return
    }

    // 다음 페인트 후에 측정되도록
    const raf = requestAnimationFrame(() => {
      const next: Record<string, number> = {}
      for (const record of tbmRecords) {
        const workEl = workRefs.current[record.id]
        const eduEl = eduRefs.current[record.id]

        // 기준 엘리먼트: 우선순위 작업내용 > 교육내용
        const baseEl = workEl || eduEl
        const workH = workEl ? workEl.clientHeight : 0
        const eduH = eduEl ? eduEl.clientHeight : 0
        const maxH = Math.max(workH, eduH)

        if (baseEl && maxH > 0) {
          const cs = window.getComputedStyle(baseEl)
          const lhStr = cs.lineHeight
          let lineHeightPx = 20 // 안전 기본값
          if (lhStr.endsWith('px')) {
            const parsed = parseFloat(lhStr)
            if (!Number.isNaN(parsed)) lineHeightPx = parsed
          }
          const lines = Math.max(1, Math.floor(maxH / lineHeightPx))
          next[record.id] = lines
        } else {
          // 측정 불가 시 기본 2줄로 제한
          next[record.id] = 2
        }
      }
      setRowClampLines(next)
    })

    return () => cancelAnimationFrame(raf)
  }, [tbmRecords])

  // 안전현황 페이지(/safe)에서는 렌더링하지 않음
  if (pathname && pathname.startsWith('/safe')) {
    return null
  }

  return (
    <div
      className={selectedBranch ? "space-y-2" : "space-y-6"}
      onClick={handleContainerClick}
    >



      {/* 특정 지사 선택 시 레이아웃: 모바일에서는 세로 배치, 데스크톱에서는 가로 배치 */}
      {selectedHq && selectedBranch && (
        <div className="space-y-2">
          {/* 모바일: 통계 카드들을 상단에 1줄 수평 배치 */}
          <div className="lg:hidden">
            <div className="grid grid-cols-7 gap-1">
              <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <Activity className="h-5 w-5 text-green-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 leading-tight">
                    {currentQuarter}분기<br />공사중<br />
                    <span className="text-sm font-semibold text-gray-900">{loading ? '-' : activeQuarterTotal}</span><br />
                    지구
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <Activity className="h-5 w-5 text-blue-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">TBM수</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {loading ? '-' : totalStats.totalTBM}건
                  </p>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg shadow-sm border border-purple-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <CheckCircle className="h-5 w-5 text-purple-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">TBM확인</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {loading ? '-' : (
                      <>
                        {totalStats.totalTBMInspection}건
                        <span className="text-xs font-normal text-gray-600">
                          {' '}({totalStats.totalTBM > 0
                            ? `${Math.round((totalStats.totalTBMInspection / totalStats.totalTBM) * 100)}%`
                            : '0%'})
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <Users className="h-5 w-5 text-green-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">신규근로자</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {loading ? '-' : totalStats.totalNewWorkers === 0 ? '-' : `${totalStats.totalNewWorkers}명`}
                  </p>
                </div>
              </div>

              <div className="bg-red-50 rounded-lg shadow-sm border border-red-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <AlertTriangle className="h-5 w-5 text-red-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">위험공종</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {loading ? '-' : totalStats.totalRiskWork}건
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <Video className="h-5 w-5 text-blue-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    CCTV<br />사용
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {loading ? '-' : totalStats.totalCCTV}지구
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-2">
                <div className="flex flex-col items-center justify-center text-center">
                  <Eye className="h-5 w-5 text-blue-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">도입율</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {loading ? '-' : totalStats.totalTBM > 0 ? `${Math.round((totalStats.totalCCTV / totalStats.totalTBM) * 100)}%` : '0%'}
                  </p>
                </div>
              </div>
            </div>
          </div>


          {/* 데스크톱: 상단 가로 배치 (1:1 비율) */}
          <div className="hidden lg:grid grid-cols-2 gap-3">
            {/* 우측 1/2: 지도 (좌우 바꿈) */}
            <div className="col-span-1 order-2 lg:-mt-[9rem]">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                <div className="relative flex-1" style={{ height: 'calc(9rem + 140px + 45px + 57px)' }}>
                  {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <p className="mt-2 text-xs text-gray-600">로딩중...</p>
                    </div>
                  ) : projectsForMap.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                      <div className="text-center">
                        <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h5 className="text-sm font-medium text-gray-900 mb-2">
                          {selectedBranch} 지역에 현장이 없습니다
                        </h5>
                        <p className="text-xs text-gray-600">
                          해당 지사에 등록된 현장이 없습니다.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <KakaoMap
                    projects={projectsForMap}
                    offices={offices}
                    onProjectClick={handleMapProjectClick}
                    height="100%"
                    className="w-full h-full"
                    focusedProjectId={focusedProjectId}
                    showRadar={false}
                    disableHover={!!selectedBranch}
                    showLegend={true}
                    key={`small-map-${selectedBranch}-${projectsForMap.length}`}
                  />
                </div>
              </div>
            </div>

            {/* 좌측 1/2: 통계 카드들 (1줄 수평 배치, 좌우 바꿈) */}
            <div className="col-span-1 order-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                <div className="p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <Activity className="h-4 w-4 mr-2 text-blue-600" />
                    {selectedBranch} 통계
                  </h4>
                </div>
                <div className="grid grid-cols-7 gap-0 flex-1" style={{ height: '140px' }}>
                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <Activity className="h-8 w-8 text-green-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">{currentQuarter}분기 공사중</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : `${activeQuarterTotal}지구`}
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <Activity className="h-8 w-8 text-blue-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">TBM 수</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalTBM}건
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <CheckCircle className="h-8 w-8 text-purple-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">TBM확인</p>
                    <p className="text-lg font-semibold text-gray-900 text-center">
                      {loading ? '-' : (
                        <>
                          {totalStats.totalTBMInspection}건
                          <span className="text-sm font-normal text-gray-600">
                            {' '}({totalStats.totalTBM > 0
                              ? `${Math.round((totalStats.totalTBMInspection / totalStats.totalTBM) * 100)}%`
                              : '0%'})
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <Users className="h-8 w-8 text-green-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">신규근로자</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalNewWorkers === 0 ? '-' : `${totalStats.totalNewWorkers}명`}
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <AlertTriangle className="h-8 w-8 text-red-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">위험공종수</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalRiskWork}건
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <Video className="h-8 w-8 text-blue-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">CCTV 사용수</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalCCTV}지구
                    </p>
                  </div>

                  <div className="bg-white flex flex-col items-center justify-start pt-4 px-3 pb-3">
                    <Eye className="h-8 w-8 text-blue-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">CCTV 도입율</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalTBM > 0 ? `${Math.round((totalStats.totalCCTV / totalStats.totalTBM) * 100)}%` : '0%'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 상세 TBM 테이블 - 전체 가로폭 사용 (모바일에서 먼저 표시) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">
                {selectedBranch}
              </h4>
              <div className="flex items-center gap-2">
                {/* 삭제 모드 버튼 */}
                {deleteMode ? (
                  <>
                    <button
                      type="button"
                      onClick={exitDeleteMode}
                      className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-500 text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 shadow-sm"
                      title="삭제 모드 종료"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      disabled={isDeleting || selectedForDeletion.size === 0}
                      className={`inline-flex items-center justify-center p-1.5 rounded-md shadow-sm ${selectedForDeletion.size > 0
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      title={selectedForDeletion.size > 0 ? `${selectedForDeletion.size}건 삭제` : '삭제할 항목을 선택하세요'}
                    >
                      <Trash2 className="h-4 w-4" />
                      {selectedForDeletion.size > 0 && (
                        <span className="ml-1 text-xs">{selectedForDeletion.size}</span>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        // 새 플로우: 사업명 선택 모달 열기
                        setShowProjectSelectionModal(true)
                        // 초기화
                        setSelectedProjectForReport(null)
                        setTbmSubmissionDates([])
                        setReportStartDate('')
                        setReportEndDate(selectedDate) // 기본 종료일은 TBM 선택 날짜
                        setUseAI(true)
                        setSupervisorName('')
                        setSupervisorSignature('')
                      }}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-md hover:shadow-lg transition-all text-xs font-semibold"
                      title="AI공감일지 다운로드"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="hidden lg:inline ml-1.5">AI공감일지</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteMode(true)}
                      className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-sm transition-colors"
                      title="삭제 모드"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs text-gray-600 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                {selectedBranch && userProfile?.branch_division?.endsWith('본부') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onBranchSelect) {
                        onBranchSelect('')
                      }
                    }}
                    className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                    title="상위로 이동"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div onScroll={handleProjectTableScroll} className="overflow-x-auto lg:overflow-x-visible max-h-96 lg:max-h-none overflow-y-auto">
              <table className="w-full divide-y divide-gray-200 lg:table-fixed lg:min-w-full">
                <thead className="sticky top-0 z-10 bg-gray-100/90 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                  <tr>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16 lg:w-[5%] border-r border-gray-100">No</th>
                    <th className={`sticky left-0 lg:static z-20 px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[8%] bg-gray-100/90 lg:bg-transparent transition-all duration-200 ${isProjectTableScrolled ? 'border-r-2 border-r-gray-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]' : 'border-r border-r-gray-100'} lg:border-r lg:border-r-gray-100 lg:shadow-none`}>사업명</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px] lg:min-w-0 lg:w-[6%] border-r border-gray-100">사진</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] lg:min-w-0 lg:w-[23%] border-r border-gray-100">작업내용</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] lg:min-w-0 lg:w-[23%] border-r border-gray-100">교육내용</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] lg:min-w-0 lg:w-[12%] border-r border-gray-100">회사명</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[8%] border-r border-gray-100">주소</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[6%] border-r border-gray-100">투입인원</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[6%] border-r border-gray-100">투입장비</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] lg:min-w-0 lg:w-[8%] border-r border-gray-100">위험공종</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] lg:min-w-0 lg:w-[8%]">소장이름</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center" style={{ height: '200px' }}>
                        <div className="flex flex-col items-center justify-center h-full">
                          <LoadingSpinner />
                          <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                        </div>
                      </td>
                    </tr>
                  ) : tbmRecords.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center">
                          <Activity className="h-12 w-12 text-gray-400 mb-4" />
                          <h5 className="text-lg font-medium text-gray-900 mb-2">
                            {selectedBranch}에 TBM 기록이 없습니다
                          </h5>
                          <p className="text-gray-600">
                            선택한 날짜({selectedDate})에 등록된 TBM 기록이 없습니다.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    tbmRecords.map((record, index) => (
                      <tr
                        key={record.id}
                        className={`cursor-pointer transition-colors align-top ${deleteMode && selectedForDeletion.has(record.id)
                          ? 'bg-red-100 hover:bg-red-200'
                          : deleteMode
                            ? 'odd:bg-white even:bg-gray-50 hover:bg-red-50'
                            : 'odd:bg-white even:bg-gray-50 hover:bg-blue-50/50'
                          }`}
                        onClick={() => handleTBMRecordClick(record)}
                      >
                        <td className="px-1 py-2 text-sm font-medium text-gray-900 text-center border-r border-gray-100">
                          {deleteMode && (
                            <input
                              type="checkbox"
                              checked={selectedForDeletion.has(record.id)}
                              onChange={() => toggleDeleteSelection(record.id)}
                              className="mr-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {index + 1}
                        </td>
                        <td className={`sticky left-0 lg:static z-10 px-1 py-2 text-sm font-medium text-gray-900 bg-white transition-all duration-200 ${isProjectTableScrolled ? 'border-r-2 border-r-gray-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]' : 'border-r border-r-gray-100'} lg:border-r lg:border-r-gray-100 lg:shadow-none`}>
                          <div
                            className="max-w-[80px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5"
                            onClick={(e) => handleCellClick('사업명', record.project_name, record.project_name, e)}
                          >
                            <div className="lg:hidden">
                              <div className="truncate">
                                {(() => {
                                  const textOnly = record.project_name.replace(/\s/g, '');
                                  if (textOnly.length > 4) {
                                    let count = 0;
                                    let result = '';
                                    for (let char of record.project_name) {
                                      if (char !== ' ') count++;
                                      result += char;
                                      if (count === 4) break;
                                    }
                                    return result + '...';
                                  }
                                  return record.project_name;
                                })()}
                              </div>
                              {record.cctv_usage && record.cctv_usage.includes('사용중') && (
                                <div className="text-center mt-1">
                                  <span className="text-xs text-gray-900 font-medium">(CCTV)</span>
                                </div>
                              )}
                            </div>
                            <div className="hidden lg:block">
                              <div className="whitespace-pre-wrap leading-tight">
                                {(() => {
                                  const textOnly = record.project_name.replace(/\s/g, '');
                                  if (textOnly.length > 4) {
                                    let count = 0;
                                    let result = '';
                                    for (let char of record.project_name) {
                                      if (char !== ' ') count++;
                                      result += char;
                                      if (count === 4) break;
                                    }
                                    return result + '...';
                                  }
                                  return record.project_name;
                                })()}
                              </div>
                              {record.cctv_usage && record.cctv_usage.includes('사용중') && (
                                <div className="text-center mt-1">
                                  <span className="text-xs text-gray-900 font-medium">(CCTV)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-1 py-1 text-center border-r border-gray-100">
                          {record.education_photo_url ? (
                            <a href={record.education_photo_url} target="_blank" rel="noopener noreferrer" title="교육사진 보기">
                              <img
                                src={record.education_photo_url}
                                alt="교육사진"
                                className="w-14 h-14 lg:w-20 lg:h-20 object-cover rounded border border-gray-200 mx-auto cursor-pointer hover:opacity-80 transition-opacity"
                                loading="lazy"
                              />
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="max-w-[150px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden"
                            onClick={(e) => handleCellClick('작업내용', record.today_work, record.project_name, e)}
                          >
                            <span className="lg:hidden block truncate">{record.today_work}</span>
                            <span
                              ref={(el) => { workRefs.current[record.id] = el }}
                              className="hidden lg:block whitespace-pre-wrap leading-tight"
                            >
                              {record.today_work}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="max-w-[150px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden"
                            onClick={(e) => handleCellClick('교육내용', record.education_content || '-', record.project_name, e)}
                          >
                            <span className="lg:hidden block truncate">{record.education_content || '-'}</span>
                            <span
                              ref={(el) => { eduRefs.current[record.id] = el }}
                              className="hidden lg:block whitespace-pre-wrap leading-tight"
                            >
                              {record.education_content || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="max-w-[120px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden"
                            onClick={(e) => handleCellClick('회사명', record.construction_company, record.project_name, e)}
                          >
                            <span className="lg:hidden block truncate">{record.construction_company}</span>
                            <span
                              className="hidden lg:line-clamp-3 leading-tight"
                              title={record.construction_company}
                            >
                              {record.construction_company}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="w-full cursor-pointer text-blue-600 hover:text-blue-800 hover:underline overflow-hidden break-words"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: '1.25rem'
                            }}
                            title={`${record.location} - 클릭하여 네비게이션 선택`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddressClick(record.location)
                            }}
                          >
                            {record.location}
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="max-w-[80px] lg:max-w-none lg:w-full text-center cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden h-full"
                            onClick={(e) => {
                              const attendeesStr = typeof record.attendees === 'string' ? record.attendees : String(record.attendees || '-');
                              const newWorkersStr = typeof record.new_workers === 'string' ? record.new_workers : String(record.new_workers || '');
                              const displayText = attendeesStr !== '-'
                                ? `${attendeesStr}${newWorkersStr ? `\n(신규:${newWorkersStr})` : ''}`
                                : '-';
                              handleCellClick('투입인원', displayText, record.project_name, e);
                            }}
                          >
                            <span className="lg:hidden block">
                              {(() => {
                                const attendeesStr = typeof record.attendees === 'string' ? record.attendees : String(record.attendees || '-');
                                const newWorkersStr = typeof record.new_workers === 'string' ? record.new_workers : String(record.new_workers || '0');
                                const newWorkersNum = parseInt(newWorkersStr) || 0;
                                const hasNewWorkers = newWorkersNum > 0;

                                if (attendeesStr === '-') {
                                  return (
                                    <div className="text-center">
                                      <div>-</div>
                                      {hasNewWorkers && (
                                        <div className="text-[10px] text-blue-600 font-semibold mt-0.5 bg-yellow-200 px-1.5 py-0.5 rounded inline-block">(신규:{newWorkersNum})</div>
                                      )}
                                    </div>
                                  );
                                }

                                const textOnly = attendeesStr.replace(/\s/g, '');
                                let displayAttendees = attendeesStr;
                                if (textOnly.length > 4) {
                                  let count = 0;
                                  let result = '';
                                  for (let char of attendeesStr) {
                                    if (char !== ' ') count++;
                                    result += char;
                                    if (count === 4) break;
                                  }
                                  displayAttendees = result + '...';
                                }

                                return (
                                  <div className="text-center">
                                    <div className="truncate">{displayAttendees}</div>
                                    {hasNewWorkers && (
                                      <div className="text-[10px] text-blue-600 font-semibold mt-0.5 bg-yellow-200 px-1.5 py-0.5 rounded inline-block">(신규:{newWorkersNum})</div>
                                    )}
                                  </div>
                                );
                              })()}
                            </span>
                            <span className="hidden lg:block h-full flex flex-col items-center justify-start pt-1">
                              {(() => {
                                const attendeesStr = typeof record.attendees === 'string' ? record.attendees : String(record.attendees || '-');
                                const newWorkersStr = typeof record.new_workers === 'string' ? record.new_workers : String(record.new_workers || '');

                                if (attendeesStr === '-') {
                                  return <div className="text-center">-</div>;
                                }

                                const hasNewWorkers = newWorkersStr && newWorkersStr.trim() !== '' && newWorkersStr !== '0' && newWorkersStr !== '-';

                                return (
                                  <div className="w-full text-center">
                                    <div
                                      className="text-sm leading-tight"
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical' as any,
                                        overflow: 'hidden'
                                      }}
                                      title={attendeesStr}
                                    >
                                      {attendeesStr}
                                    </div>
                                    {hasNewWorkers && (
                                      <div className="text-sm text-blue-600 font-semibold mt-0.5 bg-yellow-200 px-2 py-0.5 rounded inline-block">(신규:{newWorkersStr})</div>
                                    )}
                                  </div>
                                );
                              })()}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="max-w-[120px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden h-full"
                            onClick={(e) => handleCellClick('투입장비', record.equipment_input || '-', record.project_name, e)}
                          >
                            <span className="lg:hidden block truncate">
                              {(() => {
                                const content = record.equipment_input || '-';
                                if (content === '-') return '-';
                                const textOnly = content.replace(/\s/g, '');
                                if (textOnly.length > 4) {
                                  let count = 0;
                                  let result = '';
                                  for (let char of content) {
                                    if (char !== ' ') count++;
                                    result += char;
                                    if (count === 4) break;
                                  }
                                  return result + '...';
                                }
                                return content;
                              })()}
                            </span>
                            <span className="hidden lg:block h-full flex items-center justify-center">
                              <div
                                className="w-full text-center"
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: rowClampLines[record.id] || 2,
                                  WebkitBoxOrient: 'vertical' as any,
                                  overflow: 'hidden'
                                }}
                                title={`투입장비: ${record.equipment_input || '-'}`}
                              >
                                {record.equipment_input || '-'}
                              </div>
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900 border-r border-gray-100">
                          <div
                            className="cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 text-center"
                            onClick={(e) => handleCellClick('위험공종', record.risk_work_type || '-', record.project_name, e)}
                          >
                            {record.risk_work_type && record.risk_work_type !== '해당없음' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                {record.risk_work_type}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-2 text-sm text-gray-900">
                          <div
                            className="max-w-[100px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden text-center"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (record.contact) {
                                setPhoneModal({
                                  isOpen: true,
                                  name: record.leader,
                                  phone: record.contact
                                })
                              }
                            }}
                          >
                            {record.contact ? (
                              <span className="text-blue-600 font-medium truncate block" title={`${record.leader} (${record.contact}) - 클릭하여 전화번호 보기`}>
                                {record.leader}
                              </span>
                            ) : (
                              <span className="truncate block">
                                {record.leader}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 모바일: 지도를 테이블 뒤에 배치 */}
          <div className="lg:hidden">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="relative" style={{ height: 'calc(100vh - 450px)', minHeight: '300px' }}>
                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <p className="mt-2 text-sm text-gray-600">로딩중...</p>
                  </div>
                ) : projectsForMap.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                    <div className="text-center">
                      <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h5 className="text-base font-medium text-gray-900 mb-2">
                        {selectedBranch} 지역에 현장이 없습니다
                      </h5>
                      <p className="text-sm text-gray-600">
                        해당 지사에 등록된 현장이 없습니다.
                      </p>
                    </div>
                  </div>
                ) : null}
                <KakaoMap
                  projects={projectsForMap}
                  offices={offices}
                  onProjectClick={handleMapProjectClick}
                  height="100%"
                  className="w-full h-full"
                  focusedProjectId={focusedProjectId}
                  showRadar={false}
                  disableHover={!!selectedBranch}
                  showLegend={true}
                  key={`mobile-map-${selectedBranch}-${projectsForMap.length}`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 컨텐츠 영역 - 모바일에서는 세로 배치, 데스크톱에서는 가로 배치 (전체 지사 보기) */}
      {(!selectedBranch) && (
        <>
          {/* 모바일 레이아웃: 세로 배치 */}
          <div className="lg:hidden space-y-6">
            {/* 모바일: 지사별 통계 테이블 또는 TBM 기록 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="py-2 px-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">
                  작업 현황
                </h4>
                <div className="flex items-center gap-2">
                  {/* 삭제 모드 버튼 (모바일) - 지사 선택 시에만 표시 */}
                  {selectedBranch && (
                    deleteMode ? (
                      <>
                        <button
                          type="button"
                          onClick={exitDeleteMode}
                          className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-500 text-white hover:bg-gray-600 shadow-sm"
                          title="삭제 모드 종료"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteSelected}
                          disabled={isDeleting || selectedForDeletion.size === 0}
                          className={`inline-flex items-center justify-center p-1.5 rounded-md shadow-sm ${selectedForDeletion.size > 0
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          title={selectedForDeletion.size > 0 ? `${selectedForDeletion.size}건 삭제` : '삭제할 항목을 선택하세요'}
                        >
                          <Trash2 className="h-4 w-4" />
                          {selectedForDeletion.size > 0 && (
                            <span className="ml-1 text-xs">{selectedForDeletion.size}</span>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setShowReportModal(true)
                            // 기본값: 7일 전 ~ TBM 선택 날짜
                            const endDate = new Date(selectedDate)
                            const sevenDaysAgo = new Date(endDate)
                            sevenDaysAgo.setDate(endDate.getDate() - 6)
                            setReportStartDate(sevenDaysAgo.toISOString().split('T')[0])
                            setReportEndDate(selectedDate)
                          }}
                          className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 shadow-sm transition-colors"
                          title="공사감독일지 다운로드"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteMode(true)}
                          className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 shadow-sm transition-colors"
                          title="삭제 모드"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )
                  )}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-xs text-gray-600 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {selectedHq && !selectedBranch && userProfile?.branch_division?.endsWith('본부') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onHqSelect) {
                          onHqSelect('')
                        }
                      }}
                      className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                      title="상위로 이동"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                  <p className="mt-4 text-sm text-gray-600">데이터 로딩 중...</p>
                </div>
              ) : !selectedHq && !selectedBranch && hqStats.length > 0 ? (
                // 본부별 통계 테이블 (모바일 버전) - 기존 좁은 폭 느낌 유지, 모든 컬럼 표시, 좌우 스크롤
                <div className="w-full overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="sticky left-0 z-20 bg-gray-50 px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                          본부
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {currentQuarter}Q<br /><span className="text-[10px]">(지구)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TBM<br />실시<br /><span className="text-[10px]">(건)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TBM<br />확인<br /><span className="text-[10px]">(건)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex flex-col items-center justify-center">
                            <Users className="h-3 w-3" />
                            <span className="text-[10px]">(명)</span>
                          </div>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          위험<br /><span className="text-[10px]">(건)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex flex-col items-center justify-center">
                            <Video className="h-3 w-3" />
                            <span className="text-[10px]">(지구)</span>
                          </div>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          도입<br />(%)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* 소계 행 */}
                      {hqStats.length > 0 && (() => {
                        const summary = hqStats.reduce((acc, stat) => ({
                          activeQuarterCount: acc.activeQuarterCount + (activeQuarterCountByHq.get(stat.hqName) || 0),
                          tbmCount: acc.tbmCount + stat.tbmCount,
                          tbmInspectionCount: acc.tbmInspectionCount + stat.tbmInspectionCount,
                          riskWorkCount: acc.riskWorkCount + stat.riskWorkCount,
                          cctvUsageCount: acc.cctvUsageCount + stat.cctvUsageCount,
                          newWorkersCount: acc.newWorkersCount + stat.newWorkersCount
                        }), {
                          activeQuarterCount: 0,
                          tbmCount: 0,
                          tbmInspectionCount: 0,
                          riskWorkCount: 0,
                          cctvUsageCount: 0,
                          newWorkersCount: 0
                        })

                        return (
                          <tr className="bg-gradient-to-r from-blue-100 to-blue-50 border-t-2 border-b-2 border-blue-400 shadow-md divide-x divide-blue-300">
                            <td className="sticky left-0 z-10 bg-blue-200 px-2 py-2 text-center text-xs font-extrabold text-blue-900 border-r border-blue-300">
                              <div className="flex items-center justify-center">
                                <Activity className="h-3 w-3 mr-1" />
                                소계
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.activeQuarterCount === 0 ? '-' : summary.activeQuarterCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.tbmCount === 0 ? '-' : summary.tbmCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.tbmInspectionCount === 0 ? '-' : (() => {
                                const percentage = summary.tbmCount > 0 ? Math.round((summary.tbmInspectionCount / summary.tbmCount) * 100) : 0
                                return (
                                  <span>
                                    <span className="text-gray-900">{summary.tbmInspectionCount}</span>
                                    <span className="text-blue-600 text-[10px] ml-0.5">({percentage}%)</span>
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.newWorkersCount === 0 ? '-' : summary.newWorkersCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.riskWorkCount === 0 ? '-' : summary.riskWorkCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.cctvUsageCount === 0 ? '-' : summary.cctvUsageCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.tbmCount === 0 ? '-' : `${Math.round((summary.cctvUsageCount / summary.tbmCount) * 100)}%`}
                            </td>
                          </tr>
                        )
                      })()}
                      {/* 데이터 행 */}
                      {hqStats.map((stats) => (
                        <tr
                          key={stats.hqName}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleHqClick(stats.hqName)}
                          onMouseEnter={() => handleHqRowMouseEnter(stats.hqName)}
                          onMouseLeave={handleHqRowMouseLeave}
                        >
                          <td className="sticky left-0 z-10 bg-white px-1 py-1 text-center text-[10px] font-medium text-gray-900 border-r border-gray-200">
                            <div className="max-w-[50px] truncate mx-auto">
                              {stats.hqName}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-center text-xs text-gray-900 font-semibold">
                            {(activeQuarterCountByHq.get(stats.hqName) || 0) === 0 ? '-' : activeQuarterCountByHq.get(stats.hqName)}
                          </td>
                          <td className="px-2 py-1 text-center text-xs text-gray-900 font-semibold">
                            {stats.tbmCount === 0 ? '-' : stats.tbmCount}
                          </td>
                          <td className="px-2 py-1 text-center text-xs font-semibold">
                            {stats.tbmInspectionCount === 0 ? '-' : (() => {
                              const percentage = stats.tbmCount > 0 ? Math.round((stats.tbmInspectionCount / stats.tbmCount) * 100) : 0
                              return (
                                <span>
                                  <span className="text-gray-900">{stats.tbmInspectionCount}</span>
                                  <span className="text-blue-600 text-[10px] ml-0.5">({percentage}%)</span>
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-2 py-1 text-center text-xs text-gray-900">
                            {stats.newWorkersCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {stats.newWorkersCount}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center text-xs text-gray-900">
                            {stats.riskWorkCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {stats.riskWorkCount}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center text-xs text-gray-900">
                            {stats.cctvUsageCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {stats.cctvUsageCount}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center text-xs text-gray-900 font-semibold">
                            {stats.tbmCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                {Math.round((stats.cctvUsageCount / stats.tbmCount) * 100)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : selectedHq && !selectedBranch ? (
                // 지사별 통계 테이블 (모바일 버전) - 기존 좁은 폭 느낌 유지, 모든 컬럼 표시, 좌우 스크롤
                <div className="w-full overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="sticky left-0 z-20 bg-gray-50 px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                          지사
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {currentQuarter}Q<br /><span className="text-[10px]">(지구)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TBM<br />실시<br /><span className="text-[10px]">(건)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TBM<br />확인<br /><span className="text-[10px]">(건)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex flex-col items-center justify-center">
                            <Users className="h-3 w-3" />
                            <span className="text-[10px]">(명)</span>
                          </div>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          위험<br /><span className="text-[10px]">(건)</span>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex flex-col items-center justify-center">
                            <Video className="h-3 w-3" />
                            <span className="text-[10px]">(건)</span>
                          </div>
                        </th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          도입<br />(%)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* 소계 행 */}
                      {branchStats.length > 0 && (() => {
                        const summary = branchStats.reduce((acc, stat) => ({
                          activeQuarterCount: acc.activeQuarterCount + (activeQuarterCountByBranch.get(`${selectedHq}||${stat.branchName}`) || 0),
                          tbmCount: acc.tbmCount + stat.tbmCount,
                          tbmInspectionCount: acc.tbmInspectionCount + stat.tbmInspectionCount,
                          riskWorkCount: acc.riskWorkCount + stat.riskWorkCount,
                          cctvUsageCount: acc.cctvUsageCount + stat.cctvUsageCount,
                          newWorkersCount: acc.newWorkersCount + stat.newWorkersCount
                        }), {
                          activeQuarterCount: 0,
                          tbmCount: 0,
                          tbmInspectionCount: 0,
                          riskWorkCount: 0,
                          cctvUsageCount: 0,
                          newWorkersCount: 0
                        })

                        return (
                          <tr className="bg-gradient-to-r from-blue-100 to-blue-50 border-t-2 border-b-2 border-blue-400 shadow-md divide-x divide-blue-300">
                            <td className="sticky left-0 z-10 bg-blue-200 px-2 py-2 text-center text-xs font-extrabold text-blue-900 border-r border-blue-300">
                              <div className="flex items-center justify-center">
                                <Activity className="h-3 w-3 mr-1" />
                                소계
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.activeQuarterCount === 0 ? '-' : summary.activeQuarterCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.tbmCount === 0 ? '-' : summary.tbmCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.tbmInspectionCount === 0 ? '-' : (() => {
                                const percentage = summary.tbmCount > 0 ? Math.round((summary.tbmInspectionCount / summary.tbmCount) * 100) : 0
                                return (
                                  <span>
                                    <span className="text-gray-900">{summary.tbmInspectionCount}</span>
                                    <span className="text-blue-600 text-[10px] ml-0.5">({percentage}%)</span>
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.newWorkersCount === 0 ? '-' : summary.newWorkersCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.riskWorkCount === 0 ? '-' : summary.riskWorkCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.cctvUsageCount === 0 ? '-' : summary.cctvUsageCount}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-extrabold text-blue-900">
                              {summary.tbmCount === 0 ? '-' : `${Math.round((summary.cctvUsageCount / summary.tbmCount) * 100)}%`}
                            </td>
                          </tr>
                        )
                      })()}
                      {/* 데이터 행 */}
                      {branchStats.map((stats) => {
                        return (
                          <tr
                            key={stats.branchName}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => handleBranchClick(stats.branchName)}
                          >
                            <td className="sticky left-0 z-10 bg-white px-1 py-1 text-center text-[10px] font-medium text-gray-900 border-r border-gray-200">
                              <div className="max-w-[50px] truncate mx-auto">
                                {stats.branchName}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-center text-xs text-gray-900 font-semibold">
                              {(activeQuarterCountByBranch.get(`${selectedHq}||${stats.branchName}`) || 0) === 0 ? '-' : activeQuarterCountByBranch.get(`${selectedHq}||${stats.branchName}`)}
                            </td>
                            <td className="px-2 py-1 text-center text-xs text-gray-900 font-semibold">
                              {stats.tbmCount === 0 ? '-' : stats.tbmCount}
                            </td>
                            <td className="px-2 py-1 text-center text-xs font-semibold">
                              {stats.tbmInspectionCount === 0 ? '-' : (() => {
                                const percentage = stats.tbmCount > 0 ? Math.round((stats.tbmInspectionCount / stats.tbmCount) * 100) : 0
                                return (
                                  <span>
                                    <span className="text-gray-900">{stats.tbmInspectionCount}</span>
                                    <span className="text-blue-600 text-[10px] ml-0.5">({percentage}%)</span>
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-2 py-1 text-center text-xs text-gray-900">
                              {stats.newWorkersCount === 0 ? (
                                <span className="text-gray-500">-</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {stats.newWorkersCount}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-center text-xs text-gray-900">
                              {stats.riskWorkCount === 0 ? (
                                <span className="text-gray-500">-</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {stats.riskWorkCount}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-center text-xs text-gray-900">
                              {stats.cctvUsageCount === 0 ? (
                                <span className="text-gray-500">-</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {stats.cctvUsageCount}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-center text-xs text-gray-900 font-semibold">
                              {stats.tbmCount === 0 ? (
                                <span className="text-gray-500">-</span>
                              ) : (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                  {Math.round((stats.cctvUsageCount / stats.tbmCount) * 100)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center py-12" style={{ minHeight: '200px', maxHeight: '300px' }}>
                  <LoadingSpinner />
                  <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                </div>
              ) : tbmRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="h-12 w-12 text-gray-400 mb-4" />
                  <h5 className="text-lg font-medium text-gray-900 mb-2">
                    TBM 기록이 없습니다
                  </h5>
                  <p className="text-gray-600">
                    오늘 날짜에 등록된 TBM 기록이 없습니다.
                  </p>
                </div>
              ) : (
                // 개별 TBM 기록 (모바일 카드 형식)
                <div className="divide-y divide-gray-200">
                  {tbmRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`p-4 cursor-pointer transition-colors ${deleteMode && selectedForDeletion.has(record.id)
                        ? 'bg-red-100 hover:bg-red-200'
                        : deleteMode
                          ? 'hover:bg-red-50'
                          : 'hover:bg-gray-50'
                        }`}
                      onClick={() => handleTBMRecordClick(record)}
                    >
                      <div className="flex items-start justify-between">
                        {deleteMode && (
                          <div className="flex items-center mr-3 pt-1">
                            <input
                              type="checkbox"
                              checked={selectedForDeletion.has(record.id)}
                              onChange={() => toggleDeleteSelection(record.id)}
                              className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <h5 className="text-sm font-medium text-gray-900 truncate">
                              {record.project_name}
                            </h5>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              완료
                            </span>
                          </div>

                          <div className="text-xs text-gray-600 space-y-1">
                            <div>장소: {record.location}</div>
                            <div>리더: {record.leader}</div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {record.topics.slice(0, 2).map((topic, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                                >
                                  {topic}
                                </span>
                              ))}
                              {record.topics.length > 2 && (
                                <span className="text-xs text-gray-500">
                                  +{record.topics.length - 2}개
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 모바일: 지도 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="relative" style={{ height: '457px' }}>
                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                  </div>
                ) : null}
                <KakaoMap
                  projects={projectsForMap}
                  onProjectClick={handleMapProjectClick}
                  height="457px"
                  className="w-full"
                  focusedProjectId={focusedProjectId}
                  showRadar={false}
                  disableHover={!!selectedBranch}
                  showLegend={true}
                />
              </div>
            </div>
          </div>

          {/* 데스크톱 레이아웃: 기존 가로 배치 */}
          <div className="hidden lg:block">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div
                ref={gridContainerRef}
                className="grid grid-cols-1 lg:grid-cols-2"
                style={{ height: `${containerHeight}px` }}
              >
                {/* 좌측 - 카카오 지도 */}
                <div className="border-b lg:border-b-0 lg:border-r border-gray-200">
                  <div className="relative" style={{ height: `${containerHeight}px` }}>
                    {loading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                      </div>
                    ) : null}
                    <KakaoMap
                      projects={projectsForMap}
                      onProjectClick={handleMapProjectClick}
                      height={`${containerHeight}px`}
                      className="w-full"
                      focusedProjectId={focusedProjectId}
                      highlightedBranch={!selectedBranch ? hoveredBranchName : undefined}
                      highlightedHq={!selectedHq && !selectedBranch ? hoveredHqName : undefined}
                      showRadar={false}
                      disableHover={!!selectedBranch}
                      showLegend={true}
                    />
                  </div>
                </div>

                {/* 우측 - 지사별 통계 테이블 또는 TBM 기록 테이블 */}
                <div className="flex flex-col">
                  <div className="py-2 px-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900 flex items-center">
                      {!selectedHq && !selectedBranch ? (
                        <>
                          <Building2 className="h-4 w-4 mr-2 text-blue-600" />
                          본부별 TBM 현황
                        </>
                      ) : selectedHq && !selectedBranch ? (
                        <>
                          <Building2 className="h-4 w-4 mr-2 text-blue-600" />
                          {selectedHq} 지사별 작업 현황
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2 text-blue-600" />
                          TBM 기록 (오늘)
                        </>
                      )}
                    </h4>
                    <div className="flex items-center gap-3">
                      {/* AI공감일지 보고서 다운 버튼 - 지사 선택 시에만 표시 (휴지통 좌측) */}
                      {selectedBranch && (
                        <button
                          type="button"
                          onClick={() => {
                            // 향후 기능 구현 예정
                            console.log('AI공감일지 보고서 다운 클릭')
                          }}
                          className="inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm text-xs font-medium transition-colors"
                          title="AI공감일지 다운로드"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          AI공감일지
                        </button>
                      )}
                      {/* 삭제 모드 버튼 (데스크톱) - 지사 선택 시에만 표시 */}
                      {selectedBranch && (
                        deleteMode ? (
                          <>
                            <button
                              type="button"
                              onClick={exitDeleteMode}
                              className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-500 text-white hover:bg-gray-600 shadow-sm"
                              title="삭제 모드 종료"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={handleDeleteSelected}
                              disabled={isDeleting || selectedForDeletion.size === 0}
                              className={`inline-flex items-center justify-center p-1.5 rounded-md shadow-sm ${selectedForDeletion.size > 0
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                              title={selectedForDeletion.size > 0 ? `${selectedForDeletion.size}건 삭제` : '삭제할 항목을 선택하세요'}
                            >
                              <Trash2 className="h-4 w-4" />
                              {selectedForDeletion.size > 0 && (
                                <span className="ml-1 text-xs">{selectedForDeletion.size}</span>
                              )}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setShowReportModal(true)
                                // 기본값: 7일 전 ~ TBM 선택 날짜
                                const endDate = new Date(selectedDate)
                                const sevenDaysAgo = new Date(endDate)
                                sevenDaysAgo.setDate(endDate.getDate() - 6)
                                setReportStartDate(sevenDaysAgo.toISOString().split('T')[0])
                                setReportEndDate(selectedDate)
                              }}
                              className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 shadow-sm transition-colors"
                              title="AI공감일지 다운로드"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMode(true)}
                              className="inline-flex items-center justify-center p-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 shadow-sm transition-colors"
                              title="삭제 모드"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )
                      )}
                      {/* 일자 선택 */}
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      {selectedHq && !selectedBranch && userProfile?.branch_division?.endsWith('본부') && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onHqSelect) {
                              onHqSelect('')
                            }
                          }}
                          className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                          title="상위로 이동"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {loading ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="mt-4 text-sm text-gray-600">데이터 로딩 중...</p>
                      </div>
                    ) : !selectedHq && !selectedBranch && hqStats.length > 0 ? (
                      // 본부별 통계 테이블
                      <div
                        className="h-full"
                        style={{ height: `${containerHeight - 57}px` }}
                      >
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="sticky top-0 z-10 bg-gray-100/90 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                            <tr className="divide-x divide-gray-200" style={{ height: `${tableRowHeight}px` }}>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                본부명
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">
                                <span className="hidden xl:inline">{currentQuarter}분기 공사중</span><span className="xl:hidden">{currentQuarter}Q</span><br /><span className="text-[10px]">(지구)</span>
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                TBM 실시<br /><span className="text-[10px]">(건)</span>
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                TBM확인<br /><span className="text-[10px]">(건)</span>
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                신규근로자<br /><span className="text-[10px]">(명)</span>
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                위험공종<br /><span className="text-[10px]">(건)</span>
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                CCTV 설치<br /><span className="text-[10px]">(지구)</span>
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                도입율<br /><span className="text-[10px]">(%)</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {/* 소계 행 */}
                            {hqStats.length > 0 && (() => {
                              const summary = hqStats.reduce((acc, stat) => ({
                                activeQuarterCount: acc.activeQuarterCount + (activeQuarterCountByHq.get(stat.hqName) || 0),
                                tbmCount: acc.tbmCount + stat.tbmCount,
                                tbmInspectionCount: acc.tbmInspectionCount + stat.tbmInspectionCount,
                                riskWorkCount: acc.riskWorkCount + stat.riskWorkCount,
                                cctvUsageCount: acc.cctvUsageCount + stat.cctvUsageCount,
                                newWorkersCount: acc.newWorkersCount + stat.newWorkersCount
                              }), {
                                activeQuarterCount: 0,
                                tbmCount: 0,
                                tbmInspectionCount: 0,
                                riskWorkCount: 0,
                                cctvUsageCount: 0,
                                newWorkersCount: 0
                              })

                              return (
                                <tr className="bg-gradient-to-r from-blue-100 to-blue-50 font-bold border-t-2 border-b-2 border-blue-400 divide-x divide-blue-300 shadow-md" style={{ height: `${tableRowHeight}px` }}>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/50">
                                    <div className="text-xs font-extrabold text-blue-900 flex items-center justify-center">
                                      <Activity className="h-4 w-4 mr-1" />
                                      소계({hqStats.length}본부)
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.activeQuarterCount === 0 ? '-' : summary.activeQuarterCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.tbmCount === 0 ? '-' : summary.tbmCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.tbmInspectionCount === 0 ? '-' : (() => {
                                        const percentage = summary.tbmCount > 0 ? Math.round((summary.tbmInspectionCount / summary.tbmCount) * 100) : 0
                                        return (
                                          <span>
                                            <span className="text-blue-900">{summary.tbmInspectionCount}</span>
                                            <span className="text-blue-600 text-sm">({percentage}%)</span>
                                          </span>
                                        )
                                      })()}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.newWorkersCount === 0 ? '-' : summary.newWorkersCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.riskWorkCount === 0 ? '-' : summary.riskWorkCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.cctvUsageCount === 0 ? '-' : summary.cctvUsageCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.tbmCount === 0 ? (
                                        <span className="text-gray-500">-</span>
                                      ) : (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-extrabold ${Math.round((summary.cctvUsageCount / summary.tbmCount) * 100) >= 50
                                          ? 'bg-blue-200 text-blue-900 border-2 border-blue-400'
                                          : 'bg-yellow-200 text-yellow-900 border-2 border-yellow-400'
                                          }`}>
                                          {Math.round((summary.cctvUsageCount / summary.tbmCount) * 100)}%
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })()}
                            {/* 데이터 행 */}
                            {hqStats.map((stats) => (
                              <tr
                                key={stats.hqName}
                                className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors divide-x divide-gray-100"
                                style={{ height: `${tableRowHeight}px` }}
                                onClick={() => handleHqClick(stats.hqName)}
                                onMouseEnter={() => handleHqRowMouseEnter(stats.hqName)}
                                onMouseLeave={handleHqRowMouseLeave}
                              >
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm font-medium text-gray-900">
                                    {stats.hqName}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {(activeQuarterCountByHq.get(stats.hqName) || 0) === 0 ? '-' : activeQuarterCountByHq.get(stats.hqName)}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? '-' : stats.tbmCount}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmInspectionCount === 0 ? '-' : (() => {
                                      const percentage = stats.tbmCount > 0 ? Math.round((stats.tbmInspectionCount / stats.tbmCount) * 100) : 0
                                      return (
                                        <span>
                                          <span>{stats.tbmInspectionCount}</span>
                                          <span className="text-blue-600 text-sm">({percentage}%)</span>
                                        </span>
                                      )
                                    })()}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.newWorkersCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stats.newWorkersCount > 0
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {stats.newWorkersCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.riskWorkCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stats.riskWorkCount > 0
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-blue-100 text-blue-800'
                                        }`}>
                                        {stats.riskWorkCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.cctvUsageCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stats.cctvUsageCount > 0
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {stats.cctvUsageCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {Math.round((stats.cctvUsageCount / stats.tbmCount) * 100)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : selectedHq && !selectedBranch ? (
                      // 지사별 통계 테이블
                      <div
                        className="h-full"
                        style={{ height: `${containerHeight - 57}px` }}
                      >
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="sticky top-0 z-10 bg-gray-200/90 backdrop-blur supports-[backdrop-filter]:bg-gray-200/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                            <tr className="divide-x divide-gray-200" style={{ height: `${tableRowHeight}px` }}>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-300 font-semibold">
                                지사
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200 whitespace-nowrap">
                                <span className="hidden xl:inline">{currentQuarter}분기 공사중</span><span className="xl:hidden">{currentQuarter}Q</span><br /><span className="text-[10px]">(지구)</span>
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                                TBM 실시<br /><span className="text-[10px]">(건)</span>
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                                TBM확인<br /><span className="text-[10px]">(건)</span>
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                                신규근로자<br /><span className="text-[10px]">(명)</span>
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                                위험공종<br /><span className="text-[10px]">(건)</span>
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                                CCTV 설치<br /><span className="text-[10px]">(지구)</span>
                              </th>
                              <th className="px-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-200">
                                도입율<br /><span className="text-[10px]">(%)</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {/* 소계 행 */}
                            {branchStats.length > 0 && (() => {
                              const summary = branchStats.reduce((acc, stat) => ({
                                activeQuarterCount: acc.activeQuarterCount + (activeQuarterCountByBranch.get(`${selectedHq}||${stat.branchName}`) || 0),
                                tbmCount: acc.tbmCount + stat.tbmCount,
                                tbmInspectionCount: acc.tbmInspectionCount + stat.tbmInspectionCount,
                                riskWorkCount: acc.riskWorkCount + stat.riskWorkCount,
                                cctvUsageCount: acc.cctvUsageCount + stat.cctvUsageCount,
                                newWorkersCount: acc.newWorkersCount + stat.newWorkersCount
                              }), {
                                activeQuarterCount: 0,
                                tbmCount: 0,
                                tbmInspectionCount: 0,
                                riskWorkCount: 0,
                                cctvUsageCount: 0,
                                newWorkersCount: 0
                              })

                              return (
                                <tr className="bg-gradient-to-r from-blue-100 to-blue-50 font-bold border-t-2 border-b-2 border-blue-400 divide-x divide-blue-300 shadow-md" style={{ height: `${tableRowHeight}px` }}>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/50">
                                    <div className="text-xs font-extrabold text-blue-900 flex items-center justify-center">
                                      <span className="mr-1">📊</span>
                                      소계({branchStats.length}지사)
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.activeQuarterCount === 0 ? '-' : summary.activeQuarterCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.tbmCount === 0 ? '-' : summary.tbmCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.tbmInspectionCount === 0 ? '-' : (() => {
                                        const percentage = summary.tbmCount > 0 ? Math.round((summary.tbmInspectionCount / summary.tbmCount) * 100) : 0
                                        return (
                                          <span>
                                            <span className="text-blue-900">{summary.tbmInspectionCount}</span>
                                            <span className="text-blue-600 text-sm">({percentage}%)</span>
                                          </span>
                                        )
                                      })()}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.newWorkersCount === 0 ? '-' : summary.newWorkersCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.riskWorkCount === 0 ? '-' : summary.riskWorkCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.cctvUsageCount === 0 ? '-' : summary.cctvUsageCount}
                                    </div>
                                  </td>
                                  <td className="px-4 whitespace-nowrap align-middle text-center bg-blue-200/30">
                                    <div className="text-sm text-blue-900 font-extrabold">
                                      {summary.tbmCount === 0 ? (
                                        <span className="text-gray-500">-</span>
                                      ) : (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-extrabold ${Math.round((summary.cctvUsageCount / summary.tbmCount) * 100) >= 50
                                          ? 'bg-blue-200 text-blue-900 border-2 border-blue-400'
                                          : 'bg-yellow-200 text-yellow-900 border-2 border-yellow-400'
                                          }`}>
                                          {Math.round((summary.cctvUsageCount / summary.tbmCount) * 100)}%
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })()}
                            {/* 데이터 행 */}
                            {branchStats.map((stats) => (
                              <tr
                                key={stats.branchName}
                                className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors divide-x divide-gray-100"
                                style={{ height: `${tableRowHeight}px` }}
                                onClick={() => handleBranchClick(stats.branchName)}
                                onMouseEnter={() => handleBranchRowMouseEnter(stats.branchName)}
                                onMouseLeave={handleBranchRowMouseLeave}
                              >
                                <td className="px-4 whitespace-nowrap align-middle text-center bg-gray-100">
                                  <div className="text-xs font-medium text-gray-900">
                                    {stats.branchName}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {(activeQuarterCountByBranch.get(`${selectedHq}||${stats.branchName}`) || 0) === 0 ? '-' : activeQuarterCountByBranch.get(`${selectedHq}||${stats.branchName}`)}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? '-' : stats.tbmCount}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmInspectionCount === 0 ? '-' : (() => {
                                      const percentage = stats.tbmCount > 0 ? Math.round((stats.tbmInspectionCount / stats.tbmCount) * 100) : 0
                                      return (
                                        <span>
                                          <span className="text-gray-900">{stats.tbmInspectionCount}</span>
                                          <span className="text-blue-600 text-sm">({percentage}%)</span>
                                        </span>
                                      )
                                    })()}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.newWorkersCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${stats.newWorkersCount > 0
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {stats.newWorkersCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.riskWorkCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${stats.riskWorkCount > 0
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-blue-100 text-blue-800'
                                        }`}>
                                        {stats.riskWorkCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.cctvUsageCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${stats.cctvUsageCount > 0
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {stats.cctvUsageCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {Math.round((stats.cctvUsageCount / stats.tbmCount) * 100)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : loading ? (
                      <div className="flex flex-col items-center justify-center p-6" style={{ minHeight: '200px', maxHeight: '300px' }}>
                        <LoadingSpinner />
                        <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                      </div>
                    ) : tbmRecords.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                        <Activity className="h-12 w-12 text-gray-400 mb-4" />
                        <h5 className="text-lg font-medium text-gray-900 mb-2">
                          TBM 기록이 없습니다
                        </h5>
                        <p className="text-gray-600">
                          오늘 날짜에 등록된 TBM 기록이 없습니다.
                        </p>
                      </div>
                    ) : (
                      // 개별 TBM 기록 테이블
                      <div className="divide-y divide-gray-200">
                        {tbmRecords.map((record) => (
                          <div
                            key={record.id}
                            className={`p-4 cursor-pointer transition-colors ${deleteMode && selectedForDeletion.has(record.id)
                              ? 'bg-red-100 hover:bg-red-200'
                              : deleteMode
                                ? 'hover:bg-red-50'
                                : 'hover:bg-gray-50'
                              }`}
                            onClick={() => handleTBMRecordClick(record)}
                          >
                            <div className="flex items-start justify-between">
                              {deleteMode && (
                                <div className="flex items-center mr-3 pt-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedForDeletion.has(record.id)}
                                    onChange={() => toggleDeleteSelection(record.id)}
                                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-2">
                                  <h5 className="text-sm font-medium text-gray-900 truncate">
                                    {record.project_name}
                                  </h5>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    완료
                                  </span>
                                </div>

                                <div className="flex items-center space-x-4 text-xs text-gray-500 mb-2">
                                  <div className="flex items-center">
                                    <FileText className="h-3 w-3 mr-1" />
                                    TBM 완료
                                  </div>
                                </div>

                                <div className="text-xs text-gray-600">
                                  <div className="mb-1">장소: {record.location}</div>
                                  <div className="mb-1">리더: {record.leader}</div>
                                  <div className="flex flex-wrap gap-1">
                                    {record.topics.slice(0, 2).map((topic, index) => (
                                      <span
                                        key={index}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                                      >
                                        {topic}
                                      </span>
                                    ))}
                                    {record.topics.length > 2 && (
                                      <span className="text-xs text-gray-500">
                                        +{record.topics.length - 2}개
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 에러 메시지 표시 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-sm text-red-700">{error}</div>
          <button
            onClick={() => {
              loadAllTBMData(true).then(() => {
                filterTBMData()
              })
            }}
            className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 정보 모달 */}
      {infoModal.isOpen && (
        <div
          className="bg-yellow-50 rounded-lg shadow-xl relative info-modal border border-yellow-200"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            width: 'min(90vw, 24rem)',
            maxWidth: 'min(90vw, 24rem)'
          }}
        >
          {/* 닫기 버튼 */}
          <button
            onClick={handleCloseInfoModal}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* 모달 내용 */}
          <div className="p-4 pr-10 lg:p-6 lg:pr-12">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-2 lg:mb-3 break-words">
              {infoModal.title}
            </h3>
            <div className="text-sm text-gray-700 break-words">
              {infoModal.content.split('\n').map((line, index) => (
                <div key={index} className="break-words">
                  {line}
                  {index === 0 && <hr className="my-2 border-gray-200" />}
                </div>
              ))}
            </div>

            {/* 복사 버튼 */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(infoModal.content).then(() => {
                  const btn = document.querySelector('.copy-info-btn')
                  if (btn) {
                    const originalText = btn.textContent
                    btn.textContent = '복사됨!'
                    setTimeout(() => {
                      btn.textContent = originalText || '복사'
                    }, 1500)
                  }
                }).catch(err => {
                  console.error('복사 실패:', err)
                })
              }}
              className="copy-info-btn mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-700 transition-colors"
            >
              <Copy className="h-4 w-4" />
              복사
            </button>
          </div>
        </div>
      )}

      {/* 네비게이션 선택 모달 */}
      {navigationModal.isOpen && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={handleNavigationModalClose}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* 헤더 - 우측 상단에 닫기 버튼 */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center flex-1">
                  <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 ml-4">
                    네비게이션 선택
                  </h3>
                </div>
                <button
                  onClick={handleNavigationModalClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="text-sm text-gray-500 mb-6">
                <p className="mb-2">목적지:</p>
                <p className="font-medium text-gray-900 bg-gray-50 p-2 rounded">
                  {navigationModal.address}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openKakaoMap(navigationModal.address)}
                  className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 rounded-md px-4 py-3 font-medium transition-colors"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-lg font-bold mb-1">K</span>
                    <span className="text-xs">카카오맵</span>
                  </div>
                </button>
                <button
                  onClick={() => openTMap(navigationModal.address)}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white border border-blue-600 rounded-md px-4 py-3 font-medium transition-colors"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-lg font-bold mb-1">T</span>
                    <span className="text-xs">티맵</span>
                  </div>
                </button>
                <button
                  onClick={() => openNaverMap(navigationModal.address)}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white border border-green-600 rounded-md px-4 py-3 font-medium transition-colors"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-lg font-bold mb-1">N</span>
                    <span className="text-xs">네이버맵</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 전화번호 모달 */}
      {phoneModal.isOpen && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              {/* 헤더 - 우측 상단에 닫기 버튼 */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                    <Phone className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      {phoneModal.name}
                    </h3>
                    <p className="text-sm text-gray-500">소장</p>
                  </div>
                </div>
                <button
                  onClick={() => setPhoneModal({ isOpen: false, name: '', phone: '' })}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* 전화번호 표시 */}
              <div className="mb-6">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <a
                    href={`tel:${phoneModal.phone}`}
                    className="text-2xl font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {phoneModal.phone}
                  </a>
                </div>
              </div>

              {/* 버튼 그룹 */}
              <div className="flex gap-2">
                <a
                  href={`tel:${phoneModal.phone}`}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Phone className="h-5 w-5" />
                  <span>전화걸기</span>
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(phoneModal.phone)
                    alert('전화번호가 복사되었습니다.')
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="h-5 w-5" />
                  <span>복사</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 보고서 생성 진행률 모달 */}
      {isDownloadingReport && reportProgress.total > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mb-4">
                <Download className="h-16 w-16 text-blue-600 mx-auto animate-bounce" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {useAI ? 'AI가 공사감독일지를 쓰고 있어요' : '공사감독일지를 작성하고 있어요'}
              </h3>
              <p className="text-gray-600 mb-2">
                잠시만 기다려 주세요
              </p>
              <p className="text-gray-500 text-sm mb-6">
                {reportProgress.current} / {reportProgress.total} 페이지
              </p>

              {/* 프로그레스 바 */}
              <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }}
                />
              </div>

              {/* 퍼센트 표시 */}
              <p className="text-3xl font-bold text-blue-600 mb-2">
                {Math.round((reportProgress.current / reportProgress.total) * 100)}%
              </p>

              {/* 상태 메시지 */}
              {reportStatus ? (
                <div className="text-center">
                  <p className="text-sm text-gray-600 animate-pulse">
                    {reportStatus}
                  </p>
                  {reportSubStatus && (
                    <p className="text-xs text-blue-500 mt-1">
                      {reportSubStatus}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  잠시만 기다려주세요...
                </p>
              )}

              {/* 취소 버튼 */}
              <button
                onClick={() => {
                  if (confirm('보고서 생성을 취소하시겠습니까?')) {
                    cancelReportRef.current = true
                  }
                }}
                className="mt-6 px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 보고서 모드 플로팅 배지 */}
      {reportModeActive && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full shadow-2xl px-6 py-3 flex items-center gap-3 border-2 border-white">
            <Download className="h-5 w-5 animate-pulse" />
            <div className="flex flex-col">
              <span className="font-bold text-sm">공사감독일지 다운로드 모드</span>
              <span className="text-xs text-blue-100">
                {reportStartDate} ~ {reportEndDate}
              </span>
            </div>
            <button
              onClick={() => {
                setReportModeActive(false)
                setReportStartDate('')
                setReportEndDate('')
              }}
              className="ml-2 bg-white text-blue-600 rounded-full p-1.5 hover:bg-blue-50 transition-colors"
              title="취소"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-center mt-2 text-xs text-gray-600 bg-white rounded-full px-4 py-1 shadow-md">
            👇 아래 TBM 내역에서 사업명을 클릭하세요
          </div>
        </div>
      )}

      {/* 사업명 선택 모달 */}
      {showProjectSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">사업 선택</h3>
                <button
                  onClick={() => setShowProjectSelectionModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">공사감독일지를 다운로드할 사업을 선택하세요</p>

              <div className="overflow-y-auto max-h-[50vh] border border-gray-200 rounded-lg">
                {/* 현재 표시된 TBM 기록에서 고유한 사업명 추출 */}
                {(() => {
                  const uniqueProjects = tbmRecords.reduce((acc, record) => {
                    const key = `${record.project_name}_${record.managing_hq}_${record.managing_branch}`
                    if (!acc.has(key)) {
                      acc.set(key, {
                        id: record.project_id,
                        name: record.project_name,
                        hq: record.managing_hq,
                        branch: record.managing_branch
                      })
                    }
                    return acc
                  }, new Map<string, { id: string; name: string; hq: string; branch: string }>())

                  const projectList = Array.from(uniqueProjects.values())

                  if (projectList.length === 0) {
                    return (
                      <div className="p-8 text-center text-gray-500">
                        표시된 TBM 기록이 없습니다
                      </div>
                    )
                  }

                  return projectList.map((project, idx) => (
                    <button
                      key={`${project.name}_${idx}`}
                      onClick={async () => {
                        setSelectedProjectForReport(project)
                        setShowProjectSelectionModal(false)

                        // 해당 사업의 TBM 제출 일자 조회 (project_id 또는 이름+본부+지사)
                        try {
                          // 1. project_id로 조회
                          let dataById: any[] | null = null
                          let errorById = null

                          if (project.id) {
                            const result = await supabase
                              .from('tbm_submissions')
                              .select('meeting_date')
                              .eq('project_id', project.id)
                              .order('meeting_date', { ascending: true })
                            dataById = result.data
                            errorById = result.error
                          }

                          // 2. 프로젝트명+본부+지사로 조회
                          const { data: dataByName, error: errorByName } = await supabase
                            .from('tbm_submissions')
                            .select('meeting_date')
                            .eq('project_name', project.name)
                            .eq('headquarters', project.hq)
                            .eq('branch', project.branch)
                            .order('meeting_date', { ascending: true })

                          if (errorById || errorByName) {
                            console.error('TBM 제출 일자 조회 오류:', errorById || errorByName)
                            alert('데이터 조회 중 오류가 발생했습니다.')
                            return
                          }

                          // 두 결과 합치기
                          const combinedData = [...(dataById || []), ...(dataByName || [])]

                          if (combinedData.length === 0) {
                            alert('해당 사업의 TBM 제출 내역이 없습니다.')
                            return
                          }

                          // 고유한 날짜만 추출
                          const dates = [...new Set(combinedData.map(s => s.meeting_date))].sort()
                          setTbmSubmissionDates(dates)

                          // 가장 최근 제출일을 포함하는 달로 달력 설정
                          const latestDate = new Date(dates[dates.length - 1])
                          setCalendarMonth(latestDate)

                          // 기본 종료일은 TBM 선택 날짜, 시작일은 가장 최근 제출일
                          setReportEndDate(selectedDate)
                          setReportStartDate(dates[dates.length - 1])

                          // 달력 모달 열기
                          setShowDateSelectionModal(true)
                        } catch (error) {
                          console.error('데이터 조회 오류:', error)
                          alert('데이터 조회 중 오류가 발생했습니다.')
                        }
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{project.name}</div>
                      <div className="text-xs text-gray-500">{project.hq} / {project.branch}</div>
                    </button>
                  ))
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 달력 기반 기간 선택 모달 */}
      {showDateSelectionModal && selectedProjectForReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">기간 선택</h3>
                <button
                  onClick={() => {
                    setShowDateSelectionModal(false)
                    setSelectedProjectForReport(null)
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">{selectedProjectForReport.name}</p>
                <p className="text-xs text-blue-600">{selectedProjectForReport.hq} / {selectedProjectForReport.branch}</p>
              </div>

              {/* 달력 네비게이션 */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => {
                    const newMonth = new Date(calendarMonth)
                    newMonth.setMonth(newMonth.getMonth() - 1)
                    setCalendarMonth(newMonth)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <ChevronRight className="h-5 w-5 transform rotate-180" />
                </button>
                <span className="font-medium text-gray-900">
                  {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
                </span>
                <button
                  onClick={() => {
                    const newMonth = new Date(calendarMonth)
                    newMonth.setMonth(newMonth.getMonth() + 1)
                    setCalendarMonth(newMonth)
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* 안내 메시지 */}
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                <p className="text-sm font-medium text-yellow-800">
                  {!reportStartDate || (reportStartDate && reportEndDate)
                    ? '📅 시작일을 선택하세요'
                    : '📅 마지막 일자를 선택하세요'}
                </p>
              </div>

              {/* 달력 */}
              <div className="mb-4">
                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 mb-2">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <div key={day} className={`text-center text-xs font-medium py-1 ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                      {day}
                    </div>
                  ))}
                </div>

                {/* 달력 날짜 */}
                <div className="grid grid-cols-7">
                  {(() => {
                    const year = calendarMonth.getFullYear()
                    const month = calendarMonth.getMonth()
                    const firstDay = new Date(year, month, 1).getDay()
                    const lastDate = new Date(year, month + 1, 0).getDate()
                    const days: (number | null)[] = []

                    // 이전 달 빈 칸
                    for (let i = 0; i < firstDay; i++) {
                      days.push(null)
                    }
                    // 현재 달 날짜
                    for (let i = 1; i <= lastDate; i++) {
                      days.push(i)
                    }

                    return days.map((day, idx) => {
                      if (day === null) {
                        return <div key={idx} className="h-9" />
                      }

                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const hasSubmission = tbmSubmissionDates.includes(dateStr)
                      const isStart = reportStartDate === dateStr
                      const isEnd = reportEndDate === dateStr
                      const isInRange = reportStartDate && reportEndDate && dateStr >= reportStartDate && dateStr <= reportEndDate
                      const isSingleDay = isStart && isEnd

                      // 연결 배경선 스타일 결정
                      let bgStyle = ''
                      if (isSingleDay) {
                        bgStyle = 'bg-blue-600 rounded-full'
                      } else if (isStart) {
                        bgStyle = 'bg-blue-600 rounded-l-full'
                      } else if (isEnd) {
                        bgStyle = 'bg-blue-600 rounded-r-full'
                      } else if (isInRange) {
                        bgStyle = 'bg-blue-200'
                      }

                      // 텍스트 색상 결정
                      const textColor = (isStart || isEnd)
                        ? 'text-white font-bold'
                        : isInRange
                          ? 'text-blue-800'
                          : idx % 7 === 0
                            ? 'text-red-500'
                            : idx % 7 === 6
                              ? 'text-blue-500'
                              : 'text-gray-700'

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            // 시작일이 없거나, 이미 시작일과 종료일이 모두 있으면 시작일 설정
                            if (!reportStartDate || (reportStartDate && reportEndDate)) {
                              setReportStartDate(dateStr)
                              setReportEndDate('')
                            } else {
                              // 시작일만 있으면 종료일 설정
                              if (dateStr < reportStartDate) {
                                setReportEndDate(reportStartDate)
                                setReportStartDate(dateStr)
                              } else {
                                setReportEndDate(dateStr)
                              }
                            }
                          }}
                          className={`h-9 w-full text-sm relative transition-colors hover:opacity-80 ${bgStyle} ${textColor}`}
                        >
                          {day}
                          {hasSubmission && (
                            <span className={`absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full ${isStart || isEnd ? 'bg-white' : 'bg-green-500'}`} />
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>

                {/* 범례 */}
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span>TBM 제출일</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-6 h-3 bg-blue-600 rounded-full" />
                    <span>선택 범위</span>
                  </div>
                </div>
              </div>

              {/* 선택된 기간 표시 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-500">시작일:</span>
                    <span className="ml-2 font-medium text-gray-900">{reportStartDate || '-'}</span>
                  </div>
                  <span className="text-gray-400">~</span>
                  <div>
                    <span className="text-gray-500">종료일:</span>
                    <span className="ml-2 font-medium text-gray-900">{reportEndDate || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 빠른 선택 버튼 */}
              <div className="flex gap-2 mb-4">
                {[
                  { label: '1일', days: 1 },
                  { label: '7일', days: 7 },
                  { label: '한달', days: 30 },
                  { label: '2달', days: 60 },
                ].map(({ label, days }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const endDate = new Date(selectedDate)
                      const startDate = new Date(endDate)
                      startDate.setDate(endDate.getDate() - days + 1)
                      setReportStartDate(startDate.toISOString().split('T')[0])
                      setReportEndDate(selectedDate)
                    }}
                    className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDateSelectionModal(false)
                    setSelectedProjectForReport(null)
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    if (!reportStartDate || !reportEndDate) {
                      alert('시작일과 종료일을 모두 선택해주세요.')
                      return
                    }
                    setShowDateSelectionModal(false)
                    setShowOptionsModal(true)
                  }}
                  disabled={!reportStartDate || !reportEndDate}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 옵션 선택 모달 (공사감독 이름 + AI 사용 여부 + 서명) */}
      {showOptionsModal && selectedProjectForReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">공사감독일지 옵션</h2>
                <button
                  onClick={() => {
                    setShowOptionsModal(false)
                    setSelectedProjectForReport(null)
                    setSupervisorName('')
                    setSupervisorSignature('')
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* 사업 정보 */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">{selectedProjectForReport.name}</p>
                <p className="text-xs text-blue-600">{reportStartDate} ~ {reportEndDate}</p>
              </div>

              <div className="space-y-6">
                {/* 공사감독 이름 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    공사감독 이름
                  </label>
                  <input
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* AI 사용 여부 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    작성 방식 선택
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="useAI"
                        checked={useAI}
                        onChange={() => setUseAI(true)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-900">AI작성 (시간 걸림, 서명별도)</p>
                        <p className="text-sm text-gray-500">AI가 공사기록과 기록사항을 작성합니다. 서명란은 공란입니다.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="useAI"
                        checked={!useAI}
                        onChange={() => setUseAI(false)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-900">DB만 입력 (빠름, 서명포함)</p>
                        <p className="text-sm text-gray-500">
                          AI 없이 TBM 데이터 값만 입력합니다.<br />
                          - 공사추진내용: 금일작업<br />
                          - 공사기록: 공란<br />
                          - 기록사항: 투입인원, 투입장비<br />
                          - 기타: 기타사항
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 서명 (새 방법일 때만 표시) */}
                {!useAI && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        서명
                      </label>
                      {/* 지우개 버튼 (레이블 우측) */}
                      <button
                        onClick={() => {
                          const canvas = document.getElementById('supervisor-signature-canvas') as HTMLCanvasElement
                          const ctx = canvas?.getContext('2d')
                          if (ctx) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height)
                            setSupervisorSignature('')
                          }
                        }}
                        className="p-2 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
                        title="다시 작성"
                      >
                        <svg
                          className="w-5 h-5 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="border-2 border-gray-300 rounded-lg bg-gray-50">
                      <canvas
                        id="supervisor-signature-canvas"
                        ref={(canvas) => {
                          if (canvas && !canvas.dataset.initialized) {
                            canvas.dataset.initialized = 'true'
                            const ctx = canvas.getContext('2d')
                            if (ctx) {
                              ctx.clearRect(0, 0, canvas.width, canvas.height)
                            }
                          }
                        }}
                        width={600}
                        height={300}
                        className="w-full bg-white rounded-lg cursor-crosshair touch-none"
                        style={{ touchAction: 'none' }}
                        onMouseDown={(e) => {
                          const canvas = e.currentTarget
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const x = (e.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (e.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.beginPath()
                          ctx.moveTo(x, y)
                          canvas.dataset.drawing = 'true'
                        }}
                        onMouseMove={(e) => {
                          const canvas = e.currentTarget
                          if (canvas.dataset.drawing !== 'true') return
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const x = (e.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (e.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.lineWidth = 3
                          ctx.lineCap = 'round'
                          ctx.strokeStyle = '#000000'
                          ctx.lineTo(x, y)
                          ctx.stroke()
                        }}
                        onMouseUp={(e) => {
                          const canvas = e.currentTarget
                          canvas.dataset.drawing = 'false'
                          setSupervisorSignature(canvas.toDataURL())
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.dataset.drawing = 'false'
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault()
                          const canvas = e.currentTarget
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const touch = e.touches[0]
                          const rect = canvas.getBoundingClientRect()
                          const x = (touch.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (touch.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.beginPath()
                          ctx.moveTo(x, y)
                          canvas.dataset.drawing = 'true'
                        }}
                        onTouchMove={(e) => {
                          e.preventDefault()
                          const canvas = e.currentTarget
                          if (canvas.dataset.drawing !== 'true') return
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const touch = e.touches[0]
                          const rect = canvas.getBoundingClientRect()
                          const x = (touch.clientX - rect.left) * (canvas.width / rect.width)
                          const y = (touch.clientY - rect.top) * (canvas.height / rect.height)
                          ctx.lineWidth = 3
                          ctx.lineCap = 'round'
                          ctx.strokeStyle = '#000000'
                          ctx.lineTo(x, y)
                          ctx.stroke()
                        }}
                        onTouchEnd={(e) => {
                          const canvas = e.currentTarget
                          canvas.dataset.drawing = 'false'
                          setSupervisorSignature(canvas.toDataURL())
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 버튼 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowOptionsModal(false)
                      setSelectedProjectForReport(null)
                      setSupervisorName('')
                      setSupervisorSignature('')
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!supervisorName.trim()) {
                        alert('공사감독 이름을 입력해주세요.')
                        return
                      }
                      if (!useAI && !supervisorSignature) {
                        alert('서명을 해주세요.')
                        return
                      }
                      if (!selectedProjectForReport) return

                      // TBM 데이터 조회
                      const { data: tbmSubmissions, error } = await supabase
                        .from('tbm_submissions')
                        .select('*')
                        .eq('project_name', selectedProjectForReport.name)
                        .eq('headquarters', selectedProjectForReport.hq)
                        .eq('branch', selectedProjectForReport.branch)
                        .gte('meeting_date', reportStartDate)
                        .lte('meeting_date', reportEndDate)
                        .order('meeting_date', { ascending: true })

                      if (error) {
                        console.error('TBM 데이터 조회 오류:', error)
                        alert('데이터 조회 중 오류가 발생했습니다.')
                        return
                      }

                      if (!tbmSubmissions || tbmSubmissions.length === 0) {
                        alert(`선택한 기간에 TBM 제출 내역이 없습니다.`)
                        return
                      }

                      // 위경도 가져오기 (첫날부터 순차적으로 확인)
                      let latitude: number | undefined
                      let longitude: number | undefined
                      for (const submission of tbmSubmissions) {
                        if (submission.latitude && submission.longitude) {
                          latitude = submission.latitude
                          longitude = submission.longitude
                          break
                        }
                      }

                      setShowOptionsModal(false)
                      setIsDownloadingReport(true)
                      cancelReportRef.current = false

                      try {
                        await generateSupervisorDiaryExcel(
                          selectedProjectForReport.name,
                          reportStartDate,
                          reportEndDate,
                          tbmSubmissions,
                          (current, total, status, subStatus) => {
                            if (cancelReportRef.current) {
                              throw new Error('사용자가 보고서 생성을 취소했습니다.')
                            }
                            setReportProgress({ current, total })
                            setReportStatus(status || '')
                            setReportSubStatus(subStatus || '')
                          },
                          supervisorName,
                          useAI ? '' : supervisorSignature, // AI 모드면 서명 없음
                          latitude,
                          longitude,
                          useAI // AI 사용 여부 전달
                        )

                        // 초기화
                        setSelectedProjectForReport(null)
                        setReportStartDate('')
                        setReportEndDate('')
                        setSupervisorName('')
                        setSupervisorSignature('')
                        setUseAI(true)
                      } catch (error) {
                        console.error('다운로드 오류:', error)
                        if (!cancelReportRef.current) {
                          alert('다운로드 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
                        }
                      } finally {
                        setIsDownloadingReport(false)
                        setReportProgress({ current: 0, total: 0 })
                        setReportStatus('')
                        setReportSubStatus('')
                        cancelReportRef.current = false
                      }
                    }}
                    disabled={!supervisorName.trim() || (!useAI && !supervisorSignature)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 공사감독일지 다운로드 기간 선택 모달 (기존 - 유지) */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">공사감독일지 다운로드 기간 선택</h3>
                <button
                  onClick={() => setShowReportModal(false)}
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
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    min={reportStartDate}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />

                  {/* 빠른 기간 선택 버튼 (TBM 선택 날짜 기준) */}
                  <div className="flex gap-2 mt-2">
                    {[
                      { label: '1일', days: 1 },
                      { label: '7일', days: 7 },
                      { label: '한달', days: 30 },
                      { label: '2달', days: 60 },
                    ].map(({ label, days }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const endDate = new Date(selectedDate)
                          const startDate = new Date(endDate)
                          startDate.setDate(endDate.getDate() - days + 1)
                          setReportStartDate(startDate.toISOString().split('T')[0])
                          setReportEndDate(selectedDate)
                        }}
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  기간을 선택한 후 확인을 누르면, TBM 내역에서 다운로드할 사업을 클릭하세요.
                </p>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    if (!reportStartDate || !reportEndDate) {
                      alert('시작일과 종료일을 모두 선택해주세요.')
                      return
                    }
                    // 보고서 모드 활성화
                    setReportModeActive(true)
                    setShowReportModal(false)
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  확인
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 공사감독 서명 모달 */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">공사감독 서명</h2>
                <button
                  onClick={() => {
                    setShowSignatureModal(false)
                    setSupervisorName('')
                    setSupervisorSignature('')
                    setPendingReportData(null)
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* 공사감독 이름 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    공사감독 이름
                  </label>
                  <input
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 서명 캔버스 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    서명
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                    <canvas
                      ref={(canvas) => {
                        if (canvas && !canvas.dataset.initialized) {
                          canvas.dataset.initialized = 'true'
                          const ctx = canvas.getContext('2d')
                          if (ctx) {
                            // 투명 배경 설정
                            ctx.clearRect(0, 0, canvas.width, canvas.height)
                          }
                        }
                      }}
                      width={600}
                      height={200}
                      className="w-full bg-white rounded cursor-crosshair touch-none"
                      onMouseDown={(e) => {
                        const canvas = e.currentTarget
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        const rect = canvas.getBoundingClientRect()
                        const x = (e.clientX - rect.left) * (canvas.width / rect.width)
                        const y = (e.clientY - rect.top) * (canvas.height / rect.height)
                        ctx.beginPath()
                        ctx.moveTo(x, y)
                        canvas.dataset.drawing = 'true'
                      }}
                      onMouseMove={(e) => {
                        const canvas = e.currentTarget
                        if (canvas.dataset.drawing !== 'true') return
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        const rect = canvas.getBoundingClientRect()
                        const x = (e.clientX - rect.left) * (canvas.width / rect.width)
                        const y = (e.clientY - rect.top) * (canvas.height / rect.height)
                        ctx.lineWidth = 3
                        ctx.lineCap = 'round'
                        ctx.strokeStyle = '#000000'
                        ctx.lineTo(x, y)
                        ctx.stroke()
                      }}
                      onMouseUp={(e) => {
                        const canvas = e.currentTarget
                        canvas.dataset.drawing = 'false'
                        setSupervisorSignature(canvas.toDataURL())
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.dataset.drawing = 'false'
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        const canvas = e.currentTarget
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        const touch = e.touches[0]
                        const rect = canvas.getBoundingClientRect()
                        const x = (touch.clientX - rect.left) * (canvas.width / rect.width)
                        const y = (touch.clientY - rect.top) * (canvas.height / rect.height)
                        ctx.beginPath()
                        ctx.moveTo(x, y)
                        canvas.dataset.drawing = 'true'
                      }}
                      onTouchMove={(e) => {
                        e.preventDefault()
                        const canvas = e.currentTarget
                        if (canvas.dataset.drawing !== 'true') return
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        const touch = e.touches[0]
                        const rect = canvas.getBoundingClientRect()
                        const x = (touch.clientX - rect.left) * (canvas.width / rect.width)
                        const y = (touch.clientY - rect.top) * (canvas.height / rect.height)
                        ctx.lineWidth = 3
                        ctx.lineCap = 'round'
                        ctx.strokeStyle = '#000000'
                        ctx.lineTo(x, y)
                        ctx.stroke()
                      }}
                      onTouchEnd={(e) => {
                        const canvas = e.currentTarget
                        canvas.dataset.drawing = 'false'
                        setSupervisorSignature(canvas.toDataURL())
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const canvas = e.currentTarget.previousElementSibling as HTMLCanvasElement
                        const ctx = canvas?.getContext('2d')
                        if (ctx) {
                          // 투명 배경으로 클리어
                          ctx.clearRect(0, 0, canvas.width, canvas.height)
                          setSupervisorSignature('')
                        }
                      }}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      다시 작성
                    </button>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowSignatureModal(false)
                      setSupervisorName('')
                      setSupervisorSignature('')
                      setPendingReportData(null)
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!supervisorName.trim()) {
                        alert('공사감독 이름을 입력해주세요.')
                        return
                      }
                      if (!supervisorSignature) {
                        alert('서명을 해주세요.')
                        return
                      }
                      if (!pendingReportData) return

                      setShowSignatureModal(false)
                      setIsDownloadingReport(true)
                      cancelReportRef.current = false // 취소 플래그 초기화

                      try {
                        await generateSupervisorDiaryExcel(
                          pendingReportData.projectName,
                          reportStartDate,
                          reportEndDate,
                          pendingReportData.tbmSubmissions,
                          (current, total, status, subStatus) => {
                            // 취소 확인
                            if (cancelReportRef.current) {
                              throw new Error('사용자가 보고서 생성을 취소했습니다.')
                            }
                            setReportProgress({ current, total })
                            setReportStatus(status || '')
                            setReportSubStatus(subStatus || '')
                          },
                          supervisorName,
                          supervisorSignature,
                          pendingReportData.latitude,
                          pendingReportData.longitude,
                          true // 기존 모달은 항상 AI 사용
                        )

                        setReportModeActive(false)
                        setReportStartDate('')
                        setReportEndDate('')
                        setSupervisorName('')
                        setSupervisorSignature('')
                        setPendingReportData(null)
                      } catch (error) {
                        console.error('다운로드 오류:', error)
                        if (!cancelReportRef.current) {
                          alert('다운로드 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
                        }
                      } finally {
                        setIsDownloadingReport(false)
                        setReportProgress({ current: 0, total: 0 })
                        setReportStatus('')
                        setReportSubStatus('')
                        cancelReportRef.current = false
                      }
                    }}
                    disabled={!supervisorName.trim() || !supervisorSignature}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TBMStatus