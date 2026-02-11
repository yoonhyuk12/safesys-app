'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Users, CheckCircle, XCircle, Clock, AlertTriangle, Camera, Upload, Shield, ChevronRight, ChevronLeft, PenTool, RotateCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import WorkerSignaturePad from '@/components/ui/WorkerSignaturePad'

interface TokenData {
  id: string
  project_id: string
  token: string
  expires_at: string
  used_at: string | null
  project?: {
    project_name: string
    managing_branch: string
  }
}

export default function WorkerSelfRegisterPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'success'>('loading')

  const [step, setStep] = useState(1) // 1: 정보입력, 2: 동의
  const [formData, setFormData] = useState({
    name: '',
    birth_date: '',
    registration_number: '',
    completion_date: '',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    is_foreigner: false
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrSuccess, setOcrSuccess] = useState(false)

  // 동의 체크박스 상태
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeThirdParty, setAgreeThirdParty] = useState(false)

  // 신분증 사진 관련 상태
  const [idCardImage, setIdCardImage] = useState<string | null>(null)
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const idCardInputRef = useRef<HTMLInputElement>(null)
  const idCardCameraRef = useRef<HTMLInputElement>(null)

  // 이수증 사진 관련 상태
  const [certificateImage, setCertificateImage] = useState<string | null>(null)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const certificateInputRef = useRef<HTMLInputElement>(null)
  const certificateCameraRef = useRef<HTMLInputElement>(null)

  // 이미지 회전 상태
  const [certificateRotation, setCertificateRotation] = useState(0)
  const [idCardRotation, setIdCardRotation] = useState(0)

  // 서명 관련 상태
  const [showSignature, setShowSignature] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)

  // 토큰 유효성 검사
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setStatus('invalid')
        setError('유효하지 않은 링크입니다.')
        setLoading(false)
        return
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('worker_registration_tokens')
          .select(`
            *,
            project:projects(project_name, managing_branch)
          `)
          .eq('token', token)
          .single()

        if (fetchError) {
          console.error('토큰 페치 에러:', fetchError)
          setStatus('invalid')
          setError(`토큰 조회 중 오류가 발생했습니다: ${fetchError.message}`)
          setLoading(false)
          return
        }

        if (!data) {
          console.error('토큰 데이터 없음:', token)
          setStatus('invalid')
          setError('유효하지 않은 등록 링크입니다. (데이터를 찾을 수 없음)')
          setLoading(false)
          return
        }

        console.log('토큰 데이터 로드 성공:', data)

        // 이미 사용된 토큰인지 확인
        if (data.used_at) {
          setStatus('used')
          setError('이미 사용된 등록 링크입니다.')
          setLoading(false)
          return
        }

        // 만료 확인
        const expiresAt = new Date(data.expires_at)
        const now = new Date()
        console.log('만료 시간:', expiresAt.toISOString(), '현재 시간:', now.toISOString())

        if (expiresAt < now) {
          setStatus('expired')
          setError(`등록 링크가 만료되었습니다. (만료: ${expiresAt.toLocaleString()})`)
          setLoading(false)
          return
        }

        setTokenData(data)
        setStatus('valid')
      } catch (err: any) {
        console.error('토큰 검증 예외 발생:', err)
        setStatus('invalid')
        setError(`링크 검증 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`)
      } finally {
        setLoading(false)
      }
    }

    validateToken()
  }, [token])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // 신분증 이미지 선택 처리
  const handleIdCardSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setFormError('이미지 파일만 업로드 가능합니다.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setFormError('이미지 크기는 10MB 이하여야 합니다.')
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

  // 이수증 이미지 선택 처리 (OCR 포함)
  const handleCertificateSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setFormError('이미지 파일만 업로드 가능합니다.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setFormError('이미지 크기는 10MB 이하여야 합니다.')
      return
    }

    setFormError('')
    setOcrLoading(true)
    setOcrSuccess(false)
    setCertificateFile(file)

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64Image = event.target?.result as string
      setCertificateImage(base64Image)

      try {
        const response = await fetch('/api/ai/ocr-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        })

        const data = await response.json()

        if (response.ok && data.success) {
          setFormData(prev => ({
            ...prev,
            name: data.data.name || prev.name,
            birth_date: data.data.birth_date || prev.birth_date,
            registration_number: data.data.registration_number || prev.registration_number,
            completion_date: data.data.completion_date || prev.completion_date
          }))
          setOcrSuccess(true)
        }
      } catch (err) {
        console.error('OCR 오류:', err)
      } finally {
        setOcrLoading(false)
      }
    }
    reader.readAsDataURL(file)

    e.target.value = ''
  }

  // 다음 단계로
  const handleNext = () => {
    setFormError('')

    if (!formData.name.trim()) {
      setFormError('이름을 입력해주세요.')
      return
    }

    if (!formData.birth_date) {
      setFormError('생년월일을 입력해주세요.')
      return
    }

    if (!formData.registration_number.trim()) {
      setFormError('등록번호를 입력해주세요.')
      return
    }

    if (!formData.completion_date) {
      setFormError('이수일자를 입력해주세요.')
      return
    }

    if (!certificateImage) {
      setFormError('안전교육 이수증 사진을 등록해주세요.')
      return
    }

    if (!idCardImage) {
      setFormError('신분증 사진을 등록해주세요.')
      return
    }

    setStep(2)
  }

  // 서명 버튼 클릭
  const handleSignClick = () => {
    setFormError('')

    if (!agreePrivacy || !agreeThirdParty) {
      setFormError('모든 항목에 동의해주세요.')
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

  // 실제 제출 함수
  const submitWorker = async (signature: string) => {
    setFormError('')

    if (!tokenData) {
      setFormError('유효하지 않은 요청입니다.')
      return
    }

    try {
      setSubmitting(true)

      let idCardUrl: string | null = null
      let certificateUrl: string | null = null
      let signatureUrl: string | null = null

      // 신분증 이미지 업로드
      if (idCardFile) {
        const fileExt = idCardFile.name.split('.').pop()
        const fileName = `${tokenData.project_id}/id_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

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

      // 이수증 이미지 업로드
      if (certificateFile) {
        const fileExt = certificateFile.name.split('.').pop()
        const fileName = `${tokenData.project_id}/cert_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

        console.log('이수증 파일 업로드 시작:', fileName)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('worker-id-cards')
          .upload(fileName, certificateFile, {
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
        certificateUrl = urlData.publicUrl
        console.log('이수증 업로드 성공:', certificateUrl)
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

        const fileName = `${tokenData.project_id}/sig_${Date.now()}_${Math.random().toString(36).substring(7)}.png`

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

      // 근로자 등록
      const { error: insertError } = await supabase
        .from('workers')
        .insert({
          project_id: tokenData.project_id,
          name: formData.name.trim(),
          birth_date: formData.birth_date,
          registration_number: formData.registration_number.trim() || null,
          completion_date: formData.completion_date || null,
          contract_start_date: formData.contract_start_date || null,
          contract_end_date: formData.contract_end_date || null,
          id_card_url: idCardUrl,
          certificate_card_url: certificateUrl,
          signature_url: signatureUrl,
          is_foreigner: formData.is_foreigner,
          privacy_agreed: true,
          privacy_agreed_at: new Date().toISOString()
        })

      if (insertError) throw insertError

      // 토큰 사용 처리
      await supabase
        .from('worker_registration_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tokenData.id)

      setStatus('success')
    } catch (err: any) {
      console.error('근로자 등록 실패:', err)
      setFormError(err.message || '등록에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  // 로딩 상태
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">링크 확인 중...</p>
        </div>
      </div>
    )
  }

  // 오류 상태 (무효, 만료, 사용됨)
  if (status === 'invalid' || status === 'expired' || status === 'used') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-red-100">
            {status === 'expired' ? (
              <Clock className="h-8 w-8 text-red-600" />
            ) : status === 'used' ? (
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            ) : (
              <XCircle className="h-8 w-8 text-red-600" />
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {status === 'expired' ? '링크 만료' : status === 'used' ? '이미 사용됨' : '유효하지 않은 링크'}
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            관리자에게 새로운 QR 코드를 요청해주세요.
          </p>
        </div>
      </div>
    )
  }

  // 등록 성공 상태
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">등록 완료</h1>
          <p className="text-gray-600 mb-2">
            <span className="font-semibold">{formData.name}</span>님의 정보가
          </p>
          <p className="text-gray-600 mb-6">
            성공적으로 등록되었습니다.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-500">등록 현장</p>
            <p className="font-medium text-gray-900">{tokenData?.project?.project_name}</p>
          </div>
          <p className="text-sm text-gray-500">
            이 페이지를 닫아도 됩니다.
          </p>
        </div>
      </div>
    )
  }

  // 유효한 토큰 - 등록 폼 표시
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">근로자 등록</h1>
              <p className="text-sm text-blue-200">
                {step === 1 ? '1단계: 정보 입력' : '2단계: 개인정보 동의'}
              </p>
            </div>
          </div>
          {tokenData?.project && (
            <div className="mt-3 bg-white/10 rounded-lg px-3 py-2">
              <p className="text-sm text-blue-100">등록 현장</p>
              <p className="font-medium">{tokenData.project.project_name}</p>
              <p className="text-sm text-blue-200">{tokenData.project.managing_branch}</p>
            </div>
          )}
        </div>

        {/* 1단계: 정보 입력 */}
        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="p-6 space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}

            {/* 이수증 + 신분증 사진 (수평 배치) */}
            <div className="grid grid-cols-2 gap-3">
              {/* 이수증 사진 */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-xl p-3">
                <div className="text-center relative overflow-hidden">
                  {ocrLoading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-1" />
                      <p className="text-[10px] font-bold text-blue-600">분석 중...</p>
                    </div>
                  )}

                  {certificateImage ? (
                    <div className="space-y-2">
                      <div className="relative inline-block">
                        <img src={certificateImage} alt="이수증" className="max-h-24 rounded-lg shadow-sm mx-auto transition-transform" style={{ transform: `rotate(${certificateRotation}deg)` }} />
                        <button type="button" onClick={() => setCertificateRotation(prev => (prev + 90) % 360)}
                          className="absolute top-0 right-0 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors">
                          <RotateCw className="h-3 w-3" />
                        </button>
                        {ocrSuccess && (
                          <div className="absolute -top-2 -left-2 bg-green-500 text-white rounded-full p-1">
                            <CheckCircle className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-green-600 font-medium">{ocrSuccess ? '자동입력 완료' : '업로드 완료'}</p>
                      <button type="button" onClick={() => { setCertificateImage(null); setCertificateFile(null); setOcrSuccess(false); setCertificateRotation(0); }}
                        className="text-xs text-gray-500 hover:text-red-500">다시 촬영</button>
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
                        <button type="button" onClick={() => certificateCameraRef.current?.click()} disabled={ocrLoading}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          <Camera className="h-3.5 w-3.5" />촬영
                        </button>
                        <button type="button" onClick={() => certificateInputRef.current?.click()} disabled={ocrLoading}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50">
                          <Upload className="h-3.5 w-3.5" />앨범
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <input ref={certificateCameraRef} type="file" accept="image/*" capture="environment" onChange={handleCertificateSelect} className="hidden" />
                <input ref={certificateInputRef} type="file" accept="image/*" onChange={handleCertificateSelect} className="hidden" />
              </div>

              {/* 신분증 사진 */}
              <div className="bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-dashed border-gray-200 rounded-xl p-3">
                <div className="text-center">
                  {idCardImage ? (
                    <div className="space-y-2">
                      <div className="relative inline-block">
                        <img src={idCardImage} alt="신분증" className="max-h-24 rounded-lg shadow-sm mx-auto transition-transform" style={{ transform: `rotate(${idCardRotation}deg)` }} />
                        <button type="button" onClick={() => setIdCardRotation(prev => (prev + 90) % 360)}
                          className="absolute top-0 right-0 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors">
                          <RotateCw className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-xs text-green-600 font-medium">업로드 완료</p>
                      <button type="button" onClick={() => { setIdCardImage(null); setIdCardFile(null); setIdCardRotation(0); }}
                        className="text-xs text-gray-500 hover:text-red-500">삭제</button>
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

            <div className="h-px bg-gray-100 my-4" />

            {/* 이름 */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="홍길동"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  국적 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-full">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, is_foreigner: false }))}
                    className={`flex-1 px-3 py-3 text-sm font-medium transition-colors ${!formData.is_foreigner
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    내국인
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, is_foreigner: true }))}
                    className={`flex-1 px-3 py-3 text-sm font-medium transition-colors ${formData.is_foreigner
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    외국인
                  </button>
                </div>
              </div>
            </div>

            {/* 생년월일 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                생년월일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="birth_date"
                value={formData.birth_date}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              />
            </div>

            {/* 등록번호 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                등록번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="registration_number"
                value={formData.registration_number}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="등록번호 입력"
              />
            </div>

            {/* 이수일자 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                안전교육 이수일자 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="completion_date"
                value={formData.completion_date}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 근로계약 기간 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                근로계약 기간 <span className="text-gray-400">(선택)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  name="contract_start_date"
                  value={formData.contract_start_date}
                  onChange={handleChange}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-gray-500">~</span>
                <input
                  type="date"
                  name="contract_end_date"
                  value={formData.contract_end_date}
                  onChange={handleChange}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* 다음 버튼 */}
            <button
              type="submit"
              className="w-full py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mt-6"
            >
              다음 <ChevronRight className="h-5 w-5" />
            </button>
          </form>
        )}

        {/* 2단계: 개인정보 동의 */}
        {step === 2 && (
          <form className="p-6 space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Shield className="h-10 w-10 text-blue-600" />
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
                  <input
                    type="checkbox"
                    checked={agreePrivacy}
                    onChange={(e) => setAgreePrivacy(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
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
                  <input
                    type="checkbox"
                    checked={agreeThirdParty}
                    onChange={(e) => setAgreeThirdParty(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">위 내용에 동의합니다</span>
                </label>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 flex items-center justify-center gap-1 py-4 border border-gray-300 text-gray-700 text-lg font-semibold rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" /> 이전
              </button>
              <button
                type="button"
                onClick={handleSignClick}
                disabled={submitting || !agreePrivacy || !agreeThirdParty}
                className="flex-1 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                    등록 중...
                  </>
                ) : (
                  <>
                    <PenTool className="h-5 w-5" />
                    서명하기
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 서명 모달 */}
      {showSignature && (
        <WorkerSignaturePad
          onSave={handleSignatureSave}
          onCancel={() => setShowSignature(false)}
          isSaving={submitting}
        />
      )}
    </div>
  )
}
