import { supabase } from './supabase'

export type QuarterToggleState = {
  q1: boolean
  q2: boolean
  q3: boolean
  q4: boolean
  completed: boolean
}

export interface UISettings {
  id: string
  hq_division: string
  show_quarters_toggle: boolean
  quarters_toggle_state: QuarterToggleState | null
  created_at: string
  updated_at: string
}

const DEFAULT_OFF: QuarterToggleState = { q1: false, q2: false, q3: false, q4: false, completed: false }
const DEFAULT_ON: QuarterToggleState = { q1: true, q2: true, q3: true, q4: true, completed: true }

/**
 * 모든 본부의 UI 설정 가져오기
 */
export async function getAllUISettings(): Promise<UISettings[]> {
  const { data, error } = await supabase
    .from('ui_settings')
    .select('*')
    .order('hq_division')

  if (error) {
    console.error('UI 설정 조회 오류:', error)
    return []
  }

  return data || []
}

/**
 * 특정 본부의 UI 설정 가져오기
 */
export async function getUISettingsByHQ(hqDivision: string): Promise<UISettings | null> {
  const { data, error } = await supabase
    .from('ui_settings')
    .select('*')
    .eq('hq_division', hqDivision)
    .maybeSingle()

  if (error) {
    console.error(`${hqDivision} UI 설정 조회 오류:`, error)
    return null
  }

  return data
}

/**
 * 본부의 분기별 토글 상태 업데이트
 */
export async function updateQuartersToggleSetting(
  hqDivision: string,
  state: QuarterToggleState
): Promise<{ success: boolean; error?: string }> {
  const existing = await getUISettingsByHQ(hqDivision)
  // show_quarters_toggle은 하위호환: 하나라도 true면 true
  const showToggle = Object.values(state).some(v => v)

  if (existing) {
    const { error } = await supabase
      .from('ui_settings')
      .update({
        quarters_toggle_state: state,
        show_quarters_toggle: showToggle
      })
      .eq('hq_division', hqDivision)

    if (error) {
      console.error('UI 설정 업데이트 오류:', error)
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('ui_settings')
      .insert({
        hq_division: hqDivision,
        show_quarters_toggle: showToggle,
        quarters_toggle_state: state
      })

    if (error) {
      console.error('UI 설정 생성 오류:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true }
}

/**
 * 본부별 분기 토글 상태를 Map으로 반환
 */
export async function getQuartersToggleMap(): Promise<Map<string, QuarterToggleState>> {
  const settings = await getAllUISettings()
  const map = new Map<string, QuarterToggleState>()

  settings.forEach(setting => {
    if (setting.quarters_toggle_state) {
      map.set(setting.hq_division, setting.quarters_toggle_state)
    } else {
      // 하위 호환: 기존 boolean 값을 QuarterToggleState로 변환
      map.set(setting.hq_division, setting.show_quarters_toggle ? DEFAULT_ON : DEFAULT_OFF)
    }
  })

  return map
}
