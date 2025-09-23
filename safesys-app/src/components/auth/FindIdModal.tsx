'use client'

import React, { useState } from 'react'
import { X, User, Phone, Mail, CheckCircle } from 'lucide-react'

interface FindIdModalProps {
  isOpen: boolean
  onClose: () => void
}

const FindIdModal: React.FC<FindIdModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundEmail, setFoundEmail] = useState('')
  const [step, setStep] = useState<'input' | 'result'>('input')
  const [formData, setFormData] = useState({
    fullName: '',
    phone: ''
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    
    if (name === 'phone') {
      // 숫자만 추출
      const numbers = value.replace(/\D/g, '')
      
      // 전화번호 형식으로 변환
      let formattedPhone = ''
      if (numbers.length <= 3) {
        formattedPhone = numbers
      } else if (numbers.length <= 7) {
        formattedPhone = `${numbers.slice(0, 3)}-${numbers.slice(3)}`
      } else {
        formattedPhone = `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
      }
      
      setFormData(prev => ({
        ...prev,
        [name]: formattedPhone
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!formData.fullName.trim()) {
      setError('이름을 입력해주세요.')
      setLoading(false)
      return
    }

    if (!formData.phone.trim()) {
      setError('전화번호를 입력해주세요.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/find-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim()
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '아이디를 찾을 수 없습니다.')
      }

      setFoundEmail(result.email)
      setStep('result')
    } catch (err: any) {
      setError(err.message || '아이디 찾기에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('input')
    setFoundEmail('')
    setError('')
    setFormData({ fullName: '', phone: '' })
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

        {step === 'input' ? (
          <>
            {/* 헤더 */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div className="bg-blue-100 rounded-full p-3">
                  <Mail className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">아이디 찾기</h2>
              <p className="text-gray-600 text-sm">
                가입 시 입력한 이름과 전화번호를 입력해주세요
              </p>
            </div>

            {/* 폼 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 이름 입력 */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                  이름 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="이름을 입력하세요"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* 전화번호 입력 */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  전화번호 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="010-0000-0000"
                    maxLength={13}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
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
                      찾는 중...
                    </div>
                  ) : (
                    '아이디 찾기'
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            {/* 결과 화면 */}
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 rounded-full p-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">아이디를 찾았습니다!</h2>
              <p className="text-gray-600 text-sm mb-6">
                입력하신 정보와 일치하는 아이디입니다
              </p>

              {/* 찾은 아이디 표시 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-lg font-medium text-blue-900">{foundEmail}</span>
                </div>
              </div>

              {/* 버튼 */}
              <div className="space-y-3">
                <button
                  onClick={handleClose}
                  className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  로그인하러 가기
                </button>
                <button
                  onClick={() => {
                    setStep('input')
                    setFoundEmail('')
                    setFormData({ fullName: '', phone: '' })
                  }}
                  className="w-full px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  다시 찾기
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FindIdModal