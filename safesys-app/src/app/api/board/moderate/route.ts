// 요청사항 게시판 관리자 조정 라우트 — 상태 변경과 타인 글·댓글 삭제를 service-role로 처리
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { BOARD_STATUSES, type BoardStatus } from '@/lib/board/types'

const BOARD_MODERATION_ACTIONS = ['set-status', 'delete-post', 'delete-comment'] as const
type BoardModerationAction = (typeof BOARD_MODERATION_ACTIONS)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isBoardModerationAction(value: unknown): value is BoardModerationAction {
  return typeof value === 'string' && BOARD_MODERATION_ACTIONS.includes(value as BoardModerationAction)
}

function isBoardStatus(value: unknown): value is BoardStatus {
  return typeof value === 'string' && BOARD_STATUSES.includes(value as BoardStatus)
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    )
  }

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body) || !isBoardModerationAction(body.action)) {
    return NextResponse.json(
      { success: false, error: '관리자 작업 유형이 올바르지 않습니다.' },
      { status: 400 }
    )
  }

  const action = body.action
  if (action === 'set-status' && (!isNonEmptyString(body.postId) || !isBoardStatus(body.status))) {
    return NextResponse.json(
      { success: false, error: '게시글과 처리 상태를 올바르게 입력해 주세요.' },
      { status: 400 }
    )
  }
  if (action === 'delete-post' && !isNonEmptyString(body.postId)) {
    return NextResponse.json(
      { success: false, error: '삭제할 게시글을 지정해 주세요.' },
      { status: 400 }
    )
  }
  if (action === 'delete-comment' && !isNonEmptyString(body.commentId)) {
    return NextResponse.json(
      { success: false, error: '삭제할 댓글을 지정해 주세요.' },
      { status: 400 }
    )
  }

  try {
    if (action === 'set-status') {
      const { error } = await supabaseAdmin
        .from('board_posts')
        .update({ status: body.status })
        .eq('id', body.postId)

      if (error) throw error
    } else if (action === 'delete-post') {
      const { error } = await supabaseAdmin
        .from('board_posts')
        .delete()
        .eq('id', body.postId)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('board_comments')
        .delete()
        .eq('id', body.commentId)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('요청사항 게시판 관리자 조정 오류', { action, error })
    return NextResponse.json(
      { success: false, error: '게시판 관리자 작업을 처리하지 못했습니다.' },
      { status: 500 }
    )
  }
}
