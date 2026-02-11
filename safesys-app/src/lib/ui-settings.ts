import { supabase } from './supabase'

export interface UISettings {
  id: string
  hq_division: string
  show_quarters_toggle: boolean
  created_at: string
  updated_at: string
}

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
 * 본부의 분기별 토글 표시 여부 업데이트
 */
export async function updateQuartersToggleSetting(
  hqDivision: string,
  showQuartersToggle: boolean
): Promise<{ success: boolean; error?: string }> {
  // 먼저 해당 본부 설정이 있는지 확인
  const existing = await getUISettingsByHQ(hqDivision)

  if (existing) {
    // 업데이트
    const { error } = await supabase
      .from('ui_settings')
      .update({ show_quarters_toggle: showQuartersToggle })
      .eq('hq_division', hqDivision)

    if (error) {
      console.error('UI 설정 업데이트 오류:', error)
      return { success: false, error: error.message }
    }
  } else {
    // 새로 생성
    const { error } = await supabase
      .from('ui_settings')
      .insert({ hq_division: hqDivision, show_quarters_toggle: showQuartersToggle })

    if (error) {
      console.error('UI 설정 생성 오류:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true }
}

/**
 * 본부별 분기 토글 표시 여부를 Map으로 반환
 */
export async function getQuartersToggleMap(): Promise<Map<string, boolean>> {
  const settings = await getAllUISettings()
  const map = new Map<string, boolean>()

  settings.forEach(setting => {
    map.set(setting.hq_division, setting.show_quarters_toggle)
  })

  return map
}
