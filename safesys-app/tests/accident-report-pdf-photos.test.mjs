// 합성 PDF에서 사진 후보 선별과 기존 사진 보존을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { jsPDF } from 'jspdf'
import { createCanvas, ImageData } from '@napi-rs/canvas'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const require = createRequire(import.meta.url)
const cache = new Map()
async function load(name) {
  if (name === 'pdfjs-dist') return pdfjs
  if (!name.startsWith('@/')) return require(name)
  if (cache.has(name)) return cache.get(name)
  const source = await readFile(new URL(name.replace('@/', '../src/') + '.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source.replaceAll('import.meta.url', "'file:///test.mjs'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const deps = new Map()
  for (const [, dependency] of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) deps.set(dependency, await load(dependency))
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, (id) =>
    id.includes('pdfjs-dist/build/pdf.min.mjs') ? pdfjs : deps.get(id))
  cache.set(name, module.exports)
  return module.exports
}
const { extractAccidentPdfPhotos } = await load('@/lib/accident-report-pdf-photos')
const { mergePdfPhotos } = await load('@/components/project/accident-report/pdf-photo-merge')

globalThis.document = { createElement: () => createCanvas(1, 1) }
globalThis.ImageData = ImageData

function makePdf(count, { scanned = false, small = false, png = false } = {}) {
  const doc = new jsPDF()
  doc.text('Synthetic accident photo fixture', 10, 10)
  for (let i = 0; i < count; i++) {
    if (i) doc.addPage()
    const canvas = createCanvas(small ? 8 : 640, small ? 8 : 480)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = ['red', 'green', 'blue'][i % 3]
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'white'
    ctx.fillRect(20, 20, 100, 100)
    doc.addImage(canvas.toDataURL(png ? 'image/png' : 'image/jpeg'), png ? 'PNG' : 'JPEG', 0, scanned ? 0 : 30, scanned ? 210 : 100, scanned ? 297 : 75)
  }
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' })
}

test('합성 PDF JPEG 사진을 JPEG 후보로 추출한다', async () => {
  const result = await extractAccidentPdfPhotos(makePdf(1))
  assert.equal(result.photos.length, 1)
  assert.match(result.photos[0].dataUrl, /^data:image\/jpeg;base64,\/9j\//)
})
test('PNG 사진도 기존 출력 계약인 JPEG로 정규화한다', async () => {
  const result = await extractAccidentPdfPhotos(makePdf(1, { png: true }))
  assert.equal(result.photos.length, 1)
  assert.match(result.photos[0].dataUrl, /^data:image\/jpeg;base64,\/9j\//)
})
test('사진 세 장은 표시 순서 앞 두 장과 제한 안내를 반환한다', async () => {
  const result = await extractAccidentPdfPhotos(makePdf(3))
  assert.equal(result.photos.length, 2)
  assert.match(result.warnings.join(' '), /최대 2장/)
  const first = await extractAccidentPdfPhotos(makePdf(1))
  assert.equal(result.photos[0].dataUrl, first.photos[0].dataUrl)
  assert.notEqual(result.photos[0].dataUrl, result.photos[1].dataUrl)
})
test('사진 없음, 작은 패턴, 전체 쪽 스캔은 수동 첨부를 안내한다', async () => {
  for (const input of [makePdf(0), makePdf(1, { small: true }), makePdf(1, { scanned: true })]) {
    const result = await extractAccidentPdfPhotos(input)
    assert.deepEqual(result.photos, [])
    assert.match(result.warnings.join(' '), /직접 첨부/)
  }
})
test('손상 PDF와 크기 초과는 사진 실패 안내로 끝난다', async () => {
  const damaged = await extractAccidentPdfPhotos(new Blob(['%PDF-1.7 broken']))
  assert.deepEqual(damaged.photos, [])
  assert.match(damaged.warnings.join(' '), /손상/)
  const large = await extractAccidentPdfPhotos(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]))
  assert.match(large.warnings.join(' '), /4MB/)
})
test('암호 PDF는 암호 안내를 반환한다', async () => {
  const doc = new jsPDF({ encryption: { userPassword: 'synthetic-password', ownerPassword: 'synthetic-owner' } })
  doc.text('Synthetic protected PDF', 10, 10)
  const result = await extractAccidentPdfPhotos(new Blob([doc.output('arraybuffer')]))
  assert.deepEqual(result.photos, [])
  assert.match(result.warnings.join(' '), /암호가 걸린 PDF/)
})

async function extractorWithRuntime(runtime) {
  const source = await readFile(new URL('../src/lib/accident-report-pdf-photos.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source.replaceAll('import.meta.url', "'file:///test.mjs'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, (id) =>
    id.includes('pdfjs-dist/build/pdf.min.mjs') ? runtime : cache.get(id))
  return module.exports.extractAccidentPdfPhotos
}

test('실제 파서 옵션은 eval을 막고 성공/실패/시간 초과 모두 destroy한다', async () => {
  for (const mode of ['success', 'failure', 'timeout']) {
    let destroyed = 0
    let options
    const extract = await extractorWithRuntime({
      OPS: pdfjs.OPS,
      getDocument: (input) => {
        options = input
        return {
          promise: mode === 'success'
            ? Promise.resolve({ numPages: 0 })
            : mode === 'failure' ? Promise.reject(new Error('broken')) : new Promise(() => {}),
          destroy: async () => { destroyed++ },
        }
      },
    })
    const originalTimeout = globalThis.setTimeout
    if (mode === 'timeout') globalThis.setTimeout = (callback) => originalTimeout(callback, 5)
    try {
      const result = await extract(new Blob(['%PDF-1.7']))
      assert.equal(destroyed, 1)
      assert.equal(options.isEvalSupported, false)
      assert.equal(options.enableXfa, false)
      assert.equal(options.maxImageSize, 12_000_000)
      if (mode === 'timeout') assert.match(result.warnings.join(' '), /15초/)
    } finally {
      globalThis.setTimeout = originalTimeout
    }
  }
})
test('기존 사진과 업로드 도중 삭제/변경된 목록을 그대로 보존한다', () => {
  const empty = []
  const existing = [{ dataUrl: 'existing', caption: '원본' }]
  const candidates = [{ dataUrl: 'new', caption: '' }]
  assert.equal(mergePdfPhotos(existing, candidates, existing), existing)
  assert.equal(mergePdfPhotos(existing, candidates, empty), existing)
  const deleted = []
  assert.equal(mergePdfPhotos(deleted, candidates, existing), deleted)
  assert.equal(mergePdfPhotos(deleted, candidates, empty), deleted)
  assert.deepEqual(mergePdfPhotos(empty, candidates, empty), candidates)
  assert.equal(mergePdfPhotos(empty, [...candidates, ...candidates, ...candidates], empty).length, 2)
})
