'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, FileText, ChevronLeft, ChevronRight, X, Upload, Camera, ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, Edit, Trash2, Download, Printer, RotateCw, Phone, Save, Crop, RotateCcw, Copy, Check, User, HardHat, PenTool } from 'lucide-react'
import { generateHeadquartersInspectionReport } from '@/lib/reports/headquarters-inspection'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignaturePad from '@/components/ui/SignaturePad'
import ImageEditor from '@/components/ui/ImageEditor'

interface ExtendedProject extends Project {
  user_profiles?: {
    full_name?: string
    company_name?: string
    phone_number?: string
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
  const [isEditMode, setIsEditMode] = useState(false) // 수정 모드 여부
  const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null) // 수정 중인 점검 ID
  const [showSignatureModal, setShowSignatureModal] = useState(false) // 서명 모달 표시 여부
  const [pendingSubmit, setPendingSubmit] = useState(false) // 제출 대기 상태
  const [editingImage, setEditingImage] = useState<{ url: string; inspectionId: string; issueNumber: 1 | 2 } | null>(null) // 편집 중인 이미지
  const [showPhoneModal, setShowPhoneModal] = useState(false) // 전화 모달 표시 여부
  const [phoneModalData, setPhoneModalData] = useState<{ name: string; phone: string; title: string } | null>(null) // 전화 모달 데이터
  const [showContactSelectModal, setShowContactSelectModal] = useState(false) // 연락처 선택 모달 표시 여부
  const [phoneCopied, setPhoneCopied] = useState(false) // 전화번호 복사 상태
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false) // 삭제 확인 모달 표시 여부
  const [deleteConfirmCallback, setDeleteConfirmCallback] = useState<(() => void) | null>(null) // 삭제 확인 후 실행할 콜백
  const [isResignMode, setIsResignMode] = useState(false) // 재서명 선택 모드 여부
  const [selectedForResign, setSelectedForResign] = useState<string[]>([]) // 재서명 대상 항목 ID
  const [showResignSignatureModal, setShowResignSignatureModal] = useState(false) // 재서명 서명 모달
  
  // 크롭 관련 상태
  const [showCropModal, setShowCropModal] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')
  const [cropPhotoType, setCropPhotoType] = useState<'overview' | 'issue1' | 'issue2'>('overview')
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 100, height: 100 }) // 퍼센트 값
  const [isDragging, setIsDragging] = useState<'tl' | 'br' | null>(null) // 좌측상단(tl), 우측하단(br)
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const cropHandleTlRef = useRef<HTMLDivElement>(null) // 좌측 상단 핸들 ref
  const cropHandleBrRef = useRef<HTMLDivElement>(null) // 우측 하단 핸들 ref

  // 등록 폼 상태
  const [newRecord, setNewRecord] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_name: userProfile ? `${userProfile.position || ''} ${userProfile.full_name}`.trim() : '',
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
      { title: '재해예방기술지도 지적사항 이행 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: 'VAR 매뉴얼 작동성 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '취약근로자 안전관리 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' },
      { title: '법적이행사항 확인', status: 'good' as 'good' | 'bad' | '', remarks: '특이사항 없음' }
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
  const tabContentRef = useRef<HTMLDivElement>(null) // 탭 컨텐츠 영역 참조

  // 이미지를 1240x1754으로 리사이즈하여 JPEG 파일로 변환 (좌우로 늘려서 공간 꽉 채움)
  const resizeImageToJpeg = (file: File, targetWidth = 1240, targetHeight = 1754, quality = 0.95): Promise<File> => {
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
            // 이미지를 좌우로 늘려서 캔버스 전체를 채움 (비율 무시)
            ;(ctx as any).imageSmoothingEnabled = true
            ;(ctx as any).imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

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

  // URL에서 이미지를 다운로드해서 File 객체로 변환
  const urlToFile = async (url: string, filename: string): Promise<File | null> => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      return new File([blob], filename, { type: blob.type || 'image/jpeg' })
    } catch (error) {
      console.error('URL to File 변환 오류:', error)
      return null
    }
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

  // 크롭 모달 열기
  const openCropModal = (photoType: 'overview' | 'issue1' | 'issue2') => {
    let src = ''
    if (photoType === 'overview') {
      if (newRecord.site_photo_overview) {
        src = URL.createObjectURL(newRecord.site_photo_overview)
      } else {
        src = newRecord.site_photo_overview_preview
      }
    } else if (photoType === 'issue1') {
      if (newRecord.site_photo_issue1) {
        src = URL.createObjectURL(newRecord.site_photo_issue1)
      } else {
        src = newRecord.site_photo_issue1_preview
      }
    } else {
      if (newRecord.site_photo_issue2) {
        src = URL.createObjectURL(newRecord.site_photo_issue2)
      } else {
        src = newRecord.site_photo_issue2_preview
      }
    }
    
    if (!src) return
    
    setCropImageSrc(src)
    setCropPhotoType(photoType)
    setCropArea({ x: 0, y: 0, width: 100, height: 100 }) // 초기에는 전체 영역
    setShowCropModal(true)
  }

  // 크롭 적용 함수
  const applyCrop = async () => {
    if (!cropImageSrc) return

    const img = new (window as any).Image()
    img.crossOrigin = 'anonymous'
    
    return new Promise<void>((resolve) => {
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve()
            return
          }

          // 실제 크롭 좌표 계산 (퍼센트 -> 픽셀)
          const srcX = (cropArea.x / 100) * img.width
          const srcY = (cropArea.y / 100) * img.height
          const srcWidth = (cropArea.width / 100) * img.width
          const srcHeight = (cropArea.height / 100) * img.height

          canvas.width = srcWidth
          canvas.height = srcHeight

          ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight)

          canvas.toBlob(async (blob) => {
            if (!blob) {
              resolve()
              return
            }

            const filename = `cropped_${Date.now()}.jpg`
            const file = new File([blob], filename, { type: 'image/jpeg' })
            
            // 리사이즈 적용 (HeadquartersInspection은 1240x1754 사용)
            const resized = await resizeImageToJpeg(file, 1240, 1754, 0.95)
            const previewUrl = URL.createObjectURL(resized)

            // 이전 프리뷰 URL 해제
            if (cropPhotoType === 'overview') {
              if (newRecord.site_photo_overview_preview && newRecord.site_photo_overview_preview.startsWith('blob:')) {
                URL.revokeObjectURL(newRecord.site_photo_overview_preview)
              }
              if (newRecord.site_photo_overview) {
                URL.revokeObjectURL(URL.createObjectURL(newRecord.site_photo_overview))
              }
              setNewRecord({
                ...newRecord,
                site_photo_overview: resized,
                site_photo_overview_preview: previewUrl
              })
            } else if (cropPhotoType === 'issue1') {
              if (newRecord.site_photo_issue1_preview && newRecord.site_photo_issue1_preview.startsWith('blob:')) {
                URL.revokeObjectURL(newRecord.site_photo_issue1_preview)
              }
              if (newRecord.site_photo_issue1) {
                URL.revokeObjectURL(URL.createObjectURL(newRecord.site_photo_issue1))
              }
              setNewRecord({
                ...newRecord,
                site_photo_issue1: resized,
                site_photo_issue1_preview: previewUrl
              })
            } else {
              if (newRecord.site_photo_issue2_preview && newRecord.site_photo_issue2_preview.startsWith('blob:')) {
                URL.revokeObjectURL(newRecord.site_photo_issue2_preview)
              }
              if (newRecord.site_photo_issue2) {
                URL.revokeObjectURL(URL.createObjectURL(newRecord.site_photo_issue2))
              }
              setNewRecord({
                ...newRecord,
                site_photo_issue2: resized,
                site_photo_issue2_preview: previewUrl
              })
            }

            setShowCropModal(false)
            resolve()
          }, 'image/jpeg', 0.9)
        } catch (err) {
          console.error('크롭 실패:', err)
          resolve()
        }
      }
      img.onerror = () => {
        console.error('이미지 로드 실패')
        resolve()
      }
      img.src = cropImageSrc
    })
  }

  // 크롭 핸들 드래그 핸들러
  // 마우스와 터치 이벤트를 모두 처리하는 통합 핸들러
  const getClientCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
    } else if ('clientX' in e) {
      return { clientX: e.clientX, clientY: e.clientY }
    }
    return { clientX: 0, clientY: 0 }
  }

  const handleCropStart = (corner: 'tl' | 'br', e: React.MouseEvent | React.TouchEvent) => {
    // 터치 이벤트가 아닐 때만 preventDefault 호출 (passive 이벤트 오류 방지)
    if (!('touches' in e)) {
      e.preventDefault()
    }
    e.stopPropagation()
    setIsDragging(corner)
  }

  const handleCropMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !cropContainerRef.current) return
    
    const { clientX, clientY } = getClientCoordinates(e)
    const rect = cropContainerRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    
    // 0-100 범위로 제한
    const clampedX = Math.max(0, Math.min(100, x))
    const clampedY = Math.max(0, Math.min(100, y))
    
    if (isDragging === 'tl') {
      // 좌측 상단 핸들: x, y를 조정하고 width, height를 재계산
      const newX = Math.min(clampedX, cropArea.x + cropArea.width - 10)
      const newY = Math.min(clampedY, cropArea.y + cropArea.height - 10)
      const newWidth = cropArea.width + (cropArea.x - newX)
      const newHeight = cropArea.height + (cropArea.y - newY)
      
      setCropArea({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      })
    } else if (isDragging === 'br') {
      // 우측 하단 핸들: width, height만 조정
      const newWidth = Math.max(10, clampedX - cropArea.x)
      const newHeight = Math.max(10, clampedY - cropArea.y)
      
      setCropArea({
        ...cropArea,
        width: newWidth,
        height: newHeight
      })
    }
  }

  const handleCropEnd = () => {
    setIsDragging(null)
  }

  // 핸들 요소에 네이티브 이벤트 리스너 등록 (passive: false로 preventDefault 가능하게)
  useEffect(() => {
    if (!showCropModal) return // 모달이 열려있을 때만 등록

    const handleTlStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging('tl')
    }

    const handleBrStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging('br')
    }

    // 약간의 지연을 두어 DOM이 완전히 렌더링된 후 ref를 확인
    const timeoutId = setTimeout(() => {
      const tlElement = cropHandleTlRef.current
      const brElement = cropHandleBrRef.current

      if (tlElement) {
        tlElement.addEventListener('mousedown', handleTlStart)
        tlElement.addEventListener('touchstart', handleTlStart, { passive: false })
      }

      if (brElement) {
        brElement.addEventListener('mousedown', handleBrStart)
        brElement.addEventListener('touchstart', handleBrStart, { passive: false })
      }
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      const tlElement = cropHandleTlRef.current
      const brElement = cropHandleBrRef.current

      if (tlElement) {
        tlElement.removeEventListener('mousedown', handleTlStart)
        tlElement.removeEventListener('touchstart', handleTlStart)
      }
      if (brElement) {
        brElement.removeEventListener('mousedown', handleBrStart)
        brElement.removeEventListener('touchstart', handleBrStart)
      }
    }
  }, [showCropModal])

  // 전역 마우스/터치 이벤트 처리 (드래그 중일 때)
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!cropContainerRef.current) return
      
      // 터치 이벤트일 때 preventDefault로 스크롤 방지
      if ('touches' in e) {
        e.preventDefault()
      }
      
      const clientX = 'touches' in e && e.touches.length > 0 
        ? e.touches[0].clientX 
        : (e as MouseEvent).clientX
      const clientY = 'touches' in e && e.touches.length > 0 
        ? e.touches[0].clientY 
        : (e as MouseEvent).clientY
      
      const rect = cropContainerRef.current.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 100
      const y = ((clientY - rect.top) / rect.height) * 100
      
      const clampedX = Math.max(0, Math.min(100, x))
      const clampedY = Math.max(0, Math.min(100, y))
      
      if (isDragging === 'tl') {
        const newX = Math.min(clampedX, cropArea.x + cropArea.width - 10)
        const newY = Math.min(clampedY, cropArea.y + cropArea.height - 10)
        const newWidth = cropArea.width + (cropArea.x - newX)
        const newHeight = cropArea.height + (cropArea.y - newY)
        
        setCropArea({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        })
      } else if (isDragging === 'br') {
        const newWidth = Math.max(10, clampedX - cropArea.x)
        const newHeight = Math.max(10, clampedY - cropArea.y)
        
        setCropArea(prev => ({
          ...prev,
          width: newWidth,
          height: newHeight
        }))
      }
    }

    const handleGlobalEnd = () => {
      setIsDragging(null)
    }

    window.addEventListener('mousemove', handleGlobalMove)
    window.addEventListener('mouseup', handleGlobalEnd)
    window.addEventListener('touchmove', handleGlobalMove, { passive: false })
    window.addEventListener('touchend', handleGlobalEnd, { passive: false })
    window.addEventListener('touchcancel', handleGlobalEnd, { passive: false })

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove)
      window.removeEventListener('mouseup', handleGlobalEnd)
      window.removeEventListener('touchmove', handleGlobalMove)
      window.removeEventListener('touchend', handleGlobalEnd)
      window.removeEventListener('touchcancel', handleGlobalEnd)
    }
  }, [isDragging, cropArea])

  const loadProject = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select(`
          *,
          user_profiles!projects_created_by_fkey(full_name, company_name, phone_number)
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
    router.back()
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

  // 재서명 모드 토글
  const handleResignModeToggle = () => {
    if (isDeleteMode || isDownloadMode) {
      alert('현재 다른 모드가 활성화되어 있습니다. 먼저 종료해주세요.')
      return
    }
    setIsResignMode(!isResignMode)
    setSelectedForResign([])
  }

  // 재서명 선택 토글
  const handleSelectForResign = (inspectionId: string) => {
    setSelectedForResign(prev => (
      prev.includes(inspectionId)
        ? prev.filter(id => id !== inspectionId)
        : [...prev, inspectionId]
    ))
  }

  // 재서명 실행 (서명 모달 표시)
  const handleResignSubmit = () => {
    if (selectedForResign.length === 0) {
      alert('재서명할 항목을 선택해주세요.')
      return
    }
    setShowResignSignatureModal(true)
  }

  // 재서명 저장 핸들러
  const handleSaveResignature = async (signatureData: string) => {
    try {
      setLoading(true)
      setShowResignSignatureModal(false)

      for (const inspectionId of selectedForResign) {
        const { error } = await supabase
          .from('headquarters_inspections')
          .update({ signature: signatureData })
          .eq('id', inspectionId)

        if (error) {
          console.error('재서명 저장 오류:', error)
          alert(`재서명 실패: ${error.message}`)
          setLoading(false)
          return
        }
      }

      alert(`${selectedForResign.length}건의 재서명이 완료되었습니다.`)
      setIsResignMode(false)
      setSelectedForResign([])
      await loadInspections()
    } catch (err: any) {
      console.error('재서명 오류:', err)
      alert('재서명 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
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

  // 해당 사항 없음 처리 핸들러
  const handleNoActionRequired = async (inspectionId: string, issueNumber: 1 | 2) => {
    try {
      // 데이터베이스 업데이트 - "해당 사항 없음" 텍스트를 저장
      const updateData = issueNumber === 1
        ? { action_photo_issue1: '해당 사항 없음', issue1_status: 'completed' }
        : { action_photo_issue2: '해당 사항 없음', issue2_status: 'completed' }

      const { error } = await supabase
        .from('headquarters_inspections')
        .update(updateData)
        .eq('id', inspectionId)

      if (error) {
        throw new Error(error.message)
      }

      // 목록 새로고침
      loadInspections()
      alert('해당 사항 없음으로 처리되었습니다.')

    } catch (error: any) {
      console.error('해당 사항 없음 처리 오류:', error)
      alert(`처리 실패: ${error.message}`)
    }
  }

  // 해당 사항 없음 취소 핸들러
  const handleCancelNoActionRequired = async (inspectionId: string, issueNumber: 1 | 2) => {
    try {
      // 데이터베이스 업데이트 - null로 초기화
      const updateData = issueNumber === 1
        ? { action_photo_issue1: null, issue1_status: 'pending' }
        : { action_photo_issue2: null, issue2_status: 'pending' }

      const { error } = await supabase
        .from('headquarters_inspections')
        .update(updateData)
        .eq('id', inspectionId)

      if (error) {
        throw new Error(error.message)
      }

      // 목록 새로고침
      loadInspections()

    } catch (error: any) {
      console.error('해당 사항 없음 취소 오류:', error)
      alert(`취소 실패: ${error.message}`)
    }
  }

  // 이미지 편집 시작
  const handleEditImage = (url: string, inspectionId: string, issueNumber: 1 | 2) => {
    setEditingImage({ url, inspectionId, issueNumber })
  }

  // 편집된 이미지 저장
  const handleSaveEditedImage = async (editedImageBlob: Blob) => {
    if (!editingImage) return

    try {
      setUploadingPhoto(`${editingImage.inspectionId}-${editingImage.issueNumber}`)

      // Blob을 File로 변환
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 15)
      const file = new File([editedImageBlob], `edited-${timestamp}-${randomStr}.jpg`, { type: 'image/jpeg' })

      // 파일 업로드
      const photoUrl = await uploadFileToStorage(file, 'headquarters-actions')

      // 데이터베이스 업데이트
      const updateData = editingImage.issueNumber === 1
        ? { action_photo_issue1: photoUrl, issue1_status: 'completed' }
        : { action_photo_issue2: photoUrl, issue2_status: 'completed' }

      const { error } = await supabase
        .from('headquarters_inspections')
        .update(updateData)
        .eq('id', editingImage.inspectionId)

      if (error) {
        throw new Error(error.message)
      }

      // 목록 새로고침
      loadInspections()
      alert('조치사진이 성공적으로 저장되었습니다!')
      setEditingImage(null)

    } catch (error: any) {
      console.error('조치사진 저장 오류:', error)
      alert(`저장 실패: ${error.message}`)
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

  // 점검 항목 클릭 시 수정 모드로 전환
  const handleInspectionClick = async (inspection: any) => {
    if (isDeleteMode || isDownloadMode || isResignMode) return // 삭제/다운로드/재서명 모드에서는 동작 안 함
    if (userProfile?.role !== '발주청') return // 발주청만 수정 가능

    try {
      setLoading(true)

      // 기존 데이터를 폼에 채우기
      setNewRecord({
        inspection_date: inspection.inspection_date,
        inspector_name: inspection.inspector_name,
        site_photo_overview: null,
        site_photo_issue1: null,
        site_photo_issue2: null,
        site_photo_overview_preview: inspection.site_photo_overview || '',
        site_photo_issue1_preview: inspection.site_photo_issue1 || '',
        site_photo_issue2_preview: inspection.site_photo_issue2 || '',
        issue_content1: inspection.issue_content1 || '',
        issue_content2: inspection.issue_content2 || '',
        critical_items: inspection.critical_items || [],
        caution_items: inspection.caution_items || [],
        other_items: inspection.other_items || []
      })

      setIsEditMode(true)
      setEditingInspectionId(inspection.id)
      setShowAddForm(true)
      setLoading(false)
    } catch (error) {
      console.error('점검 데이터 로딩 오류:', error)
      alert('점검 데이터를 불러오는 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  // 폼 제출 핸들러 (서명 모달 표시)
  const handleSubmit = async () => {
    // 필수 필드 검증
    if (!newRecord.inspector_name.trim()) {
      alert('점검자 이름을 입력해주세요.')
      return
    }

    // 수정 모드일 때는 기존 사진이 있으면 사진 필수 아님
    if (!isEditMode && !newRecord.site_photo_overview) {
      alert('점검 전경사진을 업로드해주세요.')
      return
    }

    if (!isEditMode && !newRecord.site_photo_issue1) {
      alert('지적사항 사진 1을 업로드해주세요.')
      return
    }

    if (!newRecord.issue_content1.trim()) {
      alert('지적사항 내용 1을 입력해주세요.')
      return
    }

    // 수정 모드일 때는 서명 모달 없이 바로 저장 (기존 서명 유지)
    if (isEditMode) {
      await handleSaveWithoutSignature()
      return
    }

    // 등록 모드일 때만 서명 모달 표시
    setShowSignatureModal(true)
  }

  // 수정 모드 저장 핸들러 (서명 없이 저장, 기존 서명 유지)
  const handleSaveWithoutSignature = async () => {
    try {
      setLoading(true)

      // 파일 업로드 (새로 선택한 파일이 있는 경우에만)
      let sitePhotoOverviewUrl = newRecord.site_photo_overview_preview // 기존 URL 유지
      let sitePhotoIssue1Url = newRecord.site_photo_issue1_preview
      let sitePhotoIssue2Url = newRecord.site_photo_issue2_preview

      if (newRecord.site_photo_overview) {
        sitePhotoOverviewUrl = await uploadFileToStorage(newRecord.site_photo_overview, 'headquarters-overview')
      }

      if (newRecord.site_photo_issue1) {
        sitePhotoIssue1Url = await uploadFileToStorage(newRecord.site_photo_issue1, 'headquarters-issues')
      }

      if (newRecord.site_photo_issue2) {
        sitePhotoIssue2Url = await uploadFileToStorage(newRecord.site_photo_issue2, 'headquarters-issues')
      }

      if (editingInspectionId) {
        // 수정 모드: 기존 데이터 업데이트 (서명 필드 제외)
        const { error } = await supabase
          .from('headquarters_inspections')
          .update({
            inspection_date: newRecord.inspection_date,
            inspector_name: newRecord.inspector_name,
            site_photo_overview: sitePhotoOverviewUrl,
            site_photo_issue1: sitePhotoIssue1Url,
            site_photo_issue2: sitePhotoIssue2Url,
            issue_content1: newRecord.issue_content1,
            issue_content2: newRecord.issue_content2 || null,
            critical_items: newRecord.critical_items,
            caution_items: newRecord.caution_items,
            other_items: newRecord.other_items
            // signature 필드는 업데이트하지 않음 (기존 서명 유지)
          })
          .eq('id', editingInspectionId)

        if (error) {
          console.error('데이터 수정 오류:', error)
          alert(`수정 실패: ${error.message}`)
          setLoading(false)
          return
        }

        alert('본부 불시점검이 성공적으로 수정되었습니다!')
      }

      // 폼 초기화
      setShowAddForm(false)
      setIsEditMode(false)
      setEditingInspectionId(null)
      setNewRecord({
        inspection_date: new Date().toISOString().split('T')[0],
        inspector_name: userProfile ? `${userProfile.position || ''} ${userProfile.full_name}`.trim() : '',
        site_photo_overview: null,
        site_photo_issue1: null,
        site_photo_issue2: null,
        site_photo_overview_preview: '',
        site_photo_issue1_preview: '',
        site_photo_issue2_preview: '',
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
          { title: '재해예방기술지도 지적사항 이행 확인', status: 'good', remarks: '특이사항 없음' },
          { title: 'VAR 매뉴얼 작동성 확인', status: 'good', remarks: '특이사항 없음' },
          { title: '취약근로자 안전관리 확인', status: 'good', remarks: '특이사항 없음' },
          { title: '법적이행사항 확인', status: 'good', remarks: '특이사항 없음' }
        ]
      })

      // 목록 새로고침
      loadInspections()
      setLoading(false)
    } catch (error: any) {
      console.error('저장 오류:', error)
      alert(`저장 실패: ${error.message}`)
      setLoading(false)
    }
  }

  // 실제 저장 핸들러 (서명 완료 후 호출)
  const handleSaveWithSignature = async (signatureData: string) => {
    try {
      setLoading(true)
      setShowSignatureModal(false)

      // 파일 업로드 (새로 선택한 파일이 있는 경우에만)
      let sitePhotoOverviewUrl = newRecord.site_photo_overview_preview // 기존 URL 유지
      let sitePhotoIssue1Url = newRecord.site_photo_issue1_preview
      let sitePhotoIssue2Url = newRecord.site_photo_issue2_preview

      if (newRecord.site_photo_overview) {
        sitePhotoOverviewUrl = await uploadFileToStorage(newRecord.site_photo_overview, 'headquarters-overview')
      }

      if (newRecord.site_photo_issue1) {
        sitePhotoIssue1Url = await uploadFileToStorage(newRecord.site_photo_issue1, 'headquarters-issues')
      }

      if (newRecord.site_photo_issue2) {
        sitePhotoIssue2Url = await uploadFileToStorage(newRecord.site_photo_issue2, 'headquarters-issues')
      }

      if (isEditMode && editingInspectionId) {
        // 수정 모드: 기존 데이터 업데이트 (서명 필드 제외 - 기존 서명 유지)
        const { error } = await supabase
          .from('headquarters_inspections')
          .update({
            inspection_date: newRecord.inspection_date,
            inspector_name: newRecord.inspector_name,
            site_photo_overview: sitePhotoOverviewUrl,
            site_photo_issue1: sitePhotoIssue1Url,
            site_photo_issue2: sitePhotoIssue2Url,
            issue_content1: newRecord.issue_content1,
            issue_content2: newRecord.issue_content2 || null,
            critical_items: newRecord.critical_items,
            caution_items: newRecord.caution_items,
            other_items: newRecord.other_items
            // signature 필드는 업데이트하지 않음 (기존 서명 유지)
          })
          .eq('id', editingInspectionId)

        if (error) {
          console.error('데이터 수정 오류:', error)
          alert(`수정 실패: ${error.message}`)
          setLoading(false)
          return
        }

        alert('본부 불시점검이 성공적으로 수정되었습니다!')
      } else {
        // 등록 모드: 새 데이터 삽입
        const { error } = await supabase
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
            signature: signatureData,
            created_by: user?.id
          })

        if (error) {
          console.error('데이터 저장 오류:', error)
          alert(`저장 실패: ${error.message}`)
          setLoading(false)
          return
        }

        alert('본부 불시점검이 성공적으로 저장되었습니다!')
      }
      
      // 폼 초기화
      setShowAddForm(false)
      setIsEditMode(false)
      setEditingInspectionId(null)
      setNewRecord({
        inspection_date: new Date().toISOString().split('T')[0],
        inspector_name: userProfile ? `${userProfile.position || ''} ${userProfile.full_name}`.trim() : '',
        site_photo_overview: null,
        site_photo_issue1: null,
        site_photo_issue2: null,
        site_photo_overview_preview: '',
        site_photo_issue1_preview: '',
        site_photo_issue2_preview: '',
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
          { title: '재해예방기술지도 지적사항 이행 확인', status: 'good', remarks: '특이사항 없음' },
          { title: 'VAR 매뉴얼 작동성 확인', status: 'good', remarks: '특이사항 없음' },
          { title: '취약근로자 안전관리 확인', status: 'good', remarks: '특이사항 없음' },
          { title: '법적이행사항 확인', status: 'good', remarks: '특이사항 없음' }
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

  // 탭 전환 시 스크롤을 최상단으로 리셋
  useEffect(() => {
    if (tabContentRef.current) {
      tabContentRef.current.scrollTop = 0
    }
  }, [activeTab])

  // userProfile 로드 시 점검자 이름 자동 설정
  useEffect(() => {
    if (userProfile && !isEditMode && newRecord.inspector_name === '') {
      setNewRecord(prev => ({
        ...prev,
        inspector_name: `${userProfile.position || ''} ${userProfile.full_name}`.trim()
      }))
    }
  }, [userProfile, isEditMode])

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
            <div className="flex items-center space-x-2 lg:space-x-4">
              <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0">
                <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
                <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role})</span>
              </div>
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
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
                <div className="flex items-center">
                  <FileText className="h-6 w-6 text-blue-600 mr-3" />
                  <h2 className="text-xl font-semibold text-gray-900">본부 불시점검 내역</h2>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  {/* 연락처 선택 버튼 */}
                  <button
                    onClick={() => setShowContactSelectModal(true)}
                    className="p-2 rounded-lg transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                    title="연락처 보기"
                  >
                    <Phone className="h-6 w-6" />
                  </button>
                  
                  {/* 미조치 필터 버튼 */}
                  <button
                    onClick={() => setShowOnlyPending(!showOnlyPending)}
                    className={`p-2 rounded-lg transition-colors ${
                      showOnlyPending
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    title={showOnlyPending ? '전체 보기' : '미조치만 보기'}
                  >
                    <AlertCircle className="h-6 w-6" />
                  </button>
                  
                  {/* 발주청만 볼 수 있는 버튼들 */}
                  {userProfile?.role === '발주청' && (
                    <>
                      {/* 재서명 모드 */}
                      {isResignMode ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleResignSubmit}
                            className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            title="선택한 항목 재서명"
                            disabled={selectedForResign.length === 0}
                          >
                            <PenTool className="h-4 w-4" />
                            서명 ({selectedForResign.length})
                          </button>
                          <button
                            onClick={handleResignModeToggle}
                            className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center"
                            title="재서명 모드 종료"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        !isDeleteMode && !isDownloadMode && (
                          <button
                            onClick={handleResignModeToggle}
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="재서명"
                            disabled={inspections.length === 0}
                          >
                            <PenTool className="h-5 w-5" />
                          </button>
                        )
                      )}
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
                        !isDeleteMode && !isResignMode && (
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
                          onClick={() => {
                            // 폼 초기화
                            setNewRecord({
                              inspection_date: new Date().toISOString().split('T')[0],
                              inspector_name: userProfile ? `${userProfile.position || ''} ${userProfile.full_name}`.trim() : '',
                              site_photo_overview: null,
                              site_photo_issue1: null,
                              site_photo_issue2: null,
                              site_photo_overview_preview: '',
                              site_photo_issue1_preview: '',
                              site_photo_issue2_preview: '',
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
                                { title: '재해예방기술지도 지적사항 이행 확인', status: 'good', remarks: '특이사항 없음' },
                                { title: 'VAR 매뉴얼 작동성 확인', status: 'good', remarks: '특이사항 없음' },
                                { title: '취약근로자 안전관리 확인', status: 'good', remarks: '특이사항 없음' },
                                { title: '법적이행사항 확인', status: 'good', remarks: '특이사항 없음' }
                              ]
                            })
                            setIsEditMode(false)
                            setEditingInspectionId(null)
                            setShowAddForm(true)
                          }}
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
                          <th className="border border-gray-200 py-2 text-center font-medium text-gray-700 w-48">지적사진</th>
                          <th className="border border-gray-200 py-2 text-center font-medium text-gray-700 w-48">조치사진</th>
                          <th className="border border-gray-200 px-2 py-2 text-center font-medium text-gray-700 w-24">
                            {isDeleteMode ? '선택' : isDownloadMode ? '선택' : isResignMode ? '선택' : '비고'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInspections.map((inspection, index) => {
                          const hasSecondIssue = inspection.issue_content2 && inspection.issue_content2.trim()
                          const rowSpan = hasSecondIssue ? 2 : 1
                          const canEdit = userProfile?.role === '발주청'

                          return (
                            <React.Fragment key={inspection.id}>
                              {/* 첫 번째 행 (항상 표시) */}
                              <tr
                                key={`${inspection.id}-1`}
                                className={`hover:bg-gray-50 ${canEdit && !isDeleteMode && !isDownloadMode && !isResignMode ? 'cursor-pointer' : ''}`}
                                onClick={() => handleInspectionClick(inspection)}
                              >
                                <td className="border border-gray-200 px-0 py-2 text-center" rowSpan={rowSpan}>
                                  <div className="flex flex-col items-center gap-1">
                                    <span>{filteredInspections.length - index}</span>
                                    {inspection.signature && (
                                      <img
                                        src={inspection.signature}
                                        alt="서명"
                                        className="w-10 h-10 object-contain"
                                      />
                                    )}
                                  </div>
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-center" rowSpan={rowSpan}>
                                  <div className="text-xs">
                                    {inspection.site_photo_overview && (
                                      <div className="mb-2">
                                        <img
                                          src={inspection.site_photo_overview}
                                          alt="전경사진"
                                          className="w-full h-32 object-fill rounded cursor-pointer hover:scale-105 transition-transform"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            window.open(inspection.site_photo_overview, '_blank')
                                          }}
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
                                <td className="border border-gray-200 p-0 text-center">
                                  {inspection.site_photo_issue1 && (
                                    <img
                                      src={inspection.site_photo_issue1}
                                      alt="지적사진 1"
                                      className="w-full h-32 object-fill cursor-pointer hover:scale-105 transition-transform block"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        window.open(inspection.site_photo_issue1, '_blank')
                                      }}
                                    />
                                  )}
                                </td>
                                <td 
                                  className="border border-gray-200 p-0 text-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {inspection.action_photo_issue1 ? (
                                    inspection.action_photo_issue1 === '해당 사항 없음' ? (
                                      <div className="flex flex-col items-center justify-center h-32 bg-gray-50">
                                        <span className="text-sm text-gray-600 font-medium">해당 사항 없음</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleCancelNoActionRequired(inspection.id, 1)
                                          }}
                                          className="mt-2 px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                                          title="해당 사항 없음 취소"
                                          disabled={isDeleteMode}
                                        >
                                          취소
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="relative group">
                                        <img
                                          src={inspection.action_photo_issue1}
                                          alt="조치사진 1"
                                          className="w-full h-32 object-fill cursor-pointer hover:scale-105 transition-transform block"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleEditImage(inspection.action_photo_issue1, inspection.id, 1)
                                          }}
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
                                    )
                                  ) : (
                                    <div className="flex flex-col items-center justify-center h-32">
                                      {uploadingPhoto === `${inspection.id}-1` ? (
                                        <div className="flex flex-col items-center">
                                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                          <span className="text-xs text-gray-500">업로드 중...</span>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleFileSelect(inspection.id, 1)
                                              }}
                                              className="w-16 h-16 bg-green-100 hover:bg-green-200 text-green-600 hover:text-green-700 rounded-full flex items-center justify-center transition-colors group"
                                              title="조치사진 업로드"
                                              disabled={isDeleteMode}
                                            >
                                              <Plus className="h-8 w-8" />
                                            </button>
                                            {userProfile?.role === '발주청' && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleNoActionRequired(inspection.id, 1)
                                                }}
                                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                                                title="해당 사항 없음으로 처리"
                                                disabled={isDeleteMode}
                                              >
                                                해당<br/>사항<br/>없음
                                              </button>
                                            )}
                                          </div>
                                          <span className="text-xs text-gray-400 mt-1">조치사진</span>
                                        </>
                                      )}
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
                                  ) : isResignMode ? (
                                    <div className="flex items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={selectedForResign.includes(inspection.id)}
                                        onChange={() => handleSelectForResign(inspection.id)}
                                        className="w-5 h-5 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
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
                                <tr
                                  key={`${inspection.id}-2`}
                                  className={`hover:bg-gray-50 ${canEdit && !isDeleteMode && !isDownloadMode && !isResignMode ? 'cursor-pointer' : ''}`}
                                  onClick={() => handleInspectionClick(inspection)}
                                >
                                  <td className="border border-gray-200 px-6 py-2 align-top text-left">
                                    <div className="text-sm">
                                      <div className="text-gray-700 break-words leading-relaxed">{inspection.issue_content2}</div>
                                    </div>
                                  </td>
                                  <td className="border border-gray-200 p-0 text-center">
                                    {inspection.site_photo_issue2 && (
                                      <img
                                        src={inspection.site_photo_issue2}
                                        alt="지적사진 2"
                                        className="w-full h-32 object-fill cursor-pointer hover:scale-105 transition-transform block"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          window.open(inspection.site_photo_issue2, '_blank')
                                        }}
                                      />
                                    )}
                                  </td>
                                  <td 
                                    className="border border-gray-200 p-0 text-center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {inspection.action_photo_issue2 ? (
                                      inspection.action_photo_issue2 === '해당 사항 없음' ? (
                                        <div className="flex flex-col items-center justify-center h-32 bg-gray-50">
                                          <span className="text-sm text-gray-600 font-medium">해당 사항 없음</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCancelNoActionRequired(inspection.id, 2)
                                            }}
                                            className="mt-2 px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                                            title="해당 사항 없음 취소"
                                            disabled={isDeleteMode}
                                          >
                                            취소
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="relative group">
                                          <img
                                            src={inspection.action_photo_issue2}
                                            alt="조치사진 2"
                                            className="w-full h-32 object-fill cursor-pointer hover:scale-105 transition-transform block"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleEditImage(inspection.action_photo_issue2, inspection.id, 2)
                                            }}
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
                                      )
                                    ) : (
                                      <div className="flex flex-col items-center justify-center h-32">
                                        {uploadingPhoto === `${inspection.id}-2` ? (
                                          <div className="flex flex-col items-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                            <span className="text-xs text-gray-500">업로드 중...</span>
                                          </div>
                                        ) : (
                                          <>
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleFileSelect(inspection.id, 2)
                                                }}
                                                className="w-16 h-16 bg-green-100 hover:bg-green-200 text-green-600 hover:text-green-700 rounded-full flex items-center justify-center transition-colors group"
                                                title="조치사진 업로드"
                                                disabled={isDeleteMode}
                                              >
                                                <Plus className="h-8 w-8" />
                                              </button>
                                              {userProfile?.role === '발주청' && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleNoActionRequired(inspection.id, 2)
                                                  }}
                                                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                                                  title="해당 사항 없음으로 처리"
                                                  disabled={isDeleteMode}
                                                >
                                                  해당<br/>사항<br/>없음
                                                </button>
                                              )}
                                            </div>
                                            <span className="text-xs text-gray-400 mt-1">조치사진</span>
                                          </>
                                        )}
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
                <h3 className="text-xl font-semibold text-gray-900">
                  {isEditMode ? '본부 불시점검 수정' : '본부 불시점검 등록'}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      setIsEditMode(false)
                      setEditingInspectionId(null)
                    }}
                    className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    title="취소"
                  >
                    <X className="h-6 w-6" />
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    title={isEditMode ? '수정 저장' : '등록'}
                  >
                    <Save className="h-6 w-6" />
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
                              {/* 점검자, 점검일자, 전경사진 */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* 왼쪽: 점검자와 점검일자 */}
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      점검자 <span className="text-red-500">(필수)</span>
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
                                      점검일자 <span className="text-red-500">(필수)</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={newRecord.inspection_date}
                                      onChange={(e) => setNewRecord({...newRecord, inspection_date: e.target.value})}
                                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                  </div>
                                </div>

                                {/* 오른쪽: 점검 전경사진 */}
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    점검 전경사진 <span className="text-red-500">(필수)</span>
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
                                  {(newRecord.site_photo_overview || newRecord.site_photo_overview_preview) && (
                                    <div className="mt-2">
                                      <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                        <img
                                          src={newRecord.site_photo_overview ? URL.createObjectURL(newRecord.site_photo_overview) : newRecord.site_photo_overview_preview}
                                          alt="전경사진 미리보기"
                                          className="w-full h-full object-contain"
                                        />
                                        <div className="absolute top-1 right-1 flex gap-1">
                                          <button
                                            type="button"
                                            className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="시계방향 회전"
                                            onClick={async () => {
                                              // 기존 URL인 경우 먼저 File로 변환
                                              let fileToRotate = newRecord.site_photo_overview
                                              if (!fileToRotate && newRecord.site_photo_overview_preview) {
                                                fileToRotate = await urlToFile(newRecord.site_photo_overview_preview, 'overview.jpg')
                                                if (!fileToRotate) return
                                              }
                                              if (!fileToRotate) return

                                              const rotated = await rotateImageFile(fileToRotate, 'cw')
                                              const previewUrl = URL.createObjectURL(rotated)
                                              if (newRecord.site_photo_overview_preview && newRecord.site_photo_overview_preview.startsWith('blob:')) {
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
                                          <button
                                            type="button"
                                            className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="크롭"
                                            onClick={() => openCropModal('overview')}
                                          >
                                            <Crop className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                            title="삭제"
                                            onClick={() => {
                                              setDeleteConfirmCallback(() => () => {
                                                if (newRecord.site_photo_overview_preview && newRecord.site_photo_overview_preview.startsWith('blob:')) {
                                                  URL.revokeObjectURL(newRecord.site_photo_overview_preview)
                                                }
                                                if (sitePhotoOverviewRef.current) {
                                                  sitePhotoOverviewRef.current.value = ''
                                                }
                                                setNewRecord({
                                                  ...newRecord,
                                                  site_photo_overview: null,
                                                  site_photo_overview_preview: ''
                                                })
                                              })
                                              setShowDeleteConfirm(true)
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 지적사항 사진들 */}
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      지적사항 사진 1 <span className="text-red-500">(필수)</span>
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
                                    {(newRecord.site_photo_issue1 || newRecord.site_photo_issue1_preview) && (
                                      <div className="mt-2">
                                        <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                          <img
                                            src={newRecord.site_photo_issue1 ? URL.createObjectURL(newRecord.site_photo_issue1) : newRecord.site_photo_issue1_preview}
                                            alt="지적사항 사진1 미리보기"
                                            className="w-full h-full object-contain"
                                          />
                                          <div className="absolute top-1 right-1 flex gap-1">
                                            <button
                                              type="button"
                                              className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                              title="시계방향 회전"
                                              onClick={async () => {
                                                // 기존 URL인 경우 먼저 File로 변환
                                                let fileToRotate = newRecord.site_photo_issue1
                                                if (!fileToRotate && newRecord.site_photo_issue1_preview) {
                                                  fileToRotate = await urlToFile(newRecord.site_photo_issue1_preview, 'issue1.jpg')
                                                  if (!fileToRotate) return
                                                }
                                                if (!fileToRotate) return

                                                const rotated = await rotateImageFile(fileToRotate, 'cw')
                                                const previewUrl = URL.createObjectURL(rotated)
                                                if (newRecord.site_photo_issue1_preview && newRecord.site_photo_issue1_preview.startsWith('blob:')) {
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
                                            <button
                                              type="button"
                                              className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                              title="크롭"
                                              onClick={() => openCropModal('issue1')}
                                            >
                                              <Crop className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                              title="삭제"
                                              onClick={() => {
                                                setDeleteConfirmCallback(() => () => {
                                                  // 지적사항1의 사진과 내용 삭제
                                                  if (newRecord.site_photo_issue1_preview && newRecord.site_photo_issue1_preview.startsWith('blob:')) {
                                                    URL.revokeObjectURL(newRecord.site_photo_issue1_preview)
                                                  }
                                                  if (sitePhotoIssue1Ref.current) {
                                                    sitePhotoIssue1Ref.current.value = ''
                                                  }
                                                  
                                                  // 지적사항2의 사진과 내용을 지적사항1로 이동
                                                  const issue2Photo = newRecord.site_photo_issue2
                                                  const issue2PhotoPreview = newRecord.site_photo_issue2_preview
                                                  const issue2Content = newRecord.issue_content2
                                                  
                                                  // 지적사항2의 blob URL 해제 (blob URL인 경우에만)
                                                  if (issue2PhotoPreview && issue2PhotoPreview.startsWith('blob:')) {
                                                    URL.revokeObjectURL(issue2PhotoPreview)
                                                  }
                                                  
                                                  setNewRecord({
                                                    ...newRecord,
                                                    // 지적사항1에 지적사항2의 내용 이동
                                                    site_photo_issue1: issue2Photo,
                                                    site_photo_issue1_preview: issue2PhotoPreview,
                                                    issue_content1: issue2Content || '',
                                                    // 지적사항2는 비우기
                                                    site_photo_issue2: null,
                                                    site_photo_issue2_preview: '',
                                                    issue_content2: ''
                                                  })
                                                  
                                                  // 지적사항2의 input도 초기화
                                                  if (sitePhotoIssue2Ref.current) {
                                                    sitePhotoIssue2Ref.current.value = ''
                                                  }
                                                })
                                                setShowDeleteConfirm(true)
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 지적사항 내용 1 */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        지적사항 내용 1 <span className="text-red-500">(필수)</span>
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
                                    {(newRecord.site_photo_issue2 || newRecord.site_photo_issue2_preview) && (
                                      <div className="mt-2">
                                        <div className="w-full h-40 border rounded overflow-hidden bg-white relative">
                                          <img
                                            src={newRecord.site_photo_issue2 ? URL.createObjectURL(newRecord.site_photo_issue2) : newRecord.site_photo_issue2_preview}
                                            alt="지적사항 사진2 미리보기"
                                            className="w-full h-full object-contain"
                                          />
                                          <div className="absolute top-1 right-1 flex gap-1">
                                            <button
                                              type="button"
                                              className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                              title="시계방향 회전"
                                              onClick={async () => {
                                                // 기존 URL인 경우 먼저 File로 변환
                                                let fileToRotate = newRecord.site_photo_issue2
                                                if (!fileToRotate && newRecord.site_photo_issue2_preview) {
                                                  fileToRotate = await urlToFile(newRecord.site_photo_issue2_preview, 'issue2.jpg')
                                                  if (!fileToRotate) return
                                                }
                                                if (!fileToRotate) return

                                                const rotated = await rotateImageFile(fileToRotate, 'cw')
                                                const previewUrl = URL.createObjectURL(rotated)
                                                if (newRecord.site_photo_issue2_preview && newRecord.site_photo_issue2_preview.startsWith('blob:')) {
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
                                            <button
                                              type="button"
                                              className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                              title="크롭"
                                              onClick={() => openCropModal('issue2')}
                                            >
                                              <Crop className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              className="bg-black bg-opacity-60 text-white rounded-full p-1 hover:bg-opacity-70"
                                              title="삭제"
                                              onClick={() => {
                                                setDeleteConfirmCallback(() => () => {
                                                  if (newRecord.site_photo_issue2_preview && newRecord.site_photo_issue2_preview.startsWith('blob:')) {
                                                    URL.revokeObjectURL(newRecord.site_photo_issue2_preview)
                                                  }
                                                  if (sitePhotoIssue2Ref.current) {
                                                    sitePhotoIssue2Ref.current.value = ''
                                                  }
                                                  setNewRecord({
                                                    ...newRecord,
                                                    site_photo_issue2: null,
                                                    site_photo_issue2_preview: ''
                                                  })
                                                })
                                                setShowDeleteConfirm(true)
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </div>
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
                          )}
                        </div>

                        {/* 점검 항목 탭 인터페이스 */}
                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col" style={{ height: '600px', maxHeight: '70vh' }}>
                          {/* 탭 헤더 - 고정 */}
                          <div className="flex bg-gray-100 border-b border-gray-200 sticky top-0 z-20">
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

                          {/* 탭 컨텐츠 - 스크롤 가능 */}
                          <div 
                            ref={tabContentRef}
                            className={`p-4 overflow-y-auto flex-1 ${
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
                                    noteContent = '· 재해예방기술지도 지적사항 조치결과 확인';
                                  } else if (index === 1) {
                                    noteContent = '· 위험성평가(관리자, 근로자참여하여 위험요인 발굴)\n· 위험성 전달(TBM을 통해 위험요인과 대책을 공유)\n· 실행여부 확인(일일안전점검 일지를 통해 이행확인)';
                                  } else if (index === 2) {
                                    noteContent = '· 신규채용된 일용근로자, 고혈압환자, 외국인 근로자\n· 건강상태 확인, 고위험작업 배제, 외국인 근로자 안전표지 부착';
                                  } else if (index === 3) {
                                    noteContent = '· 안전관리 법적 이행사항 25가지 항목 모니터링 결과의 적정성 확인';
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

        {/* 크롭 모달 */}
        {showCropModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-2">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Crop className="h-5 w-5" />
                  이미지 크롭
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCropArea({ x: 0, y: 0, width: 100, height: 100 })}
                    className="p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    title="초기화"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={applyCrop}
                    className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    title="크롭 적용"
                  >
                    <Save className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setShowCropModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="닫기"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* 크롭 영역 */}
              <div className="p-4">
                <p className="text-sm text-gray-600 mb-3">
                  L형 핸들을 드래그하여 크롭 영역을 조정하세요. 투명한 영역이 잘려나갑니다.
                </p>
                
                <div 
                  ref={cropContainerRef}
                  className="relative w-full bg-gray-100 rounded-lg select-none"
                  style={{ aspectRatio: '4/3' }}
                >
                  {/* 원본 이미지 */}
                  <img 
                    src={cropImageSrc} 
                    alt="크롭할 이미지" 
                    className="absolute inset-0 w-full h-full object-contain"
                    draggable={false}
                  />
                  
                  {/* 크롭되지 않는 영역 (반투명 오버레이) */}
                  {/* 상단 영역 */}
                  <div 
                    className="absolute bg-black/50 pointer-events-none"
                    style={{
                      top: 0,
                      left: 0,
                      right: 0,
                      height: `${cropArea.y}%`
                    }}
                  />
                  {/* 하단 영역 */}
                  <div 
                    className="absolute bg-black/50 pointer-events-none"
                    style={{
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${100 - cropArea.y - cropArea.height}%`
                    }}
                  />
                  {/* 좌측 영역 */}
                  <div 
                    className="absolute bg-black/50 pointer-events-none"
                    style={{
                      top: `${cropArea.y}%`,
                      left: 0,
                      width: `${cropArea.x}%`,
                      height: `${cropArea.height}%`
                    }}
                  />
                  {/* 우측 영역 */}
                  <div 
                    className="absolute bg-black/50 pointer-events-none"
                    style={{
                      top: `${cropArea.y}%`,
                      right: 0,
                      width: `${100 - cropArea.x - cropArea.width}%`,
                      height: `${cropArea.height}%`
                    }}
                  />
                  
                  {/* 크롭 영역 테두리 */}
                  <div 
                    className="absolute border-2 border-black pointer-events-none"
                    style={{
                      left: `${cropArea.x}%`,
                      top: `${cropArea.y}%`,
                      width: `${cropArea.width}%`,
                      height: `${cropArea.height}%`,
                      boxShadow: '0 0 0 9999px transparent'
                    }}
                  />
                  
                  {/* 좌측 상단 L형 핸들 */}
                  <div
                    ref={cropHandleTlRef}
                    className="absolute cursor-nw-resize z-20 touch-manipulation"
                    style={{
                      left: `${cropArea.x}%`,
                      top: `${cropArea.y}%`,
                      transform: 'translate(-12px, -12px)',
                      width: '48px',
                      height: '48px',
                      touchAction: 'none'
                    }}
                  >
                    {/* L형 모양 */}
                    <div className="relative w-8 h-8" style={{ margin: '8px' }}>
                      <div className="absolute bg-black rounded-sm shadow-lg" style={{ top: 0, left: 0, width: '28px', height: '4px' }} />
                      <div className="absolute bg-black rounded-sm shadow-lg" style={{ top: 0, left: 0, width: '4px', height: '28px' }} />
                      <div className="absolute bg-white rounded-full w-3 h-3 shadow-lg border-2 border-black" style={{ top: '-4px', left: '-4px' }} />
                    </div>
                  </div>
                  
                  {/* 우측 하단 L형 핸들 */}
                  <div
                    ref={cropHandleBrRef}
                    className="absolute cursor-se-resize z-20 touch-manipulation"
                    style={{
                      left: `${cropArea.x + cropArea.width}%`,
                      top: `${cropArea.y + cropArea.height}%`,
                      transform: 'translate(-36px, -36px)',
                      width: '48px',
                      height: '48px',
                      touchAction: 'none'
                    }}
                  >
                    {/* L형 모양 (반대 방향) */}
                    <div className="relative w-8 h-8" style={{ margin: '8px' }}>
                      <div className="absolute bg-black rounded-sm shadow-lg" style={{ bottom: 0, right: 0, width: '28px', height: '4px' }} />
                      <div className="absolute bg-black rounded-sm shadow-lg" style={{ bottom: 0, right: 0, width: '4px', height: '28px' }} />
                      <div className="absolute bg-white rounded-full w-3 h-3 shadow-lg border-2 border-black" style={{ bottom: '-4px', right: '-4px' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 서명 모달 */}
        {showSignatureModal && (
          <SignaturePad
            onSave={handleSaveWithSignature}
            onCancel={() => setShowSignatureModal(false)}
            isSaving={loading}
          />
        )}

        {/* 재서명 모달 */}
        {showResignSignatureModal && (
          <SignaturePad
            onSave={handleSaveResignature}
            onCancel={() => setShowResignSignatureModal(false)}
            isSaving={loading}
          />
        )}

        {/* 이미지 편집 모달 */}
        {editingImage && (
          <ImageEditor
            imageUrl={editingImage.url}
            onSave={handleSaveEditedImage}
            onClose={() => setEditingImage(null)}
          />
        )}

        {/* 전화 모달 */}
        {/* 삭제 확인 모달 */}
        {showDeleteConfirm && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => {
              setShowDeleteConfirm(false)
              setDeleteConfirmCallback(null)
            }}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">삭제 확인</h3>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteConfirmCallback(null)
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-gray-700">정말 삭제하시겠습니까?</p>
                
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmCallback(null)
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (deleteConfirmCallback) {
                        deleteConfirmCallback()
                      }
                      setShowDeleteConfirm(false)
                      setDeleteConfirmCallback(null)
                    }}
                    className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 연락처 선택 모달 */}
        {showContactSelectModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowContactSelectModal(false)}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">연락처 선택</h3>
                <p className="text-sm text-gray-500 mt-1">전화할 대상을 선택하세요</p>
              </div>
              
              <div className="space-y-3">
                {/* 공사감독 */}
                {(project as any)?.supervisor_phone ? (
                  <button
                    onClick={() => {
                      setShowContactSelectModal(false)
                      setPhoneModalData({ 
                        name: project?.supervisor_name || '공사감독', 
                        phone: (project as any).supervisor_phone,
                        title: '공사감독 연락처'
                      })
                      setPhoneCopied(false)
                      setShowPhoneModal(true)
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">공사감독</p>
                      <p className="text-sm text-gray-500 truncate">{project?.supervisor_name || '이름 미등록'} · {(project as any).supervisor_phone}</p>
                    </div>
                    <Phone className="h-5 w-5 text-gray-400" />
                  </button>
                ) : (
                  <div className="w-full flex items-center gap-4 px-4 py-3 bg-gray-100 rounded-lg text-left opacity-60">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-500">공사감독</p>
                      <p className="text-sm text-gray-400">연락처 미등록</p>
                    </div>
                  </div>
                )}

                {/* 현장소장 */}
                {project?.user_profiles?.phone_number ? (
                  <button
                    onClick={() => {
                      setShowContactSelectModal(false)
                      setPhoneModalData({ 
                        name: project?.user_profiles?.full_name || '현장소장', 
                        phone: project.user_profiles.phone_number,
                        title: '현장소장 연락처'
                      })
                      setPhoneCopied(false)
                      setShowPhoneModal(true)
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <HardHat className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">현장소장</p>
                      <p className="text-sm text-gray-500 truncate">{project?.user_profiles?.full_name || '이름 미등록'} · {project.user_profiles.phone_number}</p>
                    </div>
                    <Phone className="h-5 w-5 text-gray-400" />
                  </button>
                ) : (
                  <div className="w-full flex items-center gap-4 px-4 py-3 bg-gray-100 rounded-lg text-left opacity-60">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <HardHat className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-500">현장소장</p>
                      <p className="text-sm text-gray-400">연락처 미등록</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowContactSelectModal(false)}
                className="w-full mt-4 px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* 전화/복사 모달 */}
        {showPhoneModal && phoneModalData && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowPhoneModal(false)}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{phoneModalData.title}</h3>
                <p className="text-gray-600">{phoneModalData.name}</p>
                <p className="text-xl font-bold text-gray-900 mt-2">{phoneModalData.phone}</p>
              </div>
              
              <div className="space-y-3">
                <a
                  href={`tel:${phoneModalData.phone}`}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Phone className="h-5 w-5" />
                  전화하기
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(phoneModalData.phone)
                      setPhoneCopied(true)
                      setTimeout(() => setPhoneCopied(false), 2000)
                    } catch (err) {
                      console.error('전화번호 복사 실패:', err)
                    }
                  }}
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
                  onClick={() => setShowPhoneModal(false)}
                  className="w-full px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}