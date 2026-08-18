'use client'
// 요청사항 댓글 목록과 작성·수정·삭제·추천 및 관리자 조정을 담당하는 영역

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MessageSquare, Pencil, Trash2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  createComment,
  deleteComment,
  fetchComments,
  updateComment,
  voteComment,
} from '@/lib/board/queries'
import { moderateDeleteComment } from '@/lib/board/admin'
import { isAuthor, type BoardComment, type VoteValue } from '@/lib/board/types'
import BoardErrorBanner from './BoardErrorBanner'
import BoardVoteButtons from './BoardVoteButtons'
import { applyOptimisticVote, formatBoardDate } from './boardHelpers'

interface CommentSectionProps {
  postId: string
  userId: string | null
  authorName: string
  canManage: boolean
}

export default function CommentSection({
  postId,
  userId,
  authorName,
  canManage,
}: CommentSectionProps) {
  const [comments, setComments] = useState<BoardComment[]>([])
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [votingIds, setVotingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const loadComments = useCallback(async () => {
    if (!postId) return

    setLoading(true)
    setError(null)
    try {
      const nextComments = await fetchComments(postId, userId)
      setComments(nextComments)
    } catch {
      setError('댓글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [postId, userId])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextContent = content.trim()
    if (!userId || !nextContent || creating) return

    setCreating(true)
    setError(null)
    try {
      await createComment(postId, nextContent, userId, authorName)
      setContent('')
      try {
        const nextComments = await fetchComments(postId, userId)
        setComments(nextComments)
      } catch {
        setError('댓글은 등록했지만 목록을 새로 불러오지 못했습니다. 페이지를 다시 열어 주세요.')
      }
    } catch {
      setError('댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setCreating(false)
    }
  }

  const beginEdit = (comment: BoardComment) => {
    setEditingId(comment.id)
    setEditingContent(comment.content)
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingContent('')
  }

  const handleUpdate = async (commentId: string) => {
    const nextContent = editingContent.trim()
    if (!nextContent || updatingId) return

    setUpdatingId(commentId)
    setError(null)
    try {
      await updateComment(commentId, nextContent)
      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId
            ? { ...comment, content: nextContent, updated_at: new Date().toISOString() }
            : comment
        )
      )
      cancelEdit()
    } catch {
      setError('댓글을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setUpdatingId(null)
    }
  }

  const markDeleting = (commentId: string, deleting: boolean) => {
    setDeletingIds((current) => {
      const next = new Set(current)
      if (deleting) next.add(commentId)
      else next.delete(commentId)
      return next
    })
  }

  const handleDelete = async (commentId: string, asModerator: boolean) => {
    const prompt = asModerator
      ? '관리자 권한으로 이 댓글을 삭제하시겠습니까?'
      : '이 댓글을 삭제하시겠습니까?'
    if (!window.confirm(prompt)) return

    markDeleting(commentId, true)
    setError(null)
    try {
      if (asModerator) await moderateDeleteComment(commentId)
      else await deleteComment(commentId)
      setComments((current) => current.filter((comment) => comment.id !== commentId))
      if (editingId === commentId) cancelEdit()
    } catch {
      setError('댓글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      markDeleting(commentId, false)
    }
  }

  const markVoting = (commentId: string, voting: boolean) => {
    setVotingIds((current) => {
      const next = new Set(current)
      if (voting) next.add(commentId)
      else next.delete(commentId)
      return next
    })
  }

  const handleVote = async (commentId: string, vote: VoteValue) => {
    if (!userId || votingIds.has(commentId)) return
    const previous = comments.find((comment) => comment.id === commentId)
    if (!previous) return

    markVoting(commentId, true)
    setError(null)
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId ? applyOptimisticVote(comment, vote) : comment
      )
    )

    try {
      await voteComment(commentId, userId, vote)
    } catch {
      setComments((current) =>
        current.map((comment) => (comment.id === commentId ? previous : comment))
      )
      setError('댓글 투표를 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      markVoting(commentId, false)
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">댓글 {comments.length}</h2>
      </div>

      <div className="space-y-4 p-4">
        <BoardErrorBanner message={error} onDismiss={() => setError(null)} />

        {userId && (
          <form onSubmit={handleCreate} className="space-y-2">
            <label htmlFor="comment-content" className="sr-only">
              댓글 내용
            </label>
            <textarea
              id="comment-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="댓글을 입력하세요."
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!content.trim() || creating}
                className="min-h-[40px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? '등록 중...' : '댓글 등록'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">등록된 댓글이 없습니다.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {comments.map((comment) => {
              const ownComment = isAuthor(comment.author_id, userId)
              const deleting = deletingIds.has(comment.id)
              const updating = updatingId === comment.id

              return (
                <article key={comment.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="max-w-full truncate text-sm font-medium text-gray-900">
                      {comment.author_name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatBoardDate(comment.created_at, true)}
                    </span>
                    {comment.updated_at !== comment.created_at && (
                      <span className="text-xs text-gray-400">(수정됨)</span>
                    )}
                  </div>

                  {editingId === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingContent}
                        onChange={(event) => setEditingContent(event.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        aria-label="댓글 수정 내용"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={updating}
                          className="min-h-[40px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpdate(comment.id)}
                          disabled={!editingContent.trim() || updating}
                          className="min-h-[40px] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {updating ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                      {comment.content}
                    </p>
                  )}

                  <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <BoardVoteButtons
                      upvotes={comment.upvotes}
                      downvotes={comment.downvotes}
                      myVote={comment.my_vote}
                      onVote={(vote) => void handleVote(comment.id, vote)}
                      disabled={!userId || votingIds.has(comment.id)}
                      compact
                    />

                    <div className="flex flex-wrap justify-end gap-1">
                      {ownComment && editingId !== comment.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEdit(comment)}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(comment.id, false)}
                            disabled={deleting}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            삭제
                          </button>
                        </>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(comment.id, true)}
                          disabled={deleting}
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          관리자 삭제
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
