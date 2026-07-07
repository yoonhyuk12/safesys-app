'use client'

// 검측 사진 업로드 탭 — 검측건당 최소 1컷, 최대 2컷. 엑셀 사진대지 출력에 사용된다.

import React, { useEffect, useState } from 'react'
import { Crop, ImagePlus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ImageEditor from '@/components/ui/ImageEditor'
import {
  InspectionRequestFormData,
  InspectionPhoto,
  INSPECTION_PHOTO_MAX,
} from '@/lib/inspection/inspection-types'

interface InspectionPhotoTabProps {
  projectId: string
  formData: InspectionRequestFormData
  onChange: (data: InspectionRequestFormData) => void
}

// safety-inspection-photos 버킷 재사용 — 인증 사용자 삭제가 허용되고,
// 프로젝트 삭제 라우트가 {projectId}/ 폴더를 통째로 정리하므로 평면 경로로 저장한다.
const BUCKET = 'safety-inspection-photos'

// public URL에서 버킷 내 경로 추출 (Storage 파일 삭제용)
export const inspectionPhotoStoragePath = (url: string): string | null => {
  const path = url.split(`/${BUCKET}/`)[1]
  return path ? decodeURIComponent(path) : null
}

export default function InspectionPhotoTab({ projectId, formData, onChange }: InspectionPhotoTabProps) {
  const [uploading, setUploading] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const photos = formData.photos || []

  const setPhotos = (next: InspectionPhoto[]) => onChange({ ...formData, photos: next })

  // 사진 설명 기본값 — 검측 사항 내용을 줄 단위로 나눠 사진1 ← 1줄, 사진2 ← 2줄
  const captionLines = (formData.inspection_items || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const defaultCaption = (index: number) => captionLines[index] || ''

  // 탭 진입 시 비어있는 설명을 검측 사항으로 1회 자동 채움 (체크리스트 탭의 일자 자동 채움과 동일 패턴)
  useEffect(() => {
    if (!photos.some((p, i) => !p.caption && defaultCaption(i))) return
    setPhotos(photos.map((p, i) => (p.caption ? p : { ...p, caption: defaultCaption(i) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    const remaining = INSPECTION_PHOTO_MAX - photos.length
    if (files.length > remaining) {
      alert(`사진은 최대 ${INSPECTION_PHOTO_MAX}컷까지 업로드할 수 있습니다.`)
      return
    }

    setUploading(true)
    try {
      const uploaded: InspectionPhoto[] = []
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const fileName = `${projectId}/${Date.now()}_inspection_request_${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { data, error } = await supabase.storage.from(BUCKET).upload(fileName, file)
        if (error) throw error
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
        uploaded.push({ url: urlData.publicUrl, caption: defaultCaption(photos.length + uploaded.length) })
      }
      setPhotos([...photos, ...uploaded])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('사진 업로드 실패: ' + message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async (index: number) => {
    if (!confirm('사진을 삭제하시겠습니까?')) return
    const photo = photos[index]
    const path = inspectionPhotoStoragePath(photo.url)
    if (path) await supabase.storage.from(BUCKET).remove([path])
    setPhotos(photos.filter((_, i) => i !== index))
  }

  const setCaption = (index: number, caption: string) => {
    setPhotos(photos.map((p, i) => (i === index ? { ...p, caption } : p)))
  }

  // 크롭/회전 결과 저장 — 새 파일 업로드 후 기존 파일 삭제, URL 교체 (설명은 유지)
  const handleSaveEdited = async (blob: Blob) => {
    if (editingIndex === null) return
    const target = photos[editingIndex]
    setUploading(true)
    try {
      const fileName = `${projectId}/${Date.now()}_inspection_request_${Math.random().toString(36).slice(2, 8)}.jpg`
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
      const oldPath = inspectionPhotoStoragePath(target.url)
      if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
      setPhotos(photos.map((p, i) => (i === editingIndex ? { ...p, url: urlData.publicUrl } : p)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('편집된 사진 저장 실패: ' + message)
    } finally {
      setUploading(false)
      setEditingIndex(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        검측 사진을 최소 1컷, 최대 {INSPECTION_PHOTO_MAX}컷 업로드합니다. 업로드한 사진은 엑셀
        사진대지로 출력됩니다. 사진은 저장 버튼을 눌러야 검측요청서에 반영됩니다. 설명은 검측
        사항 내용(줄 단위)이 기본값으로 채워지며 자유롭게 수정할 수 있습니다.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {photos.map((photo, index) => (
          <div key={`${index}-${photo.url}`} className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="relative bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`검측 사진 ${index + 1}`}
                className="w-full h-52 object-contain"
              />
              <button
                type="button"
                onClick={() => setEditingIndex(index)}
                className="absolute top-2 right-11 p-1.5 bg-white/90 text-gray-700 rounded-full shadow hover:bg-gray-100"
                title="크롭/회전"
              >
                <Crop className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="absolute top-2 right-2 p-1.5 bg-white/90 text-red-600 rounded-full shadow hover:bg-red-50"
                title="사진 삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2 border-t border-gray-200">
              <input
                type="text"
                value={photo.caption}
                onChange={(e) => setCaption(index, e.target.value)}
                placeholder={`사진 ${index + 1} 설명 (예: 터파기 완료 전경)`}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        ))}

        {photos.length < INSPECTION_PHOTO_MAX && (
          <label
            className={`flex flex-col items-center justify-center gap-2 h-64 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer ${
              uploading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-medium">
              {uploading ? '업로드 중...' : `사진 추가 (${photos.length}/${INSPECTION_PHOTO_MAX})`}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple={photos.length === 0 && INSPECTION_PHOTO_MAX > 1}
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* 사진 편집 모달 (크롭/회전) */}
      {editingIndex !== null && photos[editingIndex] && (
        <ImageEditor
          imageUrl={photos[editingIndex].url}
          onSave={handleSaveEdited}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </div>
  )
}
