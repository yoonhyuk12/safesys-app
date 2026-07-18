// 알림 수신 ID 입력을 텔레그램 챗 ID와 알림앱 개인코드로 분류하는 유틸

// 쉼표 구분 입력을 텔레그램 챗 ID(순수 숫자)와 알림앱 개인코드(영문 포함)로 분류한다
export function classifyAlertIds(raw: string | undefined | null): { telegram: string | null; app: string | null } {
  const tokens = (raw ?? '').split(',').map(t => t.trim()).filter(Boolean)
  const telegram = tokens.filter(t => /^-?\d+$/.test(t))
  const app = tokens.filter(t => !/^-?\d+$/.test(t))
  return {
    telegram: telegram.length > 0 ? telegram.join(',') : null,
    app: app.length > 0 ? app.join(',') : null,
  }
}
