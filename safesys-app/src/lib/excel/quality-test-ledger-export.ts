// 품질검사 실시대장 엑셀 내보내기 — 건설기술 진흥법 시행규칙 별지 제42호서식 (A4 가로)

import ExcelJS from 'exceljs'
import { QualityTestRecord } from '@/lib/quality/quality-test-types'
import {
  setCell,
  mergeSet,
  addSignatureImage,
  headerFill,
  downloadWorkbook,
} from '@/lib/excel/quality-excel-utils'

const MIN_ROWS = 10

export async function downloadQualityTestLedgerExcel(
  records: QualityTestRecord[],
  projectName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('품질검사 실시대장', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:4',
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      differentFirst: false,
      differentOddEven: false,
      firstFooter: '&C&P',
      oddFooter: '&C&P',
      evenFooter: '&C&P',
    },
  })

  // 일련번호|연월일|구분|대상재료|공급공장|장소|종목|시험기준|시험결과|판정|품질기술인(성명·서명)|사업관리기술인(성명·서명)|비고 (15열)
  ws.columns = [
    { width: 5 }, // A 일련번호
    { width: 10 }, // B 연월일
    { width: 9 }, // C 시험·검사구분
    { width: 12 }, // D 품질검사 대상 재료
    { width: 13 }, // E 공급받은 공장
    { width: 10 }, // F 시험·검사 장소
    { width: 12 }, // G 시험·검사 종목
    { width: 12 }, // H 시험 기준
    { width: 12 }, // I 시험 결과
    { width: 7 }, // J 판정
    { width: 8 }, // K 품질관리기술인 성명
    { width: 8 }, // L 품질관리기술인 서명
    { width: 8 }, // M 건설사업관리기술인 성명
    { width: 8 }, // N 건설사업관리기술인 서명
    { width: 9 }, // O 비고
  ]

  let r = 1

  // 서식 태그 (좌) / 현장명 (우)
  mergeSet(ws, `A${r}:F${r}`, '■ 건설기술 진흥법 시행규칙 [별지 제42호서식]', {
    size: 9, border: false, align: { horizontal: 'left' },
  })
  mergeSet(ws, `J${r}:O${r}`, projectName ? `[${projectName}]` : '', {
    size: 9, border: false, align: { horizontal: 'right' },
  })
  ws.getRow(r).height = 18
  r++

  // 제목
  mergeSet(ws, `A${r}:O${r}`, '품질검사 실시대장', {
    size: 20, bold: true, align: { horizontal: 'center' },
  })
  ws.getRow(r).height = 40
  r++

  // 헤더 (2행 — 기술인 성명/서명 하위 헤더)
  const headerTop = r
  const headerBottom = r + 1
  const vHeaders: [string, string][] = [
    ['A', '일련\n번호'],
    ['B', '연월일'],
    ['C', '시험ㆍ검사\n구분'],
    ['D', '품질검사\n대상 재료'],
    ['E', '건설자재ㆍ부재를\n공급받은 공장'],
    ['F', '시험ㆍ검사\n장소'],
    ['G', '시험ㆍ검사\n종목'],
    ['H', '시험 기준'],
    ['I', '시험 결과'],
    ['J', '시험 결과\n판정'],
    ['O', '비고'],
  ]
  vHeaders.forEach(([col, label]) => {
    mergeSet(ws, `${col}${headerTop}:${col}${headerBottom}`, label, {
      bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' },
    })
  })
  mergeSet(ws, `K${headerTop}:L${headerTop}`, '품질관리기술인', {
    bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' },
  })
  mergeSet(ws, `M${headerTop}:N${headerTop}`, '건설사업관리\n기술인 확인', {
    bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' },
  })
  ;(['K', 'M'] as const).forEach((col) => {
    setCell(ws, `${col}${headerBottom}`, '성명', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  })
  ;(['L', 'N'] as const).forEach((col) => {
    setCell(ws, `${col}${headerBottom}`, '서명', { bold: true, size: 9, fill: headerFill, align: { horizontal: 'center' } })
  })
  ws.getRow(headerTop).height = 26
  ws.getRow(headerBottom).height = 22
  r = headerBottom + 1

  // 데이터 행 (최소 행 수 유지로 원본 서식 느낌 유지)
  const rowCount = Math.max(records.length, MIN_ROWS)
  const signatureCells: { signature: string | undefined; col: number; row: number }[] = []
  for (let i = 0; i < rowCount; i++) {
    const record = records[i]
    const previous = records[i - 1]
    const isSameSerial =
      record?.serial_no !== null &&
      record?.serial_no !== undefined &&
      previous?.serial_no === record.serial_no
    const getDisplayValue = (
      field: 'test_date' | 'test_category' | 'target_material' | 'supplier_factory' | 'test_place'
    ) => (isSameSerial && previous?.[field] === record?.[field] ? '' : record?.[field] || '')
    setCell(ws, `A${r}`, record ? (isSameSerial ? '' : (record.serial_no ?? i + 1)) : '', {
      size: 9,
      align: { horizontal: 'center' },
    })
    setCell(ws, `B${r}`, getDisplayValue('test_date'), { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `C${r}`, getDisplayValue('test_category'), { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `D${r}`, getDisplayValue('target_material'), { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `E${r}`, getDisplayValue('supplier_factory'), { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `F${r}`, getDisplayValue('test_place'), { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `G${r}`, record?.test_item || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `H${r}`, record?.test_standard || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `I${r}`, record?.test_result || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `J${r}`, record?.result_verdict || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `K${r}`, record?.quality_engineer_name || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `L${r}`, '', {})
    setCell(ws, `M${r}`, record?.supervision_engineer_name || '', { size: 9, align: { horizontal: 'center' } })
    setCell(ws, `N${r}`, '', {})
    setCell(ws, `O${r}`, record?.note || '', { size: 9, align: { horizontal: 'center' } })
    if (record) {
      signatureCells.push({ signature: record.quality_engineer_signature, col: 11.05, row: r })
      signatureCells.push({ signature: record.supervision_engineer_signature, col: 13.05, row: r })
    }
    ws.getRow(r).height = 30
    r++
  }

  signatureCells.forEach((item) => {
    addSignatureImage(workbook, ws, item.signature, item.col, item.row, 55, 24)
  })

  const filename = `품질검사실시대장_${new Date().toISOString().split('T')[0]}.xlsx`
  await downloadWorkbook(workbook, filename)
}
