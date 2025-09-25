'use client'

import React from 'react'
import KakaoMap, { ProjectMarker } from '@/components/ui/KakaoMap'

interface MapProject {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  managingHq?: string
  managingBranch?: string
  highlightRed?: boolean
}

interface ClientMapViewProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  heightPx: number
  projects: MapProject[]
  onProjectClick: (project: any) => void
}

const ClientMapView: React.FC<ClientMapViewProps> = ({ containerRef, heightPx, projects, onProjectClick }) => {
  const markerProjects: ProjectMarker[] = React.useMemo(() => (
    (projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address ?? '',
      lat: p.lat,
      lng: p.lng,
      managingHq: p.managingHq ?? '',
      managingBranch: p.managingBranch ?? '',
      highlightRed: p.highlightRed,
    }))
  ), [projects])

  return (
    <div ref={containerRef} className="bg-white/90 backdrop-blur rounded-lg shadow-sm border border-white/20 overflow-hidden">
      <KakaoMap
        projects={markerProjects}
        onProjectClick={onProjectClick}
        height={`${heightPx}px`}
        className="w-full"
      />
    </div>
  )
}

export default ClientMapView


