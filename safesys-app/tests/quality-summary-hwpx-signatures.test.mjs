// 성과총괄표 HWPX의 서명 표와 그림 좌표를 검증하고 한글 렌더용 합성 표본을 생성한다.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import JSZip from 'jszip'
import { load } from 'cheerio'
import ts from 'typescript'

async function transpile(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  })
  return module.exports
}

const types = await transpile('../src/lib/quality/quality-test-types.ts')
const { downloadQualitySummaryHwpx } = await transpile('../src/lib/hwpx/quality-summary-hwpx-export.ts', {
  jszip: JSZip, '@/lib/quality/quality-test-types': types,
})
let capturedBlob
URL.createObjectURL = blob => { capturedBlob = blob; return 'blob:test' }
URL.revokeObjectURL = () => {}
globalThis.document = {
  createElement: () => ({ style: {}, click() {} }),
  body: { appendChild() {}, removeChild() {} },
}
globalThis.Image = class {
  naturalWidth = 240
  naturalHeight = 96
  set src(value) { this.onload?.() }
}
const signature = process.env.HWPX_SIGNATURE_PNG
  ? `data:image/png;base64,${(await readFile(process.env.HWPX_SIGNATURE_PNG)).toString('base64')}`
  : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

const base = {
  report_date: '2026-09-14', construction_period: '2026. 01. 01. ~ 2026. 12. 31.', progress_rate: '52',
  settlement_rows: [{ work_type: '철근콘크리트공', plan_qty: '1200', prev_qty: '200', current_qty: '100' }],
  quality_rows: [{ work_type: '철근공', test_item: '철근 인장강도, 항복강도, 연신율, 굽힘시험, 화학성분 Si/P/S', plan: '10', done: '5', pass: '5' }],
  verification_rows: [{ work_type: '가설공', test_item: '강관비계 2/3/4/6m', verification_type: '품질 확인시험', plan: '4', done: '2', pass: '2' }],
  writer_affiliation: '테스트건설', writer_position: '현장소장', writer_name: '가작성',
  reviewer_affiliation: '테스트건설', reviewer_position: '품질관리자', reviewer_name: '나검토',
  confirmer_affiliation: '테스트발주청', confirmer_position: '감독소장', confirmer_name: '다확인',
  writer_signature: signature, reviewer_signature: signature, confirmer_signature: signature,
}
const cases = {
  signed: base,
  unsigned: { ...base, writer_signature: null, reviewer_signature: null, confirmer_signature: null },
  long: { ...base, writer_affiliation: '한국테스트종합건설주식회사 수도권광역현장', reviewer_affiliation: '한국테스트건설사업관리공동수급체 품질관리부', confirmer_affiliation: '한국테스트공사 수도권지역본부 건설사업단', reviewer_signature: null },
  realistic: {
    ...base,
    quality_rows: [
      { work_type: '토공', test_item: '함수비 / 현장밀도', plan: '10', done: '5', pass: '5' },
      { work_type: '콘크리트공', test_item: '레미콘 슬럼프·공기량·염화물·단위수량·압축강도', plan: '20', done: '10', pass: '10' },
      { work_type: '철근공', test_item: '인장강도·항복강도·연신율·굽힘시험·화학성분 Si/P/S', plan: '4', done: '2', pass: '2' },
      { work_type: '가설공', test_item: '강관비계 인장하중 2/3/4/6m', plan: '4', done: '4', pass: '4' },
    ],
    verification_rows: [
      { work_type: '토공', test_item: '함수비 / 현장밀도', verification_type: '품질 확인시험', plan: '10', done: '5', pass: '5' },
      { work_type: '콘크리트공', test_item: '레미콘 슬럼프·공기량·염화물·단위수량·압축강도', verification_type: '품질 확인시험', plan: '20', done: '10', pass: '10' },
      { work_type: '철근공', test_item: '인장강도·항복강도·연신율·굽힘시험·화학성분 Si/P/S', verification_type: '품질 확인시험', plan: '4', done: '2', pass: '2' },
      { work_type: '가설공', test_item: '강관비계 인장하중 2/3/4/6m', verification_type: '품질 확인시험', plan: '4', done: '4', pass: '4' },
    ],
  },
}

for (const [name, report] of Object.entries(cases)) {
  test(`${name}: 서명 이미지는 같은 행 (인) 열 안에 겹치고 하단 표는 A4 본문 안에 들어간다`, async () => {
    await downloadQualitySummaryHwpx(report, '테스트지구 도로 및 기반시설 조성공사')
    const buffer = Buffer.from(await capturedBlob.arrayBuffer())
    if (process.env.HWPX_SAMPLE_DIR) {
      await mkdir(process.env.HWPX_SAMPLE_DIR, { recursive: true })
      await writeFile(`${process.env.HWPX_SAMPLE_DIR}/${name}.hwpx`, buffer)
    }
    const zip = await JSZip.loadAsync(buffer)
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const footer = $('hp\\:tbl').last()
    assert.equal(footer.attr('colCnt'), '5', '서명은 역할·소속·직위·성명·(인) 고정 열이어야 한다')
    const position = footer.children('hp\\:pos')
    assert.equal(position.attr('vertRelTo'), 'PAPER')
    const top = Number(position.attr('vertOffset'))
    const left = Number(position.attr('horzOffset'))
    const rows = footer.children('hp\\:tr').toArray()
    let y = top
    const boxes = []
    for (const row of rows) {
      const cells = $(row).children('hp\\:tc')
      const height = Number(cells.first().children('hp\\:cellSz').attr('height'))
      if (cells.last().find('hp\\:t').text() === '(인)') {
        let x = left
        for (const cell of cells.toArray().slice(0, -1)) x += Number($(cell).children('hp\\:cellSz').attr('width'))
        boxes.push({ x, y, width: Number(cells.last().children('hp\\:cellSz').attr('width')), height })
      }
      y += height
    }
    assert.equal(boxes.length, 3)
    assert.ok(y <= 84188 - 7200, '하단 표가 A4 본문을 벗어났다')
    const expected = [report.writer_signature, report.reviewer_signature, report.confirmer_signature]
    const pictures = $('hp\\:pic').toArray()
    assert.equal(pictures.length, expected.filter(Boolean).length)
    let picIndex = 0
    expected.forEach((signatureValue, index) => {
      if (!signatureValue) return
      const picture = $(pictures[picIndex++])
      const pos = picture.children('hp\\:pos')
      const size = picture.children('hp\\:sz')
      const x = Number(pos.attr('horzOffset')); const y = Number(pos.attr('vertOffset'))
      const width = Number(size.attr('width')); const height = Number(size.attr('height'))
      const box = boxes[index]
      assert.equal(picture.attr('textWrap'), 'IN_FRONT_OF_TEXT')
      assert.ok(x >= box.x && x + width <= box.x + box.width, '서명이 성명 칸을 침범했다')
      assert.ok(y >= box.y && y + height <= box.y + box.height, '서명이 해당 행을 벗어났다')
      assert.ok(Math.abs(x + width / 2 - (box.x + box.width / 2)) <= 1)
      assert.ok(Math.abs(y + height / 2 - (box.y + box.height / 2)) <= 1)
      assert.ok(Math.abs(width / height - 2.5) < 0.01, '서명 원본 비율이 달라졌다')
    })
  })
}
