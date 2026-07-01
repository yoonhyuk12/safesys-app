// 측정시각 직전 정각의 기상청 초단기실황(관측값)으로 체감온도를 산출하는 API 라우트
import { NextRequest, NextResponse } from 'next/server';
import { getKmaHubKey } from '@/lib/kma-auth';

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

// 초단기실황(getUltraSrtNcst) 응답에서 category별 관측값(obsrValue)을 추출
function parseObservation(xml: string): Record<string, number> {
  const out: Record<string, number> = {};
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const category = block.match(/<category>([^<]+)<\/category>/)?.[1];
    const obsrValue = block.match(/<obsrValue>([^<]+)<\/obsrValue>/)?.[1];
    if (!category || obsrValue == null) continue;
    const v = parseFloat(obsrValue);
    if (!Number.isNaN(v)) out[category] = v;
  }
  return out;
}

// 측정시각 기준 후보 발표시각(base_date/base_time) 목록을 최신순으로 생성
// 초단기실황은 매 정각 관측이며 정각 직후엔 아직 미제공일 수 있으므로,
// 가장 최근 정각부터 직전 정각으로 폴백할 수 있게 여러 후보를 반환한다.
// 예: 06:18 -> [0600, 0500], 06:03 -> [0600, 0500](0600 미제공 시 0500 사용)
function getNcstBaseCandidates(at: Date, count = 2): { baseDate: string; baseTime: string }[] {
  const candidates: { baseDate: string; baseTime: string }[] = [];
  const d = new Date(at.getTime());
  d.setMinutes(0, 0, 0); // 측정시각이 속한 정각으로 내림
  for (let i = 0; i < count; i++) {
    const baseDate =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const baseTime = `${String(d.getHours()).padStart(2, '0')}00`;
    candidates.push({ baseDate, baseTime });
    d.setHours(d.getHours() - 1); // 직전 정각으로
  }
  return candidates;
}

// 기상청 게이트웨이가 순간 호출 폭주 시 429를 반환하는 경우가 있어 짧은 대기 후 1회 재시도
async function fetchWithRetry(url: string, retries = 1, delayMs = 700): Promise<Response> {
  let response = await fetch(url);
  for (let attempt = 0; attempt < retries && response.status === 429; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    response = await fetch(url);
  }
  return response;
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

    // 기상청 API 허브(apihub.kma.go.kr) 인증키 — lib/kma-auth.ts에서 공통 관리
    const hubKey = getKmaHubKey();
    // data.go.kr 공유 폴백 키 (허브 키 미적용/실패 시 백업)
    const dataGoKrFallbackKey = "ptN2Cl7gvmcWwHRgvN4UI4PF5sHIu6M1VuiDP9yvRJwRKBg8GCsFFTDtVBFtNzFQHlUWD7G4rSOtV3hTg3ny8w==";

    // 좌표를 격자 좌표로 변환
    const { x, y } = convertToGridCoords(lat, lng);

    // 측정시각(있으면) 기준, 없으면 현재 시각 기준으로 직전 정각 실황 발표시각 계산
    let measuredAt: Date;
    if (targetDateParam && targetTimeParam) {
      const ds = String(targetDateParam);
      const ts = String(targetTimeParam).padStart(4, '0');
      measuredAt = new Date(
        Number(ds.slice(0, 4)),
        Number(ds.slice(4, 6)) - 1,
        Number(ds.slice(6, 8)),
        Number(ts.slice(0, 2)),
        Number(ts.slice(2, 4))
      );
    } else {
      measuredAt = new Date();
    }
    // 측정시각이 속한 정각부터 직전 정각까지 후보를 만들어, 미제공 시 폴백
    const baseCandidates = getNcstBaseCandidates(measuredAt, 2);

    console.log('기상청 초단기실황 호출 정보:', {
      측정시각: `${measuredAt.getHours()}시 ${measuredAt.getMinutes()}분`,
      후보기준시각: baseCandidates.map(c => `${c.baseDate} ${c.baseTime}`),
      격자좌표: { x, y }
    });

    // 주어진 발표시각에 대해 호출 대상 목록을 구성
    // 우선순위: ① 사용자 허브 키(apihub) → ② data.go.kr 공유 폴백 키
    // 두 엔드포인트 모두 동일한 초단기실황(obsrValue XML) 형식을 반환한다.
    const buildProviders = (baseDate: string, baseTime: string): { name: string; url: string }[] => {
      const common: Record<string, string> = {
        pageNo: '1',
        numOfRows: '100',
        dataType: 'XML',
        base_date: baseDate,
        base_time: baseTime,
        nx: x.toString(),
        ny: y.toString()
      };
      const list: { name: string; url: string }[] = [];
      if (hubKey) {
        const p = new URLSearchParams({ ...common, authKey: hubKey });
        list.push({
          name: 'apihub',
          url: `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst?${p}`
        });
      }
      const p2 = new URLSearchParams({ ...common, serviceKey: dataGoKrFallbackKey });
      list.push({
        name: 'data.go.kr',
        url: `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?${p2}`
      });
      return list;
    };

    let obs: Record<string, number> | null = null;
    let usedProvider = '';
    let baseDate = '';
    let baseTime = '';
    let lastStatus = 0;
    // 최신 정각부터 시도하고, 관측값이 없으면(아직 미제공) 직전 정각으로 폴백
    for (const cand of baseCandidates) {
      for (const provider of buildProviders(cand.baseDate, cand.baseTime)) {
        const res = await fetchWithRetry(provider.url);
        lastStatus = res.status;
        if (!res.ok) {
          console.warn(`기상청(${provider.name}) base=${cand.baseTime} 응답 비정상: HTTP ${res.status}`);
          continue;
        }
        const text = await res.text();
        const parsed = parseObservation(text);
        if (parsed.T1H != null && !Number.isNaN(parsed.T1H)) {
          obs = parsed;
          usedProvider = provider.name;
          baseDate = cand.baseDate;
          baseTime = cand.baseTime;
          console.log(`기상청 관측값 획득 (provider=${provider.name}, base=${cand.baseDate} ${cand.baseTime})`);
          break;
        }
        console.warn(`기상청(${provider.name}) base=${cand.baseTime} 응답에 관측값(T1H) 없음`);
      }
      if (obs) break;
    }

    // 가짜 값을 채우지 않고 명확한 오류를 반환해 직접 입력을 유도
    if (!obs) {
      const msg = lastStatus === 429
        ? '기상청 호출량 한도가 일시적으로 초과되었습니다. 잠시 후 다시 시도하거나 체감온도를 직접 입력해 주세요.'
        : '기상청 관측값을 가져오지 못했습니다. 잠시 후 다시 시도하거나 체감온도를 직접 입력해 주세요.';
      return NextResponse.json({ error: msg, rateLimited: lastStatus === 429 }, { status: 200 });
    }

    const temperature = obs.T1H; // 기온(°C)
    const humidity = obs.REH ?? 60; // 상대습도(%), 없으면 기본값 60
    const windSpeed = obs.WSD ?? 0; // 풍속(m/s), 없으면 0

    const apparentTemperature = calculateApparentTemperature(temperature, humidity, windSpeed);

    console.log('기상청 초단기실황 기반 체감온도:', {
      체감온도: `${apparentTemperature}°C`,
      기온: `${temperature}°C`,
      습도: `${humidity}%`,
      풍속: `${windSpeed}m/s`,
      기준시각: `${baseDate} ${baseTime}`
    });

    return NextResponse.json({
      apparentTemperature,
      weatherData: {
        temperature,
        humidity,
        windSpeed
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
        baseDate,
        baseTime,
        gridCoords: { x, y },
        matchedDateTime: `${baseDate}${baseTime}`,
        provider: usedProvider
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('기상청 초단기실황 체감온도 계산 오류:', error);
    // 안전점검 기록에 가짜 온도가 들어가지 않도록, 실패 시에는 추정값을 채우지 않고 오류만 반환
    return NextResponse.json({
      error: '기상청 체감온도 조회 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 200 });
  }
}
