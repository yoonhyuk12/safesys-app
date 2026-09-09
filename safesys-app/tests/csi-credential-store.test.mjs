// CSI 자격증명의 기기 저장(localStorage) 왕복·삭제와 저장소를 못 쓰는 상황의 처리를 검증한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const require = (name) => {
    assert.ok(name in dependencies, `예상하지 못한 의존성 ${name}`)
    return dependencies[name]
  }
  new Function('module', 'exports', 'require', ...Object.keys(globals), outputText)(
    module, module.exports, require, ...Object.values(globals),
  )
  return module.exports
}

const STORAGE_KEY = 'safesys.csi.credentials'

// Map으로 흉내 낸 localStorage
const makeStorage = () => {
  const map = new Map()
  return {
    map,
    api: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
  }
}

// window를 globals로 주입해야 모듈 안의 `window` 참조를 우리가 쥘 수 있다
const loadStore = (window) => loadTypeScript('../src/lib/quality/csi-credential-store.ts', {}, { window })

test('저장한 아이디·비밀번호를 그대로 읽어온다 (한글 비밀번호 포함)', async () => {
  const storage = makeStorage()
  const store = await loadStore({ localStorage: storage.api })
  const credentials = { userId: 'tester01', password: '한글비밀번호!@#가나다' }

  store.saveCsiCredentials(credentials)
  assert.deepEqual(store.loadCsiCredentials(), credentials)

  const raw = storage.map.get(STORAGE_KEY)
  assert.ok(raw, '저장 키에 값이 있어야 한다')
  assert.ok(!raw.includes('한글비밀번호'), '평문 그대로 남으면 안 된다')
  assert.ok(!raw.includes('tester01'), '평문 그대로 남으면 안 된다')
})

test('저장된 값이 없으면 null이다', async () => {
  const store = await loadStore({ localStorage: makeStorage().api })
  assert.equal(store.loadCsiCredentials(), null)
})

test('삭제하면 다시 null이 된다', async () => {
  const storage = makeStorage()
  const store = await loadStore({ localStorage: storage.api })
  store.saveCsiCredentials({ userId: 'tester01', password: 'pw' })
  store.clearCsiCredentials()

  assert.equal(store.loadCsiCredentials(), null)
  assert.equal(storage.map.has(STORAGE_KEY), false)
})

test('형식이 깨진 값은 없는 것으로 본다', async () => {
  const storage = makeStorage()
  storage.map.set(STORAGE_KEY, '!!! base64가 아닌 값 !!!')
  const store = await loadStore({ localStorage: storage.api })
  assert.equal(store.loadCsiCredentials(), null)
})

test('localStorage 접근이 예외를 던져도 null을 주고 저장·삭제는 조용히 넘어간다', async () => {
  const throwing = {
    get localStorage() {
      throw new Error('저장소 접근이 차단됨')
    },
  }
  const store = await loadStore(throwing)

  assert.equal(store.loadCsiCredentials(), null)
  store.saveCsiCredentials({ userId: 'tester01', password: 'pw' })
  store.clearCsiCredentials()
})

test('저장소 메서드가 예외를 던져도 조회 흐름을 막지 않는다', async () => {
  const boom = () => {
    throw new Error('용량 초과')
  }
  const store = await loadStore({ localStorage: { getItem: boom, setItem: boom, removeItem: boom } })

  assert.equal(store.loadCsiCredentials(), null)
  store.saveCsiCredentials({ userId: 'tester01', password: 'pw' })
  store.clearCsiCredentials()
})

test('window가 없는 서버 렌더링에서는 아무것도 하지 않는다', async () => {
  const store = await loadStore(undefined)

  assert.equal(store.loadCsiCredentials(), null)
  store.saveCsiCredentials({ userId: 'tester01', password: 'pw' })
  store.clearCsiCredentials()
})
