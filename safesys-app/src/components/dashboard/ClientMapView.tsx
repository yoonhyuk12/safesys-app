'use client'

import React from 'react'
import SimpleProjectMap, { SimpleProjectMarker } from '@/components/ui/SimpleProjectMap'
import type { TBMRecord } from '@/lib/tbm'

interface MapProject {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  managingHq?: string
  managingBranch?: string
  highlightRed?: boolean
  is_active?: boolean | { [key: string]: boolean } // 공사중 여부
}

interface InspectionData {
  headquartersInspections?: Array<{ project_id: string; inspection_date: string }>
  managerInspections?: Array<{ project_id: string; inspection_date: string }>
}

interface ClientMapViewProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  heightPx: number
  projects: MapProject[]
  offices?: any[]
  inspections?: InspectionData
  tbmRecords?: TBMRecord[]
  tbmLoading?: boolean
  onLoadTBM?: () => Promise<void>
  onProjectClick: (project: any) => void
}

const ClientMapView: React.FC<ClientMapViewProps> = ({ containerRef, heightPx, projects, offices = [], inspections, tbmRecords = [], tbmLoading = false, onLoadTBM, onProjectClick }) => {
  const markerProjects: SimpleProjectMarker[] = React.useMemo(() => (
    (projects || []).map((p) => {
      return {
        id: p.id,
        name: p.name,
        address: p.address ?? '',
        lat: p.lat,
        lng: p.lng,
        managingHq: p.managingHq ?? '',
        managingBranch: p.managingBranch ?? '',
        isActive: p.is_active || false  // JSONB 객체 또는 boolean 그대로 전달
      }
    })
  ), [projects])

  return (
    <div ref={containerRef} className="bg-white/90 backdrop-blur rounded-lg shadow-sm border border-white/20">
      <SimpleProjectMap
        projects={markerProjects}
        offices={offices}
        inspections={inspections}
        tbmRecords={tbmRecords}
        tbmLoading={tbmLoading}
        onLoadTBM={onLoadTBM}
        onProjectClick={onProjectClick}
        height={`${heightPx}px`}
        className="w-full"
      />
    </div>
  )
}

export default ClientMapView


