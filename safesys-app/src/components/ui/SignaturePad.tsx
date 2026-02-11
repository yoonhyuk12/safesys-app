'use client'

import React, { useRef, useState, useEffect } from 'react'
import { X, PenTool, Loader2 } from 'lucide-react'

interface SignaturePadProps {
  onSave: (signature: string) => void
  onCancel: () => void
  selectedCount?: number
  isSaving?: boolean
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onCancel, selectedCount = 0, isSaving = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // 캔버스 초기화: 투명 배경 유지
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const getCanvasCoordinates = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)

    ctx.beginPath()
    ctx.moveTo(coords.x, coords.y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)

    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000000'
    ctx.lineTo(coords.x, coords.y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

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

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // 투명 배경으로 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // 캔버스가 비어있는지 확인
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const isEmpty = imageData.data.every((value, index) => {
      if (index % 4 === 3) { // 알파 채널만 확인
        return value === 0
      }
      return true
    })

    if (isEmpty) {
      alert('서명을 입력해주세요.')
      return
    }

    const signatureData = canvas.toDataURL('image/png')
    onSave(signatureData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">
            <PenTool className="h-6 w-6 inline mr-2" />
            일괄 서명 {selectedCount > 0 && `(${selectedCount}개 항목)`}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 서명 영역 */}
        <div className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="bg-white flex-1 relative touch-none border-2 border-gray-300 rounded-lg">
            <canvas
              ref={canvasRef}
              width={800}
              height={460}
              className="w-full h-full cursor-crosshair touch-none"
              style={{ touchAction: 'none' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            {/* 지우개 버튼 (우측 상단) */}
            <button
              type="button"
              onClick={clear}
              className="absolute top-3 right-3 p-2.5 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
              title="다시 작성"
            >
              <svg
                className="w-5 h-5 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[38px]"
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? (<><Loader2 className="h-4 w-4 animate-spin" /><span>서명 업로드 중...</span></>) : '서명 완료'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SignaturePad
