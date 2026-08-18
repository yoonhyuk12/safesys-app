'use client'
// 게시판 날짜 표시와 낙관적 투표 상태 계산을 제공하는 공용 헬퍼

import type { VoteValue } from '@/lib/board/types'

interface VoteState {
  upvotes: number
  downvotes: number
  my_vote: VoteValue | null
}

export function applyOptimisticVote<T extends VoteState>(item: T, vote: VoteValue): T {
  let upvotes = item.upvotes
  let downvotes = item.downvotes

  if (item.my_vote === 1) upvotes -= 1
  if (item.my_vote === -1) downvotes -= 1

  const nextVote = item.my_vote === vote ? null : vote
  if (nextVote === 1) upvotes += 1
  if (nextVote === -1) downvotes += 1

  return {
    ...item,
    upvotes: Math.max(0, upvotes),
    downvotes: Math.max(0, downvotes),
    my_vote: nextVote,
  }
}

export function formatBoardDate(value: string, includeTime = false): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}
