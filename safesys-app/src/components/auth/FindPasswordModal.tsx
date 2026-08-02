'use client'
// 비밀번호 찾기(이메일 재설정 링크 발송) 모달

import React, { useState } from 'react'
import { X, Mail, CheckCircle, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface FindPasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

const FindPasswordModal: React.FC<FindPasswordModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'form' | 'sent'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 이메일은 소문자로 정규화
    setEmail(e.target.value.toLowerCase())
    if (error) setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError('이메일 주소를 입력해주세요.')
      return
    }

    if (!validateEmail(email)) {
      setError('올바른 이메일 주소를 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 계정 존재 여부는 노출하지 않는다 (미가입 이메일도 성공으로 처리됨)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (resetError) {
        console.error('비밀번호 재설정 이메일 발송 실패:', resetError)
        const message = resetError.message || ''
        if (message.includes('rate limit') || message.includes('security purposes')) {
          setError('요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setError('재설정 이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.')
        }
        return
      }

      setStep('sent')
    } catch (err) {
      console.error('비밀번호 재설정 이메일 발송 실패:', err)
      setError('재설정 이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('form')
    setError('')
    setEmail('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
        {/* 닫기 버튼 */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        {step === 'form' ? (
          <>
            {/* 헤더 */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div className="bg-blue-100 rounded-full p-3">
                  <Lock className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">비밀번호 찾기</h2>
              <p className="text-gray-600 text-sm">
                가입 시 사용한 이메일 주소를 입력하면 비밀번호 재설정 링크를 보내드립니다
              </p>
            </div>

            {/* 폼 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 이메일 입력 */}
              <div>
                <label htmlFor="modal-email" className="block text-sm font-medium text-gray-700 mb-2">
                  이메일 주소 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="modal-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={handleChange}
                    placeholder="이메일을 입력하세요"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* 오류 메시지 */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* 버튼 */}
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      발송 중...
                    </div>
                  ) : (
                    '재설정 링크 발송'
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            {/* 발송 완료 화면 */}
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 rounded-full p-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">이메일을 발송했습니다</h2>

              {/* 발송 대상 이메일 표시 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-6">
                <div className="flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-lg font-medium text-blue-900">{email}</span>
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-6">
                메일함에서 재설정 링크를 눌러 새 비밀번호를 설정해주세요. 메일이 보이지 않으면 스팸함도 확인해주세요.
              </p>

              {/* 버튼 */}
              <button
                onClick={handleClose}
                className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                확인
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FindPasswordModal
