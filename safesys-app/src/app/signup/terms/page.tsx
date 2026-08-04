'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TermsAndConditions from '@/components/auth/TermsAndConditions'
import ShieldIcon from '@/components/ui/ShieldIcon'
import CopyrightNotice from '@/components/common/CopyrightNotice'

// 현재 약관 버전 (날짜 형식)
const CONSENT_VERSION = '2026-01-05'

export default function TermsPage() {
  const router = useRouter()
  const [termsAgreed, setTermsAgreed] = useState(false)

  const handleContinue = () => {
    if (termsAgreed) {
      // 한국 시간(KST) 기준으로 동의 일시 생성
      const now = new Date()
      const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)) // UTC+9
      const koreaISOString = koreaTime.toISOString().replace('Z', '+09:00')
      
      // 약관 동의 정보를 sessionStorage에 저장
      const consentInfo = {
        version: CONSENT_VERSION,
        agreedAt: koreaISOString,
        userAgent: navigator.userAgent
      }
      sessionStorage.setItem('termsAgreed', 'true')
      sessionStorage.setItem('consentInfo', JSON.stringify(consentInfo))
      router.push('/signup')
    }
  }

  const handleCancel = () => {
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-xl px-8 py-10 space-y-6">
          {/* 헤더 */}
          <div>
            <div className="flex justify-center">
              <div className="bg-blue-100 rounded-full p-4">
                <ShieldIcon />
              </div>
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              AI안전관리 시스템
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              서비스 이용을 위해 약관에 동의해주세요
            </p>
            <p className="mt-4 text-center text-xs text-gray-500 leading-relaxed">
              건설공사 사업관리방식 검토기준 및 업무수행지침 제48조(보고서 작성, 제출)
              <br />
              발주청이 별도의 온라인 건설사업관리업무 보고시스템을 활용하는 경우에는
              <br />
              온라인 건설사업관리업무 보고시스템의 이용으로 갈음할 수 있다
            </p>
          </div>

          {/* 약관 동의 컴포넌트 */}
          <div className="py-4">
            <TermsAndConditions onAgree={setTermsAgreed} />
          </div>

          {/* 버튼 영역 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 py-3 px-4 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!termsAgreed}
              className="flex-1 py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg hover:shadow-xl"
            >
              다음
            </button>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              className="text-blue-600 hover:text-blue-500 text-sm font-medium transition-colors"
              onClick={() => router.push('/login')}
            >
              이미 계정이 있으신가요? 로그인
            </button>
          </div>

          <CopyrightNotice />
        </div>
      </div>
    </div>
  )
}
