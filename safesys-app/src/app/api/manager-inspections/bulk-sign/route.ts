import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const { inspection_ids, signature_data } = await request.json()

    console.log('📝 [bulk-sign] 요청 수신')
    console.log('inspection_ids:', inspection_ids)
    console.log('signature_data length:', signature_data?.length)

    if (!inspection_ids || !Array.isArray(inspection_ids) || inspection_ids.length === 0) {
      return NextResponse.json({ error: '점검 ID 목록이 필요합니다.' }, { status: 400 })
    }

    if (!signature_data || typeof signature_data !== 'string') {
      return NextResponse.json({ error: '유효한 서명 데이터가 필요합니다.' }, { status: 400 })
    }

    // ID 정규화 및 중복 제거
    const normalizedIds = Array.from(
      new Set(
        (inspection_ids as unknown[])
          .map((v) => (v == null ? '' : String(v).trim()))
          .filter((v) => v.length > 0)
      )
    )

    if (normalizedIds.length === 0) {
      return NextResponse.json({ error: '유효한 점검 ID가 없습니다.' }, { status: 400 })
    }

    // 존재 여부 사전 확인
    const { data: existingRows, error: existError } = await supabaseAdmin
      .from('manager_inspections')
      .select('id')
      .in('id', normalizedIds)

    if (existError) {
      console.error('사전 조회 오류:', existError)
      return NextResponse.json(
        { error: '사전 조회에 실패했습니다.', details: existError.message },
        { status: 500 }
      )
    }

    const existingIds = (existingRows || []).map((r: { id: string }) => r.id)
    const missingIds = normalizedIds.filter((id) => !existingIds.includes(id))

    if (existingIds.length === 0) {
      return NextResponse.json(
        { error: '해당 ID의 점검 내역을 찾을 수 없습니다.', missing_ids: missingIds },
        { status: 404 }
      )
    }

    // 일괄 업데이트 실행 (서비스 롤로 RLS 우회)
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('manager_inspections')
      .update({
        signature: signature_data,
        remarks: '일괄서명완료',
        updated_at: new Date().toISOString()
      })
      .in('id', existingIds)
      .select('id')

    if (updateError) {
      console.error('서명 저장 오류:', updateError)
      return NextResponse.json(
        { error: '서명 저장에 실패했습니다.', details: updateError.message },
        { status: 500 }
      )
    }

    const updatedIds = (updatedRows || []).map((r: { id: string }) => r.id)

    // 업데이트 0건일 때 추가 진단 정보 제공
    if (!updatedRows || updatedRows.length === 0) {
      console.warn('업데이트된 행이 없습니다. 진단 정보 반환')
      return NextResponse.json(
        {
          success: false,
          message: '업데이트된 행이 없습니다.',
          updated_count: 0,
          updated_ids: [],
          missing_ids: missingIds,
          inspected_ids: existingIds
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${updatedIds.length}건의 점검 내역에 서명이 완료되었습니다.`,
      updated_count: updatedIds.length,
      updated_ids: updatedIds,
      missing_ids: missingIds
    })
  } catch (error: any) {
    console.error('API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error?.message ?? String(error) },
      { status: 500 }
    )
  }
}
