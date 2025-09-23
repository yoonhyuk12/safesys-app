import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET 메서드 추가 (디버깅용)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  return NextResponse.json({
    message: 'Status API endpoint is working',
    projectId: id,
    method: 'GET'
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const startTime = Date.now()
    const { id } = params
    const { is_active } = await request.json()
    
    if (typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'is_active must be a boolean' },
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
    
    // 프로젝트 상태 업데이트 (권한 검사는 RLS 정책에 위임)
    const updateStart = Date.now()
    const { data, error } = await supabase
      .from('projects')
      .update({
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('프로젝트 상태 업데이트 오류:', error)
      return NextResponse.json(
        { error: '프로젝트 상태를 업데이트할 수 없습니다.' },
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

    const totalMs = Date.now() - startTime
    const updateMs = Date.now() - updateStart
    console.log('[Status PATCH] 완료', { id, is_active, updateMs, totalMs })
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}