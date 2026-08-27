'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Save, Loader2, MapPin, Camera, RefreshCw, Trash2, Upload, Crop } from 'lucide-react'
// compressImage 내부에서 브라우저 전역 Image를 쓰므로 next/image는 별칭으로 가져온다
import NextImage from 'next/image'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import SignaturePad from '@/components/ui/SignaturePad'
import ImageEditor from '@/components/ui/ImageEditor'
import VworldMapAddressModal from '@/components/ui/VworldMapAddressModal'
import TbmRiskLinkButton from '@/components/project/risk-assessment/TbmRiskLinkButton'
import { parsePersonnelCount } from '@/lib/chat/tbm-personnel'
import type { TbmRiskLinkItem } from '@/lib/risk-assessment/types'
import { useAiModel } from '@/lib/use-ai-model'

interface TBMSubmissionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  projectCategory?: string
  userEmail?: string
  selectedDate?: string
  onSuccess?: () => void
  editingSubmission?: any
  onDraftSave?: () => void   // 임시저장 완료 콜백
}

interface FormData {
  todayWork: string
  noWorkCheck: boolean
  baseAddress: string
  detailAddress: string
  personnelInput: string
  personnelTotalCount: string
  newWorkerCount: string
  equipmentInput: string
  riskWorkType: string
  cctvUsage: string
  educationDate: string
  educationStartTime: string
  educationEndTime: string
  educationPhoto: File | null
  potentialRisk1: string
  solution1: string
  potentialRisk2: string
  solution2: string
  potentialRisk3: string
  solution3: string
  // 대책 1~3에 첨부하는 사진 (선택 사항)
  solutionPhoto1: File | null
  solutionPhoto2: File | null
  solutionPhoto3: File | null
  mainRiskSelection: string
  mainRiskSolution: string
  riskFactor1: string
  riskFactor2: string
  riskFactor3: string
  otherRemarks: string
  name: string
  contact: string
  signature: string
  latitude: string
  longitude: string
}

interface RecentPhotoRow {
  education_photo_url: string | null
}

// 외국인 근로자 지원을 위한 언어 옵션
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
  { value: 'uz', label: '🇺🇿 O\'zbek (우즈베키스탄어)' },
  { value: 'mn', label: '🇲🇳 Монгол (몽골어)' },
  { value: 'ru', label: '🇷🇺 Русский (러시아어)' },
]

const branchOptions: Record<string, string[]> = {
  '본사': ['본사', '안전혁신', '기획전략', '기반사업', '수자원관리', '농어촌계획', '농지은행', '농어촌연구', '인재개발', '농자원'],
  '경기': [
    '경기본부',
    '여주·이천지사',
    '양평·광주·서울지사',
    '화성·수원지사',
    '연천·포천·가평지사',
    '파주지사',
    '고양지사',
    '강화·옹진지사',
    '김포지사',
    '평택지사',
    '안성지사'
  ],
  '충남': [
    '충남본부',
    '천안지사',
    '공주지사',
    '보령지사',
    '아산지사',
    '서산·태안지사',
    '논산지사',
    '세종·대전·금산지사',
    '부여지사',
    '서천지사',
    '청양지사',
    '홍성지사',
    '예산지사',
    '당진지사'
  ],
  '강원': [
    '강원본부',
    '홍천·춘천지사',
    '원주지사',
    '강릉지사',
    '속초·고성·양양지사',
    '철원·화천지사'
  ],
  '충북': ['충북본부', '청주지사', '보은지사', '옥천·영동지사', '진천지사', '괴산·증평지사', '음성지사', '충주·제천·단양지사'],
  '전북': ['전북본부', '남원지사', '순창지사', '동진지사', '부안지사', '군산지사', '익산지사', '전주·완주·임실지사', '고창지사', '정읍지사', '무진장지사'],
  '전남': ['전남본부', '광주지사', '순천·광양·여수지사', '나주지사', '담양지사', '곡성지사', '구례지사', '고흥지사', '보성지사', '화순지사', '장흥지사', '강진지사', '해남·완도지사', '영암지사'],
  '경북': ['경북본부', '포항·울릉지사', '경주지사', '안동지사', '구미·김천지사', '영주·봉화지사', '영천지사', '상주지사', '문경지사', '경산·청도지사', '의성·군위지사', '청송·영양지사', '영덕·울진지사', '고령지사', '성주지사', '칠곡지사', '예천지사', '달성지사'],
  '경남': ['경남본부', '김해·양산·부산지사', '고성·통영·거제지사', '울산지사', '진주·산청지사', '의령지사', '함안지사', '창녕지사', '밀양지사', '창원지사', '사천지사', '거창·함양지사', '합천지사'],
  '제주': ['제주본부', '서귀포제주지부', '농업용수통합광역화추진단'],
  '화안': ['사업관리부', '시설관리부'],
  '금강': ['사업관리부', '시설관리부'],
  '새만금': ['사업관리부외', '사업관리부'],
  '영산강': ['사업관리부외', '사업관리부'],
  '새만금산업단지': ['사업관리부외', '사업관리부'],
  '토지개발': ['토지관리부', '토지개발부'],
  '충남서부관리단': ['사업관리부', '시설관리부'],
  '기타': ['기타']
}

const TBMSubmissionModal: React.FC<TBMSubmissionModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  managingHq,
  managingBranch,
  projectCategory,
  userEmail,
  selectedDate,
  onSuccess,
  editingSubmission,
  onDraftSave
}) => {
  const { userProfile } = useAuth()
  const aiModel = useAiModel('ai.write-risk-analysis', 'gpt-5.6-luna')
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [showAddressSearch, setShowAddressSearch] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState(false)

  // TTS 외국인 지원 관련 상태 (OpenAI TTS)
  const [selectedLanguage, setSelectedLanguage] = useState('ko')
  const [ttsLoading, setTtsLoading] = useState(false)
  const [showTtsModal, setShowTtsModal] = useState(false)
  const [translatedText, setTranslatedText] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recentCandidates, setRecentCandidates] = useState<any[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 대책 사진: 촬영/앨범 input 2개를 3개 슬롯이 공유하고, 선택 대상 번호는 ref로 들고 있는다
  const solutionCameraRef = useRef<HTMLInputElement>(null)
  const solutionAlbumRef = useRef<HTMLInputElement>(null)
  const solutionPhotoSlotRef = useRef<number>(1)
  // 수정 모드에서 이미 저장된 대책 사진 URL (삭제하면 null이 되어 저장 시 컬럼도 비워진다)
  const [existingSolutionPhotoUrls, setExistingSolutionPhotoUrls] = useState<(string | null)[]>([null, null, null])
  // 회전/크롭 편집 중인 대책 사진 (slot: 1~3)
  const [editingSolutionPhoto, setEditingSolutionPhoto] = useState<{ slot: number; dataUrl: string } | null>(null)
  const [formData, setFormData] = useState<FormData>({
    todayWork: '',
    noWorkCheck: false,
    baseAddress: '',
    detailAddress: '',
    personnelInput: '',
    personnelTotalCount: '',
    newWorkerCount: '',
    equipmentInput: '',
    riskWorkType: '',
    cctvUsage: '',
    educationDate: selectedDate || new Date().toISOString().split('T')[0],
    educationStartTime: '07:00',
    educationEndTime: '07:20',
    educationPhoto: null,
    potentialRisk1: '',
    solution1: '',
    potentialRisk2: '',
    solution2: '',
    potentialRisk3: '',
    solution3: '',
    solutionPhoto1: null,
    solutionPhoto2: null,
    solutionPhoto3: null,
    mainRiskSelection: '',
    mainRiskSolution: '',
    riskFactor1: '',
    riskFactor2: '',
    riskFactor3: '',
    otherRemarks: '- 위험성평가 내용 전달',
    name: '',
    contact: '',
    signature: '',
    latitude: '',
    longitude: ''
  })

  // 투입인원 총원칸을 사용자가 직접 수정했는지 추적. true면 내역 변경 시 자동 재계산하지 않는다.
  const [personnelTotalManual, setPersonnelTotalManual] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (editingSubmission) {
        // 레거시 행은 총원 컬럼이 비어 있으므로 내역에서 자동 계산해 채운다.
        const editAuto = parsePersonnelCount(editingSubmission.personnel_count)
        const editStored = editingSubmission.personnel_total_count
        const editHasStored = editStored !== null && editStored !== undefined
        setFormData({
          todayWork: editingSubmission.today_work || '',
          noWorkCheck: editingSubmission.today_work === '작업없음',
          baseAddress: editingSubmission.address || '',
          detailAddress: editingSubmission.detail_address || '',
          personnelInput: editingSubmission.personnel_count || '',
          personnelTotalCount: editHasStored ? String(editStored) : (editAuto ? String(editAuto) : ''),
          newWorkerCount: editingSubmission.new_worker_count?.toString() || '',
          equipmentInput: editingSubmission.equipment_input || '',
          riskWorkType: editingSubmission.risk_work_type || '',
          cctvUsage: editingSubmission.cctv_usage || '',
          educationDate: editingSubmission.education_date || selectedDate || new Date().toISOString().split('T')[0],
          educationStartTime: editingSubmission.education_start_time || '07:00',
          educationEndTime: editingSubmission.education_end_time || '07:20',
          educationPhoto: null,
          potentialRisk1: editingSubmission.potential_risk_1 || '',
          solution1: editingSubmission.solution_1 || '',
          potentialRisk2: editingSubmission.potential_risk_2 || '',
          solution2: editingSubmission.solution_2 || '',
          potentialRisk3: editingSubmission.potential_risk_3 || '',
          solution3: editingSubmission.solution_3 || '',
          solutionPhoto1: null,
          solutionPhoto2: null,
          solutionPhoto3: null,
          mainRiskSelection: editingSubmission.main_risk_selection || '',
          mainRiskSolution: editingSubmission.main_risk_solution || '',
          riskFactor1: editingSubmission.risk_factor_1 || '',
          riskFactor2: editingSubmission.risk_factor_2 || '',
          riskFactor3: editingSubmission.risk_factor_3 || '',
          otherRemarks: editingSubmission.other_remarks || '- 위험성평가 내용 전달',
          name: editingSubmission.reporter_name || '',
          contact: editingSubmission.reporter_contact || '',
          signature: '',
          latitude: editingSubmission.latitude?.toString() || '',
          longitude: editingSubmission.longitude?.toString() || ''
        })
        // 저장된 총원이 자동 계산값과 다르면 수동 수정된 값으로 간주해 자동 재계산을 막는다.
        setPersonnelTotalManual(editHasStored && Number(editStored) !== editAuto)
        // 기존에 저장된 대책 사진은 미리보기·재편집 대상으로 보관한다
        setExistingSolutionPhotoUrls([
          editingSubmission.solution_1_photo_url || null,
          editingSubmission.solution_2_photo_url || null,
          editingSubmission.solution_3_photo_url || null
        ])
      } else {
        // 프로젝트 정보로 기본값 설정
        setFormData(prev => ({
          ...prev,
          educationDate: selectedDate || new Date().toISOString().split('T')[0],
          todayWork: '',
          noWorkCheck: false,
          baseAddress: '',
          detailAddress: '',
          personnelInput: '',
          personnelTotalCount: '',
          newWorkerCount: '',
          equipmentInput: '',
          riskWorkType: '',
          cctvUsage: '',
          educationStartTime: '07:00',
          educationEndTime: '07:20',
          educationPhoto: null,
          potentialRisk1: '',
          solution1: '',
          potentialRisk2: '',
          solution2: '',
          potentialRisk3: '',
          solution3: '',
          solutionPhoto1: null,
          solutionPhoto2: null,
          solutionPhoto3: null,
          mainRiskSelection: '',
          mainRiskSolution: '',
          riskFactor1: '',
          riskFactor2: '',
          riskFactor3: '',
          otherRemarks: '- 위험성평가 내용 전달',
          name: '',
          contact: '',
          signature: '',
          latitude: '',
          longitude: ''
        }))
        setPersonnelTotalManual(false)
        setExistingSolutionPhotoUrls([null, null, null])
      }
      setEditingSolutionPhoto(null)
    }
  }, [isOpen, selectedDate, editingSubmission])

  // 서명 완료 후 자동 제출 처리
  useEffect(() => {
    if (pendingSubmit && formData.signature) {
      setPendingSubmit(false)
      handleSubmit()
    }
  }, [formData.signature, pendingSubmit])

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 투입인원 내역 변경 시, 사용자가 총원을 직접 수정하지 않았다면 내역에서 자동 합산한다.
  const handlePersonnelInputChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      personnelInput: value,
      personnelTotalCount: personnelTotalManual
        ? prev.personnelTotalCount
        : (parsePersonnelCount(value) ? String(parsePersonnelCount(value)) : '')
    }))
  }

  // 수시위험성평가 연계 결과로 잠재위험요인·해결방안·잠재위험요소를 채운다 (중점위험요인은 첫 항목으로 맞춘다)
  const handleRiskLinkApply = (items: TbmRiskLinkItem[]) => {
    setFormData(prev => ({
      ...prev,
      potentialRisk1: items[0]?.risk || '',
      solution1: items[0]?.solution || '',
      potentialRisk2: items[1]?.risk || '',
      solution2: items[1]?.solution || '',
      potentialRisk3: items[2]?.risk || '',
      solution3: items[2]?.solution || '',
      mainRiskSelection: items[0]?.risk || '',
      mainRiskSolution: items[0]?.solution || '',
      riskFactor1: items[0]?.factor || '',
      riskFactor2: items[1]?.factor || '',
      riskFactor3: items[2]?.factor || ''
    }))
  }

  // 중점위험요인 선택 시 짝이 되는 대책을 자동 입력
  const handleMainRiskChange = (value: string) => {
    setFormData(prev => {
      const risks = [prev.potentialRisk1, prev.potentialRisk2, prev.potentialRisk3]
      const solutions = [prev.solution1, prev.solution2, prev.solution3]
      const v = (value || '').trim()
      const idx = v ? risks.findIndex(r => (r || '').trim() === v) : -1
      return {
        ...prev,
        mainRiskSelection: value,
        mainRiskSolution: idx >= 0 ? (solutions[idx] || '') : ''
      }
    })
  }

  const getPhotoNameKey = (rawName: string) => {
    if (!rawName) return ''

    let decoded = rawName
    try {
      decoded = decodeURIComponent(rawName)
    } catch {
      decoded = rawName
    }
    const filename = decoded.split('?')[0].split('/').pop() || decoded
    const withoutExt = filename.replace(/\.[^.]+$/, '')
    const withoutPrefix = withoutExt.replace(/^\d+_[a-z0-9]+_/i, '')
    return withoutPrefix.toLowerCase().replace(/\s+/g, '').trim()
  }

  const hasRecentDuplicatePhotoName = async (fileName: string): Promise<boolean> => {
    const targetKey = getPhotoNameKey(fileName)
    if (!targetKey) return false

    const { data, error } = await supabase
      .from('tbm_submissions')
      .select('education_photo_url')
      .eq('project_name', projectName)
      .eq('headquarters', managingHq)
      .eq('branch', managingBranch)
      .not('education_photo_url', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(30)

    if (error) {
      console.error('최근 사진 중복 확인 오류:', error)
      return false
    }

    const rows = (data || []) as RecentPhotoRow[]
    return rows.some(row => getPhotoNameKey(row.education_photo_url || '') === targetKey)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isDuplicate = await hasRecentDuplicatePhotoName(file.name)
    if (isDuplicate) {
      alert('최근 동일한 사진이 제출 되었습니다.\n다른 날짜의 사진을 제출해 주세요')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    handleInputChange('educationPhoto', file)
  }

  const getSolutionPhoto = (slot: number): File | null =>
    (formData[`solutionPhoto${slot}` as keyof FormData] as File | null) || null

  // 대책 사진 선택 — 촬영/앨범 input을 공유하므로 대상 슬롯 번호를 ref에 담아 둔다
  const openSolutionPhotoPicker = (slot: number, source: 'camera' | 'album') => {
    solutionPhotoSlotRef.current = slot
    if (source === 'camera') {
      solutionCameraRef.current?.click()
    } else {
      solutionAlbumRef.current?.click()
    }
  }

  const handleSolutionPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 같은 파일을 다시 고를 수 있도록 input 값을 비운다
    e.target.value = ''
    if (!file) return

    handleInputChange(`solutionPhoto${solutionPhotoSlotRef.current}` as keyof FormData, file)
  }

  // 대책 사진 삭제 — 새로 고른 파일과 기존 저장 URL을 모두 비워 저장 시 컬럼이 null이 되게 한다
  const removeSolutionPhoto = (slot: number) => {
    handleInputChange(`solutionPhoto${slot}` as keyof FormData, null)
    setExistingSolutionPhotoUrls(prev => prev.map((url, idx) => (idx === slot - 1 ? null : url)))
  }

  // 새로 고른 대책 사진 회전/크롭 편집기 열기 — object URL은 렌더마다 바뀌므로 data URL로 넘긴다
  const openSolutionPhotoEditor = async (slot: number) => {
    const photo = getSolutionPhoto(slot)
    if (!photo) return

    try {
      setEditingSolutionPhoto({ slot, dataUrl: await getBase64(photo) })
    } catch (error: any) {
      console.error('대책 사진 편집기 열기 오류:', error)
      alert('사진을 불러오지 못했습니다.')
    }
  }

  // 기존 저장 대책 사진 편집기 열기 — 원격 URL을 data URL로 바꿔 편집기에 넘긴다
  const openExistingSolutionPhotoEditor = async (slot: number) => {
    const photoUrl = existingSolutionPhotoUrls[slot - 1]
    if (!photoUrl) return

    try {
      const response = await fetch(photoUrl)
      if (!response.ok) {
        throw new Error(`사진 로드 실패 (${response.status})`)
      }
      const blob = await response.blob()
      setEditingSolutionPhoto({ slot, dataUrl: await getBase64(blob) })
    } catch (error: any) {
      console.error('기존 대책 사진 편집기 열기 오류:', error)
      alert('기존 사진을 불러오지 못했습니다.')
    }
  }

  // 편집 결과를 File로 되돌려 해당 슬롯 사진을 교체한다 (기존 저장 사진을 편집한 경우 새 사진으로 대체됨)
  const handleSolutionPhotoEditSave = (blob: Blob) => {
    if (!editingSolutionPhoto) return

    const { slot } = editingSolutionPhoto
    const original = getSolutionPhoto(slot)
    const baseName = original ? original.name.replace(/\.[^.]+$/, '') : `solution_${slot}_photo`
    const editedFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    handleInputChange(`solutionPhoto${slot}` as keyof FormData, editedFile)
    setEditingSolutionPhoto(null)
  }

  // 대책 사진 미리보기 — 새로 고른 사진이 있으면 그 사진을, 없으면 기존 저장 사진을 보여준다
  const renderSolutionPhotoPreview = (slot: number) => {
    const photo = getSolutionPhoto(slot)
    const existingUrl = existingSolutionPhotoUrls[slot - 1]
    if (!photo && !existingUrl) return null

    const previewUrl = photo ? URL.createObjectURL(photo) : (existingUrl as string)

    return (
      <div className="relative mt-2 inline-block">
        <NextImage
          src={previewUrl}
          alt={`대책 ${slot} 사진`}
          width={160}
          height={80}
          className="h-20 w-auto rounded border border-gray-200 object-cover"
          unoptimized
        />
        <button
          type="button"
          onClick={() => (photo ? openSolutionPhotoEditor(slot) : openExistingSolutionPhotoEditor(slot))}
          className="absolute -top-2 right-4 bg-white text-gray-700 border border-gray-300 rounded-full w-5 h-5 flex items-center justify-center shadow hover:bg-gray-100"
          title="회전/크롭"
        >
          <Crop className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => removeSolutionPhoto(slot)}
          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
          title="사진 삭제"
        >
          <X className="h-3 w-3" />
        </button>
        {!photo && <p className="mt-1 text-[11px] text-gray-500 text-center">기존 등록 사진</p>}
      </div>
    )
  }

  const handleNoWorkCheck = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      noWorkCheck: checked,
      todayWork: checked ? '작업없음' : ''
    }))
  }


  const compressImage = async (file: File, maxWidth = 1200, quality = 0.75): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        // PNG 투명 배경 → 흰색 배경 처리 (JPEG 변환 시 검은색 방지)
        if (ctx) {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
        }

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('이미지 압축 실패: blob 생성 불가'))
            }
          },
          'image/jpeg',
          quality
        )
      }

      img.onerror = () => reject(new Error('이미지 로드 실패'))
      const objectUrl = URL.createObjectURL(file)
      img.src = objectUrl
    })
  }

  const getBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
    })
  }

  const sanitizeStorageBaseName = (fileName: string) => {
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const sanitized = baseName
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')

    return sanitized || 'photo'
  }

  const uploadToStorage = async (file: File | Blob, folder: string, fileName: string): Promise<string> => {
    const rawExt = fileName.split('.').pop() || 'jpg'
    const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg'
    const safeBaseName = sanitizeStorageBaseName(fileName)
    const randomToken = Math.random().toString(36).substring(2, 8)
    const filePath = `${folder}/${Date.now()}_${randomToken}_${safeBaseName}.${safeExt}`

    const { data, error } = await supabase.storage
      .from('tbm-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      throw new Error(`파일 업로드 실패: ${error.message}`)
    }

    const { data: { publicUrl } } = supabase.storage
      .from('tbm-photos')
      .getPublicUrl(filePath)

    return publicUrl
  }

  // 대책 1~3 사진 업로드 — 새로 고른 파일만 올리고, 없으면 보관 중인 기존 URL을 그대로 쓴다
  const uploadSolutionPhotos = async (): Promise<(string | null)[]> => {
    const photoUrls = [...existingSolutionPhotoUrls]
    if (formData.noWorkCheck) {
      return photoUrls
    }

    const photos = [formData.solutionPhoto1, formData.solutionPhoto2, formData.solutionPhoto3]
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]
      if (!photo) continue

      try {
        const compressedFile = await compressImage(photo, 1200, 0.75)
        photoUrls[i] = await uploadToStorage(compressedFile, 'solutions', photo.name)
      } catch (error) {
        console.warn('대책 사진 압축 실패, 원본 사용:', error)
        photoUrls[i] = await uploadToStorage(photo, 'solutions', photo.name)
      }
    }

    return photoUrls
  }

  const handleAIWrite = async () => {
    if (!formData.todayWork) {
      alert('금일작업을 먼저 입력해주세요.')
      return
    }

    try {
      setAiLoading(true)

      const response = await fetch('/api/ai/write-risk-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          todayWork: formData.todayWork,
          personnelInput: formData.personnelInput,
          equipmentInput: formData.equipmentInput
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'AI 작성 중 오류가 발생했습니다.')
      }

      if (result.success && result.data) {
        // AI 응답으로 필드 채우기
        // 중점위험요인은 잠재위험요인 중 하나로 정렬(짝 대책 자동), 잠재위험요소는 각 잠재위험요인과 연관된 별개 AI 결과 사용
        setFormData(prev => {
          const pr1 = result.data.potentialRisk1 || prev.potentialRisk1
          const pr2 = result.data.potentialRisk2 || prev.potentialRisk2
          const pr3 = result.data.potentialRisk3 || prev.potentialRisk3
          const s1 = result.data.solution1 || prev.solution1
          const s2 = result.data.solution2 || prev.solution2
          const s3 = result.data.solution3 || prev.solution3
          const risks = [pr1, pr2, pr3]
          const solutions = [s1, s2, s3]
          const aiMain = (result.data.mainRiskSelection || '').trim()
          let mainIdx = aiMain ? risks.findIndex(r => (r || '').trim() === aiMain) : -1
          if (mainIdx < 0) mainIdx = 0
          return {
            ...prev,
            potentialRisk1: pr1,
            solution1: s1,
            potentialRisk2: pr2,
            solution2: s2,
            potentialRisk3: pr3,
            solution3: s3,
            mainRiskSelection: risks[mainIdx] || '',
            mainRiskSolution: solutions[mainIdx] || '',
            riskFactor1: result.data.riskFactor1 || prev.riskFactor1,
            riskFactor2: result.data.riskFactor2 || prev.riskFactor2,
            riskFactor3: result.data.riskFactor3 || prev.riskFactor3
          }
        })

        let completionMessage = '금일작업'
        if (formData.personnelInput && formData.equipmentInput) {
          completionMessage += ', 투입인원, 투입장비'
        } else if (formData.personnelInput) {
          completionMessage += ', 투입인원'
        } else if (formData.equipmentInput) {
          completionMessage += ', 투입장비'
        }
        completionMessage += '에 대해 AI작성을 완료했습니다.\n\n수시 위험성평가와 연계성을 확인하고 필요시 수정 바랍니다.'

        alert(completionMessage)
      }
    } catch (error: any) {
      console.error('AI 작성 오류:', error)
      alert(`AI 작성 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setAiLoading(false)
    }
  }

  const handleClearAI = () => {
    if (confirm('AI가 작성한 답변을 모두 삭제하시겠습니까?')) {
      setFormData(prev => ({
        ...prev,
        potentialRisk1: '',
        solution1: '',
        potentialRisk2: '',
        solution2: '',
        potentialRisk3: '',
        solution3: '',
        mainRiskSelection: '',
        mainRiskSolution: '',
        riskFactor1: '',
        riskFactor2: '',
        riskFactor3: ''
      }))
      alert('AI 답변이 삭제되었습니다.')
    }
  }

  // TTS 읽기 컨텐츠 수집 함수
  const collectReadingContent = () => {
    const contents: string[] = []

    // 잠재위험요인과 대책들
    if (formData.potentialRisk1) contents.push(`첫 번째 잠재위험요인: ${formData.potentialRisk1}`)
    if (formData.solution1) contents.push(`첫 번째 대책: ${formData.solution1}`)
    if (formData.potentialRisk2) contents.push(`두 번째 잠재위험요인: ${formData.potentialRisk2}`)
    if (formData.solution2) contents.push(`두 번째 대책: ${formData.solution2}`)
    if (formData.potentialRisk3) contents.push(`세 번째 잠재위험요인: ${formData.potentialRisk3}`)
    if (formData.solution3) contents.push(`세 번째 대책: ${formData.solution3}`)

    // 중점위험요인과 대책
    if (formData.mainRiskSelection) contents.push(`중점위험요인: ${formData.mainRiskSelection}`)
    if (formData.mainRiskSolution) contents.push(`중점위험요인 대책: ${formData.mainRiskSolution}`)

    // 잠재위험요소들
    if (formData.riskFactor1) contents.push(`첫 번째 잠재위험요소: ${formData.riskFactor1}`)
    if (formData.riskFactor2) contents.push(`두 번째 잠재위험요소: ${formData.riskFactor2}`)
    if (formData.riskFactor3) contents.push(`세 번째 잠재위험요소: ${formData.riskFactor3}`)

    return contents
  }

  // OpenAI TTS 읽기 시작 함수
  const handleTTSRead = async () => {
    const contents = collectReadingContent()

    if (contents.length === 0) {
      alert('읽을 내용이 없습니다. 먼저 AI 작성하기를 실행해주세요.')
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

      // OpenAI TTS API 호출 (번역 + TTS 한 번에 처리)
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: originalText,
          language: selectedLanguage
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'TTS 생성 중 오류가 발생했습니다.')
      }

      if (result.success) {
        // 번역된 텍스트 표시
        setTranslatedText(result.translatedText)

        // Base64 오디오를 Blob으로 변환하여 재생
        const audioBlob = base64ToBlob(result.audio, 'audio/mp3')
        const audioUrl = URL.createObjectURL(audioBlob)

        audio.src = audioUrl
        audio.onplay = () => setIsReading(true)
        audio.onended = () => {
          setIsReading(false)
          setIsPaused(false)
        }
        audio.onerror = () => {
          console.error('오디오 재생 오류')
          setIsReading(false)
          setIsPaused(false)
        }

        try {
          await audio.play()
        } catch {
          // 자동 재생 실패 시 모달 유지 - 사용자가 재생 버튼으로 직접 재생 가능
        }
      }
    } catch (error: any) {
      console.error('TTS 오류:', error)
      alert(`음성 읽기 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
      setShowTtsModal(false)
    } finally {
      setTtsLoading(false)
    }
  }

  // Base64를 Blob으로 변환하는 헬퍼 함수
  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: mimeType })
  }

  // 음성 정지
  const stopTTS = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsReading(false)
    setIsPaused(false)
  }

  // 일시정지/재개
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

  // TTS 모달 닫기
  const closeTtsModal = () => {
    stopTTS()
    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current = null
    }
    setShowTtsModal(false)
    setTranslatedText('')
  }

  // 선택한 데이터를 폼에 적용 (미입력·공백 값은 덮어쓰지 않음)
  const applyRecentData = (data: any) => {
    // 원본이 비어 있으면 현재 폼 값을 유지한다.
    const pick = (value: unknown, fallback: string) => {
      if (value === null || value === undefined) return fallback
      const s = String(value).trim()
      return s ? s : fallback
    }
    const pickTime = (value: unknown, fallback: string) => {
      const raw = pick(value, '')
      if (!raw) return fallback
      return raw.length > 5 ? raw.substring(0, 5) : raw
    }

    const recentAuto = parsePersonnelCount(data.personnel_count || '')
    const recentStored = data.personnel_total_count
    const recentHasStored = recentStored !== null && recentStored !== undefined
    const importedTodayWork = pick(data.today_work, '')
    setFormData(prev => ({
      ...prev,
      todayWork: importedTodayWork || prev.todayWork,
      noWorkCheck: importedTodayWork ? importedTodayWork === '작업없음' : prev.noWorkCheck,
      baseAddress: pick(data.address, prev.baseAddress),
      detailAddress: pick(data.detail_address, prev.detailAddress),
      personnelInput: pick(data.personnel_count, prev.personnelInput),
      personnelTotalCount: recentHasStored
        ? String(recentStored)
        : (recentAuto ? String(recentAuto) : prev.personnelTotalCount),
      // 0은 유효 입력이므로 null/undefined만 스킵
      newWorkerCount:
        data.new_worker_count !== null && data.new_worker_count !== undefined
          ? String(data.new_worker_count)
          : prev.newWorkerCount,
      equipmentInput: pick(data.equipment_input, prev.equipmentInput),
      riskWorkType: pick(data.risk_work_type, prev.riskWorkType),
      cctvUsage: pick(data.cctv_usage, prev.cctvUsage),
      educationStartTime: pickTime(data.education_start_time, prev.educationStartTime),
      educationEndTime: pickTime(data.education_end_time, prev.educationEndTime),
      potentialRisk1: pick(data.potential_risk_1, prev.potentialRisk1),
      solution1: pick(data.solution_1, prev.solution1),
      potentialRisk2: pick(data.potential_risk_2, prev.potentialRisk2),
      solution2: pick(data.solution_2, prev.solution2),
      potentialRisk3: pick(data.potential_risk_3, prev.potentialRisk3),
      solution3: pick(data.solution_3, prev.solution3),
      mainRiskSelection: pick(data.main_risk_selection, prev.mainRiskSelection),
      mainRiskSolution: pick(data.main_risk_solution, prev.mainRiskSolution),
      riskFactor1: pick(data.risk_factor_1, prev.riskFactor1),
      riskFactor2: pick(data.risk_factor_2, prev.riskFactor2),
      riskFactor3: pick(data.risk_factor_3, prev.riskFactor3),
      otherRemarks: pick(data.other_remarks, prev.otherRemarks),
      name: pick(data.reporter_name, prev.name),
      contact: pick(data.reporter_contact, prev.contact),
      latitude: pick(data.latitude, prev.latitude),
      longitude: pick(data.longitude, prev.longitude),
    }))
    setPersonnelTotalManual(recentHasStored && Number(recentStored) !== recentAuto)
    setRecentCandidates([])
    alert('최근 제출 데이터를 불러왔습니다.')
  }

  const handleLoadRecentData = async () => {
    try {
      // 최근 제출 데이터를 여러 날짜에 걸쳐 조회 (제출일 최신순)
      // 특정 날짜만이 아니라 최근 제출자 전체를 후보로 보여주기 위함
      // 임시저장·제출자 미입력 건은 제외 (불완전 데이터 가져오기 방지)
      const { data: rows, error: rowsError } = await supabase
        .from('tbm_submissions')
        .select('*')
        .eq('project_name', projectName)
        .eq('headquarters', managingHq)
        .eq('branch', managingBranch)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(100)

      if (rowsError) throw rowsError

      if (!rows || rows.length === 0) {
        alert('최근 제출 데이터가 없습니다.')
        return
      }

      // 제출자별로 가장 최근 제출 1건만 남기고 중복 제거
      // 제출자명이 비어 있는(미입력) 건은 후보에서 제외
      const seen = new Set<string>()
      const candidates: any[] = []
      for (const row of rows) {
        const name = (row.reporter_name || '').trim()
        if (!name) continue
        const contact = (row.reporter_contact || '').trim()
        const key = contact ? `${name}|${contact}` : `name:${name}`
        if (seen.has(key)) continue
        seen.add(key)
        candidates.push(row)
      }

      if (candidates.length === 0) {
        alert('최근 제출 데이터가 없습니다.')
        return
      }

      // 1건이면 바로 적용, 2건 이상이면 선택 UI 표시
      if (candidates.length === 1) {
        applyRecentData(candidates[0])
      } else {
        setRecentCandidates(candidates)
      }
    } catch (error: any) {
      console.error('최근 데이터 불러오기 오류:', error)
      alert(`최근 데이터를 불러오는 중 오류가 발생했습니다: ${error.message}`)
    }
  }

  const handleClearAll = () => {
    if (!confirm('모든 입력 내용을 삭제하시겠습니까?')) {
      return
    }

    setFormData({
      todayWork: '',
      noWorkCheck: false,
      baseAddress: '',
      detailAddress: '',
      personnelInput: '',
      personnelTotalCount: '',
      newWorkerCount: '',
      equipmentInput: '',
      riskWorkType: '',
      cctvUsage: '',
      educationDate: selectedDate || new Date().toISOString().split('T')[0],
      educationStartTime: '07:00',
      educationEndTime: '07:20',
      educationPhoto: null,
      potentialRisk1: '',
      solution1: '',
      potentialRisk2: '',
      solution2: '',
      potentialRisk3: '',
      solution3: '',
      solutionPhoto1: null,
      solutionPhoto2: null,
      solutionPhoto3: null,
      mainRiskSelection: '',
      mainRiskSolution: '',
      riskFactor1: '',
      riskFactor2: '',
      riskFactor3: '',
      otherRemarks: '- 위험성평가 내용 전달',
      name: '',
      contact: '',
      signature: '',
      latitude: '',
      longitude: ''
    })
    setPersonnelTotalManual(false)

    // 파일 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    alert('모든 입력 내용이 삭제되었습니다.')
  }

  const handleDraftSave = async () => {
    // 임시저장: 최소 검증만 수행
    if (!userEmail) {
      alert('사용자 이메일 정보를 찾을 수 없습니다.')
      return
    }
    if (!managingHq || !managingBranch) {
      alert('프로젝트 본부/지사 정보를 찾을 수 없습니다.')
      return
    }
    // educationDate만 필수 (캘린더 표시를 위해)
    if (!formData.educationDate) {
      alert('교육 일자를 선택해주세요.')
      return
    }

    try {
      setLoading(true)

      // 사진이 있으면 업로드, 없으면 기존 URL 유지 또는 null
      let educationPhotoUrl = editingSubmission?.education_photo_url || null
      let signatureUrl = editingSubmission?.signature_url || null

      if (formData.educationPhoto && !formData.noWorkCheck) {
        try {
          const compressedFile = await compressImage(formData.educationPhoto, 1200, 0.75)
          educationPhotoUrl = await uploadToStorage(compressedFile, 'education', formData.educationPhoto.name)
        } catch (error) {
          console.warn('이미지 압축 실패, 원본 사용:', error)
          educationPhotoUrl = await uploadToStorage(formData.educationPhoto, 'education', formData.educationPhoto.name)
        }
      }

      const solutionPhotoUrls = await uploadSolutionPhotos()

      if (formData.signature && !formData.noWorkCheck) {
        const base64Data = formData.signature.split(',')[1] || formData.signature
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const signatureBlob = new Blob([byteArray], { type: 'image/png' })
        signatureUrl = await uploadToStorage(signatureBlob, 'signatures', 'signature.png')
      }

      // 교육 시간 계산
      const startTime = formData.educationStartTime.split(':')
      const endTime = formData.educationEndTime.split(':')
      const startMinutes = parseInt(startTime[0]) * 60 + parseInt(startTime[1])
      const endMinutes = parseInt(endTime[0]) * 60 + parseInt(endTime[1])
      const duration = endMinutes - startMinutes

      const submitData: any = {
        project_id: projectId,
        reporter_email: userEmail || '',
        headquarters: managingHq,
        branch: managingBranch,
        project_name: projectName,
        project_type: projectCategory || '',
        construction_company: userProfile?.company_name || '',
        today_work: formData.todayWork,
        address: formData.baseAddress,
        detail_address: formData.detailAddress,
        personnel_count: formData.personnelInput,
        personnel_total_count: formData.noWorkCheck ? 0 : (formData.personnelTotalCount ? parseInt(formData.personnelTotalCount, 10) : null),
        new_worker_count: formData.newWorkerCount ? parseInt(formData.newWorkerCount) : null,
        equipment_input: formData.equipmentInput,
        risk_work_type: formData.riskWorkType,
        cctv_usage: formData.cctvUsage,
        meeting_date: formData.educationDate,
        education_date: formData.educationDate,
        education_start_time: formData.educationStartTime,
        education_end_time: formData.educationEndTime,
        education_duration: duration,
        education_photo_url: educationPhotoUrl,
        potential_risk_1: formData.potentialRisk1,
        solution_1: formData.solution1,
        potential_risk_2: formData.potentialRisk2,
        solution_2: formData.solution2,
        potential_risk_3: formData.potentialRisk3,
        solution_3: formData.solution3,
        solution_1_photo_url: solutionPhotoUrls[0],
        solution_2_photo_url: solutionPhotoUrls[1],
        solution_3_photo_url: solutionPhotoUrls[2],
        main_risk_selection: formData.mainRiskSelection,
        main_risk_solution: formData.mainRiskSolution,
        risk_factor_1: formData.riskFactor1,
        risk_factor_2: formData.riskFactor2,
        risk_factor_3: formData.riskFactor3,
        other_remarks: formData.otherRemarks,
        reporter_name: formData.name,
        reporter_contact: formData.contact,
        signature_url: signatureUrl,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        status: 'draft'  // ★ 핵심: 임시저장 상태
      }

      let submitOperation
      if (editingSubmission) {
        submitOperation = supabase
          .from('tbm_submissions')
          .update(submitData)
          .eq('id', editingSubmission.id)
      } else {
        submitData.submitted_at = new Date().toISOString()
        submitOperation = supabase
          .from('tbm_submissions')
          .insert([submitData])
      }

      const { error } = await submitOperation.select().single()

      if (error) {
        console.error('임시저장 오류:', error)
        throw new Error(error.message)
      }

      // 텔레그램 알림 전송하지 않음 (드래프트이므로)

      alert('임시저장되었습니다.')
      onDraftSave?.()
      onSuccess?.()
      onClose()
    } catch (error: any) {
      console.error('임시저장 오류:', error)
      alert(`임시저장 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    // 유효성 검사
    if (!userEmail) {
      alert('사용자 이메일 정보를 찾을 수 없습니다.')
      return
    }

    if (!managingHq || !managingBranch) {
      alert('프로젝트 본부/지사 정보를 찾을 수 없습니다.')
      return
    }

    if (!formData.noWorkCheck) {
      if (!formData.newWorkerCount) {
        alert('신규 근로자 인원수를 입력해주세요.')
        return
      }

      if (!formData.baseAddress) {
        alert('실제 작업주소를 입력해주세요.')
        return
      }

      if (!formData.educationPhoto && !editingSubmission?.education_photo_url) {
        alert('교육 사진 1개를 첨부해주세요.')
        return
      }

      if (!formData.signature && !editingSubmission?.signature_url) {
        setPendingSubmit(true)
        setShowSignaturePad(true)
        return
      }

      if (formData.otherRemarks.trim() === '- 위험성평가 내용 전달') {
        alert('작업자에게 교육한 내용을 더 적어주세요')
        return
      }
    }

    if (!formData.noWorkCheck && formData.educationPhoto) {
      const isDuplicate = await hasRecentDuplicatePhotoName(formData.educationPhoto.name)
      if (isDuplicate) {
        alert('최근 동일한 사진이 제출 되었습니다.\n다른 날짜의 사진을 제출해 주세요')
        return
      }
    }

    try {
      setLoading(true)

      // 이미지와 서명을 Storage에 업로드
      let educationPhotoUrl = editingSubmission?.education_photo_url || null
      let signatureUrl = editingSubmission?.signature_url || null

      if (formData.educationPhoto && !formData.noWorkCheck) {
        try {
          const compressedFile = await compressImage(formData.educationPhoto, 1200, 0.75)
          educationPhotoUrl = await uploadToStorage(
            compressedFile,
            'education',
            formData.educationPhoto.name
          )
        } catch (error) {
          console.warn('이미지 압축 실패, 원본 사용:', error)
          educationPhotoUrl = await uploadToStorage(
            formData.educationPhoto,
            'education',
            formData.educationPhoto.name
          )
        }
      }

      const solutionPhotoUrls = await uploadSolutionPhotos()

      if (formData.signature && !formData.noWorkCheck) {
        // 서명은 base64 데이터이므로 Blob로 변환
        const base64Data = formData.signature.split(',')[1] || formData.signature
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const signatureBlob = new Blob([byteArray], { type: 'image/png' })
        signatureUrl = await uploadToStorage(
          signatureBlob,
          'signatures',
          'signature.png'
        )
      }

      // 교육 시간 계산 (분 단위)
      const startTime = formData.educationStartTime.split(':')
      const endTime = formData.educationEndTime.split(':')
      const startMinutes = parseInt(startTime[0]) * 60 + parseInt(startTime[1])
      const endMinutes = parseInt(endTime[0]) * 60 + parseInt(endTime[1])
      const duration = endMinutes - startMinutes

      // 다운로드 시 생성할 데이터 공통
      const submitData: any = {
        project_id: projectId,
        reporter_email: userEmail || '',
        headquarters: managingHq,
        branch: managingBranch,
        project_name: projectName,
        project_type: projectCategory || '',
        construction_company: userProfile?.company_name || '',
        today_work: formData.todayWork,
        address: formData.baseAddress,
        detail_address: formData.detailAddress,
        personnel_count: formData.personnelInput,
        personnel_total_count: formData.noWorkCheck ? 0 : (formData.personnelTotalCount ? parseInt(formData.personnelTotalCount, 10) : null),
        new_worker_count: formData.newWorkerCount ? parseInt(formData.newWorkerCount) : null,
        equipment_input: formData.equipmentInput,
        risk_work_type: formData.riskWorkType,
        cctv_usage: formData.cctvUsage,
        meeting_date: formData.educationDate,
        education_date: formData.educationDate,
        education_start_time: formData.educationStartTime,
        education_end_time: formData.educationEndTime,
        education_duration: duration,
        education_photo_url: educationPhotoUrl,
        potential_risk_1: formData.potentialRisk1,
        solution_1: formData.solution1,
        potential_risk_2: formData.potentialRisk2,
        solution_2: formData.solution2,
        potential_risk_3: formData.potentialRisk3,
        solution_3: formData.solution3,
        solution_1_photo_url: solutionPhotoUrls[0],
        solution_2_photo_url: solutionPhotoUrls[1],
        solution_3_photo_url: solutionPhotoUrls[2],
        main_risk_selection: formData.mainRiskSelection,
        main_risk_solution: formData.mainRiskSolution,
        risk_factor_1: formData.riskFactor1,
        risk_factor_2: formData.riskFactor2,
        risk_factor_3: formData.riskFactor3,
        other_remarks: formData.otherRemarks,
        reporter_name: formData.name,
        reporter_contact: formData.contact,
        signature_url: signatureUrl,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        status: 'submitted'  // 최종 제출 상태 (드래프트에서 전환 시에도 적용)
      }

      if (!editingSubmission) {
        submitData.submitted_at = new Date().toISOString()
      }

      // Supabase에 저장
      let submitOperation
      if (editingSubmission) {
        submitOperation = supabase
          .from('tbm_submissions')
          .update(submitData)
          .eq('id', editingSubmission.id)
      } else {
        submitOperation = supabase
          .from('tbm_submissions')
          .insert([submitData])
      }

      const { data, error } = await submitOperation.select().single()

      if (error) {
        console.error('제출 오류:', error)
        throw new Error(error.message)
      }

      // 텔레그램 알림 발송 (발주청)
      // 신규 제출과 임시저장(draft) → 제출 전환일 때 발송한다. 이미 제출된 건의 재수정은 발송하지 않는다
      try {
        if (!editingSubmission || editingSubmission.status === 'draft') {
          // AI 안전조치 조회 + 텔레그램 ID 조회 병렬 실행
          const aiAdvicePromise = !formData.noWorkCheck && formData.todayWork
            ? fetch('/api/ai/tbm-safety-advice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  todayWork: formData.todayWork,
                  personnelInput: formData.personnelInput,
                  equipmentInput: formData.equipmentInput
                })
              }).then(res => res.json()).then(data => data.success ? data.advice : null).catch(() => null)
            : Promise.resolve(null)

          const projectDataPromise = supabase
            .from('projects')
            .select('client_telegram_id, client_app_code')
            .eq('id', projectId)
            .single()

          const [aiAdvice, { data: projectData }] = await Promise.all([
            aiAdvicePromise,
            projectDataPromise
          ])

          if (projectData?.client_telegram_id || projectData?.client_app_code) {
            // 텔레그램 메시지 구성
            let telegramMessage = `📋 <b>TBM 일일안전교육 제출</b>\n\n` +
              `🏗️ <b>현장:</b> ${projectName}\n` +
              `📅 <b>교육일자:</b> ${formData.educationDate}\n` +
              `⏰ <b>교육시간:</b> ${formData.educationStartTime} ~ ${formData.educationEndTime}\n\n` +
              `📝 <b>금일작업:</b>\n${formData.todayWork}\n\n` +
              `📖 <b>교육내용:</b>\n${formData.otherRemarks || '(미입력)'}\n\n` +
              `👷 <b>투입인원${formData.personnelTotalCount ? ` (총 ${formData.personnelTotalCount}명)` : ''}:</b>\n${formData.personnelInput || '(미입력)'}\n\n` +
              `🚜 <b>투입장비:</b>\n${formData.equipmentInput || '(미입력)'}\n\n` +
              `👤 <b>작성자:</b> ${formData.name}\n` +
              `📞 <b>연락처:</b> ${formData.contact}`

            // AI 안전조치 확인사항 추가
            if (aiAdvice) {
              telegramMessage += `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
                `🤖 <b>AI 안전조치 확인사항 (공사감독용)</b>\n\n` +
                `${aiAdvice}\n` +
                `━━━━━━━━━━━━━━━━━━━━`
            }

            telegramMessage += (educationPhotoUrl ? `\n\n📷 교육사진이 첨부되었습니다.` : '') +
              `\n\n🔗 <a href="https://safesys.vercel.app/">AI안전관리 시스템 바로가기</a>`

            await fetch('/api/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'direct',
                chatId: projectData.client_telegram_id || undefined,
                projectId,
                recipients: { client: true, contractor: false },
                message: telegramMessage
              })
            })

            if (educationPhotoUrl && (projectData.client_telegram_id || projectData.client_app_code)) {
              await fetch('/api/telegram/photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chatId: projectData.client_telegram_id || undefined,
                  projectId,
                  recipients: { client: true, contractor: false },
                  photoUrl: educationPhotoUrl,
                  caption: `${projectName} - ${formData.educationDate} TBM 교육사진`
                })
              })
            }
          }
        }
      } catch (telegramError) {
        console.error('텔레그램 발송 오류:', telegramError)
        // 텔레그램 발송 실패해도 제출은 성공 처리
      }

      alert('성공적으로 제출되었습니다!')
      onSuccess?.()
      onClose()
    } catch (error: any) {
      console.error('제출 오류:', error)
      alert(`제출 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // 중점위험요인 드롭다운 옵션 = 비어있지 않은 잠재위험요인 값
  const potentialRiskOptions = [formData.potentialRisk1, formData.potentialRisk2, formData.potentialRisk3]
    .map(v => (v || '').trim())
    .filter(Boolean)

  // 저장된 값이 현재 옵션에 없으면(예: 옛 기록 수정) 값 유실 방지를 위해 옵션에 포함
  const riskOptionsWith = (current: string) => {
    const c = (current || '').trim()
    return c && !potentialRiskOptions.includes(c) ? [...potentialRiskOptions, c] : potentialRiskOptions
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* 헤더 */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex flex-col md:flex-row md:items-center gap-2 flex-1 min-w-0">
              <h2 className="text-sm md:text-xl font-bold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis tracking-tighter md:tracking-normal leading-tight">
                {projectName}
              </h2>
              <span className={`${editingSubmission?.status === 'draft' ? 'bg-purple-600' : 'bg-blue-600'} text-white px-2 py-1 rounded-md text-sm md:text-lg font-semibold whitespace-nowrap self-start md:self-auto`}>
                {editingSubmission?.status === 'draft' ? '임시저장 수정' : editingSubmission ? 'TBM수정' : 'TBM제출'}
              </span>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 본문 */}
          <div className="p-6 space-y-6">
            {/* 금일작업 */}
            <div>
              <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2 mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  금일작업 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleLoadRecentData}
                    className="text-sm p-2 md:px-4 md:py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
                    title="최근일자 가져오기"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="md:hidden">최근가져오기</span>
                    <span className="hidden md:inline">최근일자 가져오기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-sm p-2 md:px-4 md:py-2 text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors flex items-center gap-2 font-medium shadow-sm"
                    title="모두 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden md:inline">모두 삭제</span>
                  </button>
                </div>
              </div>
              {recentCandidates.length > 0 && (
                <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-2">
                    최근 제출자 선택 ({recentCandidates.length}명)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentCandidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => applyRecentData(c)}
                        className="px-3 py-1.5 text-sm bg-white border border-blue-300 rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                      >
                        <span className="font-medium">{c.reporter_name || '미입력'}</span>
                        {c.meeting_date && (
                          <span className="text-xs text-gray-400">{c.meeting_date}</span>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRecentCandidates([])}
                      className="px-3 py-1.5 text-sm text-gray-500 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="noWorkCheck"
                  checked={formData.noWorkCheck}
                  onChange={(e) => handleNoWorkCheck(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="noWorkCheck" className="ml-2 text-sm text-gray-700">
                  작업없음
                </label>
              </div>
              <textarea
                value={formData.todayWork}
                onChange={(e) => handleInputChange('todayWork', e.target.value)}
                disabled={formData.noWorkCheck}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
                placeholder="예시)&#13;&#10;- 개거 수로관 부설 50m&#13;&#10;- 기초 콘크리트 버림타설 10m^2"
                rows={4}
              />
            </div>

            {/* 실제 작업주소 */}
            {!formData.noWorkCheck && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  실제 작업주소 <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col md:flex-row gap-2 mb-2">
                  <input
                    type="text"
                    value={formData.baseAddress}
                    readOnly
                    className="flex-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 sm:text-sm"
                    placeholder="주소 검색 버튼을 클릭하세요"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddressSearch(true)}
                    className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <MapPin className="h-4 w-4" />
                    주소검색
                  </button>
                </div>
                <input
                  type="text"
                  value={formData.detailAddress}
                  onChange={(e) => handleInputChange('detailAddress', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="상세 주소 (선택사항)"
                />
              </div>
            )}

            {/* 투입인원/신규근로자/투입장비 */}
            {!formData.noWorkCheck && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    투입인원
                  </label>
                  <textarea
                    value={formData.personnelInput}
                    onChange={(e) => handlePersonnelInputChange(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    rows={3}
                    placeholder="예시)&#13;&#10;- 작업반장 1명"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                      총 투입인원(명)
                    </label>
                    <input
                      type="number"
                      value={formData.personnelTotalCount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                        setPersonnelTotalManual(true)
                        setFormData(prev => ({ ...prev, personnelTotalCount: value }))
                      }}
                      className="w-20 px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      min="0"
                      max="9999"
                      placeholder="0"
                    />
                    {personnelTotalManual ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPersonnelTotalManual(false)
                          setFormData(prev => ({
                            ...prev,
                            personnelTotalCount: parsePersonnelCount(prev.personnelInput)
                              ? String(parsePersonnelCount(prev.personnelInput))
                              : ''
                          }))
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                        title="내역에서 자동 계산"
                      >
                        <RefreshCw className="h-3 w-3" /> 자동
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 whitespace-nowrap">자동 계산됨</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    신규 근로자(명) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">신규근로자:출근 첫날</p>
                  <input
                    type="number"
                    value={formData.newWorkerCount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
                      handleInputChange('newWorkerCount', value)
                    }}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                    min="0"
                    max="999"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    투입장비
                  </label>
                  <textarea
                    value={formData.equipmentInput}
                    onChange={(e) => handleInputChange('equipmentInput', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    rows={3}
                    placeholder="예시)&#13;&#10;- 굴삭기 0.2 1대"
                  />
                </div>
              </div>
            )}

            {/* 위험공종/CCTV */}
            {!formData.noWorkCheck && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    위험공종 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.riskWorkType}
                    onChange={(e) => handleInputChange('riskWorkType', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                  >
                    <option value="">위험공종 선택</option>
                    <option value="고소작업">2.0m 이상 고소작업</option>
                    <option value="굴착가설">1.5m 이상 굴착·가설공사</option>
                    <option value="철골구조물">철골 구조물 공사</option>
                    <option value="도장공사">2.0m이상 외부 도장공사</option>
                    <option value="승강기">승강기 설치공사</option>
                    <option value="취수탑">취수탑 공사</option>
                    <option value="복통잠관">복통, 잠관 공사</option>
                    <option value="기타">이외의 작업계획서작성 대상</option>
                    <option value="해당없음">해당없음</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    금일 안전관리 CCTV 사용여부 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="cctvUsage"
                        value="사용중"
                        checked={formData.cctvUsage === '사용중'}
                        onChange={(e) => handleInputChange('cctvUsage', e.target.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        required
                      />
                      <span className="ml-2 text-sm text-gray-700">사용중</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="cctvUsage"
                        value="사용안함"
                        checked={formData.cctvUsage === '사용안함'}
                        onChange={(e) => handleInputChange('cctvUsage', e.target.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        required
                      />
                      <span className="ml-2 text-sm text-gray-700">사용안함</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 교육 일자/시간 */}
            {!formData.noWorkCheck && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    교육 일자 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.educationDate}
                    onChange={(e) => handleInputChange('educationDate', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      교육시작시간 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={formData.educationStartTime}
                      onChange={(e) => handleInputChange('educationStartTime', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      교육종료시간 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={formData.educationEndTime}
                      onChange={(e) => handleInputChange('educationEndTime', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 교육사진 */}
            {!formData.noWorkCheck && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  교육사진 (1개) <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  required
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full md:w-auto md:px-8 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <Camera className="h-5 w-5" />
                    {formData.educationPhoto ? '사진 변경하기' : '사진 선택하기'}
                  </button>
                </div>
                {!formData.educationPhoto && (
                  <p className="mt-2 text-xs text-amber-700 text-center">
                    최근 동일한 사진은 제출 불가 합니다
                  </p>
                )}
                {formData.educationPhoto && (
                  <p className="mt-2 text-sm text-gray-600">
                    선택된 파일: {formData.educationPhoto.name}
                  </p>
                )}
              </div>
            )}

            {/* AI 작성 버튼 */}
            {!formData.noWorkCheck && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">AI 위험요인 분석</h3>
                  <div className="text-xs text-gray-500">powered by {aiModel}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAIWrite}
                    disabled={aiLoading || !formData.todayWork}
                    className="flex-1 md:flex-1 px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        AI 분석 중...
                      </>
                    ) : (
                      'AI 작성하기'
                    )}
                  </button>
                  <div className="flex-1 md:flex-1">
                    <TbmRiskLinkButton
                      projectId={projectId}
                      todayWork={formData.todayWork}
                      disabled={aiLoading}
                      onApply={handleRiskLinkApply}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAI}
                    disabled={aiLoading}
                    className="flex-1 md:flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    AI답변 삭제하기
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  금일작업, 투입인원, 투입장비를 입력한 후 AI 작성하기 버튼을 클릭하세요.
                </p>

                {/* 외국인 근로자 지원 - TTS 음성 읽기 */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">🌏 외국인 근로자 지원 (음성 읽기)</h4>
                    <span className="text-xs text-gray-400">powered by OpenAI TTS</span>
                  </div>
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
                      disabled={ttsLoading || isReading || !formData.potentialRisk1}
                      className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {ttsLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          번역 중...
                        </>
                      ) : isReading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          읽는 중...
                        </>
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

            {/* 잠재위험요인/대책 */}
            {!formData.noWorkCheck && (
              <>
                {/* 대책 사진 선택용 공용 input (촬영/앨범) — 대상 대책 번호는 solutionPhotoSlotRef가 들고 있다 */}
                <input
                  ref={solutionCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleSolutionPhotoChange}
                  className="hidden"
                />
                <input
                  ref={solutionAlbumRef}
                  type="file"
                  accept="image/*,.heic,.HEIC"
                  onChange={handleSolutionPhotoChange}
                  className="hidden"
                />

                {[1, 2, 3].map(num => (
                  <div key={num}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          잠재위험요인 {num} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData[`potentialRisk${num}` as keyof FormData] as string}
                          onChange={(e) => handleInputChange(`potentialRisk${num}` as keyof FormData, e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                          maxLength={50}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          대책 {num} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData[`solution${num}` as keyof FormData] as string}
                          onChange={(e) => handleInputChange(`solution${num}` as keyof FormData, e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                          maxLength={50}
                        />
                      </div>
                    </div>
                    {/* 대책 사진 (선택) — 모바일은 행 전체 가운데, 데스크탑(sm 이상)은 대책 칸 아래 배치 */}
                    <div className="mt-2 sm:grid sm:grid-cols-2 sm:gap-4">
                      <div className="hidden sm:block" />
                      <div>
                        <div className="flex items-center justify-center sm:justify-start gap-1">
                          <button
                            type="button"
                            onClick={() => openSolutionPhotoPicker(num, 'camera')}
                            className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            <Camera className="h-3 w-3 mr-1" />
                            촬영
                          </button>
                          <button
                            type="button"
                            onClick={() => openSolutionPhotoPicker(num, 'album')}
                            className="flex items-center px-2 py-1 text-xs bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                          >
                            <Upload className="h-3 w-3 mr-1" />
                            앨범
                          </button>
                          <span className="text-[11px] text-gray-400">사진 업로드는 필수가 아닙니다</span>
                        </div>
                        <div className="flex justify-center sm:justify-start">
                          {renderSolutionPhotoPreview(num)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 중점위험요인 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      중점위험요인 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.mainRiskSelection}
                      onChange={(e) => handleMainRiskChange(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                    >
                      <option value="">잠재위험요인 중 선택</option>
                      {riskOptionsWith(formData.mainRiskSelection).map((opt, idx) => (
                        <option key={idx} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      중점위험요인 대책 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.mainRiskSolution}
                      readOnly
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-700 sm:text-sm"
                      placeholder="중점위험요인 선택 시 자동 입력"
                    />
                  </div>
                </div>

                {/* 잠재위험요소 (위 잠재위험요인과 연관된 단순 위험 요소 — 대책 아님) */}
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map(num => (
                    <div key={num}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        잠재위험요소 {num} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData[`riskFactor${num}` as keyof FormData] as string}
                        onChange={(e) => handleInputChange(`riskFactor${num}` as keyof FormData, e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        required
                        maxLength={50}
                      />
                    </div>
                  ))}
                </div>

                {/* 기타사항 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    기타사항(교육내용, 제안제도, 아차사고 등) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">내용은 7줄로 제한됩니다(위험성평가 전달은 꼭 입력).</p>
                  <textarea
                    value={formData.otherRemarks}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n')
                      if (lines.length <= 7) {
                        handleInputChange('otherRemarks', e.target.value)
                      }
                    }}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                    rows={7}
                  />
                </div>
              </>
            )}

            {/* 성함/연락처 */}
            {!formData.noWorkCheck && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    성함 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">현장소장님 또는 교육담당자 이름</p>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    연락처 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">자동으로 하이픈(-)이 입력됩니다</p>
                  <input
                    type="text"
                    value={formData.contact}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^0-9]/g, '')
                      if (value.length <= 3) {
                        // 3자리 이하는 그대로
                      } else if (value.length <= 7) {
                        value = value.slice(0, 3) + '-' + value.slice(3)
                      } else {
                        value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11)
                      }
                      handleInputChange('contact', value)
                    }}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                    maxLength={13}
                    placeholder="010-1234-1234"
                  />
                </div>
              </div>
            )}

            {/* 제출 버튼 */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDraftSave}
                disabled={loading}
                className="px-4 py-2 text-sm text-purple-700 bg-purple-50 border border-purple-300 rounded-md hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    임시저장 중...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    임시저장
                  </>
                )}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {editingSubmission && editingSubmission.status !== 'draft' ? '수정 중...' : '제출 중...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {editingSubmission && editingSubmission.status !== 'draft' ? '수정' : '제출'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 서명 패드 모달 */}
      {
        showSignaturePad && (
          <SignaturePad
            onSave={(signature) => {
              handleInputChange('signature', signature)
              setShowSignaturePad(false)
              // useEffect에서 pendingSubmit과 signature를 감지하여 자동 제출 처리
            }}
            onCancel={() => {
              setShowSignaturePad(false)
              setPendingSubmit(false)
            }}
          />
        )
      }

      {/* 대책 사진 편집 모달 (회전/크롭) */}
      {editingSolutionPhoto && (
        <ImageEditor
          imageUrl={editingSolutionPhoto.dataUrl}
          onSave={handleSolutionPhotoEditSave}
          onClose={() => setEditingSolutionPhoto(null)}
        />
      )}

      {/* 주소 검색 모달 */}
      <VworldMapAddressModal
        isOpen={showAddressSearch}
        onClose={() => setShowAddressSearch(false)}
        onAddressSelect={(address, coords) => {
          handleInputChange('baseAddress', address)
          if (coords) {
            handleInputChange('latitude', coords.lat.toString())
            handleInputChange('longitude', coords.lng.toString())
          }
          setShowAddressSearch(false)
        }}
      />

      {/* TTS 음성 읽기 모달 */}
      {
        showTtsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">🎵 음성 읽기</h3>
                <button
                  onClick={closeTtsModal}
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
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
        )
      }
    </>
  )
}

export default TBMSubmissionModal
