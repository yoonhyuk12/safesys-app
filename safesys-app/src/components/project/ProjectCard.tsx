'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Building, MapPin, MoreVertical } from 'lucide-react'
import { Project } from '@/lib/projects'

interface ProjectCardProps {
  project: Project
  onEdit?: (project: Project) => void
  onDelete?: (project: Project) => void
  onClick?: (project: Project) => void
  onStatusChange?: (project: Project, isActive: boolean) => void
  canEditQuarters?: boolean
  onIsActiveChange?: (project: Project, isActive: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
  onHandover?: (project: Project) => void
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onEdit,
  onDelete,
  onClick,
  onStatusChange,
  canEditQuarters,
  onIsActiveChange,
  onHandover
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isActive, setIsActive] = useState(project.is_active !== false)
  // 서버 is_active(JSON/boolean) 기반 초기화
  const initial = (() => {
    const ia: any = project.is_active
    if (typeof ia === 'object' && ia) return ia
    // boolean 호환: true면 분기 ON, false면 모두 OFF
    if (ia === true) return { q1: true, q2: true, q3: true, q4: true, completed: false }
    return { q1: false, q2: false, q3: false, q4: false, completed: false }
  })()
  const [q1Active, setQ1Active] = useState<boolean>(!!initial.q1)
  const [q2Active, setQ2Active] = useState<boolean>(!!initial.q2)
  const [q3Active, setQ3Active] = useState<boolean>(!!initial.q3)
  const [q4Active, setQ4Active] = useState<boolean>(!!initial.q4)
  const [completed, setCompleted] = useState<boolean>(!!initial.completed)
  const menuRef = useRef<HTMLDivElement>(null)

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

  const handleCardClick = (e: React.MouseEvent) => {
    console.log('카드 클릭됨:', project.project_name)
    console.log('클릭 이벤트:', e.target)
    if (onClick) {
      console.log('onClick 함수 호출')
      onClick(project)
    } else {
      console.log('onClick 함수가 없음')
    }
  }

  const handleMenuClick = (e: React.MouseEvent, action: 'edit' | 'delete' | 'handover') => {
    e.stopPropagation()
    setIsMenuOpen(false)
    if (action === 'edit' && onEdit) {
      onEdit(project)
    } else if (action === 'delete' && onDelete) {
      onDelete(project)
    } else if (action === 'handover' && onHandover) {
      onHandover(project)
    }
  }

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMenuOpen(!isMenuOpen)
  }

  // 서버 연동: 세그먼트 클릭 → 옵티미스틱 업데이트 → PATCH → 실패 시 롤백
  const handleQuarterClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    key: 'q1_active' | 'q2_active' | 'q3_active' | 'q4_active' | 'completed'
  ) => {
    e.stopPropagation()

    // 현재 상태 파악
    const current = {
      q1_active: q1Active,
      q2_active: q2Active,
      q3_active: q3Active,
      q4_active: q4Active,
      completed: completed
    }

    const toggled = !current[key]

    const prev = { q1: q1Active, q2: q2Active, q3: q3Active, q4: q4Active, completed }
    const applyLocal = (next: typeof prev) => {
      setQ1Active(next.q1)
      setQ2Active(next.q2)
      setQ3Active(next.q3)
      setQ4Active(next.q4)
      setCompleted(next.completed)
    }

    if (key === 'completed') {
      const next = toggled
        ? { q1: false, q2: false, q3: false, q4: false, completed: true }
        : { ...prev, completed: false }
      // 옵티미스틱 적용
      applyLocal(next)
      if (onIsActiveChange) onIsActiveChange(project, next)
      void syncToServer(next)
      return
    }

    const next = (() => {
      const base = { ...prev }
      if (key === 'q1_active') base.q1 = toggled
      if (key === 'q2_active') base.q2 = toggled
      if (key === 'q3_active') base.q3 = toggled
      if (key === 'q4_active') base.q4 = toggled
      if (base.q1 || base.q2 || base.q3 || base.q4) base.completed = false
      return base
    })()
    applyLocal(next)
    if (onIsActiveChange) onIsActiveChange(project, next)
    void syncToServer(next)
  }

  const segmentClass = (active: boolean) =>
    active
      ? 'bg-green-100 text-green-800 border-green-300'
      : 'bg-gray-100 text-gray-700 border-gray-300'

  // 서버 PATCH 동기화
  const syncToServer = async (state: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('인증 필요')

      const res = await fetch(`/api/projects/${project.id}/quarters`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          q1: state.q1,
          q2: state.q2,
          q3: state.q3,
          q4: state.q4,
          completed: state.completed
        })
      })
      if (!res.ok) throw new Error('업데이트 실패')
      const result = await res.json()
      if (!result.success) throw new Error(result.error || '업데이트 실패')
    } catch (err) {
      // 롤백: 서버 실패 시 기존 상태 복구 필요. 간단히 새로고침 제안 또는 알림.
      console.error('quarters 업데이트 실패:', err)
      alert('상태 동기화에 실패했습니다. 새로고침 후 다시 시도해주세요.')
    }
  }

  const handleStatusToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const newStatus = e.target.checked
    
    try {
      // Supabase에서 현재 세션 토큰 가져오기
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('인증 토큰이 없습니다.')
      }

      // API 호출로 데이터베이스 업데이트 (상대 경로 사용)
      const apiUrl = `/api/projects/${project.id}/status`
      console.log('API 호출 URL:', apiUrl)
      
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          is_active: newStatus
        })
      })

      if (!response.ok) {
        throw new Error('상태 업데이트 실패')
      }

      const result = await response.json()
      
      if (result.success) {
        setIsActive(newStatus)
        if (onStatusChange) {
          onStatusChange(project, newStatus)
        }
      } else {
        throw new Error(result.error || '상태 업데이트 실패')
      }
    } catch (error) {
      console.error('프로젝트 상태 업데이트 오류:', error)
      // 오류 발생 시 스위치를 원래 상태로 되돌림
      setIsActive(!newStatus)
      alert('상태를 변경할 수 없습니다. 다시 시도해주세요.')
    }
  }

  // 인계 필요 여부: 생성자 프로필 역할이 발주청인 경우
  const handoverRequired = project.user_profiles?.role === '발주청'

  return (
    <div 
      className="group bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 cursor-pointer p-3 relative"
      onClick={handleCardClick}
    >
      {/* 인계 필요 배지 */}
      {handoverRequired && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
            인계 필요
          </span>
        </div>
      )}

      {/* 프로젝트 정보 */}
      <div className="space-y-2">
        {/* 프로젝트명 */}
        <h3 className="text-sm font-semibold text-gray-900 leading-tight" style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {project.project_name}
        </h3>
        
        {/* 관할 본부 및 지사 */}
        <div className="flex items-center text-xs text-gray-600">
          <Building className="h-3 w-3 mr-1 flex-shrink-0" />
          <span className="truncate">
            {project.managing_hq} • {project.managing_branch}
          </span>
        </div>
        
        {/* 기본 주소 */}
        {project.site_address && (
          <div className="flex items-start text-xs text-gray-500 mt-1 mb-6">
            <MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
            <span className="leading-tight text-xs" style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {project.site_address}
            </span>
          </div>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div className={`absolute bottom-2 left-2 right-2 flex items-center ${canEditQuarters ? 'justify-between' : 'justify-end'}`}>
        {/* 분기/준공 5분할 세그먼트 (발주청만 표시) */}
        {canEditQuarters && (
        <div className="inline-flex items-center select-none" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`px-1 lg:px-2 py-1 text-[11px] border ${segmentClass(q1Active)} rounded-l-md`}
            onClick={(e) => handleQuarterClick(e, 'q1_active')}
          >
            <span className="lg:hidden">Q1</span>
            <span className="hidden lg:inline">1분기</span>
          </button>
          <button
            type="button"
            className={`px-1 lg:px-2 py-1 text-[11px] border -ml-px ${segmentClass(q2Active)}`}
            onClick={(e) => handleQuarterClick(e, 'q2_active')}
          >
            <span className="lg:hidden">Q2</span>
            <span className="hidden lg:inline">2분기</span>
          </button>
          <button
            type="button"
            className={`px-1 lg:px-2 py-1 text-[11px] border -ml-px ${segmentClass(q3Active)}`}
            onClick={(e) => handleQuarterClick(e, 'q3_active')}
          >
            <span className="lg:hidden">Q3</span>
            <span className="hidden lg:inline">3분기</span>
          </button>
          <button
            type="button"
            className={`px-1 lg:px-2 py-1 text-[11px] border -ml-px ${segmentClass(q4Active)}`}
            onClick={(e) => handleQuarterClick(e, 'q4_active')}
          >
            <span className="lg:hidden">Q4</span>
            <span className="hidden lg:inline">4분기</span>
          </button>
          <button
            type="button"
            className={`px-1 lg:px-2 py-1 text-[11px] border -ml-px ${segmentClass(completed)} rounded-r-md`}
            onClick={(e) => handleQuarterClick(e, 'completed')}
          >
            <span className="lg:hidden">준</span>
            <span className="hidden lg:inline">준공</span>
          </button>
        </div>
        )}

        {/* 액션 메뉴 */}
        {(onEdit || onDelete || onHandover) && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={toggleMenu}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <MoreVertical className="h-4 w-4 text-gray-500" />
            </button>
            
            {isMenuOpen && (
              <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-20">
                {onEdit && (
                  <button
                    onClick={(e) => handleMenuClick(e, 'edit')}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 first:rounded-t-md"
                  >
                    수정
                  </button>
                )}
                {onHandover && (
                  <button
                    onClick={(e) => handleMenuClick(e, 'handover')}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    인계
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => handleMenuClick(e, 'delete')}
                    className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 last:rounded-b-md"
                  >
                    삭제
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectCard 