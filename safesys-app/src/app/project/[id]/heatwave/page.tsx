'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, FileText, ChevronLeft, ChevronRight, X, Download, Trash2, FolderDown } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import HeatWaveInspectionModal from '@/components/project/HeatWaveInspectionModal'

interface HeatWaveInspectionData {
  measureDateTime: string
  temperature: string
  water: 'O' | 'X' | ''
  wind: 'O' | 'X' | ''
  rest: 'O' | 'X' | ''
  cooling: 'O' | 'X' | ''
  emergency: 'O' | 'X' | ''
  workTime: 'O' | 'X' | ''
  inspectionPhotos?: File[]
  inspectorName: string
  signature?: string
}

export default function HeatWaveCheckPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false)
  const [heatwaveChecks, setHeatwaveChecks] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDateChecks, setSelectedDateChecks] = useState<any[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedCheckIds, setSelectedCheckIds] = useState<Set<string>>(new Set())
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [isBulkDownloadMode, setIsBulkDownloadMode] = useState(false)
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  const hiddenReportRef = useRef<HTMLDivElement>(null)

  // Kakao Maps API 로드 (일단 주석 처리 - V-world API 우선 테스트)
  /*
  useEffect(() => {
    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=YOUR_KAKAO_API_KEY&libraries=services&autoload=false`
    script.async = true
    script.onload = () => {
      if ((window as any).kakao && (window as any).kakao.maps) {
        (window as any).kakao.maps.load(() => {
          console.log('Kakao Maps API 로드 완료')
        })
      }
    }
    document.head.appendChild(script)

    return () => {
      // 컴포넌트 언마운트 시 스크립트 제거
      const existingScript = document.querySelector(`script[src*="dapi.kakao.com"]`)
      if (existingScript) {
        document.head.removeChild(existingScript)
      }
    }
  }, [])
  */

  useEffect(() => {
    if (user && projectId) {
      loadProject()
      loadHeatwaveChecks()
    }
  }, [user, projectId])

  useEffect(() => {
    if (project) {
      loadHeatwaveChecks()
    }
  }, [project, currentMonth])

  const loadProject = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select(`
          *,
          user_profiles!projects_created_by_fkey(full_name)
        `)
        .eq('id', projectId)
        .single()

      if (projectError) {
        throw new Error(projectError.message)
      }

      setProject(data)
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadHeatwaveChecks = async () => {
    try {
      if (!projectId) return

      // 현재 월의 시작과 끝 날짜 계산 (시간대 영향 없이)
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startOfMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endOfMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`

      console.log('점검 기록 조회:', {
        projectId,
        startOfMonth: startOfMonthStr,
        endOfMonth: endOfMonthStr
      })

      const { data, error } = await supabase
        .from('heat_wave_checks')
        .select(`
          *,
          user_profiles(full_name)
        `)
        .eq('project_id', projectId)
        .gte('check_time', startOfMonthStr)
        .lte('check_time', endOfMonthStr)
        .order('check_time', { ascending: false })

      if (error) {
        console.error('점검 기록 조회 오류:', error)
        return
      }

      console.log('점검 기록 조회 결과:', data)
      setHeatwaveChecks(data || [])

    } catch (error) {
      console.error('점검 기록 로드 실패:', error)
    }
  }



  const handleBack = () => {
    router.back()
  }

  const handleNewCheck = () => {
    setIsInspectionModalOpen(true)
  }

  const handleCloseInspectionModal = () => {
    setIsInspectionModalOpen(false)
  }

  const handleSaveInspection = async (data: HeatWaveInspectionData) => {
    try {
      if (!user || !project) {
        throw new Error('사용자 또는 프로젝트 정보가 없습니다')
      }

      console.log('열중질환 점검 데이터 저장 시작:', data)

      // 사용자가 입력한 측정일시(YYYY-MM-DDTHH:mm)로 check_time 생성
      const datePart = data.measureDateTime
      // 일부 브라우저 호환을 위해 'T'를 공백으로 바꾸어 Date 생성
      const checkTime = new Date(datePart.replace('T', ' ') + ':00')

      // 고유한 파일명 생성을 위한 타임스탬프
      const timestamp = Date.now()
      const checkId = `${project.id}_${timestamp}`

      // 1. 사진들을 Supabase Storage에 업로드 (에러 시 계속 진행)
      let photoUrls: string[] = []
      if (data.inspectionPhotos && data.inspectionPhotos.length > 0) {
        console.log(`${data.inspectionPhotos.length}개의 사진 업로드 시작`)
        
        // 가능한 버킷 이름들 시도
        const possibleBuckets = ['heatwave-inspections', 'inspections', 'uploads', 'files']
        let workingBucket: string | null = null
        
        // 첫 번째 사진으로 버킷 테스트
        const testPhoto = data.inspectionPhotos[0]
        const testFileExt = testPhoto.name.split('.').pop()
        const testFileName = `test_${checkId}.${testFileExt}`
        
        for (const bucketName of possibleBuckets) {
          try {
            const { error: testError } = await supabase.storage
              .from(bucketName)
              .upload(testFileName, testPhoto, {
                cacheControl: '3600',
                upsert: true
              })
            
            if (!testError) {
              workingBucket = bucketName
              console.log(`사용 가능한 버킷 발견: ${bucketName}`)
              // 테스트 파일 삭제
              await supabase.storage.from(bucketName).remove([testFileName])
              break
            }
          } catch (error) {
            console.log(`버킷 ${bucketName} 테스트 실패:`, error)
            continue
          }
        }
        
        if (workingBucket) {
          // 실제 사진 업로드
          for (let i = 0; i < data.inspectionPhotos.length; i++) {
            try {
              const photo = data.inspectionPhotos[i]
              const fileExt = photo.name.split('.').pop()
              const fileName = `${checkId}_photo_${i + 1}.${fileExt}`
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from(workingBucket)
                .upload(fileName, photo, {
                  cacheControl: '3600',
                  upsert: false
                })

              if (uploadError) {
                console.error(`사진 ${i + 1} 업로드 실패:`, uploadError)
                continue // 이 사진은 스킵하고 다음 사진 시도
              }

              // 공개 URL 생성
              const { data: { publicUrl } } = supabase.storage
                .from(workingBucket)
                .getPublicUrl(fileName)
              
              photoUrls.push(publicUrl)
              console.log(`사진 ${i + 1} 업로드 성공:`, fileName)
            } catch (error) {
              console.error(`사진 ${i + 1} 업로드 오류:`, error)
              continue
            }
          }
        } else {
          console.warn('사용 가능한 Storage 버킷을 찾을 수 없습니다. 사진 없이 진행합니다.')
        }
      }

      // 2. 서명 데이터 처리 (Base64를 파일로 변환 후 업로드)
      let signatureUrl: string | null = null
      if (data.signature) {
        console.log('서명 데이터 업로드 시작')
        
        try {
          // Base64 데이터를 Blob으로 변환
          const base64Data = data.signature.split(',')[1]
          const byteCharacters = atob(base64Data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          const signatureBlob = new Blob([byteArray], { type: 'image/png' })

          const signatureFileName = `${checkId}_signature.png`
          
          // 가능한 버킷들 시도
          const possibleBuckets = ['heatwave-inspections', 'inspections', 'uploads', 'files']
          let signatureUploaded = false
          
          for (const bucketName of possibleBuckets) {
            try {
              const { data: signatureUploadData, error: signatureUploadError } = await supabase.storage
                .from(bucketName)
                .upload(signatureFileName, signatureBlob, {
                  cacheControl: '3600',
                  upsert: false
                })

              if (!signatureUploadError) {
                // 공개 URL 생성
                const { data: { publicUrl } } = supabase.storage
                  .from(bucketName)
                  .getPublicUrl(signatureFileName)
                
                signatureUrl = publicUrl
                signatureUploaded = true
                console.log(`서명 업로드 성공 (${bucketName}):`, signatureFileName)
                break
              }
            } catch (error) {
              console.log(`서명 업로드 실패 (${bucketName}):`, error)
              continue
            }
          }
          
          if (!signatureUploaded) {
            console.warn('서명 업로드 실패: 사용 가능한 버킷을 찾을 수 없습니다. 서명 없이 진행합니다.')
          }
        } catch (error) {
          console.error('서명 처리 오류:', error)
          console.warn('서명 없이 진행합니다.')
        }
      }

      // 3. Supabase 테이블에 데이터 저장 (사진 URL과 서명 URL 포함)
      const { data: insertedData, error: insertError } = await supabase
        .from('heat_wave_checks')
        .insert({
          project_id: project.id,
          created_by: user.id,
          check_time: checkTime.toLocaleString('sv-SE'), // 'YYYY-MM-DD HH:mm:ss' 형식
          feels_like_temp: parseFloat(data.temperature),
          water_supply: data.water === 'O',
          ventilation: data.wind === 'O',
          rest_time: data.rest === 'O',
          cooling_equipment: data.cooling === 'O',
          emergency_care: data.emergency === 'O',
          work_time_adjustment: data.workTime === 'O',
          photos: photoUrls.length > 0 ? photoUrls : null, // 사진 URL 배열
          signature: signatureUrl, // 서명 URL
          inspector_name: data.inspectorName // 점검자 이름
        })
        .select()
        .single()

      if (insertError) {
        console.error('Supabase 저장 오류:', insertError)
        throw new Error(`데이터 저장 실패: ${insertError.message}`)
      }

      console.log('점검 데이터 저장 성공:', insertedData)
      
      // 업로드 결과 요약
      const uploadSummary = []
      uploadSummary.push(`일시: ${data.measureDateTime.replace('T', ' ')}`)
      uploadSummary.push(`온도: ${data.temperature}°C`)
      
      if (data.inspectionPhotos && data.inspectionPhotos.length > 0) {
        uploadSummary.push(`사진: ${photoUrls.length}/${data.inspectionPhotos.length}개 업로드 성공`)
      }
      
      uploadSummary.push(`서명: ${signatureUrl ? '업로드 완료' : '업로드 실패 (데이터만 저장됨)'}`)
      
      alert(`점검이 성공적으로 저장되었습니다!\n\n${uploadSummary.join('\n')}`)
      
      // 저장 후 점검 기록 다시 로드
      await loadHeatwaveChecks()
      
    } catch (error) {
      console.error('점검 저장 실패:', error)
      throw error
    }
  }

  // 선택된 항목 삭제 함수
  const handleDeleteSelected = async () => {
    if (selectedCheckIds.size === 0) {
      alert('삭제할 항목을 선택해주세요.')
      return
    }

    if (!confirm(`선택한 ${selectedCheckIds.size}개의 점검 기록을 삭제하시겠습니까?`)) {
      return
    }

    try {
      setLoading(true)
      
      // Supabase에서 선택된 항목들 삭제
      const { error } = await supabase
        .from('heat_wave_checks')
        .delete()
        .in('id', Array.from(selectedCheckIds))
      
      if (error) {
        console.error('삭제 오류:', error)
        alert('삭제 중 오류가 발생했습니다.')
        return
      }

      // UI 업데이트
      setSelectedCheckIds(new Set())
      setIsDeleteMode(false)
      
      // 선택된 날짜의 체크 목록 먼저 업데이트
      const deletedIds = new Set(selectedCheckIds)
      const updatedDayChecks = selectedDateChecks.filter(check => !deletedIds.has(check.id))
      setSelectedDateChecks(updatedDayChecks)
      
      // 전체 데이터 새로고침
      await loadHeatwaveChecks()
      
      alert('선택한 항목이 삭제되었습니다.')
      
    } catch (error) {
      console.error('삭제 중 오류:', error)
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }


  // 렌더 동기화 유틸: 두 번의 rAF로 상태/DOM 반영을 보장
  const waitForRender = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  // 일괄 다운로드 함수 - 기존 handleSavePDF 함수를 그대로 활용하여 여러 날짜 순차 생성
  const handleBulkDownload = async () => {
    if (selectedDates.size === 0) {
      alert('다운로드할 날짜를 선택해주세요.')
      return
    }

    if (!project) return

    setIsBulkDownloading(true)
    try {
      // 동적 import로 라이브러리 로드 (기존과 동일)
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).jsPDF

      // 모바일 감지 (기존과 동일)
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      // PDF 생성
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const margin = 15 // 여백 15mm (좌우상하)
      const imgWidth = pageWidth - (margin * 2) // 실제 이미지 폭 (180mm)
      const maxImgHeight = pageHeight - (margin * 2) // 실제 이미지 높이 (267mm)
      
      // 선택된 날짜들을 정렬
      const selectedDatesArray = Array.from(selectedDates).sort()
      let isFirstPage = true

      // 캔버스 생성 옵션 (기존과 동일)
      const canvasOptions = {
        scale: isMobile ? 1.5 : 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        removeContainer: true,
        ignoreElements: (element: Element) => {
          return element.classList?.contains('ignore-pdf') || false
        },
        onclone: (clonedDoc: Document) => {
          const style = clonedDoc.createElement('style')
          style.textContent = `
            * {
              box-sizing: border-box !important;
            }
            body {
              margin: 0 !important;
              padding: 20px !important;
              background: white !important;
              font-family: 'Malgun Gothic', sans-serif !important;
            }
            .text-red-600 { color: rgb(220, 38, 38) !important; }
            .text-blue-600 { color: rgb(37, 99, 235) !important; }
            .text-green-600 { color: rgb(22, 163, 74) !important; }
            .text-gray-600 { color: rgb(75, 85, 99) !important; }
            .text-gray-700 { color: rgb(55, 65, 81) !important; }
            .text-gray-800 { color: rgb(31, 41, 55) !important; }
            .text-gray-900 { color: rgb(17, 24, 39) !important; }
            .border-gray-800 { border-color: rgb(31, 41, 55) !important; }
            .border { border-color: rgb(209, 213, 219) !important; }
            table { 
              border-collapse: collapse !important;
              width: 100% !important;
            }
            th, td { 
              text-align: center !important; 
              vertical-align: middle !important;
              border: 1px solid rgb(31, 41, 55) !important;
              padding: 8px !important;
            }
            th { 
              background-color: rgb(229, 231, 235) !important;
              font-weight: bold !important;
            }
          `
          clonedDoc.head.appendChild(style)
        }
      }

      for (const date of selectedDatesArray) {
        // 해당 날짜의 점검 기록 찾기 (기존 로직과 동일)
        const dayChecks = heatwaveChecks.filter(check => 
          check.check_time.split('T')[0] === date
        ).sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())

        if (dayChecks.length > 0) {
          // 첫 페이지가 아니면 새 페이지 추가
          if (!isFirstPage) {
            pdf.addPage()
          }

          // selectedDate와 selectedDateChecks를 임시로 변경하여 기존 hiddenReportRef 활용
          const originalSelectedDate = selectedDate
          const originalSelectedDateChecks = selectedDateChecks
          
          setSelectedDate(date)
          setSelectedDateChecks(dayChecks)

          // 상태 반영 대기
          await waitForRender()

          // PDF 전용 숨김 컴포넌트 표시 (선택 반영 이후 보장)
          if (!hiddenReportRef.current) {
            await waitForRender()
          }
          if (hiddenReportRef.current) {
            hiddenReportRef.current.style.display = 'block'
          }

          // DOM 반영 대기
          await waitForRender()

          // 캔버스 생성 (요소 보장)
          if (!hiddenReportRef.current) {
            throw new Error('보고서 렌더링 요소를 찾을 수 없습니다.')
          }
          const canvas = await html2canvas(hiddenReportRef.current, canvasOptions)
          
          // PDF 전용 컴포넌트 다시 숨김
          if (hiddenReportRef.current) {
            hiddenReportRef.current.style.display = 'none'
          }

          // PDF에 이미지 추가 (기존과 동일한 로직)
          const imgHeight = (canvas.height * imgWidth) / canvas.width
          let heightLeft = imgHeight
          let position = margin

          // 첫 페이지 추가
          const imgData = canvas.toDataURL('image/png')
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
          heightLeft -= maxImgHeight

          // 추가 페이지들 (중복/빈 페이지 방지)
          while (heightLeft > 0) {
            position -= maxImgHeight
            pdf.addPage()
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
            heightLeft -= maxImgHeight
          }

          // 사진 페이지 추가 (기존과 동일한 로직)
          const sortedChecks = [...dayChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
          const allPhotos = sortedChecks.flatMap(check => check.photos || []).filter(photo => photo)
          
          if (allPhotos.length > 0) {
            // 사진을 2개씩 그룹으로 나누기
            const photoGroups = []
            for (let i = 0; i < allPhotos.length; i += 2) {
              photoGroups.push(allPhotos.slice(i, i + 2))
            }

            // 각 그룹마다 페이지 생성
            for (let groupIndex = 0; groupIndex < photoGroups.length; groupIndex++) {
              pdf.addPage()
              
              // 페이지 제목을 캔버스로 생성하여 이미지로 추가
              try {
                const titleCanvas = document.createElement('canvas')
                const titleCtx = titleCanvas.getContext('2d')
                if (!titleCtx) throw new Error('Canvas context not available')
                
                titleCanvas.width = 400
                titleCanvas.height = 80
                
                titleCtx.fillStyle = 'white'
                titleCtx.fillRect(0, 0, titleCanvas.width, titleCanvas.height)
                
                titleCtx.font = 'bold 36px Arial, sans-serif'
                titleCtx.fillStyle = 'black'
                titleCtx.textAlign = 'center'
                titleCtx.textBaseline = 'middle'
                titleCtx.fillText('사진대지', titleCanvas.width / 2, titleCanvas.height / 2)
                
                const titleImageData = titleCanvas.toDataURL('image/png')
                const titleWidth = 60 // mm (크기 증가)
                const titleHeight = 12 // mm (크기 증가)
                const titleX = (pageWidth - titleWidth) / 2
                
                pdf.addImage(titleImageData, 'PNG', titleX, margin + 5, titleWidth, titleHeight)
                
                // 사진 관련 설명 텍스트 추가
                const subtitleCanvas = document.createElement('canvas')
                const subtitleCtx = subtitleCanvas.getContext('2d')
                if (subtitleCtx) {
                  subtitleCanvas.width = 600
                  subtitleCanvas.height = 60
                  
                  subtitleCtx.fillStyle = 'white'
                  subtitleCtx.fillRect(0, 0, subtitleCanvas.width, subtitleCanvas.height)
                  
                  subtitleCtx.font = 'bold 28px Arial, sans-serif'
                  subtitleCtx.fillStyle = 'black'
                  subtitleCtx.textAlign = 'left'
                  subtitleCtx.textBaseline = 'middle'
                  subtitleCtx.fillText('□ 체감온도 측정 관련 / 5대 기본수칙', 20, subtitleCanvas.height / 2)
                  
                  const subtitleImageData = subtitleCanvas.toDataURL('image/png')
                  const subtitleWidth = 120 // mm
                  const subtitleHeight = 12 // mm
                  const subtitleX = margin
                  
                  pdf.addImage(subtitleImageData, 'PNG', subtitleX, margin + 20, subtitleWidth, subtitleHeight)
                }
              } catch (e) {
                // 제목 생성 실패 시 영문으로 대체
                pdf.setFontSize(20)
                pdf.setFont('helvetica', 'bold')
                pdf.text('Photo Report', pageWidth / 2, margin + 12, { align: 'center' })
                
                // 서브타이틀도 텍스트로 추가
                pdf.setFontSize(14)
                pdf.setFont('helvetica', 'bold')
                pdf.text('□ 체감온도 측정 관련 / 5대 기본수칙', margin, margin + 25)
              }
              
              const photoGroup = photoGroups[groupIndex]
              const photoWidth = imgWidth * 0.8 // 사진 너비 (전체 너비의 80%)
              const photoHeight = (pageHeight - margin * 2 - 50) / 2 - 10 // 사진 높이 (제목과 설명 텍스트 여백 고려)
              
              // 표 테두리 그리기
              const tableStartY = margin + 40 // 설명 텍스트 공간 추가
              const tableHeight = photoGroup.length === 1 ? photoHeight + 20 : photoHeight * 2 + 30 // 사진 개수에 따라 높이 조정
              const tableX = (pageWidth - imgWidth) / 2
              
              // 외곽 테두리
              pdf.setLineWidth(0.5)
              pdf.rect(tableX, tableStartY, imgWidth, tableHeight)
              
              // 중간 구분선 (사진 2개를 나누는 선)
              if (photoGroup.length > 1) {
                const middleY = tableStartY + tableHeight / 2
                pdf.line(tableX, middleY, tableX + imgWidth, middleY)
              }
              
              // 각 그룹의 사진들 처리
              for (let photoIndex = 0; photoIndex < photoGroup.length; photoIndex++) {
                const photo = photoGroup[photoIndex]
                
                try {
                  const photoY = tableStartY + photoIndex * (tableHeight / 2) + 10 // 테이블 상단 여백 + 사진별 위치 + 내부 여백
                  const photoX = (pageWidth - photoWidth) / 2 // 가운데 정렬
                  
                  // 사진 추가 시도
                  pdf.addImage(photo, 'JPEG', photoX, photoY, photoWidth, photoHeight * 0.8) // 높이 조정하여 여백 확보
                  
                } catch (error) {
                  console.warn(`사진 ${groupIndex * 2 + photoIndex + 1} 추가 실패:`, error)
                  // 사진 추가 실패 시 텍스트로 대체
                  pdf.setFontSize(12)
                  pdf.text(`사진 ${groupIndex * 2 + photoIndex + 1} (로드 실패)`, 
                    pageWidth / 2, 
                    tableStartY + photoIndex * (tableHeight / 2) + tableHeight / 4, 
                    { align: 'center' })
                }
              }
            }
          }

          // 원래 상태로 복원
          setSelectedDate(originalSelectedDate)
          setSelectedDateChecks(originalSelectedDateChecks)
          
          isFirstPage = false
        }
      }

      // PDF 파일명 생성 (날짜 범위 포함)
      const dateRange = selectedDatesArray.length > 1 
        ? `${selectedDatesArray[0].replace(/-/g, '')}_${selectedDatesArray[selectedDatesArray.length - 1].replace(/-/g, '')}`
        : selectedDatesArray[0].replace(/-/g, '')
      
      const fileName = `폭염대비_주요활동_관리대장_${dateRange}_${project.project_name}.pdf`
      
      // PDF 다운로드 (기존과 동일한 방식)
      if (isMobile) {
        try {
          // iOS Safari 및 다른 모바일 브라우저
          if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream) {
            // iOS: 새 창에서 PDF 열기
            const pdfBlob = pdf.output('blob')
            const pdfUrl = URL.createObjectURL(pdfBlob)
            
            const newWindow = window.open('', '_blank')
            if (newWindow) {
              newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>${fileName}</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin:0; padding:20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                  <div style="text-align: center; margin-bottom: 20px;">
                    <h3>${fileName}</h3>
                    <p>아래 버튼을 눌러 PDF를 다운로드하세요.</p>
                    <a href="${pdfUrl}" download="${fileName}" style="
                      display: inline-block; 
                      padding: 12px 24px; 
                      background: #007AFF; 
                      color: white; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      margin: 10px;
                    ">다운로드</a>
                  </div>
                  <iframe src="${pdfUrl}" width="100%" height="70%" style="border: 1px solid #ccc;"></iframe>
                </body>
                </html>
              `)
              newWindow.document.close()
            } else {
              // 팝업이 차단된 경우 기본 다운로드 시도
              pdf.save(fileName)
            }
          } 
          // Android Chrome 및 기타 모바일 브라우저
          else {
            // 먼저 기본 다운로드 시도
            try {
              pdf.save(fileName)
            } catch (e) {
              // 실패 시 Blob URL 방식
              const pdfBlob = pdf.output('blob')
              const pdfUrl = URL.createObjectURL(pdfBlob)
              
              // 새 탭에서 열기 시도
              const newTab = window.open(pdfUrl, '_blank')
              if (!newTab) {
                // 새 탭이 차단된 경우 다운로드 링크 생성
                const downloadLink = document.createElement('a')
                downloadLink.href = pdfUrl
                downloadLink.download = fileName
                downloadLink.style.display = 'none'
                document.body.appendChild(downloadLink)
                
                // 사용자 상호작용을 통한 다운로드 트리거
                setTimeout(() => {
                  downloadLink.click()
                  document.body.removeChild(downloadLink)
                  setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000)
                }, 100)
              } else {
                // 새 탭에서 열린 경우에도 URL 정리
                setTimeout(() => URL.revokeObjectURL(pdfUrl), 5000)
              }
            }
          }
        } catch (error) {
          console.error('모바일 PDF 다운로드 오류:', error)
          alert('PDF 다운로드 중 오류가 발생했습니다. 다시 시도해주세요.')
        }
      } else {
        // 데스크톱: 일반 저장
        pdf.save(fileName)
      }

      // 선택 해제
      setSelectedDates(new Set())
      setIsBulkDownloadMode(false)
      
    } catch (error) {
      console.error('PDF 생성 오류:', error)
      
      // 모바일에서 더 자세한 오류 안내
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      if (isMobile) {
        alert(`PDF 저장 중 오류가 발생했습니다.\n\n모바일에서 PDF 다운로드가 안 될 경우:\n1. 브라우저 설정에서 팝업 허용\n2. 파일 다운로드 허용\n3. 다른 브라우저(Chrome, Safari) 사용 시도\n\n오류: ${error}`)
      } else {
        alert('PDF 저장 중 오류가 발생했습니다.')
      }
    } finally {
      setIsBulkDownloading(false)
    }
  }

  // PDF 저장 함수
  const handleSavePDF = async () => {
    if (!hiddenReportRef.current || !selectedDate || !project) return

    setIsPdfGenerating(true)
    try {
      // 동적 import로 라이브러리 로드
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).jsPDF

      // 모바일 감지
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      // PDF 전용 숨김 컴포넌트 표시
      if (hiddenReportRef.current) {
        hiddenReportRef.current.style.display = 'block'
      }

      // 잠시 대기 (DOM 업데이트 시간)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // 캔버스 생성 옵션
      const canvasOptions = {
        scale: isMobile ? 1.5 : 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        removeContainer: true,
        ignoreElements: (element: Element) => {
          return element.classList?.contains('ignore-pdf') || false
        },
        onclone: (clonedDoc: Document) => {
          const style = clonedDoc.createElement('style')
          style.textContent = `
            * {
              box-sizing: border-box !important;
            }
            body {
              margin: 0 !important;
              padding: 20px !important;
              background: white !important;
              font-family: 'Malgun Gothic', sans-serif !important;
            }
            .text-red-600 { color: rgb(220, 38, 38) !important; }
            .text-blue-600 { color: rgb(37, 99, 235) !important; }
            .text-green-600 { color: rgb(22, 163, 74) !important; }
            .text-gray-600 { color: rgb(75, 85, 99) !important; }
            .text-gray-700 { color: rgb(55, 65, 81) !important; }
            .text-gray-800 { color: rgb(31, 41, 55) !important; }
            .text-gray-900 { color: rgb(17, 24, 39) !important; }
            .border-gray-800 { border-color: rgb(31, 41, 55) !important; }
            .border { border-color: rgb(209, 213, 219) !important; }
            table { 
              border-collapse: collapse !important;
              width: 100% !important;
            }
            th, td { 
              text-align: center !important; 
              vertical-align: middle !important;
              border: 1px solid rgb(31, 41, 55) !important;
              padding: 8px !important;
            }
            th { 
              background-color: rgb(229, 231, 235) !important;
              font-weight: bold !important;
            }
          `
          clonedDoc.head.appendChild(style)
        }
      }

      // 캔버스 생성
      const canvas = await html2canvas(hiddenReportRef.current, canvasOptions)
      
      // PDF 전용 컴포넌트 다시 숨김
      if (hiddenReportRef.current) {
        hiddenReportRef.current.style.display = 'none'
      }

      // A4 크기 (210 x 297 mm) with margins
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const margin = 15 // 여백 15mm (좌우상하)
      const imgWidth = pageWidth - (margin * 2) // 실제 이미지 폭 (180mm)
      const maxImgHeight = pageHeight - (margin * 2) // 실제 이미지 높이 (267mm)
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight

      let position = margin // 상단 여백부터 시작

      // 첫 페이지 추가
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= maxImgHeight

      // 여러 페이지가 필요한 경우
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + margin // 상단 여백 고려
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, position, imgWidth, imgHeight)
        heightLeft -= maxImgHeight
      }

      // 사진 페이지 추가 (시간 순으로 정렬)
      const sortedChecks = selectedDateChecks.sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
      const allPhotos = sortedChecks.flatMap(check => check.photos || []).filter(photo => photo)
      
      if (allPhotos.length > 0) {
        // 사진을 2개씩 그룹으로 나누기
        const photoGroups = []
        for (let i = 0; i < allPhotos.length; i += 2) {
          photoGroups.push(allPhotos.slice(i, i + 2))
        }

        // 각 그룹마다 페이지 생성
        for (let groupIndex = 0; groupIndex < photoGroups.length; groupIndex++) {
          pdf.addPage()
          
          // 페이지 제목을 캔버스로 생성하여 이미지로 추가
          try {
            const titleCanvas = document.createElement('canvas')
            const titleCtx = titleCanvas.getContext('2d')
            if (!titleCtx) throw new Error('Canvas context not available')
            
            titleCanvas.width = 400
            titleCanvas.height = 80
            
            titleCtx.fillStyle = 'white'
            titleCtx.fillRect(0, 0, titleCanvas.width, titleCanvas.height)
            
            titleCtx.font = 'bold 36px Arial, sans-serif'
            titleCtx.fillStyle = 'black'
            titleCtx.textAlign = 'center'
            titleCtx.textBaseline = 'middle'
            titleCtx.fillText('사진대지', titleCanvas.width / 2, titleCanvas.height / 2)
            
            const titleImageData = titleCanvas.toDataURL('image/png')
            const titleWidth = 60 // mm (크기 증가)
            const titleHeight = 12 // mm (크기 증가)
            const titleX = (pageWidth - titleWidth) / 2
            
            pdf.addImage(titleImageData, 'PNG', titleX, margin + 5, titleWidth, titleHeight)
            
            // 사진 관련 설명 텍스트 추가
            const subtitleCanvas = document.createElement('canvas')
            const subtitleCtx = subtitleCanvas.getContext('2d')
            if (subtitleCtx) {
              subtitleCanvas.width = 600
              subtitleCanvas.height = 60
              
              subtitleCtx.fillStyle = 'white'
              subtitleCtx.fillRect(0, 0, subtitleCanvas.width, subtitleCanvas.height)
              
              subtitleCtx.font = 'bold 28px Arial, sans-serif'
              subtitleCtx.fillStyle = 'black'
              subtitleCtx.textAlign = 'left'
              subtitleCtx.textBaseline = 'middle'
              subtitleCtx.fillText('□ 체감온도 측정 관련 / 5대 기본수칙', 20, subtitleCanvas.height / 2)
              
              const subtitleImageData = subtitleCanvas.toDataURL('image/png')
              const subtitleWidth = 120 // mm
              const subtitleHeight = 12 // mm
              const subtitleX = margin
              
              pdf.addImage(subtitleImageData, 'PNG', subtitleX, margin + 20, subtitleWidth, subtitleHeight)
            }
          } catch (e) {
            // 제목 생성 실패 시 영문으로 대체
            pdf.setFontSize(20)
            pdf.setFont('helvetica', 'bold')
            pdf.text('Photo Report', pageWidth / 2, margin + 12, { align: 'center' })
            
            // 서브타이틀도 텍스트로 추가
            pdf.setFontSize(14)
            pdf.setFont('helvetica', 'bold')
            pdf.text('□ 체감온도 측정 관련 / 5대 기본수칙', margin, margin + 25)
          }
          
          const photoGroup = photoGroups[groupIndex]
          const photoWidth = imgWidth * 0.8 // 사진 너비 (전체 너비의 80%)
          const photoHeight = (pageHeight - margin * 2 - 50) / 2 - 10 // 사진 높이 (제목과 설명 텍스트 여백 고려)
          
          // 표 테두리 그리기
          const tableStartY = margin + 40 // 설명 텍스트 공간 추가
          const tableHeight = photoGroup.length === 1 ? photoHeight + 20 : photoHeight * 2 + 30 // 사진 개수에 따라 높이 조정
          const tableX = (pageWidth - imgWidth) / 2
          
          // 외곽 테두리
          pdf.setLineWidth(0.5)
          pdf.rect(tableX, tableStartY, imgWidth, tableHeight)
          
          // 중간 구분선 (사진 2개를 나누는 선)
          if (photoGroup.length > 1) {
            const middleY = tableStartY + tableHeight / 2
            pdf.line(tableX, middleY, tableX + imgWidth, middleY)
          }
          
          // 각 그룹의 사진들 처리
          for (let photoIndex = 0; photoIndex < photoGroup.length; photoIndex++) {
            const photoUrl = photoGroup[photoIndex]
            const yPosition = tableStartY + 10 + (photoIndex * (photoHeight + 10)) // 표 안쪽 여백 고려
            
            try {
              // 사진을 이미지로 로드
              const img = new Image()
              img.crossOrigin = 'anonymous'
              
              await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                  try {
                    // 캔버스를 사용해 이미지를 base64로 변환
                    const tempCanvas = document.createElement('canvas')
                    tempCanvas.width = img.width
                    tempCanvas.height = img.height
                    const ctx = tempCanvas.getContext('2d')
                    if (!ctx) {
                      resolve()
                      return
                    }
                    ctx.drawImage(img, 0, 0)
                    
                    const imageData = tempCanvas.toDataURL('image/jpeg', 0.8)
                    
                    // PDF에 이미지 추가
                    const centerX = (pageWidth - photoWidth) / 2
                    pdf.addImage(imageData, 'JPEG', centerX, yPosition, photoWidth, photoHeight)
                    
                    resolve()
                  } catch (error) {
                    console.warn('사진 처리 중 오류:', error)
                    resolve() // 오류가 있어도 계속 진행
                  }
                }
                img.onerror = () => {
                  console.warn('사진 로드 실패:', photoUrl)
                  resolve() // 실패해도 계속 진행
                }
                img.src = photoUrl
              })
            } catch (error) {
              console.warn('사진 처리 중 오류:', error)
              // 오류가 있어도 계속 진행
            }
          }
        }
      }

      // 파일명 생성
      const fileName = `폭염대비_주요활동_관리대장_${selectedDate.replace(/-/g, '')}_${project.project_name}.pdf`
      
      // 모바일 브라우저별 PDF 저장 방식 개선
      if (isMobile) {
        try {
          // iOS Safari에서는 새 창에서 PDF 열기
          if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            const pdfDataUri = pdf.output('datauristring')
            const newWindow = window.open()
            if (newWindow) {
              newWindow.document.write(`
                <html>
                  <head>
                    <title>${fileName}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  </head>
                  <body style="margin:0;">
                    <iframe src="${pdfDataUri}" 
                            style="width:100%; height:100vh; border:none;"
                            title="PDF Document">
                    </iframe>
                  </body>
                </html>
              `)
              newWindow.document.close()
            } else {
              // 팝업이 차단된 경우 기본 다운로드 시도
              pdf.save(fileName)
            }
          } 
          // Android Chrome 및 기타 모바일 브라우저
          else {
            // 먼저 기본 다운로드 시도
            try {
              pdf.save(fileName)
            } catch (e) {
              // 실패 시 Blob URL 방식
              const pdfBlob = pdf.output('blob')
              const pdfUrl = URL.createObjectURL(pdfBlob)
              
              // 새 탭에서 열기 시도
              const newTab = window.open(pdfUrl, '_blank')
              if (!newTab) {
                // 새 탭이 차단된 경우 다운로드 링크 생성
                const downloadLink = document.createElement('a')
                downloadLink.href = pdfUrl
                downloadLink.download = fileName
                downloadLink.style.display = 'none'
                document.body.appendChild(downloadLink)
                
                // 사용자 상호작용을 통한 다운로드 트리거
                setTimeout(() => {
                  downloadLink.click()
                  document.body.removeChild(downloadLink)
                  setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000)
                }, 100)
              } else {
                // 새 탭에서 열린 경우에도 URL 정리
                setTimeout(() => URL.revokeObjectURL(pdfUrl), 5000)
              }
            }
          }
        } catch (error) {
          console.error('모바일 PDF 저장 오류:', error)
          // 모든 방법이 실패한 경우 기본 방식 시도
          pdf.save(fileName)
        }
      } else {
        // 데스크톱에서는 기본 저장 방식 사용
        pdf.save(fileName)
      }

    } catch (error) {
      console.error('PDF 생성 오류:', error)
      
      // 모바일에서 더 자세한 오류 안내
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      if (isMobile) {
        alert(`PDF 저장 중 오류가 발생했습니다.\n\n모바일에서 PDF 다운로드가 안 될 경우:\n1. 브라우저 설정에서 팝업 허용\n2. 파일 다운로드 허용\n3. 다른 브라우저(Chrome, Safari) 사용 시도\n\n오류: ${error}`)
      } else {
        alert('PDF 저장 중 오류가 발생했습니다.')
      }
    } finally {
      setIsPdfGenerating(false)
    }
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
              <h1 className="text-xl font-bold text-gray-900">폭염대비 점검</h1>
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
              <h1 className="text-xl font-bold text-gray-900">폭염대비 점검</h1>
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
                {project?.project_name} - 폭염대비 점검
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
        <div className="bg-yellow-200 p-2 lg:p-6 rounded-lg shadow-lg">
          {/* 파일철 내부 */}
          <div className="bg-white rounded-lg shadow-inner min-h-[600px] relative">
            
            {/* 중앙 구분선 - 데스크톱에서는 세로선만 */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-yellow-400 hidden lg:block"></div>
            
            {/* 콘텐츠 영역 */}
            <div className="flex flex-col lg:flex-row h-full">
              {/* 상단/좌측 - 캘린더 */}
              <div className="lg:flex-1 p-2 lg:p-8 lg:pl-16 relative">
                {/* 모바일용 가로 구분선 - 캘린더 하단 */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-yellow-400 lg:hidden"></div>
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <Calendar className="h-6 w-6 text-blue-600 mr-3" />
                      <h2 className="text-xl font-semibold text-gray-900">점검 캘린더</h2>
                    </div>
                    
                    {/* 일괄 다운로드 버튼 */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setIsBulkDownloadMode(!isBulkDownloadMode)
                          if (!isBulkDownloadMode) {
                            setSelectedDates(new Set())
                          }
                        }}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isBulkDownloadMode 
                            ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                        title={isBulkDownloadMode ? "선택 모드 종료" : "여러 날짜 선택하여 일괄 다운로드"}
                      >
                        <FolderDown className="h-4 w-4 mr-1" />
                        {isBulkDownloadMode ? '취소' : '일괄'}
                      </button>
                      
                      {isBulkDownloadMode && (
                        <button
                          onClick={handleBulkDownload}
                          disabled={selectedDates.size === 0 || isBulkDownloading}
                          className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selectedDates.size === 0 || isBulkDownloading
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                          title={`선택된 ${selectedDates.size}개 날짜 다운로드`}
                        >
                          {isBulkDownloading ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-1" />
                          ) : (
                            <Download className="h-4 w-4 mr-1" />
                          )}
                          {isBulkDownloading ? '생성중' : `다운로드(${selectedDates.size})`}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* 달력 */}
                  <div className="bg-gray-50 rounded-lg p-4 flex-1">
                    {/* 달력 헤더 */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        className="p-2 hover:bg-gray-200 rounded transition-colors"
                        title="이전 달"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <h3 className="text-lg font-medium text-gray-900">
                        {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                      </h3>
                      <button
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        className="p-2 hover:bg-gray-200 rounded transition-colors"
                        title="다음 달"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* 오늘로 돌아가기 버튼 */}
                    <div className="text-center mb-4">
                      <button
                        onClick={() => setCurrentMonth(new Date())}
                        className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1 rounded hover:bg-blue-50"
                      >
                        오늘
                      </button>
                    </div>
                    
                    {/* 캘린더 그리드 */}
                    <div className="grid grid-cols-7 gap-1 text-center text-sm">
                      {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                        <div key={day} className="p-2 font-medium text-gray-600">
                          {day}
                        </div>
                      ))}
                      
                      {/* 날짜들 */}
                      {(() => {
                        const year = currentMonth.getFullYear()
                        const month = currentMonth.getMonth()
                        const firstDay = new Date(year, month, 1).getDay()
                        const daysInMonth = new Date(year, month + 1, 0).getDate()
                        const today = new Date()
                        const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
                        
                        const days = []
                        
                        // 빈 칸 추가 (월의 첫 날이 일요일이 아닌 경우)
                        for (let i = 0; i < firstDay; i++) {
                          days.push(<div key={`empty-${i}`} className="p-2"></div>)
                        }
                        
                        // 실제 날짜들
                        for (let day = 1; day <= daysInMonth; day++) {
                          // 시간대 영향을 받지 않는 로컬 날짜 문자열 생성
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                          const isToday = isCurrentMonth && day === today.getDate()
                          const hasChecks = heatwaveChecks.some(check => 
                            check.check_time.split('T')[0] === dateStr
                          )
                          
                          days.push(
                            <div
                              key={day}
                              onClick={() => {
                                if (isBulkDownloadMode) {
                                  // 일괄 다운로드 모드: 날짜 다중 선택
                                  if (hasChecks) {  // 점검 기록이 있는 날짜만 선택 가능
                                    const newSelectedDates = new Set(selectedDates)
                                    if (newSelectedDates.has(dateStr)) {
                                      newSelectedDates.delete(dateStr)
                                    } else {
                                      newSelectedDates.add(dateStr)
                                    }
                                    setSelectedDates(newSelectedDates)
                                  }
                                } else {
                                  // 일반 모드: 기존 동작 (모달 열기)
                                  if (hasChecks) {
                                    setSelectedDate(dateStr)
                                    const dayChecks = heatwaveChecks.filter(check => 
                                      check.check_time.split('T')[0] === dateStr
                                    ).sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime()) // 오름차순 정렬
                                    setSelectedDateChecks(dayChecks)
                                  }
                                }
                              }}
                              className={`p-2 rounded cursor-pointer transition-colors relative ${
                                isToday 
                                  ? 'bg-blue-500 text-white font-bold' 
                                  : isBulkDownloadMode && selectedDates.has(dateStr)
                                    ? 'bg-purple-200 text-purple-800 font-bold ring-2 ring-purple-500'
                                    : hasChecks
                                      ? 'bg-green-100 text-green-800 font-medium hover:bg-green-200'
                                      : isBulkDownloadMode && !hasChecks
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:bg-blue-100'
                              }`}
                              title={
                                isBulkDownloadMode 
                                  ? (hasChecks 
                                      ? (selectedDates.has(dateStr) ? '선택 해제' : '선택하여 다운로드에 포함')
                                      : '점검 기록이 없는 날짜')
                                  : (hasChecks ? '점검 기록 보기' : '')
                              }
                            >
                              {day}
                              {hasChecks && (
                                <div className="w-1 h-1 bg-green-500 rounded-full mx-auto mt-1"></div>
                              )}
                              {isBulkDownloadMode && selectedDates.has(dateStr) && (
                                <div className="absolute top-0 right-0 w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              )}
                            </div>
                          )
                        }
                        
                        return days
                      })()}
                    </div>
                    
                    {/* 선택된 날짜의 점검 기록 - 캘린더 위 모달 */}
                    {selectedDate && selectedDateChecks.length > 0 && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                          {/* PDF용 전체 컨테이너 */}
                          <div ref={reportRef}>
                            {/* 모달 헤더 - PDF에 포함될 제목 */}
                            <div className="relative p-4 border-b">
                              <h4 className={`${isPdfGenerating ? 'text-3xl' : 'text-lg'} font-bold text-black text-center ${isPdfGenerating ? 'mb-8' : 'mb-4'}`}>
                                폭염대비 주요활동 및 관리 대장({selectedDate.replace(/-/g, '.')})
                              </h4>
                              {/* 공사명 표기 */}
                              <div className="text-left">
                                <div className={`${isPdfGenerating ? 'text-lg' : 'text-sm'} font-medium text-gray-800`}>
                                  □ 공사명 : {project?.project_name || ''}
                                </div>
                              </div>
                              {/* PDF 저장용에는 버튼 숨김 */}
                              <div className="absolute top-4 right-4 flex space-x-2 print:hidden">
                                <button
                                  onClick={handleSavePDF}
                                  disabled={isPdfGenerating}
                                  className={`transition-colors ${
                                    isPdfGenerating 
                                      ? 'text-gray-400 cursor-not-allowed' 
                                      : 'text-blue-600 hover:text-blue-800'
                                  }`}
                                  title={isPdfGenerating ? 'PDF 생성 중...' : 'PDF로 저장'}
                                >
                                  {isPdfGenerating ? (
                                    <div className="animate-spin h-6 w-6">
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    </div>
                                  ) : (
                                    <Download className="h-6 w-6" />
                                  )}
                                </button>
                                <button
                                  onClick={() => setIsDeleteMode(!isDeleteMode)}
                                  className={`transition-colors ${
                                    isDeleteMode 
                                      ? 'text-red-600 hover:text-red-800' 
                                      : 'text-gray-600 hover:text-red-600'
                                  }`}
                                  title="삭제 모드"
                                >
                                  <Trash2 className="h-6 w-6" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedDate(null)
                                    setSelectedDateChecks([])
                                    setIsDeleteMode(false)
                                    setSelectedCheckIds(new Set())
                                  }}
                                  className="text-gray-400 hover:text-gray-600 transition-colors"
                                  title="닫기"
                                >
                                  <X className="h-6 w-6" />
                                </button>
                              </div>
                            </div>
                            
                            {/* 모달 내용 */}
                            <div className="p-4">
                        
                        <div className="overflow-x-auto">
                          <table className={`w-full border-collapse border-2 border-gray-800 ${isPdfGenerating ? 'text-sm' : 'text-xs'}`}>
                            <thead>
                              <tr className="bg-gray-200">
                                <th rowSpan={2} className={`border border-gray-800 w-20 ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                  측정<br/>시간<br/>(2시간<br/>간격)
                                </th>
                                <th rowSpan={2} className={`border border-gray-800 w-16 ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                  체감<br/>온도
                                </th>
                                <th colSpan={5} className={`border border-gray-800 ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                  5대 기본수칙(점검표)
                                </th>
                                <th rowSpan={2} className={`border border-gray-800 w-20 ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                  작업시간<br/>조정<br/>(여부)
                                </th>
                                <th rowSpan={2} className={`border border-gray-800 w-16 ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                  비고
                                </th>
                              </tr>
                              <tr className="bg-gray-200">
                                <th className={`border border-gray-800 w-12 ${isPdfGenerating ? 'p-2' : 'p-1'}`}>물</th>
                                <th className={`border border-gray-800 w-16 ${isPdfGenerating ? 'p-2' : 'p-1'}`}>바람,<br/>그늘</th>
                                <th className={`border border-gray-800 w-12 ${isPdfGenerating ? 'p-2' : 'p-1'}`}>휴식</th>
                                <th className={`border border-gray-800 w-16 ${isPdfGenerating ? 'p-2' : 'p-1'}`}>보냉<br/>장구</th>
                                <th className={`border border-gray-800 w-16 ${isPdfGenerating ? 'p-2' : 'p-1'}`}>응급<br/>조치</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedDateChecks.map((check, index) => (
                                <tr key={index}>
                                  <td className={`border border-gray-800 text-center text-blue-600 font-medium ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    {new Date(check.check_time).toLocaleTimeString('ko-KR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false
                                    })}
                                  </td>
                                  <td className={`border border-gray-800 text-center font-medium ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    {check.feels_like_temp}℃
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.water_supply ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.water_supply ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.ventilation ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.ventilation ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.rest_time ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.rest_time ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.cooling_equipment ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.cooling_equipment ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.emergency_care ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.emergency_care ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.work_time_adjustment ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.work_time_adjustment ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    {isDeleteMode && !isPdfGenerating && (
                                      <input
                                        type="checkbox"
                                        checked={selectedCheckIds.has(check.id)}
                                        onChange={(e) => {
                                          const newSelected = new Set(selectedCheckIds)
                                          if (e.target.checked) {
                                            newSelected.add(check.id)
                                          } else {
                                            newSelected.delete(check.id)
                                          }
                                          setSelectedCheckIds(newSelected)
                                        }}
                                        className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                                      />
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {/* 빈 행들 (최소 7개 행 보장) */}
                              {Array.from({ length: Math.max(0, 7 - selectedDateChecks.length) }, (_, i) => (
                                <tr key={`empty-${i}`}>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3 h-12' : 'p-2 h-8'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                            {/* 점검자 정보 배지 제거 (테이블에 이미 표시됨) */}
                            
                            {/* 확인자 서명란 */}
                            <div className="mt-8 flex justify-end">
                              <div className={`${isPdfGenerating ? 'text-base' : 'text-sm'} text-gray-800 flex items-center gap-3`}>
                                <span>확인자 :</span>
                                <span>{(() => {
                                  // 선택된 날짜의 마지막 점검자 이름 찾기
                                  const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                                  const lastInspector = sortedChecks.reverse().find(check => check.inspector_name)?.inspector_name
                                  return lastInspector || (project as any)?.user_profiles?.full_name || userProfile?.full_name || ''
                                })()}</span>
                                {(() => {
                                  // 선택된 날짜의 마지막 서명 찾기 (시간순으로 정렬 후 마지막 서명)
                                  const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                                  const lastSignature = sortedChecks.reverse().find(check => check.signature)?.signature
                                  
                                  if (lastSignature) {
                                    return (
                                      <img 
                                        src={lastSignature} 
                                        alt="서명" 
                                        className={isPdfGenerating ? "h-16" : "h-8"}
                                        style={{ width: 'auto', maxWidth: isPdfGenerating ? '240px' : '120px' }}
                                      />
                                    )
                                  } else {
                                    return <span>(서명)</span>
                                  }
                                })()}
                              </div>
                            </div>
                            
                            {/* 삭제 모드일 때 삭제 버튼 */}
                            {isDeleteMode && selectedCheckIds.size > 0 && !isPdfGenerating && (
                              <div className="mt-6 flex justify-center">
                                <button
                                  onClick={handleDeleteSelected}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  선택한 {selectedCheckIds.size}개 항목 삭제
                                </button>
                              </div>
                            )}
                            
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                  </div>
                </div>
              </div>
              
              {/* 하단/우측 - 점검표 */}
              <div className="lg:flex-1 p-2 lg:p-8 lg:pr-16 relative">
                {/* 모바일용 가로 구분선 - 점검양식 상단 */}
                <div className="absolute top-0 left-0 right-0 h-px bg-yellow-400 lg:hidden"></div>
                <div className="h-full flex flex-col">
                  <div className="flex items-center mb-6">
                    <FileText className="h-6 w-6 text-green-600 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900">점검양식</h2>
                  </div>
                  
                  {/* 점검양식 */}
                  <div className="bg-gray-50 rounded-lg p-2 lg:p-6 flex-1 overflow-auto">
                    {/* 점검양식 헤더 */}
                    <div className="text-center mb-6">
                      <h4 className="text-lg font-bold text-red-600 mb-4">
                        폭염대비 주요활동 및 관리 대장({new Date().toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '')})
                      </h4>
                      {/* 공사명 표기 */}
                      <div className="text-left mb-4">
                        <div className="text-sm font-medium text-gray-800">
                          □ 공사명 : {project?.project_name || ''}
                        </div>
                      </div>
                    </div>

                    {/* 점검표 테이블 */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border-2 border-gray-800 text-xs">
                        <thead>
                          <tr className="bg-gray-200">
                            <th rowSpan={2} className="border border-gray-800 p-2 w-20">측정<br/>시간<br/>(2시간<br/>간격)</th>
                            <th rowSpan={2} className="border border-gray-800 p-2 w-16">체감<br/>온도</th>
                            <th colSpan={5} className="border border-gray-800 p-2">5대 기본수칙(점검표)</th>
                            <th rowSpan={2} className="border border-gray-800 p-2 w-20">작업시간<br/>조정<br/>(여부)</th>
                            <th rowSpan={2} className="border border-gray-800 p-2 w-16">비고</th>
                          </tr>
                          <tr className="bg-gray-200">
                            <th className="border border-gray-800 p-1 w-12">물</th>
                            <th className="border border-gray-800 p-1 w-16">바람,<br/>그늘</th>
                            <th className="border border-gray-800 p-1 w-12">휴식</th>
                            <th className="border border-gray-800 p-1 w-16">보냉<br/>장구</th>
                            <th className="border border-gray-800 p-1 w-16">응급<br/>조치</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* 오늘 날짜의 실제 점검 기록 */}
                          {(() => {
                            // 시간대 영향 없는 오늘 날짜 문자열 생성
                            const now = new Date()
                            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                            const todayChecks = heatwaveChecks.filter(check => 
                              check.check_time.split('T')[0] === today
                            ).sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                            
                            const rows: React.ReactNode[] = []
                            
                            // 실제 점검 기록 행들
                            todayChecks.forEach((check, index) => {
                              rows.push(
                                <tr key={`check-${index}`}>
                                  <td className={`border border-gray-800 text-center text-blue-600 font-medium ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    {new Date(check.check_time).toLocaleTimeString('ko-KR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false
                                    })}
                                  </td>
                                  <td className={`border border-gray-800 text-center font-medium ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    {check.feels_like_temp}℃
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.water_supply ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.water_supply ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.ventilation ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.ventilation ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.rest_time ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.rest_time ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.cooling_equipment ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.cooling_equipment ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.emergency_care ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.emergency_care ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}>
                                    <span className={`font-bold ${check.work_time_adjustment ? 'text-green-600' : 'text-red-600'}`}>
                                      {check.work_time_adjustment ? 'O' : 'X'}
                                    </span>
                                  </td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                </tr>
                              )
                            })
                            
                            // 빈 행들 (최소 8개 행 보장)
                            const emptyRowsCount = Math.max(0, 8 - todayChecks.length)
                            for (let i = 0; i < emptyRowsCount; i++) {
                              rows.push(
                                <tr key={`empty-${i}`}>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3 h-12' : 'p-2 h-8'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                  <td className={`border border-gray-800 text-center ${isPdfGenerating ? 'p-3' : 'p-2'}`}></td>
                                </tr>
                              )
                            }
                            
                            return rows
                          })()}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* 확인자 서명란 */}
                    <div className="mt-8 flex justify-end">
                      <div className="text-sm text-gray-800 flex items-center gap-2">
                        <span>확인자 :</span>
                        <span>{(() => {
                          // 오늘 날짜의 마지막 점검자 이름 찾기
                          const now = new Date()
                          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                          const todayChecks = heatwaveChecks.filter(check => 
                            check.check_time.split('T')[0] === today
                          ).sort((a, b) => new Date(b.check_time).getTime() - new Date(a.check_time).getTime()) // 최신순 정렬
                          
                          const lastInspector = todayChecks.find(check => check.inspector_name)?.inspector_name
                          return lastInspector || (project as any)?.user_profiles?.full_name || userProfile?.full_name || ''
                        })()}</span>
                        {(() => {
                          // 오늘 날짜의 마지막 서명 찾기
                          const now = new Date()
                          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                          const todayChecks = heatwaveChecks.filter(check => 
                            check.check_time.split('T')[0] === today
                          ).sort((a, b) => new Date(b.check_time).getTime() - new Date(a.check_time).getTime()) // 최신순 정렬
                          
                          const lastSignature = todayChecks.find(check => check.signature)?.signature
                          
                          if (lastSignature) {
                            return (
                              <img 
                                src={lastSignature} 
                                alt="서명" 
                                className="h-8"
                                style={{ width: 'auto', maxWidth: '120px' }}
                              />
                            )
                          } else {
                            return <span>(서명)</span>
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* 우측 영역 가운데 + 버튼 */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                    <button
                      onClick={handleNewCheck}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <Plus className="h-8 w-8" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* PDF 생성 로딩 오버레이 */}
      {isPdfGenerating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center space-y-4 shadow-xl">
            <div className="animate-spin h-12 w-12 text-blue-600">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">PDF 보고서 생성 중</h3>
              <p className="text-sm text-gray-600">잠시만 기다려 주세요...</p>
            </div>
          </div>
        </div>
      )}

      <HeatWaveInspectionModal
        isOpen={isInspectionModalOpen}
        onClose={handleCloseInspectionModal}
        onSave={handleSaveInspection}
        projectAddress={project?.site_address}
        projectCoords={project?.latitude !== null && project?.longitude !== null && project?.latitude !== undefined && project?.longitude !== undefined ? 
          { lat: project.latitude as number, lng: project.longitude as number } : undefined
        }
      />

      {/* PDF 전용 숨김 보고서 컴포넌트 */}
      {selectedDate && selectedDateChecks.length > 0 && (
        <div 
          ref={hiddenReportRef}
          style={{ 
            display: 'none',
            position: 'absolute',
            top: '-9999px',
            left: '-9999px',
            width: '210mm',
            backgroundColor: 'white',
            padding: '20px',
            fontFamily: 'Malgun Gothic, sans-serif'
          }}
        >
          {/* PDF용 보고서 헤더 */}
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'black', marginBottom: '20px' }}>
              폭염대비 주요활동 및 관리 대장({selectedDate.replace(/-/g, '.')})
            </h1>
            <div style={{ textAlign: 'left', fontSize: '16px', fontWeight: 'bold', color: 'black' }}>
              □ 공사명 : {project?.project_name || ''}
            </div>
          </div>

          {/* PDF용 테이블 - 고정된 그리드 방식 */}
          <div style={{ 
            width: '100%', 
            border: '2px solid rgb(31, 41, 55)',
            fontSize: '12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 0.8fr 1fr 0.8fr 1fr 1fr 1.2fr 1fr'
          }}>
            {/* 첫 번째 헤더 행 */}
            <div style={{ 
              gridColumn: '1 / 2',
              gridRow: '1 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)',
              lineHeight: '1.2'
            }}>
              측정<br/>시간<br/>(2시간<br/>간격)
            </div>
            <div style={{ 
              gridColumn: '2 / 3',
              gridRow: '1 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)',
              lineHeight: '1.3'
            }}>
              체감<br/>온도
            </div>
            <div style={{ 
              gridColumn: '3 / 8',
              gridRow: '1 / 2',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '8px',
              fontSize: '13px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)'
            }}>
              5대 기본수칙(점검표)
            </div>
            <div style={{ 
              gridColumn: '8 / 9',
              gridRow: '1 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)',
              lineHeight: '1.2'
            }}>
              작업시간<br/>조정<br/>(여부)
            </div>
            <div style={{ 
              gridColumn: '9',
              gridRow: '1 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)'
            }}>
              비고
            </div>
            
            {/* 두 번째 헤더 행 */}
            <div style={{ 
              gridColumn: '3 / 4',
              gridRow: '2 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)'
            }}>물</div>
            <div style={{ 
              gridColumn: '4 / 5',
              gridRow: '2 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)',
              lineHeight: '1.3'
            }}>바람,<br/>그늘</div>
            <div style={{ 
              gridColumn: '5 / 6',
              gridRow: '2 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)'
            }}>휴식</div>
            <div style={{ 
              gridColumn: '6 / 7',
              gridRow: '2 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)',
              lineHeight: '1.3'
            }}>보냉<br/>장구</div>
            <div style={{ 
              gridColumn: '7 / 8',
              gridRow: '2 / 3',
              border: '1px solid rgb(31, 41, 55)', 
              padding: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(229, 231, 235)',
              color: 'rgb(0, 0, 0)',
              lineHeight: '1.3'
            }}>응급<br/>조치</div>
            
            {/* 데이터 행들 */}
            {selectedDateChecks.map((check, index) => (
              <React.Fragment key={index}>
                <div style={{ 
                  gridColumn: '1 / 2',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  color: 'rgb(0, 0, 0)',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {new Date(check.check_time).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })}
                </div>
                <div style={{ 
                  gridColumn: '2 / 3',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {check.feels_like_temp}℃
                </div>
                <div style={{ 
                  gridColumn: '3 / 4',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: 'rgb(0, 0, 0)'
                  }}>
                    {check.water_supply ? 'O' : 'X'}
                  </span>
                </div>
                <div style={{ 
                  gridColumn: '4 / 5',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: 'rgb(0, 0, 0)'
                  }}>
                    {check.ventilation ? 'O' : 'X'}
                  </span>
                </div>
                <div style={{ 
                  gridColumn: '5 / 6',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: 'rgb(0, 0, 0)'
                  }}>
                    {check.rest_time ? 'O' : 'X'}
                  </span>
                </div>
                <div style={{ 
                  gridColumn: '6 / 7',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: 'rgb(0, 0, 0)'
                  }}>
                    {check.cooling_equipment ? 'O' : 'X'}
                  </span>
                </div>
                <div style={{ 
                  gridColumn: '7 / 8',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: 'rgb(0, 0, 0)'
                  }}>
                    {check.emergency_care ? 'O' : 'X'}
                  </span>
                </div>
                <div style={{ 
                  gridColumn: '8 / 9',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: 'rgb(0, 0, 0)'
                  }}>
                    {check.work_time_adjustment ? 'O' : 'X'}
                  </span>
                </div>
                <div style={{ 
                  gridColumn: '9',
                  border: '1px solid rgb(31, 41, 55)', 
                  padding: '8px', 
                  height: '60px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}></div>
              </React.Fragment>
            ))}
            
            {/* 빈 행들 (최소 7개 행 보장) */}
            {Array.from({ length: Math.max(0, 7 - selectedDateChecks.length) }, (_, i) => (
              <React.Fragment key={`empty-${i}`}>
                <div style={{ gridColumn: '1 / 2', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '2 / 3', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '3 / 4', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '4 / 5', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '5 / 6', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '6 / 7', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '7 / 8', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '8 / 9', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
                <div style={{ gridColumn: '9', border: '1px solid rgb(31, 41, 55)', padding: '8px', height: '60px' }}></div>
              </React.Fragment>
            ))}
          </div>

          {/* 확인자 서명란 */}
          <div style={{ marginTop: '40px', textAlign: 'right' }}>
            <div style={{ fontSize: '14px', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '15px' }}>
              <span>확인자 :</span>
              <span>{(() => {
                const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                const lastInspector = sortedChecks.reverse().find(check => check.inspector_name)?.inspector_name
                return lastInspector || (project as any)?.user_profiles?.full_name || userProfile?.full_name || ''
              })()}</span>
              {(() => {
                const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                const lastSignature = sortedChecks.reverse().find(check => check.signature)?.signature
                
                if (lastSignature) {
                  return (
                    <img 
                      src={lastSignature} 
                      alt="서명" 
                      style={{ height: '40px', width: 'auto', maxWidth: '200px' }}
                    />
                  )
                } else {
                  return <span>(서명)</span>
                }
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 