import type { Project } from '@/lib/projects'

export interface TBMSafetyInspectionReportParams {
  inspection: any
  project: Project
}

function yesNo(value: boolean | null | undefined): string {
  if (value === true) return '☑'
  if (value === false) return '☐'
  return '☐'
}

function formatTime(time: string | null | undefined): string {
  if (!time) return ''
  return time.substring(0, 5) // HH:MM 형식
}

function calculateDuration(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime || !endTime) return ''
  
  try {
    const start = new Date(`2000-01-01T${startTime}`)
    const end = new Date(`2000-01-01T${endTime}`)
    const diffMs = end.getTime() - start.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    
    if (diffMinutes < 0) return ''
    return `(${diffMinutes}분)`
  } catch {
    return ''
  }
}

function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

export async function generateTBMSafetyInspectionReport(params: TBMSafetyInspectionReportParams): Promise<void> {
  const { inspection, project } = params

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  
  // HTML 컨테이너 생성
  const pdfContainer = document.createElement('div')
  pdfContainer.style.width = '210mm'
  pdfContainer.style.minHeight = '297mm'
  pdfContainer.style.padding = '15mm'
  pdfContainer.style.fontFamily = 'Malgun Gothic, Arial, sans-serif'
  pdfContainer.style.backgroundColor = 'white'
  pdfContainer.style.fontSize = '11px'
  pdfContainer.style.lineHeight = '1.5'

  // TBM 안전활동 점검표 HTML 생성
  pdfContainer.innerHTML = `
    <style>
      table { 
        border-collapse: collapse; 
        width: 100%;
        margin-bottom: 10px;
      }
      table td, table th { 
        border: 1px solid #000;
        padding: 8px;
        vertical-align: middle;
        text-align: left;
      }
      table th {
        background-color: #f0f0f0;
        font-weight: bold;
        text-align: center;
      }
      .header {
        text-align: center;
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 15px;
        text-decoration: underline;
      }
      .section-title {
        background-color: #e0e0e0;
        font-weight: bold;
        text-align: center;
      }
      .text-center {
        text-align: center;
      }
      .text-right {
        text-align: right;
      }
      .col-1 { width: 10%; }
      .col-2 { width: 20%; }
      .col-3 { width: 30%; }
      .col-4 { width: 40%; }
      .col-5 { width: 50%; }
      .col-6 { width: 60%; }
      .col-7 { width: 70%; }
      .col-8 { width: 80%; }
      .col-9 { width: 90%; }
      .col-10 { width: 100%; }
      .checkbox {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 1px solid #000;
        margin-right: 5px;
        vertical-align: middle;
      }
      .content-cell {
        min-height: 40px;
        word-wrap: break-word;
      }
    </style>
    
    <div class="header">${project.project_name || ''} TBM 및 안전활동 일일 점검표</div>
    
    <table>
      <tr>
        <th class="col-2">지구명</th>
        <td class="col-3">${inspection.district || ''}</td>
        <th class="col-2">사업명</th>
        <td class="col-3">${project.project_name || ''}</td>
      </tr>
      <tr>
        <th>공사감독</th>
        <td>${inspection.supervisor || project.supervisor_name || ''}</td>
        <th>시공사</th>
        <td>${(project as any)?.user_profiles?.company_name || ''}</td>
      </tr>
      <tr>
        <th>TBM 일시</th>
        <td colspan="3">
          ${formatDate(inspection.tbm_date)} ${formatTime(inspection.tbm_start_time)} ~ ${formatTime(inspection.tbm_end_time)}${calculateDuration(inspection.tbm_start_time, inspection.tbm_end_time)}
        </td>
      </tr>
    </table>

    <table>
      <tr>
        <th class="section-title" colspan="4">입회 정보</th>
      </tr>
      <tr>
        <th class="col-2">입회여부</th>
        <td class="col-3">
          ${yesNo(inspection.is_attended)} 예 &nbsp;&nbsp; ${yesNo(inspection.is_attended === false)} 아니오
        </td>
        <th class="col-2">미입회 사유</th>
        <td class="col-3">${inspection.non_attendance_reason || ''}</td>
      </tr>
      <tr>
        <th>입회자 소속</th>
        <td>${inspection.attendee_affiliation || ''}</td>
        <th>입회자</th>
        <td>${inspection.attendee || ''}</td>
      </tr>
    </table>

    <table>
      <tr>
        <th class="section-title" colspan="4">작업 정보</th>
      </tr>
      <tr>
        <th class="col-2">작업내용</th>
        <td class="col-8 content-cell">${inspection.work_content || ''}</td>
      </tr>
      <tr>
        <th>주소</th>
        <td colspan="3">${inspection.address || ''}</td>
      </tr>
      <tr>
        <th>TBM 내용</th>
        <td colspan="3" class="content-cell">${inspection.tbm_content || ''}</td>
      </tr>
    </table>

    <table>
      <tr>
        <th class="section-title" colspan="4">투입 현황</th>
      </tr>
      <tr>
        <th class="col-2">근로자(명)</th>
        <td class="col-3">${inspection.workers || ''}</td>
        <th class="col-2">신규근로자(명)</th>
        <td class="col-3">${inspection.new_workers || ''}</td>
      </tr>
      <tr>
        <th>장비(대수)</th>
        <td>${inspection.equipment || ''}</td>
        <th>신호수(명)</th>
        <td>${inspection.signal_workers || ''}</td>
      </tr>
    </table>

    <table>
      <tr>
        <th class="section-title" colspan="4">현장관리자 활동사항</th>
      </tr>
      <tr>
        <th class="col-2">현장설명(현장상태, 이동동선 등)</th>
        <td class="col-3">
          ${yesNo(inspection.site_explanation)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.site_explanation === false)} 미조치
        </td>
        <th class="col-2">미조치 사유</th>
        <td class="col-3">${inspection.site_explanation_reason || ''}</td>
      </tr>
      <tr>
        <th>작업위험요인 설명</th>
        <td>
          ${yesNo(inspection.risk_explanation)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.risk_explanation === false)} 미조치
        </td>
        <th>미조치 사유</th>
        <td>${inspection.risk_explanation_reason || ''}</td>
      </tr>
      <tr>
        <th>개인보호구 지급</th>
        <td>
          ${yesNo(inspection.ppe_provision)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.ppe_provision === false)} 미조치
        </td>
        <th>미조치 사유</th>
        <td>${inspection.ppe_provision_reason || ''}</td>
      </tr>
      <tr>
        <th>작업전 건강상태 확인</th>
        <td>
          ${yesNo(inspection.health_check)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.health_check === false)} 미조치
        </td>
        <th>미조치 사유</th>
        <td>${inspection.health_check_reason || ''}</td>
      </tr>
    </table>

    <table>
      <tr>
        <th class="section-title" colspan="4">입회자 의견</th>
      </tr>
      <tr>
        <td colspan="4" class="content-cell" style="min-height: 60px;">
          ${inspection.attendee_opinion || ''}
        </td>
      </tr>
    </table>

    <div style="margin-top: 30px; text-align: right;">
      <div>
        <span style="font-weight: bold;">소속:</span> ${inspection.attendee_affiliation || ''} &nbsp;&nbsp;
        <span style="font-weight: bold;">이름:</span> ${inspection.attendee || ''} &nbsp;&nbsp;
        ${inspection.signature ? `<img src="${inspection.signature}" style="max-height: 40px; vertical-align: middle; display: inline-block;" />` : ''}
      </div>
    </div>
  `

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

  pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')

  // PDF 저장
  const dateStr = formatDate(inspection.tbm_date).replace(/\./g, '')
  const fileName = `TBM안전활동점검표_${project.project_name}_${dateStr}.pdf`
  pdf.save(fileName)
}

// 여러 프로젝트의 TBM 안전활동점검을 일괄 처리하는 함수
export interface TBMSafetyInspectionBulkReportParams {
  projectInspections: Array<{
    project: Project
    inspections: any[]
  }>
  filename?: string
}

export async function generateTBMSafetyInspectionBulkReport(
  params: TBMSafetyInspectionBulkReportParams
): Promise<void> {
  const { projectInspections, filename } = params

  if (projectInspections.length === 0) {
    throw new Error('생성할 프로젝트가 없습니다.')
  }

  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).jsPDF

  const pdf = new jsPDF('p', 'mm', 'a4')
  let isFirstPage = true

  for (const { project, inspections } of projectInspections) {
    if (inspections.length === 0) continue

    // 각 프로젝트의 모든 점검을 날짜순으로 정렬
    const sortedInspections = [...inspections].sort((a, b) => {
      const dateA = a.tbm_date ? new Date(a.tbm_date).getTime() : 0
      const dateB = b.tbm_date ? new Date(b.tbm_date).getTime() : 0
      return dateA - dateB
    })

    for (const inspection of sortedInspections) {
      if (!isFirstPage) {
        pdf.addPage()
      }
      isFirstPage = false

      // HTML 컨테이너 생성
      const pdfContainer = document.createElement('div')
      pdfContainer.style.width = '210mm'
      pdfContainer.style.minHeight = '297mm'
      pdfContainer.style.padding = '15mm'
      pdfContainer.style.fontFamily = 'Malgun Gothic, Arial, sans-serif'
      pdfContainer.style.backgroundColor = 'white'
      pdfContainer.style.fontSize = '11px'
      pdfContainer.style.lineHeight = '1.5'

      // TBM 안전활동 점검표 HTML 생성
      pdfContainer.innerHTML = `
        <style>
          table { 
            border-collapse: collapse; 
            width: 100%;
            margin-bottom: 10px;
          }
          table td, table th { 
            border: 1px solid #000;
            padding: 8px;
            vertical-align: middle;
            text-align: left;
          }
          table th {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: center;
          }
          .header {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            text-decoration: underline;
          }
          .section-title {
            background-color: #e0e0e0;
            font-weight: bold;
            text-align: center;
          }
          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .col-1 { width: 10%; }
          .col-2 { width: 20%; }
          .col-3 { width: 30%; }
          .col-4 { width: 40%; }
          .col-5 { width: 50%; }
          .col-6 { width: 60%; }
          .col-7 { width: 70%; }
          .col-8 { width: 80%; }
          .col-9 { width: 90%; }
          .col-10 { width: 100%; }
          .checkbox {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 1px solid #000;
            margin-right: 5px;
            vertical-align: middle;
          }
          .content-cell {
            min-height: 40px;
            word-wrap: break-word;
          }
        </style>
        
        <div class="header">${project.project_name || ''} TBM 및 안전활동 일일 점검표</div>
        
        <table>
          <tr>
            <th class="col-2">지구명</th>
            <td class="col-3">${inspection.district || ''}</td>
            <th class="col-2">사업명</th>
            <td class="col-3">${project.project_name || ''}</td>
          </tr>
          <tr>
            <th>공사감독</th>
            <td>${inspection.supervisor || project.supervisor_name || ''}</td>
            <th>시공사</th>
            <td>${(project as any)?.user_profiles?.company_name || ''}</td>
          </tr>
          <tr>
            <th>TBM 일시</th>
            <td colspan="3">
              ${formatDate(inspection.tbm_date)} ${formatTime(inspection.tbm_start_time)} ~ ${formatTime(inspection.tbm_end_time)}${calculateDuration(inspection.tbm_start_time, inspection.tbm_end_time)}
            </td>
          </tr>
        </table>

        <table>
          <tr>
            <th class="section-title" colspan="4">입회 정보</th>
          </tr>
          <tr>
            <th class="col-2">입회여부</th>
            <td class="col-3">
              ${yesNo(inspection.is_attended)} 예 &nbsp;&nbsp; ${yesNo(inspection.is_attended === false)} 아니오
            </td>
            <th class="col-2">미입회 사유</th>
            <td class="col-3">${inspection.non_attendance_reason || ''}</td>
          </tr>
          <tr>
            <th>입회자 소속</th>
            <td>${inspection.attendee_affiliation || ''}</td>
            <th>입회자</th>
            <td>${inspection.attendee || ''}</td>
          </tr>
        </table>

        <table>
          <tr>
            <th class="section-title" colspan="4">작업 정보</th>
          </tr>
          <tr>
            <th class="col-2">작업내용</th>
            <td class="col-8 content-cell">${inspection.work_content || ''}</td>
          </tr>
          <tr>
            <th>주소</th>
            <td colspan="3">${inspection.address || ''}</td>
          </tr>
          <tr>
            <th>TBM 내용</th>
            <td colspan="3" class="content-cell">${inspection.tbm_content || ''}</td>
          </tr>
        </table>

        <table>
          <tr>
            <th class="section-title" colspan="4">투입 현황</th>
          </tr>
          <tr>
            <th class="col-2">근로자(명)</th>
            <td class="col-3">${inspection.workers || ''}</td>
            <th class="col-2">신규근로자(명)</th>
            <td class="col-3">${inspection.new_workers || ''}</td>
          </tr>
          <tr>
            <th>장비(대수)</th>
            <td>${inspection.equipment || ''}</td>
            <th>신호수(명)</th>
            <td>${inspection.signal_workers || ''}</td>
          </tr>
        </table>

        <table>
          <tr>
            <th class="section-title" colspan="4">현장관리자 활동사항</th>
          </tr>
          <tr>
            <th class="col-2">현장설명(현장상태, 이동동선 등)</th>
            <td class="col-3">
              ${yesNo(inspection.site_explanation)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.site_explanation === false)} 미조치
            </td>
            <th class="col-2">미조치 사유</th>
            <td class="col-3">${inspection.site_explanation_reason || ''}</td>
          </tr>
          <tr>
            <th>작업위험요인 설명</th>
            <td>
              ${yesNo(inspection.risk_explanation)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.risk_explanation === false)} 미조치
            </td>
            <th>미조치 사유</th>
            <td>${inspection.risk_explanation_reason || ''}</td>
          </tr>
          <tr>
            <th>개인보호구 지급</th>
            <td>
              ${yesNo(inspection.ppe_provision)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.ppe_provision === false)} 미조치
            </td>
            <th>미조치 사유</th>
            <td>${inspection.ppe_provision_reason || ''}</td>
          </tr>
          <tr>
            <th>작업전 건강상태 확인</th>
            <td>
              ${yesNo(inspection.health_check)} 조치함 &nbsp;&nbsp; ${yesNo(inspection.health_check === false)} 미조치
            </td>
            <th>미조치 사유</th>
            <td>${inspection.health_check_reason || ''}</td>
          </tr>
        </table>

        <table>
          <tr>
            <th class="section-title" colspan="4">입회자 의견</th>
          </tr>
          <tr>
            <td colspan="4" class="content-cell" style="min-height: 60px;">
              ${inspection.attendee_opinion || ''}
            </td>
          </tr>
        </table>

        <div style="margin-top: 30px; text-align: right;">
          <div>
            <span style="font-weight: bold;">소속:</span> ${inspection.attendee_affiliation || ''} &nbsp;&nbsp;
            <span style="font-weight: bold;">이름:</span> ${inspection.attendee || ''} &nbsp;&nbsp;
            ${inspection.signature ? `<img src="${inspection.signature}" style="max-height: 40px; vertical-align: middle; display: inline-block;" />` : ''}
          </div>
        </div>
      `

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

      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
    }
  }

  // PDF 저장
  const finalFileName = filename || `TBM안전활동점검표_벌크_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}.pdf`
  pdf.save(finalFileName)
}

