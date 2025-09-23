'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Shield, Users, AlertTriangle, CheckCircle, Activity, LogOut, Plus, Building, Map, List, Calendar, Thermometer, ChevronDown, Mail, Edit, Trash2, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { getUserProjects, getProjectsByUserBranch, getHeatWaveChecksByUserBranch, deleteProject, getAllProjectsDebug, type Project, type ProjectWithCoords, type HeatWaveCheck } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import ProjectCard from '@/components/project/ProjectCard'
import ProjectDeleteModal from '@/components/project/ProjectDeleteModal'
import KakaoMap from '@/components/ui/KakaoMap'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ProfileEditModal from '@/components/auth/ProfileEditModal'

const Dashboard: React.FC = () => {
  const { user, userProfile, signOut } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsWithCoords, setProjectsWithCoords] = useState<ProjectWithCoords[]>([])
  const [heatWaveChecks, setHeatWaveChecks] = useState<HeatWaveCheck[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'map' | 'list' | 'safety'>('map') // 발주청용 뷰 모드
  const [selectedHq, setSelectedHq] = useState<string>('') // 선택된 본부
  const [selectedBranch, setSelectedBranch] = useState<string>('') // 선택된 지사
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  })
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    project: Project | null
  }>({
    isOpen: false,
    project: null
  })
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isProfileEditModalOpen, setIsProfileEditModalOpen] = useState(false)
  const [selectedSafetyCard, setSelectedSafetyCard] = useState<string | null>(null)
  const [isAccountDeleteModalOpen, setIsAccountDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // URL 파라미터에서 view 모드 읽기
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const viewParam = urlParams.get('view')
      if (viewParam === 'list') {
        setViewMode('list')
      } else if (viewParam === 'map') {
        setViewMode('map')
      } else if (viewParam === 'safety') {
        setViewMode('safety')
      }
    }
  }, [])

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

  // 사용자 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 사용자 프로젝트 목록 로드
  useEffect(() => {
    if (user && userProfile) {
      if (userProfile.role === '발주청') {
        loadBranchProjects()
      } else {
        loadUserProjects()
      }
    }
  }, [user, userProfile])

  // 발주자 로그인 시 소속 정보 기본값 설정
  useEffect(() => {
    if (userProfile && userProfile.role === '발주청') {
      if (userProfile.hq_division && !selectedHq) {
        setSelectedHq(userProfile.hq_division)
      }
      if (userProfile.branch_division && !selectedBranch) {
        // "본부"로 끝나는 지사명인 경우 지사는 전체로 설정
        if (userProfile.branch_division.endsWith('본부')) {
          setSelectedBranch('')
        } else {
          setSelectedBranch(userProfile.branch_division)
        }
      }
    }
  }, [userProfile, selectedHq, selectedBranch])

  // 안전현황 모드일 때 폭염점검 데이터 로드
  useEffect(() => {
    if (user && userProfile && userProfile.role === '발주청' && viewMode === 'safety') {
      loadHeatWaveChecks()
    }
  }, [user, userProfile, viewMode, selectedDate])

  const loadUserProjects = async () => {
    if (!user) return
    
    setLoading(true)
    setError('')
    
    try {
      const result = await getUserProjects()
      if (result.success && result.projects) {
        setProjects(result.projects)
      } else {
        setError(result.error || '프로젝트를 불러오는데 실패했습니다.')
      }
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadBranchProjects = async () => {
    if (!userProfile) return
    
    setLoading(true)
    setError('')
    
    try {
      console.log('발주청 프로젝트 조회 시작:', userProfile)
      
      // 디버깅용: 모든 프로젝트 데이터 확인
      await getAllProjectsDebug()
      
      const result = await getProjectsByUserBranch(userProfile)
      if (result.success && result.projects) {
        console.log(`조회된 프로젝트 수: ${result.projects.length}`)
        setProjects(result.projects)
        
        // 좌표 정보가 있는 프로젝트들로 설정 (API 호출 없이)
        if (result.projects.length > 0) {
          console.log('프로젝트 좌표 설정...')
          const projectsWithCoords = result.projects.map(project => ({
            ...project,
            coords: project.latitude && project.longitude ? {
              lat: project.latitude,
              lng: project.longitude
            } : undefined
          }))
          setProjectsWithCoords(projectsWithCoords)
          console.log('좌표 설정 완료:', projectsWithCoords.filter(p => p.coords).length)
        }
      } else {
        setError(result.error || '프로젝트를 불러오는데 실패했습니다.')
      }
    } catch (err: any) {
      console.error('발주청 프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadHeatWaveChecks = async () => {
    if (!userProfile || userProfile.role !== '발주청') return

    try {
      setLoading(true)
      console.log('폭염점검 데이터 조회 시작:', selectedDate)
      
      const result = await getHeatWaveChecksByUserBranch(userProfile, selectedDate)
      if (result.success && result.checks) {
        console.log(`조회된 폭염점검 수: ${result.checks.length}`)
        setHeatWaveChecks(result.checks)
      } else {
        setError(result.error || '폭염점검 데이터를 불러오는데 실패했습니다.')
      }
    } catch (err: any) {
      console.error('폭염점검 데이터 로드 실패:', err)
      setError(err.message || '폭염점검 데이터를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('로그아웃 실패:', error)
    }
  }

  const handleUserMenuToggle = () => {
    setIsUserMenuOpen(!isUserMenuOpen)
  }

  const handleProfileEdit = () => {
    setIsUserMenuOpen(false)
    setIsProfileEditModalOpen(true)
  }

  const handleAccountDelete = () => {
    setIsUserMenuOpen(false)
    setIsAccountDeleteModalOpen(true)
  }

  const handleAccountDeleteConfirm = async () => {
    if (deleteConfirmText !== '삭제') {
      alert('정확히 "삭제"라고 입력해주세요.')
      return
    }

    if (!user) {
      alert('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setIsDeleting(true)
    try {
      // 1. CASCADE 설정으로 user_profiles 삭제 시 관련 데이터가 자동으로 삭제됨
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', user.id)

      if (profileError) {
        throw new Error(profileError.message)
      }

      // 2. Authentication 사용자도 삭제 시도
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
        if (authError) {
          console.warn('Auth 사용자 삭제 실패 (권한 부족일 수 있음):', authError)
        }
      } catch (authDeleteError) {
        console.warn('Auth 사용자 삭제 시도 실패:', authDeleteError)
      }

      alert('계정과 관련된 모든 데이터가 성공적으로 삭제되었습니다.')
      await signOut()
      router.push('/login')
      
    } catch (error) {
      console.error('계정 삭제 실패:', error)
      alert('계정 삭제 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsDeleting(false)
      setIsAccountDeleteModalOpen(false)
      setDeleteConfirmText('')
    }
  }

  const handleAccountDeleteCancel = () => {
    setIsAccountDeleteModalOpen(false)
    setDeleteConfirmText('')
  }

  const handleSiteRegistration = () => {
    router.push('/project/new')
  }

  const handleProjectClick = (project: Project) => {
    console.log('프로젝트 클릭:', project.id, project.name)
    try {
      router.push(`/project/${project.id}`)
      console.log('라우터 push 성공:', `/project/${project.id}`)
    } catch (error) {
      console.error('라우터 push 오류:', error)
    }
  }

  const handleProjectEdit = (project: Project) => {
    // 프로젝트 수정 페이지로 이동
    router.push(`/project/${project.id}/edit`)
  }

  const handleProjectDelete = async (project: Project) => {
    setDeleteModal({
      isOpen: true,
      project
    })
  }

  const handleDeleteModalClose = () => {
    setDeleteModal({
      isOpen: false,
      project: null
    })
  }

  const handleDeleteConfirm = async (projectId: string) => {
    try {
      const result = await deleteProject(projectId)
      
      if (result.success) {
        // 성공 시 프로젝트 목록 새로고침
        if (userProfile?.role === '발주청') {
          await loadBranchProjects()
        } else {
          await loadUserProjects()
        }
        alert('프로젝트가 성공적으로 삭제되었습니다.')
      } else {
        throw new Error(result.error || '프로젝트 삭제에 실패했습니다.')
      }
    } catch (err: any) {
      console.error('프로젝트 삭제 실패:', err)
      alert(err.message || '프로젝트 삭제에 실패했습니다.')
      throw err // 모달에서 로딩 상태 해제를 위해 다시 throw
    }
  }

  const handleMapProjectClick = (project: any) => {
    console.log('지도 마커 클릭:', project)
    router.push(`/project/${project.id}`)
  }

  const handleHeatWaveCheckClick = (check: HeatWaveCheck) => {
    console.log('폭염점검 행 클릭:', check.project_name, check.project_id)
    router.push(`/project/${check.project_id}/heatwave`)
  }

  // 발주청용 대시보드 렌더링
  const renderClientDashboard = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center min-h-[60vh]">
          <LoadingSpinner />
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-sm text-red-700">{error}</div>
          <button 
            onClick={loadBranchProjects}
            className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (projects.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="text-center mb-8">
            <Building className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              프로젝트 관리 시스템
            </h2>
            <p className="text-gray-600 max-w-md">
              {userProfile?.hq_division} {userProfile?.branch_division && `${userProfile.branch_division} `}
              관할 프로젝트가 없습니다.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              등록된 프로젝트가 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              새로운 프로젝트를 등록하여 관리하세요.
            </p>
            <button
              onClick={handleSiteRegistration}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              프로젝트 등록
            </button>
          </div>
        </div>
      )
    }

    // 선택된 본부/지사에 따라 프로젝트 필터링
    const filteredProjects = projects.filter(project => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })

    const filteredProjectsWithCoords = projectsWithCoords.filter(project => {
      if (selectedHq && project.managing_hq !== selectedHq) return false
      if (selectedBranch && project.managing_branch !== selectedBranch) return false
      return true
    })

    // 좌표가 있는 프로젝트만 지도에 표시
    const projectsForMap = filteredProjectsWithCoords
      .filter(project => project.coords)
      .map(project => ({
        id: project.id,
        name: project.project_name,
        address: project.site_address,
        lat: project.coords!.lat,
        lng: project.coords!.lng,
        managingHq: project.managing_hq,
        managingBranch: project.managing_branch
      }))

    return (
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
          <div className="flex-1">
            <h2 className="text-lg lg:text-2xl font-bold text-gray-900">
              관할 프로젝트 현황
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mt-2">
              {/* 본부/지사 선택 드롭다운 */}
              <div className="flex items-center space-x-2">
                <select
                  value={selectedHq}
                  onChange={(e) => {
                    setSelectedHq(e.target.value)
                    setSelectedBranch('') // 본부 변경 시 지사 초기화
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">전체 본부</option>
                  {HEADQUARTERS_OPTIONS.map(hq => (
                    <option key={hq} value={hq}>{hq}</option>
                  ))}
                </select>
                
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                  disabled={!selectedHq}
                >
                  <option value="">전체 지사</option>
                  {selectedHq && BRANCH_OPTIONS[selectedHq]?.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>
              
              <p className="text-gray-600 text-sm">
                프로젝트 총 {filteredProjects.length}개
              </p>
            </div>
          </div>
          
          {/* 뷰 모드 전환 버튼 */}
          <div className="flex bg-gray-100 rounded-lg p-1 ml-auto">
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center px-2 lg:px-3 py-2 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                viewMode === 'map'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Map className="h-3 w-3 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">지도 보기</span>
              <span className="sm:hidden">지도</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center px-2 lg:px-3 py-2 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List className="h-3 w-3 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">목록 보기</span>
              <span className="sm:hidden">목록</span>
            </button>
            <button
              onClick={() => setViewMode('safety')}
              className={`flex items-center px-2 lg:px-3 py-2 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                viewMode === 'safety'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Shield className="h-3 w-3 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">안전현황</span>
              <span className="sm:hidden">안전</span>
            </button>
          </div>
        </div>

        {/* 컨텐츠 영역 */}
        {viewMode === 'map' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <KakaoMap
              key={`map-${windowSize.width}-${windowSize.height}`}
              projects={projectsForMap}
              onProjectClick={handleMapProjectClick}
              height="400px"
              className="w-full"
            />
          </div>
        ) : viewMode === 'safety' ? (
          <div className="space-y-6">
            {/* 헤더 및 날짜 선택 */}
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
              <div>
                <h3 className="text-lg lg:text-xl font-semibold text-gray-900 flex items-center">
                  <Shield className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600 mr-2" />
                  안전현황
                </h3>
                <p className="text-sm lg:text-base text-gray-600 mt-1">
                  관할 프로젝트들의 안전점검 현황을 확인할 수 있습니다.
                </p>
              </div>
              <div className="flex items-center justify-end lg:justify-start space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 lg:px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* 안전점검 카드들 또는 상세 테이블 */}
            {selectedSafetyCard === 'heatwave' ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                {/* 뒤로가기 버튼 */}
                <div className="p-4 border-b border-gray-200">
                  <button
                    onClick={() => setSelectedSafetyCard(null)}
                    className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    안전현황으로 돌아가기
                  </button>
                </div>

                {/* 폭염점검 결과 테이블 */}
                <div className="p-6">
                  {loading ? (
                    <div className="flex justify-center items-center py-12">
                      <LoadingSpinner />
                    </div>
                  ) : (() => {
                    // 선택된 본부/지사에 따라 폭염점검 데이터 필터링
                    const filteredHeatWaveChecks = heatWaveChecks.filter(check => {
                      if (selectedHq && check.managing_hq !== selectedHq) return false
                      if (selectedBranch && check.managing_branch !== selectedBranch) return false
                      return true
                    })

                    return filteredHeatWaveChecks.length === 0 ? (
                      <div className="text-center py-12">
                        <Thermometer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-900 mb-2">
                          점검 데이터가 없습니다
                        </h4>
                        <p className="text-gray-600">
                          {selectedHq || selectedBranch 
                            ? `선택한 ${selectedHq ? selectedHq + ' ' : ''}${selectedBranch ? selectedBranch + ' ' : ''}지역의 선택한 날짜(${selectedDate})에 등록된 폭염점검 결과가 없습니다.`
                            : `선택한 날짜(${selectedDate})에 등록된 폭염점검 결과가 없습니다.`
                          }
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                프로젝트명
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                측정시간
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                체감온도
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                물
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                바람그늘
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                휴식
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                보냉장구
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                응급조치
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                작업시간조정
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filteredHeatWaveChecks.map((check) => (
                            <tr 
                              key={check.id} 
                              className="hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => handleHeatWaveCheckClick(check)}
                            >
                              <td className="px-6 py-4 text-sm font-medium text-blue-600 hover:text-blue-800">
                                <div className="flex flex-col">
                                  <span className="font-medium">{check.project_name}</span>
                                  <span className="text-xs text-gray-500">({check.managing_branch})</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(check.check_time).toLocaleTimeString('ko-KR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: false 
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  check.feels_like_temp >= 35 
                                    ? 'bg-red-100 text-red-800'
                                    : check.feels_like_temp >= 30
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {check.feels_like_temp}℃
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                  check.water_supply ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {check.water_supply ? 'O' : 'X'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                  check.ventilation ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {check.ventilation ? 'O' : 'X'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                  check.rest_time ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {check.rest_time ? 'O' : 'X'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                  check.cooling_equipment ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {check.cooling_equipment ? 'O' : 'X'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                  check.emergency_care ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {check.emergency_care ? 'O' : 'X'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                  check.work_time_adjustment ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {check.work_time_adjustment ? 'O' : 'X'}
                                </span>
                              </td>
                            </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {/* 폭염대비점검 카드 */}
                <div 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedSafetyCard('heatwave')}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center mb-2">
                      <Thermometer className="h-4 w-4 text-red-600" />
                    </div>
                    <h4 className="text-xs font-medium text-gray-900 mb-1">폭염대비점검</h4>
                    {loading ? (
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                      </div>
                    ) : (() => {
                      // 선택된 본부/지사에 따라 폭염점검 데이터 필터링
                      const filteredHeatWaveChecks = heatWaveChecks.filter(check => {
                        if (selectedHq && check.managing_hq !== selectedHq) return false
                        if (selectedBranch && check.managing_branch !== selectedBranch) return false
                        return true
                      })
                      
                      return (
                        <div className="text-xs text-gray-600">
                          <div className="text-sm font-semibold text-blue-600 mb-0.5">
                            {filteredHeatWaveChecks.length}
                          </div>
                          <div className="text-xs">건 점검완료</div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 빈 카드들 */}
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-md transition-shadow">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                        <Shield className="h-4 w-4 text-gray-400" />
                      </div>
                      <h4 className="text-xs font-medium text-gray-400 mb-1">준비중</h4>
                      <div className="text-xs text-gray-400">
                        <div className="text-sm font-semibold mb-0.5">-</div>
                        <div className="text-xs">점검 항목</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={handleProjectClick}
                onEdit={handleProjectEdit}
                onDelete={handleProjectDelete}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // 시공사/감리단용 대시보드
  const renderContractorDashboard = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center min-h-[60vh]">
          <LoadingSpinner />
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-sm text-red-700">{error}</div>
          <button 
            onClick={loadUserProjects}
            className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (projects.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="text-center mb-8">
            <Building className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              현장 관리 시스템
            </h2>
            <p className="text-gray-600 max-w-md">
              {userProfile?.role === '시공사' ? '시공' : '감리'} 업무를 위한 현장을 등록하고 관리하세요.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              등록된 현장이 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              새로운 현장을 등록하여 안전관리를 시작하세요.
            </p>
            <button
              onClick={handleSiteRegistration}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              현장 등록
            </button>
          </div>
        </div>
      )
    }

    return (
      <div>
        {/* 프로젝트 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={handleProjectClick}
              onEdit={handleProjectEdit}
              onDelete={handleProjectDelete}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center flex-1 min-w-0">
              <Shield className="h-6 w-6 lg:h-8 lg:w-8 text-blue-600 mr-2 lg:mr-3 flex-shrink-0" />
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">안전관리 시스템</h1>
            </div>
            <div className="flex items-center space-x-2 lg:space-x-4">
              {/* 사용자 드롭다운 메뉴 */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={handleUserMenuToggle}
                  className="flex items-center space-x-1 px-3 py-2 text-xs lg:text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <span className="font-medium hidden sm:inline">{userProfile?.full_name || user?.email}</span>
                  <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role || '사용자'})</span>
                  <ChevronDown className="h-4 w-4 ml-1" />
                </button>

                {/* 드롭다운 메뉴 */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                    {/* 이메일 주소 */}
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4" />
                        <span className="truncate">{user?.email}</span>
                      </div>
                    </div>
                    
                    {/* 정보 수정 */}
                    <button
                      onClick={handleProfileEdit}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                      <span>정보 수정</span>
                    </button>
                    
                    {/* 계정 삭제 */}
                    <button
                      onClick={handleAccountDelete}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>계정 삭제</span>
                    </button>
                    
                    {/* 구분선 */}
                    <div className="border-t border-gray-100 my-1"></div>
                    
                    {/* 로그아웃 */}
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>로그아웃</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {userProfile?.role === '발주청' 
            ? renderClientDashboard() 
            : renderContractorDashboard()
          }
        </div>
      </main>

      {/* 플로팅 현장 등록 버튼 */}
      <div className="fixed bottom-6 right-6">
        <button
          onClick={handleSiteRegistration}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
        >
          <Plus className="h-6 w-6" />
          <span className="font-medium">현장 등록</span>
        </button>
      </div>

      {/* 삭제 확인 모달 */}
      <ProjectDeleteModal
        isOpen={deleteModal.isOpen}
        project={deleteModal.project}
        onClose={handleDeleteModalClose}
        onConfirm={handleDeleteConfirm}
      />

      {/* 프로필 수정 모달 */}
      <ProfileEditModal
        isOpen={isProfileEditModalOpen}
        onClose={() => setIsProfileEditModalOpen(false)}
        onSuccess={() => {
          // 프로필 업데이트 성공 시 추가 작업이 필요하면 여기에 작성
        }}
      />

      {/* 계정 삭제 확인 모달 */}
      {isAccountDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                계정 삭제
              </h3>
              
              <div className="text-sm text-gray-500 text-center mb-6">
                <p className="mb-2">
                  계정을 삭제하면 다음 데이터가 모두 삭제됩니다:
                </p>
                <ul className="text-left space-y-1">
                  <li>• 계정 정보 및 프로필</li>
                  <li>• 등록한 모든 프로젝트</li>
                  <li>• 모든 점검 결과 및 기록</li>
                </ul>
                <p className="mt-4 font-medium text-red-600">
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  계속하려면 <span className="font-bold text-red-600">"삭제"</span>를 정확히 입력하세요:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="삭제"
                  disabled={isDeleting}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleAccountDeleteCancel}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleAccountDeleteConfirm}
                  disabled={isDeleting || deleteConfirmText !== '삭제'}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? '삭제 중...' : '계정 삭제'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard 