'use client'

import React, { useState, useEffect } from 'react'
import { Mail, Lock, Eye, EyeOff, Building, Phone, UserCircle, CheckCircle2, XCircle } from 'lucide-react'
import { signUp, SignUpData, ConsentData, checkEmailExists } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import ShieldIcon from '@/components/ui/ShieldIcon'

// IP 주소 가져오기 (외부 API 사용)
const getClientIP = async (): Promise<string | null> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    return data.ip
  } catch (error) {
    console.error('Failed to get IP address:', error)
    return null
  }
}

const SignUpForm: React.FC = () => {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<SignUpData>({
    email: '',
    password: '',
    full_name: '',
    phone_number: '',
    position: '',
    role: '발주청',
    hq_division: '',
    branch_division: '',
    company_name: null
  })
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [availableBranches, setAvailableBranches] = useState<string[]>([])
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [isEmailAvailable, setIsEmailAvailable] = useState<boolean | null>(null)

  // 이메일 유효성 검사
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    // 영문만 허용 (임시)
    const englishOnlyRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return emailRegex.test(email) && englishOnlyRegex.test(email)
  }

  // 비밀번호 유효성 검사
  const validatePassword = (password: string) => {
    // 최소 6자 이상
    return password.length >= 6
  }

  // 이메일 중복 확인
  const checkEmail = async (email: string) => {
    const lowerEmail = email.toLowerCase()
    if (!validateEmail(lowerEmail)) {
      setEmailError('유효한 이메일 주소를 입력해주세요.')
      setIsEmailAvailable(null)
      return
    }

    // 발주청은 @ekr.or.kr 도메인만 허용
    if (formData.role === '발주청' && !lowerEmail.endsWith('@ekr.or.kr')) {
      setEmailError('발주청은 회사메일(@ekr.or.kr)로만 가입이 가능합니다.')
      setIsEmailAvailable(null)
      return
    }

    setIsCheckingEmail(true)
    setEmailError('')
    try {
      const exists = await checkEmailExists(lowerEmail)
      setIsEmailAvailable(!exists)
      if (exists) {
        setEmailError('이미 사용 중인 이메일입니다.')
      }
    } catch (err: any) {
      console.error('Email check failed:', err)
      // 에러 발생 시 사용 가능으로 처리 (네트워크 오류 등의 경우)
      setIsEmailAvailable(true)
      setEmailError('')
    } finally {
      setIsCheckingEmail(false)
    }
  }

  // 이메일 입력 완료 시 중복 확인
  const handleEmailBlur = () => {
    if (formData.email) {
      checkEmail(formData.email)
    }
  }

  // 비밀번호 확인
  const handlePasswordConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const confirmValue = e.target.value
    setPasswordConfirm(confirmValue)

    if (formData.password !== confirmValue) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
    } else {
      setPasswordError('')
    }
  }

  // 비밀번호 입력 시 유효성 검사
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setFormData(prev => ({ ...prev, password: newPassword }))

    if (!validatePassword(newPassword)) {
      setPasswordError('비밀번호는 최소 6자 이상이어야 합니다.')
    } else if (passwordConfirm && newPassword !== passwordConfirm) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
    } else {
      setPasswordError('')
    }
  }

  // 전화번호 포맷팅 함수
  const formatPhoneNumber = (value: string) => {
    // 숫자만 추출
    const numbers = value.replace(/[^\d]/g, '')

    // 길이에 따라 포맷팅
    if (numbers.length <= 3) {
      return numbers
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    } else {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
    }
  }

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedNumber = formatPhoneNumber(e.target.value)
    setFormData(prev => ({
      ...prev,
      phone_number: formattedNumber
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 환경변수 확인
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setError('Supabase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요.')
      return
    }

    // 유효성 검사
    const lowerEmail = formData.email.toLowerCase()
    if (!validateEmail(lowerEmail)) {
      setError('유효한 이메일 주소를 입력해주세요.')
      return
    }

    // 발주청은 @ekr.or.kr 도메인만 허용 (자동완성으로 인한 중복 도메인 방지)
    if (formData.role === '발주청' && !lowerEmail.endsWith('@ekr.or.kr')) {
      setError('발주청은 회사메일(@ekr.or.kr)로만 가입이 가능합니다. 이메일 주소를 다시 확인해주세요.')
      return
    }

    if (!validatePassword(formData.password)) {
      setError('올바른 형식의 비밀번호를 입력해주세요.')
      return
    }

    if (formData.password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    if (!isEmailAvailable) {
      setError('사용할 수 없는 이메일입니다.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 발주청인 경우 company_name을 null로 설정
      const lowerEmail = formData.email.toLowerCase()
      const signUpData = {
        ...formData,
        email: lowerEmail,
        company_name: formData.role === '발주청' ? null : formData.company_name
      }

      // 동의 정보 수집
      let consentData: ConsentData | undefined
      const consentInfoStr = sessionStorage.getItem('consentInfo')
      if (consentInfoStr) {
        try {
          const consentInfo = JSON.parse(consentInfoStr)
          const clientIP = await getClientIP()
          consentData = {
            consent_version: consentInfo.version,
            consent_ip: clientIP,
            consent_device: consentInfo.userAgent,
            consented_at: consentInfo.agreedAt
          }
        } catch (e) {
          console.error('Failed to parse consent info:', e)
        }
      }

      await signUp(lowerEmail, formData.password, signUpData, consentData)

      // 회원가입 완료 후 sessionStorage 클리어
      sessionStorage.removeItem('termsAgreed')
      sessionStorage.removeItem('consentInfo')

      // 이메일 인증 안내 메시지
      alert('회원가입이 완료되었습니다.\n\n이메일을 확인하여 인증을 완료해주세요.\n(스팸메일함도 확인해주세요)\n\n⚠️ 24시간 이내에 이메일 인증을 완료하지 않으면\n계정이 자동 삭제됩니다.\n\n인증 후 로그인이 가능합니다.')

      // 로그인 페이지로 이동
      router.push('/login')
    } catch (err: any) {
      console.error('Signup failed:', err)
      if (err.message.includes('ISO-8859-1')) {
        setError('현재 한글 입력에 문제가 있습니다. 영문으로 입력해주세요.')
      } else if (err.message.includes('Too Many Requests') || err.message.includes('18 seconds')) {
        setError('보안을 위해 잠시 기다려주세요. 18초 후에 다시 시도해주세요.')
      } else if (err.message.includes('User already registered')) {
        setError('이미 가입된 이메일입니다. 다른 이메일을 사용해주세요.')
      } else {
        setError(err.message || '회원가입에 실패했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // 발주청이 아닌 경우 본부/지사 정보 초기화
      ...(name === 'role' && value !== '발주청' ? {
        hq_division: '',
        branch_division: ''
      } : {})
    }))
  }

  // 본부 선택 시 지사 목록 업데이트
  useEffect(() => {
    if (formData.hq_division) {
      setAvailableBranches(BRANCH_OPTIONS[formData.hq_division] || [])
      // 현재 선택된 지사가 새로운 본부의 지사 목록에 없는 경우 초기화
      if (!BRANCH_OPTIONS[formData.hq_division]?.includes(formData.branch_division)) {
        setFormData(prev => ({
          ...prev,
          branch_division: ''
        }))
      }
    } else {
      setAvailableBranches([])
    }
  }, [formData.hq_division])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* 회원가입 컨테이너 */}
        <div className="bg-white rounded-2xl shadow-xl px-8 py-10 space-y-6">
          {/* 헤더 */}
          <div>
            <div className="flex justify-center">
              <div className="bg-blue-100 rounded-full p-4">
                <ShieldIcon />
              </div>
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              안전관리 시스템
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              새 계정을 만드세요
            </p>
          </div>

          {/* 회원가입 폼 */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* 역할 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">역할</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      role: '발주청',
                      ...(prev.role !== '발주청' ? {
                        hq_division: '',
                        branch_division: ''
                      } : {})
                    }))}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${formData.role === '발주청'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    발주청
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      role: '감리단',
                      hq_division: '',
                      branch_division: ''
                    }))}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${formData.role === '감리단'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    감리단
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      role: '시공사',
                      hq_division: '',
                      branch_division: ''
                    }))}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${formData.role === '시공사'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    시공사
                  </button>
                </div>
              </div>

              {/* 이메일 입력 */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">이메일 주소</label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder={formData.role === '발주청' ? "@ekr.or.kr" : "이메일을 입력하세요"}
                    value={formData.email}
                    onChange={(e) => {
                      let lowerEmail = e.target.value.toLowerCase()
                      const prevEmail = formData.email

                      // 발주청 역할이고 "@"를 입력했을 때 자동으로 도메인 추가
                      // 단, 삭제 중(새 값이 이전 값보다 짧음)일 때는 자동완성 하지 않음
                      if (formData.role === '발주청' && lowerEmail.length > prevEmail.length) {
                        // "@"가 입력되었고, 아직 도메인이 완성되지 않은 경우
                        if (lowerEmail.endsWith('@') && !lowerEmail.includes('@ekr.or.kr')) {
                          lowerEmail = lowerEmail + 'ekr.or.kr'
                        }
                      }

                      setFormData(prev => ({ ...prev, email: lowerEmail }))
                      setIsEmailAvailable(null)
                      setEmailError('')
                    }}
                    onBlur={handleEmailBlur}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  {isCheckingEmail ? (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    </div>
                  ) : isEmailAvailable !== null && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      {isEmailAvailable ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                {formData.role === '발주청' && (
                  <p className="mt-2 text-sm text-blue-600">회사메일(@ekr.or.kr)로 가입이 가능합니다</p>
                )}
                {emailError && (
                  <p className="mt-2 text-sm text-red-600">{emailError}</p>
                )}
              </div>

              {/* 비밀번호 입력 */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="영문, 숫자, 특수문자 포함 8자 이상"
                    value={formData.password}
                    onChange={handlePasswordChange}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-600 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700 mb-2">비밀번호 확인</label>
                <div className="relative">
                  <input
                    id="passwordConfirm"
                    name="passwordConfirm"
                    type={showPasswordConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="비밀번호를 다시 입력하세요"
                    value={passwordConfirm}
                    onChange={handlePasswordConfirmChange}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-600 transition-colors"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  >
                    {showPasswordConfirm ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                )}
              </div>

              {/* 이름 입력 */}
              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">이름</label>
                <div className="relative">
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="이름을 입력하세요"
                    value={formData.full_name}
                    onChange={handleChange}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserCircle className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* 전화번호 입력 */}
              <div>
                <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-2">전화번호</label>
                <div className="relative">
                  <input
                    id="phone_number"
                    name="phone_number"
                    type="tel"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="010-1234-5678"
                    value={formData.phone_number}
                    onChange={handlePhoneNumberChange}
                    maxLength={13}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* 직급 입력 */}
              <div>
                <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-2">직급</label>
                <div className="relative">
                  <input
                    id="position"
                    name="position"
                    type="text"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="직급을 입력하세요"
                    value={formData.position}
                    onChange={handleChange}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserCircle className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* 발주청인 경우에만 본부/지사 입력 표시 */}
              {formData.role === '발주청' && (
                <>
                  {/* 본부 선택 */}
                  <div>
                    <label htmlFor="hq_division" className="block text-sm font-medium text-gray-700 mb-2">소속 본부</label>
                    <div className="relative">
                      <select
                        id="hq_division"
                        name="hq_division"
                        required
                        className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        value={formData.hq_division}
                        onChange={handleChange}
                      >
                        <option value="">본부를 선택하세요</option>
                        {HEADQUARTERS_OPTIONS.map((hq) => (
                          <option key={hq} value={hq}>{hq}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </div>

                  {/* 지사 선택 */}
                  <div>
                    <label htmlFor="branch_division" className="block text-sm font-medium text-gray-700 mb-2">소속 지사</label>
                    <div className="relative">
                      <select
                        id="branch_division"
                        name="branch_division"
                        required
                        className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                        value={formData.branch_division}
                        onChange={handleChange}
                        disabled={!formData.hq_division}
                      >
                        <option value="">지사를 선택하세요</option>
                        {availableBranches.map((branch) => (
                          <option key={branch} value={branch}>{branch}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 회사명 입력 - 발주청이 아닌 경우에만 표시 */}
              {formData.role !== '발주청' && (
                <div>
                  <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-2">회사명</label>
                  <div className="relative">
                    <input
                      id="company_name"
                      name="company_name"
                      type="text"
                      required={true}
                      className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="회사명을 입력하세요"
                      value={formData.company_name || ''}
                      onChange={handleChange}
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || !!passwordError || !isEmailAvailable}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  '회원가입'
                )}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                className="text-blue-600 hover:text-blue-500 text-sm font-medium transition-colors"
                onClick={() => router.push('/login')}
              >
                이미 계정이 있으신가요? 로그인
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SignUpForm 