'use client'
// 게시글과 댓글의 추천·비추천 수 및 현재 사용자 선택을 표시하는 투표 버튼

import { ThumbsDown, ThumbsUp } from 'lucide-react'
import type { VoteValue } from '@/lib/board/types'

interface BoardVoteButtonsProps {
  upvotes: number
  downvotes: number
  myVote: VoteValue | null
  onVote: (vote: VoteValue) => void
  disabled?: boolean
  showScore?: boolean
  compact?: boolean
}

export default function BoardVoteButtons({
  upvotes,
  downvotes,
  myVote,
  onVote,
  disabled = false,
  showScore = true,
  compact = false,
}: BoardVoteButtonsProps) {
  const score = upvotes - downvotes

  return (
    <div className="flex min-w-0 items-center gap-1" aria-label={`추천 순점수 ${score}`}>
      {showScore && (
        <span className="mr-1 whitespace-nowrap text-xs font-medium text-gray-600">
          {compact ? score : `순점수 ${score}`}
        </span>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onVote(1)
        }}
        disabled={disabled}
        aria-pressed={myVote === 1}
        aria-label={`추천 ${upvotes}개`}
        title="추천"
        className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-lg border px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          myVote === 1
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
        }`}
      >
        <ThumbsUp className="h-4 w-4" />
        <span>{upvotes}</span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onVote(-1)
        }}
        disabled={disabled}
        aria-pressed={myVote === -1}
        aria-label={`비추천 ${downvotes}개`}
        title="비추천"
        className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-lg border px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          myVote === -1
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
        }`}
      >
        <ThumbsDown className="h-4 w-4" />
        <span>{downvotes}</span>
      </button>
    </div>
  )
}
