// CSI 아이디·비밀번호를 이 기기의 브라우저(localStorage)에만 담아 두는 저장소 — base64는 난독화일 뿐 암호화가 아니다. 기기를 공유하면 그대로 노출된다.

const STORAGE_KEY = 'safesys.csi.credentials'

export interface CsiCredentials {
  userId: string
  password: string
}

// 한글 비밀번호도 깨지지 않도록 UTF-8 바이트로 바꾼 뒤 base64로 감싼다
const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const fromBase64 = (value: string): string => {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// SSR에는 window가 없고, 프라이빗 모드·정책 차단에서는 localStorage 접근 자체가 예외를 던진다
const getStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    // 저장소를 못 쓰는 것은 오류가 아니라 '저장 안 함'이다
    return null
  }
}

/** 이 기기에 저장해 둔 CSI 자격증명. 없거나 읽을 수 없으면 null. */
export const loadCsiCredentials = (): CsiCredentials | null => {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(fromBase64(raw)) as Partial<CsiCredentials>
    const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
    const password = typeof parsed.password === 'string' ? parsed.password : ''
    if (!userId && !password) return null
    return { userId, password }
  } catch {
    // 형식이 깨진 값은 없는 것으로 본다
    return null
  }
}

/** 이 기기에만 CSI 자격증명을 저장한다. 저장에 실패해도 조회 흐름을 막지 않는다. */
export const saveCsiCredentials = (credentials: CsiCredentials): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    const payload = JSON.stringify({ userId: credentials.userId, password: credentials.password })
    storage.setItem(STORAGE_KEY, toBase64(payload))
  } catch {
    // 저장 용량 초과·정책 차단은 사용자에게 알릴 것이 없다
  }
}

/** 이 기기에 저장된 CSI 자격증명을 지운다. */
export const clearCsiCredentials = (): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // 지우지 못해도 알릴 것이 없다
  }
}
