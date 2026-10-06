// 패트롤 시정조치 양식의 원본 보존과 다중 지적 페이지를 검증한다.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import JSZip from 'jszip'
import { load } from 'cheerio'
import ts from 'typescript'
import { createCanvas, Image as CanvasImage } from '@napi-rs/canvas'

async function loadModule(url) {
  const source = await readFile(url, 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const deps = new Map([['jszip', JSZip]])
  for (const [, name] of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    // '@/'는 tsconfig paths와 같게 src 루트로 돌린다.
    if (!deps.has(name)) deps.set(name, await loadModule(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url)))
  }
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => deps.get(name))
  return module.exports
}

const api = await loadModule(new URL('../src/lib/hwpx/patrol-corrective-hwpx-export.ts', import.meta.url))
const canvas = createCanvas(1200, 800)
const context = canvas.getContext('2d')
context.fillStyle = '#c9dfec'; context.fillRect(0, 0, 1200, 800)
context.fillStyle = '#ffc400'; context.fillRect(300, 300, 600, 300)
context.fillStyle = '#202020'; context.font = '64px sans-serif'; context.fillText('PATROL PHOTO', 300, 500)
const photoBytes = canvas.toBuffer('image/png')
const blobs = new Map()
let blobId = 0
URL.createObjectURL = blob => { const id = `blob:${++blobId}`; blobs.set(id, blob); return id }
URL.revokeObjectURL = id => blobs.delete(id)
globalThis.Image = class extends CanvasImage {
  get naturalWidth() { return this.width }
  get naturalHeight() { return this.height }
  set src(value) { blobs.get(value).arrayBuffer().then(bytes => { super.src = Buffer.from(bytes) }) }
}
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas')
    const canvas = createCanvas(1, 1)
    canvas.toBlob = cb => cb(new Blob([canvas.toBuffer('image/jpeg')], { type: 'image/jpeg' }))
    return canvas
  },
}
const photoRequests = []
globalThis.fetch = async url => {
  if (url.startsWith('https://photo.test/')) { photoRequests.push(url); return new Response(photoBytes) }
  return new Response(await readFile(new URL(`../public${url}`, import.meta.url)))
}

const row = { id: 'inspection-1', project_id: 'p', project_name: '시험 & 사업', managing_hq: '경기', managing_branch: '안전지사', inspection_date: '2026-10-01', inspector_name: '홍점검', issue_content1: '안전난간 미설치', issue_content2: '통로 정리 필요', issue1_status: 'pending', patrol_car_used: true, finding_type: 'corrective_action', created_at: '' }

test('생성 글자는 언어별 신명조 13pt이며 인물은 등록 정보만 채운다', async () => {
  for (const kind of ['request', 'result', 'plan']) {
    const input = { ...row, owner_name: '김현장', supervisor_position: '4급', supervisor_name: '이감독' }
    const zip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx(input, kind, { action: '시정한다.', prevention: '확인한다.' })).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
    for (const text of ['시험 & 사업', '현장대리인 김현장', '공사감독 4급 이감독']) {
      const run = $('hp\\:t').filter((_, e) => $(e).text().includes(text)).first().parent('hp\\:run')
      assert.ok(run.length, `${kind}: ${text}`)
      const style = h('hh\\:charPr').filter((_, e) => h(e).attr('id') === run.attr('charPrIDRef'))
      assert.equal(style.attr('height'), '1300')
      for (const lang of ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user']) {
        const fontId = style.find('hh\\:fontRef').attr(lang)
        const face = h('hh\\:fontface').filter((_, e) => h(e).attr('lang') === lang.toUpperCase())
        assert.equal(face.find('hh\\:font').filter((_, e) => h(e).attr('id') === fontId).attr('face'), '한양신명조', lang)
      }
    }
    assert.ok($('hp\\:t').text().includes('검 토 자'))
    if (process.env.PATROL_SAMPLE_DIR) {
      await mkdir(process.env.PATROL_SAMPLE_DIR, { recursive: true })
      await writeFile(`${process.env.PATROL_SAMPLE_DIR}/${kind}-identities.hwpx`, Buffer.from(await zip.generateAsync({ type: 'nodebuffer' })))
    }
  }
})

test('계획 항목은 네모 머리글과 두 칸 들여쓴 AI 문장이다', async () => {
  const zip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx(row, 'plan', { action: '난간을 설치할 예정', prevention: '매일 확인할 예정' })).arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  const cell = $('hp\\:tc').filter((_, e) => $(e).children('hp\\:cellAddr').attr('rowAddr') === '5' && $(e).children('hp\\:cellAddr').attr('colAddr') === '1')
  assert.deepEqual(cell.first().find('hp\\:t').map((_, e) => $(e).text()).get(), ['□ 시정조치계획', '  - 난간을 설치할 예정', '□ 재발방지·확인계획', '  - 매일 확인할 예정'])
})

test('사진 문단만 가운데 정렬하고 같은 셀의 지적 본문은 왼쪽 정렬한다', async () => {
  for (const kind of ['request', 'result']) {
    const zip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx({ ...row, site_photo_issue1: 'https://photo.test/before' }, kind)).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
    const align = p => h('hh\\:paraPr').filter((_, e) => h(e).attr('id') === p.attr('paraPrIDRef')).find('hh\\:align').attr('horizontal')
    const picture = $('hp\\:pic').first().closest('hp\\:p')
    assert.equal(align(picture), 'CENTER')
    const body = picture.closest('hp\\:tc').find('hp\\:p').filter((_, e) => $(e).text().includes(row.issue_content1)).first()
    assert.equal(align(body), 'LEFT')
  }
})
for (const kind of ['request', 'result', 'plan']) {
  test(`${kind} 원본 서식과 필수 ZIP 구조를 보존한다`, async () => {
    const blob = await api.buildPatrolCorrectiveHwpx(row, kind, { action: '안전난간을 설치하고 통로를 정리할 계획이다.', prevention: '작업 전 점검을 실시할 계획이다.' })
    const bytes = Buffer.from(await blob.arrayBuffer())
    assert.equal(bytes.readUInt16LE(8), 0)
    assert.equal(bytes.subarray(30,38).toString(), 'mimetype')
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('Contents/section0.xml').async('string')
    const $ = load(xml, { xml: true })
    const original = await JSZip.loadAsync(await readFile(new URL(`../public/patrol-corrective/${kind}.hwpx`, import.meta.url)))
    const template = load(await original.file('Contents/section0.xml').async('string'), { xml: true })
    const sizes = document => document('hp\\:tc').map((_, e) => JSON.stringify(document(e).children('hp\\:cellSz').attr())).get()
    assert.deepEqual(sizes($).slice(0, sizes(template).length), sizes(template))
    assert.equal($('hp\\:tbl').first().find('hp\\:t').first().text(), template('hp\\:tbl').first().find('hp\\:t').first().text())
    assert.ok($('hp\\:t').text().includes('시험 & 사업'))
    assert.ok($('hp\\:t').text().includes('안전난간 미설치'))
    assert.ok($('hp\\:t').text().includes('통로 정리 필요'))
    assert.equal($('hp\\:secPr').length, 1)
    assert.ok(!xml.includes('OO지사장'))
    assert.ok(!xml.includes('조치 완료'))
    if (kind === 'result') assert.equal($('hp\\:tbl').length, 4)
    if (process.env.PATROL_SAMPLE_DIR) {
      await mkdir(process.env.PATROL_SAMPLE_DIR, { recursive: true })
      await writeFile(`${process.env.PATROL_SAMPLE_DIR}/${kind}-sample.hwpx`, bytes)
    }
  })
}
test('계획은 초안 없이는 생성하지 않는다', async () => {
  await assert.rejects(api.buildPatrolCorrectiveHwpx(row, 'plan'), /계획/)
})

test('지적별 전후 사진 네 장을 본문과 매니페스트에 연결한다', async () => {
  photoRequests.length = 0
  const blob = await api.buildPatrolCorrectiveHwpx({ ...row, site_photo_issue1: 'https://photo.test/before1', site_photo_issue2: 'https://photo.test/before2', action_photo_issue1: 'https://photo.test/after1', action_photo_issue2: 'https://photo.test/after2' }, 'result')
  const bytes = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('Contents/section0.xml').async('string')
  const $ = load(xml, { xml: true })
  assert.equal($('hp\\:pic').length, 4)
  $('hp\\:pic').each((_, e) => {
    const cell = $(e).closest('hp\\:tc')
    if (cell.children('hp\\:cellAddr').attr('rowAddr') === '4') assert.equal(cell.find('hp\\:p').length, 1, '조치 후 사진 앞 빈 문단으로 셀 높이를 낭비하지 않는다')
  })
  const ids = $('hc\\:img').map((_, e) => $(e).attr('binaryItemIDRef')).get()
  assert.equal(new Set(ids).size, 4)
  assert.deepEqual(photoRequests, ['https://photo.test/before1', 'https://photo.test/after1', 'https://photo.test/before2', 'https://photo.test/after2'])
  const bodyTables = $('hp\\:tbl').filter((_, table) => $(table).find('hp\\:pic').length > 0)
  bodyTables.each((index, table) => {
    assert.ok($(table).text().includes(index ? row.issue_content2 : row.issue_content1))
    assert.deepEqual($(table).find('hc\\:img').map((_, image) => $(image).attr('binaryItemIDRef')).get(), ids.slice(index * 2, index * 2 + 2))
  })
  for (const id of ids) assert.ok(zip.file(`BinData/${id}.jpg`))
  assert.equal($('hp\\:secPr').length, 1)
  if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/result-photo.hwpx`, bytes)
})
test('장문 지적은 잘라내지 않고 원본 양식의 다음 쪽으로 이어진다', async () => {
  const text = '난간 미설치 구간을 확인하고 통행로의 자재를 정리해야 합니다. '.repeat(32) + '끝표식'
  for (const kind of ['request', 'plan', 'result']) {
    const blob = await api.buildPatrolCorrectiveHwpx({ ...row, issue_content1: text, issue_content2: '' }, kind, { action: '위험구간에 안전난간을 설치할 계획이다.', prevention: '작업 전 점검할 계획이다.' })
    const bytes = Buffer.from(await blob.arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('Contents/section0.xml').async('string')
    const $ = load(xml, { xml: true })
    assert.ok($('hp\\:t').text().includes('끝표식'))
    assert.ok($('hp\\:tbl').length > 1)
    assert.equal($('hp\\:secPr').length, 1)
    assert.ok(xml.includes('pageBreak="1"'))
    if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/${kind}-long.hwpx`, bytes)
  }
})


test('사실문단 라벨이 지적에 있어도 결과표와 사진을 유지한다', async () => {
  const issue = '3. 점검자 안전교육 미실시'
  const blob = await api.buildPatrolCorrectiveHwpx({ ...row, issue_content1: issue, issue_content2: '', site_photo_issue1: 'https://photo.test/before' }, 'result')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  assert.equal($('hp\\:tbl').length, 2)
  assert.equal($('hp\\:pic').length, 1)
  assert.ok($('hp\\:t').text().includes(issue))
})

test('수신자는 본부·지사·사업단 조직명에 맞는 장으로 표시한다', async () => {
  for (const branch of ['경기본부', '화성·수원지사', '안전사업단']) {
    const blob = await api.buildPatrolCorrectiveHwpx({ ...row, managing_branch: branch }, 'plan', { action: '시정할 계획이다.', prevention: '예방할 계획이다.' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('Contents/section0.xml').async('string')
    assert.ok(xml.includes(`${branch}장`), branch)
  }
})

for (const count of [1, 2]) {
  test(`요구서는 지적별 현장사진 ${count}장만 연결한다`, async () => {
    photoRequests.length = 0
    const input = { ...row, issue_content2: count === 2 ? row.issue_content2 : '', site_photo_issue1: 'https://photo.test/before1', site_photo_issue2: count === 2 ? 'https://photo.test/before2' : null, action_photo_issue1: 'https://photo.test/after1' }
    const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx(input, 'request')).arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    assert.equal($('hp\\:pic').length, count)
    assert.deepEqual(photoRequests, Array.from({ length: count }, (_, i) => `https://photo.test/before${i + 1}`))
    const manifest = await zip.file('Contents/content.hpf').async('string')
    $('hp\\:tbl').each((index, table) => {
      assert.ok($(table).text().includes(`지적 ${index + 1}`))
      assert.ok($(table).text().includes(index ? row.issue_content2 : row.issue_content1))
      const id = $(table).find('hc\\:img').attr('binaryItemIDRef')
      assert.ok(zip.file(`BinData/${id}.jpg`))
      assert.ok(manifest.includes(`id="${id}"`))
    })
    if (count === 2 && process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/request-photo.hwpx`, bytes)
  })
}

test('요구서의 사진 없는 지적도 보존하고 조치사진으로 대신 채우지 않는다', async () => {
  photoRequests.length = 0
  const blob = await api.buildPatrolCorrectiveHwpx({ ...row, site_photo_issue2: 'https://photo.test/before2', action_photo_issue1: 'https://photo.test/after1' }, 'request')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  assert.equal($('hp\\:pic').length, 1)
  assert.ok($('hp\\:tbl').first().text().includes(row.issue_content1))
  assert.equal($('hp\\:tbl').first().find('hp\\:pic').length, 0)
  assert.ok($('hp\\:tbl').last().text().includes(row.issue_content2))
  assert.deepEqual(photoRequests, ['https://photo.test/before2'])
})

test('요구서 장문과 두 현장사진은 다음 쪽에도 누락 없이 유지한다', async () => {
  const text = '위험구간의 안전난간을 설치하고 통행로를 정리해야 합니다. '.repeat(32) + '끝표식'
  const blob = await api.buildPatrolCorrectiveHwpx({ ...row, issue_content1: text, site_photo_issue1: 'https://photo.test/before1', site_photo_issue2: 'https://photo.test/before2' }, 'request')
  const bytes = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('Contents/section0.xml').async('string')
  const $ = load(xml, { xml: true })
  assert.equal($('hp\\:pic').length, 2)
  assert.equal($('hp\\:secPr').length, 1)
  assert.ok($('hp\\:tbl').length > 2)
  assert.ok($('hp\\:t').text().includes('끝표식'))
  assert.ok(xml.includes('pageBreak="1"'))
  const issueText = $('hp\\:tc').filter((_, cell) => $(cell).children('hp\\:cellAddr').attr('rowAddr') === '4' && $(cell).children('hp\\:cellAddr').attr('colAddr') === '1').map((_, cell) => $(cell).find('hp\\:t').map((_, node) => $(node).text()).get().filter(value => !value.startsWith('지적 ') && !value.includes('위 지적사항') && !value.includes('제출을 요청')).join('')).get().join('')
  assert.ok(issueText.includes(text))
  if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/request-long-photo.hwpx`, bytes)
})

test('계획서는 사진이 저장된 점검도 사진 호출 없이 텍스트만 생성한다', async () => {
  photoRequests.length = 0
  const blob = await api.buildPatrolCorrectiveHwpx({ ...row, site_photo_issue1: 'https://photo.test/before1', action_photo_issue1: 'https://photo.test/after1' }, 'plan', { action: '시정 계획', prevention: '예방 계획' })
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  assert.equal($('hp\\:pic').length, 0)
  assert.deepEqual(photoRequests, [])
})

test('미기록 인물은 공란이며 점검자나 예시 성명으로 대체하지 않는다', async () => {
  for (const kind of ['request', 'result', 'plan']) {
    const zip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx(row, kind, { action: '조치', prevention: '확인' })).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const text = $('hp\\:t').map((_, e) => $(e).text()).get()
    assert.match(text.find(t => t.startsWith('작 성 자')), /^작 성 자 : 현장대리인\s*(?:󰄫|\(인\))$/)
    assert.match(text.find(t => t.startsWith('검 토 자')), /^검 토 자 : 공사감독\s*(?:󰄫|\(인\))$/)
    assert.equal(text.filter(t => /현장대리인/.test(t)).length, kind === 'result' ? 2 : 1)
    assert.equal(text.filter(t => /공사감독/.test(t)).length, kind === 'result' ? 2 : 1)
  }
})

test('사용자 예시 계획은 두 항목을 한 쪽에 담고 장문 AI 문장은 끝까지 보존한다', async () => {
  const example = {
    action: '현장 여건과 비상대응 절차를 검토해 훈련 시나리오와 대피 경로를 정하고, 근로자에게 역할과 행동요령을 안내한 뒤 비상대피 훈련을 실시할 예정',
    prevention: '비상대피 훈련의 계획·실시 여부를 정기적으로 확인하고, 참여 및 훈련 결과를 기록해 미흡사항을 보완하는 절차를 마련할 예정',
  }
  for (const long of [false, true]) {
    const plan = long ? { action: example.action.repeat(20) + '조치끝', prevention: example.prevention.repeat(20) + '예방끝' } : example
    const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx({ ...row, issue_content1: '비상대피 훈련 미실시', issue_content2: '', owner_name: '김현장', supervisor_position: '4급', supervisor_name: '이감독' }, 'plan', plan)).arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const cells = $('hp\\:tc').filter((_, e) => $(e).children('hp\\:cellAddr').attr('rowAddr') === '5' && $(e).children('hp\\:cellAddr').attr('colAddr') === '1')
    const text = cells.find('hp\\:t').text()
    assert.ok(text.includes(plan.action))
    assert.ok(text.includes(plan.prevention))
    assert.equal($('hp\\:tbl').length, long ? cells.length : 1)
    cells.each((_, e) => assert.ok($(e).find('hp\\:p').length <= 9))
    if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/plan-${long ? 'long-ai' : 'example'}.hwpx`, bytes)
  }
})
