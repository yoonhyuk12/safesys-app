'use client'
// 요청사항 게시글을 반응형 목록으로 조회하고 목록 내 투표를 처리하는 페이지

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import BoardErrorBanner from '@/components/board/BoardErrorBanner'
import BoardHeader from '@/components/board/BoardHeader'
import BoardPostList from '@/components/board/BoardPostList'
import { applyOptimisticVote } from '@/components/board/boardHelpers'
import { fetchPosts, votePost } from '@/lib/board/queries'
import type { BoardPost, VoteValue } from '@/lib/board/types'

export default function BoardPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null

  const [posts, setPosts] = useState<BoardPost[]>([])
  const [loading, setLoading] = useState(true)
  const [votingIds, setVotingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, router, user])

  const loadPosts = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)
    try {
      const nextPosts = await fetchPosts(userId)
      setPosts(nextPosts)
    } catch {
      setError('요청사항 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!authLoading && userId) void loadPosts()
  }, [authLoading, loadPosts, userId])

  const markVoting = (postId: string, voting: boolean) => {
    setVotingIds((current) => {
      const next = new Set(current)
      if (voting) next.add(postId)
      else next.delete(postId)
      return next
    })
  }

  const handleVote = async (postId: string, vote: VoteValue) => {
    if (!userId || votingIds.has(postId)) return
    const previous = posts.find((post) => post.id === postId)
    if (!previous) return

    markVoting(postId, true)
    setError(null)
    setPosts((current) =>
      current.map((post) => (post.id === postId ? applyOptimisticVote(post, vote) : post))
    )

    try {
      await votePost(postId, userId, vote)
    } catch {
      setPosts((current) => current.map((post) => (post.id === postId ? previous : post)))
      setError('게시글 투표를 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      markVoting(postId, false)
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <BoardHeader
        title="요청사항 게시판"
        onBack={() => router.push('/list')}
        action={
          <button
            type="button"
            onClick={() => router.push('/board/new')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            글쓰기
          </button>
        }
      />

      <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="space-y-3">
          <BoardErrorBanner message={error} onDismiss={() => setError(null)} />

          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {loading ? (
              <div className="flex justify-center py-16">
                <LoadingSpinner />
              </div>
            ) : posts.length === 0 ? (
              <p className="px-4 py-16 text-center text-sm text-gray-500">
                등록된 요청사항이 없습니다.
              </p>
            ) : (
              <BoardPostList
                posts={posts}
                userId={userId}
                votingIds={votingIds}
                onOpen={(postId) => router.push(`/board/${postId}`)}
                onVote={(postId, vote) => void handleVote(postId, vote)}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
