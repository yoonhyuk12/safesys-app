import ExcelJS from 'exceljs'
import type { Project } from '@/lib/projects'

interface InspectionData {
    id: string
    inspection_type: string
    inspection_date: string
    inspection_team: string | null
    management_entity: string | null
    district_name: string | null
    location_province: string | null
    location_city: string | null
    total_budget: number | null
    construction_start: string | null
    construction_end_planned: string | null
    progress_rate: number | null
    major_work_type: string | null
    contractor: string | null
    supervisor_name: string | null
    inspector_opinion: string | null
    signatures?: any[]
}

interface ResultData {
    field_item: string
    findings: string | null
    action_items: string | null
    photo_url?: string | null
}

interface PhotoData {
    photo_type: string
    photo_url: string
    description: string | null
    supervisor_name: string | null
    photo_date: string | null
}

// 이미지를 Base64 및 사이즈 정보로 변환
async function fetchImageAsBase64(url: string): Promise<{ base64: string; extension: 'png' | 'jpeg'; width: number; height: number } | null> {
    try {
        const response = await fetch(url)
        const blob = await response.blob()
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1]
                const ext = blob.type.includes('png') ? 'png' : 'jpeg'
                const img = document.createElement('img')
                img.onload = () => resolve({ base64, extension: ext, width: img.naturalWidth, height: img.naturalHeight })
                img.onerror = () => resolve({ base64, extension: ext, width: 800, height: 600 })
                img.src = reader.result as string
            }
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
        })
    } catch {
        return null
    }
}

// 셀 테두리 스타일
const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
}

const boldFont: Partial<ExcelJS.Font> = { name: '맑은 고딕', size: 10, bold: true }
const normalFont: Partial<ExcelJS.Font> = { name: '맑은 고딕', size: 10 }
const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }

export async function downloadSafetyInspectionExcel(
    inspection: InspectionData,
    results: ResultData[],
    photos: PhotoData[],
    project: Project | null
) {
    const wb = new ExcelJS.Workbook()

    const commonPageSetup: Partial<ExcelJS.PageSetup> = {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
            left: 0.3,
            right: 0.3,
            top: 0.5,
            bottom: 0.5,
            header: 0.3,
            footer: 0.3
        },
        horizontalCentered: true
    }

    // ============================================================
    // Sheet 1: 건설현장 점검카드
    // ============================================================
    const ws1 = wb.addWorksheet('건설현장 점검카드')
    ws1.pageSetup = commonPageSetup
    ws1.properties.defaultRowHeight = 18

    // 열 너비 설정
    ws1.columns = [
        { width: 12 }, { width: 14 }, { width: 10 }, { width: 10 },
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 },
        { width: 14 }, { width: 14 }
    ]

    // 제목
    ws1.mergeCells('A1:J1')
    const titleCell = ws1.getCell('A1')
    titleCell.value = '건설현장 점검카드(사업명)'
    titleCell.font = { name: '맑은 고딕', size: 16, bold: true, underline: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws1.getRow(1).height = 30

    // 1. 점검개요
    ws1.mergeCells('A3:J3')
    ws1.getCell('A3').value = '1. 점검개요'
    ws1.getCell('A3').font = { name: '맑은 고딕', size: 12, bold: true }

    ws1.mergeCells('A4:C4')
    ws1.getCell('A4').value = `○ 점검일시 : '${inspection.inspection_date?.substring(2) || ''}`
    ws1.getCell('A4').font = normalFont

    ws1.mergeCells('A5:J5')
    let excelInspectionTeam = inspection.inspection_team || '';
    if (inspection.signatures && inspection.signatures.length > 0) {
        const teamFromSignatures = inspection.signatures
            .filter((s: any) => s.role === '점검자')
            .map((s: any) => `${s.position} ${s.name}`.trim())
            .filter((s: string) => s).join(', ');
        if (teamFromSignatures) {
            excelInspectionTeam = teamFromSignatures;
        }
    }
    ws1.getCell('A5').value = `○ 점 검 반 : ${excelInspectionTeam}`
    ws1.getCell('A5').font = normalFont

    ws1.mergeCells('A6:J6')
    ws1.getCell('A6').value = '○ 점검지구 현황'
    ws1.getCell('A6').font = normalFont

    // 점검지구 현황 테이블 헤더
    const headerRow = 7
    const headers = ['관리주체', '지구명', '도', '시군', '총사업비\n(백만원)', '착공', '준공\n(예정)', '공정율', '주요공종', '비고\n(시공사)']
    headers.forEach((h, i) => {
        const cell = ws1.getCell(headerRow, i + 1)
        cell.value = h
        cell.font = boldFont
        cell.alignment = centerAlign
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
    })
    ws1.getRow(headerRow).height = 28

    // 점검지구 현황 데이터
    const dataRow = 8
    const dataValues = [
        inspection.management_entity || '',
        inspection.district_name || '',
        inspection.location_province || '',
        inspection.location_city || '',
        inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : '',
        inspection.construction_start || '',
        inspection.construction_end_planned || '',
        inspection.progress_rate ? `${inspection.progress_rate}%` : '',
        inspection.major_work_type || '',
        inspection.contractor || ''
    ]
    dataValues.forEach((v, i) => {
        const cell = ws1.getCell(dataRow, i + 1)
        cell.value = v
        cell.font = normalFont
        cell.alignment = centerAlign
        cell.border = thinBorder
    })

    // 2. 점검결과
    const r2Start = 10
    ws1.mergeCells(`A${r2Start}:J${r2Start}`)
    ws1.getCell(`A${r2Start}`).value = '2. 점검결과    * 지적사항(또는 수범사례, 현장점검) 증빙사진 첨부'
    ws1.getCell(`A${r2Start}`).font = { name: '맑은 고딕', size: 12, bold: true }

    const resHeaderRow = r2Start + 1
    const resHeaders = ['분야(항목)', '지적사항(수범사례)', '조치할 사항']
    const resColWidths = [2, 4, 4] // 컬럼 병합 수
    let colStart = 1
    resHeaders.forEach((h, i) => {
        const endCol = colStart + resColWidths[i] - 1
        if (resColWidths[i] > 1) {
            ws1.mergeCells(resHeaderRow, colStart, resHeaderRow, endCol)
        }
        const cell = ws1.getCell(resHeaderRow, colStart)
        cell.value = h
        cell.font = boldFont
        cell.alignment = centerAlign
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
        colStart = endCol + 1
    })

    // 점검결과 데이터
    const resultRows = results.length > 0 ? results : [{ field_item: '', findings: '-', action_items: '-' }]
    resultRows.forEach((r, idx) => {
        const row = resHeaderRow + 1 + idx
        ws1.mergeCells(row, 1, row, 2)
        ws1.getCell(row, 1).value = r.field_item
        ws1.getCell(row, 1).font = normalFont
        ws1.getCell(row, 1).alignment = centerAlign
        ws1.getCell(row, 1).border = thinBorder
        ws1.getCell(row, 2).border = thinBorder

        ws1.mergeCells(row, 3, row, 6)
        ws1.getCell(row, 3).value = r.findings || '-'
        ws1.getCell(row, 3).font = normalFont
        ws1.getCell(row, 3).alignment = { ...centerAlign, horizontal: 'left' }
        ws1.getCell(row, 3).border = thinBorder
        for (let c = 4; c <= 6; c++) ws1.getCell(row, c).border = thinBorder

        ws1.mergeCells(row, 7, row, 10)
        ws1.getCell(row, 7).value = r.action_items || '-'
        ws1.getCell(row, 7).font = normalFont
        ws1.getCell(row, 7).alignment = { ...centerAlign, horizontal: 'left' }
        ws1.getCell(row, 7).border = thinBorder
        for (let c = 8; c <= 10; c++) ws1.getCell(row, c).border = thinBorder

        ws1.getRow(row).height = 22
    })

    // 빈 행 (최소 4행)
    for (let i = resultRows.length; i < 4; i++) {
        const row = resHeaderRow + 1 + i
        ws1.mergeCells(row, 1, row, 2)
        ws1.mergeCells(row, 3, row, 6)
        ws1.mergeCells(row, 7, row, 10)
        for (let c = 1; c <= 10; c++) ws1.getCell(row, c).border = thinBorder
        ws1.getRow(row).height = 22
    }

    // 3. 점검자 의견
    const opinionStart = resHeaderRow + Math.max(resultRows.length, 4) + 2
    ws1.mergeCells(`A${opinionStart}:J${opinionStart}`)
    ws1.getCell(`A${opinionStart}`).value = '3. 점검자 의견'
    ws1.getCell(`A${opinionStart}`).font = { name: '맑은 고딕', size: 12, bold: true }

    ws1.mergeCells(`A${opinionStart + 1}:J${opinionStart + 3}`)
    ws1.getCell(`A${opinionStart + 1}`).value = `○ ${inspection.inspector_opinion || ''}`
    ws1.getCell(`A${opinionStart + 1}`).font = normalFont
    ws1.getCell(`A${opinionStart + 1}`).alignment = { vertical: 'top', wrapText: true }

    // 4. 서명 (2026년 월 일 및 현장대리인, 공사감독원, 점검자, 점검자)
    const dateRow = opinionStart + 5
    ws1.mergeCells(dateRow, 1, dateRow, 10)
    const [yyyy, mm, dd] = (inspection.inspection_date || '').split('-')
    ws1.getCell(dateRow, 1).value = `${yyyy}년    ${mm || '  '}월    ${dd || '  '}일`
    ws1.getCell(dateRow, 1).font = { name: '맑은 고딕', size: 12 }
    ws1.getCell(dateRow, 1).alignment = { horizontal: 'center' }

    let currSignRow = dateRow + 3
    if (inspection.signatures && inspection.signatures.length > 0) {
        for (const sig of inspection.signatures) {
            ws1.mergeCells(currSignRow, 1, currSignRow, 3)
            ws1.getCell(currSignRow, 1).value = sig.role
            ws1.getCell(currSignRow, 1).font = normalFont
            ws1.getCell(currSignRow, 1).alignment = { horizontal: 'center', vertical: 'middle' }

            ws1.mergeCells(currSignRow, 4, currSignRow, 5)
            ws1.getCell(currSignRow, 4).value = sig.position
            ws1.getCell(currSignRow, 4).font = normalFont
            ws1.getCell(currSignRow, 4).alignment = { horizontal: 'center', vertical: 'middle' }

            ws1.mergeCells(currSignRow, 6, currSignRow, 7)
            ws1.getCell(currSignRow, 6).value = sig.name
            ws1.getCell(currSignRow, 6).font = normalFont
            ws1.getCell(currSignRow, 6).alignment = { horizontal: 'center', vertical: 'middle' }

            ws1.mergeCells(currSignRow, 8, currSignRow, 10)
            ws1.getCell(currSignRow, 8).value = '(서명)'
            ws1.getCell(currSignRow, 8).font = normalFont
            ws1.getCell(currSignRow, 8).alignment = { horizontal: 'center', vertical: 'middle' }

            // 서명 이미지 삽입 (Base64)
            if (sig.dataUrl) {
                const imgData = await fetchImageAsBase64(sig.dataUrl)
                if (imgData) {
                    const imageId = wb.addImage({ base64: imgData.base64, extension: imgData.extension })
                    // (서명) 텍스트와 완벽히 겹치도록 중앙에 배치 (열 넓이가 달라 8.45 부근이 중앙)
                    ws1.addImage(imageId, {
                        tl: { col: 8.45, row: currSignRow - 0.95 },
                        ext: { width: 60, height: 28 },
                        editAs: 'absolute'
                    } as any)
                }
            }

            ws1.getRow(currSignRow).height = 25
            currSignRow += 1
        }
    }

    // ============================================================
    // Sheet 2: 건설현장 점검사진
    // ============================================================
    const ws2 = wb.addWorksheet('건설현장 점검사진')
    ws2.pageSetup = commonPageSetup
    ws2.columns = Array(6).fill({ width: 16 })

    ws2.mergeCells('A1:F1')
    ws2.getCell('A1').value = '건설현장 점검사진'
    ws2.getCell('A1').font = { name: '맑은 고딕', size: 16, bold: true, underline: true }
    ws2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws2.getRow(1).height = 30

    const siteBeforePhotos = photos.filter(p => p.photo_type === 'site_before')

    // 조치 전 사진
    let currentRow = 3
    const addPhotoSection = async (ws: ExcelJS.Worksheet, label: string, photoList: PhotoData[], startRow: number, colWidth: number = 16): Promise<number> => {
        let row = startRow
        // 헤더 정보
        ws.mergeCells(row, 1, row, 1)
        ws.getCell(row, 1).value = '지구명'
        ws.getCell(row, 1).font = boldFont
        ws.getCell(row, 1).alignment = centerAlign
        ws.getCell(row, 1).border = thinBorder
        ws.mergeCells(row, 2, row, 3)
        ws.getCell(row, 2).value = inspection.district_name || ''
        ws.getCell(row, 2).font = normalFont
        ws.getCell(row, 2).border = thinBorder
        ws.getCell(row, 3).border = thinBorder
        ws.getCell(row, 4).value = '공사감독원'
        ws.getCell(row, 4).font = boldFont
        ws.getCell(row, 4).alignment = centerAlign
        ws.getCell(row, 4).border = thinBorder
        ws.mergeCells(row, 5, row, 6)
        ws.getCell(row, 5).value = inspection.supervisor_name || ''
        ws.getCell(row, 5).font = normalFont
        ws.getCell(row, 5).border = thinBorder
        ws.getCell(row, 6).border = thinBorder
        row++

        ws.getCell(row, 1).value = '일 시'
        ws.getCell(row, 1).font = boldFont
        ws.getCell(row, 1).alignment = centerAlign
        ws.getCell(row, 1).border = thinBorder
        ws.mergeCells(row, 2, row, 3)
        ws.getCell(row, 2).value = inspection.inspection_date || ''
        ws.getCell(row, 2).font = normalFont
        ws.getCell(row, 2).border = thinBorder
        ws.getCell(row, 3).border = thinBorder
        ws.getCell(row, 4).value = '설 명'
        ws.getCell(row, 4).font = boldFont
        ws.getCell(row, 4).alignment = centerAlign
        ws.getCell(row, 4).border = thinBorder
        ws.mergeCells(row, 5, row, 6)
        ws.getCell(row, 5).value = label
        ws.getCell(row, 5).font = normalFont
        ws.getCell(row, 5).border = thinBorder
        ws.getCell(row, 6).border = thinBorder
        row++

        // 사진 영역
        ws.mergeCells(row, 1, row + 12, 6)
        for (let r = row; r <= row + 12; r++) {
            for (let c = 1; c <= 6; c++) {
                ws.getCell(r, c).border = thinBorder
            }
        }

        // 사진 삽입
        if (photoList.length > 0) {
            const imgData = await fetchImageAsBase64(photoList[0].photo_url)
            if (imgData) {
                const imageId = wb.addImage({ base64: imgData.base64, extension: imgData.extension })

                // 비율 계산하여 가운데 정렬
                const areaW_cols = 6 // A~F 컬럼 수
                const areaH_rows = 13 // 병합된 행 수
                const colPx = Math.floor(colWidth * 7.5) // 입력받은 컬럼 너비 기반 픽셀 변환 추정치
                const rowPx = 24  // 행당 픽셀(추정치)

                const areaRatio = (areaW_cols * colPx) / (areaH_rows * rowPx)
                const imgRatio = imgData.width / imgData.height

                const paddingPx = 8
                const targetPxW = (areaW_cols * colPx) - paddingPx * 2
                const targetPxH = (areaH_rows * rowPx) - paddingPx * 2

                let renderW = targetPxW
                let renderH = targetPxW / imgRatio
                if (renderH > targetPxH) {
                    renderH = targetPxH
                    renderW = targetPxH * imgRatio
                }

                const marginLeft = paddingPx + (targetPxW - renderW) / 2
                const marginTop = paddingPx + (targetPxH - renderH) / 2

                const startCol = marginLeft / colPx
                const startRowOffset = (row - 1) + (marginTop / rowPx)

                ws.addImage(imageId, {
                    tl: { col: startCol, row: startRowOffset },
                    ext: { width: Math.round(renderW), height: Math.round(renderH) },
                    editAs: 'oneCell'
                } as any)
            }
        }

        return row + 13
    }

    currentRow = await addPhotoSection(ws2, '(전경 사진)', siteBeforePhotos, currentRow)

    // ============================================================
    // Sheet 3: 지적사항 및 조치사항 사진대지
    // ============================================================
    const ws3 = wb.addWorksheet('지적사항 및 조치사항')
    ws3.pageSetup = { ...commonPageSetup, printTitlesRow: '1:2' }
    const ws3ColWidth = 11.5
    ws3.columns = Array(6).fill({ width: ws3ColWidth })

    ws3.mergeCells('A1:F1')
    ws3.getCell('A1').value = '<지적사항 및 조치사항 사진대지>'
    ws3.getCell('A1').font = { name: '맑은 고딕', size: 14, bold: true }
    ws3.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws3.getRow(1).height = 28

    const hasFindingsPhotos = results.some(r => (r.photo_url && r.photo_url.trim() !== '') || ((r as any).after_photo_url && (r as any).after_photo_url.trim() !== ''))

    let row3 = 3
    if (hasFindingsPhotos) {
        for (let i = 0; i < results.length; i++) {
            const r = results[i]
            const hasBefore = r.photo_url && r.photo_url.trim() !== ''
            const hasAfter = (r as any).after_photo_url && (r as any).after_photo_url.trim() !== ''

            if (hasBefore || hasAfter) {
                // Before
                const desc = r.findings || r.action_items ? ` ${r.findings || r.action_items}` : ''
                const photo: PhotoData[] = hasBefore ? [{
                    photo_type: 'finding_before',
                    photo_url: r.photo_url!,
                    description: r.findings || r.action_items || null,
                    supervisor_name: inspection.supervisor_name,
                    photo_date: inspection.inspection_date
                }] : []
                row3 = await addPhotoSection(ws3, `(조치 전)${desc}`, photo, row3, ws3ColWidth)
                row3 += 1

                // After
                const actionDesc = r.action_items || r.findings ? ` ${r.action_items || r.findings}` : ''
                const afterPhoto: PhotoData[] = hasAfter ? [{
                    photo_type: 'finding_after',
                    photo_url: (r as any).after_photo_url as string,
                    description: r.action_items || r.findings || null,
                    supervisor_name: inspection.supervisor_name,
                    photo_date: inspection.inspection_date
                }] : []
                row3 = await addPhotoSection(ws3, `(조치 후)${actionDesc}`, afterPhoto, row3, ws3ColWidth)
                row3 += 1

                // 한 건당 한 장씩 출력되도록 수동 페이지 나누기 적용 
                if (i < results.length - 1) {
                    ws3.getRow(row3 - 1).addPageBreak()
                }
            }
        }
    } else {
        // 사진이 없을 경우 빈 폼 한 장 분량
        row3 = await addPhotoSection(ws3, '(조치 전)', [], row3, ws3ColWidth)
        row3 += 1
        row3 = await addPhotoSection(ws3, '(조치 후)', [], row3, ws3ColWidth)
        row3 += 1
    }

    // 안내 문구
    ws3.mergeCells(row3 + 1, 1, row3 + 1, 6)
    ws3.getCell(row3 + 1, 1).value = '지적사항에 대한 조치 전, 조치 후 사진 필수'
    ws3.getCell(row3 + 1, 1).font = { name: '맑은 고딕', size: 10, color: { argb: 'FFFF0000' }, bold: true }
    ws3.getCell(row3 + 1, 1).alignment = { horizontal: 'center' }

    ws3.mergeCells(row3 + 2, 1, row3 + 2, 6)
    ws3.getCell(row3 + 2, 1).value = '지적사항이 없는 경우 현장점검사진 첨부'
    ws3.getCell(row3 + 2, 1).font = { name: '맑은 고딕', size: 10, color: { argb: 'FFFF0000' }, bold: true }
    ws3.getCell(row3 + 2, 1).alignment = { horizontal: 'center' }

    // ============================================================
    // Sheet 4: 수범사례 사진대지 (수범사례 있을 때만 생성)
    // ============================================================
    const goodExPhotos = photos.filter(p => p.photo_type === 'good_example')
    const goodExContent = (inspection as any).good_example_content || (goodExPhotos.length > 0 ? (goodExPhotos[0].description || '') : '')

    if (goodExPhotos.length > 0 || goodExContent.trim() !== '') {
        const ws4 = wb.addWorksheet('수범사례 사진대지')
        ws4.pageSetup = commonPageSetup
        ws4.columns = Array(6).fill({ width: 16 })

        ws4.mergeCells('A1:F1')
        ws4.getCell('A1').value = '<수범사례 사진대지>'
        ws4.getCell('A1').font = { name: '맑은 고딕', size: 14, bold: true }
        ws4.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
        ws4.getRow(1).height = 28

        // 간단한 구조: 지구명 + 설명 + 사진
        ws4.getCell('A3').value = '지구명'
        ws4.getCell('A3').font = boldFont
        ws4.getCell('A3').alignment = centerAlign
        ws4.getCell('A3').border = thinBorder
        ws4.mergeCells('B3:F3')
        ws4.getCell('B3').value = inspection.district_name || ''
        ws4.getCell('B3').font = normalFont
        ws4.getCell('B3').border = thinBorder
        for (let c = 2; c <= 6; c++) ws4.getCell(3, c).border = thinBorder

        ws4.getCell('A4').value = '설 명'
        ws4.getCell('A4').font = boldFont
        ws4.getCell('A4').alignment = centerAlign
        ws4.getCell('A4').border = thinBorder
        ws4.mergeCells('B4:F4')
        ws4.getCell('B4').value = goodExContent
        ws4.getCell('B4').font = normalFont
        ws4.getCell('B4').border = thinBorder
        for (let c = 2; c <= 6; c++) ws4.getCell(4, c).border = thinBorder

        // 수범사례 사진 영역
        ws4.mergeCells('A5:F18')
        for (let r = 5; r <= 18; r++) {
            for (let c = 1; c <= 6; c++) {
                ws4.getCell(r, c).border = thinBorder
            }
        }

        if (goodExPhotos.length > 0) {
            const imgData = await fetchImageAsBase64(goodExPhotos[0].photo_url)
            if (imgData) {
                const imageId = wb.addImage({ base64: imgData.base64, extension: imgData.extension })

                const areaW_cols = 6
                const areaH_rows = 14 // 5~18 is 14 rows
                const colPx = 112
                const rowPx = 24
                const areaRatio = (areaW_cols * colPx) / (areaH_rows * rowPx)
                const imgRatio = imgData.width / imgData.height

                let startCol = 0
                let startRowOffset = 4 // row 5 is index 4
                let endCol = areaW_cols
                let endRowOffset = 4 + areaH_rows

                if (imgRatio > areaRatio) {
                    const scaledH_rows = (areaW_cols * colPx) / imgRatio / rowPx
                    const rowMargin = (areaH_rows - scaledH_rows) / 2
                    startRowOffset = 4 + rowMargin
                    endRowOffset = 4 + areaH_rows - rowMargin
                } else {
                    const scaledW_cols = (areaH_rows * rowPx) * imgRatio / colPx
                    const colMargin = (areaW_cols - scaledW_cols) / 2
                    startCol = colMargin
                    endCol = areaW_cols - colMargin
                }

                ws4.addImage(imageId, {
                    tl: { col: startCol, row: startRowOffset },
                    br: { col: endCol, row: endRowOffset },
                    editAs: 'oneCell'
                } as any)
            }
        }
    }

    // 파일 다운로드
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `안전점검_${inspection.inspection_type}_${inspection.inspection_date}_${inspection.district_name || '보고서'}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
}
