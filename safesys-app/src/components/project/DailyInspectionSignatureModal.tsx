'use client'

import React, { useState, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'

interface Signature {
  role: '공사감독' | '도급사' | '하도급사'
  name: string
  signatureData: string
}

interface DailyInspectionSignatureModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (signatures: Signature[]) => void
  currentUserName: string
  initialSignatures?: Signature[]
}

const DailyInspectionSignatureModal: React.FC<DailyInspectionSignatureModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentUserName,
  initialSignatures = []
}) => {
  const [signatures, setSignatures] = useState<Signature[]>(initialSignatures)
  const [currentRole, setCurrentRole] = useState<'공사감독' | '도급사' | '하도급사'>('공사감독')
  const [currentName, setCurrentName] = useState('')
  const signatureCanvasRef = useRef<SignatureCanvas>(null)

  if (!isOpen) return null

  const handleAddSignature = () => {
    if (signatures.length >= 5) {
      alert('서명은 최대 5명까지 가능합니다.')
      return
    }

    if (!currentName.trim()) {
      alert('이름을 입력해주세요.')
      return
    }

    if (!signatureCanvasRef.current || signatureCanvasRef.current.isEmpty()) {
      alert('서명을 해주세요.')
      return
    }

    const signatureData = signatureCanvasRef.current.toDataURL()

    setSignatures([...signatures, {
      role: currentRole,
      name: currentName,
      signatureData
    }])

    // 리셋
    setCurrentName('')
    signatureCanvasRef.current.clear()
    alert('서명이 추가되었습니다.')
  }

  const handleRemoveSignature = (index: number) => {
    setSignatures(signatures.filter((_, i) => i !== index))
  }

  const handleClearCanvas = () => {
    signatureCanvasRef.current?.clear()
  }

  const handleSave = () => {
    if (signatures.length === 0) {
      alert('최소 1개 이상의 서명이 필요합니다.')
      return
    }
    onSave(signatures)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">서명 추가</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="p-6 space-y-6">
          {/* 현재 서명자 정보 입력 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">서명자 정보</h3>

            {/* 역할 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                역할 <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                {(['공사감독', '도급사', '하도급사'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setCurrentRole(role)}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      currentRole === role
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* 이름 입력 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={currentName}
                onChange={(e) => setCurrentName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 서명 패드 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                서명 <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-gray-300 rounded-md bg-white">
                <SignatureCanvas
                  ref={signatureCanvasRef}
                  canvasProps={{
                    className: 'w-full h-40 cursor-crosshair'
                  }}
                  backgroundColor="white"
                />
              </div>
              <div className="flex justify-end mt-2 space-x-2">
                <button
                  onClick={handleClearCanvas}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  지우기
                </button>
              </div>
            </div>

            {/* 추가 버튼 */}
            <button
              onClick={handleAddSignature}
              disabled={signatures.length >= 5}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              서명 추가 ({signatures.length}/5)
            </button>
          </div>

          {/* 추가된 서명 목록 */}
          {signatures.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">추가된 서명 ({signatures.length})</h3>
              {signatures.map((sig, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md p-3">
                  <div className="flex items-center space-x-4">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{sig.role}</span>
                      <span className="text-gray-500 ml-2">{sig.name}</span>
                    </div>
                    <img src={sig.signatureData} alt={`${sig.name} 서명`} className="h-12 border border-gray-300 bg-white px-2" />
                  </div>
                  <button
                    onClick={() => handleRemoveSignature(index)}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 하단 버튼 */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={signatures.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DailyInspectionSignatureModal
