// 요청사항 게시판의 Supabase 데이터 액세스 — 게시글·댓글 CRUD와 추천/비추천 토글

import { supabase } from '@/lib/supabase'
import type {
  BoardComment,
  BoardPost,
  BoardPostInput,
  BoardStatus,
  VoteValue,
} from './types'

type BoardPostRow = Omit<BoardPost, 'status' | 'my_vote'> & { status: string }
type BoardCommentRow = Omit<BoardComment, 'my_vote'>
type PostVoteRow = { post_id: string | null; vote: VoteValue }
type CommentVoteRow = { comment_id: string | null; vote: VoteValue }
type ExistingVoteRow = { id: string; vote: VoteValue }
type VoteTarget = { column: 'post_id' | 'comment_id'; id: string; label: '게시글' | '댓글' }

const POST_COLUMNS =
  'id, title, content, author_id, author_name, status, upvotes, downvotes, comment_count, view_count, created_at, updated_at'
const COMMENT_COLUMNS =
  'id, post_id, content, author_id, author_name, upvotes, downvotes, created_at, updated_at'

function toBoardPost(row: BoardPostRow, myVote: VoteValue | null): BoardPost {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    author_id: row.author_id,
    author_name: row.author_name,
    status: row.status as BoardStatus,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    comment_count: row.comment_count,
    view_count: row.view_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    my_vote: myVote,
  }
}

function toBoardComment(row: BoardCommentRow, myVote: VoteValue | null): BoardComment {
  return {
    id: row.id,
    post_id: row.post_id,
    content: row.content,
    author_id: row.author_id,
    author_name: row.author_name,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    my_vote: myVote,
  }
}

export async function fetchPosts(userId: string | null): Promise<BoardPost[]> {
  const { data, error } = await supabase
    .from('board_posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error('게시글 목록을 불러오지 못했습니다.')
  }

  const posts = (data ?? []) as BoardPostRow[]
  const votesByPostId = new Map<string, VoteValue>()

  if (userId && posts.length > 0) {
    const { data: voteData, error: voteError } = await supabase
      .from('board_votes')
      .select('post_id, vote')
      .eq('user_id', userId)
      .in('post_id', posts.map(post => post.id))

    if (voteError) {
      throw new Error('게시글 투표 정보를 불러오지 못했습니다.')
    }

    for (const row of (voteData ?? []) as PostVoteRow[]) {
      if (row.post_id) {
        votesByPostId.set(row.post_id, row.vote)
      }
    }
  }

  return posts.map(post => toBoardPost(post, votesByPostId.get(post.id) ?? null))
}

export async function fetchPost(postId: string, userId: string | null): Promise<BoardPost | null> {
  const { data, error } = await supabase
    .from('board_posts')
    .select(POST_COLUMNS)
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    throw new Error('게시글을 불러오지 못했습니다.')
  }
  if (!data) {
    return null
  }

  let myVote: VoteValue | null = null

  if (userId) {
    const { data: voteData, error: voteError } = await supabase
      .from('board_votes')
      .select('vote')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle()

    if (voteError) {
      throw new Error('게시글 투표 정보를 불러오지 못했습니다.')
    }

    myVote = voteData ? (voteData.vote as VoteValue) : null
  }

  return toBoardPost(data as BoardPostRow, myVote)
}

export async function incrementPostView(postId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_board_post_view', { p_post_id: postId })

  // 조회수는 부수 지표이므로 실패해도 게시글 표시를 막지 않는다.
  if (error) {
    console.error('게시글 조회수 증가에 실패했습니다.', error)
  }
}

export async function createPost(
  input: BoardPostInput,
  authorId: string,
  authorName: string
): Promise<string> {
  const { data, error } = await supabase
    .from('board_posts')
    .insert({
      title: input.title,
      content: input.content,
      author_id: authorId,
      author_name: authorName,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error('게시글을 등록하지 못했습니다.')
  }

  return data.id as string
}

export async function updatePost(postId: string, input: BoardPostInput): Promise<void> {
  const { error } = await supabase
    .from('board_posts')
    .update({ title: input.title, content: input.content })
    .eq('id', postId)

  if (error) {
    throw new Error('게시글을 수정하지 못했습니다.')
  }
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('board_posts')
    .delete()
    .eq('id', postId)

  if (error) {
    throw new Error('게시글을 삭제하지 못했습니다.')
  }
}

export async function fetchComments(
  postId: string,
  userId: string | null
): Promise<BoardComment[]> {
  const { data, error } = await supabase
    .from('board_comments')
    .select(COMMENT_COLUMNS)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error('댓글 목록을 불러오지 못했습니다.')
  }

  const comments = (data ?? []) as BoardCommentRow[]
  const votesByCommentId = new Map<string, VoteValue>()

  if (userId && comments.length > 0) {
    const { data: voteData, error: voteError } = await supabase
      .from('board_votes')
      .select('comment_id, vote')
      .eq('user_id', userId)
      .in('comment_id', comments.map(comment => comment.id))

    if (voteError) {
      throw new Error('댓글 투표 정보를 불러오지 못했습니다.')
    }

    for (const row of (voteData ?? []) as CommentVoteRow[]) {
      if (row.comment_id) {
        votesByCommentId.set(row.comment_id, row.vote)
      }
    }
  }

  return comments.map(comment =>
    toBoardComment(comment, votesByCommentId.get(comment.id) ?? null)
  )
}

export async function createComment(
  postId: string,
  content: string,
  authorId: string,
  authorName: string
): Promise<void> {
  const { error } = await supabase.from('board_comments').insert({
    post_id: postId,
    content,
    author_id: authorId,
    author_name: authorName,
  })

  if (error) {
    throw new Error('댓글을 등록하지 못했습니다.')
  }
}

export async function updateComment(commentId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('board_comments')
    .update({ content })
    .eq('id', commentId)

  if (error) {
    throw new Error('댓글을 수정하지 못했습니다.')
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('board_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    throw new Error('댓글을 삭제하지 못했습니다.')
  }
}

async function toggleVote(target: VoteTarget, userId: string, vote: VoteValue): Promise<void> {
  const { data, error } = await supabase
    .from('board_votes')
    .select('id, vote')
    .eq('user_id', userId)
    .eq(target.column, target.id)
    .maybeSingle()

  if (error) {
    throw new Error(`${target.label} 투표를 처리하지 못했습니다.`)
  }

  const existingVote = data as ExistingVoteRow | null

  if (!existingVote) {
    const newVote = target.column === 'post_id'
      ? { user_id: userId, post_id: target.id, vote }
      : { user_id: userId, comment_id: target.id, vote }
    const { error: insertError } = await supabase.from('board_votes').insert(newVote)

    if (insertError) {
      throw new Error(`${target.label} 투표를 처리하지 못했습니다.`)
    }
    return
  }

  if (existingVote.vote === vote) {
    const { error: deleteError } = await supabase
      .from('board_votes')
      .delete()
      .eq('id', existingVote.id)

    if (deleteError) {
      throw new Error(`${target.label} 투표를 취소하지 못했습니다.`)
    }
    return
  }

  const { error: updateError } = await supabase
    .from('board_votes')
    .update({ vote })
    .eq('id', existingVote.id)

  if (updateError) {
    throw new Error(`${target.label} 투표를 변경하지 못했습니다.`)
  }
}

export async function votePost(postId: string, userId: string, vote: VoteValue): Promise<void> {
  await toggleVote({ column: 'post_id', id: postId, label: '게시글' }, userId, vote)
}

export async function voteComment(
  commentId: string,
  userId: string,
  vote: VoteValue
): Promise<void> {
  await toggleVote({ column: 'comment_id', id: commentId, label: '댓글' }, userId, vote)
}
