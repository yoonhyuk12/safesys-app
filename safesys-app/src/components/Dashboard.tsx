'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Shield, AlertTriangle, CheckCircle, Activity, LogOut, Plus, Building, Map as MapIcon, List, Calendar, Thermometer, ChevronDown, ChevronUp, Edit, Trash2, ArrowLeft, ChevronLeft, Download, FileDown, RefreshCw, Users, Briefcase, Package, Search, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { getUserProjects, getProjectsByUserBranch, getHeatWaveChecksByUserBranch, deleteProject, getAllProjectsDebug, getManagerInspectionsByUserBranch, getHeadquartersInspectionsByUserBranch, getTBMSafetyInspectionsByUserBranch, getSafeDocumentInspectionsByUserBranch, getWorkerCountsByUserBranch, getMaterialCountsByUserBranch, getSafetyInspectionCountsByUserBranch, getSharedProjects, type Project, type ProjectWithCoords, type HeatWaveCheck, type ManagerInspection, type HeadquartersInspection, type TBMSafetyInspection, type SafeDocumentInspection, type WorkerCountByProject, type MaterialCountByProject, type SafetyInspectionCountByProject } from '@/lib/projects'
import { getTBMRecords, type TBMRecord } from '@/lib/tbm'
import { downloadProjectListExcel } from '@/lib/excel/project-list-export'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS, DEBUG_LOGS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { getQuartersToggleMap, updateQuartersToggleSetting } from '@/lib/ui-settings'
import ProjectCard from '@/components/project/ProjectCard'
import ProjectDeleteModal from '@/components/project/ProjectDeleteModal'
import ProjectHandoverModal from '@/components/project/ProjectHandoverModal'
import ProjectShareModal from '@/components/project/ProjectShareModal'
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
import SafetyTBMView from '@/components/dashboard/SafetyTBMView'
import SafeDocumentView from '@/components/dashboard/SafeDocumentView'
import SafetyWorkerView from '@/components/dashboard/SafetyWorkerView'
import SafetyNewWorkerOrientationView from '@/components/dashboard/SafetyNewWorkerOrientationView'
import SafetyInspectionLedgerView from '@/components/dashboard/SafetyInspectionLedgerView'
import BusinessMaterialView from '@/components/dashboard/BusinessMaterialView'
import TBMChatBot from '@/components/ui/TBMChatBot'
import officeLocationsData from '@/lib/office-locations.json'

// JSX IntrinsicElements 선언: 빌드 도중 JSX 타입 미탐지 방지용 안전망
// JSX 타입 선언
interface JSXIntrinsicElements {
  [elemName: string]: unknown;
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends JSXIntrinsicElements { }
  }
}

const Dashboard: React.FC = () => {
  const { user, userProfile, signOut } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsWithCoords, setProjectsWithCoords] = useState<ProjectWithCoords[]>([])
  const [hqPendingCounts, setHqPendingCounts] = useState<Record<string, number>>({})
  const [safetyPendingCounts, setSafetyPendingCounts] = useState<Record<string, number>>({})
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
  const [viewMode, setViewMode] = useState<'tbm' | 'map' | 'list' | 'safety' | 'business'>('tbm')
  // 프로그레스 바 상태 (TBMStatus에서 업데이트)
  const [tbmProgressPercentage, setTbmProgressPercentage] = useState<number>(100)
  const [tbmTimeRemaining, setTbmTimeRemaining] = useState<number>(15 * 60)
  const [tbmManualRefresh, setTbmManualRefresh] = useState<(() => Promise<void>) | null>(null)
  // TBM 데이터 상태 (map 페이지용)
  const [tbmRecordsForMap, setTbmRecordsForMap] = useState<TBMRecord[]>([])
  const [tbmLoadingForMap, setTbmLoadingForMap] = useState<boolean>(false)


  // 경로 변화에 따라 viewMode 동기화 (SSR/CSR 일치)
  useEffect(() => {
    const path = pathname
    let next: 'tbm' | 'map' | 'list' | 'safety' | 'business' = 'tbm'
    if (path && path.startsWith('/safe')) next = 'safety'
    else if (path === '/list') next = 'list'
    else if (path === '/map') next = 'map'
    else if (path === '/business') next = 'business'
    else if (path === '/tbm') next = 'tbm'
    setViewMode(next)
  }, [pathname])
  const [selectedHq, setSelectedHq] = useState<string>('') // 선택된 본부
  const [selectedBranch, setSelectedBranch] = useState<string>('') // 선택된 지사
  const [searchQuery, setSearchQuery] = useState<string>('') // 목록 검색어
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
  // 본부 선택 상태: 본사가 아닌 경우 사용자의 소속 본부로 초기화
  const [selectedSafetyHq, setSelectedSafetyHq] = useState<string | null>(() => {
    // 본사 소속(hq_division이 null이거나 '본사')인 경우에만 null (전체 본부 테이블)
    // 특정 본부 소속인 경우 해당 본부의 지사 테이블부터 시작
    if (!userProfile) return null
    const isHeadOffice = userProfile.hq_division == null || userProfile.hq_division === '본사'
    return isHeadOffice ? null : (userProfile.hq_division ?? null)
  })
  const [selectedSafetyBranch, setSelectedSafetyBranch] = useState<string | null>(() => {
    return searchParams.get('selectedSafetyBranch') || null
  })
  // 본부별 컨테이너 펼침/접힘 상태 (기본값: 모두 접힌 상태)
  const [expandedHqs, setExpandedHqs] = useState<Set<string>>(new Set())

  // 본부 컨테이너 토글 함수
  const toggleHqExpand = (hqName: string) => {
    setExpandedHqs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(hqName)) {
        newSet.delete(hqName)
      } else {
        newSet.add(hqName)
      }
      return newSet
    })
  }

  // 지사별 컨테이너 펼침/접힘 상태
  // 모바일: 초기에 모든 지사 접힌 상태(카드 2개)
  // 데스크톱: 초기에 모든 지사 펼친 상태(전체 표시)
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(() => {
    // 모바일인지 확인 (768px 미만)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      // 모바일: 초기화는 useEffect에서 수행
      return new Set()
    }
    return new Set()
  })

  // 모바일에서 초기 렌더링 시 모든 지사를 접힌 상태로 설정
  const hasInitializedBranchCollapse = useRef(false)
  useEffect(() => {
    if (hasInitializedBranchCollapse.current) return
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      // 현재 표시되는 지사 목록을 가져와서 모두 접힌 상태로 설정
      const allBranches = new Set<string>()
      projects.forEach(p => {
        if (p.managing_branch) {
          allBranches.add(p.managing_branch)
        }
      })
      if (allBranches.size > 0) {
        setCollapsedBranches(allBranches)
        hasInitializedBranchCollapse.current = true
      }
    } else {
      hasInitializedBranchCollapse.current = true
    }
  }, [projects])

  // 지사 컨테이너 토글 함수
  const toggleBranchCollapse = (branchName: string) => {
    setCollapsedBranches(prev => {
      const newSet = new Set(prev)
      if (newSet.has(branchName)) {
        newSet.delete(branchName)
      } else {
        newSet.add(branchName)
      }
      return newSet
    })
  }

  // 현재 날짜 기준 분기 계산 함수
  const getCurrentQuarter = () => {
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
  }

  // 항상 오늘 날짜 기준 분기로 초기화 (localStorage 무시)
  const [selectedQuarter, setSelectedQuarter] = useState<string>(() => getCurrentQuarter())
  const [managerInspections, setManagerInspections] = useState<ManagerInspection[]>([])
  const [headquartersInspections, setHeadquartersInspections] = useState<HeadquartersInspection[]>([])
  const [tbmSafetyInspections, setTbmSafetyInspections] = useState<TBMSafetyInspection[]>([])
  const [safeDocumentInspections, setSafeDocumentInspections] = useState<SafeDocumentInspection[]>([])
  const [workerCounts, setWorkerCounts] = useState<WorkerCountByProject[]>([])
  const [safetyInspectionCounts, setSafetyInspectionCounts] = useState<SafetyInspectionCountByProject[]>([])
  const [safetyInspectionYear, setSafetyInspectionYear] = useState<number>(new Date().getFullYear())
  const [materialCounts, setMaterialCounts] = useState<MaterialCountByProject[]>([])
  const [selectedBusinessCard, setSelectedBusinessCard] = useState<string | null>(null)
  const [materialDataLoading, setMaterialDataLoading] = useState(false)
  const [orientationStats, setOrientationStats] = useState<{ project_id: string; project_name: string; orientation_count: number; worker_count: number }[]>([])
  const [orientationDataLoading, setOrientationDataLoading] = useState(false)
  const [inspectionDataLoading, setInspectionDataLoading] = useState(false)
  const [cardDataLoading, setCardDataLoading] = useState(false)
  const [isAccountDeleteModalOpen, setIsAccountDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // 분기별 공사중 여부 편집 권한: 발주청 + (본사/본부급 이상)
  const canEditQuarters = userProfile?.role === '발주청' &&
    (userProfile.hq_division == null || userProfile.branch_division?.endsWith('본부'))

  // 분기 토글 UI 표시 여부: 발주청이면 모두 표시 (편집 권한과 별개)
  const showQuarters = userProfile?.role === '발주청'

  // 본부별 공사중 토글 표시 여부 Map (본부명 -> 표시여부)
  const [quartersToggleMap, setQuartersToggleMap] = useState<Map<string, boolean>>(new Map())

  const [handoverModal, setHandoverModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [sharedProjects, setSharedProjects] = useState<Project[]>([])
  const userMenuRef = useRef<HTMLDivElement>(null)
  const isDataLoaded = useRef(false)
  const isViewModeInitialized = useRef(false)
  const isSelectionInitialized = useRef(false)
  const lastHeatWaveParams = useRef<{ date: string; hq: string; branch: string; viewMode: string } | null>(null)
  const lastCardDataParams = useRef<{ date: string; quarter: string; hq: string; branch: string } | null>(null)
  const lastManagerParams = useRef<{ quarter: string; hq: string; branch: string } | null>(null)
  const lastHeadquartersParams = useRef<{ quarter: string; hq: string; branch: string } | null>(null)
  const lastTBMParams = useRef<{ hq: string; branch: string } | null>(null)
  const heatWaveLoading = useRef(false)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const [mapDynamicHeight, setMapDynamicHeight] = useState<number>(500)
  const lastMapTopRef = useRef<number>(-1)

  // 보고서 선택 모드 (본부/지사 일괄)
  const [isHqDownloadMode, setIsHqDownloadMode] = useState(false)
  const [selectedBranchesForReport, setSelectedBranchesForReport] = useState<string[]>([])
  const [selectedProjectIdsForReport, setSelectedProjectIdsForReport] = useState<string[]>([])
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [reportProgress, setReportProgress] = useState<{ current: number; total: number } | null>(null)

  // 프로젝트 카드 편집 모드 상태 (롱 프레스로 순서 변경)
  const [isProjectEditMode, setIsProjectEditMode] = useState(false)
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)

  // 전사 보기 가능 여부: 발주청이면서 관리자급(hq_division 없음) 또는 본사 소속 또는 본부 지사 사용자
  const canSeeAllHq = React.useMemo(() => {
    if (!userProfile || userProfile.role !== '발주청') return false
    return (
      userProfile.hq_division == null ||
      (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') ||
      !!userProfile.branch_division?.endsWith('본부')
    )
  }, [userProfile])

  // viewMode 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard-view-mode', viewMode)
    }
  }, [viewMode])

  // 스크롤 위치 복원 (프로젝트 상세/수정에서 돌아왔을 때)
  useEffect(() => {
    // 데이터 로딩이 완료된 후에만 스크롤 복원
    if (loading) return

    if (typeof window !== 'undefined') {
      const savedScrollPosition = sessionStorage.getItem('dashboard-scroll-position')
      if (savedScrollPosition) {
        // DOM이 완전히 렌더링되도록 충분한 지연
        const scrollTimeout = setTimeout(() => {
          window.scrollTo(0, parseInt(savedScrollPosition, 10))
          // 복원 후 저장된 위치 및 경로 제거
          sessionStorage.removeItem('dashboard-scroll-position')
          sessionStorage.removeItem('dashboard-return-path')
        }, 300)

        return () => clearTimeout(scrollTimeout)
      }
    }
  }, [pathname, loading, projects])

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
  const lastPathnameRef = useRef<string>('')
  useEffect(() => {
    if (!pathname) return
    // 동일한 pathname이면 중복 실행 방지
    if (lastPathnameRef.current === pathname) {
      return
    }
    lastPathnameRef.current = pathname

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
        if (card === 'heatwave' || card === 'manager' || card === 'headquarters' || card === 'tbm' || card === 'worker' || card === 'newWorkerOrientation' || card === 'safetyInspection') {
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
        console.log('🔍 경로 처리:', { pathname, segments, card, selectedSafetyCard })
        if (card === 'heatwave' || card === 'manager' || card === 'headquarters' || card === 'tbm' || card === 'safeDocument' || card === 'worker' || card === 'newWorkerOrientation' || card === 'safetyInspection') {
          if (selectedSafetyCard !== card) {
            console.log('✅ selectedSafetyCard 설정:', card)
            setSelectedSafetyCard(card)
          }
          // /safe/manager 같은 카드 경로에서도 지사 선택 초기화 (지사 테이블을 먼저 보기 위함)
          if (selectedSafetyBranch !== null) {
            setSelectedSafetyBranch(null)
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
    } else if (pathname === '/business') {
      if (viewMode !== 'business') setViewMode('business')
    }
  }, [pathname, selectedSafetyCard, selectedSafetyBranch, selectedBranch, viewMode])

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
    // 하단 여백을 고려하여 계산 (더 정확한 높이 계산)
    const available = Math.floor(window.innerHeight - rect.top - 32)
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
    const t3 = setTimeout(recalcMapHeight, 500)
    const t4 = setTimeout(recalcMapHeight, 1000)
    const raf1 = requestAnimationFrame(recalcMapHeight)
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(recalcMapHeight))
    const raf3 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(recalcMapHeight)
      })
    })
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      cancelAnimationFrame(raf3)
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

  // 본부별 공사중 토글 표시 설정 로드
  useEffect(() => {
    const loadQuartersToggleSettings = async () => {
      try {
        const map = await getQuartersToggleMap()

        // HEADQUARTERS_OPTIONS의 모든 본부에 대해 기본값 설정
        // 서버에 설정이 없는 본부는 기본값 true (활성화)
        const allHqs = Object.keys(BRANCH_OPTIONS).filter(hq => hq !== '본사' && hq !== '기타')
        allHqs.forEach(hq => {
          if (!map.has(hq)) {
            map.set(hq, true) // 기본값: 활성화
          }
        })

        setQuartersToggleMap(map)
      } catch (error) {
        console.error('본부별 토글 설정 로드 실패:', error)
      }
    }

    if (user && userProfile) {
      loadQuartersToggleSettings()
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
    const isExplicitViewRoute = isOnSafetyRoutes || pathname === '/tbm' || pathname === '/map' || pathname === '/list' || pathname === '/business'

    // 명시적 라우트 또는 view 파라미터가 있을 때는 기본값으로 덮어쓰지 않음
    if (!viewParam && !isExplicitViewRoute && viewMode !== 'safety' && viewMode !== 'business') {
      setViewMode('tbm') // 모든 사용자는 TBM 보기가 기본
    }
  }, [userProfile, pathname, viewMode])

  // 발주자 로그인 시 소속 정보 기본값 설정 (최초 1회만)
  useEffect(() => {
    if (!userProfile || userProfile.role !== '발주청') return
    if (isSelectionInitialized.current) return

    // 본사/본사 소속인 경우 전체 본부/전체 지사로 설정
    if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
      if (selectedHq !== '') {
        setSelectedHq('')
      }
      if (selectedBranch !== '') {
        setSelectedBranch('')
      }
    } else {
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
          // 단, /safe/manager 같은 카드 경로에서는 지사 테이블을 먼저 보여주기 위해 설정하지 않음
          const currentPath = pathname || ''
          const isCardRoute = currentPath.match(/^\/safe\/(heatwave|manager|headquarters)$/)
          if (userProfile.branch_division?.includes('지사') && !isCardRoute && selectedSafetyBranch !== userProfile.branch_division) {
            setSelectedSafetyBranch(userProfile.branch_division)
          }
        }
      }
    }
    isSelectionInitialized.current = true
  }, [userProfile, pathname])

  // TBM 데이터 로드 함수 (범례 클릭 시 호출)
  const loadTBMDataForMap = React.useCallback(async () => {
    if (!(user && userProfile)) {
      return
    }
    // 발주청의 본부/지사 기본값 세팅이 끝나기 전에는 조회하지 않도록 가드
    if (!isSelectionInitialized.current) return

    try {
      setTbmLoadingForMap(true)

      // 사용자 소속에 따라 필터링 파라미터 결정
      // 본사 소속이거나 selectedHq가 비어있으면 전체, 아니면 선택된 본부/지사로 필터링
      let filterHq: string | undefined = undefined
      let filterBranch: string | undefined = undefined

      // 사용자 프로필의 소속 정보 확인
      const isHeadOffice = userProfile.hq_division == null || userProfile.hq_division === '본사'

      if (!isHeadOffice && userProfile.hq_division) {
        // 특정 본부 소속인 경우
        filterHq = selectedHq || userProfile.hq_division

        // 특정 지사 소속이고 selectedBranch가 있으면 지사 필터링
        if (userProfile.branch_division && !userProfile.branch_division.endsWith('본부')) {
          filterBranch = selectedBranch || userProfile.branch_division
        } else if (selectedBranch) {
          filterBranch = selectedBranch
        }
      } else {
        // 본사 소속이거나 전체 보기 권한이 있는 경우
        // selectedHq, selectedBranch가 있으면 해당 값으로 필터링
        if (selectedHq) {
          filterHq = selectedHq
        }
        if (selectedBranch) {
          filterBranch = selectedBranch
        }
      }

      console.log('TBM 데이터 로드 (map용) - 필터:', { filterHq, filterBranch, selectedHq, selectedBranch })

      const response = await getTBMRecords(selectedDate, filterHq, filterBranch)

      if (response.success && response.records) {
        // 위경도가 있는 TBM 기록만 필터링
        const recordsWithCoords = response.records.filter(
          record => record.latitude && record.longitude
        )
        setTbmRecordsForMap(recordsWithCoords)
        console.log('TBM 데이터 로드 완료 (map용):', recordsWithCoords.length, '건', { filterHq, filterBranch })
      } else {
        console.warn('TBM 데이터 로드 실패:', response.message)
        setTbmRecordsForMap([])
      }
    } catch (error) {
      console.error('TBM 데이터 로드 중 오류:', error)
      setTbmRecordsForMap([])
    } finally {
      setTbmLoadingForMap(false)
    }
  }, [user, userProfile, selectedDate, selectedHq, selectedBranch])

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

  // 선택된 분기를 localStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedQuarter', selectedQuarter)
    }
  }, [selectedQuarter])

  // 날짜 선택기에서 날짜가 변경되면 해당 날짜의 분기로 selectedQuarter도 자동 업데이트
  useEffect(() => {
    if (!selectedDate) return
    const date = new Date(selectedDate)
    if (Number.isNaN(date.getTime())) return

    const month = date.getMonth() + 1 // 1-12
    const year = date.getFullYear()

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

    const newQuarter = `${year}Q${quarter}`
    if (newQuarter !== selectedQuarter) {
      console.log(`📅 날짜(${selectedDate})에 따라 분기 자동 업데이트: ${selectedQuarter} → ${newQuarter}`)
      setSelectedQuarter(newQuarter)
    }
  }, [selectedDate])

  // 점검 데이터 로드 함수 (useCallback으로 먼저 정의)
  const loadInspectionData = useCallback(async () => {
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
      } else if (selectedSafetyCard === 'tbm') {
        console.log('📋 TBM 안전활동점검 데이터만 조회 중...')
        // 날짜 범위는 전체로 조회 (필요시 수정 가능)
        const result = await getTBMSafetyInspectionsByUserBranch(userProfile, selectedHq, selectedBranch)
        if (result.success && result.inspections) {
          console.log(`✅ TBM 안전활동점검 조회 완료: ${result.inspections.length}건`)
          setTbmSafetyInspections(result.inspections)
        } else {
          console.error('❌ TBM 안전활동점검 데이터 로드 실패:', result.error)
          setTbmSafetyInspections([])
        }
      } else if (selectedSafetyCard === 'safeDocument') {
        console.log('📋 안전서류 점검 데이터만 조회 중...')
        const result = await getSafeDocumentInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch)
        if (result.success && result.inspections) {
          console.log(`✅ 안전서류 점검 조회 완료: ${result.inspections.length}건`)
          setSafeDocumentInspections(result.inspections)
        } else {
          console.error('❌ 안전서류 점검 데이터 로드 실패:', result.error)
          setSafeDocumentInspections([])
        }
      } else if (selectedSafetyCard === 'worker') {
        console.log('📋 근로자 등록현황 데이터만 조회 중...')
        const result = await getWorkerCountsByUserBranch(userProfile, selectedHq, selectedBranch)
        if (result.success && result.workerCounts) {
          console.log(`✅ 근로자 등록현황 조회 완료: ${result.workerCounts.length}개 프로젝트`)
          setWorkerCounts(result.workerCounts)
        } else {
          console.error('❌ 근로자 등록현황 데이터 로드 실패:', result.error)
          setWorkerCounts([])
        }
      } else if (selectedSafetyCard === 'safetyInspection') {
        console.log('📋 정기안전점검 현황 데이터만 조회 중...')
        const result = await getSafetyInspectionCountsByUserBranch(userProfile, selectedHq, selectedBranch, safetyInspectionYear)
        if (result.success && result.inspectionCounts) {
          console.log(`✅ 정기안전점검 현황 조회 완료: ${result.inspectionCounts.length}개 프로젝트`)
          setSafetyInspectionCounts(result.inspectionCounts)
        } else {
          console.error('❌ 정기안전점검 현황 데이터 로드 실패:', result.error)
          setSafetyInspectionCounts([])
        }
      }
    } catch (err: any) {
      console.error('점검 데이터 로드 실패:', err)
    } finally {
      setInspectionDataLoading(false)
    }
  }, [userProfile, selectedSafetyCard, selectedQuarter, selectedHq, selectedBranch, safetyInspectionYear])

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
  }, [user, userProfile, selectedSafetyCard, selectedQuarter, selectedHq, selectedBranch, loadInspectionData, managerInspections.length])

  // 본부 불시점검 선택 시 본부 불시점검 데이터만 로드  
  const headquartersLoadingRef = useRef(false)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'headquarters')) {
      headquartersLoadingRef.current = false
      return
    }
    if (!isSelectionInitialized.current) return

    // 이미 로딩 중이면 중복 실행 방지
    if (headquartersLoadingRef.current) {
      if (DEBUG_LOGS) console.log('✅ 본부 불시점검 데이터 로딩 중. 중복 실행 방지')
      return
    }

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
    headquartersLoadingRef.current = true
    loadInspectionData().finally(() => {
      headquartersLoadingRef.current = false
    })
  }, [user, userProfile, selectedSafetyCard, selectedQuarter, selectedHq, selectedBranch, loadInspectionData, headquartersInspections.length])

  // TBM 안전활동점검 선택 시 TBM 안전활동점검 데이터만 로드
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'tbm')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastTBMParams.current &&
      lastTBMParams.current.hq === currentParams.hq &&
      lastTBMParams.current.branch === currentParams.branch &&
      tbmSafetyInspections.length > 0) {
      if (DEBUG_LOGS) console.log('✅ TBM 안전활동점검 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 TBM 안전활동점검 전용 데이터 로딩 시작')
    lastTBMParams.current = currentParams
    loadInspectionData()
  }, [user, userProfile, selectedSafetyCard, selectedHq, selectedBranch])

  // 안전서류 점검 선택 시 안전서류 점검 데이터만 로드
  const lastSafeDocParams = useRef<{ quarter: string; hq: string; branch: string } | null>(null)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'safeDocument')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { quarter: selectedQuarter, hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastSafeDocParams.current &&
      lastSafeDocParams.current.quarter === currentParams.quarter &&
      lastSafeDocParams.current.hq === currentParams.hq &&
      lastSafeDocParams.current.branch === currentParams.branch &&
      safeDocumentInspections.length > 0) {
      if (DEBUG_LOGS) console.log('✅ 안전서류 점검 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 안전서류 점검 전용 데이터 로딩 시작')
    lastSafeDocParams.current = currentParams
    loadInspectionData()
  }, [user, userProfile, selectedSafetyCard, selectedQuarter, selectedHq, selectedBranch, safeDocumentInspections.length, loadInspectionData])

  // 근로자 등록현황 선택 시 근로자 데이터만 로드
  const lastWorkerParams = useRef<{ hq: string; branch: string } | null>(null)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'worker')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastWorkerParams.current &&
      lastWorkerParams.current.hq === currentParams.hq &&
      lastWorkerParams.current.branch === currentParams.branch &&
      workerCounts.length > 0) {
      if (DEBUG_LOGS) console.log('✅ 근로자 등록현황 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 근로자 등록현황 전용 데이터 로딩 시작')
    lastWorkerParams.current = currentParams
    loadInspectionData()
  }, [user, userProfile, selectedSafetyCard, selectedHq, selectedBranch, workerCounts.length, loadInspectionData])

  // 정기안전점검 현황 선택 시 데이터만 로드
  const lastSafetyInspectionParams = useRef<{ hq: string; branch: string; year: number } | null>(null)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && selectedSafetyCard === 'safetyInspection')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { hq: selectedHq || '', branch: selectedBranch || '', year: safetyInspectionYear }
    if (lastSafetyInspectionParams.current &&
      lastSafetyInspectionParams.current.hq === currentParams.hq &&
      lastSafetyInspectionParams.current.branch === currentParams.branch &&
      lastSafetyInspectionParams.current.year === currentParams.year &&
      safetyInspectionCounts.length > 0) {
      if (DEBUG_LOGS) console.log('✅ 정기안전점검 현황 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 정기안전점검 현황 전용 데이터 로딩 시작')
    lastSafetyInspectionParams.current = currentParams
    loadInspectionData()
  }, [user, userProfile, selectedSafetyCard, selectedHq, selectedBranch, safetyInspectionYear, safetyInspectionCounts.length, loadInspectionData])

  // 신규근로자 현장안내 데이터 로드 (안전현황 진입 시 카드 숫자 표시용)
  const lastOrientationParams = useRef<{ hq: string; branch: string } | null>(null)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && viewMode === 'safety')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastOrientationParams.current &&
      lastOrientationParams.current.hq === currentParams.hq &&
      lastOrientationParams.current.branch === currentParams.branch &&
      orientationStats.length > 0) {
      return
    }

    lastOrientationParams.current = currentParams
    setOrientationDataLoading(true)

    const loadOrientationData = async () => {
      try {
        // 활성 프로젝트 ID 목록 가져오기
        const activeProjectIds = projects.filter(p => {
          if (p.is_active === undefined || p.is_active === null) return true
          if (typeof p.is_active === 'boolean') return p.is_active
          if (typeof p.is_active === 'object') return !(p.is_active as any).completed
          return true
        }).map(p => p.id)

        if (activeProjectIds.length === 0) {
          setOrientationStats([])
          return
        }

        // new_worker_orientations 테이블에서 프로젝트별 집계
        const { data, error } = await (supabase as any)
          .from('new_worker_orientations')
          .select('project_id, workers')
          .in('project_id', activeProjectIds)

        if (error) {
          console.error('현장안내 데이터 로드 실패:', error)
          setOrientationStats([])
          return
        }

        // 프로젝트별 집계
        const statsMap = new Map<string, { orientation_count: number; worker_count: number }>()
          ; (data || []).forEach((record: any) => {
            const pid = record.project_id
            const existing = statsMap.get(pid) || { orientation_count: 0, worker_count: 0 }
            existing.orientation_count += 1
            const workers = record.workers || []
            const filledWorkers = workers.filter((w: any) => w.name && w.name.trim() !== '')
            existing.worker_count += filledWorkers.length
            statsMap.set(pid, existing)
          })

        const result = projects
          .filter(p => activeProjectIds.includes(p.id))
          .map(p => {
            const s = statsMap.get(p.id) || { orientation_count: 0, worker_count: 0 }
            return {
              project_id: p.id,
              project_name: p.project_name,
              orientation_count: s.orientation_count,
              worker_count: s.worker_count,
            }
          })

        setOrientationStats(result)
      } catch (err) {
        console.error('현장안내 데이터 로드 중 오류:', err)
        setOrientationStats([])
      } finally {
        setOrientationDataLoading(false)
      }
    }

    loadOrientationData()
  }, [user, userProfile, viewMode, selectedHq, selectedBranch, orientationStats.length, projects])

  // 사업현황 진입 시 자급자재 데이터 로드
  const lastMaterialParams = useRef<{ hq: string; branch: string } | null>(null)
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && viewMode === 'business')) {
      return
    }
    if (!isSelectionInitialized.current) return

    const currentParams = { hq: selectedHq || '', branch: selectedBranch || '' }
    if (lastMaterialParams.current &&
      lastMaterialParams.current.hq === currentParams.hq &&
      lastMaterialParams.current.branch === currentParams.branch &&
      materialCounts.length > 0) {
      if (DEBUG_LOGS) console.log('✅ 자급자재 등록현황 데이터 이미 로딩됨. 재로딩 스킵')
      return
    }

    if (DEBUG_LOGS) console.log('🔍 자급자재 등록현황 전용 데이터 로딩 시작')
    lastMaterialParams.current = currentParams
    setMaterialDataLoading(true)
    getMaterialCountsByUserBranch(userProfile, selectedHq || undefined, selectedBranch || undefined)
      .then(result => {
        if (result.success && result.materialCounts) {
          setMaterialCounts(result.materialCounts)
        }
      })
      .finally(() => setMaterialDataLoading(false))
  }, [user, userProfile, viewMode, selectedHq, selectedBranch, materialCounts.length])

  // 지도보기일 때 점검 데이터 로드
  useEffect(() => {
    if (!(user && userProfile && userProfile.role === '발주청' && viewMode === 'map')) {
      return
    }
    if (!isSelectionInitialized.current) return

    console.log('🗺️ 지도보기 점검 데이터 로딩 트리거')
    loadMapInspectionData()
  }, [user, userProfile, viewMode, selectedQuarter, selectedHq, selectedBranch])

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

    // 경로가 상세 카드 경로(/safe/manager, /safe/headquarters, /safe/heatwave, /safe/tbm 등)인 경우 메인 카드 집계 로딩을 차단
    const isCardDetailRoute = (() => {
      if (!pathname) return false
      const segments = pathname.split('/').filter(Boolean)
      if (segments[0] !== 'safe') return false
      const card = segments[1] === 'branch' ? segments[3] : segments[1]
      return card === 'heatwave' || card === 'manager' || card === 'headquarters' || card === 'tbm' || card === 'worker' || card === 'safetyInspection'
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
      heatWaveChecks.length > 0 && managerInspections.length > 0 && headquartersInspections.length > 0 && tbmSafetyInspections.length >= 0) {
      console.log('✅ 카드용 데이터 이미 로딩됨. 중복 실행 방지:', currentCardParams)
      return
    }

    console.log('🏠 안전현황 메인 - 카드 건수 표시용 전체 데이터 로딩 시작')
    lastCardDataParams.current = currentCardParams

    // 안전현황 메인에서는 카드 건수 표시를 위해 모든 점검 데이터 로딩
    const loadCardData = async () => {
      try {
        setCardDataLoading(true)
        console.log('📊 카드 건수 표시용 데이터 로딩:', currentCardParams)
        const [heatWaveResult, managerResult, headquartersResult, tbmResult, safeDocResult, workerResult, safetyInspResult] = await Promise.all([
          getHeatWaveChecksByUserBranch(userProfile, selectedDate, selectedHq, selectedBranch),
          getManagerInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch),
          getHeadquartersInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch),
          getTBMSafetyInspectionsByUserBranch(userProfile, selectedHq, selectedBranch, selectedDate, selectedDate),
          getSafeDocumentInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch),
          getWorkerCountsByUserBranch(userProfile, selectedHq, selectedBranch),
          getSafetyInspectionCountsByUserBranch(userProfile, selectedHq, selectedBranch, safetyInspectionYear)
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

        if (tbmResult.success && tbmResult.inspections) {
          setTbmSafetyInspections(tbmResult.inspections)
          console.log('✅ TBM안전활동점검:', tbmResult.inspections.length, '건')
        }

        if (safeDocResult.success && safeDocResult.inspections) {
          setSafeDocumentInspections(safeDocResult.inspections)
          console.log('✅ 안전서류점검:', safeDocResult.inspections.length, '건')
        }

        if (workerResult.success && workerResult.workerCounts) {
          setWorkerCounts(workerResult.workerCounts)
          console.log('✅ 근로자등록현황:', workerResult.workerCounts.reduce((s: number, w: WorkerCountByProject) => s + w.worker_count, 0), '명')
        }

        if (safetyInspResult.success && safetyInspResult.inspectionCounts) {
          setSafetyInspectionCounts(safetyInspResult.inspectionCounts)
          console.log('✅ 정기안전점검:', safetyInspResult.inspectionCounts.reduce((s: number, c: SafetyInspectionCountByProject) => s + c.inspection_count, 0), '건')
        }

        console.log('🏠 안전현황 메인 카드 데이터 로딩 완료')
      } catch (err) {
        console.error('카드 데이터 로드 실패:', err)
      } finally {
        setCardDataLoading(false)
      }
    }

    loadCardData()
  }, [user, userProfile, viewMode, selectedDate, selectedQuarter, selectedHq, selectedBranch, selectedSafetyCard, safetyInspectionYear])

  const loadUserProjects = async () => {
    if (!user) return

    setLoading(true)
    setError('')

    try {
      const [result, sharedResult] = await Promise.all([
        getUserProjects(),
        getSharedProjects()
      ])

      // 내 프로젝트 설정
      const myProjects = (result.success && result.projects) ? result.projects : []
      setProjects(myProjects)

      // 공유받은 프로젝트 설정 (내 프로젝트 조회 실패와 무관하게 독립 처리)
      const shared = (sharedResult.success && sharedResult.projects) ? sharedResult.projects : []
      setSharedProjects(shared)

      // 둘 다 실패한 경우에만 에러 표시
      if (!result.success && !sharedResult.success) {
        setError(result.error || '프로젝트를 불러오는데 실패했습니다.')
      }

      // 본부 불시점검 미조치 건수 조회 (내 프로젝트 + 공유받은 프로젝트)
      const allProjects = [...myProjects, ...shared]
      if (allProjects.length > 0) {
        const projectIds = allProjects.map(p => p.id)
        const { data: hqInspections } = await (supabase as any)
          .from('headquarters_inspections')
          .select('project_id, action_photo_issue1, action_photo_issue2, issue_content2, site_photo_issue2, issue1_status, issue2_status')
          .in('project_id', projectIds)

        if (hqInspections) {
          const counts: Record<string, number> = {}
          hqInspections.forEach((ins: any) => {
            const hasIssue2 = Boolean((ins.issue_content2 && ins.issue_content2.trim()) || ins.site_photo_issue2)
            const issue1Done = Boolean(ins.action_photo_issue1) || ins.issue1_status === 'completed'
            const issue2Done = !hasIssue2 ? true : (Boolean(ins.action_photo_issue2) || ins.issue2_status === 'completed')
            if (!(issue1Done && issue2Done)) {
              counts[ins.project_id] = (counts[ins.project_id] || 0) + 1
            }
          })
          setHqPendingCounts(counts)
        }

        // 안전점검 미조치 건수 조회 (내 프로젝트 + 공유받은 프로젝트)
        const { data: safetyInspections } = await (supabase as any)
          .from('safety_inspections')
          .select('project_id, id, safety_inspection_results(id, after_photo_url)')
          .in('project_id', projectIds)

        if (safetyInspections) {
          const sCounts: Record<string, number> = {}
          safetyInspections.forEach((ins: any) => {
            const results = ins.safety_inspection_results || []
            const pending = results.filter((r: any) => !r.after_photo_url || r.after_photo_url.trim() === '').length
            if (pending > 0) {
              sCounts[ins.project_id] = (sCounts[ins.project_id] || 0) + pending
            }
          })
          setSafetyPendingCounts(sCounts)
        }
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

        // 본부 불시점검 미조치 건수 조회
        if (result.projects.length > 0) {
          const projectIds = result.projects.map(p => p.id)
          const { data: hqInspections } = await (supabase as any)
            .from('headquarters_inspections')
            .select('project_id, action_photo_issue1, action_photo_issue2, issue_content2, site_photo_issue2, issue1_status, issue2_status')
            .in('project_id', projectIds)

          if (hqInspections) {
            const counts: Record<string, number> = {}
            hqInspections.forEach((ins: any) => {
              const hasIssue2 = Boolean((ins.issue_content2 && ins.issue_content2.trim()) || ins.site_photo_issue2)
              const issue1Done = Boolean(ins.action_photo_issue1) || ins.issue1_status === 'completed'
              const issue2Done = !hasIssue2 ? true : (Boolean(ins.action_photo_issue2) || ins.issue2_status === 'completed')
              if (!(issue1Done && issue2Done)) {
                counts[ins.project_id] = (counts[ins.project_id] || 0) + 1
              }
            })
            setHqPendingCounts(counts)
          }

          // 안전점검 미조치 건수 조회
          const { data: safetyInspections } = await (supabase as any)
            .from('safety_inspections')
            .select('project_id, id, safety_inspection_results(id, after_photo_url)')
            .in('project_id', projectIds)

          if (safetyInspections) {
            const sCounts: Record<string, number> = {}
            safetyInspections.forEach((ins: any) => {
              const results = ins.safety_inspection_results || []
              const pending = results.filter((r: any) => !r.after_photo_url || r.after_photo_url.trim() === '').length
              if (pending > 0) {
                sCounts[ins.project_id] = (sCounts[ins.project_id] || 0) + pending
              }
            })
            setSafetyPendingCounts(sCounts)
          }
        }

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

  // 지도보기일 때 점검 데이터 로딩
  const loadMapInspectionData = async () => {
    if (!userProfile || userProfile.role !== '발주청') return

    try {
      console.log('🗺️ 지도보기 점검 데이터 로딩:', selectedQuarter, '본부:', selectedHq, '지사:', selectedBranch)

      const [managerResult, headquartersResult] = await Promise.all([
        getManagerInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch),
        getHeadquartersInspectionsByUserBranch(userProfile, selectedQuarter, selectedHq, selectedBranch)
      ])

      if (managerResult.success && managerResult.inspections) {
        console.log(`✅ 지도용 관리자 점검: ${managerResult.inspections.length}건`)
        setManagerInspections(managerResult.inspections)
      }

      if (headquartersResult.success && headquartersResult.inspections) {
        console.log(`✅ 지도용 본부 점검: ${headquartersResult.inspections.length}건`)
        setHeadquartersInspections(headquartersResult.inspections)
      }
    } catch (err: any) {
      console.error('지도 점검 데이터 로드 실패:', err)
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

  // 프로젝트의 본부에 따라 분기 토글 편집 가능 여부 결정
  const canEditQuartersForProject = (project: Project): boolean => {
    // 프로젝트의 관할 본부 확인
    const projectHq = project.managing_hq
    if (!projectHq) return false

    // 해당 본부의 설정 확인 (기본값: true)
    // 본부에서 토글을 off 했으면 무조건 비활성화
    const hqToggleSetting = quartersToggleMap.get(projectHq) !== false
    if (!hqToggleSetting) return false

    // 본부 설정이 on이면 사용자 권한 확인
    // 발주청 역할이 아니면 편집 불가
    if (userProfile?.role !== '발주청') return false

    // 발주청이면 활성화
    return true
  }

  // 공사중토글 버튼 클릭 핸들러 - 사용자 본부의 설정 토글
  const handleQuartersToggleClick = async () => {
    if (!userProfile || !userProfile.hq_division) {
      alert('본부 정보를 찾을 수 없습니다.')
      return
    }

    const currentHq = userProfile.hq_division
    const currentSetting = quartersToggleMap.get(currentHq) !== false // 기본값 true
    const newSetting = !currentSetting

    try {
      // 서버 업데이트
      const result = await updateQuartersToggleSetting(currentHq, newSetting)

      if (result.success) {
        // 로컬 상태 업데이트
        setQuartersToggleMap(prev => {
          const newMap = new Map(prev)
          newMap.set(currentHq, newSetting)
          return newMap
        })
      } else {
        alert(`설정 업데이트 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('공사중토글 설정 업데이트 오류:', error)
      alert('설정 업데이트 중 오류가 발생했습니다.')
    }
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

    if (!user || !userProfile) {
      alert('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setIsDeleting(true)
    try {
      // 1. 같은 지사의 다른 발주청 사용자 찾기
      let transferTo: string | null = null

      if (userProfile.branch_division) {
        const { data: branchUsers } = await (supabase as any)
          .from('user_profiles')
          .select('id')
          .eq('role', '발주청')
          .eq('branch_division', userProfile.branch_division)
          .neq('id', user.id)
          .limit(1)

        if (branchUsers && branchUsers.length > 0) {
          transferTo = branchUsers[0].id
        }
      }

      // 2. 같은 지사에 없으면 같은 본부의 발주청 사용자 찾기
      if (!transferTo && userProfile.hq_division) {
        const { data: hqUsers } = await (supabase as any)
          .from('user_profiles')
          .select('id')
          .eq('role', '발주청')
          .eq('hq_division', userProfile.hq_division)
          .neq('id', user.id)
          .limit(1)

        if (hqUsers && hqUsers.length > 0) {
          transferTo = hqUsers[0].id
        }
      }

      // 3. 인계할 사용자가 없으면 삭제 불가
      if (!transferTo) {
        alert('인계할 발주청 소속 직원이 없어 계정을 삭제할 수 없습니다.\n관리자에게 문의해주세요.')
        return
      }

      // 4. 프로젝트 및 관련 데이터의 created_by를 인계자로 변경
      const tablesToTransfer = [
        'projects',
        'heat_wave_checks',
        'manager_inspections',
        'headquarters_inspections',
        'safe_document_inspections',
      ]

      for (const table of tablesToTransfer) {
        const { error } = await (supabase as any)
          .from(table)
          .update({ created_by: transferTo })
          .eq('created_by', user.id)

        if (error) {
          console.warn(`${table} 인계 실패:`, error)
        }
      }

      // action_by 컬럼도 인계 (headquarters_inspections)
      await (supabase as any)
        .from('headquarters_inspections')
        .update({ action_by: transferTo })
        .eq('action_by', user.id)

      // 5. user_profiles 삭제
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', user.id)

      if (profileError) {
        throw new Error(profileError.message)
      }

      // 6. Authentication 사용자 삭제 시도
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
        if (authError) {
          console.warn('Auth 사용자 삭제 실패 (권한 부족일 수 있음):', authError)
        }
      } catch (authDeleteError) {
        console.warn('Auth 사용자 삭제 시도 실패:', authDeleteError)
      }

      alert('계정이 삭제되었습니다.\n프로젝트 및 점검 데이터는 같은 소속 직원에게 인계되었습니다.')
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
      // 현재 스크롤 위치 저장
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dashboard-scroll-position', window.scrollY.toString())
        // 프로젝트 리스트에서 온 경우 플래그 설정
        if (pathname === '/list') {
          sessionStorage.setItem(`project_${project.id}_from_list`, 'true')
        }
      }
      router.push(`/project/${project.id}`)
      console.log('라우터 push 성공:', `/project/${project.id}`)
    } catch (error) {
      console.error('라우터 push 오류:', error)
    }
  }

  const handleProjectEdit = (project: Project) => {
    // 현재 스크롤 위치 및 경로 저장
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dashboard-scroll-position', window.scrollY.toString())
      sessionStorage.setItem('dashboard-return-path', pathname || '/')
    }
    // 프로젝트 수정 페이지로 이동
    router.push(`/project/${project.id}/edit`)
  }

  const handleProjectHandover = (project: Project) => {
    setHandoverModal({ isOpen: true, project })
  }

  const handleProjectShare = (project: Project) => {
    setShareModal({ isOpen: true, project })
  }

  const handleShareModalClose = () => {
    setShareModal({ isOpen: false, project: null })
    // 공유 변경 후 목록 갱신: 발주청은 loadBranchProjects, 시공사/감리단은 loadUserProjects
    if (userProfile?.role === '발주청') {
      void loadBranchProjects()
    } else {
      void loadUserProjects()
    }
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

  // 권한이 변경되었거나(예: 로그인 사용자 role) 발주청이 아닌 경우, 편집 모드는 강제 종료
  useEffect(() => {
    if (!isProjectEditMode) return
    if (userProfile?.role === '발주청') return
    setIsProjectEditMode(false)
    setDraggedProjectId(null)
    setDragOverProjectId(null)
  }, [isProjectEditMode, userProfile?.role])

  // 프로젝트 카드 편집 모드 핸들러
  const handleProjectLongPressStart = useCallback(() => {
    // 발주청만 "순서 변경(편집 모드)" 진입 가능
    if (userProfile?.role !== '발주청') return
    console.log('Dashboard: 롱 프레스 시작 - 편집 모드 진입')
    setIsProjectEditMode(true)
    setDraggedProjectId(null)
    setDragOverProjectId(null)
  }, [userProfile?.role])

  const handleProjectLongPressEnd = useCallback(() => {
    // 편집 모드는 "바깥 클릭"으로만 종료 (아이폰 방식)
  }, [])

  const handleProjectDragStart = useCallback((projectId: string) => {
    if (!isProjectEditMode) return
    setDraggedProjectId(projectId)
  }, [isProjectEditMode])

  const handleProjectDragOver = useCallback((e: React.DragEvent, projectId: string, currentProjects: Project[]) => {
    if (!isProjectEditMode || !draggedProjectId || draggedProjectId === projectId) return
    e.preventDefault()
    setDragOverProjectId(projectId)

    // 실시간으로 순서 업데이트 (같은 지사 내에서만)
    const draggedIndex = currentProjects.findIndex(p => p.id === draggedProjectId)
    const targetIndex = currentProjects.findIndex(p => p.id === projectId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const draggedProject = currentProjects[draggedIndex]
    if (draggedProject.managing_branch !== currentProjects[targetIndex].managing_branch) return

    // 새로운 순서 계산
    const newProjects = [...currentProjects]
    const [dragged] = newProjects.splice(draggedIndex, 1)
    newProjects.splice(targetIndex, 0, dragged)

    const managingBranch = draggedProject.managing_branch
    const sameBranchProjects = newProjects.filter(proj => proj.managing_branch === managingBranch)

    // ⚠️ 중요: currentProjects(화면에 보이는 리스트)로 state 전체를 덮어쓰면 데이터 유실될 수 있음
    // → prev 전체를 유지한 채, 같은 지사 프로젝트들의 display_order만 업데이트
    setProjects((prev: Project[]) => prev.map((p: Project) => {
      if (p.managing_branch !== managingBranch) return p
      const orderIndex = sameBranchProjects.findIndex(proj => proj.id === p.id)
      if (orderIndex === -1) return p
      return { ...p, display_order: orderIndex + 1 }
    }))

    setProjectsWithCoords((prev: ProjectWithCoords[]) => prev.map((p: ProjectWithCoords) => {
      if (p.managing_branch !== managingBranch) return p
      const orderIndex = sameBranchProjects.findIndex(proj => proj.id === p.id)
      if (orderIndex === -1) return p
      return { ...p, display_order: orderIndex + 1 }
    }))
  }, [isProjectEditMode, draggedProjectId])

  // 드래그 중 실시간 순서 계산 함수
  const getProjectDisplayOrder = useCallback((project: Project, index: number, projects: Project[]) => {
    // 드래그 중이 아닌 경우 원래 순서 사용
    if (!isProjectEditMode || !draggedProjectId || !dragOverProjectId) {
      return project.display_order ?? index + 1
    }

    const draggedIndex = projects.findIndex(p => p.id === draggedProjectId)
    const dragOverIndex = projects.findIndex(p => p.id === dragOverProjectId)

    if (draggedIndex === -1 || dragOverIndex === -1) {
      return project.display_order ?? index + 1
    }

    // 드래그 중인 카드와 드래그 오버된 카드가 같은 지사인지 확인
    const draggedProject = projects[draggedIndex]
    if (draggedProject.managing_branch !== project.managing_branch) {
      return project.display_order ?? index + 1
    }

    // 새로운 순서 계산
    const newProjects = [...projects]
    const [dragged] = newProjects.splice(draggedIndex, 1)
    newProjects.splice(dragOverIndex, 0, dragged)

    // 현재 프로젝트의 새로운 인덱스 찾기
    const newIndex = newProjects.findIndex(p => p.id === project.id)
    if (newIndex === -1) {
      return project.display_order ?? index + 1
    }

    // 같은 지사 내에서의 새로운 순서 계산
    const sameBranchProjects = newProjects.filter(p => p.managing_branch === project.managing_branch)
    const sameBranchIndex = sameBranchProjects.findIndex(p => p.id === project.id)

    return sameBranchIndex !== -1 ? sameBranchIndex + 1 : (project.display_order ?? index + 1)
  }, [isProjectEditMode, draggedProjectId, dragOverProjectId])

  const persistBranchOrder = useCallback(async (managingBranch: string, ordered: Project[]) => {
    const { supabase } = await import('@/lib/supabase')
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error('인증 토큰이 없습니다.')
    }

    const sameBranchProjects = ordered.filter(p => p.managing_branch === managingBranch)
    const updatePromises = sameBranchProjects.map(async (project, index) => {
      const newOrder = index + 1
      console.log(`[dragEnd] 프로젝트 ${project.project_name}의 display_order를 ${newOrder}로 업데이트 중...`)

      const response = await fetch(`/api/projects/${project.id}/order`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ display_order: newOrder })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error(`[dragEnd] 프로젝트 ${project.project_name} 업데이트 실패:`, response.status, errorData)
        throw new Error(`[dragEnd] 프로젝트 ${project.project_name} 업데이트 실패: ${response.status}`)
      }

      const result = await response.json()
      console.log(`[dragEnd] 프로젝트 ${project.project_name} 업데이트 성공:`, result)
      return result
    })

    return await Promise.all(updatePromises)
  }, [])

  const handleProjectDragEnd = useCallback(async (currentProjects: Project[]) => {
    // 드래그 상태 초기화 (이게 안 되면 외부 클릭으로 편집모드 종료가 영원히 막힘)
    const draggedId = draggedProjectId
    setDragOverProjectId(null)
    setDraggedProjectId(null)

    // drop이 카드 위에서 안 잡히는 경우도 많아서, dragEnd 시점에 현재 순서를 저장
    if (!isProjectEditMode || !draggedId) return

    const draggedProject = currentProjects.find(p => p.id === draggedId)
    const managingBranch = draggedProject?.managing_branch
    if (!managingBranch) return

    // 현재 화면 리스트 기준으로 같은 지사 아이템을 display_order 오름차순으로 정렬해서 저장
    const ordered = [...currentProjects]
      .filter(p => p.managing_branch === managingBranch)
      .sort((a, b) => {
        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
        return aOrder - bOrder
      })

    try {
      const results = await persistBranchOrder(managingBranch, ordered)
      console.log('[dragEnd] 모든 프로젝트 순서 업데이트 완료:', results)
      // ✅ 아이폰 방식: 저장돼도 편집모드 유지 (리로드/종료 없음)
    } catch (error) {
      console.error('[dragEnd] 순서 업데이트 실패:', error)
      alert(`순서 변경에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}. 다시 시도해주세요.`)
    }
  }, [draggedProjectId, isProjectEditMode, persistBranchOrder])

  const handleProjectDrop = useCallback(async (e: React.DragEvent, targetProjectId: string, projects: Project[]) => {
    if (!isProjectEditMode || !draggedProjectId || draggedProjectId === targetProjectId) return

    e.preventDefault()
    setDragOverProjectId(null)
    // drop에서도 draggedProjectId를 즉시 해제해 “드래그 중” 블로킹이 남지 않게 함
    setDraggedProjectId(null)

    const draggedIndex = projects.findIndex(p => p.id === draggedProjectId)
    const targetIndex = projects.findIndex(p => p.id === targetProjectId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // 새로운 순서 계산
    const newProjects = [...projects]
    const [draggedProject] = newProjects.splice(draggedIndex, 1)
    newProjects.splice(targetIndex, 0, draggedProject)

    // display_order 업데이트 (같은 지사 내에서만)
    const managingBranch = draggedProject.managing_branch
    const sameBranchProjects = newProjects.filter(p => p.managing_branch === managingBranch)

    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('인증 토큰이 없습니다.')
      }

      // 각 프로젝트의 display_order 업데이트
      const updatePromises = sameBranchProjects.map(async (project, index) => {
        const newOrder = index + 1
        console.log(`프로젝트 ${project.project_name}의 display_order를 ${newOrder}로 업데이트 중...`)

        const response = await fetch(`/api/projects/${project.id}/order`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ display_order: newOrder })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error(`프로젝트 ${project.project_name} 업데이트 실패:`, response.status, errorData)
          throw new Error(`프로젝트 ${project.project_name} 업데이트 실패: ${response.status}`)
        }

        const result = await response.json()
        console.log(`프로젝트 ${project.project_name} 업데이트 성공:`, result)
        return result
      })

      const results = await Promise.all(updatePromises)
      console.log('모든 프로젝트 순서 업데이트 완료:', results)
      // ✅ 아이폰 방식: 저장돼도 편집모드 유지 (리로드/종료 없음)
    } catch (error) {
      console.error('순서 업데이트 실패:', error)
      alert(`순서 변경에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}. 다시 시도해주세요.`)
    }
  }, [isProjectEditMode, draggedProjectId])

  // 외부 클릭 시 편집 모드 종료
  useEffect(() => {
    if (!isProjectEditMode) return

    // 모바일에서 스크롤 제스처(pointerdown 후 이동)를 "외부 탭"으로 오인해 종료하지 않도록
    // - 터치: 카드 외 영역에서 "짧게 탭" (이동 거의 없음)일 때만 종료
    // - 마우스: 기존처럼 카드 외 클릭 시 즉시 종료
    const touchExitRef = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      startTime: 0,
      moved: false
    }

    const isInsideCardAtPoint = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      return !!el?.closest?.('[data-project-card="true"]')
    }

    const handlePointerDown = (event: PointerEvent) => {
      // 드래그 중이면 편집 모드 종료하지 않음
      if (draggedProjectId) return

      // 마우스/펜: 기존처럼 즉시 종료
      if (event.pointerType !== 'touch') {
        const insideCard = isInsideCardAtPoint(event.clientX, event.clientY)
        if (!insideCard) {
          setIsProjectEditMode(false)
          setDraggedProjectId(null)
          setDragOverProjectId(null)
        }
        return
      }

      // 터치: "탭" 여부를 pointerup에서 판정 (이동/시간 체크)
      const insideCard = isInsideCardAtPoint(event.clientX, event.clientY)
      if (insideCard) return
      touchExitRef.active = true
      touchExitRef.pointerId = event.pointerId
      touchExitRef.startX = event.clientX
      touchExitRef.startY = event.clientY
      touchExitRef.startTime = Date.now()
      touchExitRef.moved = false
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!touchExitRef.active) return
      if (event.pointerId !== touchExitRef.pointerId) return
      const dx = event.clientX - touchExitRef.startX
      const dy = event.clientY - touchExitRef.startY
      // 약간의 흔들림은 허용하되, 스크롤 제스처면 종료 취소
      if (Math.hypot(dx, dy) > 10) {
        touchExitRef.moved = true
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!touchExitRef.active) return
      if (event.pointerId !== touchExitRef.pointerId) return

      const duration = Date.now() - touchExitRef.startTime
      const insideCard = isInsideCardAtPoint(event.clientX, event.clientY)

      // "짧게 탭" && "이동 거의 없음" && "카드 밖" → 편집모드 종료
      if (!touchExitRef.moved && duration < 350 && !insideCard) {
        setIsProjectEditMode(false)
        setDraggedProjectId(null)
        setDragOverProjectId(null)
      }

      touchExitRef.active = false
      touchExitRef.pointerId = -1
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId === touchExitRef.pointerId) {
        touchExitRef.active = false
        touchExitRef.pointerId = -1
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [isProjectEditMode, draggedProjectId])

  // ===== 모바일(터치) 편집모드 드래그 정렬 지원 =====
  // - HTML5 drag&drop이 모바일에서 잘 안 되므로 pointer 이벤트로 직접 재정렬
  const reorderBranchInStateByIds = useCallback((draggedId: string, targetId: string) => {
    // dragged/target 프로젝트 찾기 (현재 state 기준)
    const dragged = projects.find(p => p.id === draggedId)
    const target = projects.find(p => p.id === targetId)
    const branch = dragged?.managing_branch
    if (!branch || branch !== target?.managing_branch) return

    // 같은 지사 프로젝트를 display_order 기준으로 정렬해서 "현재 순서"로 간주
    const branchOrdered = [...projects]
      .filter(p => p.managing_branch === branch)
      .sort((a, b) => {
        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
        return aOrder - bOrder
      })

    const from = branchOrdered.findIndex(p => p.id === draggedId)
    const to = branchOrdered.findIndex(p => p.id === targetId)
    if (from === -1 || to === -1 || from === to) return

    const nextBranch = [...branchOrdered]
    const [picked] = nextBranch.splice(from, 1)
    nextBranch.splice(to, 0, picked)

    // state 전체는 유지하고, 해당 지사 display_order만 1..N으로 재할당
    setProjects((prev: Project[]) => prev.map((p: Project) => {
      if (p.managing_branch !== branch) return p
      const idx = nextBranch.findIndex(x => x.id === p.id)
      if (idx === -1) return p
      return { ...p, display_order: idx + 1 }
    }))

    setProjectsWithCoords((prev: ProjectWithCoords[]) => prev.map((p: ProjectWithCoords) => {
      if (p.managing_branch !== branch) return p
      const idx = nextBranch.findIndex(x => x.id === p.id)
      if (idx === -1) return p
      return { ...p, display_order: idx + 1 }
    }))
  }, [projects])

  useEffect(() => {
    if (!isProjectEditMode) return

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (!draggedProjectId) return

      // 카드 위에서 드래그 중에는 스크롤 방지
      e.preventDefault()

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const cardEl = el?.closest?.('[data-project-card="true"]') as HTMLElement | null
      const targetId = cardEl?.getAttribute('data-project-id')
      if (!targetId || targetId === draggedProjectId) return

      setDragOverProjectId(targetId)
      reorderBranchInStateByIds(draggedProjectId, targetId)
    }

    const handlePointerUp = async (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (!draggedProjectId) return

      const draggedId = draggedProjectId
      setDragOverProjectId(null)
      setDraggedProjectId(null)

      // 현재 state 기준으로 같은 지사 순서를 저장 (편집모드 유지)
      const dragged = projects.find(p => p.id === draggedId)
      const branch = dragged?.managing_branch
      if (!branch) return

      const branchOrdered = [...projects]
        .filter(p => p.managing_branch === branch)
        .sort((a, b) => {
          const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
          const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
          return aOrder - bOrder
        })

      try {
        const results = await persistBranchOrder(branch, branchOrdered)
        console.log('[touch] 모든 프로젝트 순서 업데이트 완료:', results)
      } catch (error) {
        console.error('[touch] 순서 업데이트 실패:', error)
        alert(`순서 변경에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}. 다시 시도해주세요.`)
      }
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: false })
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove as any)
      document.removeEventListener('pointerup', handlePointerUp as any)
      document.removeEventListener('pointercancel', handlePointerUp as any)
    }
  }, [isProjectEditMode, draggedProjectId, projects, reorderBranchInStateByIds, persistBranchOrder])

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

  // useMemo로 필터링 결과 메모이제이션 (renderClientDashboard에서 추출)
  const filteredProjects = React.useMemo(() => {
    return projects.filter((project: Project) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })
  }, [projects, selectedHq, selectedBranch])

  // 검색어 기반 필터링 (list 뷰용)
  const searchFilteredProjects = React.useMemo(() => {
    if (!searchQuery.trim()) return filteredProjects
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/)
    return filteredProjects.filter((project: Project) => {
      const searchableText = [
        project.project_name,
        project.managing_branch,
        project.supervisor_name,
        project.site_address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return tokens.every(token => searchableText.includes(token))
    })
  }, [filteredProjects, searchQuery])

  const filteredProjectsWithCoords = React.useMemo(() => {
    return projectsWithCoords.filter((project: ProjectWithCoords) => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })
  }, [projectsWithCoords, selectedHq, selectedBranch])

  // 사무실 위치 데이터 메모이제이션
  const allOffices = React.useMemo(() => {
    return (officeLocationsData as any).features
      .filter((feature: any) => {
        const userHq = userProfile?.hq_division
        // 본사 소속이거나 hq_division이 없으면 모든 청사 표시
        if (!userHq || userHq === '본사') return true

        // 사용자 본부에서 "본부" 접미사 제거 (예: "경기본부" → "경기")
        const userHqPrefix = userHq.replace(/본부$/, '').trim()

        // 청사 데이터의 본부단위 정규화 (줄바꿈 제거)
        const officeHq = (feature.raw_data['본부단위'] || '').replace(/\r?\n/g, '').trim()

        // 매칭: 경기본부 사용자 → 경기 본부단위 청사 (인천 포함)
        return officeHq === userHqPrefix
      })
      .map((feature: any) => ({
        id: `office-${feature.label_text}`,
        name: feature.label_text,
        address: feature.address,
        lat: feature.lat,
        lng: feature.lng,
        phone: feature.raw_data['사무실'],
        hq: feature.raw_data['본부단위'],
        branch: feature.raw_data['지사단위']
      }))
  }, [userProfile?.hq_division])

  // 지도용 프로젝트 데이터 메모이제이션
  const projectsForMap = React.useMemo(() => {
    return filteredProjectsWithCoords
      .filter((project: ProjectWithCoords) => {
        // 좌표가 없으면 제외
        if (!project.coords) return false
        // 준공 처리된 프로젝트 제외
        if (typeof project.is_active === 'object' && project.is_active?.completed === true) return false
        return true
      })
      .map((project: ProjectWithCoords) => {
        return ({
          id: project.id,
          name: project.project_name,
          address: project.site_address,
          lat: project.coords!.lat,
          lng: project.coords!.lng,
          managingHq: project.managing_hq,
          managingBranch: project.managing_branch,
          is_active: project.is_active, // JSONB 객체 또는 boolean 그대로 전달
          supervisor_position: project.supervisor_position,
          supervisor_name: project.supervisor_name
        })
      })
  }, [filteredProjectsWithCoords])

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

    // projectsForMap 계산 로직 제거됨 (상단 useMemo로 이동)
    // const projectsForMap = ... (제거됨)

    return (
      <div className={`${viewMode === 'tbm' && selectedBranch ? 'space-y-2' : 'space-y-6'} ${viewMode === 'tbm' ? 'lg:w-screen lg:relative lg:left-1/2 lg:right-1/2 lg:-ml-[50vw] lg:-mr-[50vw] lg:px-4' : ''}`}>
        {/* 헤더 */}
        <div className={`relative bg-white/80 backdrop-blur rounded-lg border border-white/20 shadow-sm p-3 lg:p-4 flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0 overflow-hidden ${viewMode === 'tbm' && selectedBranch ? 'lg:w-[calc(50%-6px)] lg:h-[8.5rem]' : ''}`}>
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

              {/* 모바일에서만 통계 텍스트 표시, 데스크톱 TBM 지사 뷰에서는 우측으로 이동 */}
              <p className={`text-gray-600 text-sm ${viewMode === 'tbm' && selectedBranch ? 'lg:hidden' : ''}`}>
                {(() => {
                  // 준공 지구 제외
                  const activeProjects = filteredProjects.filter(p => {
                    if (typeof p.is_active === 'object' && p.is_active?.completed === true) return false
                    return true
                  })
                  const q1Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q1 === true
                  }).length
                  const q2Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q2 === true
                  }).length
                  const q3Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q3 === true
                  }).length
                  const q4Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q4 === true
                  }).length
                  return `총${activeProjects.length}(1분:${q1Count} / 2분:${q2Count} / 3분:${q3Count} / 4분:${q4Count})`
                })()}
              </p>
            </div>
          </div>

          {/* 엑셀 다운 & 뷰 모드 전환 버튼 */}
          <div className={`flex gap-2 self-end lg:self-auto ${viewMode === 'tbm' && selectedBranch ? 'lg:flex-col lg:items-end' : 'items-center'}`}>
            {/* 데스크톱 TBM 지사 뷰에서만 통계 텍스트 표시 */}
            {viewMode === 'tbm' && selectedBranch && (
              <p className="hidden lg:block text-gray-600 text-sm whitespace-nowrap flex-shrink-0">
                {(() => {
                  // 준공 지구 제외
                  const activeProjects = filteredProjects.filter(p => {
                    if (typeof p.is_active === 'object' && p.is_active?.completed === true) return false
                    return true
                  })
                  const q1Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q1 === true
                  }).length
                  const q2Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q2 === true
                  }).length
                  const q3Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q3 === true
                  }).length
                  const q4Count = activeProjects.filter(p => {
                    if (typeof p.is_active === 'boolean') return p.is_active
                    return p.is_active?.q4 === true
                  }).length
                  return `총${activeProjects.length}(1분:${q1Count} / 2분:${q2Count} / 3분:${q3Count} / 4분:${q4Count})`
                })()}
              </p>
            )}

            <div className="flex items-center gap-2">
              {/* 엑셀 다운로드 버튼 - 목록보기/지도보기에서만 표시 */}
              {(viewMode === 'list' || viewMode === 'map') && (
                <button
                  onClick={() => downloadProjectListExcel(filteredProjects.filter(p => !(typeof p.is_active === 'object' && p.is_active?.completed === true)))}
                  className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  <FileDown className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">엑셀 다운</span>
                </button>
              )}

              {/* 뷰 모드 전환 버튼 */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => {
                    router.push('/tbm')
                  }}
                  className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${viewMode === 'tbm'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Activity className={`h-4 w-4 lg:h-4 lg:w-4 ${windowSize.width <= 1365 ? 'mr-0' : 'mr-1 lg:mr-2'}`} />
                  <span style={{ display: windowSize.width <= 1365 ? 'none' : 'inline' }}>TBM</span>
                </button>
                <button
                  onClick={() => {
                    router.push('/map')
                    // 지도 모드로 전환 시 높이 재계산을 위한 지연 처리
                    setTimeout(() => {
                      recalcMapHeight()
                      setTimeout(recalcMapHeight, 100)
                      setTimeout(recalcMapHeight, 300)
                      setTimeout(recalcMapHeight, 600)
                    }, 0)
                  }}
                  className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${viewMode === 'map'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <MapIcon className={`h-4 w-4 lg:h-4 lg:w-4 ${windowSize.width <= 1365 ? 'mr-0' : 'mr-1 lg:mr-2'}`} />
                  <span style={{ display: windowSize.width <= 1365 ? 'none' : 'inline' }}>지도</span>
                </button>
                <button
                  onClick={() => {
                    router.push('/list')
                  }}
                  className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <List className={`h-4 w-4 lg:h-4 lg:w-4 ${windowSize.width <= 1365 ? 'mr-0' : 'mr-1 lg:mr-2'}`} />
                  <span style={{ display: windowSize.width <= 1365 ? 'none' : 'inline' }}>목록</span>
                </button>
                <button
                  onClick={() => {
                    router.push('/safe')
                  }}
                  className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${viewMode === 'safety'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Shield className={`h-4 w-4 lg:h-4 lg:w-4 ${windowSize.width <= 1365 ? 'mr-0' : 'mr-1 lg:mr-2'}`} />
                  <span style={{ display: windowSize.width <= 1365 ? 'none' : 'inline' }}>안전</span>
                </button>
                <button
                  onClick={() => {
                    setViewMode('business')
                    router.push('/business')
                  }}
                  className={`flex items-center px-3 md:px-4 lg:px-3 py-3 md:py-2 rounded-md text-xs lg:text-sm font-medium transition-colors min-h-[44px] ${viewMode === 'business'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Briefcase className={`h-4 w-4 lg:h-4 lg:w-4 ${windowSize.width <= 1365 ? 'mr-0' : 'mr-1 lg:mr-2'}`} />
                  <span style={{ display: windowSize.width <= 1365 ? 'none' : 'inline' }}>사업</span>
                </button>
              </div>
            </div>
          </div>

          {/* 프로그레스 바 (헤더 밑면) */}
          {viewMode === 'tbm' && (
            <div className="absolute bottom-0 left-0 right-0 h-3 group z-10">
              <div
                className="w-full h-full bg-gray-200/50 cursor-pointer hover:h-4 transition-all duration-200 rounded-b-lg"
                title={`자동 새로고침 ${Math.round(tbmProgressPercentage)}% | 클릭하여 즉시 새로고침`}
                onClick={() => {
                  if (tbmManualRefresh) {
                    void tbmManualRefresh()
                  }
                }}
              >
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-1000 ease-linear group-hover:from-blue-500 group-hover:to-blue-600 rounded-b-lg"
                  style={{ width: `${tbmProgressPercentage}%` }}
                />
              </div>

              {/* 호버 시 정보 표시 */}
              <div className="absolute bottom-full right-4 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                자동 새로고침 {Math.round(tbmProgressPercentage)}% | {(() => {
                  const minutes = Math.floor(tbmTimeRemaining / 60)
                  const seconds = tbmTimeRemaining % 60
                  return `${minutes}:${String(seconds).padStart(2, '0')}`
                })()} 남음
                <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </div>
          )}
        </div>

        {/* 컨텐츠 영역 */}
        {viewMode === 'tbm' ? (
          <TBMContainer
            projects={filteredProjects}
            selectedHq={selectedHq}
            selectedBranch={selectedBranch}
            offices={allOffices}
            onProjectClick={handleMapProjectClick}
            onBranchSelect={(branchName: string) => setSelectedBranch(branchName)}
            onHqSelect={(hqName: string) => { setSelectedHq(hqName); setSelectedBranch('') }}
            onProgressUpdate={(percentage, timeRemaining) => {
              setTbmProgressPercentage(percentage)
              setTbmTimeRemaining(timeRemaining)
            }}
            onManualRefreshReady={(refreshFn) => {
              setTbmManualRefresh(() => refreshFn)
            }}
          />
        ) : viewMode === 'map' ? (
          <ClientMapView
            containerRef={mapContainerRef}
            heightPx={mapDynamicHeight}
            projects={projectsForMap as any}
            offices={allOffices}
            inspections={{
              headquartersInspections: headquartersInspections.map(i => ({
                project_id: i.project_id || '',
                inspection_date: i.inspection_date
              })),
              managerInspections: managerInspections.map(i => ({
                project_id: i.project_id || '',
                inspection_date: i.inspection_date
              }))
            }}
            tbmRecords={tbmRecordsForMap}
            tbmLoading={tbmLoadingForMap}
            onLoadTBM={loadTBMDataForMap}
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
                      setSelectedQuarter(getCurrentQuarter()) // 분기 초기화
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
                    selectedSafetyHq={selectedSafetyHq}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedQuarter={selectedQuarter}
                    isHqDownloadMode={isHqDownloadMode}
                    selectedBranchesForReport={selectedBranchesForReport}
                    selectedProjectIdsForReport={selectedProjectIdsForReport}
                    isGeneratingReport={isGeneratingReport}
                    reportProgress={reportProgress}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      setSelectedQuarter(getCurrentQuarter()) // 분기 초기화
                      if (selectedSafetyBranch) router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      else router.push('/safe')
                    }}
                    onBackToHqLevel={() => {
                      // 본부 단위로 돌아가기: 지사 선택만 해제
                      setSelectedSafetyBranch(null)
                      router.push('/safe/manager')
                    }}
                    onBackToAllBranches={() => {
                      // 전체 본부로 돌아가기: 본사 소속이면 전체 본부, 특정 본부 소속이면 해당 본부로
                      const isHeadOffice = userProfile?.hq_division == null || userProfile?.hq_division === '본사'
                      setSelectedSafetyHq(isHeadOffice ? null : (userProfile?.hq_division || null))
                      setSelectedSafetyBranch(null)
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
                        // 첫 렌더링(스피너 표시)을 위해 페인트 프레임 양보
                        await new Promise(requestAnimationFrame)
                        const abortController = new AbortController()
                          ; (window as any).__safe_cancel_manager_report__ = () => abortController.abort()
                        if (selectedSafetyBranch) {
                          const { downloadBranchManagerReports } = await import('@/lib/reports/manager-inspection-branch')
                          await downloadBranchManagerReports({
                            projects,
                            inspections: managerInspections,
                            selectedProjectIds: selectedProjectIdsForReport,
                            selectedQuarter,
                            selectedHq,
                            selectedSafetyBranch: selectedSafetyBranch as string,
                          }, {
                            signal: abortController.signal,
                            onProgress: (current, total) => {
                              setReportProgress({ current, total })
                            }
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
                          await generateManagerInspectionBulkReport({
                            projectInspections,
                            summary: { quarter: selectedQuarter }
                          }, {
                            signal: abortController.signal,
                            onProgress: (current, total) => {
                              setReportProgress({ current, total })
                            }
                          })
                        }
                        setIsHqDownloadMode(false)
                      } catch (e: any) {
                        // 취소(Abort)인 경우 조용히 무시
                        if (e && (e.message === 'cancelled' || e.name === 'AbortError')) {
                          // no-op
                        } else {
                          console.error(e)
                          const msg = (e && e.message) ? e.message : '보고서 생성 중 오류가 발생했습니다.'
                          alert(msg)
                        }
                      } finally {
                        setIsGeneratingReport(false)
                        setReportProgress(null)
                        delete (window as any).__safe_cancel_manager_report__
                      }
                    }}
                    onCancelReport={() => {
                      setIsHqDownloadMode(false)
                      setSelectedBranchesForReport([])
                      setSelectedProjectIdsForReport([])
                      try { (window as any).__safe_cancel_manager_report__?.() } catch { }
                    }}
                    onProjectToggleForReport={(projectId) => {
                      setSelectedProjectIdsForReport(prev => prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId])
                    }}
                    onBranchToggleForReport={(branch) => {
                      setSelectedBranchesForReport(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch])
                    }}
                    onRowClick={(projectId) => router.push(`/project/${projectId}/manager-inspection?fromBranch=${encodeURIComponent(selectedSafetyBranch || '')}`)}
                    onSelectSafetyHq={(hq) => {
                      setSelectedSafetyHq(hq)
                    }}
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
                    selectedSafetyHq={selectedSafetyHq}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedQuarter={selectedQuarter}
                    isHqDownloadMode={isHqDownloadMode}
                    selectedBranchesForReport={selectedBranchesForReport}
                    selectedProjectIdsForReport={selectedProjectIdsForReport}
                    isGeneratingReport={isGeneratingReport}
                    reportProgress={reportProgress}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      setSelectedSafetyHq(null)
                      setSelectedSafetyBranch(null)
                      setSelectedQuarter(getCurrentQuarter()) // 분기 초기화
                      if (selectedSafetyBranch) {
                        router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      } else {
                        router.push('/safe')
                      }
                    }}
                    onBackToHqLevel={() => {
                      // 본부 단위로 돌아가기: 지사 선택만 해제
                      setSelectedSafetyBranch(null)
                      router.push('/safe/headquarters')
                    }}
                    onBackToAllBranches={() => {
                      // 전체 본부로 돌아가기: 본사 소속이면 전체 본부, 특정 본부 소속이면 해당 본부로
                      const isHeadOffice = userProfile?.hq_division == null || userProfile?.hq_division === '본사'
                      setSelectedSafetyHq(isHeadOffice ? null : (userProfile?.hq_division || null))
                      setSelectedSafetyBranch(null)
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
                      try {
                        setIsGeneratingReport(true)
                        await new Promise(requestAnimationFrame)
                        const abortController = new AbortController()
                          ; (window as any).__safe_cancel_hq_report__ = () => abortController.abort()
                        const { generateHeadquartersInspectionReportBulk } = await import('@/lib/reports/headquarters-inspection')
                        await generateHeadquartersInspectionReportBulk(groups, undefined, {
                          signal: abortController.signal,
                          onProgress: (current, total) => {
                            setReportProgress({ current, total })
                          }
                        })
                        setIsHqDownloadMode(false)
                      } catch (e: any) {
                        if (e && (e.message === 'cancelled' || e.name === 'AbortError')) {
                          // no-op
                        } else {
                          console.error(e)
                          const msg = (e && e.message) ? e.message : '보고서 생성 중 오류가 발생했습니다.'
                          alert(msg)
                        }
                      } finally {
                        setIsGeneratingReport(false)
                        setReportProgress(null)
                        delete (window as any).__safe_cancel_hq_report__
                      }
                    }}
                    onCancelReport={() => {
                      setIsHqDownloadMode(false)
                      setSelectedBranchesForReport([])
                      setSelectedProjectIdsForReport([])
                      try { (window as any).__safe_cancel_hq_report__?.() } catch { }
                    }}
                    onProjectToggleForReport={(projectId) => {
                      setSelectedProjectIdsForReport(prev => prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId])
                    }}
                    onBranchToggleForReport={(branch) => {
                      setSelectedBranchesForReport(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch])
                    }}
                    onRowClickProject={(projectId) => router.push(`/project/${projectId}/headquarters-inspection?fromBranch=${encodeURIComponent(selectedSafetyBranch || '')}`)}
                    onSelectSafetyHq={(hq) => {
                      setSelectedSafetyHq(hq)
                    }}
                    onSelectSafetyBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                      router.push(`/safe/branch/${encodeURIComponent(branch)}/headquarters`)
                    }}
                  />
                )}

                {selectedSafetyCard === 'tbm' && (() => {
                  console.log('🔍 TBM 뷰 렌더링:', { selectedSafetyCard, tbmSafetyInspections: tbmSafetyInspections?.length, projects: projects?.length })
                  return (
                    <SafetyTBMView
                      loading={inspectionDataLoading}
                      projects={projects}
                      tbmInspections={tbmSafetyInspections || []}
                      selectedDate={selectedDate}
                      selectedSafetyHq={selectedSafetyHq}
                      selectedSafetyBranch={selectedSafetyBranch}
                      selectedHq={selectedHq}
                      selectedBranch={selectedBranch}
                      onBack={() => {
                        setSelectedSafetyCard(null)
                        setSelectedSafetyHq(null)
                        setSelectedSafetyBranch(null)
                        if (selectedSafetyBranch) {
                          router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                        } else {
                          router.push('/safe')
                        }
                      }}
                      onBackToHqLevel={() => {
                        // 본부 단위로 돌아가기: 지사 선택 해제하고 본부도 해제하여 본부별 테이블 표시
                        console.log('🔙 onBackToHqLevel 호출:', { pathname, selectedSafetyBranch, selectedSafetyHq })
                        setSelectedSafetyBranch(null)
                        setSelectedSafetyHq(null)
                        // URL 동기화를 위해 라우팅 (상태 업데이트 후)
                        if (pathname.startsWith('/safe/branch/')) {
                          router.replace('/safe/tbm')
                        }
                      }}
                      onBackToAllBranches={() => {
                        // 전체 본부로 돌아가기: 본사 소속이면 전체 본부, 특정 본부 소속이면 해당 본부로
                        const isHeadOffice = userProfile?.hq_division == null || userProfile?.hq_division === '본사'
                        setSelectedSafetyHq(isHeadOffice ? null : (userProfile?.hq_division || null))
                        setSelectedSafetyBranch(null)
                        router.push('/safe/tbm')
                      }}
                      onDateChange={(date) => setSelectedDate(date)}
                      onSelectSafetyHq={(hq) => {
                        setSelectedSafetyHq(hq)
                      }}
                      onSelectSafetyBranch={(branch) => {
                        setSelectedSafetyBranch(branch)
                        router.push(`/safe/branch/${encodeURIComponent(branch)}/tbm`)
                      }}
                      onRowClickProject={(projectId) => router.push(`/project/${projectId}/tbm-safety-inspection`)}
                    />
                  )
                })()}

                {selectedSafetyCard === 'safeDocument' && (
                  <SafeDocumentView
                    loading={inspectionDataLoading}
                    projects={projects}
                    inspections={safeDocumentInspections}
                    selectedSafetyHq={selectedSafetyHq}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedQuarter={selectedQuarter}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      setSelectedSafetyHq(null)
                      setSelectedSafetyBranch(null)
                      router.push('/safe')
                    }}
                    onSelectBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                    }}
                    onRowClickProject={(projectId) => router.push(`/project/${projectId}/safe-documents`)}
                    onQuarterChange={(quarter) => setSelectedQuarter(quarter)}
                  />
                )}

                {selectedSafetyCard === 'worker' && (
                  <SafetyWorkerView
                    loading={inspectionDataLoading}
                    projects={projects}
                    workerCounts={workerCounts}
                    selectedSafetyHq={selectedSafetyHq}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      setSelectedSafetyHq(null)
                      setSelectedSafetyBranch(null)
                      if (selectedSafetyBranch) {
                        router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      } else {
                        router.push('/safe')
                      }
                    }}
                    onSelectSafetyHq={(hq) => {
                      setSelectedSafetyHq(hq)
                    }}
                    onSelectSafetyBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                      router.push(`/safe/branch/${encodeURIComponent(branch)}/worker`)
                    }}
                    onRowClickProject={(projectId) => router.push(`/project/${projectId}/worker-management?returnUrl=${encodeURIComponent(pathname || '/safe')}`)}
                  />
                )}

                {selectedSafetyCard === 'newWorkerOrientation' && (
                  <SafetyNewWorkerOrientationView
                    loading={orientationDataLoading}
                    projects={projects}
                    orientationStats={orientationStats}
                    selectedSafetyHq={selectedSafetyHq}
                    selectedSafetyBranch={selectedSafetyBranch}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      setSelectedSafetyHq(null)
                      setSelectedSafetyBranch(null)
                      router.push('/safe')
                    }}
                    onSelectSafetyHq={(hq) => {
                      setSelectedSafetyHq(hq)
                    }}
                    onSelectSafetyBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                      router.push(`/safe/branch/${encodeURIComponent(branch)}/newWorkerOrientation`)
                    }}
                    onRowClickProject={(projectId) => router.push(`/project/${projectId}/new-worker-orientation`)}
                  />
                )}

                {selectedSafetyCard === 'safetyInspection' && (
                  <SafetyInspectionLedgerView
                    loading={inspectionDataLoading}
                    projects={projects}
                    inspectionCounts={safetyInspectionCounts}
                    selectedSafetyHq={selectedSafetyHq}
                    selectedSafetyBranch={selectedSafetyBranch}
                    selectedHq={selectedHq}
                    selectedBranch={selectedBranch}
                    selectedYear={safetyInspectionYear}
                    onBack={() => {
                      setSelectedSafetyCard(null)
                      setSelectedSafetyHq(null)
                      setSelectedSafetyBranch(null)
                      if (selectedSafetyBranch) {
                        router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}`)
                      } else {
                        router.push('/safe')
                      }
                    }}
                    onSelectSafetyHq={(hq) => {
                      setSelectedSafetyHq(hq)
                    }}
                    onSelectSafetyBranch={(branch) => {
                      setSelectedSafetyBranch(branch)
                      router.push(`/safe/branch/${encodeURIComponent(branch)}/safetyInspection`)
                    }}
                    onClearBranchFilter={() => {
                      setSelectedBranch('')
                      setSelectedSafetyBranch(null)
                      lastSafetyInspectionParams.current = null
                    }}
                    onClearHqFilter={() => {
                      setSelectedHq('')
                      setSelectedBranch('')
                      setSelectedSafetyHq(null)
                      setSelectedSafetyBranch(null)
                      lastSafetyInspectionParams.current = null
                    }}
                    onRowClickProject={(projectId) => router.push(`/project/${projectId}/safety-inspection-ledger?returnUrl=${encodeURIComponent(pathname || '/safe')}`)}
                    onYearChange={(year) => setSafetyInspectionYear(year)}
                  />
                )}
              </>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {/* TBM 안전활동점검 카드 */}
                <div
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  onClick={() => {
                    if (selectedSafetyBranch) {
                      router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/tbm`)
                    } else {
                      router.push('/safe/tbm')
                    }
                  }}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-purple-200 transition-colors">
                      <Activity className="h-4 w-4 text-purple-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">TBM 안전활동점검</h4>
                    <div className="text-xs text-gray-600">
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-200 border-t-blue-600"></div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-blue-600 mb-0.5">
                            {tbmSafetyInspections.length}
                          </div>
                          <div className="text-xs">건 점검완료</div>
                        </>
                      )}
                    </div>
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
                    <h4 className="text-xs font-medium text-gray-900 mb-1">작업현황</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-sm font-semibold text-blue-600 mb-0.5">
                        현황
                      </div>
                      <div className="text-xs">확인하기</div>
                    </div>
                  </div>
                </div>

                {/* 안전서류 점검 현황 카드 */}
                <div
                  onClick={() => setSelectedSafetyCard('safeDocument')}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-purple-300 hover:bg-purple-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-purple-200 transition-colors">
                      <FileDown className="h-4 w-4 text-purple-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">안전서류 점검</h4>
                    <div className="text-xs text-gray-600">
                      <div className="text-[10px] text-gray-500 mb-0.5">(분기당 점검 건수)</div>
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-200 border-t-purple-600"></div>
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-purple-600 mb-0.5">
                          {safeDocumentInspections.length}건
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 근로자 등록현황 카드 */}
                <div
                  onClick={() => {
                    if (selectedSafetyBranch) {
                      router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/worker`)
                    } else {
                      router.push('/safe/worker')
                    }
                  }}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-cyan-300 hover:bg-cyan-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-cyan-200 transition-colors">
                      <Users className="h-4 w-4 text-cyan-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">근로자 등록현황</h4>
                    <div className="text-xs text-gray-600">
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-200 border-t-cyan-600"></div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-cyan-600 mb-0.5">
                            {workerCounts.reduce((s, w) => s + w.worker_count, 0).toLocaleString()}명
                          </div>
                          <div className="text-xs">등록</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 신규근로자 현장안내 카드 */}
                <div
                  onClick={() => {
                    router.push('/safe/newWorkerOrientation')
                  }}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-emerald-300 hover:bg-emerald-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-emerald-200 transition-colors">
                      <Users className="h-4 w-4 text-emerald-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">신규근로자 현장안내</h4>
                    <div className="text-xs text-gray-600">
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-200 border-t-emerald-600"></div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-emerald-600 mb-0.5">
                            {orientationStats.reduce((s, os) => s + os.orientation_count, 0).toLocaleString()}건
                          </div>
                          <div className="text-xs">현장안내</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 정기안전점검 현황 카드 */}
                <div
                  onClick={() => {
                    if (selectedSafetyBranch) {
                      router.push(`/safe/branch/${encodeURIComponent(selectedSafetyBranch)}/safetyInspection`)
                    } else {
                      router.push('/safe/safetyInspection')
                    }
                  }}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-teal-300 hover:bg-teal-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-teal-200 transition-colors">
                      <CheckCircle className="h-4 w-4 text-teal-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">정기안전점검</h4>
                    <div className="text-xs text-gray-600">
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-teal-200 border-t-teal-600"></div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-teal-600 mb-0.5">
                            {safetyInspectionCounts.reduce((s, c) => s + c.inspection_count, 0).toLocaleString()}건
                          </div>
                          <div className="text-xs">점검완료</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* (지사) 관리자 점검 현황 카드 */}
                <div
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  onClick={() => {
                    router.push('/safe/manager')
                  }}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-green-200 transition-colors">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">(지사) 관리자 점검</h4>
                    <div className="text-xs text-gray-600">
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-200 border-t-blue-600"></div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-blue-600 mb-0.5">
                            {managerInspections.length}
                          </div>
                          <div className="text-xs">건 점검완료</div>
                        </>
                      )}
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
                      {cardDataLoading ? (
                        <div className="flex justify-center my-1">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-200 border-t-blue-600"></div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-blue-600 mb-0.5">
                            {headquartersInspections.length}
                          </div>
                          <div className="text-xs">건 점검완료</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

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
                    {cardDataLoading ? (
                      <div className="flex justify-center my-1">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-200 border-t-red-600"></div>
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


              </div>
            )}
          </div>
        ) : viewMode === 'business' ? (
          <div className="space-y-6">
            {selectedBusinessCard === 'material' ? (
              <BusinessMaterialView
                loading={materialDataLoading}
                projects={projects}
                materialCounts={materialCounts}
                selectedHq={selectedHq}
                selectedBranch={selectedBranch}
                onBack={() => setSelectedBusinessCard(null)}
                onRowClickProject={(projectId) => router.push(`/project/${projectId}/material-ledger`)}
              />
            ) : (
              <>
                <div className="bg-white/80 backdrop-blur rounded-lg border border-white/20 shadow-sm p-3 lg:p-4">
                  <h3 className="text-lg lg:text-xl font-semibold text-gray-900 flex items-center">
                    <Briefcase className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600 mr-2" />
                    사업현황
                  </h3>
                  <p className="text-sm lg:text-base text-gray-600 mt-1">
                    사업 관련 현황을 확인할 수 있습니다.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* 자급자재 카드 */}
                  <div
                    onClick={() => setSelectedBusinessCard('material')}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-amber-300 hover:bg-amber-50/30 transition-all duration-200 cursor-pointer transform hover:scale-[1.02]"
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center mb-2">
                        <Package className="h-4 w-4 text-amber-600" />
                      </div>
                      <h4 className="text-xs font-medium text-gray-900 mb-1">자급자재</h4>
                      <div className="text-xs text-gray-600">
                        <div className="text-sm font-semibold text-amber-600 mb-0.5">
                          {materialCounts.reduce((s, m) => s + m.material_count, 0).toLocaleString()}건
                        </div>
                        <div className="text-xs">등록</div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* 검색바 */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder="사업명, 지사명, 감독명, 주소로 검색..."
                className="w-full pl-10 pr-10 py-2.5 bg-white/90 backdrop-blur rounded-lg border border-white/20 shadow-sm text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {(selectedHq || selectedBranch) ? (
              searchQuery.trim() && searchFilteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[20vh]">
                  <div className="text-center">
                    <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-base font-medium text-gray-900 mb-1">검색 결과가 없습니다</h3>
                    <p className="text-sm text-gray-600">&apos;{searchQuery}&apos;에 해당하는 현장이 없습니다.</p>
                  </div>
                </div>
              ) : (
              <div className="space-y-6">
                {(() => {
                  // display_order로 정렬하는 헬퍼 함수
                  const sortByDisplayOrder = (projects: Project[]): Project[] => {
                    return [...projects].sort((a, b) => {
                      const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
                      const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
                      if (aOrder !== bOrder) return aOrder - bOrder
                      return a.project_name.localeCompare(b.project_name, 'ko-KR')
                    })
                  }

                  const groups = new Map<string, Project[]>()
                  searchFilteredProjects.forEach((p: Project) => {
                    const key = p.managing_branch || '미지정'
                    if (!groups.has(key)) groups.set(key, [])
                    groups.get(key)!.push(p)
                  })

                  // 각 그룹을 display_order로 정렬
                  groups.forEach((projects, key) => {
                    groups.set(key, sortByDisplayOrder(projects))
                  })

                  // 특정 지사가 선택된 경우: 해당 지사만 표시
                  if (selectedBranch) {
                    const items: Project[] = groups.get(selectedBranch) || []

                    // 준공 지구 제외한 프로젝트 수 계산
                    const activeItems = items.filter(p => !(typeof p.is_active === 'object' && p.is_active?.completed === true))

                    // 분기별 프로젝트 수 계산
                    const q1Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q1 === true
                    }).length
                    const q2Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q2 === true
                    }).length
                    const q3Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q3 === true
                    }).length
                    const q4Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q4 === true
                    }).length

                    const isCollapsed = collapsedBranches.has(selectedBranch)
                    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

                    // 모바일: isCollapsed 상태를 카드 2개 표시로 사용
                    // 데스크톱: isCollapsed 상태를 전체 숨김으로 사용
                    const displayItems = isMobile
                      ? (isCollapsed ? items.slice(0, 2) : items)
                      : items
                    const hasMore = isMobile && items.length > 2

                    return (
                      <div key={selectedBranch} className="bg-white/90 backdrop-blur rounded-lg border border-white/20 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3 -mx-4 px-4 py-2 rounded-t">
                          <div className="flex items-center space-x-2">
                            <Building className="h-4 w-4 text-blue-600" />
                            <h4 className="text-sm font-semibold text-gray-900">
                              {selectedBranch}
                              <span className="ml-1 text-xs font-normal text-gray-600">
                                총:{activeItems.length}(1분:{q1Count} / 2분:{q2Count} / 3분:{q3Count} / 4분:{q4Count})
                              </span>
                            </h4>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBranchCollapse(selectedBranch)
                            }}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-4 w-4 text-gray-600 flex-shrink-0" />
                            ) : (
                              <ChevronUp className="h-4 w-4 text-gray-600 flex-shrink-0" />
                            )}
                          </button>
                        </div>
                        {(!isCollapsed || isMobile) && (
                          items.length === 0 ? (
                            <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white/50">등록된 프로젝트가 없습니다.</div>
                          ) : (
                            <>
                              <div data-project-edit-grid="true" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                                {displayItems.map((project: Project, index: number) => (
                                  <ProjectCard
                                    key={project.id}
                                    project={project}
                                    onClick={isProjectEditMode ? undefined : handleProjectClick}
                                    onEdit={isProjectEditMode ? undefined : handleProjectEdit}
                                    onDelete={isProjectEditMode ? undefined : handleProjectDelete}
                                    onStatusChange={isProjectEditMode ? undefined : handleProjectStatusChange}
                                    onHandover={isProjectEditMode ? undefined : handleProjectHandover}
                                    onShare={isProjectEditMode ? undefined : handleProjectShare}
                                    showQuarters={showQuarters}
                                    canEditQuarters={isProjectEditMode ? false : canEditQuartersForProject(project)}
                                    onIsActiveChange={isProjectEditMode ? undefined : handleProjectIsActiveJsonChange}
                                    isEditMode={isProjectEditMode}
                                    displayOrder={getProjectDisplayOrder(project, index, displayItems)}
                                    onLongPressStart={handleProjectLongPressStart}
                                    onLongPressEnd={handleProjectLongPressEnd}
                                    onDragStart={() => handleProjectDragStart(project.id)}
                                    onDragOver={(e) => handleProjectDragOver(e, project.id, displayItems)}
                                    onDragEnd={() => void handleProjectDragEnd(displayItems)}
                                    onDrop={(e) => handleProjectDrop(e, project.id, displayItems)}
                                    isDragOver={dragOverProjectId === project.id}
                                    hqPendingCount={hqPendingCounts[project.id]}
                                    safetyPendingCount={safetyPendingCounts[project.id]}
                                  />
                                ))}
                              </div>
                              {hasMore && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleBranchCollapse(selectedBranch)
                                  }}
                                  className="w-full mt-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors border border-blue-200"
                                >
                                  {isCollapsed ? `더보기 (${items.length - 2}개 더)` : '접기'}
                                </button>
                              )}
                            </>
                          )
                        )}
                      </div>
                    )
                  }

                  // 전체 지사 또는 특정 본부 선택 시: 모든 지사 컨테이너 표시 (빈 데이터 포함)
                  const baseBranches: string[] = selectedHq
                    ? (BRANCH_OPTIONS[selectedHq] || [])
                    : Array.from(new Set(Object.values(BRANCH_OPTIONS).flat()))

                  const branchOrder: string[] = selectedHq ? (BRANCH_OPTIONS[selectedHq] || []) : baseBranches
                  // 검색 중이면 매칭된 지사만, 아니면 전체 지사 표시
                  const branchNames: string[] = searchQuery.trim()
                    ? Array.from(groups.keys())
                    : Array.from(new Set([...baseBranches, ...Array.from(groups.keys())]))
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

                    // 준공 지구 제외한 프로젝트 수 계산
                    const activeItems = items.filter(p => !(typeof p.is_active === 'object' && p.is_active?.completed === true))

                    // 분기별 프로젝트 수 계산
                    const q1Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q1 === true
                    }).length
                    const q2Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q2 === true
                    }).length
                    const q3Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q3 === true
                    }).length
                    const q4Count = activeItems.filter(p => {
                      if (typeof p.is_active === 'boolean') return p.is_active
                      return p.is_active?.q4 === true
                    }).length

                    const isCollapsed = collapsedBranches.has(branchName)
                    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

                    // 모바일: isCollapsed 상태를 카드 2개 표시로 사용
                    // 데스크톱: isCollapsed 상태를 전체 숨김으로 사용
                    const displayItems = isMobile
                      ? (isCollapsed ? items.slice(0, 2) : items)
                      : items
                    const hasMore = isMobile && items.length > 2

                    return (
                      <div key={branchName as string} className="bg-white/90 backdrop-blur rounded-lg border border-white/20 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3 -mx-4 px-4 py-2 rounded-t">
                          <div className="flex items-center space-x-2">
                            <Building className="h-4 w-4 text-blue-600" />
                            <h4 className="text-sm font-semibold text-gray-900">
                              {branchName}
                              <span className="ml-1 text-xs font-normal text-gray-600">
                                총:{activeItems.length}(1분:{q1Count} / 2분:{q2Count} / 3분:{q3Count} / 4분:{q4Count})
                              </span>
                            </h4>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBranchCollapse(branchName)
                            }}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-4 w-4 text-gray-600 flex-shrink-0" />
                            ) : (
                              <ChevronUp className="h-4 w-4 text-gray-600 flex-shrink-0" />
                            )}
                          </button>
                        </div>
                        {(!isCollapsed || isMobile) && (
                          items.length === 0 ? (
                            <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white/50">등록된 프로젝트가 없습니다.</div>
                          ) : (
                            <>
                              <div data-project-edit-grid="true" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                                {displayItems.map((project: Project, index: number) => (
                                  <ProjectCard
                                    key={project.id}
                                    project={project}
                                    onClick={isProjectEditMode ? undefined : handleProjectClick}
                                    onEdit={isProjectEditMode ? undefined : handleProjectEdit}
                                    onDelete={isProjectEditMode ? undefined : handleProjectDelete}
                                    onStatusChange={isProjectEditMode ? undefined : handleProjectStatusChange}
                                    onHandover={isProjectEditMode ? undefined : handleProjectHandover}
                                    onShare={isProjectEditMode ? undefined : handleProjectShare}
                                    showQuarters={showQuarters}
                                    canEditQuarters={isProjectEditMode ? false : canEditQuartersForProject(project)}
                                    onIsActiveChange={isProjectEditMode ? undefined : handleProjectIsActiveJsonChange}
                                    isEditMode={isProjectEditMode}
                                    displayOrder={getProjectDisplayOrder(project, index, displayItems)}
                                    onLongPressStart={handleProjectLongPressStart}
                                    onLongPressEnd={handleProjectLongPressEnd}
                                    onDragStart={() => handleProjectDragStart(project.id)}
                                    onDragOver={(e) => handleProjectDragOver(e, project.id, displayItems)}
                                    onDragEnd={() => void handleProjectDragEnd(displayItems)}
                                    onDrop={(e) => handleProjectDrop(e, project.id, displayItems)}
                                    isDragOver={dragOverProjectId === project.id}
                                    hqPendingCount={hqPendingCounts[project.id]}
                                    safetyPendingCount={safetyPendingCounts[project.id]}
                                  />
                                ))}
                              </div>
                              {hasMore && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleBranchCollapse(branchName)
                                  }}
                                  className="w-full mt-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors border border-blue-200"
                                >
                                  {isCollapsed ? `더보기 (${items.length - 2}개 더)` : '접기'}
                                </button>
                              )}
                            </>
                          )
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
              )
            ) : (
              // 본부/지사 선택이 없는 경우
              searchFilteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh]">
                  <div className="text-center">
                    {searchQuery.trim() ? (
                      <>
                        <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">검색 결과가 없습니다</h3>
                        <p className="text-gray-600">&apos;{searchQuery}&apos;에 해당하는 현장이 없습니다.</p>
                      </>
                    ) : (
                      <>
                        <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">현장이 등록되어 있지 않습니다</h3>
                        <p className="text-gray-600">선택한 조건에 해당하는 현장이 없습니다.</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                // 본사 소속(hq_division:'본사', branch_division:'본사')인 경우 본부별 그룹화
                userProfile?.hq_division === '본사' && userProfile?.branch_division === '본사' ? (
                  <div className="space-y-6">
                    {(() => {
                      // 모든 본부를 표시하되, '본사'를 맨 위로, 나머지는 HEADQUARTERS_OPTIONS 순서대로
                      const allHqNames = ['본사', ...HEADQUARTERS_OPTIONS.filter(hq => hq !== '본사')]

                      // display_order로 정렬하는 헬퍼 함수
                      const sortByDisplayOrder = (projects: Project[]): Project[] => {
                        return [...projects].sort((a, b) => {
                          const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
                          const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
                          if (aOrder !== bOrder) return aOrder - bOrder
                          return a.project_name.localeCompare(b.project_name, 'ko-KR')
                        })
                      }

                      return allHqNames.map((hqName) => {
                        // 해당 본부의 프로젝트 필터링 및 정렬
                        const items = sortByDisplayOrder(
                          searchFilteredProjects.filter((p: Project) =>
                            p.managing_hq === hqName
                          )
                        )

                        // 검색 중이고 매칭 결과가 없는 본부 숨기기
                        if (searchQuery.trim() && items.length === 0) return null

                        // 분기별 프로젝트 수 계산
                        const q1Count = items.filter(p => {
                          if (typeof p.is_active === 'boolean') return p.is_active
                          return p.is_active?.q1 === true
                        }).length
                        const q2Count = items.filter(p => {
                          if (typeof p.is_active === 'boolean') return p.is_active
                          return p.is_active?.q2 === true
                        }).length
                        const q3Count = items.filter(p => {
                          if (typeof p.is_active === 'boolean') return p.is_active
                          return p.is_active?.q3 === true
                        }).length
                        const q4Count = items.filter(p => {
                          if (typeof p.is_active === 'boolean') return p.is_active
                          return p.is_active?.q4 === true
                        }).length

                        const isExpanded = expandedHqs.has(hqName)
                        const firstRowLimit = 5 // xl:grid-cols-5 기준 첫 줄 개수
                        const displayedItems = isExpanded ? items : items.slice(0, firstRowLimit)
                        const hasMore = items.length > firstRowLimit

                        return (
                          <div key={hqName} className="bg-white/90 backdrop-blur rounded-lg border border-white/20 shadow-sm p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <Building className="h-5 w-5 text-blue-600" />
                                <h4 className="text-base font-semibold text-gray-900">
                                  {hqName}
                                  <span className="ml-2 text-sm font-normal text-gray-600">
                                    총:{items.length}(1분:{q1Count} / 2분:{q2Count} / 3분:{q3Count} / 4분:{q4Count})
                                  </span>
                                </h4>
                              </div>
                              {hasMore && (
                                <button
                                  onClick={() => toggleHqExpand(hqName)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 rounded-md transition-colors"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="h-4 w-4" />
                                      <span>접기</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-4 w-4" />
                                      <span>더보기</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            {items.length === 0 ? (
                              <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white/50">등록된 프로젝트가 없습니다.</div>
                            ) : (
                              <>
                                <div data-project-edit-grid="true" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                                  {displayedItems.map((project: Project, index: number) => (
                                    <ProjectCard
                                      key={project.id}
                                      project={project}
                                      onClick={isProjectEditMode ? undefined : handleProjectClick}
                                      onEdit={isProjectEditMode ? undefined : handleProjectEdit}
                                      onDelete={isProjectEditMode ? undefined : handleProjectDelete}
                                      onStatusChange={isProjectEditMode ? undefined : handleProjectStatusChange}
                                      onHandover={isProjectEditMode ? undefined : handleProjectHandover}
                                      onShare={isProjectEditMode ? undefined : handleProjectShare}
                                      canEditQuarters={isProjectEditMode ? false : (userProfile?.role === '발주청')}
                                      onIsActiveChange={isProjectEditMode ? undefined : handleProjectIsActiveJsonChange}
                                      isEditMode={isProjectEditMode}
                                      displayOrder={getProjectDisplayOrder(project, index, displayedItems)}
                                      onLongPressStart={handleProjectLongPressStart}
                                      onLongPressEnd={handleProjectLongPressEnd}
                                      onDragStart={() => handleProjectDragStart(project.id)}
                                      onDragOver={(e) => handleProjectDragOver(e, project.id, displayedItems)}
                                      onDragEnd={() => void handleProjectDragEnd(displayedItems)}
                                      onDrop={(e) => handleProjectDrop(e, project.id, displayedItems)}
                                      isDragging={draggedProjectId === project.id}
                                      isDragOver={dragOverProjectId === project.id}
                                      hqPendingCount={hqPendingCounts[project.id]}
                                      safetyPendingCount={safetyPendingCounts[project.id]}
                                    />
                                  ))}
                                </div>
                                {hasMore && (
                                  <button
                                    onClick={() => toggleHqExpand(hqName)}
                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 rounded-md transition-colors"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="h-4 w-4" />
                                        <span>접기</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-4 w-4" />
                                        <span>더보기 ({items.length - firstRowLimit}개)</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )
                      })
                    })()}
                  </div>
                ) : (
                  // 본사가 아닌 경우: 기존 단일 그리드 표시
                  <div data-project-edit-grid="true" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                    {searchFilteredProjects.map((project: Project, index: number) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={isProjectEditMode ? undefined : handleProjectClick}
                        onEdit={isProjectEditMode ? undefined : handleProjectEdit}
                        onDelete={isProjectEditMode ? undefined : handleProjectDelete}
                        onStatusChange={isProjectEditMode ? undefined : handleProjectStatusChange}
                        onHandover={isProjectEditMode ? undefined : handleProjectHandover}
                        onShare={isProjectEditMode ? undefined : handleProjectShare}
                        canEditQuarters={isProjectEditMode ? false : (userProfile?.role === '발주청')}
                        onIsActiveChange={isProjectEditMode ? undefined : handleProjectIsActiveJsonChange}
                        isEditMode={isProjectEditMode}
                        displayOrder={getProjectDisplayOrder(project, index, searchFilteredProjects)}
                        onLongPressStart={handleProjectLongPressStart}
                        onLongPressEnd={handleProjectLongPressEnd}
                        onDragStart={() => handleProjectDragStart(project.id)}
                        onDragOver={(e) => handleProjectDragOver(e, project.id, searchFilteredProjects)}
                        onDragEnd={() => void handleProjectDragEnd(searchFilteredProjects)}
                        onDrop={(e) => handleProjectDrop(e, project.id, searchFilteredProjects)}
                        isDragging={draggedProjectId === project.id}
                        isDragOver={dragOverProjectId === project.id}
                        hqPendingCount={hqPendingCounts[project.id]}
                        safetyPendingCount={safetyPendingCounts[project.id]}
                      />
                    ))}
                  </div>
                )
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
      sharedProjects={sharedProjects}
      userRole={userProfile?.role}
      showQuarters={showQuarters}
      canEditQuartersForProject={canEditQuartersForProject}
      onRetry={loadUserProjects}
      onSiteRegistration={handleSiteRegistration}
      onProjectClick={handleProjectClick}
      onProjectEdit={handleProjectEdit}
      onProjectDelete={handleProjectDelete}
      onProjectStatusChange={handleProjectStatusChange}
      onProjectHandover={handleProjectHandover}
      onProjectShare={handleProjectShare}
      onProjectIsActiveJsonChange={handleProjectIsActiveJsonChange}
      hqPendingCounts={hqPendingCounts}
      safetyPendingCounts={safetyPendingCounts}
    />
  )

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center flex-1 min-w-0">
              <button
                onClick={() => {
                  setViewMode('list')
                  router.replace('/list')
                }}
                className="flex items-center hover:opacity-80 transition-opacity cursor-pointer"
                aria-label="대시보드 리스트로 이동"
              >
                <Shield className="h-6 w-6 lg:h-8 lg:w-8 text-blue-600 mr-2 lg:mr-3 flex-shrink-0" />
                <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">안전관리 시스템</h1>
              </button>
            </div>
            <div className="flex items-center space-x-2 lg:space-x-4">
              {/* PWA 설치 버튼 */}
              <PWAInstallButtonHeader />

              {/* 사용자 드롭다운 메뉴 */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={handleUserMenuToggle}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  title={`${userProfile?.full_name || user?.email} (${userProfile?.role || '사용자'})`}
                >
                  {(userProfile?.full_name || user?.email || '?').charAt(0)}
                </button>

                {/* 드롭다운 메뉴 */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                    {/* 사용자 정보 */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-medium text-base flex-shrink-0">
                          {(userProfile?.full_name || user?.email || '?').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{userProfile?.full_name || '사용자'}</div>
                          <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                          <div className="text-xs text-blue-600">{userProfile?.role || '사용자'}</div>
                        </div>
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

      {/* 플로팅 버튼들 - 리스트 보기에서만 표시 */}
      {viewMode === 'list' && (
        <div className="fixed bottom-6 right-6 flex flex-row gap-3 items-center">
          {/* 공사중토글 버튼 - 권한 있는 사용자만 표시 */}
          {canEditQuarters && userProfile?.hq_division && (
            <button
              onClick={handleQuartersToggleClick}
              className={`${quartersToggleMap.get(userProfile.hq_division) !== false
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-600 hover:bg-gray-700'
                } text-white rounded-full px-4 py-3 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2`}
              title={`${userProfile.hq_division} 분기별 토글 ${quartersToggleMap.get(userProfile.hq_division) !== false ? 'ON' : 'OFF'}`}
            >
              <Calendar className="h-5 w-5" />
              <span className="font-medium text-sm">공사중토글</span>
            </button>
          )}

          {/* 현장 등록 버튼 */}
          <button
            onClick={handleSiteRegistration}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
          >
            <Plus className="h-6 w-6" />
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

      {/* 프로젝트 공유 모달 */}
      {/* 발주청 사용자도 공유 가능하지만, 시공사/감리단에게만 공유 가능 (발주청에게는 공유 불가) */}
      <ProjectShareModal
        isOpen={shareModal.isOpen}
        project={shareModal.project}
        onClose={handleShareModalClose}
        onSuccess={handleShareModalClose}
        currentUserRole={userProfile?.role}
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

      {/* TBM 챗봇 - viewMode가 'tbm'이고 발주청인 경우에만 표시 */}
      {viewMode === 'tbm' && userProfile?.role === '발주청' && (
        <TBMChatBot userProfile={userProfile} />
      )}

      {/* 현장 추가 버튼 - viewMode가 'tbm'이고 시공사/감리단인 경우에만 표시 */}
      {viewMode === 'tbm' && (userProfile?.role === '시공사' || userProfile?.role === '감리단') && (
        <button
          onClick={handleSiteRegistration}
          className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
          title="현장 등록"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}

export default Dashboard 