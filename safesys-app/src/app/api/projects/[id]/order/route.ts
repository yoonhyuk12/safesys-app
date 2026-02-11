import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const { display_order } = await request.json()
    
    if (typeof display_order !== 'number') {
      return NextResponse.json(
        { error: 'display_order must be a number' },
        { status: 400 }
      )
    }

    // Authorization 헤더에서 토큰 추출
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split('Bearer ')[1]

    // 요청 토큰을 포함한 서버용 Supabase 클라이언트 생성 (RLS에 위임)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    )
    
    // 프로젝트 display_order 업데이트 (권한 검사는 RLS 정책에 위임)
    const { data, error } = await supabase
      .from('projects')
      .update({
        display_order,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('프로젝트 순서 업데이트 오류:', error)
      return NextResponse.json(
        { error: '프로젝트 순서를 업데이트할 수 없습니다.' },
        { status: 500 }
      )
    }

    if (!data) {
      // RLS 또는 존재하지 않는 경우
      return NextResponse.json(
        { error: '업데이트할 프로젝트가 없거나 권한이 없습니다.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

