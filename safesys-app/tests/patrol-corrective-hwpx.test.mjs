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
const photoVariants = new Map([['portrait', [800, 1200]], ['square', [1000, 1000]]].map(([name, [w, h]]) => {
  const variant = createCanvas(w, h)
  variant.getContext('2d').drawImage(canvas, 0, 0, w, h)
  return [name, variant.toBuffer('image/png')]
}))
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
  if (url.startsWith('https://photo.test/')) { photoRequests.push(url); return new Response(photoVariants.get(url.split('/').at(-1)) || photoBytes) }
  return new Response(await readFile(new URL(`../public${url}`, import.meta.url)))
}

const row = { id: 'inspection-1', project_id: 'p', project_name: '시험 & 사업', managing_hq: '경기', managing_branch: '안전지사', inspection_date: '2026-10-01', inspector_name: '홍점검', issue_content1: '안전난간 미설치', issue_content2: '통로 정리 필요', issue1_status: 'pending', patrol_car_used: true, finding_type: 'corrective_action', created_at: '' }

test('결과보고서 각 지적의 상단·하단 날짜는 해당 조치사진 업로드일(서울)이다', async () => {
  const uploaded = time => `https://photo.test/storage/v1/object/public/inspection-photos/headquarters-actions/${Date.parse(time)}-action.jpg`
  const input = { ...row, action_photo_issue1: uploaded('2026-10-02T15:30:00Z'), action_photo_issue2: uploaded('2026-10-04T00:00:00Z') }
  const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx(input, 'result')).arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
  const paragraphs = $('hs\\:sec').children('hp\\:p').filter((_, p) => !$(p).find('hp\\:tbl').length)
  const headers = paragraphs.filter((_, p) => $(p).text().includes('5. 조치완료일'))
  assert.deepEqual(headers.map((_, p) => $(p).text().split('5. 조치완료일 : ')[1]).get(), ['2026-10-03', '2026-10-04'])
  const footers = paragraphs.filter((_, p) => /^2026\. /.test($(p).text()))
  assert.deepEqual(footers.map((_, p) => $(p).text()).get(), ['2026. 10. 03.', '2026. 10. 04.'])
  footers.each((_, p) => {
    const style = h('hh\\:paraPr').filter((_, e) => h(e).attr('id') === $(p).attr('paraPrIDRef'))
    assert.equal(style.find('hh\\:align').attr('horizontal'), 'CENTER')
    style.find('hc\\:left, hc\\:right, hc\\:intent').each((_, e) => assert.equal(h(e).attr('value'), '0'))
    const char = h('hh\\:charPr').filter((_, e) => h(e).attr('id') === $(p).find('hp\\:run').attr('charPrIDRef'))
    assert.equal(char.attr('height'), '1300')
  })
  if (process.env.PATROL_SAMPLE_DIR) {
    await mkdir(process.env.PATROL_SAMPLE_DIR, { recursive: true })
    await writeFile(`${process.env.PATROL_SAMPLE_DIR}/result-upload-date.hwpx`, bytes)
  }
})

test('조치사진이 없거나 업로드일 근거가 없으면 결과 날짜를 추측하지 않는다', async () => {
  for (const photo of [null, '해당 사항 없음', 'https://photo.test/no-timestamp.jpg']) {
    const zip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx({ ...row, issue_content2: '', action_photo_issue1: photo }, 'result')).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const paragraphs = $('hs\\:sec').children('hp\\:p').filter((_, p) => !$(p).find('hp\\:tbl').length)
    assert.ok(paragraphs.filter((_, p) => $(p).text().includes('5. 조치완료일')).text().endsWith('5. 조치완료일 : '))
    assert.equal(paragraphs.filter((_, p) => /^\.\s*\.\s*\.$/.test($(p).text())).length, 1)
  }
})

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
    const signatures = $('hp\\:p').filter((_, e) => /^(작 성 자|검 토 자)/.test($(e).text()))
    assert.equal(signatures.length, kind === 'result' ? 4 : 2)
    signatures.each((_, e) => {
      const paragraph = h('hh\\:paraPr').filter((_, p) => h(p).attr('id') === $(e).attr('paraPrIDRef'))
      assert.equal(paragraph.find('hh\\:align').attr('horizontal'), 'RIGHT')
      for (const [tag, value] of [['right', '2000'], ['left', '0'], ['intent', '0']]) {
        paragraph.find(`hc\\:${tag}`).each((_, margin) => assert.equal(h(margin).attr('value'), tag === 'right' && h(margin).closest('hp\\:default').length ? '4000' : value))
      }
    })
    if (process.env.PATROL_SAMPLE_DIR) {
      await mkdir(process.env.PATROL_SAMPLE_DIR, { recursive: true })
      await writeFile(`${process.env.PATROL_SAMPLE_DIR}/${kind}-identities.hwpx`, Buffer.from(await zip.generateAsync({ type: 'nodebuffer' })))
    }
  }
})

for (const kind of ['request', 'result']) {
  for (const shape of ['landscape', 'portrait', 'square']) {
    for (const long of [false, true]) {
      test(`${kind} ${shape} ${long ? '긴' : '짧은'} 본문 사진을 남는 높이까지 확대한다`, async () => {
        const text = long ? '안전난간을 설치하고 통행로를 정리합니다. '.repeat(kind === 'request' ? 7 : 3) : '안전난간 미설치'
        const input = { ...row, issue_content1: text, issue_content2: '', site_photo_issue1: `https://photo.test/${shape}`, action_photo_issue1: `https://photo.test/${shape}` }
        const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx(input, kind)).arrayBuffer())
        const zip = await JSZip.loadAsync(bytes)
        const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
        const ratio = shape === 'landscape' ? 1.5 : shape === 'portrait' ? 2 / 3 : 1
        $('hp\\:pic').each((_, pic) => {
          const picture = $(pic)
          const w = Number(picture.children('hp\\:sz').attr('width'))
          const height = Number(picture.children('hp\\:sz').attr('height'))
          const cell = picture.closest('hp\\:tc')
          const textLines = cell.find('hp\\:p').filter((_, p) => !$(p).find('hp\\:pic').length).length
          const available = Number(cell.children('hp\\:cellSz').attr('height')) - textLines * 2080 - 282 - 1300
          assert.ok(height + textLines * 2080 + 282 + 1300 <= Number(cell.children('hp\\:cellSz').attr('height')))
          assert.ok(Math.abs(w / height - ratio) < 0.001)
          assert.ok(Math.abs(w - 38500) <= 1 || Math.abs(height - available) <= 1, '폭 또는 높이 예산을 채운다')
          if (!long) assert.ok(height > (kind === 'request' ? 15000 : 8000))
        })
        if (!long) assert.equal($('hp\\:p[pageBreak="1"]').length, 0)
        if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/${kind}-${shape}-${long ? 'long' : 'short'}.hwpx`, bytes)
      })
    }
  }
}

test('요구서 긴 공사명은 상단 증가분을 본문 셀에서 확보한다', async () => {
  const project = '장문공사명'.repeat(20)
  const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx({ ...row, project_name: project, issue_content2: '', site_photo_issue1: 'https://photo.test/portrait' }, 'request')).arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  assert.ok($('hp\\:t').text().includes(project))
  assert.equal($('hp\\:tbl').length, 1)
  const body = $('hp\\:pic').closest('hp\\:tc')
  assert.ok(Number(body.children('hp\\:cellSz').attr('height')) < 43231)
  if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/request-long-project.hwpx`, bytes)
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
    if (kind === 'plan') template('hp\\:tc').filter((_, e) => template(e).children('hp\\:cellAddr').attr('rowAddr') === '5').children('hp\\:cellSz').attr('height', '27396')
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
for (const side of ['right', 'left']) {
  test(`계획 ${side} 셀만 넘치면 최대 줄간격으로 압축해 한 쪽에 담는다`, async () => {
    const issue = side === 'left' ? Array.from({ length: 14 }, (_, i) => `지적${i}`).join('\n') : '난간 미설치'
    const plan = side === 'right'
      ? { action: Array.from({ length: 5 }, (_, i) => `조치${i} 예정`).join('\n'), prevention: Array.from({ length: 5 }, (_, i) => `확인${i} 예정`).join('\n') }
      : { action: '난간 설치 예정', prevention: '정기 확인 예정' }
    const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx({ ...row, issue_content1: issue, issue_content2: '' }, 'plan', plan)).arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
    const baselineZip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx({ ...row, issue_content1: '난간 미설치', issue_content2: '' }, 'plan', { action: '설치 예정', prevention: '확인 예정' })).arrayBuffer())
    const baseline = load(await baselineZip.file('Contents/header.xml').async('string'), { xml: true })
    baseline('hh\\:paraPr').each((_, e) => {
      const unchanged = h('hh\\:paraPr').filter((_, p) => h(p).attr('id') === baseline(e).attr('id'))
      assert.equal(h.html(unchanged), baseline.html(e), '기존 공유 서식은 수정하지 않는다')
    })
    const allStyles = h('hh\\:paraPr')
    assert.equal(new Set(allStyles.map((_, e) => h(e).attr('id')).get()).size, allStyles.length)
    assert.equal(Number(h('hh\\:paraProperties').attr('itemCnt')), allStyles.length)
    assert.equal(allStyles.length - baseline('hh\\:paraPr').length, side === 'right' ? 2 : 1)
    assert.equal($('hp\\:tbl').length, 1)
    for (const col of [0, 1]) {
      const cell = $('hp\\:tc').filter((_, e) => $(e).children('hp\\:cellAddr').attr('rowAddr') === '5' && $(e).children('hp\\:cellAddr').attr('colAddr') === String(col))
      const expected = col ? side === 'right' ? 180 : 210 : side === 'left' ? 152 : 160
      cell.find('hp\\:p').each((_, e) => {
        const para = h('hh\\:paraPr').filter((_, p) => h(p).attr('id') === $(e).attr('paraPrIDRef'))
        assert.equal(para.find('hh\\:align').attr('horizontal'), col ? 'LEFT' : 'CENTER')
        para.find('hh\\:lineSpacing').each((_, spacing) => assert.equal(Number(h(spacing).attr('value')), expected))
        if (col) {
          assert.equal(para.find('hp\\:case hc\\:intent').attr('value'), $(e).text().startsWith('□') ? '0' : '-2688')
          assert.equal(para.find('hp\\:default hc\\:intent').attr('value'), $(e).text().startsWith('□') ? '0' : '-5376')
          assert.equal(para.find('hc\\:left').attr('value'), '0')
          assert.equal(para.find('hc\\:right').attr('value'), '0')
        }
      })
      cell.find('hp\\:run').each((_, e) => assert.equal(h('hh\\:charPr').filter((_, p) => h(p).attr('id') === $(e).attr('charPrIDRef')).attr('height'), '1300'))
    }
    assert.ok($('hp\\:t').text().includes(issue.replace(/\n/g, '')))
    for (const text of [...plan.action.split('\n'), ...plan.prevention.split('\n')]) assert.ok($('hp\\:t').text().includes(text))
    if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/plan-compress-${side}.hwpx`, bytes)
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
    if (kind === 'plan') {
      const requirements = $('hp\\:tc').filter((_, e) => $(e).children('hp\\:cellAddr').attr('rowAddr') === '5' && $(e).children('hp\\:cellAddr').attr('colAddr') === '0')
      assert.equal(requirements.find('hp\\:t').text(), text)
      const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
      requirements.find('hp\\:p').each((_, e) => assert.equal(h('hh\\:paraPr').filter((_, p) => h(p).attr('id') === $(e).attr('paraPrIDRef')).find('hh\\:lineSpacing').first().attr('value'), '130'))
    }
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
    assert.ok(!long || cells.length > 1)
    if (long) {
      const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
      cells.find('hp\\:p').each((_, e) => assert.equal(h('hh\\:paraPr').filter((_, p) => h(p).attr('id') === $(e).attr('paraPrIDRef')).find('hh\\:lineSpacing').first().attr('value'), '130'))
    }
    if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/plan-${long ? 'long-ai' : 'example'}.hwpx`, bytes)
  }
})


test('참조 분량 계획은 한 표에 담고 LEFT 내어쓰기와 지적일 제출일을 적용한다', async () => {
  const plan = {
    action: '해당 중장비의 후진 경고음 작동 여부와 전원·배선 상태를 현장에서 확인하고, 미작동 원인을 점검해 필요한 수리 또는 교체 방안을 검토한 뒤 작업 전 정상 작동 여부를 확인하도록 계획한다.',
    prevention: '작업 전 점검 항목에 후진 경고음 작동 확인을 포함하고, 관련 작업자에게 이상 발견 시 운행을 중지하고 보고하는 절차를 안내하며 현장 점검을 통해 이행 여부를 확인하도록 계획한다.',
  }
  for (const inspection_date of ['2026-09-16', '2026-08-03']) {
    const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx({ ...row, inspection_date, issue_content1: '중장비 후진 경고음 미사용', issue_content2: '', action_photo_issue1: 'https://photo.test/1791158400000-action.jpg' }, 'plan', plan)).arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
    assert.equal($('hp\\:tbl').length, 1)
    const cell = $('hp\\:tc').filter((_, e) => $(e).children('hp\\:cellAddr').attr('rowAddr') === '5' && $(e).children('hp\\:cellAddr').attr('colAddr') === '1')
    assert.equal(cell.children('hp\\:cellSz').attr('height'), '27396')
    assert.equal(cell.find('hp\\:p').length, 4, '자동 줄바꿈을 강제 문단으로 쪼개지 않는다')
    cell.find('hp\\:p').each((i, e) => {
      const para = h('hh\\:paraPr').filter((_, p) => h(p).attr('id') === $(e).attr('paraPrIDRef'))
      assert.equal(para.find('hh\\:align').attr('horizontal'), 'LEFT')
      assert.equal(para.find('hh\\:lineSpacing').first().attr('value'), '210')
      assert.equal(para.find('hp\\:case hc\\:intent').attr('value'), i % 2 ? '-2688' : '0')
      assert.equal(para.find('hp\\:default hc\\:intent').attr('value'), i % 2 ? '-5376' : '0')
      assert.equal(para.find('hc\\:left').attr('value'), '0')
    })
    const [y, m, d] = inspection_date.split('-')
    assert.ok($('hp\\:t').text().includes(`${y}년 ${m}월 ${d}일`))
    const date = $('hp\\:t').filter((_, e) => $(e).text() === `${y}년 ${m}월 ${d}일`).closest('hp\\:p')
    const dateStyle = h('hh\\:paraPr').filter((_, e) => h(e).attr('id') === date.attr('paraPrIDRef'))
    assert.equal(dateStyle.find('hh\\:align').attr('horizontal'), 'RIGHT')
    assert.equal(dateStyle.find('hp\\:case hc\\:right').attr('value'), '5000')
    assert.equal(dateStyle.find('hp\\:default hc\\:right').attr('value'), '10000')
    assert.ok(cell.text().includes(plan.action))
    assert.ok(cell.text().includes(plan.prevention))
    if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/plan-reference-${inspection_date}.hwpx`, bytes)
  }
})

test('요구서·계획서 점검자 입력은 가운데 정렬한다', async () => {
  for (const kind of ['request', 'plan']) {
    const zip = await JSZip.loadAsync(await (await api.buildPatrolCorrectiveHwpx(row, kind, { action: '설치 예정', prevention: '확인 예정' })).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const h = load(await zip.file('Contents/header.xml').async('string'), { xml: true })
    const p = $('hp\\:t').filter((_, e) => $(e).text() === row.inspector_name).closest('hp\\:p')
    assert.equal(h('hh\\:paraPr').filter((_, e) => h(e).attr('id') === p.attr('paraPrIDRef')).find('hh\\:align').attr('horizontal'), 'CENTER')
  }
})


test('긴 공사명·서명란은 계획 본문 예산에서 확보하고 여러 개조식 항목을 보존한다', async () => {
  const project_name = '공사현장 정비사업 '.repeat(10)
  const plan = { action: '작동 상태 확인 예정\n필요한 수리 방안 검토 예정', prevention: '정기 점검 및 미흡사항 보완 예정' }
  const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx({ ...row, project_name, issue_content2: '', owner_name: '현장대리인'.repeat(9), supervisor_name: '공사감독'.repeat(9) }, 'plan', plan)).arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  assert.equal($('hp\\:tbl').length, 1)
  assert.ok($('hp\\:t').text().includes(project_name))
  const cell = $('hp\\:tc').filter((_, e) => $(e).children('hp\\:cellAddr').attr('rowAddr') === '5' && $(e).children('hp\\:cellAddr').attr('colAddr') === '1')
  assert.ok(Number(cell.children('hp\\:cellSz').attr('height')) < 27396)
  for (const item of [...plan.action.split('\n'), plan.prevention]) assert.ok(cell.find('hp\\:t').map((_, e) => $(e).text()).get().includes(`  - ${item}`))
  if (process.env.PATROL_SAMPLE_DIR) await writeFile(`${process.env.PATROL_SAMPLE_DIR}/plan-long-project.hwpx`, bytes)
})

// 사용자의 개인 정보는 저장소에 넣지 않고 선택적 로컬 참조 파일에서만 읽는다.
test('선택적 로컬 참조 원문의 동일 내용 표본을 생성한다', { skip: !process.env.PATROL_REFERENCE_TEXT || !process.env.PATROL_SAMPLE_DIR }, async () => {
  const reference = JSON.parse((await readFile(process.env.PATROL_REFERENCE_TEXT, 'utf8')).replace(/^\uFEFF/, ''))
  const input = { ...row, project_name: reference['3,1'][0], inspector_name: reference['2,1'][0], inspection_date: reference['2,3'][0], issue_content1: reference['5,0'].join(''), issue_content2: '', owner_name: reference['6,0'][5].split('현장대리인 ')[1].split('    ')[0], supervisor_position: '', supervisor_name: reference['6,0'][6].split('공사감독 ')[1].split('    ')[0], managing_branch: reference['6,0'][8].replace('한국농어촌공사 ', '').replace('장  귀하', '') }
  const plan = { action: reference['5,1'][1].replace(/^  - /, ''), prevention: reference['5,1'][3].replace(/^  - /, '') }
  const bytes = Buffer.from(await (await api.buildPatrolCorrectiveHwpx(input, 'plan', plan)).arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
  assert.equal($('hp\\:tbl').length, 1)
  await writeFile(`${process.env.PATROL_SAMPLE_DIR}/plan-reference-exact.hwpx`, bytes)
})
