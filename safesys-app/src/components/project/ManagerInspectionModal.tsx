'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Plus, Calendar, User, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface InspectionRecord {
  id: string
  inspection_date: string
  inspector_name: string
  remarks: string
  created_at: string
}

interface ManagerInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
}

const ManagerInspectionModal: React.FC<ManagerInspectionModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName
}) => {
  const { userProfile } = useAuth()
  const [inspectionRecords, setInspectionRecords] = useState<InspectionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isEditingForm, setIsEditingForm] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState<{[key: string]: boolean}>({
    inspection: false,
    risk_assessment: false
  })
  const [newRecord, setNewRecord] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_name: userProfile?.full_name || '',
    remarks: ''
  })

  const inspectionFileInputRef = useRef<HTMLInputElement>(null)
  const riskFileInputRef = useRef<HTMLInputElement>(null)
  function createEmptyRiskItems(count: number) {
    return Array.from({ length: count }, () => ({
      detail_work: '',
      risk_factor: '',
      reduction_measure: '',
      implementation_yes: false,
      implementation_no: false,
      remarks: ''
    }))
  }

  const [formData, setFormData] = useState({
    serial_number: '1',
    branch_name: '',
    project_name: '',
    supervisor: '4급 총감독',
    contractor: '',
    photo_check: false,
    risk_assessment_photo: false,
    risk_assessment_check: false,
    inspection_photos: [] as string[], // 점검사진 URLs (제출 후)
    risk_assessment_photos: [] as string[], // 위험성평가서 사진 URLs (제출 후)
    inspection_photo_files: [] as File[], // 점검사진 파일들 (로컬)
    risk_assessment_photo_files: [] as File[], // 위험성평가서 사진 파일들 (로컬)
    inspection_photo_previews: [] as string[], // 점검사진 미리보기 URLs
    risk_assessment_photo_previews: [] as string[], // 위험성평가서 사진 미리보기 URLs
    risk_items: createEmptyRiskItems(5),
    inspection_year: '2024',
    inspection_month: '',
    inspection_day: '',
    inspector_name: ''
  })

  useEffect(() => {
    if (isOpen && projectId) {
      fetchInspectionRecords()
      
      // 폼 데이터가 비어있을 때만 초기화
      if (!formData.project_name && !formData.inspector_name) {
        setFormData(prev => ({
          ...prev,
          project_name: projectName,
          inspector_name: userProfile?.full_name || '',
          inspection_year: new Date().getFullYear().toString(),
          inspection_month: (new Date().getMonth() + 1).toString(),
          inspection_day: new Date().getDate().toString()
        }))
        
        // 프로젝트 메타 정보 로드
        loadProjectMeta()
      }
    }
  }, [isOpen, projectId])

  const loadProjectMeta = async () => {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('managing_branch, created_by')
        .eq('id', projectId)
        .single()

      if (error) return

      let contractorName = ''
      if (project?.created_by) {
        const { data: creator, error: profileError } = await supabase
          .from('user_profiles')
          .select('company_name')
          .eq('id', project.created_by)
          .single()

        if (!profileError && creator) {
          contractorName = creator.company_name || ''
        }
      }

      // 기존 데이터가 없을 때만 업데이트
      if (!formData.branch_name && !formData.contractor) {
        setFormData(prev => ({
          ...prev,
          branch_name: project?.managing_branch || '',
          contractor: contractorName
        }))
      }
    } catch (error) {
      console.error('프로젝트 메타 로드 오류:', error)
    }
  }


  const fetchInspectionRecords = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('manager_inspections')
        .select('*')
        .eq('project_id', projectId)
        .order('inspection_date', { ascending: false })

      if (error) {
        // 테이블이 존재하지 않는 경우 빈 배열로 처리
        if (error.code === '42P01') {
          console.warn('manager_inspections 테이블이 존재하지 않습니다. 빈 목록으로 처리합니다.')
          setInspectionRecords([])
          return
        }
        throw error
      }
      setInspectionRecords(data || [])
    } catch (error) {
      console.error('점검 기록을 불러오는 중 오류:', error)
      setInspectionRecords([]) // 오류 시 빈 배열로 설정
    } finally {
      setLoading(false)
    }
  }

  const handleAddRecord = async () => {
    if (!newRecord.inspection_date || !newRecord.inspector_name) {
      alert('점검일과 점검자는 필수 입력 항목입니다.')
      return
    }

    try {
      const { error } = await supabase
        .from('manager_inspections')
        .insert([{
          project_id: projectId,
          inspection_date: newRecord.inspection_date,
          inspector_name: newRecord.inspector_name,
          remarks: newRecord.remarks,
          created_by: userProfile?.id
        }])

      if (error) {
        if (error.code === '42P01') {
          alert('데이터베이스 테이블이 준비되지 않았습니다. 관리자에게 문의해주세요.')
          return
        }
        throw error
      }

      await fetchInspectionRecords()
      setShowAddForm(false)
      setNewRecord({
        inspection_date: new Date().toISOString().split('T')[0],
        inspector_name: userProfile?.full_name || '',
        remarks: ''
      })
    } catch (error) {
      console.error('점검 기록 추가 중 오류:', error)
      alert('점검 기록 추가에 실패했습니다.')
    }
  }

  const handleSaveForm = async () => {
    try {
      console.log('양식 저장 시작 - 사진 업로드 진행 중...')
      
      // 1. 사진들을 업로드
      let inspectionPhotoUrls: string[] = []
      let riskAssessmentPhotoUrls: string[] = []
      
      if (formData.inspection_photo_files.length > 0) {
        console.log(`점검사진 ${formData.inspection_photo_files.length}개 업로드 중...`)
        inspectionPhotoUrls = await uploadPhotosToStorage(formData.inspection_photo_files, 'inspection')
        console.log(`점검사진 업로드 완료: ${inspectionPhotoUrls.length}개`)
      }
      
      if (formData.risk_assessment_photo_files.length > 0) {
        console.log(`위험성평가서 사진 ${formData.risk_assessment_photo_files.length}개 업로드 중...`)
        riskAssessmentPhotoUrls = await uploadPhotosToStorage(formData.risk_assessment_photo_files, 'risk_assessment')
        console.log(`위험성평가서 사진 업로드 완료: ${riskAssessmentPhotoUrls.length}개`)
      }

      // 2. 업로드된 URL들을 포함한 최종 데이터 준비
      const finalFormData = {
        ...formData,
        inspection_photos: [...formData.inspection_photos, ...inspectionPhotoUrls],
        risk_assessment_photos: [...formData.risk_assessment_photos, ...riskAssessmentPhotoUrls]
      }

             const formDataToSave = {
         project_id: projectId,
         inspection_date: `${formData.inspection_year}-${formData.inspection_month.padStart(2, '0')}-${formData.inspection_day.padStart(2, '0')}`,
         inspector_name: formData.inspector_name,
         remarks: `양식 저장 - ${new Date().toLocaleString()} - 서명X`,
         form_data: finalFormData,
         created_by: userProfile?.id
       }

      // 3. 데이터베이스에 저장
      const { error } = await supabase
        .from('manager_inspections')
        .insert([formDataToSave])

      if (error) {
        if (error.code === '42P01') {
          alert('데이터베이스 테이블이 준비되지 않았습니다. 관리자에게 문의해주세요.')
          return
        }
        throw error
      }

      // 4. 미리보기 URL들 정리
      formData.inspection_photo_previews.forEach(url => URL.revokeObjectURL(url))
      formData.risk_assessment_photo_previews.forEach(url => URL.revokeObjectURL(url))

      await fetchInspectionRecords()
      setIsEditingForm(false)
      alert('점검 양식이 저장되었습니다.')
      console.log('양식 저장 완료')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('양식 저장 중 오류:', error)
      alert(`양식 저장에 실패했습니다: ${message}`)
    }
  }

  const handleFormEdit = () => {
    setIsEditingForm(true)
  }

  const handleCancelEdit = () => {
    setIsEditingForm(false)
  }

  const handlePhotoAdd = (file: File, type: 'inspection' | 'risk_assessment') => {
    console.log(`사진 추가: ${type}, 파일명: ${file.name}`)
    
    // 파일 크기 체크 (10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기가 10MB를 초과합니다.')
      return
    }

    // 이미지 파일 타입 체크
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    // 미리보기 URL 생성
    const previewUrl = URL.createObjectURL(file)

    if (type === 'inspection') {
      setFormData(prev => ({
        ...prev,
        inspection_photo_files: [...prev.inspection_photo_files, file],
        inspection_photo_previews: [...prev.inspection_photo_previews, previewUrl],
        photo_check: true // 사진이 추가되면 체크박스도 자동 체크
      }))
      console.log('점검사진 로컬 추가 완료')
    } else {
      setFormData(prev => ({
        ...prev,
        risk_assessment_photo_files: [...prev.risk_assessment_photo_files, file],
        risk_assessment_photo_previews: [...prev.risk_assessment_photo_previews, previewUrl],
        risk_assessment_photo: true // 사진이 추가되면 체크박스도 자동 체크
      }))
      console.log('위험성평가서 사진 로컬 추가 완료')
    }
  }

  const handleRemovePhoto = (index: number, type: 'inspection' | 'risk_assessment') => {
    if (type === 'inspection') {
      setFormData(prev => {
        // 미리보기 URL 해제
        if (prev.inspection_photo_previews[index]) {
          URL.revokeObjectURL(prev.inspection_photo_previews[index])
        }
        
        return {
          ...prev,
          inspection_photo_files: prev.inspection_photo_files.filter((_, i) => i !== index),
          inspection_photo_previews: prev.inspection_photo_previews.filter((_, i) => i !== index),
          inspection_photos: prev.inspection_photos.filter((_, i) => i !== index) // 기존 업로드된 사진도 처리
        }
      })
    } else {
      setFormData(prev => {
        // 미리보기 URL 해제
        if (prev.risk_assessment_photo_previews[index]) {
          URL.revokeObjectURL(prev.risk_assessment_photo_previews[index])
        }
        
        return {
          ...prev,
          risk_assessment_photo_files: prev.risk_assessment_photo_files.filter((_, i) => i !== index),
          risk_assessment_photo_previews: prev.risk_assessment_photo_previews.filter((_, i) => i !== index),
          risk_assessment_photos: prev.risk_assessment_photos.filter((_, i) => i !== index) // 기존 업로드된 사진도 처리
        }
      })
    }
  }

  // 실제 업로드 함수 (제출 시 호출)
  const uploadPhotosToStorage = async (files: File[], type: 'inspection' | 'risk_assessment') => {
    const uploadedUrls: string[] = []
    
    for (const file of files) {
      try {
        const fileExt = file.name.split('.').pop()
        const fileName = `${projectId}_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`
        const filePath = `manager-inspections/${fileName}`

               const { error: uploadError } = await supabase.storage
         .from('inspection-photos')
         .upload(filePath, file)

        if (uploadError) throw uploadError

               const { data: { publicUrl } } = supabase.storage
         .from('inspection-photos')
         .getPublicUrl(filePath)

        uploadedUrls.push(publicUrl)
        console.log(`사진 업로드 완료: ${fileName}`)
      } catch (error) {
        console.error(`사진 업로드 실패:`, error)
        // 개별 파일 업로드 실패해도 전체를 중단하지 않음
      }
    }
    
    return uploadedUrls
  }

  // 분기 계산 유틸리티: 입력된 점검 월 기준으로 1~4분기 산출
  const getQuarterFromMonth = (month: number): number => {
    if (month >= 1 && month <= 3) return 1
    if (month >= 4 && month <= 6) return 2
    if (month >= 7 && month <= 9) return 3
    return 4
  }

  const monthFromForm = Number(formData.inspection_month || new Date().getMonth() + 1)
  const safeMonth = Number.isFinite(monthFromForm) && monthFromForm >= 1 && monthFromForm <= 12
    ? monthFromForm
    : new Date().getMonth() + 1
  const computedQuarter = getQuarterFromMonth(safeMonth)

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg w-full max-w-7xl h-[90vh] flex flex-col relative shadow-xl"
           style={{ 
             background: 'linear-gradient(to bottom, rgb(236, 254, 255), rgb(207, 250, 254), rgb(165, 243, 252))',
             border: '2px solid rgb(88, 190, 213)'
           }}>
        {/* 헤더 */}
        <div className="flex justify-between items-center p-6 border-b border-cyan-300 rounded-t-lg"
             style={{ backgroundColor: 'rgb(88, 190, 213)', background: 'linear-gradient(to right, rgb(88, 190, 213), rgb(108, 210, 233))' }}>
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-white">관리자 일상점검</h2>
            <span className="bg-yellow-400 text-gray-900 text-xs px-2 py-1 rounded-full font-medium">
              베타 개발중
            </span>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* 모바일: 점검 등록 먼저, 데스크톱: 좌측 점검 목록 */}
          <div className="w-full lg:w-1/2 lg:border-r border-gray-200 flex flex-col bg-white order-2 lg:order-1">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-medium text-gray-900">점검 기록 목록</h3>
            </div>

            <div className="flex-1 overflow-y-auto max-h-64 lg:max-h-none">
              {loading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검일</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검자</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                      </tr>
                    </thead>
                      <tbody className="divide-y divide-gray-200">
                        {inspectionRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50">
                            <td className="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-gray-900">
                              {new Date(record.inspection_date).toLocaleDateString('ko-KR')}
                            </td>
                            <td className="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-gray-900">{record.inspector_name}</td>
                            <td className="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-gray-500 truncate max-w-20 lg:max-w-none">{record.remarks || '-'}</td>
                          </tr>
                        ))}
                        {Array.from({ length: Math.max(0, 10 - inspectionRecords.length) }).map((_, idx) => (
                          <tr key={`empty-${idx}`} className="hover:bg-gray-50">
                            <td className="px-2 lg:px-4 py-4 lg:py-5 text-xs lg:text-sm text-gray-900">&nbsp;</td>
                            <td className="px-2 lg:px-4 py-4 lg:py-5 text-xs lg:text-sm text-gray-900">&nbsp;</td>
                            <td className="px-2 lg:px-4 py-4 lg:py-5 text-xs lg:text-sm text-gray-500">&nbsp;</td>
                          </tr>
                        ))}
                      </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 새 기록 추가 폼 */}
            {showAddForm && (
              <div className="border-t bg-gray-50 p-4">
                <h4 className="font-medium text-gray-900 mb-3">새 점검 기록 추가</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">점검일</label>
                    <input
                      type="date"
                      value={newRecord.inspection_date}
                      onChange={(e) => setNewRecord({ ...newRecord, inspection_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">점검자</label>
                    <input
                      type="text"
                      value={newRecord.inspector_name}
                      onChange={(e) => setNewRecord({ ...newRecord, inspector_name: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="점검자명"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
                    <textarea
                      value={newRecord.remarks}
                      onChange={(e) => setNewRecord({ ...newRecord, remarks: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      rows={2}
                      placeholder="특이사항 등"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleAddRecord}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                    >
                      추가
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 text-sm"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 모바일: 점검 등록 먼저, 데스크톱: 우측 보고서 양식 */}
          <div className="w-full lg:w-1/2 bg-white overflow-y-auto relative border-b lg:border-b-0 border-gray-200 order-1 lg:order-2">
            {/* 추가/저장/취소 버튼 */}
            <div className="absolute top-2 right-2 z-10 flex space-x-2">
              {!isEditingForm ? (
                <button
                  onClick={handleFormEdit}
                  className="flex items-center space-x-1 bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 text-sm shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  <span>추가</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveForm}
                    className="flex items-center space-x-1 bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 text-sm shadow-md"
                  >
                    <span>제출</span>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center space-x-1 bg-gray-600 text-white px-3 py-2 rounded-md hover:bg-gray-700 text-sm shadow-md"
                  >
                    <span>취소</span>
                  </button>
                </>
              )}
            </div>
            
            <div className="p-3 lg:p-6">
              <div className="max-w-full mx-auto bg-white border border-gray-300 text-xs lg:text-sm">
              {/* 제목 */}
              <div className="text-center py-2 lg:py-4 border-b border-gray-300">
                <h1 className="text-sm lg:text-lg font-bold text-red-600">
                  {projectName} {computedQuarter}분기 일상점검표
                </h1>
              </div>

              {/* 기본 정보 테이블 */}
              <div className="border-b border-gray-300">
                <table className="w-full text-xs lg:text-sm">
                  <tbody>
                    <tr className="border-b border-gray-300 h-7 lg:h-8">
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 bg-gray-100 font-medium text-xs lg:text-sm w-16 text-center">연번</td>
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 text-xs lg:text-sm w-12 text-center">
                        {isEditingForm ? (
                          <input
                            type="text"
                            value={formData.serial_number}
                            onChange={(e) => setFormData({...formData, serial_number: e.target.value})}
                            className="w-full border-0 p-0 text-xs lg:text-sm bg-transparent focus:ring-0 focus:border-0 text-center"
                          />
                        ) : (
                          formData.serial_number || '1'
                        )}
                      </td>
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 bg-gray-100 font-medium text-xs lg:text-sm w-16 text-center">지사명</td>
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 text-red-600 font-medium text-xs lg:text-sm text-center">
                        {isEditingForm ? (
                          <input
                            type="text"
                            value={formData.branch_name}
                            onChange={(e) => setFormData({...formData, branch_name: e.target.value})}
                            className="w-full border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-center"
                            placeholder="지사명"
                          />
                        ) : (
                          formData.branch_name || '지사명'
                        )}
                      </td>
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 bg-gray-100 font-medium text-xs lg:text-sm w-16 text-center">공사명</td>
                      <td className="px-1 lg:px-1.5 py-1 lg:py-1.5 text-red-600 font-medium text-xs lg:text-sm text-center">
                        {isEditingForm ? (
                          <input
                            type="text"
                            value={formData.project_name}
                            onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                            className="w-full border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-center"
                            placeholder="프로젝트명"
                          />
                        ) : (
                          formData.project_name || projectName
                        )}
                      </td>
                    </tr>
                    <tr className="h-12 lg:h-14">
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 bg-gray-100 font-medium text-xs lg:text-sm text-center">공사감독</td>
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 text-red-600 font-medium text-xs lg:text-sm text-center" colSpan={3}>
                        {isEditingForm ? (
                          <input
                            type="text"
                            value={formData.supervisor}
                            onChange={(e) => setFormData({...formData, supervisor: e.target.value})}
                            className="w-full border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-center"
                            placeholder="공사감독"
                          />
                        ) : (
                          formData.supervisor || '4급 총감독'
                        )}
                      </td>
                      <td className="border-r border-gray-300 px-1 lg:px-1.5 py-1 lg:py-1.5 bg-gray-100 font-medium text-xs lg:text-sm text-center">시공사</td>
                      <td className="px-1 lg:px-1.5 py-1 lg:py-1.5 text-red-600 font-medium text-xs lg:text-sm text-center">
                        {isEditingForm ? (
                          <input
                            type="text"
                            value={formData.contractor}
                            onChange={(e) => setFormData({...formData, contractor: e.target.value})}
                            className="w-full border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-center"
                            placeholder="시공사명"
                          />
                        ) : (
                          formData.contractor || '시공사명'
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 사진 영역 - 첨부 이미지와 동일한 테이블 레이아웃 */}
              <div className="px-2 py-3 lg:px-4 lg:py-4 border-b border-gray-300">
                <div className="border border-gray-300">
                  {/* 상단 체크 라벨 행 */}
                  <div className="grid grid-cols-2">
                    <label className="flex items-center justify-start space-x-2 px-2 lg:px-3 py-1 lg:py-1.5 border-r border-gray-300">
                      <span className="inline-block border border-gray-500 w-4 h-4 lg:w-5 lg:h-5"></span>
                      <span className="text-xs lg:text-sm font-medium">점검사진</span>
                    </label>
                    <label className="flex items-center justify-start space-x-2 px-2 lg:px-3 py-1 lg:py-1.5">
                      <span className="inline-block border border-gray-500 w-4 h-4 lg:w-5 lg:h-5"></span>
                      <span className="text-xs lg:text-sm font-medium">위험성평가서 사진</span>
                    </label>
                  </div>

                  {/* 하단 2칸 프레임 */}
                  <div className="grid grid-cols-2 border-t border-gray-300">
                    {/* 점검사진 영역 */}
                    <div className="h-22 lg:h-28 bg-white border-r border-gray-300 relative">
                      {formData.inspection_photo_previews.length > 0 ? (
                        <div className="relative w-full h-full">
                          <img
                            src={formData.inspection_photo_previews[0]}
                            alt="점검 사진"
                            className="w-full h-full object-cover"
                          />
                          {isEditingForm && (
                            <button
                              onClick={() => handleRemovePhoto(0, 'inspection')}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                          )}
                          {formData.inspection_photo_previews.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                              +{formData.inspection_photo_previews.length - 1}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center cursor-pointer select-none"
                          onClick={() => isEditingForm && inspectionFileInputRef.current?.click()}
                        >
                          <span className="text-[10px] lg:text-xs text-gray-400 italic">점검자가 점검하고 있는 사진</span>
                        </div>
                      )}
                      <input
                        ref={inspectionFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            Array.from(e.target.files).forEach(file => handlePhotoAdd(file, 'inspection'))
                            e.target.value = ''
                          }
                        }}
                      />
                    </div>

                    {/* 위험성평가서 사진 영역 */}
                    <div className="h-22 lg:h-28 bg-white relative">
                      {formData.risk_assessment_photo_previews.length > 0 ? (
                        <div className="relative w-full h-full">
                          <img
                            src={formData.risk_assessment_photo_previews[0]}
                            alt="위험성평가서 사진"
                            className="w-full h-full object-cover"
                          />
                          {isEditingForm && (
                            <button
                              onClick={() => handleRemovePhoto(0, 'risk_assessment')}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                          )}
                          {formData.risk_assessment_photo_previews.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                              +{formData.risk_assessment_photo_previews.length - 1}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center cursor-pointer select-none"
                          onClick={() => isEditingForm && riskFileInputRef.current?.click()}
                        >
                          <span className="text-[10px] lg:text-xs text-gray-400 italic">실제 작성한 위험성평가서 사진</span>
                        </div>
                      )}
                      <input
                        ref={riskFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            Array.from(e.target.files).forEach(file => handlePhotoAdd(file, 'risk_assessment'))
                            e.target.value = ''
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 업로드된 사진 썸네일 영역 */}
              {(formData.inspection_photo_previews.length > 0 || formData.risk_assessment_photo_previews.length > 0) && (
                <div className="px-2 py-2 lg:px-4 lg:py-3 border-b border-gray-300">
                  <div className="text-xs lg:text-sm font-medium text-gray-700 mb-2">첨부된 사진</div>
                  <div className="space-y-3">
                    {formData.inspection_photo_previews.length > 0 && (
                      <div>
                        <div className="text-[10px] lg:text-xs text-gray-500 mb-1">점검사진</div>
                        <div className="flex flex-wrap gap-2">
                          {formData.inspection_photo_previews.map((url, idx) => (
                            <div key={`insp-${idx}`} className="relative w-16 h-16 lg:w-20 lg:h-20 border border-gray-300 rounded overflow-hidden bg-white">
                              <img src={url} alt={`점검사진 ${idx + 1}`} className="w-full h-full object-cover" />
                              {isEditingForm && (
                                <button
                                  onClick={() => handleRemovePhoto(idx, 'inspection')}
                                  className="absolute top-0.5 right-0.5 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-opacity-70"
                                  aria-label="점검사진 삭제"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {formData.risk_assessment_photo_previews.length > 0 && (
                      <div>
                        <div className="text-[10px] lg:text-xs text-gray-500 mb-1">위험성평가서 사진</div>
                        <div className="flex flex-wrap gap-2">
                          {formData.risk_assessment_photo_previews.map((url, idx) => (
                            <div key={`risk-${idx}`} className="relative w-16 h-16 lg:w-20 lg:h-20 border border-gray-300 rounded overflow-hidden bg-white">
                              <img src={url} alt={`위험성평가서 사진 ${idx + 1}`} className="w-full h-full object-cover" />
                              {isEditingForm && (
                                <button
                                  onClick={() => handleRemovePhoto(idx, 'risk_assessment')}
                                  className="absolute top-0.5 right-0.5 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-opacity-70"
                                  aria-label="위험성평가서 사진 삭제"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 위험성평가 테이블 */}
              <div className="px-2 py-3 lg:px-4 lg:py-4">
                <div className="mb-3 lg:mb-4">
                  <label className="flex items-start space-x-3">
                    <input 
                      type="checkbox" 
                      className="form-checkbox h-4 w-4 lg:h-5 lg:w-5 mt-1"
                      checked={formData.risk_assessment_check}
                      onChange={(e) => isEditingForm && setFormData({...formData, risk_assessment_check: e.target.checked})}
                      disabled={!isEditingForm}
                    />
                    <span className="text-[11px] lg:text-sm font-medium leading-none tracking-tight whitespace-nowrap">위험성평가 주요 유해위험요인 및 위험성 감소대책 (위험등급 중, 상반 기재)</span>
                  </label>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-gray-300 min-w-96">
                    <thead>
                      <tr className="bg-gray-100 h-6 lg:h-8">
                        <th rowSpan={2} className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 w-20 lg:w-28 text-center font-medium text-xs lg:text-sm align-middle">세부작업</th>
                        <th rowSpan={2} className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 w-24 lg:w-32 text-center font-medium text-xs lg:text-sm align-middle">유해위험요인</th>
                        <th colSpan={2} className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center font-medium text-xs lg:text-sm">
                          위험성 감소대책
                        </th>
                        <th rowSpan={2} className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 w-12 lg:w-16 text-center font-medium text-xs lg:text-sm align-middle">비고</th>
                      </tr>
                      <tr className="bg-gray-100 h-6 lg:h-8">
                        <th className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center font-medium text-xs lg:text-sm">세부내용</th>
                        <th className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 w-16 lg:w-20 text-center font-medium text-xs lg:text-sm">
                          이행여부<br/>
                          <div className="flex justify-center space-x-1 lg:space-x-2 text-[10px] lg:text-xs font-medium">
                            <span>여</span><span>부</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.risk_items.map((item, i) => (
                        <tr key={i} className="h-9 lg:h-10">
                          <td className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center align-middle">
                            {isEditingForm ? (
                              <input
                                type="text"
                                value={item.detail_work}
                                onChange={(e) => {
                                  const newItems = [...formData.risk_items]
                                  newItems[i] = {...newItems[i], detail_work: e.target.value}
                                  setFormData({...formData, risk_items: newItems})
                                }}
                                className="w-full border-0 p-0 text-[11px] lg:text-xs bg-transparent focus:ring-0 focus:border-0 text-center"
                                placeholder="세부작업"
                              />
                            ) : (
                              <span className="text-xs lg:text-sm">{item.detail_work}</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center align-middle">
                            {isEditingForm ? (
                              <input
                                type="text"
                                value={item.risk_factor}
                                onChange={(e) => {
                                  const newItems = [...formData.risk_items]
                                  newItems[i] = {...newItems[i], risk_factor: e.target.value}
                                  setFormData({...formData, risk_items: newItems})
                                }}
                                className="w-full border-0 p-0 text-[11px] lg:text-xs bg-transparent focus:ring-0 focus:border-0 text-center"
                                placeholder="위험요인"
                              />
                            ) : (
                              <span className="text-xs lg:text-sm">{item.risk_factor}</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center align-middle">
                            {isEditingForm ? (
                              <input
                                type="text"
                                value={item.reduction_measure}
                                onChange={(e) => {
                                  const newItems = [...formData.risk_items]
                                  newItems[i] = {...newItems[i], reduction_measure: e.target.value}
                                  setFormData({...formData, risk_items: newItems})
                                }}
                                className="w-full border-0 p-0 text-[11px] lg:text-xs bg-transparent focus:ring-0 focus:border-0 text-center"
                                placeholder="감소대책"
                              />
                            ) : (
                              <span className="text-xs lg:text-sm">{item.reduction_measure}</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center align-middle">
                            <div className="flex justify-center items-center space-x-1 lg:space-x-2">
                              <input 
                                type="checkbox" 
                                className="form-checkbox h-3 w-3 lg:h-4 lg:w-4"
                                checked={item.implementation_yes}
                                onChange={(e) => {
                                  if (isEditingForm) {
                                    const newItems = [...formData.risk_items]
                                    newItems[i] = {...newItems[i], implementation_yes: e.target.checked, implementation_no: !e.target.checked}
                                    setFormData({...formData, risk_items: newItems})
                                  }
                                }}
                                disabled={!isEditingForm}
                              />
                              <input 
                                type="checkbox" 
                                className="form-checkbox h-3 w-3 lg:h-4 lg:w-4"
                                checked={item.implementation_no}
                                onChange={(e) => {
                                  if (isEditingForm) {
                                    const newItems = [...formData.risk_items]
                                    newItems[i] = {...newItems[i], implementation_no: e.target.checked, implementation_yes: !e.target.checked}
                                    setFormData({...formData, risk_items: newItems})
                                  }
                                }}
                                disabled={!isEditingForm}
                              />
                            </div>
                          </td>
                          <td className="border border-gray-300 px-1.5 py-1.5 lg:px-2 lg:py-2 text-center align-middle">
                            {isEditingForm ? (
                              <input
                                type="text"
                                value={item.remarks}
                                onChange={(e) => {
                                  const newItems = [...formData.risk_items]
                                  newItems[i] = {...newItems[i], remarks: e.target.value}
                                  setFormData({...formData, risk_items: newItems})
                                }}
                                className="w-full border-0 p-0 text-[11px] lg:text-xs bg-transparent focus:ring-0 focus:border-0 text-center"
                                placeholder="비고"
                              />
                            ) : (
                              <span className="text-xs lg:text-sm">{item.remarks}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 하단 서명란 */}
              <div className="flex justify-end items-end p-2 lg:p-4">
                <div className="flex flex-col items-end text-right">
                  <div className="text-red-600 font-medium mb-4 lg:mb-8 text-xs lg:text-sm">
                    {isEditingForm ? (
                      <div className="flex space-x-1 justify-end">
                        <input
                          type="text"
                          value={formData.inspection_year}
                          onChange={(e) => setFormData({...formData, inspection_year: e.target.value})}
                          className="w-12 border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-right"
                          placeholder="2024"
                        />
                        <span>.</span>
                        <input
                          type="text"
                          value={formData.inspection_month}
                          onChange={(e) => setFormData({...formData, inspection_month: e.target.value})}
                          className="w-6 border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-center"
                          placeholder="월"
                        />
                        <span>.</span>
                        <input
                          type="text"
                          value={formData.inspection_day}
                          onChange={(e) => setFormData({...formData, inspection_day: e.target.value})}
                          className="w-6 border-0 p-0 text-xs lg:text-sm text-red-600 font-medium bg-transparent focus:ring-0 focus:border-0 text-center"
                          placeholder="일"
                        />
                        <span>.</span>
                      </div>
                    ) : (
                      `${formData.inspection_year}. ${formData.inspection_month}. ${formData.inspection_day}.`
                    )}
                  </div>
                  <div className="text-xs lg:text-sm font-medium flex items-center justify-end space-x-2">
                    {isEditingForm ? (
                      <>
                        <input
                          type="text"
                          value={formData.inspector_name}
                          onChange={(e) => setFormData({...formData, inspector_name: e.target.value})}
                          className="border-0 p-0 text-xs lg:text-sm font-medium bg-transparent focus:ring-0 focus:border-0 text-right"
                          placeholder="점검자명"
                        />
                        <span>(서명)</span>
                      </>
                    ) : (
                      <>
                        <span>{formData.inspector_name || '점검자'}</span>
                        <span>(서명)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

export default ManagerInspectionModal