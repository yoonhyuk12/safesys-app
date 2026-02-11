'use client'

import React, { useRef, useState, useEffect } from 'react'
import { X, PenTool } from 'lucide-react'

interface WorkerSignaturePadProps {
    onSave: (signature: string) => void
    onCancel: () => void
    isSaving?: boolean
}

const WorkerSignaturePad: React.FC<WorkerSignaturePadProps> = ({ onSave, onCancel, isSaving = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        // 모바일 기기 감지
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)

        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        // 캔버스 초기화: 투명 배경 유지
        ctx.clearRect(0, 0, canvas.width, canvas.height)
    }, [])

    useEffect(() => {
        // 모바일에서 화면 회전 방지 (가로 고정)
        if (isMobile) {
            // 화면을 가로로 강제 설정
            const orientation = (screen as any).orientation
            if (orientation && typeof orientation.lock === 'function') {
                orientation.lock('landscape').catch(() => {
                    console.log('Screen orientation lock not supported')
                })
            }
        }

        return () => {
            // 컴포넌트 언마운트 시 잠금 해제
            if (isMobile) {
                const orientation = (screen as any).orientation
                if (orientation && typeof orientation.unlock === 'function') {
                    orientation.unlock()
                }
            }
        }
    }, [isMobile])

    const getCanvasCoordinates = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect()

        if (isMobile) {
            // 회전된 모바일 UI에서의 좌표 계산
            // UI가 90도 회전되어 있으므로:
            // 터치 X -> 캔버스 Y (반전)
            // 터치 Y -> 캔버스 X
            const touchX = clientX - rect.left
            const touchY = clientY - rect.top

            // 90도 시계방향 회전 기준:
            // 캔버스 X = 터치 Y * (캔버스 가로 / rect 세로)
            // 캔버스 Y = (rect 가로 - 터치 X) * (캔버스 세로 / rect 가로)
            return {
                x: touchY * (canvas.width / rect.height),
                y: (rect.width - touchX) * (canvas.height / rect.width)
            }
        }

        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        }
    }

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | { clientX: number, clientY: number }) => {
        setIsDrawing(true)
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)

        ctx.beginPath()
        ctx.moveTo(coords.x, coords.y)
    }

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | { clientX: number, clientY: number }) => {
        if (!isDrawing) return

        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY)

        ctx.lineWidth = 4
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
        const touch = e.touches[0]
        if (touch) {
            startDrawing({
                clientX: touch.clientX,
                clientY: touch.clientY
            })
        }
    }

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        const touch = e.touches[0]
        if (touch) {
            draw({
                clientX: touch.clientX,
                clientY: touch.clientY
            })
        }
    }

    const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault()
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

    // 모바일 전용 UI (가로 회전 적용)
    if (isMobile) {
        return (
            <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center overflow-hidden" style={{ touchAction: 'none' }}>
                {/* 90도 회전 컨테이너: 가로가 세로보다 긴 형태를 만들기 위함 */}
                <div
                    className="flex flex-col bg-white overflow-hidden"
                    style={{
                        width: '100vh',
                        height: '100vw',
                        transform: 'rotate(90deg)',
                        transformOrigin: 'center center',
                        position: 'absolute'
                    }}
                >
                    {/* 회전된 상태에서의 헤더 */}
                    <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
                        <div className="flex items-center gap-3">
                            <PenTool className="h-5 w-5 text-blue-600" />
                            <h2 className="text-xl font-bold text-gray-900">서명 작성</h2>
                        </div>
                        <button
                            onClick={onCancel}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            disabled={isSaving}
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    {/* 회전된 상태에서의 캔버스 영역 */}
                    <div className="flex-1 relative bg-white overflow-hidden">
                        <canvas
                            ref={canvasRef}
                            // 고해상도를 위해 캔버스 크기를 크게 잡음
                            width={1200}
                            height={600}
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

                        <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none">
                            <span className="text-gray-300 text-sm font-medium">여기에 서명해 주세요</span>
                        </div>
                    </div>

                    {/* 회전된 상태에서의 푸터 버튼 */}
                    <div className="flex gap-4 p-6 border-t bg-gray-50">
                        <button
                            type="button"
                            onClick={clear}
                            className="flex-1 px-6 py-4 text-lg font-bold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                            disabled={isSaving}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            재작성
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-6 py-4 text-lg font-bold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                            disabled={isSaving}
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            className="flex-[2] px-6 py-4 text-lg font-bold text-white bg-blue-600 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center justify-center gap-2"
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    저장 중...
                                </>
                            ) : '서명 완료'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // 데스크탑 모달
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col">
                {/* 헤더 */}
                <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                    <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                        <PenTool className="h-6 w-6" />
                        서명
                    </h2>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600"
                        disabled={isSaving}
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* 서명 영역 */}
                <div className="p-6 flex-1 flex flex-col min-h-0">
                    <div className="bg-white flex-1 relative touch-none border-2 border-gray-300 rounded-lg" style={{ minHeight: '300px' }}>
                        <canvas
                            ref={canvasRef}
                            width={700}
                            height={300}
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
                        {/* 지우개 버튼 */}
                        <button
                            type="button"
                            onClick={clear}
                            className="absolute top-3 right-3 p-2.5 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
                            title="다시 작성"
                            disabled={isSaving}
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
                <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-5 py-2.5 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                        disabled={isSaving}
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        className="px-5 py-2.5 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                        disabled={isSaving}
                    >
                        {isSaving ? '제출 중...' : '제출'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default WorkerSignaturePad
