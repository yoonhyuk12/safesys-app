// 자체 유해·위험요인 DB 엑셀을 risk_hazards / risk_hazard_measures 테이블로 적재하는 1회성 임포트 스크립트
// 실행: node scripts/import-risk-hazards.js  (safesys-app 에서, .env.local 의 service role 키 사용)
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const SOURCE_XLSX = 'C:\\Users\\EKR\\Desktop\\위험성평가\\자체 유해·위험요인 DB.xlsx'
const SHEET_NAME = '위험요인 도출표(최종)'
const HEADER_ROW_INDEX = 2 // 3행째가 헤더, 데이터는 4행째부터
const BATCH_SIZE = 500

// 원본 열 순서 (헤더 행과 일치)
const COL = {
  no: 0,
  businessType: 1,
  construction: 2,
  unitWork: 3,
  detailWork: 4,
  hazard: 5,
  disasterType: 6,
  measure: 7,
  relatedLaw: 8,
  workPermit: 9,
  flagSerious: 10,
  flagAccidentCase: 11,
  flagNearMiss: 12,
  flagSif: 13,
  flagProfile: 14,
}

// .env.local 에서 필요한 키만 읽는다 (dotenv 미의존)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const text = fs.readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) env[match[1]] = match[2].trim()
  }
  return env
}

// 셀 내 줄바꿈은 공백 하나로 정규화하고 앞뒤 공백을 제거한다
const norm = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim()

// 값이 있으면(○ 등) true
const flag = (value) => norm(value) !== ''

// 여러 감소대책 행에 흩어진 값을 중복 제거해 이어 붙인다 (관계법령은 대책마다 인용이 달라진다)
const joinDistinct = (values) => [...new Set(values.filter((v) => v !== ''))].join(' / ')

function parseWorkbook() {
  const workbook = XLSX.readFile(SOURCE_XLSX)
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`시트를 찾을 수 없습니다: ${SHEET_NAME}`)

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
  const header = rows[HEADER_ROW_INDEX]
  if (norm(header[COL.no]) !== 'No.' || norm(header[COL.measure]) !== '감소대책') {
    throw new Error(`헤더 행 구조가 예상과 다릅니다: ${JSON.stringify(header)}`)
  }

  const hazards = []
  let current = null

  rows.slice(HEADER_ROW_INDEX + 1).forEach((row, offset) => {
    const excelRow = HEADER_ROW_INDEX + offset + 2 // 1-based 엑셀 행 번호 (오류 메시지용)
    const no = norm(row[COL.no])
    if (no === '' && row.every((cell) => norm(cell) === '')) return

    if (/^\d+$/.test(no)) {
      // No.가 숫자면 새 위험요인
      current = {
        id: hazards.length + 1,
        excel_no: Number(no),
        business_type: norm(row[COL.businessType]),
        construction: norm(row[COL.construction]),
        unit_work: norm(row[COL.unitWork]),
        detail_work: norm(row[COL.detailWork]),
        hazard: norm(row[COL.hazard]),
        disaster_type: [],
        related_law: [],
        work_permit: [],
        flag_serious: false,
        flag_accident_case: false,
        flag_near_miss: false,
        flag_sif: false,
        flag_profile: false,
        measures: [],
      }
      hazards.push(current)
    } else if (no !== '-') {
      throw new Error(`${excelRow}행의 No. 값을 해석할 수 없습니다: "${no}"`)
    } else if (!current) {
      throw new Error(`${excelRow}행: 위험요인 행 없이 "-" 행이 먼저 나왔습니다`)
    }
    // No.가 "-"면 직전 위험요인의 추가 감소대책 행 — 분류·위험요인은 직전 행 값을 그대로 쓴다

    current.disaster_type.push(norm(row[COL.disasterType]))
    current.related_law.push(norm(row[COL.relatedLaw]))
    current.work_permit.push(norm(row[COL.workPermit]))
    if (flag(row[COL.flagSerious])) current.flag_serious = true
    if (flag(row[COL.flagAccidentCase])) current.flag_accident_case = true
    if (flag(row[COL.flagNearMiss])) current.flag_near_miss = true
    if (flag(row[COL.flagSif])) current.flag_sif = true
    if (flag(row[COL.flagProfile])) current.flag_profile = true

    const measure = norm(row[COL.measure])
    if (measure !== '') current.measures.push(measure)
  })

  return hazards.map((h) => ({
    ...h,
    disaster_type: joinDistinct(h.disaster_type),
    related_law: joinDistinct(h.related_law),
    work_permit: joinDistinct(h.work_permit),
  }))
}

async function insertInBatches(supabase, table, rows) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE)
    const { error } = await supabase.from(table).insert(batch)
    if (error) throw new Error(`${table} 적재 실패 (${start}~${start + batch.length}): ${error.message}`)
    process.stdout.write(`\r  ${table}: ${Math.min(start + BATCH_SIZE, rows.length)}/${rows.length}`)
  }
  process.stdout.write('\n')
}

async function main() {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요합니다')
  }
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('엑셀 파싱 중...')
  const hazards = parseWorkbook()
  const measureRows = hazards.flatMap((h) =>
    h.measures.map((measure, index) => ({ hazard_id: h.id, measure, sort_order: index }))
  )
  const hazardRows = hazards.map((hazard) => {
    const row = { ...hazard }
    delete row.measures
    return row
  })
  const excelNoFilled = hazardRows.filter((row) => Number.isInteger(row.excel_no)).length
  console.log(`  위험요인 ${hazardRows.length}건, 감소대책 ${measureRows.length}건, excel_no 채움 ${excelNoFilled}건`)

  // 재실행 안전 — 기존 행을 지우고 새로 적재한다 (감소대책은 CASCADE로 함께 삭제)
  console.log('기존 행 삭제 중...')
  const { error: deleteError } = await supabase.from('risk_hazards').delete().gte('id', 0)
  if (deleteError) throw new Error(`기존 행 삭제 실패: ${deleteError.message}`)

  console.log('적재 중...')
  await insertInBatches(supabase, 'risk_hazards', hazardRows)
  await insertInBatches(supabase, 'risk_hazard_measures', measureRows)

  const { count: hazardCount, error: hazardCountError } = await supabase
    .from('risk_hazards')
    .select('*', { count: 'exact', head: true })
  if (hazardCountError) throw new Error(`위험요인 건수 확인 실패: ${hazardCountError.message}`)

  const { count: measureCount, error: measureCountError } = await supabase
    .from('risk_hazard_measures')
    .select('*', { count: 'exact', head: true })
  if (measureCountError) throw new Error(`감소대책 건수 확인 실패: ${measureCountError.message}`)

  const { count: excelNoCount, error: excelNoCountError } = await supabase
    .from('risk_hazards')
    .select('*', { count: 'exact', head: true })
    .not('excel_no', 'is', null)
  if (excelNoCountError) throw new Error(`excel_no 채움 건수 확인 실패: ${excelNoCountError.message}`)

  console.log(`검증 — 위험요인 DB ${hazardCount} / 스크립트 ${hazardRows.length}`)
  console.log(`검증 — 감소대책 DB ${measureCount} / 스크립트 ${measureRows.length}`)
  console.log(`검증 — excel_no 채움 DB ${excelNoCount} / 스크립트 ${excelNoFilled}`)
  if (hazardCount !== hazardRows.length || measureCount !== measureRows.length || excelNoCount !== excelNoFilled) {
    throw new Error('DB 행 수가 스크립트 집계와 다릅니다')
  }
  console.log('완료')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
