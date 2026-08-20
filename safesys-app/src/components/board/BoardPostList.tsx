'use client'
// 게시글 데이터를 데스크탑 표와 모바일 카드 형식으로 반응형 렌더링하는 목록

import type { KeyboardEvent } from 'react'
import { Eye, MessageSquare } from 'lucide-react'
import type { BoardPost, VoteValue } from '@/lib/board/types'
import BoardStatusBadge from './BoardStatusBadge'
import BoardVoteButtons from './BoardVoteButtons'
import { formatBoardDate } from './boardHelpers'

interface BoardPostListProps {
  posts: BoardPost[]
  userId: string | null
  votingIds: Set<string>
  onOpen: (postId: string) => void
  onVote: (postId: string, vote: VoteValue) => void
}

function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen()
  }
}

export default function BoardPostList({
  posts,
  userId,
  votingIds,
  onOpen,
  onVote,
}: BoardPostListProps) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-[900px] w-full table-fixed text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-center text-xs font-medium text-gray-500">
            <tr>
              <th className="w-[38%] px-3 py-2.5">제목</th>
              <th className="w-[10%] px-3 py-2.5">작성자</th>
              <th className="w-[8%] px-3 py-2.5">상태</th>
              <th className="w-[18%] px-3 py-2.5">추천</th>
              <th className="w-[7%] px-3 py-2.5">댓글수</th>
              <th className="w-[7%] px-3 py-2.5">조회수</th>
              <th className="w-[12%] px-3 py-2.5">작성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {posts.map((post) => (
              <tr
                key={post.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(post.id)}
                onKeyDown={(event) => handleRowKeyDown(event, () => onOpen(post.id))}
                className="cursor-pointer text-gray-700 outline-none hover:bg-blue-50/50 focus:bg-blue-50/50"
              >
                <td className="px-3 py-3">
                  <p className="truncate font-medium text-gray-900">{post.title}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="truncate">{post.author_name}</p>
                </td>
                <td className="px-3 py-3">
                  <BoardStatusBadge status={post.status} />
                </td>
                <td className="px-3 py-2">
                  <BoardVoteButtons
                    upvotes={post.upvotes}
                    downvotes={post.downvotes}
                    myVote={post.my_vote}
                    onVote={(vote) => onVote(post.id, vote)}
                    disabled={!userId || votingIds.has(post.id)}
                    showScore={false}
                    compact
                  />
                </td>
                <td className="px-3 py-3 text-center tabular-nums">{post.comment_count}</td>
                <td className="px-3 py-3 text-center tabular-nums">{post.view_count}</td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                  {formatBoardDate(post.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-gray-100 sm:hidden">
        {posts.map((post) => {
          const score = post.upvotes - post.downvotes

          return (
            <article
              key={post.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(post.id)}
              onKeyDown={(event) => handleRowKeyDown(event, () => onOpen(post.id))}
              className="cursor-pointer p-3 outline-none hover:bg-blue-50/50 focus:bg-blue-50/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                  {post.title}
                </h2>
                <BoardStatusBadge status={post.status} />
              </div>

              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="max-w-[45%] truncate">{post.author_name}</span>
                <span>{formatBoardDate(post.created_at)}</span>
                <span>순추천 {score}</span>
                <span>추천 {post.upvotes}</span>
                <span>비추천 {post.downvotes}</span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  댓글 {post.comment_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  조회 {post.view_count}
                </span>
              </div>

              <div className="mt-2">
                <BoardVoteButtons
                  upvotes={post.upvotes}
                  downvotes={post.downvotes}
                  myVote={post.my_vote}
                  onVote={(vote) => onVote(post.id, vote)}
                  disabled={!userId || votingIds.has(post.id)}
                  showScore={false}
                  compact
                />
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
