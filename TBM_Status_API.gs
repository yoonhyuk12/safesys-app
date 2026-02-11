/**
 * TBM 현황 조회 전용 Google Apps Script (상태 API)
 * 
 * 용도: 기존 TBM 제출 데이터를 읽어와서 대시보드용 API 제공
 * 관련 시트: TBM 제출 응답이 저장된 구글시트
 * 주의: 이 파일은 DB 저장용 스크립트와 별도로 작동하는 조회 전용 API입니다
 */

// 기존 TBM 데이터가 저장된 시트 정보
const TBM_SPREADSHEET_ID = "1vJ_0ucn-GA_R5nBFNTsUy4ywM4dmFIIBM8Yf7fUj4F4";
const TBM_SHEET_NAME = "시트1";

/**
 * GET 요청 처리 메인 함수
 * 
 * 사용 예시:
 * - TBM 기록 조회: ?action=getTBMRecords&hq=서울본부&branch=강남지사
 * - TBM 통계 조회: ?action=getTBMStats&hq=서울본부
 * 
 * 주의: 이 스크립트는 별도 배포가 필요하며 doGet 함수가 엔트리 포인트입니다
 */
function doGet(e) {
  try {
    // 디버깅을 위한 전체 요청 정보 로깅
    Logger.log('=== doGet 호출 시작 ===');
    Logger.log('e 객체: ' + JSON.stringify(e));
    Logger.log('e.parameter: ' + JSON.stringify(e.parameter));
    Logger.log('e.parameters: ' + JSON.stringify(e.parameters));
    
    // 매개변수 안전하게 추출 - 여러 방법 시도
    let params = {};
    let action = '';
    let date = '';
    let hq = '';
    let branch = '';
    
    if (e.parameter) {
      params = e.parameter;
      action = e.parameter.action || '';
      date = e.parameter.date || '';
      hq = e.parameter.hq || '';
      branch = e.parameter.branch || '';
    } else if (e.parameters) {
      // parameters 배열에서 첫 번째 값 사용
      params = {};
      if (e.parameters.action) params.action = e.parameters.action[0];
      if (e.parameters.date) params.date = e.parameters.date[0];
      if (e.parameters.hq) params.hq = e.parameters.hq[0];
      if (e.parameters.branch) params.branch = e.parameters.branch[0];
      
      action = params.action || '';
      date = params.date || '';
      hq = params.hq || '';
      branch = params.branch || '';
    }
    
    Logger.log(`추출된 매개변수 - action: "${action}", date: "${date}", hq: "${hq}", branch: "${branch}"`);
    
    // action이 비어있으면 디버그 정보와 함께 에러 반환
    if (!action) {
      Logger.log('action 매개변수가 누락됨');
      return createStatusResponse({
        success: false,
        message: "action 매개변수가 필요합니다. 사용 가능한 action: getTBMRecords, getTBMStats, getProjects, test",
        debug: {
          eParameter: e.parameter,
          eParameters: e.parameters,
          extractedParams: params
        }
      });
    }
    
    // 각 action별 처리
    switch (action) {
      case 'getTBMRecords':
        Logger.log('getTBMRecords 호출');
        return getStatusTBMRecords(date, hq, branch);
        
      case 'getTBMStats':
        Logger.log('getTBMStats 호출');
        return getStatusTBMStats(date, hq, branch);
        
      case 'getProjects':
        Logger.log('getProjects 호출');
        return getStatusProjects(hq, branch);
        
      case 'test':
        Logger.log('test 호출');
        return createStatusResponse({
          success: true,
          message: "API 테스트 성공",
          timestamp: new Date().toISOString(),
          receivedParams: params,
          extractedValues: { action, date, hq, branch }
        });
        
      default:
        Logger.log(`알 수 없는 action: ${action}`);
        return createStatusResponse({
          success: false,
          message: `알 수 없는 action: ${action}. 사용 가능한 action: getTBMRecords, getTBMStats, getProjects, test`,
          receivedAction: action,
          receivedParams: params
        });
    }
      
  } catch (error) {
    Logger.log('doGet 오류: ' + error.message);
    Logger.log('오류 스택: ' + error.stack);
    return createStatusResponse({
      success: false,
      message: `서버 오류: ${error.message}`,
      error: error.toString(),
      stack: error.stack
    });
  }
}

/**
 * TBM 기록 조회 함수 (모든 데이터 조회, 오늘 날짜 데이터만 있음)
 * 
 * @param {string} targetDate - 사용하지 않음 (호환성 유지용)
 * @param {string} selectedHq - 필터링할 본부명 (선택)
 * @param {string} selectedBranch - 필터링할 지사명 (선택)
 * @returns {Object} TBM 기록 배열과 총 개수
 */
function getStatusTBMRecords(targetDate, selectedHq, selectedBranch) {
  try {
    Logger.log(`getTBMRecords 시작 - targetDate: ${targetDate}, selectedHq: ${selectedHq}, selectedBranch: ${selectedBranch}`);
    
    const sheet = SpreadsheetApp.openById(TBM_SPREADSHEET_ID).getSheetByName(TBM_SHEET_NAME);
    if (!sheet) {
      throw new Error(`시트를 찾을 수 없습니다: ${TBM_SHEET_NAME}`);
    }
    
    Logger.log('시트 접근 성공');
    
    const data = sheet.getDataRange().getValues();
    const tbmRecords = [];
    
    Logger.log(`총 ${data.length}개 행 처리 시작 (마지막 행부터 조회)`);
    
    // 헤더 제외하고 데이터 처리 - 마지막 행부터 역순으로 조회 (최신 데이터가 하단에 있으므로)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      
      // 빈 행 건너뛰기
      if (!row[0] || !row[1]) continue;
      
      const recordDate = formatStatusDate(row[1]); // B열: 날짜
      
      // 날짜 필터링 제거: 오늘 날짜 데이터만 있으므로 모든 데이터 처리
      
      // 본부/지사 필터링
      if (selectedHq && row[2] !== selectedHq) continue;
      if (selectedBranch && row[3] !== selectedBranch) continue;
      
      // '작업없음' 제외 (I열: 금일작업)
      if (row[8] === '작업없음') continue;
      
      // TBM 기록 객체 생성 (정확한 컬럼 매핑)
      // 주의: "신규근로자" 컬럼이 J열에 추가되어 이후 컬럼 인덱스가 1씩 밀림
      const tbmRecord = {
        id: `tbm_${i}`,
        project_id: `proj_${i}`,
        project_name: row[4] || '미지정',       // E열: 사업명 (projectName)
        managing_hq: row[2] || '',              // C열: 본부 (headquarters)
        managing_branch: row[3] || '',          // D열: 지사 (branch)
        meeting_date: recordDate,
        meeting_time: '08:00',                  // 고정값 (사용하지 않음)
        attendees: row[9] || '',                // J열: 투입인원 (attendees)
        topics: parseStatusTBMTopics(row),      // 여러 컬럼에서 주제 추출
        location: row[7] || '현장',             // H열: 주소 (address)
        leader: row[32] || '미지정',            // AG열: 성함 (name) - 인덱스 변경
        created_at: row[0],                     // A열: 타임스탬프 (timestamp)
        latitude: parseFloat(row[41]) || null,  // AP열: latitude - 인덱스 변경
        longitude: parseFloat(row[42]) || null, // AQ열: longitude - 인덱스 변경
        status: '완료',
        duration: 0,                            // 사용하지 않음
        construction_company: row[6] || '',     // G열: 시공사명 (constructionCompany)
        today_work: row[8] || '',               // I열: 금일작업 (todayWork)
        equipment_input: row[11] || '',         // L열: 투입장비 (equipmentInput) - 인덱스 변경
        risk_work_type: row[12] || '',          // M열: 위험공종 (riskWorkType) - 인덱스 변경
        cctv_usage: row[13] || '',              // N열: CCTV사용유무 (cctvUsage) - 인덱스 변경
        education_content: row[31] || '',       // AF열: 교육내용 (기타사항) - 인덱스 변경
        education_photo: row[17] || '',         // R열: 교육사진 (educationPhoto) - 인덱스 변경
        signature: row[18] || '',               // S열: 서명 (signature) - 인덱스 변경
        contact: row[33] || '',                 // AH열: 연락처 (contact) - 인덱스 변경
        new_workers: row[10] || ''              // K열: 신규근로자 (newWorkers)
      };
      
      tbmRecords.push(tbmRecord);
    }
    
    Logger.log(`필터링된 TBM 기록: ${tbmRecords.length}개`);
    
    return createStatusResponse({
      success: true,
      records: tbmRecords,
      total: tbmRecords.length,
      filters: {
        date: "all", // 모든 날짜 (오늘만 있음)
        hq: selectedHq,
        branch: selectedBranch
      }
    });
    
  } catch (error) {
    Logger.log('getTBMRecords 오류: ' + error.message);
    return createStatusResponse({
      success: false,
      message: `TBM 기록 조회 실패: ${error.message}`
    });
  }
}

/**
 * TBM 통계 조회 함수 (모든 데이터 조회, 오늘 날짜 데이터만 있음)
 * 
 * @param {string} targetDate - 사용하지 않음 (호환성 유지용)
 * @param {string} selectedHq - 필터링할 본부명
 * @param {string} selectedBranch - 필터링할 지사명
 * @returns {Object} TBM 통계 정보
 */
function getStatusTBMStats(targetDate, selectedHq, selectedBranch) {
  try {
    const sheet = SpreadsheetApp.openById(TBM_SPREADSHEET_ID).getSheetByName(TBM_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    let totalTBM = 0;
    let riskWorkTypes = 0;
    const projects = new Set();
    const companies = new Set();
    
    // 마지막 행부터 역순으로 조회 (최신 데이터가 하단에 있으므로)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      
      if (!row[0] || !row[1]) continue;
      
      const recordDate = formatStatusDate(row[1]);
      
      // 날짜 필터링 제거: 오늘 날짜 데이터만 있으므로 모든 데이터 처리
      if (selectedHq && row[2] !== selectedHq) continue;
      if (selectedBranch && row[3] !== selectedBranch) continue;
      if (row[8] === '작업없음') continue; // I열: 금일작업
      
      totalTBM++;
      projects.add(row[4]); // E열: 사업명
      companies.add(row[6]); // G열: 시공사명
      
      // 위험공종 계산 (M열: 위험공종) - 인덱스 변경
      const riskWorkType = row[12] || '';
      if (riskWorkType && riskWorkType.trim() !== '' && riskWorkType !== '해당없음') {
        riskWorkTypes++;
      }
    }
    
    return createStatusResponse({
      success: true,
      stats: {
        totalTBM: totalTBM,
        totalAttendees: 0, // 사용하지 않음
        totalProjects: projects.size,
        totalCompanies: companies.size,
        averageDuration: 0, // 사용하지 않음
        averageAttendees: 0, // 사용하지 않음
        riskWorkTypes: riskWorkTypes
      },
      date: "all" // 모든 날짜 (오늘만 있음)
    });
    
  } catch (error) {
    Logger.log('getTBMStats 오류: ' + error.message);
    return createStatusResponse({
      success: false,
      message: `TBM 통계 조회 실패: ${error.message}`
    });
  }
}

/**
 * 프로젝트 목록 조회 (지도 표시용)
 * 
 * @param {string} selectedHq - 필터링할 본부명
 * @param {string} selectedBranch - 필터링할 지사명
 * @returns {Object} 프로젝트 목록
 */
function getStatusProjects(selectedHq, selectedBranch) {
  try {
    const sheet = SpreadsheetApp.openById(TBM_SPREADSHEET_ID).getSheetByName(TBM_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    const projectMap = new Map();
    
    // 마지막 행부터 역순으로 조회 (최신 데이터가 하단에 있으므로)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      
      if (!row[0] || !row[1]) continue;
      if (selectedHq && row[2] !== selectedHq) continue;
      if (selectedBranch && row[3] !== selectedBranch) continue;
      if (row[8] === '작업없음') continue; // I열: 금일작업
      
      const projectKey = `${row[4]}_${row[2]}_${row[3]}`;
      
      if (!projectMap.has(projectKey)) {
        const lat = parseFloat(row[41]); // AP열: latitude - 인덱스 변경
        const lng = parseFloat(row[42]); // AQ열: longitude - 인덱스 변경
        
        if (lat && lng) {
          projectMap.set(projectKey, {
            id: `proj_${i}`,
            name: row[4] || '미지정',        // E열: 사업명
            address: row[7] || '',          // H열: 주소
            lat: lat,
            lng: lng,
            managingHq: row[2] || '',       // C열: 본부
            managingBranch: row[3] || '',   // D열: 지사
            constructionCompany: row[6] || '' // G열: 시공사명
          });
        }
      }
    }
    
    return createStatusResponse({
      success: true,
      projects: Array.from(projectMap.values()),
      total: projectMap.size
    });
    
  } catch (error) {
    Logger.log('getProjects 오류: ' + error.message);
    return createStatusResponse({
      success: false,
      message: `프로젝트 조회 실패: ${error.message}`
    });
  }
}

/**
 * TBM 주제 파싱 함수
 * 
 * @param {Array} row - 시트의 한 행 데이터
 * @returns {Array} 주제 배열
 */
function parseStatusTBMTopics(row) {
  const topics = [];
  
  // 오늘작업이 있으면 작업계획 추가 (I열: 금일작업)
  if (row[8] && row[8] !== '작업없음') {
    topics.push('작업계획');
  }
  
  // 위험공종이 있으면 위험작업점검 추가 (M열: 위험공종) - 인덱스 변경
  if (row[12] && row[12].trim() !== '' && row[12] !== '해당없음') {
    topics.push('위험작업점검');
  }
  
  // CCTV 사용 시 CCTV점검 추가 (N열: CCTV사용유무) - 인덱스 변경
  if (row[13] && row[13].includes('사용중')) {
    topics.push('CCTV점검');
  }
  
  // 위험요인이 있으면 안전점검 추가 (U,W,Y열: 잠재위험요인들) - 인덱스 변경
  if (row[20] || row[22] || row[24]) {
    topics.push('안전점검');
  }
  
  // 교육사진이 있으면 안전교육 추가 (R열: 교육사진) - 인덱스 변경
  if (row[17] && row[17].trim() !== '') {
    topics.push('안전교육');
  }
  
  // 기본 주제가 없으면 일반회의로
  if (topics.length === 0) {
    topics.push('일반회의');
  }
  
  return topics;
}

/**
 * 날짜 포맷 함수
 * 
 * @param {Date|string} dateValue - 날짜 값
 * @returns {string} YYYY-MM-DD 형식의 문자열
 */
function formatStatusDate(dateValue) {
  try {
    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, "Asia/Seoul", "yyyy-MM-dd");
    }
    
    // 문자열인 경우 그대로 반환 (이미 YYYY-MM-DD 형식이라고 가정)
    if (typeof dateValue === 'string' && dateValue.includes('-')) {
      return dateValue;
    }
    
    // 다른 형식이면 Date로 변환 시도
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
    }
    
    return '';
  } catch (error) {
    Logger.log('formatStatusDate 오류: ' + error.message);
    return '';
  }
}

/**
 * HTTP 응답 생성 함수 (CORS 헤더 포함)
 * 
 * @param {Object} data - 응답 데이터
 * @returns {ContentService.TextOutput} JSON 응답
 */
function createStatusResponse(data) {
  Logger.log('응답 생성: ' + JSON.stringify(data));
  
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  
  // Google Apps Script에서는 setHeaders가 지원되지 않으므로 제거
  return output;
}

/**
 * CORS 처리용 OPTIONS 요청 핸들러
 */
function doOptions(e) {
  Logger.log('OPTIONS 요청 받음: ' + JSON.stringify(e));
  
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 테스트용 함수 (개발 시에만 사용)
 */
function testStatusAPI() {
  Logger.log('=== API 테스트 시작 ===');
  
  // TBM 기록 조회 테스트 (날짜 불필요)
  const records = getStatusTBMRecords(null, null, null);
  Logger.log('TBM 기록 테스트 결과:');
  Logger.log(JSON.stringify(records, null, 2));
  
  // TBM 통계 조회 테스트 (날짜 불필요)
  const stats = getStatusTBMStats(null, null, null);
  Logger.log('TBM 통계 테스트 결과:');
  Logger.log(JSON.stringify(stats, null, 2));
  
  // 프로젝트 조회 테스트
  const projects = getStatusProjects(null, null);
  Logger.log('프로젝트 테스트 결과:');
  Logger.log(JSON.stringify(projects, null, 2));
  
  Logger.log('=== API 테스트 완료 ===');
}