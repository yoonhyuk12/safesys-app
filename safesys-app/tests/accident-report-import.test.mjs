// HWPX 본문 추출이 안전 상한을 지키며 본문만 읽는지, 자동 채움 요청이 종류별로 올바른 FormData를 보내는지 검증한다
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)
const JSZip = nodeRequire('jszip')

/** `@/` 별칭 모듈을 실제 소스로 따라가며 transpile한다. 그 밖의 패키지는 node가 해결한다. */
function createLoader(overrides = {}) {
  const cache = new Map()

  const load = async (name) => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('@/')) return nodeRequire(name)
    if (cache.has(name)) return cache.get(name)

    const relative = name.replace('@/', '../src/')
    let source = null
    for (const suffix of ['.ts', '.tsx']) {
      try {
        source = await readFile(new URL(`${relative}${suffix}`, import.meta.url), 'utf8')
        break
      } catch {
        // 다음 확장자를 시도한다.
      }
    }
    if (source === null) throw new Error(`별칭 모듈을 찾지 못했다: ${name}`)

    const { outputText } = ts.transpileModule(source, {
      // esModuleInterop은 tsconfig와 같게 둔다 — 기본 import가 실제 빌드처럼 해석된다.
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })

    const dependencies = new Map()
    for (const match of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const dependency = match[1]
      if (!dependencies.has(dependency)) dependencies.set(dependency, await load(dependency))
    }

    const module = { exports: {} }
    cache.set(name, module.exports)
    const requireShim = (dependency) => {
      if (!dependencies.has(dependency)) throw new Error(`예상하지 못한 의존성 ${dependency}`)
      return dependencies.get(dependency)
    }
    new Function('module', 'exports', 'require', outputText)(module, module.exports, requireShim)
    cache.set(name, module.exports)
    return module.exports
  }

  return load
}

const load = createLoader()
const { AccidentImportError, extractHwpxText, requestAccidentPrefill } = await load('@/lib/accident-report-import')
const { ACCIDENT_IMPORT_TEXT_MAX_CHARS } = await load('@/lib/accident-report-extraction')

const FileCtor = globalThis.File ?? nodeRequire('node:buffer').File

/** 픽스처는 전부 합성이다 — 실명·실제 현장명·실제 연락처를 쓰지 않는다. */
function paragraph(...texts) {
  return `<hp:p><hp:run>${texts.map((text) => `<hp:t>${text}</hp:t>`).join('')}</hp:run></hp:p>`
}

function cell(text) {
  return `<hp:tc><hp:subList>${paragraph(text)}</hp:subList></hp:tc>`
}

function section(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">${body}</hs:sec>`
}

const SECTION_0 = section(
  [
    paragraph('사고발생보고'),
    paragraph('일시 &lt;2026-06-10&gt; &amp; 장소 &quot;예시지구&quot;'),
    '<hp:p><hp:run><hp:t>첫 줄</hp:t><hp:lineBreak/><hp:t>둘째 줄</hp:t></hp:run></hp:p>',
    paragraph('보고<hp:markpenBegin color="#FFFF00"/>자 표시'),
    `<hp:tbl><hp:tr>${cell('성명')}${cell('홍길동')}</hp:tr><hp:tr>${cell('연락처')}${cell('010-0000-0000')}</hp:tr></hp:tbl>`,
  ].join('')
)

const SECTION_1 = section([paragraph('사진대지'), paragraph('&#54620;&#44544; &#x0041;')].join(''))

/** 정상 구조의 합성 HWPX. Preview·BinData는 읽지 말아야 할 엔트리로 함께 넣는다. */
async function buildHwpx({
  mimetype = 'application/hwp+zip',
  sections = { 'Contents/section0.xml': SECTION_0, 'Contents/section1.xml': SECTION_1 },
  extraEntries = {},
  includePackage = true,
  includeNoise = true,
} = {}) {
  const zip = new JSZip()
  if (mimetype !== null) zip.file('mimetype', mimetype)
  if (includePackage) zip.file('Contents/content.hpf', '<opf:package/>')
  for (const [name, content] of Object.entries(sections)) zip.file(name, content)
  if (includeNoise) {
    zip.file('Preview/PrvText.txt', '미리보기금지')
    zip.file('BinData/image1.bmp', Buffer.alloc(64, 7))
    zip.file('Contents/header.xml', `<hh:head><hp:t>헤더금지</hp:t></hh:head>`)
  }
  for (const [name, content] of Object.entries(extraEntries)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

test('섹션 순서·단락 줄바꿈·셀 탭·엔티티를 반영해 본문만 뽑는다', async () => {
  const { text, truncated } = await extractHwpxText(await buildHwpx())

  assert.equal(truncated, false)
  const lines = text.split('\n')

  assert.equal(lines[0], '사고발생보고')
  assert.equal(lines[1], '일시 <2026-06-10> & 장소 "예시지구"')
  // hp:lineBreak는 줄바꿈이 된다.
  assert.equal(lines[2], '첫 줄')
  assert.equal(lines[3], '둘째 줄')
  // hp:t 안의 자식 태그는 지우고 텍스트 노드만 남긴다.
  assert.equal(lines[4], '보고자 표시')
  // 표 한 행은 셀 경계를 탭으로 삼아 한 줄에 남는다.
  assert.equal(lines[5], '성명\t홍길동')
  assert.equal(lines[6], '연락처\t010-0000-0000')

  // 섹션 순서를 지키고 사이에 빈 줄 하나를 둔다.
  assert.ok(text.indexOf('사고발생보고') < text.indexOf('사진대지'))
  assert.match(text, /연락처\t010-0000-0000\n\n사진대지/)
  // 숫자 엔티티도 디코드한다.
  assert.ok(text.includes('한글 A'))

  // XML 태그 문자열이 결과에 남지 않는다.
  assert.equal(text.includes('<hp:'), false)
  assert.equal(text.includes('&amp;'), false)
})

test('섹션 번호를 숫자 순서로 읽는다', async () => {
  const buffer = await buildHwpx({
    sections: {
      'Contents/section0.xml': section(paragraph('첫째 섹션')),
      'Contents/section2.xml': section(paragraph('셋째 섹션')),
      'Contents/section10.xml': section(paragraph('열한째 섹션')),
    },
  })

  const { text } = await extractHwpxText(buffer)
  assert.deepEqual(
    text.split('\n').filter((line) => line.length > 0),
    ['첫째 섹션', '셋째 섹션', '열한째 섹션']
  )
})

test('Preview·BinData·header 내용은 결과에 들어가지 않는다', async () => {
  const { text } = await extractHwpxText(await buildHwpx())

  assert.equal(text.includes('미리보기금지'), false)
  assert.equal(text.includes('헤더금지'), false)
})

test('Uint8Array와 Blob 입력도 같은 결과를 낸다', async () => {
  const buffer = await buildHwpx()
  const fromBytes = await extractHwpxText(new Uint8Array(buffer))
  const fromBlob = await extractHwpxText(new Blob([buffer]))

  assert.equal(fromBytes.text, fromBlob.text)
  assert.ok(fromBytes.text.length > 0)
})

test('본문 섹션이 없으면 오류다', async () => {
  const buffer = await buildHwpx({ sections: {} })

  await assert.rejects(() => extractHwpxText(buffer), (error) => {
    assert.ok(error instanceof AccidentImportError)
    assert.match(error.message, /본문을 찾지 못했습니다/)
    return true
  })
})

test('mimetype이 다르고 패키지 파일도 없으면 HWPX가 아니라고 알린다', async () => {
  const buffer = await buildHwpx({ mimetype: 'application/zip', includePackage: false })

  await assert.rejects(() => extractHwpxText(buffer), (error) => {
    assert.ok(error instanceof AccidentImportError)
    assert.match(error.message, /HWPX 형식이 아닙니다/)
    return true
  })
})

test('mimetype이 없어도 content.hpf가 있으면 읽는다', async () => {
  const buffer = await buildHwpx({ mimetype: null })
  const { text } = await extractHwpxText(buffer)
  assert.ok(text.includes('사고발생보고'))
})

test('손상된 바이트는 암호·손상 오류로 알린다', async () => {
  await assert.rejects(() => extractHwpxText(Buffer.from('이것은 zip이 아니다 0123456789')), (error) => {
    assert.ok(error instanceof AccidentImportError)
    assert.match(error.message, /암호가 걸렸거나 손상된/)
    return true
  })
})

test('엔트리 수가 상한을 넘으면 오류다', async () => {
  const extraEntries = {}
  for (let index = 0; index < 520; index += 1) extraEntries[`Contents/spam${index}.xml`] = 'x'

  const buffer = await buildHwpx({ extraEntries })
  await assert.rejects(() => extractHwpxText(buffer), (error) => {
    assert.ok(error instanceof AccidentImportError)
    assert.match(error.message, /내부 파일이 너무 많습니다/)
    return true
  })
})

test('강하게 압축된 거대 섹션은 압축해제 상한에서 막는다', async () => {
  // 원본은 작지만 압축을 풀면 8MB를 넘는 섹션 — zip 폭탄 방어를 확인한다.
  const bomb = section(paragraph('가'.repeat(9 * 1024 * 1024)))
  const buffer = await buildHwpx({ sections: { 'Contents/section0.xml': bomb } })

  assert.ok(buffer.length < 1024 * 1024, '픽스처 원본은 작아야 한다')
  await assert.rejects(() => extractHwpxText(buffer), (error) => {
    assert.ok(error instanceof AccidentImportError)
    assert.match(error.message, /본문이 너무 커서/)
    return true
  })
})

test('zip 헤더가 거짓 크기를 신고해도 스트림 누적 바이트에서 막는다', async () => {
  // 헤더가 정직하면 선언 크기 검사에서 끝나 스트림 누적 검사가 돌지 않는다 — 헤더만 작게 위조해 스트림 경로를 태운다.
  const bomb = section(paragraph('가'.repeat(9 * 1024 * 1024)))
  const buffer = await buildHwpx({ sections: { 'Contents/section0.xml': bomb } })

  const originalLoadAsync = JSZip.prototype.loadAsync
  JSZip.prototype.loadAsync = async function loadAsyncWithFakedSize(...args) {
    const zip = await originalLoadAsync.apply(this, args)
    const entry = zip.file('Contents/section0.xml')
    if (entry && entry._data) entry._data.uncompressedSize = 100
    return zip
  }

  try {
    await assert.rejects(() => extractHwpxText(buffer), (error) => {
      assert.ok(error instanceof AccidentImportError)
      assert.equal(error.message, 'HWPX 본문이 너무 커서 분석할 수 없습니다.')
      return true
    })
  } finally {
    JSZip.prototype.loadAsync = originalLoadAsync
  }
})

test('10만 자를 넘는 본문은 잘라내고 truncated를 알린다', async () => {
  const long = section(
    Array.from({ length: 200 }, (_, index) => paragraph(`${index} ${'나'.repeat(600)}`)).join('')
  )
  const { text, truncated } = await extractHwpxText(
    await buildHwpx({ sections: { 'Contents/section0.xml': long } })
  )

  assert.equal(truncated, true)
  assert.equal(text.length, ACCIDENT_IMPORT_TEXT_MAX_CHARS)
})

test('글자가 하나도 없으면 직접 입력을 안내한다', async () => {
  const empty = section('<hp:p><hp:run><hp:pic/></hp:run></hp:p>')

  const buffer = await buildHwpx({ sections: { 'Contents/section0.xml': empty } })
  await assert.rejects(
    () => extractHwpxText(buffer),
    (error) => {
      assert.ok(error instanceof AccidentImportError)
      assert.match(error.message, /글자를 찾지 못했습니다/)
      return true
    }
  )
})

const PROJECT_ID = '11111111-2222-4333-8444-555555555555'
const TOKEN = 'test-access-token'

/** fetch 대역 — 호출 인자를 기록하고 정해진 응답을 돌려준다. */
function stubFetch(handler) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

function okResponse(body) {
  return { ok: true, status: 200, async json() { return body } }
}

function pdfFile(size = 1024, name = '사고보고.pdf') {
  const bytes = Buffer.alloc(size, 0x20)
  Buffer.from('%PDF-1.7').copy(bytes)
  return new FileCtor([bytes], name, { type: 'application/pdf' })
}

test('PDF는 file FormData와 Authorization 헤더로 보낸다', async () => {
  const stub = stubFetch(() => okResponse({ success: true, fields: { description: '사고 내용' }, warnings: [] }))
  try {
    const result = await requestAccidentPrefill(pdfFile(), PROJECT_ID, TOKEN)

    assert.equal(stub.calls.length, 1)
    const { url, init } = stub.calls[0]
    assert.equal(url, '/api/ai/accident-report')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`)
    assert.equal(init.body.get('project_id'), PROJECT_ID)
    assert.ok(init.body.get('file'))
    assert.equal(init.body.get('text'), null)
    assert.equal(result.fields.description, '사고 내용')
  } finally {
    stub.restore()
  }
})

test('HWPX는 추출 텍스트만 text FormData로 보낸다', async () => {
  const buffer = await buildHwpx()
  const file = new FileCtor([buffer], '사고보고.HWPX', { type: '' })
  const stub = stubFetch(() => okResponse({ success: true, fields: {}, warnings: [] }))
  try {
    await requestAccidentPrefill(file, PROJECT_ID, TOKEN)

    const { init } = stub.calls[0]
    assert.equal(init.body.get('file'), null)
    const sent = init.body.get('text')
    assert.equal(typeof sent, 'string')
    assert.ok(sent.includes('사고발생보고'))
    // 추출 텍스트만 보내고 원본 바이트는 보내지 않는다.
    assert.equal(sent.includes('<hp:'), false)
  } finally {
    stub.restore()
  }
})

test('잘린 HWPX는 앞부분만 분석했다고 먼저 안내한다', async () => {
  const long = section(
    Array.from({ length: 200 }, (_, index) => paragraph(`${index} ${'다'.repeat(600)}`)).join('')
  )
  const file = new FileCtor(
    [await buildHwpx({ sections: { 'Contents/section0.xml': long } })],
    '긴문서.hwpx',
    { type: '' }
  )
  const stub = stubFetch(() => okResponse({ success: true, fields: {}, warnings: [] }))
  try {
    const result = await requestAccidentPrefill(file, PROJECT_ID, TOKEN)
    assert.equal(result.warnings[0], '문서가 길어 앞부분 10만 자만 분석했습니다.')
  } finally {
    stub.restore()
  }
})

test('PDF·HWPX가 아닌 파일과 빈 인자는 호출 전에 거절한다', async () => {
  const stub = stubFetch(() => okResponse({ success: true, fields: {}, warnings: [] }))
  try {
    const hwp = new FileCtor([Buffer.alloc(16)], '사고보고.hwp', { type: 'application/x-hwp' })
    await assert.rejects(() => requestAccidentPrefill(hwp, PROJECT_ID, TOKEN), /PDF 또는 HWPX 파일만/)

    await assert.rejects(() => requestAccidentPrefill(pdfFile(), '   ', TOKEN), /현장을 먼저 선택/)
    await assert.rejects(() => requestAccidentPrefill(pdfFile(), PROJECT_ID, ''), /로그인이 필요/)

    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('4MB를 넘는 PDF는 보내지 않는다', async () => {
  const stub = stubFetch(() => okResponse({ success: true, fields: {}, warnings: [] }))
  try {
    await assert.rejects(
      () => requestAccidentPrefill(pdfFile(4 * 1024 * 1024 + 1), PROJECT_ID, TOKEN),
      (error) => {
        assert.ok(error instanceof AccidentImportError)
        assert.match(error.message, /4MB를 넘습니다/)
        return true
      }
    )
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test('서버 오류 메시지를 그대로 사용자에게 전달한다', async () => {
  const stub = stubFetch(() => ({
    ok: false,
    status: 403,
    async json() {
      return { success: false, error: '이 현장에 접근할 수 없습니다.' }
    },
  }))
  try {
    await assert.rejects(() => requestAccidentPrefill(pdfFile(), PROJECT_ID, TOKEN), (error) => {
      assert.ok(error instanceof AccidentImportError)
      assert.equal(error.message, '이 현장에 접근할 수 없습니다.')
      return true
    })
  } finally {
    stub.restore()
  }
})

test('서버 메시지가 없으면 상태별 기본 문구를 쓴다', async () => {
  const stub = stubFetch(() => ({ ok: false, status: 504, async json() { throw new Error('본문 없음') } }))
  try {
    await assert.rejects(() => requestAccidentPrefill(pdfFile(), PROJECT_ID, TOKEN), /분석 시간이 초과/)
  } finally {
    stub.restore()
  }
})

test('서버 응답도 다시 정규화해 허용 밖 값을 걸러낸다', async () => {
  const stub = stubFetch(() =>
    okResponse({
      success: true,
      fields: {
        project_id: '99999999-2222-4333-8444-555555555555',
        photos: [{ dataUrl: 'data:image/jpeg;base64,/9j/AAAA', caption: '사진' }],
        severity: '중대재해',
        accident_at: '2026-13-40',
        description: '사고 내용',
      },
      warnings: ['서버 안내'],
    })
  )
  try {
    const { fields, warnings } = await requestAccidentPrefill(pdfFile(), PROJECT_ID, TOKEN)

    assert.equal('project_id' in fields, false)
    assert.equal('photos' in fields, false)
    assert.equal('severity' in fields, false)
    assert.equal('accident_at' in fields, false)
    assert.equal(fields.description, '사고 내용')
    assert.equal(warnings[0], '서버 안내')
    // 서버와 클라이언트가 같은 문장을 내도 한 번만 보여 준다.
    const notice = '자동 채움 결과는 초안이며 저장 전 확인이 필요합니다.'
    assert.equal(warnings.filter((warning) => warning === notice).length, 1)
  } finally {
    stub.restore()
  }
})

// 사용자가 준 원본은 읽기 전용 참고용이다. 존재할 때만 파싱이 되는지 확인하고 내용은 보지 않는다.
const LOCAL_SAMPLE = new URL('../public/사고/사고보고_평택지사(20260610).hwpx', import.meta.url)
const hasLocalSample = await access(LOCAL_SAMPLE).then(
  () => true,
  () => false
)

test('로컬 원본 HWPX가 있으면 태그 없는 본문이 나온다', { skip: !hasLocalSample }, async () => {
  const { text } = await extractHwpxText(await readFile(LOCAL_SAMPLE))

  assert.ok(text.length > 0)
  assert.equal(text.includes('<hp:'), false)
})
