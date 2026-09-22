// 순회점검 양식(public/순회점검 양식.hwpx) 표1의 점검사항을 10행에서 13행으로 늘린다. 표 높이 합은 56291로 유지한다.
// 실행 — safesys-app에서 `node scripts/patrol-ledger-template-add-rows.mjs` (한 번만 적용, 이미 17행이면 중단)
import { readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'

const PATH = new URL('../public/순회점검 양식.hwpx', import.meta.url)
const ITEM_ROW_HEIGHT = 2600
const PHOTO_ROW_HEIGHT = 15870

const zip = await JSZip.loadAsync(await readFile(PATH))
const section = await zip.file('Contents/section0.xml').async('string')
const tableStart = section.indexOf('<hp:tbl ')
const tableEnd = section.indexOf('</hp:tbl>', tableStart) + '</hp:tbl>'.length
let table = section.slice(tableStart, tableEnd)
if (!table.includes('rowCnt="14"')) throw new Error('표1이 14행이 아닙니다. 이미 변환했거나 양식이 다릅니다.')

const rows = [...table.matchAll(/<hp:tr>[\s\S]*?<\/hp:tr>/g)].map(match => match[0])
if (rows.length !== 14) throw new Error(`표1 행 수가 14가 아닙니다. ${rows.length}`)

const retarget = (row, from, to) => row.replaceAll(`rowAddr="${from}"`, `rowAddr="${to}"`)
// 셀 단위로 본문만 바꾼다 — 행 전체 정규식은 번호 칸(0열)의 <hp:t>를 잘못 잡는다.
const setCellText = (row, col, text) => {
  const cells = [...row.matchAll(/<hp:tc [\s\S]*?<\/hp:tc>/g)].map(match => match[0])
  if (cells.length !== 3) throw new Error(`항목 행의 셀 수가 3이 아닙니다. ${cells.length}`)
  const edited = cells[col].replace(/<hp:t>[^<]*<\/hp:t>/, `<hp:t>${text}</hp:t>`)
  return row.replace(cells[col], edited)
}
const lastItem = rows[12]
if (!lastItem.includes('<hp:t>10</hp:t>')) throw new Error('12행에서 번호 10 셀을 찾지 못했습니다.')
const clones = [13, 14, 15].map(rowAddr => setCellText(setCellText(retarget(lastItem, 12, rowAddr), 0, String(rowAddr - 2)), 1, ' (TBM 대책) 당일 TBM 대책 이행 여부'))
const photoRow = retarget(rows[13], 13, 16).replaceAll('height="18750"', `height="${PHOTO_ROW_HEIGHT}"`)
const itemRows = [...rows.slice(3, 13), ...clones].map(row => row.replaceAll('height="3092"', `height="${ITEM_ROW_HEIGHT}"`))
const rebuilt = [...rows.slice(0, 3), ...itemRows, photoRow]
const firstRow = table.indexOf('<hp:tr>')
const lastRowEnd = table.lastIndexOf('</hp:tr>') + '</hp:tr>'.length
table = table.slice(0, firstRow) + rebuilt.join('') + table.slice(lastRowEnd)
table = table.replace('rowCnt="14"', 'rowCnt="17"')

const heights = [...table.matchAll(/<hp:cellAddr colAddr="0" rowAddr="(\d+)"\/><hp:cellSpan[^>]*\/><hp:cellSz width="\d+" height="(\d+)"\/>/g)].map(match => Number(match[2]))
const sum = heights.reduce((total, height) => total + height, 0)
if (heights.length !== 17 || sum !== 56291) throw new Error(`행 높이 합이 56291이 아닙니다. 행 ${heights.length}, 합 ${sum}`)

const output = new JSZip()
output.file('mimetype', 'application/hwp+zip', { compression: 'STORE' })
for (const entry of Object.values(zip.files)) {
  if (entry.name === 'mimetype' || entry.dir) continue
  output.file(entry.name, entry.name === 'Contents/section0.xml' ? section.slice(0, tableStart) + table + section.slice(tableEnd) : await entry.async('uint8array'))
}
await writeFile(PATH, await output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/hwp+zip' }))
console.log(`표1을 17행으로 변환했습니다. 행 높이 합 ${sum}`)
