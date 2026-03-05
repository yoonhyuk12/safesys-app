'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { ArrowLeft, ClipboardCheck, Building, FileSpreadsheet, Loader2, FileText, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, SafetyInspectionCountByProject } from '@/lib/projects'
import { getSafetyInspectionDetailsForExcel, getSafetyInspectionPhotosForHwpx } from '@/lib/projects'
import { downloadSafetyInspectionLedgerExcel } from '@/lib/excel/safety-inspection-ledger-export'
import { downloadPanoramaHwpx } from '@/lib/hwpx/safety-inspection-panorama-export'
import { downloadDefectPhotoHwpx } from '@/lib/hwpx/safety-inspection-defect-photo-export'
import { useAuth } from '@/contexts/AuthContext'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

interface SafetyInspectionLedgerViewProps {
  loading: boolean
  projects: Project[]
  inspectionCounts: SafetyInspectionCountByProject[]
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  selectedYear: number
  onBack: () => void
  onSelectSafetyHq: (hq: string) => void
  onSelectSafetyBranch: (branch: string) => void
  onRowClickProject: (projectId: string) => void
  onYearChange: (year: number) => void
}

const isCompleted = (project: Project): boolean => {
  if (project.is_active === undefined || project.is_active === null) return false
  if (typeof project.is_active === 'boolean') return !project.is_active
  if (typeof project.is_active === 'object') return project.is_active.completed === true
  return false
}

interface AggStats {
  projectCount: number
  inspectionCount: number
  thawingCount: number
  thawingUnresolved: number
  thawingUnsigned: number
  rainyCount: number
  rainyUnresolved: number
  rainyUnsigned: number
  comprehensiveCount: number
  comprehensiveUnresolved: number
  comprehensiveUnsigned: number
  specialCount: number
  specialUnresolved: number
  specialUnsigned: number
}

const emptyStats = (): AggStats => ({
  projectCount: 0, inspectionCount: 0,
  thawingCount: 0, thawingUnresolved: 0, thawingUnsigned: 0,
  rainyCount: 0, rainyUnresolved: 0, rainyUnsigned: 0,
  comprehensiveCount: 0, comprehensiveUnresolved: 0, comprehensiveUnsigned: 0,
  specialCount: 0, specialUnresolved: 0, specialUnsigned: 0
})

const SafetyInspectionLedgerView: React.FC<SafetyInspectionLedgerViewProps> = ({
  loading,
  projects,
  inspectionCounts,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  selectedYear,
  onBack,
  onSelectSafetyHq,
  onSelectSafetyBranch,
  onRowClickProject,
  onYearChange,
}) => {
  const [viewLevel, setViewLevel] = useState<'hq' | 'branch' | 'project'>(() => {
    if (selectedSafetyBranch) return 'project'
    if (selectedSafetyHq) return 'branch'
    return 'hq'
  })
  const { userProfile } = useAuth()
  const [selectedHqForDetail, setSelectedHqForDetail] = useState<string | null>(selectedSafetyHq)
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(selectedSafetyBranch)
  const [excelLoading, setExcelLoading] = useState(false)
  const [panoramaLoading, setPanoramaLoading] = useState(false)
  const [defectPhotoLoading, setDefectPhotoLoading] = useState(false)
  const [activeMenu, setActiveMenu] = useState<{ level: 'hq' | 'branch' | 'project', type: 'panorama' | 'defect' | 'excel' } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!activeMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activeMenu])

  const INSPECTION_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    { value: '해빙기', label: '해빙기' },
    { value: '우기', label: '우기' },
    { value: '종합', label: '종합' },
    { value: '특별', label: '특별' },
  ]

  const HwpIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <text x="8" y="10.5" textAnchor="middle" fontSize="5.5" fontWeight="bold" fill="currentColor" fontFamily="Arial">한</text>
    </svg>
  )

  const renderTypeSelectionMenu = (level: 'hq' | 'branch' | 'project', type: 'panorama' | 'defect' | 'excel') => {
    if (activeMenu?.level !== level || activeMenu?.type !== type) return null

    const onSelect = (val: string) => {
      if (type === 'panorama') handlePanoramaHwpDownload(level, val || undefined)
      else if (type === 'defect') handleDefectPhotoHwpxDownload(level, val || undefined)
      else if (type === 'excel') handleExcelDownload(level, val || undefined)
      setActiveMenu(null)
    }

    return (
      <div
        ref={menuRef}
        className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[120px] z-50 animate-in fade-in slide-in-from-top-1 duration-200"
      >
        <div className="px-3 py-1.5 text-[10px] font-bold text-teal-600 border-b border-gray-50 mb-1 uppercase tracking-wider">점검유형 선택</div>
        {INSPECTION_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={(e) => { e.stopPropagation(); onSelect(opt.value) }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 hover:text-teal-700 transition-colors text-gray-700 flex items-center justify-between group"
          >
            <span>{opt.label}</span>
            <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    )
  }

  const handlePanoramaHwpDownload = async (level: 'hq' | 'branch' | 'project', inspectionType?: string) => {
    if (!userProfile || panoramaLoading) return
    setPanoramaLoading(true)
    try {
      const hqFilter = level === 'hq' ? undefined : selectedHqForDetail || undefined
      const branchFilter = level === 'project' ? selectedBranchForDetail || undefined : undefined

      const result = await getSafetyInspectionPhotosForHwpx(userProfile, hqFilter, branchFilter, inspectionType)
      if (!result.success || !result.data || result.data.length === 0) {
        alert(result.error || '다운로드할 전경사진 데이터가 없습니다.')
        return
      }

      let filename: string
      if (level === 'project' && selectedBranchForDetail) {
        filename = `전경사진_${selectedBranchForDetail}.hwpx`
      } else if (level === 'branch' && selectedHqForDetail) {
        filename = `전경사진_${selectedHqForDetail}.hwpx`
      } else {
        filename = '전경사진_전체.hwpx'
      }

      await downloadPanoramaHwpx(result.data, filename)
    } catch (err) {
      console.error('전경사진 HWPX 다운로드 실패:', err)
      alert('한글 문서 다운로드 중 오류가 발생했습니다.')
    } finally {
      setPanoramaLoading(false)
    }
  }

  const handleDefectPhotoHwpxDownload = async (level: 'hq' | 'branch' | 'project', inspectionType?: string) => {
    try {
      if (!userProfile) return
      setDefectPhotoLoading(true)

      const hqFilter = level === 'hq' ? undefined : selectedHqForDetail || undefined
      const branchFilter = level === 'project' ? selectedBranchForDetail || undefined : undefined

      const result = await getSafetyInspectionDetailsForExcel(userProfile, hqFilter, branchFilter, inspectionType)
      if (!result.success || !result.data || result.data.length === 0) {
        alert(result.error || '다운로드할 지적사항 데이터가 없습니다.')
        return
      }

      let filename: string
      if (level === 'project' && selectedBranchForDetail) {
        filename = `지적사항사진_${selectedBranchForDetail}.hwpx`
      } else if (level === 'branch' && selectedHqForDetail) {
        filename = `지적사항사진_${selectedHqForDetail}.hwpx`
      } else {
        filename = '지적사항사진_전체.hwpx'
      }

      await downloadDefectPhotoHwpx(result.data, filename)
    } catch (err) {
      console.error('지적사항 사진 HWPX 다운로드 실패:', err)
      alert('한글 문서 다운로드 중 오류가 발생했습니다.')
    } finally {
      setDefectPhotoLoading(false)
    }
  }

  const activeProjects = useMemo(() => projects.filter(p => !isCompleted(p)), [projects])

  const inspectionStatsMap = useMemo(() => {
    const map = new Map<string, any>()
    inspectionCounts.forEach(ic => map.set(ic.project_id, ic))
    return map
  }, [inspectionCounts])

  const totalStats = useMemo(() => {
    const s = emptyStats()
    inspectionCounts.forEach(ic => {
      s.inspectionCount += ic.inspection_count
      s.thawingCount += ic.thawing_count
      s.thawingUnresolved += ic.thawing_unresolved || 0
      s.thawingUnsigned += ic.thawing_unsigned || 0
      s.rainyCount += ic.rainy_count
      s.rainyUnresolved += ic.rainy_unresolved || 0
      s.rainyUnsigned += ic.rainy_unsigned || 0
      s.comprehensiveCount += ic.comprehensive_count
      s.comprehensiveUnresolved += ic.comprehensive_unresolved || 0
      s.comprehensiveUnsigned += ic.comprehensive_unsigned || 0
      s.specialCount += ic.special_count
      s.specialUnresolved += ic.special_unresolved || 0
      s.specialUnsigned += ic.special_unsigned || 0
    })
    return s
  }, [inspectionCounts])

  const hqStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    HEADQUARTERS_OPTIONS.forEach(hq => stats.set(hq, emptyStats()))
    activeProjects.forEach(p => {
      const hq = p.managing_hq || '미지정'
      const existing = stats.get(hq) || emptyStats()
      const is = inspectionStatsMap.get(p.id)
      existing.projectCount += 1
      existing.inspectionCount += is?.inspection_count || 0
      existing.thawingCount += is?.thawing_count || 0
      existing.thawingUnresolved += is?.thawing_unresolved || 0
      existing.thawingUnsigned += is?.thawing_unsigned || 0
      existing.rainyCount += is?.rainy_count || 0
      existing.rainyUnresolved += is?.rainy_unresolved || 0
      existing.rainyUnsigned += is?.rainy_unsigned || 0
      existing.comprehensiveCount += is?.comprehensive_count || 0
      existing.comprehensiveUnresolved += is?.comprehensive_unresolved || 0
      existing.comprehensiveUnsigned += is?.comprehensive_unsigned || 0
      existing.specialCount += is?.special_count || 0
      existing.specialUnresolved += is?.special_unresolved || 0
      existing.specialUnsigned += is?.special_unsigned || 0
      stats.set(hq, existing)
    })
    return stats
  }, [activeProjects, inspectionStatsMap])

  const branchStats = useMemo(() => {
    if (!selectedHqForDetail) return new Map<string, AggStats>()
    const stats = new Map<string, AggStats>()
    const branches = BRANCH_OPTIONS[selectedHqForDetail] || []
    branches.forEach(branch => stats.set(branch, emptyStats()))
    activeProjects
      .filter(p => p.managing_hq === selectedHqForDetail)
      .forEach(p => {
        const branch = p.managing_branch || '미지정'
        const existing = stats.get(branch) || emptyStats()
        const is = inspectionStatsMap.get(p.id)
        existing.projectCount += 1
        existing.inspectionCount += is?.inspection_count || 0
        existing.thawingCount += is?.thawing_count || 0
        existing.thawingUnresolved += is?.thawing_unresolved || 0
        existing.thawingUnsigned += is?.thawing_unsigned || 0
        existing.rainyCount += is?.rainy_count || 0
        existing.rainyUnresolved += is?.rainy_unresolved || 0
        existing.rainyUnsigned += is?.rainy_unsigned || 0
        existing.comprehensiveCount += is?.comprehensive_count || 0
        existing.comprehensiveUnresolved += is?.comprehensive_unresolved || 0
        existing.comprehensiveUnsigned += is?.comprehensive_unsigned || 0
        existing.specialCount += is?.special_count || 0
        existing.specialUnresolved += is?.special_unresolved || 0
        existing.specialUnsigned += is?.special_unsigned || 0
        stats.set(branch, existing)
      })
    return stats
  }, [activeProjects, inspectionStatsMap, selectedHqForDetail])

  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    return activeProjects
      .filter(p => p.managing_branch === selectedBranchForDetail)
      .map(p => {
        const is = inspectionStatsMap.get(p.id)
        return {
          project_id: p.id,
          project_name: p.project_name,
          inspection_count: is?.inspection_count || 0,
          thawing_count: is?.thawing_count || 0,
          thawing_unresolved: is?.thawing_unresolved || 0,
          thawing_unsigned: is?.thawing_unsigned || 0,
          rainy_count: is?.rainy_count || 0,
          rainy_unresolved: is?.rainy_unresolved || 0,
          rainy_unsigned: is?.rainy_unsigned || 0,
          comprehensive_count: is?.comprehensive_count || 0,
          comprehensive_unresolved: is?.comprehensive_unresolved || 0,
          comprehensive_unsigned: is?.comprehensive_unsigned || 0,
          special_count: is?.special_count || 0,
          special_unresolved: is?.special_unresolved || 0,
          special_unsigned: is?.special_unsigned || 0,
        }
      })
      .sort((a, b) => b.inspection_count - a.inspection_count)
  }, [activeProjects, inspectionStatsMap, selectedBranchForDetail])

  const handleExcelDownload = async (level: 'hq' | 'branch' | 'project', inspectionType?: string) => {
    if (!userProfile || excelLoading) return
    setExcelLoading(true)
    try {
      const hqFilter = level === 'hq' ? undefined : selectedHqForDetail || undefined
      const branchFilter = level === 'project' ? selectedBranchForDetail || undefined : undefined

      const result = await getSafetyInspectionDetailsForExcel(userProfile, hqFilter, branchFilter, inspectionType)
      if (!result.success || !result.data || result.data.length === 0) {
        alert(result.error || '다운로드할 점검 데이터가 없습니다.')
        return
      }

      let filename: string
      if (level === 'project' && selectedBranchForDetail) {
        filename = `정기안전점검현황_${selectedBranchForDetail}.xlsx`
      } else if (level === 'branch' && selectedHqForDetail) {
        filename = `정기안전점검현황_${selectedHqForDetail}.xlsx`
      } else {
        filename = `정기안전점검현황_전체.xlsx`
      }

      downloadSafetyInspectionLedgerExcel(result.data, filename)
    } catch (err) {
      console.error('엑셀 다운로드 실패:', err)
      alert('엑셀 다운로드 중 오류가 발생했습니다.')
    } finally {
      setExcelLoading(false)
    }
  }

  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranchForDetail(null)
    } else if (viewLevel === 'branch') {
      setViewLevel('hq')
      setSelectedHqForDetail(null)
    } else {
      onBack()
    }
  }

  const handleHqClick = (hq: string) => {
    setSelectedHqForDetail(hq)
    setViewLevel('branch')
    onSelectSafetyHq(hq)
  }

  const handleBranchClick = (branch: string) => {
    setSelectedBranchForDetail(branch)
    setViewLevel('project')
    onSelectSafetyBranch(branch)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  const renderTableHeader = (firstColName: string, showProjectCount = true) => (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th rowSpan={2} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider align-middle border-r border-gray-200">{firstColName}</th>
        {showProjectCount && (
          <th rowSpan={2} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider align-middle border-r border-gray-200">프로젝트수</th>
        )}
        <th rowSpan={2} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider align-middle border-r-2 border-gray-300">총 점검</th>
        <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">해빙기</th>
        <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">우기</th>
        <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">종합</th>
        <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200">특별</th>
      </tr>
      <tr>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-sky-700 bg-sky-50/50">점검</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-red-700 bg-red-50/50">미조치</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-amber-700 bg-amber-50/50 border-r-2 border-gray-300">미서명</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-sky-700 bg-sky-50/50">점검</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-red-700 bg-red-50/50">미조치</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-amber-700 bg-amber-50/50 border-r-2 border-gray-300">미서명</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-sky-700 bg-sky-50/50">점검</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-red-700 bg-red-50/50">미조치</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-amber-700 bg-amber-50/50 border-r-2 border-gray-300">미서명</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-sky-700 bg-sky-50/50">점검</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-red-700 bg-red-50/50">미조치</th>
        <th className="px-2 py-2 text-center text-[11px] font-medium text-amber-700 bg-amber-50/50">미서명</th>
      </tr>
    </thead>
  )

  const renderSubtotalRow = (subtotal: AggStats, showProjectCount = true) => (
    <tr className="bg-teal-50/70 font-semibold border-b-2 border-teal-200">
      <td className="px-3 py-2 text-sm text-center text-teal-800 border-r border-teal-100">소계</td>
      {showProjectCount && (
        <td className="px-3 py-2 text-sm text-center text-teal-800 border-r border-teal-100">{subtotal.projectCount}개</td>
      )}
      <td className="px-3 py-2 text-sm text-center text-teal-800 border-r-2 border-teal-200">{subtotal.inspectionCount > 0 ? `${subtotal.inspectionCount.toLocaleString()}건` : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.thawingCount > 0 ? subtotal.thawingCount : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-red-600 bg-red-50/30">{subtotal.thawingUnresolved > 0 ? subtotal.thawingUnresolved : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-amber-600 bg-amber-50/30 border-r-2 border-teal-200">{subtotal.thawingUnsigned > 0 ? subtotal.thawingUnsigned : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.rainyCount > 0 ? subtotal.rainyCount : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-red-600 bg-red-50/30">{subtotal.rainyUnresolved > 0 ? subtotal.rainyUnresolved : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-amber-600 bg-amber-50/30 border-r-2 border-teal-200">{subtotal.rainyUnsigned > 0 ? subtotal.rainyUnsigned : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.comprehensiveCount > 0 ? subtotal.comprehensiveCount : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-red-600 bg-red-50/30">{subtotal.comprehensiveUnresolved > 0 ? subtotal.comprehensiveUnresolved : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-amber-600 bg-amber-50/30 border-r-2 border-teal-200">{subtotal.comprehensiveUnsigned > 0 ? subtotal.comprehensiveUnsigned : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.specialCount > 0 ? subtotal.specialCount : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-red-600 bg-red-50/30">{subtotal.specialUnresolved > 0 ? subtotal.specialUnresolved : '-'}</td>
      <td className="px-2 py-2 text-sm text-center text-amber-600 bg-amber-50/30">{subtotal.specialUnsigned > 0 ? subtotal.specialUnsigned : '-'}</td>
    </tr>
  )

  const renderStatsCells = (stats: AggStats, showProjectCount = true) => (
    <>
      {showProjectCount && (
        <td className="px-3 py-3 text-sm text-center border-r border-gray-100">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{stats.projectCount}개</span>
        </td>
      )}
      <td className="px-3 py-3 text-sm text-center border-r-2 border-gray-300">
        {stats.inspectionCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-teal-700">{stats.inspectionCount.toLocaleString()}건</span>
        ) : <span className="text-gray-300">-</span>}
      </td>
      <td className="px-2 py-3 text-sm text-center">{stats.thawingCount > 0 ? <span className="text-gray-900 font-medium">{stats.thawingCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.thawingUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.thawingUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center border-r-2 border-gray-300">{stats.thawingUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.thawingUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.rainyCount > 0 ? <span className="text-gray-900 font-medium">{stats.rainyCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.rainyUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.rainyUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center border-r-2 border-gray-300">{stats.rainyUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.rainyUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.comprehensiveCount > 0 ? <span className="text-gray-900 font-medium">{stats.comprehensiveCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.comprehensiveUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.comprehensiveUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center border-r-2 border-gray-300">{stats.comprehensiveUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.comprehensiveUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.specialCount > 0 ? <span className="text-gray-900 font-medium">{stats.specialCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.specialUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.specialUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-2 py-3 text-sm text-center">{stats.specialUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.specialUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            정기안전점검 현황
            {viewLevel === 'branch' && selectedHqForDetail && (
              <span className="text-sm font-normal text-gray-500 ml-2">- {selectedHqForDetail}</span>
            )}
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-500 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {selectedYear}년 총 {totalStats.inspectionCount.toLocaleString()}건 점검
        </div>
      </div>

      {/* 본부별 테이블 */}
      {viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-teal-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-medium text-teal-800">본부별 정기안전점검 현황</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'hq' && activeMenu?.type === 'panorama' ? null : { level: 'hq', type: 'panorama' }) }}
                    className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="전경사진 한글 다운로드"
                    disabled={panoramaLoading}
                  >
                    {panoramaLoading ? <Loader2 className="h-4 w-4 text-blue-600 animate-spin" /> : <HwpIcon className="h-4 w-4 text-blue-600" />}
                  </button>
                  {renderTypeSelectionMenu('hq', 'panorama')}
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'hq' && activeMenu?.type === 'defect' ? null : { level: 'hq', type: 'defect' }) }}
                    className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="지적사항 사진 한글 다운로드"
                    disabled={defectPhotoLoading}
                  >
                    {defectPhotoLoading ? <Loader2 className="h-4 w-4 text-sky-600 animate-spin" /> : <HwpIcon className="h-4 w-4 text-sky-600" />}
                  </button>
                  {renderTypeSelectionMenu('hq', 'defect')}
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'hq' && activeMenu?.type === 'excel' ? null : { level: 'hq', type: 'excel' }) }}
                    className="p-1 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
                    title="엑셀 다운로드"
                    disabled={excelLoading}
                  >
                    {excelLoading ? <Loader2 className="h-4 w-4 text-green-600 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
                  </button>
                  {renderTypeSelectionMenu('hq', 'excel')}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onYearChange(selectedYear - 1) }}
                    className="p-0.5 hover:bg-teal-100 rounded transition-colors"
                    title="이전 연도"
                  >
                    <ChevronLeft className="h-4 w-4 text-teal-600" />
                  </button>
                  <span className="text-sm text-teal-600 font-semibold min-w-[50px] text-center">{selectedYear}년</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onYearChange(selectedYear + 1) }}
                    className="p-0.5 hover:bg-teal-100 rounded transition-colors"
                    title="다음 연도"
                  >
                    <ChevronRight className="h-4 w-4 text-teal-600" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHeader('본부명')}
              <tbody className="divide-y divide-gray-200">
                {renderSubtotalRow((() => {
                  const s = emptyStats()
                  Array.from(hqStats.values()).forEach(v => {
                    s.projectCount += v.projectCount; s.inspectionCount += v.inspectionCount;
                    s.thawingCount += v.thawingCount; s.thawingUnresolved += v.thawingUnresolved; s.thawingUnsigned += v.thawingUnsigned;
                    s.rainyCount += v.rainyCount; s.rainyUnresolved += v.rainyUnresolved; s.rainyUnsigned += v.rainyUnsigned;
                    s.comprehensiveCount += v.comprehensiveCount; s.comprehensiveUnresolved += v.comprehensiveUnresolved; s.comprehensiveUnsigned += v.comprehensiveUnsigned;
                    s.specialCount += v.specialCount; s.specialUnresolved += v.specialUnresolved; s.specialUnsigned += v.specialUnsigned;
                  })
                  return s
                })())}
                {Array.from(hqStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .map(([hq, stats]) => (
                    <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-teal-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{hq}</td>
                      {renderStatsCells(stats)}
                    </tr>
                  ))}
                {Array.from(hqStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지사별 테이블 */}
      {viewLevel === 'branch' && selectedHqForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-teal-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-medium text-teal-800">{selectedHqForDetail} - 지사별 정기안전점검 현황</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'branch' && activeMenu?.type === 'panorama' ? null : { level: 'branch', type: 'panorama' }) }}
                    className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="전경사진 한글 다운로드"
                    disabled={panoramaLoading}
                  >
                    {panoramaLoading ? <Loader2 className="h-4 w-4 text-blue-600 animate-spin" /> : <HwpIcon className="h-4 w-4 text-blue-600" />}
                  </button>
                  {renderTypeSelectionMenu('branch', 'panorama')}
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'branch' && activeMenu?.type === 'defect' ? null : { level: 'branch', type: 'defect' }) }}
                    className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="지적사항 사진 한글 다운로드"
                    disabled={defectPhotoLoading}
                  >
                    {defectPhotoLoading ? <Loader2 className="h-4 w-4 text-sky-600 animate-spin" /> : <HwpIcon className="h-4 w-4 text-sky-600" />}
                  </button>
                  {renderTypeSelectionMenu('branch', 'defect')}
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'branch' && activeMenu?.type === 'excel' ? null : { level: 'branch', type: 'excel' }) }}
                    className="p-1 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
                    title="엑셀 다운로드"
                    disabled={excelLoading}
                  >
                    {excelLoading ? <Loader2 className="h-4 w-4 text-green-600 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
                  </button>
                  {renderTypeSelectionMenu('branch', 'excel')}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onYearChange(selectedYear - 1) }}
                    className="p-0.5 hover:bg-teal-100 rounded transition-colors"
                    title="이전 연도"
                  >
                    <ChevronLeft className="h-4 w-4 text-teal-600" />
                  </button>
                  <span className="text-sm text-teal-600 font-semibold min-w-[50px] text-center">{selectedYear}년</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onYearChange(selectedYear + 1) }}
                    className="p-0.5 hover:bg-teal-100 rounded transition-colors"
                    title="다음 연도"
                  >
                    <ChevronRight className="h-4 w-4 text-teal-600" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHeader('지사명')}
              <tbody className="divide-y divide-gray-200">
                {renderSubtotalRow(Array.from(branchStats.values()).reduce((acc, curr) => ({
                  projectCount: acc.projectCount + curr.projectCount,
                  inspectionCount: acc.inspectionCount + curr.inspectionCount,
                  thawingCount: acc.thawingCount + curr.thawingCount,
                  thawingUnresolved: acc.thawingUnresolved + curr.thawingUnresolved,
                  thawingUnsigned: acc.thawingUnsigned + curr.thawingUnsigned,
                  rainyCount: acc.rainyCount + curr.rainyCount,
                  rainyUnresolved: acc.rainyUnresolved + curr.rainyUnresolved,
                  rainyUnsigned: acc.rainyUnsigned + curr.rainyUnsigned,
                  comprehensiveCount: acc.comprehensiveCount + curr.comprehensiveCount,
                  comprehensiveUnresolved: acc.comprehensiveUnresolved + curr.comprehensiveUnresolved,
                  comprehensiveUnsigned: acc.comprehensiveUnsigned + curr.comprehensiveUnsigned,
                  specialCount: acc.specialCount + curr.specialCount,
                  specialUnresolved: acc.specialUnresolved + curr.specialUnresolved,
                  specialUnsigned: acc.specialUnsigned + curr.specialUnsigned
                }), emptyStats()))}
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-teal-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                    {renderStatsCells(stats)}
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 지사 데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 프로젝트별 테이블 */}
      {viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-teal-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-medium text-teal-800">{selectedBranchForDetail} - 프로젝트별 정기안전점검 현황</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'project' && activeMenu?.type === 'panorama' ? null : { level: 'project', type: 'panorama' }) }}
                    className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="전경사진 한글 다운로드"
                    disabled={panoramaLoading}
                  >
                    {panoramaLoading ? <Loader2 className="h-4 w-4 text-blue-600 animate-spin" /> : <HwpIcon className="h-4 w-4 text-blue-600" />}
                  </button>
                  {renderTypeSelectionMenu('project', 'panorama')}
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'project' && activeMenu?.type === 'defect' ? null : { level: 'project', type: 'defect' }) }}
                    className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="지적사항 사진 한글 다운로드"
                    disabled={defectPhotoLoading}
                  >
                    {defectPhotoLoading ? <Loader2 className="h-4 w-4 text-sky-600 animate-spin" /> : <HwpIcon className="h-4 w-4 text-sky-600" />}
                  </button>
                  {renderTypeSelectionMenu('project', 'defect')}
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'project' && activeMenu?.type === 'excel' ? null : { level: 'project', type: 'excel' }) }}
                    className="p-1 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
                    title="엑셀 다운로드"
                    disabled={excelLoading}
                  >
                    {excelLoading ? <Loader2 className="h-4 w-4 text-green-600 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
                  </button>
                  {renderTypeSelectionMenu('project', 'excel')}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onYearChange(selectedYear - 1) }}
                    className="p-0.5 hover:bg-teal-100 rounded transition-colors"
                    title="이전 연도"
                  >
                    <ChevronLeft className="h-4 w-4 text-teal-600" />
                  </button>
                  <span className="text-sm text-teal-600 font-semibold min-w-[50px] text-center">{selectedYear}년</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onYearChange(selectedYear + 1) }}
                    className="p-0.5 hover:bg-teal-100 rounded transition-colors"
                    title="다음 연도"
                  >
                    <ChevronRight className="h-4 w-4 text-teal-600" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              {renderTableHeader('프로젝트명', false)}
              <tbody className="divide-y divide-gray-200">
                {renderSubtotalRow(projectList.reduce((acc, curr) => ({
                  projectCount: 0,
                  inspectionCount: acc.inspectionCount + curr.inspection_count,
                  thawingCount: acc.thawingCount + curr.thawing_count,
                  thawingUnresolved: acc.thawingUnresolved + curr.thawing_unresolved,
                  thawingUnsigned: acc.thawingUnsigned + curr.thawing_unsigned,
                  rainyCount: acc.rainyCount + curr.rainy_count,
                  rainyUnresolved: acc.rainyUnresolved + curr.rainy_unresolved,
                  rainyUnsigned: acc.rainyUnsigned + curr.rainy_unsigned,
                  comprehensiveCount: acc.comprehensiveCount + curr.comprehensive_count,
                  comprehensiveUnresolved: acc.comprehensiveUnresolved + curr.comprehensive_unresolved,
                  comprehensiveUnsigned: acc.comprehensiveUnsigned + curr.comprehensive_unsigned,
                  specialCount: acc.specialCount + curr.special_count,
                  specialUnresolved: acc.specialUnresolved + curr.special_unresolved,
                  specialUnsigned: acc.specialUnsigned + curr.special_unsigned
                }), emptyStats()), false)}
                {projectList.map(p => (
                  <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id)} className="hover:bg-teal-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.project_name}>
                        {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                      </span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    {renderStatsCells({
                      projectCount: 0,
                      inspectionCount: p.inspection_count,
                      thawingCount: p.thawing_count,
                      thawingUnresolved: p.thawing_unresolved,
                      thawingUnsigned: p.thawing_unsigned,
                      rainyCount: p.rainy_count,
                      rainyUnresolved: p.rainy_unresolved,
                      rainyUnsigned: p.rainy_unsigned,
                      comprehensiveCount: p.comprehensive_count,
                      comprehensiveUnresolved: p.comprehensive_unresolved,
                      comprehensiveUnsigned: p.comprehensive_unsigned,
                      specialCount: p.special_count,
                      specialUnresolved: p.special_unresolved,
                      specialUnsigned: p.special_unsigned,
                    }, false)}
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 프로젝트가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default SafetyInspectionLedgerView
