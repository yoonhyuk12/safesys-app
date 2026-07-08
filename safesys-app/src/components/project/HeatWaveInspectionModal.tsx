'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, Thermometer, Camera, Upload, Loader2, Calendar, User, CloudSun } from 'lucide-react'
import Image from 'next/image'
import SignatureModal from './SignatureModal'

interface HeatWaveInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: HeatWaveInspectionData) => void
  projectAddress?: string
  projectCoords?: { lat: number; lng: number }
  // 수정 모드: 기존 점검값을 미리 채움 (사진은 새로 선택한 경우에만 교체)
  editData?: {
    measureDateTime: string
    temperature: string
    water: 'O' | 'X'
    wind: 'O' | 'X'
    rest: 'O' | 'X'
    cooling: 'O' | 'X'
    emergency: 'O' | 'X'
    workTime: 'O' | 'X'
    inspectorName: string
  }
}

interface HeatWaveInspectionData {
  measureDateTime: string
  temperature: string
  water: 'O' | 'X' | ''
  wind: 'O' | 'X' | ''
  rest: 'O' | 'X' | ''
  cooling: 'O' | 'X' | ''
  emergency: 'O' | 'X' | ''
  workTime: 'O' | 'X' | ''
  inspectionPhotos: File[]
  inspectorName: string
  signature?: string
}

interface StoredPhotoData {
  name: string
  type: string
  size: number
  base64: string
}

export default function HeatWaveInspectionModal({
  isOpen,
  onClose,
  onSave,
  projectAddress,
  projectCoords,
  editData
}: HeatWaveInspectionModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [weatherDetailUrl, setWeatherDetailUrl] = useState<string>('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  // 기상청에서 가져온 체감온도의 출처(주소·기준 시각) 안내 문구
  const [weatherInfo, setWeatherInfo] = useState<string>('')
  
  const [formData, setFormData] = useState<HeatWaveInspectionData>({
    measureDateTime: '',
    temperature: '',
    water: '',
    wind: '',
    rest: '',
    cooling: '',
    emergency: '',
    workTime: '',
    inspectionPhotos: [],
    inspectorName: ''
  })

  // localStorage 키
  const STORAGE_KEY = 'heatWaveInspectionDraft'

  // 파일을 Base64로 변환
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

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

  // Base64를 File로 변환
  const base64ToFile = (base64: string, name: string, type: string): File => {
    const arr = base64.split(',')
    const mime = arr[0].match(/:(.*?);/)![1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], name, { type: mime })
  }

  // 폼 데이터를 localStorage에 저장
  const saveToStorage = useCallback(async (data: HeatWaveInspectionData) => {
    try {
      let storedPhotos: StoredPhotoData[] = []
      
      // 사진이 있으면 Base64로 변환해서 저장
      if (data.inspectionPhotos.length > 0) {
        const photo = data.inspectionPhotos[0]
        const base64 = await fileToBase64(photo)
        storedPhotos = [{
          name: photo.name,
          type: photo.type,
          size: photo.size,
          base64
        }]
      }

      const dataToSave = {
        ...data,
        inspectionPhotos: [], // File 객체는 제외
        storedPhotos // Base64 데이터 추가
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
    } catch (error) {
      console.error('데이터 저장 오류:', error)
    }
  }, [])

  // localStorage에서 데이터 복원
  const loadFromStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsedData = JSON.parse(saved)
        
        // 저장된 사진이 있으면 File 객체로 복원
        let restoredPhotos: File[] = []
        if (parsedData.storedPhotos && parsedData.storedPhotos.length > 0) {
          const storedPhoto = parsedData.storedPhotos[0]
          const file = base64ToFile(storedPhoto.base64, storedPhoto.name, storedPhoto.type)
          restoredPhotos = [file]
        }

        return {
          ...parsedData,
          inspectionPhotos: restoredPhotos,
          storedPhotos: undefined // 불필요한 데이터 제거
        }
      }
    } catch (error) {
      console.error('데이터 복원 오류:', error)
    }
    return null
  }, [])

  // localStorage에서 데이터 삭제
  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('데이터 삭제 오류:', error)
    }
  }, [])

  // 기상청 상세보기 링크 생성 함수
  const fetchWeatherDetailUrl = useCallback(async () => {
    try {
      const response = await fetch('/api/weather-region-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: projectAddress,
          lat: projectCoords?.lat,
          lng: projectCoords?.lng
        })
      })

      if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        setWeatherDetailUrl(data.weatherDetailUrl)
        console.log('기상청 상세보기 링크 생성 성공:', data.weatherDetailUrl)
      } else {
        console.error('기상청 상세보기 링크 생성 실패:', data.error)
        // 실패 시에도 기본 링크 사용
        setWeatherDetailUrl(data.weatherDetailUrl || '')
      }
    } catch (error) {
      console.error('기상청 상세보기 링크 생성 오류:', error)
      // 에러 시 기본 서울 링크 사용
      const fallbackUrl = `https://www.weather.go.kr/w/theme/daily-life/regional-composite-index.do#dong/1100000000/${projectCoords?.lat || 37.5665}/${projectCoords?.lng || 126.9780}/`
      setWeatherDetailUrl(fallbackUrl)
    }
  }, [projectAddress, projectCoords])

  // 현재 시간을 안전하게 가져오는 함수
  // 현재 일시를 YYYY-MM-DDTHH:mm 형식으로 반환
  const getCurrentDateTime = () => {
    try {
      const now = new Date()
      const y = now.getFullYear()
      const m = (now.getMonth() + 1).toString().padStart(2, '0')
      const d = now.getDate().toString().padStart(2, '0')
      const hh = now.getHours().toString().padStart(2, '0')
      const mm = now.getMinutes().toString().padStart(2, '0')
      return `${y}-${m}-${d}T${hh}:${mm}`
    } catch (error) {
      console.error('현재 일시 생성 오류:', error)
      return '2025-01-01T09:00'
    }
  }

  // 모달이 열릴 때 저장된 데이터 복원 및 초기 설정
  useEffect(() => {
    if (isOpen) {
      // 이전 조회의 출처 안내 문구 초기화
      setWeatherInfo('')

      if (editData) {
        // 수정 모드: 기존 점검값으로 폼을 채움 (신규 등록 임시저장 데이터는 사용하지 않음)
        setFormData({ ...editData, inspectionPhotos: [] })

        if (projectAddress || projectCoords) {
          fetchWeatherDetailUrl()
        }
        return
      }

      // 먼저 저장된 데이터가 있는지 확인
      const savedData = loadFromStorage()

      if (savedData) {
        // 저장된 데이터가 있으면 복원하되, 측정일시·체감온도는 항상 새로 입력받음
        // (예전 임시저장 데이터의 시각·온도가 새 점검에 그대로 섞여 들어가는 것을 방지)
        setFormData({
          ...savedData,
          measureDateTime: getCurrentDateTime(),
          temperature: ''
        })
      } else {
        // 저장된 데이터가 없으면 현재 일시로 초기화
        const currentDateTime = getCurrentDateTime()

        setFormData(prev => ({
          ...prev,
          measureDateTime: currentDateTime
        }))
      }

      // 기상청 상세보기 링크 생성
      if (projectAddress || projectCoords) {
        fetchWeatherDetailUrl()
      }
    }
  }, [isOpen, projectCoords, projectAddress, fetchWeatherDetailUrl, loadFromStorage, editData])

  const handleInputChange = (field: keyof HeatWaveInspectionData, value: string) => {
    const newData = {
      ...formData,
      [field]: value
    }
    setFormData(newData)
    // 체감온도를 직접 수정하면 기상청 출처 안내는 더 이상 유효하지 않음
    if (field === 'temperature') {
      setWeatherInfo('')
    }
    // 변경사항을 즉시 저장 (수정 모드는 신규 등록 임시저장을 오염시키지 않도록 제외)
    if (!editData) {
      saveToStorage(newData)
    }
  }

  // 기상청에서 측정일시 기준 가까운 시간대의 체감온도를 가져와 자동 입력
  const fetchApparentTemperature = async () => {
    if (!projectCoords) {
      alert('현장 좌표(위도/경도)가 등록되어 있지 않아 기상청 체감온도를 가져올 수 없습니다.')
      return
    }

    try {
      setWeatherLoading(true)

      // 측정일시(YYYY-MM-DDTHH:mm) → targetDate(YYYYMMDD)/targetTime(HHmm), 없으면 현재 시각
      const dt = formData.measureDateTime
        ? new Date(formData.measureDateTime.replace('T', ' '))
        : new Date()
      const targetDate = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`
      const targetTime = `${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}`

      const response = await fetch('/api/weather-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: projectCoords.lat,
          lng: projectCoords.lng,
          targetDate,
          targetTime
        })
      })

      if (!response.ok) {
        throw new Error(`기상청 조회 실패 (${response.status})`)
      }

      const data = await response.json()
      if (data.apparentTemperature === undefined || data.apparentTemperature === null) {
        // 라우트가 내려준 구체적 사유(429 한도 초과 등)를 그대로 사용
        throw new Error(data.error || '체감온도 데이터를 가져오지 못했습니다.')
      }

      const newData = { ...formData, temperature: String(data.apparentTemperature) }
      setFormData(newData)
      saveToStorage(newData)

      // 출처 안내 문구 구성: 주소(없으면 좌표) · 기준 시각
      const matched: string | undefined = data?.apiInfo?.matchedDateTime
      const timeLabel = matched
        ? `${matched.slice(0, 4)}-${matched.slice(4, 6)}-${matched.slice(6, 8)} ${matched.slice(8, 10)}:${matched.slice(10, 12)}`
        : '현재 시각'
      const locationLabel = projectAddress
        ? projectAddress
        : `위도 ${projectCoords.lat.toFixed(4)}, 경도 ${projectCoords.lng.toFixed(4)}`
      setWeatherInfo(`📍 ${locationLabel} · ${timeLabel} 기준 기상청 공식 체감온도`)
    } catch (error) {
      console.error('기상청 체감온도 조회 오류:', error)
      alert(error instanceof Error ? error.message : '기상청 체감온도를 가져오는 중 오류가 발생했습니다. 직접 입력하거나 다시 시도해주세요.')
    } finally {
      setWeatherLoading(false)
    }
  }

  const handleOXChange = (field: keyof HeatWaveInspectionData, value: 'O' | 'X') => {
    const newData = {
      ...formData,
      [field]: value
    }
    setFormData(newData)
    // 변경사항을 즉시 저장 (수정 모드는 신규 등록 임시저장을 오염시키지 않도록 제외)
    if (!editData) {
      saveToStorage(newData)
    }
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // 파일 크기 체크 (20MB)
      if (file.size > 20 * 1024 * 1024) {
        alert(`${file.name}은(는) 20MB를 초과합니다.`)
        event.target.value = ''
        return
      }

      if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) {
        // 리사이즈 시도 (HEIC/HEIF는 그대로 사용될 수 있음)
        const resized = await resizeImageToJpeg(file, 960, 720, 0.85)
        const newData = {
          ...formData,
          inspectionPhotos: [resized]
        }
        setFormData(newData)
        if (!editData) {
          await saveToStorage(newData)
        }
      } else {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`)
      }
    }

    // 파일 input 초기화 (같은 파일 재선택 가능)
    event.target.value = ''
  }

  const removePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      inspectionPhotos: prev.inspectionPhotos.filter((_, i) => i !== index)
    }))
  }

  // 서명 처리 함수
  const handleSignatureSave = (signatureData: string) => {
    setFormData(prev => ({ ...prev, signature: signatureData }))
    setShowSignatureModal(false)
    // 서명 완료 후 자동으로 최종 제출 - 서명 데이터를 직접 전달
    handleFinalSubmit(signatureData)
  }

  const handleSubmit = () => {
    // 필수 필드 검증
    if (!formData.measureDateTime || !formData.temperature || !formData.inspectorName) {
      alert('측정일시, 체감온도, 점검자 이름은 필수 입력 항목입니다.')
      return
    }

    // 5대 기본수칙 필수 검증
    if (!formData.water || !formData.wind || !formData.rest || !formData.cooling || !formData.emergency) {
      alert('5대 기본수칙(물, 바람/그늘, 휴식, 보냉장구, 응급조치)을 모두 선택해주세요.')
      return
    }

    // 작업시간 조정 필수 검증
    if (!formData.workTime) {
      alert('작업시간 조정을 선택해주세요.')
      return
    }

    // 점검 사진 필수 검증 (수정 모드는 미선택 시 기존 사진을 유지하므로 선택 항목)
    if (!editData && formData.inspectionPhotos.length === 0) {
      alert('점검 사진을 업로드해주세요.')
      return
    }

    // 서명 모달 표시
    setShowSignatureModal(true)
  }

  const handleFinalSubmit = async (signatureData: string) => {
    setIsLoading(true)
    try {
      // 서명 데이터를 포함한 최종 데이터 생성
      const finalData = {
        ...formData,
        signature: signatureData
      }
      
      await onSave(finalData)
      
      // 성공 후 폼 초기화 및 저장된 데이터 삭제
      setFormData({
        measureDateTime: '',
        temperature: '',
        water: '',
        wind: '',
        rest: '',
        cooling: '',
        emergency: '',
        workTime: '',
        inspectionPhotos: [],
        inspectorName: ''
      })
      
      // localStorage에서 임시 저장 데이터 삭제 (수정 모드는 신규 등록 임시저장을 건드리지 않음)
      if (!editData) {
        clearStorage()
      }

      onClose()
    } catch (error) {
      console.error('저장 오류:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{editData ? '폭염대비 점검 수정' : '폭염대비 안전보건활동 점검'}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 측정일시 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                측정일시 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.measureDateTime}
                onChange={(e) => handleInputChange('measureDateTime', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              />
            </div>

            {/* 체감온도 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Thermometer className="h-4 w-4 inline mr-1" />
                체감온도 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => handleInputChange('temperature', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="예: 32.5"
                    required
                  />
                  <span className="absolute right-3 top-2 text-gray-500 text-sm">°C</span>
                </div>
                <button
                  type="button"
                  onClick={fetchApparentTemperature}
                  disabled={weatherLoading}
                  title="기상청 체감온도 가져오기 (측정일시·현장 좌표 기준)"
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 text-sm text-sky-600 border border-sky-200 rounded-md hover:bg-sky-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {weatherLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudSun className="h-4 w-4" />
                  )}
                  기상청
                </button>
              </div>
              {weatherInfo && (
                <p className="mt-1 text-xs text-sky-700">{weatherInfo}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                <a
                  href="https://www.weather.go.kr/w/index.do"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline mr-4"
                >
                  🌡️ 기상청 체감온도(실외)
                </a>
                <a
                  href="https://portal.kosha.or.kr/business-apply-search/etc-biz/season-climate/heat/sub2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  🧮 체감온도계산기
                </a>
              </p>
            </div>
          </div>

          {/* 5대 기본수칙 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">5대 기본수칙 <span className="text-red-500">*</span></h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'water', label: '물' },
                { key: 'wind', label: '바람/그늘' },
                { key: 'rest', label: '휴식', detail: '(20분/2hr, 33도 이상)' },
                { key: 'cooling', label: '보냉장구' },
                { key: 'emergency', label: '응급조치' }
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium text-gray-700">
                    {item.label}
                    {item.detail && <span className="text-xs text-gray-500 ml-1">{item.detail}</span>}
                  </span>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOXChange(item.key as keyof HeatWaveInspectionData, 'O')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        formData[item.key as keyof HeatWaveInspectionData] === 'O'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      O
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOXChange(item.key as keyof HeatWaveInspectionData, 'X')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        formData[item.key as keyof HeatWaveInspectionData] === 'X'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 작업시간 조정 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">작업시간 조정 <span className="text-red-500">*</span></h3>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="font-medium text-gray-700">작업시간 조정</span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => handleOXChange('workTime', 'O')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    formData.workTime === 'O'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  O
                </button>
                <button
                  type="button"
                  onClick={() => handleOXChange('workTime', 'X')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    formData.workTime === 'X'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  X
                </button>
              </div>
            </div>
          </div>

          {/* 점검 사진 업로드 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                <Camera className="h-5 w-5 inline mr-2" />
                점검 사진 업로드 {!editData && <span className="text-red-500">*</span>}
                <span className="text-sm text-gray-500 ml-2">{editData ? '(새로 선택하지 않으면 기존 사진 유지)' : '(근로자 휴식 사진 권장)'}</span>
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">최대 20MB</span>
                <label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                    <Upload className="h-4 w-4 mr-1" />
                    사진 선택
                  </div>
                </label>
              </div>
              <input
                id="photo-upload"
                type="file"
                accept="image/*,.heic,.HEIC"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            {/* 업로드된 사진 */}
            {formData.inspectionPhotos.length > 0 && (
              <div className="flex justify-center">
                <div className="relative">
                  <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden max-w-md">
                    <Image
                      src={URL.createObjectURL(formData.inspectionPhotos[0])}
                      alt="점검 사진"
                      width={400}
                      height={300}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(0)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="text-xs text-gray-500 mt-2 text-center truncate">
                    {formData.inspectionPhotos[0].name}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 점검자 이름 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="h-4 w-4 inline mr-1" />
              점검자 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.inspectorName}
              onChange={(e) => handleInputChange('inspectorName', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="점검자 이름을 입력하세요"
              required
            />
          </div>

          {/* 비고 섹션 제거 (기존 테이블에 notes 컬럼 없음) */}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editData ? '수정' : '제출'}
          </button>
        </div>
      </div>
      
      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <p className="text-gray-700 font-medium">제출 중입니다...</p>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSignatureSave}
        isSubmitting={isLoading}
      />
    </div>
  )
} 