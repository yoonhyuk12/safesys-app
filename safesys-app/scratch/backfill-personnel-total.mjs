// tbm_submissions.personnel_total_count 백필 스크립트
// 기존 personnel_count(자유 텍스트)에서 총 투입인원을 추정해 NULL인 행만 채운다.
// 앱(src/lib/chat/tbm-personnel.ts)과 동일한 휴리스틱을 사용해 값 불일치를 방지한다.
// 사용법: node scratch/backfill-personnel-total.mjs           (dry-run, 읽기만)
//        node scratch/backfill-personnel-total.mjs --apply   (실제 업데이트)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// --- .env.local 로드 (safesys-app/.env.local) ---
const here = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(here, '..', '.env.local'), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY를 .env.local에서 찾지 못했습니다.')
  process.exit(1)
}

// --- 앱과 동일한 총원 추정 로직 (검증 완료) ---
function parsePersonnelCount(text) {
  if (!text) return 0
  const declaredRegex = /(?:총\s*원|총\s*인원|총\s*인력|총\s*계|합\s*계|전\s*체(?:\s*인원)?|총)\s*[:\-]?\s*(\d+)\s*명?/g
  let declaredTotal = 0
  let hasDeclared = false
  for (const match of text.matchAll(declaredRegex)) {
    hasDeclared = true
    declaredTotal += parseInt(match[1], 10)
  }
  if (hasDeclared) return declaredTotal

  const cleaned = text
    .replace(/\d{1,2}[ \t]*시(?:[ \t]*\d{1,2})?(?:[ \t]*분)?/g, ' ')
    .replace(/\d{1,2}[ \t]*분/g, ' ')
    .replace(/\d{1,2}[ \t]*:[ \t]*\d{2}/g, ' ')
    .replace(/\d+[ \t]*팀/g, ' ')

  let total = 0
  const working = cleaned.replace(/(\d+)\s*인\s*(\d+)\s*조/g, (_m, perTeam, teams) => {
    total += parseInt(perTeam, 10) * parseInt(teams, 10)
    return ' '
  })
  const numbers = working.match(/\d+/g)
  if (numbers) total += numbers.reduce((s, n) => s + parseInt(n, 10), 0)
  return total
}

// 선언된 총원(총원/합계/전체/총 N명)이 텍스트에 있는지 여부
function hasDeclaredTotal(text) {
  return /(?:총\s*원|총\s*인원|총\s*인력|총\s*계|합\s*계|전\s*체(?:\s*인원)?|총)\s*[:\-]?\s*\d+\s*명?/.test(text)
}

const APPLY = process.argv.includes('--apply')
const CAP = 60 // 비선언(단순 합산) 행의 신뢰 상한. 초과하면 중복합산/잡음으로 보고 NULL 유지.
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// --- personnel_total_count가 NULL인 행 전부 조회 (페이지네이션) ---
async function fetchNullRows() {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('tbm_submissions')
      .select('id, personnel_count, today_work')
      .is('personnel_total_count', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  console.log(`모드: ${APPLY ? '★ APPLY (실제 업데이트)' : 'DRY-RUN (읽기만, 쓰기 없음)'}`)
  const rows = await fetchNullRows()
  console.log(`personnel_total_count가 NULL인 행: ${rows.length}건`)

  // 내용이 있는 행만 대상 (빈 personnel_count는 정보가 없어 NULL 유지)
  const byTotal = new Map() // total -> [id...] (휴리스틱 합산으로 채울 행)
  const zeroIds = []        // 작업없음 등 → 0으로 채울 행
  const skipped = []        // 비선언 + 상한 초과로 NULL 유지
  let skippedMissing = 0    // 작업기록은 있고 인원만 빈값 → NULL 유지(데이터 없음)
  for (const row of rows) {
    const text = (row.personnel_count || '').trim()
    const work = (row.today_work || '').trim()
    // 작업없음, 또는 작업·인원 모두 빈값 → 투입인원 0
    if (work === '작업없음' || (work === '' && text === '')) { zeroIds.push(row.id); continue }
    // 작업기록은 있는데 인원만 비어 있으면 '미기재'로 보고 NULL 유지
    if (!text) { skippedMissing++; continue }
    const t = parsePersonnelCount(text)
    // 선언된 총원은 크기와 무관하게 신뢰. 비선언은 상한 이하만 채운다.
    if (!hasDeclaredTotal(text) && t > CAP) { skipped.push({ t, text }); continue }
    if (!byTotal.has(t)) byTotal.set(t, [])
    byTotal.get(t).push(row.id)
  }

  const targetCount = [...byTotal.values()].reduce((s, ids) => s + ids.length, 0)
  console.log(`작업없음/공란 → 0 처리: ${zeroIds.length}건`)
  console.log(`인원 미기재(작업기록만 있음, NULL 유지): ${skippedMissing}건`)
  console.log(`비선언 + ${CAP}명 초과(NULL 유지): ${skipped.length}건`)
  console.log(`휴리스틱 합산 채움: ${targetCount}건`)
  console.log('\n총원값 분포 (값: 건수):')
  const dist = [...byTotal.entries()].sort((a, b) => a[0] - b[0])
  for (const [t, ids] of dist) console.log(`  ${String(t).padStart(4)} : ${ids.length}`)

  if (!APPLY) {
    console.log(`\nNULL로 남길 비선언 초과 행: ${skipped.length}건 (텍스트 일부)`)
    for (const s of skipped.sort((a, b) => b.t - a.t).slice(0, 40)) {
      console.log(`  [${String(s.t).padStart(4)}] ${JSON.stringify(s.text.slice(0, 70))}`)
    }
    console.log('\nDRY-RUN 종료. 실제 적용하려면 --apply 플래그로 다시 실행하세요.')
    return
  }

  // --- 동일 총원값끼리 묶어 .in()으로 일괄 업데이트 (NULL 행만, 재실행 안전) ---
  let updated = 0
  for (const [t, ids] of byTotal) {
    for (const ch of chunk(ids, 200)) {
      const { error } = await supabase
        .from('tbm_submissions')
        .update({ personnel_total_count: t })
        .in('id', ch)
        .is('personnel_total_count', null)
      if (error) throw error
      updated += ch.length
      process.stdout.write(`\r합산 채움 진행: ${updated}/${targetCount}`)
    }
  }
  if (targetCount > 0) console.log('')

  // --- 작업없음/공란 → 0 (NULL 행만) ---
  let zeroed = 0
  for (const ch of chunk(zeroIds, 200)) {
    const { error } = await supabase
      .from('tbm_submissions')
      .update({ personnel_total_count: 0 })
      .in('id', ch)
      .is('personnel_total_count', null)
    if (error) throw error
    zeroed += ch.length
    process.stdout.write(`\r0 처리 진행: ${zeroed}/${zeroIds.length}`)
  }
  console.log(`\n완료: 합산 ${updated}건, 0 처리 ${zeroed}건`)
}

main().catch(err => { console.error('\n오류:', err.message || err); process.exit(1) })
