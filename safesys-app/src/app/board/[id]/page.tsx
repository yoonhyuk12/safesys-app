'use client'
// 요청사항 본문과 투표, 작성자·관리자 동작 및 댓글을 제공하는 상세 페이지

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import BoardErrorBanner from '@/components/board/BoardErrorBanner'
import BoardHeader from '@/components/board/BoardHeader'
import BoardStatusBadge from '@/components/board/BoardStatusBadge'
import BoardVoteButtons from '@/components/board/BoardVoteButtons'
import CommentSection from '@/components/board/CommentSection'
import { applyOptimisticVote, formatBoardDate } from '@/components/board/boardHelpers'
import {
  deletePost,
  fetchPost,
  incrementPostView,
  votePost,
} from '@/lib/board/queries'
import {
  fetchBoardAdminState,
  moderateDeletePost,
  moderateSetStatus,
} from '@/lib/board/admin'
import {
  BOARD_STATUSES,
  canModerate,
  isAuthor,
  type BoardAdminState,
  type BoardPost,
  type BoardStatus,
  type VoteValue,
} from '@/lib/board/types'

export default function BoardPostDetailPage() {
  const router = useRouter()
  const params = useParams()
  const rawPostId = params.id
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId ?? ''
  const { user, userProfile, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const authorName = userProfile?.full_name || user?.email || '사용자'
  const viewedPostIdRef = useRef<string | null>(null)

  const [post, setPost] = useState<BoardPost | null>(null)
  const [adminState, setAdminState] = useState<BoardAdminState | null>(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, router, user])

  const loadPost = useCallback(async () => {
    if (!postId || !userId) return

    setLoading(true)
    setError(null)
    try {
      const nextPost = await fetchPost(postId, userId)
      if (nextPost && viewedPostIdRef.current !== nextPost.id) {
        viewedPostIdRef.current = nextPost.id
        void incrementPostView(nextPost.id)
        setPost({ ...nextPost, view_count: nextPost.view_count + 1 })
      } else {
        setPost(nextPost)
      }
      if (!nextPost) setError('요청사항을 찾을 수 없습니다.')
    } catch {
      setError('요청사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [postId, userId])

  const loadAdminState = useCallback(async () => {
    try {
      const nextAdminState = await fetchBoardAdminState()
      setAdminState(nextAdminState)
    } catch {
      setError('관리자 권한 정보를 확인하지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    if (!authLoading && userId && postId) {
      void loadPost()
      void loadAdminState()
    }
  }, [authLoading, loadAdminState, loadPost, postId, userId])

  const handleVote = async (vote: VoteValue) => {
    if (!userId || !post || voting) return
    const previous = post

    setVoting(true)
    setError(null)
    setPost(applyOptimisticVote(post, vote))
    try {
      await votePost(post.id, userId, vote)
    } catch {
      setPost(previous)
      setError('게시글 투표를 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setVoting(false)
    }
  }

  const handleDelete = async (asModerator: boolean) => {
    if (!post || deleting) return
    const prompt = asModerator
      ? '관리자 권한으로 이 요청사항을 삭제하시겠습니까?'
      : '이 요청사항을 삭제하시겠습니까?'
    if (!window.confirm(prompt)) return

    setDeleting(true)
    setError(null)
    try {
      if (asModerator) await moderateDeletePost(post.id)
      else await deletePost(post.id)
      router.replace('/board')
    } catch {
      setError('요청사항을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setDeleting(false)
    }
  }

  const handleStatusChange = async (status: BoardStatus) => {
    if (!post || post.status === status || changingStatus) return

    setChangingStatus(true)
    setError(null)
    try {
      await moderateSetStatus(post.id, status)
      setPost((current) => (current ? { ...current, status } : current))
    } catch {
      setError('처리 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setChangingStatus(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) return null

  const ownPost = post ? isAuthor(post.author_id, userId) : false
  const canManage = canModerate(adminState)

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <BoardHeader title="요청사항 상세" onBack={() => router.push('/board')} />

      <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="space-y-3">
          <BoardErrorBanner message={error} onDismiss={() => setError(null)} />

          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : post ? (
            <>
              <article className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-2">
                  <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-gray-900 sm:text-xl" title={post.title}>
                    {post.title}
                  </h1>
                  <span className="inline-flex shrink-0 items-center gap-1 py-0.5 text-xs text-gray-500">
                    <Eye className="h-3.5 w-3.5" />
                    조회 {post.view_count}
                  </span>
                  <BoardStatusBadge status={post.status} />
                </div>

                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="max-w-full truncate font-medium text-gray-700">{post.author_name}</span>
                  <span>{formatBoardDate(post.created_at, true)}</span>
                  {post.updated_at !== post.created_at && <span>(수정됨)</span>}
                </div>

                <div className="my-4 border-t border-gray-100" />
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-800 sm:text-base">
                  {post.content}
                </p>

                <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                  <BoardVoteButtons
                    upvotes={post.upvotes}
                    downvotes={post.downvotes}
                    myVote={post.my_vote}
                    onVote={(vote) => void handleVote(vote)}
                    disabled={!userId || voting}
                  />

                  {ownPost && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/board/${post.id}/edit`)}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(false)}
                        disabled={deleting}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </article>

              {canManage && (
                <section className="rounded-lg border border-gray-200 bg-white p-4">
                  <h2 className="mb-3 text-sm font-semibold text-gray-900">관리자 조정</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="board-status" className="text-sm text-gray-600">
                      처리 상태
                    </label>
                    <select
                      id="board-status"
                      value={post.status}
                      onChange={(event) => void handleStatusChange(event.target.value as BoardStatus)}
                      disabled={changingStatus}
                      className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
                    >
                      {BOARD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleDelete(true)}
                      disabled={deleting}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      관리자 삭제
                    </button>
                  </div>
                </section>
              )}

              <CommentSection
                postId={post.id}
                userId={userId}
                authorName={authorName}
                canManage={canManage}
              />
            </>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-16 text-center text-sm text-gray-500">
              요청사항을 찾을 수 없습니다.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
