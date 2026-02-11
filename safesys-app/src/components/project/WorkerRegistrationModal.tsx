'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Users, QrCode, RefreshCw, UserPlus, Camera, Upload, Loader2, CheckCircle, ChevronRight, ChevronLeft, Shield, PenTool, RotateCw, Pencil } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import WorkerSignaturePad from '@/components/ui/WorkerSignaturePad'
import ImageEditor from '@/components/ui/ImageEditor'

interface WorkerRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: string
  workerToEdit?: {
    id: string
    name: string
    birth_date: string
    registration_number: string
    completion_date: string
    contract_start_date: string | null
    contract_end_date: string | null
    is_foreigner: boolean
    visa_type: string | null
    id_card_url: string | null
    certificate_card_url: string | null
    signature_url: string | null
  } | null
}

// 랜덤 토큰 생성 함수
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

export default function WorkerRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  workerToEdit
}: WorkerRegistrationModalProps) {
  const [activeTab, setActiveTab] = useState<'qr' | 'manual'>('qr')
  const [step, setStep] = useState(1) // 1: 정보입력, 2: 동의
  const [qrToken, setQrToken] = useState<string>('')
  const [qrLoading, setQrLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState<string>('')

  const [formData, setFormData] = useState({
    name: '',
    birth_date: '',
    registration_number: '',
    completion_date: '',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    is_foreigner: false,
    visa_type: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 동의 체크박스 상태
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeThirdParty, setAgreeThirdParty] = useState(false)

  // 이미지 OCR 관련 상태
  const [cardImage, setCardImage] = useState<string | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrSuccess, setOcrSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // 신분증 사진 관련 상태
  const [idCardImage, setIdCardImage] = useState<string | null>(null)
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const idCardInputRef = useRef<HTMLInputElement>(null)
  const idCardCameraRef = useRef<HTMLInputElement>(null)

  // 이미지 회전 상태
  const [cardRotation, setCardRotation] = useState(0)
  const [idCardRotation, setIdCardRotation] = useState(0)

  // 이미지 편집 모달 상태
  const [editingImage, setEditingImage] = useState<'card' | 'idCard' | null>(null)

  // 서명 관련 상태
  const [showSignature, setShowSignature] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)

  // QR 토큰 생성
  const generateQrToken = useCallback(async () => {
    if (!projectId) return

    try {
      setQrLoading(true)
      setError('')

      const token = generateToken()
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + 30) // 30분 후 만료

      const { error: insertError } = await supabase
        .from('worker_registration_tokens')
        .insert({
          project_id: projectId,
          token: token,
          expires_at: expiresAt.toISOString()
        })

      if (insertError) {
        console.error('토큰 저장 실패:', insertError)
        setError('QR 코드 생성에 실패했습니다. 관리자에게 문의하세요.')
        return
      }

      setQrToken(token)

      const baseUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}`
        : ''
      setQrUrl(`${baseUrl}/worker-register/${token}`)

    } catch (err: any) {
      console.error('QR 토큰 생성 실패:', err)
      setError('QR 코드 생성에 실패했습니다.')
    } finally {
      setQrLoading(false)
    }
  }, [projectId])

  // 모달이 열릴 때 QR 토큰 생성
  useEffect(() => {
    if (isOpen && activeTab === 'qr' && !qrToken) {
      generateQrToken()
    }
  }, [isOpen, activeTab, qrToken, generateQrToken])

  // 모달이 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setError('')
      setAgreePrivacy(false)
      setAgreeThirdParty(false)

      if (workerToEdit) {
        // 수정 모드: 데이터 채우기
        setActiveTab('manual')
        setStep(1)
        setFormData({
          name: workerToEdit.name,
          birth_date: workerToEdit.birth_date,
          registration_number: workerToEdit.registration_number || '',
          completion_date: workerToEdit.completion_date,
          contract_start_date: workerToEdit.contract_start_date || new Date().toISOString().split('T')[0],
          contract_end_date: workerToEdit.contract_end_date || '',
          is_foreigner: workerToEdit.is_foreigner,
          visa_type: workerToEdit.visa_type || ''
        })

        // 이미지 미리보기 설정
        setCardImage(workerToEdit.certificate_card_url)
        setIdCardImage(workerToEdit.id_card_url)
        // 기존 이미지가 있으면 성공 표시
        if (workerToEdit.certificate_card_url) {
          setOcrSuccess(true)
        }

        setCardFile(null)
        setIdCardFile(null)
      } else {
        // 등록 모드: 초기화
        setQrToken('')
        setQrUrl('')
        setFormData({
          name: '',
          birth_date: '',
          registration_number: '',
          completion_date: '',
          contract_start_date: new Date().toISOString().split('T')[0],
          contract_end_date: '',
          is_foreigner: false,
          visa_type: ''
        })
        setActiveTab('qr')
        setStep(1)
        setCardImage(null)
        setCardFile(null)
        setOcrSuccess(false)
        setIdCardImage(null)
        setIdCardFile(null)
      }
    }
  }, [isOpen, workerToEdit])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // 이미지 파일 처리 (OCR)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('이미지 크기는 10MB 이하여야 합니다.')
      return
    }

    try {
      setError('')
      setOcrLoading(true)
      setOcrSuccess(false)
      setCardFile(file)

      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64Image = event.target?.result as string
        setCardImage(base64Image)

        try {
          const response = await fetch('/api/ai/ocr-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            setError(data.error || '카드 인식에 실패했습니다.')
            setOcrLoading(false)
            return
          }

          setFormData(prev => ({
            ...prev,
            name: data.data.name || prev.name,
            birth_date: data.data.birth_date || prev.birth_date,
            registration_number: data.data.registration_number || prev.registration_number,
            completion_date: data.data.completion_date || prev.completion_date
          }))

          setOcrSuccess(true)
        } catch (err) {
          console.error('OCR 오류:', err)
          setError('카드 인식 중 오류가 발생했습니다.')
        } finally {
          setOcrLoading(false)
        }
      }

      reader.readAsDataURL(file)
    } catch (err) {
      console.error('이미지 처리 오류:', err)
      setError('이미지 처리 중 오류가 발생했습니다.')
      setOcrLoading(false)
    }

    e.target.value = ''
  }

  // 신분증 이미지 선택 처리
  const handleIdCardSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('이미지 크기는 10MB 이하여야 합니다.')
      return
    }

    setIdCardFile(file)

    const reader = new FileReader()
    reader.onload = (event) => {
      setIdCardImage(event.target?.result as string)
    }
    reader.readAsDataURL(file)

    e.target.value = ''
  }

  // 다음 단계로
  const handleNext = () => {
    setError('')

    if (!formData.name.trim()) {
      setError('이름을 입력해주세요.')
      return
    }

    if (!formData.birth_date) {
      setError('생년월일을 입력해주세요.')
      return
    }

    if (!formData.registration_number.trim()) {
      setError('등록번호를 입력해주세요.')
      return
    }

    if (!formData.completion_date) {
      setError('이수일자를 입력해주세요.')
      return
    }

    if (!idCardImage) {
      setError('신분증 사진을 등록해주세요.')
      return
    }

    // 수정 모드: 개인정보 동의/서명 건너뛰고 바로 저장
    if (workerToEdit) {
      submitWorker(null)
      return
    }

    setStep(2)
  }

  // 서명 버튼 클릭
  const handleSignClick = () => {
    setError('')

    if (!agreePrivacy || !agreeThirdParty) {
      setError('모든 항목에 동의해주세요.')
      return
    }

    // 수정 모드일 때는 서명 단계 건너뛰고 바로 수정
    if (workerToEdit) {
      submitWorker(null)
      return
    }

    setShowSignature(true)
  }

  // 서명 저장
  const handleSignatureSave = async (signature: string) => {
    setSignatureImage(signature)
    setShowSignature(false)
    // 서명 후 자동으로 제출
    await submitWorker(signature)
  }

  // 실제 제출 함수 (등록 또는 수정)
  const submitWorker = async (signature: string | null) => {
    setError('')

    try {
      setLoading(true)

      let idCardUrl: string | null = null
      let certificateCardUrl: string | null = null
      let signatureUrl: string | null = null

      // 신분증 사진 업로드
      if (idCardFile) {
        const fileExt = idCardFile.name.split('.').pop()
        const fileName = `${projectId}/id_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

        console.log('신분증 파일 업로드 시작:', fileName)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('worker-id-cards')
          .upload(fileName, idCardFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('신분증 업로드 실패:', uploadError)
          throw new Error(`신분증 사진 업로드에 실패했습니다: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('worker-id-cards')
          .getPublicUrl(fileName)
        idCardUrl = urlData.publicUrl
        console.log('신분증 업로드 성공:', idCardUrl)
      }

      // 기초안전보건교육 이수증 사진 업로드
      if (cardFile) {
        const fileExt = cardFile.name.split('.').pop()
        const fileName = `${projectId}/cert_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

        console.log('이수증 파일 업로드 시작:', fileName)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('worker-id-cards')
          .upload(fileName, cardFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('이수증 업로드 실패:', uploadError)
          throw new Error(`이수증 사진 업로드에 실패했습니다: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('worker-id-cards')
          .getPublicUrl(fileName)
        certificateCardUrl = urlData.publicUrl
        console.log('이수증 업로드 성공:', certificateCardUrl)
      }

      // 서명 이미지 업로드
      if (signature) {
        const base64Data = signature.split(',')[1]
        const byteCharacters = atob(base64Data)
        const byteArrays = []
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArrays.push(byteCharacters.charCodeAt(i))
        }
        const blob = new Blob([new Uint8Array(byteArrays)], { type: 'image/png' })
        const signatureFile = new File([blob], 'signature.png', { type: 'image/png' })

        const fileName = `${projectId}/sig_${Date.now()}_${Math.random().toString(36).substring(7)}.png`

        console.log('서명 파일 업로드 시작:', fileName)
        const { error: uploadError } = await supabase.storage
          .from('worker-id-cards')
          .upload(fileName, signatureFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('서명 업로드 실패:', uploadError)
          throw new Error(`서명 업로드에 실패했습니다: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('worker-id-cards')
          .getPublicUrl(fileName)
        signatureUrl = urlData.publicUrl
        console.log('서명 업로드 성공:', signatureUrl)
      }


      // 수정 모드인 경우
      if (workerToEdit) {
        const updateData: any = {
          name: formData.name.trim(),
          birth_date: formData.birth_date,
          registration_number: formData.registration_number.trim() || null,
          completion_date: formData.completion_date || null,
          contract_start_date: formData.contract_start_date || null,
          contract_end_date: formData.contract_end_date || null,
          is_foreigner: formData.is_foreigner,
          visa_type: formData.is_foreigner ? (formData.visa_type || null) : null,
        }

        // 이미지가 변경된 경우에만 URL 업데이트
        if (idCardUrl) updateData.id_card_url = idCardUrl
        if (certificateCardUrl) updateData.certificate_card_url = certificateCardUrl
        if (signatureUrl) updateData.signature_url = signatureUrl

        const { error: updateError } = await supabase
          .from('workers')
          .update(updateData)
          .eq('id', workerToEdit.id)

        if (updateError) throw updateError
      } else {
        // 신규 등록인 경우
        const { error: insertError } = await supabase
          .from('workers')
          .insert({
            project_id: projectId,
            name: formData.name.trim(),
            birth_date: formData.birth_date,
            registration_number: formData.registration_number.trim() || null,
            completion_date: formData.completion_date || null,
            contract_start_date: formData.contract_start_date || null,
            contract_end_date: formData.contract_end_date || null,
            id_card_url: idCardUrl,
            certificate_card_url: certificateCardUrl,
            signature_url: signatureUrl,
            is_foreigner: formData.is_foreigner,
            visa_type: formData.is_foreigner ? (formData.visa_type || null) : null,
            privacy_agreed: true,
            privacy_agreed_at: new Date().toISOString()
          })

        if (insertError) throw insertError
      }

      // 폼 초기화
      setFormData({
        name: '',
        birth_date: '',
        registration_number: '',
        completion_date: '',
        contract_start_date: new Date().toISOString().split('T')[0],
        contract_end_date: '',
        is_foreigner: false,
        visa_type: ''
      })
      setCardImage(null)
      setCardFile(null)
      setOcrSuccess(false)
      setIdCardImage(null)
      setIdCardFile(null)
      setAgreePrivacy(false)
      setAgreeThirdParty(false)
      setStep(1)

      onSuccess()
    } catch (err: any) {
      console.error('근로자 저장 실패:', err)
      setError(err.message || '근로자 저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 이미지 편집 저장
  const handleImageEditorSave = (blob: Blob) => {
    const file = new File([blob], `edited_${Date.now()}.jpg`, { type: 'image/jpeg' })
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      if (editingImage === 'card') {
        setCardImage(base64)
        setCardFile(file)
        setCardRotation(0)
      } else if (editingImage === 'idCard') {
        setIdCardImage(base64)
        setIdCardFile(file)
        setIdCardRotation(0)
      }
      setEditingImage(null)
    }
    reader.readAsDataURL(blob)
  }

  const handleClose = () => {
    onClose()
  }

  const handleRefreshQr = () => {
    setQrToken('')
    setQrUrl('')
    generateQrToken()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{workerToEdit ? '근로자 정보 수정' : '근로자 등록'}</h2>
              {activeTab === 'manual' && !workerToEdit && (
                <p className="text-xs text-gray-500">
                  {step === 1 ? '1단계: 정보 입력' : '2단계: 개인정보 동의'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 탭 선택 (수정 모드일 때는 숨김) */}
        {!workerToEdit && (
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => { setActiveTab('qr'); setStep(1); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'qr'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <QrCode className="h-4 w-4" />
              QR 코드 등록
            </button>
            <button
              onClick={() => { setActiveTab('manual'); setStep(1); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'manual'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <UserPlus className="h-4 w-4" />
              직접 등록
            </button>
          </div>
        )}

        {/* QR 코드 탭 */}
        {activeTab === 'qr' && (
          <div className="p-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="text-center">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 inline-block mb-4">
                {qrLoading ? (
                  <div className="w-48 h-48 flex items-center justify-center">
                    <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                  </div>
                ) : qrUrl ? (
                  <QRCodeSVG value={qrUrl} size={192} level="M" includeMargin={false} />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-gray-100 rounded-lg">
                    <QrCode className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium text-gray-900">
                  근로자가 QR코드를 스캔하여 직접 등록합니다
                </p>
                <p className="text-xs text-gray-500">QR 코드는 30분간 유효합니다</p>
              </div>

              <button
                onClick={handleRefreshQr}
                disabled={qrLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${qrLoading ? 'animate-spin' : ''}`} />
                새 QR 코드 생성
              </button>
            </div>
          </div>
        )}

        {/* 직접 등록 탭 - 1단계: 정보 입력 */}
        {activeTab === 'manual' && step === 1 && (
          <div className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* 카드 촬영/업로드 영역 + 신분증 사진 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 기초안전보건교육 이수증 */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-xl p-3">
                <div className="text-center">
                  {cardImage ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-blue-700 mb-1">이수증</p>
                      <div className="relative inline-block">
                        <img src={cardImage} alt="업로드된 카드" className="max-h-24 rounded-lg shadow-sm mx-auto transition-transform" style={{ transform: `rotate(${cardRotation}deg)` }} />
                        <button type="button" onClick={() => setEditingImage('card')}
                          className="absolute top-0 right-0 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                          title="사진 편집">
                          <Pencil className="h-3 w-3" />
                        </button>
                        {ocrLoading && (
                          <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center rounded-lg">
                            <div className="flex items-center gap-2 text-blue-600">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span className="text-xs font-medium">분석 중...</span>
                            </div>
                          </div>
                        )}
                        {ocrSuccess && !ocrLoading && (
                          <div className="absolute -top-2 -left-2 bg-green-500 rounded-full p-1">
                            <CheckCircle className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      {ocrSuccess && <p className="text-xs text-green-600 font-medium">자동 입력 완료</p>}
                      <button type="button" onClick={() => { setCardImage(null); setCardFile(null); setOcrSuccess(false); setCardRotation(0); }} className="text-xs text-gray-500 hover:text-gray-700">
                        다시 촬영
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-1">
                          <Camera className="h-5 w-5 text-blue-600" />
                        </div>
                        <p className="text-xs font-medium text-gray-900">이수증 촬영</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">자동 정보 입력</p>
                      </div>
                      <div className="flex gap-1.5 justify-center">
                        <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={ocrLoading}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          <Camera className="h-3.5 w-3.5" />촬영
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={ocrLoading}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50">
                          <Upload className="h-3.5 w-3.5" />앨범
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </div>

              {/* 신분증 사진 */}
              <div className="bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-dashed border-gray-200 rounded-xl p-3">
                <div className="text-center">
                  {idCardImage ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700 mb-1">신분증</p>
                      <div className="relative inline-block">
                        <img src={idCardImage} alt="신분증" className="max-h-24 rounded-lg shadow-sm mx-auto transition-transform" style={{ transform: `rotate(${idCardRotation}deg)` }} />
                        <button type="button" onClick={() => setEditingImage('idCard')}
                          className="absolute top-0 right-0 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                          title="사진 편집">
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-xs text-green-600 font-medium">업로드 완료</p>
                      <button type="button" onClick={() => { setIdCardImage(null); setIdCardFile(null); setIdCardRotation(0); }} className="text-xs text-gray-500 hover:text-red-500">
                        삭제
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-1">
                          <Camera className="h-5 w-5 text-gray-600" />
                        </div>
                        <p className="text-xs font-medium text-gray-900">신분증 사진 <span className="text-red-500">*</span></p>
                        <p className="text-[10px] text-gray-500 mt-0.5">주민등록증/면허증</p>
                      </div>
                      <div className="flex gap-1.5 justify-center">
                        <button type="button" onClick={() => idCardCameraRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-600 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors">
                          <Camera className="h-3.5 w-3.5" />촬영
                        </button>
                        <button type="button" onClick={() => idCardInputRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
                          <Upload className="h-3.5 w-3.5" />앨범
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <input ref={idCardCameraRef} type="file" accept="image/*" capture="environment" onChange={handleIdCardSelect} className="hidden" />
                <input ref={idCardInputRef} type="file" accept="image/*" onChange={handleIdCardSelect} className="hidden" />
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">또는 직접 입력</span></div>
            </div>

            {/* 이름 */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
                <input type="text" name="name" value={formData.name} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="근로자 이름" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">국적 <span className="text-red-500">*</span></label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-full">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, is_foreigner: false, visa_type: '' }))}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${!formData.is_foreigner
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    내국인
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, is_foreigner: true }))}
                    className={`px-3 py-2 text-sm font-medium transition-colors flex-1 ${formData.is_foreigner
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    외국인
                  </button>
                </div>
                {formData.is_foreigner && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">취업비자</label>
                    <select
                      value={formData.visa_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, visa_type: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">선택</option>
                      <option value="E-9">E-9 (비전문취업)</option>
                      <option value="H-2">H-2 (방문취업)</option>
                      <option value="F-4">F-4 (재외동포)</option>
                      <option value="F-2">F-2 (거주)</option>
                      <option value="F-5">F-5 (영주)</option>
                      <option value="F-6">F-6 (결혼이민)</option>
                      <option value="D-2">D-2 (유학)</option>
                      <option value="C-3">C-3 (단기방문)</option>
                      <option value="C-4">C-4 (단기취업)</option>
                      <option value="D-4">D-4 (일반연수)</option>
                      <option value="F-1">F-1 (방문동거)</option>
                      <option value="F-3">F-3 (동반)</option>
                      <option value="기타">기타</option>
                    </select>
                    {formData.visa_type && (
                      <div className={`mt-1.5 p-2 rounded-lg text-xs leading-relaxed ${
                        ['C-3', 'C-4', 'D-4', 'F-1', 'F-3'].includes(formData.visa_type)
                          ? 'bg-red-50 border border-red-200 text-red-700'
                          : 'bg-blue-50 border border-blue-200 text-blue-700'
                      }`}>
                        {(formData.visa_type === 'E-9' || formData.visa_type === 'F-2' || formData.visa_type === 'F-5' || formData.visa_type === 'F-6') && (
                          <><span className="font-semibold text-green-700">가능</span>: 건설채용, 단순노무<br/><span className="font-semibold text-red-600">불가</span>: 기능직</>
                        )}
                        {formData.visa_type === 'H-2' && (
                          <><span className="font-semibold text-green-700">가능</span>: 건설채용, 특례고용가능확인서 제출</>
                        )}
                        {formData.visa_type === 'F-4' && (
                          <><span className="font-semibold text-green-700">가능</span>: 건설채용, 기능직(자격필요)<br/><span className="font-semibold text-red-600">불가</span>: 단순노무</>
                        )}
                        {formData.visa_type === 'D-2' && (
                          <><span className="font-semibold text-green-700">가능</span>: 건설채용, 출입국관리사무소의 건설업 취업확인을 받은 경우</>
                        )}
                        {['C-3', 'C-4', 'D-4', 'F-1', 'F-3'].includes(formData.visa_type) && (
                          <span className="font-semibold text-red-600">건설취업 불가</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 생년월일 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">생년월일 <span className="text-red-500">*</span></label>
              <input type="date" name="birth_date" value={formData.birth_date} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* 등록번호 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">등록번호 <span className="text-red-500">*</span></label>
              <input type="text" name="registration_number" value={formData.registration_number} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="등록번호 입력" />
            </div>

            {/* 이수일자 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이수일자 <span className="text-red-500">*</span></label>
              <input type="date" name="completion_date" value={formData.completion_date} onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* 근로계약 기간 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">근로계약 기간 <span className="text-gray-400">(선택)</span></label>
              <div className="flex items-center gap-2">
                <input type="date" name="contract_start_date" value={formData.contract_start_date} onChange={handleChange}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <span className="text-gray-500">~</span>
                <input type="date" name="contract_end_date" value={formData.contract_end_date} onChange={handleChange}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>


            {/* 버튼 */}
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button type="button" onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                {workerToEdit ? '수정 완료' : '다음'} {(!workerToEdit && <ChevronRight className="h-4 w-4" />)}
              </button>
            </div>
          </div>
        )}

        {/* 수정 모드에서는 2단계(개인정보 동의) 생략 */}


        {/* 직접 등록 탭 - 2단계: 개인정보 동의 */}
        {activeTab === 'manual' && step === 2 && (
          <div className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">개인정보 수집 및 제3자 제공 동의</p>
                <p className="text-sm text-gray-600">안전관리를 위해 아래 내용에 동의해주세요</p>
              </div>
            </div>

            {/* 개인정보 수집 동의 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="font-medium text-gray-900 text-sm">건설현장 안전 CCTV 촬영에 대한 개인정보 수집 동의</p>
              </div>
              <div className="p-4 text-sm text-gray-600 max-h-40 overflow-y-auto space-y-2">
                <p><strong>1. 수집 목적</strong></p>
                <p>건설현장 내 안전사고 예방, 작업환경 모니터링, 비상상황 대응 및 안전교육 자료 활용</p>
                <p><strong>2. 수집 항목</strong></p>
                <p>CCTV 영상정보(얼굴, 신체, 행동 등), 촬영 일시 및 장소</p>
                <p><strong>3. 보유 및 이용 기간</strong></p>
                <p>촬영일로부터 30일간 보관 후 자동 삭제 (단, 안전사고 발생 시 관련 영상은 사고 처리 완료 시까지 보관)</p>
                <p><strong>4. 동의 거부 권리</strong></p>
                <p>귀하는 개인정보 수집에 대한 동의를 거부할 권리가 있습니다. 다만, 동의하지 않을 경우 해당 건설현장 출입이 제한될 수 있습니다.</p>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-900">위 내용에 동의합니다</span>
                </label>
              </div>
            </div>

            {/* 제3자 제공 동의 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="font-medium text-gray-900 text-sm">제3자 개인정보 제공 동의</p>
              </div>
              <div className="p-4 text-sm text-gray-600 max-h-40 overflow-y-auto space-y-2">
                <p><strong>1. 제공받는 자</strong></p>
                <p>한국농어촌공사</p>
                <p><strong>2. 제공 목적</strong></p>
                <p>건설현장 안전관리 감독, 안전교육 이수 현황 관리, 재해예방 및 사고분석</p>
                <p><strong>3. 제공 항목</strong></p>
                <p>영상정보(CCTV 촬영본), 안전교육 이수정보(교육일자, 교육내용, 이수증 정보), 근로자 인적사항(성명, 생년월일)</p>
                <p><strong>4. 보유 및 이용 기간</strong></p>
                <p>공사 완료 후 5년간 보관 (관련 법령에 따른 보존 기간 준수)</p>
                <p><strong>5. 동의 거부 권리</strong></p>
                <p>귀하는 제3자 정보제공에 대한 동의를 거부할 권리가 있습니다. 다만, 동의하지 않을 경우 해당 건설현장 근무가 제한될 수 있습니다.</p>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreeThirdParty} onChange={(e) => setAgreeThirdParty(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-900">위 내용에 동의합니다</span>
                </label>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setStep(1)}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <ChevronLeft className="h-4 w-4" /> 이전
              </button>
              <button type="button" onClick={handleSignClick} disabled={loading || !agreePrivacy || !agreeThirdParty}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    등록 중...
                  </>
                ) : (
                  <>
                    <PenTool className="h-4 w-4" />
                    서명하기
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 서명 모달 */}
      {showSignature && (
        <WorkerSignaturePad
          onSave={handleSignatureSave}
          onCancel={() => setShowSignature(false)}
          isSaving={loading}
        />
      )}

      {/* 이미지 편집 모달 */}
      {editingImage && (editingImage === 'card' ? cardImage : idCardImage) && (
        <ImageEditor
          imageUrl={(editingImage === 'card' ? cardImage : idCardImage)!}
          onSave={handleImageEditorSave}
          onClose={() => setEditingImage(null)}
        />
      )}
    </div>
  )
}
