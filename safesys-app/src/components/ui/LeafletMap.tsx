'use client'

import React, { useEffect, useState } from 'react'
import { MapPin, Building2 } from 'lucide-react'

interface ProjectMarker {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  managingHq: string
  managingBranch: string
}

interface LeafletMapProps {
  projects: ProjectMarker[]
  onProjectClick?: (project: ProjectMarker) => void
  height?: string
  className?: string
}

const LeafletMap: React.FC<LeafletMapProps> = ({
  projects,
  onProjectClick,
  height = '500px',
  className = ''
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [map, setMap] = useState<any>(null)

  useEffect(() => {
    // 동적으로 Leaflet 로드
    const loadLeaflet = async () => {
      try {
        // CSS 로드
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }

        // Leaflet JS 로드
        const L = await import('leaflet')
        
        // 기본 아이콘 설정 (Webpack 이슈 해결)
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        })

        setIsLoaded(true)
        
        // 지도 초기화
        const mapContainer = document.getElementById('leaflet-map')
        if (mapContainer && !map) {
          // 기본 중심점 (서울)
          const defaultCenter: [number, number] = [37.5665, 126.9780]
          const center: [number, number] = projects.length > 0 
            ? [projects[0].lat, projects[0].lng] 
            : defaultCenter

          const leafletMap = L.map(mapContainer).setView(center, projects.length > 0 ? 10 : 7)

          // OpenStreetMap 타일 레이어 추가
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(leafletMap)

          setMap(leafletMap)
          console.log('Leaflet 지도 초기화 완료')
        }
      } catch (error) {
        console.error('Leaflet 로드 오류:', error)
      }
    }

    loadLeaflet()

    return () => {
      // 컴포넌트 언마운트 시 지도 정리
      if (map) {
        map.remove()
        setMap(null)
      }
    }
  }, [])

  // 마커 추가
  useEffect(() => {
    if (!map || !isLoaded || !projects.length) return

    console.log('마커 추가 시작, 프로젝트 수:', projects.length)

    // 기존 마커 제거 (레이어 그룹 사용)
    map.eachLayer((layer: any) => {
      if (layer.options && layer.options.isProjectMarker) {
        map.removeLayer(layer)
      }
    })

    // 새 마커 추가
    projects.forEach((project, index) => {
      try {
        const L = require('leaflet')
        
        // 커스텀 아이콘 생성
        const customIcon = L.divIcon({
          html: `
            <div style="
              background-color: #3B82F6;
              width: 30px;
              height: 30px;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 14px;
            ">
              ${index + 1}
            </div>
          `,
          className: 'custom-project-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })

        const marker = L.marker([project.lat, project.lng], { 
          icon: customIcon,
          isProjectMarker: true 
        }).addTo(map)

        // 팝업 추가
        marker.bindPopup(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">
              ${project.name}
            </h3>
            <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;">
              📍 ${project.address}
            </p>
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #888;">
              ${project.managingHq} ${project.managingBranch}
            </p>
            <button 
              onclick="window.handleProjectClick('${project.id}')"
              style="
                background: #3B82F6;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
              "
            >
              프로젝트 보기
            </button>
          </div>
        `)

        console.log(`마커 추가 완료: ${project.name}`)
      } catch (error) {
        console.error(`마커 생성 오류 - ${project.name}:`, error)
      }
    })

    // 모든 마커가 보이도록 지도 범위 조정
    if (projects.length > 1) {
      try {
        const L = require('leaflet')
        const group = new L.featureGroup(
          projects.map(project => L.marker([project.lat, project.lng]))
        )
        map.fitBounds(group.getBounds().pad(0.1))
        console.log('지도 범위 조정 완료')
      } catch (error) {
        console.error('지도 범위 조정 오류:', error)
      }
    }

    // 전역 클릭 핸들러 설정
    (window as any).handleProjectClick = (projectId: string) => {
      const project = projects.find(p => p.id === projectId)
      if (project && onProjectClick) {
        onProjectClick(project)
      }
    }

  }, [map, isLoaded, projects, onProjectClick])

  return (
    <div className={`relative ${className}`}>
      <div 
        id="leaflet-map"
        style={{ width: '100%', height }}
        className="rounded-lg border border-gray-300 bg-gray-100"
      >
        {!isLoaded && (
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

export default LeafletMap 