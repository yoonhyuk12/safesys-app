// 특별점검(굴삭기 버킷 사고) 결과(붙임3) HWPX 생성이 양식 예시값·안내문을 지우고 실제 값으로 채우는지 검증한다.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import JSZip from 'jszip'
import ts from 'typescript'

async function loadModule(url) {
  if (String(url).endsWith('/ai-actions-client.ts')) return { requestSpecial770Actions: async () => { throw new Error('순수 builder는 AI를 호출하면 안 됩니다.') } }
  const source = await readFile(url, 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const deps = new Map([['jszip', JSZip]])
  for (const [, name] of outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    // '@/'는 tsconfig paths와 같게 src 루트로 돌린다.
    if (!deps.has(name)) deps.set(name, await loadModule(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url)))
  }
  const module = { exports: {} }
  const wrapper = vm.runInThisContext(`(function (module, exports, require) {\n${outputText}\n})`, { filename: String(url) })
  wrapper(module, module.exports, name => deps.get(name))
  return module.exports
}

/** 태그 짝·엔티티만 보는 최소 XML well-formed 검사 */
function assertWellFormed(xml, label) {
  const stack = []
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g
  let last = 0
  const checkText = text => {
    assert.ok(!text.includes('<'), `${label}: 태그로 읽히지 않는 < 가 있다 (${text.slice(0, 80)})`)
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text), `${label}: 잘못된 엔티티 (${text.slice(0, 80)})`)
  }
  for (const m of xml.matchAll(tag)) {
    checkText(xml.slice(last, m.index))
    last = m.index + m[0].length
    if (!m[2]) continue
    if (m[1]) assert.equal(stack.pop(), m[2], `${label}: 닫는 태그 ${m[2]} 짝이 맞지 않는다`)
    else if (!m[4]) stack.push(m[2])
  }
  checkText(xml.slice(last))
  assert.deepEqual(stack, [], `${label}: 닫히지 않은 태그`)
}

const api = await loadModule(new URL('../src/lib/hwpx/special-770-result-hwpx-export.ts', import.meta.url))
const template = await readFile(new URL('../public/특별점검(굴삭기) 결과 양식.hwpx', import.meta.url))
const checklist = await readFile(new URL('../public/특별점검(굴삭기 버킷 사고) 점검표.hwpx', import.meta.url))
// 1×1 PNG. 사진 크기는 주입한 width/height로 계산한다.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const fetchImage = async url => (url.includes('missing') ? null : { data: png, ext: 'png', width: 1600, height: 1200 })

const project = {
  id: 'p1', project_name: '시험지구 수리시설개보수사업', site_address: '충청남도 아산시 영인면 역리 780', total_budget: '49,233',
  supervisor_position: '4급', supervisor_name: '감독자', construction_start_date: '2025-01-16', construction_end_date: '2026-12-31', g2b_corp_nm: '안전건설(주)',
}
const judged = (extra = {}) => ({ judgement: '부적정', ...extra })
const data = {
  inspection_team: '3급 김점검, 4급 이점검',
  inspected_work: '굴착기 인양작업',
  excavators: [
    {
      id: 'e1', vehicle_no: '12가3456', items: {
        '1-1': judged({ finding: 'TBM 미실시', action: 'TBM 실시', before_photo_url: '/b1.jpg', after_photo_url: '/a1.jpg' }),
        '1-2': judged({ finding: 'PTW 미승인 <긴급>', action: '승인 요청', before_photo_url: '/b2.jpg', action_due_date: '2026-10-20' }),
        '1-3': judged({ finding: '자격 미확인' }),
        '1-4': judged({}),
        '2-1': { judgement: '적정' },
      },
    },
    {
      id: 'e2', vehicle_no: '34나5678', etc_text: '경사지 전도 위험', items: {
        '3-2': judged({ finding: '버킷 탑승', action: '탑승 금지 교육', after_photo_url: '/a3.jpg' }),
        '4-1': judged({ action_due_date: '2026-10-25' }),
      },
    },
  ],
  site_photo_urls: ['/site1.jpg', '/site2.jpg'],
}

const cellParas = (table, row, col) => {
  const cell = table.split('<hp:tc ').slice(1).find(c => c.includes(`<hp:cellAddr colAddr="${col}" rowAddr="${row}"/>`))
  assert.ok(cell, `셀 ${row},${col} 없음`)
  return cell.split('</hp:subList>')[0].split('<hp:p ').slice(1).map(p => [...p.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map(m => m[1]).join(''))
}
const tablesOf = xml => xml.split('<hp:tbl ').slice(1).map(t => '<hp:tbl ' + t)
const photoTables = xml => tablesOf(xml).filter(t => /rowCnt="7" colCnt="7"/.test(t))

async function build(input) {
  const bytes = await api.buildSpecial770ResultHwpx(input, template, checklist, { fetchImage })
  const buffer = Buffer.from(bytes)
  assert.equal(buffer.subarray(30, 38).toString(), 'mimetype', 'mimetype이 첫 항목이어야 한다')
  assert.equal(buffer.readUInt16LE(8), 0, 'mimetype은 비압축(STORE)이어야 한다')
  const zip = await JSZip.loadAsync(buffer)
  const read = name => zip.file(name).async('string')
  return { buffer, zip, section: await read('Contents/section0.xml'), header: await read('Contents/header.xml'), manifest: await read('Contents/content.hpf'), preview: await read('Preview/PrvText.txt') }
}

test('실제 사진 URL이 HTTP 오류이면 기본 fetch 경로에서 빈 문서 대신 복구 안내 오류를 반환한다', async t => {
  const requested = []
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(url)
    return new Response(JSON.stringify({ code: 'NoSuchKey', message: 'Object not found' }), { status: 400 })
  })
  await assert.rejects(api.buildSpecial770ResultHwpx({
    inspectionDate: '2026-10-04', project,
    data: { excavators: [], site_photo_urls: ['/deleted-site.jpg'] },
  }, template, checklist), /사진.*불러오지 못했습니다.*다시.*저장/s)
  assert.deepEqual(requested, ['/deleted-site.jpg'])
})

// 실제 컴포넌트를 변환해 이벤트를 실행하고, 저장 전 파일 삭제 부작용을 감시한다.
async function renderPhotoSlot({ editing = false, onChange }) {
  const removed = []
  const uploaded = []
  let stateIndex = 0
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useEffect: () => {},
    useState: () => [[false, true, editing][stateIndex++], () => {}],
  }
  const source = await readFile(new URL('../src/components/project/special-770/Special770PhotoSlot.tsx', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } })
  const deps = {
    react,
    'lucide-react': { Crop: 'Crop', MoreVertical: 'MoreVertical', Trash2: 'Trash2', Upload: 'Upload' },
    '@/components/ui/ImageEditor': { __esModule: true, default: 'ImageEditor' },
    './photo-storage': {
      uploadSpecial770Photo: async (...args) => { uploaded.push(args); return '/edited.jpg' },
      removeSpecial770Photo: async url => { removed.push(url) },
    },
  }
  const module = { exports: {} }
  vm.runInThisContext(`(function(module,exports,require){${outputText}\n})`)(module, module.exports, name => deps[name])
  const tree = module.exports.default({ projectId: 'p1', url: '/persisted.jpg', label: '현장사진', tag: 'site', onChange })
  const nodes = []
  const visit = node => {
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    for (const child of node.props?.children ?? []) Array.isArray(child) ? child.forEach(visit) : visit(child)
  }
  visit(tree)
  return { nodes, removed, uploaded }
}

test('사진 편집 후 폼을 취소해도 기존 저장 사진 파일을 삭제하지 않는다', async () => {
  const changes = []
  const slot = await renderPhotoSlot({ editing: true, onChange: url => changes.push(url) })
  await slot.nodes.find(node => node.type === 'ImageEditor').props.onSave(new Blob(['photo']))
  assert.deepEqual(changes, ['/edited.jpg'])
  assert.equal(slot.uploaded.length, 1)
  assert.deepEqual(slot.removed, [], '폼 저장 이전의 원본 파일 삭제는 취소 시 저장 URL을 깨뜨린다')
})

test('사진 삭제는 폼 값만 비우며 저장 사진 파일은 유지한다', async () => {
  const changes = []
  const slot = await renderPhotoSlot({ onChange: url => changes.push(url) })
  await slot.nodes.find(node => node.type === 'button' && node.props.children.includes(' 삭제')).props.onClick()
  await Promise.resolve()
  assert.deepEqual(changes, [null])
  assert.deepEqual(slot.removed, [])
})

test('지구명은 사업명에서 "지구"까지, 없으면 첫 단어를 쓴다', () => {
  assert.equal(api.districtName('점동지구 다목적 농촌용수 개발사업 토목공사'), '점동지구')
  assert.equal(api.districtName('채신언1지구 대구획경지정리사업'), '채신언1지구')
  assert.equal(api.districtName('단월면 기초생활거점 조성사업'), '단월면')
  assert.equal(api.districtName('단일사업명'), '단일사업명')
  assert.equal(api.districtName(''), '')
  assert.equal(api.districtName(null), '')
})

const LEFTOVERS = ['홍길동', '윤  혁', '(양식)', '지사→지역본부', '현장에서 사용중인', '조치 전, 조치 후 사진 필수', '현장점검사진 첨부', '※미조치', '00대', '’26.   .', '(사업명)']

test('지적이 있으면 예시값·안내문을 지우고 지적 수만큼 사진대지를 만든다', async () => {
  const out = await build({ inspectionDate: '2026-10-04', data, project })
  for (const [label, xml] of [['section', out.section], ['header', out.header], ['content.hpf', out.manifest]]) assertWellFormed(xml, label)
  for (const word of LEFTOVERS) {
    assert.ok(!out.section.includes(word), `본문에 '${word}'가 남았다`)
    assert.ok(!out.preview.includes(word), `미리보기에 '${word}'가 남았다`)
  }
  assert.ok(out.section.includes('<hp:t> ○ 점 검 반 : 3급 김점검, 4급 이점검</hp:t>'))
  assert.ok(out.section.includes('<hp:t> ○ 점검일시 : ’26. 10. 04.</hp:t>'))
  assert.ok(out.section.includes('<hp:t>2. 점검결과(굴착기 사용 대수: 2대)</hp:t>'))
  assert.ok(out.section.includes('<hp:t>건설현장 점검카드(시험지구)</hp:t>'), '제목에는 지구명만 쓴다')
  assert.ok(out.preview.includes('건설현장 점검카드(시험지구)'))
  assert.ok(out.section.includes(' 지사 및 사업단 특별점검 결과</hp:t>'))

  const tables = tablesOf(out.section)
  const info = tables.find(t => /rowCnt="3" colCnt="8"/.test(t))
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(c => cellParas(info, 2, c).join('|')),
    ['시험지구', '충남', '아산시', '49,233', '2025.|01.16.', '2026.|12.31.', '굴착기 인양작업', '안전건설(주)'])

  const result = tables.find(t => /rowCnt="12" colCnt="3"/.test(t))
  assert.deepEqual(cellParas(result, 1, 1), ['- [12가3456] TBM 미실시'])
  assert.deepEqual(cellParas(result, 1, 2), ['- TBM 실시'])
  assert.deepEqual(cellParas(result, 2, 1), ['- [12가3456] PTW 미승인 &lt;긴급&gt;'])
  assert.deepEqual(cellParas(result, 2, 2), ['- 승인 요청 (’26. 10. 20. 예정)'])
  // 사전조사 지적 4건 > 칸 3개 → 마지막 칸에 문단 2개로 합친다.
  assert.equal(cellParas(result, 3, 1).length, 2)
  assert.match(cellParas(result, 3, 1)[1], /^- \[12가3456\] 건설기계 법정 필수 검사/)
  assert.deepEqual(cellParas(result, 7, 1), ['- [34나5678] 버킷 탑승'])
  assert.deepEqual(cellParas(result, 10, 1), ['- [34나5678] 경사지 전도 위험'])
  assert.deepEqual(cellParas(result, 10, 2), [''])
  assert.deepEqual(cellParas(result, 4, 1), [''])
  assert.ok(!result.includes('charPrIDRef="60"'), '회색 안내문 글자 스타일이 남았다')
  assert.ok(!result.includes('charPrIDRef="57"'), '기울임 글자 스타일이 남았다')
  // 제목·현황표와 한 쪽에 유지하면서 아래 여백을 줄이도록 지적·조치 행 높이를 2500으로 맞춘다.
  const heights = [...result.matchAll(/rowAddr="(\d+)"\/><hp:cellSpan colSpan="\d+" rowSpan="(\d+)"\/><hp:cellSz width="\d+" height="(\d+)"/g)]
  for (const [, row, span, height] of heights) if (row !== '0') assert.equal(Number(height), 2500 * Number(span))
  assert.match(result, /<hp:sz width="47334" widthRelTo="ABSOLUTE" height="30495"/)

  const photos = photoTables(out.section)
  assert.equal(photos.length, 6, '지적 6건 = 사진대지 표 6개')
  const ids = photos.map(t => t.match(/<hp:tbl id="(\d+)"/)[1])
  assert.equal(new Set(ids).size, ids.length, '사진대지 표 id가 겹친다')
  assert.deepEqual(cellParas(photos[0], 1, 4), [' (조치 전) [12가3456] TBM 미실시'])
  assert.deepEqual(cellParas(photos[0], 5, 4), [' (조치 후) TBM 실시'])
  assert.deepEqual(cellParas(photos[1], 5, 4), [' (조치 후) 조치완료 예정일 ’26. 10. 20.'])
  assert.deepEqual(cellParas(photos[0], 0, 1), ['시험지구'])
  assert.deepEqual(cellParas(photos[0], 4, 1), ['시험지구'])
  assert.deepEqual(cellParas(photos[0], 0, 5), ['4급 감독자'])
  assert.deepEqual(cellParas(photos[0], 4, 6), ['4급 감독자'])
  assert.deepEqual(cellParas(photos[0], 1, 1), ['’26. 10. 04.'])
  assert.equal(cellParas(photos[0], 2, 0).length, 1, '사진 칸 안내문 둘째 문단이 남았다')
  // 사진대지 제목은 새 쪽에서 시작하고, 첫 사진표가 같은 쪽에 들어가도록 사진 칸을 2500씩 줄인다(모든 사진표 동일).
  const titleOpen = out.section.match(/<hp:p [^>]*pageBreak="1"[^>]*><hp:run charPrIDRef="\d+"><hp:t> &lt;지적사항 및 조치사항 사진대지&gt;<\/hp:t>/)
  assert.ok(titleOpen, '사진대지 제목이 새 쪽에서 시작하지 않는다')
  // 제목은 양식 문단 스타일(42, 양쪽 정렬)의 가운데 정렬 복제본(새 id)을 쓴다.
  const titleParaPr = titleOpen[0].match(/paraPrIDRef="(\d+)"/)[1]
  assert.notEqual(titleParaPr, '42', '사진대지 제목이 양식의 양쪽 정렬 스타일을 그대로 쓴다')
  const paraPr = out.header.match(new RegExp(`<hh:paraPr id="${titleParaPr}"[^>]*>[\\s\\S]*?</hh:paraPr>`))?.[0]
  assert.ok(paraPr, '사진대지 제목 문단 스타일이 header.xml에 없다')
  assert.match(paraPr, /<hh:align horizontal="CENTER"/)
  assert.match(paraPr, /<hh:lineSpacing type="PERCENT" value="180"/, '원본 줄 간격을 잃었다')
  assert.ok(!/<hc:right value="[1-9]/.test(paraPr), '오른쪽 여백이 남아 가운데에서 비켜난다')
  // 붙임2 점검표 스타일이 그 뒤에 덧붙으므로 itemCnt는 복제본 id보다 크기만 하면 된다.
  assert.ok(Number(out.header.match(/<hh:paraProperties itemCnt="(\d+)"/)[1]) > Number(titleParaPr))
  for (const table of photos) {
    assert.match(table, /<hp:sz width="47900" widthRelTo="ABSOLUTE" height="61535"/)
    assert.match(table, /rowAddr="2"\/><hp:cellSpan colSpan="7" rowSpan="1"\/><hp:cellSz width="47900" height="25198"/)
    assert.match(table, /rowAddr="6"\/><hp:cellSpan colSpan="7" rowSpan="1"\/><hp:cellSz width="47900" height="24925"/)
  }
  // 1600×1200 사진은 비율을 지켜 줄어든 칸(세로 24198) 안에 들어간다.
  const [, picW, picH] = photos[0].match(/<hp:pic [\s\S]*?<hp:sz width="(\d+)" widthRelTo="ABSOLUTE" height="(\d+)"/)
  assert.ok(Number(picH) <= 25198 - 1000)
  assert.ok(Math.abs(Number(picW) / Number(picH) - 4 / 3) < 0.01, '사진 비율이 유지되어야 한다')
  assert.ok(photos[0].includes('binaryItemIDRef="image1"') && photos[0].includes('binaryItemIDRef="image2"'))
  assert.ok(!photos[2].includes('<hp:pic '), '미등록 사진 칸은 비워야 한다')

  // 사진 4장(b1, a1, b2, a3) → BinData·manifest 일치
  const bin = Object.keys(out.zip.files).filter(n => n.startsWith('BinData/') && !out.zip.files[n].dir)
  assert.equal(bin.length, 4)
  for (const name of bin) assert.ok(out.manifest.includes(`href="${name}"`), `${name} manifest 누락`)
  const picIds = [...out.section.matchAll(/<hp:pic id="(\d+)"/g)].map(m => m[1])
  assert.equal(new Set(picIds).size, picIds.length, '그림 id가 겹친다')
  assert.ok(out.zip.file('Scripts/headerScripts.js'), 'Scripts/headerScripts.js 보존')
  assert.ok(out.manifest.includes('href="Scripts/headerScripts.js"'))
  assert.ok(!out.section.includes('<hp:linesegarray>'), '낡은 줄 배치 정보가 남았다')
  if (process.env.SPECIAL_770_SAMPLE_DIR) await writeFile(`${process.env.SPECIAL_770_SAMPLE_DIR}/special770_findings.hwpx`, out.buffer)
})

test('지적이 없으면 현장점검사진으로 사진대지 1개를 채운다', async () => {
  const clean = { ...data, excavators: [{ id: 'e1', vehicle_no: '12가3456', items: { '1-1': { judgement: '적정' } } }] }
  const out = await build({ inspectionDate: '2026-10-04', data: clean, project: { project_name: '빈값현장' } })
  assertWellFormed(out.section, 'section')
  for (const word of LEFTOVERS) assert.ok(!out.section.includes(word), `본문에 '${word}'가 남았다`)
  assert.ok(out.section.includes('<hp:t>2. 점검결과(굴착기 사용 대수: 1대)</hp:t>'))
  const photos = photoTables(out.section)
  assert.equal(photos.length, 1)
  assert.deepEqual(cellParas(photos[0], 1, 4), [' 현장점검 사진'])
  assert.deepEqual(cellParas(photos[0], 5, 4), [' 현장점검 사진'])
  assert.ok(photos[0].includes('binaryItemIDRef="image1"') && photos[0].includes('binaryItemIDRef="image2"'))
  // 없는 값은 빈칸
  const info = tablesOf(out.section).find(t => /rowCnt="3" colCnt="8"/.test(t))
  assert.deepEqual([1, 2, 3, 4, 7].map(c => cellParas(info, 2, c)[0]), ['', '', '', '', ''])
  assert.deepEqual(cellParas(photos[0], 0, 5), [''])
  if (process.env.SPECIAL_770_SAMPLE_DIR) await writeFile(`${process.env.SPECIAL_770_SAMPLE_DIR}/special770_clean.hwpx`, out.buffer)
})

/** header 목록별 정의된 id 집합. itemCnt가 실제 항목 수와 같은지도 본다. */
function headerIds(header) {
  const lists = { borderFills: 'borderFill', charProperties: 'charPr', tabProperties: 'tabPr', numberings: 'numbering', paraProperties: 'paraPr', styles: 'style' }
  const ids = {}
  for (const [list, item] of Object.entries(lists)) {
    const block = header.match(new RegExp(String.raw`<hh:${list} itemCnt="(\d+)">([\s\S]*?)</hh:${list}>`))
    assert.ok(block, `${list} 목록 없음`)
    const found = [...block[2].matchAll(new RegExp(String.raw`<hh:${item} id="(\d+)"`, 'g'))].map(m => m[1])
    assert.equal(found.length, Number(block[1]), `${list} itemCnt와 항목 수가 다르다`)
    assert.equal(new Set(found).size, found.length, `${list} id가 겹친다`)
    ids[item] = new Set(found)
  }
  return ids
}

const refsOf = (xml, attr) => [...xml.matchAll(new RegExp(String.raw`\b${attr}="(\d+)"`, 'g'))].map(m => m[1]).filter(id => id !== '4294967295')

test('붙임2 점검표가 굴착기마다 1쪽씩 붙임3 앞에 붙고, 모든 스타일 참조가 header 안에 있다', async () => {
  const out = await build({ inspectionDate: '2026-10-04', data, project })
  for (const [label, xml] of [['section', out.section], ['header', out.header]]) assertWellFormed(xml, label)

  // 굴착기 2대 → 점검표 2장, 붙임3보다 앞
  const vehicleLines = [...out.section.matchAll(/<hp:t>건설기계 등록번호\(차량번호\): ([^<]*)<\/hp:t>/g)].map(m => m[1])
  assert.deepEqual(vehicleLines, ['12가3456', '34나5678'])
  assert.equal([...out.section.matchAll(/<hp:t>현장명: 시험지구 수리시설개보수사업<\/hp:t>/g)].length, 2, '현장명은 사업명 전체')
  assert.ok(out.section.indexOf('차량번호): 34나5678') < out.section.indexOf('특별점검 결과</hp:t>'), '붙임2가 붙임3보다 앞이어야 한다')
  assert.ok(!out.section.includes('현장 의견에 따라'), '기타 행 회색 안내문이 남았다')
  assert.ok(out.section.includes('<hp:t>경사지 전도 위험</hp:t>'))

  // 쪽 설정은 문서 첫 문단에 한 번만, 붙임2 둘째 장과 붙임3 첫 문단은 새 쪽
  assert.equal(out.section.match(/<hp:secPr\b/g).length, 1)
  assert.ok(out.section.indexOf('<hp:secPr') < out.section.indexOf('현장명:'))
  assert.match(out.section, /margin header="3600" footer="3600" gutter="0" left="5669" right="5669" top="3600" bottom="3600"/)
  const tables = tablesOf(out.section)
  const checklists = tables.filter(t => /rowCnt="17" colCnt="5"/.test(t))
  assert.equal(checklists.length, 2)

  // ■ 위치 = 판정 열(적정 2, 부적정 3, 해당없음 4)
  const marks = table => {
    const result = {}
    for (const cell of table.split('<hp:tc ').slice(1)) {
      const addr = cell.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/)
      if (addr && cell.split('</hp:subList>')[0].includes('<hp:t>■</hp:t>')) (result[addr[2]] ??= []).push(Number(addr[1]))
    }
    return result
  }
  assert.deepEqual(marks(checklists[0]), { 1: [3], 2: [3], 3: [3], 4: [3], 5: [2] })
  assert.deepEqual(marks(checklists[1]), { 13: [3], 16: [3] })

  // 표 id는 문서 전체에서 유일하다.
  const tableIds = [...out.section.matchAll(/<hp:tbl id="(\d+)"/g)].map(m => m[1])
  assert.equal(new Set(tableIds).size, tableIds.length, '표 id가 겹친다')

  // 본문·header의 모든 스타일 참조가 정의된 id를 가리킨다.
  const ids = headerIds(out.header)
  for (const [attr, kind] of [['charPrIDRef', 'charPr'], ['paraPrIDRef', 'paraPr'], ['borderFillIDRef', 'borderFill'], ['styleIDRef', 'style']]) {
    for (const id of refsOf(out.section.replace(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/, ''), attr)) assert.ok(ids[kind].has(id), `본문 ${attr}=${id}가 header에 없다`)
  }
  for (const id of refsOf(out.header, 'borderFillIDRef')) assert.ok(ids.borderFill.has(id), `header borderFillIDRef=${id}`)
  for (const id of refsOf(out.header, 'tabPrIDRef')) assert.ok(ids.tabPr.has(id), `header tabPrIDRef=${id}`)
  for (const id of refsOf(out.header, 'charPrIDRef')) assert.ok(ids.charPr.has(id), `header charPrIDRef=${id}`)
  for (const id of refsOf(out.header, 'paraPrIDRef')) assert.ok(ids.paraPr.has(id), `header paraPrIDRef=${id}`)
  for (const [, id] of out.header.matchAll(/<hh:heading type="NUMBER" idRef="(\d+)"/g)) assert.ok(ids.numbering.has(id), `번호 idRef=${id}`)
  for (const lang of ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']) {
    const count = Number(out.header.match(new RegExp(String.raw`<hh:fontface lang="${lang}" fontCnt="(\d+)"`))[1])
    for (const [, id] of out.header.matchAll(new RegExp(String.raw`<hh:fontRef [^>]*\b${lang.toLowerCase()}="(\d+)"`, 'g'))) assert.ok(Number(id) < count, `${lang} 글꼴 ${id} ≥ ${count}`)
  }
  // 굴착기 2대째 점검표는 번호(1. 2.)를 처음부터 다시 센다(번호 모양이 서로 다르다).
  const numberedParaPrs = [...out.section.matchAll(/<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*><hp:run charPrIDRef="\d+"><hp:t>현장명:/g)].map(m => m[1])
  assert.equal(new Set(numberedParaPrs).size, 2)
})

test('굴착기가 없으면 점검표 없이 붙임3만 만든다', async () => {
  const out = await build({ inspectionDate: '2026-10-04', data: { ...data, excavators: [] }, project })
  assert.ok(!out.section.includes('현장명:'))
  assert.equal(out.section.match(/<hp:secPr\b/g).length, 1)
  assert.ok(out.section.includes('<hp:t>2. 점검결과(굴착기 사용 대수: 0대)</hp:t>'))
})

test('실제 지적이 비어 있으면 오래된 조치와 날짜가 결과표 조치 칸에 새지 않는다', async () => {
  const stale = { inspection_team: '', excavators: [{ id: 'e', vehicle_no: '', items: {
    '1-1': judged({ finding: '  ', action: '오래된 조치', action_due_date: '2030-01-01' }),
    '1-2': judged({ action_due_date: '2030-01-02' }),
  } }] }
  const out = await build({ inspectionDate: '2026-10-05', data: stale, project })
  const result = tablesOf(out.section).find(table => /rowCnt="12" colCnt="3"/.test(table))
  assert.deepEqual(cellParas(result, 1, 2), [''])
  assert.deepEqual(cellParas(result, 2, 2), [''])
  assert.ok(!result.includes('오래된 조치'))
  assert.ok(!result.includes('2030'))
})

test('일괄 zip 안의 파일명은 지사명_점검일자_지구명.hwpx다', () => {
  const name = api.special770BulkResultFileName({ inspectionDate: '2026-10-12', data, project: { ...project, managing_branch: '여주·이천지사' } })
  assert.equal(name, '여주·이천지사_2026-10-12_시험지구.hwpx')
  // 파일명에 못 쓰는 문자는 '_'로 바꾼다.
  assert.equal(api.special770BulkResultFileName({ inspectionDate: '2026-10-12', data, project: { project_name: 'A/B 현장', managing_branch: '' } }), '지사_2026-10-12_A_B.hwpx')
})
