'use client'

import React, { useRef, useState, useEffect } from 'react'
import { X, PenTool } from 'lucide-react'

interface SignatureModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (signature: string) => void
  isSubmitting?: boolean
}

export default function SignatureModal({ 
  isOpen, 
  onClose, 
  onSave,
  isSubmitting = false 
}: SignatureModalProps) {
  const [isDrawing, setIsDrawing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 모달이 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      
      return () => {
        document.body.style.overflow = 'unset'
        document.body.style.touchAction = 'auto'
      }
    }
  }, [isOpen])

  // 정확한 캔버스 좌표 계산 함수
  const getCanvasCoordinates = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  // 서명 캔버스 관련 함수들
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)
    
    ctx.beginPath()
    ctx.moveTo(coords.x, coords.y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)
    
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000000'
    ctx.lineTo(coords.x, coords.y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  // 터치 이벤트 핸들러들 - 스크롤 방지 강화
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const touch = e.touches[0]
    if (touch) {
      startDrawing({
        clientX: touch.clientX,
        clientY: touch.clientY
      } as React.MouseEvent<HTMLCanvasElement>)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const touch = e.touches[0]
    if (touch) {
      draw({
        clientX: touch.clientX,
        clientY: touch.clientY
      } as React.MouseEvent<HTMLCanvasElement>)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    stopDrawing()
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // 캔버스가 비어있는지 확인
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const isEmpty = imageData.data.every((value, index) => {
      // 알파 채널(투명도)만 확인 (RGBA의 A 부분)
      if ((index + 1) % 4 === 0) {
        return value === 0
      }
      return true
    })
    
    if (isEmpty) {
      alert('서명을 해주세요.')
      return
    }
    
    const signatureData = canvas.toDataURL()
    onSave(signatureData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-50 overflow-hidden">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-2 max-h-[95vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">
            <PenTool className="h-6 w-6 inline mr-2" />
            점검자 서명
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 서명 영역 */}
        <div className="p-2 flex-1 flex flex-col min-h-0">
          <p className="text-sm text-gray-600 mb-2 px-4 flex-shrink-0">
            아래 영역에 마우스나 터치로 서명해주세요.
          </p>
          
          <div className="bg-white flex-1 relative touch-none">
            <canvas
              ref={canvasRef}
              width={800}
              height={400}
              className="w-full h-full cursor-crosshair border border-gray-300 touch-none"
              style={{ touchAction: 'none' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50 flex-shrink-0">
          <button
            type="button"
            onClick={clearSignature}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            지우기
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '제출 중...' : '서명 완료 및 제출'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}