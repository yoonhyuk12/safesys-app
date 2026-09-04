// TBM 제출 알림의 수신 대상과 신규근로자 인원 표시를 검증하는 정적 회귀 테스트
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const modalSource = await readFile(
  new URL('../src/components/project/TBMSubmissionModal.tsx', import.meta.url),
  'utf8'
)

const alertBlock = modalSource.match(
  /\/\/ TBM 제출 알림 발송([\s\S]*?)alert\('성공적으로 제출되었습니다!'/
)?.[1] ?? ''

test('TBM 제출 알림이 발주청과 시공사의 텔레그램·앱 등록값을 모두 사용한다', () => {
  assert.match(
    alertBlock,
    /\.select\('client_telegram_id, contractor_telegram_id, client_app_code, contractor_app_code'\)/
  )
  assert.match(
    alertBlock,
    /\[projectData\?\.client_telegram_id, projectData\?\.contractor_telegram_id\]/
  )

  const bothRecipientSelections = alertBlock.match(
    /recipients: \{ client: true, contractor: true \}/g
  ) ?? []
  assert.equal(bothRecipientSelections.length, 2)
  assert.doesNotMatch(alertBlock, /contractor: false/)
})

test('TBM 제출 알림이 입력된 신규근로자 수를 명 단위로 표시한다', () => {
  assert.match(
    alertBlock,
    /formData\.newWorkerCount \? `[^`]*신규근로자:[^`]*\$\{formData\.newWorkerCount\}명/
  )
})
