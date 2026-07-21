// TBM 위험분석 모델·문구·입력 길이 설정을 검증하는 정적 회귀 테스트
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routeSource = await readFile(
  new URL('../src/app/api/ai/write-risk-analysis/route.ts', import.meta.url),
  'utf8'
)
const modalSource = await readFile(
  new URL('../src/components/project/TBMSubmissionModal.tsx', import.meta.url),
  'utf8'
)

test('TBM 위험분석 API가 GPT-5.4 nano 모델과 칸별 30자 프롬프트를 사용한다', () => {
  assert.match(routeSource, /각각의 칸에 30자 이내로 작성해주세요\./)
  assert.match(routeSource, /model: 'gpt-5\.4-nano'/)
  assert.doesNotMatch(routeSource, /\btemperature\s*:/)
})

test('TBM 위험분석 화면이 GPT-5.4 nano를 표시하고 각 수기 입력을 50자로 제한한다', () => {
  assert.match(modalSource, /powered by GPT-5\.4 nano/)

  const riskSection = modalSource.match(
    /\{\/\* 잠재위험요인\/대책 \*\/\}([\s\S]*?)\{\/\* 기타사항 \*\/\}/
  )?.[1] ?? ''
  const fiftyCharacterLimits = riskSection.match(/maxLength=\{50\}/g) ?? []

  assert.equal(fiftyCharacterLimits.length, 3)
})

test('TBM AI 작성 완료 알림이 수시 위험성평가 연계 확인을 안내한다', () => {
  assert.match(
    modalSource,
    /수시 위험성평가와 연계성을 확인하고 필요시 수정 바랍니다\./
  )
})
