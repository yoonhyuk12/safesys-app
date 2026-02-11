/**
 * TBM실시 시트 데이터 조회 전용 Google Apps Script
 * 
 * 용도: TBM 제출 데이터를 읽어와서 TBM실시 시트용 데이터 제공
 * 관련 시트: TBM 제출 응답이 저장된 구글시트
 * 
 * 새 구글시트: https://docs.google.com/spreadsheets/d/1u-q3tB3hA0l7babVtgSUy1TvaEft-9U_jaEKaLynAfc/edit
 */

// TBM 데이터가 저장된 시트 정보
const PRACTICE_SPREADSHEET_ID = "1u-q3tB3hA0l7babVtgSUy1TvaEft-9U_jaEKaLynAfc";
const PRACTICE_SHEET_NAME = "시트1"; // 또는 실제 시트 이름으로 변경

/**
 * HTTP GET 요청 처리
 */
function doGet(e) {
  try {
    Logger.log('=== TBM_Practice_API doGet 호출 시작 ===');
    Logger.log('params: ' + JSON.stringify(e.parameter));
    
    // getPracticeTBMData 액션 처리
    if (!e.parameter || !e.parameter.action || e.parameter.action !== 'getPracticeTBMData') {
      return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
        success: false,
        message: "Invalid action. Use action=getPracticeTBMData"
      }));
    }
    
    const startDate = e.parameter.startDate || '';
    const endDate = e.parameter.endDate || '';
    const hq = e.parameter.hq || '';
    const branch = e.parameter.branch || '';
    
    return getPracticeTBMData(startDate, endDate, hq, branch);
      
  } catch (error) {
    Logger.log('TBM_Practice_API doGet 오류: ' + error.message);
    Logger.log('오류 스택: ' + error.stack);
    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
      success: false,
      message: `서버 오류: ${error.message}`,
      error: error.toString()
    }));
  }
}

/**
 * HTTP OPTIONS 요청 처리 (CORS preflight)
 */
function doOptions(e) {
  return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
    status: 'ok'
  }));
}

/**
 * CORS 응답 생성 함수
 */
function createCorsResponse(output, content) {
  return output
    .setContent(content)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 셀 값에서 시간 문자열 추출 (HH:MM)
 */
function extractTimeFromCell(value) {
  try {
    if (!value) return '';
    
    // Date 객체인 경우
    if (value instanceof Date) {
      return Utilities.formatDate(value, "Asia/Seoul", "HH:mm");
    }
    
    // 문자열인 경우
    return value.toString().trim();
  } catch (e) {
    Logger.log('시간 추출 오류: ' + e.toString());
    return '';
  }
}

/**
 * TBM실시 시트 데이터 조회 함수
 * 
 * @param {string} startDate - 시작일 (YYYY-MM-DD 형식)
 * @param {string} endDate - 종료일 (YYYY-MM-DD 형식)
 * @param {string} hq - 필터링할 본부명 (선택)
 * @param {string} branch - 필터링할 지사명 (선택)
 * @returns {Object} TBM실시 시트용 데이터
 */
function getPracticeTBMData(startDate, endDate, hq, branch) {
  try {
    Logger.log(`getPracticeTBMData 시작 - startDate: ${startDate}, endDate: ${endDate}, hq: ${hq}, branch: ${branch}`);
    
    const sheet = SpreadsheetApp.openById(PRACTICE_SPREADSHEET_ID).getSheetByName(PRACTICE_SHEET_NAME);
    if (!sheet) {
      throw new Error(`시트를 찾을 수 없습니다: ${PRACTICE_SHEET_NAME}`);
    }
    
    const data = sheet.getDataRange().getValues();
    
    // 날짜 범위 생성
    const dateRange = [];
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateRange.push(formatPracticeDate(d));
      }
    }
    
    Logger.log(`📅 날짜 범위: ${dateRange.length}일 (${dateRange.length > 0 ? dateRange[0] + ' ~ ' + dateRange[dateRange.length - 1] : '전체'})`);
    Logger.log(`📊 전체 데이터 행 수: ${data.length - 1}개 (헤더 제외)`);
    
    // 1단계: 사용자가 선택한 일자에 매칭되는 교육일자를 가진 모든 행을 JSON으로 취합
    const matchedRows = [];
    
    for (let i = 1; i < data.length; i++) { // 헤더 제외하고 1부터 시작
      const row = data[i];
      
      // 빈 행 건너뛰기
      if (!row[0] || !row[1]) continue;
      
      // 교육일자 기준으로 날짜 필터링 (O열: 교육일자, 인덱스 14)
      const educationDate = formatPracticeDate(row[14]); // O열: 교육일자
      
      // 교육일자가 없으면 건너뛰기
      if (!educationDate) continue;
      
      // 날짜 필터링 (교육일자 기준) - 선택한 일자 범위에 포함되는지 확인
      if (dateRange.length > 0 && !dateRange.includes(educationDate)) continue;
      
      // 본부/지사 필터링
      if (hq && row[2] !== hq) continue; // C열: 본부
      if (branch && row[3] !== branch) continue; // D열: 지사
      
      // '작업없음' 제외
      if (row[8] === '작업없음') continue; // I열: 금일작업
      
      // 매칭되는 행을 JSON 객체로 취합
      matchedRows.push({
        본부명: row[2] || '', // C열: 본부
        지사명: row[3] || '', // D열: 지사
        지구명: row[4] || '', // E열: 사업명 (지구명)
        교육일자: educationDate, // O열: 교육일자
        교육시작시간: extractTimeFromCell(row[15]), // P열: 교육시작시간 (변환 적용)
        교육종료시간: extractTimeFromCell(row[16]), // Q열: 교육종료시간 (변환 적용)
        교육사진: row[17] || '', // R열: 교육사진
        신규근로자: row[10] || '', // K열: 신규근로자 (숫자)
        투입장비: row[11] || '' // L열: 투입장비 (텍스트)
      });
    }
    
    Logger.log(`✅ 매칭된 행 수: ${matchedRows.length}개`);
    
    // 2단계: 본부/지사/프로젝트명으로 분류
    const projectMap = new Map();
    
    for (const row of matchedRows) {
      const projectKey = `${row.본부명}_${row.지사명}_${row.지구명}`;
      
      if (!projectMap.has(projectKey)) {
        projectMap.set(projectKey, {
          본부명: row.본부명,
          지사명: row.지사명,
          지구명: row.지구명,
          날짜별데이터: new Map() // 날짜별 데이터를 저장할 Map
        });
      }
      
      const projectData = projectMap.get(projectKey);
      
      // 3단계: 해당 일자별 데이터 정리 (작업여부, 신규근로자 숫자, 장비값)
      const dateKey = row.교육일자;
      
      if (!projectData.날짜별데이터.has(dateKey)) {
        // 해당 일자의 첫 번째 데이터
        projectData.날짜별데이터.set(dateKey, {
          교육시작시간: row.교육시작시간,
          교육종료시간: row.교육종료시간,
          교육사진: row.교육사진,
          신규근로자: row.신규근로자,
          투입장비: row.투입장비
        });
      } else {
        // 같은 프로젝트의 같은 교육일자에 여러 행이 있는 경우
        // 교육사진, 신규근로자, 투입장비가 있으면 업데이트 (빈 값이 아닌 경우)
        const existingData = projectData.날짜별데이터.get(dateKey);
        if (row.교육사진 && !existingData.교육사진) {
          existingData.교육사진 = row.교육사진;
        }
        if (row.신규근로자 && !existingData.신규근로자) {
          existingData.신규근로자 = row.신규근로자;
        }
        if (row.투입장비 && !existingData.투입장비) {
          existingData.투입장비 = row.투입장비;
        }
        if (row.교육시작시간 && !existingData.교육시작시간) {
          existingData.교육시작시간 = row.교육시작시간;
        }
        if (row.교육종료시간 && !existingData.교육종료시간) {
          existingData.교육종료시간 = row.교육종료시간;
        }
      }
    }
    
    Logger.log(`📦 프로젝트 그룹: ${projectMap.size}개`);
    
    // 프로젝트별로 TBM 시간 계산 및 데이터 변환
    const result = [];
    
    for (const [projectKey, projectData] of projectMap) {
      // TBM 시간 계산: 조회 기간 중 첫 번째 날의 교육시작시간, 교육종료시간 사용
      let tbmTime = '';
      
      // 조회 기간(dateRange)이 있으면 그 중 첫 번째 날부터 확인, 없으면 정렬된 날짜 중 첫 번째
      const sortedDates = Array.from(projectData.날짜별데이터.keys()).sort();
      const targetDates = dateRange.length > 0 ? dateRange : sortedDates;
      
      Logger.log(`프로젝트 ${projectKey}: 날짜별데이터 키 개수=${projectData.날짜별데이터.size}, dateRange.length=${dateRange.length}, targetDates.length=${targetDates.length}`);
      
      // 조회 기간 중 첫 번째 날부터 순서대로 확인
      for (const date of targetDates) {
        const dateData = projectData.날짜별데이터.get(date);
        Logger.log(`날짜 ${date} 확인: dateData 존재=${!!dateData}, 교육시작시간=${dateData?.교육시작시간 || ''}, 교육종료시간=${dateData?.교육종료시간 || ''}`);
        
        if (dateData && dateData.교육시작시간 && dateData.교육종료시간) {
          const startTimeStr = dateData.교육시작시간.toString().trim();
          const endTimeStr = dateData.교육종료시간.toString().trim();
          
          if (startTimeStr && endTimeStr) {
            const duration = calculatePracticeDuration(startTimeStr, endTimeStr);
            Logger.log(`교육시간 계산: ${startTimeStr} ~ ${endTimeStr}, duration=${duration}분`);
            
            if (duration > 0) {
              // 시간 형식이 "7:00" 같은 경우 "07:00"으로 포맷팅
              const startTime = formatTime(startTimeStr);
              const endTime = formatTime(endTimeStr);
              tbmTime = `${startTime} ~ ${endTime}(${duration}분)`;
              Logger.log(`TBM시간 설정: ${tbmTime}`);
              break;
            }
          }
        }
      }
      
      if (!tbmTime) {
        Logger.log(`⚠️ 프로젝트 ${projectKey}: TBM시간을 찾을 수 없습니다.`);
      }
      
      // 4단계: 날짜별 데이터를 JSON으로 정리 (작업여부, 신규근로자 숫자, 장비값)
      const 날짜별데이터 = {};
      
      // 선택한 일자 범위의 모든 날짜에 대해 데이터 정리 (targetDates 재사용)
      
      for (const date of targetDates) {
        const dateData = projectData.날짜별데이터.get(date);
        
        if (dateData) {
          // 작업여부: 교육사진이 있으면 "여"
          const 작업여부 = dateData.교육사진 && dateData.교육사진.toString().trim() !== '' ? '여' : '';
          
          // 입회자: 빈 값 (TBM실시 시트에서는 사용하지 않음)
          const 입회자 = '';
          
          // 신규인원(명): 신규근로자 값 (숫자 그대로)
          const 신규인원 = dateData.신규근로자 ? dateData.신규근로자.toString().trim() : '';
          
          // 안전활동(신규근로자): 신규근로자가 있으면 "여"
          const 신규근로자안전활동 = 신규인원 !== '' ? '여' : '';
          
          // 대수: 투입장비 값 (텍스트 그대로)
          const 대수 = dateData.투입장비 ? dateData.투입장비.toString().trim() : '';
          
          // 안전활동(건설기계): 장비가 있으면 "여"
          const 건설기계안전활동 = 대수 !== '' ? '여' : '';
          
          날짜별데이터[date] = {
            작업여부: 작업여부,
            입회자: 입회자,
            신규인원: 신규인원,
            신규근로자안전활동: 신규근로자안전활동,
            대수: 대수,
            건설기계안전활동: 건설기계안전활동
          };
        } else {
          // 해당 날짜에 데이터가 없는 경우 빈 값으로 설정
          날짜별데이터[date] = {
            작업여부: '',
            입회자: '',
            신규인원: '',
            신규근로자안전활동: '',
            대수: '',
            건설기계안전활동: ''
          };
        }
      }
      
      // 5단계: 최종 JSON 구조로 정리하여 결과 배열에 추가
      result.push({
        본부명: projectData.본부명,
        지사명: projectData.지사명,
        지구명: projectData.지구명,
        TBM시간: tbmTime,
        날짜별데이터: 날짜별데이터 // 이미 객체 형태로 정리됨
      });
    }
    
    // 본부 순서, 지사 순서, 프로젝트명 가나다 순으로 정렬
    const HEADQUARTERS_ORDER = ['본사', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '화안', '금강', '새만금', '영산강', '새만금산업단지', '토지개발', '기타'];
    const BRANCH_ORDER = {
      '본사': ['본사'],
      '경기': ['경기본부', '여주·이천지사', '양평·광주·서울지사', '화성·수원지사', '연천·포천·가평지사', '파주지사', '고양지사', '강화·옹진지사', '김포지사', '평택지사', '안성지사'],
      '강원': ['강원본부', '춘천지사', '원주지사', '강릉지사', '동해지사', '태백지사', '속초지사', '삼척지사', '홍천지사', '횡성지사', '영월지사', '평창지사', '정선지사', '철원지사', '화천지사', '양구지사', '인제지사', '고성지사', '양양지사'],
      '충북': ['충북본부', '청주지사', '충주지사', '제천지사', '보은지사', '옥천지사', '영동지사', '증평지사', '진천지사', '괴산지사', '음성지사', '단양지사'],
      '충남': ['충남본부', '천안지사', '공주지사', '보령지사', '아산지사', '서산·태안지사', '논산지사', '세종·대전·금산지사', '부여지사', '서천지사', '청양지사', '홍성지사', '예산지사', '당진지사'],
      '전북': ['전북본부', '전주지사', '군산지사', '익산지사', '정읍지사', '남원지사', '김제지사', '부안지사', '고창지사', '순창지사', '임실지사', '무주지사', '진안지사', '장수지사'],
      '전남': ['전남본부', '목포지사', '여수지사', '순천지사', '나주지사', '광양지사', '담양지사', '곡성지사', '구례지사', '고흥지사', '보성지사', '화순지사', '장흥지사', '강진지사', '해남지사', '영암지사', '무안지사', '함평지사', '영광지사', '장성지사', '완도지사', '진도지사', '신안지사'],
      '경북': ['경북본부', '포항지사', '경주지사', '김천지사', '안동지사', '구미지사', '영주지사', '영천지사', '상주지사', '문경지사', '경산지사', '의성지사', '청송지사', '영양지사', '영덕지사', '청도지사', '고령지사', '성주지사', '칠곡지사', '예천지사', '봉화지사', '울진지사', '울릉지사'],
      '경남': ['경남본부', '창원지사', '진주지사', '통영지사', '사천지사', '김해지사', '밀양지사', '거제지사', '양산지사', '의령지사', '함안지사', '창녕지사', '고성지사', '남해지사', '하동지사', '산청지사', '함양지사', '거창지사', '합천지사'],
      '제주': ['제주본부', '제주지사', '서귀포지사'],
      '화안': ['화안사업단'],
      '금강': ['금강사업단'],
      '새만금': ['새만금사업단'],
      '영산강': ['영산강사업단'],
      '새만금산업단지': ['새만금산업단지사업단'],
      '토지개발': ['토지개발사업단'],
      '기타': ['기타']
    };
    
    result.sort(function(a, b) {
      // 1. 본부 순서로 정렬
      const hqOrderA = HEADQUARTERS_ORDER.indexOf(a.본부명);
      const hqOrderB = HEADQUARTERS_ORDER.indexOf(b.본부명);
      
      if (hqOrderA !== hqOrderB) {
        // -1인 경우(목록에 없는 본부)는 뒤로
        if (hqOrderA === -1) return 1;
        if (hqOrderB === -1) return -1;
        return hqOrderA - hqOrderB;
      }
      
      // 2. 같은 본부 내에서는 지사 순서로 정렬
      const branchOptions = BRANCH_ORDER[a.본부명] || [];
      const branchOrderA = branchOptions.indexOf(a.지사명);
      const branchOrderB = branchOptions.indexOf(b.지사명);
      
      if (branchOrderA !== branchOrderB) {
        // -1인 경우(목록에 없는 지사)는 뒤로
        if (branchOrderA === -1 && branchOrderB === -1) {
          // 둘 다 목록에 없으면 가나다 순
          return a.지사명.localeCompare(b.지사명, 'ko-KR');
        }
        if (branchOrderA === -1) return 1;
        if (branchOrderB === -1) return -1;
        return branchOrderA - branchOrderB;
      }
      
      // 3. 같은 본부, 같은 지사 내에서는 프로젝트명(지구명) 가나다 순으로 정렬
      return a.지구명.localeCompare(b.지구명, 'ko-KR');
    });
    
    Logger.log(`✅ 필터링 및 정렬된 프로젝트: ${result.length}개`);
    
    if (result.length > 0) {
      Logger.log(`📋 첫 번째 프로젝트 샘플: ${JSON.stringify(result[0])}`);
    } else {
      Logger.log('⚠️ 조회된 데이터가 없습니다.');
    }
    
    const responseData = {
      success: true,
      data: result,
      total: result.length,
      dateRange: dateRange,
      filters: {
        startDate: startDate,
        endDate: endDate,
        hq: hq,
        branch: branch
      }
    };
    
    Logger.log(`📤 응답 데이터 생성 완료: success=${responseData.success}, total=${responseData.total}, dateRange.length=${responseData.dateRange.length}`);
    
    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify(responseData));
    
  } catch (error) {
    Logger.log('getPracticeTBMData 오류: ' + error.message);
    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
      success: false,
      message: `TBM실시 데이터 조회 실패: ${error.message}`
    }));
  }
}

/**
 * 교육 시간 계산 함수 (분 단위)
 * 
 * @param {string} startTime - 시작 시간 (HH:MM 형식)
 * @param {string} endTime - 종료 시간 (HH:MM 형식)
 * @returns {number} 교육 시간 (분)
 */
function calculatePracticeDuration(startTime, endTime) {
  try {
    if (!startTime || !endTime) {
      return 0;
    }
    
    // HH:MM 형식의 시간을 Date 객체로 변환
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    
    // 유효한 시간인지 확인
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 0;
    }
    
    // 시간 차이를 밀리초로 계산 후 분으로 변환
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    
    // 음수인 경우 0 반환
    return durationMinutes >= 0 ? durationMinutes : 0;
    
  } catch (error) {
    Logger.log('Error calculating practice duration: ' + error.toString());
    return 0;
  }
}

/**
 * 날짜 포맷 함수
 * 
 * @param {Date|string} dateValue - 날짜 값
 * @returns {string} YYYY-MM-DD 형식의 문자열
 */
function formatPracticeDate(dateValue) {
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
    Logger.log('formatPracticeDate 오류: ' + error.message);
    return '';
  }
}

/**
 * 시간 포맷 함수 (HH:MM 형식으로 변환)
 * 
 * @param {string} timeValue - 시간 값 (예: "7:00", "07:00", "7:0" 등)
 * @returns {string} HH:MM 형식의 문자열
 */
function formatTime(timeValue) {
  try {
    if (!timeValue || typeof timeValue !== 'string') {
      return '';
    }
    
    // 공백 제거
    const trimmed = timeValue.trim();
    if (!trimmed) return '';
    
    // ":"로 분리
    const parts = trimmed.split(':');
    if (parts.length < 2) return trimmed;
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    if (isNaN(hours) || isNaN(minutes)) {
      return trimmed;
    }
    
    // HH:MM 형식으로 포맷팅
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
  } catch (error) {
    Logger.log('formatTime 오류: ' + error.message);
    return timeValue || '';
  }
}

/**
 * 테스트용 함수 (개발 시에만 사용)
 */
function testPracticeAPI() {
  Logger.log('=== TBM실시 API 테스트 시작 ===');
  
  // 오늘 날짜 기준으로 테스트
  const today = new Date();
  const startDate = Utilities.formatDate(today, "Asia/Seoul", "yyyy-MM-dd");
  const endDate = Utilities.formatDate(today, "Asia/Seoul", "yyyy-MM-dd");
  
  const result = getPracticeTBMData(startDate, endDate, '', '');
  Logger.log('TBM실시 데이터 테스트 결과:');
  Logger.log(JSON.stringify(result, null, 2));
  
  Logger.log('=== TBM실시 API 테스트 완료 ===');
}
