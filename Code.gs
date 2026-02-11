const SPREADSHEET_ID = "1uCLf2nr8u4orRd90TEkxoorOyXv1jpikyK6rejfAoLM";
const SHEET_NAME = "응답";
const EDUCATION_FOLDER_ID = '14-6KidsuZ5oYzYTSYRl4FElN0F0lan5p';
const SIGNATURE_FOLDER_ID = '1Tke2BwN3Za_PflfqHQEW4Up2c-YCmvzP';

/**
 * CORS 응답을 생성합니다.
 */
function createCorsResponse(output, content) {
  return output
    .setContent(content)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Base64로 인코딩된 이미지를 Google Drive에 업로드하고 URL을 반환합니다.
 */
function uploadBase64Image(base64Data, fileName, folderId, mimeType = 'image/jpeg') {
  try {
    if (!base64Data || !fileName || !folderId) {
      throw new Error('Missing required parameters for image upload');
    }
    
    if (!base64Data.includes('base64,')) {
      throw new Error('Invalid base64 data format');
    }
    
    const imageData = base64Data.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(imageData), mimeType, fileName);
    
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  } catch (error) {
    Logger.log('Image upload error: ' + error.toString());
    throw error;
  }
}

/**
 * 시트를 가져옵니다.
 */
function getSheet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Could not find sheet');
  }
  return sheet;
}

// getLastDataRow 함수 제거 - sheet.getLastRow() 사용으로 대체

function doGet(e) {
  try {
    if (!e.parameter || !e.parameter.action) {
      throw new Error('Missing required parameters');
    }

    const sheet = getSheet();
    const email = e.parameter.email?.trim();

    if (e.parameter.action === 'getRecent' && email) {
      const data = sheet.getDataRange().getValues();
      // 캐시 사용 추가
      const cache = CacheService.getScriptCache();
      const cacheKey = `recent_${email}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return createCorsResponse(ContentService.createTextOutput(), cachedData);
      }

      for (let i = data.length - 1; i >= 1; i--) {
        // 기존 데이터 호환성: 이메일이 [18] 또는 [19]에 있을 수 있음
        const emailIndex = data[i][19] ? 19 : 18;
        if ((data[i][emailIndex] === email || data[i][18] === email) && data[i][8] !== '작업없음') {
          const formData = {
            timestamp: data[i][0],
            date: data[i][1],
            headquarters: data[i][2],
            branch: data[i][3],
            projectName: data[i][4],
            projectType: data[i][5],
            constructionCompany: data[i][6],
            address: data[i][7],
            todayWork: data[i][8],
            personnelInput: data[i][9],
            newWorkerCount: data[i][10] || '',  // 신규근로자
            equipmentInput: data[i][11] || '',
            riskWorkType: data[i][12] || '',
            cctvUsage: data[i][13] || '',
            educationDate: data[i][14] || '',
            educationStartTime: data[i][15] || '',
            educationEndTime: data[i][16] || '',
            educationPhoto: data[i][17] || '',
            signature: data[i][18] || '',
            email: data[i][19] || '',
            potentialRisk1: data[i][20] || '',
            solution1: data[i][21] || '',
            potentialRisk2: data[i][22] || '',
            solution2: data[i][23] || '',
            potentialRisk3: data[i][24] || '',
            solution3: data[i][25] || '',
            mainRiskSelection: data[i][26] || '',
            mainRiskSolution: data[i][27] || '',
            riskFactor1: data[i][28] || '',
            riskFactor2: data[i][29] || '',
            riskFactor3: data[i][30] || '',
            otherRemarks: data[i][31] || '',
            name: data[i][32] || '',
            contact: data[i][33] || '',
            detailAddress: data[i][40] || '',  // AN컬럼: 상세주소
            latitude: data[i][41] || '',       // AO컬럼: latitude
            longitude: data[i][42] || ''       // AP컬럼: longitude
          };

          const responseData = JSON.stringify({
            success: true,
            formData: formData
          });
          
          // 캐시에 데이터 저장 (10분)
          cache.put(cacheKey, responseData, 600);

          return createCorsResponse(ContentService.createTextOutput(), responseData);
        }
      }

      return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
        success: false,
        message: "No recent data found"
      }));
    }

    if (e.parameter.action === 'getSubmissions' && email) {
      const data = sheet.getDataRange().getValues();
      const submissions = [];

      for (let i = 1; i < data.length; i++) {
        // 기존 데이터 호환성: 이메일이 [18] 또는 [19]에 있을 수 있음
        const emailValue = data[i][19] || data[i][18];
        if (emailValue === email) {
          submissions.push({
            rowNumber: i + 1,
            timestamp: data[i][0],
            date: data[i][1],
            headquarters: data[i][2],
            branch: data[i][3],
            projectName: data[i][4],
            projectType: data[i][5],
            constructionCompany: data[i][6],
            address: data[i][7],
            todayWork: data[i][8],
            personnelInput: data[i][9],
            newWorkerCount: data[i][10] || '',  // 신규근로자
            equipmentInput: data[i][11] || '',
            riskWorkType: data[i][12] || '',
            cctvUsage: data[i][13] || '',
            educationDate: data[i][14] || '',
            educationStartTime: data[i][15] || '',
            educationEndTime: data[i][16] || '',
            educationPhoto: data[i][17] || '',
            signature: data[i][18] || '',
            email: emailValue,
            potentialRisk1: data[i][20] || '',
            solution1: data[i][21] || '',
            potentialRisk2: data[i][22] || '',
            solution2: data[i][23] || '',
            potentialRisk3: data[i][24] || '',
            solution3: data[i][25] || '',
            mainRiskSelection: data[i][26] || '',
            mainRiskSolution: data[i][27] || '',
            riskFactor1: data[i][28] || '',
            riskFactor2: data[i][29] || '',
            riskFactor3: data[i][30] || '',
            otherRemarks: data[i][31] || '',
            name: data[i][32] || '',
            contact: data[i][33] || '',
            detailAddress: data[i][40] || '',  // AN컬럼: 상세주소
            latitude: data[i][41] || '',       // AO컬럼: latitude
            longitude: data[i][42] || ''       // AP컬럼: longitude
          });
        }
      }

      return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
        success: true,
        submissions: submissions
      }));
    }

    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
      success: false,
      message: "Invalid action or missing parameters"
    }));

  } catch (error) {
    Logger.log('Error in doGet: ' + error.message);
    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
      success: false,
      message: error.message,
      error: error.toString()
    }));
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); // 30초 대기로 연장 (타임아웃 방지)
    
    const data = JSON.parse(e.postData.contents);
    Logger.log("Received POST request with data: " + JSON.stringify(data));
    Logger.log("CCTV Usage value: " + data.cctvUsage);
    
    const sheet = getSheet();
    
    if (!data.action || data.action === 'submit') {
      let photoUrl = '';
      if (data.photo) {
        photoUrl = uploadBase64Image(
          data.photo,
          `education_photo_${Date.now()}.jpg`,
          EDUCATION_FOLDER_ID,
          'image/jpeg'  // 교육사진은 JPEG로 압축
        );
      }

      let signatureUrl = '';
      if (data.signature) {
        signatureUrl = uploadBase64Image(
          data.signature,
          `signature_${Date.now()}.png`,
          SIGNATURE_FOLDER_ID,
          'image/png'   // 서명은 투명 배경 유지를 위해 PNG
        );
      }

      // 추가 컬럼 값들 계산
      const phoneLink = data.contact ? `https://call.ctrlq.org/${data.contact}` : '';
      const tmapLink = data.address ? `https://apis.openapi.sk.com/tmap/app/poi?appKey=hTKnKnSYyD4ljeMriScKD4M74VX1Nm6S7KRbyLfw&name=${encodeURIComponent(data.address)}` : '';
      
      // Google Drive URL에서 파일 ID 추출하여 썸네일 URL 생성
      const educationPhotoThumbnail = photoUrl ? extractDriveThumbnailUrl(photoUrl) : '';
      const signatureThumbnail = signatureUrl ? extractDriveThumbnailUrl(signatureUrl) : '';
      
      // 교육시간 계산 (분 단위)
      const educationDuration = calculateEducationDuration(data.educationStartTime, data.educationEndTime);

      const rowData = [
        data.timestamp,
        Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd"), // 'yyyy-MM-dd' 형식으로 변경,
        data.headquarters,
        data.branch,
        data.projectName,
        data.projectType,
        data.constructionCompany,
        data.address,
        data.todayWork,
        data.personnelInput,
        data.newWorkerCount || '',  // 신규근로자
        data.equipmentInput,
        data.riskWorkType,
        data.cctvUsage || '',
        data.educationDate,
        data.educationStartTime,
        data.educationEndTime,
        photoUrl,
        signatureUrl,
        data.email,
        data.potentialRisk1 || '',
        data.solution1 || '',
        data.potentialRisk2 || '',
        data.solution2 || '',
        data.potentialRisk3 || '',
        data.solution3 || '',
        data.mainRiskSelection || '',
        data.mainRiskSolution || '',
        data.riskFactor1 || '',
        data.riskFactor2 || '',
        data.riskFactor3 || '',
        data.otherRemarks || '',
        data.name || '',
        data.contact || '',
        educationDuration,   // AH열: 교육시간
        phoneLink,           // AI열: 전화하기
        tmapLink,           // AJ열: T맵안내
        educationPhotoThumbnail, // AK열: 교육사진변환
        signatureThumbnail,  // AL열: 서명사진변환
        '',                  // AM열: 예비
        data.detailAddress || '', // AN열: 상세주소
        data.latitude || '',      // AO열: latitude
        data.longitude || ''      // AP열: longitude
      ];
      
    // 중복 제출 방지 로직 제거됨 (무조건 저장)
    /* 
    // 중복 제출 방지: 같은 날짜, 같은 이메일의 이전 제출 내역 삭제
    const todayStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
    const userEmail = data.email;

    if (userEmail) {
      const range = sheet.getDataRange();
      const values = range.getValues();
      
      // 역순으로 순회하며 삭제 (인덱스 밀림 방지)
      for (let i = values.length - 1; i >= 1; i--) {
        const rowDate = values[i][1]; // B열: 날짜
        const rowEmail = values[i][18]; // S열: 이메일
        
        let formattedRowDate = rowDate;
        if (rowDate instanceof Date) {
          formattedRowDate = Utilities.formatDate(rowDate, "Asia/Seoul", "yyyy-MM-dd");
        }
        
        // 날짜와 이메일이 모두 일치하면 해당 행 삭제
        if (formattedRowDate === todayStr && rowEmail === userEmail) {
          sheet.deleteRow(i + 1); // 1-based index
        }
      }
    }
    */

      // Google Apps Script의 내장 함수로 마지막 행에 자동 추가
      sheet.appendRow(rowData);
      
      const cache = CacheService.getScriptCache();
      cache.remove(`recent_${data.email}`);
      
      return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
        success: true,
        message: "Successfully submitted",
        photoUrl: photoUrl,
        signatureUrl: signatureUrl
      }));
    }

    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
      success: false,
      message: "Invalid action"
    }));

  } catch (error) {
    Logger.log("Error in doPost: " + error.message);
    return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
      success: false,
      message: error.message,
      error: error.toString()
    }));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Google Drive URL에서 파일 ID를 추출하여 썸네일 URL을 생성합니다.
 */
function extractDriveThumbnailUrl(driveUrl) {
  try {
    if (!driveUrl || driveUrl === '') return '';
    
    // Google Drive URL에서 파일 ID 추출 (/d/FILE_ID/view 패턴)
    const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)\//);
    if (match && match[1]) {
      const fileId = match[1];
      return `https://drive.google.com/thumbnail?id=${fileId}`;
    }
    
    return '';
  } catch (error) {
    Logger.log('Error extracting thumbnail URL: ' + error.toString());
    return '';
  }
}

/**
 * 교육 시간 계산 함수 (분 단위)
 */
function calculateEducationDuration(startTime, endTime) {
  try {
    if (!startTime || !endTime) {
      return '';
    }
    
    // HH:MM 형식의 시간을 Date 객체로 변환
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    
    // 유효한 시간인지 확인
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return '';
    }
    
    // 시간 차이를 밀리초로 계산 후 분으로 변환
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    
    // 음수인 경우 (종료시간이 시작시간보다 빠른 경우) 빈 문자열 반환
    return durationMinutes >= 0 ? durationMinutes : '';
    
  } catch (error) {
    Logger.log('Error calculating education duration: ' + error.toString());
    return '';
  }
}

function doOptions(e) {
  return createCorsResponse(ContentService.createTextOutput(), JSON.stringify({
    status: 'ok'
  }));
} 