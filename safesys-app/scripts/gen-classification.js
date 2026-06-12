// public/장비. 인부 구분.xlsx → docs MD + 표준 분류 TS 생성 (1회성 스크립트)
const ExcelJS = require('exceljs')
const fs = require('fs')

const wb = new ExcelJS.Workbook()
wb.xlsx.readFile('public/장비. 인부 구분.xlsx').then(() => {
  const eq = new Map() // 장비명 -> 규격[]
  const workerGroups = new Map() // 직종그룹 -> 직종명[]

  wb.eachSheet(ws => {
    const isEq = ws.name.includes('장비')
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (rn <= 2) return // 제목/헤더 행 제외
      const a = (row.getCell(1).text || '').trim()
      const b = (row.getCell(2).text || '').trim()
      if (!a) return
      if (isEq) {
        if (!eq.has(a)) eq.set(a, [])
        if (b) eq.get(a).push(b)
      } else {
        const g = b || '기타'
        if (!workerGroups.has(g)) workerGroups.set(g, [])
        workerGroups.get(g).push(a)
      }
    })
  })

  // ── MD 참고 문서
  const workerTotal = [...workerGroups.values()].reduce((s, a) => s + a.length, 0)
  let md = '# 장비·인력 분류 기준\n\n'
  md += '> 출처: `safesys-app/public/장비. 인부 구분.xlsx`\n>\n'
  md += '> 작업일보의 장비투입상황/인력투입상황 분류 시 이 목록의 명칭을 표준으로 사용한다.\n'
  md += '> 목록에 없거나 구분이 애매한 항목은 **기타(미분류)** 로 분류한다.\n>\n'
  md += '> AI 분류용 표준 명칭 상수: `src/lib/work-daily-report/standard-classifications.ts` (이 문서와 함께 갱신)\n\n'
  md += `## 장비 구분 (${eq.size}종)\n\n| 장비명 | 규격 |\n|---|---|\n`
  for (const [name, specs] of eq) {
    md += `| ${name} | ${specs.join(', ')} |\n`
  }
  md += `\n## 인부 구분 (${workerTotal}종)\n\n`
  for (const [group, names] of workerGroups) {
    md += `### ${group} (${names.length}종)\n\n${names.join(', ')}\n\n`
  }
  fs.mkdirSync('docs', { recursive: true })
  fs.writeFileSync('docs/장비인력분류.md', md, 'utf8')

  // ── AI 분류용 표준 명칭 상수 (장비명/직종명 고유 목록)
  const eqNames = [...eq.keys()]
  const workerNames = [...new Set([...workerGroups.values()].flat())]
  let ts = '// 표준 장비명/직종 목록 — public/장비. 인부 구분.xlsx 기반 생성 (scripts/gen-classification.js)\n'
  ts += '// 규격 포함 전체 목록: docs/장비인력분류.md 참고\n'
  ts += '// 작업일보 AI 분류(work-daily-classify)에서 표준 명칭 매칭에 사용\n\n'
  ts += `export const STANDARD_EQUIPMENT_NAMES: string[] = ${JSON.stringify(eqNames, null, 2)}\n\n`
  ts += `export const STANDARD_WORKER_TYPES: string[] = ${JSON.stringify(workerNames, null, 2)}\n`
  fs.writeFileSync('src/lib/work-daily-report/standard-classifications.ts', ts, 'utf8')

  console.log('docs/장비인력분류.md:', fs.statSync('docs/장비인력분류.md').size, 'bytes')
  console.log('standard-classifications.ts:', fs.statSync('src/lib/work-daily-report/standard-classifications.ts').size, 'bytes')
  console.log('장비명:', eqNames.length, '/ 직종명(중복제거):', workerNames.length)
}).catch(e => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
