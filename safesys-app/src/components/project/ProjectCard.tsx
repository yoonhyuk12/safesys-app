'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Building, MapPin, MoreVertical, Video, Share2 } from 'lucide-react'
import { Project } from '@/lib/projects'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

interface ProjectCardProps {
  project: Project
  onEdit?: (project: Project) => void
  onDelete?: (project: Project) => void
  onClick?: (project: Project) => void
  onStatusChange?: (project: Project, isActive: boolean) => void
  canEditQuarters?: boolean // 편집 가능 여부 (true: 활성화, false: disabled)
  showQuarters?: boolean // 분기 토글 표시 여부 (undefined는 canEditQuarters 값 사용)
  onIsActiveChange?: (project: Project, isActive: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
  onHandover?: (project: Project) => void
  onShare?: (project: Project) => void
  isShared?: boolean
  // 편집 모드 관련 props
  isEditMode?: boolean
  displayOrder?: number
  onLongPressStart?: () => void
  onLongPressEnd?: () => void
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onDrop?: (e: React.DragEvent) => void
  isDragging?: boolean
  isDragOver?: boolean
  hqPendingCount?: number // 본부 불시점검 미조치 건수
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onEdit,
  onDelete,
  onClick,
  onStatusChange,
  canEditQuarters = false,
  showQuarters,
  onIsActiveChange,
  onHandover,
  onShare,
  isShared = false,
  isEditMode = false,
  displayOrder,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging = false,
  isDragOver = false,
  hqPendingCount
}) => {
  // showQuarters가 명시되지 않으면 canEditQuarters 값 사용 (기존 동작 유지)
  const shouldShowQuarters = showQuarters !== undefined ? showQuarters : canEditQuarters
  const isDisabled = !canEditQuarters
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
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const mouseDownTimeRef = useRef<number | null>(null)
  const isLongPressRef = useRef<boolean>(false)
  const longPressTriggeredRef = useRef<boolean>(false)

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

  // 롱 프레스 타이머 정리
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  const handleCardClick = (e: React.MouseEvent) => {
    if (isEditMode) {
      e.stopPropagation()
      return
    }
    
    // 롱 프레스로 인한 클릭이면 무시
    if (isLongPressRef.current) {
      e.preventDefault()
      e.stopPropagation()
      isLongPressRef.current = false
      return
    }
    
    console.log('카드 클릭됨:', project.project_name)
    console.log('클릭 이벤트:', e.target)
    if (onClick) {
      console.log('onClick 함수 호출')
      onClick(project)
    } else {
      console.log('onClick 함수가 없음')
    }
  }

  // 롱 프레스 처리 (마우스)
  const handleMouseDown = (e: React.MouseEvent) => {
    // 항상 이벤트 전파 방지 (외부 클릭 감지 방지)
    e.stopPropagation()
    
    // 편집 모드에서는 롱 프레스 타이머를 시작하지 않음 (드래그만 허용)
    if (isEditMode) {
      console.log('편집 모드: 드래그 시작 가능')
      return
    }
    
    console.log('마우스 다운:', project.project_name)
    longPressTriggeredRef.current = false
    
    // 마우스 다운 시간 기록
    mouseDownTimeRef.current = Date.now()
    isLongPressRef.current = false
    
    console.log('롱 프레스 타이머 시작 (5초)')
    
    // 타이머 시작
    longPressTimerRef.current = setTimeout(() => {
      console.log('롱 프레스 완료! 편집 모드 진입')
      // 5초 이상 누르고 있으면 롱 프레스로 인식
      if (onLongPressStart) {
        console.log('onLongPressStart 호출')
        onLongPressStart()
      }
      isLongPressRef.current = true
      longPressTriggeredRef.current = true
      longPressTimerRef.current = null
    }, 5000) // 5초
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    console.log('마우스 업:', project.project_name)
    
    // 타이머 취소
    if (longPressTimerRef.current) {
      const pressDuration = mouseDownTimeRef.current ? Date.now() - mouseDownTimeRef.current : 0
      console.log(`롱 프레스 타이머 취소 (누른 시간: ${Math.round(pressDuration / 1000)}초)`)
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    
    // 마우스를 떼는 시점에 시간 차이 계산
    if (mouseDownTimeRef.current !== null) {
      const pressDuration = Date.now() - mouseDownTimeRef.current
      console.log(`누른 시간: ${Math.round(pressDuration / 1000)}초`)
      // 5초 이상 누르고 있었으면 롱 프레스로 인식
      if (pressDuration >= 5000) {
        console.log('롱 프레스로 인식됨')
        isLongPressRef.current = true
        // 클릭 이벤트 방지
        e.preventDefault()
        e.stopPropagation()
      }
      mouseDownTimeRef.current = null
    }

    // 롱 프레스가 "발생하지 않았던" 경우에만 end 콜백(타이머 취소 의미)
    if (!longPressTriggeredRef.current && onLongPressEnd) {
      onLongPressEnd()
    }
    longPressTriggeredRef.current = false
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    // 마우스가 카드 밖으로 나가면 타이머 취소
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    mouseDownTimeRef.current = null
    isLongPressRef.current = false
  }

  // 롱 프레스 처리 (터치)
  const handleTouchStart = (e: React.TouchEvent) => {
    // 항상 이벤트 전파 방지 (외부 클릭 감지 방지)
    e.stopPropagation()
    
    if (isEditMode) return
    
    // 터치 시작 시간 기록
    mouseDownTimeRef.current = Date.now()
    isLongPressRef.current = false
    longPressTriggeredRef.current = false
    
    // 타이머 시작
    longPressTimerRef.current = setTimeout(() => {
      // 5초 이상 누르고 있으면 롱 프레스로 인식
      if (onLongPressStart) {
        onLongPressStart()
      }
      isLongPressRef.current = true
      longPressTriggeredRef.current = true
      longPressTimerRef.current = null
    }, 5000) // 5초
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    // 타이머 취소
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    
    // 터치를 떼는 시점에 시간 차이 계산
    if (mouseDownTimeRef.current !== null) {
      const pressDuration = Date.now() - mouseDownTimeRef.current
      // 5초 이상 누르고 있었으면 롱 프레스로 인식
      if (pressDuration >= 5000) {
        console.log('터치 롱 프레스로 인식됨')
        isLongPressRef.current = true
        // 클릭 이벤트 방지
        e.preventDefault()
        e.stopPropagation()
      }
      mouseDownTimeRef.current = null
    }

    // 롱 프레스가 "발생하지 않았던" 경우에만 end 콜백(타이머 취소 의미)
    if (!longPressTriggeredRef.current && onLongPressEnd) {
      onLongPressEnd()
    }
    longPressTriggeredRef.current = false
  }

  const handleTouchMove = () => {
    // 터치가 이동하면 타이머 취소
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    mouseDownTimeRef.current = null
    isLongPressRef.current = false
  }

  // 드래그 이벤트 처리
  const handleDragStartEvent = (e: React.DragEvent) => {
    if (!isEditMode) {
      e.preventDefault()
      return
    }
    // 드래그 시작 시 이벤트 전파 방지 (외부 클릭 감지 방지)
    e.stopPropagation()
    if (onDragStart) {
      onDragStart()
    }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', project.id)
  }

  const handleMenuClick = (e: React.MouseEvent, action: 'edit' | 'delete' | 'handover' | 'share') => {
    e.stopPropagation()
    setIsMenuOpen(false)
    if (action === 'edit' && onEdit) {
      onEdit(project)
    } else if (action === 'delete' && onDelete) {
      onDelete(project)
    } else if (action === 'handover' && onHandover) {
      onHandover(project)
    } else if (action === 'share' && onShare) {
      onShare(project)
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

    // disabled 상태면 팝업 표시 후 리턴
    if (isDisabled) {
      alert('본부에 분기 활성화를 요청해 주세요')
      return
    }

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

  const segmentClass = (active: boolean, disabled: boolean = false) => {
    if (disabled) {
      // disabled 상태지만 활성화된 분기는 흐린 초록색으로 표시
      return active
        ? 'bg-green-50 text-green-600 border-green-200 cursor-not-allowed opacity-70'
        : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-70'
    }
    return active
      ? 'bg-green-100 text-green-800 border-green-300'
      : 'bg-gray-100 text-gray-700 border-gray-300'
  }

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

  // 최근 변경 일자 계산 (색상 구분)
  const getUpdateInfo = () => {
    if (!project.updated_at) return null

    const updatedDate = new Date(project.updated_at)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24))

    const relativeTime = formatDistanceToNow(updatedDate, {
      addSuffix: true,
      locale: ko
    })

    // 0-3일: 빨간색, 4-7일: 파란색, 8일 이상: 회색
    let colorClass = 'text-gray-500'
    if (diffInDays <= 3) {
      colorClass = 'text-red-600 font-semibold'
    } else if (diffInDays <= 7) {
      colorClass = 'text-blue-600 font-semibold'
    }

    return { colorClass, relativeTime }
  }

  const updateInfo = getUpdateInfo()

  return (
    <div
      className={`group bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-3 relative ${
        isEditMode ? 'cursor-move' : 'cursor-pointer'
      } ${
        isEditMode ? 'animate-shake' : ''
      } ${
        // 모바일 편집모드에서 카드 위 스크롤 방지 (터치 드래그로 순서 이동)
        isEditMode ? 'touch-none select-none' : ''
      } ${
        isDragging ? 'opacity-50' : ''
      } ${
        isDragOver ? 'ring-2 ring-blue-500 ring-offset-2' : ''
      }`}
      data-edit-mode={isEditMode}
      data-project-card="true"
      data-project-id={project.id}
      onClick={handleCardClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onPointerDown={(e) => {
        // 모바일(터치)에서는 HTML5 drag&drop이 잘 안 되므로, 편집모드에서 터치 시작 시 "드래그 시작"으로 처리
        if (!isEditMode) return
        if (e.pointerType === 'touch') {
          e.preventDefault()
          e.stopPropagation()
          onDragStart?.()
        }
      }}
      draggable={isEditMode}
      onContextMenu={(e) => {
        // 우클릭 메뉴 방지 (롱 프레스와 충돌 방지)
        if (!isEditMode) {
          e.preventDefault()
        }
      }}
      onDragStart={handleDragStartEvent}
      onDragOver={(e) => {
        if (isEditMode && onDragOver) {
          e.stopPropagation() // 이벤트 전파 방지
          onDragOver(e)
        }
      }}
      onDragEnd={(e) => {
        e.stopPropagation() // 이벤트 전파 방지
        if (onDragEnd) {
          onDragEnd()
        }
      }}
      onDrop={(e) => {
        if (isEditMode && onDrop) {
          e.stopPropagation() // 이벤트 전파 방지
          onDrop(e)
        }
      }}
      style={{
        animation: isEditMode ? 'shake 0.5s ease-in-out infinite' : undefined
      }}
    >
      {/* 준공 도장 (completed 상태일 때) */}
      {completed && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div
            className="relative w-[110px] h-[110px] flex items-center justify-center"
            style={{ transform: 'rotate(-15deg)' }}
          >
            {/* 도장 외곽선 */}
            <div
              className="absolute inset-0 rounded-full opacity-60"
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #dc2626 25%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.4) 35%, #dc2626 40%, #dc2626 55%, rgba(255,255,255,0.3) 62%, #dc2626 68%, #dc2626 100%)',
                WebkitMask: 'radial-gradient(circle, transparent 0%, transparent calc(50% - 7px), black calc(50% - 7px), black 50%, transparent 50%)',
                mask: 'radial-gradient(circle, transparent 0%, transparent calc(50% - 7px), black calc(50% - 7px), black 50%, transparent 50%)'
              }}
            ></div>
            {/* 도장 텍스트 */}
            <div
              className="text-3xl font-black opacity-60"
              style={{
                fontFamily: 'Gungsuh, GungsuhChe, 궁서체, serif',
                background: 'linear-gradient(135deg, #dc2626 0%, #dc2626 30%, rgba(255,255,255,0.3) 35%, rgba(255,255,255,0.3) 40%, #dc2626 45%, #dc2626 60%, rgba(255,255,255,0.2) 65%, #dc2626 70%, #dc2626 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              준공
            </div>
          </div>
        </div>
      )}

      {/* 본부 불시점검 미조치 뱃지 */}
      {hqPendingCount != null && hqPendingCount > 0 && (
        <div className="absolute -top-2 -right-2 z-20 flex items-center justify-center min-w-6 h-6 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg border-2 border-white">
          {hqPendingCount}
        </div>
      )}

      {/* 우측 상단 뱃지: 공유 또는 인계 필요 */}
      {(isShared || handoverRequired) && (
        <div className="absolute top-2 right-2 z-20">
          {isShared ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 border border-green-200">
              <Share2 className="h-3 w-3 mr-0.5" />
              공유
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
              인계 필요
            </span>
          )}
        </div>
      )}

      {/* 프로젝트 정보 */}
      <div className="space-y-2">
        {/* 프로젝트명 */}
        <h3 className="text-sm font-semibold text-gray-900 leading-tight pr-12" style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {project.project_name}
        </h3>

        {/* 관할 본부 및 지사 */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center min-w-0">
            <Building className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="truncate">
              {project.managing_hq} • {project.managing_branch}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* CCTV 표시 */}
            {project.cctv_rtsp_url && (
              <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white border-2 border-white shadow-sm" title="CCTV 있음">
                <Video className="h-3 w-3" />
              </div>
            )}
            {/* 재해예방기술지도 대상 마킹 */}
            {project.disaster_prevention_target && (
              <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold border-2 border-white shadow-sm">
                재
              </div>
            )}
          </div>
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
      <div className={`absolute bottom-2 left-2 right-2 flex items-center ${shouldShowQuarters && !isEditMode ? 'justify-between' : 'justify-end'}`}>
        {/* 편집 모드에서 우측 하단에 순서 번호 표시 */}
        {isEditMode && displayOrder !== undefined && (
          <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center z-10 shadow-md">
            {displayOrder}
          </div>
        )}
        {/* 분기/준공 5분할 세그먼트 */}
        {shouldShowQuarters && !isEditMode && (
        <div 
          className="inline-flex items-center gap-2 select-none" 
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            // 롱 프레스를 위해 이벤트 전파 허용
            e.stopPropagation()
            handleMouseDown(e as any)
          }}
          onMouseUp={(e) => {
            e.stopPropagation()
            handleMouseUp(e as any)
          }}
        >
          <div className="inline-flex items-center">
            <button
              type="button"
              title={isDisabled ? "비활성화: 본부에 요청하세요" : ""}
              className={`px-1 [@media(min-width:1413px)]:px-2 py-1 text-[11px] border ${segmentClass(q1Active, isDisabled)} rounded-l-md`}
              onClick={(e) => handleQuarterClick(e, 'q1_active')}
            >
              <span className="[@media(min-width:1413px)]:hidden">1Q</span>
              <span className="hidden [@media(min-width:1413px)]:inline">1분기</span>
            </button>
            <button
              type="button"
              title={isDisabled ? "비활성화: 본부에 요청하세요" : ""}
              className={`px-1 [@media(min-width:1413px)]:px-2 py-1 text-[11px] border -ml-px ${segmentClass(q2Active, isDisabled)}`}
              onClick={(e) => handleQuarterClick(e, 'q2_active')}
            >
              <span className="[@media(min-width:1413px)]:hidden">2Q</span>
              <span className="hidden [@media(min-width:1413px)]:inline">2분기</span>
            </button>
            <button
              type="button"
              title={isDisabled ? "비활성화: 본부에 요청하세요" : ""}
              className={`px-1 [@media(min-width:1413px)]:px-2 py-1 text-[11px] border -ml-px ${segmentClass(q3Active, isDisabled)}`}
              onClick={(e) => handleQuarterClick(e, 'q3_active')}
            >
              <span className="[@media(min-width:1413px)]:hidden">3Q</span>
              <span className="hidden [@media(min-width:1413px)]:inline">3분기</span>
            </button>
            <button
              type="button"
              title={isDisabled ? "비활성화: 본부에 요청하세요" : ""}
              className={`px-1 [@media(min-width:1413px)]:px-2 py-1 text-[11px] border -ml-px ${segmentClass(q4Active, isDisabled)}`}
              onClick={(e) => handleQuarterClick(e, 'q4_active')}
            >
              <span className="[@media(min-width:1413px)]:hidden">4Q</span>
              <span className="hidden [@media(min-width:1413px)]:inline">4분기</span>
            </button>
            <button
              type="button"
              title={isDisabled ? "비활성화: 본부에 요청하세요" : ""}
              className={`px-1 [@media(min-width:1413px)]:px-2 py-1 text-[11px] border -ml-px ${segmentClass(completed, isDisabled)} rounded-r-md`}
              onClick={(e) => handleQuarterClick(e, 'completed')}
            >
              <span className="[@media(min-width:1413px)]:hidden">준</span>
              <span className="hidden [@media(min-width:1413px)]:inline">준공</span>
            </button>
          </div>
          {/* 최근 변경 일자 표시 (활성화 상태일 때만) */}
          {!isDisabled && updateInfo && (
            <span className={`text-[10px] whitespace-nowrap ${updateInfo.colorClass}`}>
              {updateInfo.relativeTime}
            </span>
          )}
        </div>
        )}

        {/* 액션 메뉴 */}
        {(onEdit || onDelete || onHandover || onShare) && (
          <div className="relative z-30" ref={menuRef}>
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
                {onShare && (
                  <button
                    onClick={(e) => handleMenuClick(e, 'share')}
                    className="w-full text-left px-3 py-2 text-xs text-green-700 hover:bg-green-50"
                  >
                    공유
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