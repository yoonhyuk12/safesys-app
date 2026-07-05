'use client'

import React, { useState, useEffect } from 'react'
import { Mail, Lock, Eye, EyeOff, Share2, Phone, ChevronDown } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import FindIdModal from './FindIdModal'
import FindPasswordModal from './FindPasswordModal'
import PWAInstallButton from '../common/PWAInstallButton'
import CopyrightNotice from '../common/CopyrightNotice'

// 방패 아이콘 컴포넌트
const ShieldIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 4L6 12V22C6 32.5 12.5 42.26 24 44C35.5 42.26 42 32.5 42 22V12L24 4Z"
      fill="#2563eb"
      stroke="#1d4ed8"
      strokeWidth="2" />
    <path d="M16 24L22 30L32 18"
      stroke="#ffffff"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none" />
  </svg>
)

const LoginForm: React.FC = () => {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [showFindIdModal, setShowFindIdModal] = useState(false)
  const [showFindPasswordModal, setShowFindPasswordModal] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [showSignupNotice, setShowSignupNotice] = useState(false)

  // 회원가입 안내 팝업 확인 후 약관 페이지로 이동
  const handleProceedSignup = () => {
    sessionStorage.removeItem('termsAgreed')
    setShowSignupNotice(false)
    router.push('/signup/terms')
  }

  // 공유 기능
  const handleShare = async () => {
    const shareUrl = 'https://safesys.vercel.app/'
    const shareData = {
      title: '안전관리 시스템',
      text: '안전관리 시스템에 접속해보세요',
      url: shareUrl
    }

    try {
      // Web Share API가 지원되는 경우 (주로 모바일)
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData)
      } else {
        // 클립보드에 복사
        await navigator.clipboard.writeText(shareUrl)
        alert('링크가 클립보드에 복사되었습니다!')
      }
    } catch (error) {
      // 클립보드 API가 지원되지 않는 경우 fallback
      const textArea = document.createElement('textarea')
      textArea.value = shareUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('링크가 클립보드에 복사되었습니다!')
    }
  }

  // 컴포넌트 마운트 시 저장된 로그인 정보 불러오기
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail')
    const savedPassword = localStorage.getItem('rememberedPassword')
    if (savedEmail) {
      setFormData(prev => ({
        ...prev,
        email: savedEmail,
        password: savedPassword || ''
      }))
      setRememberMe(true)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // 실제 Supabase 로그인 사용 (이메일은 소문자로 변환)
      const lowerEmail = formData.email.toLowerCase()
      await signIn(lowerEmail, formData.password)

      // 로그인 성공 시 로그인 정보 저장/삭제 처리
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', lowerEmail)
        localStorage.setItem('rememberedPassword', formData.password)
      } else {
        localStorage.removeItem('rememberedEmail')
        localStorage.removeItem('rememberedPassword')
      }

      router.push('/')
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.name === 'email' ? e.target.value.toLowerCase() : e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* 로그인 컨테이너 */}
        <div className="bg-white rounded-2xl shadow-xl px-8 py-10 space-y-8 relative">
          {/* 공유 버튼 - 좌측 상단 */}
          <button
            onClick={handleShare}
            className="absolute top-4 left-4 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="공유하기"
          >
            <Share2 className="h-5 w-5" />
          </button>

          {/* PWA 설치 버튼 */}
          <PWAInstallButton />
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
              계정에 로그인하세요
            </p>
          </div>

          {/* 로그인 폼 */}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  이메일 주소
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="이메일을 입력하세요"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-3 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="비밀번호를 입력하세요"
                    value={formData.password}
                    onChange={handleChange}
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
            </div>

            {/* 로그인 정보 기억하기 체크박스 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  로그인 정보 기억하기
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error.split(/(010-\d{4}-\d{4})/).map((part, i) =>
                  /^010-\d{4}-\d{4}$/.test(part) ? (
                    <a key={i} href={`tel:${part.replace(/-/g, '')}`} className="underline font-semibold text-red-800">{part}</a>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  '로그인'
                )}
              </button>
            </div>

            {/* 아이디/비밀번호 찾기 */}
            <div className="text-center space-y-2">
              <div className="flex justify-center space-x-4">
                <button
                  type="button"
                  className="text-gray-600 hover:text-gray-800 text-sm transition-colors"
                  onClick={() => setShowFindIdModal(true)}
                >
                  아이디 찾기
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  className="text-gray-600 hover:text-gray-800 text-sm transition-colors"
                  onClick={() => setShowFindPasswordModal(true)}
                >
                  비밀번호 찾기
                </button>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                className="text-blue-600 hover:text-blue-500 text-sm font-medium transition-colors"
                onClick={() => setShowSignupNotice(true)}
              >
                계정이 없으신가요? 회원가입
              </button>
              <div className="mt-3 text-xs text-gray-500">
                <button
                  type="button"
                  onClick={() => setShowContacts(prev => !prev)}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors"
                  aria-expanded={showContacts}
                >
                  <span>문의처 {showContacts ? '닫기' : '펼치기'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showContacts ? 'rotate-180' : ''}`} />
                </button>
                {showContacts && (
                  <div className="mt-2 flex justify-center text-left">
                    <div className="inline-block space-y-1">
                      <div className="flex items-center gap-1"><span className="w-8">문의 :</span> <span>경기 윤혁 차장</span> <a href="tel:01026765472" className="text-gray-500 hover:text-blue-500 transition-colors" title="010-2676-5472"><Phone className="w-3.5 h-3.5" /></a></div>
                      <div className="flex items-center gap-1"><span className="w-8"></span> <span>충남 임원일 차장</span> <a href="tel:01047581293" className="text-gray-500 hover:text-blue-500 transition-colors" title="010-4758-1293"><Phone className="w-3.5 h-3.5" /></a></div>
                      <div className="flex items-center gap-1"><span className="w-8"></span> <span>경북 이준엽 과장</span> <a href="tel:01064405054" className="text-gray-500 hover:text-blue-500 transition-colors" title="010-6440-5054"><Phone className="w-3.5 h-3.5" /></a></div>
                      <div className="flex items-center gap-1"><span className="w-8"></span> <span>강원 배환성 차장</span> <a href="tel:01089521521" className="text-gray-500 hover:text-blue-500 transition-colors" title="010-8952-1521"><Phone className="w-3.5 h-3.5" /></a></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>

          <CopyrightNotice />
          <p className="mt-2 text-center text-xs text-gray-500">
            개인정보책임자 : 윤혁(010-2676-5472)
          </p>
        </div>

        {/* 아이디 찾기 모달 */}
        <FindIdModal
          isOpen={showFindIdModal}
          onClose={() => setShowFindIdModal(false)}
        />

        {/* 비밀번호 찾기 모달 */}
        <FindPasswordModal
          isOpen={showFindPasswordModal}
          onClose={() => setShowFindPasswordModal(false)}
        />

        {/* 회원가입 안내 팝업 */}
        {showSignupNotice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowSignupNotice(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-center text-lg font-bold text-gray-900">
                회원가입 안내
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-gray-700">
                이 시스템은 건설공사 사업관리방식 검토기준 및 업무수행지침
                <br />
                제16조(건설사업정보관리시스템 운영), 제48조(보고서 작성, 제출)에 따라 구축한 <span className="font-semibold">&ldquo;건설사업관리업무 보고시스템&rdquo;</span>이다.
              </p>
              <div className="mt-3 text-center">
                <a
                  href="https://www.law.go.kr/%ED%96%89%EC%A0%95%EA%B7%9C%EC%B9%99/%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%EC%82%AC%EC%97%85%EA%B4%80%EB%A6%AC%EB%B0%A9%EC%8B%9D%EA%B2%80%ED%86%A0%EA%B8%B0%EC%A4%80%EB%B0%8F%EC%97%85%EB%AC%B4%EC%88%98%ED%96%89%EC%A7%80%EC%B9%A8/%EC%A0%9C48%EC%A1%B0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-500 underline transition-colors"
                >
                  제48조 (국가법령정보센터)
                </a>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  onClick={() => setShowSignupNotice(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  onClick={handleProceedSignup}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LoginForm 