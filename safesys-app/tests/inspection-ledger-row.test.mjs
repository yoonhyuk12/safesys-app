// 실제 대장 렌더링의 행 탐색과 내부 컨트롤 이벤트 경계를 검증한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const React = require('react')
const root = path.resolve('src')
const Form = () => null, Detail = () => null, PhotoSlot = () => null
let values = [], index = 0
const fakeReact = { ...React, useEffect() {}, useCallback: fn => fn, useRef(initial) { return fakeReact.useState({ current: initial })[0] }, useState(initial) {
  const i = index++
  if (!(i in values)) values[i] = initial
  return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value }]
} }
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  const localRequire = name => {
    if (name === 'react') return fakeReact
    if (name === 'next/navigation') return { useRouter: () => ({}), useParams: () => ({ id: 'p' }), useSearchParams: () => ({ get: () => null }) }
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ user: { id: 'u' }, loading: false }) }
    if (name.endsWith('SafetyInspectionForm')) return { default: Form, __esModule: true }
    if (name.endsWith('SafetyInspectionDetail')) return { default: Detail, __esModule: true }
    if (name.endsWith('Special770PhotoSlot')) return { default: PhotoSlot, __esModule: true }
    if (name.includes('/reports/') || name.includes('/hwpx/') || name.endsWith('/supabase')) return {}
    if (name.includes('ImageEditor') || name.includes('LoadingSpinner') || name.includes('CopyrightNotice')) return { default: () => null, __esModule: true }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name)
      for (const ext of ['.ts', '.tsx']) {
        try { return load(base + ext) } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    }
    return require(name)
  }
  const source = readFileSync(file, 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } })
  vm.runInThisContext(`(function(module,exports,require){${outputText}\n})`)(module, module.exports, localRequire)
  cache.set(file, module.exports)
  return module.exports
}
const Page = load(path.join(root, 'app/project/[id]/safety-inspection-ledger/page.tsx')).default
const Rows770 = load(path.join(root, 'components/project/special-770/Special770LedgerRows.tsx')).default
const { SPECIAL_287_TYPE, SPECIAL_770_TYPE } = load(path.join(root, 'lib/safety-inspection-types.ts'))
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}
function fixture(type, count) {
  return { id: 'inspection-1', inspection_type: type, inspection_date: '2026-10-05', site_before_photo: 'site-photo',
    results: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, findings: '지적', action_items: '조치', photo_url: 'before-photo' })),
    additional_items: Array.from({ length: count }, () => ({ action: '조치', finding: '지적' })),
    excavator_inspection: { excavators: [{ id: 'e1', vehicle_no: '차량', items: Object.fromEntries(Array.from({ length: count }, (_, i) => [`1-${i + 1}`, { judgement: '부적정', finding: '지적' }])) }] },
  }
}
function harness(type, count) {
  values = [{ project_name: '현장' }, [fixture(type, count)], false]
  return { render() {
    index = 0
    const tree = Page()
    const child = nodes(tree).find(n => n.type === Rows770)
    return { tree, rows: nodes(child ? Rows770(child.props) : tree).filter(n => n.type === 'tr' && n.props.tabIndex === 0) }
  } }
}
// React 요소의 부모 관계를 유지하는 작은 이벤트 대상 모형. 실제 행 핸들러와 내부 onClick을 실행한다.
function dom(element, parent = null) {
  const node = { element, parent, props: element.props || {}, type: element.type,
    contains(target) { for (let n = target; n; n = n.parent) if (n === this) return true; return false },
    closest(selector) {
      for (let n = this; n; n = n.parent) {
        if (selector.split(', ').some(s => s === n.type || (s === '[data-ledger-row-control]' && 'data-ledger-row-control' in n.props) || (s === '[role="button"]' && n.props.role === 'button') || (s === '[contenteditable="true"]' && n.props.contentEditable === true))) return n
      }
      return null
    },
  }
  node.children = React.Children.toArray(node.props.children).filter(c => c && typeof c === 'object').map(c => dom(c, node))
  return node
}
function descendants(n) { return [n, ...n.children.flatMap(descendants)] }
function dispatch(row, target = row, key) {
  const event = { target, currentTarget: row, key, defaultPrevented: false, repeat: false,
    preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true },
  }
  for (let n = target; n; n = n.parent) {
    event.currentTarget = n
    n.props[key === undefined ? 'onClick' : 'onKeyDown']?.(event)
    if (event.stopped) break
  }
  return event
}
function assertDetail(tree, type) {
  const form = nodes(tree).find(n => n.type === Form)
  const detail = nodes(tree).find(n => n.type === Detail)
  if (type === SPECIAL_287_TYPE) {
    assert.equal(form?.props.editingId, 'inspection-1')
    assert.equal(form?.props.readOnly, true)
    assert.equal(detail, undefined)
  } else {
    assert.equal(detail?.props.inspectionId, 'inspection-1')
    assert.equal(form, undefined)
  }
}
for (const type of ['해빙기', '우기', '종합', SPECIAL_287_TYPE, SPECIAL_770_TYPE]) {
  for (const count of [0, 2]) test(`${type} 지적 ${count}건의 모든 행은 기존 상세 경로와 병합 셀을 보존한다`, () => {
    for (let i = 0; i < Math.max(1, count); i++) {
      for (const key of [undefined, 'Enter', ' ']) {
        const h = harness(type, count), { rows } = h.render()
        assert.equal(rows.length, Math.max(1, count))
        assert.equal(rows[i].props.role, undefined)
        assert.ok(!nodes(rows).some(n => n.type === 'button' && n.props.title === '상세보기'))
        if (count) assert.ok(nodes(rows[0]).some(n => n.type === 'td' && n.props.rowSpan === count))
        if (i > 0) assert.ok(!nodes(rows[i]).some(n => n.props.rowSpan))
        const row = dom(rows[i])
        const event = dispatch(row, key ? row : row.children[0], key)
        assert.equal(event.defaultPrevented, key !== undefined)
        assertDetail(h.render().tree, type)
      }
    }
  })
}

test('실제 행의 업로드 라벨·span, 사진, 버튼·SVG, 조치 편집 여백은 상세를 열지 않는다', () => {
  const previousWindow = globalThis.window
  globalThis.window = { open() {} }
  try {
    for (const type of ['해빙기', SPECIAL_287_TYPE, SPECIAL_770_TYPE]) {
      const h = harness(type, 2)
      let row = dom(h.render().rows[0])
      const targets = descendants(row).filter(n => ['label', 'input', 'img', 'button'].includes(n.type) || n.props['data-ledger-row-control'] !== undefined)
      assert.ok(targets.length > 0)
      for (const target of targets) {
        // 내부 동작 자체의 DB 저장은 이 회귀 범위가 아니므로 행에서 전달받는 이벤트만 검증한다.
        for (const child of [target, ...target.children]) {
          row.props.onClick({ target: child, currentTarget: row, defaultPrevented: false })
          for (const key of ['Enter', ' ']) row.props.onKeyDown({ target: child, currentTarget: row, key, preventDefault() { assert.fail('내부 키보드 입력 차단') } })
        }
      }
      assert.ok(!nodes(h.render().tree).some(n => n.type === Detail || n.type === Form))
      if (type === '해빙기') {
        dispatch(row, descendants(row).find(n => 'data-ledger-row-control' in n.props))
        row = dom(h.render().rows[0])
        assert.ok(descendants(row).some(n => n.type === 'textarea'))
        dispatch(row, descendants(row).find(n => 'data-ledger-row-control' in n.props))
        assert.ok(!nodes(h.render().tree).some(n => n.type === Detail || n.type === Form))
      }
    }
  } finally { globalThis.window = previousWindow }
})

test('행 밖 포털과 취소된 클릭, 반복 키, 다른 키는 상세를 열지 않는다', () => {
  const h = harness(SPECIAL_770_TYPE, 2), row = dom(h.render().rows[0])
  const portal = dom(React.createElement('div'))
  row.props.onClick({ target: portal, currentTarget: row })
  row.props.onClick({ target: row, currentTarget: row, defaultPrevented: true })
  for (const extra of [{ key: 'Escape' }, { key: 'Enter', repeat: true }, { key: ' ', defaultPrevented: true }, { key: 'Enter', target: portal }]) {
    row.props.onKeyDown({ target: row, currentTarget: row, preventDefault() { assert.fail('무관한 입력 차단') }, ...extra })
  }
  assert.ok(!nodes(h.render().tree).some(n => n.type === Detail || n.type === Form))
})

test('삭제 요청과 확인·취소 버튼은 행 상세와 독립적으로 동작한다', () => {
  for (const type of ['해빙기', SPECIAL_287_TYPE, SPECIAL_770_TYPE]) {
    const h = harness(type, 0)
    let row = dom(h.render().rows[0])
    dispatch(row, descendants(row).find(n => n.type === 'button' && n.props.title === '삭제'))
    row = dom(h.render().rows[0])
    const confirm = descendants(row).find(n => n.type === 'button' && n.props.children === '확인')
    assert.ok(confirm)
    row.props.onClick({ target: confirm, currentTarget: row })
    dispatch(row, descendants(row).find(n => n.type === 'button' && n.props.children === '취소'))
    const rendered = h.render()
    assert.ok(nodes(rendered.rows).some(n => n.props?.title === '삭제'))
    assert.ok(!nodes(rendered.tree).some(n => n.type === Detail || n.type === Form))
  }
})

test('중첩 SVG와 폼 컨트롤은 자체 클릭과 키보드 기본 동작을 유지한다', () => {
  const { inspectionLedgerRowProps } = load(path.join(root, 'lib/inspection-ledger-row.ts'))
  let opened = 0, clicked = 0
  const props = inspectionLedgerRowProps(() => opened++)
  for (const tag of ['button', 'label', 'input', 'textarea', 'select']) {
    const row = dom(React.createElement('tr', props,
      React.createElement('td', null, React.createElement(tag, { onClick: () => clicked++ },
        React.createElement('svg', null, React.createElement('path'))))))
    const target = descendants(row).at(-1)
    dispatch(row, target)
    assert.equal(dispatch(row, target, ' ').defaultPrevented, false)
    assert.equal(dispatch(row, target, 'Enter').defaultPrevented, false)
  }
  assert.equal(clicked, 5)
  assert.equal(opened, 0)
})
