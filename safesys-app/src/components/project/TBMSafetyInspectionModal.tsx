'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getTBMRecords, type TBMRecord } from '@/lib/tbm'
import { supabase } from '@/lib/supabase'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'
import SignatureModal from './SignatureModal'

interface TBMSafetyInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
  supervisor?: string
  supervisorTitle?: string
  selectedDate?: string
  projectBranch?: string
  projectHq?: string
  editingInspection?: any
}

// TBM 캐시 데이터 타입
interface TBMCache {
  todayWork: string
  educationContent: string
  workers: string
  equipment: string
}

// TBMRecord를 lib/tbm.ts에서 import하므로 제거

const TBMSafetyInspectionModal: React.FC<TBMSafetyInspectionModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  supervisor,
  supervisorTitle,
  selectedDate,
  projectBranch,
  projectHq,
  editingInspection
}) => {
  const { user, userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  // 지구명: 프로젝트명에서 공백 앞까지 또는 공백이 없으면 4글자만
  const getDistrictName = (name: string) => {
    const spaceIndex = name.indexOf(' ')
    if (spaceIndex > 0) {
      return name.substring(0, spaceIndex)
    }
    return name.substring(0, 4)
  }

  // 공사감독: 프로젝트 정보에서 가져오거나 기본값
  const getSupervisorInfo = () => {
    if (supervisor && supervisorTitle) {
      return `${supervisorTitle} ${supervisor}`
    }
    return '4급 홍길동'
  }

  // 기본 점검일자 설정 (한국 시간대 기준)
  const getDefaultDateTime = () => {
    if (selectedDate) {
      return {
        date: selectedDate,
        startTime: '',
        endTime: ''
      }
    }
    // 한국 시간대 기준으로 현재 날짜 가져오기
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const date = `${year}-${month}-${day}`
    return {
      date,
      startTime: '',
      endTime: ''
    }
  }

  const [formData, setFormData] = useState({
    district: getDistrictName(projectName),
    projectName: projectName,
    supervisor: getSupervisorInfo(),
    tbmDate: getDefaultDateTime().date,
    tbmStartTime: getDefaultDateTime().startTime,
    tbmEndTime: getDefaultDateTime().endTime,
    isAttended: true,
    nonAttendanceReason: '',
    attendeeAffiliation: '',
    attendee: '', // 입회 여부가 true일 때만 값이 들어가므로 초기값은 빈 문자열
    workContent: '',
    address: '',
    tbmContent: '',
    workers: '00',
    equipment: '00',
    newWorkers: '0',
    signalWorkers: '0',
    // 현장관리자 활동사항 (기본값: 여)
    siteExplanation: true,
    siteExplanationReason: '',
    riskExplanation: true,
    riskExplanationReason: '',
    ppeProvision: true,
    ppeProvisionReason: '',
    healthCheck: true,
    healthCheckReason: '',
    // 입회자 의견
    attendeeOpinion: '',
    // 명일 사항
    tomorrowWorkStatus: true,
    tomorrowIsAttended: true,
    tomorrowNonAttendanceReason: '',
    tomorrowAttendeeAffiliation: '', // 명일 입회자 소속
    tomorrowAttendee: '', // 명일 입회 여부가 true일 때만 값이 들어가므로 초기값은 빈 문자열
    tomorrowProjectId: projectId // 명일 점검대상 프로젝트 ID (기본값: 현재 프로젝트)
  })

  const [tbmCache, setTbmCache] = useState<TBMCache | null>(null)
  const [showTbmCachePopup, setShowTbmCachePopup] = useState(false)
  const [showTbmListModal, setShowTbmListModal] = useState(false)
  const [tbmList, setTbmList] = useState<TBMRecord[]>([])
  const [loadingTbmList, setLoadingTbmList] = useState(false)

  // TBM 캐시 불러오기 (localStorage 사용)
  useEffect(() => {
    const cached = localStorage.getItem('selected_tbm_cache')
    if (cached) {
      try {
        setTbmCache(JSON.parse(cached))
      } catch (error) {
        console.error('TBM 캐시 파싱 오류:', error)
      }
    }
  }, [])

  // 프로젝트 목록 불러오기 (현재 프로젝트의 소속 지사 산하 프로젝트만)
  useEffect(() => {
    const loadProjects = async () => {
      if (!userProfile || !projectBranch || !projectHq) return
      
      setLoadingProjects(true)
      try {
        const result = await getProjectsByUserBranch(userProfile)
        if (result.success && result.projects) {
          // 현재 프로젝트의 소속 지사와 본부와 일치하는 프로젝트만 필터링
          let filteredProjects = result.projects.filter(
            (project) => 
              project.managing_branch === projectBranch && 
              project.managing_hq === projectHq
          )
          
          // 현재 프로젝트가 필터링된 목록에 없으면 추가
          const currentProjectExists = filteredProjects.some(p => p.id === projectId)
          if (!currentProjectExists) {
            const currentProject = result.projects.find(p => p.id === projectId)
            if (currentProject) {
              filteredProjects = [currentProject, ...filteredProjects]
            }
          }
          
          setProjects(filteredProjects)
        }
      } catch (error) {
        console.error('프로젝트 목록 로드 오류:', error)
      } finally {
        setLoadingProjects(false)
      }
    }

    if (isOpen && userProfile && projectBranch && projectHq) {
      loadProjects()
    }
  }, [isOpen, userProfile, projectBranch, projectHq])

  // 수정 모드일 때 기존 데이터 로드
  useEffect(() => {
    if (editingInspection) {
      const isAttended = editingInspection.is_attended ?? true
      const tomorrowIsAttended = editingInspection.tomorrow_is_attended ?? true
      
      setFormData({
        district: editingInspection.district || getDistrictName(projectName),
        projectName: editingInspection.project_name || projectName,
        supervisor: editingInspection.supervisor || getSupervisorInfo(),
        tbmDate: editingInspection.tbm_date || getDefaultDateTime().date,
        tbmStartTime: '',
        tbmEndTime: '',
        isAttended: isAttended,
        nonAttendanceReason: editingInspection.non_attendance_reason || '',
        attendeeAffiliation: editingInspection.attendee_affiliation || '',
        // 미입회일 때는 입회자 필드를 빈 문자열로 설정
        attendee: isAttended ? (editingInspection.attendee || '') : '',
        workContent: editingInspection.work_content || '',
        address: editingInspection.address || '',
        tbmContent: editingInspection.tbm_content || '',
        workers: editingInspection.workers || '00',
        equipment: editingInspection.equipment || '00',
        newWorkers: editingInspection.new_workers || '0',
        signalWorkers: editingInspection.signal_workers || '0',
        siteExplanation: editingInspection.site_explanation ?? true,
        siteExplanationReason: editingInspection.site_explanation_reason || '',
        riskExplanation: editingInspection.risk_explanation ?? true,
        riskExplanationReason: editingInspection.risk_explanation_reason || '',
        ppeProvision: editingInspection.ppe_provision ?? true,
        ppeProvisionReason: editingInspection.ppe_provision_reason || '',
        healthCheck: editingInspection.health_check ?? true,
        healthCheckReason: editingInspection.health_check_reason || '',
        attendeeOpinion: editingInspection.attendee_opinion || '',
        tomorrowWorkStatus: editingInspection.tomorrow_work_status ?? true,
        tomorrowIsAttended: tomorrowIsAttended,
        tomorrowNonAttendanceReason: editingInspection.tomorrow_non_attendance_reason || '',
        // 명일 미입회일 때는 입회자 소속과 입회예정자 필드를 빈 문자열로 설정
        tomorrowAttendeeAffiliation: tomorrowIsAttended ? (editingInspection.tomorrow_attendee_affiliation || '') : '',
        tomorrowAttendee: tomorrowIsAttended ? (editingInspection.tomorrow_attendee || '') : '',
        tomorrowProjectId: editingInspection.tomorrow_project_id || projectId
      })
    }
  }, [editingInspection])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleCheckboxChange = (field: string, checked: boolean) => {
    if (field === 'isAttended' && checked === false) {
      // 미입회 선택 시 입회자 소속과 입회자만 공란 처리 (기타 의견은 활성화 유지)
      setFormData(prev => ({ 
        ...prev, 
        [field]: checked,
        attendeeAffiliation: '',
        attendee: ''
      }))
    } else if (field === 'isAttended' && checked === true) {
      // 입회 선택 시 입회자 필드는 활성화되지만 기본값은 채우지 않음 (사용자가 직접 입력)
      setFormData(prev => ({ 
        ...prev, 
        [field]: checked
      }))
    } else if (field === 'tomorrowIsAttended' && checked === false) {
      // 명일 미입회 선택 시 입회자 소속과 입회예정자 공란 처리
      setFormData(prev => ({ 
        ...prev, 
        [field]: checked,
        tomorrowAttendeeAffiliation: '',
        tomorrowAttendee: ''
      }))
    } else if (field === 'tomorrowIsAttended' && checked === true) {
      // 명일 입회 선택 시 입회예정자 필드는 활성화되지만 기본값은 채우지 않음 (사용자가 직접 입력)
      setFormData(prev => ({ 
        ...prev, 
        [field]: checked
      }))
    } else {
      setFormData(prev => ({ ...prev, [field]: checked }))
    }
  }

  const handleUseTbmCache = (field: 'workContent' | 'tbmContent') => {
    if (tbmCache) {
      if (field === 'workContent') {
        setFormData(prev => ({ ...prev, workContent: tbmCache.todayWork }))
      } else if (field === 'tbmContent') {
        setFormData(prev => ({ ...prev, tbmContent: tbmCache.educationContent }))
      }
    }
  }

  const handleShowTbmCache = (type: 'workers' | 'equipment') => {
    setShowTbmCachePopup(true)
  }

  // 금일 TBM 리스트 불러오기 (프로젝트 소속 지사 기준)
  const loadTodayTbmList = async () => {
    // 프로젝트 지사 정보 확인
    if (!projectBranch) {
      alert('프로젝트 지사 정보가 없습니다.')
      return
    }

    // 사용자 권한 확인
    const isHqUser = userProfile?.branch_division?.endsWith('본부') ||
                     userProfile?.branch_division === '본사' ||
                     !userProfile?.branch_division

    // 본부 소속이 아닌 경우, 지사가 일치해야 함
    if (!isHqUser && userProfile?.branch_division !== projectBranch) {
      alert(`해당 지사(${projectBranch})의 TBM을 조회할 권한이 없습니다.\n(귀하의 소속: ${userProfile.branch_division})`)
      return
    }

    // 본부 소속이 아닌 경우, 본부도 일치해야 함
    if (!isHqUser && userProfile?.hq_division !== projectHq) {
      alert(`해당 본부(${projectHq})의 TBM을 조회할 권한이 없습니다.\n(귀하의 소속: ${userProfile.hq_division})`)
      return
    }

    setLoadingTbmList(true)
    setShowTbmListModal(true)

    try {
      const today = new Date().toISOString().split('T')[0]

      console.log('TBM 조회 파라미터 (프로젝트 기준):', {
        date: today,
        hq: projectHq,
        branch: projectBranch,
        userIsHq: isHqUser
      })

      // getTBMRecords 함수 사용 (프로젝트 소속 지사 기준)
      const response = await getTBMRecords(
        today,
        projectHq || undefined,
        projectBranch
      )

      if (!response.success || !response.records) {
        console.error('TBM 리스트 조회 오류:', response.message)
        alert('TBM 리스트를 불러오는데 실패했습니다.')
        setShowTbmListModal(false)
        return
      }

      console.log('TBM 리스트 조회 결과:', response.records)
      console.log('조회된 TBM 개수:', response.records.length)
      setTbmList(response.records)
    } catch (error) {
      console.error('TBM 리스트 조회 오류:', error)
      alert('TBM 리스트를 불러오는데 실패했습니다.')
      setShowTbmListModal(false)
    } finally {
      setLoadingTbmList(false)
    }
  }

  // TBM 선택 시 작업내용 자동 입력
  const handleSelectTbm = (tbm: TBMRecord) => {
    setFormData(prev => ({
      ...prev,
      workContent: tbm.today_work || '',
      address: tbm.location || '',
      tbmContent: tbm.education_content || ''
    }))

    // 캐시에도 저장
    const cacheData: TBMCache = {
      todayWork: tbm.today_work || '',
      educationContent: tbm.education_content || '',
      workers: tbm.attendees || '',
      equipment: tbm.equipment_input || ''
    }
    setTbmCache(cacheData)
    localStorage.setItem('selected_tbm_cache', JSON.stringify(cacheData))

    setShowTbmListModal(false)
    alert('TBM 정보가 입력되었습니다.')
  }

  // 서명 처리 함수
  const handleSignatureSave = (signatureData: string) => {
    // 서명 완료 후 자동으로 최종 제출
    handleFinalSubmit(signatureData)
  }

  const handleSubmit = () => {
    // 수정 모드일 때는 서명 없이 바로 업데이트 (id가 있는 경우만)
    if (editingInspection && editingInspection.id) {
      handleUpdate()
    } else {
      // 신규 등록일 때는 서명 없이 바로 제출
      handleFinalSubmit('')
    }
  }

  const handleUpdate = async () => {
    try {
      setLoading(true)

      // Supabase에서 업데이트 (서명 제외)
      // 빈 문자열이나 undefined 값은 null로 변환
      const toNullIfEmpty = (value: any) => (value === '' || value === undefined ? null : value)
      // 시간 필드는 NOT NULL 제약조건이 있으므로 빈 값일 때 기본값 사용
      const toTimeOrDefault = (value: any) => (value === '' || value === undefined ? '00:00' : value)
      
      const { data, error } = await supabase
        .from('tbm_safety_inspections')
        .update({
          district: toNullIfEmpty(formData.district),
          project_name: toNullIfEmpty(formData.projectName),
          supervisor: toNullIfEmpty(formData.supervisor),
          tbm_date: formData.tbmDate,
          tbm_start_time: toTimeOrDefault(formData.tbmStartTime),
          tbm_end_time: toTimeOrDefault(formData.tbmEndTime),
          is_attended: formData.isAttended,
          non_attendance_reason: toNullIfEmpty(formData.nonAttendanceReason),
          attendee_affiliation: formData.isAttended ? toNullIfEmpty(formData.attendeeAffiliation) : null,
          attendee: formData.isAttended ? toNullIfEmpty(formData.attendee) : null,
          work_content: formData.workContent || '',
          address: toNullIfEmpty(formData.address),
          tbm_content: formData.tbmContent || '',
          workers: toNullIfEmpty(formData.workers),
          equipment: toNullIfEmpty(formData.equipment),
          new_workers: toNullIfEmpty(formData.newWorkers),
          signal_workers: toNullIfEmpty(formData.signalWorkers),
          site_explanation: formData.siteExplanation,
          site_explanation_reason: toNullIfEmpty(formData.siteExplanationReason),
          risk_explanation: formData.riskExplanation,
          risk_explanation_reason: toNullIfEmpty(formData.riskExplanationReason),
          ppe_provision: formData.ppeProvision,
          ppe_provision_reason: toNullIfEmpty(formData.ppeProvisionReason),
          health_check: formData.healthCheck,
          health_check_reason: toNullIfEmpty(formData.healthCheckReason),
          attendee_opinion: toNullIfEmpty(formData.attendeeOpinion),
          // 명일 사항 (제거된 항목들은 null로 설정)
          tomorrow_work_status: null,
          tomorrow_is_attended: null,
          tomorrow_non_attendance_reason: null,
          tomorrow_attendee: null
        })
        .eq('id', editingInspection.id)
        .select()

      if (error) {
        console.error('수정 오류:', error)
        alert(`점검표 수정에 실패했습니다.\n${error.message}`)
        return
      }

      console.log('수정 성공:', data)
      alert('점검표가 성공적으로 수정되었습니다.')

      onClose()
    } catch (err) {
      console.error('예외 발생:', err)
      alert('점검표 수정 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleFinalSubmit = async (signatureData: string) => {
    try {
      setLoading(true)

      // Supabase에 저장
      // 빈 문자열이나 undefined 값은 null로 변환
      const toNullIfEmpty = (value: any) => (value === '' || value === undefined ? null : value)
      // 시간 필드는 NOT NULL 제약조건이 있으므로 빈 값일 때 기본값 사용
      const toTimeOrDefault = (value: any) => (value === '' || value === undefined ? '00:00' : value)
      
      const { data, error } = await supabase
        .from('tbm_safety_inspections')
        .insert([
          {
            project_id: projectId,
            district: toNullIfEmpty(formData.district),
            project_name: toNullIfEmpty(formData.projectName),
            supervisor: toNullIfEmpty(formData.supervisor),
            tbm_date: formData.tbmDate,
            tbm_start_time: toTimeOrDefault(formData.tbmStartTime),
            tbm_end_time: toTimeOrDefault(formData.tbmEndTime),
            is_attended: formData.isAttended,
            non_attendance_reason: toNullIfEmpty(formData.nonAttendanceReason),
            attendee_affiliation: formData.isAttended ? toNullIfEmpty(formData.attendeeAffiliation) : null,
            attendee: formData.isAttended ? toNullIfEmpty(formData.attendee) : null,
            work_content: formData.workContent || '',
            address: toNullIfEmpty(formData.address),
            tbm_content: formData.tbmContent || '',
            workers: toNullIfEmpty(formData.workers),
            equipment: toNullIfEmpty(formData.equipment),
            new_workers: toNullIfEmpty(formData.newWorkers),
            signal_workers: toNullIfEmpty(formData.signalWorkers),
            site_explanation: formData.siteExplanation,
            site_explanation_reason: toNullIfEmpty(formData.siteExplanationReason),
            risk_explanation: formData.riskExplanation,
            risk_explanation_reason: toNullIfEmpty(formData.riskExplanationReason),
            ppe_provision: formData.ppeProvision,
            ppe_provision_reason: toNullIfEmpty(formData.ppeProvisionReason),
            health_check: formData.healthCheck,
            health_check_reason: toNullIfEmpty(formData.healthCheckReason),
            attendee_opinion: toNullIfEmpty(formData.attendeeOpinion),
            affiliation: formData.isAttended ? toNullIfEmpty(formData.attendeeAffiliation) : null,
            signature: toNullIfEmpty(signatureData),
            // 명일 사항 (제거된 항목들은 null로 설정)
            tomorrow_work_status: null,
            tomorrow_is_attended: null,
            tomorrow_non_attendance_reason: null,
            tomorrow_attendee: null,
            created_by: user?.id
          }
        ])
        .select()

      if (error) {
        console.error('저장 오류:', error)
        alert(`점검표 저장에 실패했습니다.\n${error.message}`)
        setShowSignatureModal(false)
        return
      }

      console.log('저장 성공:', data)
      alert('점검표가 성공적으로 제출되었습니다.')

      // TBM 캐시 삭제
      localStorage.removeItem('selected_tbm_cache')
      setTbmCache(null)

      setShowSignatureModal(false)
      onClose()
    } catch (err) {
      console.error('예외 발생:', err)
      alert('점검표 저장 중 오류가 발생했습니다.')
      setShowSignatureModal(false)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (confirm('작성 중인 내용이 있습니다. 취소하시겠습니까?')) {
      // TBM 캐시 삭제
      localStorage.removeItem('selected_tbm_cache')
      setTbmCache(null)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900">
            {editingInspection && editingInspection.id ? 'TBM 안전활동 점검표 수정' : 'TBM 안전활동 점검표'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="p-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="취소"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              title={loading ? (editingInspection && editingInspection.id ? '수정 중...' : '저장 중...') : (editingInspection && editingInspection.id ? '수정' : '저장')}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-6">
          {/* 입력 폼 */}
          <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    지구명
                  </label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => handleInputChange('district', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    사업명
                  </label>
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => handleInputChange('projectName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    공사감독
                  </label>
                  <input
                    type="text"
                    value={formData.supervisor}
                    onChange={(e) => handleInputChange('supervisor', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 점검일자 및 입회여부 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    점검일자
                  </label>
                  <input
                    type="date"
                    value={formData.tbmDate}
                    onChange={(e) => handleInputChange('tbmDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    입회여부
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={formData.isAttended === true}
                        onChange={() => handleCheckboxChange('isAttended', true)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">입회</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={formData.isAttended === false}
                        onChange={() => handleCheckboxChange('isAttended', false)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">미입회</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 미입회 사유 */}
              {formData.isAttended === false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    미입회 사유
                  </label>
                  <input
                    type="text"
                    value={formData.nonAttendanceReason}
                    onChange={(e) => handleInputChange('nonAttendanceReason', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    placeholder="미입회 사유를 입력하세요"
                  />
                </div>
              )}

              {/* 입회자 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    입회자 소속
                  </label>
                  <input
                    type="text"
                    value={formData.attendeeAffiliation}
                    onChange={(e) => handleInputChange('attendeeAffiliation', e.target.value)}
                    disabled={formData.isAttended === false}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="00지사"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    입회자
                  </label>
                  <input
                    type="text"
                    value={formData.attendee}
                    onChange={(e) => handleInputChange('attendee', e.target.value)}
                    disabled={formData.isAttended === false}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="농어촌사업부장"
                    onFocus={(e) => {
                      if (e.target.value === '') {
                        e.target.placeholder = ''
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '') {
                        e.target.placeholder = '농어촌사업부장'
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* TBM 캐시 팝업 */}
      {showTbmCachePopup && tbmCache && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">TBM 정보</h3>
              <button
                onClick={() => setShowTbmCachePopup(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">인원</p>
                <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">
                  {tbmCache.workers || '정보 없음'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">장비</p>
                <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">
                  {tbmCache.equipment || '정보 없음'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 금일 TBM 리스트 모달 */}
      {showTbmListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">금일 TBM 목록 ({projectBranch || '지사'})</h3>
              <button
                onClick={() => setShowTbmListModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingTbmList ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  <div className="text-gray-500">TBM 목록을 불러오는 중...</div>
                </div>
              ) : tbmList.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-500">금일 TBM 기록이 없습니다.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {tbmList.map((tbm, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectTbm(tbm)}
                      className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{tbm.project_name}</div>
                      {tbm.today_work && (
                        <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {tbm.today_work}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowTbmListModal(false)}
                className="w-full px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSignatureSave}
        isSubmitting={loading}
      />
    </div>
  )
}

export default TBMSafetyInspectionModal
