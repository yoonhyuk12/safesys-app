'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { MapPin, Building2, Calendar, Copy, Maximize2, Minimize2, LocateFixed } from 'lucide-react'
import { RISK_WORK_COLORS } from '@/lib/constants'

export interface ProjectMarker {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  managingHq: string
  managingBranch: string
  highlightRed?: boolean
  riskWorkType?: string // 위험공종 정보 추가
  todayWork?: string // 오늘 작업내용 추가
}

interface KakaoMapProps {
  projects: ProjectMarker[]
  onProjectClick?: (project: ProjectMarker) => void
  height?: string
  className?: string
  focusedProjectId?: string
  highlightedBranch?: string
  highlightedHq?: string
  disableClick?: boolean
  showRadar?: boolean
  disableHover?: boolean // 호버 효과 비활성화 옵션 추가
  showLegend?: boolean
  offices?: any[] // 사무실 위치 데이터 추가
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

// kakao 변수를 전역으로 선언
declare const kakao: {
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

const KakaoMap: React.FC<KakaoMapProps> = ({
  projects,
  onProjectClick,
  height = '500px',
  className = '',
  focusedProjectId,
  highlightedBranch,
  highlightedHq,
  disableClick = false,
  showRadar = false,
  disableHover = false,
  showLegend = true,
  offices = []
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [markers, setMarkers] = useState<any[]>([])
  const [overlays, setOverlays] = useState<any[]>([])
  const markersRef = useRef<any[]>([])
  const overlaysRef = useRef<any[]>([])
  const officeMarkersRef = useRef<any[]>([])
  const officeLabelsRef = useRef<any[]>([])  // 창사 라벨 오버레이 (KRC 로고 위에 표시되는 상시 라벨)
  const initializingRef = useRef(false)
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  })
  const [hoveredRiskType, setHoveredRiskType] = useState<string | null>(null)
  const [clickedRiskType, setClickedRiskType] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
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

  // onProjectClick 콜백은 ref로 보관하여 의존성으로 인한 불필요한 재생성 방지
  const onProjectClickRef = useRef<typeof onProjectClick | undefined>(undefined)
  useEffect(() => {
    onProjectClickRef.current = onProjectClick
  }, [onProjectClick])

  // 본부별 색상 정의
  const hqColors: { [key: string]: string } = {
    '경기본부': '#3B82F6', // 파란색
    '강원본부': '#10B981', // 녹색
    '충북본부': '#F59E0B', // 주황색
    '충남본부': '#EF4444', // 빨간색
    '전북본부': '#8B5CF6', // 보라색
    '전남본부': '#06B6D4', // 시안색
    '경북본부': '#EC4899', // 핑크색
    '경남본부': '#84CC16', // 라임색
    'default': '#6B7280'  // 회색 (기본값)
  }

  // 본부별 마커 색상 가져오기
  const getMarkerColor = (managingHq: string) => {
    return hqColors[managingHq] || hqColors['default']
  }

  // 위험공종별 마커 색상 가져오기
  const getRiskWorkColor = (riskWorkType?: string) => {
    if (!riskWorkType) return RISK_WORK_COLORS['해당없음']
    return RISK_WORK_COLORS[riskWorkType] || RISK_WORK_COLORS['해당없음']
  }

  // 공통 마커 이미지 생성 함수
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

  // 반응형 height 계산
  const responsiveHeight = windowSize.width < 1024 ? '400px' : '600px'

  // 화면 크기 변경 감지
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // ResizeObserver를 사용하여 컨테이너 크기 변경 감지
  useEffect(() => {
    if (!mapRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (map) {
        // 지도 리사이즈
        map.relayout()
        console.log('지도 리사이즈 완료')
      }
    })

    resizeObserver.observe(mapRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [map])

  // 카카오맵 초기화 (마운트 시 1회)
  useEffect(() => {
    if (!mapRef.current) return

    const initializeKakaoMap = () => {
      // window.kakao와 maps 객체가 완전히 로드되었는지 확인
      if (typeof window.kakao === 'undefined' ||
        !window.kakao.maps ||
        !window.kakao.maps.Map ||
        !window.kakao.maps.LatLng) {
        console.log('카카오맵 API 대기 중...')
        setTimeout(initializeKakaoMap, 100)
        return
      }

      initializeMap()
    }

    const initializeMap = () => {
      // 이미 초기화 중이거나 완료된 경우 중복 실행 방지
      if (initializingRef.current || map) {
        console.log('카카오맵 이미 초기화 중이거나 완료됨. 중복 실행 방지.')
        return
      }

      console.log('카카오맵 초기화 시작')
      initializingRef.current = true

      try {
        // 기본 위치 설정 (서울시청)
        const defaultCenter = { lat: 37.5665, lng: 126.9780 }
        let mapCenter = defaultCenter

        // 프로젝트가 있으면 중심 계산
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

        // 지도 생성
        const kakaoMap = new kakao.maps.Map(mapRef.current, mapOption)

        // 지도 확대 축소를 제어할 수 있는 줌 컨트롤을 생성
        const zoomControl = new kakao.maps.ZoomControl()
        kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT)

        // 일반지도와 스카이뷰로 지도 타입을 전환할 수 있는 지도타입 컨트롤을 생성
        const mapTypeControl = new kakao.maps.MapTypeControl()
        kakaoMap.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT)

        setMap(kakaoMap)
        setIsMapLoaded(true)

        // 프로젝트가 여러 개인 경우 모든 마커가 보이도록 지도 범위 조정
        if (projects.length > 1) {
          const bounds = new kakao.maps.LatLngBounds()
          projects.forEach(project => {
            bounds.extend(new kakao.maps.LatLng(project.lat, project.lng))
          })
          // 패딩을 추가하여 setBounds 적용 (마진 효과)
          setTimeout(() => {
            kakaoMap.setBounds(bounds, 50, 50, 50, 50) // top, right, bottom, left 패딩
          }, 100)
        }

        console.log('카카오맵 초기화 완료')
        initializingRef.current = false  // 성공 시 플래그 해제
      } catch (error) {
        console.error('카카오맵 초기화 실패:', error)
        initializingRef.current = false  // 실패 시 플래그 해제
      }
    }

    initializeKakaoMap()

    // cleanup 함수
    return () => {
      if (markers.length > 0) {
        markers.forEach(marker => {
          marker.setMap(null)
        })
      }
      if (overlays.length > 0) {
        overlays.forEach(overlay => {
          overlay.setMap(null)
        })
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
  }, []) // 프로젝트 변경에 의해 지도 자체를 재초기화하지 않음

  // 사무실 마커 표시
  useEffect(() => {
    if (!map || !offices.length || typeof (window as any).kakao === 'undefined') return

    console.log('🏢 KakaoMap 사무실 마커 업데이트 시작:', offices.length)

    // 기존 사무실 마커와 라벨 제거
    officeMarkersRef.current.forEach(marker => marker.setMap(null))
    officeLabelsRef.current.forEach(label => label.setMap(null))
    officeMarkersRef.current = []
    officeLabelsRef.current = []

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

  }, [map, offices])

  // 마커 표시
  useEffect(() => {
    if (!map || !projects.length || typeof (window as any).kakao === 'undefined') return

    console.log('마커 표시 시작, 프로젝트 수:', projects.length)

    // 기존 마커와 오버레이 제거
    markers.forEach(marker => {
      marker.setMap(null)
    })
    overlays.forEach(overlay => {
      overlay.setMap(null)
    })

    const newMarkers: any[] = []
    const newOverlayItems: any[] = []

    projects.forEach((project, index) => {
      try {
        console.log(`마커 생성 시도 ${index + 1}:`, project.name, project.lat, project.lng, project.managingHq)

        const markerPosition = new kakao.maps.LatLng(project.lat, project.lng)
        const baseColor = getMarkerColor(project.managingHq)
        // 위험공종별 색상 적용 (highlightRed가 없으면 위험공종 색상 사용)
        const pinColor = project.highlightRed ? '#DC2626' : getRiskWorkColor(project.riskWorkType)
        const normalMarkerImage = createMarkerImage(pinColor, false)
        const largeMarkerImage = createMarkerImage(pinColor, true)

        // 마커 생성 (title 제거 - 브라우저 기본 툴팁 방지)
        const marker = new kakao.maps.Marker({
          position: markerPosition,
          image: normalMarkerImage
        })

        // 마커를 지도에 표시
        marker.setMap(map)

        // 프로젝트명 라벨 생성 (최대 5글자)
        const projectNameLabel = project.name.length > 5 ?
          project.name.substring(0, 5) + '...' :
          project.name

        const labelOverlay = new kakao.maps.CustomOverlay({
          content: `
            <div id="label-${index}" style="
              background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.95));
              border: 2px solid ${baseColor};
              border-radius: 8px;
              padding: 3px 8px;
              font-size: 12px;
              font-weight: 600;
              color: ${baseColor};
              box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset;
              white-space: nowrap;
              text-align: center;
              position: relative;
              left: -50%;
              cursor: ${disableClick ? 'default' : 'pointer'};
              transition: all 0.2s ease;
              backdrop-filter: blur(4px);
            ">
              ${projectNameLabel}
              <div style="
                position: absolute;
                bottom: -4px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 4px solid ${baseColor};
              "></div>
            </div>
          `,
          position: markerPosition,
          yAnchor: -0.4, // 마커 하단에 표시
          xAnchor: 0,    // 마커 중심점을 기준으로 설정
          clickable: !disableClick
        })

        labelOverlay.setMap(map)

        // 인포 오버레이 생성 (우측에 표시)
        const riskWorkDisplay = project.riskWorkType && project.riskWorkType !== '해당없음'
          ? `<span style="display: inline-block; margin-top: 4px; padding: 2px 6px; background: ${getRiskWorkColor(project.riskWorkType)}; color: white; border-radius: 4px; font-size: 10px; font-weight: 600;">${project.riskWorkType}</span>`
          : ''

        const copyText = `${project.name}\n${project.todayWork || '작업 내용 없음'}`

        const infoOverlayContent = `
          <div id="info-${index}" style="
            padding: 8px 12px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            min-width: 150px;
            max-width: 250px;
            position: relative;
            z-index: 1000;
            margin-left: 20px;
          ">
            <div style="
              font-size: 13px;
              font-weight: 600;
              color: #1f2937;
              margin-bottom: 4px;
              word-wrap: break-word;
              word-break: keep-all;
              overflow-wrap: break-word;
            ">${project.name}</div>
            <div style="
              font-size: 11px;
              color: #6b7280;
              line-height: 1.4;
              margin-bottom: 4px;
              word-wrap: break-word;
              word-break: keep-all;
              overflow-wrap: break-word;
              white-space: normal;
            ">${project.todayWork || '작업 내용 없음'}</div>
            ${riskWorkDisplay}
            <button
              id="copy-btn-${index}"
              data-copy-text="${copyText.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}"
              style="
                margin-top: 6px;
                padding: 4px 8px;
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 11px;
                color: #4b5563;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                width: 100%;
                justify-content: center;
              "
              onmouseover="this.style.background='#e5e7eb'"
              onmouseout="this.style.background='#f3f4f6'"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              복사
            </button>
          </div>
        `

        const infoOverlay = new kakao.maps.CustomOverlay({
          content: infoOverlayContent,
          position: markerPosition,
          xAnchor: 0,
          yAnchor: 0.5,
          zIndex: 1000
        })

        // 타이머를 저장할 변수
        let hoverTimeout: ReturnType<typeof setTimeout> | null = null

        // 동기화된 호버 효과 함수
        const applyHoverEffect = () => {
          // 기존 타이머가 있으면 취소
          if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
          }

          if (marker.getImage() === normalMarkerImage) { // 클릭되지 않은 상태일 때만
            marker.setImage(largeMarkerImage)
            marker.setZIndex(5)

            // 라벨 호버 효과도 동시에 적용
            const labelElement = document.getElementById(`label-${index}`)
            if (labelElement) {
              labelElement.style.transform = 'scale(1.05)'
              labelElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)'
            }
          }

          // 인포 오버레이 즉시 표시 (조건 없이 항상 표시)
          infoOverlay.setMap(map)

          // 인포 오버레이 DOM 요소에 이벤트 추가
          setTimeout(() => {
            const infoElement = document.getElementById(`info-${index}`)
            if (infoElement) {
              infoElement.addEventListener('mouseenter', applyHoverEffect)
              infoElement.addEventListener('mouseleave', removeHoverEffect)
            }

            // 복사 버튼 이벤트 추가
            const copyBtn = document.getElementById(`copy-btn-${index}`)
            if (copyBtn) {
              copyBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                const textToCopy = copyBtn.getAttribute('data-copy-text')?.replace(/&#10;/g, '\n') || ''
                navigator.clipboard.writeText(textToCopy).then(() => {
                  const originalText = copyBtn.innerHTML
                  copyBtn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    복사됨
                  `
                  setTimeout(() => {
                    copyBtn.innerHTML = originalText
                  }, 1500)
                }).catch(err => {
                  console.error('복사 실패:', err)
                })
              })
            }
          }, 10)
        }

        const removeHoverEffect = () => {
          // 타이머를 사용하여 즉시 사라지지 않도록 지연
          hoverTimeout = setTimeout(() => {
            if (marker.getImage() === largeMarkerImage && marker.getZIndex() === 5) { // 호버 상태일 때만
              marker.setImage(normalMarkerImage)
              marker.setZIndex(1)

              // 라벨 호버 효과도 동시에 제거
              const labelElement = document.getElementById(`label-${index}`)
              if (labelElement) {
                labelElement.style.transform = 'scale(1)'
                labelElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
              }
            }

            // 인포 오버레이 닫기
            infoOverlay.setMap(null)
          }, 150) // 150ms 지연 (호버 영역 이동 시 깜빡임 방지)
        }

        // 클릭이 활성화된 경우에만 이벤트 추가
        if (!disableClick) {
          // 라벨 클릭 이벤트
          kakao.maps.event.addListener(labelOverlay, 'click', function () {
            console.log('라벨 클릭:', project.name)
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })

          // 마커 클릭 이벤트
          kakao.maps.event.addListener(marker, 'click', function () {
            console.log('마커 클릭:', project.name)

            // 기존 마커들을 원래 크기로 복구
            newMarkers.forEach((m, idx) => {
              if (m !== marker && projects[idx]) {
                const originalPinColor = projects[idx].highlightRed ? '#DC2626' : getRiskWorkColor(projects[idx].riskWorkType)
                const originalNormalImage = createMarkerImage(originalPinColor, false)
                m.setImage(originalNormalImage)
                m.setZIndex(1)
              }
            })

            // 클릭된 마커 확대 효과
            marker.setImage(largeMarkerImage)
            marker.setZIndex(10)

            // 프로젝트 클릭 콜백 호출
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })

          // 호버 효과가 비활성화되지 않은 경우에만 호버 이벤트 추가
          if (!disableHover) {
            // 마커 호버 이벤트 - 동기화된 효과 적용
            kakao.maps.event.addListener(marker, 'mouseover', applyHoverEffect)
            kakao.maps.event.addListener(marker, 'mouseout', removeHoverEffect)

            // 라벨 호버 이벤트 - 동기화된 효과 적용
            kakao.maps.event.addListener(labelOverlay, 'mouseover', applyHoverEffect)
            kakao.maps.event.addListener(labelOverlay, 'mouseout', removeHoverEffect)
          } else {
            // disableHover일 때는 인포 오버레이만 표시 (마커 확대 없음)
            let disableHoverTimeout: ReturnType<typeof setTimeout> | null = null

            const showInfoOnly = () => {
              if (disableHoverTimeout) {
                clearTimeout(disableHoverTimeout)
                disableHoverTimeout = null
              }
              // 인포 오버레이 즉시 표시
              infoOverlay.setMap(map)

              // 인포 오버레이 DOM 요소에 이벤트 추가
              setTimeout(() => {
                const infoElement = document.getElementById(`info-${index}`)
                if (infoElement) {
                  infoElement.addEventListener('mouseenter', showInfoOnly)
                  infoElement.addEventListener('mouseleave', hideInfoOnly)
                }
              }, 10)
            }

            const hideInfoOnly = () => {
              disableHoverTimeout = setTimeout(() => {
                infoOverlay.setMap(null)
              }, 150) // 150ms 지연
            }

            kakao.maps.event.addListener(marker, 'mouseover', showInfoOnly)
            kakao.maps.event.addListener(marker, 'mouseout', hideInfoOnly)
            kakao.maps.event.addListener(labelOverlay, 'mouseover', showInfoOnly)
            kakao.maps.event.addListener(labelOverlay, 'mouseout', hideInfoOnly)
          }
        }
        newOverlayItems.push(labelOverlay)

        newMarkers[newMarkers.length] = marker
        console.log(`마커 추가 완료: ${project.name}`)

      } catch (error) {
        console.error(`마커 생성 오류 - ${project.name}:`, error)
      }
    })

    setMarkers(newMarkers)
    setOverlays(newOverlayItems)
    markersRef.current = newMarkers
    overlaysRef.current = newOverlayItems
    console.log('총 생성된 마커 수:', newMarkers.length)
    console.log('총 생성된 라벨 수:', newOverlayItems.length)

    // 사용자가 현재위치로 이동한 경우 지도 범위 자동 조정 건너뛰기
    if (userCenteredRef.current) {
      return
    }

    // 모든 마커가 보이도록 지도 범위 조정
    if (projects.length > 1) {
      const bounds = new (window as any).kakao.maps.LatLngBounds()
      projects.forEach(project => {
        bounds.extend(new (window as any).kakao.maps.LatLng(project.lat, project.lng))
      })
      // 패딩을 추가하여 setBounds 적용 (마진 효과)
      setTimeout(() => {
        map.setBounds(bounds, 50, 50, 50, 50) // top, right, bottom, left 패딩
      }, 100)
    } else if (projects.length === 1) {
      // 단일 프로젝트인 경우도 적절한 줌 레벨로 설정
      const project = projects[0]
      const center = new (window as any).kakao.maps.LatLng(project.lat, project.lng)
      map.setCenter(center)
      map.setLevel(3)
    }

  }, [map, projects])

  // 지사 hover 하이라이트: 해당 지사의 마커를 빨간색으로 표시 (이전 하이라이트만 복원, 전체 초기화 방지)
  const lastHighlightedRef = useRef<number[]>([])
  useEffect(() => {
    if (!map || !markersRef.current.length || typeof (window as any).kakao === 'undefined') return

    const { kakao } = window as any

    // 하이라이트용 빨간색 마커
    const highlightMarkerImage = createMarkerImage('#DC2626', false) // 빨간색

    const normalize = (name: string) => {
      return (name || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/(지사|본부)$/g, '')
    }
    const targetBranchRaw = highlightedBranch
    const targetHqRaw = highlightedHq
    const targetBranch = targetBranchRaw ? normalize(targetBranchRaw) : ''
    const targetHq = targetHqRaw ? normalize(targetHqRaw) : ''
    // 1) 이전 하이라이트 복원 (이전 인덱스만 복구)
    lastHighlightedRef.current.forEach((idx) => {
      const marker = markersRef.current[idx]
      if (!marker || !projects[idx]) return
      try {
        // 위험공종 색상으로 복원
        const originalColor = projects[idx].highlightRed ? '#DC2626' : getRiskWorkColor(projects[idx].riskWorkType)
        const originalMarkerImage = createMarkerImage(originalColor, false)
        marker.setImage(originalMarkerImage)
        marker.setZIndex(1)
        if (overlaysRef.current[idx] && typeof overlaysRef.current[idx].setZIndex === 'function') {
          overlaysRef.current[idx].setZIndex(1)
        }
      } catch { }
    })

    // 2) 신규 하이라이트 적용
    const newHighlighted: number[] = []
    markersRef.current.forEach((marker, index) => {
      const project = projects[index]
      if (!project) return
      const branch = normalize(project.managingBranch || '')
      const hq = normalize(project.managingHq || '')

      // 지사 매칭 또는 본부 매칭 확인
      const branchMatch = !!targetBranch && (branch === targetBranch || branch.includes(targetBranch) || targetBranch.includes(branch))
      const hqMatch = !!targetHq && (hq === targetHq || hq.includes(targetHq) || targetHq.includes(hq))
      const isMatch = branchMatch || hqMatch

      console.log(`프로젝트 ${index}: ${project.name}, 본부: "${project.managingHq}" -> 정규화: "${hq}", 지사: "${project.managingBranch}" -> 정규화: "${branch}", 본부타겟: "${targetHq}", 지사타겟: "${targetBranch}", 매칭: ${isMatch}`)
      if (isMatch) {
        try {
          console.log(`마커 ${index} 빨간색으로 변경 시도:`, project.name)
          marker.setImage(highlightMarkerImage)
          marker.setZIndex(5)
          if (overlaysRef.current[index] && typeof overlaysRef.current[index].setZIndex === 'function') {
            overlaysRef.current[index].setZIndex(5)
          }
          newHighlighted.push(index)
          console.log(`마커 ${index} 빨간색 변경 완료:`, project.name)
        } catch (err) {
          console.log(`마커 ${index} 색상 변경 실패:`, err)
        }
      }
    })

    lastHighlightedRef.current = newHighlighted
    console.log('하이라이트:', targetBranchRaw, targetHqRaw, '적용 마커 수:', newHighlighted.length)
  }, [highlightedBranch, highlightedHq, projects, map])

  // 범례 hover/click 시 해당 위험공종 마커만 표시
  useEffect(() => {
    if (!map || !markersRef.current.length) return

    // 클릭이 우선, 그 다음 hover, 둘 다 없으면 모든 마커 표시
    const activeRiskType = clickedRiskType || hoveredRiskType

    markersRef.current.forEach((marker, index) => {
      const project = projects[index]
      if (!project) return

      const projectRiskType = project.riskWorkType || '해당없음'

      if (activeRiskType === null) {
        // 필터링 없으면 모든 마커 표시
        marker.setMap(map)
        if (overlaysRef.current[index]) {
          overlaysRef.current[index].setMap(map)
        }
      } else {
        // 활성화된 위험공종과 일치하는 마커만 표시
        if (projectRiskType === activeRiskType) {
          marker.setMap(map)
          if (overlaysRef.current[index]) {
            overlaysRef.current[index].setMap(map)
          }
        } else {
          marker.setMap(null)
          if (overlaysRef.current[index]) {
            overlaysRef.current[index].setMap(null)
          }
        }
      }
    })
  }, [hoveredRiskType, clickedRiskType, map, projects])


  return (
    <div
      ref={containerRef}
      className={`relative ${className} ${isFullscreen ? 'bg-white' : ''}`}
      onClick={() => setClickedRiskType(null)}
      style={isFullscreen ? { width: '100%', height: '100%' } : undefined}
    >
      <div
        ref={mapRef}
        style={{ width: '100%', height: isFullscreen ? '100%' : (height || responsiveHeight) }}
        className="rounded-lg border border-gray-300 bg-gray-100"
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

      {/* 전체화면 토글 버튼 - 좌측 상단 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          toggleFullscreen()
        }}
        className="absolute top-2 left-2 z-50 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg p-2 shadow-md transition-all duration-200 hover:shadow-lg"
        title={isFullscreen ? '전체화면 해제' : '전체화면으로 보기'}
      >
        {isFullscreen ? (
          <Minimize2 className="h-5 w-5 text-gray-700" />
        ) : (
          <Maximize2 className="h-5 w-5 text-gray-700" />
        )}
      </button>

      {/* 지도 전체 레이더 스캔 바늘 - TBM현황에서만 표시 */}
      {showRadar && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
          {/* 중앙 레이더 점 */}
          <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-blue-400 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-20 animate-pulse shadow-lg shadow-blue-400/50"></div>

          {/* 회전하는 레이더 스캔 바늘 */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
            <div
              className="animate-spin"
              style={{
                width: '200vmax',
                height: '200vmax',
                animationDuration: '6s',
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite'
              }}
            >
              {/* 레이더 바늘 - 그라데이션으로 스캔 효과 */}
              <div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: '200vmax',
                  height: '200vmax',
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 340deg, rgba(59, 130, 246, 0.3) 350deg, rgba(59, 130, 246, 0.8) 355deg, rgba(59, 130, 246, 0.9) 358deg, rgba(59, 130, 246, 0.6) 360deg)',
                  clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 50% 0%)'
                }}
              ></div>
            </div>
          </div>

          {/* 레이더 동심원 그리드 */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-5">
            <div className="w-32 h-32 rounded-full border border-blue-500/20 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            <div className="w-48 h-48 rounded-full border border-blue-500/15 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            <div className="w-64 h-64 rounded-full border border-blue-500/10 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            <div className="w-80 h-80 rounded-full border border-blue-500/8 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
          </div>
        </div>
      )}


      {/* 프로젝트 정보 패널 */}
      {projects.length > 0 && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs">
          <div className="flex items-center mb-2">
            <Building2 className="h-5 w-5 text-blue-600 mr-2" />
            <span className="font-semibold text-gray-900">프로젝트 현황</span>
          </div>
          <div className="text-sm text-gray-600 mb-3">
            총 <span className="font-semibold text-blue-600">{projects.length}개</span> 프로젝트
          </div>

          {/* 본부별 범례 */}
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-700 mb-2">본부별 색상</div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(hqColors)
                .filter(([hq]) => hq !== 'default' && projects.some(p => p.managingHq === hq))
                .map(([hq, color]) => (
                  <div key={hq} className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-1 border border-gray-300"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-gray-600 truncate">{hq.replace('본부', '')}</span>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="text-xs text-gray-500">
            마커를 클릭하면 상세 정보를 확인할 수 있습니다.
          </div>
        </div>
      )}

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

      {/* 범례: 위험공종별 색상 - 좌측 세로 정렬 */}
      {showLegend && (
        <div
          className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 px-2.5 py-2 z-50"
          onMouseLeave={() => setHoveredRiskType(null)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-y-1 text-[11px]">
            {Object.entries(RISK_WORK_COLORS).map(([type, color]) => {
              const count = projects.filter(p => p.riskWorkType === type).length
              const isHovered = hoveredRiskType === type
              const isClicked = clickedRiskType === type
              const displayText = (isHovered || isClicked) ? type : type.charAt(0)
              return (
                <div
                  key={type}
                  className="flex items-center space-x-1.5 cursor-pointer transition-all duration-200 hover:scale-105 px-1.5 py-0.5 rounded"
                  onMouseEnter={() => setHoveredRiskType(type)}
                  onClick={(e) => {
                    e.stopPropagation()
                    setClickedRiskType(clickedRiskType === type ? null : type)
                  }}
                  style={{
                    opacity: (hoveredRiskType === null && clickedRiskType === null) || isHovered || isClicked ? 1 : 0.3,
                    backgroundColor: isClicked ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                  }}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: color }}></span>
                  <span className="text-gray-700 whitespace-nowrap font-medium transition-all duration-200">{displayText} ({count > 0 ? count : '-'})</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

export default KakaoMap