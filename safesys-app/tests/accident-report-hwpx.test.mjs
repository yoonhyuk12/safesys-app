// 사용자 확정 양식에서 만든 사고발생보고 HWPX의 양식 정화·값 치환·쪽 분할·사진 배치를 메모리 안에서 검증한다.
import assert from 'node:assert/strict'
import { access, readFile, mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import JSZip from 'jszip'
import { load } from 'cheerio'
import ts from 'typescript'

const SOURCE_URL = new URL('../public/사고/사고보고_평택지사(20260610).hwpx', import.meta.url)

async function sourceExists() {
  try {
    await access(SOURCE_URL)
    return true
  } catch {
    return false
  }
}

await run()

async function run() {
  const templateBytes = await readFile(new URL('../public/사고발생보고_양식.hwpx', import.meta.url))
  const templateZip = await JSZip.loadAsync(templateBytes)
  const templateSection = await templateZip.file('Contents/section0.xml').async('string')
  const templateHpf = await templateZip.file('Contents/content.hpf').async('string')
  let originalSection = templateSection
  let originalHeader = await templateZip.file('Contents/header.xml').async('uint8array')
  const hasSource = await sourceExists()
  if (hasSource) {
    const { sanitizeAccidentReportTemplate } = await import('../scripts/accident-report-template.mjs')
    const originalBytes = await readFile(SOURCE_URL)
    const originalZip = await JSZip.loadAsync(originalBytes)
    originalSection = await originalZip.file('Contents/section0.xml').async('string')
    originalHeader = await originalZip.file('Contents/header.xml').async('uint8array')
    const regenerated = await JSZip.loadAsync(await sanitizeAccidentReportTemplate(originalBytes))
    assert.equal(await regenerated.file('Contents/section0.xml').async('string'), templateSection, '부모가 최신 스크립트로 정제 양식을 다시 생성해야 한다')
  }

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

  const accidentTypes = await transpile('../src/lib/accident-analysis-types.ts')
  const accidentReport = await transpile('../src/lib/accident-report.ts')
  const accidentContent = await transpile('../src/lib/accident-report-content.ts')
  const accidentFormat = await transpile('../src/lib/accident-report-format.ts', {
    '@/lib/accident-analysis-types': accidentTypes,
  })
  const xmlHelpers = await transpile('../src/lib/hwpx/accident-report-xml.ts')
  const layoutHelpers = await transpile('../src/lib/hwpx/accident-report-layout.ts', { './accident-report-xml': xmlHelpers })
  const hwpxExport = await transpile('../src/lib/hwpx/accident-report-hwpx-export.ts', {
    jszip: JSZip,
    './accident-report-xml': xmlHelpers,
    './accident-report-layout': layoutHelpers,
    '@/lib/accident-analysis-types': accidentTypes,
    '@/lib/accident-report': accidentReport,
    '@/lib/accident-report-content': accidentContent,
    '@/lib/accident-report-format': accidentFormat,
  })
  const { buildAccidentReportHwpx, ACCIDENT_REPORT_TEMPLATE_PATH } = hwpxExport
  const TEMPLATE_URL = encodeURI(ACCIDENT_REPORT_TEMPLATE_PATH)

  // ── 브라우저 스텁 ──
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input)
    if (url === TEMPLATE_URL) return new Response(Buffer.from(templateBytes), { status: 200 })
    return realFetch(input, init)
  }

  // 그림 크기 측정은 objectURL → blob → 바이트 길이로 되짚어 픽스처별 원본 크기를 흉내낸다.
  const blobsByUrl = new Map()
  let urlSeq = 0
  URL.createObjectURL = blob => {
    const url = `blob:accident${++urlSeq}`
    blobsByUrl.set(url, blob)
    return url
  }
  URL.revokeObjectURL = url => { blobsByUrl.delete(url) }

  // canvas는 getContext가 null이라 정규화가 원본 바이트로 폴백한다.
  globalThis.document = {
    createElement: tag => (tag === 'canvas'
      ? { width: 0, height: 0, getContext: () => null, toBlob: cb => cb(null) }
      : { style: {}, click() {} }),
    body: { appendChild() {}, removeChild() {} },
  }

  globalThis.Image = class {
    naturalWidth = 0
    naturalHeight = 0
    set src(url) {
      const blob = blobsByUrl.get(url)
      const dims = globalThis.__imageDims.get(blob?.size ?? -1) ?? { width: 0, height: 0 }
      this.naturalWidth = dims.width
      this.naturalHeight = dims.height
      this.onload?.()
    }
  }

  const landscapeBytes = await readFile(new URL('./fixtures/accident-report-photo-landscape.jpg', import.meta.url))
  const portraitBytes = await readFile(new URL('./fixtures/accident-report-photo-portrait.jpg', import.meta.url))
  globalThis.__imageDims = new Map([
    [landscapeBytes.length, { width: 1200, height: 900 }],
    [portraitBytes.length, { width: 900, height: 1200 }],
  ])
  const landscapeUrl = `data:image/jpeg;base64,${landscapeBytes.toString('base64')}`
  const portraitUrl = `data:image/jpeg;base64,${portraitBytes.toString('base64')}`

  // ── 합성 데이터 (실제 인적사항 금지) ──

  const PROJECT_NAME = '가상지구 소규모 정비공사'

  const baseAccident = {
    id: '00000000-0000-4000-8000-000000000001',
    project_id: null,
    external_project_name: PROJECT_NAME,
    external_managing_hq: '가상본부',
    external_managing_branch: '가상지사',
    accident_at: '2026-09-15T00:00:00+09:00',
    severity: 'lost_time',
    accident_type: '넘어짐',
    location: '가상지구 １공구 가설통로 입구',
    work_description: '가설통로 자재 운반 작업',
    description: '자재를 옮기던 중 발판 끝이 들리면서 미끄러져 넘어졌다.',
    cause: '발판 고정 불량과 통로 정리정돈 미흡',
    prevention_action: '발판 고정 상태 일일 점검\n통로 정리정돈 기준 게시',
    injured_count: 1,
    fatal_count: 0,
    lost_workdays: 5,
    workers_comp_claim: 'applied',
    report_details: null,
    created_by: null,
    created_at: '2026-09-15T01:00:00+09:00',
    updated_at: '2026-09-15T01:00:00+09:00',
  }

  const baseDetails = {
    reportTitle: '가상지구 소규모 정비공사 사고 발생 보고',
    reportDate: '2026-09-15',
    reporterName: '홍길동',
    reporterPosition: '안전관리자',
    reporterPhone: '02-000-0000',
    summary: '가상지구 정비공사 현장에서 근로자 1명이 넘어져 휴업 재해가 발생함',
    accidentTime: '14:20',
    victimDetails: '가상인 / 남 / 40대 / 보통인부',
    expectedTreatmentDays: '14',
    damageDetails: '오른쪽 발목 염좌로 2주 진단',
    propertyDamage: '해당없음',
    responsibility: '협력업체 안전조치 미흡',
    noNotificationReason: '경상으로 관계기관 신고 대상 아님',
    compensationDetails: '치료비 전액 협력업체 부담 협의',
    actionDetails: '작업 중지 후 통로 전면 재설치',
    otherNotes: '언론보도 없음 (문의 & 민원 없음)',
    relatedContacts: '가상본부 안전팀 02-000-0001\n가상지사 공사팀 02-000-0002',
    notifications: ['emergency119'],
    victimActions: ['hospital'],
    photos: [],
  }

  const longParagraph = '가상지구 정비공사 사고 경위를 시간 순서로 상세히 기술한 문장이다 '
    .repeat(200)
    .slice(0, 4000)
  const longPrevention = Array.from({ length: 40 }, (_, i) => `향후 추진계획 ${i + 1}번 항목으로 재발방지 조치를 이행한다`).join('\n')
  const longVictims = Array.from({ length: 30 }, (_, i) => `피해자 ${i + 1} / 가상인${i + 1} / 남 / 30대 / 보통인부`).join('\n')
  const longActions = Array.from({ length: 60 }, (_, i) => `조치 ${i + 1}단계 — 현장 점검과 교육을 순차 시행한다`).join('\n')
  const longSummary = Array.from({ length: 5 }, (_, i) => `보고 요지 ${i + 1}째 줄로 사고 개요를 나눠 적는다`).join('\n')
  const longContacts = Array.from({ length: 6 }, (_, i) => `가상기관 ${i + 1} 02-000-00${10 + i}`).join('\n')

  const photo = (dataUrl, caption) => ({ dataUrl, caption })

  const cases = {
    nested: {
      accident: { ...baseAccident, report_details: { ...baseDetails,
        summary: '요'.repeat(3997) + '요지끝', relatedContacts: '연'.repeat(3996) + '연락처끝',
        photos: [photo(landscapeUrl, '캡'.repeat(196) + '설명하나'), photo(portraitUrl, '션'.repeat(196) + '설명둘끝')],
      } }, pics: 2, checked: 2, minOuterTables: 5,
    },
    heading: {
      accident: { ...baseAccident, report_details: { ...baseDetails,
        reportTitle: '제'.repeat(197) + '제목끝', reporterName: '성'.repeat(197) + '성명끝',
        reporterPosition: '직'.repeat(197) + '직책끝', reporterPhone: '전'.repeat(197) + '전화끝',
      } }, pics: 0, checked: 2, minOuterTables: 2,
    },
    // 바깥 표 수 = 본문 쪽 수. 양식 본문 셀(62437)은 원본 내용(실측 약 61800)에 딱 맞게 잡혀 있어
    // 값이 비거나 짧은 보고서는 원본처럼 한 쪽, 전 필드를 채운 one/two/three는 원본보다 몇 줄 길어 두 쪽이 된다.
    empty: { accident: { ...baseAccident, report_details: null }, pics: 0, checked: 0, outerTables: 1 },
    one: {
      accident: {
        ...baseAccident,
        report_details: { ...baseDetails, photos: [photo(landscapeUrl, '사고 발생 지점 가설통로 전경')] },
      },
      pics: 1,
      checked: 2,
      outerTables: 2,
    },
    two: {
      accident: {
        ...baseAccident,
        report_details: {
          ...baseDetails,
          notifications: ['emergency119', 'police'],
          victimActions: ['hospital'],
          photos: [photo(landscapeUrl, '사고 발생 지점 가설통로 전경'), photo(portraitUrl, '조치 후 재설치한 통로 발판')],
        },
      },
      pics: 2,
      checked: 3,
      outerTables: 2,
    },
    three: {
      accident: {
        ...baseAccident,
        report_details: {
          ...baseDetails,
          photos: [
            photo(landscapeUrl, '첫째 사진 설명'),
            photo(portraitUrl, '둘째 사진 설명'),
            photo(landscapeUrl, '셋째 사진 설명 버려짐'),
          ],
        },
      },
      pics: 2,
      checked: 2,
      outerTables: 2,
      droppedCaptions: ['셋째 사진 설명 버려짐'],
    },
    long: {
      accident: {
        ...baseAccident,
        description: longParagraph,
        prevention_action: longPrevention,
        report_details: {
          ...baseDetails,
          summary: longSummary,
          relatedContacts: longContacts,
          victimDetails: longVictims,
          actionDetails: longActions,
          photos: [photo(landscapeUrl, '장문 표본 사진 하나'), photo(portraitUrl, '장문 표본 사진 둘')],
        },
      },
      pics: 2,
      checked: 2,
      minOuterTables: 3,
    },
  }

  // ── 케이스별 패키지 조립 ──

  const built = {}
  for (const [name, spec] of Object.entries(cases)) {
    const blob = await buildAccidentReportHwpx(spec.accident, PROJECT_NAME)
    const buffer = Buffer.from(await blob.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    built[name] = {
      ...spec,
      blob,
      buffer,
      zip,
      section: await zip.file('Contents/section0.xml').async('string'),
      hpf: await zip.file('Contents/content.hpf').async('string'),
    }
    built[name].$ = load(built[name].section, { xml: true })
  }

  // ── 공통 도우미 ──

  const TOKENS = [
    '{{TITLE}}', '{{REPORT_DATE}}', '{{REPORTER}}', '{{REPORTER_PHONE}}', '{{SUMMARY}}',
    '{{DISTRICT}}', '{{ACCIDENT_DATETIME}}', '{{LOCATION}}', '{{CASUALTIES}}', '{{VICTIM_DETAILS}}', '{{PROPERTY_DAMAGE}}',
    '{{ACCIDENT_DETAILS}}', '{{NOTIFY_119}}', '{{NOTIFY_POLICE}}', '{{NOTIFY_LABOR}}', '{{NOTIFY_FAMILY}}',
    '{{NO_NOTIFICATION_REASON}}', '{{ACT_HOSPITAL}}', '{{ACT_FUNERAL}}', '{{ACT_HOME}}',
    '{{COMPENSATION}}', '{{COMPENSATION_MORE}}', '{{ACTION_DETAILS}}', '{{OTHER_NOTES}}', '{{CONTACTS}}',
    '{{PHOTO_TITLE}}', '{{PHOTO_1}}', '{{PHOTO_2}}', '{{CAPTION_1}}', '{{CAPTION_2}}',
  ]
  const PHONE_PATTERN = /\d{2,3}-\d{3,4}-\d{4}/
  const CHECKED_MARK = '\uF0FE'
  const UNCHECKED_MARK = '\uF06F'
  // 양식에 남아 있는 안내 문구 '( 표시)' 두 곳이 체크 기호를 하나씩 쓴다.
  const LABEL_MARKS = 2
  const CHECK_SLOTS = 7

  const countOf = (text, needle) => text.split(needle).length - 1
  const compact = text => text.replace(/\s+/g, '')

  function flatText(spec) {
    return spec.$('hp\\:t').toArray().map(element => spec.$(element).text()).join('\n')
  }

  function sequence(xml, pattern) {
    return [...xml.matchAll(pattern)].map(m => m[0]).join('|')
  }

  const CELL_SZ = /<hp:cellSz width="\d+" height="\d+"\/>/g
  const CELL_ADDR = /<hp:cellAddr colAddr="\d+" rowAddr="\d+"\/>/g
  const CELL_SPAN = /<hp:cellSpan colSpan="\d+" rowSpan="\d+"\/>/g

  test('기존 저장 데이터의 중복은 재출력에서만 줄고 고유 내용과 원본은 보존된다', async () => {
    const accident = {
      ...baseAccident,
      work_description: '합성작업유일문구',
      cause: '합성원인유일문구',
      description: '합성경위유일문구\n작업내용: 합성작업유일문구\n사고원인: 합성원인유일문구\n피해현황: 별도검사유일문구',
      report_details: {
        ...baseDetails,
        victimDetails: '합성피해자유일문구',
        damageDetails: '합성피해자유일문구\n합성부상유일문구',
        noNotificationReason: '합성사유유일문구',
        actionDetails: '합성조치유일문구\n미신고 사유: 합성사유유일문구',
      },
    }
    const snapshot = structuredClone(accident)
    const blob = await buildAccidentReportHwpx(accident, PROJECT_NAME)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const $ = load(await zip.file('Contents/section0.xml').async('string'), { xml: true })
    const text = $('hp\\:t').toArray().map(element => $(element).text()).join('')
    for (const marker of ['합성작업유일문구', '합성원인유일문구', '합성경위유일문구', '별도검사유일문구', '합성피해자유일문구', '합성부상유일문구', '합성사유유일문구', '합성조치유일문구']) {
      assert.equal(countOf(text, marker), 1, marker)
    }
    assert.deepEqual(accident, snapshot)
  })

  test('요양 예상 일수는 휴업과 별도로 피해자 근처에 보존되고 빈값을 0으로 만들지 않는다', async () => {
    let emptySection
    for (const days of [undefined, '', '0', '14', '9007199254740991']) {
      const report_details = { ...baseDetails, expectedTreatmentDays: days }
      const blob = await buildAccidentReportHwpx({ ...baseAccident, report_details }, PROJECT_NAME)
      const zip = await JSZip.loadAsync(await blob.arrayBuffer())
      const section = await zip.file('Contents/section0.xml').async('string')
      const $ = load(section, { xml: true })
      const text = $('hp\\:t').toArray().map(el => $(el).text()).join('\n')
      assert.match(text, /휴업 5일/)
      if (days === undefined || days === '') {
        assert.doesNotMatch(text, /산재요양 예상/)
      } else {
        assert.match(text, new RegExp(`가상인 / 남 / 40대 / 보통인부[\\s\\S]*산재요양 예상 ${days}일`))
      }
      if (days === undefined) emptySection = section
      assert.equal(sequence(section, CELL_ADDR), sequence(emptySection, CELL_ADDR))
      assert.equal(sequence(section, CELL_SPAN), sequence(emptySection, CELL_SPAN))
      assert.equal(sequence(section, /<hp:cellSz width="\d+"/g), sequence(emptySection, /<hp:cellSz width="\d+"/g))
      assert.deepEqual(await zip.file('Contents/header.xml').async('uint8array'), originalHeader)
    }
  })
  const originalWidths = new Set([...originalSection.matchAll(/<hp:cellSz width="(\d+)"/g)].map(m => m[1]))

  function firstEntryIsStoredMimetype(buffer) {
    assert.equal(buffer.readUInt32LE(0), 0x04034b50, '첫 항목이 로컬 파일 헤더가 아니다')
    assert.equal(buffer.readUInt16LE(8), 0, 'mimetype은 STORE(비압축)여야 한다')
    const nameLength = buffer.readUInt16LE(26)
    const extraLength = buffer.readUInt16LE(28)
    assert.equal(buffer.subarray(30, 30 + nameLength).toString('utf8'), 'mimetype')
    const start = 30 + nameLength + extraLength
    assert.equal(buffer.subarray(start, start + 19).toString('utf8'), 'application/hwp+zip')
  }

  /** 사진·이름을 뺀 입력 문자열 필드의 줄 목록. 보고일은 "2026. 09. 15.(화)"로 바뀌므로 제외한다. */
  function expectedTextLines(spec) {
    const accident = spec.accident
    const details = accident.report_details
    const values = [
      accident.accident_type,
      accident.location,
      accident.work_description,
      accident.description,
      accident.cause,
      accident.prevention_action,
    ]
    if (details) {
      for (const key of accidentReport.ACCIDENT_REPORT_TEXT_KEYS) {
        if (key === 'reportDate') continue
        values.push(details[key])
      }
      const dropped = spec.droppedCaptions ?? []
      for (const item of details.photos) {
        if (!dropped.includes(item.caption)) values.push(item.caption)
      }
    }
    return values.flatMap(value => String(value ?? '').split('\n')).filter(line => line.trim() !== '')
  }

  // ── 0. 양식 정화 검증 ──

  test('0. 양식에는 자리표시자만 남고 개인정보·그림은 사라진다', async () => {
    for (const token of TOKENS) {
      assert.equal(countOf(templateSection, token), 1, `${token}가 정확히 한 번 나오지 않는다`)
    }
    assert.equal(countOf(templateSection, '<hp:pic'), 0, '양식에 그림이 남았다')
    assert.equal(countOf(templateSection, '<hp:ellipse'), 0, '양식에 주석 도형이 남았다')
    assert.equal(countOf(templateSection, 'BinData/'), 0, '양식에 이미지 참조가 남았다')
    assert.equal(countOf(templateHpf, 'BinData/'), 0, 'content.hpf에 이미지 항목이 남았다')
    assert.equal(countOf(templateSection, 'pageBreak="CELL"'), 0, 'pageBreak="CELL"이 남았다')
    assert.ok(!templateZip.file('Preview/PrvImage.png'), '미리보기 그림이 남았다')

    for (const [text, label] of [[templateSection, 'section0'], [templateHpf, 'content.hpf']]) {
      assert.ok(!PHONE_PATTERN.test(text), `${label}에 전화번호가 남았다`)
    }
    const prvText = await templateZip.file('Preview/PrvText.txt').async('string')
    assert.equal(prvText, '사고발생보고')

    firstEntryIsStoredMimetype(Buffer.from(templateBytes))
  })

  test('원본이 있을 때 정제 양식의 격자·헤더를 원본과 대조한다', { skip: !hasSource }, async () => {
    assert.equal(countOf(templateSection, '<hp:tbl '), countOf(originalSection, '<hp:tbl '), '표 개수가 달라졌다')
    assert.equal(sequence(templateSection, CELL_SZ), sequence(originalSection, CELL_SZ), '셀 크기가 달라졌다')
    assert.equal(sequence(templateSection, CELL_ADDR), sequence(originalSection, CELL_ADDR), '셀 주소가 달라졌다')
    assert.equal(sequence(templateSection, CELL_SPAN), sequence(originalSection, CELL_SPAN), '셀 병합이 달라졌다')

    const templateHeader = await templateZip.file('Contents/header.xml').async('uint8array')
    assert.equal(Buffer.compare(Buffer.from(templateHeader), Buffer.from(originalHeader)), 0, 'header.xml이 달라졌다')
  })

  // ── 케이스별 검증 ──

  for (const [name, spec] of Object.entries(built)) {
    test(`${name}: 1. mimetype이 비압축으로 zip 첫 항목에 들어간다`, () => {
      firstEntryIsStoredMimetype(spec.buffer)
      assert.equal(spec.blob.type, 'application/hwp+zip')
    })

    test(`${name}: 2. 그림·표 참조가 서로 어긋나지 않는다`, () => {
      const $ = spec.$
      const pictures = $('hp\\:pic').toArray()
      assert.equal(pictures.length, spec.pics, '사진 수가 기대와 다르다')

      const childTags = [
        'hp\\:renderingInfo', 'hp\\:imgRect', 'hp\\:imgClip', 'hp\\:inMargin',
        'hp\\:imgDim', 'hc\\:img', 'hp\\:effects', 'hp\\:sz', 'hp\\:pos',
        'hp\\:outMargin', 'hp\\:shapeComment',
      ]
      for (const element of pictures) {
        const picture = $(element)
        for (const tag of childTags) {
          assert.equal(picture.children(tag).length, 1, `hp:pic에 ${tag}가 없다`)
        }
        const rect = picture.children('hp\\:imgRect')
        for (const point of ['hc\\:pt0', 'hc\\:pt1', 'hc\\:pt2', 'hc\\:pt3']) {
          assert.equal(rect.children(point).length, 1, `hp:imgRect에 ${point}가 없다`)
        }
        const reference = picture.children('hc\\:img').attr('binaryItemIDRef')
        assert.ok(reference, 'binaryItemIDRef가 비었다')
        const item = new RegExp(`<opf:item id="${reference}" href="(BinData/[^"]+)"`).exec(spec.hpf)
        assert.ok(item, `content.hpf에 ${reference} 항목이 없다`)
        assert.ok(spec.zip.file(item[1]), `${item[1]} 파일이 없다`)
      }

      const tables = $('hp\\:tbl').toArray()
      const ids = tables.map(table => $(table).attr('id'))
      assert.equal(new Set(ids).size, ids.length, 'hp:tbl id가 중복됐다')
      for (const width of [...spec.section.matchAll(/<hp:cellSz width="(\d+)"/g)].map(m => m[1])) {
        assert.ok(originalWidths.has(width), `양식에 없던 셀 폭 ${width}이 생겼다`)
      }
    })

    test(`${name}: 3. 입력 문자열이 편집 가능한 텍스트로 남는다`, () => {
      const flat = flatText(spec)
      const squeezed = compact(flat.replace(/〈 보 고 요 지 〉|<유관기관 연락처>/g, ''))
      assert.equal(countOf(spec.section, '{{'), 0, '치환되지 않은 자리표시자가 남았다')
      for (const line of expectedTextLines(spec)) {
        // 장문은 쪽 경계에서 잘리므로 줄 단위 그대로 남지 않는다. 조각을 이어 붙인 결과로 본다.
        const found = flat.includes(line) || squeezed.includes(compact(line))
        assert.ok(found, `본문에서 사라진 줄: ${line.slice(0, 40)}`)
      }
      for (const caption of spec.droppedCaptions ?? []) {
        assert.ok(!squeezed.includes(compact(caption)), '한도를 넘은 사진 설명이 남았다')
      }
      if (name === 'long') {
        assert.ok(squeezed.includes(compact(longParagraph)), '잘린 장문 조각을 이어 붙여도 원문이 복원되지 않는다')
        assert.ok(!flat.includes(longParagraph), '장문이 한 문단에 그대로 남아 잘림 검증이 무의미하다')
      }
      assert.equal(countOf(flat, CHECKED_MARK), LABEL_MARKS + spec.checked, '체크 표시 수가 다르다')
      assert.equal(countOf(flat, UNCHECKED_MARK), CHECK_SLOTS - spec.checked, '빈 체크칸 수가 다르다')
    })

    test(`${name}: 4. 사진대지 두 칸과 참고1 제목은 사진 수와 상관없이 남는다`, () => {
      const flat = flatText(spec)
      assert.equal(countOf(flat, '사진설명'), 2, '사진설명 칸이 두 개가 아니다')
      assert.ok(flat.includes('사고 발생 현장 사진'), '참고1 제목이 사라졌다')
    })

    test(`${name}: 5. 바깥 표가 쪽 수만큼 만들어진다`, () => {
      const $ = spec.$
      const outer = $('hp\\:tbl').toArray()
        .filter(table => Number($(table).children('hp\\:sz').attr('width')) === 47630)
      if (spec.outerTables) assert.equal(outer.length, spec.outerTables, '바깥 표 수가 기대와 다르다')
      if (spec.minOuterTables) assert.ok(outer.length >= spec.minOuterTables, '장문이 여러 쪽으로 나뉘지 않았다')
      assert.equal(outer.filter(table => $(table).attr('rowCnt') === '2').length, 1, '보고자 마지막 행과 본문이 만나는 표는 하나여야 한다')
      assert.ok(outer.every(table => ['1', '2'].includes($(table).attr('rowCnt'))))
    })
  }

  test('6. empty 케이스는 대시로 비움을 표시하고 전화번호를 만들지 않는다', () => {
    const flat = flatText(built.empty)
    assert.ok(flat.includes('-'), '빈 항목 대시가 없다')
    assert.equal(built.empty.$('hp\\:pic').length, 0)
    assert.ok(!PHONE_PATTERN.test(flat), '보고서에 없는 전화번호가 새어 나왔다')
  })

  test('7. 사진은 원본 비율을 유지한 채 사진 칸 안에 들어간다', () => {
    const $ = built.two.$
    const sizes = $('hp\\:pic').toArray().map(element => {
      const size = $(element).children('hp\\:sz')
      return { width: Number(size.attr('width')), height: Number(size.attr('height')) }
    })
    assert.equal(sizes.length, 2)
    const expected = [4 / 3, 3 / 4]
    sizes.forEach((size, index) => {
      assert.ok(size.width <= 46317, '사진이 사진 칸보다 넓다')
      assert.ok(size.height <= 26608, '사진이 사진 칸보다 높다')
      const ratio = size.width / size.height
      assert.ok(Math.abs(ratio - expected[index]) / expected[index] <= 0.02, `사진 비율이 틀어졌다: ${ratio}`)
    })
  })

  test('긴 요지와 연락처는 머리 문구를 제외하고 글자 수와 끝 마커가 보존된다', () => {
    const flat = flatText(built.nested)
    assert.equal(countOf(flat.replace(/〈 보 고 요 지 〉|산재요양 예상 [0-9]+일/g, ''), '요'), 3998)
    const $ = built.nested.$
    const contacts = $('hp\\:t').toArray().map(el => $(el).text()).filter(text => /연{2}/.test(text)).join('')
    assert.equal(countOf(contacts, '연'), 3997)
    assert.equal(countOf(flat, '요지끝'), 1)
    assert.equal(countOf(flat, '연락처끝'), 1)
  })

  test('긴 머리 행과 중첩 표도 쪽 높이를 넘기지 않고 명시 높이가 내용에 대응한다', () => {
    for (const name of ['heading', 'nested', 'long', 'empty']) {
      const { $ } = built[name]
      for (const table of $('hp\\:tbl').toArray()) {
        const height = Number($(table).children('hp\\:sz').attr('height'))
        assert.ok(height < 68000, `${name}의 표 높이 ${height}가 한 쪽을 넘는다`)
      }
    }
    const { $ } = built.nested
    const photoTables = $('hp\\:tbl').toArray().filter(table => $(table).children('hp\\:sz').attr('width') === '47337')
    for (const table of photoTables) {
      const cells = $(table).find('hp\\:cellSz').toArray()
      assert.ok(Number($(cells[0]).attr('height')) < 26890, '장문 설명을 위한 사진 칸 여유가 없다')
      assert.ok(Number($(cells[2]).attr('height')) > 3142, '장문 설명 칸이 자라지 않았다')
    }
  })

  test('사진 로드 실패는 사진과 설명을 조용히 버리지 않고 오류로 알린다', async () => {
    const stub = globalThis.fetch
    globalThis.fetch = async (url, init) => String(url).startsWith('data:')
      ? new Response(null, { status: 404 }) : stub(url, init)
    try {
      await assert.rejects(() => buildAccidentReportHwpx(cases.two.accident, PROJECT_NAME), /첨부 사진을 불러오지 못했습니다/)
    } finally {
      globalThis.fetch = stub
    }
  })

  test('8. 양식을 못 받으면 한국어 오류를 던진다', async () => {
    const stub = globalThis.fetch
    globalThis.fetch = async () => new Response(null, { status: 404 })
    try {
      await assert.rejects(
        () => buildAccidentReportHwpx(cases.empty.accident, PROJECT_NAME),
        /양식 파일을 불러오지 못했습니다/,
      )
    } finally {
      globalThis.fetch = stub
    }
  })

  test('9. 한글 검증용 표본을 저장한다', async () => {
    if (!process.env.HWPX_SAMPLE_DIR) return
    await mkdir(process.env.HWPX_SAMPLE_DIR, { recursive: true })
    await writeFile(`${process.env.HWPX_SAMPLE_DIR}/양식.hwpx`, Buffer.from(templateBytes))
    for (const [name, spec] of Object.entries(built)) {
      await writeFile(`${process.env.HWPX_SAMPLE_DIR}/${name}.hwpx`, spec.buffer)
    }
  })
}
