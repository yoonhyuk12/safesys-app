// 770 특별점검 사진 한 칸 — 점선 업로드 영역, 압축 업로드, 크롭/회전(ImageEditor)·삭제 메뉴
'use client'

import React, { useEffect, useState } from 'react'
import { Crop, MoreVertical, Trash2, Upload } from 'lucide-react'
import ImageEditor from '@/components/ui/ImageEditor'
import { uploadSpecial770Photo } from './photo-storage'

interface Special770PhotoSlotProps {
  projectId: string
  url: string | null | undefined
  label: string
  /** 저장소 파일명에 붙는 구분자 */
  tag: string
  onChange: (url: string | null) => void
  readOnly?: boolean
}

export default function Special770PhotoSlot({ projectId, url, label, tag, onChange, readOnly }: Special770PhotoSlotProps) {
  const [uploading, setUploading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const newUrl = await uploadSpecial770Photo(projectId, file, tag)
      onChange(newUrl)
    } catch (err) {
      console.error('사진 업로드 실패:', err)
      alert('사진 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleEdited = async (blob: Blob) => {
    setEditing(false)
    if (!url) return
    setUploading(true)
    try {
      const newUrl = await uploadSpecial770Photo(projectId, blob, `${tag}_edited`)
      // 폼 취소나 저장 실패 시 기존 저장 URL이 유효하도록 원본 파일은 유지한다.
      onChange(newUrl)
    } catch (err) {
      console.error('편집된 이미지 저장 실패:', err)
      alert('이미지 저장에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    if (!url) return
    // 저장 전에는 입력값만 비운다. 다른 저장 데이터가 참조할 수 있는 파일은 삭제하지 않는다.
    onChange(null)
  }

  return (
    <div>
      <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
      {url ? (
        <div className="relative w-full h-28">
          <img
            src={url}
            alt={label}
            className="w-full h-full object-cover rounded-lg border border-gray-200 bg-gray-50 cursor-pointer"
            onClick={() => window.open(url, '_blank')}
          />
          {uploading && (
            <div className="absolute inset-0 bg-white/70 rounded-lg flex items-center justify-center text-xs text-gray-600">처리 중...</div>
          )}
          {!readOnly && (
            <div className="absolute top-1 right-1 z-10">
              <button
                type="button"
                aria-label={`${label} 메뉴`}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
                className="p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors shadow-sm"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[110px] z-20">
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setMenuOpen(false) }}
                    className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Crop className="h-4 w-4" /> 크롭/회전
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); handleRemove() }}
                    className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> 삭제
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : readOnly ? (
        <div className="w-full h-28 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500">사진 없음</div>
      ) : (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-28 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
          {uploading ? (
            <span className="text-xs text-gray-500">업로드 중...</span>
          ) : (
            <>
              <Upload className="h-4 w-4 text-gray-400 mb-1" />
              <span className="text-xs font-medium text-gray-500">사진 추가</span>
            </>
          )}
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={uploading} />
        </label>
      )}
      {editing && url && (
        <ImageEditor imageUrl={url} onSave={handleEdited} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
