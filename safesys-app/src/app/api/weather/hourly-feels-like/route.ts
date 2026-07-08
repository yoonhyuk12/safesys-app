// 기상청 ASOS 시간자료(kma_sfctm3)로 과거 시간별 관측 체감온도를 산출하는 API 라우트
import { NextRequest, NextResponse } from 'next/server';
import { getKmaHubKey } from '@/lib/kma-auth';

// 주요 ASOS 관측소 좌표 (asos-range 라우트와 동일 데이터 — 기존 파일 리팩터링 없이 이 라우트에도 복사)
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

// 두 좌표 사이 거리(km) — 하버사인 (asos-range 라우트 복사)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 하드코딩 목록에서 가장 가까운 관측소 찾기 (asos-range 라우트의 getNearestStation 로직 복사, 캐시는 생략)
function getNearestStation(lat: number, lon: number): { stnId: string; stnName: string } {
  let best: { stnId: string; stnName: string; dist: number } | null = null;
  for (const s of ASOS_STATIONS) {
    const dist = haversineKm(lat, lon, s.lat, s.lon);
    if (!best || dist < best.dist) {
      best = { stnId: s.stnId, stnName: s.name, dist };
    }
  }
  if (!best) throw new Error('관측소를 찾을 수 없습니다');
  return { stnId: best.stnId, stnName: best.stnName };
}

// 결측값을 null로 처리 (asos-range 복사 + kma_sfctm3의 결측 마커 -9/-9.0 추가, 기온은 영하가 정상이므로 -90 초과만 유효)
function parseNumber(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === '-' || t === '-9' || t === '-9.0' || t === '-99' || t === '-99.0') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > -90 ? n : null;
}

// KMA API 단건 호출 (타임아웃) — asos-range 복사
// 일부 망(사내 프록시·WAF)에서 기본 헤더 없는 요청이 무응답으로 버려지는 사례가 있어 브라우저형 헤더를 붙인다
async function fetchTextOnce(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (SafeSys)', 'Accept': '*/*' }
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`KMA API 오류: ${res.status}`);
    return res.text();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if ((err as { name?: string })?.name === 'AbortError') throw new Error(`KMA API 타임아웃 (${timeoutMs}ms)`);
    throw err;
  }
}

// KMA API 호출 (타임아웃 + 재시도) — 간헐 무응답 대비 재시도 3회·타임아웃 8초
async function fetchText(url: string, timeoutMs: number = 8000, maxRetries: number = 3): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchTextOnce(url, timeoutMs);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`KMA API 시도 ${attempt + 1}/${maxRetries} 실패: ${lastError.message}`);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError!;
}

// 기상청 공식 체감온도 산출 — weather-crawl/route.ts 복사
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

export async function POST(request: NextRequest) {
  try {
    const { lat, lng, date, hours } = await request.json();

    // 유효성 검증 — lat/lng는 유한수, date는 YYYY-MM-DD, hours는 0~23 정수 1~12개
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: '위도와 경도(유한수)가 필요합니다' }, { status: 400 });
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 });
    }
    if (
      !Array.isArray(hours) ||
      hours.length < 1 ||
      hours.length > 12 ||
      !hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    ) {
      return NextResponse.json({ error: 'hours는 0~23 정수 1~12개 배열이어야 합니다' }, { status: 400 });
    }

    const station = getNearestStation(lat, lng);
    const ymd = date.replace(/-/g, '');
    const requestedHours: number[] = hours;
    const minHour = Math.min(...requestedHours);
    const maxHour = Math.max(...requestedHours);
    // tm1=최소 시, tm2=최대 시 — 날짜당 1회 호출로 요청 구간을 한 번에 조회
    const tm1 = `${ymd}${String(minHour).padStart(2, '0')}00`;
    const tm2 = `${ymd}${String(maxHour).padStart(2, '0')}00`;
    const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php?tm1=${tm1}&tm2=${tm2}&stn=${station.stnId}&help=0&authKey=${encodeURIComponent(getKmaHubKey())}`;

    // KMA 호출 실패 시 { error } 를 status 200으로 반환 (weather-crawl 패턴 — 클라이언트가 메시지 표출)
    let text: string;
    try {
      text = await fetchText(url);
    } catch (e: unknown) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : '기상청 관측값을 가져오지 못했습니다.' },
        { status: 200 }
      );
    }

    // 데이터 행 파싱 — 12자리 YYYYMMDDHHMI로 시작, 공백 분리 0-based (WS=3, TA=11, HM=13)
    const hourSet = new Set(requestedHours);
    const byHour = new Map<number, { ta: number | null; hm: number | null; ws: number | null }>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!/^\d{12}\s/.test(line)) continue;
      const parts = line.split(/\s+/);
      const hh = Number(parts[0].slice(8, 10));
      if (!hourSet.has(hh)) continue;
      byHour.set(hh, {
        ws: parseNumber(parts[3]),
        ta: parseNumber(parts[11]),
        hm: parseNumber(parts[13]),
      });
    }

    // 각 요청 시각의 결과 — TA가 null이면 체감온도 null(가짜 값 금지),
    // TA가 있으면 HM 결측 시 60·WS 결측 시 0으로 대체해 계산 (weather-crawl 기본값과 동일)
    const results = requestedHours.map((hour) => {
      const obs = byHour.get(hour);
      const ta = obs?.ta ?? null;
      const hm = obs?.hm ?? null;
      const ws = obs?.ws ?? null;
      const apparentTemperature = ta === null
        ? null
        : calculateApparentTemperature(ta, hm ?? 60, ws ?? 0);
      return {
        hour,
        apparentTemperature,
        temperature: ta,
        humidity: hm,
        windSpeed: ws,
      };
    });

    return NextResponse.json({
      date,
      stnId: station.stnId,
      stnName: station.stnName,
      results,
    });
  } catch (error) {
    console.error('시간별 체감온도 조회 오류:', error);
    return NextResponse.json({
      error: '기상청 시간별 체감온도 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 200 });
  }
}
