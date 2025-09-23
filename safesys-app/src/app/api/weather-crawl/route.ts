import { NextRequest, NextResponse } from 'next/server';

// 좌표를 기상청 격자 좌표로 변환하는 함수
function convertToGridCoords(lat: number, lng: number) {
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

// 더 정확한 체감온도 계산 공식 (풍속, 습도, 온도 모두 고려)
function calculateApparentTemperature(temperature: number, humidity: number, windSpeed: number): number {
  const T = temperature;  // 기온 (°C)
  const RH = humidity;    // 상대습도 (%)
  const V = windSpeed;    // 풍속 (m/s)
  
  // 1. 풍속이 낮을 때는 Heat Index 사용 (고온/고습)
  if (V <= 1.5 && T >= 26 && RH >= 40) {
    const F = (T * 9/5) + 32;
    let HI = 0.5 * (F + 61.0 + ((F - 68.0) * 1.2) + (RH * 0.094));
    
    if (HI >= 80) {
      HI = -42.379 + 2.04901523 * F + 10.14333127 * RH - 0.22475541 * F * RH
         - 6.83783e-3 * F * F - 5.481717e-2 * RH * RH + 1.22874e-3 * F * F * RH
         + 8.5282e-4 * F * RH * RH - 1.99e-6 * F * F * RH * RH;
    }
    
    const heatIndex = (HI - 32) * 5/9;
    return Math.round(Math.max(T, heatIndex)); // 기온보다 낮을 수 없음
  }
  
  // 2. 풍속이 있을 때는 Wind Chill 효과 고려
  if (V > 1.5 && T < 10) {
    // Wind Chill 공식 (저온에서 바람의 냉각 효과)
    const windChill = 13.12 + 0.6215 * T - 11.37 * Math.pow(V * 3.6, 0.16) + 0.3965 * T * Math.pow(V * 3.6, 0.16);
    return Math.round(Math.min(T, windChill)); // 기온보다 높을 수 없음
  }
  
  // 3. 일반적인 경우: 습도와 풍속을 모두 고려한 체감온도
  // 습도 효과 (습도가 높을수록 더 덥게 느껴짐)
  const humidityEffect = (RH - 60) * 0.1; // 습도 60%를 기준으로 ±효과
  
  // 풍속 효과 (바람이 강할수록 시원하게 느껴짐)
  const windEffect = -V * 2.0; // 풍속 1m/s당 약 2도 시원
  
  // 온도별 민감도 조정
  let tempSensitivity = 1.0;
  if (T >= 30) tempSensitivity = 1.3;      // 고온에서 더 민감
  else if (T >= 25) tempSensitivity = 1.1;
  else if (T <= 5) tempSensitivity = 1.2;  // 저온에서도 더 민감
  
  const apparentTemp = T + (humidityEffect * tempSensitivity) + windEffect;
  
  return Math.round(apparentTemp);
}

export async function POST(request: NextRequest) {
  try {
    const { lat, lng } = await request.json();

    if (!lat || !lng) {
      return NextResponse.json(
        { error: '위도와 경도가 필요합니다' },
        { status: 400 }
      );
    }

    console.log(`실제 기상청 API 체감온도 계산 시작: 위도=${lat}, 경도=${lng}`);

    // 기상청 API 키 (테스트용 하드코딩)
    const apiKey = "ptN2Cl7gvmcWwHRgvN4UI4PF5sHIu6M1VuiDP9yvRJwRKBg8GCsFFTDtVBFtNzFQHlUWD7G4rSOtV3hTg3ny8w==";
    const cleanApiKey = apiKey.replace(/\s+/g, '').trim();

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
    
    console.log('기상청 API 호출 정보:', {
      현재시간: `${currentHour}시`,
      사용할예보시간: baseTimeStr,
      날짜: baseDate,
      격자좌표: { x, y }
    });

    // 기상청 단기예보 조회서비스 API 호출 (온도 데이터)
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`;
    const params = new URLSearchParams({
      serviceKey: cleanApiKey,
      pageNo: '1',
      numOfRows: '1000',
      dataType: 'XML',
      base_date: baseDate,
      base_time: baseTimeStr,
      nx: x.toString(),
      ny: y.toString()
    });

    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      throw new Error(`기상청 API 호출 실패: ${response.status}`);
    }

    const responseText = await response.text();
    console.log('기상청 API 응답 (처음 1000자):', responseText.substring(0, 1000));
    
    // XML 파싱 (더 정확한 정규식)
    const temperatureMatch = responseText.match(/<category>TMP<\/category>[\s\S]*?<fcstValue>([^<]+)<\/fcstValue>/);
    const humidityMatch = responseText.match(/<category>REH<\/category>[\s\S]*?<fcstValue>([^<]+)<\/fcstValue>/);
    const windSpeedMatch = responseText.match(/<category>WSD<\/category>[\s\S]*?<fcstValue>([^<]+)<\/fcstValue>/);
    
    console.log('파싱 결과:', {
      temperatureMatch: temperatureMatch ? temperatureMatch[1] : '없음',
      humidityMatch: humidityMatch ? humidityMatch[1] : '없음',
      windSpeedMatch: windSpeedMatch ? windSpeedMatch[1] : '없음'
    });
    
    if (!temperatureMatch) {
      throw new Error('기상청 API에서 온도 데이터를 찾을 수 없습니다.');
    }
    
    const temperature = parseFloat(temperatureMatch[1]);
    const humidity = humidityMatch ? parseFloat(humidityMatch[1]) : 60; // 기본값 60%
    const windSpeed = windSpeedMatch ? parseFloat(windSpeedMatch[1]) : 0;
    
    // 개선된 체감온도 계산 (풍속, 습도, 온도 모두 고려)
    const apparentTemperature = calculateApparentTemperature(temperature, humidity, windSpeed);
    
    console.log('기상청 API 데이터:', {
      temperature: `${temperature}°C`,
      humidity: `${humidity}%`,
      windSpeed: `${windSpeed}m/s`
    });
    
    // 개선된 체감온도 계산 결과
    console.log(`기상청 데이터 기반 체감온도: ${apparentTemperature}°C (기본온도: ${temperature}°C, 습도: ${humidity}%, 풍속: ${windSpeed}m/s)`);

    return NextResponse.json({
      apparentTemperature: apparentTemperature,
      weatherData: {
        temperature: temperature,
        humidity: humidity || 60,
        windSpeed: windSpeed || 0
      },
      calculation: {
        method: windSpeed > 1.5 && temperature < 10 ? 'WindChill' : 
                (windSpeed <= 1.5 && temperature >= 26 && humidity >= 40) ? 'HeatIndex' : 'Combined',
        factors: {
          baseTemp: temperature,
          humidityEffect: `${humidity}% (기준: 60%)`,
          windEffect: `${windSpeed}m/s`
        }
      },
      apiInfo: {
        baseDate: baseDate,
        baseTime: baseTimeStr,
        gridCoords: { x, y }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('실제 기상청 API 체감온도 계산 오류:', error);
    
    // 에러 발생 시 현재 계절에 맞는 fallback 값 반환
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12월
    
    // 계절별 기본값 설정
    let fallbackTemp = 25;
    let fallbackHumidity = 60;
    let fallbackWindSpeed = 2;
    
    if (month >= 6 && month <= 8) {
      // 여름 (6-8월)
      fallbackTemp = 32;
      fallbackHumidity = 70;
      fallbackWindSpeed = 1.5;
    } else if (month >= 12 || month <= 2) {
      // 겨울 (12-2월)
      fallbackTemp = 5;
      fallbackHumidity = 50;
      fallbackWindSpeed = 3;
    } else if (month >= 3 && month <= 5) {
      // 봄 (3-5월)
      fallbackTemp = 18;
      fallbackHumidity = 55;
      fallbackWindSpeed = 2.5;
    } else {
      // 가을 (9-11월)
      fallbackTemp = 20;
      fallbackHumidity = 65;
      fallbackWindSpeed = 2;
    }
    
    const fallbackApparentTemp = calculateApparentTemperature(fallbackTemp, fallbackHumidity, fallbackWindSpeed);
    
    return NextResponse.json({
      apparentTemperature: fallbackApparentTemp,
      weatherData: {
        temperature: fallbackTemp,
        humidity: fallbackHumidity,
        windSpeed: fallbackWindSpeed
      },
      calculation: {
        method: 'Fallback',
        factors: {
          season: month >= 6 && month <= 8 ? '여름' : 
                  month >= 12 || month <= 2 ? '겨울' :
                  month >= 3 && month <= 5 ? '봄' : '가을',
          note: '기상청 API 오류로 계절별 기본값 사용'
        }
      },
      error: '기상청 API 호출 실패, 계절별 기본값 사용',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 