'use client'
// 사고발생보고서 초안을 문서(PDF·HWPX)에서 불러오는 업로드 영역과 덮어쓰기 확인 패널 (표시 전담)

import { useId, useRef } from 'react'
import { AlertCircle, Loader2, Upload } from 'lucide-react'

interface AccidentPrefillPanelProps {
  loading: boolean
  disabled: boolean
  error: string
  warnings: string[]
  notice: string
  /** 확인을 기다리는 문서 값의 충돌 항목 라벨. null이면 확인 패널을 띄우지 않는다. */
  conflicts: string[] | null
  onSelectFile: (file: File) => void
  onFillEmpty: () => void
  onOverwrite: () => void
  onCancel: () => void
}

export default function AccidentPrefillPanel({
  loading,
  disabled,
  error,
  warnings,
  notice,
  conflicts,
  onSelectFile,
  onFillEmpty,
  onOverwrite,
  onCancel,
}: AccidentPrefillPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const conflictTitleId = useId()

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || loading}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          PDF·HWPX 업로드로 초안 채우기
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.hwpx,application/pdf"
          aria-label="사고발생보고서 문서 업로드"
          disabled={disabled || loading}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onSelectFile(file)
          }}
        />
      </div>

      <p className="text-xs text-gray-500">
        업로드한 보고서에서 읽은 내용으로 초안을 채웁니다. 문서에 없는 내용은 채우지 않으며 저장 전 직접 확인합니다.
      </p>
      <p className="text-xs text-gray-500">
        PDF 사진은 앞 8쪽의 사진 후보를 최대 2장 자동으로 채웁니다. 기존 사진과 업로드 중 변경한 사진은 보존합니다.
        사진대지에서 확인하고 삭제·교체할 수 있습니다. 스캔한 전체 쪽·작은 그림과 HWPX 사진은 직접 첨부해 주세요.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {notice && <p className="text-xs text-blue-800">{notice}</p>}

      {conflicts && (
        <div
          role="group"
          aria-live="polite"
          aria-labelledby={conflictTitleId}
          className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <p id={conflictTitleId} className="text-sm text-amber-900">
            {conflicts.length > 0
              ? `이미 입력한 항목 ${conflicts.length.toLocaleString('ko-KR')}개(${conflicts.join(', ')})가 문서 내용으로 바뀝니다.`
              : '겹치는 항목이 없습니다. 빈 칸만 채우기를 눌러 반영하세요.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onFillEmpty}
              className="min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              빈 칸만 채우기
            </button>
            <button
              type="button"
              onClick={onOverwrite}
              className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              문서 내용으로 덮어쓰기
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
