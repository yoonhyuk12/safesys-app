// 관리자 가입자 프로필 수정과 계정 삭제를 처리하는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const ROLES = ['발주청', '감리단', '시공사'] as const
const TEXT_FIELDS = [
  'full_name',
  'phone_number',
  'position',
  'hq_division',
  'branch_division',
  'company_name',
] as const

type Role = (typeof ROLES)[number]
type TextField = (typeof TEXT_FIELDS)[number]
type ProfileUpdate = Partial<Record<TextField, string | null>> & {
  role?: Role
  updated_at: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProfileUpdate(body: unknown): ProfileUpdate | string {
  if (!isObject(body)) return '수정할 프로필 정보를 확인해 주세요.'

  const update: ProfileUpdate = { updated_at: new Date().toISOString() }
  let hasField = false

  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue
    const value = body[field]
    if (typeof value !== 'string' && value !== null) {
      return '프로필 항목은 문자열 또는 빈 값이어야 합니다.'
    }
    update[field] = value
    hasField = true
  }

  if ('role' in body) {
    if (!ROLES.includes(body.role as Role)) {
      return '역할은 발주청, 감리단, 시공사 중에서 선택해 주세요.'
    }
    update.role = body.role as Role
    hasField = true
  }

  return hasField ? update : '수정할 프로필 항목이 없습니다.'
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    )
  }

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: '요청 본문을 확인해 주세요.' },
      { status: 400 }
    )
  }

  const update = parseProfileUpdate(body)
  if (typeof update === 'string') {
    return NextResponse.json(
      { success: false, error: update },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .update(update)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('관리자 가입자 프로필 수정 오류', error)
    return NextResponse.json(
      { success: false, error: '가입자 정보를 수정하지 못했습니다.' },
      { status: 500 }
    )
  }
  if (!data) {
    return NextResponse.json(
      { success: false, error: '수정할 가입자 프로필을 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    )
  }

  const { id } = await params
  if (auth.user.id === id) {
    return NextResponse.json(
      { success: false, error: '현재 로그인한 관리자 계정은 삭제할 수 없습니다.' },
      { status: 400 }
    )
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (authError) {
    console.error('관리자 가입자 Auth 계정 삭제 오류', authError)
    return NextResponse.json(
      { success: false, error: '가입자 계정을 삭제하지 못했습니다.' },
      { status: 500 }
    )
  }

  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .delete()
    .eq('id', id)

  if (profileError) {
    console.error('관리자 가입자 프로필 삭제 오류', profileError)
    return NextResponse.json(
      { success: false, error: '계정은 삭제했지만 프로필 정리에 실패했습니다.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
