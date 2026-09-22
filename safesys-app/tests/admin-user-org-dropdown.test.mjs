// 관리자 가입자 수정 모달의 소속 옵션과 변경·저장 동작을 검증한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/app/admin/users/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(['toProfileDraft', 'EditUserModal', 'ProfileField', 'messageFromError'])
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n')
const constantsSource = readFileSync(new URL('../src/lib/constants.ts', import.meta.url), 'utf8')
const constantsModule = { exports: {} }
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
new Function('exports', compile(constantsSource))(constantsModule.exports)
const { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } = constantsModule.exports

function mount(overrides = {}) {
  const states = []
  let cursor = 0
  let saved
  const useState = initial => {
    const index = cursor++
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
    return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
  }
  const exports = {}
  new Function('require', 'exports', 'useState', 'HEADQUARTERS_OPTIONS', 'BRANCH_OPTIONS', 'FIELD_CLASS', 'ROLES', 'X', compile(`${functions}\nexports.Modal = EditUserModal`))(
    require, exports, useState, HEADQUARTERS_OPTIONS, BRANCH_OPTIONS, 'existing-field-class', ['발주청', '감리단', '시공사'], () => null,
  )
  const user = { id: 'user-1', role: '발주청', has_profile: true, hq_division: '경기', branch_division: '고양지사', ...overrides }
  const render = () => { cursor = 0; return exports.Modal({ user, onClose() {}, async onSave(id, profile) { saved = { id, profile } } }) }
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)]
  const select = label => {
    const wrapper = all(render()).find(node => node.type === 'label' && all(node.props.children).some(child => child.type === 'span' && child.props.children === label))
    const result = all(wrapper).find(node => node.type === 'select')
    assert.ok(result, `${label} select exists`)
    return result
  }
  return {
    company: () => {
      const field = all(render()).find(node => node.props?.label === '회사')
      return all(field.type(field.props)).find(node => node.type === 'input')
    },
    role: value => all(render()).find(node => node.type === 'select' && node.props.value === states[0].role).props.onChange({ target: { value } }),
    select,
    options: label => all(select(label)).filter(node => node.type === 'option').map(node => node.props.value),
    change: (label, value) => select(label).props.onChange({ target: { value } }),
    async saveName() {
      all(render()).find(node => node.props?.label === '이름').props.onChange('수정 이름')
      await all(render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
      return saved
    },
  }
}

test('본부와 지사는 공용 옵션·빈 값·기존 스타일을 사용하고 필수가 아니다', () => {
  const modal = mount()
  assert.deepEqual(modal.options('본부'), ['', ...HEADQUARTERS_OPTIONS])
  assert.deepEqual(modal.options('지사'), ['', ...BRANCH_OPTIONS['경기']])
  for (const label of ['본부', '지사']) {
    assert.equal(modal.select(label).props.className, 'existing-field-class')
    assert.ok(!modal.select(label).props.required)
  }
})

test('발주청 회사는 한국농어촌공사로 고정 표시하고 다른 역할은 편집 가능하다', () => {
  const modal = mount({ company_name: '시공 회사' })
  assert.equal(modal.company().props.value, '한국농어촌공사')
  assert.equal(modal.company().props.readOnly, true)
  modal.role('시공사')
  assert.equal(modal.company().props.value, '시공 회사')
  assert.equal(modal.company().props.readOnly, false)
  modal.company().props.onChange({ target: { value: '새 회사' } })
  assert.equal(modal.company().props.value, '새 회사')
  modal.role('발주청')
  assert.equal(modal.company().props.value, '한국농어촌공사')
  modal.role('감리단')
  assert.equal(modal.company().props.readOnly, false)
  assert.equal(modal.company().props.value, '새 회사')
})

test('본부 변경은 부적합 지사를 비우고 호환 지사는 유지한다', () => {
  const modal = mount()
  modal.change('본부', '충남')
  assert.equal(modal.select('지사').props.value, '')
  assert.deepEqual(modal.options('지사'), ['', ...BRANCH_OPTIONS['충남']])
  modal.change('지사', '지하수지질부')
  modal.change('본부', '강원')
  assert.equal(modal.select('지사').props.value, '지하수지질부')
  modal.change('본부', '')
  assert.equal(modal.select('지사').props.value, '')
  assert.deepEqual(modal.options('지사'), [''])
})

test('초기 레거시 소속은 표시하고 이름만 바꿔 저장해도 보존한다', async () => {
  for (const [hq, branch] of [['옛 본부', '옛 지사'], ['경기', '옛 지사'], ['', '옛 지사']]) {
    const modal = mount({ hq_division: hq, branch_division: branch })
    assert.ok(modal.options('본부').includes(hq))
    assert.ok(modal.options('지사').includes(branch))
    const saved = await modal.saveName()
    assert.equal(saved.id, 'user-1')
    assert.equal(saved.profile.full_name, '수정 이름')
    assert.equal(saved.profile.hq_division, hq)
    assert.equal(saved.profile.branch_division, branch)
    modal.change('본부', '충남')
    assert.equal(modal.select('지사').props.value, '')
    assert.ok(!modal.options('지사').includes(branch))
  }
})

test('기존 역할별 필드 노출과 빈 소속 저장을 유지한다', async () => {
  for (const role of ['발주청', '감리단', '시공사']) {
    const modal = mount({ role, hq_division: null, branch_division: null })
    assert.equal(modal.select('본부').props.value, '')
    assert.equal(modal.select('지사').props.value, '')
    const { profile } = await modal.saveName()
    assert.equal(profile.role, role)
    assert.equal(profile.hq_division, '')
    assert.equal(profile.branch_division, '')
  }
})
