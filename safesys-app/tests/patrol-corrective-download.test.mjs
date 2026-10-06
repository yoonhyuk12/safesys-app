// 범위 전체 ZIP·개별 HWPX·AI 배치 원문 대조와 실패 시 부분 다운로드 방지를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import JSZip from 'jszip'

const source = await readFile(new URL('../src/lib/patrol-corrective-download.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
const labels = { request: '시정조치요구서', result: '조치결과 보고서', plan: '시정조치계획서' }
const rows = Array.from({ length: 43 }, (_, i) => ({ id: String(i), project_name: '같은 사업', inspection_date: '2026-10-01', issue_content1: `지적${i}`, issue_content2: '', finding_type: 'corrective_action' }))

function setup({ failAt = -1, changed = false, authenticated = true } = {}) {
  const built = [], downloaded = [], requests = [], blobs = new Map()
  const deps = {
    jszip: JSZip,
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: authenticated ? { access_token: 'token' } : null } }) } } },
    '@/lib/patrol-inspection-utils': { PATROL_MAX_AI_ITEMS: 20 },
    '@/lib/hwpx/patrol-corrective-hwpx-export': {
      PATROL_CORRECTIVE_LABELS: labels,
      buildPatrolCorrectiveHwpx: async row => {
        if (built.length === failAt) throw new Error('사진 읽기 실패')
        built.push(row.id)
        return new Blob([row.id], { type: 'application/hwp+zip' })
      },
    },
  }
  globalThis.fetch = async (_, init) => {
    const { inspectionIds } = JSON.parse(init.body)
    requests.push(inspectionIds)
    return { ok: true, json: async () => ({ success: true,
      results: Object.fromEntries(inspectionIds.map(id => [id, { action: '실행 계획', prevention: '예방 계획' }])),
      sources: Object.fromEntries(inspectionIds.map(id => [id, { issue1: changed ? '바뀐 지적' : rows[Number(id)].issue_content1, issue2: '', findingType: 'corrective_action' }])),
    }) }
  }
  URL.createObjectURL = blob => { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id }
  URL.revokeObjectURL = () => {}
  globalThis.document = { body: { appendChild() {}, removeChild() {} }, createElement: () => ({ click() { downloaded.push({ name: this.download, blob: blobs.get(this.href) }) } }) }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', 'setTimeout', 'clearTimeout', output)(module, module.exports, name => {
    assert.ok(name in deps, name); return deps[name]
  }, () => 0, () => {})
  return { api: module.exports, built, downloaded, requests }
}

test('현재 범위 전체 43건을 빠짐없이 중복 파일명 없는 ZIP으로 저장한다', async () => {
  const { api, built, downloaded } = setup()
  await api.downloadPatrolCorrective(rows, 'request', '2026Q4', () => {})
  assert.deepEqual(built, rows.map(row => row.id))
  assert.equal(downloaded.length, 1)
  assert.ok(downloaded[0].name.endsWith('_43건.zip'))
  const zip = await JSZip.loadAsync(await downloaded[0].blob.arrayBuffer())
  assert.equal(Object.keys(zip.files).length, 43)
})
test('개별 점검은 HWPX 하나만 직접 저장한다', async () => {
  const { api, built, downloaded } = setup()
  await api.downloadPatrolCorrective([rows[2]], 'result', '2026Q4', () => {}, false)
  assert.deepEqual(built, ['2'])
  assert.equal(downloaded.length, 1)
  assert.ok(downloaded[0].name.endsWith('.hwpx'))
})
test('계획은 20건씩 순차 배치하고 모두 받은 뒤 출력한다', async () => {
  const { api, requests, built } = setup()
  await api.downloadPatrolCorrective(rows, 'plan', '2026Q4', () => {})
  assert.deepEqual(requests.map(batch => batch.length), [20, 20, 3])
  assert.equal(built.length, 43)
})
test('원본 변경과 인증 만료는 다운로드 전에 중단한다', async () => {
  for (const option of [{ changed: true }, { authenticated: false }]) {
    const { api, built, downloaded } = setup(option)
    await assert.rejects(api.downloadPatrolCorrective(rows, 'plan', '2026Q4', () => {}))
    assert.equal(built.length, 0)
    assert.equal(downloaded.length, 0)
  }
})
test('중간 생성 실패는 일부 파일만 내려받지 않는다', async () => {
  const { api, downloaded } = setup({ failAt: 2 })
  await assert.rejects(api.downloadPatrolCorrective(rows, 'result', '2026Q4', () => {}), /사진/)
  assert.equal(downloaded.length, 0)
})
