// 원본 카탈로그의 누락과 HWPX 서명·장문 페이지 분할을 검증한다.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import JSZip from 'jszip'
import { load } from 'cheerio'
import ts from 'typescript'

const generateSamples = process.env.EQUIPMENT_HWPX_SAMPLES === '1'

async function transpile(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => {
    assert.equal(name, 'jszip')
    return JSZip
  })
  return module.exports
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
const record = {
  id: 'sample', project_id: 'project', equipment_type: fixture[5].id, equipment_name: fixture[5].name,
  inspection_date: '2026-09-14', company_name: '테스트건설', vehicle_number: '서울01가1234', machine_number: 'EX-001',
  inspector_name: '홍점검', signature, answers: fixture[5].items.map((i, n) => ({ ...i, result: ['pass', 'fail', 'na'][n % 3], note: n === 1 ? '작업계획서 재확인 필요' : '' })),
  remarks: '안전핀과 후방카메라 확인 후 작업 개시', created_by: null, created_at: '2026-09-14T00:00:00Z',
}

test('서명 PNG 원본·완전한 이미지 XML·명시적 장문 분할', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const cases = { normal: record, long: { ...record, answers: record.answers.map((a, i) => ({ ...a, note: i === 0 ? '긴 비고 점검내용 및 시정조치 기록 '.repeat(300) + '비고끝표식' : a.note })), remarks: '추가 전달 사항 '.repeat(500) + '종합끝표식' } }
  const pageCounts = {}
  for (const [name, data] of Object.entries(cases)) {
    const blob = await buildEquipmentInspectionHwpxBlob(data, '장비점검 테스트 현장')
    const bytes = Buffer.from(await blob.arrayBuffer())
    assert.equal(bytes.readUInt16LE(8), 0, '첫 zip 항목은 STORE')
    assert.equal(bytes.subarray(30, 38).toString(), 'mimetype')
    const zip = await JSZip.loadAsync(bytes)
    assert.equal(await zip.file('mimetype').async('string'), 'application/hwp+zip')
    const xml = await zip.file('Contents/section0.xml').async('string')
    const $ = load(xml, { xmlMode: true })
    const pic = $('hp\\:pic')
    assert.equal(pic.length, 1)
    assert.equal(pic.attr('textWrap'), 'IN_FRONT_OF_TEXT')
    assert.deepEqual(pic.children().map((i, el) => el.tagName).get(), ['hp:offset','hp:orgSz','hp:curSz','hp:flip','hp:rotationInfo','hp:renderingInfo','hp:imgRect','hp:imgClip','hp:inMargin','hp:imgDim','hc:img','hp:effects','hp:sz','hp:pos','hp:outMargin','hp:shapeComment'])
    assert.equal(pic.find('hp\\:pos').attr('allowOverlap'), '1')
    assert.equal(pic.find('hp\\:pos').attr('horzRelTo'), 'PAPER')
    const signatureX = Number(pic.find('hp\\:pos').attr('horzOffset'))
    const signatureW = Number(pic.find('hp\\:sz').attr('width'))
    const signatureH = Number(pic.find('hp\\:sz').attr('height'))
    assert.ok(signatureX >= 4252 + 42500 && signatureX + signatureW <= 4252 + 51024, '서명은 이름 셀 오른쪽 안내문구 영역')
    const png = Buffer.from(signature.split(',')[1], 'base64')
    assert.ok(Math.abs(signatureW / signatureH - png.readUInt32BE(16) / png.readUInt32BE(20)) < 0.01, 'PNG 원본 종횡비')
    assert.deepEqual(await zip.file('BinData/image1.png').async('nodebuffer'), Buffer.from(signature.split(',')[1], 'base64'))
    assert.match(await zip.file('Contents/content.hpf').async('string'), /id="image1"/)
    for (const answer of data.answers) assert.ok($('hp\\:t').text().replace(/\s/g, '').includes(answer.text.replace(/\s/g, '')))
    pageCounts[name] = $('hp\\:tbl').length
    $('hp\\:tbl').each((_, tbl) => {
      let height = 0
      $(tbl).children('hp\\:tr').each((_, row) => { height += Number($(row).find('hp\\:cellSz').first().attr('height')) })
      assert.ok(height <= 63000, `표 높이 ${height}`)
    })
    if (name === 'long') {
      assert.ok(xml.includes('비고끝표식') && xml.includes('종합끝표식'))
      assert.ok($('hp\\:p[pageBreak="1"]').length >= 2)
      const plain = $('hp\\:t').text().replace(/\s/g, '')
        .replaceAll('장비일일점검표(계속)', '').replaceAll('굴착기/2026-09-14', '').replaceAll('구분검사내용점검결과', '')
      assert.ok(plain.includes(data.answers[0].note.replace(/\s/g, '')), '쪽 경계에서도 비고 전체 내용 보존')
      assert.ok(plain.includes(data.remarks.replace(/\s/g, '')), '쪽 경계에서도 종합 비고 전체 내용 보존')
    }
    const out = new URL('../scratch/equipment-inspection/', import.meta.url)
    if (generateSamples) {
      await mkdir(out, { recursive: true })
      await writeFile(new URL(`${name}-visible-signed.hwpx`, out), bytes)
    }
  }
  assert.ok(pageCounts.long > pageCounts.normal)
  assert.equal(pageCounts.normal, 1, '굴착기 18항목과 짧은 비고는 한 쪽')
})

test('23종 전 항목 스냅샷의 출력 보존과 서명 포함 검증 표본', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  const out = new URL('../scratch/equipment-inspection/', import.meta.url)
  if (generateSamples) await mkdir(out, { recursive: true })
  const summary = []
  for (const checklist of fixture) {
    const data = { ...record, equipment_type: checklist.id, equipment_name: checklist.name, answers: checklist.items.map(item => ({ ...item, result: 'pass', note: '' })) }
    const bytes = Buffer.from(await (await buildEquipmentInspectionHwpxBlob(data, '장비점검 테스트 현장')).arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xmlMode: true })
    const body = $('hp\\:t').text().replace(/\s/g, '')
    for (const item of checklist.items) assert.ok(body.includes(item.text.replace(/\s/g, '')), `${checklist.name}: ${item.id}`)
    const filename = `${checklist.id}-signed.hwpx`
    if (generateSamples) await writeFile(new URL(filename, out), bytes)
    summary.push({ name: checklist.name, sourcePage: checklist.sourcePage, items: checklist.items.length, pages: $('hp\\:tbl').length, filename })
  }
  if (generateSamples) await writeFile(new URL('samples.json', out), JSON.stringify(summary, null, 2))
})

test('서명 로드 실패를 조용히 무서명 출력으로 바꾸지 않는다', async () => {
  const { buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, signature: 'invalid:signature' }, '현장'), /서명 이미지/)
})

test('XML 금지 문자와 짝 없는 서로게이트는 원문을 바꾸지 않고 다운로드 전에 거부한다', async () => {
  const { downloadEquipmentInspectionHwpx, buildEquipmentInspectionHwpxBlob } = await transpile('../src/lib/hwpx/equipment-inspection-hwpx-export.ts')
  for (const invalid of ['\u0000', '\u000B', '\u000C', '\u001F', '\uD800', '\uDC00', '\uFFFE', '\uFFFF']) {
    await assert.rejects(downloadEquipmentInspectionHwpx({ ...record, remarks: `앞${invalid}뒤` }, '현장'), /출력할 수 없는 문자/)
  }
  for (const field of ['equipment_name', 'inspection_date', 'company_name', 'vehicle_number', 'machine_number', 'inspector_name']) {
    await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, [field]: '잘못\u000B' }, '현장'), /출력할 수 없는 문자/)
  }
  for (const field of ['category', 'text', 'note']) {
    await assert.rejects(buildEquipmentInspectionHwpxBlob({ ...record, answers: [{ ...record.answers[0], [field]: '잘못\uD800' }] }, '현장'), /출력할 수 없는 문자/)
  }
  await assert.rejects(buildEquipmentInspectionHwpxBlob(record, '현장\u000B'), /출력할 수 없는 문자/)
  const blob = await buildEquipmentInspectionHwpxBlob({ ...record, remarks: '한글 & <문자> 😀\t확인\r\n다음 줄' }, '현장')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('Contents/section0.xml').async('string')
  assert.ok(xml.includes('😀') && xml.includes('&amp;') && xml.includes('&lt;문자&gt;'))
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
