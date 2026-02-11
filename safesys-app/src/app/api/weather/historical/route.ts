import { NextResponse } from "next/server";

type WeatherResult = {
  date: string;
  stnId: string;
  stnName: string;
  sky: "맑음" | "구름많음" | "흐림" | "자료부족";
  tempAvgC: number | null;
  rainSumMm: number | null;
  cloudAvg: number | null;
  summary: string;
};

// 주요 ASOS 관측소 이름 매핑
const STATION_NAMES: Record<string, string> = {
  '90': '속초', '93': '북춘천', '95': '철원', '98': '동두천', '99': '파주',
  '100': '대관령', '101': '춘천', '102': '백령도', '104': '북강릉', '105': '강릉',
  '106': '동해', '108': '서울', '112': '인천', '114': '원주', '115': '울릉도',
  '119': '수원', '121': '영월', '127': '충주', '129': '서산', '130': '울진',
  '131': '청주', '133': '대전', '135': '추풍령', '136': '안동', '137': '상주',
  '138': '포항', '140': '군산', '143': '대구', '146': '전주', '152': '울산',
  '155': '창원', '156': '광주', '159': '부산', '162': '통영', '165': '목포',
  '168': '여수', '170': '완도', '172': '흑산도', '174': '진주', '177': '거제',
  '184': '제주', '185': '고산', '188': '성산', '189': '서귀포', '192': '진도',
  '201': '강화', '202': '양평', '203': '이천', '211': '인제', '212': '홍천',
  '216': '태백', '217': '정선군', '221': '제천', '226': '보은', '232': '천안',
  '235': '보령', '236': '부여', '238': '금산', '239': '부안', '243': '임실',
  '244': '정읍', '245': '남원', '247': '장수', '248': '고창군', '251': '영광군',
  '252': '김해시', '253': '순창군', '254': '북창원', '255': '양산시', '257': '보성군',
  '258': '강진군', '259': '장흥', '260': '해남', '261': '고흥', '262': '의령군',
  '263': '함양군', '264': '광양시', '266': '진안', '268': '거창', '271': '합천',
  '272': '밀양', '273': '산청', '276': '국풍령', '277': '남해', '278': '함평',
  '279': '순천', '281': '북광주', '288': '구미', '289': '영천',
};

// 기상청 API 키
const AUTH_KEY = "_mpe0uWTQuKqXtLlk_LinA";

// 주요 ASOS 관측소 좌표 (하드코딩 - API 호출 없이 바로 사용)
const ASOS_STATIONS: { stnId: string; name: string; lat: number; lon: number }[] = [
  { stnId: '90', name: '속초', lat: 38.2509, lon: 128.5647 },
  { stnId: '93', name: '북춘천', lat: 37.9374, lon: 127.7360 },
  { stnId: '95', name: '철원', lat: 38.1479, lon: 127.3042 },
  { stnId: '98', name: '동두천', lat: 37.9019, lon: 127.0617 },
  { stnId: '99', name: '파주', lat: 37.8857, lon: 126.7673 },
  { stnId: '100', name: '대관령', lat: 37.6771, lon: 128.7183 },
  { stnId: '101', name: '춘천', lat: 37.9026, lon: 127.7357 },
  { stnId: '102', name: '백령도', lat: 37.9667, lon: 124.6300 },
  { stnId: '104', name: '북강릉', lat: 37.8044, lon: 128.8554 },
  { stnId: '105', name: '강릉', lat: 37.7514, lon: 128.8910 },
  { stnId: '106', name: '동해', lat: 37.5071, lon: 129.1242 },
  { stnId: '108', name: '서울', lat: 37.5714, lon: 126.9658 },
  { stnId: '112', name: '인천', lat: 37.4776, lon: 126.6249 },
  { stnId: '114', name: '원주', lat: 37.3375, lon: 127.9464 },
  { stnId: '115', name: '울릉도', lat: 37.4808, lon: 130.8989 },
  { stnId: '119', name: '수원', lat: 37.2700, lon: 126.9875 },
  { stnId: '121', name: '영월', lat: 37.1833, lon: 128.4578 },
  { stnId: '127', name: '충주', lat: 36.9703, lon: 127.9522 },
  { stnId: '129', name: '서산', lat: 36.7767, lon: 126.4939 },
  { stnId: '130', name: '울진', lat: 36.9928, lon: 129.4133 },
  { stnId: '131', name: '청주', lat: 36.6392, lon: 127.4411 },
  { stnId: '133', name: '대전', lat: 36.3722, lon: 127.3722 },
  { stnId: '135', name: '추풍령', lat: 36.2194, lon: 127.9964 },
  { stnId: '136', name: '안동', lat: 36.5728, lon: 128.7078 },
  { stnId: '137', name: '상주', lat: 36.4119, lon: 128.1592 },
  { stnId: '138', name: '포항', lat: 36.0325, lon: 129.3794 },
  { stnId: '140', name: '군산', lat: 35.9919, lon: 126.7117 },
  { stnId: '143', name: '대구', lat: 35.8853, lon: 128.6189 },
  { stnId: '146', name: '전주', lat: 35.8214, lon: 127.1547 },
  { stnId: '152', name: '울산', lat: 35.5597, lon: 129.3200 },
  { stnId: '155', name: '창원', lat: 35.1700, lon: 128.5728 },
  { stnId: '156', name: '광주', lat: 35.1728, lon: 126.8914 },
  { stnId: '159', name: '부산', lat: 35.1047, lon: 129.0319 },
  { stnId: '162', name: '통영', lat: 34.8456, lon: 128.4353 },
  { stnId: '165', name: '목포', lat: 34.8167, lon: 126.3814 },
  { stnId: '168', name: '여수', lat: 34.7392, lon: 127.7406 },
  { stnId: '170', name: '완도', lat: 34.3961, lon: 126.7022 },
  { stnId: '172', name: '흑산도', lat: 34.6869, lon: 125.4514 },
  { stnId: '174', name: '진주', lat: 35.1631, lon: 128.0403 },
  { stnId: '177', name: '거제', lat: 34.8881, lon: 128.6044 },
  { stnId: '184', name: '제주', lat: 33.5142, lon: 126.5297 },
  { stnId: '185', name: '고산', lat: 33.2939, lon: 126.1628 },
  { stnId: '188', name: '성산', lat: 33.3869, lon: 126.8800 },
  { stnId: '189', name: '서귀포', lat: 33.2461, lon: 126.5653 },
  { stnId: '192', name: '진도', lat: 34.4728, lon: 126.3219 },
  { stnId: '201', name: '강화', lat: 37.7075, lon: 126.4469 },
  { stnId: '202', name: '양평', lat: 37.4886, lon: 127.4944 },
  { stnId: '203', name: '이천', lat: 37.2644, lon: 127.4842 },
  { stnId: '211', name: '인제', lat: 38.0600, lon: 128.1703 },
  { stnId: '212', name: '홍천', lat: 37.6836, lon: 127.8803 },
  { stnId: '216', name: '태백', lat: 37.1714, lon: 128.9886 },
  { stnId: '217', name: '정선군', lat: 37.3808, lon: 128.6608 },
  { stnId: '221', name: '제천', lat: 37.1592, lon: 128.1942 },
  { stnId: '226', name: '보은', lat: 36.4878, lon: 127.7344 },
  { stnId: '232', name: '천안', lat: 36.7639, lon: 127.1222 },
  { stnId: '235', name: '보령', lat: 36.3275, lon: 126.5575 },
  { stnId: '236', name: '부여', lat: 36.2722, lon: 126.9208 },
  { stnId: '238', name: '금산', lat: 36.1058, lon: 127.4822 },
  { stnId: '243', name: '임실', lat: 35.6122, lon: 127.2858 },
  { stnId: '244', name: '정읍', lat: 35.5631, lon: 126.8658 },
  { stnId: '245', name: '남원', lat: 35.4075, lon: 127.3328 },
  { stnId: '247', name: '장수', lat: 35.6478, lon: 127.5203 },
  { stnId: '261', name: '고흥', lat: 34.6181, lon: 127.2758 },
  { stnId: '262', name: '의령군', lat: 35.3222, lon: 128.2631 },
  { stnId: '263', name: '함양군', lat: 35.5203, lon: 127.7253 },
  { stnId: '264', name: '광양시', lat: 34.9406, lon: 127.7011 },
  { stnId: '266', name: '진안', lat: 35.7917, lon: 127.4244 },
  { stnId: '268', name: '거창', lat: 35.6700, lon: 127.9106 },
  { stnId: '271', name: '합천', lat: 35.5644, lon: 128.1656 },
  { stnId: '272', name: '밀양', lat: 35.4914, lon: 128.7439 },
  { stnId: '273', name: '산청', lat: 35.4131, lon: 127.8786 },
  { stnId: '277', name: '남해', lat: 34.8164, lon: 127.9261 },
  { stnId: '279', name: '순천', lat: 34.9511, lon: 127.4875 },
  { stnId: '288', name: '구미', lat: 36.1306, lon: 128.3203 },
  { stnId: '289', name: '영천', lat: 35.9772, lon: 128.9514 },
];

// 하버사인 거리 계산 (km)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 숫자 파싱 (결측값 처리)
function parseNumber(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "-" || t === "-99" || t === "-99.0") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > -90 ? n : null;
}

// 운량으로 날씨 판단 (0~10 스케일)
function skyFromCloud(cloudAvg: number | null): WeatherResult["sky"] {
  if (cloudAvg === null) return "자료부족";
  if (cloudAvg <= 2) return "맑음";
  if (cloudAvg <= 7) return "구름많음";
  return "흐림";
}

// fetch with timeout
async function fetchTextOnce(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`KMA API 오류: ${res.status}`);
    return res.text();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`KMA API 타임아웃 (${timeoutMs}ms)`);
    throw err;
  }
}

async function fetchText(url: string, timeoutMs: number = 15000, maxRetries: number = 3): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchTextOnce(url, timeoutMs);
    } catch (err: any) {
      lastError = err;
      console.warn(`KMA API 시도 ${attempt + 1}/${maxRetries} 실패: ${err.message}`);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError!;
}

// 글로벌 캐시
declare global {
  var stnIdByCoordCache: Map<string, { stnId: string; stnName: string }> | undefined;
  var weatherDataCache: Map<string, { data: WeatherResult; timestamp: number }> | undefined;
}

// 하드코딩된 관측소 목록에서 가장 가까운 관측소 찾기 (API 호출 없음!)
function getNearestStation(lat: number, lon: number): { stnId: string; stnName: string } {
  if (!global.stnIdByCoordCache) {
    global.stnIdByCoordCache = new Map();
  }

  const cacheKey = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = global.stnIdByCoordCache.get(cacheKey);
  if (cached) return cached;

  let best: { stnId: string; stnName: string; dist: number } | null = null;

  for (const s of ASOS_STATIONS) {
    const dist = haversineKm(lat, lon, s.lat, s.lon);
    if (!best || dist < best.dist) {
      best = { stnId: s.stnId, stnName: s.name, dist };
    }
  }

  if (!best) throw new Error("관측소를 찾을 수 없습니다");

  const result = { stnId: best.stnId, stnName: best.stnName };
  global.stnIdByCoordCache.set(cacheKey, result);
  return result;
}

// 일자료 파싱 (kma_sfcdd3.php 응답)
function parseDailyData(text: string): Map<string, { taAvg: number | null; caTot: number | null; rnDay: number | null }> {
  const result = new Map<string, { taAvg: number | null; caTot: number | null; rnDay: number | null }>();
  const lines = text.split("\n").map(l => l.trim());

  // kma_sfcdd3.php 고정 컬럼 인덱스 (헤더 형식이 2줄이라 이름으로 찾을 수 없음)
  // 컬럼: 0=날짜, 1=관측소, 10=TA_AVG, 31=CA_TOT, 38=RN_DAY
  const COL_DATE = 0;
  const COL_TA_AVG = 10;   // 일 평균기온(℃)
  const COL_CA_TOT = 31;   // 전운량(1/10)
  const COL_RN_DAY = 38;   // 일 강수량(mm)

  for (const line of lines) {
    // 데이터 라인: YYYYMMDD로 시작
    if (!/^\d{8}/.test(line)) continue;
    const parts = line.split(/\s+/);
    const tm = parts[COL_DATE];
    if (!tm || tm.length !== 8) continue;

    result.set(tm, {
      taAvg: parseNumber(parts[COL_TA_AVG]),
      caTot: parseNumber(parts[COL_CA_TOT]),
      rnDay: parseNumber(parts[COL_RN_DAY]),
    });
  }

  return result;
}

// 단일 날짜 조회 API (기존 호환)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || "").trim(); // YYYYMMDD
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!/^\d{8}$/.test(date) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Invalid params. Use ?date=YYYYMMDD&lat=..&lon=.." }, { status: 400 });
  }

  // 캐시 초기화
  const CACHE_TTL = 24 * 3600 * 1000; // 24시간
  if (!global.weatherDataCache) {
    global.weatherDataCache = new Map();
  }

  // 캐시 확인
  const cacheKey = `${date}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = global.weatherDataCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return NextResponse.json(cached.data);
  }

  try {
    // 1. 가장 가까운 관측소 찾기 (하드코딩 목록 사용 - API 호출 없음)
    const station = getNearestStation(lat, lon);

    // 2. 일자료 API 호출 (단일 날짜)
    const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php?tm1=${date}&tm2=${date}&stn=${station.stnId}&help=0&mode=0&authKey=${encodeURIComponent(AUTH_KEY)}`;
    const text = await fetchText(url);
    const dataMap = parseDailyData(text);
    const dayData = dataMap.get(date);

    // 3. 결과 생성
    const tempAvg = dayData?.taAvg ?? null;
    const cloudAvg = dayData?.caTot ?? null;
    const rainSum = dayData?.rnDay ?? null;

    const sky = skyFromCloud(cloudAvg);
    const tempRounded = tempAvg !== null ? Math.round(tempAvg) : null;
    const rainRounded = rainSum !== null && rainSum >= 0 ? Math.round(rainSum) : 0;

    const result: WeatherResult = {
      date,
      stnId: station.stnId,
      stnName: station.stnName,
      sky,
      tempAvgC: tempRounded,
      rainSumMm: rainRounded,
      cloudAvg,
      summary: tempRounded !== null
        ? `${sky}\n(${tempRounded}℃, ${rainRounded}mm)`
        : "자료부족\n(-℃, -mm)",
    };

    // 캐시 저장
    global.weatherDataCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return NextResponse.json(result);

  } catch (e: any) {
    console.error("날씨 API 오류:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
