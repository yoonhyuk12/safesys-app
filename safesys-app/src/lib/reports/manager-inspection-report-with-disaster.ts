import { type Project, type ManagerInspection } from '@/lib/projects'

export interface ManagerInspectionReportWithDisasterParams {
  project: Project
  inspections: ManagerInspection[]
  selectedRecords?: string[] // 선택된 점검 ID들 (없으면 전체)
}

// 분기 계산 함수
function getQuarterLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  if (month >= 1 && month <= 3) return '1분기'
  else if (month >= 4 && month <= 6) return '2분기'
  else if (month >= 7 && month <= 9) return '3분기'
  else return '4분기'
}

// 연번 계산 함수 (날짜순으로 정렬하여 순서 부여)
function getSequenceNumber(inspection: ManagerInspection, allInspections: ManagerInspection[]): number {
  const sortedInspections = allInspections.slice().sort((a, b) =>
    new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime()
  )
  return sortedInspections.findIndex(record => record.id === inspection.id) + 1
}

// 개별 점검표 HTML 생성 (재해예방 기술지도 사진 포함) - export for bulk report
export function generateInspectionHTMLWithDisaster(inspection: ManagerInspection, project: Project, sequenceNumber: number): string {
  // 재해예방 기술지도 사진이 있는지 확인
  const hasDisasterPhoto = !!(inspection as any)?.disaster_prevention_report_photo
  const riskRowCount = hasDisasterPhoto ? 5 : 10

  return `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 2px; text-decoration: underline;">
        ${project?.project_name || '000000사업'} ${getQuarterLabel(inspection.inspection_date)} 일상점검표
      </h1>
      <div style="font-size: 14px; margin-top: 8px; color: #000;">
        ※재해예방기술지도 수행 현장 점검표
      </div>
    </div>

    <!-- 기본정보 + 사진 영역 + 위험성평가 테이블 통합 -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <!-- 기본정보 영역 -->
      <tr style="height: 30px;">
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; width: 12%; text-align: center; vertical-align: middle; font-weight: bold; line-height: 1.2; display: table-cell; height: 30px;">연 번</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; width: 8%; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell; height: 30px;">${sequenceNumber}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; width: 12%; text-align: center; vertical-align: middle; font-weight: bold; line-height: 1.2; display: table-cell; height: 30px;">지 사</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; width: 18%; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell; height: 30px;">${project?.managing_branch || ''}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; width: 15%; text-align: center; vertical-align: middle; font-weight: bold; line-height: 1.2; display: table-cell; height: 30px;">공 사 명</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; width: 35%; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell; height: 30px;">${project?.project_name || ''}</td>
      </tr>
      <tr style="height: 30px;">
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; font-weight: bold; line-height: 1.2; display: table-cell; height: 30px;" colspan="2">공사감독</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell; height: 30px;" colspan="2">${(inspection as any)?.construction_supervisor || (inspection as any)?.form_data?.supervisor || inspection.inspector_name || ''}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; font-weight: bold; line-height: 1.2; display: table-cell; height: 30px;">시 공 사</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell; height: 30px;">${(project as any)?.user_profiles?.company_name || (inspection as any)?.form_data?.contractor || ''}</td>
      </tr>

      <!-- 사진 영역 (재해예방 사진 유무에 따라 2개 또는 3개) -->
      <tr>
        <td style="border: 0.5px solid #000; padding: 0;" colspan="6">
          ${(() => {
            const hasDisasterPhoto = !!(inspection as any)?.disaster_prevention_report_photo

            if (hasDisasterPhoto) {
              // 3개 사진 (재해예방 포함)
              return `
                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="height: 30px;">
                    <td style="border: none; padding: 0 8px 8px 8px; text-align: left; vertical-align: middle; font-weight: bold; width: 33.33%; line-height: 1.2; display: table-cell; height: 30px;">
                      □ 점검사진
                    </td>
                    <td style="border-left: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: left; vertical-align: middle; font-weight: bold; width: 33.33%; line-height: 1.2; display: table-cell; height: 30px;">
                      □ 위험성평가서 사진
                    </td>
                    <td style="border-left: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: left; vertical-align: middle; font-weight: bold; width: 33.33%; line-height: 1.2; display: table-cell; height: 30px;">
                      □ 재해예방기술지도 보고서
                    </td>
                  </tr>
                  <tr>
                    <td style="border: none; border-top: 0.5px solid #000; padding: 5px; height: 200px; text-align: center; vertical-align: middle; width: 33.33%;">
                      ${(() => {
                        const top = (inspection as any)?.inspection_photo as string | undefined
                        if (top) return '<img src="' + top + '" style="width: 100%; height: 100%; object-fit: cover;" />'
                        const photos = (inspection as any)?.form_data?.inspection_photos as string[] | undefined
                        const first = photos && photos.length > 0 ? photos[0] : null
                        return first ? '<img src="' + first + '" style="width: 100%; height: 100%; object-fit: cover;" />' : '점검사진'
                      })()}
                    </td>
                    <td style="border-left: 0.5px solid #000; border-top: 0.5px solid #000; padding: 0; height: 200px; text-align: center; vertical-align: middle; width: 33.33%; overflow: hidden; position: relative; line-height: 0;">
                      ${(() => {
                        const top = (inspection as any)?.risk_assessment_photo as string | undefined
                        if (top) return '<img src="' + top + '" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;" />'
                        const photos = (inspection as any)?.form_data?.risk_assessment_photos as string[] | undefined
                        const first = photos && photos.length > 0 ? photos[0] : null
                        return first ? '<img src="' + first + '" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;" />' : '<div style="padding: 5px;">위험성평가서 사진</div>'
                      })()}
                    </td>
                    <td style="border-left: 0.5px solid #000; border-top: 0.5px solid #000; padding: 0; height: 200px; text-align: center; vertical-align: middle; width: 33.33%; overflow: hidden; position: relative; line-height: 0;">
                      ${(() => {
                        const disasterPhoto = (inspection as any)?.disaster_prevention_report_photo as string | undefined
                        return disasterPhoto ? '<img src="' + disasterPhoto + '" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;" />' : '<div style="padding: 5px;">재해예방기술지도 보고서</div>'
                      })()}
                    </td>
                  </tr>
                </table>
              `
            } else {
              // 2개 사진 (재해예방 없음)
              const inspectionPhotoHtml = (() => {
                const top = (inspection as any)?.inspection_photo as string | undefined
                if (top) return '<img src="' + top + '" style="width: 100%; height: 100%; object-fit: cover;" />'
                const photos = (inspection as any)?.form_data?.inspection_photos as string[] | undefined
                const first = photos && photos.length > 0 ? photos[0] : null
                return first ? '<img src="' + first + '" style="width: 100%; height: 100%; object-fit: cover;" />' : '점검사진'
              })()
              
              const riskPhotoHtml = (() => {
                const top = (inspection as any)?.risk_assessment_photo as string | undefined
                if (top) return '<img src="' + top + '" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;" />'
                const photos = (inspection as any)?.form_data?.risk_assessment_photos as string[] | undefined
                const first = photos && photos.length > 0 ? photos[0] : null
                return first ? '<img src="' + first + '" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;" />' : '<div style="padding: 5px;">위험성평가서 사진</div>'
              })()

              return `
                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="height: 30px;">
                    <td style="border: none; padding: 0 8px 8px 8px; text-align: left; vertical-align: middle; font-weight: bold; width: 50%; line-height: 1.2; display: table-cell; height: 30px;">
                      □ 점검사진
                    </td>
                    <td style="border-left: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: left; vertical-align: middle; font-weight: bold; width: 50%; line-height: 1.2; display: table-cell; height: 30px;">
                      □ 위험성평가서 사진
                    </td>
                  </tr>
                  <tr>
                    <td style="border: none; border-top: 0.5px solid #000; padding: 5px; height: 200px; text-align: center; vertical-align: middle; width: 50%;">
                      ${inspectionPhotoHtml}
                    </td>
                    <td style="border-left: 0.5px solid #000; border-top: 0.5px solid #000; padding: 0; height: 200px; text-align: center; vertical-align: middle; width: 50%; overflow: hidden; position: relative; line-height: 0;">
                      ${riskPhotoHtml}
                    </td>
                  </tr>
                </table>
              `
            }
          })()}
        </td>
      </tr>

      <!-- 위험성평가 제목 -->
      <tr>
        <td style="border: 0.5px solid #000; padding: 8px; text-align: left; vertical-align: middle; font-weight: bold;" colspan="6">
          □ 위험성평가 주요 유해위험요인 및 위험성 감소대책(위험등급 중, 상만 기재)
          <div style="font-size: 10px; margin-top: 5px; color: #666; font-weight: normal;">
            ※ 재해취약 3개 사고유형(물체에맞음, 부딪힘, 추락) 관련 작업에 대해서는 필수 작성
          </div>
        </td>
      </tr>

      <!-- 위험성평가 테이블 -->
      <tr>
        <td colspan="6" style="border: 0.5px solid #000; padding: 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 15%; line-height: 1.2; display: table-cell;">세부작업</th>
                <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 20%; line-height: 1.2; display: table-cell;">유해위험요인</th>
                <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 35%; line-height: 1.2; display: table-cell;">위험성 감소대책<br/>세부내용</th>
                <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 15%; line-height: 1.2; display: table-cell;">이행여부</th>
                <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 15%; line-height: 1.2; display: table-cell;">비고</th>
              </tr>
            </thead>
            <tbody id="risk-rows">
              ${generateRiskFactorRows(((inspection as any)?.risk_factors_json) || ((inspection as any)?.form_data?.risk_items) || [], riskRowCount)}
            </tbody>
          </table>
        </td>
      </tr>

      <!-- 재해예방 기술지도 제목 (사진이 있는 경우에만 표시) -->
      ${(() => {
        const disasterPhoto = (inspection as any)?.disaster_prevention_report_photo
        const disasterFactors = (inspection as any)?.disaster_prevention_risk_factors_json || []
        // 재해예방 기술지도 사진이 있는 경우에만 섹션 표시
        if (disasterPhoto) {
          return `
            <tr>
              <td style="border: 0.5px solid #000; padding: 8px; text-align: left; vertical-align: middle; font-weight: bold;" colspan="6">
                □ 기술지도 결과보고서의 주요 유해·위험요인 및 예방대책
                <div style="font-size: 10px; margin-top: 5px; color: #666; font-weight: normal;">
                  ※ 재해취약 3대 사고유형(물체에맞음, 부딪힘, 추락) 관련 작업에 대해서는 필수 작성
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="6" style="border: 0.5px solid #000; padding: 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #e3f2fd;">
                      <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 15%; line-height: 1.2; display: table-cell;">세부작업</th>
                      <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 20%; line-height: 1.2; display: table-cell;">유해위험요인</th>
                      <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 35%; line-height: 1.2; display: table-cell;">예방대책<br/>세부내용</th>
                      <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 15%; line-height: 1.2; display: table-cell;">이행여부</th>
                      <th style="border: 0.5px solid #000; padding: 0 8px 8px 8px; text-align: center; vertical-align: middle; width: 15%; line-height: 1.2; display: table-cell;">비고</th>
                    </tr>
                  </thead>
                  <tbody id="disaster-rows">
                    ${generateRiskFactorRows(disasterFactors, 5)}
                  </tbody>
                </table>
              </td>
            </tr>
          `
        }
        return ''
      })()}
    </table>

    <!-- 서명 영역 -->
    <div id="signature-block" style="text-align: right; margin-top: 40px;">
      <div style="margin-bottom: 30px; font-size: 14px;">
        ${formatDate(inspection.inspection_date)}
      </div>
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 20px; text-align: right;">
        <span>점검자 ${inspection.inspector_name || '홍 길 동'} </span>
        <span style="position: relative; display: inline-block; margin-left: 10px;">
          ( 서명 )
          ${(() => {
            const topSig = (inspection as any)?.signature as string | undefined
            if (topSig) return `<img src=\"${topSig}\" style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-height: 60px; max-width: 120px; z-index: 10;\" />`
            const sig = (inspection as any)?.form_data?.signature as string | undefined;
            return sig ? `<img src=\"${sig}\" style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-height: 60px; max-width: 120px; z-index: 10;\" />` : ''
          })()}
        </span>
      </div>
    </div>
  `
}

// 위험성평가 행 생성
function generateRiskFactorRows(riskFactors: any[], rowCount: number = 10): string {
  let rows = ''
  for (let i = 0; i < rowCount; i++) {
    const factor = riskFactors[i]
    rows += `
      <tr style="height: 40px;" ${!factor ? 'data-blank="true"' : ''}>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; height: 40px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell;">${factor ? (factor.detail_work || '') : ''}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; height: 40px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell;">${factor ? (factor.risk_factor || '') : ''}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; height: 40px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell;">${factor ? (factor.details ?? factor.reduction_measure ?? '') : ''}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; height: 40px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell;">${factor ? ((factor.implementation === 'yes' || factor.implementation_yes === true) ? '☑' : '☐') : ''}</td>
        <td style="border: 0.5px solid #000; padding: 0 8px 8px 8px; height: 40px; text-align: center; vertical-align: middle; line-height: 1.2; display: table-cell;">${factor ? (factor.remarks || '') : ''}</td>
      </tr>
    `
  }
  return rows
}

// mm를 px로 변환 (DOM 상에서 실제 렌더링 기준)
function mmToPx(mm: number): number {
  const div = document.createElement('div')
  div.style.width = `${mm}mm`
  div.style.position = 'absolute'
  div.style.left = '-9999px'
  document.body.appendChild(div)
  const px = div.getBoundingClientRect().width
  document.body.removeChild(div)
  return px
}

// 페이지 높이를 초과하면 빈 행을 뒤에서부터 제거해 서명 영역이 페이지 내에 남도록 조정
function trimBlankRowsToFit(pdfContainer: HTMLElement): void {
  const pageHeightPx = mmToPx(297)
  const riskTbody = pdfContainer.querySelector('#risk-rows') as HTMLElement | null
  const disasterTbody = pdfContainer.querySelector('#disaster-rows') as HTMLElement | null
  const signature = pdfContainer.querySelector('#signature-block') as HTMLElement | null
  if (!signature) return

  // 서명 블록이 페이지 내에 들어오도록만 조정 (남는 빈 여백은 유지)
  const bottomSafetyPx = 40
  const signatureEl = signature as HTMLElement

  function signatureFits(): boolean {
    const containerRect = pdfContainer.getBoundingClientRect()
    const signatureRect = signatureEl.getBoundingClientRect()
    const signatureBottom = signatureRect.bottom - containerRect.top
    return signatureBottom <= (pageHeightPx - bottomSafetyPx)
  }

  let guard = 100
  while (guard-- > 0 && !signatureFits()) {
    // 재해예방 기술지도 테이블의 빈 행 먼저 삭제
    if (disasterTbody) {
      const disasterBlanks = disasterTbody.querySelectorAll('tr[data-blank="true"]')
      if (disasterBlanks && disasterBlanks.length > 0) {
        const lastBlank = disasterBlanks[disasterBlanks.length - 1] as HTMLElement
        lastBlank.parentElement?.removeChild(lastBlank)
        continue
      }
    }
    
    // 위험성평가 테이블의 빈 행 삭제
    if (riskTbody) {
      const riskBlanks = riskTbody.querySelectorAll('tr[data-blank="true"]')
      if (riskBlanks && riskBlanks.length > 0) {
        const lastBlank = riskBlanks[riskBlanks.length - 1] as HTMLElement
        lastBlank.parentElement?.removeChild(lastBlank)
        continue
      }
    }
    
    // 더 이상 삭제할 빈 행이 없으면 상단 여백 축소
    // 제목 부분의 margin-bottom 줄이기
    const titleDiv = pdfContainer.querySelector('div[style*="text-align: center"]') as HTMLElement | null
    if (titleDiv) {
      const currentMarginBottom = parseInt(titleDiv.style.marginBottom) || 30
      if (currentMarginBottom > 5) {
        titleDiv.style.marginBottom = `${Math.max(5, currentMarginBottom - 5)}px`
        continue
      }
    }
    
    // 컨테이너의 padding-top 줄이기
    const paddingTopStr = pdfContainer.style.paddingTop || '20mm'
    const paddingTopMatch = paddingTopStr.match(/(\d+(?:\.\d+)?)/)
    const currentPaddingTopMm = paddingTopMatch ? parseFloat(paddingTopMatch[1]) : 20
    const currentPaddingTopPx = mmToPx(currentPaddingTopMm)
    
    if (currentPaddingTopMm > 5) {
      const newPaddingTopMm = Math.max(5, currentPaddingTopMm - 2)
      pdfContainer.style.paddingTop = `${newPaddingTopMm}mm`
      continue
    }
    
    // 더 이상 조정할 수 없으면 종료
    break
  }
}

// 날짜 포맷팅
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}. &nbsp;&nbsp;${month}. &nbsp;&nbsp;${day}.`
}

// PDF 생성 메인 함수 (재해예방 기술지도 포함)
export async function generateManagerInspectionReportWithDisaster(params: ManagerInspectionReportWithDisasterParams): Promise<void> {
  const { project, inspections, selectedRecords } = params

  if (inspections.length === 0) {
    throw new Error('생성할 점검 항목이 없습니다.')
  }

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  // 선택된 점검들 또는 전체
  const targetInspections = selectedRecords && selectedRecords.length > 0
    ? inspections.filter(inspection => selectedRecords.includes(inspection.id))
    : inspections

  if (targetInspections.length === 0) {
    throw new Error('다운로드할 점검 항목을 선택해주세요.')
  }

  // 날짜순으로 정렬
  const sortedInspections = targetInspections.slice().sort((a, b) =>
    new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime()
  )

  const pdf = new jsPDF('p', 'mm', 'a4')
  let isFirstPage = true

  for (let i = 0; i < sortedInspections.length; i++) {
    const inspection = sortedInspections[i]
    const sequenceNumber = getSequenceNumber(inspection, inspections)

    // HTML 컨테이너 생성
    const pdfContainer = document.createElement('div')
    pdfContainer.style.width = '210mm'
    pdfContainer.style.minHeight = '297mm'
    pdfContainer.style.paddingTop = '20mm'
    pdfContainer.style.paddingRight = '20mm'
    pdfContainer.style.paddingBottom = '20mm'
    pdfContainer.style.paddingLeft = '20mm'
    pdfContainer.style.fontFamily = 'Arial, sans-serif'
    pdfContainer.style.backgroundColor = 'white'
    pdfContainer.style.fontSize = '12px'
    pdfContainer.style.lineHeight = '1.4'

    // 점검표 HTML 생성
    pdfContainer.innerHTML = generateInspectionHTMLWithDisaster(inspection, project, sequenceNumber)

    // DOM에 추가 (화면에 보이지 않게)
    pdfContainer.style.position = 'absolute'
    pdfContainer.style.left = '-9999px'
    document.body.appendChild(pdfContainer)

    // 이미지 로드 대기
    await new Promise(resolve => setTimeout(resolve, 500))

    // 페이지 초과 시 빈 행을 뒤에서부터 제거하여 서명 영역이 넘어가지 않도록 조정
    trimBlankRowsToFit(pdfContainer)

    // 캔버스로 변환
    const canvas = await html2canvas(pdfContainer, {
      scale: 1.9,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    })

    // DOM에서 제거
    document.body.removeChild(pdfContainer)

    // PDF에 이미지 추가
    const imgWidth = 210
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    if (!isFirstPage) {
      pdf.addPage()
    }
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
    isFirstPage = false
  }

  // PDF 저장
  // 파일명: 관리자점검_사업명_점검일자.pdf
  const firstInspectionDate = sortedInspections[0].inspection_date
  const dateObj = new Date(firstInspectionDate)
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  const formattedDate = `${year}${month}${day}`
  const projectName = project.project_name || '사업명없음'
  const fileName = `관리자점검_${projectName}_${formattedDate}.pdf`
  pdf.save(fileName)
}
