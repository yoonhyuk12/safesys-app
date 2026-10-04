// 770 특별점검 집계 순수 함수(지적 판정·조치완료·조치예정일·대분류 문구)를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
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
  vm.runInThisContext(`(function (module, exports, require) {\n${outputText}\n})`)(module, module.exports, require)
  return module.exports
}

const types = await transpile('../src/lib/special-inspection-770/types.ts')
const { excavatorFindings, inspectionFindings, excavatorStats, inspectionStats, findingsByCategory } = await transpile(
  '../src/lib/special-inspection-770/summary.ts',
  { '@/lib/special-inspection-770/types': types },
)

function excavator(id, items, extra = {}) {
  return { id, vehicle_no: `경기12가${id}`, items, ...extra }
}

test('부적정 판정만 지적으로 잡고 점검표 순서로 돌려준다', () => {
  const ex = excavator('1', {
    '3-1': { judgement: '부적정', finding: '안전핀 미체결' },
    '1-1': { judgement: '적정' },
    '2-2': { judgement: '해당없음' },
    '1-3': { judgement: '부적정' },
    '2-5': { judgement: null },
  })
  const findings = excavatorFindings(ex)
  assert.deepEqual(findings.map(f => f.code), ['1-3', '3-1'])
  assert.equal(findings[0].category, 1)
  assert.equal(findings[0].itemText, '굴착기 운전자의 적정 자격 확인')
  assert.equal(findings[1].vehicleNo, '경기12가1')
})

test('조치 후 사진이 있으면 완료, 없거나 N/A면 미완료다', () => {
  const ex = excavator('1', {
    '1-1': { judgement: '부적정', after_photo_url: 'https://x/a.jpg' },
    '1-2': { judgement: '부적정', after_photo_url: 'N/A' },
    '1-3': { judgement: '부적정', after_photo_url: null },
    '1-4': { judgement: '부적정' },
  })
  assert.deepEqual(excavatorFindings(ex).map(f => f.completed), [true, false, false, false])
  const stats = excavatorStats(ex)
  assert.equal(stats.findings, 4)
  assert.equal(stats.completed, 1)
  assert.equal(stats.pending, 3)
})

test('조치예정일은 미조치 항목 중 가장 늦은 날이고 완료 항목 날짜는 무시한다', () => {
  const ex = excavator('1', {
    '1-1': { judgement: '부적정', after_photo_url: 'https://x/a.jpg', action_due_date: '2026-12-31' },
    '1-2': { judgement: '부적정', action_due_date: '2026-10-20' },
    '2-1': { judgement: '부적정', action_due_date: '2026-11-05' },
    '2-2': { judgement: '부적정', action_due_date: null },
  })
  assert.equal(excavatorStats(ex).latestDueDate, '2026-11-05')
  const done = excavator('2', { '1-1': { judgement: '부적정', after_photo_url: 'u', action_due_date: '2026-10-10' } })
  assert.equal(excavatorStats(done).latestDueDate, null)
})

test('기타 4-1은 대분류 4로 집계하고 현장이 적은 문구를 항목 문구로 쓴다', () => {
  const ex = excavator('1', { '4-1': { judgement: '부적정' } }, { etc_text: '  경사지 전도 위험  ' })
  const [f] = excavatorFindings(ex)
  assert.equal(f.code, '4-1')
  assert.equal(f.category, 4)
  assert.equal(f.itemText, '경사지 전도 위험')
  const blank = excavator('2', { '4-1': { judgement: '부적정' } })
  assert.equal(excavatorFindings(blank)[0].itemText, '기타 점검 사항')
})

test('점검 1건 집계는 굴착기를 모두 합치고 가장 늦은 예정일을 고른다', () => {
  const data = {
    inspection_team: '3급 홍길동',
    excavators: [
      excavator('1', { '1-1': { judgement: '부적정', action_due_date: '2026-10-15' } }),
      excavator('2', {
        '3-1': { judgement: '부적정', after_photo_url: 'u' },
        '3-2': { judgement: '부적정', action_due_date: '2026-10-30' },
      }),
      excavator('3', { '1-1': { judgement: '적정' } }),
    ],
  }
  assert.deepEqual(inspectionStats(data), { excavators: 3, findings: 3, completed: 1, pending: 2, latestDueDate: '2026-10-30' })
  assert.deepEqual(inspectionFindings(data).map(f => `${f.excavatorId}:${f.code}`), ['1:1-1', '2:3-1', '2:3-2'])
  assert.deepEqual(inspectionStats(null), { excavators: 0, findings: 0, completed: 0, pending: 0, latestDueDate: null })
})

test('대분류별로 지적·조치 문구를 줄바꿈으로 합치고 빈 지적은 항목 문구로 대신한다', () => {
  const ex = excavator('1', {
    '1-1': { judgement: '부적정', finding: ' TBM 미실시 ', action: ' TBM 실시 ' },
    '1-2': { judgement: '부적정', action: '  ' },
    '3-1': { judgement: '부적정', finding: '안전핀 미체결', action: '안전핀 체결' },
  })
  const texts = findingsByCategory(excavatorFindings(ex))
  assert.equal(texts.length, 4)
  assert.deepEqual(texts.map(t => t.category), [1, 2, 3, 4])
  assert.equal(texts[0].title, '사전조사 및 절차 준수')
  assert.equal(texts[0].findings, '- TBM 미실시\n- 작업 전 작업계획서를 작성하고, 위험공종작업허가서(PTW)를 통해 발주자의 승인을 득하였는가?')
  assert.equal(texts[0].actions, '- TBM 실시')
  assert.equal(texts[1].findings, '')
  assert.equal(texts[1].actions, '')
  assert.equal(texts[2].findings, '- 안전핀 미체결')
  assert.equal(texts[2].actions, '- 안전핀 체결')
})
