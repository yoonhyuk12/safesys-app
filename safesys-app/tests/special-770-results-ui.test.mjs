// 특별점검 결과 탭의 실제 입력 이벤트·판정 보존·단계 탐색을 검증한다.
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
const PhotoSlot = () => null
let hookValues = [], hookIndex = 0, pendingEffects = null
const fakeReact = { ...React, useId: () => 'checklist-test', useEffect(effect) { pendingEffects?.push(effect) }, useRef: () => ({ current: null }), useState(initial) {
  const index = hookIndex++
  const values = hookValues
  if (!(index in hookValues)) hookValues[index] = typeof initial === 'function' ? initial() : initial
  return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
} }
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const source = readFileSync(file, 'utf8')
  const module = { exports: {} }
  const localRequire = name => {
    if (name === 'react') return fakeReact
    if (name.endsWith('Special770PhotoSlot')) return { default: PhotoSlot, __esModule: true }
    if (name === '@/contexts/AuthContext') return { useAuth: () => ({ user: null }) }
    if (name === '@/lib/supabase') return { supabase: {} }
    if (name === '@/lib/work-daily-report/progress-anchors') return {}
    if (name === '@/lib/work-daily-report/work-daily-report-types') return {}
    if (name.includes('ImageEditor') || name === 'react-signature-canvas') return { default: () => null, __esModule: true }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name)
      for (const ext of ['.ts', '.tsx']) {
        try { return load(base + ext) } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
      throw new Error(`모듈 없음 ${name}`)
    }
    return require(name)
  }
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } })
  vm.runInThisContext(`(function(module,exports,require){${outputText}\n})`)(module, module.exports, localRequire)
  cache.set(file, module.exports)
  return module.exports
}
const component = name => load(path.join(root, `components/project/special-770/${name}.tsx`)).default
const state = load(path.join(root, 'components/project/special-770/state.ts'))

test('빈 부적정 조치기한은 점검일 7일 후이며 월말·연말·윤년과 기존 값을 보존한다', () => {
  for (const [date, expected] of [['2026-10-05', '2026-10-12'], ['2026-12-28', '2027-01-04'], ['2024-02-23', '2024-03-01'], ['2026-02-23', '2026-03-02']]) {
    const original = fixture()
    const next = state.fill770ActionDueDates(original, date)
    assert.equal(next.excavators[1].items['1-1'].action_due_date, expected)
    assert.equal(next.excavators[1].items['4-1'].action_due_date, expected)
    assert.equal(next.excavators[0], original.excavators[0])
    assert.equal(next.excavators[0].items['1-1'].action_due_date, '2026-10-20')
    assert.equal(next.excavators[1].items['2-1'], original.excavators[1].items['2-1'])
    assert.equal(next.site_photo_urls, original.site_photo_urls)
    assert.equal(original.excavators[1].items['1-1'].action_due_date, undefined)
    assert.equal(state.fill770ActionDueDates(next, '2027-03-01'), next)
  }
  const original = fixture()
  for (const invalid of ['', 'invalid', '2026-02-30']) assert.equal(state.fill770ActionDueDates(original, invalid), original)
  const cleared = state.updateItem(original, 'b', '1-1', { action_due_date: null })
  assert.equal(state.fill770ActionDueDates(cleared, '2026-10-05').excavators[1].items['1-1'].action_due_date, '2026-10-12')
})

test('결과 편집 진입은 실제 부모 상태에 기본 기한을 저장하고 읽기 전용은 변경하지 않는다', () => {
  for (const readOnly of [false, true]) {
    let data = fixture()
    const original = data
    pendingEffects = []
    try {
      component('Special770Results')({ projectId: 'p', data, setData: updater => { data = updater(data) }, readOnly, inspectionDate: '2026-12-28' })
      for (const effect of pendingEffects) effect()
      assert.equal(data.excavators[1].items['1-1'].action_due_date, readOnly ? undefined : '2027-01-04')
      if (readOnly) assert.equal(data, original)
      assert.equal(data.excavators[0].items['1-1'].action_due_date, '2026-10-20')
    } finally {
      pendingEffects = null
    }
  }
})
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function text(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  return Array.isArray(node) ? node.map(text).join('') : text(node.props?.children)
}
function fixture() {
  return { inspection_team: '', site_photo_urls: ['site-original'], excavators: [
    { id: 'a', vehicle_no: '서울04가1234', items: { '1-1': { judgement: '부적정', finding: '원래 지적', action: '원래 조치', before_photo_url: 'before-original', after_photo_url: 'N/A', action_due_date: '2026-10-20' }, '1-2': { judgement: '적정', finding: '숨은 지적' } } },
    { id: 'b', vehicle_no: '  ', etc_text: '경사지 위험', items: { '1-1': { judgement: '부적정', finding: '두 번째 지적' }, '4-1': { judgement: '부적정' }, '2-1': { judgement: null } } },
  ] }
}
function harness(initial = fixture(), readOnly = false) {
  let data = initial
  return { get data() { return data }, setData: updater => { data = updater(data) }, render() { return component('Special770Results')({ projectId: 'p', data, setData: this.setData, readOnly }) } }
}

function checklistHarness(initial = fixture(), readOnly = false) {
  let data = initial
  const values = []
  return {
    get data() { return data },
    setData: updater => { data = updater(data) },
    render() {
      hookValues = values; hookIndex = 0
      return component('Special770Checklist')({ projectId: 'p', data, setData: this.setData, readOnly })
    },
  }
}
const tabsOf = tree => nodes(tree).filter(n => n.props?.role === 'tab')
const cardOf = tree => {
  const cards = nodes(tree).filter(n => n.type === component('Special770ExcavatorCard'))
  assert.equal(cards.length, 1)
  return cards[0]
}

test('굴착기 탭은 첫 카드만 표시하고 ID 선택과 모든 부모 입력을 보존한다', () => {
  const h = checklistHarness(), original = h.data
  assert.equal(cardOf(h.render()).props.excavator.id, 'a')
  tabsOf(h.render())[1].props.onClick()
  let card = cardOf(h.render())
  assert.equal(card.props.excavator.id, 'b')
  const content = card.type(card.props)
  nodes(content).find(n => n.type === 'input').props.onChange({ target: { value: '차량 변경' } })
  const row = nodes(content).find(n => n.type === component('Special770ItemRow') && n.props.code === '1-1')
  row.props.onItemChange({ judgement: '적정' })
  const saved = h.data.excavators[1]
  tabsOf(h.render())[0].props.onClick()
  tabsOf(h.render())[1].props.onClick()
  assert.equal(cardOf(h.render()).props.excavator, saved)
  assert.equal(saved.vehicle_no, '차량 변경')
  assert.equal(saved.items['1-1'].finding, '두 번째 지적')
  assert.equal(h.data.excavators[0], original.excavators[0])
  h.setData(prev => ({ ...prev, excavators: [...prev.excavators].reverse() }))
  assert.equal(cardOf(h.render()).props.excavator.id, 'b')
  assert.equal(cardOf(h.render()).props.index, 0)
  assert.equal(cardOf(checklistHarness().render()).props.excavator.id, 'a')
  assert.equal(cardOf(h.render()).props.excavator.id, 'b')
})

const addOf = tree => nodes(tree).find(n => n.props?.['aria-label'] === '굴착기 추가')
const deletesOf = tree => nodes(tree).filter(n => n.type === 'button' && n.props?.['aria-label']?.endsWith(' 삭제'))

test('탭 제목 옆 X와 같은 행 끝의 빈 + 버튼만 삭제·추가를 제공한다', () => {
  const tree = checklistHarness().render()
  const list = nodes(tree).find(n => n.props?.role === 'tablist')
  for (const tab of tabsOf(tree)) {
    const wrapper = nodes(list).find(n => n.type === 'div' && React.Children.toArray(n.props.children).some(child => child.props === tab.props))
    const children = React.Children.toArray(wrapper.props.children)
    assert.equal(children[0].props, tab.props)
    assert.match(children[1].props['aria-label'], /굴착기 \d.* 삭제/)
    assert.equal(nodes(tab).filter(n => n.type === 'button').length, 1)
  }
  const add = addOf(tree)
  assert.equal(React.Children.toArray(list.props.children).at(-1).props, add.props)
  assert.equal(text(add), '')
  assert.ok(!add.props.className.includes('w-full'))
  for (const button of [...deletesOf(tree), add]) {
    assert.match(button.props.className, /min-h-\[44px\]/)
    assert.match(button.props.className, /min-w-\[44px\]/)
  }
  const card = cardOf(tree)
  assert.equal(deletesOf(card.type(card.props)).length, 0)
  assert.equal(deletesOf(tree).length, 2)
})

test('X 취소는 데이터를 보존하고 비활성 삭제는 선택 ID를 유지한다', () => {
  const initial = fixture()
  initial.excavators.push({ ...initial.excavators[0], id: 'c' })
  const h = checklistHarness(initial), original = h.data
  tabsOf(h.render())[1].props.onClick()
  const oldWindow = globalThis.window
  let confirmed
  globalThis.window = { confirm: label => { confirmed = label; return false } }
  try {
    deletesOf(h.render())[0].props.onClick()
    assert.equal(confirmed, '서울04가1234의 점검 내용을 삭제할까요?')
    assert.equal(h.data, original)
    assert.equal(cardOf(h.render()).props.excavator.id, 'b')
    globalThis.window.confirm = () => true
    deletesOf(h.render())[2].props.onClick()
    assert.deepEqual(h.data.excavators.map(e => e.id), ['a', 'b'])
    assert.equal(cardOf(h.render()).props.excavator.id, 'b')
    deletesOf(h.render())[0].props.onClick()
    assert.deepEqual(h.data.excavators.map(e => e.id), ['b'])
    assert.equal(cardOf(h.render()).props.excavator, original.excavators[1])
  } finally { globalThis.window = oldWindow }
})

test('편집 탭의 키보드는 X와 +를 건너뛰어 다른 탭에 포커스를 보낸다', () => {
  const h = checklistHarness()
  for (const [key, expected] of [['ArrowRight', 1], ['ArrowRight', 0], ['ArrowLeft', 1], ['Home', 0], ['End', 1]]) {
    const tabs = tabsOf(h.render())
    let focused = -1
    tabs.find(t => t.props['aria-selected']).props.onKeyDown({ key, preventDefault() {}, currentTarget: {
      closest(selector) {
        assert.equal(selector, '[role="tablist"]')
        return { querySelectorAll(selector) {
          assert.equal(selector, '[role="tab"]')
          return tabs.map((_, i) => ({ focus() { focused = i } }))
        } }
      },
    } })
    assert.equal(focused, expected)
    assert.equal(tabsOf(h.render())[expected].props['aria-selected'], true)
  }
})

test('굴착기 추가는 새 탭을 선택하고 활성·마지막 삭제 후에도 추가할 수 있다', () => {
  const h = checklistHarness()
  addOf(h.render()).props.onClick()
  assert.equal(h.data.excavators.length, 3)
  const added = cardOf(h.render())
  assert.equal(added.props.excavator.id, h.data.excavators[2].id)
  const oldWindow = globalThis.window
  globalThis.window = { confirm: () => true }
  try {
    deletesOf(h.render())[2].props.onClick()
    assert.equal(cardOf(h.render()).props.excavator.id, 'a')
    deletesOf(h.render())[0].props.onClick()
    assert.equal(cardOf(h.render()).props.excavator.id, 'b')
    globalThis.window.confirm = label => { assert.equal(label, '굴착기 1의 점검 내용을 삭제할까요?'); return true }
    deletesOf(h.render())[0].props.onClick()
  } finally { globalThis.window = oldWindow }
  assert.equal(h.data.excavators.length, 0)
  assert.equal(tabsOf(h.render()).length, 0)
  assert.match(text(h.render()), /등록된 굴착기가 없습니다/)
  assert.equal(deletesOf(h.render()).length, 0)
  addOf(h.render()).props.onClick()
  assert.equal(cardOf(h.render()).props.excavator.id, h.data.excavators[0].id)
})

test('읽기 전용 탭은 ARIA 연결과 방향키·Home·End 탐색을 제공한다', () => {
  const h = checklistHarness(fixture(), true)
  for (const [key, expected] of [['ArrowRight', 1], ['ArrowRight', 0], ['ArrowLeft', 1], ['Home', 0], ['End', 1]]) {
    const tabs = tabsOf(h.render())
    let focused = -1, prevented = false
    tabs.find(t => t.props['aria-selected']).props.onKeyDown({ key, preventDefault() { prevented = true }, currentTarget: { closest(selector) { assert.equal(selector, '[role="tablist"]'); return { querySelectorAll(selector) { assert.equal(selector, '[role="tab"]'); return tabs.map((_, i) => ({ focus() { focused = i } })) } } } } })
    assert.equal(focused, expected)
    assert.equal(prevented, true)
    const tree = h.render(), updated = tabsOf(tree)
    assert.equal(updated[expected].props['aria-selected'], true)
    assert.equal(updated.filter(t => t.props.tabIndex === 0).length, 1)
    const panels = nodes(tree).filter(n => n.props?.role === 'tabpanel')
    assert.equal(panels.find(n => !n.props.hidden).props.tabIndex, 0)
    assert.ok(panels.filter(n => n.props.hidden).every(n => n.props.tabIndex === -1))
    for (const tab of updated) {
      assert.ok(tab.props.className.includes('min-h-[44px]'))
      assert.ok(nodes(tree).some(n => n.props?.id === tab.props['aria-controls'] && n.props['aria-labelledby'] === tab.props.id))
    }
    const card = cardOf(tree)
    assert.equal(card.props.readOnly, true)
    const content = card.type(card.props)
    assert.ok(nodes(content).find(n => n.type === 'input').props.disabled)
    assert.ok(!nodes(content).some(n => n.props?.['aria-label'] === '굴착기 삭제'))
    assert.equal(addOf(tree), undefined)
    assert.equal(deletesOf(tree).length, 0)
  }
  assert.equal(tabsOf(checklistHarness({ ...fixture(), excavators: [] }, true).render()).length, 0)
})

test('부적정 선택은 판정만 바꾸고 점검표에 상세 입력을 펼치지 않는다', () => {
  let patch
  const row = component('Special770ItemRow')({ projectId: 'p', code: '1-1', text: '항목', result: { judgement: '부적정', finding: '보존' }, onItemChange: value => { patch = value } })
  assert.equal(nodes(row).filter(n => n.type === 'textarea' || n.type === 'input' || n.type === PhotoSlot).length, 0)
  nodes(row).find(n => n.type === 'button' && text(n) === '적정').props.onClick()
  assert.deepEqual(patch, { judgement: '적정' })
})
test('안전핀 증빙과 기타 위험요인 정의는 점검표에 남고 현장사진은 없다', () => {
  const Row = component('Special770ItemRow')
  const pin = Row({ projectId: 'p', code: '3-1', text: '핀', result: {}, pinPhoto: { url: 'pin', onChange() {} } })
  assert.equal(nodes(pin).find(n => n.type === PhotoSlot).props.url, 'pin')
  const etc = Row({ projectId: 'p', code: '4-1', text: '기타', result: {}, etcText: { value: '위험', onChange() {} } })
  assert.equal(nodes(etc).find(n => n.type === 'input').props.value, '위험')
  const checklist = component('Special770Checklist')({ projectId: 'p', data: { ...fixture(), excavators: [] }, setData() {} })
  assert.equal(nodes(checklist).filter(n => n.type === PhotoSlot).length, 0)
})
test('여러 굴착기의 부적정만 표시하고 차량·대분류·항목과 실제 대수를 보여준다', () => {
  const tree = harness().render()
  assert.match(text(tree), /2\. 점검결과\(굴착기 사용 대수: 2대\)/)
  for (const value of ['서울04가1234', '굴착기 2', '1-1', '사전조사 및 절차 준수', '경사지 위험']) assert.ok(text(tree).includes(value))
  assert.equal(nodes(tree).filter(n => n.type === 'textarea').length, 3)
  assert.ok(!nodes(tree).some(n => n.props?.value === '숨은 지적'))
})
test('편집·읽기 전용 결과에는 지적·조치 전 사진·예정일만 있고 조치사항과 조치 후 사진은 없다', () => {
  for (const readOnly of [false, true]) {
    const tree = harness(fixture(), readOnly).render()
    assert.doesNotMatch(text(tree), /조치\(예정\)사항|조치 후 사진/)
    assert.deepEqual(nodes(tree).filter(n => n.type === 'textarea').map(n => n.props.id), ['result-a-1-1-finding', 'result-b-1-1-finding', 'result-b-4-1-finding'])
    const photos = nodes(tree).filter(n => n.type === PhotoSlot)
    assert.equal(photos.length, 3)
    assert.ok(photos.every(n => n.props.label === '조치 전 사진' && n.props.tag.startsWith('before_')))
    assert.equal(nodes(tree).filter(n => n.type === 'input' && n.props.type === 'date').length, 3)
  }
})
test('지적·조치 전 사진·예정일 이벤트는 기존 조치·조치 후 사진과 다른 굴착기를 보존한다', () => {
  const h = harness(), original = h.data
  original.excavators[1].items['1-1'] = { ...original.excavators[1].items['1-1'], action: '기존 조치 보존', after_photo_url: 'after-original' }
  let tree = h.render()
  nodes(tree).find(n => n.props?.id === 'result-b-1-1-finding').props.onChange({ target: { value: '변경 지적' } })
  nodes(tree).filter(n => n.type === PhotoSlot && n.props.label === '조치 전 사진')[1].props.onChange('before-new')
  nodes(tree).filter(n => n.type === 'input' && n.props.type === 'date')[1].props.onChange({ target: { value: '2026-11-01' } })
  assert.deepEqual(h.data.excavators[1].items['1-1'], { judgement: '부적정', finding: '변경 지적', action: '기존 조치 보존', before_photo_url: 'before-new', after_photo_url: 'after-original', action_due_date: '2026-11-01' })
  assert.equal(h.data.excavators[0], original.excavators[0])
  assert.equal(h.data.excavators[1].items['4-1'], original.excavators[1].items['4-1'])
  assert.equal(original.excavators[1].items['1-1'].finding, '두 번째 지적')
  nodes(h.render()).filter(n => n.type === 'input' && n.props.type === 'date')[1].props.onChange({ target: { value: '' } })
  assert.equal(h.data.excavators[1].items['1-1'].action_due_date, null)
  nodes(h.render()).filter(n => n.type === PhotoSlot && n.props.label === '조치 전 사진')[1].props.onChange(null)
  assert.equal(h.data.excavators[1].items['1-1'].before_photo_url, null)
  assert.equal(h.data.excavators[1].items['1-1'].action, '기존 조치 보존')
  assert.equal(h.data.excavators[1].items['1-1'].after_photo_url, 'after-original')
  assert.equal(h.data.excavators[0], original.excavators[0])
})
test('판정 해제와 재선택은 결과 입력을 숨기고 모든 기존 값을 복원한다', () => {
  const h = harness(), saved = h.data.excavators[0].items['1-1']
  for (const judgement of ['적정', '해당없음', null]) {
    h.setData(prev => state.updateItem(prev, 'a', '1-1', { judgement }))
    assert.ok(!nodes(h.render()).some(n => n.props?.value === saved.finding))
    h.setData(prev => state.updateItem(prev, 'a', '1-1', { judgement: '부적정' }))
    assert.deepEqual(h.data.excavators[0].items['1-1'], saved)
    assert.ok(nodes(h.render()).some(n => n.props?.value === saved.finding))
  }
})
test('지적 없는 결과에 현장사진을 편집하고 읽기 전용 빈 상태를 표시한다', () => {
  const h = harness({ ...fixture(), excavators: [] })
  assert.match(text(h.render()), /부적정 항목이 없습니다/)
  assert.doesNotMatch(text(h.render()), /조치사항/)
  let photos = nodes(h.render()).filter(n => n.type === PhotoSlot)
  assert.equal(photos.length, 2)
  photos[1].props.onChange('site-new')
  assert.deepEqual(h.data.site_photo_urls, ['site-original', 'site-new'])
  photos[0].props.onChange(null)
  assert.deepEqual(h.data.site_photo_urls, ['site-new'])
  const empty = harness({ ...fixture(), excavators: [], site_photo_urls: [] }, true).render()
  assert.match(text(empty), /사진 없음/)
  assert.equal(nodes(empty).filter(n => n.type === PhotoSlot).length, 0)
  const readonly = harness(fixture(), true).render()
  assert.ok(nodes(readonly).filter(n => ['textarea', 'input'].includes(n.type)).every(n => n.props.disabled))
  assert.ok(nodes(readonly).filter(n => n.type === PhotoSlot).every(n => n.props.readOnly))
  assert.equal(nodes(readonly).filter(n => n.type === PhotoSlot)[0].props.url, 'before-original')
})
test('편집·읽기 전용 모두 세 번째 탭까지 다음 단계로 이동하고 마지막에서 멈춘다', () => {
  const Form = load(path.join(root, 'components/project/SafetyInspectionForm.tsx')).default
  const types = load(path.join(root, 'lib/safety-inspection-types.ts'))
  const inspectionType = types.SAFETY_INSPECTION_TYPES.find(types.isSpecial770Type)
  assert.ok(inspectionType)
  for (const readOnly of [false, true]) {
    hookValues = []
    const render = () => { hookIndex = 0; return Form({ projectId: 'p', project: null, editingId: null, initialInspectionType: inspectionType, readOnly, onClose() {}, onSaved() {} }) }
    let tree = render()
    const tabs = nodes(tree).filter(n => n.type === 'button' && ['1점검개요', '2굴착기 점검표', '3점검결과'].includes(text(n)))
    assert.equal(tabs.length, 3)
    assert.ok(tabs.every(n => n.props.className.includes('min-h-[44px]')))
    const next = tree => nodes(tree).find(n => n.type === 'button' && (n.props.title === '다음 단계' || text(n) === '다음 단계 →'))
    next(tree).props.onClick(); tree = render()
    assert.ok(nodes(tree).some(n => n.type === component('Special770Checklist')))
    next(tree).props.onClick(); tree = render()
    assert.ok(nodes(tree).some(n => n.type === component('Special770Results') && n.props.readOnly === readOnly))
    assert.equal(next(tree), undefined)
    nodes(tree).find(n => n.type === 'button' && text(n).includes('이전 단계')).props.onClick()
    assert.ok(nodes(render()).some(n => n.type === component('Special770Checklist')))
  }
})
