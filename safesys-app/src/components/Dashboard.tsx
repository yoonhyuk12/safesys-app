'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Shield, AlertTriangle, CheckCircle, Activity, LogOut, Plus, Building, Map as MapIcon, List, Calendar, Thermometer, ChevronDown, Mail, Edit, Trash2, ArrowLeft, ChevronLeft, Download } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { getUserProjects, getProjectsByUserBranch, getHeatWaveChecksByUserBranch, deleteProject, getAllProjectsDebug, getManagerInspectionsByUserBranch, getHeadquartersInspectionsByUserBranch, type Project, type ProjectWithCoords, type HeatWaveCheck, type ManagerInspection, type HeadquartersInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS, DEBUG_LOGS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import ProjectCard from '@/components/project/ProjectCard'
import ProjectDeleteModal from '@/components/project/ProjectDeleteModal'
import ProjectHandoverModal from '@/components/project/ProjectHandoverModal'
import KakaoMap from '@/components/ui/KakaoMap'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ProfileEditModal from '@/components/auth/ProfileEditModal'
import PWAInstallButtonHeader from '@/components/common/PWAInstallButtonHeader'
import TBMStatus from '@/components/project/TBMStatus'
import ClientMapView from '@/components/dashboard/ClientMapView'
import TBMContainer from '@/components/dashboard/TBMContainer'
import ContractorDashboard from '@/components/dashboard/ContractorDashboard'
import ClientDashboard from '@/components/dashboard/ClientDashboard'
import ProjectCardsGrid from '@/components/dashboard/ProjectCardsGrid'
import ClientListView from '@/components/dashboard/ClientListView'
import SafetyHeatwaveView from '@/components/dashboard/SafetyHeatwaveView'
import SafetyManagerView from '@/components/dashboard/SafetyManagerView'
import SafetyHeadquartersView from '@/components/dashboard/SafetyHeadquartersView'

// JSX IntrinsicElements 선언: 빌드 도중 JSX 타입 미탐지 방지용 안전망
// JSX 타입 선언
interface JSXIntrinsicElements {
  [elemName: string]: unknown;
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends JSXIntrinsicElements {}
  }
}

const Dashboard: React.FC = () => {
  const { user, userProfile, signOut } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsWithCoords, setProjectsWithCoords] = useState<ProjectWithCoords[]>([])
  const [heatWaveChecks, setHeatWaveChecks] = useState<HeatWaveCheck[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'tbm' | 'map' | 'list' | 'safety'>('list')

  // 경로 변화에 따라 viewMode 동기화 (SSR/CSR 일치)
  useEffect(() => {
    const path = pathname
    let next: 'tbm' | 'map' | 'list' | 'safety' = 'list'
    if (path && path.startsWith('/safe')) next = 'safety'
    else if (path === '/list') next = 'list'
    else if (path === '/map') next = 'map'
    else if (path === '/tbm') next = 'tbm'
    setViewMode(next)
  }, [pathname])
  const [selectedHq, setSelectedHq] = useState<string>('') // 선택된 본부
  const [selectedBranch, setSelectedBranch] = useState<string>('') // 선택된 지사
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  })
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    project: Project | null
  }>({
    isOpen: false,
    project: null
  })
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isProfileEditModalOpen, setIsProfileEditModalOpen] = useState(false)
  const [selectedSafetyCard, setSelectedSafetyCard] = useState<string | null>(null)
  const [selectedSafetyBranch, setSelectedSafetyBranch] = useState<string | null>(() => {
    return searchParams.get('selectedSafetyBranch') || null
  })
  const [selectedQuarter, setSelectedQuarter] = useState<string>(() => {
    const now = new Date()
    const month = now.getMonth() + 1 // 1-12
    const year = now.getFullYear()
    
    let quarter
    if (month >= 1 && month <= 3) {
      quarter = 1
    } else if (month >= 4 && month <= 6) {
      quarter = 2
    } else if (month >= 7 && month <= 9) {
      quarter = 3
    } else {
      quarter = 4
    }
    
    return `${year}Q${quarter}`
  })
  const [managerInspections, setManagerInspections] = useState<ManagerInspection[]>([])
  const [headquartersInspections, setHeadquartersInspections] = useState<HeadquartersInspection[]>([])
  const [inspectionDataLoading, setInspectionDataLoading] = useState(false)
  const [isAccountDeleteModalOpen, setIsAccountDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [handoverModal, setHandoverModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const userMenuRef = useRef<HTMLDivElement>(null)
  const isDataLoaded = useRef(false)
  const isViewModeInitialized = useRef(false)
  const isSelectionInitialized = useRef(false)
  const lastHeatWaveParams = useRef<{ date: string; hq: string; branch: string; viewMode: string } | null>(null)
  const lastCardDataParams = useRef<{ date: string; quarter: string; hq: string; branch: string } | null>(null)
  const lastManagerParams = useRef<{ quarter: string; hq: string; branch: string } | null>(null)
  const lastHeadquartersParams = useRef<{ quarter: string; hq: string; branch: string } | null>(null)
  const heatWaveLoading = useRef(false)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const [mapDynamicHeight, setMapDynamicHeight] = useState<number>(500)
  const lastMapTopRef = useRef<number>(-1)

  // 보고서 선택 모드 (본부/지사 일괄)
  const [isHqDownloadMode, setIsHqDownloadMode] = useState(false)
  const [selectedBranchesForReport, setSelectedBranchesForReport] = useState<string[]>([])
  const [selectedProjectIdsForReport, setSelectedProjectIdsForReport] = useState<string[]>([])
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  // 전사 보기 가능 여부: 발주청이면서 관리자급(hq_division 없음) 또는 본사 지사 사용자
  const canSeeAllHq = React.useMemo(() => {
    if (!userProfile || userProfile.role !== '발주청') return false
    return (userProfile.hq_division == null) || !!userProfile.branch_division?.endsWith('본부')
  }, [userProfile])

  // viewMode 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard-view-mode', viewMode)
    }
  }, [viewMode])

  // URL 파라미터에서 view 모드 읽기
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const viewParam = urlParams.get('view')
      if (viewParam === 'tbm') {
        setViewMode('tbm')
      } else if (viewParam === 'list') {
        setViewMode('list')
      } else if (viewParam === 'map') {
        setViewMode('map')
      } else if (viewParam === 'safety') {
        setViewMode('safety')
      } else {
        // view가 없지만 selectedSafetyBranch가 있으면 안전현황으로 강제 전환
        const branchParam = urlParams.get('selectedSafetyBranch')
        if (branchParam) {
          setViewMode('safety')
        }
      }
    }
  }, [])

  // 경로 기반으로 모드 동기화 (/safe, /list, /map, /tbm)
  useEffect(() => {
    if (!pathname) return
    if (pathname.startsWith('/safe')) {
      setViewMode('safety')
      const segments = pathname.split('/').filter(Boolean)
      // /safe/[card]
      // /safe/branch/[branch]/[card]
      if (segments[1] === 'branch') {
        const branchName = segments[2] ? decodeURIComponent(segments[2]) : ''
        // 조건부 상태 업데이트 - 값이 다를 때만 업데이트
        if (selectedSafetyBranch !== (branchName || null)) {
          setSelectedSafetyBranch(branchName || null)
        }
        if (selectedBranch !== (branchName || '')) {
          setSelectedBranch(branchName || '')
        }
        const card = segments[3]
        if (card === 'heatwave' || card === 'manager' || card === 'headquarters') {
          if (selectedSafetyCard !== card) {
            setSelectedSafetyCard(card)
          }
        } else {
          if (selectedSafetyCard !== null) {
            setSelectedSafetyCard(null)
          }
        }
      } else {
        const card = segments[1]
        if (card === 'heatwave' || card === 'manager' || card === 'headquarters') {
          if (selectedSafetyCard !== card) {
            setSelectedSafetyCard(card)
          }
        } else {
          if (selectedSafetyCard !== null) {
            setSelectedSafetyCard(null)
          }
        }
        // 루트 안전현황에서는 지사 선택 초기화
        if (segments.length === 1) {
          if (selectedSafetyBranch !== null) {
            setSelectedSafetyBranch(null)
          }
          if (selectedBranch !== '') {
            setSelectedBranch('')
          }
        }
      }
    } else if (pathname === '/list') {
      if (viewMode !== 'list') setViewMode('list')
    } else if (pathname === '/map') {
      if (viewMode !== 'map') setViewMode('map')
    } else if (pathname === '/tbm') {
      if (viewMode !== 'tbm') setViewMode('tbm')
    }
  }, [pathname])

  // 안전현황 상태 변화 시 경로 동기화
  // - /safe 진입 시 카드/지사 선택 상태에 맞춰 하위 경로로 이동
  // - 이미 /safe 하위에 있으면 불필요한 리플레이스 금지
  useEffect(() => {
    if (viewMode !== 'safety') return

    const currentPath = pathname || ''
    // 이미 상세 경로면 동기화 스킵
    if (currentPath.startsWith('/safe/') && currentPath !== '/safe') return

    let targetPath = '/safe'
    if (selectedSafetyBranch) {
      targetPath = `/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`
    }
    if (selectedSafetyCard) {
      const card = selectedSafetyCard
      targetPath = selectedSafetyBranch ? `${targetPath}/${card}` : `/safe/${card}`
    }

    // /safe 루트에서만 동기화. 이미 목표 경로면 아무것도 하지 않음
    if (currentPath === '/safe' && targetPath !== '/safe') {
      router.replace(targetPath)
    }
  }, [viewMode, selectedSafetyBranch, selectedSafetyCard, pathname])

  // 화면 크기 변경 감지
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
      // 지도 뷰 높이 재계산
      recalcMapHeight()
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    window.addEventListener('load', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 전체화면 전환 감지 시 지도 높이 재계산
  useEffect(() => {
    const handler = () => recalcMapHeight()
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // 지도 가용 높이 계산 함수
  const recalcMapHeight = () => {
    if (typeof window === 'undefined') return
    if (!mapContainerRef.current) return
    const rect = mapContainerRef.current.getBoundingClientRect()
    const available = Math.floor(window.innerHeight - rect.top - 16)
    if (!Number.isNaN(available) && available > 0) {
      setMapDynamicHeight(available)
    }
  }

  // 뷰 모드가 지도일 때 최초/변경 시 높이 계산
  useEffect(() => {
    if (viewMode !== 'map') return
    // 즉시 및 지연 재계산 여러 번 시도하여 초기 레이아웃 안정화 대응
    recalcMapHeight()
    const t1 = setTimeout(recalcMapHeight, 50)
    const t2 = setTimeout(recalcMapHeight, 200)
    const raf1 = requestAnimationFrame(recalcMapHeight)
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(recalcMapHeight))
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [viewMode, selectedHq, selectedBranch])

  // 컨테이너의 위치/크기 변화 감지하여 높이 재계산
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (viewMode !== 'map') return
    const el = mapContainerRef.current
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      if (rect.top !== lastMapTopRef.current) {
        lastMapTopRef.current = rect.top
        recalcMapHeight()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode])

  // 사용자 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 사용자 프로젝트 목록 로드 (한번만 실행)
  useEffect(() => {
    if (user && userProfile && !isDataLoaded.current) {
      isDataLoaded.current = true
      if (userProfile.role === '발주청') {
        loadBranchProjects()
      } else {
        loadUserProjects()
      }
    }
  }, [user, userProfile])

  // 사용자 역할에 따른 기본 뷰 모드 설정 (한 번만 실행)
  // 안전현황 경로('/safe' 하위)에서는 기본 뷰 덮어쓰기를 하지 않도록 가드 추가
  useEffect(() => {
    if (!userProfile || isViewModeInitialized.current) return
    isViewModeInitialized.current = true

    // URL 파라미터가 없을 때만 역할에 따른 기본값 설정
    const urlParams = new URLSearchParams(window.location.search)
    const viewParam = urlParams.get('view')
    const isOnSafetyRoutes = (pathname || '').startsWith('/safe')
    const isExplicitViewRoute = isOnSafetyRoutes || pathname === '/tbm' || pathname === '/map' || pathname === '/list'

    // 명시적 라우트 또는 view 파라미터가 있을 때는 기본값으로 덮어쓰지 않음
    if (!viewParam && !isExplicitViewRoute && viewMode !== 'safety') {
      if (userProfile.role === '발주청') {
        setViewMode('list') // 발주청은 목록 보기가 기본
      } else {
        setViewMode('map') // 시공사/감리단은 지도 보기가 기본
      }
    }
  }, [userProfile, pathname, viewMode])

  // 발주자 로그인 시 소속 정보 기본값 설정 (최초 1회만)
  useEffect(() => {
    if (!userProfile || userProfile.role !== '발주청') return
    if (isSelectionInitialized.current) return

    // 조건부 상태 업데이트 - 값이 실제로 다를 때만 업데이트
    if (userProfile.hq_division && selectedHq !== userProfile.hq_division) {
      setSelectedHq(userProfile.hq_division)
    }
    if (userProfile.branch_division) {
      // "본부"로 끝나는 지사명인 경우 지사는 전체로 설정
      if (userProfile.branch_division.endsWith('본부')) {
        if (selectedBranch !== '') {
          setSelectedBranch('')
        }
      } else {
        if (selectedBranch !== userProfile.branch_division) {
          setSelectedBranch(userProfile.branch_division)
        }
        // 특정 지사 소속이면 안전현황에서도 해당 지사의 프로젝트별 점검 현황으로 바로 표시
        if (userProfile.branch_division?.includes('지사') && selectedSafetyBranch !== userProfile.branch_division) {
          setSelectedSafetyBranch(userProfile.branch_division)
        }
      }
    }
    isSelectionInitialized.current = true
  }, [userProfile])

  // 안전현황 모드일 때 폭염점검 데이터 로드 (중복 방지)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && viewMode === 'safety' && selectedSafetyCard === 'heatwave')) {
      return
    }
    // 발주청의 본부/지사 기본값 세팅이 끝나기 전에는 조회하지 않도록 가드
    if (!isSelectionInitialized.current) return

    if (DEBUG_LOGS) console.log('폭염점검 useEffect 실행 - selectedSafetyCard:', selectedSafetyCard, 'viewMode:', viewMode)

    const currentParams = { 
      date: selectedDate, 
      hq: selectedHq || '', 
      branch: selectedBranch || '', 
      viewMode 
    }
    
    // 이미 동일한 파라미터로 데이터가 로딩되어 있는지 확인
    if (lastHeatWaveParams.current &&
        lastHeatWaveParams.current.date === currentParams.date &&
        lastHeatWaveParams.current.hq === currentParams.hq &&
        lastHeatWaveParams.current.branch === currentParams.branch) {
      if (DEBUG_LOGS) console.log('폭염점검 데이터 이미 로딩됨. 재로딩 스킵:', currentParams)
      return
    }
    
    // 파라미터가 변경된 경우에만 로딩
    if (!lastHeatWaveParams.current || 
        lastHeatWaveParams.current.date !== currentParams.date ||
        lastHeatWaveParams.current.hq !== currentParams.hq ||
        lastHeatWaveParams.current.branch !== currentParams.branch ||
        lastHeatWaveParams.current.viewMode !== currentParams.viewMode) {
      
      if (DEBUG_LOGS) console.log('폭염점검 데이터 로딩:', currentParams)
      lastHeatWaveParams.current = currentParams
      loadHeatWaveChecks()
    } else {
      if (DEBUG_LOGS) console.log('동일한 파라미터로 폭염점검 데이터 로딩 스킵:', currentParams)
    }
  }, [user, userProfile, viewMode, selectedDate, selectedHq, selectedBranch, selectedSafetyCard])

  // 관리자 점검 선택 시 관리자 점검 데이터만 로드
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'manager')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { quarter: selectedQuarter, hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastManagerParams.current &&
        lastManagerParams.current.quarter === currentParams.quarter &&
        lastManagerParams.current.hq === currentParams.hq &&
        lastManagerParams.current.branch === currentParams.branch &&
        managerInspections.length > 0) {
      if (DEBUG_LOGS) console.log('✅ 관리자 점검 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 관리자 점검 전용 데이터 로딩 시작')
    lastManagerParams.current = currentParams
    loadInspectionData()
  }, [user, userProfile, selectedSafetyCard, selectedQuarter, selectedHq, selectedBranch])

  // 본부 불시점검 선택 시 본부 불시점검 데이터만 로드  
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'headquarters')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { quarter: selectedQuarter, hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastHeadquartersParams.current &&
        lastHeadquartersParams.current.quarter === currentParams.quarter &&
        lastHeadquartersParams.current.hq === currentParams.hq &&
        lastHeadquartersParams.current.branch === currentParams.branch &&
        headquartersInspections.length > 0) {
      if (DEBUG_LOGS) console.log('✅ 본부 불시점검 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 본부 불시점검 전용 데이터 로딩 시작')
    lastHeadquartersParams.current = currentParams
    loadInspectionData()
  }, [user, userProfile, selectedSafetyCard, selectedQuarter, selectedHq, selectedBranch])

  // 안전현황 모드일 때 카드용 기본 데이터 로드 (안전현황 메인에서만)
  useEffect(() => {
    // 발주청의 본부/지사 기본값 세팅이 끝나기 전에는 집계 로딩 금지
    if (userProfile?.role === '발주청' && !isSelectionInitialized.current) return
    if (DEBUG_LOGS) console.log('🔍 카드용 데이터 로딩 조건 확인:', {
      user: !!user,
      userProfile: !!userProfile,
      role: userProfile?.role,
      viewMode,
      selectedSafetyCard,
      shouldLoad: !!(user && userProfile && userProfile.role === '발주청' && viewMode === 'safety' && !selectedSafetyCard)
    })
    
    // 경로가 상세 카드 경로(/safe/manager, /safe/headquarters, /safe/heatwave 등)인 경우 메인 카드 집계 로딩을 차단
    const isCardDetailRoute = (() => {
      if (!pathname) return false
      const segments = pathname.split('/').filter(Boolean)
      if (segments[0] !== 'safe') return false
      const card = segments[1] === 'branch' ? segments[3] : segments[1]
      return card === 'heatwave' || card === 'manager' || card === 'headquarters'
    })()
    if (isCardDetailRoute) {
      if (DEBUG_LOGS) console.log('❌ 상세 카드 경로 감지 - 메인 카드 데이터 로딩 차단:', pathname)
      return
    }

    if (!(user && userProfile && userProfile.role === '발주청' && viewMode === 'safety' && !selectedSafetyCard)) {
      if (DEBUG_LOGS) console.log('❌ 카드용 데이터 로딩 조건 불만족 - 스킵')
      return
    }
    
    // 특정 카드가 이미 선택된 상태면 절대 실행하지 않음 (추가 안전장치)
    if (selectedSafetyCard !== null) {
      if (DEBUG_LOGS) console.log('❌ 특정 카드가 선택된 상태 - 카드용 데이터 로딩 차단:', selectedSafetyCard)
      return
    }

    const currentCardParams = {
      date: selectedDate,
      quarter: selectedQuarter,
      hq: selectedHq || '',
      branch: selectedBranch || ''
    }

    // 이미 동일한 파라미터로 로딩했는지 확인하되, 모든 카드 데이터가 채워져 있을 때만 스킵
    if (lastCardDataParams.current && 
        lastCardDataParams.current.date === currentCardParams.date &&
        lastCardDataParams.current.quarter === currentCardParams.quarter &&
        lastCardDataParams.current.hq === currentCardParams.hq &&
        lastCardDataParams.current.branch === currentCardParams.branch &&
        heatWaveChecks.length > 0 && managerInspections.length > 0 && headquartersInspections.length > 0) {
      console.log('✅ 카드용 데이터 이미 로딩됨. 중복 실행 방지:', currentCardParams)
      return
    }

    console.log('🏠 안전현황 메인 - 카드 건수 표시용 전체 데이터 로딩 시작')
    lastCardDataParams.current = currentCardParams
    
    // 안전현황 메인에서는 카드 건수 표시를 위해 모든 점검 데이터 로딩
    const loadCardData = async () => {
      try {
        console.log('📊 카드 건수 표시용 데이터 로딩:', currentCardParams)
        const [heatWaveResult, managerResult, headquartersResult] = await Promise.all([
          getHeatWaveChecksByUserBranch(userProfile, selectedDate, selectedHq, selectedBranch),
          getManagerInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch),
          getHeadquartersInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch)
        ])

        if (heatWaveResult.success && heatWaveResult.checks) {
          setHeatWaveChecks(heatWaveResult.checks)
          console.log('✅ 폭염점검:', heatWaveResult.checks.length, '건')
        }

        if (managerResult.success && managerResult.inspections) {
          setManagerInspections(managerResult.inspections)
          console.log('✅ 관리자점검:', managerResult.inspections.length, '건')
        }

        if (headquartersResult.success && headquartersResult.inspections) {
          setHeadquartersInspections(headquartersResult.inspections)
          console.log('✅ 본부불시점검:', headquartersResult.inspections.length, '건')
        }
        
        console.log('🏠 안전현황 메인 카드 데이터 로딩 완료')
      } catch (err) {
        console.error('카드 데이터 로드 실패:', err)
      }
    }

    loadCardData()
  }, [user, userProfile, viewMode, selectedDate, selectedQuarter, selectedHq, selectedBranch, selectedSafetyCard])

  const loadUserProjects = async () => {
    if (!user) return
    
    setLoading(true)
    setError('')
    
    try {
      const result = await getUserProjects()
      if (result.success && result.projects) {
        setProjects(result.projects)
      } else {
        setError(result.error || '프로젝트를 불러오는데 실패했습니다.')
      }
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadBranchProjects = async () => {
    if (!userProfile) return
    
    setLoading(true)
    setError('')
    
    try {
      if (DEBUG_LOGS) console.log('발주청 프로젝트 조회 시작:', userProfile)
      
      // 디버깅용: 모든 프로젝트 데이터 확인
      if (DEBUG_LOGS) {
        await getAllProjectsDebug()
      }
      
      const result = await getProjectsByUserBranch(userProfile)
      if (result.success && result.projects) {
        if (DEBUG_LOGS) console.log(`조회된 프로젝트 수: ${result.projects.length}`)
        setProjects(result.projects)
        
        // 좌표 정보가 있는 프로젝트들로 설정 (API 호출 없이)
        if (result.projects.length > 0) {
          if (DEBUG_LOGS) console.log('프로젝트 좌표 설정...')
          const projectsWithCoords = result.projects.map(project => ({
            ...project,
            coords: project.latitude && project.longitude ? {
              lat: project.latitude,
              lng: project.longitude
            } : undefined
          }))
          setProjectsWithCoords(projectsWithCoords)
          if (DEBUG_LOGS) console.log('좌표 설정 완료:', projectsWithCoords.filter(p => p.coords).length)
        }
      } else {
        setError(result.error || '프로젝트를 불러오는데 실패했습니다.')
      }
    } catch (err: any) {
      console.error('발주청 프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadHeatWaveChecks = async () => {
    if (!userProfile || userProfile.role !== '발주청') return

    // 이미 로딩 중이면 중복 실행 방지
    if (heatWaveLoading.current) {
      console.log('폭염점검 데이터 이미 로딩 중. 중복 실행 방지.')
      return
    }

    try {
      heatWaveLoading.current = true
      setLoading(true)
      console.log('폭염점검 데이터 조회 시작:', selectedDate, '본부:', selectedHq, '지사:', selectedBranch)
      
      const result = await getHeatWaveChecksByUserBranch(userProfile, selectedDate, selectedHq, selectedBranch)
      if (result.success && result.checks) {
        console.log(`조회된 폭염점검 수: ${result.checks.length}`)
        setHeatWaveChecks(result.checks)
      } else {
        setError(result.error || '폭염점검 데이터를 불러오는데 실패했습니다.')
      }
    } catch (err: any) {
      console.error('폭염점검 데이터 로드 실패:', err)
      setError(err.message || '폭염점검 데이터를 불러오는데 실패했습니다.')
    } finally {
      heatWaveLoading.current = false
      setLoading(false)
    }
  }

  const loadInspectionData = async () => {
    if (!userProfile || userProfile.role !== '발주청') return

    try {
      setInspectionDataLoading(true)
      console.log(`🔍 ${selectedSafetyCard} 점검 데이터만 조회:`, selectedQuarter, '본부:', selectedHq, '지사:', selectedBranch)
      
      if (selectedSafetyCard === 'manager') {
        console.log('📋 관리자 점검 데이터만 조회 중...')
        const result = await getManagerInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch)
        if (result.success && result.inspections) {
          console.log(`✅ 관리자 점검 조회 완료: ${result.inspections.length}건`)
          setManagerInspections(result.inspections)
        } else {
          console.error('❌ 관리자 점검 데이터 로드 실패:', result.error)
          setManagerInspections([])
        }
      } else if (selectedSafetyCard === 'headquarters') {
        console.log('📋 본부 불시점검 데이터만 조회 중...')
        const result = await getHeadquartersInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch)
        if (result.success && result.inspections) {
          console.log(`✅ 본부 불시점검 조회 완료: ${result.inspections.length}건`)
          setHeadquartersInspections(result.inspections)
        } else {
          console.error('❌ 본부 불시점검 데이터 로드 실패:', result.error)
          setHeadquartersInspections([])
        }
      }
    } catch (err: any) {
      console.error('점검 데이터 로드 실패:', err)
    } finally {
      setInspectionDataLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setIsUserMenuOpen(false)
      router.replace('/login')
    } catch (error) {
      console.error('로그아웃 실패:', error)
    }
  }

  const handleUserMenuToggle = () => {
    setIsUserMenuOpen(!isUserMenuOpen)
  }

  const handleProfileEdit = () => {
    setIsUserMenuOpen(false)
    setIsProfileEditModalOpen(true)
  }

  const handleAccountDelete = () => {
    setIsUserMenuOpen(false)
    setIsAccountDeleteModalOpen(true)
  }

  const handleAccountDeleteConfirm = async () => {
    if (deleteConfirmText !== '삭제') {
      alert('정확히 "삭제"라고 입력해주세요.')
      return
    }

    if (!user) {
      alert('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setIsDeleting(true)
    try {
      // 1. CASCADE 설정으로 user_profiles 삭제 시 관련 데이터가 자동으로 삭제됨
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', user.id)

      if (profileError) {
        throw new Error(profileError.message)
      }

      // 2. Authentication 사용자도 삭제 시도
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
        if (authError) {
          console.warn('Auth 사용자 삭제 실패 (권한 부족일 수 있음):', authError)
        }
      } catch (authDeleteError) {
        console.warn('Auth 사용자 삭제 시도 실패:', authDeleteError)
      }

      alert('계정과 관련된 모든 데이터가 성공적으로 삭제되었습니다.')
      await signOut()
      router.push('/login')
      
    } catch (error) {
      console.error('계정 삭제 실패:', error)
      alert('계정 삭제 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsDeleting(false)
      setIsAccountDeleteModalOpen(false)
      setDeleteConfirmText('')
    }
  }

  const handleAccountDeleteCancel = () => {
    setIsAccountDeleteModalOpen(false)
    setDeleteConfirmText('')
  }

  const handleSiteRegistration = () => {
    router.push('/project/new')
  }

  const handleProjectClick = (project: Project) => {
    console.log('프로젝트 클릭:', project.id, project.project_name)
    try {
      router.push(`/project/${project.id}`)
      console.log('라우터 push 성공:', `/project/${project.id}`)
    } catch (error) {
      console.error('라우터 push 오류:', error)
    }
  }

  const handleProjectEdit = (project: Project) => {
    // 프로젝트 수정 페이지로 이동
    router.push(`/project/${project.id}/edit`)
  }

  const handleProjectHandover = (project: Project) => {
    setHandoverModal({ isOpen: true, project })
  }

  const handleProjectDelete = async (project: Project) => {
    setDeleteModal({
      isOpen: true,
      project
    })
  }

  const handleDeleteModalClose = () => {
    setDeleteModal({
      isOpen: false,
      project: null
    })
  }

  const handleDeleteConfirm = async (projectId: string) => {
    try {
      const result = await deleteProject(projectId)
      
      if (result.success) {
        // 성공 시 프로젝트 목록 새로고침
        if (userProfile?.role === '발주청') {
          await loadBranchProjects()
        } else {
          await loadUserProjects()
        }
        alert('프로젝트가 성공적으로 삭제되었습니다.')
      } else {
        throw new Error(result.error || '프로젝트 삭제에 실패했습니다.')
      }
    } catch (err: any) {
      console.error('프로젝트 삭제 실패:', err)
      alert(err.message || '프로젝트 삭제에 실패했습니다.')
      throw err // 모달에서 로딩 상태 해제를 위해 다시 throw
    }
  }

  const handleHandoverModalClose = () => {
    setHandoverModal({ isOpen: false, project: null })
    // 인계 완료 후 목록 갱신
    if (userProfile?.role === '발주청') {
      void loadBranchProjects()
    } else {
      void loadUserProjects()
    }
  }

  const handleMapProjectClick = (project: any) => {
    console.log('지도 마커 클릭:', project)
    router.push(`/project/${project.id}`)
  }

  const handleHeatWaveCheckClick = (check: HeatWaveCheck) => {
    console.log('폭염점검 행 클릭:', check.project_name, check.project_id)
    router.push(`/project/${check.project_id}/heatwave`)
  }

  const handleProjectStatusChange = async (project: Project, isActive: boolean) => {
    console.log('프로젝트 상태 변경:', project.project_name, isActive)
    
    // 프로젝트 목록에서 해당 프로젝트의 상태 업데이트
    setProjects((prevProjects: Project[]) => 
      prevProjects.map((p: Project) => 
        p.id === project.id 
          ? { ...p, is_active: isActive }
          : p
      )
    )

    // 좌표가 있는 프로젝트 목록도 업데이트
    setProjectsWithCoords((prevProjects: ProjectWithCoords[]) => 
      prevProjects.map((p: ProjectWithCoords) => 
        p.id === project.id 
          ? { ...p, is_active: isActive }
          : p
      )
    )
  }

  // 분기/준공 JSON 업데이트 수신 시 즉시 상태 반영
  const handleProjectIsActiveJsonChange = (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => {
    setProjects((prev: Project[]) => prev.map((p: Project) => p.id === project.id ? { ...p, is_active: json } : p))
    setProjectsWithCoords((prev: ProjectWithCoords[]) => prev.map((p: ProjectWithCoords) => p.id === project.id ? { ...p, is_active: json } : p))
  }

  // 선택된 분기 판별 헬퍼
  const isInSelectedQuarter = (dateStr?: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return false
    const [yearStr, qStr] = selectedQuarter.split('Q')
    const year = parseInt(yearStr, 10)
    const q = parseInt(qStr, 10)
    if (!year || !q) return true
    const startMonth = (q - 1) * 3 // 0-indexed
    const start = new Date(year, startMonth, 1)
    const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)
    return d >= start && d <= end
  }

  // 발주청용 대시보드 렌더링
  const renderClientDashboard = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center min-h-[60vh]">
          <LoadingSpinner />
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-sm text-red-700">{error}</div>
          <button 
            onClick={loadBranchProjects}
            className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            다시 시도
          </button>
        </div>
      )
    }


    // 선택된 본부/지사에 따라 프로젝트 필터링
    const filteredProjects = projects.filter((project: Project) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })

    const filteredProjectsWithCoords = projectsWithCoords.filter((project: ProjectWithCoords) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })

    // 오늘 날짜 기준 분기 산정
    const today = new Date()
    const currentQuarter = (() => {
      const m = today.getMonth() + 1
      if (m <= 3) return 1
      if (m <= 6) return 2
      if (m <= 9) return 3
      return 4
    })()

    // 좌표가 있는 프로젝트만 지도에 표시 (+ 분기 공사중 표시)
    const projectsForMap = filteredProjectsWithCoords
      .filter((project: ProjectWithCoords) => project.coords)
      .map((project: ProjectWithCoords) => {
        // is_active가 JSON 객체인 경우 분기별 플래그 확인
        const ia: any = project.is_active
        const qActive = typeof ia === 'object' && ia
          ? (currentQuarter === 1 ? ia.q1 : currentQuarter === 2 ? ia.q2 : currentQuarter === 3 ? ia.q3 : ia.q4)
          : (project.is_active === true) // boolean인 경우 true면 공사중으로 간주

        return ({
          id: project.id,
          name: project.project_name,
          address: project.site_address,
          lat: project.coords!.lat,
          lng: project.coords!.lng,
          managingHq: project.managing_hq,
          managingBranch: project.managing_branch,
          highlightRed: !!qActive
        })
      })

    return (
      <div className={`space-y-6 ${viewMode === 'tbm' ? 'lg:w-screen lg:relative lg:left-1/2 lg:right-1/2 lg:-ml-[50vw] lg:-mr-[50vw] lg:px-4' : ''}`}>
        {/* 헤더 */}
        <div className="bg-white/80 backdrop-blur rounded-lg border border-white/20 shadow-sm p-3 lg:p-4 flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
          <div className="flex-1">
            <h2 className="text-lg lg:text-2xl font-bold text-gray-900">
              관할 프로젝트 현황
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mt-2">
              {/* 본부/지사 선택 드롭다운 */}
              <div className="flex items-center space-x-2">
                <select
                  value={selectedHq}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    setSelectedHq(e.target.value)
                    setSelectedBranch('') // 본부 변경 시 지사 초기화
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  {canSeeAllHq && <option value="">전체 본부</option>}
                  {HEADQUARTERS_OPTIONS.map(hq => (
                    <option key={hq} value={hq}>{hq}</option>
                  ))}
                </select>
                
                <select
                  value={selectedBranch}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedBranch(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">전체 지사</option>
                  {selectedHq ? 
                    // 특정 본부가 선택된 경우 해당 본부의 지사들만 표시
                    BRANCH_OPTIONS[selectedHq]?.map(branch => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))
                    :
                    // 전체 본부가 선택된 경우 모든 지사들을 표시
                    Object.values(BRANCH_OPTIONS).flat().filter((branch, index, arr) => arr.indexOf(branch) === index).map(branch => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))
                  }
                </select>
              </div>
              
              <p className="text-gray-600 text-sm">
                {(() => {
                  const month = new Date().getMonth() + 1
                  const quarter = Math.ceil(month / 3)
                  const activeCount = filteredProjects.filter((p: Project) => {
                    const ia: any = p.is_active
                    if (typeof ia === 'object' && ia) {
                      const qKey = (`q${quarter}` as 'q1' | 'q2' | 'q3' | 'q4')
                      return !!ia[qKey] && !ia.completed
                    }
                    return ia !== false
                  }).length
                  return `프로젝트 총 ${filteredProjects.length}지구(${quarter}분기 공사중 ${activeCount}지구)`
                })()}
              </p>
            </div>
          </div>
          
          {/* 뷰 모드 전환 버튼 */}
          <div className="flex bg-gray-100 rounded-lg p-1 ml-auto">
            <button
              onClick={() => {
                router.push('/tbm')
              }}
              className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${
                viewMode === 'tbm'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity className="h-4 w-4 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">TBM현황</span>
              <span className="sm:hidden">TBM</span>
            </button>
            <button
              onClick={() => {
                router.push('/map')
              }}
              className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${
                viewMode === 'map'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MapIcon className="h-4 w-4 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">지도 보기</span>
              <span className="sm:hidden">지도</span>
            </button>
            <button
              onClick={() => {
                router.push('/list')
              }}
              className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${
                viewMode === 'list'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List className="h-4 w-4 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">목록 보기</span>
              <span className="sm:hidden">목록</span>
            </button>
            <button
              onClick={() => {
                router.push('/safe')
              }}
              className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${
                viewMode === 'safety'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Shield className="h-4 w-4 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">안전현황</span>
              <span className="sm:hidden">안전</span>
            </button>
          </div>
        </div>

        {/* 컨텐츠 영역 */}
        {viewMode === 'tbm' ? (
          <TBMContainer
            projects={filteredProjects}
            selectedHq={selectedHq}
            selectedBranch={selectedBranch}
            onProjectClick={handleMapProjectClick}
            onBranchSelect={(branchName: string) => setSelectedBranch(branchName)}
            onHqSelect={(hqName: string) => { setSelectedHq(hqName); setSelectedBranch('') }}
          />
        ) : viewMode === 'map' ? (
          <ClientMapView
            containerRef={mapContainerRef}
            heightPx={mapDynamicHeight}
            projects={projectsForMap as any}
              onProjectClick={handleMapProjectClick}
            />
        ) : viewMode === 'safety' ? (
          <div className="space-y-6">
            {/* 헤더 및 날짜 선택 - 메인 안전현황에서만 표시 */}
            {!selectedSafetyCard ? (
              <div className="bg-white/80 backdrop-blur rounded-lg border border-white/20 shadow-sm p-3 lg:p-4 flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
                <div>
                  <h3 className="text-lg lg:text-xl font-semibold text-gray-900 flex items-center">
                    <Shield className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600 mr-2" />
                    안전현황
                  </h3>
                  <p className="text-sm lg:text-base text-gray-600 mt-1">
                    관할 프로젝트들의 안전점검 현황을 확인할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center justify-end lg:justify-start space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 lg:px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            ) : null}

            {/* 안전점검 카드들 또는 상세 테이블 */}
            {selectedSafetyCard ? (
              <>
                {selectedSafetyCard === 'heatwave' && (
                  <SafetyHeatwaveView
                    loading={loading}
                    selectedDate={selectedDate}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedSafetyBranch={selectedSafetyBranch}
                    heatWaveChecks={heatWaveChecks}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      if (selectedSafetyBranch) {
                        router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      } else {
                        router.push('/safe')
                      }
                    }}
                    onDateChange={(val) => setSelectedDate(val)}
                    onRowClick={handleHeatWaveCheckClick}
                  />
                )}

                {selectedSafetyCard === 'manager' && (
                  <SafetyManagerView
                    loading={inspectionDataLoading}
                    projects={projects}
                    managerInspections={managerInspections}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedQuarter={selectedQuarter}
                    isHqDownloadMode={isHqDownloadMode}
                    selectedBranchesForReport={selectedBranchesForReport}
                    selectedProjectIdsForReport={selectedProjectIdsForReport}
                    isGeneratingReport={isGeneratingReport}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      if (selectedSafetyBranch) router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      else router.push('/safe')
                    }}
                    onBackToAllBranches={() => {
                      setSelectedSafetyBranch('')
                      router.push('/safe/manager')
                    }}
                    onQuarterChange={(val) => setSelectedQuarter(val)}
                    onToggleDownloadMode={(on) => {
                      setIsHqDownloadMode(on)
                      if (on) {
                        setSelectedBranchesForReport([])
                        setSelectedProjectIdsForReport([])
                      }
                    }}
                    onGenerateReport={async () => {
                      try {
                        setIsGeneratingReport(true)
                        if (selectedSafetyBranch) {
                          const { downloadBranchManagerReports } = await import('@/lib/reports/manager-inspection-branch')
                          await downloadBranchManagerReports({
                            projects,
                            inspections: managerInspections,
                            selectedProjectIds: selectedProjectIdsForReport,
                            selectedQuarter,
                            selectedHq,
                            selectedSafetyBranch: selectedSafetyBranch as string,
                          })
                        } else {
                          const { generateManagerInspectionBulkReport } = await import('@/lib/reports/manager-inspection-report')
                          const filteredProjects = projects.filter((p: any) => {
                            if (selectedHq && p.managing_hq !== selectedHq) return false
                            if (selectedBranch && p.managing_branch !== selectedBranch) return false
                            if (selectedBranchesForReport.length > 0 && !selectedBranchesForReport.includes(p.managing_branch)) return false
                            return true
                          })
                          const projectInspections: { project: any; inspections: any[] }[] = []
                          filteredProjects.forEach((p: any) => {
                            const ins = managerInspections.filter((i: any) => i.project_id === p.id && isInSelectedQuarter(i.inspection_date))
                            if (ins.length > 0) projectInspections.push({ project: p, inspections: ins })
                          })
                          if (projectInspections.length === 0) { alert('선택한 조건에 해당하는 점검 결과가 없습니다.'); return }
                          await generateManagerInspectionBulkReport({ projectInspections })
                        }
                        setIsHqDownloadMode(false)
                      } catch (e: any) {
                        console.error(e)
                        const msg = (e && e.message) ? e.message : '보고서 생성 중 오류가 발생했습니다.'
                        alert(msg)
                      } finally {
                        setIsGeneratingReport(false)
                      }
                    }}
                    onCancelReport={() => {
                      setIsHqDownloadMode(false)
                      setSelectedBranchesForReport([])
                      setSelectedProjectIdsForReport([])
                    }}
                    onProjectToggleForReport={(projectId) => {
                      setSelectedProjectIdsForReport(prev => prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId])
                    }}
                    onBranchToggleForReport={(branch) => {
                      setSelectedBranchesForReport(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch])
                    }}
                    onRowClick={(projectId) => router.push(`/project/${projectId}/manager-inspection?fromBranch=${encodeURIComponent(selectedSafetyBranch || '')}`)}
                    onSelectSafetyBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                      router.push(`/safe/branch/${encodeURIComponent(branch)}/manager`)
                    }}
                  />
                )}

                {selectedSafetyCard === 'headquarters' && (
                  <SafetyHeadquartersView
                    loading={inspectionDataLoading}
                    projects={projects}
                    headquartersInspections={headquartersInspections}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedQuarter={selectedQuarter}
                    isHqDownloadMode={isHqDownloadMode}
                    selectedBranchesForReport={selectedBranchesForReport}
                    selectedProjectIdsForReport={selectedProjectIdsForReport}
                    isGeneratingReport={isGeneratingReport}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      if (selectedSafetyBranch) {
                        router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      } else {
                        router.push('/safe')
                      }
                    }}
                    onBackToAllBranches={() => {
                      // 전체 지사로 돌아가기: 지사 선택 해제 및 본부 헤드쿼터 경로로 이동
                      setSelectedSafetyBranch('')
                      router.push('/safe/headquarters')
                    }}
                    onQuarterChange={(val) => setSelectedQuarter(val)}
                    onToggleDownloadMode={(on) => {
                      setIsHqDownloadMode(on)
                      if (on) {
                        setSelectedBranchesForReport([])
                        setSelectedProjectIdsForReport([])
                      }
                    }}
                    onGenerateReport={async (groups) => {
                      const { generateHeadquartersInspectionReportBulk } = await import('@/lib/reports/headquarters-inspection')
                      await generateHeadquartersInspectionReportBulk(groups)
                      setIsHqDownloadMode(false)
                    }}
                    onCancelReport={() => {
                      setIsHqDownloadMode(false)
                      setSelectedBranchesForReport([])
                      setSelectedProjectIdsForReport([])
                    }}
                    onProjectToggleForReport={(projectId) => {
                      setSelectedProjectIdsForReport(prev => prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId])
                    }}
                    onBranchToggleForReport={(branch) => {
                      setSelectedBranchesForReport(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch])
                    }}
                    onRowClickProject={(projectId) => router.push(`/project/${projectId}/headquarters-inspection?fromBranch=${encodeURIComponent(selectedSafetyBranch || '')}`)}
                    onSelectSafetyBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                      router.push(`/safe/branch/${encodeURIComponent(branch)}/headquarters`)
                    }}
                  />
                )}
              </>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {/* 폭염대비점검 카드 */}
                <div 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  onClick={() => {
                    if (selectedSafetyBranch) {
                      router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/heatwave`)
                    } else {
                      router.push('/safe/heatwave')
                    }
                  }}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center mb-2">
                      <Thermometer className="h-4 w-4 text-red-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">폭염대비점검</h4>
                    {loading ? (
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                      </div>
                    ) : (() => {
                      // 선택된 본부/지사에 따라 폭염점검 데이터 필터링
                      const filteredHeatWaveChecks = heatWaveChecks.filter((check: HeatWaveCheck) => {
                        if (selectedHq && check.managing_hq !== selectedHq) return false
                        // selectedBranch가 빈 문자열이면 전체 지사로 간주하여 스킵
                        if (selectedBranch && selectedBranch !== '' && check.managing_branch !== selectedBranch) return false
                        return true
                      })
                      
                      return (
                        <div className="text-xs text-gray-600">
                          <div className="text-sm font-semibold text-blue-600 mb-0.5">
                            {filteredHeatWaveChecks.length}
                          </div>
                          <div className="text-xs">건 점검완료</div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* TBM 현황 카드 */}
                <div 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  onClick={() => router.push('/tbm')}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">TBM</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-sm font-semibold text-blue-600 mb-0.5">
                        현황
                      </div>
                      <div className="text-xs">확인하기</div>
                    </div>
                  </div>
                </div>

                {/* (지사) 관리자 점검 현황 카드 */}
                <div 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  onClick={() => {
                    if (selectedSafetyBranch) {
                      router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/manager`)
                    } else {
                      router.push('/safe/manager')
                    }
                  }}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-green-200 transition-colors">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">(지사) 관리자 점검</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-sm font-semibold text-blue-600 mb-0.5">
                        {managerInspections.length}
                      </div>
                      <div className="text-xs">건 점검완료</div>
                    </div>
                  </div>
                </div>

                {/* (본부) 불시 점검 현황 카드 */}
                <div 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  onClick={() => {
                    if (selectedSafetyBranch) {
                      router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/headquarters`)
                    } else {
                      router.push('/safe/headquarters')
                    }
                  }}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-orange-200 transition-colors">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">(본부) 불시 점검</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-sm font-semibold text-blue-600 mb-0.5">
                        {headquartersInspections.length}
                      </div>
                      <div className="text-xs">건 점검완료</div>
                    </div>
                  </div>
                </div>

                {/* 산업안전보건관리비 집행현황 카드 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-blue-200 transition-colors">
                      <Building className="h-4 w-4 text-blue-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">산업안전보건관리비</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-sm font-semibold text-blue-600 mb-0.5">준비중</div>
                      <div className="text-xs">집행현황</div>
                    </div>
                  </div>
                </div>


                {/* 위험공종허가제 현황 카드 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-blue-200 transition-colors">
                      <AlertTriangle className="h-4 w-4 text-blue-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">위험공종허가제</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-sm font-semibold text-blue-600 mb-0.5">준비중</div>
                      <div className="text-xs">현황</div>
                    </div>
                  </div>
                </div>

                {/* 빈 카드 1 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02] opacity-50">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                      <div className="w-4 h-4 bg-gray-300 rounded"></div>
                    </div>
                    <h4 className="text-xs font-medium text-gray-400 mb-1">추후 추가</h4>
                    <div className="text-xs text-gray-400">
                      <div className="text-sm font-semibold text-gray-400 mb-0.5">-</div>
                      <div className="text-xs">-</div>
                    </div>
                  </div>
                </div>

                {/* 빈 카드 2 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02] opacity-50">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                      <div className="w-4 h-4 bg-gray-300 rounded"></div>
                    </div>
                    <h4 className="text-xs font-medium text-gray-400 mb-1">추후 추가</h4>
                    <div className="text-xs text-gray-400">
                      <div className="text-sm font-semibold text-gray-400 mb-0.5">-</div>
                      <div className="text-xs">-</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {(selectedHq || selectedBranch) ? (
              <div className="space-y-6">
                {(() => {
                  const groups = new Map<string, Project[]>()
                  filteredProjects.forEach((p: Project) => {
                    const key = p.managing_branch || '미지정'
                    if (!groups.has(key)) groups.set(key, [])
                    groups.get(key)!.push(p)
                  })

                  // 특정 지사가 선택된 경우: 해당 지사만 표시
                  if (selectedBranch) {
                    const items: Project[] = groups.get(selectedBranch) || []
                    return (
                      <div key={selectedBranch} className="bg-white/90 backdrop-blur rounded-lg border border-white/20 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Building className="h-4 w-4 text-blue-600" />
                            <h4 className="text-sm font-semibold text-gray-900">{selectedBranch}</h4>
                          </div>
                          <span className="text-xs text-gray-500">{items.length}개 현장</span>
                        </div>
                        {items.length === 0 ? (
                          <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white/50">등록된 프로젝트가 없습니다.</div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {items.map((project: Project) => (
                              <ProjectCard
                                key={project.id}
                                project={project}
                                onClick={handleProjectClick}
                                onEdit={handleProjectEdit}
                                onDelete={handleProjectDelete}
                                onStatusChange={handleProjectStatusChange}
                                onHandover={handleProjectHandover}
                                canEditQuarters={userProfile?.role === '발주청'}
                                onIsActiveChange={handleProjectIsActiveJsonChange}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  // 전체 지사 또는 특정 본부 선택 시: 모든 지사 컨테이너 표시 (빈 데이터 포함)
                  const baseBranches: string[] = selectedHq
                    ? (BRANCH_OPTIONS[selectedHq] || [])
                    : Array.from(new Set(Object.values(BRANCH_OPTIONS).flat()))

                  const branchOrder: string[] = selectedHq ? (BRANCH_OPTIONS[selectedHq] || []) : baseBranches
                  const branchNames: string[] = Array.from(new Set([...baseBranches, ...Array.from(groups.keys())]))
                  const sortedBranchNames: string[] = branchNames.sort((a: string, b: string) => {
                    if (branchOrder.length === 0) return a.localeCompare(b)
                    const ai = branchOrder.indexOf(a)
                    const bi = branchOrder.indexOf(b)
                    if (ai === -1 && bi === -1) return a.localeCompare(b)
                    if (ai === -1) return 1
                    if (bi === -1) return -1
                    return ai - bi
                  })

                  return sortedBranchNames.map((branchName: string) => {
                    const items: Project[] = groups.get(branchName) || []
                    return (
                      <div key={branchName as string} className="bg-white/90 backdrop-blur rounded-lg border border-white/20 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Building className="h-4 w-4 text-blue-600" />
                            <h4 className="text-sm font-semibold text-gray-900">{branchName}</h4>
                          </div>
                          <span className="text-xs text-gray-500">{items.length}개 현장</span>
                        </div>
                        {items.length === 0 ? (
                          <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white/50">등록된 프로젝트가 없습니다.</div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {items.map((project: Project) => (
                              <ProjectCard
                                key={project.id}
                                project={project}
                                onClick={handleProjectClick}
                                onEdit={handleProjectEdit}
                                onDelete={handleProjectDelete}
                                onStatusChange={handleProjectStatusChange}
                                onHandover={handleProjectHandover}
                                canEditQuarters={userProfile?.role === '발주청'}
                                onIsActiveChange={handleProjectIsActiveJsonChange}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            ) : (
              // 본부/지사 선택이 없는 경우: 기존 단일 그리드 표시
              filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh]">
                  <div className="text-center">
                    <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      현장이 등록되어 있지 않습니다
                    </h3>
                    <p className="text-gray-600">
                      선택한 조건에 해당하는 현장이 없습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {filteredProjects.map((project: Project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onClick={handleProjectClick}
                      onEdit={handleProjectEdit}
                      onDelete={handleProjectDelete}
                      onStatusChange={handleProjectStatusChange}
                      onHandover={handleProjectHandover}
                      canEditQuarters={userProfile?.role === '발주청'}
                      onIsActiveChange={handleProjectIsActiveJsonChange}
                    />
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    )
  }

  // 시공사/감리단용 대시보드
  const renderContractorDashboard = () => (
    <ContractorDashboard
      loading={loading}
      error={error}
      projects={projects}
      userRole={userProfile?.role}
      onRetry={loadUserProjects}
      onSiteRegistration={handleSiteRegistration}
      onProjectClick={handleProjectClick}
      onProjectEdit={handleProjectEdit}
      onProjectDelete={handleProjectDelete}
      onProjectStatusChange={handleProjectStatusChange}
      onProjectHandover={handleProjectHandover}
      onProjectIsActiveJsonChange={handleProjectIsActiveJsonChange}
    />
  )

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center flex-1 min-w-0">
              <Shield className="h-6 w-6 lg:h-8 lg:w-8 text-blue-600 mr-2 lg:mr-3 flex-shrink-0" />
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">안전관리 시스템</h1>
            </div>
            <div className="flex items-center space-x-2 lg:space-x-4">
              {/* PWA 설치 버튼 */}
              <PWAInstallButtonHeader />
              
              {/* 사용자 드롭다운 메뉴 */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={handleUserMenuToggle}
                  className="flex items-center space-x-1 px-3 py-2 text-xs lg:text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <span className="font-medium hidden sm:inline">{userProfile?.full_name || user?.email}</span>
                  <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role || '사용자'})</span>
                  <ChevronDown className="h-4 w-4 ml-1" />
                </button>

                {/* 드롭다운 메뉴 */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                    {/* 이메일 주소 */}
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4" />
                        <span className="truncate">{user?.email}</span>
                      </div>
                    </div>
                    
                    {/* 정보 수정 */}
                    <button
                      onClick={handleProfileEdit}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                      <span>정보 수정</span>
                    </button>
                    
                    {/* 계정 삭제 */}
                    <button
                      onClick={handleAccountDelete}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>계정 삭제</span>
                    </button>
                    
                    {/* 구분선 */}
                    <div className="border-t border-gray-100 my-1"></div>
                    
                    {/* 로그아웃 */}
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>로그아웃</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
        <div className="px-4 py-6 sm:px-0 lg:px-0">
          {userProfile?.role === '발주청' 
            ? (
              // 1차 래핑: 기존 거대한 JSX를 그대로 유지하되 ClientDashboard 래퍼로 감싸 구조를 단순화
              <ClientDashboard
                loading={loading}
                error={error}
                viewMode={viewMode}
                selectedHq={selectedHq}
                selectedBranch={selectedBranch}
                selectedSafetyCard={selectedSafetyCard}
                selectedSafetyBranch={selectedSafetyBranch}
                selectedDate={selectedDate}
                selectedQuarter={selectedQuarter}
                canSeeAllHq={canSeeAllHq}
                projects={projects}
                projectsWithCoords={projectsWithCoords}
                heatWaveChecks={heatWaveChecks}
                managerInspections={managerInspections}
                headquartersInspections={headquartersInspections}
                onRetryLoadBranches={loadBranchProjects}
                onProjectClick={handleProjectClick}
                onProjectEdit={handleProjectEdit}
                onProjectDelete={handleProjectDelete}
                onProjectStatusChange={handleProjectStatusChange}
                onProjectHandover={handleProjectHandover}
                onProjectIsActiveJsonChange={handleProjectIsActiveJsonChange}
                onMapProjectClick={handleMapProjectClick}
                onHeatWaveCheckClick={handleHeatWaveCheckClick}
                onBranchSelect={(branch) => setSelectedBranch(branch)}
                onHqSelect={(hq) => { setSelectedHq(hq); setSelectedBranch('') }}
                MapContainerRef={mapContainerRef}
                mapDynamicHeight={mapDynamicHeight}
                Header={null as any}
                Content={renderClientDashboard()}
              />
            )
            : renderContractorDashboard()
          }
        </div>
      </main>

      {/* 플로팅 현장 등록 버튼 - 리스트 보기에서만 표시 */}
      {viewMode === 'list' && (
        <div className="fixed bottom-6 right-6">
          <button
            onClick={handleSiteRegistration}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="h-6 w-6" />
            <span className="font-medium">현장 등록</span>
          </button>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <ProjectDeleteModal
        isOpen={deleteModal.isOpen}
        project={deleteModal.project}
        onClose={handleDeleteModalClose}
        onConfirm={handleDeleteConfirm}
      />

      {/* 프로젝트 인계 모달 */}
      <ProjectHandoverModal
        isOpen={handoverModal.isOpen}
        project={handoverModal.project}
        onClose={handleHandoverModalClose}
        onSuccess={handleHandoverModalClose}
      />

      {/* 프로필 수정 모달 */}
      <ProfileEditModal
        isOpen={isProfileEditModalOpen}
        onClose={() => setIsProfileEditModalOpen(false)}
        onSuccess={() => {
          // 프로필 업데이트 성공 시 추가 작업이 필요하면 여기에 작성
        }}
      />

      {/* 계정 삭제 확인 모달 */}
      {isAccountDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                계정 삭제
              </h3>
              
              <div className="text-sm text-gray-500 text-center mb-6">
                <p className="mb-2">
                  계정을 삭제하면 다음 데이터가 모두 삭제됩니다:
                </p>
                <ul className="text-left space-y-1">
                  <li>• 계정 정보 및 프로필</li>
                  <li>• 등록한 모든 프로젝트</li>
                  <li>• 모든 점검 결과 및 기록</li>
                </ul>
                <p className="mt-4 font-medium text-red-600">
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  계속하려면 <span className="font-bold text-red-600">"삭제"</span>를 정확히 입력하세요:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="삭제"
                  disabled={isDeleting}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleAccountDeleteCancel}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleAccountDeleteConfirm}
                  disabled={isDeleting || deleteConfirmText !== '삭제'}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? '삭제 중...' : '계정 삭제'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard 