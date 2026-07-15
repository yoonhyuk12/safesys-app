// 품질시험 실시대장 기록을 권한 확인 후 삭제하고 일련번호를 재정렬하는 서버 라우트
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  const { id, recordId } = await params

  if (!UUID_RE.test(id) || !UUID_RE.test(recordId)) {
    return NextResponse.json({ success: false, error: '유효하지 않은 ID입니다.' }, { status: 400 })
  }

  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ success: false, error: '인증에 실패했습니다.' }, { status: 401 })
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, created_by')
    .eq('id', id)
    .single()
  if (projectError) {
    if (projectError.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
    }
    console.error('품질시험 실시대장 삭제 중 프로젝트 확인 오류:', projectError)
    return NextResponse.json({ success: false, error: '프로젝트를 확인하지 못했습니다.' }, { status: 500 })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('품질시험 실시대장 삭제 중 사용자 권한 확인 오류:', profileError)
    return NextResponse.json({ success: false, error: '삭제 권한을 확인하지 못했습니다.' }, { status: 500 })
  }

  const canDelete = profile?.role === '발주청' || project.created_by === user.id
  if (!canDelete) {
    return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 })
  }

  const { data: targetRecord, error: targetError } = await supabaseAdmin
    .from('quality_test_records')
    .select('id, project_id, serial_no')
    .eq('id', recordId)
    .maybeSingle()
  if (targetError) {
    console.error('품질시험 실시대장 삭제 대상 확인 오류:', targetError)
    return NextResponse.json({ success: false, error: '삭제할 기록을 확인하지 못했습니다.' }, { status: 500 })
  }
  if (!targetRecord || targetRecord.project_id !== id) {
    return NextResponse.json({ success: false, error: '삭제할 기록을 찾을 수 없습니다.' }, { status: 404 })
  }

  let deleteQuery = supabaseAdmin
    .from('quality_test_records')
    .delete()
    .eq('project_id', id)
  deleteQuery = targetRecord.serial_no === null
    ? deleteQuery.eq('id', recordId)
    : deleteQuery.eq('serial_no', targetRecord.serial_no)
  const { data: deletedRecords, error: deleteError } = await deleteQuery.select('id')
  if (deleteError) {
    console.error('품질시험 실시대장 삭제 오류:', deleteError)
    return NextResponse.json({ success: false, error: '기록 삭제에 실패했습니다.' }, { status: 500 })
  }

  const { data: remainingRecords, error: remainingError } = await supabaseAdmin
    .from('quality_test_records')
    .select('id, serial_no')
    .eq('project_id', id)
    .order('serial_no', { ascending: true })
    .order('created_at', { ascending: true })
  if (remainingError) {
    console.error('품질시험 실시대장 일련번호 조회 오류:', remainingError)
    return NextResponse.json({ success: false, error: '일련번호 재정렬에 실패했습니다.' }, { status: 500 })
  }

  const remainingSerialNos = Array.from(
    new Set(
      (remainingRecords ?? []).flatMap((record: { serial_no: number | null }) =>
        record.serial_no === null ? [] : [record.serial_no]
      )
    )
  )
  const renumberedSerialNos = remainingSerialNos
    .map((currentSerialNo, index) => ({ currentSerialNo, nextSerialNo: index + 1 }))
    .filter(({ currentSerialNo, nextSerialNo }) => currentSerialNo !== nextSerialNo)

  for (const { currentSerialNo, nextSerialNo } of renumberedSerialNos) {
    const { error: renumberError } = await supabaseAdmin
      .from('quality_test_records')
      .update({ serial_no: nextSerialNo, updated_at: new Date().toISOString() })
      .eq('project_id', id)
      .eq('serial_no', currentSerialNo)
    if (renumberError) {
      console.error('품질시험 실시대장 일련번호 재정렬 오류:', renumberError)
      return NextResponse.json({ success: false, error: '일련번호 재정렬에 실패했습니다.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    deletedCount: deletedRecords?.length ?? 0,
    renumberedSerialNos,
  })
}
