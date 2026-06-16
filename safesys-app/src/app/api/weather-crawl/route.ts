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

// 기상청 공식 체감온도 산출
// - 여름철: 2022.6.2 개정 산출식 (습구온도 Tw는 Stull 추정식)
// - 겨울철(저온·바람): 풍속냉각 체감온도(겨울철 체감온도)
function calculateApparentTemperature(temperature: number, humidity: number, windSpeed: number): number {
  const Ta = temperature; // 기온(°C)
  const RH = humidity;    // 상대습도(%)
  const V = windSpeed;    // 풍속(m/s)

  // 겨울철 체감온도: 기온 10℃ 이하 + 풍속 1.3m/s(=4.8km/h) 초과
  if (Ta <= 10 && V > 1.3) {
    const Vk = V * 3.6; // m/s → km/h
    const wct = 13.12 + 0.6215 * Ta - 11.37 * Math.pow(Vk, 0.16) + 0.3965 * Ta * Math.pow(Vk, 0.16);
    return Math.round(wct * 10) / 10;
  }

  // 여름철 체감온도 (기상청 2022.6.2 개정 산출식)
  // 1) 습구온도 Tw — Stull(2011) 추정식, atan은 라디안
  const Tw =
    Ta * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
    Math.atan(Ta + RH) -
    Math.atan(RH - 1.676331) +
    0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
    4.686035;

  // 2) 체감온도
  const at =
    -0.2442 +
    0.55399 * Tw +
    0.45535 * Ta -
    0.0022 * Tw * Tw +
    0.00278 * Tw * Ta +
    3.0;

  return Math.round(at * 10) / 10;
}

// 측정 시각과 가장 가까운 예보 시간대의 기온/습도/풍속을 선택
function pickNearestForecast(xml: string, targetDate: string, targetTime: string) {
  const byTime = new Map<string, { TMP?: number; REH?: number; WSD?: number }>();
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const category = block.match(/<category>([^<]+)<\/category>/)?.[1];
    const fcstDate = block.match(/<fcstDate>([^<]+)<\/fcstDate>/)?.[1];
    const fcstTime = block.match(/<fcstTime>([^<]+)<\/fcstTime>/)?.[1];
    const fcstValue = block.match(/<fcstValue>([^<]+)<\/fcstValue>/)?.[1];
    if (!category || !fcstDate || !fcstTime || fcstValue == null) continue;
    if (category !== 'TMP' && category !== 'REH' && category !== 'WSD') continue;
    const key = `${fcstDate}${fcstTime}`;
    const rec = byTime.get(key) || {};
    rec[category as 'TMP' | 'REH' | 'WSD'] = parseFloat(fcstValue);
    byTime.set(key, rec);
  }

  // 타임존 영향 없이 비교하기 위해 양쪽 모두 Date.UTC로 환산 (오프셋이 상쇄됨)
  const toMs = (yyyymmdd: string, hhmm: string) =>
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8)),
      Number(hhmm.slice(0, 2)),
      Number(hhmm.slice(2, 4))
    );

  const targetMs = toMs(targetDate, targetTime.padStart(4, '0'));
  let best: { key: string; rec: { TMP?: number; REH?: number; WSD?: number } } | null = null;
  let bestDiff = Infinity;
  for (const [key, rec] of byTime) {
    if (rec.TMP == null) continue;
    const diff = Math.abs(toMs(key.slice(0, 8), key.slice(8, 12)) - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { key, rec };
    }
  }
  if (!best) return null;
  return {
    temperature: best.rec.TMP as number,
    humidity: best.rec.REH,
    windSpeed: best.rec.WSD,
    fcstDateTime: best.key
  };
}

export async function POST(request: NextRequest) {
  try {
    const { lat, lng, targetDate: targetDateParam, targetTime: targetTimeParam } = await request.json();

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

    let temperature: number;
    let humidity: number;
    let windSpeed: number;
    let matchedDateTime: string | null = null;

    if (targetDateParam && targetTimeParam) {
      // 측정 시각과 가장 가까운 예보 시간대의 값 선택
      const picked = pickNearestForecast(responseText, targetDateParam, targetTimeParam);
      if (!picked) {
        throw new Error('기상청 API에서 온도 데이터를 찾을 수 없습니다.');
      }
      temperature = picked.temperature;
      humidity = picked.humidity ?? 60; // 기본값 60%
      windSpeed = picked.windSpeed ?? 0;
      matchedDateTime = picked.fcstDateTime;
      console.log('가까운 예보 시간대 선택:', { targetDateParam, targetTimeParam, matchedDateTime });
    } else {
      // 기존 동작: 응답의 첫 예보값 사용 (시각 미지정 호출 하위호환)
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

      temperature = parseFloat(temperatureMatch[1]);
      humidity = humidityMatch ? parseFloat(humidityMatch[1]) : 60; // 기본값 60%
      windSpeed = windSpeedMatch ? parseFloat(windSpeedMatch[1]) : 0;
    }
    
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
        method: temperature <= 10 && windSpeed > 1.3
          ? '기상청 겨울철 체감온도(풍속냉각)'
          : '기상청 여름철 체감온도(2022.6.2 개정 산출식)',
        factors: {
          baseTemp: temperature,
          humidity: `${humidity}%`,
          windSpeed: `${windSpeed}m/s`
        }
      },
      apiInfo: {
        baseDate: baseDate,
        baseTime: baseTimeStr,
        gridCoords: { x, y },
        matchedDateTime: matchedDateTime
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