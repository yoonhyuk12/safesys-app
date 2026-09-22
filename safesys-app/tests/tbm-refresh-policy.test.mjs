// /tbm 탭이 다시 보일 때 데이터를 재조회할지 정하는 shouldRefetchOnVisible 을 검증한다.
// 창을 잠깐 다녀온 것만으로 서버를 다시 읽지 않고, 자동 새로고침 주기(15분)를 넘겼을 때만 읽어야 한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

const { shouldRefetchOnVisible, TBM_AUTO_REFRESH_INTERVAL_MS } = await transpile('../src/lib/tbm-refresh-policy.ts')

const MINUTE = 60 * 1000
const now = Date.UTC(2026, 8, 22, 9, 0, 0)

test('자동 새로고침 주기는 15분이다', () => {
  assert.equal(TBM_AUTO_REFRESH_INTERVAL_MS, 15 * MINUTE)
})

test('한 번도 로드하지 않았으면 재조회한다', () => {
  assert.equal(shouldRefetchOnVisible(null, now), true)
  assert.equal(shouldRefetchOnVisible(undefined, now), true)
})

test('마지막 로드 후 15분이 안 지났으면 재조회하지 않는다', () => {
  assert.equal(shouldRefetchOnVisible(now - 3 * 1000, now), false)
  assert.equal(shouldRefetchOnVisible(now - 5 * MINUTE, now), false)
  assert.equal(shouldRefetchOnVisible(now - 15 * MINUTE + 1, now), false)
})

test('마지막 로드 후 15분 이상 지났으면 재조회한다', () => {
  assert.equal(shouldRefetchOnVisible(now - 15 * MINUTE, now), true)
  assert.equal(shouldRefetchOnVisible(now - 60 * MINUTE, now), true)
})

test('시계가 뒤로 간 경우(음수 경과)에도 재조회하지 않는다', () => {
  assert.equal(shouldRefetchOnVisible(now + 10 * MINUTE, now), false)
})

test('주기를 넘겨받으면 그 값을 기준으로 판단한다', () => {
  assert.equal(shouldRefetchOnVisible(now - 2 * MINUTE, now, 1 * MINUTE), true)
  assert.equal(shouldRefetchOnVisible(now - 30 * 1000, now, 1 * MINUTE), false)
})

// TBMStatus 가 실제로 이 정책을 거쳐 재조회하는지 정적으로 확인한다.
test('TBMStatus 의 visibilitychange 핸들러는 정책을 거쳐 재조회한다', async () => {
  const source = await readFile(new URL('../src/components/project/TBMStatus.tsx', import.meta.url), 'utf8')
  assert.match(source, /import \{[^}]*shouldRefetchOnVisible[^}]*\} from '@\/lib\/tbm-refresh-policy'/)
  const listenerAt = source.indexOf("document.addEventListener('visibilitychange'")
  assert.ok(listenerAt > 0, 'visibilitychange 리스너가 없다')
  const handler = source.slice(Math.max(0, listenerAt - 2500), listenerAt)
  assert.match(handler, /shouldRefetchOnVisible\(/)
  assert.match(handler, /loadAllTBMDataRef\.current\?\.\(true, false\)/)
})
