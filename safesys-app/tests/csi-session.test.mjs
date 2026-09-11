// CSI 로그인·로그아웃 요청 형식과 성공/실패 판정을 fetch 모킹으로 검증한다.
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

const calls = []
let respond = () => {
  throw new Error('응답이 준비되지 않았다')
}
const fakeFetch = async (url, init) => {
  calls.push({ url, init, params: Object.fromEntries(new URLSearchParams(init?.body || '')) })
  return respond(url, init)
}

// 실측 응답 헤더를 흉내 낸 최소 Response
const makeResponse = ({ status, location = null, setCookie = [], body = '' }) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get: (name) => (name.toLowerCase() === 'location' ? location : null),
    getSetCookie: () => setCookie,
  },
  text: async () => body,
})

const SUCCESS = {
  status: 302,
  location: 'https://gcloud.csi.go.kr/cmq/qts/sQltRptList.do;jsessionid=abc.cmq01',
  setCookie: [
    'WMONID=RQU2LV2gCgz; Expires=Thu, 09-Sep-2027 11:11:24 GMT; Path=/',
    'JSESSIONID=sgB9xvomXGdIV2T9fvo2Stdi0VUl0A8Y4VAp0hXu.cmq01; path=/cmq',
  ],
}

const FAIL_BODY = `<html><head><script type="text/javascript">
        alert('아이디를 찾을 수 없습니다.')
        history.back();
    </script></head><body class="error-page"></body></html>`

const session = await loadTypeScript('../src/lib/quality/csi-session.ts', {}, { fetch: fakeFetch })
const { loginCsi, logoutCsi, CsiLoginError } = session

test('302 + 자체 품질시험 목록 Location이면 Set-Cookie를 Cookie 헤더 문자열로 모은다', async () => {
  calls.length = 0
  respond = () => makeResponse(SUCCESS)
  const { cookie } = await loginCsi('tester', 'secret')

  assert.equal(
    cookie,
    'WMONID=RQU2LV2gCgz; JSESSIONID=sgB9xvomXGdIV2T9fvo2Stdi0VUl0A8Y4VAp0hXu.cmq01',
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://gcloud.csi.go.kr/cmq/com/loginProc.do')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.redirect, 'manual')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(
    calls[0].init.headers['Content-Type'],
    'application/x-www-form-urlencoded; charset=UTF-8',
  )
  assert.equal(calls[0].params.userId, 'tester')
  assert.equal(calls[0].params.pswd, 'secret')
  assert.equal(calls[0].params.nextUrl, '/qts/sQltRptList.do')
  assert.equal(calls[0].params.bbsId, '')
  assert.equal(calls[0].params.reprtSeq, '')
})

test('200 + alert 응답이면 alert 문구를 그대로 로그인 오류로 올린다', async () => {
  respond = () => makeResponse({ status: 200, body: FAIL_BODY })
  await assert.rejects(loginCsi('tester', 'wrong'), (err) => {
    assert.ok(err instanceof CsiLoginError)
    assert.equal(err.message, '아이디를 찾을 수 없습니다.')
    return true
  })
})

test('alert 문구가 없는 실패 응답이면 기본 문구를 쓴다', async () => {
  respond = () => makeResponse({ status: 200, body: '<html><body>점검 중입니다.</body></html>' })
  await assert.rejects(loginCsi('tester', 'wrong'), (err) => {
    assert.ok(err instanceof CsiLoginError)
    assert.equal(err.message, 'CSI 로그인에 실패했습니다.')
    return true
  })
})

test('alert 문구의 제어문자를 지우고 200자로 자른다', async () => {
  const noisy = `줄바꿈\n섞인\t문구 ${'가'.repeat(300)}`
  respond = () =>
    makeResponse({ status: 200, body: `<script>alert('${noisy}')</script>` })
  const err = await loginCsi('tester', 'wrong').catch((e) => e)

  assert.equal(err.message.length, 200)
  assert.ok(err.message.startsWith('줄바꿈 섞인 문구 가가가'))
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(err.message), '제어문자가 남으면 안 된다')
})

test('302여도 목록이 아닌 곳으로 보내면 로그인 실패로 본다', async () => {
  respond = () => makeResponse({ status: 302, location: 'https://gcloud.csi.go.kr/cmq/com/error.do' })
  await assert.rejects(loginCsi('tester', 'secret'), CsiLoginError)
})

test('성공 응답인데 쿠키가 없으면 로그인 실패로 본다', async () => {
  respond = () => makeResponse({ ...SUCCESS, setCookie: [] })
  await assert.rejects(loginCsi('tester', 'secret'), CsiLoginError)
})

test('외부 도메인 또는 경로의 일부만 일치하는 리다이렉트를 거부한다', async () => {
  for (const location of ['https://example.com/cmq/qts/sQltRptList.do', '/cmq/qts/sQltRptList.do.invalid', '/cmq/com/error.do?next=sQltRptList.do']) {
    respond = () => makeResponse({ ...SUCCESS, location })
    await assert.rejects(loginCsi('tester', 'secret'), CsiLoginError)
  }
})

test('오류 메시지에 비밀번호가 섞이지 않는다', async () => {
  respond = () => makeResponse({ status: 200, body: FAIL_BODY })
  const err = await loginCsi('tester', 'shrPwExample!').catch((e) => e)
  assert.ok(!err.message.includes('shrPwExample!'))
  assert.ok(!String(err.stack).includes('shrPwExample!'))
})

test('로그아웃은 쿠키를 실어 호출하고 실패해도 예외를 올리지 않는다', async () => {
  calls.length = 0
  respond = () => makeResponse({ status: 302, location: 'https://gcloud.csi.go.kr/cmq/index.do' })
  await logoutCsi('WMONID=a; JSESSIONID=b')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://gcloud.csi.go.kr/cmq/com/logoutProc.do')
  assert.equal(calls[0].init.headers.Cookie, 'WMONID=a; JSESSIONID=b')

  respond = () => {
    throw new Error('network down')
  }
  await logoutCsi('WMONID=a')
})
