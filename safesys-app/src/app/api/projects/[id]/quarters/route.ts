import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('projects')
      .select('is_active')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    if (!data) return NextResponse.json({ error: '없음' }, { status: 404 })

    return NextResponse.json({ success: true, is_active: data.is_active })
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const allowedKeys = ['q1', 'q2', 'q3', 'q4', 'completed'] as const
    const updates: Record<string, boolean> = {}
    for (const k of allowedKeys) {
      if (k in body) {
        const v = body[k]
        if (typeof v !== 'boolean') {
          return NextResponse.json({ error: `${k} must be boolean` }, { status: 400 })
        }
        updates[k] = v
      }
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.split('Bearer ')[1]

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    )

    // 현재 값 조회
    const { data: current, error: curErr } = await supabase
      .from('projects')
      .select('is_active')
      .eq('id', id)
      .maybeSingle()

    if (curErr) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    if (!current) return NextResponse.json({ error: '없음' }, { status: 404 })

    // 기존 boolean도 호환
    let merged: any = {
      q1: true,
      q2: true,
      q3: true,
      q4: true,
      completed: false
    }
    if (typeof current.is_active === 'object' && current.is_active !== null) {
      merged = { ...merged, ...current.is_active }
    } else if (current.is_active === false) {
      merged = { q1: false, q2: false, q3: false, q4: false, completed: false }
    }

    merged = { ...merged, ...updates }

    // 상호배제 규칙
    if (merged.completed) {
      merged.q1 = false
      merged.q2 = false
      merged.q3 = false
      merged.q4 = false
    } else if (merged.q1 || merged.q2 || merged.q3 || merged.q4) {
      merged.completed = false
    }

    const { error: upErr } = await supabase
      .from('projects')
      .update({ is_active: merged, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (upErr) return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })

    return NextResponse.json({ success: true, is_active: merged })
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}


