// TBM 근로자 교육 확인 서명 API — 비회원(익명) 근로자 제출(POST)·서명 목록 조회(GET)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 서명 data URL 최대 길이 (캔버스 PNG는 통상 수십 KB — 과대 페이로드 차단)
const MAX_SIGNATURE_LENGTH = 300_000

const CHECK_FIELDS = [
  'tbm_confirmed',
  'no_alcohol',
  'blood_pressure_ok',
  'ppe_worn',
  'cctv_consent',
  'body_ok',
] as const

// 제출 존재·공개 여부 검증 (draft는 tbm-view와 동일하게 차단)
async function validateSubmission(id: string): Promise<NextResponse | null> {
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: '유효하지 않은 ID입니다.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('tbm_submissions')
    .select('id,status')
    .eq('id', id)
    .single<{ id: string; status: string | null }>()

  if (error || !data) {
    return NextResponse.json({ error: '데이터를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (data.status === 'draft') {
    return NextResponse.json({ error: '아직 제출되지 않은 TBM입니다.' }, { status: 403 })
  }
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const invalid = await validateSubmission(id)
  if (invalid) return invalid

  // 공개 조회이므로 서명 이미지는 제외하고 최소 필드만 반환
  const { data, error } = await supabaseAdmin
    .from('tbm_worker_signatures')
    .select('id,worker_name,created_at')
    .eq('tbm_submission_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('근로자 서명 목록 조회 오류:', error)
    return NextResponse.json({ error: '서명 목록을 불러오지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ signatures: data || [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const invalid = await validateSubmission(id)
  if (invalid) return invalid

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const workerName = typeof body.worker_name === 'string' ? body.worker_name.trim() : ''
  if (!workerName || workerName.length > 50) {
    return NextResponse.json({ error: '성명을 입력해주세요. (최대 50자)' }, { status: 400 })
  }

  // 작업가능상태 점검 항목은 전부 확인(true)해야 제출 가능
  for (const field of CHECK_FIELDS) {
    if (body[field] !== true) {
      return NextResponse.json({ error: '모든 점검 항목을 확인해주세요.' }, { status: 400 })
    }
  }

  const signature = typeof body.signature === 'string' ? body.signature : ''
  if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE_LENGTH) {
    return NextResponse.json({ error: '서명 데이터가 올바르지 않습니다.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('tbm_worker_signatures')
    .insert({
      tbm_submission_id: id,
      worker_name: workerName,
      tbm_confirmed: true,
      no_alcohol: true,
      blood_pressure_ok: true,
      ppe_worn: true,
      cctv_consent: true,
      body_ok: true,
      signature,
    })

  if (error) {
    console.error('근로자 서명 저장 오류:', error)
    return NextResponse.json({ error: '서명 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
