// 사고 저장 오류를 개인정보가 없는 한국어 안내와 진단 코드로 분류한다.

/** DB 원문 중 분류에 필요한 최소 속성만 읽는다. details·hint는 사용하지 않는다. */
interface AccidentMutationErrorSource {
  code?: unknown
  message?: unknown
}

export interface SafeAccidentMutationError {
  code: string
  message: string
}

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])
const NETWORK_MESSAGE = /^(?:(?:TypeError|FetchError|Error):\s*)?(?:Failed to fetch|fetch failed|NetworkError when attempting to fetch resource\.?|Load failed)$/i
const SAFE_ERROR_CODE = /^(?:[0-9A-Z]{5}|PGRST[0-9A-Z]{3})$/

/** 원문 message는 알려진 제약·통신 오류 식별에만 사용하고 반환 객체에는 복사하지 않는다. */
export function classifyAccidentMutationError(error: unknown): SafeAccidentMutationError {
  const source: AccidentMutationErrorSource = error && typeof error === 'object' ? error : {}
  const rawCode = typeof source.code === 'string' ? source.code : ''
  const rawMessage = typeof source.message === 'string' ? source.message : ''
  const network = NETWORK_CODES.has(rawCode) || (rawCode === '' && NETWORK_MESSAGE.test(rawMessage))
  const code = network ? 'NETWORK' : SAFE_ERROR_CODE.test(rawCode) && rawCode.trim() === rawCode ? rawCode : 'UNKNOWN'
  let message = '사고 이력을 저장하지 못했습니다. 오류 코드를 담당자에게 알려 주세요.'

  switch (code) {
    case 'NETWORK':
      message = '통신 문제로 저장 결과를 확인하지 못했습니다. 연결을 확인한 뒤 사고 목록에서 저장 여부를 먼저 확인해 주세요.'
      break
    case '42501':
      message = '이 프로젝트에 사고를 저장할 권한을 확인하지 못했습니다. 로그인 상태와 프로젝트 접근 권한을 확인해 주세요.'
      break
    case '23514':
      message = rawMessage.includes('"project_accidents_report_details_check"')
        ? '보고서 입력값이 저장 조건을 충족하지 않습니다. 보고서 항목과 사진을 확인해 주세요.'
        : '입력값이 저장 조건을 충족하지 않습니다. 사고 입력 내용을 확인해 주세요.'
      break
    case '42703':
    case 'PGRST204':
      message = '서버에서 저장 항목을 확인하지 못했습니다. 담당자에게 오류 코드를 알려 주세요.'
      break
    case '23503':
      message = rawMessage.includes('"project_accidents_created_by_fkey"')
        ? '사고 작성자 정보를 확인하지 못했습니다. 로그인 상태를 확인해 주세요.'
        : '사고에 연결된 정보를 확인하지 못했습니다. 프로젝트와 사용자 정보를 확인해 주세요.'
      break
  }

  return { code, message: `${message} (오류 코드: ${code})` }
}
