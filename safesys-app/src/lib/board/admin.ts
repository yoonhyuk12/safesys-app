// 요청사항 게시판 관리자 기능의 클라이언트 헬퍼 — 관리자 여부 조회와 조정 API 호출
import { supabase } from '@/lib/supabase'
import type { BoardAdminState, BoardStatus } from './types'

type BoardModerationRequest =
  | { action: 'set-status'; postId: string; status: BoardStatus }
  | { action: 'delete-post'; postId: string }
  | { action: 'delete-comment'; commentId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function moderateBoard(request: BoardModerationRequest, errorMessage: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('로그인이 필요합니다.')
  }

  let response: Response
  try {
    response = await fetch('/api/board/moderate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(request),
    })
  } catch {
    throw new Error(errorMessage)
  }
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(errorMessage)
  }
}

export async function fetchBoardAdminState(): Promise<BoardAdminState> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      return { isAdmin: false, otpVerified: false }
    }

    const response = await fetch('/api/admin/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!response.ok) {
      return { isAdmin: false, otpVerified: false }
    }

    const payload: unknown = await response.json().catch(() => null)
    if (
      !isRecord(payload)
      || payload.success !== true
      || typeof payload.isAdmin !== 'boolean'
      || typeof payload.otpVerified !== 'boolean'
    ) {
      return { isAdmin: false, otpVerified: false }
    }

    return {
      isAdmin: payload.isAdmin,
      otpVerified: payload.otpVerified,
    }
  } catch {
    return { isAdmin: false, otpVerified: false }
  }
}

export async function moderateSetStatus(postId: string, status: BoardStatus): Promise<void> {
  await moderateBoard(
    { action: 'set-status', postId, status },
    '게시글 처리 상태를 변경하지 못했습니다.'
  )
}

export async function moderateDeletePost(postId: string): Promise<void> {
  await moderateBoard(
    { action: 'delete-post', postId },
    '게시글을 삭제하지 못했습니다.'
  )
}

export async function moderateDeleteComment(commentId: string): Promise<void> {
  await moderateBoard(
    { action: 'delete-comment', commentId },
    '댓글을 삭제하지 못했습니다.'
  )
}
