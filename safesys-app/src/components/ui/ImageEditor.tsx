'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RotateCw, Check, X } from 'lucide-react'

interface ImageEditorProps {
  imageUrl: string
  onSave: (editedImageBlob: Blob) => void
  onClose: () => void
}

interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

type CornerType = 'top-left' | 'bottom-right'

export default function ImageEditor({ imageUrl, onSave, onClose }: ImageEditorProps) {
  const [rotation, setRotation] = useState(0)
  const [cropArea, setCropArea] = useState<CropArea | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragCorner, setDragCorner] = useState<CornerType | null>(null)
  const [displayImageUrl, setDisplayImageUrl] = useState(imageUrl)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 회전된 이미지를 canvas로 렌더링
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = displayCanvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // 회전에 따른 캔버스 크기 설정
      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()

      // 회전 변환
      if (rotation === 90) {
        ctx.translate(canvas.width, 0)
        ctx.rotate((90 * Math.PI) / 180)
      } else if (rotation === 180) {
        ctx.translate(canvas.width, canvas.height)
        ctx.rotate((180 * Math.PI) / 180)
      } else if (rotation === 270) {
        ctx.translate(0, canvas.height)
        ctx.rotate((270 * Math.PI) / 180)
      }

      ctx.drawImage(img, 0, 0)
      ctx.restore()

      // canvas를 이미지 URL로 변환
      const newUrl = canvas.toDataURL('image/jpeg', 0.95)
      setDisplayImageUrl(newUrl)
    }
    img.src = imageUrl
  }, [imageUrl, rotation])

  // 표시 이미지 크기 업데이트
  useEffect(() => {
    const updateImageSize = () => {
      if (imgRef.current) {
        const { width, height } = imgRef.current.getBoundingClientRect()
        setImageSize({ width, height })

        // 초기 크롭 영역 설정 (이미지 전체)
        setCropArea({
          x: 0,
          y: 0,
          width: width,
          height: height
        })
      }
    }

    const timer = setTimeout(updateImageSize, 100)
    return () => clearTimeout(timer)
  }, [displayImageUrl])

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
    setCropArea(null)
  }

  const handleMouseDown = (e: React.MouseEvent, corner: CornerType) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragCorner(corner)
  }

  const handleTouchStart = (e: React.TouchEvent, corner: CornerType) => {
    e.stopPropagation()
    setIsDragging(true)
    setDragCorner(corner)
  }

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging || !cropArea || !dragCorner || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    const newCropArea = { ...cropArea }

    if (dragCorner === 'top-left') {
      const newX = Math.max(0, Math.min(x, cropArea.x + cropArea.width - 50))
      const newY = Math.max(0, Math.min(y, cropArea.y + cropArea.height - 50))

      newCropArea.width = cropArea.width + (cropArea.x - newX)
      newCropArea.height = cropArea.height + (cropArea.y - newY)
      newCropArea.x = newX
      newCropArea.y = newY
    } else if (dragCorner === 'bottom-right') {
      const newWidth = Math.max(50, Math.min(x - cropArea.x, imageSize.width - cropArea.x))
      const newHeight = Math.max(50, Math.min(y - cropArea.y, imageSize.height - cropArea.y))

      newCropArea.width = newWidth
      newCropArea.height = newHeight
    }

    setCropArea(newCropArea)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      e.preventDefault()
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragCorner(null)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    setDragCorner(null)
  }

  const getCroppedImg = useCallback(async () => {
    if (!imgRef.current || !canvasRef.current) return

    const image = imgRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) return

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    if (cropArea) {
      const sourceX = cropArea.x * scaleX
      const sourceY = cropArea.y * scaleY
      const sourceWidth = cropArea.width * scaleX
      const sourceHeight = cropArea.height * scaleY

      canvas.width = sourceWidth
      canvas.height = sourceHeight

      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      )
    } else {
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      ctx.drawImage(image, 0, 0)
    }

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob)
      }, 'image/jpeg', 0.95)
    })
  }, [cropArea])

  const handleSave = async () => {
    const blob = await getCroppedImg()
    if (blob) {
      onSave(blob)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">사진 편집</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="취소"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={handleSave}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="저장"
            >
              <Check className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-4">

          <div className="flex justify-center items-center bg-gray-100 rounded-lg p-4 min-h-[400px] overflow-auto">
            <div
              ref={containerRef}
              className="relative inline-block"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                cursor: isDragging ? 'grabbing' : 'default',
                touchAction: 'none'
              }}
            >
              <img
                ref={imgRef}
                src={displayImageUrl}
                alt="편집할 이미지"
                className="max-w-full max-h-[70vh] block"
                style={{
                  width: 'auto',
                  height: 'auto'
                }}
                draggable={false}
              />

              {/* 회전 버튼 - 이미지 우측 상단 */}
              <button
                onClick={handleRotate}
                className="absolute top-2 right-2 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                title="회전"
              >
                <RotateCw className="h-5 w-5" />
              </button>

              {/* 크롭 오버레이 */}
              {cropArea && (
                <>
                  {/* 어두운 오버레이 - 상단 */}
                  <div
                    className="absolute bg-black bg-opacity-50 pointer-events-none"
                    style={{
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${cropArea.y}px`
                    }}
                  />

                  {/* 어두운 오버레이 - 좌측 */}
                  <div
                    className="absolute bg-black bg-opacity-50 pointer-events-none"
                    style={{
                      top: `${cropArea.y}px`,
                      left: 0,
                      width: `${cropArea.x}px`,
                      height: `${cropArea.height}px`
                    }}
                  />

                  {/* 어두운 오버레이 - 우측 */}
                  <div
                    className="absolute bg-black bg-opacity-50 pointer-events-none"
                    style={{
                      top: `${cropArea.y}px`,
                      left: `${cropArea.x + cropArea.width}px`,
                      width: `${imageSize.width - (cropArea.x + cropArea.width)}px`,
                      height: `${cropArea.height}px`
                    }}
                  />

                  {/* 어두운 오버레이 - 하단 */}
                  <div
                    className="absolute bg-black bg-opacity-50 pointer-events-none"
                    style={{
                      top: `${cropArea.y + cropArea.height}px`,
                      left: 0,
                      width: '100%',
                      height: `${imageSize.height - (cropArea.y + cropArea.height)}px`
                    }}
                  />

                  {/* 크롭 영역 테두리 */}
                  <div
                    className="absolute border-2 border-white pointer-events-none"
                    style={{
                      top: `${cropArea.y}px`,
                      left: `${cropArea.x}px`,
                      width: `${cropArea.width}px`,
                      height: `${cropArea.height}px`
                    }}
                  />

                  {/* 좌측 상단 모서리 핸들 ("ㄱ" 모양) */}
                  <div
                    className="absolute cursor-nw-resize z-10 touch-none"
                    style={{
                      top: `${cropArea.y - 5}px`,
                      left: `${cropArea.x - 5}px`,
                      width: '50px',
                      height: '50px',
                      padding: '10px'
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'top-left')}
                    onTouchStart={(e) => handleTouchStart(e, 'top-left')}
                  >
                    {/* 가로선 */}
                    <div className="absolute top-2 left-2 bg-black" style={{ width: '30px', height: '4px' }} />
                    {/* 세로선 */}
                    <div className="absolute top-2 left-2 bg-black" style={{ width: '4px', height: '30px' }} />
                  </div>

                  {/* 우측 하단 모서리 핸들 ("ㄴ" 모양) */}
                  <div
                    className="absolute cursor-se-resize z-10 touch-none"
                    style={{
                      top: `${cropArea.y + cropArea.height - 45}px`,
                      left: `${cropArea.x + cropArea.width - 45}px`,
                      width: '50px',
                      height: '50px',
                      padding: '10px'
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
                    onTouchStart={(e) => handleTouchStart(e, 'bottom-right')}
                  >
                    {/* 세로선 */}
                    <div className="absolute bottom-2 right-2 bg-black" style={{ width: '4px', height: '30px' }} />
                    {/* 가로선 */}
                    <div className="absolute bottom-2 right-2 bg-black" style={{ width: '30px', height: '4px' }} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 회전 처리용 캔버스 (숨김) */}
          <canvas ref={displayCanvasRef} style={{ display: 'none' }} />
          {/* 크롭 처리용 캔버스 (숨김) */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>
    </div>
  )
}
