// 관리자 가입자 목록을 Auth 사용자와 프로필 데이터로 병합해 반환하는 라우트
import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const PAGE_SIZE = 1000

interface UserProfileRow {
  id: string
  full_name: string | null
  phone_number: string | null
  position: string | null
  role: string | null
  hq_division: string | null
  branch_division: string | null
  company_name: string | null
}

async function loadAllAuthUsers(): Promise<User[]> {
  const users: User[] = []

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    })

    if (error) throw error
    users.push(...data.users)
    if (data.users.length < PAGE_SIZE) break
  }

  return users
}

async function loadAllProfiles(): Promise<UserProfileRow[]> {
  const profiles: UserProfileRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, full_name, phone_number, position, role, hq_division, branch_division, company_name')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const page = (data ?? []) as UserProfileRow[]
    profiles.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return profiles
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    )
  }

  try {
    const [authUsers, profiles] = await Promise.all([
      loadAllAuthUsers(),
      loadAllProfiles(),
    ])
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    const users = authUsers.map((user) => {
      const profile = profileById.get(user.id)

      return {
        id: user.id,
        email: user.email ?? null,
        full_name: profile?.full_name ?? null,
        phone_number: profile?.phone_number ?? null,
        position: profile?.position ?? null,
        role: profile?.role ?? null,
        hq_division: profile?.hq_division ?? null,
        branch_division: profile?.branch_division ?? null,
        company_name: profile?.company_name ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        has_profile: Boolean(profile),
      }
    })

    return NextResponse.json({ success: true, users })
  } catch (error) {
    console.error('관리자 가입자 목록 조회 오류', error)
    return NextResponse.json(
      { success: false, error: '가입자 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
