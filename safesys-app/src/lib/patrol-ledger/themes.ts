// 순회점검 금주 점검 테마 — 주 시작일 계산, 조회·저장, 편집 권한 판정(본부급 발주청)
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { PATROL_LEDGER_THEME_MAX, type PatrolLedgerWeeklyTheme } from '@/lib/patrol-ledger/types'

export const PATROL_LEDGER_THEME_TABLE = 'patrol_ledger_weekly_themes'

/** YYYY-MM-DD가 속한 주의 월요일을 YYYY-MM-DD로 돌려준다. 시간대 영향을 받지 않도록 UTC 자정으로 계산한다. */
export function patrolLedgerWeekStart(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('날짜 형식이 올바르지 않습니다.')
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(utc.getTime())) throw new Error('날짜 형식이 올바르지 않습니다.')
  // getUTCDay: 일=0 … 토=6. 월요일 시작이므로 일요일은 6일을 물린다.
  const offset = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - offset)
  return utc.toISOString().slice(0, 10)
}

/** 본부급 이상 발주청(본사 또는 …본부 소속)만 금주 테마를 쓴다. DB 정책 patrol_ledger_is_hq_level_client와 같은 판정이다. */
export function canEditPatrolLedgerTheme(profile: { role?: string | null; hq_division?: string | null; branch_division?: string | null } | null | undefined): boolean {
  if (!profile || profile.role !== '발주청') return false
  const hq = profile.hq_division?.trim() ?? ''
  const branch = profile.branch_division?.trim() ?? ''
  return !hq || hq === '본사' || !branch || branch === '본사' || branch.endsWith('본부')
}

/** 저장 전 테마 문자열 검증. 통과하면 정리된 값, 아니면 오류 메시지를 돌려준다. */
export function normalizePatrolLedgerTheme(value: string): { theme: string } | { error: string } {
  const theme = value.replace(/\s+/g, ' ').trim()
  if (!theme) return { error: '점검 테마를 입력해주세요.' }
  if (theme.length > PATROL_LEDGER_THEME_MAX) return { error: `점검 테마는 ${PATROL_LEDGER_THEME_MAX}자 이하로 입력해주세요.` }
  return { theme }
}

/** 특정 주의 테마 한 건. 없으면 null. 어떤 클라이언트(브라우저·서버 토큰)로든 읽을 수 있다. */
export async function getPatrolLedgerWeeklyTheme(weekStart: string, client: SupabaseClient = supabase): Promise<PatrolLedgerWeeklyTheme | null> {
  const { data, error } = await client.from(PATROL_LEDGER_THEME_TABLE).select('week_start, theme, updated_by, updated_at').eq('week_start', weekStart).maybeSingle()
  if (error) throw new Error(error.message || '금주 점검 테마를 불러오지 못했습니다.')
  return (data as PatrolLedgerWeeklyTheme | null) ?? null
}

/** 금주 테마를 만들거나 바꾼다. 권한은 RLS가 판정하며 거부되면 오류를 올린다. */
export async function savePatrolLedgerWeeklyTheme(weekStart: string, value: string, userId: string): Promise<PatrolLedgerWeeklyTheme> {
  const normalized = normalizePatrolLedgerTheme(value)
  if ('error' in normalized) throw new Error(normalized.error)
  if (!userId) throw new Error('로그인이 필요합니다.')
  const { data, error } = await supabase
    .from(PATROL_LEDGER_THEME_TABLE)
    .upsert({ week_start: weekStart, theme: normalized.theme, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'week_start' })
    .select('week_start, theme, updated_by, updated_at')
    .maybeSingle()
  if (error) throw new Error(/row-level security|permission denied/i.test(error.message) ? '금주 점검 테마는 본부급 발주청만 수정할 수 있습니다.' : error.message)
  if (!data) throw new Error('금주 점검 테마를 저장하지 못했습니다.')
  return data as PatrolLedgerWeeklyTheme
}
