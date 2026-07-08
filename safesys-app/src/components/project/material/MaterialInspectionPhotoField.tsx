'use client'

// 자재 검수 사진 업로드 필드 — 내역 등록/수정 모달(합격량 아래)에서 사용. 압축 업로드 + 크롭/회전, 선택 항목

import React, { useState } from 'react'
import { Crop, ImagePlus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ImageEditor from '@/components/ui/ImageEditor'

interface MaterialInspectionPhotoFieldProps {
  projectId: string
  photos: string[]
  onChange: (photos: string[]) => void
}

// safety-inspection-photos 버킷 재사용 — 인증 사용자 삭제가 허용되고,
// 프로젝트 삭제 라우트가 {projectId}/ 폴더를 통째로 정리하므로 평면 경로로 저장한다.
const BUCKET = 'safety-inspection-photos'
export const MATERIAL_INSPECTION_PHOTO_BUCKET = BUCKET

// public URL에서 버킷 내 경로 추출 (Storage 파일 삭제용)
export const materialInspectionPhotoStoragePath = (url: string): string | null => {
  const path = url.split(`/${BUCKET}/`)[1]
  return path ? decodeURIComponent(path) : null
}

// 검수 사진은 A4 반 페이지 인쇄용이라 고화질이 필요 없다 — 최대 1280px / JPEG 0.8로 압축
const MAX_PX = 1280
const JPEG_QUALITY = 0.8

function compressImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      const longest = Math.max(width, height)
      if (longest > MAX_PX) {
        const scale = MAX_PX / longest
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('이미지 압축 실패: canvas 생성 불가'))
        return
      }
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지 압축 실패: blob 생성 불가'))),
        'image/jpeg',
        JPEG_QUALITY
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지를 읽을 수 없습니다.'))
    }
    img.src = objectUrl
  })
}

export default function MaterialInspectionPhotoField({ projectId, photos, onChange }: MaterialInspectionPhotoFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const uploadBlob = async (blob: Blob): Promise<string> => {
    const fileName = `${projectId}/${Date.now()}_material_inspection_${Math.random().toString(36).slice(2, 8)}.jpg`
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const compressed = await compressImage(file)
        uploaded.push(await uploadBlob(compressed))
      }
      onChange([...photos, ...uploaded])
    } catch (err: unknown) {
      alert('사진 업로드 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async (index: number) => {
    if (!confirm('사진을 삭제하시겠습니까?')) return
    const path = materialInspectionPhotoStoragePath(photos[index])
    if (path) await supabase.storage.from(BUCKET).remove([path])
    onChange(photos.filter((_, i) => i !== index))
  }

  // 크롭/회전 결과 저장 — 새 파일 업로드 후 기존 파일 삭제, URL 교체
  const handleSaveEdited = async (blob: Blob) => {
    if (editingIndex === null) return
    setUploading(true)
    try {
      const compressed = await compressImage(blob)
      const newUrl = await uploadBlob(compressed)
      const oldPath = materialInspectionPhotoStoragePath(photos[editingIndex])
      if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
      onChange(photos.map((p, i) => (i === editingIndex ? newUrl : p)))
    } catch (err: unknown) {
      alert('편집된 사진 저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setUploading(false)
      setEditingIndex(null)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>
        검수 사진 <span className="text-amber-200/40 font-normal">(선택)</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((url, index) => (
          <div
            key={`${index}-${url}`}
            className="relative rounded overflow-hidden"
            style={{ border: '2px solid #4a4a55', background: '#1a1a22' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`검수 사진 ${index + 1}`} className="w-full h-24 object-cover" />
            <button
              type="button"
              onClick={() => setEditingIndex(index)}
              className="absolute top-1 right-8 p-1 rounded-full bg-black/60 text-amber-200/80 hover:text-amber-100"
              title="크롭/회전"
            >
              <Crop className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-red-400/80 hover:text-red-400"
              title="사진 삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <label
          className={`flex flex-col items-center justify-center gap-1 h-24 rounded cursor-pointer transition-colors text-amber-200/40 hover:text-amber-200/70 ${
            uploading ? 'opacity-50 pointer-events-none' : ''
          }`}
          style={{ border: '2px dashed #4a4a55', background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)' }}
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-xs">{uploading ? '업로드 중...' : '사진 추가'}</span>
          <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
      </div>

      {/* 사진 편집 모달 (크롭/회전) */}
      {editingIndex !== null && photos[editingIndex] && (
        <ImageEditor
          imageUrl={photos[editingIndex]}
          onSave={handleSaveEdited}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </div>
  )
}
