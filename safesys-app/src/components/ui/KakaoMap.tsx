'use client'

import React, { useEffect, useRef, useState } from 'react'
import { MapPin, Building2, Calendar } from 'lucide-react'

interface ProjectMarker {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  managingHq: string
  managingBranch: string
  highlightRed?: boolean
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
  showLegend = true
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [markers, setMarkers] = useState<any[]>([])
  const [overlays, setOverlays] = useState<any[]>([])
  const markersRef = useRef<any[]>([])
  const overlaysRef = useRef<any[]>([])
  const initializingRef = useRef(false)
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  })
  // onProjectClick 콜백은 ref로 보관하여 의존성으로 인한 불필요한 재생성 방지
  const onProjectClickRef = useRef<typeof onProjectClick>()
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
      setMap(null)
      setIsMapLoaded(false)
    }
  }, []) // 프로젝트 변경에 의해 지도 자체를 재초기화하지 않음

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
        const pinColor = project.highlightRed ? '#DC2626' : '#6B7280'
        const normalMarkerImage = createMarkerImage(pinColor, false)
        const largeMarkerImage = createMarkerImage(pinColor, true)
        
        // 마커 생성
        const marker = new kakao.maps.Marker({
          position: markerPosition,
          title: project.name,
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
            " 
            title="${project.name}"
            >
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
        
        // 동기화된 호버 효과 함수
        const applyHoverEffect = () => {
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
        }
        
        const removeHoverEffect = () => {
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
        }
        
        // 클릭이 활성화된 경우에만 이벤트 추가
        if (!disableClick) {
          // 라벨 클릭 이벤트
          kakao.maps.event.addListener(labelOverlay, 'click', function() {
            console.log('라벨 클릭:', project.name)
            if (onProjectClickRef.current) {
              onProjectClickRef.current(project)
            }
          })
          
          // 마커 클릭 이벤트
          kakao.maps.event.addListener(marker, 'click', function() {
            console.log('마커 클릭:', project.name)
            
            // 기존 마커들을 원래 크기로 복구
            newMarkers.forEach((m, idx) => {
              if (m !== marker && projects[idx]) {
                const originalPinColor = projects[idx].highlightRed ? '#DC2626' : '#6B7280'
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
        const originalColor = getMarkerColor(projects[idx].managingHq)
        const originalMarkerImage = createMarkerImage(originalColor, false)
        marker.setImage(originalMarkerImage)
        marker.setZIndex(1)
        if (overlaysRef.current[idx] && typeof overlaysRef.current[idx].setZIndex === 'function') {
          overlaysRef.current[idx].setZIndex(1)
        }
      } catch {}
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


  return (
    <div className={`relative ${className}`}>
      <div 
        ref={mapRef} 
        style={{ width: '100%', height: height || responsiveHeight }}
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

      {/* 범례: 공사중(빨간), 미실시(회색) */}
      {showLegend && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur rounded-full shadow-md border border-gray-200 px-4 py-2 flex items-center space-x-4 text-xs z-50 pointer-events-none">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#DC2626' }}></span>
            <span className="text-gray-700">공사중</span>
          </div>
          <div className="w-px h-3 bg-gray-300"></div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#6B7280' }}></span>
            <span className="text-gray-700">미실시</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default KakaoMap