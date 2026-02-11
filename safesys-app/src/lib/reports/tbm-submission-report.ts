// TBM 보고서 PDF 생성 모듈 (원본 pdf-generator-v2.js 기반)

interface TBMSubmissionFormData {
  educationDate: string
  educationStartTime: string
  educationEndTime?: string
  projectName: string
  address: string
  headquarters: string
  branch: string
  todayWork: string
  personnelInput: string
  newWorkerCount?: string
  equipmentInput: string
  cctvUsage?: string
  otherRemarks: string
  potentialRisk1: string
  solution1: string
  potentialRisk2: string
  solution2: string
  potentialRisk3: string
  solution3: string
  mainRiskSelection: string
  mainRiskSolution: string
  riskFactor1?: string
  riskFactor2?: string
  riskFactor3?: string
  name: string
  signature?: string
  constructionCompany?: string
  photo?: string
}

class PDFGenerator {
  private doc: any = null
  private appendedPages = 0

  // TBM 보고서 생성
  async generateTBMReport(formData: TBMSubmissionFormData) {
    this.doc = null
    this.appendedPages = 0
    await this.appendTBMReportPage(formData)
    return this.doc
  }

  // 기존 문서에 TBM 보고서 1장을 추가
  async appendTBMReportPage(formData: TBMSubmissionFormData) {
    if (typeof window === 'undefined') {
      throw new Error('PDF 생성은 브라우저 환경에서만 가능합니다.')
    }

    const canvas = await this.renderTBMCanvas(formData)
    await this.ensureDocument()

    if (this.appendedPages > 0) {
      this.doc.addPage('a4', 'portrait')
    }

    this.addCanvasToDocument(canvas)
    this.appendedPages += 1
    return this.doc
  }

  private async ensureDocument() {
    if (this.doc) return
    const { jsPDF } = await import('jspdf')
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    })
  }

  private addCanvasToDocument(canvas: HTMLCanvasElement) {
    if (!this.doc) return

    const imgData = canvas.toDataURL('image/jpeg', 0.7)
    const imgWidth = 210 // A4 width in mm
    const pageHeight = 297 // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const heightTolerance = 2 // mm 단위 여유값 (미세한 잔여 높이 보정)

    if (imgHeight > pageHeight + heightTolerance) {
      const scaleFactor = pageHeight / imgHeight
      const scaledWidth = imgWidth * scaleFactor
      const horizontalMargin = (imgWidth - scaledWidth) / 2
      this.doc.addImage(imgData, 'JPEG', horizontalMargin, 0, scaledWidth, pageHeight)
      return
    }

    const adjustedHeight = Math.min(imgHeight, pageHeight)
    this.doc.addImage(imgData, 'JPEG', 0, 0, imgWidth, adjustedHeight)
  }

  private async renderTBMCanvas(formData: TBMSubmissionFormData): Promise<HTMLCanvasElement> {
    const html2canvas = (await import('html2canvas')).default

    const reportHTML = this.createReportHTML(formData)
    const tempContainer = document.createElement('div')
    tempContainer.style.position = 'fixed'
    tempContainer.style.left = '-9999px'
    tempContainer.style.top = '0'
    tempContainer.style.width = '794px' // A4 width in pixels at 96 DPI
    tempContainer.style.backgroundColor = 'white'
    tempContainer.innerHTML = reportHTML
    document.body.appendChild(tempContainer)

    try {
      // 이미지가 있는 경우 실제 렌더 높이가 변하므로 로딩 완료까지 대기
      await this.waitForImages(tempContainer)

      // 1단계: 패딩 조정 완전 비활성화 (정렬 문제 해결 위해)
      // await this.adjustPaddingToFitOnePage(tempContainer, formData)

      return await html2canvas(tempContainer, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000
      })
    } finally {
      if (document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer)
      }
    }
  }

  // 1페이지에 정확히 맞도록 패딩 자동 조정
  private async adjustPaddingToFitOnePage(container: HTMLElement, formData: TBMSubmissionFormData) {
    const MIN_PADDING = 2 // 최소 패딩 (px)
    const MAX_PADDING = 15 // 최대 패딩 (px)
    const TARGET_HEIGHT = 1123 // A4 페이지 높이 (794px width 기준, 297mm = 1123px at 96dpi)
    const TOP_MARGIN = 76 // 상단 여백 20mm
    const BOTTOM_MARGIN = 15 // 하단 여백
    const CONTENT_AREA_HEIGHT = TARGET_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN // 사용 가능한 컨텐츠 영역
    const TOLERANCE = 1 // 허용 오차 ±1px

    // 현재 렌더링된 높이 측정
    const currentHeight = container.offsetHeight
    const contentHeight = currentHeight - TOP_MARGIN - BOTTOM_MARGIN

    // 이미 적정 범위 내에 있으면 조정 불필요
    if (Math.abs(contentHeight - CONTENT_AREA_HEIGHT) <= TOLERANCE) {
      return null
    }

    // 모든 테이블 셀의 현재 패딩 정보 수집
    const tables = container.querySelectorAll('table')
    const cellPaddingData: Array<{
      element: HTMLElement
      paddingTop: number
      paddingBottom: number
      totalPadding: number
      reduciblePadding: number
      contentHeight: number
    }> = []
    let totalReduciblePadding = 0
    let totalContentHeight = 0

    tables.forEach(table => {
      const cells = table.querySelectorAll('td, th')
      cells.forEach(cell => {
        const style = window.getComputedStyle(cell)
        const paddingTop = parseFloat(style.paddingTop)
        const paddingBottom = parseFloat(style.paddingBottom)
        const cellContentHeight = cell.scrollHeight - paddingTop - paddingBottom

        const reduciblePadding = Math.max(0, (paddingTop + paddingBottom) - MIN_PADDING * 2)

        cellPaddingData.push({
          element: cell as HTMLElement,
          paddingTop,
          paddingBottom,
          totalPadding: paddingTop + paddingBottom,
          reduciblePadding,
          contentHeight: cellContentHeight
        })

        totalReduciblePadding += reduciblePadding
        totalContentHeight += cellContentHeight
      })
    })

    // 필요한 조정량 계산
    const heightDifference = contentHeight - CONTENT_AREA_HEIGHT

    let adjustmentRatio: number

    // 조건1: 콘텐츠가 페이지를 초과하는 경우 - 패딩 축소
    if (heightDifference > TOLERANCE) {
      // 축소 가능한 패딩이 충분한지 확인
      if (totalReduciblePadding < heightDifference) {
        console.warn('패딩을 최소값까지 줄여도 1페이지에 맞출 수 없습니다.')
        adjustmentRatio = -totalReduciblePadding / totalReduciblePadding // 최대한 축소
      } else {
        // 비례 축소 비율 계산 (reducible padding 비례)
        adjustmentRatio = -heightDifference / totalReduciblePadding
      }

      // 각 셀의 패딩을 비례적으로 축소
      cellPaddingData.forEach(data => {
        if (data.reduciblePadding > 0) {
          const reduction = data.reduciblePadding * Math.abs(adjustmentRatio)
          const newPaddingTop = Math.max(MIN_PADDING, data.paddingTop - reduction / 2)
          const newPaddingBottom = Math.max(MIN_PADDING, data.paddingBottom - reduction / 2)

          data.element.style.paddingTop = `${newPaddingTop}px`
          data.element.style.paddingBottom = `${newPaddingBottom}px`
        }
      })
    }
    // 조건2: 페이지에 여유 공간이 있는 경우 - 패딩 확대
    // 조건2: 페이지에 여유 공간이 있는 경우
    // 기존에는 패딩을 확대했으나, 상단 정렬 문제(텍스트가 아래로 밀림)가 발생하여
    // 여백 확대를 하지 않고 빈 공간을 유지하도록 변경함.
    else if (heightDifference < -TOLERANCE) {
      // 비례 확대 비율 계산
      const additionalPadding = Math.abs(heightDifference) / cellPaddingData.length

      cellPaddingData.forEach(data => {
        // 상단 패딩은 고정하고 하단 패딩만 늘려 텍스트를 위로 밀어올림
        const newPaddingBottom = data.paddingBottom + additionalPadding
        data.element.style.paddingBottom = `${newPaddingBottom}px`
        // 상단 패딩은 극히 작게 유지하여 상단 밀착 유도
        data.element.style.paddingTop = '3px'
      })
    }

    return null
  }

  // 작업내용을 2개 컬럼으로 포맷
  private formatWorkContent(todayWork: string, cellPadding: string): string {
    if (!todayWork) return `<td colspan="2" style="border: 1px solid #000; padding: ${cellPadding};"></td>`

    const lines = todayWork.split('\n').filter(line => line.trim())

    // 작업내용이 3줄 이하면 1개 컬럼으로
    if (lines.length <= 3) {
      return `<td colspan="2" style="border: 1px solid #000; padding: ${cellPadding}; white-space: pre-line;">${todayWork}</td>`
    }

    // 4줄 이상이면 2개 컬럼으로 나누기
    const midPoint = Math.ceil(lines.length / 2)
    const leftColumn = lines.slice(0, midPoint).join('\n')
    const rightColumn = lines.slice(midPoint).join('\n')

    return `
      <td class="data-cell" style="width: 50%; white-space: pre-line;" valign="top">${leftColumn}</td>
      <td class="data-cell" style="width: 50%; white-space: pre-line;" valign="top">${rightColumn}</td>
    `
  }

  // 내용 길이 계산 (간단한 추정)
  private estimateContentLength(formData: TBMSubmissionFormData): string {
    const todayWorkLines = (formData.todayWork || '').split('\n').length
    const otherRemarksLines = (formData.otherRemarks || '').split('\n').length
    const personnelLines = (formData.personnelInput || '').split('\n').length
    const equipmentLines = (formData.equipmentInput || '').split('\n').length
    const hasPhoto = !!formData.photo

    // 총 라인 수로 내용량 추정
    const totalLines = todayWorkLines + otherRemarksLines + personnelLines + equipmentLines

    // 사진이 있으면 내용이 더 많은 것으로 간주
    const estimatedLength = totalLines + (hasPhoto ? 10 : 0)

    // 내용 길이에 따라 세분화
    if (estimatedLength <= 15) return 'very-short'
    if (estimatedLength <= 20) return 'short'
    if (estimatedLength <= 30) return 'medium'
    return 'normal'
  }

  // HTML 템플릿 생성
  private createReportHTML(formData: TBMSubmissionFormData, adjustedPadding: any = null): string {
    const educationDate = formData.educationDate || ''
    const startTime = formData.educationStartTime || ''
    const projectName = formData.projectName || ''
    const address = formData.address || ''
    const headquarters = formData.headquarters || ''
    const branch = formData.branch || ''
    const todayWork = formData.todayWork || ''
    const personnel = (formData.personnelInput || '').trimStart()
    const newWorkerCount = formData.newWorkerCount || ''
    const cctvUsage = formData.cctvUsage || ''
    const otherRemarks = (formData.otherRemarks || '').trimStart()
    const equipment = (formData.equipmentInput || '').trimStart()

    // 신규근로자 정보를 투입인원에 추가
    let personnelWithNewWorker = personnel
    if (newWorkerCount && newWorkerCount !== '0') {
      if (personnelWithNewWorker) {
        personnelWithNewWorker += '\n\n신규근로자: ' + newWorkerCount + '명'
      } else {
        personnelWithNewWorker = '신규근로자: ' + newWorkerCount + '명'
      }
    }

    let cellPadding: string
    let headerBottomMargin: string
    let otherRemarksPadding: string
    let otherRemarksMinHeight: string
    let photoMaxHeight: string
    let photoEmptyHeight: string
    let bottomMarginTop: string

    // adjustedPadding이 있으면 사용, 없으면 기존 로직 사용
    if (adjustedPadding && adjustedPadding.wasAdjusted) {
      // 조정된 패딩 사용 (모든 값을 동일하게 설정)
      cellPadding = `${adjustedPadding.cellPadding}px`
      headerBottomMargin = `${Math.max(10, adjustedPadding.cellPadding * 2)}px`
      otherRemarksPadding = `${adjustedPadding.cellPadding}px 8px`
      otherRemarksMinHeight = `${Math.max(50, adjustedPadding.cellPadding * 10)}px`
      photoMaxHeight = `${Math.max(180, 200 - adjustedPadding.cellPadding * 2)}px`
      photoEmptyHeight = `${Math.max(130, 150 - adjustedPadding.cellPadding * 2)}px`
      bottomMarginTop = `${Math.max(10, adjustedPadding.cellPadding * 2)}px`
    } else {
      // 내용 길이에 따라 padding 결정 (기존 로직)
      const contentLength = this.estimateContentLength(formData)

      switch (contentLength) {
        case 'very-short':
          cellPadding = '10px'
          headerBottomMargin = '20px'
          otherRemarksPadding = '10px 8px'
          otherRemarksMinHeight = '100px'
          photoMaxHeight = '250px'
          photoEmptyHeight = '200px'
          bottomMarginTop = '20px'
          break
        case 'short':
          cellPadding = '8px'
          headerBottomMargin = '15px'
          otherRemarksPadding = '8px 8px'
          otherRemarksMinHeight = '80px'
          photoMaxHeight = '220px'
          photoEmptyHeight = '170px'
          bottomMarginTop = '15px'
          break
        case 'medium':
          cellPadding = '6px'
          headerBottomMargin = '12px'
          otherRemarksPadding = '5px 8px'
          otherRemarksMinHeight = '65px'
          photoMaxHeight = '200px'
          photoEmptyHeight = '150px'
          bottomMarginTop = '12px'
          break
        default: // normal
          cellPadding = '5px'
          headerBottomMargin = '10px'
          otherRemarksPadding = '3px 5px'
          otherRemarksMinHeight = '50px'
          photoMaxHeight = '180px'
          photoEmptyHeight = '130px'
          bottomMarginTop = '10px'
      }
    }

    const containerTopBottomPadding = '76px 30px 15px 30px' // 상단 20mm(76px), 좌우 8mm(30px), 하단 15px

    return `
      <style>
        @media print {
          table { page-break-inside: avoid; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          td { page-break-inside: avoid; }
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        table td, table th {
          border: 1px solid #000;
        }
      </style>
      <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: ${containerTopBottomPadding}; width: 734px; margin: 0 auto; box-sizing: content-box;">
        <!-- 법조문 -->
        <div style="font-size: 8px; color: #333; margin-bottom: 2px; text-align: left;">건설기술 진흥법 시행령 103조(안전교육) 제3항에 따른 안전교육내용 기록</div>
        <!-- 헤더 -->
        <div style="text-align: center; margin-bottom: ${headerBottomMargin}; border-bottom: 3px solid #000; padding-bottom: 8px; page-break-after: avoid;">
          <h1 style="margin: 0; font-size: 22px; font-weight: bold;">Tool Box Meeting 회의록</h1>
        </div>

        <!-- TBM 리더 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; font-weight: bold; background-color: #f0f0f0; text-align: center; vertical-align: middle !important;">TBM리더</td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; vertical-align: middle !important;">
              <strong>◆ 소속 :</strong> ${formData.constructionCompany || ''}
            </td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; font-weight: bold; background-color: #f0f0f0; text-align: center; vertical-align: middle !important;">
              이름
            </td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; text-align: center; vertical-align: middle !important;">
              <div style="display: inline-block; margin-right: 10px;">${formData.name || ''}</div>
              <div style="display: inline-block; position: relative; min-width: 80px; vertical-align: middle;">
                <span>(서명)</span>
                ${formData.signature ? `<img src="${formData.signature}" style="height: 35px; position: absolute; top: -15px; left: 50%; transform: translateX(-50%);" />` : ''}
              </div>
            </td>
          </tr>
        </table>

        <!-- TBM 일시 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; font-weight: bold; background-color: #f0f0f0; text-align: center; vertical-align: middle !important;">TBM 일시</td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; vertical-align: middle !important;">${educationDate} ${startTime} (20분) 작업 날짜와 동일함</td>
          </tr>
        </table>

        <!-- 작업명 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; font-weight: bold; background-color: #f0f0f0; text-align: center; vertical-align: middle !important;">작업명</td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; vertical-align: middle !important;">${projectName} (${headquarters}-${branch})</td>
          </tr>
        </table>

        <!-- 작업내용 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; font-weight: bold; background-color: #f0f0f0; vertical-align: middle !important; text-align: center;">작업내용</td>
            ${this.formatWorkContent(todayWork, cellPadding)}
          </tr>
        </table>

        <!-- TBM 장소 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; font-weight: bold; background-color: #f0f0f0; text-align: center; vertical-align: middle !important;">TBM 장소</td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; vertical-align: middle !important;">${address}</td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 110px; font-weight: bold; background-color: #f0f0f0; text-align: center; font-size: 10px; vertical-align: middle !important;">위험성평가<br>실시여부</td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 100px; text-align: center; vertical-align: middle !important;">
              <span>예 ☑</span> <span style="margin-left: 8px;">아니오 ☐</span>
            </td>
          </tr>
        </table>

        <!-- 잠재위험요인 테이블 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <thead>
            <tr style="background-color: #f0f0f0;">
              <th style="border: 1px solid #000; padding: ${cellPadding}; width: 50%; text-align: center; vertical-align: middle;">잠재위험요인(수시위험성평가와 연계)</th>
              <th style="border: 1px solid #000; padding: ${cellPadding}; width: 50%; text-align: center; vertical-align: middle;">대책(제거>대체>통제 순서고려)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
                1. ${formData.potentialRisk1?.trim() || ''}
              </td>
              <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
                1. ${formData.solution1?.trim() || ''}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
                2. ${formData.potentialRisk2?.trim() || ''}
              </td>
              <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
                2. ${formData.solution2?.trim() || ''}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
                3. ${formData.potentialRisk3?.trim() || ''}
              </td>
              <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
                3. ${formData.solution3?.trim() || ''}
              </td>
            </tr>
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: 5px; width: 100px; font-weight: bold; background-color: #f0f0f0; text-align: center; vertical-align: middle;">중점위험 요인</td>
            <td style="border: 1px solid #000; padding: 5px; width: 40%; vertical-align: top;" valign="top">
              <strong>선정:</strong> ${formData.mainRiskSelection?.trim() || ''}
            </td>
            <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
              <strong>대책:</strong> ${formData.mainRiskSolution?.trim() || ''}
            </td>
          </tr>
        </table>

        <!-- 작업 전 안전조치 확인 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td colspan="2" style="border: 1px solid #000; padding: ${cellPadding}; background-color: #f0f0f0; vertical-align: middle !important;">
              <strong>■ 작업 전 안전조치 확인 ※ 위 잠재위험요인(중점위험 포함) 안전조치 여부 재확인</strong>
            </td>
          </tr>
          <tr style="background-color: #f0f0f0;">
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 70%; font-weight: bold; text-align: center; vertical-align: middle;">
              잠재위험요소(중점위험 포함)
            </td>
            <td style="border: 1px solid #000; padding: ${cellPadding}; width: 30%; text-align: center; font-weight: bold; vertical-align: middle;">
              조치여부
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
              1. ${formData.riskFactor1?.trim() || ''}
            </td>
            <td style="border: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">예 ☑ 아니오 ☐</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
              2. ${formData.riskFactor2?.trim() || ''}
            </td>
            <td style="border: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">예 ☑ 아니오 ☐</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 5px; vertical-align: top;" valign="top">
              3. ${formData.riskFactor3?.trim() || ''}
            </td>
            <td style="border: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">예 ☑ 아니오 ☐</td>
          </tr>
        </table>

        <!-- 작업 전 일일 안전점검 시행 결과 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; background-color: #f0f0f0; vertical-align: middle;">
              <strong>■ 작업 전 일일 안전점검 시행 결과 ※ 공사현장 일일안전점검을 통해 위험성평가 이행 확인</strong>
            </td>
          </tr>
        </table>

        <!-- 기타사항 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr>
            <td style="border: 1px solid #000; padding: ${cellPadding}; background-color: #f0f0f0; vertical-align: middle;">
              <strong>■ 기타사항(교육내용, 제안제도, 아차사고 등)</strong>
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: ${otherRemarksPadding}; min-height: ${otherRemarksMinHeight}; vertical-align: top; white-space: pre-line;">${otherRemarks}</td>
          </tr>
        </table>

        <!-- TBM 실시사진 / 투입인원 / 투입장비 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: -1px; font-size: 11px;">
          <tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #000; padding: ${cellPadding}; width: 40%; font-weight: bold; text-align: center; vertical-align: middle !important;">
              TBM 실시사진
            </th>
            <th style="border: 1px solid #000; padding: ${cellPadding}; width: 30%; font-weight: bold; text-align: center; vertical-align: middle !important;">
              투입인원
            </th>
            <th style="border: 1px solid #000; padding: ${cellPadding}; width: 30%; font-weight: bold; text-align: center; vertical-align: middle !important;">
              투입장비
            </th>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle;">
              ${formData.photo ? `<img src="${formData.photo}" style="width: 100%; height: auto; display: block; object-fit: cover;" />` : `<div style="height: ${photoEmptyHeight}; display: flex; align-items: center; justify-content: center; color: #999;">사진 없음</div>`}
            </td>
            <td style="border: 1px solid #000; padding: 5px; vertical-align: top; white-space: pre-line;" valign="top">
              ${personnelWithNewWorker?.trim() || ''}
            </td>
            <td style="border: 1px solid #000; padding: 5px; vertical-align: top; white-space: pre-line;" valign="top">
              ${equipment?.trim() || ''}
            </td>
          </tr>
        </table>

        <!-- 하단 메모 -->
        <div style="margin-top: ${bottomMarginTop}; font-size: 14px; color: #000; font-weight: bold;">
          붙임) TBM 참여 서명부 _ 작업장 출입 전.후 근로자 작업가능상태 점검
        </div>
      </div>
    `
  }

  // PDF 다운로드
  downloadPDF(filename: string) {
    if (this.doc) {
      this.doc.save(filename)
    }
  }

  // PDF Blob 반환 (서버 전송용)
  getPDFBlob(): Blob | null {
    if (this.doc) {
      return this.doc.output('blob')
    }
    return null
  }

  // 내부 이미지 로딩 완료 대기
  private async waitForImages(container: HTMLElement): Promise<void> {
    const images = Array.from(container.querySelectorAll('img'))
    if (images.length === 0) return

    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth !== 0) return Promise.resolve()
      return new Promise<void>(resolve => {
        const done = () => {
          img.removeEventListener('load', done)
          img.removeEventListener('error', done)
          resolve()
        }
        img.addEventListener('load', done)
        img.addEventListener('error', done)
      })
    }))
  }
}

// TBM 보고서 PDF 생성 함수
export async function generateTBMSubmissionReport(
  formData: TBMSubmissionFormData,
  filename?: string
): Promise<void> {
  const generator = new PDFGenerator()
  await generator.generateTBMReport(formData)
  // 파일명 형식: 사업명_TBM_일자.pdf
  const defaultFilename = `${formData.projectName || '사업명'}_TBM_${formData.educationDate || new Date().toISOString().split('T')[0]}.pdf`
  generator.downloadPDF(filename || defaultFilename)
}

// TBM 보고서 PDF 일괄 생성 함수 (1파일 다중 페이지)
export async function generateTBMSubmissionBulkReport(
  formDataList: TBMSubmissionFormData[],
  filename?: string,
  options?: {
    onProgress?: (current: number, total: number) => void
  }
): Promise<void> {
  if (formDataList.length === 0) {
    throw new Error('일괄 PDF 생성 대상이 없습니다.')
  }

  const generator = new PDFGenerator()
  for (let i = 0; i < formDataList.length; i++) {
    const formData = formDataList[i]
    await generator.appendTBMReportPage(formData)
    options?.onProgress?.(i + 1, formDataList.length)
  }

  const first = formDataList[0]
  const last = formDataList[formDataList.length - 1]
  const startDate = first.educationDate || new Date().toISOString().split('T')[0]
  const endDate = last.educationDate || startDate
  const dateLabel = startDate === endDate ? startDate : `${startDate}_${endDate}`
  const defaultFilename = `${first.projectName || '사업명'}_TBM_${dateLabel}_일괄.pdf`
  generator.downloadPDF(filename || defaultFilename)
}

export type { TBMSubmissionFormData }
