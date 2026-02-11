/**
 * 지사별 관리자 점검 총괄표 생성
 */

import type { Project, ManagerInspection } from '../projects'

export interface ManagerInspectionSummaryParams {
  branchName: string
  quarter: string
  projectInspections: Array<{
    project: Project
    inspections: ManagerInspection[]
  }>
}

/**
 * 총괄표 HTML 생성
 */
function generateSummaryHTML(
  params: ManagerInspectionSummaryParams,
  page: number = 1,
  inspectionsForPage?: Array<{
    date: string
    project: string
    district: string
    checkItems: number
    note: string
  }>,
  startIndex: number = 0
): string {
  const { branchName, quarter, projectInspections } = params

  // 분기 숫자 추출
  const quarterMatch = quarter.match(/(\d{4})Q(\d)/)
  const year = quarterMatch ? quarterMatch[1] : new Date().getFullYear().toString()
  const q = quarterMatch ? parseInt(quarterMatch[2]) : Math.ceil((new Date().getMonth() + 1) / 3)

  // 점검별 통계 계산 (inspectionsForPage가 제공되지 않은 경우에만)
  let allInspections: Array<{
    date: string
    project: string
    district: string
    checkItems: number
    note: string
  }> = []

  if (inspectionsForPage) {
    allInspections = inspectionsForPage
  } else {
    // 지구명 추출 함수: 사업명에서 첫 번째 공백 또는 "지구" 앞까지 추출
    const extractDistrict = (projectName: string) => {
      if (!projectName) return '-'

      // "지구" 키워드가 있으면 "지구"까지 포함
      const districtMatch = projectName.match(/^(.+?지구)/)
      if (districtMatch) {
        return districtMatch[1]
      }

      // "지구"가 없으면 첫 번째 공백 전까지
      const spaceIndex = projectName.indexOf(' ')
      if (spaceIndex > 0) {
        return projectName.substring(0, spaceIndex)
      }

      return projectName
    }

    projectInspections.forEach((pi) => {
      pi.inspections.forEach((inspection) => {
        // 재해 예방 기술지도 프로젝트인지 확인
        const isDisasterPreventionTarget = !!(pi.project as any).disaster_prevention_target
        allInspections.push({
          date: new Date(inspection.inspection_date).toLocaleDateString('ko-KR', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit'
          }).replace(/\. /g, '.').replace(/\.$/, ''),
          project: pi.project.project_name || '미지정',
          district: extractDistrict(pi.project.project_name || ''),
          checkItems: Array.isArray(inspection.risk_factors_json) ? inspection.risk_factors_json.length : 0,
          note: isDisasterPreventionTarget ? '재해' : ''
        })
      })
    })

    // 날짜순 정렬 (일자 기준 오름차순)
    allInspections.sort((a, b) => {
      // "25.07.02" 형식을 "2025-07-02"로 변환
      const parseDate = (dateStr: string) => {
        const parts = dateStr.split('.').filter(p => p)
        if (parts.length >= 3) {
          const year = parseInt(parts[0]) + 2000 // 25 -> 2025
          const month = parseInt(parts[1])
          const day = parseInt(parts[2])
          return new Date(year, month - 1, day).getTime()
        }
        return 0
      }
      return parseDate(a.date) - parseDate(b.date)
    })
  }

  // 총계 계산
  const totalCheckItems = allInspections.reduce((sum, insp) => sum + insp.checkItems, 0)

  // 데이터 행 생성
  const dataRows = allInspections.map((insp, index) => {
    // 사업명과 지구명의 길이에 따라 폰트 크기와 자간 조정
    const getTextStyle = (text: string, maxLength: number) => {
      if (text.length > maxLength) {
        return 'font-size: 11px; letter-spacing: -1px; word-spacing: -2px;'
      }
      return 'font-size: 13px; letter-spacing: -0.5px;'
    }

    return `
    <tr>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;">${startIndex + index + 1}</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;">${insp.date}</td>
      <td style="border: 1px solid #000; padding: 0px 4px 8px 4px; text-align: center; white-space: nowrap; overflow: hidden; ${getTextStyle(insp.project, 20)}">${insp.project}</td>
      <td style="border: 1px solid #000; padding: 0px 4px 8px 4px; text-align: center; white-space: nowrap; overflow: hidden; ${getTextStyle(insp.district, 15)}">${insp.district}</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;">${insp.checkItems}개</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;">${insp.note}</td>
    </tr>
  `
  }).join('')

  // 빈 행 생성 (페이지를 최대한 채우되 하단 여백(30px) 확보)
  // 헤더(1행) + 계(1행) + 데이터 + 빈행으로 페이지 채우기
  // 하단 여백을 넘지 않도록 최대 행 수 제한
  const maxRowsPerPage = 26 // 헤더와 계 제외한 데이터+빈행 최대 수 (하단 여백 30px 확보, 행 높이 증가)
  const emptyRowCount = Math.max(0, Math.min(21, maxRowsPerPage - allInspections.length))
  const emptyRows = Array(emptyRowCount).fill(0).map(() => `
    <tr data-empty-row="true">
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; height: 35px;">&nbsp;</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px;">&nbsp;</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px;">&nbsp;</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px;">&nbsp;</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px;">&nbsp;</td>
      <td style="border: 1px solid #000; padding: 0px 8px 8px 8px;">&nbsp;</td>
    </tr>
  `).join('')

  return `
    <div style="width: 100%; height: 100%; font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: 10px 10px 30px 10px;">
      <!-- 헤더 박스 -->
      <div class="header-section" style="display: flex; align-items: flex-start; margin-bottom: 5px;">
        <div style="background-color: #1e3a8a; color: white; padding: 8px 16px; font-weight: bold; font-size: 16px; margin-right: 10px;">
          붙임
        </div>
        <div style="border: 2px solid #000; padding: 8px 16px; flex: 1; font-size: 16px; font-weight: bold;">
          ${branchName} 일상점검 점검표
        </div>
      </div>

      <!-- 제목 -->
      <div class="title-section" style="text-align: center; margin: 10px 0;">
        <h1 style="display: inline-block; font-size: 30px; font-weight: 900; margin: 0; padding-bottom: 10px; border-bottom: 2px solid #000;">
          ${branchName} ${q}분기 일상점검 총괄표
        </h1>
      </div>

      <!-- 테이블 -->
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 10px;">
        <thead>
          <tr>
            <th style="border: 1px solid #000; border-bottom: 3px double #000; padding: 0px 10px 10px 10px; text-align: center; background-color: #f0f0f0; font-size: 14px; font-weight: bold; width: 8%;">연번</th>
            <th style="border: 1px solid #000; border-bottom: 3px double #000; padding: 0px 10px 10px 10px; text-align: center; background-color: #f0f0f0; font-size: 14px; font-weight: bold; width: 12%;">점검일</th>
            <th style="border: 1px solid #000; border-bottom: 3px double #000; padding: 0px 10px 10px 10px; text-align: center; background-color: #f0f0f0; font-size: 14px; font-weight: bold; width: 28%;">사업명</th>
            <th style="border: 1px solid #000; border-bottom: 3px double #000; padding: 0px 10px 10px 10px; text-align: center; background-color: #f0f0f0; font-size: 14px; font-weight: bold; width: 24%;">지구명</th>
            <th style="border: 1px solid #000; border-bottom: 3px double #000; padding: 0px 10px 10px 10px; text-align: center; background-color: #f0f0f0; font-size: 14px; font-weight: bold; width: 18%;">주요<br/>유해위험요인<br/>(개수)</th>
            <th style="border: 1px solid #000; border-bottom: 3px double #000; padding: 0px 5px 10px 5px; text-align: center; background-color: #f0f0f0; font-size: 14px; font-weight: bold; width: 10%;">비고</th>
          </tr>
        </thead>
        <tbody>
          <!-- 계 행 -->
          <tr style="background-color: #f9f9f9;">
            <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px; font-weight: bold;">계</td>
            <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;"></td>
            <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;">${allInspections.length}건</td>
            <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;"></td>
            <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;">${totalCheckItems}개</td>
            <td style="border: 1px solid #000; padding: 0px 8px 8px 8px; text-align: center; font-size: 13px;"></td>
          </tr>
          <!-- 데이터 행 -->
          ${dataRows}
          <!-- 빈 행 -->
          ${emptyRows}
        </tbody>
      </table>
    </div>
  `
}

/**
 * 총괄표 PDF 페이지 추가
 */
export async function addSummaryPage(
  pdf: any,
  params: ManagerInspectionSummaryParams,
  isFirstPage: boolean
): Promise<boolean> {
  const html2canvas = (await import('html2canvas')).default

  // 지구명 추출 함수: 사업명에서 첫 번째 공백 또는 "지구" 앞까지 추출
  const extractDistrict = (projectName: string) => {
    if (!projectName) return '-'

    // "지구" 키워드가 있으면 "지구"까지 포함
    const districtMatch = projectName.match(/^(.+?지구)/)
    if (districtMatch) {
      return districtMatch[1]
    }

    // "지구"가 없으면 첫 번째 공백 전까지
    const spaceIndex = projectName.indexOf(' ')
    if (spaceIndex > 0) {
      return projectName.substring(0, spaceIndex)
    }

    return projectName
  }

  // 모든 점검 데이터 수집
  const allInspections: Array<{
    date: string
    project: string
    district: string
    checkItems: number
    note: string
  }> = []

  params.projectInspections.forEach((pi) => {
    pi.inspections.forEach((inspection) => {
      // 재해 예방 기술지도 프로젝트인지 확인
      const isDisasterPreventionTarget = !!(pi.project as any).disaster_prevention_target
      allInspections.push({
        date: new Date(inspection.inspection_date).toLocaleDateString('ko-KR', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\. /g, '.').replace(/\.$/, ''),
        project: pi.project.project_name || '미지정',
        district: extractDistrict(pi.project.project_name || ''),
        checkItems: Array.isArray(inspection.risk_factors_json) ? inspection.risk_factors_json.length : 0,
        note: isDisasterPreventionTarget ? '재해' : ''
      })
    })
  })

  // 날짜순 정렬 (일자 기준 오름차순)
  allInspections.sort((a, b) => {
    // "25.07.02" 형식을 "2025-07-02"로 변환
    const parseDate = (dateStr: string) => {
      const parts = dateStr.split('.').filter(p => p)
      if (parts.length >= 3) {
        const year = parseInt(parts[0]) + 2000 // 25 -> 2025
        const month = parseInt(parts[1])
        const day = parseInt(parts[2])
        return new Date(year, month - 1, day).getTime()
      }
      return 0
    }
    return parseDate(a.date) - parseDate(b.date)
  })

  // 페이지당 최대 행 수 (헤더와 계 제외)
  const maxRowsPerPage = 26

  // 여러 페이지로 분할
  const pages: Array<Array<typeof allInspections[0]>> = []
  for (let i = 0; i < allInspections.length; i += maxRowsPerPage) {
    pages.push(allInspections.slice(i, i + maxRowsPerPage))
  }

  // 페이지가 없으면 빈 페이지 하나 추가
  if (pages.length === 0) {
    pages.push([])
  }

  // 각 페이지 생성
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const inspectionsForPage = pages[pageIndex]
    const startIndex = pageIndex * maxRowsPerPage // 일련번호 시작 인덱스

    // HTML 컨테이너 생성
    const summaryContainer = document.createElement('div')
    summaryContainer.style.width = '210mm'
    summaryContainer.style.minHeight = '297mm'
    summaryContainer.style.padding = '10mm'
    summaryContainer.style.backgroundColor = 'white'
    summaryContainer.style.boxSizing = 'border-box'

    // 총괄표 HTML 생성
    summaryContainer.innerHTML = generateSummaryHTML(params, pageIndex + 1, inspectionsForPage, startIndex)

    // DOM에 추가 (화면에 보이지 않게)
    summaryContainer.style.position = 'absolute'
    summaryContainer.style.left = '-9999px'
    document.body.appendChild(summaryContainer)

    try {
      // 페이지 높이 초과 시 하단의 빈 행을 제거하여 하단 여백을 확보
      ;(() => {
        const container = summaryContainer
        const tbody = container.querySelector('tbody')
        if (!tbody) return

        // 실제 사용 가능한 높이 계산 (A4 높이 - 상단/하단 패딩)
        const pageHeight = 297 // A4 높이 (mm)
        const topPadding = 10 // 상단 패딩 (mm)
        const bottomPadding = 30 // 하단 여백 (mm)
        const availableHeight = pageHeight - topPadding - bottomPadding

        // 각 요소의 높이 측정
        const headerDiv = container.querySelector('.header-section') as HTMLElement
        const titleDiv = container.querySelector('.title-section') as HTMLElement
        const table = container.querySelector('table') as HTMLElement

        if (!headerDiv || !titleDiv || !table) return

        // 헤더와 제목 높이 측정 (픽셀 단위)
        const headerHeight = headerDiv.offsetHeight || 60
        const titleHeight = titleDiv.offsetHeight || 80

        // 테이블의 현재 높이 계산
        const tableHeight = table.offsetHeight

        // 사용 가능한 픽셀 높이로 변환 (1mm ≈ 3.78px)
        const availablePixelHeight = availableHeight * 3.78

        // 현재 총 높이
        const currentTotalHeight = headerHeight + titleHeight + tableHeight

        // 초과량 계산
        const excessHeight = currentTotalHeight - availablePixelHeight

        if (excessHeight > 0) {
          // 빈 행들을 찾아서 제거해야 할 행 수 계산
          const emptyRows = Array.from(
            tbody.querySelectorAll('tr[data-empty-row="true"]')
          ) as HTMLElement[]

          if (emptyRows.length > 0) {
            // 각 빈 행의 대략적인 높이 (35px 패딩 + 테두리 등)
            const emptyRowHeight = 40
            const rowsToRemove = Math.ceil(excessHeight / emptyRowHeight)

            // 뒤에서부터 제거
            for (let i = 0; i < Math.min(rowsToRemove, emptyRows.length); i++) {
              if (emptyRows[emptyRows.length - 1 - i]) {
                emptyRows[emptyRows.length - 1 - i].remove()
              }
            }
          }
        }
      })()

      // 이미지 로드 대기
      await new Promise(resolve => setTimeout(resolve, 300))

      // 캔버스로 변환
      const canvas = await html2canvas(summaryContainer, {
        scale: 1.9,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })

      // PDF에 이미지 추가
      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      if (!isFirstPage || pageIndex > 0) {
        pdf.addPage()
      }
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
    } finally {
      // DOM에서 제거
      document.body.removeChild(summaryContainer)
    }
  }

  return true
}
