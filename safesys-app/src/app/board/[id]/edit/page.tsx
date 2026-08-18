'use client'
// 작성자 본인이 기존 요청사항의 제목과 내용을 불러와 수정하는 페이지

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import BoardErrorBanner from '@/components/board/BoardErrorBanner'
import BoardHeader from '@/components/board/BoardHeader'
import BoardPostForm from '@/components/board/BoardPostForm'
import { fetchPost, updatePost } from '@/lib/board/queries'
import { isAuthor } from '@/lib/board/types'

export default function EditBoardPostPage() {
  const router = useRouter()
  const params = useParams()
  const rawPostId = params.id
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId ?? ''
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, router, user])

  const loadPost = useCallback(async () => {
    if (!postId || !userId) return

    setLoading(true)
    setError(null)
    try {
      const post = await fetchPost(postId, userId)
      if (!post) {
        setAuthorized(false)
        setError('수정할 요청사항을 찾을 수 없습니다.')
        return
      }
      if (!isAuthor(post.author_id, userId)) {
        setAuthorized(false)
        setRedirecting(true)
        router.replace(`/board/${postId}`)
        return
      }

      setAuthorized(true)
      setTitle(post.title)
      setContent(post.content)
    } catch {
      setError('요청사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [postId, router, userId])

  useEffect(() => {
    if (!authLoading && userId && postId) void loadPost()
  }, [authLoading, loadPost, postId, userId])

  const handleSave = async () => {
    const nextTitle = title.trim()
    const nextContent = content.trim()
    if (!authorized || !nextTitle || !nextContent || saving) return

    setSaving(true)
    setError(null)
    try {
      await updatePost(postId, { title: nextTitle, content: nextContent })
      router.replace(`/board/${postId}`)
    } catch {
      setError('요청사항을 수정하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user || redirecting) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <BoardHeader title="요청사항 수정" onBack={() => router.push(`/board/${postId}`)} />

      <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="space-y-3">
          <BoardErrorBanner message={error} onDismiss={() => setError(null)} />
          {authorized ? (
            <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
              <BoardPostForm
                title={title}
                content={content}
                onTitleChange={setTitle}
                onContentChange={setContent}
                onSubmit={() => void handleSave()}
                saving={saving}
                submitLabel="수정 저장"
              />
            </section>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-16 text-center text-sm text-gray-500">
              수정할 요청사항을 불러올 수 없습니다.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
