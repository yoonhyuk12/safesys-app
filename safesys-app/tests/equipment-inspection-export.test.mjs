// 원본 카탈로그의 누락과 HWPX 서명·줄바꿈·기본정보 그리드·행 높이 균등을 검증한다.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { load } from 'cheerio'
import ts from 'typescript'

const generateSamples = process.env.EQUIPMENT_HWPX_SAMPLES === '1'
// 안내 그림 표본은 새 폴더에 쌓는다 — 앞선 검증 표본을 덮어쓰지 않는다.
// EQUIPMENT_HWPX_SAMPLE_DIR로 목적지를 바꿀 수 있고, 표본을 만들지 않을 때는 이 경로를 쓰지 않는다.
const SAMPLE_DIR = process.env.EQUIPMENT_HWPX_SAMPLE_DIR
  ? pathToFileURL(`${process.env.EQUIPMENT_HWPX_SAMPLE_DIR}/`)
  : new URL('../scratch/equipment-inspection/guide-samples/', import.meta.url)
const PUBLIC_DIR = new URL('../public/', import.meta.url)
const ch = code => String.fromCharCode(code)

// 브라우저 모듈을 Node에서 그대로 돌리기 위한 로더. 상대 경로 의존 모듈도 같은 방식으로 컴파일해 잇는다.
const moduleCache = new Map()

async function loadModule(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href)
  const source = await readFile(url, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const deps = new Map()
  for (const [, specifier] of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (specifier === 'jszip') { deps.set(specifier, JSZip); continue }
    assert.ok(specifier.startsWith('.'), `예상하지 못한 의존 모듈: ${specifier}`)
    deps.set(specifier, await loadModule(new URL(`${specifier}.ts`, url)))
  }
  const module = { exports: {} }
  moduleCache.set(url.href, module.exports)
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => {
    assert.ok(deps.has(name), `허용하지 않은 require: ${name}`)
    return deps.get(name)
  })
  return module.exports
}

const transpile = path => loadModule(new URL(path, import.meta.url))

// 정적 자산은 브라우저에서 origin 기준으로 풀리지만 Node에는 그 origin이 없다. public 폴더에서 직접 읽어
// 같은 Response 모양을 돌려주고, 서명의 data: URL은 native fetch에 그대로 넘긴다.
let blockGuideFetch = false
const nativeFetch = globalThis.fetch
const missing = { ok: false, blob: async () => { throw new Error('없는 자산') } }
globalThis.fetch = async (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    if (blockGuideFetch) return missing
    try {
      const bytes = await readFile(new URL(`.${input}`, PUBLIC_DIR))
      return { ok: true, blob: async () => new Blob([bytes], { type: input.endsWith('.png') ? 'image/png' : 'image/jpeg' }) }
    } catch {
      return missing
    }
  }
  return nativeFetch(input, init)
}

const fixture = JSON.parse(await readFile(new URL('./fixtures/equipment-inspection-source.json', import.meta.url), 'utf8'))
test('23종 471개 원본 셀과 카테고리·출처 페이지가 일치한다', async () => {
  const { EQUIPMENT_CHECKLISTS } = await transpile('../src/lib/equipment-inspection-catalog.ts')
  assert.deepEqual(EQUIPMENT_CHECKLISTS, fixture)
  assert.deepEqual(EQUIPMENT_CHECKLISTS.map(c => c.items.length), [14,22,22,22,18,18,19,21,25,24,19,18,16,20,20,20,21,20,21,29,24,19,19])
  assert.equal(new Set(EQUIPMENT_CHECKLISTS.flatMap(c => c.items.map(i => i.id))).size, 471)
})

const signature = process.env.HWPX_SIGNATURE_PNG
  ? `data:image/png;base64,${(await readFile(process.env.HWPX_SIGNATURE_PNG)).toString('base64')}`
  : `data:image/png;base64,${(await readFile(new URL('./fixtures/equipment-inspection-signature.png', import.meta.url))).toString('base64')}`
const signatureBytes = Buffer.from(signature.split(',')[1], 'base64')
const PROJECT = '장비점검 테스트 현장'
const record = {
  id: 'sample', project_id: 'project', equipment_type: fixture[5].id, equipment_name: fixture[5].name,
  inspection_date: '2026-09-14', company_name: '테스트건설', vehicle_number: '서울01가1234', machine_number: 'EX-001',
  inspector_name: '홍점검', signature, answers: fixture[5].items.map((i, n) => ({ ...i, result: ['pass', 'fail', 'na'][n % 3], note: n === 1 ? '작업계획서 재확인 필요' : '' })),
  remarks: '안전핀과 후방카메라 확인 후 작업 개시', created_by: null, created_at: '2026-09-14T00:00:00Z',
}

const longRecord = {
  ...record,
  answers: record.answers.map((a, i) => ({ ...a, note: i === 0 ? '긴 비고 점검내용 및 시정조치 기록 '.repeat(300) + '비고끝표식' : a.note })),
  remarks: '추가 전달 사항 '.repeat(500) + '종합끝표식',
}

// 출력 XML의 용지·여백에서 본문 높이를 직접 계산한다 — exporter 상수를 빌려 쓰지 않는다.
function bodyHeightOf($) {
  const pagePr = $('hp\\:pagePr')
  const margin = pagePr.find('hp\\:margin')
  const at = name => Number(margin.attr(name))
  const height = Number(pagePr.attr('height')) - at('top') - at('header') - at('bottom') - at('footer')
  assert.ok(height > 0, '본문 높이를 읽지 못함')
  return height
}

// 표 한 개(= 한 쪽)를 행·셀 구조로 읽어 온다.
function readTable($, tbl) {
  return $(tbl).children('hp\\:tr').toArray().map(tr => ({
    height: Number($(tr).children('hp\\:tc').first().find('hp\\:cellSz').attr('height')),
    cells: $(tr).children('hp\\:tc').toArray().map(tc => {
      const paragraphs = $(tc).find('hp\\:t').toArray().map(t => $(t).text())
      return {
        col: Number($(tc).find('hp\\:cellAddr').attr('colAddr')),
        span: Number($(tc).find('hp\\:cellSpan').attr('colSpan')),
        width: Number($(tc).find('hp\\:cellSz').attr('width')),
        paragraphs,
        text: paragraphs.join(''),
      }
    }),
  }))
}

const readPages = $ => $('hp\\:tbl').toArray().map(tbl => readTable($, tbl))

// 문서에 실린 그림을 BinData 바이트까지 붙여 읽는다 — 서명과 안내 그림을 바이트로 구분하기 위해서다.
const PIC_CHILDREN = ['hp:offset','hp:orgSz','hp:curSz','hp:flip','hp:rotationInfo','hp:renderingInfo','hp:imgRect','hp:imgClip','hp:inMargin','hp:imgDim','hc:img','hp:effects','hp:sz','hp:pos','hp:outMargin','hp:shapeComment']

async function readPictures(zip, $) {
  const manifest = new Map(
    [...(await zip.file('Contents/content.hpf').async('string'))
      .matchAll(/<opf:item id="(image\d+)" href="([^"]+)" media-type="([^"]+)" isEmbeded="1"\/>/g)]
      .map(([, id, href, media]) => [id, { href, media }])
  )
  const pictures = []
  for (const element of $('hp\\:pic').toArray()) {
    const pic = $(element)
    const ref = pic.find('hc\\:img').attr('binaryItemIDRef')
    const item = manifest.get(ref)
    assert.ok(item, `${ref}가 content.hpf 매니페스트에 없다`)
    assert.match(item.href, /^BinData\//, '그림은 원격 연결이 아니라 내장 자산이어야 한다')
    // 한글 2020이 파일을 여는 즉시 죽지 않으려면 모든 그림이 같은 완전 골격이어야 한다.
    assert.equal(pic.attr('textWrap'), 'IN_FRONT_OF_TEXT')
    assert.deepEqual(pic.children().map((i, el) => el.tagName).get(), PIC_CHILDREN)
    assert.equal(pic.find('hp\\:pos').attr('allowOverlap'), '1')
    assert.equal(pic.find('hp\\:pos').attr('horzRelTo'), 'PAPER')
    assert.equal(pic.find('hp\\:pos').attr('vertRelTo'), 'PAPER')
    pictures.push({
      ref, href: item.href, media: item.media,
      bytes: await zip.file(item.href).async('nodebuffer'),
      width: Number(pic.find('hp\\:sz').attr('width')),
      height: Number(pic.find('hp\\:sz').attr('height')),
      x: Number(pic.find('hp\\:pos').attr('horzOffset')),
      y: Number(pic.find('hp\\:pos').attr('vertOffset')),
    })
  }
  const inspector = pictures.find(picture => picture.bytes.equals(signatureBytes))
  return { pictures, signature: inspector, guides: pictures.filter(picture => picture !== inspector) }
}

// 첫 쪽에서 서명 행과 표머리 사이에 놓인 안내 행을 찾는다. 안내 그림이 없는 장비에서는 null이다.
function guideRowOf(page) {
  const signatureIndex = page.findIndex(row => row.cells.some(cell => cell.text === '(서명 또는 인)'))
  const headerIndex = page.findIndex(row => row.cells.map(cell => cell.text).join('|') === '구분|검사 내용|점검 결과')
  assert.ok(signatureIndex >= 0 && headerIndex > signatureIndex, '서명 행과 표머리 순서가 깨졌다')
  if (headerIndex - signatureIndex === 1) return null
  assert.equal(headerIndex - signatureIndex, 2, '서명 행과 표머리 사이에는 안내 행 하나만 온다')
  const index = signatureIndex + 1
  return { index, row: page[index], top: 7200 + page.slice(0, index).reduce((sum, item) => sum + item.height, 0) }
}

// 쪽마다 표 행 높이 합이 본문 높이를 넘지 않으면서 하단 빈 공간을 남기지 않는지 본다.
function assertPagesFillBody($) {
  const capacity = bodyHeightOf($)
  const pages = readPages($)
  assert.ok(pages.length > 0, '표가 없다')
  for (const rows of pages) {
    const height = rows.reduce((sum, row) => sum + row.height, 0)
    assert.ok(height <= capacity, `표 높이 ${height}이 본문 높이 ${capacity}을 넘음`)
    assert.ok(height >= capacity - 200, `쪽 하단에 ${capacity - height} 빈 공간이 남음`)
  }
}

// 모든 셀 폭이 하나의 열 그리드에서 colAddr·colSpan으로 도출되었는지 본다(한글 행 재배치 방지).
// 경계는 문서 전체 행의 합집합으로 잡는다 — 쪽마다 따로 구하면 그 쪽이 안 쓰는 경계 때문에 열 번호가 밀린다.
function assertConsistentGrid(pages, contentWidth) {
  const all = pages.flat()
  const bounds = new Set([0])
  for (const row of all) {
    let x = 0
    for (const cell of row.cells) { x += cell.width; bounds.add(x) }
    assert.equal(x, contentWidth, '행 폭 합이 본문 폭과 다름')
  }
  const grid = [...bounds].sort((a, b) => a - b)
  for (const row of all) {
    let x = 0
    for (const cell of row.cells) {
      assert.equal(cell.col, grid.indexOf(x), '셀 시작이 열 그리드와 어긋남')
      x += cell.width
      assert.equal(cell.col + cell.span, grid.indexOf(x), '셀 colSpan이 열 그리드와 어긋남')
    }
  }
  return grid
}

// 같은 쪽 점검 항목 행은 높이가 균등해야 한다(차이 최대 1 HWPUNIT).
function assertEvenItemRows(pages) {
  let counted = 0
  for (const rows of pages) {
    const heights = itemRowsOf(rows).map(row => row.height)
    counted += heights.length
    const spread = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0
    assert.ok(spread <= 1, `같은 쪽 점검 행 높이 편차 ${spread}`)
  }
  return counted
}

const itemRowsOf = rows => rows.filter(row => row.cells.length === 3 && /^\d+\. /.test(row.cells[1].text))

test('서명 PNG 원본·완전한 이미지 XML·명시적 장문 분할', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const cases = { normal: record, long: longRecord }
  const pageCounts = {}
  for (const [name, data] of Object.entries(cases)) {
    const blob = await buildEquipmentInspectionHwpxBlob(data, PROJECT)
    const bytes = Buffer.from(await blob.arrayBuffer())
    assert.equal(bytes.readUInt16LE(8), 0, '첫 zip 항목은 STORE')
    assert.equal(bytes.subarray(30, 38).toString(), 'mimetype')
    const zip = await JSZip.loadAsync(bytes)
    assert.equal(await zip.file('mimetype').async('string'), 'application/hwp+zip')
    const xml = await zip.file('Contents/section0.xml').async('string')
    const $ = load(xml, { xmlMode: true })
    // 굴착기(equipment-06)는 안내 그림 한 장을 함께 싣는다. 서명은 원본 PNG 바이트로 가려낸다.
    const { pictures, signature: signaturePic, guides } = await readPictures(zip, $)
    assert.ok(signaturePic, '서명 그림을 찾지 못함')
    assert.equal(guides.length, 1, '굴착기 안내 그림 수')
    assert.equal(pictures.length, 2, '서명 한 장과 안내 그림 한 장')
    assert.ok(Math.abs(signaturePic.width / signaturePic.height - signatureBytes.readUInt32BE(16) / signatureBytes.readUInt32BE(20)) < 0.01, 'PNG 원본 종횡비')
    assert.equal(signaturePic.href, 'BinData/image1.png', '서명은 첫 내장 이미지')
    assert.deepEqual(await zip.file('BinData/image1.png').async('nodebuffer'), signatureBytes)
    assert.match(await zip.file('Contents/content.hpf').async('string'), /id="image1"/)
    for (const answer of data.answers) assert.ok($('hp\\:t').text().replace(/\s/g, '').includes(answer.text.replace(/\s/g, '')))
    pageCounts[name] = $('hp\\:tbl').length
    assertPagesFillBody($)
    if (name === 'long') {
      assert.ok(xml.includes('비고끝표식') && xml.includes('종합끝표식'))
      assert.ok($('hp\\:p[pageBreak="1"]').length >= 2)
      const plain = $('hp\\:t').text().replace(/\s/g, '')
        .replaceAll('장비일일점검표(계속)', '').replaceAll('장비종류굴착기점검일2026-09-14', '').replaceAll('구분검사내용점검결과', '')
      assert.ok(plain.includes(data.answers[0].note.replace(/\s/g, '')), '쪽 경계에서도 비고 전체 내용 보존')
      assert.ok(plain.includes(data.remarks.replace(/\s/g, '')), '쪽 경계에서도 종합 비고 전체 내용 보존')
    }
    if (generateSamples) {
      await mkdir(SAMPLE_DIR, { recursive: true })
      await writeFile(new URL(`${name}-visible-signed.hwpx`, SAMPLE_DIR), bytes)
    }
  }
  assert.ok(pageCounts.long > pageCounts.normal)
})

test('모든 셀은 세로 가운데 정렬이고 본문 예산은 A4 본문 높이 기준이다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const data of [record, longRecord]) {
    const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(data, PROJECT)).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
    const cells = $('hp\\:subList')
    assert.ok(cells.length > 0, '셀이 없다')
    cells.each((_, cell) => assert.equal($(cell).attr('vertAlign'), 'CENTER'))
    assert.equal(bodyHeightOf($), 69788, 'A4 여백 제외 본문 높이')
    assertPagesFillBody($)
  }
})

test('기본정보는 항목명 셀과 값 셀로 나뉘고 모든 행이 한 열 그리드를 따른다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(record, PROJECT)).arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
  const pages = readPages($)
  assertConsistentGrid(pages, 51024)
  const first = pages[0]
  const labelled = expected => {
    const row = first.find(item => item.cells[0].text === expected[0])
    assert.ok(row, `${expected[0]} 항목명 셀이 없다`)
    assert.deepEqual(row.cells.map(cell => cell.text).slice(0, expected.length), expected)
    return row
  }
  labelled(['현장명', PROJECT, '협력업체명', record.company_name])
  labelled(['장비종류', record.equipment_name, '점검일', record.inspection_date])
  labelled(['차량번호', record.vehicle_number, '기계번호', record.machine_number])
  const inspector = labelled(['점검자', record.inspector_name])
  assert.equal(inspector.cells[inspector.cells.length - 1].text, '(서명 또는 인)', '서명 안내문구는 별도 셀')
  for (const row of first) for (const cell of row.cells) {
    assert.ok(!/^(현장명|장비종류|점검일|협력업체명|차량번호|기계번호|점검자)\s+\S/.test(cell.text), `항목명과 값이 한 셀에 있음: ${cell.text}`)
  }
})

test('점검 문장은 셀 폭에 맞춰 자동 줄바꿈되고 강제 개행이 들어가지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const checklist of [fixture[5], fixture[19]]) {
    const data = { ...record, equipment_type: checklist.id, equipment_name: checklist.name, answers: checklist.items.map(item => ({ ...item, result: 'pass', note: '' })) }
    const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(data, PROJECT)).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
    const paragraphs = $('hp\\:t').map((_, t) => $(t).text()).get()
    data.answers.forEach((answer, index) => {
      assert.ok(paragraphs.includes(`${index + 1}. ${answer.text.replace(/\s*\n\s*/g, ' ')}`), `${checklist.name} ${index + 1}번 문장이 한 문단이 아님`)
      assert.ok(paragraphs.includes(answer.category), `${checklist.name} ${index + 1}번 구분이 한 문단이 아님`)
    })
  }
})

test('같은 쪽 점검 항목 행은 높이가 1 HWPUNIT 이내로 균등하다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const data of [record, longRecord]) {
    const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(data, PROJECT)).arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
    assert.equal(assertEvenItemRows(readPages($)), data.answers.length, '점검 항목 행을 모두 찾지 못함')
  }
})

test('서명 좌표는 최종 표 그리드에서 도출된다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(record, PROJECT)).arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
  const first = readPages($)[0]
  const index = first.findIndex(row => row.cells.some(cell => cell.text === '(서명 또는 인)'))
  assert.ok(index >= 0, '서명 안내문구 셀이 없다')
  const row = first[index]
  const guide = row.cells[row.cells.length - 1]
  const left = 4252 + row.cells.slice(0, -1).reduce((sum, cell) => sum + cell.width, 0)
  const above = first.slice(0, index).reduce((sum, item) => sum + item.height, 0)
  // 문서에는 안내 그림도 함께 실린다. 좌표는 서명 그림만 골라 본다.
  const { signature: signaturePic } = await readPictures(zip, $)
  assert.ok(signaturePic, '서명 그림을 찾지 못함')
  const { width, height } = signaturePic
  assert.equal(signaturePic.x, left + Math.round((guide.width - width) / 2), '서명 가로 좌표가 안내문구 셀 중앙이 아님')
  assert.equal(signaturePic.y, 7200 + above + Math.round((row.height - height) / 2), '서명 세로 좌표가 서명 행 중앙이 아님')
  assert.ok(width <= guide.width, '서명이 안내문구 셀보다 넓다')
  assert.ok(left >= 4252 + 36000, '서명은 이름 셀 오른쪽 안내문구 영역')
})

test('23종 전 항목 스냅샷의 출력 보존과 서명 포함 검증 표본', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  if (generateSamples) await mkdir(SAMPLE_DIR, { recursive: true })
  const summary = []
  for (const checklist of fixture) {
    const data = { ...record, equipment_type: checklist.id, equipment_name: checklist.name, answers: checklist.items.map(item => ({ ...item, result: 'pass', note: '' })) }
    const bytes = Buffer.from(await (await buildEquipmentInspectionHwpxBlob(data, PROJECT)).arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
    const body = $('hp\\:t').text().replace(/\s/g, '')
    for (const item of checklist.items) assert.ok(body.includes(item.text.replace(/\s/g, '')), `${checklist.name}: ${item.id}`)
    assertPagesFillBody($)
    const pages = readPages($)
    assertConsistentGrid(pages, 51024)
    assert.equal(assertEvenItemRows(pages), checklist.items.length, `${checklist.name} 점검 항목 행 수`)
    const paragraphs = $('hp\\:t').map((_, t) => $(t).text()).get()
    checklist.items.forEach((item, index) => {
      assert.ok(paragraphs.includes(`${index + 1}. ${item.text.replace(/\s*\n\s*/g, ' ')}`), `${checklist.name} ${index + 1}번 문장이 한 문단이 아님`)
    })
    const filename = `${checklist.id}-signed.hwpx`
    if (generateSamples) await writeFile(new URL(filename, SAMPLE_DIR), bytes)
    summary.push({ name: checklist.name, sourcePage: checklist.sourcePage, items: checklist.items.length, pages: pages.length, filename })
  }
  if (generateSamples) await writeFile(new URL('samples.json', SAMPLE_DIR), JSON.stringify(summary, null, 2))
})

test('문서 전체 글꼴은 휴먼명조이고 모든 언어 항목이 같은 얼굴을 가리킨다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(record, PROJECT)).arrayBuffer())
  const header = load(await zip.file('Contents/header.xml').async('string'), { xmlMode: true })
  const faces = header('hh\\:fontface').toArray()
  assert.equal(faces.length, 7, '언어별 글꼴 항목 수')
  for (const face of faces) {
    assert.equal(header(face).find('hh\\:font').attr('face'), '휴먼명조', `${header(face).attr('lang')} 글꼴`)
    assert.equal(header(face).find('hh\\:typeInfo').attr('familyType'), 'FCAT_MYUNGJO')
  }
  // 모든 글자 모양이 같은 글꼴 id를 참조해야 본문 일부만 다른 글꼴로 대체되지 않는다.
  header('hh\\:fontRef').toArray().forEach(ref => {
    for (const lang of ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user']) {
      assert.equal(header(ref).attr(lang), '0', `${lang} 글꼴 참조`)
    }
  })
})

test('기본정보가 한 쪽을 넘기면 조용히 넘치지 않고 명시적으로 거부한다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  await assert.rejects(buildEquipmentInspectionHwpxBlob(record, '가'.repeat(2000)), /기본정보가 너무 길어/)
  await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, company_name: '나'.repeat(2000) }, PROJECT), /기본정보가 너무 길어/)
  // 계속 쪽 머리에도 들어가는 장비종류가 길면 뒤쪽 쪽에서 터지므로 같은 기준으로 막는다.
  await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, equipment_name: '다'.repeat(2000) }, PROJECT), /기본정보가 너무 길어/)
  await assert.doesNotReject(buildEquipmentInspectionHwpxBlob({ ...record, company_name: '나'.repeat(60) }, PROJECT))
})

test('서명 로드 실패를 조용히 무서명 출력으로 바꾸지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, signature: 'invalid:signature' }, '현장'), /서명 이미지/)
})

test('XML 금지 문자와 짝 없는 서로게이트는 원문을 바꾸지 않고 다운로드 전에 거부한다', async () => {
  const { downloadEquipmentInspectionHwpx, buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const code of [0x0000, 0x000B, 0x000C, 0x001F, 0xD800, 0xDC00, 0xFFFE, 0xFFFF]) {
    await assert.rejects(downloadEquipmentInspectionHwpx({ ...record, remarks: `앞${ch(code)}뒤` }, '현장'), /출력할 수 없는 문자/)
  }
  for (const field of ['equipment_name', 'inspection_date', 'company_name', 'vehicle_number', 'machine_number', 'inspector_name']) {
    await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, [field]: `잘못${ch(0x000B)}` }, '현장'), /출력할 수 없는 문자/)
  }
  for (const field of ['category', 'text', 'note']) {
    await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, answers: [{ ...record.answers[0], [field]: `잘못${ch(0xD800)}` }] }, '현장'), /출력할 수 없는 문자/)
  }
  await assert.rejects(buildEquipmentInspectionHwpxBlob(record, `현장${ch(0x000B)}`), /출력할 수 없는 문자/)
  const blob = await buildEquipmentInspectionHwpxBlob({ ...record, remarks: '한글 & <문자> 😀\t확인\r\n다음 줄' }, '현장')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('Contents/section0.xml').async('string')
  assert.ok(xml.includes('😀') && xml.includes('&amp;') && xml.includes('&lt;문자&gt;'))
})

test('비고의 사용자 개행은 보존하고 점검 문장의 PDF 개행만 공백으로 바꾼다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const note = '첫 줄 기록\n둘째 줄 기록\n\n넷째 줄 기록'
  const data = { ...record, answers: record.answers.map((a, i) => ({ ...a, note: i === 0 ? note : '' })), remarks: '종합 첫 줄\n종합 둘째 줄' }
  const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(data, PROJECT)).arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
  const cells = readPages($).flatMap(rows => rows.flatMap(row => row.cells))
  const noteCell = cells.find(cell => cell.paragraphs[0] === '첫 줄 기록')
  assert.ok(noteCell, '비고 셀을 찾지 못함')
  assert.deepEqual(noteCell.paragraphs, ['첫 줄 기록', '둘째 줄 기록', '', '넷째 줄 기록'], '사용자 개행이 문단으로 보존되지 않음')
  const remarkCell = cells.find(cell => cell.paragraphs[0] === '종합 첫 줄')
  assert.deepEqual(remarkCell?.paragraphs, ['종합 첫 줄', '종합 둘째 줄'])
  const paragraphs = $('hp\\:t').map((_, t) => $(t).text()).get()
  fixture[5].items.forEach((item, index) => {
    assert.ok(paragraphs.includes(`${index + 1}. ${item.text.replace(/\s*\n\s*/g, ' ')}`))
  })
})

test('쪽 경계로 쪼갠 긴 비고를 이어 붙이면 원문과 한 글자도 다르지 않다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const zip = await JSZip.loadAsync(await (await buildEquipmentInspectionHwpxBlob(longRecord, PROJECT)).arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
  // 비고 행만 셀이 둘(항목명 + 값)이다. 항목명이 빈 행은 앞 비고의 이어지는 조각이다.
  const groups = []
  for (const rows of readPages($)) {
    for (const row of rows.filter(item => item.cells.length === 2)) {
      const value = row.cells[1].paragraphs.join('\n')
      if (row.cells[0].text) groups.push({ label: row.cells[0].text, text: value })
      else groups[groups.length - 1].text += value
    }
  }
  const expected = {
    '1번 비고': longRecord.answers[0].note,
    '2번 비고': longRecord.answers[1].note,
    '종합 비고': longRecord.remarks,
  }
  assert.deepEqual(groups.map(group => group.label), Object.keys(expected))
  for (const group of groups) assert.equal(group.text, expected[group.label], `${group.label} 원문 유실`)
  assert.ok(groups.some(group => group.text.length > 4000), '쪽을 넘기는 장문 비고가 표본에 없다')
})

test('잘못된 점검 결과를 빈칸으로 내보내지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const result of ['unknown', '', 'toString', null, undefined]) {
    await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, answers: [{ ...record.answers[0], result }] }, '현장'), /점검 결과/)
  }
})

test('점검자명은 100자까지 허용하고 서명 행을 넘치는 이름은 거부한다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  await assert.doesNotReject(buildEquipmentInspectionHwpxBlob({ ...record, inspector_name: '가'.repeat(100) }, '현장'))
  for (const inspector_name of ['가'.repeat(101), '가'.repeat(2100)]) {
    await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, inspector_name }, '현장'), /점검자명.*100자/)
  }
  await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, inspector_name: '\n'.repeat(99) }, '현장'), /점검자명.*한 줄/)
})


// ── 장비 안내 그림 ──

// 원본 PDF에서 뽑은 안내 그림의 출처·치수·바이트 지문. 추출 작업 폴더가 없어도 이 파일만으로 검증된다.
const guideFixture = JSON.parse(await readFile(new URL('./fixtures/equipment-inspection-guides.json', import.meta.url), 'utf8'))
const guidesOf = checklistId => guideFixture.find(item => item.id === checklistId)?.images ?? []
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

const withEquipment = checklist => ({
  ...record,
  equipment_type: checklist.id,
  equipment_name: checklist.name,
  answers: checklist.items.map(item => ({ ...item, result: 'pass', note: '' })),
})

async function buildFor(build, data) {
  const zip = await JSZip.loadAsync(await (await build(data, PROJECT)).arrayBuffer())
  const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
  return { zip, $, pages: readPages($) }
}

test('안내 그림 22개는 원본 바이트와 알려진 치수 그대로 정적 자산에 있다', async () => {
  const { EQUIPMENT_GUIDE_IMAGES, equipmentGuideImages } = await transpile('../src/lib/equipment-inspection-guides.ts')
  const { EQUIPMENT_CHECKLISTS } = await transpile('../src/lib/equipment-inspection-catalog.ts')
  let files = 0
  for (const checklist of EQUIPMENT_CHECKLISTS) {
    const expected = guidesOf(checklist.id)
    const mapped = equipmentGuideImages(checklist.id)
    assert.equal(mapped.length, expected.length, `${checklist.name} 안내 그림 수`)
    for (const [index, image] of mapped.entries()) {
      assert.equal(image.width, expected[index].width, `${checklist.name} 원본 가로`)
      assert.equal(image.height, expected[index].height, `${checklist.name} 원본 세로`)
      assert.equal(image.src, expected[index].src, `${checklist.name} 자산 경로`)
      const published = await readFile(new URL(`.${image.src}`, PUBLIC_DIR))
      assert.equal(published.length, expected[index].bytes, `${checklist.name} 원본 바이트 수`)
      assert.equal(sha256(published), expected[index].sha256, `${checklist.name} 원본 바이트 지문`)
      files += 1
    }
  }
  assert.equal(files, 22, '연결된 안내 그림 파일 수')
  assert.equal(Object.keys(EQUIPMENT_GUIDE_IMAGES).length, 21, '안내 그림을 가진 장비 수')
  // 고정 자료의 출처 쪽은 카탈로그와 같은 원본 PDF를 가리켜야 한다.
  for (const entry of guideFixture) {
    const checklist = EQUIPMENT_CHECKLISTS.find(item => item.id === entry.id)
    assert.ok(checklist, `${entry.id} 카탈로그 누락`)
    assert.equal(checklist.name, entry.name, `${entry.id} 장비 이름`)
    assert.equal(checklist.sourcePage, entry.sourcePage, `${entry.id} 원본 쪽`)
  }
  // 준설선·쇄석기는 원본에 도해가 없고, 알 수 없는 ID도 빈 배열이다.
  for (const id of ['equipment-20', 'equipment-21', 'equipment-99', 'toString', '', null, undefined]) {
    assert.deepEqual(equipmentGuideImages(id), [], `${id} 안내 그림 없음`)
  }
  assert.deepEqual(equipmentGuideImages('equipment-23').map(image => image.src.split('/').pop()), ['guide-01.jpeg', 'guide-02.jpeg'])
})

test('안내 그림은 첫 쪽 서명 아래·표머리 위 행 안에 비율 그대로 담긴다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const checklist of fixture.filter(item => guidesOf(item.id).length > 0)) {
    const { zip, $, pages } = await buildFor(buildEquipmentInspectionHwpxBlob, withEquipment(checklist))
    const { guides } = await readPictures(zip, $)
    const expected = guidesOf(checklist.id)
    assert.equal(guides.length, expected.length, `${checklist.name} 안내 그림 수`)
    const guideRow = guideRowOf(pages[0])
    assert.ok(guideRow, `${checklist.name} 안내 행이 없다`)
    assert.equal(guideRow.row.cells.length, 1, '안내 행은 본문 폭 한 칸이다')
    assert.equal(guideRow.row.cells[0].width, 51024, '안내 행은 본문 폭을 다 쓴다')
    assert.equal(guideRow.row.cells[0].text, '', '안내 행에는 글자를 넣지 않는다')
    const total = guides.reduce((sum, picture) => sum + picture.width, 0) + 600 * (guides.length - 1)
    assert.ok(total <= 51024, `${checklist.name} 안내 그림 묶음이 본문 폭을 넘음`)
    assert.equal(guides[0].x, 4252 + Math.round((51024 - total) / 2), `${checklist.name} 안내 그림 가로 가운데 정렬`)
    let cursor = guides[0].x
    for (const [index, picture] of guides.entries()) {
      const source = expected[index]
      assert.equal(sha256(picture.bytes), source.sha256, `${checklist.name} ${index + 1}번 원본 바이트`)
      assert.equal(picture.media, 'image/jpeg', '원본 JPEG 그대로 싣는다')
      // 알려진 원본 픽셀 비율을 그대로 유지한다(반올림 오차만 허용).
      assert.ok(Math.abs(picture.width / picture.height - source.width / source.height) < 0.01, `${checklist.name} ${index + 1}번 비율`)
      assert.ok(picture.height <= 19000, `${checklist.name} ${index + 1}번 높이 상한`)
      assert.ok(picture.height + 282 <= guideRow.row.height, `${checklist.name} ${index + 1}번이 안내 행보다 높다`)
      assert.equal(picture.x, cursor, `${checklist.name} ${index + 1}번 가로 배치`)
      assert.equal(picture.y, guideRow.top + Math.round((guideRow.row.height - picture.height) / 2), `${checklist.name} ${index + 1}번 세로 가운데 정렬`)
      assert.ok(picture.x >= 4252 && picture.x + picture.width <= 4252 + 51024, `${checklist.name} ${index + 1}번이 본문 폭 밖`)
      assert.ok(picture.y >= guideRow.top && picture.y + picture.height <= guideRow.top + guideRow.row.height, `${checklist.name} ${index + 1}번이 안내 행 밖`)
      cursor += picture.width + 600
    }
  }
})

test('덤프트럭은 두 장이 겹치지 않고 나란히 놓인다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const dump = fixture.find(item => item.id === 'equipment-23')
  const { zip, $ } = await buildFor(buildEquipmentInspectionHwpxBlob, withEquipment(dump))
  const { pictures, guides } = await readPictures(zip, $)
  assert.equal(guides.length, 2, '덤프트럭 안내 그림 두 장')
  assert.equal(pictures.length, 3, '서명 한 장과 안내 그림 두 장')
  assert.ok(guides[0].x + guides[0].width <= guides[1].x, '두 장이 가로로 겹친다')
  assert.notDeepEqual(guides[0].bytes, guides[1].bytes, '같은 그림을 두 번 싣는다')
  // 그림마다 유일한 내장 자산과 유일한 개체 번호를 가져야 한글이 파일을 연다.
  assert.equal(new Set(pictures.map(picture => picture.href)).size, 3)
  assert.equal(new Set(pictures.map(picture => picture.ref)).size, 3)
  assert.equal(new Set($('hp\\:pic').map((_, el) => $(el).attr('id')).get()).size, 3, '그림 id 중복')
  assert.equal(new Set($('hp\\:pic').map((_, el) => $(el).attr('instid')).get()).size, 3, '그림 instid 중복')
})

test('안내 그림이 없는 장비는 빈 자리를 만들지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const withGuide = fixture.find(item => item.id === 'equipment-19')
  const baseline = guideRowOf((await buildFor(buildEquipmentInspectionHwpxBlob, withEquipment(withGuide))).pages[0])
  assert.ok(baseline, '비교 기준이 될 안내 행이 없다')
  for (const id of ['equipment-20', 'equipment-21']) {
    const checklist = fixture.find(item => item.id === id)
    const { zip, $, pages } = await buildFor(buildEquipmentInspectionHwpxBlob, withEquipment(checklist))
    const { pictures, guides } = await readPictures(zip, $)
    assert.equal(guides.length, 0, `${checklist.name} 안내 그림 없음`)
    assert.equal(pictures.length, 1, `${checklist.name}에는 서명만 실린다`)
    assert.equal(guideRowOf(pages[0]), null, `${checklist.name} 빈 안내 행이 생김`)
    assertPagesFillBody($)
  }
  // 카탈로그에 없는 장비 ID로 저장된 옛 기록도 그림 없이 그대로 나간다.
  const unknown = { ...record, equipment_type: 'equipment-99' }
  const { zip, $, pages } = await buildFor(buildEquipmentInspectionHwpxBlob, unknown)
  assert.equal((await readPictures(zip, $)).guides.length, 0, '알 수 없는 장비에 안내 그림이 붙음')
  assert.equal(guideRowOf(pages[0]), null, '알 수 없는 장비에 빈 안내 행이 생김')
})

test('안내 그림은 첫 쪽에만 싣고 계속 쪽에는 반복하지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const { zip, $, pages } = await buildFor(buildEquipmentInspectionHwpxBlob, longRecord)
  assert.ok(pages.length > 1, '여러 쪽 표본이 아니다')
  const { guides } = await readPictures(zip, $)
  assert.equal(guides.length, 1, '안내 그림은 문서 전체에 한 번만')
  assert.ok(guideRowOf(pages[0]), '첫 쪽 안내 행')
  for (const page of pages.slice(1)) {
    assert.equal(page.findIndex(row => row.cells.some(cell => cell.text === '(서명 또는 인)')), -1, '계속 쪽에 서명 행')
    assert.equal(page[0].cells[0].text, '장비 일일점검표 (계속)')
  }
  // 떠 있는 그림은 첫 쪽 표 문단에만 붙어야 한다.
  const tables = $('hp\\:tbl').toArray()
  for (const [index, table] of tables.entries()) {
    const run = $(table).parent()
    assert.equal(run.find('hp\\:pic').length, index === 0 ? 2 : 0, `${index + 1}번째 쪽의 그림 수`)
  }
})

test('있어야 할 안내 그림을 못 읽으면 조용히 빼지 않고 거부한다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  blockGuideFetch = true
  try {
    await assert.rejects(buildEquipmentInspectionHwpxBlob(record, PROJECT), /안내 그림/)
    // 안내 그림이 없는 장비는 원래 읽을 것이 없으므로 그대로 만들어진다.
    const dredger = fixture.find(item => item.id === 'equipment-20')
    await assert.doesNotReject(buildEquipmentInspectionHwpxBlob(withEquipment(dredger), PROJECT))
  } finally {
    blockGuideFetch = false
  }
})

test('점검 행은 쪽마다 고르게 나뉘고 종합 비고만 남은 쪽을 만들지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  let multiPage = 0
  for (const checklist of fixture) {
    const { $, pages } = await buildFor(buildEquipmentInspectionHwpxBlob, withEquipment(checklist))
    assertPagesFillBody($)
    if (pages.length < 2) continue
    multiPage += 1
    const heights = pages.map(rows => itemRowsOf(rows).map(row => row.height))
    // 안내 그림이 첫 쪽만 밀어내 한 줄짜리 첫 쪽이 되면 안 된다(굴착기 회귀).
    assert.ok(heights[0].length > 1, `${checklist.name} 첫 쪽 점검 행이 ${heights[0].length}개뿐`)
    // 점검 행을 앞 쪽에 몰아넣고 마지막 쪽을 종합 비고 한 칸으로 채워도 안 된다(모터그레이더·스크레퍼 회귀).
    heights.forEach((rows, index) => {
      assert.ok(rows.length > 0, `${checklist.name} ${index + 1}쪽에 점검 행이 없다`)
    })
    const all = heights.flat()
    assert.ok(Math.max(...all) / Math.min(...all) <= 2, `${checklist.name} 쪽별 점검 행 높이 차가 두 배를 넘음`)
    const summary = pages.flat().find(row => row.cells[0].text === '종합 비고')
    assert.ok(summary, `${checklist.name} 종합 비고 행이 없다`)
    assert.ok(summary.height >= 3000, `${checklist.name} 종합 비고 최소 높이`)
    assert.ok(summary.height <= 20000, `${checklist.name} 종합 비고가 ${summary.height}까지 늘어남`)
  }
  assert.ok(multiPage >= 15, `여러 쪽 표본이 ${multiPage}종뿐`)
})
