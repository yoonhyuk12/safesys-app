'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Phone, MoreVertical, Copy, Check, FileText, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { Project, deleteProject } from '@/lib/projects'
import { computeProgressRate, ProgressAnchor } from '@/lib/work-daily-report/work-daily-report-types'
import { getProgressAnchors } from '@/lib/work-daily-report/progress-anchors'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ProjectDeleteModal from '@/components/project/ProjectDeleteModal'
import DocumentFolder from '@/components/project/DocumentFolder'
import DocumentCabinet from '@/components/project/DocumentCabinet'
import BusinessCardEasel from '@/components/project/BusinessCardEasel'
import HeatWaveCheckModal from '@/components/project/HeatWaveCheckModal'
import BulkSignModal, { BulkSignSigner } from '@/components/project/BulkSignModal'
import PenHolderButton from '@/components/project/PenHolderButton'
import { countUnsignedBySigner } from '@/lib/bulk-sign/bulk-sign-counts'
import { isRealFinding, isAdditionalFinding, countHqIssues } from '@/lib/issue-ledger'
import ProjectHandoverModal from '@/components/project/ProjectHandoverModal'
import ProjectShareModal from '@/components/project/ProjectShareModal'
import PWAInstallButtonHeader from '@/components/common/PWAInstallButtonHeader'
import CopyrightNotice from '@/components/common/CopyrightNotice'
import NavigationSelector from '@/components/ui/NavigationSelector'

// 캐비넷에서 서류가 아래로 펼쳐져 나오고(열림), 다시 위로 접혀 들어가는(닫힘) 여닫이 애니메이션 래퍼
function CabinetDrawer({ open, instantClose = false, children }: { open: boolean; instantClose?: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [expanded, setExpanded] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true) // 열릴 때는 먼저 마운트
    } else if (instantClose) {
      // 다른 캐비넷으로 전환하는 경우: 이전 패널은 즉시 정리해 두 패널이 겹쳐 쌓이는 레이아웃 점프를 막는다.
      setExpanded(false)
      setMounted(false)
    } else {
      setExpanded(false) // 완전히 닫을 때만 접힘 트랜지션 후 언마운트
      const t = setTimeout(() => setMounted(false), 350)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    // 마운트 직후 다음 프레임에 펼침 상태로 전환해 "나오는" 트랜지션을 트리거한다.
    if (mounted && open && !expanded) {
      const r = requestAnimationFrame(() => setExpanded(true))
      return () => cancelAnimationFrame(r)
    }
  }, [mounted, open, expanded])

  if (!mounted) return null

  return (
    <div
      className="origin-top transition-all duration-300 ease-out motion-reduce:transition-none"
      style={{
        opacity: expanded ? 1 : 0,
        transform: expanded ? 'translateY(0) scale(1)' : 'translateY(-24px) scale(0.96)',
      }}
    >
      {children}
    </div>
  )
}

export default function ProjectDetailPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [creatorProfile, setCreatorProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isHeatWaveModalOpen, setIsHeatWaveModalOpen] = useState(false)
  const [bulkSignSigner, setBulkSignSigner] = useState<BulkSignSigner | null>(null)
  const [supervisorUnsignedCount, setSupervisorUnsignedCount] = useState<number | null>(null)
  const [contractorUnsignedCount, setContractorUnsignedCount] = useState<number | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // 모바일에서 프로젝트 정보 카드 접기/펼치기 (기본 접힘 — 위 2줄만 노출)
  const [infoExpanded, setInfoExpanded] = useState(false)
  const [g2bSyncing, setG2bSyncing] = useState(false)
  const [handoverModal, setHandoverModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [navigationModal, setNavigationModal] = useState<{ isOpen: boolean; address: string }>({ isOpen: false, address: '' })
  const [showEmail, setShowEmail] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [upperInfoCopied, setUpperInfoCopied] = useState(false)
  const [lowerInfoCopied, setLowerInfoCopied] = useState(false)
  const upperInfoRef = useRef<HTMLDivElement>(null)
  const lowerInfoRef = useRef<HTMLDivElement>(null)
  const [supervisorPhoneModal, setSupervisorPhoneModal] = useState<{ isOpen: boolean; phone: string; name: string; title: string }>({ isOpen: false, phone: '', name: '', title: '' })
  const [phoneCopied, setPhoneCopied] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [hqPendingCount, setHqPendingCount] = useState(0)
  const [safetyLedgerPendingCount, setSafetyLedgerPendingCount] = useState(0)
  const [managerPendingCount, setManagerPendingCount] = useState(0)
  const [hqCount, setHqCount] = useState<number | null>(null)
  const [safetyLedgerCount, setSafetyLedgerCount] = useState<number | null>(null)
  const [managerCount, setManagerCount] = useState<number | null>(null)
  const [issueLedgerCount, setIssueLedgerCount] = useState<number | null>(null)
  const [ptwCount, setPtwCount] = useState<number | null>(null)
  const [inspectionRequestCount, setInspectionRequestCount] = useState<number | null>(null)
  const [visitLogCount, setVisitLogCount] = useState<number | null>(null)
  const [contractCount, setContractCount] = useState<number | null>(null)
  const [qualityMonthlyReportCount, setQualityMonthlyReportCount] = useState<number | null>(null)
  const [qualityTestRecordCount, setQualityTestRecordCount] = useState<number | null>(null)
  const [qualityRejectionCount, setQualityRejectionCount] = useState(0)
  const [legalComplianceCount, setLegalComplianceCount] = useState<number | null>(null)
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({})
  const [riskAssessmentChooserOpen, setRiskAssessmentChooserOpen] = useState(false)
  const [openCabinet, setOpenCabinet] = useState<'시공' | '안전' | '품질' | '기타' | '발주청' | null>(null)
  const [progressAnchors, setProgressAnchors] = useState<ProgressAnchor[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  // 캐비넷 여닫기 효과음 (브라우저에서만 생성)
  const cabinetOpenSoundRef = useRef<HTMLAudioElement | null>(null)
  const cabinetCloseSoundRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    cabinetOpenSoundRef.current = new Audio('/cabinet open.mp3')
    cabinetCloseSoundRef.current = new Audio('/cabinet close.mp3')
  }, [])

  const playCabinetSound = (action: 'open' | 'close') => {
    const audio = action === 'open' ? cabinetOpenSoundRef.current : cabinetCloseSoundRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  // 캐비넷 토글 — 열 때는 열림음, 닫을 때는 닫힘음 재생
  const toggleCabinet = (name: '시공' | '안전' | '품질' | '기타' | '발주청') => {
    if (openCabinet === name) {
      playCabinetSound('close')
      setOpenCabinet(null)
    } else {
      // 다른 캐비넷이 이미 열려 있으면 그 캐비넷이 닫히는 소리도 함께 재생
      if (openCabinet) playCabinetSound('close')
      playCabinetSound('open')
      setOpenCabinet(name)
    }
  }

  // 캐비넷·서류철·버튼·링크 외 빈 공간 클릭 시 캐비넷 닫기
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!openCabinet) return
    const target = e.target as HTMLElement
    if (target.closest('[data-cabinet], [data-folder], button, a')) return
    playCabinetSound('close')
    setOpenCabinet(null)
  }

  const RISK_ASSESSMENT_GPTS_URL = 'https://chatgpt.com/g/g-uhvOsghT3-hangugnongeocongongsa-wiheomseongpyeongga-jagseong-ai'
  const RISK_ASSESSMENT_AI_EXCEL_URL = 'https://airiskdocu.vercel.app/'

  const openRiskAssessmentTool = (url: string, withSiteName = false) => {
    setRiskAssessmentChooserOpen(false)
    let finalUrl = url
    if (withSiteName && project?.project_name) {
      const params = new URLSearchParams({ siteName: project.project_name })
      finalUrl = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`
    }
    window.open(finalUrl, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    if (user && projectId) {
      loadProject()
    }
  }, [user, projectId])

  // 작업일보의 수동 입력 공정률 기준점 로드 — 작업일보 공정률과 동일한 보간 계산용
  useEffect(() => {
    if (!project?.construction_start_date || !project?.construction_end_date) return
    let cancelled = false
    getProgressAnchors(project.id).then(anchors => {
      if (!cancelled && anchors.length > 0) setProgressAnchors(anchors)
    })
    return () => { cancelled = true }
  }, [project?.id, project?.construction_start_date, project?.construction_end_date])

  // 일괄서명 미서명 건수 조회 (펜통 버튼 빨간 뱃지용) — 모달 닫을 때도 재조회
  const loadUnsignedCounts = () => {
    if (!projectId) return
    countUnsignedBySigner(projectId, 'contractor').then(setContractorUnsignedCount).catch(() => {})
    if (userProfile?.role === '발주청') {
      countUnsignedBySigner(projectId, 'supervisor').then(setSupervisorUnsignedCount).catch(() => {})
    }
  }

  useEffect(() => {
    if (!user || !projectId) return
    loadUnsignedCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId, userProfile?.role])

  // PTW 허가서 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadPtwCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('ptw_permits')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setPtwCount(count ?? 0)
    }
    loadPtwCount()
  }, [user, projectId])

  // 서류철 카드 표시용 등록 건수 일괄 조회 (제목 하단 (N) 표시)
  useEffect(() => {
    if (!user || !projectId || !project) return
    const countOf = async (table: string): Promise<number | null> => {
      const { count, error: countError } = await (supabase as any)
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      return countError ? null : (count ?? 0)
    }
    const loadCardCounts = async () => {
      const [workDaily, materials, safeDocs, workPlans, tbmDirect, newWorker, workers, heatWave, tbmSafety] = await Promise.all([
        countOf('work_daily_reports'),
        countOf('materials'),
        countOf('safe_document_inspections'),
        countOf('work_plans'),
        countOf('tbm_submissions'),
        countOf('new_worker_orientations'),
        countOf('workers'),
        countOf('heat_wave_checks'),
        countOf('tbm_safety_inspections'),
      ])
      // 레거시 TBM 제출분(project_id NULL)은 이름·본부·지사 매칭으로 합산
      let tbmLegacy = 0
      if (project.project_name) {
        const { count, error: legacyError } = await (supabase as any)
          .from('tbm_submissions')
          .select('id', { count: 'exact', head: true })
          .is('project_id', null)
          .eq('project_name', project.project_name)
          .eq('headquarters', (project as any).managing_hq)
          .eq('branch', (project as any).managing_branch)
        if (!legacyError) tbmLegacy = count ?? 0
      }
      const counts: Record<string, number> = {}
      const put = (key: string, value: number | null) => {
        if (value !== null) counts[key] = value
      }
      put('workDailyReport', workDaily)
      put('materials', materials)
      put('safeDocuments', safeDocs)
      put('workPlans', workPlans)
      put('tbm', tbmDirect !== null ? tbmDirect + tbmLegacy : null)
      put('newWorkerOrientation', newWorker)
      put('workers', workers)
      put('heatWave', heatWave)
      put('tbmSafetyInspection', tbmSafety)
      setCardCounts(counts)
    }
    loadCardCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId, project?.id])

  // 검측요청서 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadInspectionRequestCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('inspection_requests')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setInspectionRequestCount(count ?? 0)
    }
    loadInspectionRequestCount()
  }, [user, projectId])

  // 단속·점검방문 일지 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadVisitLogCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('inspection_visit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setVisitLogCount(count ?? 0)
    }
    loadVisitLogCount()
  }, [user, projectId])

  // 계약(공사·용역) 현황 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadContractCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('project_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setContractCount(count ?? 0)
    }
    loadContractCount()
  }, [user, projectId])

  // 품질시험 월례보고서 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadQualityMonthlyReportCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('quality_monthly_reports')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setQualityMonthlyReportCount(count ?? 0)
    }
    loadQualityMonthlyReportCount()
  }, [user, projectId])

  // 품질시험 실시대장 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadQualityTestRecordCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('quality_test_records')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setQualityTestRecordCount(count ?? 0)
    }
    loadQualityTestRecordCount()
  }, [user, projectId])

  // 품질검사 성과총괄표 미확인 반려 건수 조회 (품질 캐비넷·서류철 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadQualityRejectionCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('quality_summary_reports')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .not('rejected_at', 'is', null)
        .is('rejection_read_at', null)
      if (!countError) setQualityRejectionCount(count ?? 0)
    }
    loadQualityRejectionCount()
  }, [user, projectId])

  // 법적이행 확인(안전활동 점검표) 건수 조회 (서류철 카드 표시용)
  useEffect(() => {
    if (!user || !projectId) return
    const loadLegalComplianceCount = async () => {
      const { count, error: countError } = await (supabase as any)
        .from('legal_compliance_checks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (!countError) setLegalComplianceCount(count ?? 0)
    }
    loadLegalComplianceCount()
  }, [user, projectId])

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const loadProject = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) {
        throw new Error(projectError.message)
      }

      if (!data) {
        throw new Error('프로젝트를 찾을 수 없습니다.')
      }

      setProject(data as any)

      // 본부 불시점검 미조치 건수 조회 (+ 카드 표시용 등록·지적 건수)
      let hqIssueTotal = 0
      const { data: hqInspections } = await supabase
        .from('headquarters_inspections')
        .select('action_photo_issue1, action_photo_issue2, issue_content1, issue_content2, site_photo_issue2, issue1_status, issue2_status')
        .eq('project_id', projectId)

      if (hqInspections) {
        const pendingCount = (hqInspections as any[]).filter((ins: any) => {
          const hasIssue2 = Boolean((ins.issue_content2 && ins.issue_content2.trim()) || ins.site_photo_issue2)
          const issue1Done = Boolean(ins.action_photo_issue1) || ins.issue1_status === 'completed'
          const issue2Done = !hasIssue2 ? true : (Boolean(ins.action_photo_issue2) || ins.issue2_status === 'completed')
          return !(issue1Done && issue2Done)
        }).length
        setHqPendingCount(pendingCount)
        setHqCount(hqInspections.length)
        hqIssueTotal = (hqInspections as any[]).reduce((sum: number, ins: any) => sum + countHqIssues(ins), 0)
      }

      // 안전점검 관리대장 조치 후 사진 미등록 건수 조회 (+ 카드 표시용 등록·지적 건수)
      let safetyFindingTotal = 0
      const { data: safetyInspections } = await supabase
        .from('safety_inspections')
        .select('id, inspection_type, additional_items, safety_inspection_results(id, findings, photo_url, after_photo_url)')
        .eq('project_id', projectId)

      if (safetyInspections) {
        const isPendingPhoto = (after: any) => {
          if (after === 'N/A') return false
          if (!after) return true
          return typeof after === 'string' && after.trim() === ''
        }
        const pendingPhotoCount = (safetyInspections as any[]).reduce((count: number, ins: any) => {
          if (ins.inspection_type === '특별점검(안전혁신건설-287)') {
            const items = Array.isArray(ins.additional_items) ? ins.additional_items : []
            const pending = items.filter((it: any) => it && it.action && it.action !== '해당없음' && isPendingPhoto(it.after_photo_url)).length
            return count + pending
          }
          const results = ins.safety_inspection_results || []
          const pending = results.filter((r: any) => {
            const hasFindings = typeof r.findings === 'string' && r.findings.trim() !== ''
            if (!hasFindings) return false
            return isPendingPhoto(r.after_photo_url)
          }).length
          return count + pending
        }, 0)
        setSafetyLedgerPendingCount(pendingPhotoCount)
        setSafetyLedgerCount(safetyInspections.length)
        safetyFindingTotal = (safetyInspections as any[]).reduce((sum: number, ins: any) => {
          const results = Array.isArray(ins.safety_inspection_results) ? ins.safety_inspection_results : []
          const additional = Array.isArray(ins.additional_items) ? ins.additional_items : []
          return sum + results.filter(isRealFinding).length + additional.filter(isAdditionalFinding).length
        }, 0)
      }

      // 지적사항 관리대장 건수 = 본부 지적 + 정기점검 지적 + 직접 등록건
      const { count: directIssueCount } = await (supabase as any)
        .from('corrective_action_issues')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      setIssueLedgerCount(hqIssueTotal + safetyFindingTotal + (directIssueCount ?? 0))

      // 관리자점검(지사 안전점검) 미완료 건수 조회 — 미완성 열과 동일 기준
      // 1) 서명 없음, 2) 위험성평가 사진 없음, 3) 재해예방 대상에서 내용·보고서 사진 중 하나만 있음(불일치)
      const dpTarget = !!(data as any).disaster_prevention_target
      const { data: managerInspections } = await supabase
        .from('manager_inspections')
        .select('signature, risk_assessment_photo, disaster_prevention_report_photo, disaster_prevention_risk_factors_json')
        .eq('project_id', projectId)

      if (managerInspections) {
        const pendingCount = (managerInspections as any[]).filter((ins: any) => {
          const noSignature = !(ins.signature && String(ins.signature).trim())
          const noRiskAssessmentPhoto = !(ins.risk_assessment_photo && String(ins.risk_assessment_photo).trim())
          const hasDisasterContent = Array.isArray(ins.disaster_prevention_risk_factors_json) && ins.disaster_prevention_risk_factors_json.some((f: any) => { const rf = (f?.risk_factor || '').trim(); return rf !== '' && rf !== '해당없음' })
          const hasDisasterReportPhoto = !!(ins.disaster_prevention_report_photo && String(ins.disaster_prevention_report_photo).trim())
          const disasterIncomplete = dpTarget && (hasDisasterContent !== hasDisasterReportPhoto)
          return noSignature || noRiskAssessmentPhoto || disasterIncomplete
        }).length
        setManagerPendingCount(pendingCount)
        setManagerCount(managerInspections.length)
      }

      // 프로젝트 생성인의 프로필 정보 조회
      if ((data as any).created_by) {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', (data as any).created_by)
          .single()

        if (!profileError && profileData) {
          setCreatorProfile(profileData as any)
        }
      }
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      // 프로젝트 리스트에서 온 경우 플래그 확인
      const fromList = sessionStorage.getItem(`project_${projectId}_from_list`)
      if (fromList === 'true') {
        // 플래그 제거하고 프로젝트 리스트로 이동
        sessionStorage.removeItem(`project_${projectId}_from_list`)
        router.push('/list')
        return
      }

      // 하위 페이지에서 온 경우 플래그 확인
      const fromSubpage = sessionStorage.getItem(`project_${projectId}_from_subpage`)
      if (fromSubpage === 'true') {
        // 플래그 제거하고 대시보드로 이동
        sessionStorage.removeItem(`project_${projectId}_from_subpage`)
        router.push('/')
        return
      }

      // 일반적인 경우: 브라우저 히스토리 사용
      if (window.history.length > 1) {
        router.back()
        return
      }
    }

    // 직접 URL 진입 등으로 히스토리가 없을 때만 목록 페이지로 fallback
    router.push('/list')
  }

  const handleHeatWaveCheck = () => {
    setIsHeatWaveModalOpen(true)
  }

  const handleCloseHeatWaveModal = () => {
    setIsHeatWaveModalOpen(false)
  }

  const handleEdit = () => {
    setIsMenuOpen(false)
    router.push(`/project/${projectId}/edit`)
  }

  // 나라장터 계약 재조회로 계약기간(착공·준공일)·계약업체·총계약금액 갱신 — 연계 번호가 있을 때만 버튼 노출
  const handleG2bSync = async () => {
    if (!project || g2bSyncing) return
    const no = project.g2b_cntrct_no || project.g2b_ntce_no
    if (!no) return
    setG2bSyncing(true)
    try {
      const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(no)}`)
      const json = await res.json()
      if (!json.success || !json.data?.contracts?.length) {
        alert(json.error || '나라장터에서 계약 정보를 찾지 못했습니다.')
        return
      }
      const c = json.data.contracts[0]
      // 값이 있는 항목만 갱신 후보로 삼는다 (조회값이 비었다고 기존 값을 지우지 않음)
      const next = {
        construction_start_date: c.startDate || project.construction_start_date || null,
        construction_end_date: c.endDate || project.construction_end_date || null,
        g2b_corp_nm: (c.corpNms || []).join(', ') || project.g2b_corp_nm || null,
        g2b_tot_amt: c.totCntrctAmt > 0 ? c.totCntrctAmt : (project.g2b_tot_amt || null),
        g2b_thtm_amt: c.thtmCntrctAmt > 0 ? c.thtmCntrctAmt : (project.g2b_thtm_amt || null)
      }
      if (!next.construction_start_date && !next.construction_end_date &&
          !next.g2b_corp_nm && !next.g2b_tot_amt && !next.g2b_thtm_amt) {
        alert('조회된 계약에 갱신할 정보가 없습니다.')
        return
      }
      // 변경분이 없으면 DB를 건드리지 않고 안내만
      if ((project.construction_start_date || null) === next.construction_start_date &&
          (project.construction_end_date || null) === next.construction_end_date &&
          (project.g2b_corp_nm || null) === next.g2b_corp_nm &&
          (project.g2b_tot_amt || null) === next.g2b_tot_amt &&
          (project.g2b_thtm_amt || null) === next.g2b_thtm_amt) {
        alert('업데이트 사항이 없습니다.')
        return
      }
      const { error: updateError } = await supabase
        .from('projects')
        .update({ ...next, updated_at: new Date().toISOString() })
        .eq('id', project.id)
      if (updateError) throw updateError
      setProject(prev => prev ? { ...prev, ...next } : prev)
      alert([
        '나라장터 계약 정보로 갱신했습니다.',
        (next.construction_start_date || next.construction_end_date) &&
          `기간: ${next.construction_start_date || '?'} ~ ${next.construction_end_date || '?'}`,
        next.g2b_tot_amt && `총계약금액: ${Math.round(next.g2b_tot_amt / 1000).toLocaleString()}천원`,
        next.g2b_thtm_amt && `금차계약금액: ${Math.round(next.g2b_thtm_amt / 1000).toLocaleString()}천원`,
        next.g2b_corp_nm && `계약업체: ${next.g2b_corp_nm}`,
      ].filter(Boolean).join('\n'))
    } catch (err) {
      console.error('나라장터 계약기간 갱신 실패:', err)
      alert('나라장터 연동 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setG2bSyncing(false)
    }
  }

  const handleHandover = () => {
    setIsMenuOpen(false)
    if (project) {
      setHandoverModal({ isOpen: true, project })
    }
  }

  const handleShare = () => {
    setIsMenuOpen(false)
    if (project) {
      setShareModal({ isOpen: true, project })
    }
  }

  const handleShareModalClose = () => {
    setShareModal({ isOpen: false, project: null })
  }

  const handleDelete = () => {
    setIsMenuOpen(false)
    if (!project) return
    if (userProfile?.role !== '발주청') {
      alert('프로젝트 삭제는 발주청에서만 가능합니다.\n발주청 담당자에게 삭제를 요청해 주세요.')
      return
    }
    setDeleteModal({ isOpen: true, project })
  }

  const handleDeleteModalClose = () => {
    setDeleteModal({ isOpen: false, project: null })
  }

  const handleDeleteConfirm = async (projectId: string) => {
    try {
      const result = await deleteProject(projectId)
      if (result.success) {
        alert('프로젝트가 삭제되었습니다.')
        router.push('/')
      } else {
        alert(result.error || '프로젝트 삭제에 실패했습니다.')
      }
    } catch (err) {
      console.error('Delete error:', err)
      alert('프로젝트 삭제 중 오류가 발생했습니다.')
    }
  }

  const handleHandoverModalClose = () => {
    setHandoverModal({ isOpen: false, project: null })
    loadProject() // 인계 완료 후 프로젝트 정보 새로고침
  }

  const handleAddressClick = (address: string) => {
    if (address) {
      setNavigationModal({ isOpen: true, address })
    }
  }

  const handleNavigationModalClose = () => {
    setNavigationModal({ isOpen: false, address: '' })
  }

  const handleCreatorNameClick = () => {
    setShowEmail(!showEmail)
    setEmailCopied(false)
  }

  const handleCopyEmail = async () => {
    if (creatorProfile?.email) {
      try {
        await navigator.clipboard.writeText(creatorProfile.email)
        setEmailCopied(true)
        setTimeout(() => setEmailCopied(false), 2000)
      } catch (err) {
        console.error('이메일 복사 실패:', err)
      }
    }
  }

  // 사업 정보 텍스트 복사 (화면에 보이는 텍스트 그대로) — 구분선 위/아래 블록 각각
  const handleCopyInfoBlock = async (
    ref: React.RefObject<HTMLDivElement | null>,
    setCopied: (copied: boolean) => void
  ) => {
    const text = ref.current?.innerText
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('사업 정보 복사 실패:', err)
    }
  }

  const handleSupervisorPhoneClick = (phone: string, name: string, title: string = '연락처') => {
    setSupervisorPhoneModal({ isOpen: true, phone, name, title })
    setPhoneCopied(false)
  }

  const handleCopyPhone = async () => {
    if (supervisorPhoneModal.phone) {
      try {
        await navigator.clipboard.writeText(supervisorPhoneModal.phone)
        setPhoneCopied(true)
        setTimeout(() => setPhoneCopied(false), 2000)
      } catch (err) {
        console.error('전화번호 복사 실패:', err)
      }
    }
  }

  const handleBusinessCardClick = () => {
    if (project?.business_card_pdf_url) {
      window.open(project.business_card_pdf_url, '_blank')
    }
  }

  // 인계 가능 여부 확인
  const canHandover = () => {
    if (!userProfile || !project) return false

    // 발주청은 관할 범위 내 모든 프로젝트 인계 가능
    if (userProfile.role === '발주청') {
      // 본사 조직
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        return true
      }
      // 본부 대표 지사
      if (userProfile.branch_division?.endsWith('본부')) {
        return project.managing_hq === userProfile.hq_division
      }
      // 일반 지사
      if (userProfile.branch_division) {
        return project.managing_branch === userProfile.branch_division
      }
      // 본부만 지정
      if (userProfile.hq_division) {
        return project.managing_hq === userProfile.hq_division
      }
      // 본부 미지정 (관리자)
      return true
    }

    // 시공사/감리단: 본인이 생성한 프로젝트만
    return project.created_by === user?.id
  }

  // 수정 가능 여부 확인
  const canEdit = () => {
    if (!userProfile || !project) return false

    // 발주청은 관할 범위 내 모든 프로젝트 수정 가능
    if (userProfile.role === '발주청') {
      // 본사 조직
      if (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') {
        return true
      }
      // 본부 대표 지사
      if (userProfile.branch_division?.endsWith('본부')) {
        return project.managing_hq === userProfile.hq_division
      }
      // 일반 지사
      if (userProfile.branch_division) {
        return project.managing_branch === userProfile.branch_division
      }
      // 본부만 지정
      if (userProfile.hq_division) {
        return project.managing_hq === userProfile.hq_division
      }
      // 본부 미지정 (관리자)
      return true
    }

    // 시공사/감리단: 본인이 생성한 프로젝트만
    return project.created_by === user?.id
  }

  // 삭제 가능 여부 확인 (본인이 생성한 프로젝트만)
  const canDelete = () => {
    return user && project && project.created_by === user.id
  }

  // 공유 가능 여부 확인 (소유자만)
  const canShare = () => {
    return user && project && project.created_by === user.id
  }

  // 공유받은 프로젝트인지 확인
  const isSharedProject = () => {
    return user && project && project.created_by !== user.id && userProfile?.role !== '발주청'
  }

  // 로딩 중
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // 로그인하지 않은 사용자
  if (!user) {
    router.push('/login')
    return null
  }

  // 에러 발생
  if (error) {
    return (
      <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">프로젝트 상세</h1>
            </div>
          </div>
        </header>

        <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-sm text-red-700">{error}</div>
            <button
              onClick={loadProject}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              다시 시도
            </button>
          </div>
        </main>
      </div>
    )
  }

  // 프로젝트가 없는 경우
  if (!project) {
    return (
      <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">프로젝트 상세</h1>
            </div>
          </div>
        </header>

        <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
          <div className="text-center">
            <p className="text-gray-500">프로젝트를 찾을 수 없습니다.</p>
          </div>
        </main>
      </div>
    )
  }

  // 현재 공정률 (착공일 0% → 수동 기준점 보간 → 준공일 100%) — 작업일보 공정률과 연동, 시공 캐비넷 명판 표시용
  const constructionProgress = (() => {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const rate = computeProgressRate(project.construction_start_date, project.construction_end_date, todayStr, progressAnchors)
    return rate === '' ? null : Math.round(parseFloat(rate))
  })()

  // 캐비넷 열림 시 나머지 오브젝트(펜통·이젤)가 뒤로 물러나는 스타일 — DocumentCabinet의 receded와 동일 값
  const recededStyle: React.CSSProperties = { transform: 'scale(0.85)', transformOrigin: 'bottom center', filter: 'brightness(0.55)' }

  // 사업 정보 줄 표시 여부 — 전체 복사 버튼을 마지막 줄 끝에 인라인 배치하기 위한 판별
  const hasPeriodLine = !!(project.construction_start_date || project.construction_end_date)
  const hasG2bLine = !!(project.g2b_corp_nm || project.g2b_tot_amt)
  const hasOptionalLine = !!(project.total_budget || project.current_year_budget || project.supervisor_position ||
    project.supervisor_name || project.actual_work_address || project.construction_law_safety_plan ||
    project.industrial_law_safety_ledger || (project as any).disaster_prevention_target || project.business_card_pdf_url)

  // 사업 정보 복사 버튼 (아이콘만) — 각 블록의 마지막 줄 맨 우측 끝에 배치
  const renderInfoCopyButton = (copied: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className="float-right inline-flex items-center text-gray-400 hover:text-gray-600 transition-colors"
      title="사업 정보 복사"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
  const upperCopyButton = renderInfoCopyButton(upperInfoCopied, () => handleCopyInfoBlock(upperInfoRef, setUpperInfoCopied))
  const lowerCopyButton = renderInfoCopyButton(lowerInfoCopied, () => handleCopyInfoBlock(lowerInfoRef, setLowerInfoCopied))

  return (
    <div className="min-h-screen relative bg-black flex flex-col" style={{ isolation: 'isolate' }}>
      {/* 검은 배경 + 스포트라이트 조명 — 상단 중앙 광원이 캐비넷 영역을 비추는 무대 조명 (스크롤 시 고정) */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: -1,
          backgroundColor: '#000',
          backgroundImage: [
            // 상단 중앙에서 아래로 퍼지는 조명 빔 (0%가 12시 방향이므로 50% 지점이 아래쪽 중심)
            'conic-gradient(at 50% -12%, transparent 40%, rgba(255,250,230,0.12) 45%, rgba(255,250,230,0.3) 50%, rgba(255,250,230,0.12) 55%, transparent 60%)',
            // 캐비넷 위치의 빛 웅덩이 — 중심이 콘텐츠에 가려지므로 가장자리까지 완만하게 퍼뜨림
            'radial-gradient(ellipse 70% 48% at 50% 63%, rgba(255,250,235,0.38) 0%, rgba(255,250,235,0.26) 55%, rgba(255,250,235,0.1) 82%, transparent 100%)',
            // 캐비넷 아래 바닥에 떨어지는 빛
            'radial-gradient(ellipse 55% 12% at 50% 84%, rgba(255,250,235,0.2) 0%, transparent 100%)',
            // 광원 자체의 헤일로
            'radial-gradient(ellipse 42% 26% at 50% 0%, rgba(255,255,245,0.35) 0%, transparent 70%)'
          ].join(', ')
        }}
      />
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center flex-1 min-w-0">
              <button
                onClick={handleBack}
                className="mr-2 lg:mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">{project.project_name}</h1>
              {/* 나라장터 연계 마크 — 프로젝트명 바로 옆 */}
              {(project.g2b_cntrct_no || project.g2b_ntce_no) && (
                <img
                  src="/g2b.png"
                  alt="나라장터 연계"
                  title="나라장터 연계"
                  className="ml-1.5 lg:ml-2 h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0 object-contain"
                />
              )}
            </div>
            <div className="flex items-center space-x-2 lg:space-x-4">
              {/* PWA 설치 버튼 */}
              <PWAInstallButtonHeader />

              <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0">
                <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
                <span className="text-gray-500">({userProfile?.role})</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 w-full max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
        <div className="px-4 py-6 sm:px-0 lg:px-0" onClick={handleContentClick}>
          {/* 프로젝트 정보 */}
          <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
            {/* 점점점 메뉴 버튼 */}
            <div className="absolute top-4 right-4 flex items-center gap-1" ref={menuRef}>
              {/* 나라장터 계약기간 갱신 (연계 번호가 있을 때만) */}
              {(project.g2b_cntrct_no || project.g2b_ntce_no) && (
                <button
                  onClick={handleG2bSync}
                  disabled={g2bSyncing}
                  title="나라장터 계약기간 갱신"
                  className="p-1 rounded hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-5 w-5 text-emerald-600 ${g2bSyncing ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
              >
                <MoreVertical className="h-5 w-5 text-gray-500" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[100px]">
                  <button
                    onClick={handleEdit}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-md"
                  >
                    수정
                  </button>
                  <button
                    onClick={handleHandover}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    인계
                  </button>
                  <button
                    onClick={handleShare}
                    className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                  >
                    공유
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 last:rounded-b-md"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>

            {/* 모바일에서는 위 2줄만 보이고 나머지는 두루마기처럼 접힘 (sm 이상은 항상 전체 표시) */}
            <div className="relative">
            <div className={`space-y-2 overflow-hidden transition-[max-height] duration-300 sm:max-h-none sm:overflow-visible ${infoExpanded ? 'max-h-[1000px]' : 'max-h-10'}`}>
              {/* 구분선 위 블록 (기본 정보·공사기간·계약 정보) — 상단 복사 버튼 대상 */}
              <div ref={upperInfoRef} className="space-y-2">
              {/* 기본 정보 */}
              <div className="text-sm text-gray-600">
                {project.project_name} / {project.managing_hq} / {project.managing_branch} /
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddressClick(project.site_address)
                  }}
                  className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline"
                >
                  {project.site_address}
                </button>
                {project.site_address_detail && (
                  <span className="text-gray-500"> ({project.site_address_detail})</span>
                )}
                {creatorProfile && (
                  <>
                    {' / '}
                    <span>{creatorProfile.company_name || '미입력'} / </span>
                    <button
                      onClick={handleCreatorNameClick}
                      className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline inline-flex items-center gap-1"
                    >
                      {creatorProfile.full_name || '미입력'}
                    </button>
                    {showEmail && creatorProfile.email && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <span className="text-gray-700">({creatorProfile.email})</span>
                        <button
                          onClick={handleCopyEmail}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="이메일 복사"
                        >
                          {emailCopied ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-500" />
                          )}
                        </button>
                      </span>
                    )}
                    {creatorProfile.phone_number && (
                      <>
                        {' / '}
                        <button
                          onClick={() => handleSupervisorPhoneClick(creatorProfile.phone_number, creatorProfile.full_name || '등록자', '등록자 연락처')}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                        >
                          <Phone className="h-4 w-4" />
                          <span className="underline">{creatorProfile.phone_number}</span>
                        </button>
                      </>
                    )}
                  </>
                )}
                {!hasPeriodLine && !hasG2bLine && upperCopyButton}
              </div>

              {/* 공사기간 (착공일·준공일) — 값이 있을 때만 새 줄로 표시 */}
              {hasPeriodLine && (
                <div className="text-sm text-gray-600">
                  {[
                    project.construction_start_date && `착공일: ${project.construction_start_date}`,
                    project.construction_end_date && `준공일: ${project.construction_end_date}`,
                  ].filter(Boolean).join(' / ')}
                  {!hasG2bLine && upperCopyButton}
                </div>
              )}

              {/* 나라장터 계약 정보 (계약업체·총계약금액 천원 단위) — 연계된 프로젝트만 */}
              {hasG2bLine && (
                <div className="text-sm text-gray-600">
                  {[
                    project.g2b_corp_nm && `계약업체: ${project.g2b_corp_nm}`,
                    // 계약금액 — 금차 금액이 있으면 '총 / 금' 병기, 없으면 총액만
                    project.g2b_tot_amt && (project.g2b_thtm_amt
                      ? `계약금액: 총 ${Math.round(project.g2b_tot_amt / 1000).toLocaleString()}천원 / 금 ${Math.round(project.g2b_thtm_amt / 1000).toLocaleString()}천원`
                      : `총계약금액: ${Math.round(project.g2b_tot_amt / 1000).toLocaleString()}천원`),
                  ].filter(Boolean).join(' / ')}
                  {upperCopyButton}
                </div>
              )}
              </div>

              {/* 선택사항 정보 (구분선 아래 블록) — 하단 복사 버튼 대상 */}
              {hasOptionalLine && (
                  <>
                    <div className="border-t border-gray-200"></div>
                    <div ref={lowerInfoRef} className="text-sm text-gray-600">
                      {[
                        project.total_budget && `총사업비: ${Number(project.total_budget).toLocaleString()}백만원`,
                        project.current_year_budget && `당해년도사업비: ${Number(project.current_year_budget).toLocaleString()}백만원`,
                        project.supervisor_position && `공사감독 직급: ${project.supervisor_position}`,
                        project.construction_law_safety_plan && '건진법 안전관리계획 작성대상: O',
                        project.industrial_law_safety_ledger && '산안법 공사안전보건대장 작성대상: O',
                        (project as any).disaster_prevention_target && '재해예방기술지도 대상: O'
                      ].filter(Boolean).join(' / ')}
                      {project.supervisor_name && (
                        <>
                          {' / 공사감독명: '}{project.supervisor_name}
                          {(project as any).supervisor_phone && (
                            <>
                              {' '}
                              <button
                                onClick={() => handleSupervisorPhoneClick((project as any).supervisor_phone, project.supervisor_name || '', '공사감독 연락처')}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                              >
                                <Phone className="h-4 w-4" />
                                <span className="underline">{(project as any).supervisor_phone}</span>
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {project.actual_work_address && (
                        <>
                          {' / 실제작업주소: '}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddressClick(project.actual_work_address!)
                            }}
                            className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer underline"
                          >
                            {project.actual_work_address}
                          </button>
                        </>
                      )}
                      {project.business_card_pdf_url && (
                        <>
                          {' / '}
                          <button
                            onClick={handleBusinessCardClick}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                            title="사업카드 보기"
                          >
                            <FileText className="h-4 w-4" />
                            <span className="underline">사업카드</span>
                          </button>
                        </>
                      )}
                      {lowerCopyButton}
                    </div>
                  </>
                )}
            </div>
            {/* 접힘 상태 하단 페이드 (모바일 전용) */}
            {!infoExpanded && (
              <div className="sm:hidden pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
            )}
            </div>
            {/* 접기/펼치기 토글 (모바일 전용) */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                setInfoExpanded(!infoExpanded)
              }}
              className="sm:hidden w-full flex items-center justify-center pt-1 -mb-3 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={infoExpanded ? '프로젝트 정보 접기' : '프로젝트 정보 펼치기'}
            >
              {infoExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>

          {/* 안내 문구 */}
          <div className="mb-6 flex justify-center px-2">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-2 sm:p-3 md:p-4 shadow-sm w-fit max-w-full">
              <p
                className="text-yellow-700 text-center mb-2"
                style={{
                  fontSize: 'clamp(0.65rem, 2.6vw, 0.95rem)',
                  lineHeight: '1.4',
                  wordSpacing: '0.1em',
                  letterSpacing: '-0.01em'
                }}
              >
                안전관리시스템은 &ldquo;건설공사 사업관리방식 검토기준 및 업무수행지침&rdquo; 제16조(건설사업정보관리시스템 운영),{' '}
                <a
                  href="https://www.law.go.kr/%ED%96%89%EC%A0%95%EA%B7%9C%EC%B9%99/%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%EC%82%AC%EC%97%85%EA%B4%80%EB%A6%AC%EB%B0%A9%EC%8B%9D%EA%B2%80%ED%86%A0%EA%B8%B0%EC%A4%80%EB%B0%8F%EC%97%85%EB%AC%B4%EC%88%98%ED%96%89%EC%A7%80%EC%B9%A8/%EC%A0%9C48%EC%A1%B0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-500 underline"
                >
                  제48조(보고서 작성, 제출)
                </a>
                에 따라 구축 운영하는 &ldquo;사업관리시스템&rdquo;입니다.
              </p>
              <p
                className="font-bold text-yellow-800 text-center"
                style={{
                  fontSize: 'clamp(0.7rem, 3vw, 1.125rem)',
                  lineHeight: '1.4',
                  wordSpacing: '0.1em',
                  letterSpacing: '-0.01em'
                }}
              >
                ⚠️ 모든 서류는 출력 보관해야 효력이 있습니다 ⚠️
              </p>
            </div>
          </div>

          {/* 서류 캐비넷 — 좁은 화면에서는 줄 나눔 */}
          <div className="mb-10 flex justify-center">
            <div className="flex flex-wrap items-end justify-center gap-x-4 sm:gap-x-6 lg:gap-x-8 gap-y-10">
              {/* 시공사 일괄서명 만년필 펜통 — 캐비넷 좌측 (감독용은 발주청 캐비넷 안) */}
              <div className="transition-all duration-300" style={openCabinet ? recededStyle : undefined}>
                <PenHolderButton
                  label="시공사 일괄서명"
                  theme="blue"
                  badgeCount={contractorUnsignedCount ?? undefined}
                  onClick={() => setBulkSignSigner('contractor')}
                />
              </div>
              {project.business_card_pdf_url && (
                <div className="transition-all duration-300" style={openCabinet ? recededStyle : undefined}>
                  <BusinessCardEasel onClick={handleBusinessCardClick} />
                </div>
              )}
              {([
                '시공', '안전', '품질', '기타',
                // 발주청 캐비넷은 발주청 소속 사용자에게만 노출
                ...(userProfile?.role === '발주청' ? ['발주청'] : []),
              ] as Array<'시공' | '안전' | '품질' | '기타' | '발주청'>).map((name) => {
                const cabinet = (
                  <DocumentCabinet
                    key={name}
                    title={name}
                    titleSuffix={name === '시공' && constructionProgress !== null ? `(${constructionProgress}%)` : undefined}
                    pendingCount={name === '안전' ? (hqPendingCount || 0) + (safetyLedgerPendingCount || 0) + (managerPendingCount || 0) : name === '품질' ? qualityRejectionCount : undefined}
                    pendingVariant={name === '품질' ? 'blue' : 'red'}
                    pendingLabel={name === '품질' ? '반려' : '미조치'}
                    weatherLocation={name === '안전' ? {
                      address: project.actual_work_address || project.site_address,
                      latitude: project.latitude,
                      longitude: project.longitude,
                    } : undefined}
                    color={name === '시공' ? 'blue' : name === '안전' ? 'green' : name === '품질' ? 'amber' : name === '기타' ? 'slate' : 'purple'}
                    isOpen={openCabinet === name}
                    receded={openCabinet !== null && openCabinet !== name}
                    onClick={() => toggleCabinet(name)}
                  />
                )
                // 시공 캐비넷 아래에 공정률 조정 안내 문구 표시 (절대 배치 — 다른 캐비넷 정렬에 영향 없음)
                if (name === '시공' && constructionProgress !== null) {
                  return (
                    <div key={name} className="relative">
                      {cabinet}
                      <p className="absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap text-xs text-blue-100/70">
                        {'* 공정률 조정은 "작업일보", "공정표"에서 가능합니다.'}
                      </p>
                    </div>
                  )
                }
                // 발주청 캐비넷 바로 아래에 안내 문구 표시 (절대 배치 — 다른 캐비넷 정렬에 영향 없음)
                if (name === '발주청') {
                  return (
                    <div key={name} className="relative">
                      {cabinet}
                      <p className="absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap text-xs text-blue-100/70">
                        * 위 발주청 캐비넷은 발주청 사용자만 보입니다.
                      </p>
                    </div>
                  )
                }
                return cabinet
              })}
            </div>
          </div>

          {/* 문서철 그리드 - 시공 캐비넷 */}
          <CabinetDrawer open={openCabinet === '시공'} instantClose={openCabinet !== null}>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>P (계획)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="시공
서류
관리"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSdY1beSxNGj6niH6_jG7onccyQsUoIBfldYbIWsbMkc7VoQKA/viewform"
                  pdcaCategory="P"
                  bottomLabel="시공"
                />
                <DocumentFolder
                  title="공정표"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  onClick={() => router.push(`/project/${projectId}/work-schedule`)}
                  pdcaCategory="P"
                  bottomLabel="사업"
                />
                <DocumentFolder
                  title={'︵AI︶\n작업계획서'}
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.workPlans}
                  onClick={() => router.push(`/project/${projectId}/work-plan`)}
                  pdcaCategory="P"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>D (실행)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="AI 작업일보"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.workDailyReport}
                  onClick={() => router.push(`/project/${projectId}/work-daily-report`)}
                  bottomLabel="사업"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>C (점검)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="검사/검측
대장"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={inspectionRequestCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/inspection-request`)}
                  pdcaCategory="C"
                  bottomLabel="시공"
                />
              </div>
            </div>
          </div>
          </CabinetDrawer>

          {/* 문서철 그리드 - 품질 캐비넷 */}
          <CabinetDrawer open={openCabinet === '품질'} instantClose={openCabinet !== null}>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>P (계획)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="품질
서류
관리"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSeSTpnRsOBiy0myufl0itGdeDeVzfkYWeybqBhR7ThDef5HHw/viewform"
                  pdcaCategory="P"
                  bottomLabel="품질"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>D (실행)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="자재
수불부"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.materials}
                  onClick={() => router.push(`/project/${projectId}/material-ledger`)}
                  bottomLabel="사업"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>C (점검)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="품질시험
월례보고서"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={qualityMonthlyReportCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/quality-monthly-report`)}
                  pdcaCategory="C"
                  bottomLabel="품질"
                />
                <DocumentFolder
                  title="품질시험 결과 관리대장"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={qualityTestRecordCount ?? undefined}
                  badgeCount={qualityRejectionCount}
                  badgeVariant="blue"
                  onClick={() => router.push(`/project/${projectId}/quality-test-ledger`)}
                  pdcaCategory="C"
                  bottomLabel="품질"
                />
              </div>
            </div>
          </div>
          </CabinetDrawer>

          {/* 문서철 그리드 - 기타 캐비넷 */}
          <CabinetDrawer open={openCabinet === '기타'} instantClose={openCabinet !== null}>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>P (계획)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                {/* title의 원시 줄바꿈은 SWC가 공백으로 접어버려 2줄 렌더링이 무력화됨 — 표현식으로 \n을 명시 전달 */}
                <DocumentFolder
                  title={'계약 현황\n︵공사·용역︶'}
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={contractCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/contract-status`)}
                  pdcaCategory="P"
                  bottomLabel="계약"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>C (점검)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="단속·점검
방문일지"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={visitLogCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/inspection-visit-log`)}
                  pdcaCategory="C"
                  bottomLabel="시공"
                />
              </div>
            </div>
          </div>
          </CabinetDrawer>

          {/* 문서철 그리드 - PDCA 그룹핑 (안전 캐비넷) */}
          <CabinetDrawer open={openCabinet === '안전'} instantClose={openCabinet !== null}>
          <div className="flex flex-wrap justify-center gap-3">
            {/* P (계획) */}
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>P (계획)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="안전
서류
관리"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  docCount={cardCounts.safeDocuments}
                  onClick={() => router.push(`/project/${projectId}/safe-documents`)}
                  pdcaCategory="P"
                />
                <DocumentFolder
                  title="위험성평가 AI GPT"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  onClick={() => setRiskAssessmentChooserOpen(true)}
                  pdcaCategory="P"
                />
                <DocumentFolder
                  title="︵AI︶수시
위험성 평가"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  isPending={true}
                  onClick={() => router.push(`/project/${projectId}/risk-assessment`)}
                  pdcaCategory="P"
                />
              </div>
            </div>

            {/* D (실행) */}
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>D (실행)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="일일안전교육
︵AI TBM일지︶"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.tbm}
                  onClick={() => router.push(`/project/${projectId}/tbm-submission`)}
                  isProjectActive={project.is_active !== false}
                />
                <DocumentFolder
                  title="신규근로자
둘러보기"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.newWorkerOrientation}
                  onClick={() => router.push(`/project/${projectId}/new-worker-orientation`)}
                />
                <DocumentFolder
                  title="근로자
관리대장"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.workers}
                  onClick={() => router.push(`/project/${projectId}/worker-management`)}
                />
                <DocumentFolder
                  title="폭염대비점검"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.heatWave}
                  isProjectActive={project.is_active !== false}
                />
                <DocumentFolder
                  title="위험공종
작업허가제
︵PTW︶"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={ptwCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/ptw`)}
                />
              </div>
            </div>

            {/* C (점검) */}
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>C (점검)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="︵본부︶ 안전점검"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  projectName={project?.project_name}
                  managingBranch={project?.managing_branch}
                  onClick={() => router.push(`/project/${projectId}/headquarters-inspection`)}
                  badgeCount={hqPendingCount}
                  docCount={hqCount ?? undefined}
                  pdcaCategory="C"
                />
                {project?.managing_branch?.endsWith('지사') && (
                  <DocumentFolder
                    title="︵지사︶ 안전점검"
                    year={new Date().getFullYear().toString()}
                    isActive={false}
                    projectId={projectId}
                    projectName={project?.project_name}
                    managingBranch={project?.managing_branch}
                    onClick={() => router.push(`/project/${projectId}/manager-inspection`)}
                    badgeCount={managerPendingCount}
                    docCount={managerCount ?? undefined}
                    pdcaCategory="C"
                  />
                )}
                <DocumentFolder
                  title="정기점검
︵해빙,우기,
종합,특별︶"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  onClick={() => router.push(`/project/${projectId}/safety-inspection-ledger`)}
                  badgeCount={safetyLedgerPendingCount}
                  docCount={safetyLedgerCount ?? undefined}
                  pdcaCategory="C"
                />
                <DocumentFolder
                  title="지적사항
관리대장"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  onClick={() => router.push(`/project/${projectId}/issue-management`)}
                  docCount={issueLedgerCount ?? undefined}
                  pdcaCategory="C"
                />
                <DocumentFolder
                  title="안전점검 GPT"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  externalUrl="https://chatgpt.com/g/g-nsUeMuOdM-hangugnongeocongongsa-anjeonjeomgeom-caesbos"
                  pdcaCategory="C"
                />
                <DocumentFolder
                  title="︵AI︶
일일안전점검"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  isPending={true}
                  onClick={() => router.push(`/project/${projectId}/daily-inspection`)}
                  pdcaCategory="C"
                />
              </div>
            </div>

            {/* A (조치) */}
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>A (조치)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="휴일작업
관리대장"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  isPending={true}
                  onClick={() => router.push(`/project/${projectId}/holiday-work`)}
                  pdcaCategory="A"
                />
              </div>
            </div>
          </div>
          </CabinetDrawer>

          {/* 문서철 그리드 - 발주청 캐비넷 (안전·품질·기타 캐비넷과 공유하는 서류철은 같은 라우트로 연결) */}
          <CabinetDrawer open={openCabinet === '발주청'} instantClose={openCabinet !== null}>
          <div className="flex flex-wrap justify-center gap-3">
            {/* 감독 일괄서명 만년필 펜통 — 서랍 맨 좌측 */}
            <PenHolderButton
              label="감독 일괄서명"
              theme="purple"
              size="sm"
              className="self-end"
              badgeCount={supervisorUnsignedCount ?? undefined}
              onClick={() => setBulkSignSigner('supervisor')}
            />
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>P (계획)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title={'계약 현황\n︵공사·용역︶'}
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={contractCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/contract-status`)}
                  pdcaCategory="P"
                  bottomLabel="계약"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>D (실행)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="위험공종
작업허가제
︵PTW︶"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={ptwCount ?? undefined}
                  onClick={() => router.push(`/project/${projectId}/ptw`)}
                />
                <DocumentFolder
                  title="자재
수불부"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.materials}
                  onClick={() => router.push(`/project/${projectId}/material-ledger`)}
                  bottomLabel="사업"
                />
                <DocumentFolder
                  title="올바로
시스템"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  externalUrl="https://www.allbaro.or.kr"
                  bottomLabel="환경"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>C (점검)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="︵AI︶
공사감독 일지"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  onClick={() => router.push(`/project/${projectId}/supervisor-diary`)}
                  pdcaCategory="C"
                  bottomLabel="감독"
                />
                <DocumentFolder
                  title="지적사항
관리대장"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  onClick={() => router.push(`/project/${projectId}/issue-management`)}
                  docCount={issueLedgerCount ?? undefined}
                  pdcaCategory="C"
                />
                <DocumentFolder
                  title={'법적이행\n확인'}
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  onClick={() => router.push(`/project/${projectId}/legal-compliance`)}
                  docCount={legalComplianceCount ?? undefined}
                  pdcaCategory="C"
                  bottomLabel="사업"
                />
              </div>
            </div>
            <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>A (조치)</div>
              <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                <DocumentFolder
                  title="관리자 TBM
활동 점검"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  docCount={cardCounts.tbmSafetyInspection}
                  onClick={() => router.push(`/project/${projectId}/tbm-safety-inspection`)}
                  pdcaCategory="A"
                />
              </div>
            </div>
          </div>
          </CabinetDrawer>
        </div>
      </main>

      <footer className="w-full px-4 py-6 [&_p]:!text-blue-200/70 [&_p:first-child]:!text-blue-100">
        <CopyrightNotice withDivider={false} />
      </footer>

      {/* 폭염대비 점검 모달 */}
      {project && (
        <HeatWaveCheckModal
          isOpen={isHeatWaveModalOpen}
          onClose={handleCloseHeatWaveModal}
          project={project}
        />
      )}

      {/* 감독·시공사 일괄서명 모달 */}
      <BulkSignModal
        isOpen={bulkSignSigner !== null}
        onClose={() => {
          setBulkSignSigner(null)
          loadUnsignedCounts()
        }}
        projectId={projectId}
        projectName={project?.project_name}
        signer={bulkSignSigner ?? 'supervisor'}
      />

      {/* 프로젝트 인계 모달 */}
      <ProjectHandoverModal
        isOpen={handoverModal.isOpen}
        project={handoverModal.project}
        onClose={handleHandoverModalClose}
        onSuccess={handleHandoverModalClose}
      />

      {/* 프로젝트 공유 모달 */}
      <ProjectShareModal
        isOpen={shareModal.isOpen}
        project={shareModal.project}
        onClose={handleShareModalClose}
        onSuccess={handleShareModalClose}
      />

      {/* 네비게이션 선택 모달 */}
      <NavigationSelector
        isOpen={navigationModal.isOpen}
        address={navigationModal.address}
        onClose={handleNavigationModalClose}
      />

      {/* 공사감독 연락처 모달 */}
      {supervisorPhoneModal.isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSupervisorPhoneModal({ isOpen: false, phone: '', name: '', title: '' })}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{supervisorPhoneModal.title}</h3>
              <p className="text-gray-600">{supervisorPhoneModal.name}</p>
              <p className="text-xl font-bold text-gray-900 mt-2">{supervisorPhoneModal.phone}</p>
            </div>

            <div className="space-y-3">
              <a
                href={`tel:${supervisorPhoneModal.phone}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Phone className="h-5 w-5" />
                전화하기
              </a>
              <button
                onClick={handleCopyPhone}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {phoneCopied ? (
                  <>
                    <Check className="h-5 w-5 text-green-600" />
                    <span className="text-green-600">복사됨!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5" />
                    복사하기
                  </>
                )}
              </button>
              <button
                onClick={() => setSupervisorPhoneModal({ isOpen: false, phone: '', name: '', title: '' })}
                className="w-full px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <ProjectDeleteModal
        isOpen={deleteModal.isOpen}
        project={deleteModal.project}
        onClose={handleDeleteModalClose}
        onConfirm={handleDeleteConfirm}
      />

      {/* 위험성평가 도구 선택 모달 */}
      {riskAssessmentChooserOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setRiskAssessmentChooserOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">위험성평가 AI 도구 선택</h3>
              <p className="text-sm text-gray-500">사용할 도구를 선택해주세요</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => openRiskAssessmentTool(RISK_ASSESSMENT_GPTS_URL)}
                className="w-full flex flex-col items-start gap-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left"
              >
                <span className="font-semibold">GPTS</span>
                <span className="text-xs text-blue-100">ChatGPT 기반 위험성평가 작성 AI</span>
              </button>
              <button
                onClick={() => openRiskAssessmentTool(RISK_ASSESSMENT_AI_EXCEL_URL, true)}
                className="w-full flex flex-col items-start gap-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-left"
              >
                <span className="font-semibold">AI 엑셀 작성</span>
                <span className="text-xs text-emerald-100">위험성평가서 자동 작성 및 엑셀 다운로드</span>
              </button>
              <button
                onClick={() => setRiskAssessmentChooserOpen(false)}
                className="w-full px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
