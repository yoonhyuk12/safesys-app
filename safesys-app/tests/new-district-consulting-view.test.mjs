// 신규지구 안전컨설팅 표 컴포넌트의 소계·미점검 배지·판정 불가·점검일 나열·지사 순서·빈 결과 마크업을 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import * as react from 'react'
import { createElement } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

/** .tsx를 CommonJS로 바꿔 require 스텁으로 의존성을 주입한다. Playwright의 JSX 변환에 기대지 않는다. */
async function transpile(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require)
  return module.exports
}

const { NewDistrictBranchTable, NewDistrictHqTable, NewDistrictProjectTable } = await transpile(
  '../src/components/dashboard/NewDistrictConsultingTables.tsx',
  { react, 'react/jsx-runtime': jsxRuntime }
)

const subtotal = (
  districtCount,
  inspectedDistrictCount,
  inspectionCount,
  excludedCount = 0
) => ({
  districtCount,
  inspectedDistrictCount,
  inspectionCount,
  excludedCount,
  rate: districtCount > 0 ? inspectedDistrictCount / districtCount : 0,
})

const projectRow = (overrides) => ({
  projectName: `사업-${overrides.projectId}`,
  managingHq: '경기',
  managingBranch: '화성·수원지사',
  representativeStartDate: '2026-03-15',
  deadlineDate: '2026-06-15',
  inspectionDates: [],
  inspectionCount: 0,
  inspected: false,
  excluded: false,
  excludeReason: null,
  ...overrides,
})

test('본부 표 소계는 지사 실시율의 평균이 아니라 원수 합산 실시율을 보여준다', () => {
  // 지사 A 4개 중 2개(50%), 지사 B 1개 중 1개(100%) → 율 평균 75.0%가 아니라 원수 5개 중 3개 = 60.0%
  const branches = [
    { branch: '화성·수원지사', subtotal: subtotal(4, 2, 2), projects: [] },
    { branch: '여주·이천지사', subtotal: subtotal(1, 1, 3), projects: [] },
  ]
  const hqs = [{ hq: '경기', subtotal: subtotal(5, 3, 5), branches }]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictHqTable, { total: subtotal(5, 3, 5), hqs, onSelectHq: () => undefined })
  )

  assert.ok(markup.includes('소계'))
  assert.ok(markup.includes('60.0%'))
  assert.ok(!markup.includes('75.0%'))
  assert.ok(markup.includes('경기본부'))
})

test('지사 표 소계는 선택 본부의 원수 합산값을 보여준다', () => {
  const branches = [
    { branch: '화성·수원지사', subtotal: subtotal(4, 2, 2), projects: [] },
    { branch: '여주·이천지사', subtotal: subtotal(1, 1, 3), projects: [] },
  ]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictBranchTable, {
      subtotal: subtotal(5, 3, 5),
      branches,
      onSelectBranch: () => undefined,
    })
  )

  assert.ok(markup.includes('소계'))
  assert.ok(markup.includes('60.0%'))
  assert.ok(markup.includes('50.0%'))
  assert.ok(markup.includes('100.0%'))
})

test('지사 표는 라이브러리가 준 조직 순서를 그대로 렌더하고 다시 정렬하지 않는다', () => {
  // 가나다순이면 안성지사가 먼저다. 표가 재정렬하면 이 순서가 뒤집힌다.
  const branches = [
    { branch: '여주·이천지사', subtotal: subtotal(1, 0, 0), projects: [] },
    { branch: '안성지사', subtotal: subtotal(1, 0, 0), projects: [] },
    { branch: '없는지사', subtotal: subtotal(1, 0, 0), projects: [] },
  ]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictBranchTable, {
      subtotal: subtotal(3, 0, 0),
      branches,
      onSelectBranch: () => undefined,
    })
  )

  assert.ok(markup.indexOf('여주·이천지사') < markup.indexOf('안성지사'))
  assert.ok(markup.indexOf('안성지사') < markup.indexOf('없는지사'))
})

test('프로젝트 표는 미점검 지구를 남기고 미점검 배지를 위험색으로 보여준다', () => {
  const projects = [
    projectRow({
      projectId: 'p1',
      projectName: '가지구',
      inspectionDates: ['2026-04-01'],
      inspectionCount: 1,
      inspected: true,
    }),
    projectRow({ projectId: 'p2', projectName: '나지구' }),
  ]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, { subtotal: subtotal(2, 1, 1), projects })
  )

  assert.ok(markup.includes('나지구'))
  assert.ok(markup.includes('미점검'))
  assert.ok(markup.includes('2026.03.15'))
  assert.ok(markup.includes('2026.06.15'))
  // 미점검은 미이행이라 red, 점검 완료는 green이다
  assert.ok(markup.includes('bg-red-100 text-red-800'))
  assert.ok(markup.includes('bg-green-100 text-green-800'))
  assert.ok(!markup.includes('amber'))
})

test('판정 불가 지구는 별도 구역에 사유와 함께 나온다', () => {
  const projects = [
    projectRow({ projectId: 'p1', projectName: '가지구', inspected: false }),
    projectRow({
      projectId: 'p9',
      projectName: '마지구',
      representativeStartDate: null,
      deadlineDate: null,
      excluded: true,
      excludeReason: 'no_representative',
    }),
    projectRow({
      projectId: 'p10',
      projectName: '바지구',
      representativeStartDate: null,
      deadlineDate: null,
      excluded: true,
      excludeReason: 'no_start_date',
    }),
  ]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, { subtotal: subtotal(1, 0, 0, 2), projects })
  )

  assert.ok(markup.includes('대표 계약 미확인으로 착공연도 판정 불가 (2개)'))
  assert.ok(markup.includes('판정 불가'))
  assert.ok(markup.includes('대표 계약 미지정'))
  assert.ok(markup.includes('계약 시작일 없음'))
  assert.ok(markup.includes('제외 2개'))
})

test('같은 지구를 여러 번 점검하면 점검일이 모두 나오고 건수가 맞는다', () => {
  const projects = [
    projectRow({
      projectId: 'p1',
      projectName: '가지구',
      inspectionDates: ['2026-04-01', '2026-04-01', '2026-05-20'],
      inspectionCount: 3,
      inspected: true,
    }),
  ]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, { subtotal: subtotal(1, 1, 3), projects })
  )

  assert.ok(markup.includes('2026.04.01'))
  assert.ok(markup.includes('2026.05.20'))
  assert.ok(markup.includes('3건'))
  assert.ok(markup.includes('점검 1개'))
})

test('점검 0건은 0건 대신 -로 보여주고 원수와 실시율은 그대로다', () => {
  // 지사 A는 4개 중 2개 점검 2건, 지사 B는 1개 중 0개 점검 0건 → B의 점검 건수 칸이 `-`다
  const branches = [
    { branch: '화성·수원지사', subtotal: subtotal(4, 2, 2), projects: [] },
    { branch: '여주·이천지사', subtotal: subtotal(1, 0, 0), projects: [] },
  ]

  const branchMarkup = renderToStaticMarkup(
    createElement(NewDistrictBranchTable, {
      subtotal: subtotal(5, 2, 2),
      branches,
      onSelectBranch: () => undefined,
    })
  )

  assert.ok(!branchMarkup.includes('0건'))
  assert.ok(branchMarkup.includes('2건'))
  // 개수 0개와 실시율 0.0%는 이 지시 대상이 아니라 그대로 남는다
  assert.ok(branchMarkup.includes('0개'))
  assert.ok(branchMarkup.includes('0.0%'))
  assert.ok(branchMarkup.includes('40.0%'))

  // 프로젝트 표의 소계·본문 점검 건수 칸도 같은 규칙이다
  const projectMarkup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, {
      subtotal: subtotal(1, 0, 0),
      projects: [projectRow({ projectId: 'p1', projectName: '가지구' })],
    })
  )

  assert.ok(!projectMarkup.includes('0건'))
  assert.ok(projectMarkup.includes('점검 0개'))
})

test('판정 불가 목록은 본표 밖 기본 접힘 details로 내려간다', () => {
  const projects = [
    projectRow({ projectId: 'p1', projectName: '가지구' }),
    projectRow({
      projectId: 'p9',
      projectName: '마지구',
      representativeStartDate: null,
      deadlineDate: null,
      excluded: true,
      excludeReason: 'no_representative',
    }),
  ]

  const markup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, { subtotal: subtotal(1, 0, 0, 1), projects })
  )

  assert.ok(markup.includes('<details'))
  assert.ok(markup.includes('<summary'))
  // open 속성이 없어야 기본 접힘이다
  assert.ok(!markup.includes('<details open'))
  assert.ok(markup.includes('대표 계약 미확인으로 착공연도 판정 불가 (1개)'))
  // 제외 수는 소계에 그대로 남는다
  assert.ok(markup.includes('제외 1개'))
  // 판정 불가 행은 본표가 아니라 details 뒤에 온다
  assert.ok(markup.indexOf('가지구') < markup.indexOf('<details'))
  assert.ok(markup.indexOf('<details') < markup.indexOf('마지구'))
})

test('코호트가 0이면 제외 행이 있어도 빈 결과 안내가 나온다', () => {
  // 제외만 있는 본부·지사도 행으로 남으므로 목록 길이로는 빈 결과를 판정할 수 없다
  const hqs = [{ hq: '경기', subtotal: subtotal(0, 0, 0, 7), branches: [] }]
  const hqMarkup = renderToStaticMarkup(
    createElement(NewDistrictHqTable, {
      total: subtotal(0, 0, 0, 7),
      hqs,
      onSelectHq: () => undefined,
    })
  )

  const branchMarkup = renderToStaticMarkup(
    createElement(NewDistrictBranchTable, {
      subtotal: subtotal(0, 0, 0, 7),
      branches: [{ branch: '화성·수원지사', subtotal: subtotal(0, 0, 0, 7), projects: [] }],
      onSelectBranch: () => undefined,
    })
  )

  const projectMarkup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, {
      subtotal: subtotal(0, 0, 0, 1),
      projects: [
        projectRow({
          projectId: 'p9',
          projectName: '마지구',
          representativeStartDate: null,
          deadlineDate: null,
          excluded: true,
          excludeReason: 'no_representative',
        }),
      ],
    })
  )

  assert.ok(hqMarkup.includes('해당 연도에 착공한 신규지구가 없습니다.'))
  assert.ok(branchMarkup.includes('해당 연도에 착공한 신규지구가 없습니다.'))
  assert.ok(projectMarkup.includes('해당 연도에 착공한 신규지구가 없습니다.'))
  // 제외 열·제외 수는 유지된다
  assert.ok(hqMarkup.includes('7개'))
  assert.ok(projectMarkup.includes('제외 1개'))
})

test('연도 코호트가 비면 안내 문구가 나온다', () => {
  const hqMarkup = renderToStaticMarkup(
    createElement(NewDistrictHqTable, {
      total: subtotal(0, 0, 0),
      hqs: [],
      onSelectHq: () => undefined,
    })
  )
  const projectMarkup = renderToStaticMarkup(
    createElement(NewDistrictProjectTable, { subtotal: subtotal(0, 0, 0), projects: [] })
  )

  assert.ok(hqMarkup.includes('해당 연도에 착공한 신규지구가 없습니다.'))
  assert.ok(projectMarkup.includes('해당 연도에 착공한 신규지구가 없습니다.'))
})
