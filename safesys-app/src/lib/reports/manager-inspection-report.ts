import { type Project, type ManagerInspection } from '@/lib/projects'

export interface ManagerInspectionReportParams {
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

// 개별 점검표 HTML 생성
function generateInspectionHTML(inspection: ManagerInspection, project: Project, sequenceNumber: number): string {
  return `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 2px; text-decoration: underline;">
        ${project?.project_name || '000000사업'} ${getQuarterLabel(inspection.inspection_date)} 일상점검표
      </h1>
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
      
      <!-- 사진 영역 -->
      <tr>
        <td style="border: 0.5px solid #000; padding: 0;" colspan="6">
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
                ${(() => {
                  const top = (inspection as any)?.inspection_photo as string | undefined
                  if (top) return `<img src="${top}" style=\"width: 100%; height: 100%; object-fit: cover;\" />`
                  const photos = (inspection as any)?.form_data?.inspection_photos as string[] | undefined
                  const first = photos && photos.length > 0 ? photos[0] : null
                  return first ? `<img src=\"${first}\" style=\"width: 100%; height: 100%; object-fit: cover;\" />` : '점검사진'
                })()}
              </td>
              <td style="border-left: 0.5px solid #000; border-top: 0.5px solid #000; padding: 5px; height: 200px; text-align: center; vertical-align: middle; width: 50%;">
                ${(() => {
                  const top = (inspection as any)?.risk_assessment_photo as string | undefined
                  if (top) return `<img src="${top}" style=\"width: 100%; height: 100%; object-fit: cover;\" />`
                  const photos = (inspection as any)?.form_data?.risk_assessment_photos as string[] | undefined
                  const first = photos && photos.length > 0 ? photos[0] : null
                  return first ? `<img src=\"${first}\" style=\"width: 100%; height: 100%; object-fit: cover;\" />` : '위험성평가서 사진'
                })()}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- 위험성평가 제목 -->
      <tr>
        <td style="border: 0.5px solid #000; padding: 8px; text-align: left; vertical-align: middle; font-weight: bold;" colspan="6">
          □ 위험성평가 주요 유해위험요인 및 위험성 감소대책(위험등급 중, 상만 기재)
          <div style="font-size: 10px; margin-top: 5px; color: #666; font-weight: normal;">
            ※ 재해위험 3대 사유정형 물체맞음, 부딪힘, 추락 관련 작업에 대해서는 특별히 기재
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
            <tbody>
              ${generateRiskFactorRows(((inspection as any)?.risk_factors_json) || ((inspection as any)?.form_data?.risk_items) || [])}
            </tbody>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- 서명 영역 -->
    <div style="text-align: right; margin-top: 40px;">
      <div style="margin-bottom: 30px; font-size: 14px;">
        ${formatDate(inspection.inspection_date)}
      </div>
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 20px; text-align: right;">
        <span>점검자 ${inspection.inspector_name || '홍 길 동'} </span>
        <span style="position: relative; display: inline-block; margin-left: 10px;">
          ( 서명 )
          ${(() => { 
            const topSig = (inspection as any)?.signature as string | undefined
            if (topSig) return `<img src=\"${topSig}\" style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-height: 40px; max-width: 80px; z-index: 10;\" />`
            const sig = (inspection as any)?.form_data?.signature as string | undefined; 
            return sig ? `<img src=\"${sig}\" style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-height: 40px; max-width: 80px; z-index: 10;\" />` : '' 
          })()}
        </span>
      </div>
    </div>
  `
}

// 위험성평가 행 생성 (최소 10개 행 보장)
function generateRiskFactorRows(riskFactors: any[]): string {
  let rows = ''
  for (let i = 0; i < 10; i++) {
    const factor = riskFactors[i]
    rows += `
      <tr style="height: 40px;">
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

// 날짜 포맷팅
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}. &nbsp;&nbsp;${month}. &nbsp;&nbsp;${day}.`
}

// PDF 생성 메인 함수
export async function generateManagerInspectionReport(params: ManagerInspectionReportParams): Promise<void> {
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

  const pdf = new jsPDF('p', 'mm', 'a4')
  let isFirstPage = true

  for (let i = 0; i < targetInspections.length; i++) {
    const inspection = targetInspections[i]
    const sequenceNumber = getSequenceNumber(inspection, inspections)

    // HTML 컨테이너 생성
    const pdfContainer = document.createElement('div')
    pdfContainer.style.width = '210mm'
    pdfContainer.style.minHeight = '297mm'
    pdfContainer.style.padding = '20mm'
    pdfContainer.style.fontFamily = 'Arial, sans-serif'
    pdfContainer.style.backgroundColor = 'white'
    pdfContainer.style.fontSize = '12px'
    pdfContainer.style.lineHeight = '1.4'

    // 점검표 HTML 생성
    pdfContainer.innerHTML = generateInspectionHTML(inspection, project, sequenceNumber)

    // DOM에 추가 (화면에 보이지 않게)
    pdfContainer.style.position = 'absolute'
    pdfContainer.style.left = '-9999px'
    document.body.appendChild(pdfContainer)

    // 이미지 로드 대기
    await new Promise(resolve => setTimeout(resolve, 500))

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
  const fileName = `관리자점검표_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}_${targetInspections.length}건.pdf`
  pdf.save(fileName)
}

// 여러 프로젝트의 관리자 점검을 일괄 처리하는 함수
export interface ManagerInspectionBulkReportParams {
  projectInspections: Array<{
    project: Project
    inspections: ManagerInspection[]
  }>
  filename?: string
}

export async function generateManagerInspectionBulkReport(params: ManagerInspectionBulkReportParams): Promise<void> {
  const { projectInspections, filename } = params

  if (projectInspections.length === 0) {
    throw new Error('생성할 프로젝트가 없습니다.')
  }

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  let isFirstPage = true

  for (const { project, inspections } of projectInspections) {
    for (let i = 0; i < inspections.length; i++) {
      const inspection = inspections[i]
      const sequenceNumber = getSequenceNumber(inspection, inspections)

      // HTML 컨테이너 생성
      const pdfContainer = document.createElement('div')
      pdfContainer.style.width = '210mm'
      pdfContainer.style.minHeight = '297mm'
      pdfContainer.style.padding = '20mm'
      pdfContainer.style.fontFamily = 'Arial, sans-serif'
      pdfContainer.style.backgroundColor = 'white'
      pdfContainer.style.fontSize = '12px'
      pdfContainer.style.lineHeight = '1.4'

      // 점검표 HTML 생성
      pdfContainer.innerHTML = generateInspectionHTML(inspection, project, sequenceNumber)

      // DOM에 추가 (화면에 보이지 않게)
      pdfContainer.style.position = 'absolute'
      pdfContainer.style.left = '-9999px'
      document.body.appendChild(pdfContainer)

      // 이미지 로드 대기
      await new Promise(resolve => setTimeout(resolve, 500))

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
  }

  // PDF 저장
  const saveName = filename || `관리자점검표_일괄_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}.pdf`
  pdf.save(saveName)
}