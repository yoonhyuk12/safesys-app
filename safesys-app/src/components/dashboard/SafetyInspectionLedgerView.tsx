'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { ArrowLeft, ClipboardCheck, Building, FileSpreadsheet, Loader2, FileText, ChevronLeft, ChevronRight, Filter, Image as ImageIcon, PenTool, X } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project, SafetyInspectionCountByProject } from '@/lib/projects'
import { getSafetyInspectionDetailsForExcel, getSafetyInspectionPhotosForHwpx } from '@/lib/projects'
import { downloadSafetyInspectionLedgerExcel } from '@/lib/excel/safety-inspection-ledger-export'
import { downloadPanoramaHwpx } from '@/lib/hwpx/safety-inspection-panorama-export'
import { downloadDefectPhotoHwpx } from '@/lib/hwpx/safety-inspection-defect-photo-export'
import { useAuth } from '@/contexts/AuthContext'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import DownloadProgressModal from '@/components/ui/DownloadProgressModal'
import { generateBulkSafetyInspectionPdf } from '@/lib/reports/safety-inspection-bulk-pdf'
import { generateSpecialInspectionDocxBulk } from '@/lib/reports/special-inspection-report-docx'
import { supabase } from '@/lib/supabase'

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
  onClearBranchFilter: () => void
  onClearHqFilter: () => void
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
  thawingFindings: number
  thawingAdditionalFindings: number
  thawingUnresolved: number
  thawingUnsigned: number
  rainyCount: number
  rainyFindings: number
  rainyAdditionalFindings: number
  rainyUnresolved: number
  rainyUnsigned: number
  comprehensiveCount: number
  comprehensiveFindings: number
  comprehensiveUnresolved: number
  comprehensiveUnsigned: number
  specialCount: number
  specialFindings: number
  specialUnresolved: number
  specialUnsigned: number
}

const emptyStats = (): AggStats => ({
  projectCount: 0, inspectionCount: 0,
  thawingCount: 0, thawingFindings: 0, thawingAdditionalFindings: 0, thawingUnresolved: 0, thawingUnsigned: 0,
  rainyCount: 0, rainyFindings: 0, rainyAdditionalFindings: 0, rainyUnresolved: 0, rainyUnsigned: 0,
  comprehensiveCount: 0, comprehensiveFindings: 0, comprehensiveUnresolved: 0, comprehensiveUnsigned: 0,
  specialCount: 0, specialFindings: 0, specialUnresolved: 0, specialUnsigned: 0
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
  onClearBranchFilter,
  onClearHqFilter,
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
  const [bulkPdfLoading, setBulkPdfLoading] = useState(false)
  const [activeMenu, setActiveMenu] = useState<{ level: 'hq' | 'branch' | 'project', type: 'panorama' | 'defect' | 'excel' | 'bulkPdf' } | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number, total: number, stage: string, title: string } | null>(null)
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
    { value: '특별점검(안전혁신건설-287)', label: '특별점검(안전혁신건설-287)' },
  ]

  const HwpIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <text x="8" y="10.5" textAnchor="middle" fontSize="5.5" fontWeight="bold" fill="currentColor" fontFamily="Arial">한</text>
    </svg>
  )

  const renderTypeSelectionMenu = (level: 'hq' | 'branch' | 'project', type: 'panorama' | 'defect' | 'excel' | 'bulkPdf') => {
    if (activeMenu?.level !== level || activeMenu?.type !== type) return null

    const onSelect = (val: string) => {
      if (type === 'panorama') handlePanoramaHwpDownload(level, val || undefined)
      else if (type === 'defect') handleDefectPhotoHwpxDownload(level, val || undefined)
      else if (type === 'excel') handleExcelDownload(level, val || undefined)
      else if (type === 'bulkPdf') handleBulkPdfDownload(level, val || undefined)
      setActiveMenu(null)
    }

    return (
      <div
        ref={menuRef}
        className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[120px] z-50 animate-in fade-in slide-in-from-top-1 duration-200"
      >
        <div className="px-3 py-1.5 text-[10px] font-bold text-teal-600 border-b border-gray-50 mb-1 uppercase tracking-wider">점검유형 선택</div>
        {INSPECTION_TYPE_OPTIONS.map(opt => {
          const isSpecialWord = type === 'bulkPdf' && opt.value === '특별점검(안전혁신건설-287)'
          return (
            <button
              key={opt.value}
              onClick={(e) => { e.stopPropagation(); onSelect(opt.value) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 hover:text-teal-700 transition-colors text-gray-700 flex items-center justify-between group"
            >
              <span>{opt.label}{isSpecialWord ? ' (Word)' : ''}</span>
              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )
        })}
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

      await downloadPanoramaHwpx(result.data, filename, (current, total, stage) => {
        setDownloadProgress({ current, total, stage, title: '전경사진 다운로드' })
      })
    } catch (err) {
      console.error('전경사진 HWPX 다운로드 실패:', err)
      alert('한글 문서 다운로드 중 오류가 발생했습니다.')
    } finally {
      setPanoramaLoading(false)
      setDownloadProgress(null)
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

      await downloadDefectPhotoHwpx(result.data, filename, (current, total, stage) => {
        setDownloadProgress({ current, total, stage, title: '지적사항 사진 다운로드' })
      })
    } catch (err) {
      console.error('지적사항 사진 HWPX 다운로드 실패:', err)
      alert('한글 문서 다운로드 중 오류가 발생했습니다.')
    } finally {
      setDefectPhotoLoading(false)
      setDownloadProgress(null)
    }
  }

  const handleBulkPdfDownload = async (level: 'hq' | 'branch' | 'project', inspectionType?: string) => {
    if (!userProfile || bulkPdfLoading) return

    // 특별점검 → Word 벌크 다운로드
    if (inspectionType === '특별점검(안전혁신건설-287)') {
      await handleBulkWordDownload(level)
      return
    }

    setBulkPdfLoading(true)
    try {
      // level에 따라 프로젝트 ID 목록 수집
      const activeList = projects.filter(p => !isCompleted(p))
      let targetProjects: typeof activeList = []
      let scopeBranch: string | undefined
      let scopeHq: string | undefined

      if (level === 'project' && selectedBranchForDetail) {
        targetProjects = activeList.filter(p => p.managing_branch === selectedBranchForDetail)
        scopeBranch = selectedBranchForDetail
        scopeHq = selectedHqForDetail || undefined
      } else if (level === 'branch' && selectedHqForDetail) {
        targetProjects = activeList.filter(p => p.managing_hq === selectedHqForDetail)
        scopeHq = selectedHqForDetail
      } else {
        targetProjects = activeList
      }

      const pIds = targetProjects.map(p => p.id)
      if (pIds.length === 0) {
        alert('다운로드할 프로젝트가 없습니다.')
        return
      }

      await generateBulkSafetyInspectionPdf({
        branchName: scopeBranch,
        hqName: scopeHq,
        projectIds: pIds,
        inspectionType,
        selectedYear,
        onProgress: (current, total, stage) => {
          setDownloadProgress({ current, total, stage, title: '점검카드 PDF 다운로드' })
        }
      })
    } catch (err: any) {
      console.error('벌크 PDF 다운로드 실패:', err)
      alert(err.message || 'PDF 다운로드 중 오류가 발생했습니다.')
    } finally {
      setBulkPdfLoading(false)
      setDownloadProgress(null)
    }
  }

  const handleBulkWordDownload = async (level: 'hq' | 'branch' | 'project') => {
    setBulkPdfLoading(true)
    try {
      const activeList = projects.filter(p => !isCompleted(p))
      let targetProjects: typeof activeList = []
      let scopeLabel = '전체'

      if (level === 'project' && selectedBranchForDetail) {
        targetProjects = activeList.filter(p => p.managing_branch === selectedBranchForDetail)
        scopeLabel = selectedBranchForDetail
      } else if (level === 'branch' && selectedHqForDetail) {
        targetProjects = activeList.filter(p => p.managing_hq === selectedHqForDetail)
        scopeLabel = selectedHqForDetail
      } else {
        targetProjects = activeList
      }

      const pIds = targetProjects.map(p => p.id)
      if (pIds.length === 0) { alert('다운로드할 프로젝트가 없습니다.'); return }

      // 특별점검 데이터 조회 (전경 사진 포함)
      const { data: inspections } = await supabase
        .from('safety_inspections')
        .select('*, safety_inspection_photos(*)')
        .in('project_id', pIds)
        .eq('inspection_type', '특별점검(안전혁신건설-287)')

      if (!inspections || inspections.length === 0) {
        alert('다운로드할 특별점검 데이터가 없습니다.')
        return
      }

      // 프로젝트 순서대로 정렬 (같은 프로젝트는 점검일 오름차순)
      const projectOrder = new Map<string, number>(pIds.map((id, i) => [id, i]))
      const sortedInspections = [...inspections].sort((a: any, b: any) => {
        const oa = projectOrder.get(a.project_id) ?? Number.MAX_SAFE_INTEGER
        const ob = projectOrder.get(b.project_id) ?? Number.MAX_SAFE_INTEGER
        if (oa !== ob) return oa - ob
        return (a.inspection_date || '').localeCompare(b.inspection_date || '')
      })

      setDownloadProgress({ current: 0, total: sortedInspections.length, stage: '데이터 조회', title: '특별점검 Word 다운로드' })

      const safeScope = scopeLabel.replace(/[\\/:*?"<>|]/g, '_')
      const fileName = `특별점검_통합_${safeScope}_${selectedYear}.docx`

      await generateSpecialInspectionDocxBulk(
        sortedInspections as any,
        fileName,
        (current, total, title) => {
          setDownloadProgress({ current, total, stage: `${title || ''} 생성 중`, title: '특별점검 Word 다운로드' })
        },
      )
    } catch (err: any) {
      console.error('벌크 Word 다운로드 실패:', err)
      alert(err.message || 'Word 다운로드 중 오류가 발생했습니다.')
    } finally {
      setBulkPdfLoading(false)
      setDownloadProgress(null)
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
      s.thawingFindings += ic.thawing_findings || 0
      s.thawingAdditionalFindings += ic.thawing_additional_findings || 0
      s.thawingUnresolved += ic.thawing_unresolved || 0
      s.thawingUnsigned += ic.thawing_unsigned || 0
      s.rainyCount += ic.rainy_count
      s.rainyFindings += ic.rainy_findings || 0
      s.rainyAdditionalFindings += ic.rainy_additional_findings || 0
      s.rainyUnresolved += ic.rainy_unresolved || 0
      s.rainyUnsigned += ic.rainy_unsigned || 0
      s.comprehensiveCount += ic.comprehensive_count
      s.comprehensiveFindings += ic.comprehensive_findings || 0
      s.comprehensiveUnresolved += ic.comprehensive_unresolved || 0
      s.comprehensiveUnsigned += ic.comprehensive_unsigned || 0
      s.specialCount += ic.special_count
      s.specialFindings += ic.special_findings || 0
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
      existing.thawingFindings += is?.thawing_findings || 0
      existing.thawingAdditionalFindings += is?.thawing_additional_findings || 0
      existing.thawingUnresolved += is?.thawing_unresolved || 0
      existing.thawingUnsigned += is?.thawing_unsigned || 0
      existing.rainyCount += is?.rainy_count || 0
      existing.rainyFindings += is?.rainy_findings || 0
      existing.rainyAdditionalFindings += is?.rainy_additional_findings || 0
      existing.rainyUnresolved += is?.rainy_unresolved || 0
      existing.rainyUnsigned += is?.rainy_unsigned || 0
      existing.comprehensiveCount += is?.comprehensive_count || 0
      existing.comprehensiveFindings += is?.comprehensive_findings || 0
      existing.comprehensiveUnresolved += is?.comprehensive_unresolved || 0
      existing.comprehensiveUnsigned += is?.comprehensive_unsigned || 0
      existing.specialCount += is?.special_count || 0
      existing.specialFindings += is?.special_findings || 0
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
        existing.thawingFindings += is?.thawing_findings || 0
        existing.thawingAdditionalFindings += is?.thawing_additional_findings || 0
        existing.thawingUnresolved += is?.thawing_unresolved || 0
        existing.thawingUnsigned += is?.thawing_unsigned || 0
        existing.rainyCount += is?.rainy_count || 0
        existing.rainyFindings += is?.rainy_findings || 0
        existing.rainyAdditionalFindings += is?.rainy_additional_findings || 0
        existing.rainyUnresolved += is?.rainy_unresolved || 0
        existing.rainyUnsigned += is?.rainy_unsigned || 0
        existing.comprehensiveCount += is?.comprehensive_count || 0
        existing.comprehensiveFindings += is?.comprehensive_findings || 0
        existing.comprehensiveUnresolved += is?.comprehensive_unresolved || 0
        existing.comprehensiveUnsigned += is?.comprehensive_unsigned || 0
        existing.specialCount += is?.special_count || 0
        existing.specialFindings += is?.special_findings || 0
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
          thawing_findings: is?.thawing_findings || 0,
          thawing_additional_findings: is?.thawing_additional_findings || 0,
          thawing_unresolved: is?.thawing_unresolved || 0,
          thawing_unsigned: is?.thawing_unsigned || 0,
          rainy_count: is?.rainy_count || 0,
          rainy_findings: is?.rainy_findings || 0,
          rainy_additional_findings: is?.rainy_additional_findings || 0,
          rainy_unresolved: is?.rainy_unresolved || 0,
          rainy_unsigned: is?.rainy_unsigned || 0,
          comprehensive_count: is?.comprehensive_count || 0,
          comprehensive_findings: is?.comprehensive_findings || 0,
          comprehensive_unresolved: is?.comprehensive_unresolved || 0,
          comprehensive_unsigned: is?.comprehensive_unsigned || 0,
          special_count: is?.special_count || 0,
          special_findings: is?.special_findings || 0,
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

      const isSpecial = inspectionType === '특별점검(안전혁신건설-287)'
      const prefix = isSpecial ? '특별점검현황' : '정기안전점검현황'
      let filename: string
      if (level === 'project' && selectedBranchForDetail) {
        filename = `${prefix}_${selectedBranchForDetail}.xlsx`
      } else if (level === 'branch' && selectedHqForDetail) {
        filename = `${prefix}_${selectedHqForDetail}.xlsx`
      } else {
        filename = `${prefix}_전체.xlsx`
      }

      downloadSafetyInspectionLedgerExcel(result.data, filename, inspectionType)
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
      onClearBranchFilter()
    } else if (viewLevel === 'branch') {
      setViewLevel('hq')
      setSelectedHqForDetail(null)
      onClearHqFilter()
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
        <th rowSpan={2} className="px-2 sm:px-3 py-1.5 sm:py-3 text-center text-[11px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider align-middle border-r border-gray-200 min-w-[105px] max-w-[105px] sm:min-w-0 sm:max-w-none">{firstColName}</th>
        {showProjectCount && (
          <th rowSpan={2} className="px-1.5 sm:px-3 py-1.5 sm:py-3 text-center text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider align-middle border-r border-gray-200">지구</th>
        )}
        <th colSpan={2} className="px-1.5 sm:px-3 py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">총</th>
        <th colSpan={4} className="px-1.5 sm:px-3 py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">해빙기</th>
        <th colSpan={4} className="px-1.5 sm:px-3 py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">우기</th>
        <th colSpan={4} className="px-1.5 sm:px-3 py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-gray-500 border-b border-gray-200 border-r-2 border-gray-300">종합</th>
        <th colSpan={3} className="px-1.5 sm:px-3 py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-gray-500 border-b border-gray-200">특별</th>
      </tr>
      <tr>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-teal-700 bg-teal-50/50">실시</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-rose-700 bg-rose-50/50 border-r-2 border-gray-300" title="총지적(탭지적)">지적</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-sky-700 bg-sky-50/50">건</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-rose-700 bg-rose-50/50" title="지적건수">지적</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-red-700 bg-red-50/50" title="미조치">
          <div className="flex justify-center"><div className="relative"><ImageIcon className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-amber-700 bg-amber-50/50 border-r-2 border-gray-300" title="미서명">
          <div className="flex justify-center"><div className="relative"><PenTool className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-sky-700 bg-sky-50/50">건</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-rose-700 bg-rose-50/50" title="지적건수">지적</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-red-700 bg-red-50/50" title="미조치">
          <div className="flex justify-center"><div className="relative"><ImageIcon className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-amber-700 bg-amber-50/50 border-r-2 border-gray-300" title="미서명">
          <div className="flex justify-center"><div className="relative"><PenTool className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-sky-700 bg-sky-50/50">건</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-rose-700 bg-rose-50/50" title="지적건수">지적</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-red-700 bg-red-50/50" title="미조치">
          <div className="flex justify-center"><div className="relative"><ImageIcon className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-amber-700 bg-amber-50/50 border-r-2 border-gray-300" title="미서명">
          <div className="flex justify-center"><div className="relative"><PenTool className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-sky-700 bg-sky-50/50">건</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-rose-700 bg-rose-50/50" title="지적건수">지적</th>
        <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-medium text-red-700 bg-red-50/50" title="미조치">
          <div className="flex justify-center"><div className="relative"><ImageIcon className="h-3 sm:h-3.5 w-3 sm:w-3.5" /><X className="h-2.5 sm:h-3 w-2.5 sm:w-3 absolute -bottom-1 -right-1 text-red-500 scale-110 stroke-[3]" /></div></div>
        </th>
      </tr>
    </thead>
  )

  const renderSubtotalRow = (subtotal: AggStats, showProjectCount = true) => (
    <tr className="bg-teal-50/70 font-semibold border-b-2 border-teal-200">
      <td className="px-1 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-center text-teal-800 border-r border-teal-100">
        소계{subtotal.projectCount > 0 && <span className="ml-1 font-normal text-teal-600">({subtotal.projectCount})</span>}
      </td>
      {showProjectCount && (
        <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-teal-800 border-r border-teal-100">{subtotal.projectCount}</td>
      )}
      <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-teal-800 border-r border-teal-100">{subtotal.inspectionCount > 0 ? subtotal.inspectionCount.toLocaleString() : '-'}</td>
      <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-rose-700 bg-rose-50/40 border-r-2 border-teal-200">{(() => {
        const tf = subtotal.thawingFindings + subtotal.rainyFindings + subtotal.comprehensiveFindings + subtotal.specialFindings
        const ta = subtotal.thawingAdditionalFindings + subtotal.rainyAdditionalFindings
        return (tf + ta) > 0 ? `${tf || '-'}(${ta || '-'})` : '-'
      })()}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.thawingCount > 0 ? subtotal.thawingCount : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-rose-600 bg-rose-50/30">{(subtotal.thawingFindings + subtotal.thawingAdditionalFindings) > 0 ? `${subtotal.thawingFindings || '-'}(${subtotal.thawingAdditionalFindings || '-'})` : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-red-600 bg-red-50/30">{subtotal.thawingUnresolved > 0 ? subtotal.thawingUnresolved : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-amber-600 bg-amber-50/30 border-r-2 border-teal-200">{subtotal.thawingUnsigned > 0 ? subtotal.thawingUnsigned : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.rainyCount > 0 ? subtotal.rainyCount : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-rose-600 bg-rose-50/30">{(subtotal.rainyFindings + subtotal.rainyAdditionalFindings) > 0 ? `${subtotal.rainyFindings || '-'}(${subtotal.rainyAdditionalFindings || '-'})` : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-red-600 bg-red-50/30">{subtotal.rainyUnresolved > 0 ? subtotal.rainyUnresolved : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-amber-600 bg-amber-50/30 border-r-2 border-teal-200">{subtotal.rainyUnsigned > 0 ? subtotal.rainyUnsigned : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.comprehensiveCount > 0 ? subtotal.comprehensiveCount : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-rose-600 bg-rose-50/30">{subtotal.comprehensiveFindings > 0 ? subtotal.comprehensiveFindings : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-red-600 bg-red-50/30">{subtotal.comprehensiveUnresolved > 0 ? subtotal.comprehensiveUnresolved : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-amber-600 bg-amber-50/30 border-r-2 border-teal-200">{subtotal.comprehensiveUnsigned > 0 ? subtotal.comprehensiveUnsigned : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-blue-700 bg-blue-50/30">{subtotal.specialCount > 0 ? subtotal.specialCount : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-rose-600 bg-rose-50/30">{subtotal.specialFindings > 0 ? subtotal.specialFindings : '-'}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-[10px] sm:text-sm text-center text-red-600 bg-red-50/30">{subtotal.specialUnresolved > 0 ? subtotal.specialUnresolved : '-'}</td>
    </tr>
  )

  const renderStatsCells = (stats: AggStats, showProjectCount = true) => (
    <>
      {showProjectCount && (
        <td className="px-1.5 sm:px-3 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center border-r border-gray-100">
          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-800">{stats.projectCount}</span>
        </td>
      )}
      <td className="px-1.5 sm:px-3 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center border-r border-gray-100">
        {stats.inspectionCount > 0 ? (
          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold text-teal-700">{stats.inspectionCount.toLocaleString()}</span>
        ) : <span className="text-gray-300">-</span>}
      </td>
      <td className="px-1.5 sm:px-3 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center border-r-2 border-gray-300 bg-rose-50/30">{(() => {
        const tf = stats.thawingFindings + stats.rainyFindings + stats.comprehensiveFindings + stats.specialFindings
        const ta = stats.thawingAdditionalFindings + stats.rainyAdditionalFindings
        return (tf + ta) > 0
          ? <span className="text-rose-700 font-bold">{tf || '-'}<span className="text-rose-400 font-normal">({ta || '-'})</span></span>
          : <span className="text-gray-300">-</span>
      })()}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.thawingCount > 0 ? <span className="text-gray-900 font-medium">{stats.thawingCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{(stats.thawingFindings + stats.thawingAdditionalFindings) > 0 ? <span className="text-rose-600 font-semibold">{stats.thawingFindings || '-'}<span className="text-rose-400 font-normal">({stats.thawingAdditionalFindings || '-'})</span></span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.thawingUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.thawingUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center border-r-2 border-gray-300">{stats.thawingUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.thawingUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.rainyCount > 0 ? <span className="text-gray-900 font-medium">{stats.rainyCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{(stats.rainyFindings + stats.rainyAdditionalFindings) > 0 ? <span className="text-rose-600 font-semibold">{stats.rainyFindings || '-'}<span className="text-rose-400 font-normal">({stats.rainyAdditionalFindings || '-'})</span></span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.rainyUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.rainyUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center border-r-2 border-gray-300">{stats.rainyUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.rainyUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.comprehensiveCount > 0 ? <span className="text-gray-900 font-medium">{stats.comprehensiveCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.comprehensiveFindings > 0 ? <span className="text-rose-600 font-semibold">{stats.comprehensiveFindings}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.comprehensiveUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.comprehensiveUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center border-r-2 border-gray-300">{stats.comprehensiveUnsigned > 0 ? <span className="text-amber-500 font-bold">{stats.comprehensiveUnsigned}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.specialCount > 0 ? <span className="text-gray-900 font-medium">{stats.specialCount}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.specialFindings > 0 ? <span className="text-rose-600 font-semibold">{stats.specialFindings}</span> : <span className="text-gray-300">-</span>}</td>
      <td className="px-1 sm:px-2 py-1.5 sm:py-3 text-[10px] sm:text-sm text-center">{stats.specialUnresolved > 0 ? <span className="text-red-500 font-bold">{stats.specialUnresolved}</span> : <span className="text-gray-300">-</span>}</td>
    </>
  )

  return (
    <div className="space-y-4">
      {downloadProgress && (
        <DownloadProgressModal
          current={downloadProgress.current}
          total={downloadProgress.total}
          stage={downloadProgress.stage}
          title={downloadProgress.title}
        />
      )}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-white">
            정기안전점검 현황
            {viewLevel === 'branch' && selectedHqForDetail && (
              <span className="text-sm font-normal text-gray-200 ml-2">- {selectedHqForDetail}</span>
            )}
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-200 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
      </div>

      {/* 본부별 테이블 */}
      {viewLevel === 'hq' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-teal-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-teal-600" />
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'hq' && activeMenu?.type === 'bulkPdf' ? null : { level: 'hq', type: 'bulkPdf' }) }}
                    className="p-1 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                    title="점검카드 PDF 일괄 다운로드"
                    disabled={bulkPdfLoading}
                  >
                    {bulkPdfLoading ? <Loader2 className="h-4 w-4 text-red-600 animate-spin" /> : <FileText className="h-4 w-4 text-red-600" />}
                  </button>
                  {renderTypeSelectionMenu('hq', 'bulkPdf')}
                </div>
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
                  <span className="text-sm text-teal-600 font-semibold min-w-[50px] text-center">{String(selectedYear).slice(2)}년</span>
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
                    s.thawingCount += v.thawingCount; s.thawingFindings += v.thawingFindings; s.thawingAdditionalFindings += v.thawingAdditionalFindings; s.thawingUnresolved += v.thawingUnresolved; s.thawingUnsigned += v.thawingUnsigned;
                    s.rainyCount += v.rainyCount; s.rainyFindings += v.rainyFindings; s.rainyAdditionalFindings += v.rainyAdditionalFindings; s.rainyUnresolved += v.rainyUnresolved; s.rainyUnsigned += v.rainyUnsigned;
                    s.comprehensiveCount += v.comprehensiveCount; s.comprehensiveFindings += v.comprehensiveFindings; s.comprehensiveUnresolved += v.comprehensiveUnresolved; s.comprehensiveUnsigned += v.comprehensiveUnsigned;
                    s.specialCount += v.specialCount; s.specialFindings += v.specialFindings; s.specialUnresolved += v.specialUnresolved; s.specialUnsigned += v.specialUnsigned;
                  })
                  return s
                })())}
                {Array.from(hqStats.entries())
                  .filter(([, stats]) => stats.projectCount > 0)
                  .map(([hq, stats]) => (
                    <tr key={hq} onClick={() => handleHqClick(hq)} className="hover:bg-teal-50/50 cursor-pointer transition-colors">
                      <td className="px-2 sm:px-3 py-1.5 sm:py-3 text-[11px] sm:text-sm font-medium text-gray-900 text-center max-w-[105px] truncate sm:max-w-none sm:whitespace-normal" title={hq}>{hq}</td>
                      {renderStatsCells(stats)}
                    </tr>
                  ))}
                {Array.from(hqStats.values()).every(s => s.projectCount === 0) && (
                  <tr><td colSpan={19} className="px-4 py-8 text-center text-sm text-gray-500">등록된 프로젝트가 없습니다.</td></tr>
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
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'branch' && activeMenu?.type === 'bulkPdf' ? null : { level: 'branch', type: 'bulkPdf' }) }}
                    className="p-1 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                    title="점검카드 PDF 일괄 다운로드"
                    disabled={bulkPdfLoading}
                  >
                    {bulkPdfLoading ? <Loader2 className="h-4 w-4 text-red-600 animate-spin" /> : <FileText className="h-4 w-4 text-red-600" />}
                  </button>
                  {renderTypeSelectionMenu('branch', 'bulkPdf')}
                </div>
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
                  <span className="text-sm text-teal-600 font-semibold min-w-[50px] text-center">{String(selectedYear).slice(2)}년</span>
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
                  thawingFindings: acc.thawingFindings + curr.thawingFindings,
                  thawingAdditionalFindings: acc.thawingAdditionalFindings + curr.thawingAdditionalFindings,
                  thawingUnresolved: acc.thawingUnresolved + curr.thawingUnresolved,
                  thawingUnsigned: acc.thawingUnsigned + curr.thawingUnsigned,
                  rainyCount: acc.rainyCount + curr.rainyCount,
                  rainyFindings: acc.rainyFindings + curr.rainyFindings,
                  rainyAdditionalFindings: acc.rainyAdditionalFindings + curr.rainyAdditionalFindings,
                  rainyUnresolved: acc.rainyUnresolved + curr.rainyUnresolved,
                  rainyUnsigned: acc.rainyUnsigned + curr.rainyUnsigned,
                  comprehensiveCount: acc.comprehensiveCount + curr.comprehensiveCount,
                  comprehensiveFindings: acc.comprehensiveFindings + curr.comprehensiveFindings,
                  comprehensiveUnresolved: acc.comprehensiveUnresolved + curr.comprehensiveUnresolved,
                  comprehensiveUnsigned: acc.comprehensiveUnsigned + curr.comprehensiveUnsigned,
                  specialCount: acc.specialCount + curr.specialCount,
                  specialFindings: acc.specialFindings + curr.specialFindings,
                  specialUnresolved: acc.specialUnresolved + curr.specialUnresolved,
                  specialUnsigned: acc.specialUnsigned + curr.specialUnsigned
                }), emptyStats()))}
                {Array.from(branchStats.entries()).map(([branch, stats]) => (
                  <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-teal-50/50 cursor-pointer transition-colors">
                    <td className="px-2 sm:px-3 py-1.5 sm:py-3 text-[11px] sm:text-sm font-medium text-gray-900 text-center max-w-[105px] truncate sm:max-w-none sm:whitespace-normal" title={branch}>{branch}</td>
                    {renderStatsCells(stats)}
                  </tr>
                ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={19} className="px-4 py-8 text-center text-sm text-gray-500">해당 본부에 지사 데이터가 없습니다.</td></tr>
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
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu?.level === 'project' && activeMenu?.type === 'bulkPdf' ? null : { level: 'project', type: 'bulkPdf' }) }}
                    className="p-1 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                    title="점검카드 PDF 일괄 다운로드"
                    disabled={bulkPdfLoading}
                  >
                    {bulkPdfLoading ? <Loader2 className="h-4 w-4 text-red-600 animate-spin" /> : <FileText className="h-4 w-4 text-red-600" />}
                  </button>
                  {renderTypeSelectionMenu('project', 'bulkPdf')}
                </div>
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
                  <span className="text-sm text-teal-600 font-semibold min-w-[50px] text-center">{String(selectedYear).slice(2)}년</span>
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
                  projectCount: acc.projectCount + 1,
                  inspectionCount: acc.inspectionCount + curr.inspection_count,
                  thawingCount: acc.thawingCount + curr.thawing_count,
                  thawingFindings: acc.thawingFindings + curr.thawing_findings,
                  thawingAdditionalFindings: acc.thawingAdditionalFindings + curr.thawing_additional_findings,
                  thawingUnresolved: acc.thawingUnresolved + curr.thawing_unresolved,
                  thawingUnsigned: acc.thawingUnsigned + curr.thawing_unsigned,
                  rainyCount: acc.rainyCount + curr.rainy_count,
                  rainyFindings: acc.rainyFindings + curr.rainy_findings,
                  rainyAdditionalFindings: acc.rainyAdditionalFindings + curr.rainy_additional_findings,
                  rainyUnresolved: acc.rainyUnresolved + curr.rainy_unresolved,
                  rainyUnsigned: acc.rainyUnsigned + curr.rainy_unsigned,
                  comprehensiveCount: acc.comprehensiveCount + curr.comprehensive_count,
                  comprehensiveFindings: acc.comprehensiveFindings + curr.comprehensive_findings,
                  comprehensiveUnresolved: acc.comprehensiveUnresolved + curr.comprehensive_unresolved,
                  comprehensiveUnsigned: acc.comprehensiveUnsigned + curr.comprehensive_unsigned,
                  specialCount: acc.specialCount + curr.special_count,
                  specialFindings: acc.specialFindings + curr.special_findings,
                  specialUnresolved: acc.specialUnresolved + curr.special_unresolved,
                  specialUnsigned: acc.specialUnsigned + curr.special_unsigned
                }), emptyStats()), false)}
                {projectList.map(p => (
                  <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id)} className="hover:bg-teal-50/50 cursor-pointer transition-colors">
                    <td className="px-2 sm:px-3 py-1.5 sm:py-3 text-[11px] sm:text-sm font-medium text-gray-900 text-center max-w-[105px] truncate sm:max-w-none sm:whitespace-normal" title={p.project_name}>
                      <span className="sm:hidden">{p.project_name.length > 5 ? p.project_name.slice(0, 5) + '...' : p.project_name}</span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    {renderStatsCells({
                      projectCount: 0,
                      inspectionCount: p.inspection_count,
                      thawingCount: p.thawing_count,
                      thawingFindings: p.thawing_findings,
                      thawingAdditionalFindings: p.thawing_additional_findings,
                      thawingUnresolved: p.thawing_unresolved,
                      thawingUnsigned: p.thawing_unsigned,
                      rainyCount: p.rainy_count,
                      rainyFindings: p.rainy_findings,
                      rainyAdditionalFindings: p.rainy_additional_findings,
                      rainyUnresolved: p.rainy_unresolved,
                      rainyUnsigned: p.rainy_unsigned,
                      comprehensiveCount: p.comprehensive_count,
                      comprehensiveFindings: p.comprehensive_findings,
                      comprehensiveUnresolved: p.comprehensive_unresolved,
                      comprehensiveUnsigned: p.comprehensive_unsigned,
                      specialCount: p.special_count,
                      specialFindings: p.special_findings,
                      specialUnresolved: p.special_unresolved,
                      specialUnsigned: p.special_unsigned,
                    }, false)}
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={18} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 프로젝트가 없습니다.</td></tr>
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
