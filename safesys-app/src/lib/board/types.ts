// 요청사항 게시판(게시글·댓글·추천/비추천)의 공용 타입과 처리 상태 라벨 정의

export const BOARD_STATUSES = ['접수', '검토중', '반영완료', '보류'] as const
export type BoardStatus = (typeof BOARD_STATUSES)[number]

// 상태 뱃지 스타일 (Tailwind 클래스)
export const BOARD_STATUS_STYLES: Record<BoardStatus, string> = {
  접수: 'bg-gray-100 text-gray-700 border-gray-200',
  검토중: 'bg-amber-100 text-amber-800 border-amber-200',
  반영완료: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  보류: 'bg-slate-100 text-slate-500 border-slate-200',
}

// 1 = 추천, -1 = 비추천
export type VoteValue = 1 | -1

export interface BoardPost {
  id: string
  title: string
  content: string
  author_id: string | null
  author_name: string
  status: BoardStatus
  upvotes: number
  downvotes: number
  comment_count: number
  created_at: string
  updated_at: string
  /** 현재 로그인 사용자의 투표. 투표하지 않았으면 null */
  my_vote: VoteValue | null
}

export interface BoardComment {
  id: string
  post_id: string
  content: string
  author_id: string | null
  author_name: string
  upvotes: number
  downvotes: number
  created_at: string
  updated_at: string
  /** 현재 로그인 사용자의 투표. 투표하지 않았으면 null */
  my_vote: VoteValue | null
}

export interface BoardPostInput {
  title: string
  content: string
}

export interface BoardAdminState {
  isAdmin: boolean
  otpVerified: boolean
}

/** 관리자 조정 UI를 노출할 조건 — 관리자이면서 인증번호 로그인까지 마친 세션만 */
export function canModerate(state: BoardAdminState | null): boolean {
  return Boolean(state?.isAdmin && state.otpVerified)
}

/** 본인 글·댓글 수정/삭제 가능 여부 */
export function isAuthor(authorId: string | null, userId: string | null | undefined): boolean {
  return Boolean(authorId && userId && authorId === userId)
}
