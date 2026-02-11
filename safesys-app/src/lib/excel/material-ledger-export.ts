import ExcelJS from 'exceljs'

interface MaterialLedgerRow {
  nameOrSpec: string
  orderQty: string
  receiveDate: string
  receiveQty: string
  passQtyCurrent: string
  passQtyTotal: string
  failQty: string
  action: string
  releaseDate: string
  releaseQty: string
  remainQty: string
  supervisorConfirm: string
}

const ROWS_PER_PAGE = 25
const TOTAL_COLS = 12 // A~L

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
}

const NUM_FMT = '#,##0'

function numOrDash(val: string): string | number {
  if (!val || val === '-') return val || ''
  const n = parseFloat(val.replace(/,/g, ''))
  if (isNaN(n)) return val
  return n
}

function formatDate(val: string): string {
  if (!val) return ''
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return val
  return `${m[1].slice(2)}-${m[2]}-${m[3]}`
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1]
}

/**
 * 주요자재 수불부 및 검사부 Excel 다운로드
 * 컬럼: A품명/규격 B발주량 C반입일 D반입량 E합격금회 F합격누계 G불합격량 H조치사항 I출고일 J출고량 K잔량 L감독원확인
 */
export async function downloadMaterialLedgerExcel(
  materialName: string,
  materialUnit: string,
  rows: MaterialLedgerRow[],
  projectName?: string,
  supervisorName?: string,
) {
  const wb = new ExcelJS.Workbook()
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))

  for (let page = 0; page < totalPages; page++) {
    const sheetName = totalPages === 1 ? '수불부' : `수불부(${page + 1})`
    const ws = wb.addWorksheet(sheetName)

    // 열 너비 (A~L, 12열) — 세로(portrait) A4
    ws.columns = [
      { width: 14 },  // A: 품명 및 규격
      { width: 11 },  // B: 발주량(설계량)
      { width: 10 },  // C: 반입일
      { width: 9 },   // D: 반입량
      { width: 9 },   // E: 합격량-금회
      { width: 9 },   // F: 합격량-누계
      { width: 9 },   // G: 불합격량
      { width: 11 },  // H: 조치사항
      { width: 10 },  // I: 출고일
      { width: 9 },   // J: 출고량
      { width: 9 },   // K: 잔량(보관)
      { width: 11 },  // L: 감독원확인
    ]

    // ── Row 1: [별지 제2호 서식] ──
    const r1 = ws.addRow(['[별지 제2호 서식]'])
    r1.getCell(1).font = { size: 9, color: { argb: 'FF333333' } }
    r1.height = 20

    // ── Row 2: 빈 행 ──
    ws.addRow([])

    // ── Row 3: 제목 ──
    ws.mergeCells('A3:L3')
    const titleCell = ws.getCell('A3')
    titleCell.value = '주요자재 수불부 및 검사부'
    titleCell.font = { size: 28, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(3).height = 36

    // ── Row 4: 빈 행 ──
    ws.addRow([])

    // ── Row 5: 품명 및 규격 / 단위 ──
    ws.mergeCells('A5:G5')
    const specCell = ws.getCell('A5')
    specCell.value = `품명 및 규격 : ${materialName}`
    specCell.font = { size: 10 }
    specCell.alignment = { horizontal: 'left', vertical: 'middle' }

    ws.mergeCells('J5:L5')
    const unitCell = ws.getCell('J5')
    unitCell.value = `(단위 : ${materialUnit || ''})`
    unitCell.font = { size: 10 }
    unitCell.alignment = { horizontal: 'right', vertical: 'middle' }
    ws.getRow(5).height = 22

    // ── Row 6~7: 2단 헤더 ──
    const hdrRow1 = 6
    const hdrRow2 = 7

    // 품명 및 규격: A6:A7 merge
    ws.mergeCells(`A${hdrRow1}:A${hdrRow2}`)
    const h_spec = ws.getCell(`A${hdrRow1}`)
    h_spec.value = '품명 및\n규격'
    h_spec.font = { size: 9, bold: true }
    h_spec.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_spec.border = thinBorder

    // 발주량(설계량): B6:B7 merge
    ws.mergeCells(`B${hdrRow1}:B${hdrRow2}`)
    const h_order = ws.getCell(`B${hdrRow1}`)
    h_order.value = '발주량\n(설계량)'
    h_order.font = { size: 9, bold: true }
    h_order.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_order.border = thinBorder

    // 반입: C6:D6 merge
    ws.mergeCells(`C${hdrRow1}:D${hdrRow1}`)
    const h_receive = ws.getCell(`C${hdrRow1}`)
    h_receive.value = '반입'
    h_receive.font = { size: 9, bold: true }
    h_receive.alignment = { horizontal: 'center', vertical: 'middle' }
    h_receive.border = thinBorder
    ws.getCell(`D${hdrRow1}`).border = thinBorder

    // 합격량: E6:F6 merge
    ws.mergeCells(`E${hdrRow1}:F${hdrRow1}`)
    const h_pass = ws.getCell(`E${hdrRow1}`)
    h_pass.value = '합격량'
    h_pass.font = { size: 9, bold: true }
    h_pass.alignment = { horizontal: 'center', vertical: 'middle' }
    h_pass.border = thinBorder
    ws.getCell(`F${hdrRow1}`).border = thinBorder

    // 불합격: G6:H6 merge
    ws.mergeCells(`G${hdrRow1}:H${hdrRow1}`)
    const h_fail = ws.getCell(`G${hdrRow1}`)
    h_fail.value = '불합격'
    h_fail.font = { size: 9, bold: true }
    h_fail.alignment = { horizontal: 'center', vertical: 'middle' }
    h_fail.border = thinBorder
    ws.getCell(`H${hdrRow1}`).border = thinBorder

    // 출고: I6:J6 merge
    ws.mergeCells(`I${hdrRow1}:J${hdrRow1}`)
    const h_release = ws.getCell(`I${hdrRow1}`)
    h_release.value = '출고'
    h_release.font = { size: 9, bold: true }
    h_release.alignment = { horizontal: 'center', vertical: 'middle' }
    h_release.border = thinBorder
    ws.getCell(`J${hdrRow1}`).border = thinBorder

    // 잔량(보관): K6:K7 merge
    ws.mergeCells(`K${hdrRow1}:K${hdrRow2}`)
    const h_remain = ws.getCell(`K${hdrRow1}`)
    h_remain.value = '잔량\n(보관)'
    h_remain.font = { size: 9, bold: true }
    h_remain.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_remain.border = thinBorder

    // 감독원확인: L6:L7 merge
    ws.mergeCells(`L${hdrRow1}:L${hdrRow2}`)
    const h_confirm = ws.getCell(`L${hdrRow1}`)
    h_confirm.value = '감독원\n확인'
    h_confirm.font = { size: 9, bold: true }
    h_confirm.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h_confirm.border = thinBorder

    ws.getRow(hdrRow1).height = 22

    // Row 7: 하단 헤더
    //           A    B    C       D       E      F      G         H         I       J       K    L
    const sub = ['', '', '반입일', '반입량', '금회', '누계', '불합격량', '조치사항', '출고일', '출고량', '', '']
    sub.forEach((label, ci) => {
      const cell = ws.getCell(hdrRow2, ci + 1)
      if (label) {
        cell.value = label
      }
      cell.font = { size: 9, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })
    // 병합된 셀 border 보정
    ws.getCell(`A${hdrRow2}`).border = thinBorder
    ws.getCell(`B${hdrRow2}`).border = thinBorder
    ws.getCell(`K${hdrRow2}`).border = thinBorder
    ws.getCell(`L${hdrRow2}`).border = thinBorder
    ws.getRow(hdrRow2).height = 22

    // 헤더 배경색
    for (let r = hdrRow1; r <= hdrRow2; r++) {
      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell = ws.getCell(r, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      }
    }

    // ── 데이터 행 ──
    const startIdx = page * ROWS_PER_PAGE
    const pageRows = rows.slice(startIdx, startIdx + ROWS_PER_PAGE)

    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const dataRow = pageRows[i]
      const hasSignature = dataRow?.supervisorConfirm && dataRow.supervisorConfirm.startsWith('data:image')

      const excelRow = ws.addRow([
        dataRow ? (dataRow.nameOrSpec || '') : '',           // A: 품명/규격
        dataRow ? numOrDash(dataRow.orderQty) : '',          // B: 발주량
        dataRow ? formatDate(dataRow.receiveDate) : '',      // C: 반입일
        dataRow ? numOrDash(dataRow.receiveQty) : '',        // D: 반입량
        dataRow ? numOrDash(dataRow.passQtyCurrent) : '',    // E: 합격-금회
        dataRow ? numOrDash(dataRow.passQtyTotal) : '',      // F: 합격-누계
        dataRow ? (dataRow.failQty || '') : '',              // G: 불합격량
        dataRow ? (dataRow.action || '') : '',               // H: 조치사항
        dataRow ? formatDate(dataRow.releaseDate) : '',      // I: 출고일
        dataRow ? numOrDash(dataRow.releaseQty) : '',        // J: 출고량
        dataRow ? numOrDash(dataRow.remainQty) : '',         // K: 잔량 (실제 값 사용)
        hasSignature ? '' : (dataRow?.supervisorConfirm || ''), // L: 감독원확인
      ])

      const rowNum = excelRow.number
      excelRow.height = 32

      excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= TOTAL_COLS) {
          cell.border = thinBorder
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.font = { size: 9 }
        }
      })

      // 수량 컬럼에 1000단위 콤마 서식 (B, D, E, F, J, K)
      const numCols = [2, 4, 5, 6, 10, 11]
      for (const col of numCols) {
        const cell = excelRow.getCell(col)
        if (typeof cell.value === 'number') {
          cell.numFmt = NUM_FMT
        }
      }

      // 잔량(K) - 웹 내역상 값 그대로 사용
      const kCell = excelRow.getCell(11) // K열
      if (typeof kCell.value === 'number') {
        kCell.numFmt = NUM_FMT
      }
      kCell.border = thinBorder
      kCell.alignment = { horizontal: 'center', vertical: 'middle' }
      kCell.font = { size: 9 }

      // 품명/규격(A) 가운데 정렬
      excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      // 조치사항(H) 가운데 정렬
      excelRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' }

      // 감독원확인(L) 서명 이미지 삽입
      if (hasSignature) {
        try {
          const imgBase64 = dataUrlToBase64(dataRow.supervisorConfirm)
          const imageId = wb.addImage({ base64: imgBase64, extension: 'png' })
          ws.addImage(imageId, {
            tl: { col: 11, row: rowNum - 1 + 0.1 } as ExcelJS.Anchor,
            br: { col: 12, row: rowNum - 1 + 0.9 } as ExcelJS.Anchor,
          })
        } catch {
          excelRow.getCell(12).value = '서명완료'
        }
      }
    }

    // ── 하단 안내문 ──
    const footerRowNum = hdrRow2 + ROWS_PER_PAGE + 1
    ws.addRow([])
    ws.mergeCells(`A${footerRowNum}:L${footerRowNum}`)
    const footerCell = ws.getCell(`A${footerRowNum}`)
    footerCell.value = '* 현장 반입 후 작업장 반출시 까지는 감독원이 관리하고 매 출고시 반출량 및 잔량을 확인'
    footerCell.font = { size: 9, color: { argb: 'FF666666' } }
    footerCell.alignment = { horizontal: 'left', vertical: 'middle' }

    // 인쇄 영역: A~L만 (M열 제외)
    const lastPrintRow = footerRowNum
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printArea: `A1:L${lastPrintRow}`,
      margins: {
        left: 0.5, right: 0.5,
        top: 0.6, bottom: 0.5,
        header: 0.3, footer: 0.3,
      },
    }
  }

  // ── 출고요청서 시트 (데이터 행별 1장씩) ──
  const RELEASE_DATA_ROWS = 10 // 출고요청서 테이블 빈 행 수

  rows.forEach((row, idx) => {
    // 출고량이 없는 행은 건너뜀
    const releaseQtyNum = parseFloat((row.releaseQty || '').replace(/,/g, ''))
    if (!row.releaseDate && (isNaN(releaseQtyNum) || releaseQtyNum === 0)) return

    const sheetLabel = `출고요청서(${idx + 1})`
    const ws = wb.addWorksheet(sheetLabel)

    // 열 너비 (A~E, 5열)
    ws.columns = [
      { width: 18 },  // A: 품명
      { width: 16 },  // B: 규격
      { width: 10 },  // C: 단위
      { width: 14 },  // D: 수량
      { width: 24 },  // E: 사용처
    ]

    // Row 1: [별지 제6호 서식]
    const r1 = ws.addRow(['[별지 제6호 서식]'])
    r1.getCell(1).font = { size: 9, color: { argb: 'FF333333' } }
    r1.height = 20

    // Row 2: 빈 행
    ws.addRow([])

    // Row 3: 제목
    ws.mergeCells('A3:E3')
    const titleCell = ws.getCell('A3')
    titleCell.value = '지급자재 출고 요청서'
    titleCell.font = { size: 28, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(3).height = 48

    // Row 4: 빈 행
    ws.addRow([])

    // Row 5: 테이블 헤더
    const hdrLabels = ['품    명', '규    격', '단  위', '수    량', '사  용  처']
    const hdrRow = ws.addRow(hdrLabels)
    hdrRow.height = 28
    hdrRow.eachCell((cell) => {
      cell.font = { size: 11, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    })

    // Row 6: 실제 데이터 (1행)
    const dataExcelRow = ws.addRow([
      materialName || '',
      row.nameOrSpec || '',
      materialUnit || '',
      numOrDash(row.releaseQty),
      projectName || '',
    ])
    dataExcelRow.height = 32
    dataExcelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 5) {
        cell.border = thinBorder
        // 사용처(E열)는 자동 줄바꿈 적용
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: colNum === 5 }
        cell.font = { size: 10 }
      }
    })
    // 수량에 콤마 서식
    const qtyCell = dataExcelRow.getCell(4)
    if (typeof qtyCell.value === 'number') {
      qtyCell.numFmt = NUM_FMT
    }

    // Row 7~: 나머지 빈 행
    for (let i = 1; i < RELEASE_DATA_ROWS; i++) {
      const emptyRow = ws.addRow(['', '', '', '', ''])
      emptyRow.height = 32
      emptyRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 5) {
          cell.border = thinBorder
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.font = { size: 10 }
        }
      })
    }

    // 계 행
    const totalRowNum = 5 + RELEASE_DATA_ROWS + 1 // 헤더(5) + 데이터행 + 1
    const totalRow = ws.addRow(['계', '', '', numOrDash(row.releaseQty), ''])
    totalRow.height = 32
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 5) {
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.font = { size: 10, bold: colNum === 1 }
      }
    })
    const totalQtyCell = totalRow.getCell(4)
    if (typeof totalQtyCell.value === 'number') {
      totalQtyCell.numFmt = NUM_FMT
    }

    // 빈 행 2줄
    ws.addRow([])
    ws.addRow([])

    // 날짜 행: 출고일 기반
    const dateMatch = (row.releaseDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const yr = dateMatch ? dateMatch[1] : '    '
    const mo = dateMatch ? dateMatch[2] : '  '
    const dy = dateMatch ? dateMatch[3] : '  '

    const dateRowNum = totalRowNum + 3
    ws.mergeCells(`B${dateRowNum}:E${dateRowNum}`)
    const dateCell = ws.getCell(`B${dateRowNum}`)
    dateCell.value = `${yr}년       ${mo}월       ${dy}일`
    dateCell.font = { size: 11 }
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(dateRowNum).height = 28

    // 요청자 행
    const reqRowNum = dateRowNum + 1
    ws.mergeCells(`B${reqRowNum}:D${reqRowNum}`)
    const reqLabel = ws.getCell(`B${reqRowNum}`)
    reqLabel.value = '요청자 : 현장대리인'
    reqLabel.font = { size: 11 }
    reqLabel.alignment = { horizontal: 'center', vertical: 'middle' }
    // E열: 서명란 (비워둠)
    const reqSign = ws.getCell(`E${reqRowNum}`)
    reqSign.value = '(인)'
    reqSign.font = { size: 11 }
    reqSign.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(reqRowNum).height = 32

    // 확인자 행
    const cfmRowNum = reqRowNum + 1
    ws.mergeCells(`B${cfmRowNum}:D${cfmRowNum}`)
    const cfmLabel = ws.getCell(`B${cfmRowNum}`)
    cfmLabel.value = supervisorName ? `확인자 : 공사감독 ${supervisorName}` : '확인자 : 공 사 감 독'
    cfmLabel.font = { size: 11 }
    cfmLabel.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(cfmRowNum).height = 32

    // 감독 서명 이미지 삽입
    const hasSignature = row.supervisorConfirm && row.supervisorConfirm.startsWith('data:image')
    if (hasSignature) {
      try {
        const imgBase64 = dataUrlToBase64(row.supervisorConfirm)
        const imageId = wb.addImage({ base64: imgBase64, extension: 'png' })
        ws.addImage(imageId, {
          tl: { col: 4, row: cfmRowNum - 1 + 0.05 } as ExcelJS.Anchor,
          br: { col: 5, row: cfmRowNum - 1 + 0.95 } as ExcelJS.Anchor,
        })
      } catch {
        ws.getCell(`E${cfmRowNum}`).value = '(인)'
      }
    } else {
      ws.getCell(`E${cfmRowNum}`).value = '(인)'
      ws.getCell(`E${cfmRowNum}`).font = { size: 11 }
      ws.getCell(`E${cfmRowNum}`).alignment = { horizontal: 'center', vertical: 'middle' }
    }

    // 인쇄 설정
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      printArea: `A1:E${cfmRowNum}`,
      margins: {
        left: 0.7, right: 0.7,
        top: 0.6, bottom: 0.5,
        header: 0.3, footer: 0.3,
      },
    }
  })

  // 다운로드
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const today = new Date()
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `${projectName ? projectName + '_' : ''}자재수불부_${materialName}_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
