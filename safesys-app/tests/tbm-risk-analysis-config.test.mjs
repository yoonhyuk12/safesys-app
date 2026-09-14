// TBM 위험분석의 모델 조회 경로·문구·입력 길이 설정을 검증하는 정적 회귀 테스트
// 모델명은 ai_model_settings(기본값 DEFAULT_AI_MODELS)에서 오므로, 특정 모델 이름 대신
// "코드에 박지 않고 기능 키로 조회하는지"를 본다.
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
const aiModelsSource = await readFile(
  new URL('../src/lib/ai-models.ts', import.meta.url),
  'utf8'
)

const FEATURE_KEY = 'ai.write-risk-analysis'

// DEFAULT_AI_MODELS에서 이 기능의 기본 모델명을 읽는다. 각 항목은 featureKey 다음에 model이 온다.
function defaultModelFor(featureKey) {
  const escaped = featureKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = aiModelsSource.match(new RegExp(`featureKey: '${escaped}',[\\s\\S]*?model: '([^']+)'`))
  assert.ok(found, `DEFAULT_AI_MODELS에 ${featureKey} 항목이 없다`)
  return found[1]
}

test('TBM 위험분석 API는 모델을 설정에서 받아 쓰고 칸별 30자 프롬프트를 유지한다', () => {
  assert.match(routeSource, /각각의 칸에 30자 이내로 작성해주세요\./)
  assert.doesNotMatch(routeSource, /\btemperature\s*:/)
  // 모델명을 코드에 박으면 관리자 화면의 모델 설정이 무시된다. 반드시 기능 키로 조회해야 한다.
  assert.match(routeSource, new RegExp(`getAiModel\\('${FEATURE_KEY.replace(/\./g, '\\.')}'\\)`))
  assert.doesNotMatch(routeSource, /model:\s*'[^']*gpt/i, '모델명이 라우트에 하드코딩되어 있다')
  // 사용량 기록도 같은 기능 키로 남아야 관리자 인벤토리에서 비용이 맞는다.
  assert.equal((routeSource.match(new RegExp(`featureKey: '${FEATURE_KEY.replace(/\./g, '\\.')}'`, 'g')) ?? []).length, 2)
})

test('TBM 위험분석 화면은 설정된 모델명을 표시하고 각 수기 입력을 50자로 제한한다', () => {
  // 라벨은 훅이 돌려준 모델명을 그대로 쓴다 — 특정 모델 이름을 화면에 박아 두지 않는다.
  assert.match(modalSource, /powered by \{aiModel\}/)
  assert.doesNotMatch(modalSource, /powered by GPT/i, '모델명이 화면에 하드코딩되어 있다')

  // 조회 전·실패 시 보여 줄 기본값은 인벤토리 기본 모델과 같아야 한다.
  const hook = modalSource.match(/useAiModel\('([^']+)',\s*'([^']+)'\)/)
  assert.ok(hook, 'useAiModel 호출을 찾지 못했다')
  assert.equal(hook[1], FEATURE_KEY, '위험분석 기능 키')
  assert.equal(hook[2], defaultModelFor(FEATURE_KEY), '화면 기본값이 DEFAULT_AI_MODELS와 다르다')

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
