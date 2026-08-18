'use client'
// 요청사항 제목과 내용을 입력하고 저장하는 작성·수정 공용 폼

import type { FormEvent } from 'react'

interface BoardPostFormProps {
  title: string
  content: string
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onSubmit: () => void
  saving: boolean
  submitLabel: string
}

export default function BoardPostForm({
  title,
  content,
  onTitleChange,
  onContentChange,
  onSubmit,
  saving,
  submitLabel,
}: BoardPostFormProps) {
  const canSubmit = Boolean(title.trim() && content.trim()) && !saving

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="board-title" className="mb-1.5 block text-sm font-medium text-gray-700">
          제목
        </label>
        <input
          id="board-title"
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          maxLength={200}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="요청사항 제목을 입력하세요."
        />
        <p className="mt-1 text-right text-xs text-gray-400">{title.length}/200</p>
      </div>

      <div>
        <label htmlFor="board-content" className="mb-1.5 block text-sm font-medium text-gray-700">
          내용
        </label>
        <textarea
          id="board-content"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          rows={10}
          required
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="필요한 기능이나 개선 내용을 자세히 적어주세요."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-[40px] rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장 중...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
