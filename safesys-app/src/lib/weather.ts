// 기상청 API 관련 유틸리티 함수들

interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  apparentTemperature?: number;
}

interface KMAResponse {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body: {
      items: {
        item: Array<{
          category: string;
          fcstValue?: string;
          obsrValue?: string;
          fcstDate?: string;
          fcstTime?: string;
        }>;
      };
    };
  };
}

interface KMAXMLResponse {
  response: {
    header: {
      resultCode: [string];
      resultMsg: [string];
    };
    body: {
      items: {
        item: Array<{
          category: [string];
          fcstValue?: [string];
          obsrValue?: [string];
          fcstDate?: [string];
          fcstTime?: [string];
        }>;
      };
    };
  };
}

// 기상청 API XML 응답을 JSON으로 파싱하는 함수
function parseXMLToJSON(xmlText: string): KMAResponse {
  try {
    // XML 파싱을 위한 간단한 정규식 기반 파서
    const resultCodeMatch = xmlText.match(/<resultCode>([^<]+)<\/resultCode>/);
    const resultMsgMatch = xmlText.match(/<resultMsg>([^<]+)<\/resultMsg>/);
    
    if (!resultCodeMatch || !resultMsgMatch) {
      throw new Error('XML 응답에서 필수 헤더 정보를 찾을 수 없습니다');
    }

    const resultCode = resultCodeMatch[1];
    const resultMsg = resultMsgMatch[1];

    // 아이템들 파싱
    const items: Array<{
      category: string;
      fcstValue?: string;
      obsrValue?: string;
      fcstDate?: string;
      fcstTime?: string;
    }> = [];

    // <item> 태그들 찾기
    const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/g);
    
    if (itemMatches) {
      for (const itemXml of itemMatches) {
        const categoryMatch = itemXml.match(/<category>([^<]+)<\/category>/);
        const fcstValueMatch = itemXml.match(/<fcstValue>([^<]+)<\/fcstValue>/);
        const obsrValueMatch = itemXml.match(/<obsrValue>([^<]+)<\/obsrValue>/);
        const fcstDateMatch = itemXml.match(/<fcstDate>([^<]+)<\/fcstDate>/);
        const fcstTimeMatch = itemXml.match(/<fcstTime>([^<]+)<\/fcstTime>/);

        if (categoryMatch) {
          const item: any = {
            category: categoryMatch[1]
          };

          if (fcstValueMatch) item.fcstValue = fcstValueMatch[1];
          if (obsrValueMatch) item.obsrValue = obsrValueMatch[1];
          if (fcstDateMatch) item.fcstDate = fcstDateMatch[1];
          if (fcstTimeMatch) item.fcstTime = fcstTimeMatch[1];

          items.push(item);
        }
      }
    }

    return {
      response: {
        header: {
          resultCode,
          resultMsg
        },
        body: {
          items: {
            item: items
          }
        }
      }
    };

  } catch (error) {
    console.error('XML 파싱 중 오류:', error);
    throw error;
  }
}

// 좌표를 기상청 격자 좌표로 변환하는 함수
function convertToGridCoords(lat: number, lng: number) {
  // 기상청 격자 좌표 변환 공식
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준점 경도(degree)
  const OLAT = 38.0; // 기준점 위도(degree)
  const XO = 43; // 기준점 X좌표(GRID)
  const YO = 136; // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + (lat) * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { x, y };
}

// V-world Geocoding API를 사용한 주소-좌표 변환 (Next.js API Route 경유)
async function getCoordinatesFromVworld(address: string): Promise<{lat: number, lng: number} | null> {
  try {
    console.log('V-world API 호출 (서버 경유):', address);
    
    // Next.js API Route를 통해 V-world API 호출
    const response = await fetch(`/api/geocoding?address=${encodeURIComponent(address)}`);
    
    if (!response.ok) {
      throw new Error(`API Route 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    console.log('V-world API Route 응답:', data);
    
    if (data.success && data.coords) {
      console.log('V-world 주소 변환 성공:', {
        address,
        coords: data.coords
      });
      
      return data.coords;
    } else {
      console.log('V-world API Route 결과 없음:', data.error || 'Unknown error');
      return null;
    }

  } catch (error) {
    console.error('V-world API Route 오류:', error);
    return null;
  }
}

// 주소를 좌표로 변환하는 함수 (개선된 버전 - V-world와 Kakao API 병행 사용)
export async function getCoordinatesFromAddress(address: string): Promise<{lat: number, lng: number} | null> {
  try {
    console.log('주소 변환 시도:', address);
    
    // 1차 시도: V-world API 사용
    console.log('1차 시도: V-world API');
    const vworldResult = await getCoordinatesFromVworld(address);
    if (vworldResult) {
      return vworldResult;
    }

    // 2차 시도: Kakao API 사용 (기존 로직)
    console.log('2차 시도: Kakao API');
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).kakao && (window as any).kakao.maps) {
        const geocoder = new (window as any).kakao.maps.services.Geocoder();
        
        // 첫 번째 시도: 원본 주소
        geocoder.addressSearch(address, (result: any, status: any) => {
          console.log('Kakao API 응답 상태:', status);
          console.log('Kakao API 응답 결과:', result);
          
          if (status === (window as any).kakao.maps.services.Status.OK && result.length > 0) {
            console.log('Kakao 주소 변환 성공:', {
              address,
              lat: parseFloat(result[0].y),
              lng: parseFloat(result[0].x)
            });
            resolve({
              lat: parseFloat(result[0].y),
              lng: parseFloat(result[0].x)
            });
          } else {
            // 두 번째 시도: 간소화된 주소
            const simplifiedAddress = address.replace(/\s+\d+(-\d+)*$/, '').replace(/\s+(동|리)(\s+|$)/, ' ');
            console.log('간소화된 주소로 재시도:', simplifiedAddress);
            
            if (simplifiedAddress !== address) {
              geocoder.addressSearch(simplifiedAddress, (result2: any, status2: any) => {
                console.log('간소화된 주소 응답 상태:', status2);
                console.log('간소화된 주소 응답 결과:', result2);
                
                if (status2 === (window as any).kakao.maps.services.Status.OK && result2.length > 0) {
                  console.log('간소화된 주소 변환 성공:', {
                    address: simplifiedAddress,
                    lat: parseFloat(result2[0].y),
                    lng: parseFloat(result2[0].x)
                  });
                  resolve({
                    lat: parseFloat(result2[0].y),
                    lng: parseFloat(result2[0].x)
                  });
                } else {
                  // 세 번째 시도: 시/군 단위
                  const cityAddress = address.split(' ').slice(0, 2).join(' ');
                  console.log('시/군 단위 주소로 재시도:', cityAddress);
                  
                  geocoder.addressSearch(cityAddress, (result3: any, status3: any) => {
                    console.log('시/군 단위 주소 응답 상태:', status3);
                    console.log('시/군 단위 주소 응답 결과:', result3);
                    
                    if (status3 === (window as any).kakao.maps.services.Status.OK && result3.length > 0) {
                      console.log('시/군 단위 주소 변환 성공:', {
                        address: cityAddress,
                        lat: parseFloat(result3[0].y),
                        lng: parseFloat(result3[0].x)
                      });
                      resolve({
                        lat: parseFloat(result3[0].y),
                        lng: parseFloat(result3[0].x)
                      });
                    } else {
                      console.error('모든 주소 변환 시도 실패');
                      resolve(null);
                    }
                  });
                }
              });
            } else {
              console.error('주소 변환 실패 - 간소화할 수 없는 주소');
              resolve(null);
            }
          }
        });
      } else {
        console.error('Kakao Maps API가 로드되지 않았습니다');
        resolve(null);
      }
    });
  } catch (error) {
    console.error('주소 변환 오류:', error);
    return null;
  }
}

// 기상청 단기예보 API에서 현재 날씨 데이터 가져오기
async function getWeatherData(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_KMA_API_KEY;
    if (!apiKey) {
      console.error('기상청 API 키가 설정되지 않았습니다.');
      return null;
    }
    
    // API 키에서 줄바꿈 제거 및 정리
    const cleanApiKey = apiKey.replace(/\s+/g, '').trim();
    console.log('API 키 길이:', cleanApiKey.length);
    console.log('API 키 앞 10자:', cleanApiKey.substring(0, 10));

    // 좌표를 격자 좌표로 변환
    const { x, y } = convertToGridCoords(lat, lng);
    
    // 현재 날짜와 시간 구하기
    const now = new Date();
    const currentHour = now.getHours();
    
    // 기상청 단기예보 API 발표 시간 (하루 8회)
    const forecastTimes = [2, 5, 8, 11, 14, 17, 20, 23];
    
    // 현재 시간보다 이전의 가장 가까운 예보 시간 찾기
    let baseTime = 23; // 기본값은 전날 23시
    const targetDate = new Date(now);
    
    for (let i = forecastTimes.length - 1; i >= 0; i--) {
      if (forecastTimes[i] <= currentHour) {
        baseTime = forecastTimes[i];
        break;
      }
    }
    
    // 현재 시간이 새벽 2시 이전이면 전날 23시 사용
    if (currentHour < 2) {
      baseTime = 23;
      targetDate.setDate(targetDate.getDate() - 1);
    }
    
    const baseDate = targetDate.getFullYear().toString() + 
                    (targetDate.getMonth() + 1).toString().padStart(2, '0') + 
                    targetDate.getDate().toString().padStart(2, '0');
    const baseTimeStr = baseTime.toString().padStart(2, '0') + '00';
    
    console.log('예보 시간 계산:', {
      현재시간: `${currentHour}시`,
      사용할예보시간: baseTimeStr,
      날짜: baseDate
    });

    // 기상청 단기예보 조회서비스 API 호출
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`;
    const params = new URLSearchParams({
      serviceKey: cleanApiKey, // 정리된 키 사용
      pageNo: '1',
      numOfRows: '1000',
      dataType: 'XML', // XML 형식으로 변경 (더 안정적)
      base_date: baseDate,
      base_time: baseTimeStr,
      nx: x.toString(),
      ny: y.toString()
    });

    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    // 응답 내용을 먼저 텍스트로 확인
    const responseText = await response.text();
    console.log('기상청 API 응답 URL:', `${url}?${params}`);
    console.log('기상청 API 응답 내용:', responseText.substring(0, 500)); // 처음 500자만 로깅
    
    // JSON 또는 XML 파싱 시도
    let data: KMAResponse;
    
    if (responseText.trim().startsWith('<')) {
      // XML 응답인 경우
      console.log('XML 응답 감지됨, 파싱 시도...');
      try {
        data = parseXMLToJSON(responseText);
      } catch (parseError) {
        console.error('XML 파싱 오류:', parseError);
        console.error('응답 전체 내용:', responseText);
        throw new Error(`XML 파싱 실패: ${parseError}`);
      }
    } else {
      // JSON 응답인 경우
      console.log('JSON 응답 감지됨, 파싱 시도...');
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        console.error('응답 전체 내용:', responseText);
        throw new Error(`JSON 파싱 실패: ${parseError}`);
      }
    }
    
    if (data.response.header.resultCode !== '00') {
      console.error(`기상청 API 오류 - 코드: ${data.response.header.resultCode}, 메시지: ${data.response.header.resultMsg}`);
      
      if (data.response.header.resultCode === '03') {
        console.log('데이터 없음 - 이전 예보 시간으로 재시도...');
        
        // 간단한 재시도: 이전 3개 예보 시간만 시도
        const retryTimes = [20, 17, 14]; // 대부분의 경우 이 시간대에는 데이터가 있음
        
        for (const retryTime of retryTimes) {
          console.log(`재시도 - ${retryTime}:00`);
          
          const retryParams = new URLSearchParams({
            serviceKey: cleanApiKey,
            pageNo: '1',
            numOfRows: '1000',
            dataType: 'XML',
            base_date: baseDate,
            base_time: retryTime.toString().padStart(2, '0') + '00',
            nx: x.toString(),
            ny: y.toString()
          });
          
          try {
            const retryResponse = await fetch(`${url}?${retryParams}`);
            const retryText = await retryResponse.text();
            const retryData = retryText.trim().startsWith('<') ? parseXMLToJSON(retryText) : JSON.parse(retryText);
            
            if (retryData.response.header.resultCode === '00') {
              console.log(`재시도 성공 - ${retryTime}:00`);
              data = retryData;
              break;
            }
          } catch (retryError) {
            console.log(`재시도 실패 - ${retryTime}:00`);
          }
        }
        
        // 재시도도 실패하면 그냥 넘어가기 (fallback 사용)
        if (data.response.header.resultCode !== '00') {
          console.log('모든 재시도 실패 - fallback 사용');
          throw new Error('기상 데이터 없음');
        }
      } else {
        throw new Error(`API 오류: ${data.response.header.resultMsg}`);
      }
    }

    // 현재 시간에 가장 가까운 예보 데이터 찾기
    const items = data.response.body.items.item;
    let temperature = 0;
    let humidity = 0;
    let windSpeed = 0;

    // 기상청 API 카테고리 코드
    // TMP: 1시간 기온(℃)
    // REH: 습도(%)
    // WSD: 풍속(m/s)
    
    for (const item of items) {
      if (item.category === 'TMP' && item.fcstValue) {
        temperature = parseFloat(item.fcstValue);
      } else if (item.category === 'REH' && item.fcstValue) {
        humidity = parseFloat(item.fcstValue);
      } else if (item.category === 'WSD' && item.fcstValue) {
        windSpeed = parseFloat(item.fcstValue);
      }
    }

    return {
      temperature,
      humidity,
      windSpeed
    };

  } catch (error) {
    console.error('기상 데이터 조회 오류:', error);
    return null;
  }
}

// Heat Index 계산 공식 (체감온도)
function calculateHeatIndex(temperature: number, humidity: number): number {
  // 화씨로 변환
  const F = (temperature * 9/5) + 32;
  const RH = humidity;

  // Heat Index 공식 (화씨 기준)
  let HI = 0.5 * (F + 61.0 + ((F - 68.0) * 1.2) + (RH * 0.094));

  // 더 정확한 공식 (고온에서)
  if (HI >= 80) {
    HI = -42.379 + 2.04901523 * F + 10.14333127 * RH - 0.22475541 * F * RH
       - 6.83783e-3 * F * F - 5.481717e-2 * RH * RH + 1.22874e-3 * F * F * RH
       + 8.5282e-4 * F * RH * RH - 1.99e-6 * F * F * RH * RH;
  }

  // 섭씨로 변환
  return Math.round((HI - 32) * 5/9);
}

// 기상청 API를 통한 체감온도 조회 (단일 소스)
async function getApparentTemperatureFromWeatherSite(lat: number, lng: number): Promise<number | null> {
  try {
    console.log('기상청 API 체감온도 조회:', { lat, lng });

    const response = await fetch('/api/weather-crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lat, lng })
    });

    if (!response.ok) {
      throw new Error(`기상청 API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    return data.apparentTemperature || null;

  } catch (error) {
    console.error('기상청 API 체감온도 조회 오류:', error);
    return null;
  }
}

// 좌표를 사용하여 기상청 API에서 체감온도 가져오기
export async function getApparentTemperatureByCoords(lat: number, lng: number): Promise<number | null> {
  try {
    console.log('기상청 API 체감온도 조회 시작:', { lat, lng });

    // 기상청 API만 사용
    const apparentTemp = await getApparentTemperatureFromWeatherSite(lat, lng);
    
    if (apparentTemp !== null) {
      console.log('기상청 API 체감온도 조회 성공:', {
        coords: { lat, lng },
        apparentTemperature: apparentTemp
      });
      return apparentTemp;
    }

    throw new Error('기상청 API에서 체감온도를 가져올 수 없습니다');

  } catch (error) {
    console.error('기상청 API 체감온도 조회 오류:', error);
    return null;
  }
}

// 기상청 생활기상지수서비스 API에서 체감온도 가져오기 (서버사이드 API Route 사용)
async function getApparentTemperatureFromLivingWthrIdx(areaNo?: string): Promise<number | null> {
  try {
    // 현재 날짜와 시간 구하기 (6시간 간격으로 발표)
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = Math.floor(now.getHours() / 6) * 6; // 0, 6, 12, 18시로 맞춤
    const timeStr = `${year}-${month}-${day} ${hour.toString().padStart(2, '0')}:00`;
    
    console.log('서버사이드 생활기상지수 API 호출:', {
      areaNo: areaNo || '전체지점',
      time: timeStr
    });

    // 서버사이드 API Route 호출 (CORS 문제 해결)
    const params = new URLSearchParams({
      areaNo: areaNo || '',
      time: timeStr
    });

    const response = await fetch(`/api/living-weather-index?${params}`);
    
    if (!response.ok) {
      throw new Error(`서버 API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    console.log('서버 API 응답:', data);
    
    if (!data.success) {
      console.error('서버 API 오류:', data.error);
      
      // 시간을 6시간 전으로 조정해서 재시도
      const retryTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const retryYear = retryTime.getFullYear();
      const retryMonth = (retryTime.getMonth() + 1).toString().padStart(2, '0');
      const retryDay = retryTime.getDate().toString().padStart(2, '0');
      const retryHour = Math.floor(retryTime.getHours() / 6) * 6;
      const retryTimeStr = `${retryYear}-${retryMonth}-${retryDay} ${retryHour.toString().padStart(2, '0')}:00`;
      
      console.log('6시간 전으로 재시도:', retryTimeStr);
      
      const retryParams = new URLSearchParams({
        areaNo: areaNo || '',
        time: retryTimeStr
      });
      
      const retryResponse = await fetch(`/api/living-weather-index?${retryParams}`);
      
      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        if (retryData.success) {
          console.log('재시도 성공:', retryData);
          return extractApparentTemperatureFromItems(retryData.items);
        }
      }
      
      throw new Error(`서버 API 오류: ${data.error}`);
    }

    // 응답 데이터에서 체감온도 추출
    return extractApparentTemperatureFromItems(data.items);

  } catch (error) {
    console.error('생활기상지수 API 오류:', error);
    return null;
  }
}

// 생활기상지수 API 응답에서 체감온도 추출하는 헬퍼 함수
function extractApparentTemperatureFromItems(items: any[]): number | null {
  if (!items || !Array.isArray(items)) {
    console.log('응답에 아이템이 없습니다:', items);
    return null;
  }

  console.log('생활기상지수 API 아이템들:', items);
  console.log('아이템 개수:', items.length);

  // 체감온도 관련 데이터 찾기
  for (const item of items) {
    console.log('아이템 분석:', item);
    
    // 다양한 필드명으로 체감온도 데이터 찾기
    const possibleFields = [
      'wthrIdx',      // 날씨지수
      'sensorytem',   // 체감온도
      'value',        // 값
      'today',        // 오늘
      'tomorrow',     // 내일
      'dayAfter'      // 모레
    ];
    
    for (const field of possibleFields) {
      if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
        const temp = parseFloat(item[field]);
        if (!isNaN(temp) && temp > -50 && temp < 60) { // 현실적인 온도 범위
          console.log(`체감온도 추출 성공 (${field}):`, temp);
          return Math.round(temp);
        }
      }
    }
  }

  console.log('체감온도 데이터를 찾을 수 없습니다');
  return null;
}

// 기상청 API만 사용하는 체감온도 조회 함수
export async function getEnhancedApparentTemperature(lat: number, lng: number, areaNo?: string): Promise<number | null> {
  try {
    console.log('기상청 API 체감온도 조회 시작:', { lat, lng, areaNo });

    // 기상청 API만 사용 (weather-crawl API Route)
    const response = await fetch('/api/weather-crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lat, lng })
    });

    if (!response.ok) {
      throw new Error(`기상청 API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    console.log('기상청 API 응답:', data);
    
    if (data.apparentTemperature !== undefined && data.apparentTemperature !== null) {
      console.log('기상청 API 체감온도 성공:', data.apparentTemperature);
      return data.apparentTemperature;
    }

    throw new Error('기상청 API에서 체감온도를 가져올 수 없습니다');

  } catch (error) {
    console.error('기상청 API 체감온도 조회 오류:', error);
    return null;
  }
}

// 주소를 기반으로 체감온도 가져오기 (기존 호환성을 위해 유지)
export async function getApparentTemperatureByAddress(address: string): Promise<number | null> {
  try {
    // 1. 주소를 좌표로 변환
    const coords = await getCoordinatesFromAddress(address);
    if (!coords) {
      console.error('주소를 좌표로 변환할 수 없습니다:', address);
      return null;
    }

    console.log('좌표 변환 성공:', { address, coords });

    // 2. 향상된 체감온도 조회 함수 사용 (생활기상지수 API 포함)
    return await getEnhancedApparentTemperature(coords.lat, coords.lng);

  } catch (error) {
    console.error('주소 기반 체감온도 조회 오료:', error);
    return null;
  }
} 