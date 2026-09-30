// 사고 KPI 보조 문구용 신규근로자·외국인 집계 함수(countWorkerFlags·formatWorkerFlags)를 검증한다
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadWorkerFlags() {
  const source = await readFile(new URL('../src/lib/accident-worker-flags.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, (name) => {
    throw new Error(`예상하지 못한 require: ${name}`)
  })
  return module.exports
}

const accident = (overrides = {}) => ({ is_new_worker: false, is_foreign_worker: false, injured_count: 0, fatal_count: 0, ...overrides })

test('weight 없이 세면 여부별 사고 건수를 돌려준다', async () => {
  const { countWorkerFlags } = await loadWorkerFlags()
  const accidents = [
    accident({ is_new_worker: true }),
    accident({ is_new_worker: true, is_foreign_worker: true }),
    accident({ is_foreign_worker: true }),
    accident(),
  ]
  assert.deepEqual(countWorkerFlags(accidents), { newWorker: 2, foreignWorker: 2 })
  assert.deepEqual(countWorkerFlags([]), { newWorker: 0, foreignWorker: 0 })
})

test('weight를 주면 건수 대신 그 값을 합산한다', async () => {
  const { countWorkerFlags } = await loadWorkerFlags()
  const accidents = [
    accident({ is_new_worker: true, injured_count: 3 }),
    accident({ is_foreign_worker: true, injured_count: 2, fatal_count: 1 }),
    accident({ is_new_worker: true, is_foreign_worker: true, injured_count: 1 }),
    accident({ injured_count: 5 }),
  ]
  assert.deepEqual(countWorkerFlags(accidents, (a) => a.injured_count), { newWorker: 4, foreignWorker: 3 })
  assert.deepEqual(countWorkerFlags(accidents, (a) => a.fatal_count), { newWorker: 0, foreignWorker: 1 })
})

test('true가 아닌 값(undefined·null)은 미체크로 본다', async () => {
  const { countWorkerFlags } = await loadWorkerFlags()
  const accidents = [{ is_new_worker: undefined, is_foreign_worker: null }, { is_new_worker: true }]
  assert.deepEqual(countWorkerFlags(accidents), { newWorker: 1, foreignWorker: 0 })
})

test('보조 문구는 "신규근로자 (n), 외국인 (m)" 형식이다', async () => {
  const { formatWorkerFlags } = await loadWorkerFlags()
  assert.equal(formatWorkerFlags({ newWorker: 2, foreignWorker: 1 }), '신규근로자 (2), 외국인 (1)')
  assert.equal(formatWorkerFlags({ newWorker: 0, foreignWorker: 0 }), '신규근로자 (0), 외국인 (0)')
  assert.equal(formatWorkerFlags({ newWorker: 1234, foreignWorker: 0 }), '신규근로자 (1,234), 외국인 (0)')
})
