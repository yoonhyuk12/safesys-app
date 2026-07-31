'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Calendar, FileText, ChevronLeft, ChevronRight, X, Download, Trash2, FolderDown, CalendarPlus, Pencil } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import HeatWaveInspectionModal from '@/components/project/HeatWaveInspectionModal'
import HeatWaveBulkRegisterModal from '@/components/project/HeatWaveBulkRegisterModal'
import { applyHtml2canvasTextFix } from '@/lib/reports/html2canvas-text-fix'

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

// heat_wave_checks 행 중 수정 모드에서 사용하는 최소 필드
interface HeatWaveCheckRow {
  id: string
  check_time: string
  feels_like_temp: number | null
  water_supply: boolean
  ventilation: boolean
  rest_time: boolean
  cooling_equipment: boolean
  emergency_care: boolean
  work_time_adjustment: boolean
  inspector_name: string | null
  photos?: string[] | null
}

// 'YYYY-MM-DD' → 'YYYY년 M월 D일 (요일)' 표기
function formatKoreanDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]
  return `${y}년 ${m}월 ${d}일 (${weekday})`
}

// 컨테이너 내 모든 이미지 로드 완료 대기 (로드 실패한 이미지는 그대로 진행)
function waitForImages(el: HTMLElement): Promise<unknown> {
  return Promise.all(
    Array.from(el.querySelectorAll('img')).map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
    )
  )
}

// HTML 문자열 삽입 전 특수문자 이스케이프 (XSS 방지)
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 사진대지 한 페이지(사진 최대 2장) HTML 생성 - 관리대장(1페이지)과 동일한 서식
function generatePhotoPageHTML(
  photos: { url: string; time: string }[],
  startIndex: number,
  pageIndex: number,
  totalPages: number,
  projectName: string,
  dateLabel: string
): string {
  const labelCell = 'border: 0.5px solid rgb(17, 24, 39); padding: 9px 8px; text-align: center; vertical-align: middle; font-weight: bold; background-color: rgb(243, 244, 246); line-height: 1.4;'
  const valueCell = 'border: 0.5px solid rgb(17, 24, 39); padding: 9px 12px; text-align: left; vertical-align: middle; line-height: 1.4;'

  const photoRows = photos.map((photo, i) => `
    <tr>
      <td style="border: 0.5px solid rgb(17, 24, 39); padding: 0;">
        <div style="height: 430px; display: flex; align-items: center; justify-content: center; background-color: rgb(249, 250, 251);">
          <img src="${escapeHtml(photo.url)}" style="max-width: 100%; max-height: 100%;" />
        </div>
        <div style="border-top: 0.5px solid rgb(17, 24, 39); background-color: rgb(243, 244, 246); padding: 7px 12px; font-size: 12px; font-weight: bold; display: flex; justify-content: space-between;">
          <span>사진 ${startIndex + i + 1}</span>
          <span>측정시간 ${escapeHtml(photo.time)}</span>
        </div>
      </td>
    </tr>`).join('')

  return `
    <div style="text-align: center; padding-bottom: 14px; border-bottom: 2px solid rgb(17, 24, 39); margin-bottom: 20px;">
      <h1 style="font-size: 26px; font-weight: bold; letter-spacing: 6px; padding-left: 6px; margin: 0;">사진대지</h1>
    </div>
    <table style="width: 100%; border-collapse: collapse; border: 1.5px solid rgb(17, 24, 39); margin-bottom: 14px; font-size: 13px; table-layout: fixed;">
      <colgroup>
        <col style="width: 16%;" /><col style="width: 36%;" /><col style="width: 16%;" /><col style="width: 32%;" />
      </colgroup>
      <tbody>
        <tr>
          <td style="${labelCell}">공 사 명</td>
          <td style="${valueCell}">${escapeHtml(projectName)}</td>
          <td style="${labelCell}">점검일자</td>
          <td style="${valueCell}">${escapeHtml(dateLabel)}</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">
      □ 체감온도 측정 및 5대 기본수칙 이행 사진
      <span style="font-weight: normal; color: rgb(107, 114, 128);">(${pageIndex + 1}/${totalPages})</span>
    </div>
    <table style="width: 100%; border-collapse: collapse; border: 1.5px solid rgb(17, 24, 39); table-layout: fixed;">
      <tbody>${photoRows}
      </tbody>
    </table>`
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
  const [editingCheck, setEditingCheck] = useState<HeatWaveCheckRow | null>(null) // 수정 모드로 열린 기존 점검 행
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
  const [isBulkRegisterMode, setIsBulkRegisterMode] = useState(false)
  const [selectedRegisterDates, setSelectedRegisterDates] = useState<Set<string>>(new Set())
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false)
  const [selectedDeleteDates, setSelectedDeleteDates] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkRegisterModalOpen, setIsBulkRegisterModalOpen] = useState(false)
  const [isBulkRegistering, setIsBulkRegistering] = useState(false)
  const [bulkRegisterProgress, setBulkRegisterProgress] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)
  const hiddenReportRef = useRef<HTMLDivElement>(null)
  const formPanelRef = useRef<HTMLDivElement>(null) // 모바일에서 날짜 선택 시 점검양식으로 스크롤

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
      return data || []

    } catch (error) {
      console.error('점검 기록 로드 실패:', error)
    }
  }



  const handleBack = () => {
    router.back()
  }

  const handleNewCheck = () => {
    setEditingCheck(null)
    setIsInspectionModalOpen(true)
  }

  const handleCloseInspectionModal = () => {
    setIsInspectionModalOpen(false)
    setEditingCheck(null)
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

      // 텔레그램 알림 발송 (발주청)
      try {
        const { data: projectTgData } = await supabase
          .from('projects')
          .select('client_telegram_id, client_app_code')
          .eq('id', projectId)
          .single()

        if (projectTgData?.client_telegram_id || projectTgData?.client_app_code) {
          const telegramMessage =
            `🌡️ <b>폭염대비점검 결과 알림</b>\n\n` +
            `🏗️ <b>현장:</b> ${project?.project_name}\n` +
            `📅 <b>측정일시:</b> ${data.measureDateTime.replace('T', ' ')}\n` +
            `👤 <b>점검자:</b> ${data.inspectorName}\n` +
            `🌡️ <b>체감온도:</b> ${data.temperature}℃\n\n` +
            `📋 <b>점검항목:</b>\n` +
            `💧 음용수 공급: ${data.water === 'O' ? '✅' : '❌'}\n` +
            `🌬️ 통풍: ${data.wind === 'O' ? '✅' : '❌'}\n` +
            `⏸️ 휴식시간: ${data.rest === 'O' ? '✅' : '❌'}\n` +
            `❄️ 냉방장치: ${data.cooling === 'O' ? '✅' : '❌'}\n` +
            `🚑 응급조치: ${data.emergency === 'O' ? '✅' : '❌'}\n` +
            `⏰ 근무시간 조정: ${data.workTime === 'O' ? '✅' : '❌'}` +
            `\n\n🔗 <a href="https://safesys.vercel.app/">안전관리시스템 바로가기</a>`

          await fetch('/api/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'direct',
              chatId: projectTgData.client_telegram_id || undefined,
              projectId,
              recipients: { client: true, contractor: false },
              message: telegramMessage
            })
          })
        }
      } catch (telegramError) {
        console.error('텔레그램 발송 오류:', telegramError)
      }

      // 저장 후 점검 기록 다시 로드
      await loadHeatwaveChecks()
      
    } catch (error) {
      console.error('점검 저장 실패:', error)
      throw error
    }
  }

  // 기존 점검 행 수정 - 사진·서명은 새로 제공된 경우에만 교체하고 나머지 값은 UPDATE
  const handleUpdateInspection = async (data: HeatWaveInspectionData) => {
    try {
      if (!user || !project || !editingCheck) {
        throw new Error('수정할 점검 정보가 없습니다')
      }

      // 사용자가 입력한 측정일시(YYYY-MM-DDTHH:mm)로 check_time 생성 (단건 등록과 동일)
      const checkTime = new Date(data.measureDateTime.replace('T', ' ') + ':00')
      const checkId = `${project.id}_${Date.now()}`
      const possibleBuckets = ['heatwave-inspections', 'inspections', 'uploads', 'files']

      // 버킷 폴백으로 파일 업로드 후 공개 URL 반환 (실패 시 null)
      const uploadToStorage = async (fileName: string, body: File | Blob): Promise<string | null> => {
        for (const bucketName of possibleBuckets) {
          try {
            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(fileName, body, { cacheControl: '3600', upsert: false })
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName)
              return publicUrl
            }
          } catch {
            continue
          }
        }
        return null
      }

      // 1. 새 사진이 선택된 경우에만 업로드 (미선택 시 기존 사진 유지)
      const photoUrls: string[] = []
      if (data.inspectionPhotos && data.inspectionPhotos.length > 0) {
        for (let i = 0; i < data.inspectionPhotos.length; i++) {
          const photo = data.inspectionPhotos[i]
          const fileExt = photo.name.split('.').pop()
          const url = await uploadToStorage(`${checkId}_photo_${i + 1}.${fileExt}`, photo)
          if (url) {
            photoUrls.push(url)
          } else {
            console.warn(`사진 ${i + 1} 업로드 실패 - 기존 사진 유지`)
          }
        }
      }

      // 2. 새 서명 업로드 (실패 시 기존 서명 유지)
      let signatureUrl: string | null = null
      if (data.signature) {
        try {
          const base64Data = data.signature.split(',')[1]
          const byteCharacters = atob(base64Data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const signatureBlob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' })
          signatureUrl = await uploadToStorage(`${checkId}_signature.png`, signatureBlob)
        } catch (error) {
          console.error('서명 처리 오류 - 기존 서명 유지:', error)
        }
      }

      // 3. UPDATE (사진·서명은 새 URL이 있을 때만 교체)
      const updatePayload: Record<string, unknown> = {
        check_time: checkTime.toLocaleString('sv-SE'),
        feels_like_temp: parseFloat(data.temperature),
        water_supply: data.water === 'O',
        ventilation: data.wind === 'O',
        rest_time: data.rest === 'O',
        cooling_equipment: data.cooling === 'O',
        emergency_care: data.emergency === 'O',
        work_time_adjustment: data.workTime === 'O',
        inspector_name: data.inspectorName
      }
      if (photoUrls.length > 0) {
        updatePayload.photos = photoUrls
      }
      if (signatureUrl) {
        updatePayload.signature = signatureUrl
      }

      const { error: updateError } = await supabase
        .from('heat_wave_checks')
        .update(updatePayload)
        .eq('id', editingCheck.id)

      if (updateError) {
        throw new Error(`수정 실패: ${updateError.message}`)
      }

      alert(`점검 기록이 수정되었습니다.\n\n일시: ${data.measureDateTime.replace('T', ' ')}\n온도: ${data.temperature}°C`)

      // 4. 목록 재조회 후 열려 있는 날짜별 표도 갱신 (날짜가 바뀐 행은 해당 날짜 표에서 제외됨)
      const fresh = await loadHeatwaveChecks()
      if (selectedDate) {
        const dayChecks = (fresh || [])
          .filter(check => String(check.check_time).split('T')[0] === selectedDate)
          .sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
        setSelectedDateChecks(dayChecks)
      }
    } catch (error) {
      console.error('점검 수정 실패:', error)
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

  // 캘린더 삭제 모드: 선택된 날짜들의 폭염 점검 기록을 일괄 삭제
  const handleBulkDeleteByDates = async () => {
    if (selectedDeleteDates.size === 0) return

    const targetIds = heatwaveChecks
      .filter(check => selectedDeleteDates.has(String(check.check_time).split('T')[0]))
      .map(check => check.id)

    if (targetIds.length === 0) {
      alert('선택한 날짜에 삭제할 점검 기록이 없습니다.')
      return
    }

    if (!confirm(`선택한 ${selectedDeleteDates.size}개 날짜의 점검 기록 ${targetIds.length}건을 삭제하시겠습니까?`)) {
      return
    }

    try {
      setIsBulkDeleting(true)
      const { error } = await supabase
        .from('heat_wave_checks')
        .delete()
        .in('id', targetIds)

      if (error) {
        console.error('일괄 삭제 오류:', error)
        alert('삭제 중 오류가 발생했습니다.')
        return
      }

      setSelectedDeleteDates(new Set())
      setIsBulkDeleteMode(false)
      await loadHeatwaveChecks()
      alert(`${targetIds.length}건의 점검 기록이 삭제되었습니다.`)
    } catch (error) {
      console.error('일괄 삭제 중 오류:', error)
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setIsBulkDeleting(false)
    }
  }


  // 렌더 동기화 유틸: 두 번의 rAF로 상태/DOM 반영을 보장
  const waitForRender = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  // 사진대지 페이지들을 PDF에 추가 - 점검 사진을 2장씩 한 페이지로 구성해 캡처
  // (generatePhotoPageHTML 내부에서 모든 외부 값을 escapeHtml 처리함)
  const addPhotoPagesToPdf = async (
    pdf: import('jspdf').jsPDF,
    html2canvas: (typeof import('html2canvas'))['default'],
    checks: Array<{ check_time: string; photos?: string[] | null }>,
    dateStr: string,
    scale: number
  ) => {
    const photoEntries = [...checks]
      .sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
      .flatMap(check => (check.photos || []).filter(Boolean).map(url => ({
        url,
        time: new Date(check.check_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      })))
    if (photoEntries.length === 0) return

    const pageWidth = 210
    const pageHeight = 297
    const margin = 15
    const maxImgHeight = pageHeight - margin * 2

    const groups: { url: string; time: string }[][] = []
    for (let i = 0; i < photoEntries.length; i += 2) {
      groups.push(photoEntries.slice(i, i + 2))
    }

    for (let g = 0; g < groups.length; g++) {
      const container = document.createElement('div')
      container.style.cssText = 'position: absolute; top: -9999px; left: -9999px; width: 210mm; background-color: white; padding: 24px 28px; font-family: "Malgun Gothic", sans-serif; color: rgb(17, 24, 39);'
      container.innerHTML = generatePhotoPageHTML(
        groups[g], g * 2, g, groups.length,
        project?.project_name || '',
        formatKoreanDateLabel(dateStr)
      )
      document.body.appendChild(container)
      try {
        await waitForImages(container)
        const canvas = await html2canvas(container, {
          scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false
        })
        // 세로가 넘치면 비율을 유지한 채 축소 (왜곡 방지)
        let imgW = pageWidth - margin * 2
        let imgH = (canvas.height * imgW) / canvas.width
        if (imgH > maxImgHeight) {
          imgW = (imgW * maxImgHeight) / imgH
          imgH = maxImgHeight
        }
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin + (pageWidth - margin * 2 - imgW) / 2, margin, imgW, imgH)
      } finally {
        document.body.removeChild(container)
      }
    }
  }

  // 일괄 다운로드 함수 - 기존 handleSavePDF 함수를 그대로 활용하여 여러 날짜 순차 생성
  const handleBulkDownload = async () => {
    if (selectedDates.size === 0) {
      alert('다운로드할 날짜를 선택해주세요.')
      return
    }

    if (!project) return

    setIsBulkDownloading(true)
    const restoreTextFix = applyHtml2canvasTextFix()
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
          // 캡처 대상(hiddenReportRef)은 인라인 스타일로 완결되어 있어
          // 전역 th/td 강제 규칙을 주입하면 오히려 보고서 디자인이 깨진다.
          const style = clonedDoc.createElement('style')
          style.textContent = `
            * {
              box-sizing: border-box !important;
            }
            body {
              margin: 0 !important;
              background: white !important;
              font-family: 'Malgun Gothic', sans-serif !important;
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

          // 사진대지 페이지 추가 (HTML 템플릿을 캡처해 관리대장과 동일한 서식 유지)
          await addPhotoPagesToPdf(pdf, html2canvas, dayChecks, date, isMobile ? 1.5 : 2)

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
      restoreTextFix()
      setIsBulkDownloading(false)
    }
  }

  // 일괄 등록 함수 - 선택된 날짜들에 기상청 시간별 체감온도로 점검 기록을 일괄 생성
  const handleBulkRegister = async (data: { hours: number[]; inspectorName: string; signature: string }) => {
    if (!user || !project) {
      throw new Error('사용자 또는 프로젝트 정보가 없습니다')
    }
    if (!projectCoords) {
      throw new Error('현장 좌표(위도·경도)가 등록되어 있지 않아 기상청 체감온도를 조회할 수 없습니다.')
    }

    const dates = Array.from(selectedRegisterDates).sort()
    const hours = data.hours
    const total = dates.length

    setIsBulkRegistering(true)
    try {
      // 1. 날짜별 기상청 시간별 체감온도 조회 (순차 — Vercel 함수 타임아웃 회피)
      const feelsByDate = new Map<string, Map<number, number>>() // date -> (hour -> 체감온도)
      const missing: string[] = [] // 'M월 D일 HH시' 형태 미확보 목록
      let lastFetchError = '' // 미확보 사유 안내용 (마지막 실패 사유)
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i]
        setBulkRegisterProgress(`체감온도 조회 중 (${i + 1}/${total}) · ${date}`)
        const hourMap = new Map<number, number>()
        try {
          const res = await fetch('/api/weather/hourly-feels-like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: projectCoords.lat, lng: projectCoords.lng, date, hours })
          })
          const json = await res.json()
          if (json?.error) {
            lastFetchError = String(json.error)
          }
          if (Array.isArray(json?.results)) {
            for (const r of json.results) {
              if (r.apparentTemperature != null) {
                hourMap.set(r.hour, r.apparentTemperature)
              }
            }
          }
        } catch (e) {
          lastFetchError = e instanceof Error ? e.message : String(e)
          console.error('시간별 체감온도 조회 실패:', date, e)
        }
        feelsByDate.set(date, hourMap)
        // 체감온도를 얻지 못한 시각은 미확보로 집계
        const [, mm, dd] = date.split('-')
        for (const h of hours) {
          if (!hourMap.has(h)) {
            missing.push(`${Number(mm)}월 ${Number(dd)}일 ${String(h).padStart(2, '0')}시`)
          }
        }
      }

      // 2. 기존 기록 조회 (선택 날짜 최소~최대 범위) — 같은 날짜·같은 시(hour)는 건너뜀
      setBulkRegisterProgress('기존 기록 확인 중...')
      const minDate = dates[0]
      const maxDate = dates[dates.length - 1]
      const existing = new Set<string>() // `${date} ${hour}` 키
      const { data: existingRows, error: existingErr } = await supabase
        .from('heat_wave_checks')
        .select('check_time')
        .eq('project_id', project.id)
        .gte('check_time', `${minDate} 00:00:00`)
        .lte('check_time', `${maxDate} 23:59:59`)
      if (existingErr) {
        throw new Error(`기존 기록 조회 실패: ${existingErr.message}`)
      }
      for (const row of existingRows || []) {
        // check_time은 로컬 벽시계 문자열(타임존 없음) — 재파싱 없이 문자열에서 날짜·시 추출
        const ct = String(row.check_time).replace('T', ' ')
        const dStr = ct.slice(0, 10)
        const hour = Number(ct.slice(11, 13))
        existing.add(`${dStr} ${hour}`)
      }

      // 3. 서명 1회 업로드 (모든 행이 같은 URL 공유) — 단건 등록의 버킷 폴백 목록 재사용
      setBulkRegisterProgress('서명 저장 중...')
      let signatureUrl: string | null = null
      try {
        const base64Data = data.signature.split(',')[1]
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const signatureBlob = new Blob([byteArray], { type: 'image/png' })
        const signatureFileName = `${project.id}_${Date.now()}_bulk_signature.png`
        const possibleBuckets = ['heatwave-inspections', 'inspections', 'uploads', 'files']
        for (const bucketName of possibleBuckets) {
          try {
            const { error: sigErr } = await supabase.storage
              .from(bucketName)
              .upload(signatureFileName, signatureBlob, { cacheControl: '3600', upsert: false })
            if (!sigErr) {
              const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(signatureFileName)
              signatureUrl = publicUrl
              break
            }
          } catch {
            continue
          }
        }
      } catch (e) {
        // 서명 업로드 실패는 관대 처리 (단건 등록과 동일) — signatureUrl null로 진행
        console.error('서명 업로드 오류:', e)
      }

      // 4. 등록 행 구성 — 체감온도가 있고, 기존 기록과 겹치지 않는 (날짜,시각)만
      type BulkRow = {
        project_id: string
        created_by: string
        check_time: string
        feels_like_temp: number
        water_supply: boolean
        ventilation: boolean
        rest_time: boolean
        cooling_equipment: boolean
        emergency_care: boolean
        work_time_adjustment: boolean
        photos: null
        signature: string | null
        inspector_name: string
      }
      const rows: BulkRow[] = []
      let duplicateCount = 0
      for (const date of dates) {
        const hourMap = feelsByDate.get(date) || new Map<number, number>()
        for (const hour of hours) {
          const temp = hourMap.get(hour)
          if (temp == null) continue // 체감온도 미확보 (missing에 이미 집계)
          if (existing.has(`${date} ${hour}`)) {
            duplicateCount++
            continue
          }
          rows.push({
            project_id: project.id,
            created_by: user.id,
            check_time: `${date} ${String(hour).padStart(2, '0')}:00:00`,
            feels_like_temp: temp,
            water_supply: true,
            ventilation: true,
            rest_time: true,
            cooling_equipment: true,
            emergency_care: true,
            work_time_adjustment: true,
            photos: null,
            signature: signatureUrl,
            inspector_name: data.inspectorName
          })
        }
      }

      // 5. 일괄 insert
      let insertedCount = 0
      if (rows.length > 0) {
        setBulkRegisterProgress(`등록 중... (${rows.length}건)`)
        const { error: insertError } = await supabase.from('heat_wave_checks').insert(rows)
        if (insertError) {
          throw new Error(`일괄 등록 실패: ${insertError.message}`)
        }
        insertedCount = rows.length
      }

      // 6. 결과 요약 (텔레그램 알림은 발송하지 않음)
      let summary = `일괄 등록 완료\n\n등록: ${insertedCount}건`
      if (duplicateCount > 0) summary += `\n기존 기록과 겹쳐 건너뜀: ${duplicateCount}건`
      if (missing.length > 0) {
        const preview = missing.slice(0, 10).join(', ')
        summary += `\n체감온도 미확보: ${missing.length}건\n(${preview}${missing.length > 10 ? ' 외' : ''})`
        if (lastFetchError) {
          summary += `\n미확보 사유: ${lastFetchError}`
        }
      }
      alert(summary)

      // 7. 목록 재조회 및 모드·선택 초기화
      await loadHeatwaveChecks()
      setIsBulkRegisterMode(false)
      setSelectedRegisterDates(new Set())
      setIsBulkRegisterModalOpen(false)
    } finally {
      setIsBulkRegistering(false)
      setBulkRegisterProgress('')
    }
  }

  // PDF 저장 함수
  const handleSavePDF = async () => {
    if (!hiddenReportRef.current || !selectedDate || !project) return

    setIsPdfGenerating(true)
    const restoreTextFix = applyHtml2canvasTextFix()
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
          // 캡처 대상(hiddenReportRef)은 인라인 스타일로 완결되어 있어
          // 전역 th/td 강제 규칙을 주입하면 오히려 보고서 디자인이 깨진다.
          const style = clonedDoc.createElement('style')
          style.textContent = `
            * {
              box-sizing: border-box !important;
            }
            body {
              margin: 0 !important;
              background: white !important;
              font-family: 'Malgun Gothic', sans-serif !important;
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

      // 사진대지 페이지 추가 (HTML 템플릿을 캡처해 관리대장과 동일한 서식 유지)
      await addPhotoPagesToPdf(pdf, html2canvas, selectedDateChecks, selectedDate, isMobile ? 1.5 : 2)

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
      restoreTextFix()
      setIsPdfGenerating(false)
    }
  }

  // 점검 모달에 전달할 좌표 객체 - 렌더마다 새 객체가 생성되면
  // 모달의 useEffect가 매 리렌더링마다 재실행되어 기상청 API가 불필요하게 반복 호출됨
  const projectCoords = useMemo(() => {
    if (project?.latitude == null || project?.longitude == null) return undefined
    return { lat: project.latitude as number, lng: project.longitude as number }
  }, [project?.latitude, project?.longitude])

  // 수정 모드 초기값 - useMemo로 참조를 고정해 모달 useEffect가 렌더마다 재실행되는 것을 방지
  const heatwaveEditData = useMemo(() => {
    if (!editingCheck) return undefined
    return {
      measureDateTime: String(editingCheck.check_time).replace(' ', 'T').slice(0, 16),
      temperature: editingCheck.feels_like_temp != null ? String(editingCheck.feels_like_temp) : '',
      water: (editingCheck.water_supply ? 'O' : 'X') as 'O' | 'X',
      wind: (editingCheck.ventilation ? 'O' : 'X') as 'O' | 'X',
      rest: (editingCheck.rest_time ? 'O' : 'X') as 'O' | 'X',
      cooling: (editingCheck.cooling_equipment ? 'O' : 'X') as 'O' | 'X',
      emergency: (editingCheck.emergency_care ? 'O' : 'X') as 'O' | 'X',
      workTime: (editingCheck.work_time_adjustment ? 'O' : 'X') as 'O' | 'X',
      inspectorName: editingCheck.inspector_name || '',
      photoUrl: editingCheck.photos?.[0] || undefined
    }
  }, [editingCheck])

  // 오늘 등록된 점검 기록 - 없으면 우측 패널에 대장양식 대신 + 버튼만 표시
  const hasTodayChecks = useMemo(() => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return heatwaveChecks.some(check => check.check_time.split('T')[0] === today)
  }, [heatwaveChecks])

  // PDF 보고서(hiddenReportRef) 공통 셀 스타일
  const pdfLabelCell: React.CSSProperties = {
    border: '0.5px solid rgb(17, 24, 39)',
    padding: '9px 8px',
    textAlign: 'center',
    verticalAlign: 'middle',
    fontWeight: 'bold',
    backgroundColor: 'rgb(243, 244, 246)',
    color: 'rgb(17, 24, 39)',
    lineHeight: 1.4
  }
  const pdfValueCell: React.CSSProperties = {
    border: '0.5px solid rgb(17, 24, 39)',
    padding: '9px 12px',
    textAlign: 'left',
    verticalAlign: 'middle',
    color: 'rgb(17, 24, 39)',
    lineHeight: 1.4
  }
  const pdfHeadCell: React.CSSProperties = {
    border: '0.5px solid rgb(17, 24, 39)',
    padding: '8px 4px',
    textAlign: 'center',
    verticalAlign: 'middle',
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: 'rgb(243, 244, 246)',
    color: 'rgb(17, 24, 39)',
    lineHeight: 1.4
  }
  const pdfBodyCell: React.CSSProperties = {
    border: '0.5px solid rgb(17, 24, 39)',
    padding: '6px 4px',
    height: '42px',
    textAlign: 'center',
    verticalAlign: 'middle',
    color: 'rgb(17, 24, 39)',
    lineHeight: 1.4
  }
  // 이행여부 ○/× 표기 (미이행은 적색으로 강조)
  const renderPdfMark = (ok: boolean) => (
    <span style={{ fontWeight: 'bold', fontSize: '15px', color: ok ? 'rgb(17, 24, 39)' : 'rgb(220, 38, 38)' }}>
      {ok ? '○' : '×'}
    </span>
  )

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
                    
                    {/* 일괄 등록·다운로드 버튼 */}
                    <div className="flex items-center space-x-2">
                      {/* 삭제 모드 토글 (활성 시 일괄 등록·다운로드 버튼 숨김) */}
                      <button
                        onClick={() => {
                          const next = !isBulkDeleteMode
                          setIsBulkDeleteMode(next)
                          setSelectedDeleteDates(new Set())
                          if (next) {
                            setIsBulkRegisterMode(false)
                            setSelectedRegisterDates(new Set())
                            setIsBulkDownloadMode(false)
                            setSelectedDates(new Set())
                          }
                        }}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isBulkDeleteMode
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600'
                        }`}
                        title={isBulkDeleteMode ? '삭제 모드 종료' : '삭제할 날짜를 선택해 점검 기록 일괄 삭제'}
                      >
                        <Trash2 className="h-4 w-4" />
                        {isBulkDeleteMode && <span className="ml-1">취소</span>}
                      </button>

                      {isBulkDeleteMode && selectedDeleteDates.size > 0 && (
                        <button
                          onClick={handleBulkDeleteByDates}
                          disabled={isBulkDeleting}
                          className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isBulkDeleting
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          title={`선택된 ${selectedDeleteDates.size}개 날짜 삭제`}
                        >
                          {isBulkDeleting ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-1" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-1" />
                          )}
                          {isBulkDeleting ? '삭제중' : `삭제(${selectedDeleteDates.size})`}
                        </button>
                      )}

                      {!isBulkDeleteMode && (
                      <>
                      {/* 일괄 등록 토글 (일괄 다운로드와 상호 배타) */}
                      <button
                        onClick={() => {
                          const next = !isBulkRegisterMode
                          setIsBulkRegisterMode(next)
                          setSelectedRegisterDates(new Set())
                          if (next) {
                            setIsBulkDownloadMode(false)
                            setSelectedDates(new Set())
                          }
                        }}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isBulkRegisterMode
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                        title={isBulkRegisterMode ? "일괄 등록 모드 종료" : "여러 날짜를 선택해 기상청 체감온도로 일괄 등록"}
                      >
                        <CalendarPlus className="h-4 w-4 mr-1" />
                        {isBulkRegisterMode ? '취소' : '일괄 등록'}
                      </button>

                      {isBulkRegisterMode && selectedRegisterDates.size > 0 && (
                        <button
                          onClick={() => setIsBulkRegisterModalOpen(true)}
                          className="flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
                          title={`선택된 ${selectedRegisterDates.size}개 날짜 일괄 등록`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          등록({selectedRegisterDates.size})
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setIsBulkDownloadMode(!isBulkDownloadMode)
                          if (!isBulkDownloadMode) {
                            setSelectedDates(new Set())
                            setIsBulkRegisterMode(false)
                            setSelectedRegisterDates(new Set())
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
                      </>
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
                        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
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
                                if (isBulkDeleteMode) {
                                  // 삭제 모드(최우선): 점검 기록이 있는 날짜만 다중 선택
                                  if (!hasChecks) return
                                  const next = new Set(selectedDeleteDates)
                                  if (next.has(dateStr)) {
                                    next.delete(dateStr)
                                  } else {
                                    next.add(dateStr)
                                  }
                                  setSelectedDeleteDates(next)
                                } else if (isBulkRegisterMode) {
                                  // 일괄 등록 모드: 오늘 이하 날짜만 다중 선택 (미래는 관측값 없음)
                                  if (dateStr > todayStr) return
                                  const next = new Set(selectedRegisterDates)
                                  if (next.has(dateStr)) {
                                    next.delete(dateStr)
                                  } else {
                                    next.add(dateStr)
                                  }
                                  setSelectedRegisterDates(next)
                                } else if (isBulkDownloadMode) {
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
                                  // 일반 모드: 우측 점검양식 영역에 해당 날짜 기록 표시
                                  if (hasChecks) {
                                    setSelectedDate(dateStr)
                                    const dayChecks = heatwaveChecks.filter(check =>
                                      check.check_time.split('T')[0] === dateStr
                                    ).sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime()) // 오름차순 정렬
                                    setSelectedDateChecks(dayChecks)
                                    // 모바일에서는 점검양식이 캘린더 아래에 있어 화면 밖이므로 이동
                                    if (window.innerWidth < 1024) {
                                      formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }
                                  }
                                }
                              }}
                              className={`p-2 rounded cursor-pointer transition-colors relative ${
                                isBulkDeleteMode
                                  ? (selectedDeleteDates.has(dateStr)
                                      ? 'bg-red-200 text-red-900 font-bold ring-2 ring-red-500'
                                      : hasChecks
                                        ? 'bg-green-100 text-green-800 font-medium hover:bg-red-100'
                                        : 'opacity-50 cursor-not-allowed')
                                  : isBulkRegisterMode
                                  ? (selectedRegisterDates.has(dateStr)
                                      ? 'bg-amber-200 text-amber-900 font-bold ring-2 ring-amber-500'
                                      : dateStr > todayStr
                                        ? 'opacity-50 cursor-not-allowed'
                                        : hasChecks
                                          ? 'bg-green-100 text-green-800 font-medium hover:bg-amber-100'
                                          : 'hover:bg-amber-100')
                                  : isToday
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
                                isBulkDeleteMode
                                  ? (hasChecks
                                      ? (selectedDeleteDates.has(dateStr) ? '선택 해제' : '선택하여 삭제에 포함')
                                      : '점검 기록이 없는 날짜')
                                  : isBulkRegisterMode
                                  ? (dateStr > todayStr
                                      ? '미래 날짜는 등록할 수 없습니다'
                                      : (selectedRegisterDates.has(dateStr) ? '선택 해제' : '선택하여 일괄 등록에 포함'))
                                  : isBulkDownloadMode
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
                              {isBulkRegisterMode && selectedRegisterDates.has(dateStr) && (
                                <div className="absolute top-0 right-0 w-4 h-4 bg-amber-600 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              )}
                              {isBulkDeleteMode && selectedDeleteDates.has(dateStr) && (
                                <div className="absolute top-0 right-0 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              )}
                            </div>
                          )
                        }
                        
                        return days
                      })()}
                    </div>

                    {/* 법적 근거 (일자 무관 항상 최신 법령으로 연결) */}
                    <div className="mt-4 pt-3 border-t border-gray-200 text-center">
                      <a
                        href="https://www.law.go.kr/법령/산업안전보건기준에관한규칙/제562조"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        법적 근거: 산업안전보건기준에 관한 규칙 제562조(고열·폭염장해 예방 조치)
                      </a>
                      <div className="mt-1">
                        <a
                          href="https://drive.google.com/file/d/165bisacZVv-9mxDad5L82iYok2-wiWR9/view?usp=sharing"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          26년 폭염조치사항
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
              
              {/* 하단/우측 - 점검표 */}
              <div ref={formPanelRef} className="lg:flex-1 p-2 lg:p-8 lg:pr-6 relative">
                {/* 모바일용 가로 구분선 - 점검양식 상단 */}
                <div className="absolute top-0 left-0 right-0 h-px bg-yellow-400 lg:hidden"></div>
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <FileText className="h-6 w-6 text-green-600 mr-3" />
                      <h2 className="text-xl font-semibold text-gray-900">점검양식</h2>
                    </div>
                    {/* 점검 기록 표시 중에만 노출되는 버튼행 (PDF 저장용에는 숨김) */}
                    {selectedDate && selectedDateChecks.length > 0 && (
                      <div className="flex items-center space-x-2 print:hidden">
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
                    )}
                  </div>
                  
                  {/* 점검양식 */}
                  <div className="bg-gray-50 rounded-lg p-2 lg:p-4 flex-1 overflow-auto">
                    {/* 날짜 선택 시 해당 날짜 점검 기록, 아니면 오늘 점검양식 (오늘 기록이 없으면 + 버튼만) */}
                    {selectedDate && selectedDateChecks.length > 0 ? (
                      <div ref={reportRef}>
                        {/* 점검 기록 헤더 - PDF에 포함될 제목 */}
                        <div className="py-4 border-b">
                          <h4 className={`${isPdfGenerating ? 'text-3xl' : 'text-lg'} font-bold text-black text-center ${isPdfGenerating ? 'mb-8' : 'mb-4'}`}>
                            폭염대비 주요활동 및 관리 대장({selectedDate.replace(/-/g, '.')})
                          </h4>
                          {/* 공사명 표기 */}
                          <div className="text-left">
                            <div className={`${isPdfGenerating ? 'text-lg' : 'text-sm'} font-medium text-gray-800`}>
                              □ 공사명 : {project?.project_name || ''}
                            </div>
                          </div>
                        </div>

                        {/* 점검 기록 내용 */}
                        <div className="py-4">
                    
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
                            <tr
                              key={index}
                              onClick={() => {
                                // 삭제 모드·PDF 생성 중에는 행 클릭 수정 비활성화
                                if (isDeleteMode || isPdfGenerating) return
                                setEditingCheck(check)
                                setIsInspectionModalOpen(true)
                              }}
                              className={!isDeleteMode && !isPdfGenerating ? 'cursor-pointer hover:bg-blue-50' : ''}
                              title={!isDeleteMode && !isPdfGenerating ? '클릭하여 점검 기록 수정' : undefined}
                            >
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
                                {!isDeleteMode && !isPdfGenerating && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingCheck(check)
                                      setIsInspectionModalOpen(true)
                                    }}
                                    className="text-gray-400 hover:text-blue-600 transition-colors"
                                    title="점검 기록 수정"
                                  >
                                    <Pencil className="h-4 w-4 mx-auto" />
                                  </button>
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
                    ) : hasTodayChecks ? (
                      <>
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
                      <table className="w-full min-w-[720px] lg:min-w-0 border-collapse border-2 border-gray-800 text-xs">
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
                      </>
                    ) : null}
                  </div>
                  
                  {/* 우측 영역 가운데 + 버튼 (발주청 포함 전 역할 등록 가능)
                      - 점검 기록 표시 중에는 행 클릭(수정)을 가리므로 숨김 */}
                  {!(selectedDate && selectedDateChecks.length > 0) && (
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-3">
                    <button
                      onClick={handleNewCheck}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <Plus className="h-8 w-8" />
                    </button>
                    {/* 대장양식이 비어 있을 때만 안내 문구 (양식 위에 겹쳐 쓰지 않음) */}
                    {!hasTodayChecks && (
                      <span className="text-sm font-medium text-gray-600">점검 결과 입력하기</span>
                    )}
                  </div>
                  )}
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

      {/* 일괄 등록 진행 오버레이 (서명 모달보다 위) */}
      {isBulkRegistering && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center space-y-4 shadow-xl">
            <div className="animate-spin h-12 w-12 text-amber-600">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">일괄 등록 진행 중</h3>
              <p className="text-sm text-gray-600">{bulkRegisterProgress || '잠시만 기다려 주세요...'}</p>
            </div>
          </div>
        </div>
      )}

      <HeatWaveInspectionModal
        isOpen={isInspectionModalOpen}
        onClose={handleCloseInspectionModal}
        onSave={editingCheck ? handleUpdateInspection : handleSaveInspection}
        projectAddress={project?.site_address}
        projectCoords={projectCoords}
        editData={heatwaveEditData}
      />

      <HeatWaveBulkRegisterModal
        isOpen={isBulkRegisterModalOpen}
        onClose={() => setIsBulkRegisterModalOpen(false)}
        dates={Array.from(selectedRegisterDates).sort()}
        onSave={handleBulkRegister}
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
            padding: '24px 28px',
            fontFamily: 'Malgun Gothic, sans-serif',
            color: 'rgb(17, 24, 39)'
          }}
        >
          {/* 보고서 제목 */}
          <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '2px solid rgb(17, 24, 39)', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 'bold', letterSpacing: '6px', paddingLeft: '6px', margin: 0, color: 'rgb(17, 24, 39)' }}>
              폭염대비 주요활동 및 관리대장
            </h1>
          </div>

          {/* 기본정보 */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid rgb(17, 24, 39)', marginBottom: '18px', fontSize: '13px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '36%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '32%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td style={pdfLabelCell}>공 사 명</td>
                <td colSpan={3} style={pdfValueCell}>{project?.project_name || ''}</td>
              </tr>
              <tr>
                <td style={pdfLabelCell}>점검일자</td>
                <td style={pdfValueCell}>{formatKoreanDateLabel(selectedDate)}</td>
                <td style={pdfLabelCell}>확 인 자</td>
                <td style={pdfValueCell}>{(() => {
                  const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                  const lastInspector = sortedChecks.reverse().find(check => check.inspector_name)?.inspector_name
                  return lastInspector || (project as any)?.user_profiles?.full_name || userProfile?.full_name || ''
                })()}</td>
              </tr>
            </tbody>
          </table>

          {/* 점검결과 표 */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid rgb(17, 24, 39)', fontSize: '13px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={pdfHeadCell}>측정시간<br /><span style={{ fontSize: '10px', fontWeight: 'normal', color: 'rgb(75, 85, 99)' }}>(2시간 간격)</span></th>
                <th rowSpan={2} style={pdfHeadCell}>체감온도</th>
                <th colSpan={5} style={pdfHeadCell}>5대 기본수칙 이행여부</th>
                <th rowSpan={2} style={pdfHeadCell}>작업시간<br />조정여부</th>
                <th rowSpan={2} style={pdfHeadCell}>비고</th>
              </tr>
              <tr>
                <th style={pdfHeadCell}>물</th>
                <th style={pdfHeadCell}>바람·그늘</th>
                <th style={pdfHeadCell}>휴식</th>
                <th style={pdfHeadCell}>보냉장구</th>
                <th style={pdfHeadCell}>응급조치</th>
              </tr>
            </thead>
            <tbody>
            
              {/* 데이터 행들 */}
              {selectedDateChecks.map((check, index) => (
                <tr key={index}>
                  <td style={{ ...pdfBodyCell, fontWeight: 'bold' }}>
                    {new Date(check.check_time).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </td>
                  <td style={{ ...pdfBodyCell, fontWeight: 'bold', color: Number(check.feels_like_temp) >= 33 ? 'rgb(220, 38, 38)' : 'rgb(17, 24, 39)' }}>
                    {check.feels_like_temp}℃
                  </td>
                  <td style={pdfBodyCell}>{renderPdfMark(check.water_supply)}</td>
                  <td style={pdfBodyCell}>{renderPdfMark(check.ventilation)}</td>
                  <td style={pdfBodyCell}>{renderPdfMark(check.rest_time)}</td>
                  <td style={pdfBodyCell}>{renderPdfMark(check.cooling_equipment)}</td>
                  <td style={pdfBodyCell}>{renderPdfMark(check.emergency_care)}</td>
                  <td style={pdfBodyCell}>{renderPdfMark(check.work_time_adjustment)}</td>
                  <td style={pdfBodyCell}></td>
                </tr>
              ))}
            
              {/* 빈 행들 (최소 7개 행 보장) */}
              {Array.from({ length: Math.max(0, 7 - selectedDateChecks.length) }, (_, i) => (
                <tr key={`empty-${i}`}>
                  {Array.from({ length: 9 }, (_, col) => (
                    <td key={col} style={pdfBodyCell}></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 범례 */}
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'rgb(107, 114, 128)', lineHeight: 1.6 }}>
            ※ 표기 : ○ 이행, × 미이행 · 체감온도 33℃ 이상은 적색 표시 (온열질환 발생 주의)
          </div>

          {/* 확인자 서명란 */}
          <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px', fontSize: '14px', color: 'rgb(17, 24, 39)' }}>
            <span style={{ fontWeight: 'bold' }}>확인자 :</span>
            <span>{(() => {
              const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
              const lastInspector = sortedChecks.reverse().find(check => check.inspector_name)?.inspector_name
              return lastInspector || (project as any)?.user_profiles?.full_name || userProfile?.full_name || ''
            })()}</span>
            <span style={{ position: 'relative', display: 'inline-block', width: '110px', textAlign: 'center', color: 'rgb(156, 163, 175)' }}>
              (서명)
              {(() => {
                const sortedChecks = [...selectedDateChecks].sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime())
                const lastSignature = sortedChecks.reverse().find(check => check.signature)?.signature
                if (!lastSignature) return null
                return (
                  <img
                    src={lastSignature}
                    alt="서명"
                    style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxHeight: '44px', maxWidth: '110px' }}
                  />
                )
              })()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
} 