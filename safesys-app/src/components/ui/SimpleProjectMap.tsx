'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Building2, Maximize2, Minimize2, Hammer, Building, AlertTriangle, ClipboardList, Activity, Home, LocateFixed } from 'lucide-react'
import { getCurrentYearQuarterOptions } from '@/lib/constants'
import type { TBMRecord } from '@/lib/tbm'
import NavigationSelector from './NavigationSelector'
import { computeProgressRate } from '@/lib/work-daily-report/work-daily-report-types'
import { getProgressAnchors } from '@/lib/work-daily-report/progress-anchors'
import { useWeatherWarningLayer } from './useWeatherWarningLayer'

export interface SimpleProjectMarker {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  managingHq: string
  managingBranch: string
  isActive: boolean | { q1?: boolean; q2?: boolean; q3?: boolean; q4?: boolean; completed?: boolean } // 공사중 여부 또는 분기별 활성화 상태
  supervisorPosition?: string
  supervisorName?: string
  projectCategory?: string
  constructionStartDate?: string | null
  constructionEndDate?: string | null
}

interface InspectionData {
  headquartersInspections?: Array<{ project_id: string; inspection_date: string }>
  managerInspections?: Array<{ project_id: string; inspection_date: string }>
}

interface SimpleProjectMapProps {
  projects: SimpleProjectMarker[]
  offices?: any[] // 사무실 위치 데이터
  inspections?: InspectionData
  tbmRecords?: TBMRecord[]
  tbmLoading?: boolean
  onLoadTBM?: () => Promise<void> // TBM 데이터 로드 콜백
  onProjectClick?: (project: SimpleProjectMarker) => void
  height?: string
  className?: string
}

declare global {
  interface Window {
    kakao: {
      maps: {
        Map: any
        LatLng: any
        LatLngBounds: any
        Marker: any
        MarkerImage: any
        Size: any
        Point: any
        InfoWindow: any
        CustomOverlay: any
        event: {
          addListener: any
        }
        services: {
          Status: any
        }
      }
    }
  }
}
// 굴삭기 아이콘 컴포넌트
const ExcavatorIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <path d="M2 17h13v-5h-2l-1-4h-4v4H2v5z" fill="currentColor" fillOpacity="0.2" /> {/* Body */}
    <circle cx="5" cy="19" r="2" /> {/* Wheels */}
    <circle cx="12" cy="19" r="2" />
    <path d="M13 12l4-7h3" /> {/* Arm */}
    <path d="M20 5l2 2-3 4" /> {/* Bucket */}
  </svg>
)

// 굴삭기 + 빗금 아이콘
const InactiveExcavatorIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {/* Excavator Base (Faded) */}
    <g opacity="0.5">
      <path d="M2 17h13v-5h-2l-1-4h-4v4H2v5z" fill="currentColor" fillOpacity="0.1" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M13 12l4-7h3" />
      <path d="M20 5l2 2-3 4" />
    </g>
    {/* Strikethrough Lines */}
    <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2.5" />
    <path d="M20 4L4 20" stroke="currentColor" strokeWidth="2.5" />
  </svg>
)

const SimpleProjectMap: React.FC<SimpleProjectMapProps> = ({
  projects,
  offices = [],
  inspections,
  tbmRecords = [],
  tbmLoading = false,
  onLoadTBM,
  onProjectClick,
  height = '500px',
  className = ''
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const markersRef = useRef<any[]>([])
  const overlaysRef = useRef<any[]>([])
  const officeMarkersRef = useRef<any[]>([])
  const officeLabelsRef = useRef<any[]>([])  // 창사 라벨 오버레이 (KRC 로고 위에 표시되는 상시 라벨)
  const initializingRef = useRef(false)
  const onProjectClickRef = useRef<typeof onProjectClick>(onProjectClick)

  // 현재 분기 가져오기
  const getCurrentQuarter = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    let quarter
    if (month <= 3) {
      quarter = 1
    } else if (month <= 6) {
      quarter = 2
    } else if (month <= 9) {
      quarter = 3
    } else {
      quarter = 4
    }
    return `${year}Q${quarter}`
  }

  const [selectedQuarter, setSelectedQuarter] = useState<string>(() => {
    const quarter = getCurrentQuarter()
    console.log(`🎯 초기 선택된 분기: ${quarter}`)
    console.log(`📋 사용 가능한 분기 옵션:`, getCurrentYearQuarterOptions())
    return quarter
  })

  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const availableCategories = React.useMemo(() => {
    const cats = new Set<string>()
    projects.forEach(p => {
      if (p.projectCategory) {
        cats.add(p.projectCategory)
      }
    })
    return Array.from(cats).sort()
  }, [projects])

  const filteredProjects = React.useMemo(() => {
    if (selectedCategory === 'all') return projects
    return projects.filter(p => p.projectCategory === selectedCategory)
  }, [projects, selectedCategory])

  // 공정률 (착공일~준공일 기준, 수동 기준점 보간 — 작업일보/사업카드와 동일 계산)
  const [progressRates, setProgressRates] = useState<Record<string, number>>({})

  useEffect(() => {
    const targets = filteredProjects.filter(p => p.constructionStartDate && p.constructionEndDate)
    if (!targets.length) return

    let cancelled = false
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    Promise.all(
      targets.map(async (p) => {
        const anchors = await getProgressAnchors(p.id)
        const rate = computeProgressRate(p.constructionStartDate, p.constructionEndDate, todayStr, anchors)
        return [p.id, rate] as const
      })
    ).then(results => {
      if (cancelled) return
      const next: Record<string, number> = {}
      for (const [id, rate] of results) {
        if (rate !== '') next[id] = parseFloat(rate)
      }
      setProgressRates(next)
    })

    return () => { cancelled = true }
  }, [filteredProjects])

  // 마커 표시/숨김 상태 (localStorage로 영속화)
  const MAP_VISIBILITY_KEY = 'map_layer_visibility'
  const getStoredVisibility = () => {
    try {
      const stored = localStorage.getItem(MAP_VISIBILITY_KEY)
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  }
  const stored = getStoredVisibility()
  const [showActiveMarkers, setShowActiveMarkersRaw] = useState<boolean>(stored?.showActiveMarkers ?? true)
  const [showInactiveMarkers, setShowInactiveMarkersRaw] = useState<boolean>(stored?.showInactiveMarkers ?? true)
  const [showUninspectedHQ, setShowUninspectedHQRaw] = useState<boolean>(stored?.showUninspectedHQ ?? false)
  const [showUninspectedBranch, setShowUninspectedBranchRaw] = useState<boolean>(stored?.showUninspectedBranch ?? false)
  const [showTBMMarkers, setShowTBMMarkersRaw] = useState<boolean>(stored?.showTBMMarkers ?? false)
  const [tbmDataLoaded, setTbmDataLoaded] = useState<boolean>(false) // TBM 데이터 로드 여부
  const [showOfficeMarkers, setShowOfficeMarkersRaw] = useState<boolean>(stored?.showOfficeMarkers ?? true)
  const [showWeatherWarnings, setShowWeatherWarningsRaw] = useState<boolean>(stored?.showWeatherWarnings ?? true)

  const saveVisibility = (patch: Record<string, boolean>) => {
    try {
      const current = getStoredVisibility() ?? {}
      localStorage.setItem(MAP_VISIBILITY_KEY, JSON.stringify({ ...current, ...patch }))
    } catch {}
  }

  const setShowActiveMarkers = (v: boolean) => { setShowActiveMarkersRaw(v); saveVisibility({ showActiveMarkers: v }) }
  const setShowInactiveMarkers = (v: boolean) => { setShowInactiveMarkersRaw(v); saveVisibility({ showInactiveMarkers: v }) }
  const setShowUninspectedHQ = (v: boolean) => { setShowUninspectedHQRaw(v); saveVisibility({ showUninspectedHQ: v }) }
  const setShowUninspectedBranch = (v: boolean) => { setShowUninspectedBranchRaw(v); saveVisibility({ showUninspectedBranch: v }) }
  const setShowTBMMarkers = (v: boolean) => { setShowTBMMarkersRaw(v); saveVisibility({ showTBMMarkers: v }) }
  const setShowOfficeMarkers = (v: boolean) => { setShowOfficeMarkersRaw(v); saveVisibility({ showOfficeMarkers: v }) }
  const setShowWeatherWarnings = (v: boolean) => { setShowWeatherWarningsRaw(v); saveVisibility({ showWeatherWarnings: v }) }

  const weatherWarnings = useWeatherWarningLayer(map, showWeatherWarnings)

  // TBM이 on 상태로 복원된 경우 마운트 시 자동 로드
  useEffect(() => {
    if (showTBMMarkers && !tbmDataLoaded && onLoadTBM) {
      onLoadTBM().then(() => setTbmDataLoaded(true))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [navigationModal, setNavigationModal] = useState<{
    isOpen: boolean
    address: string
  }>({
    isOpen: false,
    address: ''
  })
  // 청사 안내 모달 state
  const [selectedOffice, setSelectedOffice] = useState<{
    name: string
    address: string
    phone?: string
  } | null>(null)

  // 현재위치 관련 상태
  const [isLocating, setIsLocating] = useState(false)
  const currentLocationOverlayRef = useRef<any>(null)
  const userCenteredRef = useRef(false) // 사용자가 현재위치로 이동했는지 추적

  useEffect(() => {
    onProjectClickRef.current = onProjectClick
  }, [onProjectClick])

  // 현재위치 표시 함수
  const showCurrentLocation = useCallback(() => {
    if (!map || !navigator.geolocation) return
    setIsLocating(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const { kakao } = window as any

        // 기존 현재위치 오버레이 제거
        if (currentLocationOverlayRef.current) {
          currentLocationOverlayRef.current.setMap(null)
        }

        const locPosition = new kakao.maps.LatLng(latitude, longitude)

        // 빨간색 원형 마커 (CSS 애니메이션 포함)
        const content = document.createElement('div')
        content.innerHTML = `
          <div style="position:relative;width:20px;height:20px;">
            <div style="
              position:absolute;top:0;left:0;
              width:20px;height:20px;
              background:rgba(220,38,38,0.25);
              border-radius:50%;
              animation:currentLocPulse 2s ease-out infinite;
            "></div>
            <div style="
              position:absolute;top:4px;left:4px;
              width:12px;height:12px;
              background:#DC2626;
              border:2px solid white;
              border-radius:50%;
              box-shadow:0 0 6px rgba(220,38,38,0.6);
            "></div>
          </div>
        `

        // pulse 애니메이션이 없으면 추가
        if (!document.getElementById('current-loc-pulse-style')) {
          const style = document.createElement('style')
          style.id = 'current-loc-pulse-style'
          style.textContent = `
            @keyframes currentLocPulse {
              0% { transform: scale(1); opacity: 1; }
              100% { transform: scale(3); opacity: 0; }
            }
          `
          document.head.appendChild(style)
        }

        const overlay = new kakao.maps.CustomOverlay({
          content: content,
          position: locPosition,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 100
        })

        overlay.setMap(map)
        currentLocationOverlayRef.current = overlay

        // 현재 위치로 지도 이동
        map.setCenter(locPosition)
        map.setLevel(3)
        userCenteredRef.current = true

        setIsLocating(false)
      },
      (error) => {
        console.error('현재위치 가져오기 실패:', error)
        setIsLocating(false)
        alert('현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [map])

  // 전체화면 토글 함수
  const toggleFullscreen = async () => {
    if (!containerRef.current) return

    try {
      if (!isFullscreen) {
        // 전체화면으로 전환
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen()
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen()
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen()
        }
      } else {
        // 전체화면 해제
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen()
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen()
        }
      }
    } catch (error) {
      console.error('전체화면 토글 실패:', error)
    }
  }

  // 전체화면 변경 이벤트 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      setIsFullscreen(!!fullscreenElement)

      // 전체화면 변경 시 지도 리사이즈
      if (map) {
        setTimeout(() => {
          map.relayout()
        }, 100)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
    }
  }, [map])

  // 점검 데이터 로딩 확인
  useEffect(() => {
    if (inspections) {
      console.log('🔍 점검 데이터 로딩됨:', {
        headquartersInspections: inspections.headquartersInspections?.length || 0,
        managerInspections: inspections.managerInspections?.length || 0
      })
    } else {
      console.log('⚠️ 점검 데이터 없음')
    }
  }, [inspections])

  // 프로젝트가 선택된 분기에 활성화되어 있는지 확인
  const isProjectActiveInQuarter = React.useCallback((project: SimpleProjectMarker, quarter: string): boolean => {
    const isActive = project.isActive

    // boolean 타입인 경우 (하위 호환)
    if (typeof isActive === 'boolean') {
      return isActive
    }

    // JSONB 타입인 경우 (분기별 활성화 상태)
    if (isActive && typeof isActive === 'object') {
      const parts = quarter.split('Q')
      const q = parseInt(parts[1] || '0', 10)
      if (q >= 1 && q <= 4) {
        const key = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4'
        // 선택된 분기의 값만 체크 (completed는 무시)
        return !!isActive[key]
      }
    }

    return false
  }, [])

  // 선택된 분기의 시작/종료 날짜 계산
  const getQuarterDateRange = React.useCallback((quarter: string) => {
    const parts = quarter.split('Q')
    const year = parseInt(parts[0] || '0', 10)
    const q = parseInt(parts[1] || '0', 10)

    const startMonth = (q - 1) * 3 + 1
    const endMonth = startMonth + 2

    const startDate = new Date(year, startMonth - 1, 1)
    const endDate = new Date(year, endMonth, 0) // 마지막 날

    return { startDate, endDate }
  }, [])

  // 프로젝트가 해당 분기에 본부 점검을 받았는지 확인
  const hasHeadquartersInspectionInQuarter = React.useCallback((projectId: string, quarter: string): boolean => {
    if (!inspections?.headquartersInspections) {
      console.log('⚠️ headquartersInspections 데이터 없음')
      return false
    }

    const { startDate, endDate } = getQuarterDateRange(quarter)

    const hasInspection = inspections.headquartersInspections.some(inspection => {
      if (inspection.project_id !== projectId) return false
      const inspectionDate = new Date(inspection.inspection_date)
      const isInRange = inspectionDate >= startDate && inspectionDate <= endDate
      if (isInRange) {
        console.log(`✅ 본부점검 발견: ${projectId} - ${inspection.inspection_date}`)
      }
      return isInRange
    })

    return hasInspection
  }, [inspections, getQuarterDateRange])

  // 프로젝트가 해당 분기에 지사 점검을 받았는지 확인
  const hasManagerInspectionInQuarter = React.useCallback((projectId: string, quarter: string): boolean => {
    if (!inspections?.managerInspections) {
      console.log('⚠️ managerInspections 데이터 없음')
      return false
    }

    const { startDate, endDate } = getQuarterDateRange(quarter)

    const hasInspection = inspections.managerInspections.some(inspection => {
      if (inspection.project_id !== projectId) return false
      const inspectionDate = new Date(inspection.inspection_date)
      const isInRange = inspectionDate >= startDate && inspectionDate <= endDate
      if (isInRange) {
        console.log(`✅ 지사점검 발견: ${projectId} - ${inspection.inspection_date}`)
      }
      return isInRange
    })

    return hasInspection
  }, [inspections, getQuarterDateRange])

  // 분기별 활성화 프로젝트 카운트 (범례용)
  const activeProjectsCount = React.useMemo(() => {
    const count = filteredProjects.filter(project => isProjectActiveInQuarter(project, selectedQuarter)).length
    console.log(`📊 [useMemo] 선택된 분기: ${selectedQuarter}, 활성 프로젝트: ${count}개`)
    return count
  }, [filteredProjects, selectedQuarter, isProjectActiveInQuarter])

  const inactiveProjectsCount = React.useMemo(() => {
    const count = filteredProjects.length - activeProjectsCount
    console.log(`📊 [useMemo] 비활성 프로젝트: ${count}개 (전체 ${filteredProjects.length}개 - 활성 ${activeProjectsCount}개)`)
    return count
  }, [filteredProjects.length, activeProjectsCount])

  // 미점검 프로젝트 카운트 (본부)
  const uninspectedHQCount = React.useMemo(() => {
    const count = filteredProjects.filter(project => {
      const isActive = isProjectActiveInQuarter(project, selectedQuarter)
      const hasHQInspection = hasHeadquartersInspectionInQuarter(project.id, selectedQuarter)
      return isActive && !hasHQInspection
    }).length
    console.log(`📊 [useMemo] 본부 미점검 프로젝트: ${count}개`)
    return count
  }, [filteredProjects, selectedQuarter, isProjectActiveInQuarter, hasHeadquartersInspectionInQuarter])

  // 미점검 프로젝트 카운트 (지사)
  const uninspectedBranchCount = React.useMemo(() => {
    const count = filteredProjects.filter(project => {
      const isActive = isProjectActiveInQuarter(project, selectedQuarter)
      const hasManagerInspection = hasManagerInspectionInQuarter(project.id, selectedQuarter)
      return isActive && !hasManagerInspection
    }).length
    console.log(`📊 [useMemo] 지사 미점검 프로젝트: ${count}개`)
    return count
  }, [filteredProjects, selectedQuarter, isProjectActiveInQuarter, hasManagerInspectionInQuarter])

  // 본부별 색상 정의
  const hqColors: { [key: string]: string } = {
    '경기본부': '#3B82F6',
    '강원본부': '#10B981',
    '충북본부': '#F59E0B',
    '충남본부': '#EF4444',
    '전북본부': '#8B5CF6',
    '전남본부': '#06B6D4',
    '경북본부': '#EC4899',
    '경남본부': '#84CC16',
    'default': '#6B7280'
  }

  const getMarkerColor = (managingHq: string) => {
    return hqColors[managingHq] || hqColors['default']
  }


  // 마커 이미지 생성 함수
  const createMarkerImage = (color: string, isLarge: boolean = false) => {
    const size = isLarge ? { width: 32, height: 42, radius: 8, center: 16 } : { width: 24, height: 32, radius: 6, center: 12 }
    const imageSrc = 'data:image/svg+xml;base64,' + btoa(`
      <svg width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
          </filter>
        </defs>
        <path d="M${size.center} 0C${size.center * 0.45} 0 0 ${size.center * 0.45} 0 ${size.center}c0 ${size.center} ${size.center} ${size.center * (isLarge ? 1.625 : 1.25)} ${size.center} ${size.center * (isLarge ? 1.625 : 1.25)}s${size.center}-${size.center * (isLarge ? 0.625 : 0.25)} ${size.center}-${size.center * (isLarge ? 1.625 : 1.25)}c0-${size.center * 0.55}-${size.center * 0.45}-${size.center}-${size.center}-${size.center}z" fill="${color}" filter="url(#shadow)"/>
        <circle cx="${size.center}" cy="${size.center}" r="${size.radius}" fill="white" stroke="${color}" stroke-width="2"/>
        <circle cx="${size.center}" cy="${size.center}" r="${size.radius - 2}" fill="${color}" opacity="0.2"/>
      </svg>
    `)

    return new (window as any).kakao.maps.MarkerImage(
      imageSrc,
      new (window as any).kakao.maps.Size(size.width, size.height),
      { offset: new (window as any).kakao.maps.Point(size.center, size.height) }
    )
  }

  // TBM 별표 마커 이미지 생성 함수
  const createStarMarkerImage = (color: string, isLarge: boolean = false) => {
    const size = isLarge ? 32 : 24
    const center = size / 2
    const outerRadius = center * 0.9
    const innerRadius = outerRadius * 0.4
    const points = 5 // 5각 별

    // 별표 좌표 계산
    const starPoints: string[] = []
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI / points) * i - Math.PI / 2
      const radius = i % 2 === 0 ? outerRadius : innerRadius
      const x = center + radius * Math.cos(angle)
      const y = center + radius * Math.sin(angle)
      starPoints.push(`${x},${y}`)
    }

    const imageSrc = 'data:image/svg+xml;base64,' + btoa(`
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="star-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
          </filter>
        </defs>
        <polygon 
          points="${starPoints.join(' ')}" 
          fill="${color}" 
          stroke="white" 
          stroke-width="2"
          filter="url(#star-shadow)"
        />
      </svg>
    `)

    return new (window as any).kakao.maps.MarkerImage(
      imageSrc,
      new (window as any).kakao.maps.Size(size, size),
      { offset: new (window as any).kakao.maps.Point(center, size) }
    )
  }

  // 카카오맵 초기화
  useEffect(() => {
    if (!mapRef.current) return

    const initializeKakaoMap = () => {
      if (typeof window.kakao === 'undefined' ||
        !window.kakao.maps ||
        !window.kakao.maps.Map ||
        !window.kakao.maps.LatLng) {
        setTimeout(initializeKakaoMap, 100)
        return
      }

      initializeMap()
    }

    const initializeMap = () => {
      if (initializingRef.current || map) {
        return
      }

      // 컨테이너가 완전히 렌더링될 때까지 대기
      if (!mapRef.current || mapRef.current.offsetWidth === 0 || mapRef.current.offsetHeight === 0) {
        setTimeout(initializeMap, 50)
        return
      }

      initializingRef.current = true

      try {
        const defaultCenter = { lat: 37.5665, lng: 126.9780 }
        let mapCenter = defaultCenter

        if (projects.length > 0) {
          if (projects.length === 1) {
            mapCenter = { lat: projects[0].lat, lng: projects[0].lng }
          } else {
            const avgLat = projects.reduce((sum, p) => sum + p.lat, 0) / projects.length
            const avgLng = projects.reduce((sum, p) => sum + p.lng, 0) / projects.length
            mapCenter = { lat: avgLat, lng: avgLng }
          }
        }

        const { kakao } = window as any

        const mapOption = {
          center: new kakao.maps.LatLng(mapCenter.lat, mapCenter.lng),
          level: projects.length > 0 ? (projects.length === 1 ? 3 : 8) : 10,
          zoomControl: false,
          mapTypeControl: false
        }

        const kakaoMap = new kakao.maps.Map(mapRef.current, mapOption)

        // 지도가 완전히 로드된 후 relayout 호출하여 크기 맞춤
        kakao.maps.event.addListener(kakaoMap, 'tilesloaded', function () {
          kakaoMap.relayout()
        })

        const zoomControl = new kakao.maps.ZoomControl()
        kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT)

        const mapTypeControl = new kakao.maps.MapTypeControl()
        kakaoMap.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT)

        setMap(kakaoMap)
        setIsMapLoaded(true)

        // 컨트롤 위치 조정 (지도 로드 후)
        setTimeout(() => {
          if (mapRef.current) {
            const zoomControl = mapRef.current.querySelector('.custom_zoomcontrol')
            const typeControl = mapRef.current.querySelector('.custom_typecontrol')

            if (zoomControl) {
              (zoomControl as HTMLElement).style.right = '20px';
            }
            if (typeControl) {
              (typeControl as HTMLElement).style.right = '20px';
              (typeControl as HTMLElement).style.top = '20px';
            }
          }
        }, 200)

        if (projects.length > 1) {
          const bounds = new kakao.maps.LatLngBounds()
          projects.forEach(project => {
            bounds.extend(new kakao.maps.LatLng(project.lat, project.lng))
          })
          setTimeout(() => {
            kakaoMap.setBounds(bounds, 50, 50, 50, 50)
          }, 100)
        }

        initializingRef.current = false
      } catch (error) {
        console.error('카카오맵 초기화 실패:', error)
        initializingRef.current = false
      }
    }

    initializeKakaoMap()

    return () => {
      if (markersRef.current.length > 0) {
        markersRef.current.forEach(marker => marker.setMap(null))
      }
      if (overlaysRef.current.length > 0) {
        overlaysRef.current.forEach(overlay => overlay.setMap(null))
      }
      if (officeMarkersRef.current.length > 0) {
        officeMarkersRef.current.forEach(marker => marker.setMap(null))
      }
      if (officeLabelsRef.current.length > 0) {
        officeLabelsRef.current.forEach(label => label.setMap(null))
      }
      if (currentLocationOverlayRef.current) {
        currentLocationOverlayRef.current.setMap(null)
      }
      setMap(null)
      setIsMapLoaded(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 사무실 마커 표시
  useEffect(() => {
    if (!map || !offices.length || typeof (window as any).kakao === 'undefined') return

    console.log('🏢 사무실 마커 업데이트 시작:', offices.length)

    // 기존 사무실 마커와 라벨 제거
    officeMarkersRef.current.forEach(marker => marker.setMap(null))
    officeLabelsRef.current.forEach(label => label.setMap(null))
    officeMarkersRef.current = []
    officeLabelsRef.current = []

    // 청사 마커 숨김 상태이면 여기서 종료 (기존 마커는 위에서 삭제됨)
    if (!showOfficeMarkers) return

    const { kakao } = window as any


    offices.forEach((office) => {
      const position = new kakao.maps.LatLng(office.lat, office.lng)

      // KRC 로고 마커 이미지 (580x296 비율 유지하며 축소)
      // 기존 36x36에서 가로 40, 세로 20으로 변경하여 비율 맞춤 (2:1)
      const imageSize = new kakao.maps.Size(40, 20)
      const imageOption = { offset: new kakao.maps.Point(20, 20) }
      const markerImage = new kakao.maps.MarkerImage('/KRCPNG.png', imageSize, imageOption)

      const marker = new kakao.maps.Marker({
        position,
        image: markerImage,
        title: office.name,
        zIndex: 20 // 프로젝트 마커보다 위에 표시
      })

      marker.setMap(map)
      officeMarkersRef.current.push(marker)

      // 라벨 오버레이 생성
      const labelContent = document.createElement('div')
      labelContent.innerText = office.name
      labelContent.style.cssText = `
        background-color: rgba(255, 255, 255, 0.9);
        border: 1px solid #3b82f6;
        border-radius: 4px;
        padding: 2px 5px;
        font-size: 11px;
        font-weight: 700;
        color: #1e3a8a;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        white-space: nowrap;
        transform: translateY(-25px); /* 마커 위로 올림 */
      `

      const labelOverlay = new kakao.maps.CustomOverlay({
        content: labelContent,
        position: position,
        yAnchor: 1,
        zIndex: 19
      })

      labelOverlay.setMap(map)
      officeLabelsRef.current.push(labelOverlay)  // 라벨은 별도 ref에 저장

      // 마커 클릭 시 React state 기반 모달 표시
      kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedOffice({
          name: office.name,
          address: office.address,
          phone: office.phone
        })
      })
    })

  }, [map, offices, showOfficeMarkers])

  // 마커 표시
  useEffect(() => {
    if (!map || !filteredProjects.length || typeof (window as any).kakao === 'undefined') return

    console.log('🔄 마커 업데이트 시작 - 선택된 분기:', selectedQuarter)

    // 기존 마커와 오버레이 제거
    markersRef.current.forEach(marker => marker.setMap(null))
    overlaysRef.current.forEach(overlay => overlay.setMap(null))

    const newMarkers: any[] = []
    const newOverlays: any[] = []

    // 분기별 마커 색상 계산 함수 (useEffect 내부)
    const getStatusColorForQuarter = (project: SimpleProjectMarker) => {
      const isActive = project.isActive

      console.log(`  🔍 프로젝트 "${project.name}" isActive 타입:`, typeof isActive, 'value:', isActive)

      // boolean 타입인 경우 (하위 호환)
      if (typeof isActive === 'boolean') {
        console.log(`    ➡️ boolean 타입 - ${isActive ? '빨간색' : '회색'}`)
        return isActive ? '#DC2626' : '#9CA3AF'
      }

      // JSONB 타입인 경우 (분기별 활성화 상태)
      if (isActive && typeof isActive === 'object') {
        const parts = selectedQuarter.split('Q')
        const q = parseInt(parts[1] || '0', 10)
        console.log(`    ➡️ JSONB 타입 - 선택된 분기: Q${q}`)
        if (q >= 1 && q <= 4) {
          const key = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4'
          const isActiveInQuarter = !!isActive[key]
          console.log(`    ➡️ ${key} 값: ${isActive[key]} → 결과: ${isActiveInQuarter ? '빨간색 (#DC2626)' : '회색 (#9CA3AF)'}`)
          return isActiveInQuarter ? '#DC2626' : '#9CA3AF'
        }
      }

      console.log(`    ➡️ 기본값 회색`)
      return '#9CA3AF'
    }

    // 이름표 오버레이 콘텐츠 (마커 상태 색과 겹치지 않는 청록 단일색으로 공정률 막대를 함께 표시)
    const PROGRESS_ACCENT = '#0D9488'
    const PROGRESS_ACCENT_TEXT = '#0F766E'
    const buildNameLabelContent = (
      displayName: string,
      fullName: string,
      borderColor: string,
      textColor: string,
      progressRate: number | undefined
    ) => {
      const clampedRate = progressRate !== undefined ? Math.min(100, Math.max(0, progressRate)) : undefined
      return `
        <div style="
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.95));
          border: 2px solid ${borderColor};
          border-radius: 8px;
          padding: 2px 5px ${clampedRate !== undefined ? 3 : 2}px;
          font-size: 12px;
          font-weight: 600;
          color: ${textColor};
          box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset;
          white-space: nowrap;
          text-align: center;
          position: relative;
          left: -50%;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
        "
        title="${fullName}"
        >
          ${displayName}
          ${clampedRate !== undefined ? `
          <div style="display:flex; align-items:center; justify-content:center; gap:4px; margin-top:1px;">
            <div style="width:40px; height:4px; border-radius:2px; background:rgba(203,213,225,0.7); overflow:hidden;">
              <div style="width:${clampedRate}%; height:100%; background:${PROGRESS_ACCENT}; border-radius:2px;"></div>
            </div>
            <span style="font-size:9px; font-weight:700; color:${PROGRESS_ACCENT_TEXT};">${Math.round(clampedRate)}%</span>
          </div>` : ''}
          <div style="
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 4px solid ${borderColor};
          "></div>
        </div>
      `
    }

    filteredProjects.forEach((project) => {
      try {
        const markerPosition = new (window as any).kakao.maps.LatLng(project.lat, project.lng)
        const baseColor = getMarkerColor(project.managingHq)
        const statusColor = getStatusColorForQuarter(project)
        const isActiveInQuarter = isProjectActiveInQuarter(project, selectedQuarter)

        // 프로젝트명 라벨 (모든 마커에서 사용)
        const projectNameLabel = project.name.length > 5 ?
          project.name.substring(0, 5) + '...' :
          project.name

        // 미점검 상태 확인
        const hasHQInspection = hasHeadquartersInspectionInQuarter(project.id, selectedQuarter)
        const hasManagerInspection = hasManagerInspectionInQuarter(project.id, selectedQuarter)
        const isUninspectedHQ = isActiveInQuarter && !hasHQInspection
        const isUninspectedBranch = isActiveInQuarter && !hasManagerInspection

        // 공정률 (착공일~준공일 등록된 프로젝트만 존재) — 이름표 안에 함께 표시
        const progressRate = progressRates[project.id]

        // 공사중/미공사중 마커 생성
        const normalMarkerImage = createMarkerImage(statusColor, false)
        const largeMarkerImage = createMarkerImage(statusColor, true)

        const marker = new (window as any).kakao.maps.Marker({
          position: markerPosition,
          title: project.name,
          image: normalMarkerImage
        })

        // 공사중/미공사중 마커 표시/숨김
        const shouldShowMainMarker = isActiveInQuarter ? showActiveMarkers : showInactiveMarkers
        if (shouldShowMainMarker) {
          marker.setMap(map)
        }

        // 미점검(본부) 마커 생성 및 표시 - 보라색 (#8B5CF6)
        if (isUninspectedHQ && showUninspectedHQ) {
          const uninspectedHQColor = '#8B5CF6' // 보라색
          const hqMarkerImage = createMarkerImage(uninspectedHQColor, false)
          const hqMarkerImageLarge = createMarkerImage(uninspectedHQColor, true)

          const hqMarker = new (window as any).kakao.maps.Marker({
            position: markerPosition,
            title: `${project.name} (본부 미점검)`,
            image: hqMarkerImage
          })

          hqMarker.setMap(map)
          newMarkers.push(hqMarker)

          // 본부 미점검 라벨 - 테두리는 검은색, 텍스트는 마커와 같은 색(보라색)
          const hqLabelBorderColor = '#000000' // 검은색 테두리
          const hqLabelOverlay = new (window as any).kakao.maps.CustomOverlay({
            content: buildNameLabelContent(projectNameLabel, project.name, hqLabelBorderColor, uninspectedHQColor, progressRate),
            position: markerPosition,
            yAnchor: -0.2,
            xAnchor: 0,
            clickable: true
          })

          hqLabelOverlay.setMap(map)
          newOverlays.push(hqLabelOverlay)

          // 호버 효과
          const kakao = (window as any).kakao
          kakao.maps.event.addListener(hqMarker, 'mouseover', () => {
            hqMarker.setImage(hqMarkerImageLarge)
            hqMarker.setZIndex(10)
            if (supervisorTooltip) supervisorTooltip.setMap(map)
          })
          kakao.maps.event.addListener(hqMarker, 'mouseout', () => {
            setTimeout(() => {
              hqMarker.setImage(hqMarkerImage)
              hqMarker.setZIndex(5)
              if (supervisorTooltip) supervisorTooltip.setMap(null)
            }, 100)
          })
          kakao.maps.event.addListener(hqMarker, 'click', () => {
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })
          kakao.maps.event.addListener(hqLabelOverlay, 'click', () => {
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })
        }

        // 미점검(지사) 마커 생성 및 표시 - 주황색 (#F97316)
        if (isUninspectedBranch && showUninspectedBranch) {
          const uninspectedBranchColor = '#F97316' // 주황색
          const branchMarkerImage = createMarkerImage(uninspectedBranchColor, false)
          const branchMarkerImageLarge = createMarkerImage(uninspectedBranchColor, true)

          const branchMarker = new (window as any).kakao.maps.Marker({
            position: markerPosition,
            title: `${project.name} (지사 미점검)`,
            image: branchMarkerImage
          })

          branchMarker.setMap(map)
          newMarkers.push(branchMarker)

          // 지사 미점검 라벨 (공사중/미공사중과 동일한 디자인)
          const branchLabelOverlay = new (window as any).kakao.maps.CustomOverlay({
            content: buildNameLabelContent(projectNameLabel, project.name, baseColor, baseColor, progressRate),
            position: markerPosition,
            yAnchor: -0.2,
            xAnchor: 0,
            clickable: true
          })

          branchLabelOverlay.setMap(map)
          newOverlays.push(branchLabelOverlay)

          // 호버 효과
          const kakao = (window as any).kakao
          kakao.maps.event.addListener(branchMarker, 'mouseover', () => {
            branchMarker.setImage(branchMarkerImageLarge)
            branchMarker.setZIndex(10)
            if (supervisorTooltip) supervisorTooltip.setMap(map)
          })
          kakao.maps.event.addListener(branchMarker, 'mouseout', () => {
            setTimeout(() => {
              branchMarker.setImage(branchMarkerImage)
              branchMarker.setZIndex(5)
              if (supervisorTooltip) supervisorTooltip.setMap(null)
            }, 100)
          })
          kakao.maps.event.addListener(branchMarker, 'click', () => {
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })
          kakao.maps.event.addListener(branchLabelOverlay, 'click', () => {
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })
        }

        // 공사중/미공사중 프로젝트명 라벨 (착공일~준공일 등록된 프로젝트는 공정률 막대를 함께 표시)
        const labelOverlay = new (window as any).kakao.maps.CustomOverlay({
          content: buildNameLabelContent(projectNameLabel, project.name, baseColor, baseColor, progressRate),
          position: markerPosition,
          yAnchor: -0.2,
          xAnchor: 0,
          clickable: true
        })

        // 공사중/미공사중 마커와 함께 라벨도 표시/숨김
        if (shouldShowMainMarker) {
          labelOverlay.setMap(map)
        }

        // 감독 정보 툴팁 오버레이 (마우스 오버 시 표시)
        const hasSupervisor = project.supervisorPosition || project.supervisorName
        let supervisorTooltip: any = null
        if (hasSupervisor) {
          const tooltipContent = `
            <div style="
              background: rgba(30, 41, 59, 0.92);
              color: white;
              border-radius: 8px;
              padding: 7px 11px;
              font-size: 12px;
              line-height: 1.6;
              box-shadow: 0 4px 12px rgba(0,0,0,0.25);
              white-space: nowrap;
              pointer-events: none;
            ">
              ${project.supervisorPosition ? `<div style="font-size:10px;color:#94a3b8;margin-bottom:1px;">${project.supervisorPosition}</div>` : ''}
              <div style="font-weight:700;font-size:13px;">${project.supervisorName || '-'}</div>
            </div>
          `
          supervisorTooltip = new (window as any).kakao.maps.CustomOverlay({
            content: tooltipContent,
            position: markerPosition,
            yAnchor: 1.4,
            xAnchor: -0.1,
            zIndex: 20
          })
        }

        // 호버 효과
        let hoverTimeout: ReturnType<typeof setTimeout> | null = null

        const applyHoverEffect = () => {
          if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
          }
          marker.setImage(largeMarkerImage)
          marker.setZIndex(5)
          if (supervisorTooltip) supervisorTooltip.setMap(map)
        }

        const removeHoverEffect = () => {
          hoverTimeout = setTimeout(() => {
            marker.setImage(normalMarkerImage)
            marker.setZIndex(1)
            if (supervisorTooltip) supervisorTooltip.setMap(null)
          }, 100)
        }

        // 이벤트 리스너
        const kakao = (window as any).kakao
        kakao.maps.event.addListener(marker, 'mouseover', applyHoverEffect)
        kakao.maps.event.addListener(marker, 'mouseout', removeHoverEffect)
        kakao.maps.event.addListener(labelOverlay, 'mouseover', applyHoverEffect)
        kakao.maps.event.addListener(labelOverlay, 'mouseout', removeHoverEffect)

        kakao.maps.event.addListener(marker, 'click', () => {
          if (onProjectClickRef.current) {
            onProjectClickRef.current(project)
          }
        })

        kakao.maps.event.addListener(labelOverlay, 'click', () => {
          if (onProjectClickRef.current) {
            onProjectClickRef.current(project)
          }
        })

        newMarkers.push(marker)
        newOverlays.push(labelOverlay)

      } catch (error) {
        console.error(`마커 생성 오류 - ${project.name}:`, error)
      }
    })

    // TBM 마커 추가
    if (showTBMMarkers && tbmRecords && tbmRecords.length > 0) {
      tbmRecords.forEach((tbmRecord) => {
        try {
          if (!tbmRecord.latitude || !tbmRecord.longitude) return

          const tbmMarkerPosition = new (window as any).kakao.maps.LatLng(tbmRecord.latitude, tbmRecord.longitude)
          const tbmMarkerColor = '#DC2626' // TBM 마커는 빨간색
          const tbmLabelColor = '#DC2626' // TBM 라벨 텍스트는 빨간색
          const tbmLabelBorderColor = '#000000' // TBM 라벨 테두리는 검은색
          const tbmNormalMarkerImage = createStarMarkerImage(tbmMarkerColor, false)
          const tbmLargeMarkerImage = createStarMarkerImage(tbmMarkerColor, true)

          // TBM 마커 생성
          const tbmMarker = new (window as any).kakao.maps.Marker({
            position: tbmMarkerPosition,
            title: tbmRecord.project_name,
            image: tbmNormalMarkerImage
          })

          tbmMarker.setMap(map)
          newMarkers.push(tbmMarker)

          // 신규 근로자 수 파싱
          const newWorkersStr = tbmRecord.new_workers || '0'
          const newWorkersNum = parseInt(newWorkersStr) || 0

          // 신규 근로자 수 배지 (마커 우측 상단에 제곱 표시처럼)
          if (newWorkersNum > 0) {
            const newWorkersBadgeOverlay = new (window as any).kakao.maps.CustomOverlay({
              content: `
                <div style="
                  background: #059669;
                  color: white;
                  border-radius: 50%;
                  width: 16px;
                  height: 16px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 10px;
                  font-weight: 700;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                  border: 1.5px solid white;
                  line-height: 1;
                ">${newWorkersNum}</div>
              `,
              position: tbmMarkerPosition,
              yAnchor: 1.8,
              xAnchor: -0.3,
              clickable: false
            })
            newWorkersBadgeOverlay.setMap(map)
            newOverlays.push(newWorkersBadgeOverlay)
          }

          // TBM 프로젝트명 라벨
          const tbmProjectNameLabel = tbmRecord.project_name.length > 5 ?
            tbmRecord.project_name.substring(0, 5) + '...' :
            tbmRecord.project_name

          const tbmLabelOverlay = new (window as any).kakao.maps.CustomOverlay({
            content: `
              <div style="
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.95));
                border: 2px solid ${tbmLabelBorderColor};
                border-radius: 8px;
                padding: 2px 5px;
                font-size: 12px;
                font-weight: 600;
                color: ${tbmLabelColor};
                box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset;
                white-space: nowrap;
                text-align: center;
                position: relative;
                left: -50%;
                cursor: pointer;
                transition: all 0.2s ease;
                backdrop-filter: blur(4px);
              "
              title="${tbmRecord.project_name}"
              >
                ${tbmProjectNameLabel}
                <div style="
                  position: absolute;
                  bottom: -4px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 0;
                  height: 0;
                  border-left: 4px solid transparent;
                  border-right: 4px solid transparent;
                  border-top: 4px solid ${tbmLabelBorderColor};
                "></div>
              </div>
            `,
            position: tbmMarkerPosition,
            yAnchor: -0.2,
            xAnchor: 0,
            clickable: true
          })

          tbmLabelOverlay.setMap(map)
          newOverlays.push(tbmLabelOverlay)

          // TBM 오늘 작업내용 툴팁
          let tbmTooltip: any = null
          if (tbmRecord.today_work) {
            const truncated = tbmRecord.today_work.length > 80
              ? tbmRecord.today_work.substring(0, 80) + '...'
              : tbmRecord.today_work
            tbmTooltip = new (window as any).kakao.maps.CustomOverlay({
              content: `
                <div style="
                  background: rgba(30, 41, 59, 0.92);
                  color: white;
                  border-radius: 8px;
                  padding: 7px 11px;
                  font-size: 12px;
                  line-height: 1.6;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                  white-space: nowrap;
                  pointer-events: none;
                  max-width: 360px;
                  min-width: 200px;
                  white-space: normal;
                  word-break: keep-all;
                ">
                  <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">오늘 작업내용</div>
                  <div style="font-weight:600;font-size:12px;">${truncated}</div>
                </div>
              `,
              position: tbmMarkerPosition,
              yAnchor: 1.4,
              xAnchor: -0.1,
              zIndex: 20
            })
          }

          // TBM 마커 호버 효과
          const kakao = (window as any).kakao
          kakao.maps.event.addListener(tbmMarker, 'mouseover', () => {
            tbmMarker.setImage(tbmLargeMarkerImage)
            tbmMarker.setZIndex(10)
            if (tbmTooltip) tbmTooltip.setMap(map)
          })
          kakao.maps.event.addListener(tbmMarker, 'mouseout', () => {
            setTimeout(() => {
              tbmMarker.setImage(tbmNormalMarkerImage)
              tbmMarker.setZIndex(5)
              if (tbmTooltip) tbmTooltip.setMap(null)
            }, 100)
          })
          kakao.maps.event.addListener(tbmMarker, 'click', () => {
            // TBM 마커 클릭 시 네비게이션 모달 표시
            if (tbmRecord.location) {
              setNavigationModal({
                isOpen: true,
                address: tbmRecord.location
              })
            }
          })
          kakao.maps.event.addListener(tbmLabelOverlay, 'click', () => {
            // TBM 라벨 클릭 시 네비게이션 모달 표시
            if (tbmRecord.location) {
              setNavigationModal({
                isOpen: true,
                address: tbmRecord.location
              })
            }
          })
        } catch (error) {
          console.error(`TBM 마커 생성 오류 - ${tbmRecord.project_name}:`, error)
        }
      })
    }

    markersRef.current = newMarkers
    overlaysRef.current = newOverlays

    console.log(`✅ 마커 ${newMarkers.length}개 생성 완료 (프로젝트: ${filteredProjects.length}개, TBM: ${tbmRecords?.length || 0}개)`)

    // 활성/비활성 카운트 계산 및 로그
    const activeCount = filteredProjects.filter(p => isProjectActiveInQuarter(p, selectedQuarter)).length
    const inactiveCount = filteredProjects.length - activeCount
    console.log(`📊 활성 프로젝트: ${activeCount}개, 비활성: ${inactiveCount}개`)
  }, [map, filteredProjects, selectedQuarter, isProjectActiveInQuarter, showActiveMarkers, showInactiveMarkers, showUninspectedHQ, showUninspectedBranch, hasHeadquartersInspectionInQuarter, hasManagerInspectionInQuarter, tbmRecords, showTBMMarkers, progressRates])

  // 지도 초기 범위 조정 (프로젝트 및 TBM 마커 포함)
  useEffect(() => {
    if (!map) return

    const allPoints: Array<{ lat: number; lng: number }> = []

    // 프로젝트 순회하며 마커 생성
    filteredProjects.forEach((project) => {
      allPoints.push({ lat: project.lat, lng: project.lng })
    })

    // TBM 마커 위치 추가
    if (tbmRecords && tbmRecords.length > 0) {
      tbmRecords.forEach(tbmRecord => {
        if (tbmRecord.latitude && tbmRecord.longitude) {
          allPoints.push({ lat: tbmRecord.latitude, lng: tbmRecord.longitude })
        }
      })
    }

    if (allPoints.length === 0) return

    // 사용자가 현재위치로 이동한 경우 지도 범위 자동 조정 건너뛰기
    if (userCenteredRef.current) {
      return
    }

    // 모든 마커가 보이도록 지도 범위 조정
    if (allPoints.length > 1) {
      const bounds = new (window as any).kakao.maps.LatLngBounds()
      allPoints.forEach(point => {
        bounds.extend(new (window as any).kakao.maps.LatLng(point.lat, point.lng))
      })
      setTimeout(() => {
        map.setBounds(bounds, 50, 50, 50, 50)
      }, 100)
    } else if (allPoints.length === 1) {
      const point = allPoints[0]
      const center = new (window as any).kakao.maps.LatLng(point.lat, point.lng)
      map.setCenter(center)
      map.setLevel(3)
    }
  }, [map, filteredProjects, tbmRecords])

  return (
    <div
      ref={containerRef}
      className={`relative ${className} ${isFullscreen ? 'bg-white' : ''}`}
      style={isFullscreen ? { width: '100%', height: '100%' } : undefined}
    >
      {/* 카카오맵 컨트롤 위치 조정 */}
      <style>{`
        .simple-project-map-container div[class*="zoomcontrol"] {
          right: 20px !important;
        }
        .simple-project-map-container div[class*="typecontrol"] {
          right: 20px !important;
          top: 20px !important;
        }
        .simple-project-map-container .custom_zoomcontrol {
          right: 20px !important;
        }
        .simple-project-map-container .custom_typecontrol {
          right: 20px !important;
          top: 20px !important;
        }
      `}</style>
      <div
        ref={mapRef}
        style={{ width: '100%', height: isFullscreen ? '100%' : height, paddingRight: '10px' }}
        className="simple-project-map-container rounded-lg border border-gray-300 bg-gray-100"
      >
        {!isMapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">지도를 로드하고 있습니다...</p>
            </div>
          </div>
        )}
      </div>

      {/* 분기 선택 드롭다운 및 전체화면 버튼 */}
      {filteredProjects.length > 0 && (
        <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
          <select
            id="quarter-select"
            value={selectedQuarter}
            onChange={(e) => {
              const newQuarter = e.target.value
              console.log(`🔄 분기 변경: ${selectedQuarter} → ${newQuarter}`)
              setSelectedQuarter(newQuarter)
            }}
            className="bg-white rounded-lg shadow-lg border border-gray-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {getCurrentYearQuarterOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          {availableCategories.length > 0 && (
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white rounded-lg shadow-lg border border-gray-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[150px] truncate"
            >
              <option value="all">전체 사업분류</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          {/* 전체화면 토글 버튼 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleFullscreen()
            }}
            className="bg-white hover:bg-gray-100 border border-gray-300 rounded-lg p-2 shadow-lg transition-all duration-200 hover:shadow-xl flex items-center justify-center"
            title={isFullscreen ? '전체화면 해제' : '전체화면으로 보기'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5 text-gray-700" />
            ) : (
              <Maximize2 className="h-5 w-5 text-gray-700" />
            )}
          </button>

          {/* 데스크톱 기상특보 레이어 토글 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowWeatherWarnings(!showWeatherWarnings)
            }}
            className={`legend-desktop hidden items-center gap-1.5 bg-white/95 hover:bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 shadow-lg text-xs transition-all duration-200 hover:shadow-xl ${!showWeatherWarnings ? 'opacity-50' : ''}`}
            title={showWeatherWarnings && weatherWarnings.error ? weatherWarnings.error : '기상특보 표시'}
          >
            {showWeatherWarnings && weatherWarnings.loading && weatherWarnings.count === 0 ? (
              <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            ) : (
              <span className="inline-block w-3 h-3 rounded-sm border border-blue-700" style={{ backgroundColor: '#3B82F6', opacity: 0.65 }}></span>
            )}
            <span className="text-gray-700 whitespace-nowrap">
              기상특보 <span className="font-semibold">
                ({showWeatherWarnings && weatherWarnings.loading && weatherWarnings.count === 0
                  ? '로딩중...'
                  : showWeatherWarnings && weatherWarnings.error
                    ? '오류'
                    : `${weatherWarnings.count}개`})
              </span>
            </span>
          </button>
        </div>
      )}

      {/* 범례: 선택된 분기 정보 (클릭하여 표시/숨김) */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 px-4 py-2 z-50">
        <style>{`
          /* 671px 이상에서는 한 줄 표시 */
          @media (min-width: 671px) {
            .legend-desktop { display: flex !important; }
            .legend-mobile { display: none !important; }
          }
          /* 670px 이하는 2줄(이상) 표시 */
          @media (max-width: 670px) {
            .legend-desktop { display: none !important; }
            .legend-mobile { display: flex !important; }
          }
        `}</style>

        {/* 데스크톱: 한 줄 표시 (671px 이상) */}
        <div className="legend-desktop hidden items-center gap-3 text-xs">
          <button
            onClick={() => setShowActiveMarkers(!showActiveMarkers)}
            className={`flex items-center gap-1.5 transition-opacity hover:opacity-80 cursor-pointer ${!showActiveMarkers ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: '#DC2626' }}></span>
            <span className="text-gray-700 whitespace-nowrap">
              공사중 <span className="font-semibold">({activeProjectsCount}개)</span>
            </span>
          </button>
          <button
            onClick={() => setShowInactiveMarkers(!showInactiveMarkers)}
            className={`flex items-center gap-1.5 transition-opacity hover:opacity-80 cursor-pointer ${!showInactiveMarkers ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: '#9CA3AF' }}></span>
            <span className="text-gray-700 whitespace-nowrap">
              공사 미실시 <span className="font-semibold">({inactiveProjectsCount}개)</span>
            </span>
          </button>
          <div className="w-px h-4 bg-gray-300"></div>
          <button
            onClick={() => setShowUninspectedHQ(!showUninspectedHQ)}
            className={`flex items-center gap-1.5 transition-opacity hover:opacity-80 cursor-pointer ${!showUninspectedHQ ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: '#8B5CF6' }}></span>
            <span className="text-gray-700 whitespace-nowrap">
              미점검(본부) <span className="font-semibold">({uninspectedHQCount}개)</span>
            </span>
          </button>
          <button
            onClick={() => setShowUninspectedBranch(!showUninspectedBranch)}
            className={`flex items-center gap-1.5 transition-opacity hover:opacity-80 cursor-pointer ${!showUninspectedBranch ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: '#F97316' }}></span>
            <span className="text-gray-700 whitespace-nowrap">
              미점검(지사) <span className="font-semibold">({uninspectedBranchCount}개)</span>
            </span>
          </button>


          <div className="w-px h-4 bg-gray-300"></div>
          <button
            onClick={() => setShowOfficeMarkers(!showOfficeMarkers)}
            className={`flex items-center gap-1.5 transition-opacity hover:opacity-80 cursor-pointer ${!showOfficeMarkers ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: '#3B82F6' }}></span>
            <span className="text-gray-700 whitespace-nowrap">
              청사 <span className="font-semibold">({offices.length}개)</span>
            </span>
          </button>
          <div className="w-px h-4 bg-gray-300"></div>
          <button
            onClick={async () => {
              // TBM 데이터가 아직 로드되지 않았고, 표시하려는 경우에만 로드
              if (!tbmDataLoaded && !showTBMMarkers && onLoadTBM) {
                await onLoadTBM()
                setTbmDataLoaded(true)
              }
              setShowTBMMarkers(!showTBMMarkers)
            }}
            className={`flex items-center gap-1.5 transition-opacity hover:opacity-80 cursor-pointer ${!showTBMMarkers ? 'opacity-40' : ''}`}
            disabled={tbmLoading}
          >
            {tbmLoading ? (
              <>
                <div className="animate-spin h-3 w-3 border-2 border-red-500 border-t-transparent rounded-full"></div>
                <span className="text-gray-700 whitespace-nowrap">
                  TBM <span className="font-semibold">(로딩중...)</span>
                </span>
              </>
            ) : (
              <>
                <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: '#DC2626' }}></span>
                <span className="text-gray-700 whitespace-nowrap">
                  TBM <span className="font-semibold">({tbmRecords?.length || 0}개)</span>
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 모바일 범례: 좌측 하단 세로 배치 (670px 이하) */}
      <style>{`
        @media (min-width: 671px) {
          .legend-mobile-vertical { display: none !important; }
        }
        @media (max-width: 670px) {
          .legend-mobile-vertical { display: flex !important; }
        }
      `}</style>
      <div className="legend-mobile-vertical hidden absolute left-2 bottom-4 flex-col gap-1 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 py-2 px-1.5 z-40">
        {/* 공사중 */}
        <button
          onClick={() => setShowActiveMarkers(!showActiveMarkers)}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showActiveMarkers ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          title="공사중"
        >
          <ExcavatorIcon className="w-4 h-4 text-[#DC2626]" />
          <span className="text-[9px] font-semibold text-gray-700">({activeProjectsCount})</span>
        </button>

        {/* 공사 미실시 */}
        <button
          onClick={() => setShowInactiveMarkers(!showInactiveMarkers)}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showInactiveMarkers ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          title="공사 미실시"
        >
          <InactiveExcavatorIcon className="w-4 h-4 text-[#9CA3AF]" />
          <span className="text-[9px] font-semibold text-gray-700">({inactiveProjectsCount})</span>
        </button>

        <div className="h-px w-full bg-gray-200 my-0.5"></div>

        {/* 미점검(본부) */}
        <button
          onClick={() => setShowUninspectedHQ(!showUninspectedHQ)}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showUninspectedHQ ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          title="미점검(본부)"
        >
          <div className="relative w-4 h-4">
            <Building2 className="w-4 h-4 text-[#8B5CF6]" />
            <svg className="absolute inset-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </div>
          <span className="text-[9px] font-semibold text-gray-700">({uninspectedHQCount})</span>
        </button>

        {/* 미점검(지사) */}
        <button
          onClick={() => setShowUninspectedBranch(!showUninspectedBranch)}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showUninspectedBranch ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          title="미점검(지사)"
        >
          <div className="relative w-4 h-4">
            <Home className="w-4 h-4 text-[#F97316]" />
            <svg className="absolute inset-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </div>
          <span className="text-[9px] font-semibold text-gray-700">({uninspectedBranchCount})</span>
        </button>

        <div className="h-px w-full bg-gray-200 my-0.5"></div>

        {/* 청사 */}
        <button
          onClick={() => setShowOfficeMarkers(!showOfficeMarkers)}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showOfficeMarkers ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          title="청사"
        >
          <img src="/KRCPNG.png" alt="KRC" className="w-5 h-2.5 object-contain" />
          <span className="text-[9px] font-semibold text-gray-700">({offices.length})</span>
        </button>

        {/* TBM */}
        <button
          onClick={async () => {
            if (!tbmDataLoaded && !showTBMMarkers && onLoadTBM) {
              await onLoadTBM()
              setTbmDataLoaded(true)
            }
            setShowTBMMarkers(!showTBMMarkers)
          }}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showTBMMarkers ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          disabled={tbmLoading}
          title="TBM"
        >
          {tbmLoading ? (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="animate-spin h-3 w-3 border-2 border-[#DC2626] border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <Activity className="w-4 h-4 text-[#DC2626]" />
          )}
          <span className="text-[9px] font-semibold text-gray-700">({tbmRecords?.length || 0})</span>
        </button>

        {/* 기상특보 */}
        <button
          onClick={() => setShowWeatherWarnings(!showWeatherWarnings)}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${!showWeatherWarnings ? 'opacity-40 grayscale' : 'hover:bg-gray-100'}`}
          title={showWeatherWarnings && weatherWarnings.error ? weatherWarnings.error : '기상특보'}
        >
          {showWeatherWarnings && weatherWarnings.loading && weatherWarnings.count === 0 ? (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <AlertTriangle className="w-4 h-4 text-[#2563EB]" />
          )}
          <span className="text-[9px] font-semibold text-gray-700">
            ({showWeatherWarnings && weatherWarnings.loading && weatherWarnings.count === 0
              ? '…'
              : showWeatherWarnings && weatherWarnings.error ? '!' : weatherWarnings.count})
          </span>
        </button>
      </div>

      {/* 현재위치 버튼 - 우측 하단 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          showCurrentLocation()
        }}
        disabled={isLocating}
        className="absolute bottom-4 right-4 z-50 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg p-2 shadow-md transition-all duration-200 hover:shadow-lg disabled:opacity-50"
        title="현재 위치 표시"
      >
        {isLocating ? (
          <div className="h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        ) : (
          <LocateFixed className="h-5 w-5 text-gray-700" />
        )}
      </button>

      {/* 네비게이션 선택 모달 */}
      <NavigationSelector
        isOpen={navigationModal.isOpen}
        address={navigationModal.address}
        onClose={() => setNavigationModal({ isOpen: false, address: '' })}
      />

      {/* 청사 안내 모달 - 지도 컨테이너 밖에 fixed로 표시 */}
      {selectedOffice && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={() => setSelectedOffice(null)}
        >
          {/* 배경 오버레이 */}
          <div className="absolute inset-0 bg-black/30" />

          {/* 모달 컨텐츠 */}
          <div
            className="relative bg-white rounded-xl shadow-2xl p-5 mx-4 max-w-sm w-full animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={() => setSelectedOffice(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
            >
              ✕
            </button>

            {/* 제목 */}
            <h3 className="text-lg font-bold text-gray-900 mb-1 pr-8">
              {selectedOffice.name}
            </h3>

            {/* 주소 */}
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              {selectedOffice.address}
            </p>

            {/* 네비게이션 버튼들 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(selectedOffice.address)}`)}
                className="bg-[#2db400] hover:bg-[#26a000] text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                네이버
              </button>
              <button
                onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(selectedOffice.address)}`)}
                className="bg-[#facc15] hover:bg-[#eabc05] text-black py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                카카오
              </button>
              <button
                onClick={() => window.open(`https://apis.openapi.sk.com/tmap/app/poi?appKey=hTKnKnSYyD4ljeMriScKD4M74VX1Nm6S7KRbyLfw&name=${encodeURIComponent(selectedOffice.name)}`)}
                className="bg-[#1d4ed8] hover:bg-[#1e40af] text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                티맵
              </button>
            </div>

            {/* 전화걸기 버튼 */}
            {selectedOffice.phone ? (
              <a
                href={`tel:${selectedOffice.phone.replace(/[^0-9]/g, '')}`}
                className="flex items-center justify-center gap-2 w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
              >
                📞 전화걸기: {selectedOffice.phone}
              </a>
            ) : (
              <button
                disabled
                className="flex items-center justify-center gap-2 w-full bg-gray-300 text-gray-500 py-3 rounded-lg text-sm font-semibold cursor-not-allowed"
              >
                📞 전화번호 없음
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SimpleProjectMap
