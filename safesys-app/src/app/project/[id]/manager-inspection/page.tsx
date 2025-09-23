'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, FileText, X, Upload, Camera, ChevronDown, ChevronUp, PenTool, Trash2, Download, RotateCw } from 'lucide-react'
import { Project } from '@/lib/projects'

interface ExtendedProject extends Project {
  user_profiles?: {
    full_name?: string
    company_name?: string
  }
}
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface ManagerInspectionRecord {
  id: string
  project_id: string
  created_by: string
  inspection_date: string
  construction_supervisor?: string
  inspector_name: string
  inspection_photo?: string
  risk_assessment_photo?: string
  signature?: string
  risk_factors_json?: any[]
  remarks?: string
  created_at: string
  user_profiles?: {
    full_name: string
  }
}

export default function ManagerInspectionPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const fromBranch = searchParams.get('fromBranch')

  const [project, setProject] = useState<ExtendedProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inspectionRecords, setInspectionRecords] = useState<ManagerInspectionRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDateRecords, setSelectedDateRecords] = useState<ManagerInspectionRecord[]>([])
  // 월 필터 제거: 전체 데이터 조회로 변경
  const [showAddForm, setShowAddForm] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(11) // 페이지당 11개 항목
  const [newRecord, setNewRecord] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    construction_supervisor: '',
    inspector_name: '',
    inspection_photo: null as File | null,
    risk_assessment_photo: null as File | null,
    inspection_photo_preview: '' as string,
    risk_assessment_photo_preview: '' as string,
    remarks: '',
    risk_factors: [
      {
        detail_work: '',
        risk_factor: '',
        details: '',
        implementation: 'yes' as 'yes' | 'no'
      }
    ]
  })
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signature, setSignature] = useState('')
  const [expandedRiskFactors, setExpandedRiskFactors] = useState<boolean[]>([true]) // 첫 번째 항목은 기본적으로 펼쳐짐
  const [isBasicInfoExpanded, setIsBasicInfoExpanded] = useState(true) // 기본 정보 섹션 펼침 상태
  const inspectionPhotoRef = useRef<HTMLInputElement>(null)
  const riskAssessmentPhotoRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isDownloadMode, setIsDownloadMode] = useState(false)
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set())
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedDeleteRecords, setSelectedDeleteRecords] = useState<Set<string>>(new Set())
  const [isSignatureMode, setIsSignatureMode] = useState(false)
  const [selectedSignatureRecords, setSelectedSignatureRecords] = useState<Set<string>>(new Set())
  const [bulkSignature, setBulkSignature] = useState('')
  const [showBulkSignatureModal, setShowBulkSignatureModal] = useState(false)
  
  // 로드 상태 추적을 위한 ref
  const loadedProjectRef = useRef<string | null>(null)
  const loadedMonthRef = useRef<string | null>(null)

  // 이미지를 960x720으로 리사이즈하여 JPEG 파일로 변환 (여백은 흰색으로 레터박스 처리)
  const resizeImageToJpeg = (file: File, targetWidth = 960, targetHeight = 720, quality = 0.85): Promise<File> => {
    return new Promise((resolve, reject) => {
      try {
        const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
        if (isHeic) {
          // 브라우저에서 HEIC 디코딩이 어려울 수 있으므로 리사이즈를 건너뜀
          console.warn('HEIC/HEIF 형식은 브라우저에서 리사이즈하지 않습니다. 원본 파일을 사용합니다.')
          resolve(file)
          return
        }

        if (!file.type.startsWith('image/')) {
          resolve(file)
          return
        }

        const img = new (window as any).Image()
        const objectUrl = URL.createObjectURL(file)
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = targetWidth
            canvas.height = targetHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              resolve(file)
              return
            }
            // 배경 흰색
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, targetWidth, targetHeight)
            // 원본 비율 유지하여 내부에 맞춤
            const scale = Math.min(targetWidth / img.width, targetHeight / img.height)
            const drawWidth = img.width * scale
            const drawHeight = img.height * scale
            const dx = (targetWidth - drawWidth) / 2
            const dy = (targetHeight - drawHeight) / 2
            ctx.drawImage(img, dx, dy, drawWidth, drawHeight)

            canvas.toBlob((blob) => {
              if (!blob) {
                resolve(file)
                return
              }
              const newName = file.name.replace(/\.[^.]+$/, '') + '_resized.jpg'
              const resizedFile = new File([blob], newName, { type: 'image/jpeg' })
              resolve(resizedFile)
            }, 'image/jpeg', quality)
          } catch (e) {
            console.warn('이미지 리사이즈 중 오류, 원본 사용:', e)
            resolve(file)
          } finally {
            URL.revokeObjectURL(objectUrl)
          }
        }
        img.onerror = (e: any) => {
          console.warn('이미지 로드 실패, 원본 사용')
          URL.revokeObjectURL(objectUrl)
          resolve(file)
        }
        img.src = objectUrl
      } catch (error) {
        console.warn('리사이즈 준비 중 오류, 원본 사용:', error)
        resolve(file)
      }
    })
  }

  // 이미지 파일을 90도 회전하여 새 파일로 반환
  const rotateImageFile = (file: File, direction: 'cw' | 'ccw' = 'cw', quality = 0.9): Promise<File> => {
    return new Promise((resolve, reject) => {
      try {
        const img = new (window as any).Image()
        const objectUrl = URL.createObjectURL(file)
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              URL.revokeObjectURL(objectUrl)
              resolve(file)
              return
            }

            const angle = direction === 'cw' ? Math.PI / 2 : -Math.PI / 2
            canvas.width = img.height
            canvas.height = img.width

            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate(angle)
            ctx.drawImage(img, -img.width / 2, -img.height / 2)

            canvas.toBlob((blob) => {
              try {
                URL.revokeObjectURL(objectUrl)
                if (!blob) {
                  resolve(file)
                  return
                }
                const baseName = file.name.replace(/\.[^.]+$/, '')
                const newName = `${baseName}_rotated.jpg`
                const rotated = new File([blob], newName, { type: 'image/jpeg' })
                resolve(rotated)
              } catch (err) {
                reject(err)
              }
            }, 'image/jpeg', quality)
          } catch (err) {
            URL.revokeObjectURL(objectUrl)
            resolve(file)
          }
        }
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve(file)
        }
        img.src = objectUrl
      } catch (error) {
        resolve(file)
      }
    })
  }

  // 모달이 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (showSignatureModal) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      
      return () => {
        document.body.style.overflow = 'unset'
        document.body.style.touchAction = 'auto'
      }
    }
  }, [showSignatureModal])

  // 정확한 캔버스 좌표 계산 함수
  const getCanvasCoordinates = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  // 서명 캔버스 관련 함수들
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)
    
    ctx.beginPath()
    ctx.moveTo(coords.x, coords.y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)
    
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000000'
    ctx.lineTo(coords.x, coords.y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  // 터치 이벤트 핸들러들 - 스크롤 방지 강화
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const touch = e.touches[0]
    if (touch) {
      startDrawing({
        clientX: touch.clientX,
        clientY: touch.clientY
      } as React.MouseEvent<HTMLCanvasElement>)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const touch = e.touches[0]
    if (touch) {
      draw({
        clientX: touch.clientX,
        clientY: touch.clientY
      } as React.MouseEvent<HTMLCanvasElement>)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    stopDrawing()
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // 캔버스가 비어있는지 확인
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const isEmpty = imageData.data.every((value, index) => {
      // 알파 채널(투명도)만 확인 (RGBA의 A 부분)
      if ((index + 1) % 4 === 0) {
        return value === 0
      }
      return true
    })
    
    if (isEmpty) {
      alert('서명을 해주세요.')
      return
    }
    
    const signatureData = canvas.toDataURL()
    setSignature(signatureData)
    
    // 점검 데이터 저장 - 서명 데이터를 직접 전달
    console.log('점검 데이터:', {
      ...newRecord,
      signature: signatureData,
      risk_factors_json: JSON.stringify(newRecord.risk_factors)
    })
    handleSaveInspection(signatureData, newRecord)
    setShowSignatureModal(false)
  }

  // 일괄 서명 저장 함수
  const handleBulkSignatureSave = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // 캔버스가 비어있는지 확인
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const isEmpty = imageData.data.every((value, index) => {
      // 알파 채널(투명도)만 확인 (RGBA의 A 부분)
      if ((index + 1) % 4 === 0) {
        return value === 0
      }
      return true
    })
    
    if (isEmpty) {
      alert('서명을 해주세요.')
      return
    }

    if (selectedSignatureRecords.size === 0) {
      alert('서명할 항목을 선택해주세요.')
      return
    }

    try {
      const signatureData = canvas.toDataURL()
      const recordIds = Array.from(selectedSignatureRecords)
      
      console.log('일괄 서명 적용 중:', recordIds)

      // 선택된 항목들에 서명 업데이트
      const { error } = await supabase
        .from('manager_inspections')
        .update({ 
          signature: signatureData,
          remarks: '일괄서명완료',
          updated_at: new Date().toISOString()
        })
        .in('id', recordIds)

      if (error) {
        throw error
      }

      alert(`${selectedSignatureRecords.size}개 항목에 서명이 완료되었습니다.`)
      
      // 로컬 상태 업데이트 (서명된 항목들)
      setInspectionRecords(prev => 
        prev.map(record => 
          selectedSignatureRecords.has(record.id) 
            ? { ...record, signature: signatureData, remarks: '일괄서명완료' }
            : record
        )
      )
      
      // 모달 닫기 및 상태 초기화
      setShowBulkSignatureModal(false)
      setIsSignatureMode(false)
      setSelectedSignatureRecords(new Set())
      setBulkSignature('')
      
    } catch (error) {
      console.error('일괄 서명 실패:', error)
      alert('일괄 서명에 실패했습니다.')
    }
  }

  // PDF 생성 함수
  const generatePDF = async () => {
    if (selectedRecords.size === 0) {
      alert('다운로드할 점검 항목을 선택해주세요.')
      return
    }

    if (!project) {
      alert('프로젝트 정보를 불러올 수 없습니다.')
      return
    }

    setIsPdfGenerating(true)
    try {
      const { generateManagerInspectionReport } = await import('@/lib/reports/manager-inspection-report')
      
      await generateManagerInspectionReport({
        project,
        inspections: inspectionRecords,
        selectedRecords: Array.from(selectedRecords)
      })
      
    } catch (error) {
      console.error('PDF 생성 오류:', error)
      alert('PDF 생성 중 오류가 발생했습니다.')
    } finally {
      setIsPdfGenerating(false)
    }
  }

  // 삭제 기능
  const handleDeleteRecords = async () => {
    if (selectedDeleteRecords.size === 0) {
      alert('삭제할 점검 항목을 선택해주세요.')
      return
    }

    if (!confirm(`선택한 ${selectedDeleteRecords.size}개의 점검 항목을 삭제하시겠습니까?`)) {
      return
    }

    try {
      const recordIds = Array.from(selectedDeleteRecords)
      
      const { error } = await supabase
        .from('manager_inspections')
        .delete()
        .in('id', recordIds)

      if (error) {
        throw error
      }

      alert(`${selectedDeleteRecords.size}개의 점검 항목이 삭제되었습니다.`)
      
      // 로컬 상태에서 삭제된 항목들 제거 (DB 재호출 없이)
      setInspectionRecords(prev => 
        prev.filter(record => !selectedDeleteRecords.has(record.id))
      )
      // 로컬 상태 업데이트이므로 ref는 유지 (캐시 무효화하지 않음)
      
      // 삭제 모드 종료
      setIsDeleteMode(false)
      setSelectedDeleteRecords(new Set())
      
    } catch (error) {
      console.error('삭제 실패:', error)
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  const loadProject = useCallback(async () => {
    try {
      // 이미 같은 프로젝트를 로드했다면 스킵
      if (loadedProjectRef.current === projectId) {
        console.log('프로젝트 이미 로드됨, 스킵:', projectId)
        return
      }

      console.log('프로젝트 로드 시작:', projectId)
      setLoading(true)
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select(`
          *,
          user_profiles!projects_created_by_fkey(full_name, company_name)
        `)
        .eq('id', projectId)
        .single()

      if (projectError) {
        throw new Error(projectError.message)
      }

      setProject(data)
      loadedProjectRef.current = projectId
      console.log('프로젝트 로드 완료:', projectId)
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
      loadedProjectRef.current = null
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadInspectionRecords = useCallback(async () => {
    try {
      if (!projectId) return

      // 로드 키 생성 (프로젝트ID 기준)
      const loadKey = `${projectId}-all`
      
      // 이미 같은 프로젝트 데이터를 로드했다면 스킵
      if (loadedMonthRef.current === loadKey) {
        console.log('점검 기록 이미 로드됨(전체), 스킵:', loadKey)
        return
      }

      console.log('관리자 점검 기록 전체 조회:', { projectId })

      const { data, error } = await supabase
        .from('manager_inspections')
        .select(`
          *,
          user_profiles(full_name)
        `)
        .eq('project_id', projectId)
        .order('inspection_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        console.error('관리자 점검 기록 조회 오류:', error)
        return
      }

      console.log('관리자 점검 기록 전체 조회 결과:', data)
      setInspectionRecords(data || [])
      loadedMonthRef.current = loadKey

    } catch (error) {
      console.error('관리자 점검 기록 로드 실패:', error)
    }
  }, [projectId])

  const handleBack = () => {
    router.push('/')
  }

  const handleNewInspection = () => {
    setShowAddForm(true)
  }

  const handleSaveInspection = useCallback(async (signatureData?: string | null, recordData?: any) => {
    try {
      if (!user || !project) {
        throw new Error('사용자 또는 프로젝트 정보가 없습니다')
      }

      // 사용할 데이터 결정 (전달된 recordData 우선, 없으면 현재 newRecord 사용)
      const dataToUse = recordData || newRecord
      
      // 고유 ID 생성 (파일명에 사용)
      const inspectionId = `mgr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 1. 점검사진 업로드
      let inspectionPhotoUrl: string | null = null
      if (dataToUse.inspection_photo) {
        console.log('점검사진 업로드 시작')
        try {
          const fileExt = dataToUse.inspection_photo.name.split('.').pop()
          const fileName = `${inspectionId}_inspection.${fileExt}`
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('inspection-photos')
            .upload(fileName, dataToUse.inspection_photo, {
              cacheControl: '3600',
              upsert: false
            })

          if (uploadError) {
            console.error('점검사진 업로드 실패:', uploadError)
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from('inspection-photos')
              .getPublicUrl(fileName)
            
            inspectionPhotoUrl = publicUrl
            console.log('점검사진 업로드 성공:', fileName)
          }
        } catch (error) {
          console.error('점검사진 업로드 오류:', error)
        }
      }

      // 2. 위험성평가 사진 업로드
      let riskAssessmentPhotoUrl: string | null = null
      if (dataToUse.risk_assessment_photo) {
        console.log('위험성평가 사진 업로드 시작')
        try {
          const fileExt = dataToUse.risk_assessment_photo.name.split('.').pop()
          const fileName = `${inspectionId}_risk_assessment.${fileExt}`
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('inspection-photos')
            .upload(fileName, dataToUse.risk_assessment_photo, {
              cacheControl: '3600',
              upsert: false
            })

          if (uploadError) {
            console.error('위험성평가 사진 업로드 실패:', uploadError)
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from('inspection-photos')
              .getPublicUrl(fileName)
            
            riskAssessmentPhotoUrl = publicUrl
            console.log('위험성평가 사진 업로드 성공:', fileName)
          }
        } catch (error) {
          console.error('위험성평가 사진 업로드 오류:', error)
        }
      }

      // 3. 데이터베이스에 저장
      console.log('데이터베이스 저장 데이터:', {
        project_id: project.id,
        created_by: user.id,
        inspection_date: dataToUse.inspection_date,
        construction_supervisor: dataToUse.construction_supervisor,
        inspector_name: dataToUse.inspector_name,
        inspection_photo: inspectionPhotoUrl,
        risk_assessment_photo: riskAssessmentPhotoUrl,
        signature: signatureData || signature || null,
        risk_factors_json: dataToUse.risk_factors,
        remarks: signatureData ? dataToUse.remarks : (dataToUse.remarks || '서명X')
      })

      const { data: insertedData, error: insertError } = await supabase
        .from('manager_inspections')
        .insert({
          project_id: project.id,
          created_by: user.id,
          inspection_date: dataToUse.inspection_date,
          construction_supervisor: dataToUse.construction_supervisor || '',
          inspector_name: dataToUse.inspector_name || '',
          inspection_photo: inspectionPhotoUrl,
          risk_assessment_photo: riskAssessmentPhotoUrl,
          signature: signatureData || signature || null,
          risk_factors_json: dataToUse.risk_factors,
          remarks: (signatureData !== null && signatureData) ? dataToUse.remarks : (dataToUse.remarks || '서명X')
        })
        .select()
        .single()

      if (insertError) {
        console.error('관리자 점검 저장 오류:', insertError)
        throw new Error(`데이터 저장 실패: ${insertError.message}`)
      }

      console.log('관리자 점검 데이터 저장 성공:', insertedData)
      
      // 업로드 결과 요약
      const uploadSummary = []
      uploadSummary.push(`점검일: ${newRecord.inspection_date}`)
      uploadSummary.push(`점검자: ${newRecord.inspector_name}`)
      uploadSummary.push(`점검사진: ${inspectionPhotoUrl ? '업로드 완료' : '업로드 안함'}`)
      uploadSummary.push(`위험성평가 사진: ${riskAssessmentPhotoUrl ? '업로드 완료' : '업로드 안함'}`)
      uploadSummary.push(`서명: ${signature ? '완료' : '없음'}`)
      
      alert(`관리자 점검이 성공적으로 저장되었습니다!\n\n${uploadSummary.join('\n')}`)
      
      // 저장된 데이터를 로컬 상태에 추가 (DB 재호출 없이)
      const newInspectionWithProfile = {
        ...insertedData,
        user_profiles: user ? { full_name: userProfile?.full_name || '' } : null
      }
      
      // 전체 목록에 항상 추가
      setInspectionRecords(prev => [newInspectionWithProfile, ...prev])
      // 로컬 상태 업데이트이므로 ref는 유지 (캐시 무효화하지 않음)
      
      setShowAddForm(false)
      
      // 폼 초기화
      setNewRecord({
        inspection_date: new Date().toISOString().split('T')[0],
        construction_supervisor: '',
        inspector_name: '',
        inspection_photo: null,
        risk_assessment_photo: null,
        remarks: '',
        risk_factors: [
          {
            detail_work: '',
            risk_factor: '',
            details: '',
            implementation: 'yes'
          }
        ]
      })
      setSignature('')
      
    } catch (error) {
      console.error('관리자 점검 저장 실패:', error)
      alert('관리자 점검 저장에 실패했습니다.')
    }
  }, [user, project, userProfile])

  useEffect(() => {
    if (user && projectId) {
      loadProject()
      loadInspectionRecords()
    }
  }, [user?.id, projectId]) // user.id로 변경하여 user 객체 변경에 민감하지 않게 함

  // 월 필터 제거됨: 추가 로드 트리거 불필요

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
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">관리자 일상점검</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
          <div className="px-4 py-6 sm:px-0 lg:px-0">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-sm text-red-700">{error}</div>
              <button 
                onClick={loadProject}
                className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
              >
                다시 시도
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // 프로젝트가 없는 경우
  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">관리자 일상점검</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
          <div className="px-4 py-6 sm:px-0 lg:px-0">
            <div className="text-center">
              <p className="text-gray-500">프로젝트를 찾을 수 없습니다.</p>
            </div>
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
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">
                {project?.project_name} - 관리자 일상점검
              </h1>
            </div>
            <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0 ml-2">
              <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
              <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role})</span>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 - 펼쳐진 파일철 */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 파일철 외곽 */}
        <div className="p-2 lg:p-6 rounded-lg shadow-lg" style={{ backgroundColor: 'rgb(88, 190, 213)' }}>
          {/* 파일철 내부 */}
          <div className="bg-white rounded-lg shadow-inner min-h-[600px] relative">
            
            {/* 중앙 구분선 - 데스크톱에서는 세로선만 */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px hidden lg:block" style={{ backgroundColor: 'rgb(68, 170, 193)' }}></div>
            
            {/* 콘텐츠 영역 */}
            <div className="flex flex-col lg:flex-row h-full">
              {/* 모바일: 점검 등록 먼저, 데스크톱: 좌측 점검 목록 */}
              <div className="lg:flex-1 p-2 lg:p-4 relative order-2 lg:order-1">
                {/* 모바일용 가로 구분선 - 점검 목록 상단 */}
                <div className="absolute top-0 left-4 right-4 h-1 lg:hidden" style={{ backgroundColor: 'rgb(88, 190, 213)' }}></div>
                <div className="h-full flex flex-col pt-4 lg:pt-0">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <FileText className="h-6 w-6 text-blue-600 mr-3" />
                      <h2 className="text-xl font-semibold text-gray-900">관리자 점검 내역</h2>
                    </div>
                    {/* 월 네비게이션 제거: 전체 조회 */}
                    <div className="flex items-center gap-2">
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => {
                          if (isDeleteMode) {
                            setIsDeleteMode(false)
                            setSelectedDeleteRecords(new Set())
                          } else {
                            setIsDeleteMode(true)
                            setIsDownloadMode(false) // 다운로드 모드 비활성화
                            setSelectedRecords(new Set())
                          }
                        }}
                        className={`p-2 rounded-lg font-medium transition-colors flex items-center justify-center ${
                          isDeleteMode 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-red-500 hover:bg-red-600 text-white'
                        }`}
                      >
                        {isDeleteMode ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                      
                      {/* 서명 버튼 */}
                      <button
                        onClick={() => {
                          if (isSignatureMode) {
                            setIsSignatureMode(false)
                            setSelectedSignatureRecords(new Set())
                          } else {
                            setIsSignatureMode(true)
                            setIsDownloadMode(false)
                            setIsDeleteMode(false)
                            setSelectedRecords(new Set())
                            setSelectedDeleteRecords(new Set())
                          }
                        }}
                        className={`p-2 rounded-lg font-medium transition-colors flex items-center justify-center ${
                          isSignatureMode 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                      >
                        {isSignatureMode ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <PenTool className="h-4 w-4" />
                        )}
                      </button>
                      
                      {/* 다운로드 버튼 */}
                      <button
                        onClick={() => {
                          if (isDownloadMode) {
                            setIsDownloadMode(false)
                            setSelectedRecords(new Set())
                          } else {
                            setIsDownloadMode(true)
                            setIsDeleteMode(false) // 삭제 모드 비활성화
                            setSelectedDeleteRecords(new Set())
                          }
                        }}
                        className={`p-2 rounded-lg font-medium transition-colors flex items-center justify-center ${
                          isDownloadMode 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isDownloadMode ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  {/* 월 네비게이션 제거: 전체 조회 */}
                  
                  {/* 다운로드 모드일 때 선택된 항목 수 표시 */}
                  {isDownloadMode && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-blue-800">
                          선택된 항목: {selectedRecords.size}개
                        </span>
                        {selectedRecords.size > 0 && (
                          <button
                            onClick={generatePDF}
                            disabled={isPdfGenerating}
                            className={`px-3 py-1 text-white text-sm rounded transition-colors flex items-center gap-2 ${
                              isPdfGenerating 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {isPdfGenerating ? (
                              <>
                                <div className="animate-spin h-4 w-4">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </div>
                                PDF 생성 중...
                              </>
                            ) : (
                              `선택 항목 다운로드 (${selectedRecords.size}건)`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 삭제 모드일 때 선택된 항목 수 표시 */}
                  {isDeleteMode && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-red-800">
                          선택된 항목: {selectedDeleteRecords.size}개
                        </span>
                        {selectedDeleteRecords.size > 0 && (
                          <button
                            onClick={handleDeleteRecords}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
                          >
                            <Trash2 className="h-4 w-4" />
                            선택 항목 삭제
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 서명 모드일 때 선택된 항목 수 표시 */}
                  {isSignatureMode && (
                    <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-purple-800">
                          서명 없는 항목: {inspectionRecords.filter(record => !record.signature).length}개 | 선택된 항목: {selectedSignatureRecords.size}개
                        </span>
                        {selectedSignatureRecords.size > 0 && (
                          <button
                            onClick={() => setShowBulkSignatureModal(true)}
                            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                          >
                            <PenTool className="h-4 w-4" />
                            선택 항목 서명
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* 점검 목록 테이블 */}
                  <div className="bg-gray-50 rounded-lg p-4 flex-1 overflow-auto">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 text-sm">
                        <thead>
                          <tr className="bg-gray-200">
                            <th className="border border-gray-300 p-1 text-center font-bold text-xs">연번</th>
                            <th className="border border-gray-300 p-1 text-center font-bold text-xs">일자</th>
                            <th className="border border-gray-300 p-1 text-center font-bold text-xs">점검자</th>
                            <th className="border border-gray-300 p-1 text-center font-bold text-xs whitespace-nowrap">주요위험요인<br/>(개수)</th>
                            <th className="border border-gray-300 p-1 text-center font-bold text-xs">
                              {isDownloadMode ? '선택' : isDeleteMode ? '삭제' : isSignatureMode ? '서명' : '비고'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // 페이지네이션 계산
                            const startIndex = (currentPage - 1) * itemsPerPage
                            const endIndex = startIndex + itemsPerPage
                            const currentPageRecords = inspectionRecords.slice(startIndex, endIndex)
                            
                            return (
                              <>
                                {/* 실제 데이터 행들 */}
                                {currentPageRecords.map((record, index) => (
                                  <tr key={record.id} className="hover:bg-gray-100">
                                    <td className="border border-gray-300 p-2 text-center">{inspectionRecords.length - (startIndex + index)}</td>
                                    <td className="border border-gray-300 p-2 text-center">
                                      {new Date(record.inspection_date).toLocaleDateString('ko-KR')}
                                    </td>
                                    <td className="border border-gray-300 p-2 text-center">
                                      {record.inspector_name || '-'}
                                    </td>
                                    <td className="border border-gray-300 p-2 text-center">
                                      {(() => {
                                        // risk_factors_json에서 위험요인 개수 계산
                                        const riskFactors = record.risk_factors_json || []
                                        const count = Array.isArray(riskFactors) ? riskFactors.length : 0
                                        return `${count}개`
                                      })()}
                                    </td>
                                    <td className="border border-gray-300 p-2 text-center">
                                      {isDownloadMode ? (
                                        <input
                                          type="checkbox"
                                          checked={selectedRecords.has(record.id)}
                                          onChange={(e) => {
                                            const newSelected = new Set(selectedRecords)
                                            if (e.target.checked) {
                                              newSelected.add(record.id)
                                            } else {
                                              newSelected.delete(record.id)
                                            }
                                            setSelectedRecords(newSelected)
                                          }}
                                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                      ) : isDeleteMode ? (
                                        <input
                                          type="checkbox"
                                          checked={selectedDeleteRecords.has(record.id)}
                                          onChange={(e) => {
                                            const newSelected = new Set(selectedDeleteRecords)
                                            if (e.target.checked) {
                                              newSelected.add(record.id)
                                            } else {
                                              newSelected.delete(record.id)
                                            }
                                            setSelectedDeleteRecords(newSelected)
                                          }}
                                          className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                                        />
                                      ) : isSignatureMode ? (
                                        // 서명이 없는 항목만 체크 가능
                                        !record.signature ? (
                                          <input
                                            type="checkbox"
                                            checked={selectedSignatureRecords.has(record.id)}
                                            onChange={(e) => {
                                              const newSelected = new Set(selectedSignatureRecords)
                                              if (e.target.checked) {
                                                newSelected.add(record.id)
                                              } else {
                                                newSelected.delete(record.id)
                                              }
                                              setSelectedSignatureRecords(newSelected)
                                            }}
                                            className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                                          />
                                        ) : (
                                          <span className="text-green-600 text-xs">서명완료</span>
                                        )
                                      ) : (
                                        record.remarks || '-'
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {/* 빈 행들 (최소 11개 행 보장) */}
                                {Array.from({ length: Math.max(0, itemsPerPage - currentPageRecords.length) }, (_, i) => (
                                  <tr key={`empty-${i}`}>
                                    <td className="border border-gray-300 p-2 h-10 text-center">
                                      {/* 빈 행은 연번 표시하지 않음 */}
                                    </td>
                                    <td className="border border-gray-300 p-2 text-center">-</td>
                                    <td className="border border-gray-300 p-2 text-center">-</td>
                                    <td className="border border-gray-300 p-2 text-center">-</td>
                                    <td className="border border-gray-300 p-2 text-center">-</td>
                                  </tr>
                                ))}
                              </>
                            )
                          })()}
                        </tbody>
                      </table>
                    </div>
                    {inspectionRecords.length === 0 && (
                      <div className="mt-4 text-center text-gray-500 text-sm">
                        점검 내역이 없습니다.
                      </div>
                    )}
                    
                    {/* 페이지네이션 */}
                    {(
                      <div className="mt-4 flex justify-center items-center space-x-2">
                        {(() => {
                          const totalPages = Math.max(1, Math.ceil(inspectionRecords.length / itemsPerPage))
                          const pages = []
                          
                          // 이전 버튼
                          pages.push(
                            <button
                              key="prev"
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                              className={`px-3 py-1 text-sm border rounded ${
                                currentPage === 1 
                                  ? 'text-gray-400 border-gray-300 cursor-not-allowed' 
                                  : 'text-gray-700 border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              &lt;
                            </button>
                          )
                          
                          // 페이지 번호들
                          for (let i = 1; i <= totalPages; i++) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                className={`px-3 py-1 text-sm border rounded ${
                                  currentPage === i
                                    ? 'bg-blue-500 text-white border-blue-500'
                                    : 'text-gray-700 border-gray-300 hover:bg-gray-100'
                                }`}
                              >
                                {i}
                              </button>
                            )
                          }
                          
                          // 다음 버튼
                          pages.push(
                            <button
                              key="next"
                              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                              disabled={currentPage === totalPages}
                              className={`px-3 py-1 text-sm border rounded ${
                                currentPage === totalPages 
                                  ? 'text-gray-400 border-gray-300 cursor-not-allowed' 
                                  : 'text-gray-700 border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              &gt;
                            </button>
                          )
                          
                          return pages
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 모바일: 점검 등록 먼저, 데스크톱: 우측 점검표 */}
              <div className="lg:flex-1 p-2 lg:p-4 relative order-1 lg:order-2">
                {/* 모바일용 가로 구분선 - 점검 등록 하단 */}
                <div className="absolute bottom-0 left-4 right-4 h-1 lg:hidden" style={{ backgroundColor: 'rgb(88, 190, 213)' }}></div>
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <FileText className="h-6 w-6 text-green-600 mr-3" />
                      <h2 className="text-xl font-semibold text-gray-900">관리자 일상점검 등록</h2>
                    </div>
                    {showAddForm && (
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  
                  {/* 점검 등록 폼 */}
                  <div className="bg-gray-50 rounded-lg p-2 lg:p-6 flex-1 overflow-auto">
                    {!showAddForm ? (
                      <div className="text-center py-12">
                        <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">관리자 일상점검 등록</h3>
                        <p className="text-gray-600 mb-6">새로운 관리자 점검을 등록해보세요.</p>
                        <button
                          onClick={handleNewInspection}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                          점검 등록하기
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-6">
                          {/* 기본 정보 섹션 */}
                          <div className="border border-gray-300 rounded-lg bg-gray-50">
                            <div className="flex justify-between items-center p-4 cursor-pointer"
                                 onClick={() => setIsBasicInfoExpanded(!isBasicInfoExpanded)}>
                              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                기본 정보
                                {(newRecord.construction_supervisor || newRecord.inspector_name) && (
                                  <span className="text-sm text-gray-600">
                                    - {[newRecord.construction_supervisor, newRecord.inspector_name].filter(Boolean).join(', ')}
                                  </span>
                                )}
                              </h4>
                              {isBasicInfoExpanded ? (
                                <ChevronUp className="h-5 w-5 text-gray-500" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-gray-500" />
                              )}
                            </div>
                            
                            {isBasicInfoExpanded && (
                              <div className="p-4 pt-0 space-y-6">
                                {/* 공사감독과 점검자를 같은 줄에 배치 - 모바일에서도 수평 배치 */}
                                <div className="grid grid-cols-2 gap-4">
                                  {/* 공사감독 */}
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      공사감독
                                    </label>
                                    <input
                                      type="text"
                                      value={newRecord.construction_supervisor}
                                      onChange={(e) => setNewRecord({...newRecord, construction_supervisor: e.target.value})}
                                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      placeholder="4급 홍길동"
                                    />
                                  </div>

                                  {/* 점검자 */}
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      점검자
                                    </label>
                                    <input
                                      type="text"
                                      value={newRecord.inspector_name}
                                      onChange={(e) => setNewRecord({...newRecord, inspector_name: e.target.value})}
                                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      placeholder="1급 홍길동"
                                    />
                                  </div>
                                </div>

                                {/* 점검일자 */}
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    점검일자
                                  </label>
                                  <input
                                    type="date"
                                    value={newRecord.inspection_date}
                                    onChange={(e) => setNewRecord({...newRecord, inspection_date: e.target.value})}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </div>

                                {/* 점검사진과 위험성평가 사진 수평 배치 */}
                                <div className="grid grid-cols-2 gap-4">
                                  {/* 점검사진 */}
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      점검사진
                                    </label>
                                    <input
                                      ref={inspectionPhotoRef}
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          // 파일 크기 체크 (20MB)
                                          if (file.size > 20 * 1024 * 1024) {
                                            alert(`${file.name}은(는) 20MB를 초과합니다.`)
                                            e.target.value = ''
                                            return
                                          }
                                          
                                          if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) {
                                            // 리사이즈 시도 (HEIC/HEIF는 그대로 사용될 수 있음)
                                            const resized = await resizeImageToJpeg(file, 960, 720, 0.85)
                                            const previewUrl = URL.createObjectURL(resized)
                                            if (newRecord.inspection_photo_preview) {
                                              URL.revokeObjectURL(newRecord.inspection_photo_preview)
                                            }
                                            setNewRecord({...newRecord, inspection_photo: resized, inspection_photo_preview: previewUrl})
                                          } else {
                                            const previewUrl = URL.createObjectURL(file)
                                            if (newRecord.inspection_photo_preview) {
                                              URL.revokeObjectURL(newRecord.inspection_photo_preview)
                                            }
                                            setNewRecord({...newRecord, inspection_photo: file, inspection_photo_preview: previewUrl})
                                          }
                                        }
                                      }}
                                      className="hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => inspectionPhotoRef.current?.click()}
                                      className="w-full p-3 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center text-gray-600 hover:text-blue-600"
                                    >
                                      <Camera className="h-6 w-6" />
                                    </button>
                                    {newRecord.inspection_photo_preview && (
                                      <div className="mt-2">
                                        <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                          <img src={newRecord.inspection_photo_preview} alt="점검사진 미리보기" className="w-full h-full object-contain" />
                                          <button
                                            type="button"
                                            className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="시계방향 회전"
                                            onClick={async () => {
                                              if (!newRecord.inspection_photo) return
                                              const rotated = await rotateImageFile(newRecord.inspection_photo, 'cw')
                                              const previewUrl = URL.createObjectURL(rotated)
                                              if (newRecord.inspection_photo_preview) {
                                                URL.revokeObjectURL(newRecord.inspection_photo_preview)
                                              }
                                              setNewRecord({
                                                ...newRecord,
                                                inspection_photo: rotated,
                                                inspection_photo_preview: previewUrl
                                              })
                                            }}
                                          >
                                            <RotateCw className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* 위험성평가 사진 */}
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      위험성평가 사진
                                    </label>
                                    <input
                                      ref={riskAssessmentPhotoRef}
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          // 파일 크기 체크 (20MB)
                                          if (file.size > 20 * 1024 * 1024) {
                                            alert(`${file.name}은(는) 20MB를 초과합니다.`)
                                            e.target.value = ''
                                            return
                                          }
                                          
                                          if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) {
                                            // 리사이즈 시도 (HEIC/HEIF는 그대로 사용될 수 있음)
                                            const resized = await resizeImageToJpeg(file, 960, 720, 0.85)
                                            const previewUrl = URL.createObjectURL(resized)
                                            if (newRecord.risk_assessment_photo_preview) {
                                              URL.revokeObjectURL(newRecord.risk_assessment_photo_preview)
                                            }
                                            setNewRecord({...newRecord, risk_assessment_photo: resized, risk_assessment_photo_preview: previewUrl})
                                          } else {
                                            const previewUrl = URL.createObjectURL(file)
                                            if (newRecord.risk_assessment_photo_preview) {
                                              URL.revokeObjectURL(newRecord.risk_assessment_photo_preview)
                                            }
                                            setNewRecord({...newRecord, risk_assessment_photo: file, risk_assessment_photo_preview: previewUrl})
                                          }
                                        }
                                      }}
                                      className="hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => riskAssessmentPhotoRef.current?.click()}
                                      className="w-full p-3 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center text-gray-600 hover:text-blue-600"
                                    >
                                      <Camera className="h-6 w-6" />
                                    </button>
                                    {newRecord.risk_assessment_photo_preview && (
                                      <div className="mt-2">
                                        <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                          <img src={newRecord.risk_assessment_photo_preview} alt="위험성평가 사진 미리보기" className="w-full h-full object-contain" />
                                          <button
                                            type="button"
                                            className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="시계방향 회전"
                                            onClick={async () => {
                                              if (!newRecord.risk_assessment_photo) return
                                              const rotated = await rotateImageFile(newRecord.risk_assessment_photo, 'cw')
                                              const previewUrl = URL.createObjectURL(rotated)
                                              if (newRecord.risk_assessment_photo_preview) {
                                                URL.revokeObjectURL(newRecord.risk_assessment_photo_preview)
                                              }
                                              setNewRecord({
                                                ...newRecord,
                                                risk_assessment_photo: rotated,
                                                risk_assessment_photo_preview: previewUrl
                                              })
                                            }}
                                          >
                                            <RotateCw className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 위험성평가 주요 유해위험요인 */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              위험성평가 주요 유해위험요인 및 위험성 감소대책
                              <span className="text-sm text-gray-500 ml-2">(위험등급 중, "상"만 기재)</span>
                            </label>
                            
                            {newRecord.risk_factors.map((factor, index) => (
                              <div key={index} className="border border-gray-300 rounded-lg mb-4 bg-gray-50">
                                <div className="flex justify-between items-center p-4 cursor-pointer" 
                                     onClick={() => {
                                       const newExpanded = [...expandedRiskFactors]
                                       newExpanded[index] = !newExpanded[index]
                                       setExpandedRiskFactors(newExpanded)
                                     }}>
                                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                    주요위험요인 #{index + 1}
                                    {factor.detail_work && (
                                      <span className="text-sm text-gray-600">- {factor.detail_work}</span>
                                    )}
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    {newRecord.risk_factors.length > 1 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          const updatedFactors = newRecord.risk_factors.filter((_, i) => i !== index)
                                          const updatedExpanded = expandedRiskFactors.filter((_, i) => i !== index)
                                          setNewRecord({...newRecord, risk_factors: updatedFactors})
                                          setExpandedRiskFactors(updatedExpanded)
                                        }}
                                        className="text-red-500 hover:text-red-700 text-sm"
                                      >
                                        삭제
                                      </button>
                                    )}
                                    {expandedRiskFactors[index] ? (
                                      <ChevronUp className="h-5 w-5 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="h-5 w-5 text-gray-500" />
                                    )}
                                  </div>
                                </div>
                                
                                {expandedRiskFactors[index] && (
                                  <div className="p-4 pt-0">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* 세부작업 */}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          세부작업
                                        </label>
                                        <input
                                          type="text"
                                          value={factor.detail_work}
                                          onChange={(e) => {
                                            const updatedFactors = [...newRecord.risk_factors]
                                            updatedFactors[index].detail_work = e.target.value
                                            setNewRecord({...newRecord, risk_factors: updatedFactors})
                                          }}
                                          className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                          placeholder="세부작업을 입력하세요"
                                        />
                                      </div>

                                      {/* 유해위험요인 */}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          유해위험요인
                                        </label>
                                        <input
                                          type="text"
                                          value={factor.risk_factor}
                                          onChange={(e) => {
                                            const updatedFactors = [...newRecord.risk_factors]
                                            updatedFactors[index].risk_factor = e.target.value
                                            setNewRecord({...newRecord, risk_factors: updatedFactors})
                                          }}
                                          className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                          placeholder="유해위험요인을 입력하세요"
                                        />
                                      </div>

                                      {/* 위험성 감소대책(세부내용) */}
                                      <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          위험성 감소대책(세부내용)
                                        </label>
                                        <textarea
                                          value={factor.details}
                                          onChange={(e) => {
                                            const updatedFactors = [...newRecord.risk_factors]
                                            updatedFactors[index].details = e.target.value
                                            setNewRecord({...newRecord, risk_factors: updatedFactors})
                                          }}
                                          className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                          rows={3}
                                          placeholder="위험성 감소대책의 세부내용을 입력하세요"
                                        />
                                      </div>

                                      {/* 이행여부 */}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          이행여부
                                        </label>
                                        <select
                                          value={factor.implementation}
                                          onChange={(e) => {
                                            const updatedFactors = [...newRecord.risk_factors]
                                            updatedFactors[index].implementation = e.target.value as 'yes' | 'no'
                                            setNewRecord({...newRecord, risk_factors: updatedFactors})
                                          }}
                                          className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                          <option value="yes">여</option>
                                          <option value="no">부</option>
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* 추가하기 버튼 */}
                            <button
                              onClick={() => {
                                const newFactor = {
                                  detail_work: '',
                                  risk_factor: '',
                                  details: '',
                                  implementation: 'yes' as 'yes' | 'no'
                                }
                                // 새 항목 추가
                                setNewRecord({
                                  ...newRecord, 
                                  risk_factors: [...newRecord.risk_factors, newFactor]
                                })
                                // 기존 항목들은 접고, 새 항목만 펼치기
                                const newExpanded = new Array(newRecord.risk_factors.length).fill(false)
                                newExpanded.push(true) // 새로 추가된 항목만 펼침
                                setExpandedRiskFactors(newExpanded)
                              }}
                              className="w-full p-3 border border-dashed border-gray-400 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                            >
                              <Plus className="h-4 w-4" />
                              <span>추가하기</span>
                            </button>
                          </div>
                        </div>

                        {/* 안내 문구 */}
                        <div className="flex justify-end pt-4 pb-2">
                          <p className="text-xs text-gray-500">💡 서명은 목록에서 일괄로 가능합니다</p>
                        </div>

                        {/* 버튼 */}
                        <div className="flex justify-end space-x-3">
                          <button
                            onClick={() => setShowAddForm(false)}
                            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => {
                              console.log('현재 newRecord 상태:', newRecord)
                              // 필수 필드 검증
                              if (!newRecord.inspector_name.trim()) {
                                alert('점검자 이름을 입력해주세요.')
                                return
                              }
                              if (!newRecord.construction_supervisor.trim()) {
                                alert('공사감독을 입력해주세요.')
                                return
                              }
                              if (newRecord.risk_factors.every(factor => 
                                !factor.detail_work.trim() && !factor.risk_factor.trim() && !factor.details.trim()
                              )) {
                                alert('최소 하나 이상의 위험요인을 입력해주세요.')
                                return
                              }
                              // 서명 없이 바로 제출 - 현재 값들을 직접 전달
                              handleSaveInspection(null, {
                                ...newRecord,
                                construction_supervisor: newRecord.construction_supervisor,
                                inspector_name: newRecord.inspector_name
                              })
                            }}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                          >
                            제출
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 일괄 서명 모달 */}
      {showBulkSignatureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-50 overflow-hidden">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-2 max-h-[95vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-900">
                <PenTool className="h-6 w-6 inline mr-2" />
                일괄 서명 ({selectedSignatureRecords.size}개 항목)
              </h2>
              <button
                onClick={() => {
                  setShowBulkSignatureModal(false)
                  setBulkSignature('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* 서명 영역 */}
            <div className="p-2 flex-1 flex flex-col min-h-0">
              <p className="text-sm text-gray-600 mb-2 px-4 flex-shrink-0">
                아래 영역에 마우스나 터치로 서명해주세요. 선택된 {selectedSignatureRecords.size}개 항목에 모두 적용됩니다.
              </p>
              
              <div className="bg-white flex-1 relative touch-none">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={400}
                  className="w-full h-full cursor-crosshair border border-gray-300 touch-none"
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                />
              </div>
            </div>

            {/* 푸터 */}
            <div className="flex items-center justify-between p-4 border-t bg-gray-50 flex-shrink-0">
              <button
                type="button"
                onClick={clearSignature}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                지우기
              </button>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowBulkSignatureModal(false)
                    setBulkSignature('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleBulkSignatureSave}
                  className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                >
                  일괄 서명 완료
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-50 overflow-hidden">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-2 max-h-[95vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-900">
                <PenTool className="h-6 w-6 inline mr-2" />
                점검자 서명
              </h2>
              <button
                onClick={() => {
                  setShowSignatureModal(false)
                  setSignature('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* 서명 영역 */}
            <div className="p-2 flex-1 flex flex-col min-h-0">
              <p className="text-sm text-gray-600 mb-2 px-4 flex-shrink-0">
                아래 영역에 마우스나 터치로 서명해주세요.
              </p>
              
              <div className="bg-white flex-1 relative touch-none">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={400}
                  className="w-full h-full cursor-crosshair border border-gray-300 touch-none"
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                />
              </div>
            </div>

            {/* 푸터 */}
            <div className="flex items-center justify-between p-4 border-t bg-gray-50 flex-shrink-0">
              <button
                type="button"
                onClick={clearSignature}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                지우기
              </button>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowSignatureModal(false)
                    setSignature('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  서명 완료 및 제출
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}