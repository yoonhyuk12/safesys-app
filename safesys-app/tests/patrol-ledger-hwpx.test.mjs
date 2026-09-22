// 순회점검 양식의 텍스트·사진·서명과 원본 서식 보존을 검증한다.
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
const template = await readFile(new URL('../public/순회점검 양식.hwpx', import.meta.url))
const signatureBytes = await readFile(new URL('./fixtures/equipment-inspection-signature.png', import.meta.url))
const photoCanvas = createCanvas(1600, 1000)
const ctx = photoCanvas.getContext('2d')
ctx.fillStyle = '#c9dfec'; ctx.fillRect(0, 0, 1600, 1000)
ctx.fillStyle = '#71866d'; ctx.fillRect(0, 650, 1600, 350)
ctx.fillStyle = '#ffc400'; ctx.fillRect(300, 450, 600, 300)
ctx.fillStyle = '#202020'; ctx.font = '64px sans-serif'; ctx.fillText('PATROL PHOTO', 360, 550)
const photoBytes = photoCanvas.toBuffer('image/png')
const blobs = new Map()
let blobId = 0
let downloaded
URL.createObjectURL = blob => { const id = `blob:${++blobId}`; blobs.set(id, blob); return id }
URL.revokeObjectURL = id => blobs.delete(id)
globalThis.Image = class extends CanvasImage {
  get naturalWidth() { return this.width }
  get naturalHeight() { return this.height }
  set src(value) { blobs.get(value).arrayBuffer().then(bytes => { super.src = Buffer.from(bytes) }) }
}
globalThis.document = {
  body: { appendChild() {}, removeChild() {} },
  createElement(tag) {
    if (tag === 'canvas') {
      const canvas = createCanvas(1, 1)
      canvas.toBlob = cb => cb(new Blob([canvas.toBuffer('image/jpeg')], { type: 'image/jpeg' }))
      return canvas
    }
    return { style: {}, click() { downloaded = this.download } }
  },
}
const nativeFetch = globalThis.fetch
let requestedTemplate
let failPhoto = false
globalThis.fetch = async url => {
  if (url === '/photo.png') return new Response(photoBytes, { status: failPhoto ? 404 : 200, headers: { 'Content-Type': 'image/png' } })
  if (url.startsWith('data:')) return nativeFetch(url)
  requestedTemplate = url
  return new Response(template)
}
const record = {
  id: 'sample', project_id: 'project', inspection_date: '2026-09-17', contractor_name: '안전건설', district_name: '안전지구',
  inspector_affiliation: '농어촌공사', inspector_position: '감독', inspector_name: '홍점검',
  signature: `data:image/png;base64,${signatureBytes.toString('base64')}`, finding_photo_url: '/photo.png',
  finding_text: '안전난간 고정 확인\n통행로 정리 필요\n오후 재점검 예정',
  items: Array.from({ length: 13 }, (_, i) => ({ no: i + 1, category: i < 5 ? '작업장 공통' : i < 10 ? '테마' : 'TBM 대책', text: `안전시설 ${i + 1} 점검`, result: i === 9 ? '' : i % 2 ? '미흡' : '양호' })).reverse(),
}
const cell = ($, table, row, col) => $('hp\\:tbl').eq(table).find('hp\\:tc').filter((_, el) => {
  const addr = $(el).children('hp\\:cellAddr'); return addr.attr('rowAddr') === String(row) && addr.attr('colAddr') === String(col)
})
const text = c => c.find('hp\\:t').text()
async function build(data = record, options = { projectName: '안전현장' }) {
  const api = await loadModule(new URL('../src/lib/hwpx/patrol-ledger-hwpx-export.ts', import.meta.url))
  const blob = await api.buildPatrolLedgerHwpxBlob(data, options)
  assert.equal(blob.type, 'application/hwp+zip')
  const bytes = Buffer.from(await blob.arrayBuffer())
  assert.equal(bytes.readUInt16LE(8), 0)
  assert.equal(bytes.subarray(30, 38).toString(), 'mimetype')
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('Contents/section0.xml').async('string')
  return { api, bytes, zip, xml, $: load(xml, { xmlMode: true }) }
}
test('13행 정렬·값·서식과 사진/서명 전체 구조를 유지한다', async () => {
  const { bytes, zip, $, xml } = await build()
  assert.equal(text(cell($, 0, 0, 0)), '작업장 순회 점검표(안전건설)')
  for (let i = 0; i < 13; i++) {
    const item = [...record.items].sort((a, b) => a.no - b.no)[i]
    assert.equal(text(cell($, 0, i + 3, 1)), ` (${item.category === '작업장 공통' ? '작업장' : item.category}) ${item.text}`)
    assert.equal(text(cell($, 0, i + 3, 4)), item.result)
  }
  for (const [r, c, value] of [[0,1,'2026년 9월 17일'],[1,1,'안전지구'],[2,2,'농어촌공사'],[2,4,'감독'],[2,6,'홍점검'],[2,7,'(서명)']]) assert.equal(text(cell($,1,r,c)), value)
  assert.equal(cell($,0,16,3).find('hp\\:p').length, 3)
  const photo = cell($,0,16,1).find('hp\\:pic')
  assert.equal(photo.length, 1)
  assert.equal(photo.find('hp\\:pos').attr('treatAsChar'), '1')
  assert.equal(text(cell($,0,16,1)), '')
  const signature = $('hp\\:pic[textWrap="IN_FRONT_OF_TEXT"]').filter((_, el) => $(el).find('hc\\:img').attr('binaryItemIDRef') !== 'image1')
  assert.equal(signature.length, 1)
  assert.equal(signature.parent()[0], $('hp\\:tbl').eq(0).parent()[0])
  for (const [k,v] of Object.entries({ treatAsChar:'0', allowOverlap:'1', vertRelTo:'PAPER', horzRelTo:'PAPER' })) assert.equal(signature.find('hp\\:pos').attr(k),v)
  for (const pic of [photo, signature]) {
    for (const tag of ['offset','orgSz','curSz','flip','rotationInfo','renderingInfo','imgRect','imgClip','inMargin','imgDim','effects','sz','pos','outMargin','shapeComment']) assert.equal(pic.children(`hp\\:${tag}`).length, 1, tag)
    for (let i=0;i<4;i++) assert.equal(pic.find(`hc\\:pt${i}`).length,1)
  }
  const manifest = load(await zip.file('Contents/content.hpf').async('string'), { xmlMode: true })
  for (const [pic, mime] of [[photo,'image/jpeg'],[signature,'image/png']]) {
    const id = pic.find('hc\\:img').attr('binaryItemIDRef')
    const entry = manifest(`opf\\:item[id="${id}"]`)
    assert.equal(entry.attr('media-type'),mime)
    const data = await zip.file(entry.attr('href')).async('nodebuffer')
    if (mime === 'image/png') assert.deepEqual(data, signatureBytes)
    else { const image = new CanvasImage(); image.src=data; assert.equal(image.width,1200); assert.equal(image.height,750) }
  }
  const original = await JSZip.loadAsync(template)
  // header는 원본과 같되, 채운 글자용 검정 charPr 복제본(id 26 이상)만 charProperties 끝에 덧붙는다.
  const originalHeader = await original.file('Contents/header.xml').async('string')
  const outputHeader = await zip.file('Contents/header.xml').async('string')
  const withoutClones = outputHeader
    .replace(/<hh:charPr id="(2[6-9]|[3-9]\d|\d{3,})"[\s\S]*?<\/hh:charPr>/g, '')
    .replace(/<hh:charProperties itemCnt="\d+"/, '<hh:charProperties itemCnt="26"')
  assert.equal(withoutClones, originalHeader)
  assert.notEqual(outputHeader, originalHeader)
  assert.ok(xml.includes('(서명)'))
  if (process.env.PATROL_LEDGER_HWPX_SAMPLES === '1') {
    const dir = new URL('../scratch/patrol-ledger/', import.meta.url)
    await mkdir(dir,{recursive:true}); await writeFile(new URL('sample.hwpx',dir),bytes)
  }
})
test('사진·서명 없음, 적은 항목, 빈 시공사와 XML 특수문자를 처리한다', async () => {
  const { $, bytes } = await build({ ...record, signature:'', finding_photo_url:null, contractor_name:'', finding_text:'<확인>&"검토"', items:[{...record.items[0], no:1, text:'<난간>& 점검'}] }, { projectName:'현장', templateUrl:'/custom.hwpx' })
  assert.equal(requestedTemplate,'/custom.hwpx')
  assert.equal(text(cell($,0,0,0)), '작업장 순회 점검표(시공사명)')
  assert.equal(text(cell($,0,16,1)), '(없는 경우 점검사진)')
  assert.equal(text(cell($,0,16,3)), '<확인>&"검토"')
  assert.equal($('hp\\:pic[textWrap="IN_FRONT_OF_TEXT"]').length,2)
  for(let r=4;r<=15;r++) { assert.equal(text(cell($,0,r,1)),''); assert.equal(text(cell($,0,r,4)),'') }
  if(process.env.PATROL_LEDGER_HWPX_SAMPLES==='1') await writeFile(new URL('../scratch/patrol-ledger/no-images.hwpx',import.meta.url),bytes)
})
test('파일명 금지문자를 치환하고 이미지 읽기 실패를 알린다',async()=>{
  const {api}=await build()
  await api.downloadPatrolLedgerHwpx({...record,signature:'',finding_photo_url:null},{projectName:'현장/A:B?'})
  assert.equal(downloaded,'현장_A_B__순회점검_2026-09-17.hwpx')
  failPhoto=true
  try { await assert.rejects(api.buildPatrolLedgerHwpxBlob(record,{projectName:'현장'}),/사진|이미지/) } finally { failPhoto=false }
})

test('셀 그리드·문단 서식·기존 로고는 원본과 같고 동시 생성 번호가 안정적이다', async () => {
  const originalZip = await JSZip.loadAsync(template)
  const original = load(await originalZip.file('Contents/section0.xml').async('string'), { xmlMode: true })
  const [a, b] = await Promise.all([build(), build()])
  assert.equal(a.xml, b.xml)
  for (let t = 0; t < 2; t++) {
    const oldCells = original('hp\\:tbl').eq(t).find('hp\\:tc').toArray()
    const newCells = a.$('hp\\:tbl').eq(t).find('hp\\:tc').toArray()
    assert.equal(newCells.length, oldCells.length)
    for (let i = 0; i < oldCells.length; i++) {
      const oldCell = original(oldCells[i]); const newCell = a.$(newCells[i])
      for (const tag of ['cellAddr', 'cellSpan', 'cellSz', 'cellMargin']) assert.deepEqual(newCell.children(`hp\\:${tag}`).attr(), oldCell.children(`hp\\:${tag}`).attr())
      // 표2 성명 칸(2,6)만 오른쪽 정렬 24에서 가운데 정렬 22로 바뀐다.
      const addr = oldCell.children('hp\\:cellAddr')
      const centered = t === 1 && addr.attr('rowAddr') === '2' && addr.attr('colAddr') === '6'
      for (const attr of ['paraPrIDRef','styleIDRef']) assert.equal(newCell.find('hp\\:p').first().attr(attr), centered && attr === 'paraPrIDRef' ? '22' : oldCell.find('hp\\:p').first().attr(attr))
      // 파랑(19)·빨강(24)·회색(25) 칸은 채울 때 검정 복제본으로 바뀐다. 그 외 칸과 (서명) 칸은 원본 그대로여야 한다.
      const oldRef = oldCell.find('hp\\:run').first().attr('charPrIDRef')
      if (!['19', '24', '25'].includes(oldRef) || text(oldCell) === '(서명)') assert.equal(newCell.find('hp\\:run').first().attr('charPrIDRef'), oldRef)
    }
  }
  assert.deepEqual(await a.zip.file('BinData/image1.jpg').async('nodebuffer'), await originalZip.file('BinData/image1.jpg').async('nodebuffer'))
  const ids = a.$('hp\\:pic').toArray().map(pic => a.$(pic).attr('id'))
  assert.equal(new Set(ids).size,ids.length)
})


test('사진만·서명만 있는 문서도 각각의 이미지 자리를 유지한다', async () => {
  for (const [name, data] of [['photo-only', { ...record, signature: '' }], ['signature-only', { ...record, finding_photo_url: null }]]) {
    const { $, bytes } = await build(data)
    assert.equal(cell($,0,16,1).find('hp\\:pic').length, name === 'photo-only' ? 1 : 0)
    assert.equal($('hp\\:pic').length, 3)
    if (process.env.PATROL_LEDGER_HWPX_SAMPLES === '1') await writeFile(new URL(`../scratch/patrol-ledger/${name}.hwpx`, import.meta.url), bytes)
  }
})

test('채운 글자는 모두 검정이고 (서명) 문구만 원본 회색을 유지한다', async () => {
  const { zip, $ } = await build()
  const header = load(await zip.file('Contents/header.xml').async('string'), { xmlMode: true })
  const colorOf = id => header(`hh\\:charPr[id="${id}"]`).attr('textColor')
  const itemCnt = Number(header('hh\\:charProperties').attr('itemCnt'))
  assert.equal(header('hh\\:charPr').length, itemCnt)
  const filled = [[0,0,0],[0,3,1],[0,3,4],[0,4,4],[0,16,3],[1,0,1],[1,1,1],[1,2,2],[1,2,4],[1,2,6]]
  for (const [t, r, c] of filled) {
    const refs = new Set(cell($, t, r, c).find('hp\\:run').map((_, el) => $(el).attr('charPrIDRef')).get())
    assert.ok(refs.size >= 1)
    for (const id of refs) assert.equal(colorOf(id), '#000000', `표${t} r${r} c${c} charPr ${id}`)
  }
  const signatureRef = cell($, 1, 2, 7).find('hp\\:run').attr('charPrIDRef')
  assert.equal(colorOf(signatureRef), '#A6A6A6')
})

test('긴 점검사항은 장평·자간을 줄인 검정 charPr로 한 줄에 맞춘다', async () => {
  const longText = '작업장 주변 가설전선 피복 손상과 접지 상태를 확인하고 즉시 정비하였는가 여부를 확인'
  const items = [
    { no: 1, category: '작업장 공통', text: longText, result: '양호' },
    { no: 2, category: '테마', text: '짧은 점검', result: '양호' },
  ]
  const { zip, $ } = await build({ ...record, items })
  const header = load(await zip.file('Contents/header.xml').async('string'), { xmlMode: true })
  assert.equal(text(cell($, 0, 3, 1)), ` (작업장) ${longText}`)
  const longRef = cell($, 0, 3, 1).find('hp\\:run').first().attr('charPrIDRef')
  const fitted = header(`hh\\:charPr[id="${longRef}"]`)
  assert.equal(fitted.attr('height'), '1100')
  assert.equal(fitted.attr('textColor'), '#000000')
  // 추정 폭(한글 1.0·공백 0.33·기타 0.55em)에 여유 5%를 둔 값. 상수가 바뀌면 이 값도 바뀐다.
  const ratio = Number(fitted.children('hh\\:ratio').attr('hangul'))
  assert.equal(ratio, 72)
  for (const lang of ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user']) {
    assert.equal(fitted.children('hh\\:ratio').attr(lang), String(ratio))
    assert.equal(fitted.children('hh\\:spacing').attr(lang), '-5')
  }
  // 짧은 점검사항은 원본 charPr 18(장평 100·자간 0)을 그대로 쓴다.
  const shortRef = cell($, 0, 4, 1).find('hp\\:run').first().attr('charPrIDRef')
  assert.equal(shortRef, '18')
  const short = header(`hh\\:charPr[id="${shortRef}"]`)
  assert.equal(short.children('hh\\:ratio').attr('hangul'), '100')
  assert.equal(short.children('hh\\:spacing').attr('hangul'), '0')
  assert.equal(header('hh\\:charPr').length, Number(header('hh\\:charProperties').attr('itemCnt')))
  // 장평 50%로도 모자라는 문장은 자간을 -15까지 내린다.
  const veryLong = '작업장 주변 가설전선 피복 손상과 접지 상태를 확인하고 즉시 정비하였는가 여부를 확인하고 그 결과를 일지에 기록하여 관리하였는지 확인'
  const { zip: zip2, $: $2 } = await build({ ...record, items: [{ no: 1, category: '테마', text: veryLong, result: '양호' }] })
  const header2 = load(await zip2.file('Contents/header.xml').async('string'), { xmlMode: true })
  const clamped = header2(`hh\\:charPr[id="${cell($2, 0, 3, 1).find('hp\\:run').first().attr('charPrIDRef')}"]`)
  assert.equal(clamped.children('hh\\:ratio').attr('hangul'), '50')
  assert.equal(clamped.children('hh\\:spacing').attr('hangul'), '-15')
})

test('표2 성명 칸은 가운데 정렬 문단에 검정 글자를 쓴다', async () => {
  const { zip, $ } = await build()
  const header = load(await zip.file('Contents/header.xml').async('string'), { xmlMode: true })
  const name = cell($, 1, 2, 6)
  assert.equal(name.find('hp\\:p').first().attr('paraPrIDRef'), '22')
  assert.equal(header('hh\\:paraPr[id="22"]').children('hh\\:align').attr('horizontal'), 'CENTER')
  assert.equal(text(name), '홍점검')
  assert.equal(header(`hh\\:charPr[id="${name.find('hp\\:run').first().attr('charPrIDRef')}"]`).attr('textColor'), '#000000')
})
