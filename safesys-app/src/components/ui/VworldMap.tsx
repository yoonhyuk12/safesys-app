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
}

interface VworldMapProps {
  projects: ProjectMarker[]
  onProjectClick?: (project: ProjectMarker) => void
  height?: string
  className?: string
}

declare global {
  interface Window {
    vworld: any
    apiMap: any
    SOPPlugin: any
  }
}

// V-world 전역 변수 (공식 예제 방식)
let apiMap: any
let SOPPlugin: any

const VworldMap: React.FC<VworldMapProps> = ({
  projects,
  onProjectClick,
  height = '500px',
  className = ''
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [markers, setMarkers] = useState<any[]>([])
  const mapId = useRef(`vMap_${Date.now()}_${Math.random()}`)

  // V-world API 초기화
  useEffect(() => {
    if (!mapRef.current) return

    let isComponentMounted = true
    let initTimeout: NodeJS.Timeout

    const initializeVworldMap = () => {
      console.log('V-world 지도 초기화 시작')

      // V-world API가 로드될 때까지 대기
      if (!window.vworld) {
        console.log('V-world API 대기 중...')
        setTimeout(initializeVworldMap, 500)
        return
      }

      console.log('V-world API 객체 확인:', window.vworld)
      console.log('vworld.init 존재:', !!window.vworld.init)
      console.log('vworld.vmap 존재:', !!window.vworld.vmap)

      if (!isComponentMounted) {
        console.log('컴포넌트 언마운트됨')
        return
      }

      // V-world 설정
      window.vworld.showMode = true

      initTimeout = setTimeout(() => initializeMap(), 100)
    }

    const initializeMap = () => {
      if (!mapRef.current || !window.vworld || map || !isComponentMounted) return

      try {
        console.log('V-world 지도 초기화 시작')
        
        // V-world 설정
        window.vworld.showMode = true
        
        // 기본 위치 설정
        const defaultCenter = { lat: 36.5, lng: 127.5 }
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

        console.log('지도 중심 좌표:', mapCenter)

        // mapRef에 고유 ID 설정
        if (mapRef.current) {
          mapRef.current.id = mapId.current
        }

        // V-world 지도 초기화 (공식 예제 방식)
        console.log('V-world 지도 초기화 시도')
        
        // 좌표 변환 (WGS84 -> EPSG:3857) - 미리 계산
        const centerX = mapCenter.lng * 20037508.34 / 180
        const centerY = Math.log(Math.tan((90 + mapCenter.lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180
        const zoomLevel = projects.length > 0 ? (projects.length === 1 ? 15 : 10) : 8
        
        // V-world.init 호출 - 다른 접근 방식들 시도
        console.log('V-world.init 호출 전 상태 확인')
        console.log('mapId:', mapId.current)
        console.log('DOM 요소:', document.getElementById(mapId.current))
        
        // 방법 1: 타임아웃을 주고 DOM에서 직접 찾기
        window.vworld.init(
          mapId.current,
          "map-first",
          function(this: any) {
            console.log('V-world 콜백 함수 실행됨')
            console.log('this:', this)
            console.log('arguments:', arguments)
            console.log('arguments.length:', arguments.length)
            
            // arguments 배열의 각 요소 확인
            for (let i = 0; i < arguments.length; i++) {
              console.log(`argument[${i}]:`, arguments[i])
            }
            
            if (!isComponentMounted) return

            // 방법 1: this 대신 전역 변수 window.apiMap 사용
            setTimeout(() => {
              if (window.apiMap) {
                console.log('window.apiMap에서 지도 객체 발견:', window.apiMap)
                apiMap = window.apiMap
              }
              
              // 방법 2: DOM에서 직접 찾기
              if (!apiMap) {
                const mapElement = document.getElementById(mapId.current)
                if (mapElement && (mapElement as any)._vworldMap) {
                  console.log('DOM에서 지도 객체 발견')
                  apiMap = (mapElement as any)._vworldMap
                }
              }
              
              // 방법 3: vworld 객체의 다른 속성들 확인
              if (!apiMap && window.vworld.maps) {
                console.log('vworld.maps에서 찾기:', window.vworld.maps)
                apiMap = window.vworld.maps[mapId.current]
              }
              
              if (apiMap) {
                console.log('지도 객체 찾기 성공:', apiMap)
                
                try {
                  // 기본 설정
                  apiMap.setBaseLayer(apiMap.vworldBaseMap)
                  apiMap.setControlsType({"simpleMap": true})
                  apiMap.addVWORLDControl("zoomBar")
                  
                  // 중심점과 줌 설정
                  apiMap.setCenterAndZoom(centerX, centerY, zoomLevel)
                  
                  if (isComponentMounted) {
                    setMap(apiMap)
                    setIsMapLoaded(true)
                    console.log('지도 설정 완료')
                  }
                } catch (setupError) {
                  console.error('지도 설정 오류:', setupError)
                }
              } else {
                console.error('모든 방법으로 지도 객체를 찾을 수 없음')
                console.log('window.vworld 전체 객체:', window.vworld)
                console.log('vworld 객체의 모든 키:', Object.keys(window.vworld))
                console.log('vworld.maps:', window.vworld.maps)
                console.log('전역 window.apiMap:', window.apiMap)
                
                // V-world 내부 객체 더 자세히 탐색
                for (const key in window.vworld) {
                  if (window.vworld[key] && typeof window.vworld[key] === 'object') {
                    console.log(`vworld.${key}:`, window.vworld[key])
                  }
                }
                
                // DOM 요소의 모든 속성 확인
                const mapElement = document.getElementById(mapId.current)
                if (mapElement) {
                  console.log('DOM 요소의 모든 속성:', Object.getOwnPropertyNames(mapElement))
                  for (const prop of Object.getOwnPropertyNames(mapElement)) {
                    if (prop.includes('map') || prop.includes('vworld')) {
                      console.log(`DOM.${prop}:`, (mapElement as any)[prop])
                    }
                  }
                }
              }
            }, 100)
          },
          function(obj: any) {
            console.log('V-world 3D 지도 초기화 성공')
            SOPPlugin = obj
          },
          function(msg: any) {
            console.error('V-world 3D 지도 초기화 실패:', msg)
          }
        )
        
      } catch (error) {
        console.error('V-world 지도 초기화 오류:', error)
      }
    }

    // 초기화 시작
    initializeVworldMap()

    return () => {
      isComponentMounted = false
      
      if (initTimeout) {
        clearTimeout(initTimeout)
      }
      
      // 마커 제거
      if (markers.length > 0) {
        markers.forEach(marker => {
          try {
            if (marker && typeof marker.remove === 'function') {
              marker.remove()
            }
          } catch (error) {
            console.error('마커 제거 오류:', error)
          }
        })
      }
    }
  }, [])

  // 마커 표시
  useEffect(() => {
    if (!map || !projects.length) return

    console.log('마커 표시 시작, 프로젝트 수:', projects.length)

    // 기존 마커 제거
    try {
      if (map.clearOverlays) {
        map.clearOverlays()
      }
    } catch (error) {
      console.error('기존 마커 제거 오류:', error)
    }

    const newMarkers: any[] = []

    projects.forEach((project, index) => {
      try {
        console.log(`마커 생성 시도 ${index + 1}:`, project.name, project.lat, project.lng)
        
        // WGS84 좌표를 V-world 좌표계로 변환
        const x = project.lng * 20037508.34 / 180
        const y = Math.log(Math.tan((90 + project.lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180

        // V-world 마커 생성 (간단한 방식)
        const markerOptions = {
          position: {x: x, y: y},
          title: project.name,
          content: `
            <div style="padding: 8px; background: white; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
              <strong>${project.name}</strong><br/>
              <small>${project.managingHq} - ${project.managingBranch}</small>
            </div>
          `
        }

        // 포인트 마커 추가
        const pointMarker = map.addOverlay(
          "POINT",
          [x, y],
          {
            strokeColor: "#FF0000",
            strokeWeight: 3,
            fillColor: "#FF0000",
            fillOpacity: 0.8,
            radius: 10
          }
        )

        // 클릭 이벤트 추가
        if (pointMarker) {
          try {
            map.addListener('click', function(e: any) {
              // 클릭 위치와 마커 위치 비교하여 클릭 판정
              const clickX = e.coordinate.x
              const clickY = e.coordinate.y
              const distance = Math.sqrt(Math.pow(clickX - x, 2) + Math.pow(clickY - y, 2))
              
              if (distance < 50000) { // 50km 반경 내 클릭 시 (픽셀 단위로 조정 필요)
                console.log('마커 클릭:', project.name)
                if (onProjectClick) {
                  onProjectClick(project)
                }
              }
            })

            newMarkers.push(pointMarker)
            console.log(`마커 추가 완료: ${project.name}`)
          } catch (eventError) {
            console.error('마커 이벤트 추가 오류:', eventError)
          }
        }

      } catch (error) {
        console.error(`마커 생성 오류 - ${project.name}:`, error)
      }
    })

    setMarkers(newMarkers)
    console.log('총 생성된 마커 수:', newMarkers.length)

  }, [map, projects, onProjectClick])

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={mapRef} 
        style={{ width: '100%', height }}
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
      
      {/* 프로젝트 정보 패널 */}
      {projects.length > 0 && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs">
          <div className="flex items-center mb-2">
            <Building2 className="h-5 w-5 text-blue-600 mr-2" />
            <span className="font-semibold text-gray-900">프로젝트 현황</span>
          </div>
          <div className="text-sm text-gray-600">
            총 <span className="font-semibold text-blue-600">{projects.length}개</span> 프로젝트
          </div>
          <div className="mt-2 text-xs text-gray-500">
            마커를 클릭하면 상세 정보를 확인할 수 있습니다.
          </div>
        </div>
      )}
    </div>
  )
}

export default VworldMap 