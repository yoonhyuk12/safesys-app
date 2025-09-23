'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, FileText, ChevronLeft, ChevronRight, X, Upload, Camera, ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, Edit, Trash2, Download, Printer, RotateCw } from 'lucide-react'
import { generateHeadquartersInspectionReport } from '@/lib/reports/headquarters-inspection'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface ExtendedProject extends Project {
  user_profiles?: {
    full_name?: string
    company_name?: string
  }
}

interface ChecklistItem {
  title: string
  status: 'good' | 'bad' | ''
  remarks: string
}

export default function HeadquartersInspectionPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const fromBranch = searchParams.get('fromBranch')

  const [project, setProject] = useState<ExtendedProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [inspections, setInspections] = useState<any[]>([])
  const [inspectionsLoading, setInspectionsLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null) // 업로드 중인 사진 ID
  const [showOnlyPending, setShowOnlyPending] = useState(false) // 조치 대기만 보기 필터
  const [isDesktop, setIsDesktop] = useState(false) // 데스크톱 여부 판단
  const [isDeleteMode, setIsDeleteMode] = useState(false) // 삭제 모드 여부
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]) // 삭제할 항목들의 ID
  const [downloading, setDownloading] = useState(false)
  const [isDownloadMode, setIsDownloadMode] = useState(false) // 보고서 선택 모드 여부
  const [selectedForReport, setSelectedForReport] = useState<string[]>([]) // 보고서 대상 항목 ID
  
  // 등록 폼 상태
  const [newRecord, setNewRecord] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_name: '',
    site_photo_overview: null as File | null, // 점검 전경사진
    site_photo_issue1: null as File | null,   // 지적사항 사진1
    site_photo_issue2: null as File | null,   // 지적사항 사진2
    site_photo_overview_preview: '' as string,
    site_photo_issue1_preview: '' as string,
    site_photo_issue2_preview: '' as string,
    issue_content1: '',                       // 지적사항 내용1 (필수)
    issue_content2: '',                       // 지적사항 내용2 (선택)
    // 중요 항목들
    critical_items: [
      { title: '위험공종 작업허가제 승인, 작업계획서 작성 적정성', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '전조등, 후방영상장치 작동상태, 후사경의 설치상태, 운전자 안전띠', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '작업장소 지형 및 지반상태', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '출입통제, 작업지휘자, 신호수 배치', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '안양작업시 안전조치', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' }
    ],
    // 요주의 항목들
    caution_items: [
      { title: '가설통로 및 작업발판 안전조치', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '비계·동바리 구조 안전', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '고소작업, 개구부 등 안전조치', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' }
    ],
    // 기타 항목들
    other_items: [
      { title: '법적이행사항 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: 'VAR 매뉴얼 작동성 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '취약근로자 안전관리 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '기타 현장 안전관리에 관한사항', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' }
    ]
  })
  
  // UI 상태
  const [isBasicInfoExpanded, setIsBasicInfoExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<'critical' | 'caution' | 'other'>('critical') // 탭 상태
  const [expandedCriticalItems, setExpandedCriticalItems] = useState<boolean[]>([true, true, true, true, true])
  const [expandedCautionItems, setExpandedCautionItems] = useState<boolean[]>([true, true, true]) // 3개 항목 모두 펼침
  const [expandedOtherItems, setExpandedOtherItems] = useState<boolean[]>([true, true, true, true]) // 4개 항목 모두 펼침
  
  // 파일 참조
  const sitePhotoOverviewRef = useRef<HTMLInputElement>(null)
  const sitePhotoIssue1Ref = useRef<HTMLInputElement>(null)
  const sitePhotoIssue2Ref = useRef<HTMLInputElement>(null)

  // 이미지를 1920x1440으로 리사이즈하여 JPEG 파일로 변환 (여백은 흰색으로 레터박스 처리)
  const resizeImageToJpeg = (file: File, targetWidth = 1920, targetHeight = 1440, quality = 0.95): Promise<File> => {
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
            ;(ctx as any).imageSmoothingEnabled = true
            ;(ctx as any).imageSmoothingQuality = 'high'
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

  // 이미지 파일 90도 회전 (시계/반시계)
  const rotateImageFile = (file: File, direction: 'cw' | 'ccw' = 'cw', quality = 0.9): Promise<File> => {
    return new Promise((resolve) => {
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
              URL.revokeObjectURL(objectUrl)
              if (!blob) {
                resolve(file)
                return
              }
              const baseName = file.name.replace(/\.[^.]+$/, '')
              const rotated = new File([blob], `${baseName}_rotated.jpg`, { type: 'image/jpeg' })
              resolve(rotated)
            }, 'image/jpeg', quality)
          } catch {
            URL.revokeObjectURL(objectUrl)
            resolve(file)
          }
        }
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve(file)
        }
        img.src = objectUrl
      } catch {
        resolve(file)
      }
    })
  }

  const loadProject = async () => {
    try {
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
    } catch (err: any) {
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 본부 불시점검 내역 불러오기
  const loadInspections = async () => {
    try {
      setInspectionsLoading(true)

      const { data, error } = await supabase
        .from('headquarters_inspections')
        .select(`
          *,
          user_profiles!headquarters_inspections_created_by_fkey(full_name)
        `)
        .eq('project_id', projectId)
        .order('inspection_date', { ascending: false })

      if (error) {
        console.error('점검 내역 불러오기 실패:', error)
        return
      }

      setInspections(data || [])
    } catch (err: any) {
      console.error('점검 내역 불러오기 오류:', err)
    } finally {
      setInspectionsLoading(false)
    }
  }

  const handleBack = () => {
    router.push('/')
  }

  // 파일을 Supabase Storage에 업로드하는 함수
  const uploadFileToStorage = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { data, error } = await supabase.storage
      .from('inspection-photos')
      .upload(filePath, file)

    if (error) {
      console.error('파일 업로드 오류:', error)
      throw new Error(`파일 업로드 실패: ${error.message}`)
    }

    // Public URL 생성
    const { data: { publicUrl } } = supabase.storage
      .from('inspection-photos')
      .getPublicUrl(filePath)

    return publicUrl
  }

  // 삭제 모드 토글 핸들러
  const handleDeleteModeToggle = () => {
    setIsDeleteMode(!isDeleteMode)
    setSelectedForDelete([]) // 삭제 모드 변경 시 선택 초기화
  }

  // 항목 선택/해제 핸들러
  const handleSelectForDelete = (inspectionId: string) => {
    setSelectedForDelete(prev => 
      prev.includes(inspectionId) 
        ? prev.filter(id => id !== inspectionId)
        : [...prev, inspectionId]
    )
  }

  // 선택된 항목들 삭제 핸들러
  const handleDeleteSelected = async () => {
    if (selectedForDelete.length === 0) {
      alert('삭제할 항목을 선택해주세요.')
      return
    }

    if (!confirm(`선택한 ${selectedForDelete.length}개 항목을 삭제하시겠습니까?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('headquarters_inspections')
        .delete()
        .in('id', selectedForDelete)

      if (error) {
        throw new Error(error.message)
      }

      alert('선택한 항목들이 삭제되었습니다.')
      setSelectedForDelete([])
      setIsDeleteMode(false)
      loadInspections() // 목록 새로고침
    } catch (error: any) {
      console.error('삭제 오류:', error)
      alert(`삭제 실패: ${error.message}`)
    }
  }

  // 보고서 선택 모드 토글
  const handleDownloadModeToggle = () => {
    if (isDeleteMode) {
      alert('현재 삭제 모드입니다. 먼저 삭제 모드를 종료해주세요.')
      return
    }
    setIsDownloadMode(!isDownloadMode)
    setSelectedForReport([])
  }

  // 보고서 선택 토글
  const handleSelectForReport = (inspectionId: string) => {
    setSelectedForReport(prev => (
      prev.includes(inspectionId)
        ? prev.filter(id => id !== inspectionId)
        : [...prev, inspectionId]
    ))
  }

  // 선택 항목 보고서 생성 (임시 CSV - 양식 확정 후 교체)
  const handleGenerateReport = async () => {
    if (selectedForReport.length === 0) {
      alert('보고서로 내보낼 항목을 선택해주세요.')
      return
    }
    try {
      setDownloading(true)
      const selected = inspections.filter(ins => selectedForReport.includes(ins.id))
      await generateHeadquartersInspectionReport({
        projectName: project?.project_name || 'project',
        inspections: selected,
        branchName: project?.managing_branch || undefined,
      })
      setIsDownloadMode(false)
      setSelectedForReport([])
    } catch (e) {
      console.error('보고서 생성 오류:', e)
      alert('보고서 생성 중 오류가 발생했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  // 조치 상태 계산: 조치사진 업로드 여부를 우선하여 상태를 산정
  const getOverallStatus = (inspection: any): 'completed' | 'in_progress' | 'pending' => {
    const hasIssue2 = Boolean((inspection.issue_content2 && inspection.issue_content2.trim()) || inspection.site_photo_issue2)
    const issue1Completed = Boolean(inspection.action_photo_issue1) || inspection.issue1_status === 'completed'
    const issue2Completed = !hasIssue2 ? true : (Boolean(inspection.action_photo_issue2) || inspection.issue2_status === 'completed')
    if (issue1Completed && issue2Completed) return 'completed'
    const anyInProgress = inspection.issue1_status === 'in_progress' || inspection.issue2_status === 'in_progress'
    if (anyInProgress || inspection.action_photo_issue1 || inspection.action_photo_issue2) return 'in_progress'
    return 'pending'
  }

  // 조치사진 업로드 핸들러
  const handleActionPhotoUpload = async (inspectionId: string, issueNumber: 1 | 2, file: File) => {
    try {
      setUploadingPhoto(`${inspectionId}-${issueNumber}`)
      
      // 이미지 리사이즈
      const resizedFile = await resizeImageToJpeg(file, 1920, 1440, 0.95)
      
      // 파일 업로드
      const photoUrl = await uploadFileToStorage(resizedFile, 'headquarters-actions')
      
      // 데이터베이스 업데이트
      const updateData = issueNumber === 1 
        ? { action_photo_issue1: photoUrl, issue1_status: 'completed' }
        : { action_photo_issue2: photoUrl, issue2_status: 'completed' }
      
      const { error } = await supabase
        .from('headquarters_inspections')
        .update(updateData)
        .eq('id', inspectionId)
      
      if (error) {
        throw new Error(error.message)
      }
      
      // 목록 새로고침
      loadInspections()
      alert('조치사진이 성공적으로 업로드되었습니다!')
      
    } catch (error: any) {
      console.error('조치사진 업로드 오류:', error)
      alert(`업로드 실패: ${error.message}`)
    } finally {
      setUploadingPhoto(null)
    }
  }

  // 파일 선택 핸들러
  const handleFileSelect = (inspectionId: string, issueNumber: 1 | 2) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        // 파일 크기 체크 (20MB)
        if (file.size > 20 * 1024 * 1024) {
          alert(`파일이 20MB를 초과합니다.`)
          return
        }
        handleActionPhotoUpload(inspectionId, issueNumber, file)
      }
    }
    input.click()
  }

  // 폼 제출 핸들러
  const handleSubmit = async () => {
    try {
      // 필수 필드 검증
      if (!newRecord.inspector_name.trim()) {
        alert('점검자 이름을 입력해주세요.')
        return
      }
      
      if (!newRecord.site_photo_issue1) {
        alert('지적사항 사진 1을 업로드해주세요.')
        return
      }
      
      if (!newRecord.issue_content1.trim()) {
        alert('지적사항 내용 1을 입력해주세요.')
        return
      }

      setLoading(true)

      // 파일 업로드
      let sitePhotoOverviewUrl = null
      let sitePhotoIssue1Url = null
      let sitePhotoIssue2Url = null

      if (newRecord.site_photo_overview) {
        sitePhotoOverviewUrl = await uploadFileToStorage(newRecord.site_photo_overview, 'headquarters-overview')
      }

      if (newRecord.site_photo_issue1) {
        sitePhotoIssue1Url = await uploadFileToStorage(newRecord.site_photo_issue1, 'headquarters-issues')
      }

      if (newRecord.site_photo_issue2) {
        sitePhotoIssue2Url = await uploadFileToStorage(newRecord.site_photo_issue2, 'headquarters-issues')
      }

      // 데이터베이스에 저장
      const { data, error } = await supabase
        .from('headquarters_inspections')
        .insert({
          project_id: projectId,
          inspection_date: newRecord.inspection_date,
          inspector_name: newRecord.inspector_name,
          site_photo_overview: sitePhotoOverviewUrl,
          site_photo_issue1: sitePhotoIssue1Url,
          site_photo_issue2: sitePhotoIssue2Url,
          issue_content1: newRecord.issue_content1,
          issue_content2: newRecord.issue_content2 || null,
          critical_items: newRecord.critical_items,
          caution_items: newRecord.caution_items,
          other_items: newRecord.other_items,
          created_by: user?.id
        })
        .select()

      if (error) {
        console.error('데이터 저장 오류:', error)
        alert(`저장 실패: ${error.message}`)
        return
      }

      alert('본부 불시점검이 성공적으로 저장되었습니다!')
      
      // 폼 초기화
      setShowAddForm(false)
      setNewRecord({
        inspection_date: new Date().toISOString().split('T')[0],
        inspector_name: '',
        site_photo_overview: null,
        site_photo_issue1: null,
        site_photo_issue2: null,
        issue_content1: '',
        issue_content2: '',
        critical_items: [
          { title: '위험공종 작업허가제 승인, 작업계획서 작성 적정성', status: 'good', remarks: '특이사항 없음' },
          { title: '전조등, 후방영상장치 작동상태, 후사경의 설치상태, 운전자 안전띠', status: 'good', remarks: '특이사항 없음' },
          { title: '작업장소 지형 및 지반상태', status: 'good', remarks: '특이사항 없음' },
          { title: '출입통제, 작업지휘자, 신호수 배치', status: 'good', remarks: '특이사항 없음' },
          { title: '안양작업시 안전조치', status: 'good', remarks: '특이사항 없음' }
        ],
        caution_items: [
          { title: '가설통로 및 작업발판 안전조치', status: 'good', remarks: '특이사항 없음' },
          { title: '비계·동바리 구조 안전', status: 'good', remarks: '특이사항 없음' },
          { title: '고소작업, 개구부 등 안전조치', status: 'good', remarks: '특이사항 없음' }
        ],
        other_items: [
          { title: '법적이행사항 확인', status: 'good', remarks: '특이사항 없음' },
          { title: 'VAR 매뉴얼 작동성 확인', status: 'good', remarks: '특이사항 없음' },
          { title: '취약근로자 안전관리 확인', status: 'good', remarks: '특이사항 없음' },
          { title: '기타 현장 안전관리에 관한사항', status: 'good', remarks: '특이사항 없음' }
        ]
      })

      // 목록 새로고침
      loadInspections()

    } catch (error: any) {
      console.error('제출 오류:', error)
      alert(`오류가 발생했습니다: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 필터링된 점검 목록
  const filteredInspections = showOnlyPending 
    ? inspections.filter(inspection => getOverallStatus(inspection) !== 'completed')
    : inspections

  useEffect(() => {
    if (user && projectId) {
      loadProject()
      loadInspections()
    }
  }, [user, projectId])

  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

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
              <h1 className="text-xl font-bold text-gray-900">본부 불시점검</h1>
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
              <h1 className="text-xl font-bold text-gray-900">본부 불시점검</h1>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center flex-1 min-w-0">
              <button
                onClick={handleBack}
                className="mr-2 lg:mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">
                {project?.project_name} - 본부 불시점검
              </h1>
            </div>
            <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0 ml-2">
              <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
              <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role})</span>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 - 전체 화면 점검 내역 */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 파일철 외곽 */}
        <div className="p-2 lg:p-6 rounded-lg shadow-lg" style={{ backgroundColor: 'rgb(88, 190, 213)' }}>
          {/* 파일철 내부 */}
          <div className="bg-white rounded-lg shadow-inner min-h-[600px] relative">
            
            {/* 전체 화면 점검 내역 */}
            <div className="h-full p-2 lg:p-4">
              {/* 헤더 - 제목과 버튼들 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <FileText className="h-6 w-6 text-blue-600 mr-3" />
                  <h2 className="text-xl font-semibold text-gray-900">본부 불시점검 내역</h2>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* 미조치 필터 버튼 */}
                  <button
                    onClick={() => setShowOnlyPending(!showOnlyPending)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      showOnlyPending 
                        ? 'bg-red-600 text-white hover:bg-red-700' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    title={showOnlyPending ? '전체 보기' : '미조치만 보기'}
                  >
                    {showOnlyPending ? '전체 보기' : '미조치'}
                  </button>
                  
                  {/* 발주청만 볼 수 있는 버튼들 */}
                  {userProfile?.role === '발주청' && (
                    <>
                      {/* 다운로드 선택 모드 */}
                      {isDownloadMode ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleGenerateReport}
                            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            title="선택한 항목 보고서 받기"
                            aria-label="보고서 받기"
                            disabled={downloading || selectedForReport.length === 0}
                          >
                            {downloading ? (
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <Printer className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={handleDownloadModeToggle}
                            className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center"
                            title="보고서 선택 모드 종료"
                            aria-label="보고서 선택 모드 종료"
                            disabled={downloading}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        !isDeleteMode && (
                          <button
                            onClick={handleDownloadModeToggle}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="보고서 선택 모드"
                            disabled={inspections.length === 0}
                          >
                            <Download className="h-5 w-5" />
                          </button>
                        )
                      )}
                      {/* 삭제 모드 버튼 */}
                      {isDeleteMode ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleDeleteSelected}
                            className="px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                            title="선택한 항목 삭제"
                            disabled={selectedForDelete.length === 0}
                          >
                            삭제 ({selectedForDelete.length})
                          </button>
                          <button
                            onClick={handleDeleteModeToggle}
                            className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
                            title="삭제 모드 종료"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleDeleteModeToggle}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="삭제 모드"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                      
                      {/* 등록 버튼 */}
                      {!isDeleteMode && (
                        <button
                          onClick={() => setShowAddForm(true)}
                          className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg transition-colors group"
                          title="점검 등록하기"
                        >
                          <Plus className="h-6 w-6" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* 점검 목록 영역 */}
              <div className="bg-gray-50 rounded-lg p-4 flex-1 overflow-auto" style={{ minHeight: 'calc(100% - 100px)' }}>
                {inspectionsLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">점검 내역을 불러오는 중...</p>
                  </div>
                ) : filteredInspections.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">본부 불시점검 내역</h3>
                    <p className="text-gray-600 mb-4">아직 등록된 점검 내역이 없습니다.</p>
                    {userProfile?.role !== '발주청' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                        <p className="text-blue-700 text-sm font-medium">
                          📋 점검 내역 조회 전용
                        </p>
                        <p className="text-blue-600 text-xs mt-1">
                          {userProfile?.role === '시공사' ? '시공사는' : 
                           userProfile?.role === '감리단' ? '감리단은' : 
                           `${userProfile?.role}은`} 점검 내역 조회만 가능합니다.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full bg-white border border-gray-200 text-sm" style={{ minWidth: isDesktop ? 'auto' : '1200px' }}>
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border border-gray-200 px-0 py-2 text-center font-medium text-gray-700 w-12">No.</th>
                          <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700 w-36">점검일자<br/>(점검자)</th>
                          <th className="border border-gray-200 px-4 py-2 text-center font-medium text-gray-700 w-48">지적사항</th>
                          <th className="border border-gray-200 px-4 py-2 text-center font-medium text-gray-700 w-48">지적사진</th>
                          <th className="border border-gray-200 px-4 py-2 text-center font-medium text-gray-700 w-48">조치사진</th>
                          <th className="border border-gray-200 px-2 py-2 text-center font-medium text-gray-700 w-24">
                            {isDeleteMode ? '선택' : isDownloadMode ? '선택' : '비고'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInspections.map((inspection, index) => {
                          const hasSecondIssue = inspection.issue_content2 && inspection.issue_content2.trim()
                          const rowSpan = hasSecondIssue ? 2 : 1
                          
                          return (
                            <React.Fragment key={inspection.id}>
                              {/* 첫 번째 행 (항상 표시) */}
                              <tr key={`${inspection.id}-1`} className="hover:bg-gray-50">
                                <td className="border border-gray-200 px-0 py-2 text-center" rowSpan={rowSpan}>
                                  {filteredInspections.length - index}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-center" rowSpan={rowSpan}>
                                  <div className="text-xs">
                                    {inspection.site_photo_overview && (
                                      <div className="mb-2">
                                        <img 
                                          src={inspection.site_photo_overview} 
                                          alt="전경사진"
                                          className="w-full h-20 object-fill rounded cursor-pointer hover:scale-105 transition-transform"
                                          onClick={() => window.open(inspection.site_photo_overview, '_blank')}
                                        />
                                      </div>
                                    )}
                                    <div className="font-medium text-gray-800 mb-1">
                                      {new Date(inspection.inspection_date).toLocaleDateString('ko-KR')}
                                    </div>
                                    <div className="text-gray-600">
                                      ({inspection.inspector_name})
                                    </div>
                                  </div>
                                </td>
                                <td className="border border-gray-200 px-6 py-2 align-top text-left">
                                  <div className="text-sm">
                                    <div className="text-gray-700 break-words leading-relaxed">{inspection.issue_content1}</div>
                                  </div>
                                </td>
                                <td className="border border-gray-200 p-2 text-center">
                                  {inspection.site_photo_issue1 && (
                                    <img 
                                      src={inspection.site_photo_issue1} 
                                      alt="지적사진 1"
                                      className="w-full h-32 object-fill rounded cursor-pointer hover:scale-105 transition-transform"
                                      onClick={() => window.open(inspection.site_photo_issue1, '_blank')}
                                    />
                                  )}
                                </td>
                                <td className="border border-gray-200 p-2 text-center">
                                  {inspection.action_photo_issue1 ? (
                                    <div className="relative group">
                                      <img 
                                        src={inspection.action_photo_issue1} 
                                        alt="조치사진 1"
                                        className="w-full h-32 object-fill rounded cursor-pointer hover:scale-105 transition-transform"
                                        onClick={() => window.open(inspection.action_photo_issue1, '_blank')}
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleFileSelect(inspection.id, 1)
                                        }}
                                        className="absolute top-1 right-1 bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-full shadow-lg"
                                        title="조치사진 변경"
                                        disabled={uploadingPhoto === `${inspection.id}-1` || isDeleteMode}
                                      >
                                        {uploadingPhoto === `${inspection.id}-1` ? (
                                          <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                                        ) : (
                                          <Edit className="h-3 w-3" />
                                        )}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center h-32">
                                      {uploadingPhoto === `${inspection.id}-1` ? (
                                        <div className="flex flex-col items-center">
                                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                          <span className="text-xs text-gray-500">업로드 중...</span>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => handleFileSelect(inspection.id, 1)}
                                          className="w-16 h-16 bg-green-100 hover:bg-green-200 text-green-600 hover:text-green-700 rounded-full flex items-center justify-center transition-colors group"
                                          title="조치사진 업로드"
                                          disabled={isDeleteMode}
                                        >
                                          <Plus className="h-8 w-8" />
                                        </button>
                                      )}
                                      <span className="text-xs text-gray-400 mt-1">조치사진</span>
                                    </div>
                                  )}
                                </td>
                                <td className="border border-gray-200 px-2 py-2 text-center" rowSpan={rowSpan}>
                                  {isDeleteMode ? (
                                    <div className="flex items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={selectedForDelete.includes(inspection.id)}
                                        onChange={() => handleSelectForDelete(inspection.id)}
                                        className="w-5 h-5 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500 focus:ring-2"
                                      />
                                    </div>
                                  ) : isDownloadMode ? (
                                    <div className="flex items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={selectedForReport.includes(inspection.id)}
                                        onChange={() => handleSelectForReport(inspection.id)}
                                        className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center">
                                      {getOverallStatus(inspection) === 'completed' ? (
                                        <>
                                          <CheckCircle className="h-5 w-5 text-blue-500 mb-1" />
                                          <span className="text-xs text-blue-600 font-medium">조치완료</span>
                                        </>
                                      ) : getOverallStatus(inspection) === 'in_progress' ? (
                                        <>
                                          <Clock className="h-5 w-5 text-orange-500 mb-1" />
                                          <span className="text-xs text-orange-600 font-medium">조치중</span>
                                        </>
                                      ) : (
                                        <>
                                          <AlertCircle className="h-5 w-5 text-red-500 mb-1" />
                                          <span className="text-xs text-red-600 font-medium">조치대기</span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                              
                              {/* 두 번째 행 (지적사항2가 있는 경우만 표시) */}
                              {hasSecondIssue && (
                                <tr key={`${inspection.id}-2`} className="hover:bg-gray-50">
                                  <td className="border border-gray-200 px-6 py-2 align-top text-left">
                                    <div className="text-sm">
                                      <div className="text-gray-700 break-words leading-relaxed">{inspection.issue_content2}</div>
                                    </div>
                                  </td>
                                  <td className="border border-gray-200 p-2 text-center">
                                    {inspection.site_photo_issue2 && (
                                      <img 
                                        src={inspection.site_photo_issue2} 
                                        alt="지적사진 2"
                                        className="w-full h-32 object-fill rounded cursor-pointer hover:scale-105 transition-transform"
                                        onClick={() => window.open(inspection.site_photo_issue2, '_blank')}
                                      />
                                    )}
                                  </td>
                                  <td className="border border-gray-200 p-2 text-center">
                                    {inspection.action_photo_issue2 ? (
                                      <div className="relative group">
                                        <img 
                                          src={inspection.action_photo_issue2} 
                                          alt="조치사진 2"
                                          className="w-full h-32 object-fill rounded cursor-pointer hover:scale-105 transition-transform"
                                          onClick={() => window.open(inspection.action_photo_issue2, '_blank')}
                                        />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleFileSelect(inspection.id, 2)
                                          }}
                                          className="absolute top-1 right-1 bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-full shadow-lg"
                                          title="조치사진 변경"
                                          disabled={uploadingPhoto === `${inspection.id}-2` || isDeleteMode}
                                        >
                                          {uploadingPhoto === `${inspection.id}-2` ? (
                                            <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                                          ) : (
                                            <Edit className="h-3 w-3" />
                                          )}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center h-32">
                                        {uploadingPhoto === `${inspection.id}-2` ? (
                                          <div className="flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                            <span className="text-xs text-gray-500">업로드 중...</span>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => handleFileSelect(inspection.id, 2)}
                                            className="w-16 h-16 bg-green-100 hover:bg-green-200 text-green-600 hover:text-green-700 rounded-full flex items-center justify-center transition-colors group"
                                            title="조치사진 업로드"
                                            disabled={isDeleteMode}
                                          >
                                            <Plus className="h-8 w-8" />
                                          </button>
                                        )}
                                        <span className="text-xs text-gray-400 mt-1">조치사진</span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 등록 폼 모달 */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              {/* 고정 헤더 바 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white rounded-t-lg flex-shrink-0">
                <h3 className="text-xl font-semibold text-gray-900">본부 불시점검 등록</h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    제출
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              {/* 스크롤 가능한 컨텐츠 영역 */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                
                {/* 기존 등록 폼 내용 */}
                <div className="space-y-6">
                  {/* 기본 정보 섹션 */}
                  <div className="border border-gray-300 rounded-lg bg-gray-50">
                          <div className="flex justify-between items-center p-4 cursor-pointer"
                               onClick={() => setIsBasicInfoExpanded(!isBasicInfoExpanded)}>
                            <h4 className="font-medium text-gray-900 flex items-center gap-2">
                              기본 정보
                              {newRecord.inspector_name && (
                                <span className="text-sm text-gray-600">- {newRecord.inspector_name}</span>
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
                              {/* 점검자와 점검일자 */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    점검자
                                  </label>
                                  <input
                                    type="text"
                                    value={newRecord.inspector_name}
                                    onChange={(e) => setNewRecord({...newRecord, inspector_name: e.target.value})}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="0급 000"
                                  />
                                </div>
                                
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
                              </div>

                              {/* 현장사진 업로드 - 3장 */}
                              <div className="space-y-4">
                                {/* 점검 전경사진 */}
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    점검 전경사진
                                  </label>
                                  <input
                                    ref={sitePhotoOverviewRef}
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
                                          const resized = await resizeImageToJpeg(file, 1920, 1440, 0.95)
                                          const previewUrl = URL.createObjectURL(resized)
                                          if (newRecord.site_photo_overview_preview) {
                                            URL.revokeObjectURL(newRecord.site_photo_overview_preview)
                                          }
                                          setNewRecord({...newRecord, site_photo_overview: resized, site_photo_overview_preview: previewUrl})
                                        } else {
                                          const previewUrl = URL.createObjectURL(file)
                                          if (newRecord.site_photo_overview_preview) {
                                            URL.revokeObjectURL(newRecord.site_photo_overview_preview)
                                          }
                                          setNewRecord({...newRecord, site_photo_overview: file, site_photo_overview_preview: previewUrl})
                                        }
                                      }
                                    }}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => sitePhotoOverviewRef.current?.click()}
                                    className="w-full p-3 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center text-gray-600 hover:text-blue-600"
                                  >
                                    <Camera className="h-6 w-6 mr-2" />
                                    <span>전경사진 촬영</span>
                                  </button>
                                  {newRecord.site_photo_overview && (
                                    <div className="mt-2">
                                      <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                        <img
                                          src={newRecord.site_photo_overview_preview || URL.createObjectURL(newRecord.site_photo_overview)}
                                          alt="전경사진 미리보기"
                                          className="w-full h-full object-contain"
                                        />
                                        <button
                                          type="button"
                                          className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                          title="시계방향 회전"
                                          onClick={async () => {
                                            if (!newRecord.site_photo_overview) return
                                            const rotated = await rotateImageFile(newRecord.site_photo_overview, 'cw')
                                            const previewUrl = URL.createObjectURL(rotated)
                                            if (newRecord.site_photo_overview_preview) {
                                              URL.revokeObjectURL(newRecord.site_photo_overview_preview)
                                            }
                                            setNewRecord({
                                              ...newRecord,
                                              site_photo_overview: rotated,
                                              site_photo_overview_preview: previewUrl
                                            })
                                          }}
                                        >
                                          <RotateCw className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* 지적사항 사진들 */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      지적사항 사진 1 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      ref={sitePhotoIssue1Ref}
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
                                            const resized = await resizeImageToJpeg(file, 1920, 1440, 0.95)
                                            const previewUrl = URL.createObjectURL(resized)
                                            if (newRecord.site_photo_issue1_preview) {
                                              URL.revokeObjectURL(newRecord.site_photo_issue1_preview)
                                            }
                                            setNewRecord({...newRecord, site_photo_issue1: resized, site_photo_issue1_preview: previewUrl})
                                          } else {
                                            const previewUrl = URL.createObjectURL(file)
                                            if (newRecord.site_photo_issue1_preview) {
                                              URL.revokeObjectURL(newRecord.site_photo_issue1_preview)
                                            }
                                            setNewRecord({...newRecord, site_photo_issue1: file, site_photo_issue1_preview: previewUrl})
                                          }
                                        }
                                      }}
                                      className="hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => sitePhotoIssue1Ref.current?.click()}
                                      className="w-full p-3 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center text-gray-600 hover:text-blue-600"
                                    >
                                      <Camera className="h-6 w-6" />
                                    </button>
                                    {newRecord.site_photo_issue1 && (
                                      <div className="mt-2">
                                        <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                          <img
                                            src={newRecord.site_photo_issue1_preview || URL.createObjectURL(newRecord.site_photo_issue1)}
                                            alt="지적사항 사진1 미리보기"
                                            className="w-full h-full object-contain"
                                          />
                                          <button
                                            type="button"
                                            className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="시계방향 회전"
                                            onClick={async () => {
                                              if (!newRecord.site_photo_issue1) return
                                              const rotated = await rotateImageFile(newRecord.site_photo_issue1, 'cw')
                                              const previewUrl = URL.createObjectURL(rotated)
                                              if (newRecord.site_photo_issue1_preview) {
                                                URL.revokeObjectURL(newRecord.site_photo_issue1_preview)
                                              }
                                              setNewRecord({
                                                ...newRecord,
                                                site_photo_issue1: rotated,
                                                site_photo_issue1_preview: previewUrl
                                              })
                                            }}
                                          >
                                            <RotateCw className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 지적사항 내용 1 */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        지적사항 내용 1 <span className="text-red-500">*</span>
                                      </label>
                                      <textarea
                                        value={newRecord.issue_content1}
                                        onChange={(e) => setNewRecord({...newRecord, issue_content1: e.target.value})}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="지적사항 내용을 입력하세요"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      지적사항 사진 2 <span className="text-gray-400">(선택)</span>
                                    </label>
                                    <input
                                      ref={sitePhotoIssue2Ref}
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
                                            const resized = await resizeImageToJpeg(file, 1920, 1440, 0.95)
                                            const previewUrl = URL.createObjectURL(resized)
                                            if (newRecord.site_photo_issue2_preview) {
                                              URL.revokeObjectURL(newRecord.site_photo_issue2_preview)
                                            }
                                            setNewRecord({...newRecord, site_photo_issue2: resized, site_photo_issue2_preview: previewUrl})
                                          } else {
                                            const previewUrl = URL.createObjectURL(file)
                                            if (newRecord.site_photo_issue2_preview) {
                                              URL.revokeObjectURL(newRecord.site_photo_issue2_preview)
                                            }
                                            setNewRecord({...newRecord, site_photo_issue2: file, site_photo_issue2_preview: previewUrl})
                                          }
                                        }
                                      }}
                                      className="hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => sitePhotoIssue2Ref.current?.click()}
                                      className="w-full p-3 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center text-gray-600 hover:text-blue-600"
                                    >
                                      <Camera className="h-6 w-6" />
                                    </button>
                                    {newRecord.site_photo_issue2 && (
                                      <div className="mt-2">
                                        <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                          <img
                                            src={newRecord.site_photo_issue2_preview || URL.createObjectURL(newRecord.site_photo_issue2)}
                                            alt="지적사항 사진2 미리보기"
                                            className="w-full h-full object-contain"
                                          />
                                          <button
                                            type="button"
                                            className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="시계방향 회전"
                                            onClick={async () => {
                                              if (!newRecord.site_photo_issue2) return
                                              const rotated = await rotateImageFile(newRecord.site_photo_issue2, 'cw')
                                              const previewUrl = URL.createObjectURL(rotated)
                                              if (newRecord.site_photo_issue2_preview) {
                                                URL.revokeObjectURL(newRecord.site_photo_issue2_preview)
                                              }
                                              setNewRecord({
                                                ...newRecord,
                                                site_photo_issue2: rotated,
                                                site_photo_issue2_preview: previewUrl
                                              })
                                            }}
                                          >
                                            <RotateCw className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 지적사항 내용 2 */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        지적사항 내용 2 <span className="text-gray-400">(선택)</span>
                                      </label>
                                      <textarea
                                        value={newRecord.issue_content2}
                                        onChange={(e) => setNewRecord({...newRecord, issue_content2: e.target.value})}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="지적사항 내용을 입력하세요 (선택사항)"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* 타임스탬프 카메라 앱 다운로드 버튼 - 작게 */}
                                <div className="flex justify-center items-center gap-2 mt-4">
                                  <span className="text-xs text-gray-600">카메라앱 :</span>
                                  <a 
                                    href="https://play.google.com/store/apps/details?id=com.jeyluta.timestampcamerafree"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded transition-colors"
                                  >
                                    안드로이드
                                  </a>
                                  <a
                                    href="https://apps.apple.com/kr/app/%ED%83%80%EC%9E%84%EC%8A%A4%ED%83%AC%ED%94%84-%EC%9D%B8%EC%A6%9D%EC%83%B7-%EC%B9%B4%EB%A9%94%EB%9D%BC/id1115974495"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs bg-gray-800 hover:bg-gray-900 text-white py-1 px-2 rounded transition-colors"
                                  >
                                    아이폰
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 점검 항목 탭 인터페이스 */}
                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                          {/* 탭 헤더 */}
                          <div className="flex bg-gray-100 border-b border-gray-200">
                            <button
                              type="button"
                              onClick={() => setActiveTab('critical')}
                              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                                activeTab === 'critical'
                                  ? 'bg-white text-red-700 border-b-2 border-red-500'
                                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                #1
                                <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                                  {newRecord.critical_items.filter(item => item.status).length}/{newRecord.critical_items.length}
                                </span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('caution')}
                              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                                activeTab === 'caution'
                                  ? 'bg-white text-orange-700 border-b-2 border-orange-500'
                                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                                #2
                                <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                                  {newRecord.caution_items.filter(item => item.status).length}/{newRecord.caution_items.length}
                                </span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('other')}
                              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                                activeTab === 'other'
                                  ? 'bg-white text-blue-700 border-b-2 border-blue-500'
                                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                                #3
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                  {newRecord.other_items.filter(item => item.status).length}/{newRecord.other_items.length}
                                </span>
                              </div>
                            </button>
                          </div>

                          {/* 탭 컨텐츠 */}
                          <div className={`p-4 ${
                            activeTab === 'critical' ? 'bg-red-50' : 
                            activeTab === 'caution' ? 'bg-orange-50' : 
                            'bg-blue-50'
                          }`}>
                            {/* 중요 점검 항목들 */}
                            {activeTab === 'critical' && (
                              <div className="space-y-4">
                                <div className="text-center py-3 bg-red-100 rounded-lg border border-red-200">
                                  <h4 className="font-medium text-red-800">
                                    (부딪힘, 물체에맞음) 굴착기 등 사용 작업
                                  </h4>
                                  <p className="text-sm text-red-600 mt-1">총 {newRecord.critical_items.length}개 항목</p>
                                </div>
                                
                                {newRecord.critical_items.map((item, index) => {
                                  // Note 내용을 각 항목별로 정의
                                  let noteContent = '';
                                  if (index === 0) {
                                    noteContent = '· 위험공종 작업허가서 승인 여부 확인\n· 건설기계 운행 경로 및 작업 반경, 방법 등 고려하여 작업계획서가 적정하게 작성 되었는지';
                                  } else if (index === 1) {
                                    noteContent = '· 좌우, 후방을 확인 할 수 있는 장치의 설치 및 정상 작동 여부\n· 굴착기 운전원의 안전띠 착용 여부';
                                  } else if (index === 2) {
                                    noteContent = '· 굴착기가 넘어지거나 굴착 사면의 붕괴 우려가 없는지 확인하고 조치한다.\n· 펌프카가 전도되거나 지반침하 우려가 없는지 확인하고 조치한다.';
                                  } else if (index === 3) {
                                    noteContent = '· 작업구간에 작업자의 출입을 통제하거나 유도\n· 작업계획서 내용에 맞게 작업지휘자, 신호수(유도자) 배치\n· 작업지휘자, 신호수(유도자) 타 업무와 겸임 금지';
                                  } else if (index === 4) {
                                    noteContent = '· 퀵커플러, 달기구의 해지장치 설치 여부\n· 굴착기 정격하중을 확인하고, 정격하중 이상의 작업 불가\n· 작업 전 인양로프의 상태를 확인(이음매가 있는 와이어로프, 꼬임이 끊어진 섬유로프 등 사용 금지)';
                                  }
                                  
                                  return (
                                  <div key={`critical-${index}`} className="border border-gray-300 rounded-lg bg-white">
                                    <div className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50" 
                                         onClick={() => {
                                           const newExpanded = [...expandedCriticalItems]
                                           newExpanded[index] = !newExpanded[index]
                                           setExpandedCriticalItems(newExpanded)
                                         }}>
                                      <h5 className="text-sm font-medium text-gray-900">
                                        {index + 1}. {item.title}
                                      </h5>
                                      <div className="flex items-center gap-2">
                                        {item.status && (
                                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            item.status === 'good' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                          }`}>
                                            {item.status === 'good' ? '여' : '부'}
                                          </span>
                                        )}
                                        {expandedCriticalItems[index] ? (
                                          <ChevronUp className="h-4 w-4 text-gray-500" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4 text-gray-500" />
                                        )}
                                      </div>
                                    </div>
                                    
                                    {expandedCriticalItems[index] && (
                                      <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3">
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-2">
                                            이행여부
                                          </label>
                                          <div className="flex gap-4">
                                            <label className="flex items-center cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`critical_${index}`}
                                                value="good"
                                                checked={item.status === 'good'}
                                                onChange={(e) => {
                                                  const updatedItems = [...newRecord.critical_items]
                                                  updatedItems[index].status = 'good'
                                                  setNewRecord({...newRecord, critical_items: updatedItems})
                                                }}
                                                className="mr-2 text-green-600 focus:ring-green-500"
                                              />
                                              <span className="text-sm text-green-700 font-medium">여</span>
                                            </label>
                                            <label className="flex items-center cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`critical_${index}`}
                                                value="bad"
                                                checked={item.status === 'bad'}
                                                onChange={(e) => {
                                                  const updatedItems = [...newRecord.critical_items]
                                                  updatedItems[index].status = 'bad'
                                                  setNewRecord({...newRecord, critical_items: updatedItems})
                                                }}
                                                className="mr-2 text-red-600 focus:ring-red-500"
                                              />
                                              <span className="text-sm text-red-700 font-medium">부</span>
                                            </label>
                                          </div>
                                        </div>
                                        
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-2">
                                            점검 결과
                                          </label>
                                          <textarea
                                            value={item.remarks}
                                            onChange={(e) => {
                                              const updatedItems = [...newRecord.critical_items]
                                              updatedItems[index].remarks = e.target.value
                                              setNewRecord({...newRecord, critical_items: updatedItems})
                                            }}
                                            onFocus={(e) => {
                                              if (e.currentTarget.value.trim() === '특이사항 없음') {
                                                const updatedItems = [...newRecord.critical_items]
                                                updatedItems[index].remarks = ''
                                                setNewRecord({...newRecord, critical_items: updatedItems})
                                              }
                                            }}
                                            onBlur={(e) => {
                                              if (!e.currentTarget.value.trim()) {
                                                const updatedItems = [...newRecord.critical_items]
                                                updatedItems[index].remarks = '특이사항 없음'
                                                setNewRecord({...newRecord, critical_items: updatedItems})
                                              }
                                            }}
                                            className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                                            rows={3}
                                            placeholder="점검 결과를 입력하세요"
                                          />
                                          {noteContent && (
                                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 border-l-2 border-blue-300">
                                              <div className="font-medium text-gray-700 mb-1">Note.</div>
                                              <div className="whitespace-pre-line">{noteContent}</div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )})}
                              </div>
                            )}

                            {/* 요주의 점검 항목들 */}
                            {activeTab === 'caution' && (
                              <div className="space-y-4">
                                <div className="text-center py-3 bg-orange-100 rounded-lg border border-orange-200">
                                  <h4 className="font-medium text-orange-800">
                                    (추락) 가설구조물, 고소작업 등
                                  </h4>
                                  <p className="text-sm text-orange-600 mt-1">총 {newRecord.caution_items.length}개 항목</p>
                                </div>
                                
                                {newRecord.caution_items.map((item, index) => {
                                  // Note 내용을 각 항목별로 정의
                                  let noteContent = '';
                                  if (index === 0) {
                                    noteContent = '· 견고한 구조, 경사에 따른 올바른 통로 선택 여부(경사로, 계단, 사다리 등), 종류에 따른 폭 기준 준수 여부\n· 최대 적재하중 초과 여부\n· 넘어지거나 미끄러지는 것을 방지하기 위한 조치(아웃트리거, 구름방지용 쐐기 등)';
                                  } else if (index === 1) {
                                    noteContent = '· 구조 안전성 검토 실시 여부, 조립도에 따라 설치 여부\n· 부재의 변형·부식·손상 상태, 전용철물 사용 여부\n· 기둥에 밑받침 철물, 깔판, 깔목 등을 사용하여 지반에 견고히 지지 되었는지 여부\n· 비계의 전도, 붕괴를 방지하기 위해 벽이음 설치 여부';
                                  } else if (index === 2) {
                                    noteContent = '· 개구부 덮개․난간 등 설치 및 고소작업 시 안전 안전보호구 착용';
                                  }
                                  
                                  return (
                                  <div key={`caution-${index}`} className="border border-gray-300 rounded-lg bg-white">
                                    <div className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50" 
                                         onClick={() => {
                                           const newExpanded = [...expandedCautionItems]
                                           newExpanded[index] = !newExpanded[index]
                                           setExpandedCautionItems(newExpanded)
                                         }}>
                                      <h5 className="text-sm font-medium text-gray-900">
                                        {index + 1}. {item.title}
                                      </h5>
                                      <div className="flex items-center gap-2">
                                        {item.status && (
                                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            item.status === 'good' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                          }`}>
                                            {item.status === 'good' ? '여' : '부'}
                                          </span>
                                        )}
                                        {expandedCautionItems[index] ? (
                                          <ChevronUp className="h-4 w-4 text-gray-500" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4 text-gray-500" />
                                        )}
                                      </div>
                                    </div>
                                    
                                    {expandedCautionItems[index] && (
                                      <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3">
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-2">
                                            이행여부
                                          </label>
                                          <div className="flex gap-4">
                                            <label className="flex items-center cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`caution_${index}`}
                                                value="good"
                                                checked={item.status === 'good'}
                                                onChange={(e) => {
                                                  const updatedItems = [...newRecord.caution_items]
                                                  updatedItems[index].status = 'good'
                                                  setNewRecord({...newRecord, caution_items: updatedItems})
                                                }}
                                                className="mr-2 text-green-600 focus:ring-green-500"
                                              />
                                              <span className="text-sm text-green-700 font-medium">여</span>
                                            </label>
                                            <label className="flex items-center cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`caution_${index}`}
                                                value="bad"
                                                checked={item.status === 'bad'}
                                                onChange={(e) => {
                                                  const updatedItems = [...newRecord.caution_items]
                                                  updatedItems[index].status = 'bad'
                                                  setNewRecord({...newRecord, caution_items: updatedItems})
                                                }}
                                                className="mr-2 text-red-600 focus:ring-red-500"
                                              />
                                              <span className="text-sm text-red-700 font-medium">부</span>
                                            </label>
                                          </div>
                                        </div>
                                        
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-2">
                                            점검 결과
                                          </label>
                                          <textarea
                                            value={item.remarks}
                                            onChange={(e) => {
                                              const updatedItems = [...newRecord.caution_items]
                                              updatedItems[index].remarks = e.target.value
                                              setNewRecord({...newRecord, caution_items: updatedItems})
                                            }}
                                            onFocus={(e) => {
                                              if (e.currentTarget.value.trim() === '특이사항 없음') {
                                                const updatedItems = [...newRecord.caution_items]
                                                updatedItems[index].remarks = ''
                                                setNewRecord({...newRecord, caution_items: updatedItems})
                                              }
                                            }}
                                            onBlur={(e) => {
                                              if (!e.currentTarget.value.trim()) {
                                                const updatedItems = [...newRecord.caution_items]
                                                updatedItems[index].remarks = '특이사항 없음'
                                                setNewRecord({...newRecord, caution_items: updatedItems})
                                              }
                                            }}
                                            className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                                            rows={3}
                                            placeholder="점검 결과를 입력하세요"
                                          />
                                          {noteContent && (
                                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 border-l-2 border-blue-300">
                                              <div className="font-medium text-gray-700 mb-1">Note.</div>
                                              <div className="whitespace-pre-line">{noteContent}</div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )})}
                              </div>
                            )}

                            {/* 기타 점검 항목들 */}
                            {activeTab === 'other' && (
                              <div className="space-y-4">
                                <div className="text-center py-3 bg-blue-100 rounded-lg border border-blue-200">
                                  <h4 className="font-medium text-blue-800">
                                    기타항목
                                  </h4>
                                  <p className="text-sm text-blue-600 mt-1">총 {newRecord.other_items.length}개 항목</p>
                                </div>
                                
                                {newRecord.other_items.map((item, index) => {
                                  // Note 내용을 각 항목별로 정의
                                  let noteContent = '';
                                  if (index === 0) {
                                    noteContent = '· 안전관리 법적 이행사항 25가지 항목 모니터링 결과의 적정성 확인';
                                  } else if (index === 1) {
                                    noteContent = '· 위험성평가(관리자, 근로자참여하여 위험요인 발굴)\n· 위험성 전달(TBM을 통해 위험요인과 대책을 공유)\n· 실행여부 확인(일일안전점검 일지를 통해 이행확인)';
                                  } else if (index === 2) {
                                    noteContent = '· 신규채용된 일용근로자, 고혈압환자, 외국인 근로자\n· 건강상태 확인, 고위험작업 배제, 외국인 근로자 안전표지 부착';
                                  }
                                  
                                  return (
                                  <div key={`other-${index}`} className="border border-gray-300 rounded-lg bg-white">
                                    <div className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50" 
                                         onClick={() => {
                                           const newExpanded = [...expandedOtherItems]
                                           newExpanded[index] = !newExpanded[index]
                                           setExpandedOtherItems(newExpanded)
                                         }}>
                                      <h5 className="text-sm font-medium text-gray-900">
                                        {index + 1}. {item.title}
                                      </h5>
                                      <div className="flex items-center gap-2">
                                        {item.status && (
                                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            item.status === 'good' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                          }`}>
                                            {item.status === 'good' ? '여' : '부'}
                                          </span>
                                        )}
                                        {expandedOtherItems[index] ? (
                                          <ChevronUp className="h-4 w-4 text-gray-500" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4 text-gray-500" />
                                        )}
                                      </div>
                                    </div>
                                    
                                    {expandedOtherItems[index] && (
                                      <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3">
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-2">
                                            이행여부
                                          </label>
                                          <div className="flex gap-4">
                                            <label className="flex items-center cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`other_${index}`}
                                                value="good"
                                                checked={item.status === 'good'}
                                                onChange={(e) => {
                                                  const updatedItems = [...newRecord.other_items]
                                                  updatedItems[index].status = 'good'
                                                  setNewRecord({...newRecord, other_items: updatedItems})
                                                }}
                                                className="mr-2 text-green-600 focus:ring-green-500"
                                              />
                                              <span className="text-sm text-green-700 font-medium">여</span>
                                            </label>
                                            <label className="flex items-center cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`other_${index}`}
                                                value="bad"
                                                checked={item.status === 'bad'}
                                                onChange={(e) => {
                                                  const updatedItems = [...newRecord.other_items]
                                                  updatedItems[index].status = 'bad'
                                                  setNewRecord({...newRecord, other_items: updatedItems})
                                                }}
                                                className="mr-2 text-red-600 focus:ring-red-500"
                                              />
                                              <span className="text-sm text-red-700 font-medium">부</span>
                                            </label>
                                          </div>
                                        </div>
                                        
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-2">
                                            점검 결과
                                          </label>
                                          <textarea
                                            value={item.remarks}
                                            onChange={(e) => {
                                              const updatedItems = [...newRecord.other_items]
                                              updatedItems[index].remarks = e.target.value
                                              setNewRecord({...newRecord, other_items: updatedItems})
                                            }}
                                            onFocus={(e) => {
                                              if (e.currentTarget.value.trim() === '특이사항 없음') {
                                                const updatedItems = [...newRecord.other_items]
                                                updatedItems[index].remarks = ''
                                                setNewRecord({...newRecord, other_items: updatedItems})
                                              }
                                            }}
                                            onBlur={(e) => {
                                              if (!e.currentTarget.value.trim()) {
                                                const updatedItems = [...newRecord.other_items]
                                                updatedItems[index].remarks = '특이사항 없음'
                                                setNewRecord({...newRecord, other_items: updatedItems})
                                              }
                                            }}
                                            className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                            rows={3}
                                            placeholder="점검 결과를 입력하세요"
                                          />
                                          {noteContent && (
                                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 border-l-2 border-blue-300">
                                              <div className="font-medium text-gray-700 mb-1">Note.</div>
                                              <div className="whitespace-pre-line">{noteContent}</div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          </div>
                        </div>


                </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}