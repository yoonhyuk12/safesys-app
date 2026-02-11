import ExcelJS from 'exceljs'

/**
 * 배치 처리 유틸리티: 대량의 비동기 작업을 제한된 수만큼씩 묶어서 처리
 * @param items 처리할 항목 배열
 * @param batchSize 한번에 처리할 배치 크기
 * @param processor 각 항목을 처리하는 비동기 함수
 */
async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(processor)
    )
    results.push(...batchResults)
  }

  return results
}

/**
 * 텍스트에서 "-"로 시작하는 라인을 "○"로 변경 (Excel 수식 오류 방지)
 */
function sanitizeText(text: string | undefined): string {
  if (!text) return ''
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      // "-"로 시작하면 "○"로 변경
      if (trimmed.startsWith('-')) {
        return '○' + trimmed.substring(1)
      }
      return line
    })
    .join('\n')
}

// TBM 제출 데이터 타입 정의
interface TBMSubmission {
  id: string
  meeting_date: string
  project_name: string
  headquarters: string
  branch: string
  today_work?: string
  personnel_count?: string
  new_worker_count?: number
  equipment_input?: string
  risk_work_type?: string
  potential_risk_1?: string
  solution_1?: string
  potential_risk_2?: string
  solution_2?: string
  potential_risk_3?: string
  solution_3?: string
  main_risk_selection?: string
  main_risk_solution?: string
  risk_factor_1?: string
  risk_factor_2?: string
  risk_factor_3?: string
  other_remarks?: string
  reporter_name?: string
  construction_company?: string
  education_date?: string
  education_start_time?: string
  education_end_time?: string
  education_photo_url?: string
}

/**
 * 공사감독일지 Excel 파일 생성
 * @param projectName 프로젝트명
 * @param startDate 시작일 (YYYY-MM-DD)
 * @param endDate 종료일 (YYYY-MM-DD)
 * @param tbmData TBM 제출 데이터 배열
 * @param onProgress 진행률 콜백 함수
 * @param supervisorName 공사감독 이름
 * @param supervisorSignature 공사감독 서명 (base64)
 * @param latitude 프로젝트 위도 (날씨 조회용)
 * @param longitude 프로젝트 경도 (날씨 조회용)
 * @param useAI AI 사용 여부 (기본값: true)
 */
export async function generateSupervisorDiaryExcel(
  projectName: string,
  startDate: string,
  endDate: string,
  tbmData: TBMSubmission[],
  onProgress?: (current: number, total: number, status?: string, subStatus?: string) => void,
  supervisorName?: string,
  supervisorSignature?: string,
  latitude?: number,
  longitude?: number,
  useAI: boolean = true
) {
  const workbook = new ExcelJS.Workbook()

  // 시작일부터 종료일까지 날짜 배열 생성
  const dates = getDateRange(startDate, endDate)

  // 제출이 있는 날짜만 필터링
  const datesWithSubmissions = dates.filter(date =>
    tbmData.some(data => data.meeting_date === date)
  )
  const totalDates = datesWithSubmissions.length

  // 날씨 데이터 기간 조회 (단일 API 호출로 전체 기간 조회)
  const weatherMap = new Map<string, string>()
  let weatherStationName = '' // 관측소 이름 저장 (subStatus용)

  if (latitude && longitude && datesWithSubmissions.length > 0) {
    if (onProgress) {
      onProgress(0, totalDates, '기상청 ASOS 일자료 조회 중...')
    }

    try {
      // 기간 조회 API 사용 (한 번의 호출로 전체 기간 조회)
      const startDateApi = startDate.replace(/-/g, '') // YYYY-MM-DD -> YYYYMMDD
      const endDateApi = endDate.replace(/-/g, '')

      const response = await fetch(
        `/api/weather/asos-range?lat=${latitude}&lon=${longitude}&start=${startDateApi}&end=${endDateApi}`
      )

      if (response.ok) {
        const result = await response.json()

        // API 응답: { stnId, stnName, data: [...] }
        if (result.data && Array.isArray(result.data)) {
          weatherStationName = result.stnName || ''
          console.log(`📡 날씨 기간 조회 완료: ${weatherStationName} 관측소, ${result.data.length}일 데이터`)

          // 날짜별로 Map에 저장 (YYYYMMDD -> YYYY-MM-DD 변환)
          for (const item of result.data) {
            const dateKey = `${item.date.slice(0, 4)}-${item.date.slice(4, 6)}-${item.date.slice(6, 8)}`
            if (item.summary) {
              weatherMap.set(dateKey, item.summary)
            }
          }

          if (onProgress) {
            onProgress(1, 1, `기상 데이터 ${result.data.length}일 로드 완료`, weatherStationName ? `(기상정보 : ${weatherStationName}관측소)` : '')
          }
        }
      } else {
        console.error('날씨 API 오류:', response.status, await response.text())
      }
    } catch (err) {
      console.error('날씨 데이터 기간 조회 중 오류:', err)
      if (onProgress) {
        onProgress(1, 1, '기상 데이터 로드 실패 (날씨 정보 없이 계속 진행)', '')
      }
    }
  }

  // AI 데이터 미리 배치 조회 (useAI가 true일 때만)
  const weatherSubStatus = weatherStationName ? `(기상정보 : ${weatherStationName}관측소)` : ''
  const aiMap = new Map<string, { supervisorInstructions: string; personnelEquipmentSummary: string }>()
  if (useAI && datesWithSubmissions.length > 0) {
    if (onProgress) {
      onProgress(0, totalDates, 'AI가 감독 지시사항과 투입 내역을 분석 중...', weatherSubStatus)
    }

    try {
      // AI 요청은 비용이 발생하므로 배치 크기 3
      const aiResults = await processBatch(
        datesWithSubmissions,
        3, // 한번에 3개씩
        async (date) => {
          const dayData = tbmData.filter(d => d.meeting_date === date)

          if (dayData.length === 0) {
            return { date, supervisorInstructions: '', personnelEquipmentSummary: '' }
          }

          // 각 날짜별로 2개의 AI 요청을 병렬로 처리
          const [supervisorInstructions, personnelEquipmentSummary] = await Promise.all([
            // 공사기록 AI
            (async () => {
              try {
                const workList = dayData.map(d => d.today_work).filter(Boolean)
                const isNoWork = workList.length === 0 || workList.every(w => w?.trim() === '작업없음' || w?.trim() === '')

                if (isNoWork) {
                  return '○ 작업없음으로 특이사항 없음'
                }

                const previousDayData = tbmData
                  .filter(d => d.meeting_date < date)
                  .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
                const previousWorkList = previousDayData.slice(0, 5).map(d => d.today_work).filter(Boolean)

                return await generateSupervisorInstructions({
                  todayWork: workList.join(', '),
                  previousWork: previousWorkList.length > 0 ? previousWorkList.join(', ') : undefined
                })
              } catch (err) {
                console.error(`AI 감독 지시사항 생성 실패 (${date}):`, err)
                return ''
              }
            })(),
            // 기록사항 AI
            (async () => {
              try {
                const personnelList = dayData.map(d => d.personnel_count).filter(Boolean)
                const equipmentList = dayData.map(d => d.equipment_input).filter(Boolean)

                if (personnelList.length > 0 || equipmentList.length > 0) {
                  return await generateAISummary({
                    personnel: personnelList.join(', '),
                    equipment: equipmentList.join(', ')
                  })
                }
                return ''
              } catch (err) {
                console.error(`AI 인원/장비 요약 생성 실패 (${date}):`, err)
                return ''
              }
            })()
          ])

          return { date, supervisorInstructions, personnelEquipmentSummary }
        }
      )

      aiResults.forEach(result => {
        aiMap.set(result.date, {
          supervisorInstructions: result.supervisorInstructions,
          personnelEquipmentSummary: result.personnelEquipmentSummary
        })
      })
    } catch (err) {
      console.error('AI 데이터 일괄 생성 중 오류:', err)
    }
  }

  // 교육 사진 미리 배치 다운로드
  const photoMap = new Map<string, Buffer>()
  const photoUrlsToFetch = new Map<string, string>()

  datesWithSubmissions.forEach(date => {
    const dayData = tbmData.filter(d => d.meeting_date === date)
    const photoUrl = dayData.find(d => d.education_photo_url)?.education_photo_url
    if (photoUrl) {
      photoUrlsToFetch.set(date, photoUrl)
    }
  })

  if (photoUrlsToFetch.size > 0) {
    if (onProgress) {
      onProgress(0, totalDates, '교육 사진 다운로드 중...', weatherSubStatus)
    }

    try {
      // 사진 다운로드는 배치 크기 5
      const photoEntries = Array.from(photoUrlsToFetch.entries())
      await processBatch(
        photoEntries,
        5, // 한번에 5개씩
        async ([date, photoUrl]) => {
          try {
            const response = await fetch(photoUrl)
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              photoMap.set(date, buffer)
            }
          } catch (err) {
            console.error(`사진 다운로드 실패 (${date}):`, err)
          }
        }
      )
    } catch (err) {
      console.error('사진 일괄 다운로드 중 오류:', err)
    }
  }

  // 제출이 있는 날짜별로만 시트 생성
  for (let i = 0; i < datesWithSubmissions.length; i++) {
    const date = datesWithSubmissions[i]
    const dateObj = new Date(date)
    const month = dateObj.getMonth() + 1
    const day = dateObj.getDate()

    // 해당 날짜의 TBM 데이터 찾기
    const dayData = tbmData.filter(
      (data) => data.meeting_date === date
    )

    // 진행률 업데이트 - 시트 생성 시작
    if (onProgress) {
      onProgress(i + 1, totalDates, `${month}월 ${day}일 작성 중...`, weatherSubStatus)
    }

    // 시트명: MM월DD일 형식
    const sheetName = formatDateForSheet(date)
    const worksheet = workbook.addWorksheet(sheetName)

    // 해당 날짜의 미리 조회한 데이터들
    const weatherSummary = weatherMap.get(date) || ''
    const aiData = aiMap.get(date)
    const photoBuffer = photoMap.get(date)

    // 공사감독일지 양식 생성
    await createSupervisorDiarySheet(
      worksheet,
      date,
      projectName,
      dayData,
      workbook,
      supervisorName,
      supervisorSignature,
      i + 1,
      totalDates,
      onProgress,
      weatherSummary,
      aiData,
      photoBuffer,
      useAI
    )

    // UI 업데이트를 위한 짧은 지연
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  // Excel 파일 다운로드
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `공사감독일지_${projectName}_${startDate}_${endDate}.xlsx`
  link.click()
  window.URL.revokeObjectURL(url)
}

/**
 * 시작일부터 종료일까지의 날짜 배열 생성
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/**
 * 날짜를 시트명 형식으로 변환 (MM월DD일)
 */
function formatDateForSheet(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}월${day}일`
}

/**
 * 공사감독일지 시트 생성
 */
async function createSupervisorDiarySheet(
  worksheet: ExcelJS.Worksheet,
  date: string,
  projectName: string,
  dayData: TBMSubmission[],
  workbook: ExcelJS.Workbook,
  supervisorName?: string,
  supervisorSignature?: string,
  currentPage?: number,
  totalPages?: number,
  onProgress?: (current: number, total: number, status?: string, subStatus?: string) => void,
  weatherSummary: string = '',
  aiData?: { supervisorInstructions: string; personnelEquipmentSummary: string },
  photoBuffer?: Buffer,
  useAI: boolean = true
) {
  // 열 너비 설정 (7개 열: A-G)
  worksheet.columns = [
    { width: 15 },   // A - 년월일
    { width: 15 },   // B - 금일 날씨
    { width: 15 },   // C - 담당
    { width: 10.5 }, // D - 감독 (30% 감소)
    { width: 10.5 }, // E - 감독 (30% 감소)
    { width: 10.5 }, // F - 서명 (30% 감소)
    { width: 10.5 }  // G - 서명 (30% 감소)
  ]

  // 제목: (사업명) 공사감독일지
  const titleRow = worksheet.addRow([`(${projectName}) 공사감독일지`])
  titleRow.font = { size: 18, bold: true }
  titleRow.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true }
  worksheet.mergeCells('A1:G1')
  titleRow.height = 30

  // 빈 줄
  worksheet.addRow([])

  // 헤더: 년 월 일 | 금일 날씨 | 담당 | 감독 | 감독(병합용) | (서명) | (서명)(병합용)
  const headerRow = worksheet.addRow(['년  월  일', '금일 날씨', '담당', '감독', '', '(서명)', ''])
  worksheet.mergeCells(`D${headerRow.number}:E${headerRow.number}`) // 감독 2칸 병합
  worksheet.mergeCells(`F${headerRow.number}:G${headerRow.number}`) // 서명 2칸 병합
  headerRow.font = { bold: true }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 25
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })

  // 날짜 데이터 행
  const dateObj = new Date(date)
  const year = dateObj.getFullYear()
  const month = dateObj.getMonth() + 1
  const day = dateObj.getDate()
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()]
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}(${dayOfWeek})`

  const reporter = dayData.length > 0 ? dayData[0].reporter_name || '' : ''

  // 날씨 데이터 사용 (이미 받아옴)
  const dateDataRow = worksheet.addRow([dateStr, weatherSummary, reporter, supervisorName || '', '', '', ''])
  worksheet.mergeCells(`D${dateDataRow.number}:E${dateDataRow.number}`) // 감독 이름 2칸 병합
  worksheet.mergeCells(`F${dateDataRow.number}:G${dateDataRow.number}`) // 서명 2칸 병합
  dateDataRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  dateDataRow.height = 60 // 서명 높이를 위해 행 높이 증가
  dateDataRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })

  // 서명 이미지 추가
  if (supervisorSignature) {
    try {
      // base64 이미지를 buffer로 변환
      const base64Data = supervisorSignature.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      const signatureImageId = workbook.addImage({
        buffer: buffer as any,
        extension: 'png'
      })

      // 서명 셀에 이미지 추가 (F-G 열)
      worksheet.addImage(signatureImageId, {
        tl: { col: 5, row: dateDataRow.number - 1 } as any,
        br: { col: 7, row: dateDataRow.number } as any,
        editAs: 'oneCell'
      })
    } catch (error) {
      console.error('서명 이미지 추가 실패:', error)
    }
  }

  // 1. 공사 추진 내용
  addSection1(worksheet, dayData)

  // 2. 공사지휘 - 미리 조회한 AI 데이터 사용
  addSection2(worksheet, aiData?.supervisorInstructions || '')

  // 3. 기록사항 - 미리 조회한 AI 데이터 또는 원본 데이터
  addSection3(worksheet, dayData, aiData?.personnelEquipmentSummary, useAI)

  // 4. 기타 - 미리 다운로드한 사진 사용
  addSection4(worksheet, dayData, workbook, photoBuffer)

  // 마지막 행 번호 확인하여 인쇄 영역 설정
  const lastRow = worksheet.lastRow?.number || 13

  // 페이지 설정: 1장에 맞춤, 가운데 정렬
  worksheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    orientation: 'portrait',
    paperSize: 9, // A4
    horizontalCentered: true,
    verticalCentered: true,
    printArea: `A1:G${lastRow}`, // A~G 열, 마지막 행까지만 인쇄 영역에 포함
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3
    }
  }
}

/**
 * 1. 공사 추진 내용 섹션
 */
function addSection1(worksheet: ExcelJS.Worksheet, dayData: TBMSubmission[]) {
  const titleRow = worksheet.addRow(['1. 공사 추진 내용'])
  titleRow.font = { bold: true, size: 12 }
  worksheet.mergeCells(`A${titleRow.number}:G${titleRow.number}`)
  titleRow.height = 25
  titleRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })

  // 내용
  let content = ''

  if (dayData.length > 0) {
    dayData.forEach((data) => {
      if (data.today_work) {
        const sanitized = sanitizeText(data.today_work)
        // 이미 "○"로 시작하면 추가하지 않음
        if (sanitized.trim().startsWith('○')) {
          content += `${sanitized}\n\n`
        } else {
          content += `○ ${sanitized}\n\n`
        }
      }
    })
  }

  const contentRow = worksheet.addRow([content])
  worksheet.mergeCells(`A${contentRow.number}:G${contentRow.number}`)
  contentRow.alignment = { vertical: 'top', wrapText: true }
  contentRow.height = 120
  contentRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })
}

/**
 * 2. 공사 기록 섹션 - 미리 생성된 AI 데이터 사용
 */
function addSection2(worksheet: ExcelJS.Worksheet, content: string) {
  const titleRow = worksheet.addRow(['2. 공사 기록'])
  titleRow.font = { bold: true, size: 12 }
  worksheet.mergeCells(`A${titleRow.number}:G${titleRow.number}`)
  titleRow.height = 25
  titleRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })

  const contentRow = worksheet.addRow([content])
  worksheet.mergeCells(`A${contentRow.number}:G${contentRow.number}`)
  contentRow.alignment = { vertical: 'top', wrapText: true }
  contentRow.height = 150
  contentRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })
}

/**
 * AI를 사용하여 감독 지시사항 생성
 */
async function generateSupervisorInstructions(data: { todayWork: string; previousWork?: string }): Promise<string> {
  const response = await fetch('/api/ai/supervisor-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'supervisor-instructions',
      data: data
    })
  })

  if (!response.ok) {
    throw new Error('AI 감독 지시사항 생성 실패')
  }

  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'AI 감독 지시사항 생성 실패')
  }

  return result.content
}

/**
 * 3. 기록사항 섹션 - 미리 생성된 AI 데이터 또는 원본 데이터 사용
 */
function addSection3(worksheet: ExcelJS.Worksheet, dayData: TBMSubmission[], aiSummary?: string, useAI: boolean = true) {
  const titleRow = worksheet.addRow(['3. 기록사항'])
  titleRow.font = { bold: true, size: 12 }
  worksheet.mergeCells(`A${titleRow.number}:G${titleRow.number}`)
  titleRow.height = 25
  titleRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })

  let content = ''

  // AI 요약이 있으면 사용, 없으면 원본 데이터 표시
  if (useAI && aiSummary) {
    content = aiSummary
  } else if (dayData.length > 0) {
    // AI 사용 안 함: 값만 표시
    const personnelList = dayData.map(d => d.personnel_count).filter(Boolean)
    const equipmentList = dayData.map(d => d.equipment_input).filter(Boolean)

    if (personnelList.length > 0) {
      personnelList.forEach((personnel) => {
        content += `○ 투입인원: ${personnel}\n`
      })
    }
    if (equipmentList.length > 0) {
      equipmentList.forEach((equipment) => {
        content += `○ 투입장비: ${equipment}\n`
      })
    }
  }

  const contentRow = worksheet.addRow([content])
  worksheet.mergeCells(`A${contentRow.number}:G${contentRow.number}`)
  contentRow.alignment = { vertical: 'top', wrapText: true }
  contentRow.height = 120
  contentRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })
}

/**
 * AI를 사용하여 투입인원 및 투입장비 요약 생성
 */
async function generateAISummary(data: { personnel: string; equipment: string }): Promise<string> {
  const response = await fetch('/api/ai/supervisor-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'personnel-equipment',
      data: data
    })
  })

  if (!response.ok) {
    throw new Error('AI 요약 생성 실패')
  }

  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'AI 요약 생성 실패')
  }

  return result.content
}

/**
 * 4. 기타 섹션 - 미리 다운로드한 사진 사용
 */
function addSection4(worksheet: ExcelJS.Worksheet, dayData: TBMSubmission[], workbook: ExcelJS.Workbook, photoBuffer?: Buffer) {
  const titleRow = worksheet.addRow(['4. 기타'])
  titleRow.font = { bold: true, size: 12 }
  worksheet.mergeCells(`A${titleRow.number}:G${titleRow.number}`)
  titleRow.height = 25
  titleRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })

  // other_remarks 값만 표시
  let content = ''

  if (dayData.length > 0) {
    dayData.forEach((data) => {
      if (data.other_remarks) {
        content += sanitizeText(data.other_remarks) + '\n'
      }
    })
  }

  // 내용 행 추가 (A-E열: 텍스트, F-G열: 교육 사진)
  const contentRow = worksheet.addRow(['', '', '', '', '', '', ''])
  worksheet.mergeCells(`A${contentRow.number}:E${contentRow.number}`) // A-E 병합 (텍스트)
  worksheet.mergeCells(`F${contentRow.number}:G${contentRow.number}`) // F-G 병합 (사진)

  const textCell = worksheet.getCell(`A${contentRow.number}`)
  textCell.value = content
  textCell.alignment = { vertical: 'top', wrapText: true }
  textCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }

  // F-G 셀 테두리
  const photoCell = worksheet.getCell(`F${contentRow.number}`)
  photoCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }

  contentRow.height = 120 // 사진을 위해 높이 증가

  // 미리 다운로드한 교육 사진 추가 (F-G열)
  if (photoBuffer) {
    try {
      // 첫 번째 교육 사진 URL 찾기 (확장자 결정용)
      const photoUrl = dayData.find(d => d.education_photo_url)?.education_photo_url
      const extension = photoUrl?.toLowerCase().includes('.png') ? 'png' : 'jpeg'

      const educationImageId = workbook.addImage({
        buffer: photoBuffer as any,
        extension: extension
      })

      // F-G열에 이미지 추가
      worksheet.addImage(educationImageId, {
        tl: { col: 5, row: contentRow.number - 1 } as any,
        br: { col: 7, row: contentRow.number } as any,
        editAs: 'oneCell'
      })
    } catch (error) {
      console.error('교육 사진 추가 실패:', error)
    }
  }
}
