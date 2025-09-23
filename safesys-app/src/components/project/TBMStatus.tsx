'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, Calendar, Users, FileText, ChevronRight, AlertTriangle, Building2, Eye, Video, RefreshCw, ArrowUp } from 'lucide-react'
import KakaoMap from '@/components/ui/KakaoMap'
import { getTBMRecords, getTBMStats, type TBMRecord } from '@/lib/tbm'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// TBMRecord와 TBMStats는 lib/tbm.ts에서 import하므로 제거

interface TBMStatusProps {
  projects: any[]
  selectedHq?: string
  selectedBranch?: string
  onProjectClick?: (project: any) => void
  onBranchSelect?: (branchName: string) => void
  onHqSelect?: (hqName: string) => void
}

const TBMStatus: React.FC<TBMStatusProps> = ({
  projects,
  selectedHq,
  selectedBranch,
  onProjectClick,
  onBranchSelect,
  onHqSelect
}) => {
  const { userProfile } = useAuth()
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
  const [error, setError] = useState<string>('')
  const [navigationModal, setNavigationModal] = useState<{
    isOpen: boolean
    address: string
  }>({
    isOpen: false,
    address: ''
  })
  const [focusedProjectId, setFocusedProjectId] = useState<string | undefined>()
  const [hoveredBranchName, setHoveredBranchName] = useState<string | undefined>()
  const [hoveredHqName, setHoveredHqName] = useState<string | undefined>()
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
  
  // 프로그레스 바 상태
  const [timeRemaining, setTimeRemaining] = useState<number>(15 * 60) // 15분 = 900초
  const [progressPercentage, setProgressPercentage] = useState<number>(100)
  // 전체 화면/리사이즈 대응을 위한 가용 높이 계산
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const [dynamicContainerHeight, setDynamicContainerHeight] = useState<number>(500)

  // 필터링된 프로젝트 (사용되지 않음)
  // const filteredProjects = projects.filter(project => {
  //   if (selectedHq && project.managing_hq !== selectedHq) return false
  //   if (selectedBranch && project.managing_branch !== selectedBranch) return false
  //   return true
  // })

  // 지도용 프로젝트 데이터 (TBM 기록에서 추출) - useMemo로 최적화
  const projectsForMap = React.useMemo(() => {
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
      managingBranch: record.managing_branch
    }))
    
    console.log('지도용 프로젝트 데이터:', mapped)
    return mapped
  }, [tbmRecords])

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
        riskWorkCount: 0,
        cctvUsageCount: 0
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
  }, [tbmRecords, selectedHq, selectedBranch])

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
        riskWorkCount: 0,
        cctvUsageCount: 0
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
          riskWorkCount: 0,
          cctvUsageCount: 0
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
  }, [tbmRecords, selectedHq, selectedBranch])

  // 현재 분기
  const currentQuarter = React.useMemo(() => {
    const month = new Date().getMonth() + 1
    return Math.ceil(month / 3)
  }, [])

  // 분기 공사중 프로젝트 수: 본부/지사별 집계
  const activeQuarterCountByHq = React.useMemo(() => {
    const map = new Map<string, number>()
    ;(projects || []).forEach((p: any) => {
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
    ;(projects || []).forEach((p: any) => {
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

    return {
      totalTBM,
      totalRiskWork,
      totalCCTV
    }
  }, [tbmRecords, selectedHq, selectedBranch])

  // 동적 높이 및 테이블 행 높이 계산
  const { containerHeight, tableRowHeight } = React.useMemo(() => {
    const isShowingBranchStats = selectedHq && !selectedBranch && branchStats.length > 0
    const isShowingHqStats = !selectedHq && !selectedBranch && hqStats.length > 0
    
    if (isShowingBranchStats && branchStats.length > 0) {
      // 가용 높이 기반 컨테이너 높이
      const baseHeight = Math.max(400, dynamicContainerHeight)
      
      // 좌측 지도 프레임의 실제 높이 계산
      // 지도 컨테이너 전체 높이(500px) - 지도 패널 헤더(57px) = 지도 프레임 높이(443px)
      const mapFrameHeight = baseHeight - 57
      
      // 우측 패널에서 테이블 헤더(49px) 제외한 나머지 공간을 행들로 균등 분배
      // 지도 프레임 높이와 동일하게 맞춤
      const availableTableBodyHeight = mapFrameHeight - 49 // 테이블 헤더 49px 제외
      
      // 지사 수에 따라 행 높이를 유동적으로 계산 (최소/최대 제한 없이)
      // 사용 가능한 공간을 지사 수로 나누어 자동 할당
      const calculatedRowHeight = availableTableBodyHeight / branchStats.length
      
      return {
        containerHeight: baseHeight,
        tableRowHeight: calculatedRowHeight
      }
    } else if (isShowingHqStats && hqStats.length > 0) {
      // 본부별 통계 표시 시
      const baseHeight = Math.max(400, dynamicContainerHeight)
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
        containerHeight: Math.max(400, dynamicContainerHeight),
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
    // 날짜가 변경되지 않았고 이미 전체 데이터가 있으면 스킵 (force가 아닌 경우)
    const currentDate = selectedDate
    if (!force && lastLoadedParams.current && 
        lastLoadedParams.current.date === currentDate &&
        allTbmRecords.length > 0) {
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
  }, [selectedDate, allTbmRecords.length])

  // 캐시된 데이터를 필터링하는 함수 (API 호출 없음)
  const filterTBMData = useCallback(() => {
    console.log('캐시된 데이터 필터링 시작:', { selectedHq, selectedBranch, totalRecords: allTbmRecords.length })
    
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
      const hqMatch = !selectedHq || record.managing_hq === selectedHq
      const branchMatch = !selectedBranch || record.managing_branch === selectedBranch
      
      if (selectedHq || selectedBranch) {
        console.log(`레코드 ${record.project_name}: 본부(${record.managing_hq}) vs 선택(${selectedHq}) = ${hqMatch}, 지사(${record.managing_branch}) vs 선택(${selectedBranch}) = ${branchMatch}`)
      }
      
      return hqMatch && branchMatch
    })
    
    console.log('최종 필터링 결과:', filteredRecords.length, '건')
    setTbmRecords(filteredRecords)
  }, [allTbmRecords, selectedHq, selectedBranch])

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
        } catch {}
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
              } catch (error) {
                console.error('프로그레스 타이머 새로고침 중 오류:', error)
              }
            }
          })
          // 타이머 재시작
          setTimeRemaining(15 * 60)
          setProgressPercentage(100)
          return 15 * 60
        }
        
        // 퍼센테지 업데이트 (15분 = 900초 기준)
        const percentage = (newTime / (15 * 60)) * 100
        setProgressPercentage(percentage)
        
        return newTime
      })
    }, 1000)
    
    console.log('TBM 프로그레스 타이머 시작 (15분 간격)')
  }, [loadAllTBMData, filterTBMData, checkSession])

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
      } catch (error) {
        console.error('자동 새로고침 중 오류:', error)
      }
    }, 15 * 60 * 1000) // 15분
    
    console.log('TBM 자동 새로고침 타이머 시작 (15분 간격)')
  }, [loadAllTBMData, filterTBMData, checkSession])

  // 초기 TBM 데이터 로드 (날짜가 변경되거나 최초 로드 시에만)
  useEffect(() => {
    loadTBMData()
  }, [selectedDate]) // selectedHq, selectedBranch 제거

  // 본부/지사 선택이 변경될 때는 캐시된 데이터만 필터링
  useEffect(() => {
    if (allTbmRecords.length > 0) {
      console.log('본부/지사 변경으로 인한 필터링 실행')
      filterTBMData()
    }
  }, [selectedHq, selectedBranch, filterTBMData])

  // 컴포넌트 마운트 시 자동 새로고침과 프로그레스 타이머 시작
  useEffect(() => {
    startAutoRefresh()
    startProgressTimer()
    
    // cleanup: 컴포넌트 언마운트 시 interval 정리
    return () => {
      stopAutoRefresh()
      stopProgressTimer()
    }
  }, [startAutoRefresh, stopAutoRefresh, startProgressTimer, stopProgressTimer])

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
    } else if (selectedHq && project.managingBranch && onBranchSelect) {
      // 이미 본부가 선택된 상태에서는 지사만 선택
      console.log('본부 선택된 상태에서 지사 선택:', project.managingBranch)
      onBranchSelect(project.managingBranch)
    }
  }

  const handleTBMRecordClick = (record: TBMRecord) => {
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

  const handleCellClick = (title: string, content: string, projectName: string, event: React.MouseEvent) => {
    event.stopPropagation() // 행 클릭 이벤트 방지
    
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

  const handleManualRefresh = async () => {
    console.log('수동 새로고침 실행 - interval 리셋')
    
    // 세션 체크 먼저 수행
    const hasValidSession = await checkSession()
    if (!hasValidSession) {
      return
    }
    
    try {
      await loadAllTBMData(true, true) // force=true, resetInterval=true
      filterTBMData() // 새로고침 후 현재 필터 적용
      // 프로그레스 타이머도 리셋
      startProgressTimer()
    } catch (error) {
      console.error('수동 새로고침 중 오류:', error)
    }
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

  return (
    <div 
      className="space-y-6"
      onClick={handleContainerClick}
    >
      {/* 헤더와 통계카드 통합 */}
      <div className="relative bg-white/80 backdrop-blur rounded-lg border border-white/20 shadow-sm p-3 lg:p-4 overflow-hidden">
        {/* 모바일: 세로 배치 */}
        <div className="lg:hidden space-y-4">
          <div className="flex flex-col space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Activity className="h-5 w-5 text-blue-600 mr-2" />
                  TBM 현황
                </h3>
                {userProfile?.branch_division?.endsWith('본부') && (selectedHq || selectedBranch) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedBranch && onBranchSelect) {
                        onBranchSelect('')
                      } else if (selectedHq && onHqSelect) {
                        onHqSelect('')
                      }
                    }}
                    className="inline-flex items-center px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                    title="상위로 이동"
                  >
                    <ArrowUp className="h-4 w-4 mr-1" /> 상위 이동
                  </button>
                )}
              </div>
              <div className="mt-1">
                <p className="text-sm text-gray-600 m-0">
                  Tool Box Meeting 현황을 확인할 수 있습니다.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled
                title="추후 일자 변경 제공 예정"
                className="border border-gray-300 rounded-md px-2 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* 데스크톱: 가로 배치 (헤더 + 통계카드) */}
        <div className="hidden lg:flex lg:justify-between lg:items-center">
          <div className="flex-1 mr-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                <Activity className="h-6 w-6 text-blue-600 mr-2" />
                TBM 현황
              </h3>
              {userProfile?.branch_division?.endsWith('본부') && (selectedHq || selectedBranch) && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedBranch && onBranchSelect) {
                      onBranchSelect('')
                    } else if (selectedHq && onHqSelect) {
                      onHqSelect('')
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
                  title="상위로 이동"
                >
                  <ArrowUp className="h-4 w-4 mr-1" /> 상위 이동
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4">
              <p className="text-base text-gray-600 m-0">
                Tool Box Meeting 현황을 확인할 수 있습니다.
              </p>
              {/* 일자 선택 - 헤더 아래 행으로 배치 */}
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  disabled
                  title="추후 일자 변경 제공 예정"
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* 데스크톱 통계카드 (본부/지사별 통계 표시) */}
          {!selectedBranch && (
            <div className="flex-shrink-0 relative">
              <div className="grid grid-cols-5 gap-3">
                <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-3 min-w-[120px]">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex-shrink-0 mb-2">
                      <Activity className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">{currentQuarter}분기 공사중</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {loading ? '-' : `${activeQuarterTotal}지구`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-3 min-w-[120px]">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex-shrink-0 mb-2">
                      <Activity className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">TBM수</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {loading ? '-' : totalStats.totalTBM}건
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-red-50 rounded-lg shadow-sm border border-red-200 p-3 min-w-[120px]">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex-shrink-0 mb-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">위험공종수</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {loading ? '-' : totalStats.totalRiskWork}건
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-3 min-w-[120px]">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex-shrink-0 mb-2">
                      <Video className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">CCTV 사용수</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {loading ? '-' : totalStats.totalCCTV}지구
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-3 min-w-[120px]">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex-shrink-0 mb-2">
                      <Eye className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">CCTV 도입율</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {loading ? '-' : totalStats.totalTBM > 0 ? `${Math.round((totalStats.totalCCTV / totalStats.totalTBM) * 100)}%` : '0%'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
          )}
        </div>

        {/* 데이터 새로고침 프로그레스 바 (컨테이너 하단 테두리처럼) */}
        <div className="absolute bottom-0 left-0 right-0 group">
          <div 
            className="w-full h-3 bg-gray-200/50 cursor-pointer hover:h-4 transition-all duration-200 rounded-b-lg"
            onClick={handleManualRefresh}
            title={`자동 새로고침 ${Math.round(progressPercentage)}% | 클릭하여 즉시 새로고침`}
          >
            <div 
              className="h-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-1000 ease-linear group-hover:from-blue-500 group-hover:to-blue-600 rounded-b-lg"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          
          {loading && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <RefreshCw className="h-3 w-3 animate-spin text-gray-600" />
            </div>
          )}
          
          {/* 호버 시 정보 표시 */}
          <div className="absolute bottom-full right-4 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            자동 새로고침 {Math.round(progressPercentage)}% | {formatTime(timeRemaining)} 남음
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
          </div>
        </div>
      </div>



      {/* 특정 지사 선택 시 레이아웃: 모바일에서는 세로 배치, 데스크톱에서는 가로 배치 */}
      {selectedHq && selectedBranch && (
        <div className="space-y-6">
            {/* 모바일: 통계 카드들을 상단에 1줄 수평 배치 */}
          <div className="lg:hidden">
            <div className="grid grid-cols-5 gap-1">
                <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-2">
                  <div className="flex flex-col items-center justify-center text-center">
                  <Activity className="h-5 w-5 text-green-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {currentQuarter}분기<br/>공사중
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{loading ? '-' : `${activeQuarterTotal}지구`}</p>
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
                     CCTV<br/>사용
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
          <div className="hidden lg:grid grid-cols-2 gap-6">
            {/* 좌측 1/2: 지도 */}
            <div className="col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <Users className="h-4 w-4 mr-2 text-blue-600" />
                    {selectedBranch} 현장위치
                  </h4>
                </div>
                <div className="relative" style={{ height: '200px' }}>
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
                    onProjectClick={handleMapProjectClick}
                    height="200px"
                    className="w-full"
                    focusedProjectId={focusedProjectId}
                    showRadar={false}
                    disableHover={!!selectedBranch}
                    showLegend={false}
                    key={`small-map-${selectedBranch}-${projectsForMap.length}`}
                  />
                </div>
              </div>
            </div>

            {/* 우측 1/2: 통계 카드들 (1줄 수평 배치) */}
            <div className="col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <Activity className="h-4 w-4 mr-2 text-blue-600" />
                    {selectedBranch} 통계
                  </h4>
                </div>
                <div className="grid grid-cols-5 gap-0 h-[200px]">
                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-center p-3">
                    <Activity className="h-8 w-8 text-green-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">{currentQuarter}분기 공사중</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : `${activeQuarterTotal}지구`}
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-center p-3">
                    <Activity className="h-8 w-8 text-blue-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">TBM 수</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalTBM}건
                    </p>
                  </div>
                  
                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-center p-3">
                    <AlertTriangle className="h-8 w-8 text-red-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">위험공종수</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalRiskWork}건
                    </p>
                  </div>

                  <div className="bg-white border-r border-gray-200 flex flex-col items-center justify-center p-3">
                    <Video className="h-8 w-8 text-blue-600 mb-2" />
                    <p className="text-xs font-medium text-gray-500 mb-1 text-center">CCTV 사용수</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {loading ? '-' : totalStats.totalCCTV}지구
                    </p>
                  </div>

                  <div className="bg-white flex flex-col items-center justify-center p-3">
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
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h4 className="text-sm font-medium text-gray-900 flex items-center">
                <FileText className="h-4 w-4 mr-2 text-blue-600" />
                {selectedBranch} TBM 상세 현황
              </h4>
            </div>
            <div className="overflow-x-auto lg:overflow-x-visible max-h-96 lg:max-h-none overflow-y-auto">
              <table className="w-full divide-y divide-gray-200 lg:table-fixed lg:min-w-full">
                <thead className="sticky top-0 z-10 bg-gray-100/90 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                  <tr>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16 lg:w-[5%] border-r border-gray-100">No</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[8%] border-r border-gray-100">사업명</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] lg:min-w-0 lg:w-[26%] border-r border-gray-100">작업내용</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] lg:min-w-0 lg:w-[26%] border-r border-gray-100">교육내용</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] lg:min-w-0 lg:w-[12%] border-r border-gray-100">회사명</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[8%] border-r border-gray-100">주소</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[6%] border-r border-gray-100">투입인원</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] lg:min-w-0 lg:w-[6%] border-r border-gray-100">투입장비</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] lg:min-w-0 lg:w-[8%] border-r border-gray-100">위험공종</th>
                    <th className="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] lg:min-w-0 lg:w-[8%]">소장이름</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tbmRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
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
                      className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      onClick={() => handleTBMRecordClick(record)}
                    >
                      <td className="px-1 py-1 text-sm font-medium text-gray-900 text-center border-r border-gray-100">
                        {index + 1}
                      </td>
                      <td className="px-1 py-1 text-sm font-medium text-gray-900 border-r border-gray-100">
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
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
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
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
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
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
                        <div 
                          className="max-w-[120px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden" 
                          onClick={(e) => handleCellClick('회사명', record.construction_company, record.project_name, e)}
                        >
                          <span className="lg:hidden block truncate">{record.construction_company}</span>
                          <span className="hidden lg:block whitespace-pre-wrap leading-tight">{record.construction_company}</span>
                        </div>
                      </td>
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
                        <div 
                          className="w-full cursor-pointer text-blue-600 hover:text-blue-800 hover:underline overflow-hidden break-words" 
                          style={{ 
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            maxHeight: '2.5rem',
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
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
                        <div 
                          className="max-w-[80px] lg:max-w-none lg:w-full text-center cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden h-full" 
                          onClick={(e) => handleCellClick('투입인원', record.attendees || '-', record.project_name, e)}
                        >
                          <span className="lg:hidden block truncate">
                            {(() => {
                              const content = record.attendees || '-';
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
                              title={`투입인원: ${record.attendees || '-'}`}
                            >
                              {record.attendees || '-'}
                            </div>
                          </span>
                        </div>
                      </td>
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
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
                      <td className="px-1 py-1 text-sm text-gray-900 border-r border-gray-100">
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
                      <td className="px-1 py-1 text-sm text-gray-900">
                        <div 
                          className="max-w-[100px] lg:max-w-none lg:w-full cursor-pointer hover:bg-gray-100 rounded p-0.5 -m-0.5 overflow-hidden text-center"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (record.contact) {
                              window.location.href = `tel:${record.contact}`
                            }
                          }}
                        >
                          {record.contact ? (
                            <span className="text-blue-600 font-medium truncate block" title={`${record.leader} (${record.contact}) - 클릭하여 전화걸기`}>
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
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-900 flex items-center">
                  <Users className="h-4 w-4 mr-2 text-blue-600" />
                  {selectedBranch} 현장위치
                </h4>
              </div>
              <div className="relative" style={{ height: '300px' }}>
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
                  onProjectClick={handleMapProjectClick}
                  height="300px"
                  className="w-full"
                  focusedProjectId={focusedProjectId}
                  showRadar={false}
                  disableHover={!!selectedBranch}
                  showLegend={false}
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
            {/* 모바일: 통계 카드 */}
            {!selectedBranch && (
              <div className="grid grid-cols-5 gap-1">
                <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-2">
                  <div className="flex flex-col items-center justify-center text-center">
                  <Activity className="h-5 w-5 text-green-600 mb-1" />
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {currentQuarter}분기<br/>공사중
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{loading ? '-' : `${activeQuarterTotal}지구`}</p>
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
                     CCTV<br/>사용
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
            )}

            {/* 모바일: 지사별 통계 테이블 또는 TBM 기록 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-900 flex items-center">
                  {!selectedHq && !selectedBranch ? (
                    <>
                      <Building2 className="h-4 w-4 mr-2 text-blue-600" />
                      본부별 TBM 현황
                    </>
                  ) : selectedHq && !selectedBranch ? (
                    <>
                      <Building2 className="h-4 w-4 mr-2 text-blue-600" />
                      {selectedHq} 지사별 TBM 현황
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2 text-blue-600" />
                      TBM 기록 (오늘)
                    </>
                  )}
                </h4>
              </div>
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-sm text-gray-600">데이터 로딩 중...</p>
                  </div>
                ) : !selectedHq && !selectedBranch && hqStats.length > 0 ? (
                  // 본부별 통계 테이블 (모바일 버전)
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          본부명
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TBM수
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          위험공종
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          CCTV
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          도입율
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {hqStats.map((stats) => (
                        <tr 
                          key={stats.hqName} 
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleHqClick(stats.hqName)}
                          onMouseEnter={() => handleHqRowMouseEnter(stats.hqName)}
                          onMouseLeave={handleHqRowMouseLeave}
                        >
                          <td className="px-2 py-1 text-sm font-medium text-gray-900">
                            <div className="max-w-[80px] truncate">
                              {stats.hqName}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900 font-semibold">
                            {stats.tbmCount === 0 ? '-' : `${stats.tbmCount}건`}
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900">
                            {stats.riskWorkCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {stats.riskWorkCount}건
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900">
                            {stats.cctvUsageCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">
                                <span className="text-xs">{stats.cctvUsageCount}</span><span className="text-[10px]">지구</span>
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900 font-semibold">
                            {stats.tbmCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
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
                ) : selectedHq && !selectedBranch ? (
                  // 지사별 통계 테이블 (모바일 버전)
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          지사명
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TBM수
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          위험공종
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          CCTV
                        </th>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          도입율
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {branchStats.map((stats) => (
                        <tr 
                          key={stats.branchName} 
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleBranchClick(stats.branchName)}
                        >
                          <td className="px-2 py-1 text-sm font-medium text-gray-900">
                            <div className="max-w-[80px] truncate">
                              {stats.branchName}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900 font-semibold">
                            {stats.tbmCount === 0 ? '-' : `${stats.tbmCount}건`}
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900">
                            {stats.riskWorkCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {stats.riskWorkCount}건
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900">
                            {stats.cctvUsageCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">
                                <span className="text-xs">{stats.cctvUsageCount}</span><span className="text-[10px]">지구</span>
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-sm text-gray-900 font-semibold">
                            {stats.tbmCount === 0 ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
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
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleTBMRecordClick(record)}
                      >
                        <div className="flex items-start justify-between">
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
            </div>

            {/* 모바일: 지도 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-900 flex items-center">
                  <Users className="h-4 w-4 mr-2 text-blue-600" />
                  TBM 진행 현장 위치
                </h4>
              </div>
              <div className="relative" style={{ height: '400px' }}>
                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                  </div>
                ) : null}
                <KakaoMap
                  projects={projectsForMap}
                  onProjectClick={handleMapProjectClick}
                  height="400px"
                  className="w-full"
                  focusedProjectId={focusedProjectId}
                  showRadar={false}
                  disableHover={!!selectedBranch}
                  showLegend={false}
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
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-900 flex items-center">
                      <Users className="h-4 w-4 mr-2 text-blue-600" />
                      TBM 진행 현장 위치
                    </h4>
                  </div>
                  <div className="relative" style={{ height: `${containerHeight - 57}px` }}>
                    {loading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="mt-4 text-sm text-gray-600">TBM 데이터 로딩 중...</p>
                      </div>
                    ) : null}
                    <KakaoMap
                      projects={projectsForMap}
                      onProjectClick={handleMapProjectClick}
                      height={`${containerHeight - 57}px`}
                      className="w-full"
                      focusedProjectId={focusedProjectId}
                      highlightedBranch={!selectedBranch ? hoveredBranchName : undefined}
                      highlightedHq={!selectedHq && !selectedBranch ? hoveredHqName : undefined}
                      showRadar={false}
                      disableHover={!!selectedBranch}
                      showLegend={false}
                    />
                  </div>
                </div>

                {/* 우측 - 지사별 통계 테이블 또는 TBM 기록 테이블 */}
                <div className="flex flex-col">
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-900 flex items-center">
                      {!selectedHq && !selectedBranch ? (
                        <>
                          <Building2 className="h-4 w-4 mr-2 text-blue-600" />
                          본부별 TBM 현황
                        </>
                      ) : selectedHq && !selectedBranch ? (
                        <>
                          <Building2 className="h-4 w-4 mr-2 text-blue-600" />
                          {selectedHq} 지사별 TBM 현황
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2 text-blue-600" />
                          TBM 기록 (오늘)
                        </>
                      )}
                    </h4>
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
                            <tr className="divide-x divide-gray-200">
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                본부명
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                {currentQuarter}분기 공사중
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                TBM 실시수
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                위험공종수
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                CCTV 사용수
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                도입율
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
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
                                    {activeQuarterCountByHq.get(stats.hqName) || 0}지구
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? '-' : `${stats.tbmCount}건`}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.riskWorkCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        stats.riskWorkCount > 0 
                                          ? 'bg-red-100 text-red-800' 
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {stats.riskWorkCount}건
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.cctvUsageCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        stats.cctvUsageCount > 0 
                                          ? 'bg-blue-100 text-blue-800' 
                                          : 'bg-gray-100 text-gray-800'
                                      }`}>
                                        {stats.cctvUsageCount}지구
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
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
                          <thead className="sticky top-0 z-10 bg-gray-100/90 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                            <tr className="divide-x divide-gray-200">
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                지사명
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                {currentQuarter}분기 공사중
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                TBM 실시수
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                위험공종수
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                CCTV 사용수
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                                도입율
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {branchStats.map((stats) => (
                              <tr 
                                key={stats.branchName} 
                                className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors divide-x divide-gray-100"
                                style={{ height: `${tableRowHeight}px` }}
                                onClick={() => handleBranchClick(stats.branchName)}
                                onMouseEnter={() => handleBranchRowMouseEnter(stats.branchName)}
                                onMouseLeave={handleBranchRowMouseLeave}
                              >
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm font-medium text-gray-900">
                                    {stats.branchName}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {activeQuarterCountByBranch.get(`${selectedHq}||${stats.branchName}`) || 0}지구
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? '-' : `${stats.tbmCount}건`}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.riskWorkCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        stats.riskWorkCount > 0 
                                          ? 'bg-red-100 text-red-800' 
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {stats.riskWorkCount}건
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900">
                                    {stats.cctvUsageCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        stats.cctvUsageCount > 0 
                                          ? 'bg-blue-100 text-blue-800' 
                                          : 'bg-gray-100 text-gray-800'
                                      }`}>
                                        {stats.cctvUsageCount}지구
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 whitespace-nowrap align-middle text-center">
                                  <div className="text-sm text-gray-900 font-semibold">
                                    {stats.tbmCount === 0 ? (
                                      <span className="text-gray-500">-</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        Math.round((stats.cctvUsageCount / stats.tbmCount) * 100) >= 50
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
                            className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => handleTBMRecordClick(record)}
                          >
                            <div className="flex items-start justify-between">
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
          </div>
        </div>
      )}

      {/* 네비게이션 선택 모달 */}
      {navigationModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                네비게이션 선택
              </h3>
              
              <div className="text-sm text-gray-500 text-center mb-6">
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

              <div className="mt-4">
                <button
                  onClick={handleNavigationModalClose}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
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

export default TBMStatus