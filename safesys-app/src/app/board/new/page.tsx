'use client'
// 로그인 사용자가 새 요청사항의 제목과 내용을 작성해 등록하는 페이지

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import BoardErrorBanner from '@/components/board/BoardErrorBanner'
import BoardHeader from '@/components/board/BoardHeader'
import BoardPostForm from '@/components/board/BoardPostForm'
import { createPost } from '@/lib/board/queries'

export default function NewBoardPostPage() {
  const router = useRouter()
  const { user, userProfile, loading: authLoading } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, router, user])

  const handleSave = async () => {
    const nextTitle = title.trim()
    const nextContent = content.trim()
    if (!user || !nextTitle || !nextContent || saving) return

    setSaving(true)
    setError(null)
    try {
      const authorName = userProfile?.full_name || user.email || '사용자'
      const postId = await createPost(
        { title: nextTitle, content: nextContent },
        user.id,
        authorName
      )
      router.replace(`/board/${postId}`)
    } catch {
      setError('요청사항을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <BoardHeader title="요청사항 작성" onBack={() => router.push('/board')} />

      <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="space-y-3">
          <BoardErrorBanner message={error} onDismiss={() => setError(null)} />
          <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
            <BoardPostForm
              title={title}
              content={content}
              onTitleChange={setTitle}
              onContentChange={setContent}
              onSubmit={() => void handleSave()}
              saving={saving}
              submitLabel="저장"
            />
          </section>
        </div>
      </main>
    </div>
  )
}
