'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Building, Phone, MoreVertical, Copy, Check, Video } from 'lucide-react'
import { Project, deleteProject } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import DocumentFolder from '@/components/project/DocumentFolder'
import HeatWaveCheckModal from '@/components/project/HeatWaveCheckModal'
import ProjectHandoverModal from '@/components/project/ProjectHandoverModal'
import ProjectShareModal from '@/components/project/ProjectShareModal'
import PWAInstallButtonHeader from '@/components/common/PWAInstallButtonHeader'
import NavigationSelector from '@/components/ui/NavigationSelector'

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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [handoverModal, setHandoverModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; project: Project | null }>({ isOpen: false, project: null })
  const [navigationModal, setNavigationModal] = useState<{ isOpen: boolean; address: string }>({ isOpen: false, address: '' })
  const [showEmail, setShowEmail] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [supervisorPhoneModal, setSupervisorPhoneModal] = useState<{ isOpen: boolean; phone: string; name: string; title: string }>({ isOpen: false, phone: '', name: '', title: '' })
  const [phoneCopied, setPhoneCopied] = useState(false)
  const [hqPendingCount, setHqPendingCount] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user && projectId) {
      loadProject()
    }
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

      setProject(data)

      // 본부 불시점검 미조치 건수 조회
      const { data: hqInspections } = await supabase
        .from('headquarters_inspections')
        .select('action_photo_issue1, action_photo_issue2, issue_content2, site_photo_issue2, issue1_status, issue2_status')
        .eq('project_id', projectId)

      if (hqInspections) {
        const pendingCount = hqInspections.filter(ins => {
          const hasIssue2 = Boolean((ins.issue_content2 && ins.issue_content2.trim()) || ins.site_photo_issue2)
          const issue1Done = Boolean(ins.action_photo_issue1) || ins.issue1_status === 'completed'
          const issue2Done = !hasIssue2 ? true : (Boolean(ins.action_photo_issue2) || ins.issue2_status === 'completed')
          return !(issue1Done && issue2Done)
        }).length
        setHqPendingCount(pendingCount)
      }

      // 프로젝트 생성인의 프로필 정보 조회
      if (data.created_by) {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', data.created_by)
          .single()

        if (!profileError && profileData) {
          setCreatorProfile(profileData)
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

  const handleDelete = async () => {
    setIsMenuOpen(false)
    if (!project) return

    const confirmed = confirm(`"${project.project_name}" 프로젝트를 삭제하시겠습니까?\n\n관련된 모든 점검 데이터도 함께 삭제됩니다.`)
    if (!confirmed) return

    try {
      const result = await deleteProject(project.id)
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

  const handleCCTVClick = () => {
    if (project?.cctv_rtsp_url) {
      window.open(project.cctv_rtsp_url, '_blank')
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

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
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
              <Building className="h-6 w-6 text-blue-600 mr-2 lg:mr-3 flex-shrink-0" />
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">{project.project_name}</h1>
              {project.cctv_rtsp_url && (
                <button
                  onClick={handleCCTVClick}
                  className="ml-2 lg:ml-3 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
                  title="CCTV 보기"
                >
                  <Video className="h-5 w-5" />
                </button>
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
      <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
        <div className="px-4 py-6 sm:px-0 lg:px-0">
          {/* 프로젝트 정보 */}
          <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
            {/* 점점점 메뉴 버튼 */}
            {(canEdit() || canHandover() || canDelete() || canShare()) && (
              <div className="absolute top-4 right-4" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                >
                  <MoreVertical className="h-5 w-5 text-gray-500" />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[100px]">
                    {canEdit() && !isSharedProject() && (
                      <button
                        onClick={handleEdit}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-md"
                      >
                        수정
                      </button>
                    )}
                    {canHandover() && !isSharedProject() && (
                      <button
                        onClick={handleHandover}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        인계
                      </button>
                    )}
                    {canShare() && (
                      <button
                        onClick={handleShare}
                        className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                      >
                        공유
                      </button>
                    )}
                    {canDelete() && (
                      <button
                        onClick={handleDelete}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 last:rounded-b-md"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
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
              </div>

              {/* 선택사항 정보 */}
              {(project.total_budget || project.current_year_budget || project.supervisor_position ||
                project.supervisor_name || project.actual_work_address || project.construction_law_safety_plan ||
                project.industrial_law_safety_ledger || (project as any).disaster_prevention_target || project.cctv_rtsp_url) && (
                  <>
                    <div className="border-t border-gray-200"></div>
                    <div className="text-sm text-gray-600">
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
                      {project.cctv_rtsp_url && (
                        <>
                          {' / '}
                          <button
                            onClick={handleCCTVClick}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                            title="CCTV 보기"
                          >
                            <Video className="h-4 w-4" />
                            <span className="underline">CCTV</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
            </div>
          </div>

          {/* 안내 문구 */}
          <div className="mb-6 mx-auto max-w-2xl px-2">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
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

          {/* 문서철 그리드 */}
          <div className="flex justify-center">
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 md:gap-4">
              {/* 폭염대비 점검 문서철 */}
              <DocumentFolder
                title="폭염대비점검"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isProjectActive={project.is_active !== false}
              />

              {/* 일일안전교육(TBM일지) 문서철 */}
              <DocumentFolder
                title="일일안전교육
︵TBM일지︶"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                onClick={() => router.push(`/project/${projectId}/tbm-submission`)}
                isProjectActive={project.is_active !== false}
              />

              {/* 안전서류 점검 문서철 */}
              <DocumentFolder
                title="안전서류
점검"
                year={new Date().getFullYear().toString()}
                isActive={false}
                onClick={() => router.push(`/project/${projectId}/safe-documents`)}
              />

              {/* 시공서류 점검 문서철 */}
              <DocumentFolder
                title="시공서류
점검"
                year={new Date().getFullYear().toString()}
                isActive={false}
                externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSdY1beSxNGj6niH6_jG7onccyQsUoIBfldYbIWsbMkc7VoQKA/viewform"
              />

              {/* 품질서류 점검 문서철 */}
              <DocumentFolder
                title="품질서류
점검"
                year={new Date().getFullYear().toString()}
                isActive={false}
                externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSeSTpnRsOBiy0myufl0itGdeDeVzfkYWeybqBhR7ThDef5HHw/viewform"
              />

              {/* 위험성평가 AI GPT 문서철 */}
              <DocumentFolder
                title="위험성평가 AI GPT"
                year={new Date().getFullYear().toString()}
                isActive={false}
                externalUrl="https://chatgpt.com/g/g-uhvOsghT3-hangugnongeocongongsa-wiheomseongpyeongga-jagseong-ai"
              />

              {/* 근로자 관리대장 문서철 */}
              <DocumentFolder
                title="근로자
관리대장"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                onClick={() => router.push(`/project/${projectId}/worker-management`)}
              />

              {/* 자재 수불부 문서철 - 고대 문서 스타일 */}
              <DocumentFolder
                title="자재
수불부"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                onClick={() => router.push(`/project/${projectId}/material-ledger`)}
                isAncientDocument={true}
              />

              {/* 지사 안전점검 문서철 - 00지사인 경우에만 표시 */}
              {project?.managing_branch?.endsWith('지사') && (
                <DocumentFolder
                  title="︵지사︶ 안전점검"
                  year={new Date().getFullYear().toString()}
                  isActive={false}
                  projectId={projectId}
                  projectName={project?.project_name}
                  managingBranch={project?.managing_branch}
                  onClick={() => router.push(`/project/${projectId}/manager-inspection`)}
                />
              )}

              {/* 본부 안전점검 문서철 - 모든 프로젝트에 표시 */}
              <DocumentFolder
                title="︵본부︶ 안전점검"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                projectName={project?.project_name}
                managingBranch={project?.managing_branch}
                onClick={() => router.push(`/project/${projectId}/headquarters-inspection`)}
                badgeCount={hqPendingCount}
              />

              {/* TBM안전활동 점검표(감독) 문서철 */}
              <DocumentFolder
                title="TBM안전활동
점검표︵감독︶"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                onClick={() => router.push(`/project/${projectId}/tbm-safety-inspection`)}
              />

              {/* 휴일작업 관리대장 문서철 */}
              <DocumentFolder
                title="휴일작업
관리대장"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isPending={true}
                onClick={() => router.push(`/project/${projectId}/holiday-work`)}
              />

              {/* ︵AI︶수시 위험성 평가 문서철 */}
              <DocumentFolder
                title="︵AI︶수시
위험성 평가"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isPending={true}
                onClick={() => router.push(`/project/${projectId}/risk-assessment`)}
              />

              {/* 위험공종 작업허가제(PTW) 문서철 */}
              <DocumentFolder
                title="위험공종
작업허가제
︵PTW︶"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isPending={true}
                onClick={() => router.push(`/project/${projectId}/ptw`)}
              />

              {/* 안전점검 관리대장 문서철 */}
              <DocumentFolder
                title="안전점검
관리대장
︵해빙기, 우기,
종합, 특별︶"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isPending={true}
                onClick={() => router.push(`/project/${projectId}/safety-inspection-ledger`)}
              />

              {/* 일일안전점검 문서철 */}
              <DocumentFolder
                title="︵AI︶
일일안전점검"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isPending={true}
                onClick={() => router.push(`/project/${projectId}/daily-inspection`)}
              />

              {/* (자동) 지적사항 관리대장 문서철 */}
              <DocumentFolder
                title="︵자동︶
지적사항
관리대장"
                year={new Date().getFullYear().toString()}
                isActive={false}
                projectId={projectId}
                isPending={true}
                onClick={() => router.push(`/project/${projectId}/issue-management`)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* 폭염대비 점검 모달 */}
      {project && (
        <HeatWaveCheckModal
          isOpen={isHeatWaveModalOpen}
          onClose={handleCloseHeatWaveModal}
          project={project}
        />
      )}

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

    </div>
  )
} 