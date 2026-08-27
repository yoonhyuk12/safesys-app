import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAiModel } from '@/lib/ai-models'
import { recordAiUsage } from '@/lib/ai-usage-log'
import { parsePersonnelCount, TBM_PERSONNEL_GUIDE } from '@/lib/chat/tbm-personnel'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Supabase 클라이언트 (lazy 초기화 - 빌드 시 환경변수 없어도 에러 방지)
let _supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _supabase = createClient(supabaseUrl, supabaseServiceKey)
  }
  return _supabase
}

interface TBMRecord {
  id: string
  project_id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  meeting_date: string
  meeting_time: string
  attendees: string
  topics: string[]
  location: string
  leader: string
  created_at: string
  status: string
  duration: number
  construction_company: string
  today_work: string
  risk_work_type?: string
  cctv_usage?: string
  equipment_input?: string
  education_content?: string
  contact?: string
  new_workers?: string | number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Supabase에서 TBM 데이터 가져오기
async function fetchTBMDataFromSupabase(date: string): Promise<TBMRecord[]> {
  try {
    console.log('Supabase TBM 데이터 조회:', date)

    const { data, error } = await getSupabase()
      .from('tbm_submissions')
      .select('*')
      .eq('meeting_date', date)
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('Supabase 조회 오류:', error)
      throw error
    }

    // Supabase 데이터를 TBMRecord 형식으로 변환
    const records: TBMRecord[] = (data || []).map((item: any) => ({
      id: item.id,
      project_id: item.project_id || '',
      project_name: item.project_name || '',
      managing_hq: item.headquarters || '',
      managing_branch: item.branch || '',
      meeting_date: item.meeting_date,
      meeting_time: item.education_start_time || '',
      attendees: item.personnel_count || '',
      topics: [],
      location: item.address || '',
      leader: item.reporter_name || '',
      created_at: item.created_at,
      status: '완료',
      duration: item.education_duration || 0,
      construction_company: item.construction_company || '',
      today_work: item.today_work || '',
      risk_work_type: item.risk_work_type,
      cctv_usage: item.cctv_usage,
      equipment_input: item.equipment_input,
      education_content: item.other_remarks,
      contact: item.reporter_contact,
      new_workers: item.new_worker_count
    }))

    console.log('Supabase 조회 완료:', records.length, '건')
    return records
  } catch (error) {
    console.error('TBM 데이터 조회 실패:', error)
    return []
  }
}

// TBM 데이터 분석 및 통계 생성
function analyzeTBMData(records: TBMRecord[]) {
  const totalTbmCount = records.length

  // 본부별 통계
  const hqStats: Record<string, { tbmCount: number; riskWorkCount: number; newWorkersCount: number; personnelCount: number; branches: Set<string> }> = {}

  // 지사별 통계
  const branchStats: Record<string, { tbmCount: number; riskWorkCount: number; personnelCount: number; projects: string[] }> = {}

  let totalRiskWorkCount = 0
  let totalNewWorkersCount = 0
  let totalPersonnelCount = 0

  records.forEach(record => {
    const hq = record.managing_hq || '미분류'
    const branch = record.managing_branch || '미분류'

    // 본부별 집계
    if (!hqStats[hq]) {
      hqStats[hq] = { tbmCount: 0, riskWorkCount: 0, newWorkersCount: 0, personnelCount: 0, branches: new Set() }
    }
    hqStats[hq].tbmCount++
    hqStats[hq].branches.add(branch)

    // 지사별 집계
    if (!branchStats[branch]) {
      branchStats[branch] = { tbmCount: 0, riskWorkCount: 0, personnelCount: 0, projects: [] }
    }
    branchStats[branch].tbmCount++
    branchStats[branch].projects.push(record.project_name)

    // 위험공종 집계
    if (record.risk_work_type && record.risk_work_type !== '해당없음' && record.risk_work_type !== '') {
      totalRiskWorkCount++
      hqStats[hq].riskWorkCount++
      branchStats[branch].riskWorkCount++
    }

    // 신규인원 집계
    if (record.new_workers) {
      const newWorkersStr = String(record.new_workers)
      const match = newWorkersStr.match(/\d+/)
      if (match) {
        const count = parseInt(match[0], 10)
        totalNewWorkersCount += count
        hqStats[hq].newWorkersCount += count
      }
    }

    // 투입인원 집계 (자유 텍스트 → 인원수 추정)
    const personnel = parsePersonnelCount(record.attendees)
    totalPersonnelCount += personnel
    hqStats[hq].personnelCount += personnel
    branchStats[branch].personnelCount += personnel
  })

  return {
    totalTbmCount,
    totalRiskWorkCount,
    totalNewWorkersCount,
    totalPersonnelCount,
    hqStats: Object.entries(hqStats).map(([name, stats]) => ({
      hqName: name,
      tbmCount: stats.tbmCount,
      riskWorkCount: stats.riskWorkCount,
      newWorkersCount: stats.newWorkersCount,
      personnelCount: stats.personnelCount,
      branchCount: stats.branches.size
    })),
    branchStats: Object.entries(branchStats).map(([name, stats]) => ({
      branchName: name,
      tbmCount: stats.tbmCount,
      riskWorkCount: stats.riskWorkCount,
      personnelCount: stats.personnelCount,
      projectCount: stats.projects.length
    })),
    records: records.slice(0, 100) // 최근 100개 레코드까지 상세 정보 제공
  }
}

export async function POST(request: NextRequest) {
  try {
    // 환경 변수 체크 및 상세 오류 메시지
    const missingEnvVars: string[] = []
    if (!OPENAI_API_KEY) missingEnvVars.push('OPENAI_API_KEY')
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnvVars.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY')

    if (missingEnvVars.length > 0) {
      console.error('Missing environment variables:', missingEnvVars.join(', '))
      return NextResponse.json(
        { error: `환경 변수가 설정되지 않았습니다: ${missingEnvVars.join(', ')}` },
        { status: 500 }
      )
    }

    const { message, conversationHistory, userPermission } = await request.json()

    if (!message) {
      return NextResponse.json(
        { error: '메시지가 필요합니다.' },
        { status: 400 }
      )
    }

    // 사용자 권한 정보 로깅
    console.log('사용자 권한:', userPermission)

    // 오늘 날짜(한국 시간 KST)로 TBM 데이터 가져오기 — 서버가 UTC라 toISOString을 쓰면 새벽에 전날로 계산됨
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    console.log('TBM 데이터 조회 날짜:', today)

    let tbmRecords = await fetchTBMDataFromSupabase(today)
    console.log('조회된 전체 TBM 레코드 수:', tbmRecords.length)

    // 사용자 권한에 따라 TBM 데이터 필터링
    if (userPermission) {
      const { hq, branch } = userPermission

      // 지사 사용자: 해당 지사 데이터만
      if (branch && !branch.endsWith('본부')) {
        tbmRecords = tbmRecords.filter(r => r.managing_branch === branch)
        console.log(`지사 필터링 (${branch}):`, tbmRecords.length, '건')
      }
      // 본부 사용자: 해당 본부 데이터만
      else if (hq) {
        tbmRecords = tbmRecords.filter(r => r.managing_hq === hq)
        console.log(`본부 필터링 (${hq}):`, tbmRecords.length, '건')
      }
      // 본사/관리자: 전체 데이터
    }

    // TBM 데이터 분석
    const tbmAnalysis = analyzeTBMData(tbmRecords)

    // TBM 데이터를 시스템 프롬프트에 포함
    const systemPrompt = buildSystemPrompt(tbmAnalysis, today, userPermission)

    const historyMessages = ((conversationHistory || []) as ChatMessage[])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
    const messages = [
      { role: 'developer', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message }
    ]

    // OpenAI Chat Completions API 호출
    const model = await getAiModel('chat.tbm')
    const startedAt = Date.now()
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        reasoning_effort: 'none',
        max_completion_tokens: 8192
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API Error:', response.status, errorData)
      recordAiUsage({ featureKey: 'chat.tbm', provider: 'OpenAI', model, success: false, errorMessage: `HTTP ${response.status}`, durationMs: Date.now() - startedAt })

      // 오류 유형별 상세 메시지
      let errorMessage = 'AI 응답 생성에 실패했습니다.'
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'OpenAI API 키가 유효하지 않습니다. 키를 확인해주세요.'
      } else if (response.status === 429) {
        errorMessage = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
      } else if (response.status >= 500) {
        errorMessage = 'OpenAI 서버 오류가 발생했습니다.'
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }

    const data = await response.json()
    recordAiUsage({ featureKey: 'chat.tbm', provider: 'OpenAI', model, response: data, durationMs: Date.now() - startedAt })
    const assistantMessage = data.choices?.[0]?.message?.content || '응답을 생성하지 못했습니다.'

    return NextResponse.json({ response: assistantMessage })

  } catch (error) {
    console.error('OpenAI Chat API Error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

interface TBMAnalysis {
  totalTbmCount: number
  totalRiskWorkCount: number
  totalNewWorkersCount: number
  totalPersonnelCount: number
  hqStats: Array<{
    hqName: string
    tbmCount: number
    riskWorkCount: number
    newWorkersCount: number
    personnelCount: number
    branchCount: number
  }>
  branchStats: Array<{
    branchName: string
    tbmCount: number
    riskWorkCount: number
    personnelCount: number
    projectCount: number
  }>
  records: TBMRecord[]
}

interface UserPermission {
  hq?: string | null
  branch?: string | null
  role?: string
  name?: string
}

function buildSystemPrompt(tbmAnalysis: TBMAnalysis, date: string, userPermission?: UserPermission | null): string {
  // 사용자 권한 범위 설명
  let scopeDescription = '전체 현장'
  if (userPermission) {
    if (userPermission.branch && !userPermission.branch.endsWith('본부')) {
      scopeDescription = `${userPermission.branch} 소속 현장`
    } else if (userPermission.hq) {
      scopeDescription = `${userPermission.hq} 관할 현장`
    }
  }

  const basePrompt = `당신은 한국농어촌공사의 TBM(Tool Box Meeting) 현황 분석 AI 어시스턴트입니다.
현재 사용자: ${userPermission?.name || '사용자'} (${scopeDescription} 데이터 접근 권한)

🔒 중요: 이 사용자는 ${scopeDescription}의 TBM 데이터만 조회할 수 있습니다.
다른 본부나 지사의 데이터에 대한 질문은 "권한이 없습니다"라고 안내해주세요.

역할:
- ${scopeDescription}의 TBM 현황 데이터를 분석하고 인사이트 제공
- 안전관리 관점에서 조언 제공
- 데이터 기반의 정확한 정보 전달
- 한국어로 친절하게 응답

응답 스타일:
- 간결하고 명확하게 답변
- 필요시 숫자와 통계 활용
- 중요한 내용은 강조
- 이모지는 적절히 사용`

  if (tbmAnalysis.totalTbmCount === 0) {
    return basePrompt + `\n\n📅 기준일: ${date}\n\n⚠️ 오늘(${date}) ${scopeDescription}에 등록된 TBM 데이터가 없습니다. 일반적인 TBM 관련 질문에 답변해주세요.`
  }

  // 위험공종 목록 추출
  const riskWorkTypes = tbmAnalysis.records
    .filter(r => r.risk_work_type && r.risk_work_type !== '해당없음' && r.risk_work_type !== '')
    .map(r => `${r.project_name}: ${r.risk_work_type}`)
    .slice(0, 10)

  // 오늘 작업 내용 추출
  const todayWorks = tbmAnalysis.records
    .filter(r => r.today_work)
    .map(r => `${r.project_name}: ${r.today_work}`)
    .slice(0, 10)

  const dataContext = `

${TBM_PERSONNEL_GUIDE}

===== 📊 실시간 TBM 현황 (구글 시트 데이터) =====
📅 기준일: ${date}

📈 전체 현황:
- TBM 실시 현장: ${tbmAnalysis.totalTbmCount}개
- 투입인원 합계: ${tbmAnalysis.totalPersonnelCount}명
- 위험공종 현장: ${tbmAnalysis.totalRiskWorkCount}개
- 신규인원 합계: ${tbmAnalysis.totalNewWorkersCount}명

🏢 본부별 현황:
${tbmAnalysis.hqStats.map(hq =>
    `- ${hq.hqName}: TBM ${hq.tbmCount}건, 투입인원 ${hq.personnelCount}명, 위험공종 ${hq.riskWorkCount}건, 신규인원 ${hq.newWorkersCount}명 (${hq.branchCount}개 지사)`
  ).join('\n')}

🏗️ 지사별 현황:
${tbmAnalysis.branchStats.map(branch =>
    `- ${branch.branchName}: TBM ${branch.tbmCount}건, 투입인원 ${branch.personnelCount}명, 위험공종 ${branch.riskWorkCount}건`
  ).join('\n')}

${riskWorkTypes.length > 0 ? `
⚠️ 위험공종 현황:
${riskWorkTypes.map(w => `- ${w}`).join('\n')}
` : ''}

${todayWorks.length > 0 ? `
📋 오늘 작업 내용 (일부):
${todayWorks.map(w => `- ${w}`).join('\n')}
` : ''}

===== 상세 TBM 기록 (최근 ${tbmAnalysis.records.length}건) =====
${tbmAnalysis.records.map(r =>
    `[${r.meeting_time || '시간미입력'}] ${r.project_name} (${r.managing_branch}) - ${r.construction_company || '업체미입력'}, 작업: ${r.today_work || '미입력'}, 위험공종: ${r.risk_work_type || '해당없음'}, 투입인원: ${(r.attendees || '미입력').replace(/\s*\n\s*/g, ' / ')}, 신규: ${r.new_workers || '없음'}`
  ).join('\n')}
===========================================

위 데이터는 구글 시트에서 실시간으로 가져온 TBM 현황입니다.
이 데이터를 기반으로 사용자의 질문에 정확하게 답변해주세요.
데이터에 없는 내용은 "현재 데이터에서 확인할 수 없습니다"라고 안내해주세요.`

  return basePrompt + dataContext
}
