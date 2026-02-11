import { type Project, type ManagerInspection } from '@/lib/projects'
import { addSummaryPage, type ManagerInspectionSummaryParams } from './manager-inspection-summary'
import { generateInspectionHTMLWithDisaster } from './manager-inspection-report-with-disaster'

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
              <td style="border-left: 0.5px solid #000; border-top: 0.5px solid #000; padding: 0; height: 200px; text-align: center; vertical-align: middle; width: 50%; overflow: hidden; position: relative; line-height: 0;">
                ${(() => {
                  const top = (inspection as any)?.risk_assessment_photo as string | undefined
                  if (top) return `<img src=\"${top}\" style=\"position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;\" />`
                  const photos = (inspection as any)?.form_data?.risk_assessment_photos as string[] | undefined
                  const first = photos && photos.length > 0 ? photos[0] : null
                  return first ? `<img src=\"${first}\" style=\"position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; display: block;\" />` : '<div style=\"padding: 5px;\">위험성평가서 사진</div>'
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
              ${generateRiskFactorRows(((inspection as any)?.risk_factors_json) || ((inspection as any)?.form_data?.risk_items) || [])}
            </tbody>
          </table>
        </td>
      </tr>
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

// 위험성평가 행 생성 (최소 10개 행 보장)
function generateRiskFactorRows(riskFactors: any[]): string {
  let rows = ''
  for (let i = 0; i < 10; i++) {
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
    // 재해예방 기술지도 테이블의 빈 행 먼저 삭제 (있는 경우)
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

  // 날짜순으로 정렬 (총괄표 순서와 일치)
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

    // 재해예방 기술지도 사진 유무에 따라 다른 양식 적용
    const hasDisasterPhoto = !!(inspection as any)?.disaster_prevention_report_photo
    pdfContainer.innerHTML = hasDisasterPhoto 
      ? generateInspectionHTMLWithDisaster(inspection, project, sequenceNumber)
      : generateInspectionHTML(inspection, project, sequenceNumber)

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

// 여러 프로젝트의 관리자 점검을 일괄 처리하는 함수
export interface ManagerInspectionBulkReportParams {
  projectInspections: Array<{
    project: Project
    inspections: ManagerInspection[]
  }>
  filename?: string
  // 총괄표 추가 옵션
  summary?: {
    branchName?: string
    quarter: string
  }
}

export type ManagerInspectionBulkReportOptions = { 
  signal?: AbortSignal
  onProgress?: (current: number, total: number) => void
}

function ensureNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('cancelled')
  }
}

export async function generateManagerInspectionBulkReport(
  params: ManagerInspectionBulkReportParams,
  options?: ManagerInspectionBulkReportOptions
): Promise<void> {
  const { projectInspections, filename, summary } = params
  const signal = options?.signal
  const onProgress = options?.onProgress

  if (projectInspections.length === 0) {
    throw new Error('생성할 프로젝트가 없습니다.')
  }

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  let isFirstPage = true

  // 전체 점검 수 계산
  const calculateTotalInspections = () => {
    let total = 0
    for (const { inspections } of projectInspections) {
      total += inspections.length
    }
    return total
  }
  const totalInspections = calculateTotalInspections()
  let currentInspectionIndex = 0

  // 지사별 그룹핑 유틸
  const groupByBranch = (items: typeof projectInspections) => {
    const map = new Map<string, typeof projectInspections>()
    for (const item of items) {
      const branch = (item.project as any)?.managing_branch || '미지정'
      if (!map.has(branch)) map.set(branch, [])
      map.get(branch)!.push(item)
    }
    return map
  }

  // 1) summary.branchName 이 있으면 단일 지사 총괄표 + 전체 렌더 (projectInspections 가 이미 해당 지사로 제한되어 있을 것)
  // 2) summary.quarter 만 있으면 지사별로 그룹핑해서, 각 지사 총괄표 뒤에 해당 지사 점검표들 렌더
  // 3) summary 가 없으면 기존 방식대로 전체 순회 렌더

  if (summary?.branchName) {
    await addSummaryPage(pdf, {
      branchName: summary.branchName,
      quarter: summary.quarter,
      projectInspections
    }, isFirstPage)
    isFirstPage = false
    ensureNotCancelled(signal)
    onProgress?.(0, totalInspections) // 총괄표 완료

    // 모든 점검을 날짜순으로 정렬 (총괄표 순서와 일치)
    const allInspectionsWithProject: Array<{ inspection: ManagerInspection, project: Project }> = []
    for (const { project, inspections } of projectInspections) {
      for (const inspection of inspections) {
        allInspectionsWithProject.push({ inspection, project })
      }
    }

    // 총괄표와 동일한 정렬 방식 사용
    allInspectionsWithProject.sort((a, b) => {
      const parseDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const dateFormatted = date.toLocaleDateString('ko-KR', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\. /g, '.').replace(/\.$/, '')

        const parts = dateFormatted.split('.').filter(p => p)
        if (parts.length >= 3) {
          const year = parseInt(parts[0]) + 2000
          const month = parseInt(parts[1])
          const day = parseInt(parts[2])
          return new Date(year, month - 1, day).getTime()
        }
        return 0
      }
      return parseDate(a.inspection.inspection_date) - parseDate(b.inspection.inspection_date)
    })

    // 날짜순으로 정렬된 순서대로 보고서 생성
    for (let i = 0; i < allInspectionsWithProject.length; i++) {
      ensureNotCancelled(signal)
      const { inspection, project } = allInspectionsWithProject[i]
      const sequenceNumber = i + 1 // 총괄표 순서와 일치하는 연번
      currentInspectionIndex++
      onProgress?.(currentInspectionIndex, totalInspections)

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

      pdfContainer.innerHTML = generateInspectionHTML(inspection, project, sequenceNumber)
      pdfContainer.style.position = 'absolute'
      pdfContainer.style.left = '-9999px'
      document.body.appendChild(pdfContainer)

      await new Promise(resolve => setTimeout(resolve, 500))
      ensureNotCancelled(signal)
      trimBlankRowsToFit(pdfContainer)

      const canvas = await html2canvas(pdfContainer, { scale: 1.9, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
      ensureNotCancelled(signal)
      document.body.removeChild(pdfContainer)

      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      if (!isFirstPage) pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
      isFirstPage = false
    }
  } else if (summary?.quarter) {
    const groups = groupByBranch(projectInspections)
    for (const [branchName, items] of groups.entries()) {
      await addSummaryPage(pdf, { branchName, quarter: summary.quarter, projectInspections: items }, isFirstPage)
      isFirstPage = false
      ensureNotCancelled(signal)
      onProgress?.(0, totalInspections) // 총괄표 완료

      // 해당 지사의 모든 점검을 날짜 오름차순으로 정렬 (총괄표와 동일 기준)
      const flatSorted = items
        .flatMap(({ project, inspections }) => inspections.map((inspection) => ({ project, inspection, inspections })))
        .sort((a, b) => {
          const toKey = (dateStr: string) => {
            const d = new Date(dateStr)
            const s = d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
              .replace(/\. /g, '.').replace(/\.$/, '')
            const parts = s.split('.').filter(Boolean)
            if (parts.length >= 3) {
              const y = parseInt(parts[0]) + 2000
              const m = parseInt(parts[1])
              const dd = parseInt(parts[2])
              return new Date(y, m - 1, dd).getTime()
            }
            return 0
          }
          return toKey(a.inspection.inspection_date) - toKey(b.inspection.inspection_date)
        })

      for (let i = 0; i < flatSorted.length; i++) {
        ensureNotCancelled(signal)
        const { project, inspections, inspection } = flatSorted[i]
        const sequenceNumber = i + 1
        currentInspectionIndex++
        onProgress?.(currentInspectionIndex, totalInspections)

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

        // 재해예방 기술지도 사진 유무에 따라 다른 양식 적용
        const hasDisasterPhoto = !!(inspection as any)?.disaster_prevention_report_photo
        pdfContainer.innerHTML = hasDisasterPhoto 
          ? generateInspectionHTMLWithDisaster(inspection, project, sequenceNumber)
          : generateInspectionHTML(inspection, project, sequenceNumber)
        
        pdfContainer.style.position = 'absolute'
        pdfContainer.style.left = '-9999px'
        document.body.appendChild(pdfContainer)

        await new Promise(resolve => setTimeout(resolve, 500))
        ensureNotCancelled(signal)
        trimBlankRowsToFit(pdfContainer)

        const canvas = await html2canvas(pdfContainer, { scale: 1.9, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
        ensureNotCancelled(signal)
        document.body.removeChild(pdfContainer)

        const imgWidth = 210
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        if (!isFirstPage) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
        isFirstPage = false
      }
    }
  } else {
    // 기존 로직: 총괄표 없이 전체 순회 렌더
    for (const { project, inspections } of projectInspections) {
      ensureNotCancelled(signal)
      for (let i = 0; i < inspections.length; i++) {
        ensureNotCancelled(signal)
        const inspection = inspections[i]
        const sequenceNumber = getSequenceNumber(inspection, inspections)
        currentInspectionIndex++
        onProgress?.(currentInspectionIndex, totalInspections)

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

        // 재해예방 기술지도 사진 유무에 따라 다른 양식 적용
        const hasDisasterPhoto = !!(inspection as any)?.disaster_prevention_report_photo
        pdfContainer.innerHTML = hasDisasterPhoto 
          ? generateInspectionHTMLWithDisaster(inspection, project, sequenceNumber)
          : generateInspectionHTML(inspection, project, sequenceNumber)
        
        pdfContainer.style.position = 'absolute'
        pdfContainer.style.left = '-9999px'
        document.body.appendChild(pdfContainer)

        await new Promise(resolve => setTimeout(resolve, 500))
        ensureNotCancelled(signal)
        trimBlankRowsToFit(pdfContainer)

        const canvas = await html2canvas(pdfContainer, { scale: 1.9, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
        ensureNotCancelled(signal)
        document.body.removeChild(pdfContainer)

        const imgWidth = 210
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        if (!isFirstPage) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
        isFirstPage = false
      }
    }
  }

  // PDF 저장
  let saveName = filename
  if (!saveName) {
    // filename이 없으면 기본값 생성: 지사명_25년4분기_관리자점검.pdf
    if (summary?.quarter) {
      const quarterMatch = summary.quarter.match(/(\d{4})Q(\d)/)
      const year = quarterMatch ? quarterMatch[1] : new Date().getFullYear().toString()
      const quarter = quarterMatch ? parseInt(quarterMatch[2]) : Math.ceil((new Date().getMonth() + 1) / 3)
      const yearShort = year.slice(-2) // 마지막 2자리만 (2025 -> 25)
      
      // 첫 번째 지사명 추출
      let branchName = '미지정'
      if (summary?.branchName) {
        branchName = summary.branchName
      } else if (projectInspections.length > 0) {
        branchName = (projectInspections[0].project as any)?.managing_branch || '미지정'
      }
      
      saveName = `${branchName}_${yearShort}년${quarter}분기_관리자점검.pdf`
    } else {
      saveName = `관리자점검표_일괄_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}.pdf`
    }
  }
  pdf.save(saveName)
}