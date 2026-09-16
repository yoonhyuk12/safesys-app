'use client'
// 사고발생보고서 사진대지 입력 필드 — 축소 JPEG로 최대 2장까지만 담는다

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import {
  ACCIDENT_REPORT_MAX_PHOTOS,
  ACCIDENT_REPORT_PHOTO_CAPTION_MAX_LENGTH,
  type AccidentReportPhoto,
} from '@/lib/accident-report'
import { compressAccidentReportPhoto } from '@/lib/accident-report-photo'
import {
  appendPhotos,
  removePhoto as removePhotoAt,
  updatePhotoCaption,
} from '@/components/project/accident-report/photo-list-updates'
import {
  accidentReportInputClassName,
  accidentReportLabelClassName,
} from '@/components/project/accident-report/accident-report-form-styles'

interface AccidentReportPhotoFieldProps {
  photos: AccidentReportPhoto[]
  disabled: boolean
  /** 최신 목록에서 다음 목록을 계산하는 함수를 넘긴다. 압축이 끝나는 사이 바뀐 값을 덮어쓰지 않는다. */
  onChange: (update: (current: AccidentReportPhoto[]) => AccidentReportPhoto[]) => void
  /** 압축이 도는 동안 참. 저장 버튼을 잠그는 데 쓴다. */
  onBusyChange?: (busy: boolean) => void
}

const LIMIT_MESSAGE = `사진은 최대 ${ACCIDENT_REPORT_MAX_PHOTOS}장까지 첨부할 수 있습니다.`

export default function AccidentReportPhotoField({ photos, disabled, onChange, onBusyChange }: AccidentReportPhotoFieldProps) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  /** 마운트 여부. 언마운트 뒤 도착한 압축 결과와 오류는 버린다. */
  const activeRef = useRef(true)
  const busyChangeRef = useRef(onBusyChange)
  busyChangeRef.current = onBusyChange

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      busyChangeRef.current?.(false)
    }
  }, [])

  const remaining = ACCIDENT_REPORT_MAX_PHOTOS - photos.length
  const isFull = remaining <= 0

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    if (remaining <= 0) {
      setMessage(LIMIT_MESSAGE)
      return
    }

    // 남은 자리만큼만 받고 초과분은 조용히 버리지 않고 안내한다.
    const accepted = files.slice(0, remaining)
    const rejectedCount = files.length - accepted.length
    setBusy(true)
    busyChangeRef.current?.(true)
    setMessage('')
    try {
      const added: AccidentReportPhoto[] = []
      for (const file of accepted) {
        added.push({ dataUrl: await compressAccidentReportPhoto(file), caption: '' })
      }
      if (!activeRef.current) return
      // 압축이 도는 사이 바뀐 목록에 이어 붙이고 한도는 여기서 다시 보장한다.
      onChange((current) => appendPhotos(current, added))
      setMessage(
        rejectedCount > 0
          ? `${LIMIT_MESSAGE} ${rejectedCount.toLocaleString('ko-KR')}장은 첨부하지 않았습니다.`
          : '',
      )
    } catch (error: unknown) {
      if (!activeRef.current) return
      setMessage(error instanceof Error && error.message ? error.message : '사진을 첨부하지 못했습니다.')
    } finally {
      if (activeRef.current) {
        setBusy(false)
        busyChangeRef.current?.(false)
      }
    }
  }

  const updateCaption = (index: number, caption: string) => {
    onChange((current) => updatePhotoCaption(current, index, caption))
  }

  const removePhoto = (index: number) => {
    setMessage('')
    onChange((current) => removePhotoAt(current, index))
  }

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <li key={`${index}-${photo.dataUrl.slice(-24)}`} className="rounded-lg border border-gray-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.dataUrl}
                alt={photo.caption || `사고 사진 ${index + 1}`}
                className="h-40 w-full rounded-md object-contain bg-gray-50"
              />
              <label htmlFor={`accident-report-photo-caption-${index}`} className={`${accidentReportLabelClassName} mt-2`}>
                사진 {index + 1} 설명
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`accident-report-photo-caption-${index}`}
                  type="text"
                  value={photo.caption}
                  onChange={(event) => updateCaption(index, event.target.value)}
                  disabled={disabled}
                  maxLength={ACCIDENT_REPORT_PHOTO_CAPTION_MAX_LENGTH}
                  placeholder="사진 설명"
                  className={accidentReportInputClassName}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  disabled={disabled}
                  aria-label={`사진 ${index + 1} 삭제`}
                  className="min-h-[44px] shrink-0 rounded-md border border-gray-300 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isFull ? (
        <p className="text-xs text-gray-500">{LIMIT_MESSAGE} 다른 사진을 넣으려면 먼저 한 장을 삭제해 주세요.</p>
      ) : (
        <div>
          <label htmlFor="accident-report-photo-input" className={accidentReportLabelClassName}>
            사진 첨부 (남은 자리 {remaining.toLocaleString('ko-KR')}장)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="accident-report-photo-input"
              type="file"
              accept="image/*"
              multiple
              disabled={disabled || busy}
              aria-label="사고 사진 첨부"
              onChange={handleFiles}
              className="block w-full text-sm text-gray-700 file:mr-3 file:min-h-[44px] file:rounded-md file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-50"
            />
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-500" />
            ) : (
              <ImagePlus className="h-4 w-4 shrink-0 text-gray-400" />
            )}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">{LIMIT_MESSAGE} 첨부한 사진은 자동으로 축소해 저장합니다.</p>
        </div>
      )}

      {message && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
