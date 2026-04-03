'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import html2canvas from 'html2canvas'
import {
  Shield, AlertTriangle, Wrench, FileText,
  Clock, Users, Truck, AlertOctagon, Loader2, X, Download, Globe, ChevronDown, Copy, Check
} from 'lucide-react'

interface TBMViewData {
  id: string
  project_name: string
  meeting_date: string
  education_start_time?: string
  education_end_time?: string
  today_work?: string
  potential_risk_1?: string
  solution_1?: string
  potential_risk_2?: string
  solution_2?: string
  potential_risk_3?: string
  solution_3?: string
  main_risk_selection?: string
  main_risk_solution?: string
  risk_factor_1?: string
  risk_factor_2?: string
  risk_factor_3?: string
  other_remarks?: string
  personnel_count?: string
  equipment_input?: string
  risk_work_type?: string
}

const languageOptions = [
  { value: 'ko', label: '🇰🇷 한국어 (Korean)' },
  { value: 'en', label: '🇺🇸 English (영어)' },
  { value: 'ja', label: '🇯🇵 日本語 (일본어)' },
  { value: 'zh-cn', label: '🇨🇳 中文简体 (중국어 간체)' },
  { value: 'zh-tw', label: '🇹🇼 中文繁體 (중국어 번체)' },
  { value: 'vi', label: '🇻🇳 Tiếng Việt (베트남어)' },
  { value: 'th', label: '🇹🇭 ภาษาไทย (태국어)' },
  { value: 'id', label: '🇮🇩 Bahasa Indonesia (인도네시아어)' },
  { value: 'tl', label: '🇵🇭 Tagalog (필리핀어)' },
  { value: 'my', label: '🇲🇲 မြန်မာ (미얀마어)' },
  { value: 'km', label: '🇰🇭 ភាសាខ្មែរ (캄보디아어)' },
  { value: 'ne', label: '🇳🇵 नेपाली (네팔어)' },
  { value: 'uz', label: "🇺🇿 O'zbek (우즈베키스탄어)" },
  { value: 'mn', label: '🇲🇳 Монгол (몽골어)' },
  { value: 'ru', label: '🇷🇺 Русский (러시아어)' },
]

export default function TBMViewPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<TBMViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // TTS 상태
  const [selectedLanguage, setSelectedLanguage] = useState('ko')
  const [ttsLoading, setTtsLoading] = useState(false)
  const [showTtsModal, setShowTtsModal] = useState(false)
  const [translatedText, setTranslatedText] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  // 페이지 번역 상태 (TTS와 별도)
  const [pageLang, setPageLang] = useState('ko')
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const langDropdownRef = useRef<HTMLDivElement>(null)
  const [translatedData, setTranslatedData] = useState<Record<string, string> | null>(null)
  const [translating, setTranslating] = useState(false)
  const translateCache = useRef<Record<string, Record<string, string>>>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [floatingRight, setFloatingRight] = useState<number | null>(null)

  // 내용 영역(max-w-lg) 우측 끝 위치 추적
  useEffect(() => {
    const updatePosition = () => {
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect()
        setFloatingRight(window.innerWidth - rect.right + 8)
      }
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [data])

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  // 번역된 데이터가 있으면 해당 키의 번역을 반환, 없으면 원문 반환
  const t = (key: string, fallback: string) => {
    if (translatedData && translatedData[key]) return translatedData[key]
    return fallback
  }

  const handleSaveAsImage = useCallback(async () => {
    if (!pageRef.current || saving) return
    setSaving(true)
    try {
      // Tailwind CSS 4의 oklch 색상을 html2canvas가 지원하지 않으므로
      // 캡처 전에 모든 oklch 색상을 rgb로 변환
      const container = pageRef.current
      const elements = container.querySelectorAll('*')
      const originalStyles: { el: Element; prop: string; value: string }[] = []
      const propsToCheck = [
        'color', 'background-color', 'border-color',
        'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
        'outline-color', 'text-decoration-color', 'box-shadow',
      ]

      const convertOklch = (el: Element) => {
        const computed = window.getComputedStyle(el)
        for (const prop of propsToCheck) {
          const val = computed.getPropertyValue(prop)
          if (val && val.includes('oklch')) {
            // getComputedStyle가 oklch를 반환하는 경우 canvas로 변환
            const canvas2 = document.createElement('canvas')
            canvas2.width = 1
            canvas2.height = 1
            const ctx = canvas2.getContext('2d')
            if (ctx) {
              ctx.fillStyle = val
              ctx.fillRect(0, 0, 1, 1)
              const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
              const rgbVal = a < 255 ? `rgba(${r},${g},${b},${(a / 255).toFixed(3)})` : `rgb(${r},${g},${b})`
              originalStyles.push({ el, prop, value: (el as HTMLElement).style.getPropertyValue(prop) })
              ;(el as HTMLElement).style.setProperty(prop, rgbVal)
            }
          }
        }
      }

      convertOklch(container)
      elements.forEach(convertOklch)

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f9fafb',
        foreignObjectRendering: false,
        removeContainer: true,
        ignoreElements: (element) => {
          return element.hasAttribute('data-html2canvas-ignore')
        },
      })

      // 원래 스타일 복원
      for (const { el, prop, value } of originalStyles) {
        if (value) {
          ;(el as HTMLElement).style.setProperty(prop, value)
        } else {
          ;(el as HTMLElement).style.removeProperty(prop)
        }
      }

      const link = document.createElement('a')
      link.download = `TBM_${data?.project_name || 'safety'}_${data?.meeting_date || 'report'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('html2canvas error:', err)
      alert('이미지 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }, [saving, data])

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/tbm-view/${id}`)
        if (!res.ok) {
          setError('데이터를 찾을 수 없습니다.')
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchData()
  }, [id])

  const collectReadingContent = (d: TBMViewData) => {
    const contents: string[] = []
    if (d.potential_risk_1) contents.push(`첫 번째 잠재위험요인: ${d.potential_risk_1}`)
    if (d.solution_1) contents.push(`첫 번째 대책: ${d.solution_1}`)
    if (d.potential_risk_2) contents.push(`두 번째 잠재위험요인: ${d.potential_risk_2}`)
    if (d.solution_2) contents.push(`두 번째 대책: ${d.solution_2}`)
    if (d.potential_risk_3) contents.push(`세 번째 잠재위험요인: ${d.potential_risk_3}`)
    if (d.solution_3) contents.push(`세 번째 대책: ${d.solution_3}`)
    if (d.main_risk_selection) contents.push(`중점위험요인: ${d.main_risk_selection}`)
    if (d.main_risk_solution) contents.push(`중점위험요인 대책: ${d.main_risk_solution}`)
    if (d.risk_factor_1) contents.push(`첫 번째 유해위험요소: ${d.risk_factor_1}`)
    if (d.risk_factor_2) contents.push(`두 번째 유해위험요소: ${d.risk_factor_2}`)
    if (d.risk_factor_3) contents.push(`세 번째 유해위험요소: ${d.risk_factor_3}`)
    return contents
  }

  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: mimeType })
  }

  const handleTTSRead = async () => {
    if (!data) return
    const contents = collectReadingContent(data)
    if (contents.length === 0) {
      alert('읽을 내용이 없습니다.')
      return
    }

    // 사용자 클릭 동기 컨텍스트에서 Audio 객체 미리 생성 (브라우저 autoplay 잠금 해제)
    if (audioRef.current) {
      audioRef.current.pause()
      URL.revokeObjectURL(audioRef.current.src)
    }
    const audio = new Audio()
    audioRef.current = audio

    setTtsLoading(true)
    setShowTtsModal(true)
    try {
      const originalText = contents.join('. ')
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText, language: selectedLanguage })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'TTS 생성 중 오류가 발생했습니다.')
      if (result.success) {
        setTranslatedText(result.translatedText)
        const audioBlob = base64ToBlob(result.audio, 'audio/mp3')
        const audioUrl = URL.createObjectURL(audioBlob)
        audio.src = audioUrl
        audio.onplay = () => setIsReading(true)
        audio.onended = () => { setIsReading(false); setIsPaused(false) }
        audio.onerror = () => { setIsReading(false); setIsPaused(false) }
        try {
          await audio.play()
        } catch {
          // 자동 재생 실패 시 모달 유지 - 사용자가 재생 버튼으로 직접 재생 가능
        }
      }
    } catch (err: any) {
      alert(`음성 읽기 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`)
      setShowTtsModal(false)
    } finally {
      setTtsLoading(false)
    }
  }

  const stopTTS = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    setIsReading(false)
    setIsPaused(false)
  }

  const togglePauseTTS = () => {
    if (!audioRef.current) return
    if (isPaused || !isReading) {
      audioRef.current.play()
        .then(() => { setIsReading(true); setIsPaused(false) })
        .catch(() => alert('음성을 재생할 수 없습니다. 브라우저 설정을 확인해주세요.'))
    } else {
      audioRef.current.pause()
      setIsPaused(true)
    }
  }

  const closeTtsModal = () => {
    stopTTS()
    if (audioRef.current) { URL.revokeObjectURL(audioRef.current.src); audioRef.current = null }
    setShowTtsModal(false)
    setTranslatedText('')
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setShowLangDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // API 기반 페이지 번역 함수
  const translatePage = useCallback(async (lang: string) => {
    if (!data) return
    if (lang === 'ko') {
      setTranslatedData(null)
      return
    }
    // 캐시된 번역이 있으면 즉시 사용
    if (translateCache.current[lang]) {
      setTranslatedData(translateCache.current[lang])
      return
    }

    setTranslating(true)
    try {
      const texts: Record<string, string> = {
        header: 'AI TBM 안전교육 내용',
        basicInfo: '기본정보',
        siteName: '현장명',
        date: '교육일자',
        time: '교육시간',
        personnel: '투입 인원',
        equipment: '투입 장비',
        todayWorkSection: '금일 작업내용',
        potentialRisks: '잠재위험요인 및 대책',
        mainRisk: '중점위험요인',
        riskFactor: '위험요인',
        measure: '대책',
        hazardFactors: '유해위험요소',
        otherRemarks: '기타 주의사항',
        foreignSupport: '외국인 근로자 지원 (음성 읽기)',
        saveImage: '이미지로 저장하기',
        riskReport: '안전보건 위험신고',
        reportCenter: '안전일터 신고센터',
        callCenter: '콜센터 오픈챗팅방 참여',
        laborMinistry: '(노동부)',
      }
      if (data.personnel_count) texts.personnel_count = data.personnel_count
      if (data.equipment_input) texts.equipment_input = data.equipment_input
      if (data.today_work) texts.today_work = data.today_work
      if (data.potential_risk_1) texts.potential_risk_1 = data.potential_risk_1
      if (data.solution_1) texts.solution_1 = data.solution_1
      if (data.potential_risk_2) texts.potential_risk_2 = data.potential_risk_2
      if (data.solution_2) texts.solution_2 = data.solution_2
      if (data.potential_risk_3) texts.potential_risk_3 = data.potential_risk_3
      if (data.solution_3) texts.solution_3 = data.solution_3
      if (data.main_risk_selection) texts.main_risk_selection = data.main_risk_selection
      if (data.main_risk_solution) texts.main_risk_solution = data.main_risk_solution
      if (data.risk_factor_1) texts.risk_factor_1 = data.risk_factor_1
      if (data.risk_factor_2) texts.risk_factor_2 = data.risk_factor_2
      if (data.risk_factor_3) texts.risk_factor_3 = data.risk_factor_3
      if (data.other_remarks) texts.other_remarks = data.other_remarks

      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, language: lang }),
      })

      if (!res.ok) throw new Error('번역 실패')
      const result = await res.json()
      if (result.translated) {
        translateCache.current[lang] = result.translated
        setTranslatedData(result.translated)
      }
    } catch {
      setPageLang('ko')
      setTranslatedData(null)
    } finally {
      setTranslating(false)
    }
  }, [data])

  // 언어 선택 핸들러
  const handleLanguageChange = (lang: string) => {
    setPageLang(lang)
    setShowLangDropdown(false)
    translatePage(lang)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">교육 내용을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">데이터를 찾을 수 없습니다</h2>
          <p className="mt-2 text-sm text-gray-500">{error || 'QR 코드가 유효하지 않거나 만료되었습니다.'}</p>
        </div>
      </div>
    )
  }

  const hasRisks = data.potential_risk_1 || data.potential_risk_2 || data.potential_risk_3
  const hasRiskFactors = data.risk_factor_1 || data.risk_factor_2 || data.risk_factor_3
  const hasTTSContent = hasRisks || data.main_risk_selection || data.main_risk_solution || hasRiskFactors

  return (
    <div ref={pageRef} className="min-h-screen bg-gray-50">
      {/* 언어 변경 플로팅 버튼 — fixed, 내용 영역 우측 끝 기준 */}
      <div
        ref={langDropdownRef}
        className="fixed"
        style={{ zIndex: 99999, top: 14, right: floatingRight ?? 12 }}
        data-html2canvas-ignore
      >
        <button
          onClick={() => !translating && setShowLangDropdown(prev => !prev)}
          disabled={translating}
          className="flex items-center justify-center w-10 h-10 bg-white shadow-lg rounded-full text-lg hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50"
          title="언어 변경"
        >
          {translating
            ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            : languageOptions.find(l => l.value === pageLang)?.label.split(' ')[0] ?? '🌐'}
        </button>
        {showLangDropdown && (
          <div className="absolute top-full right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
              <p className="text-xs font-semibold text-blue-700">언어 선택 / Language</p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {languageOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleLanguageChange(opt.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${pageLang === opt.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 번역 중 로딩 오버레이 */}
      {translating && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/20" data-html2canvas-ignore>
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-gray-800">번역 중...</p>
              <p className="text-xs text-gray-500">Translating...</p>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="bg-blue-600 text-white px-4 py-5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Shield className="h-7 w-7 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-blue-200 uppercase tracking-wide">SafeSys</p>
            <h1 className="text-lg font-bold leading-tight">{t('header', 'AI TBM 안전교육 내용')}</h1>
          </div>
        </div>
      </div>

      <div ref={contentRef} className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* 기본정보 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-100">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-700">{t('basicInfo', '기본정보')}</h2>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{t('siteName', '현장명')}</p>
              <p className="text-sm font-semibold text-gray-900">{data.project_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">{t('date', '교육일자')}</p>
                <p className="text-sm font-medium text-gray-900">{data.meeting_date}</p>
              </div>
              {(data.education_start_time || data.education_end_time) && (
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <p className="text-xs text-gray-500">{t('time', '교육시간')}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {data.education_start_time || '--'} ~ {data.education_end_time || '--'}
                  </p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {data.personnel_count && (
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Users className="h-3 w-3 text-gray-400" />
                    <p className="text-xs text-gray-500">{t('personnel', '투입 인원')}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{t('personnel_count', data.personnel_count)}</p>
                </div>
              )}
              {data.equipment_input && (
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Truck className="h-3 w-3 text-gray-400" />
                    <p className="text-xs text-gray-500">{t('equipment', '투입 장비')}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{t('equipment_input', data.equipment_input)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 금일 작업내용 */}
        {data.today_work && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-gray-600" />
                <h2 className="text-sm font-semibold text-gray-700">{t('todayWorkSection', '금일 작업내용')}</h2>
              </div>
              <button
                onClick={() => handleCopy(data.today_work ?? '', 'today_work')}
                className="p-1.5 rounded-md hover:bg-gray-200 transition-colors"
                data-html2canvas-ignore
                title="복사"
              >
                {copiedField === 'today_work'
                  ? <Check className="h-3.5 w-3.5 text-green-500" />
                  : <Copy className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{t('today_work', data.today_work ?? '')}</p>
            </div>
          </div>
        )}

        {/* 잠재위험요인 */}
        {hasRisks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border-b border-orange-100">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-orange-700">{t('potentialRisks', '잠재위험요인 및 대책')}</h2>
            </div>
            <div className="px-4 py-4 space-y-3">
              {[
                { risk: data.potential_risk_1, solution: data.solution_1, rKey: 'potential_risk_1', sKey: 'solution_1', num: 1 },
                { risk: data.potential_risk_2, solution: data.solution_2, rKey: 'potential_risk_2', sKey: 'solution_2', num: 2 },
                { risk: data.potential_risk_3, solution: data.solution_3, rKey: 'potential_risk_3', sKey: 'solution_3', num: 3 },
              ].filter(item => item.risk).map(item => (
                <div key={item.num} className="bg-orange-50 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold">
                      {item.num}
                    </span>
                    <p className="text-sm font-medium text-gray-900">{t(item.rKey, item.risk ?? '')}</p>
                  </div>
                  {item.solution && (
                    <p className="text-sm text-orange-700 pl-7">→ {t(item.sKey, item.solution)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 중점위험요인 */}
        {(data.main_risk_selection || data.main_risk_solution) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-100">
              <AlertOctagon className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-red-700">{t('mainRisk', '중점위험요인')}</h2>
            </div>
            <div className="px-4 py-4 space-y-2">
              {data.main_risk_selection && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">{t('riskFactor', '위험요인')}</p>
                  <p className="text-sm font-medium text-gray-900">{t('main_risk_selection', data.main_risk_selection)}</p>
                </div>
              )}
              {data.main_risk_solution && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">{t('measure', '대책')}</p>
                  <p className="text-sm text-gray-800">{t('main_risk_solution', data.main_risk_solution)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 유해위험요소 */}
        {hasRiskFactors && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 border-b border-purple-100">
              <Shield className="h-4 w-4 text-purple-500" />
              <h2 className="text-sm font-semibold text-purple-700">{t('hazardFactors', '유해위험요소')}</h2>
            </div>
            <div className="px-4 py-4 space-y-2">
              {([
                { val: data.risk_factor_1, key: 'risk_factor_1' },
                { val: data.risk_factor_2, key: 'risk_factor_2' },
                { val: data.risk_factor_3, key: 'risk_factor_3' },
              ] as { val: string | undefined; key: string }[])
                .filter(item => item.val)
                .map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-gray-800">{t(item.key, item.val ?? '')}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 기타 주의사항 */}
        {data.other_remarks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border-b border-green-100">
              <FileText className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold text-green-700">{t('otherRemarks', '기타 주의사항')}</h2>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{t('other_remarks', data.other_remarks ?? '')}</p>
            </div>
          </div>
        )}

        {/* 외국인 근로자 지원 - TTS 음성 읽기 */}
        {hasTTSContent && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">🌏 {t('foreignSupport', '외국인 근로자 지원 (음성 읽기)')}</h2>
              <span className="text-xs text-gray-400">powered by OpenAI TTS</span>
            </div>
            <div className="px-4 py-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  {languageOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTTSRead}
                  disabled={ttsLoading || isReading}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {ttsLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />번역 중...</>
                  ) : isReading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />읽는 중...</>
                  ) : (
                    '🔊 읽어주기'
                  )}
                </button>
                {isReading && (
                  <button
                    type="button"
                    onClick={stopTTS}
                    className="px-4 py-2 text-sm text-white bg-red-500 rounded-md hover:bg-red-600"
                  >
                    ⏹️ 정지
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                외국인 근로자를 위해 위험요인과 대책을 선택한 언어로 번역하여 음성으로 읽어줍니다.
              </p>
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="flex gap-2" data-html2canvas-ignore>
          <button
            onClick={handleSaveAsImage}
            disabled={saving}
            className="flex-1 bg-green-600 rounded-xl px-4 py-5 flex flex-col items-center justify-center text-center text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Download className="h-5 w-5 mb-1" />
            <p className="text-base font-bold">{saving ? '저장 중...' : t('saveImage', '이미지로 저장하기')}</p>
          </button>
          <a
            href="https://open.kakao.com/o/gLKhuBfi"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-yellow-400 rounded-xl px-4 py-5 flex flex-col items-center justify-center text-center hover:bg-yellow-500 transition-colors"
          >
            <img src="/카카오톡.png" alt="카카오톡" className="h-6 w-6 mb-1 rounded" />
            <p className="text-base font-bold text-gray-900">{t('riskReport', '안전보건 위험신고')}</p>
            <p className="mt-0.5 text-xs text-gray-700">{t('callCenter', '콜센터 오픈챗팅방 참여')}</p>
          </a>
          <a
            href="https://labor.moel.go.kr/saveWkplDclrCntr/riskSttnDclrStep1.do?type=1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-blue-500 rounded-xl px-4 py-5 flex flex-col items-center justify-center text-center text-white hover:bg-blue-600 transition-colors"
          >
            <img src="/대한민국.png" alt="노동부" className="h-6 w-6 mb-1" />
            <p className="text-base font-bold">{t('reportCenter', '안전일터 신고센터')}</p>
            <p className="mt-0.5 text-xs text-blue-100">{t('laborMinistry', '(노동부)')}</p>
          </a>
        </div>
      </div>

      {/* TTS 음성 읽기 모달 */}
      {showTtsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">🎵 음성 읽기</h3>
              <button onClick={closeTtsModal} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  🌏 선택된 언어: {languageOptions.find(l => l.value === selectedLanguage)?.label}
                </h4>
              </div>
              {ttsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-600">번역 중...</span>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">📝 읽기 내용</h5>
                  <div className="text-sm text-gray-600 space-y-2 whitespace-pre-wrap">
                    {translatedText.split('. ').map((sentence, idx) => (
                      sentence.trim() && (
                        <div key={idx} className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100">
                          <span className="text-blue-500">•</span>
                          <span>{sentence.trim()}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex gap-2 justify-center">
              <button
                onClick={togglePauseTTS}
                disabled={!isReading && !isPaused}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPaused ? '▶️ 재생' : '⏸️ 일시정지'}
              </button>
              <button
                onClick={stopTTS}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded-md hover:bg-red-600"
              >
                ⏹️ 정지
              </button>
              <button
                onClick={closeTtsModal}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
