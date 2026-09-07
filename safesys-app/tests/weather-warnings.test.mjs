// 기상청 JSON·CSV 파싱과 지도·일괄 조회의 빈 응답 및 오류 처리를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', ...Object.keys(globals), outputText)(
    module, module.exports, require, ...Object.values(globals),
  )
  return module.exports
}

const warningsModule = await loadTypeScript('../src/lib/weather-warnings.ts')
const { parseKmaWarningRows } = warningsModule
const landRow = {
  REG_UP: 'L1160000', REG_UP_KO: '울산광역시  ', REG_ID: 'L1082900', REG_KO: '울산서부  ',
  TM_FC: '202608191600', TM_EF: '202608191700', WRN: '폭염  ', LVL: '경보    ', CMD: '변경', ED_TM: '',
}
const seaRow = { ...landRow, REG_ID: 'S1310000', REG_KO: '동해남부앞바다 ', WRN: '풍랑 ', LVL: '주의    ' }
const emptyParsed = { regions: [], sourceRows: 0, landRows: 0 }

test('JSON 필드 공백, 특보 수준, 시각, 쉼표가 있는 해제 예고를 보존한다', () => {
  const parsed = parseKmaWarningRows('\uFEFF  ' + JSON.stringify([
    { ...landRow, ED_TM: '7일 밤(21시~24시), 8일 새벽' }, seaRow,
    { ...landRow, REG_ID: 'L1083000', LVL: '주의    ' },
  ], null, 2))
  assert.equal(parsed.sourceRows, 3)
  assert.equal(parsed.landRows, 2)
  assert.equal(parsed.regions.length, 2)
  assert.equal(parsed.regions[0].parentRegionName, '울산광역시')
  assert.equal(parsed.regions[0].regionName, '울산서부')
  assert.deepEqual(parsed.regions[0].warnings, [{
    type: '폭염', level: '경보', command: '변경', announcedAt: '2026-08-19T16:00:00+09:00',
    effectiveAt: '2026-08-19T17:00:00+09:00', endsAt: '7일 밤(21시~24시), 8일 새벽',
  }])
  assert.equal(parsed.regions[1].warnings[0].level, '주의보')
})

test('JSON·CSV 모두 육상 필터와 해제 제외, 동일 종류의 최신 병합을 유지한다', () => {
  const rows = [
    landRow, seaRow,
    { ...landRow, TM_FC: '202608181600', LVL: '주의' },
    { ...landRow, TM_FC: '202608201600', LVL: '주의', CMD: '연장' },
    { ...landRow, WRN: '강풍', CMD: '해제' },
  ]
  const csv = '#START7777\n' + rows.map((row) => Object.values(row).join(',')).join('\n') + '\n#7777END'
  for (const text of [JSON.stringify(rows), csv]) {
    const parsed = parseKmaWarningRows(text)
    assert.equal(parsed.sourceRows, 5)
    assert.equal(parsed.landRows, 4)
    assert.equal(parsed.regions.length, 1)
    assert.equal(parsed.regions[0].warnings.length, 1)
    assert.equal(parsed.regions[0].warnings[0].command, '연장')
    assert.equal(parsed.regions[0].warnings[0].level, '주의보')
    assert.equal(parsed.regions[0].warnings[0].endsAt, null)
  }
})

test('해상 특보만 있거나 정상 빈 JSON 배열이면 육상 0건이다', () => {
  assert.deepEqual(parseKmaWarningRows(' \n[]\n '), emptyParsed)
  assert.deepEqual(parseKmaWarningRows(JSON.stringify([seaRow])), { ...emptyParsed, sourceRows: 1 })
})

const invalidBodies = [
  '', '   ', '#START7777\n#7777END', '<html>서비스 오류</html>',
  '<html>a,b,c,d,e,f,g,h,i,j</html>',
  '[{"REG_ID":', '{"error":"invalid key"}', 'null', '"[]"', '"a,b,c,d,e,f,g,h,i,j"', '[null]', '[{}]',
  JSON.stringify([{ ...landRow, WRN: 42 }]),
  JSON.stringify([{ ...landRow, REG_ID: '  ' }]),
  JSON.stringify([landRow, { error: 'invalid row' }]),
]

test('손상되거나 유효한 데이터가 없는 응답은 정상 0건으로 처리하지 않는다', () => {
  for (const body of invalidBodies) {
    assert.throws(() => parseKmaWarningRows(body), undefined, body)
  }
})

async function loadRoute(kmaBody) {
  return loadTypeScript('../src/app/api/weather/warnings/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/kma-auth': { getKmaHubKey: () => 'test-key' },
    '@/lib/weather-warnings': warningsModule,
  }, {
    fetch: async (input) => {
      const url = new URL(input)
      if (url.hostname === 'apihub.kma.go.kr') {
        return new Response(kmaBody, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      }
      assert.equal(url.hostname, 'portal.esrikr.com')
      return Response.json({ features: [] })
    },
    console: { error: () => {} },
  })
}

async function routeResponses(body) {
  const { GET, POST } = await loadRoute(body)
  return Promise.all([
    GET({ nextUrl: new URL('http://localhost/api/weather/warnings') }),
    GET({ nextUrl: new URL('http://localhost/api/weather/warnings?scope=location&address=울산광역시') }),
    POST({ json: async () => ({ locations: [{ id: 'site-1', address: '울산광역시' }] }) }),
  ])
}

test('지도 GET·위치 GET·일괄 POST는 빈 배열과 해상 전용 응답을 HTTP 200으로 반환한다', async () => {
  for (const body of ['[]', JSON.stringify([seaRow])]) {
    const responses = await routeResponses(body)
    for (const response of responses) assert.equal(response.status, 200)
    const [map, location, bulk] = await Promise.all(responses.map((response) => response.json()))
    assert.deepEqual(map.regions, [])
    assert.equal(map.totals.sourceRows, body === '[]' ? 0 : 1)
    assert.equal(map.totals.landRows, 0)
    assert.deepEqual(location.warnings, [])
    assert.equal(bulk.results[0].id, 'site-1')
    assert.deepEqual(bulk.results[0].warnings, [])
  }
})

test('지도 GET·위치 GET·일괄 POST는 잘못된 upstream 응답에 HTTP 502와 no-store를 반환한다', async () => {
  for (const body of invalidBodies) {
    for (const response of await routeResponses(body)) {
      assert.equal(response.status, 502, body)
      assert.equal(response.headers.get('Cache-Control'), 'no-store')
      assert.match((await response.json()).error, /기상특보 정보를 불러오지 못했습니다/)
    }
  }
})
