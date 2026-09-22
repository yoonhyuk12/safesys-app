// 모델 선택기의 실제 이벤트 핸들러와 가격 라벨을 의존성 추가 없이 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/app/admin/ai-usage/page.tsx', import.meta.url), 'utf8')
function harness(provider, initialValue, candidates) {
  const slots = []
  let cursor = 0
  let tree
  const props = { provider, value: initialValue, candidates, loading: false, error: null, onRefresh() {}, onChange(value) { props.value = value } }
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useRef: () => ({ current: null }), useId: () => 'models', useEffect() {},
  }
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {},
    '@/lib/supabase': {}, './UsageLogPanel': {},
  }
  const { outputText } = ts.transpileModule(`${source}\nexport { ModelCombobox, EditFields }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module, module.exports, name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  })
  function render() { cursor = 0; tree = module.exports.ModelCombobox(props) }
  function nodes(node = tree) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodes)
    return [node, ...nodes(node.props?.children ?? null)]
  }
  const input = () => nodes().find(node => node.props?.role === 'combobox')
  function event(name, value) { input().props[name](value); render() }
  render()
  return {
    input, event, props, nodes,
    fields: draft => module.exports.EditFields({ draft, onChange() {}, candidates, modelsLoading: false, modelsError: null, onRefreshModels() {} }),
    options: () => nodes().filter(node => node.props?.role === 'option').map(node => node.props.children),
    key: key => event('onKeyDown', { key, preventDefault() {} }),
    select: index => { nodes().filter(node => node.props?.role === 'option')[index].props.onClick(); render() },
  }
}

for (const [provider, candidates] of [
  ['OpenAI', ['gpt-first', 'gpt-second', 'o3']],
  ['Google', ['gemini-first', 'gemini-second', 'embedding']],
]) {
  test(`${provider}: 기존 값 포커스·검색·선택·재열기·직접입력`, () => {
    const h = harness(provider, candidates[0], candidates)
    h.event('onFocus')
    assert.deepEqual(h.options(), candidates)
    assert.equal(h.input().props.value, candidates[0])
    h.event('onChange', { target: { value: 'SECOND' } })
    assert.deepEqual(h.options(), [candidates[1]])
    h.key('ArrowDown')
    assert.equal(h.input().props['aria-activedescendant'], 'models-0')
    h.key('Enter')
    assert.equal(h.props.value, candidates[1])
    assert.equal(h.input().props['aria-expanded'], false)
    h.event('onClick')
    assert.deepEqual(h.options(), candidates)
    h.select(0)
    assert.equal(h.props.value, candidates[0])
    h.event('onFocus')
    assert.deepEqual(h.options(), candidates)
    h.event('onChange', { target: { value: 'custom-unlisted-model' } })
    assert.deepEqual(h.options(), [])
    h.key('Enter')
    assert.equal(h.props.value, 'custom-unlisted-model')
    h.event('onBlur')
    assert.equal(h.input().props['aria-expanded'], false)
  })
  test(`${provider}: 검색 결과가 없어도 Escape 뒤 방향키는 전체 후보를 연다`, () => {
    const h = harness(provider, candidates[0], candidates)
    h.event('onFocus')
    h.event('onChange', { target: { value: 'no-match' } })
    h.key('Escape')
    assert.equal(h.input().props['aria-expanded'], false)
    h.key('ArrowDown')
    assert.deepEqual(h.options(), candidates)
    assert.equal(h.input().props['aria-activedescendant'], 'models-0')
    h.key('ArrowUp')
    assert.equal(h.input().props['aria-activedescendant'], 'models-2')
    h.key('Enter')
    assert.equal(h.props.value, candidates[2])
    h.key('ArrowUp')
    assert.deepEqual(h.options(), candidates)
    assert.equal(h.input().props['aria-activedescendant'], 'models-2')
  })
}
test('값이 채워져도 입력·출력 단가 단위와 비용 추정 안내가 보인다', () => {
  const h = harness('OpenAI', 'gpt-first', [])
  const tree = h.fields({ provider: 'OpenAI', model: 'gpt-first', inputPricePer1m: '1000', outputPricePer1m: '2000', remarks: '' })
  const labels = h.nodes(tree).filter(node => node.type === 'label')
  assert.equal(labels.length, 2)
  assert.equal(labels[0].props.children[0], '입력 단가 (원/100만 토큰)')
  assert.equal(labels[1].props.children[0], '출력 단가 (원/100만 토큰)')
  assert.equal(h.nodes(labels[0]).find(node => node.type === 'input').props.value, '1000')
  assert.equal(h.nodes(labels[1]).find(node => node.type === 'input').props.value, '2000')
  assert.ok(h.nodes(tree).some(node => node.type === 'p' && node.props.children.includes('토큰 한도가 아닙니다')))
})
