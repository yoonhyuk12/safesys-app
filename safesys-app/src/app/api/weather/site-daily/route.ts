// 공사감독일지용 최근접 AWS·ASOS 일별 기상정보를 병합해 제공하는 API 라우트
import { NextResponse } from "next/server";
import { getKmaHubKey } from "@/lib/kma-auth";
import {
  ASOS_STATIONS,
  findNearestStation,
  isAsosStation,
  toStationMeta,
  type StationMeta,
  type WeatherStation,
} from "@/lib/weather/station-utils";

export const maxDuration = 60;

type WeatherSky = "맑음" | "구름많음" | "흐림" | "자료부족";

type SiteDailyWeather = {
  date: string;
  sky: WeatherSky;
  tempAvgC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainSumMm: number | null;
  cloudAvg: number | null;
  source: "AWS" | "ASOS" | null;
  summary: string;
};

type SiteDailyResponse = {
  tempStation: StationMeta | null;
  cloudStation: StationMeta;
  stnName: string;
  data: SiteDailyWeather[];
};

type AsosDailyParsed = {
  taAvg: number | null;
  taMax: number | null;
  taMin: number | null;
  caTot: number | null;
  rnDay: number | null;
};

type AwsDailyParsed = {
  tempAvgC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainSumMm: number | null;
};

const STATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATION_CACHE_KEY = "integrated-v1";
const PAST_WEATHER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_WEATHER_CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_TEMPERATURE_SAMPLES = 720;
const AWS_BATCH_SIZE = 3;

declare global {
  var siteDailyStationCache:
    | Map<string, { stations: WeatherStation[]; timestamp: number }>
    | undefined;
  var siteDailyWeatherCache:
    | Map<string, { data: AwsDailyParsed | null; timestamp: number; cachedAtKstDate: string }>
    | undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseAsosNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "-99" || trimmed === "-99.0") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > -90 ? parsed : null;
}

function parseAwsNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > -50 ? parsed : null;
}

function skyFromCloud(cloudAvg: number | null): WeatherSky {
  if (cloudAvg === null) return "자료부족";
  if (cloudAvg <= 2) return "맑음";
  if (cloudAvg <= 7) return "구름많음";
  return "흐림";
}

async function fetchBodyWithTimeout<T>(
  url: string,
  timeoutMs: number,
  readBody: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`KMA API 오류: ${response.status}`);
    }
    return await readBody(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`KMA API 타임아웃 (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(url: string, timeoutMs: number, maxAttempts: number): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchBodyWithTimeout(url, timeoutMs, (response) => response.text());
    } catch (error) {
      lastError = error;
      console.warn(`KMA 텍스트 API 시도 ${attempt}/${maxAttempts} 실패: ${getErrorMessage(error)}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("KMA 텍스트 API 호출 실패");
}

async function fetchBuffer(url: string, timeoutMs: number, maxAttempts: number): Promise<ArrayBuffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchBodyWithTimeout(url, timeoutMs, (response) => response.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.warn(`KMA 지점목록 API 시도 ${attempt}/${maxAttempts} 실패: ${getErrorMessage(error)}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("KMA 지점목록 API 호출 실패");
}

function parseStationList(text: string): WeatherStation[] {
  const lines = text.split(/\r?\n/);
  const headerLine = lines.find((line) => /^#\s*STN_ID\b/i.test(line.trim()));
  const headerColumns = headerLine
    ? headerLine.replace(/^#\s*/, "").trim().split(/\s+/)
    : [];
  const stnIdIndex = Math.max(headerColumns.indexOf("STN_ID"), 0);
  const lonIndex = headerColumns.indexOf("LON") >= 0 ? headerColumns.indexOf("LON") : 1;
  const latIndex = headerColumns.indexOf("LAT") >= 0 ? headerColumns.indexOf("LAT") : 2;
  const nameIndex = headerColumns.indexOf("STN_KO") >= 0 ? headerColumns.indexOf("STN_KO") : 8;
  const stations: WeatherStation[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\d+\s+/.test(trimmed)) continue;

    const columns = trimmed.split(/\s+/);
    const stnId = columns[stnIdIndex];
    const lon = Number(columns[lonIndex]);
    const lat = Number(columns[latIndex]);
    const name = columns[nameIndex];

    if (!/^\d+$/.test(stnId || "") || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    if (lat < 20 || lat > 50 || lon < 110 || lon > 150) continue;

    stations.push({ stnId, name, lat, lon });
  }

  if (stations.length === 0) {
    throw new Error("통합 기상 관측소 목록을 파싱하지 못했습니다");
  }

  return stations;
}

async function loadIntegratedStations(): Promise<WeatherStation[]> {
  if (!global.siteDailyStationCache) {
    global.siteDailyStationCache = new Map();
  }

  const cached = global.siteDailyStationCache.get(STATION_CACHE_KEY);
  if (cached && Date.now() - cached.timestamp < STATION_CACHE_TTL_MS) {
    return cached.stations;
  }

  try {
    const url = `https://apihub.kma.go.kr/api/typ01/url/stn_inf.php?inf=AWS&stn=&help=0&authKey=${encodeURIComponent(getKmaHubKey())}`;
    const buffer = await fetchBuffer(url, 8000, 2);
    const stations = parseStationList(new TextDecoder("euc-kr").decode(buffer));
    global.siteDailyStationCache.set(STATION_CACHE_KEY, { stations, timestamp: Date.now() });
    return stations;
  } catch (error) {
    console.error(`통합 기상 관측소 목록 로드 실패, ASOS 목록으로 폴백: ${getErrorMessage(error)}`);
    const stations = ASOS_STATIONS.map((station) => ({ ...station }));
    global.siteDailyStationCache.set(STATION_CACHE_KEY, { stations, timestamp: Date.now() });
    return stations;
  }
}

function parseAsosDailyData(text: string): Map<string, AsosDailyParsed> {
  const result = new Map<string, AsosDailyParsed>();

  for (const line of text.split(/\r?\n/).map((value) => value.trim())) {
    if (!/^\d{8}/.test(line)) continue;
    const columns = line.split(/\s+/);
    const date = columns[0];
    if (!/^\d{8}$/.test(date || "")) continue;

    result.set(date, {
      taAvg: parseAsosNumber(columns[10]),
      taMax: parseAsosNumber(columns[11]),
      taMin: parseAsosNumber(columns[13]),
      caTot: parseAsosNumber(columns[31]),
      rnDay: parseAsosNumber(columns[38]),
    });
  }

  return result;
}

function normalizeAwsColumnName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findAwsColumnIndexes(lines: string[]): { temp: number; rainDay: number } {
  for (const line of lines) {
    if (!line.trim().startsWith("#")) continue;
    const columns = line.replace(/^\s*#+\s*/, "").trim().split(/\s+/);
    const normalized = columns.map(normalizeAwsColumnName);
    const temp = normalized.indexOf("TA");
    const rainDay = normalized.indexOf("RNDAY");
    if (temp >= 0 && rainDay >= 0) {
      return { temp, rainDay };
    }
  }

  return { temp: 8, rainDay: 13 };
}

function parseAwsDailyData(text: string): AwsDailyParsed | null {
  const lines = text.split(/\r?\n/);
  const { temp: tempIndex, rainDay: rainDayIndex } = findAwsColumnIndexes(lines);
  const temperatures: number[] = [];
  let latestRain: { timestamp: string; value: number } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\d{12}\s+/.test(trimmed)) continue;
    const columns = trimmed.split(/\s+/);
    const timestamp = columns[0];
    const temperature = parseAwsNumber(columns[tempIndex]);
    const rainDay = parseAwsNumber(columns[rainDayIndex]);

    if (temperature !== null) temperatures.push(temperature);
    if (rainDay !== null && rainDay >= 0 && (!latestRain || timestamp > latestRain.timestamp)) {
      latestRain = { timestamp, value: rainDay };
    }
  }

  if (temperatures.length === 0 && latestRain === null) return null;

  const temperaturesAreValid = temperatures.length >= MIN_TEMPERATURE_SAMPLES;
  const tempSum = temperaturesAreValid
    ? temperatures.reduce((sum, temperature) => sum + temperature, 0)
    : 0;

  return {
    tempAvgC: temperaturesAreValid ? tempSum / temperatures.length : null,
    tempMaxC: temperaturesAreValid ? Math.max(...temperatures) : null,
    tempMinC: temperaturesAreValid ? Math.min(...temperatures) : null,
    rainSumMm: latestRain?.value ?? null,
  };
}

function parseUtcDate(date: string): Date {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function listDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = parseUtcDate(start);
  const last = parseUtcDate(end);

  while (current <= last) {
    dates.push(formatUtcDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function splitDateRange(start: string, end: string): { tm1: string; tm2: string }[] {
  const ranges: { tm1: string; tm2: string }[] = [];
  const current = parseUtcDate(start);
  const last = parseUtcDate(end);

  while (current <= last) {
    const rangeStart = formatUtcDate(current);
    const rangeEndDate = new Date(current);
    rangeEndDate.setUTCDate(rangeEndDate.getUTCDate() + 30);
    if (rangeEndDate > last) rangeEndDate.setTime(last.getTime());
    ranges.push({ tm1: rangeStart, tm2: formatUtcDate(rangeEndDate) });
    current.setTime(rangeEndDate.getTime());
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return ranges;
}

async function fetchAsosDailyRange(stnId: string, start: string, end: string): Promise<Map<string, AsosDailyParsed>> {
  const result = new Map<string, AsosDailyParsed>();

  for (const range of splitDateRange(start, end)) {
    const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php?tm1=${range.tm1}&tm2=${range.tm2}&stn=${stnId}&help=0&mode=0&authKey=${encodeURIComponent(getKmaHubKey())}`;
    const text = await fetchText(url, 5000, 2);
    parseAsosDailyData(text).forEach((value, date) => result.set(date, value));
  }

  return result;
}

function getKstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}

function previousUtcDate(date: string): string {
  const parsed = parseUtcDate(date);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return formatUtcDate(parsed);
}

// 당일은 관측 자료가 미확정이라 조회하지 않고 자리표시 값으로 응답한다
function sameDayPlaceholder(date: string): SiteDailyWeather {
  return {
    date,
    sky: "자료부족",
    tempAvgC: null,
    tempMaxC: null,
    tempMinC: null,
    rainSumMm: null,
    cloudAvg: null,
    source: null,
    summary: "당일정보 없음",
  };
}

async function fetchAwsDaily(stnId: string, date: string): Promise<AwsDailyParsed | null> {
  if (!global.siteDailyWeatherCache) {
    global.siteDailyWeatherCache = new Map();
  }

  const cacheKey = `${stnId}_${date}`;
  const cached = global.siteDailyWeatherCache.get(cacheKey);
  const ttl = cached?.cachedAtKstDate === date ? CURRENT_WEATHER_CACHE_TTL_MS : date < getKstToday() ? PAST_WEATHER_CACHE_TTL_MS : CURRENT_WEATHER_CACHE_TTL_MS;
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const url = `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-aws2_min?tm1=${date}0000&tm2=${date}2359&stn=${stnId}&disp=0&help=0&authKey=${encodeURIComponent(getKmaHubKey())}`;
  const text = await fetchText(url, 8000, 2);
  const data = parseAwsDailyData(text);
  global.siteDailyWeatherCache.set(cacheKey, { data, timestamp: Date.now(), cachedAtKstDate: getKstToday() });
  return data;
}

function roundOneDecimal(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function mergeDailyWeather(
  date: string,
  aws: AwsDailyParsed | null,
  asos: AsosDailyParsed | undefined,
): SiteDailyWeather {
  const hasCompleteAwsData =
    aws?.tempAvgC !== null &&
    aws?.tempAvgC !== undefined &&
    aws.tempMaxC !== null &&
    aws.tempMinC !== null &&
    aws.rainSumMm !== null;
  const hasAsosData = Boolean(
    asos &&
      (asos.taAvg !== null || asos.taMax !== null || asos.taMin !== null || asos.rnDay !== null),
  );
  const source: SiteDailyWeather["source"] = hasCompleteAwsData ? "AWS" : hasAsosData ? "ASOS" : null;
  const tempAvg = hasCompleteAwsData ? aws.tempAvgC : (asos?.taAvg ?? null);
  const tempMax = hasCompleteAwsData ? aws.tempMaxC : (asos?.taMax ?? null);
  const tempMin = hasCompleteAwsData ? aws.tempMinC : (asos?.taMin ?? null);
  const rainSum = hasCompleteAwsData ? aws.rainSumMm : (asos?.rnDay ?? null);
  const cloudAvg = asos?.caTot ?? null;
  const sky = skyFromCloud(cloudAvg);
  const tempRounded = tempAvg !== null ? Math.round(tempAvg) : null;
  const rainRounded = rainSum !== null && rainSum >= 0 ? Math.round(rainSum) : 0;

  return {
    date,
    sky,
    tempAvgC: tempRounded,
    tempMaxC: roundOneDecimal(tempMax),
    tempMinC: roundOneDecimal(tempMin),
    rainSumMm: source === null ? null : rainRounded,
    cloudAvg,
    source,
    summary:
      tempRounded !== null
        ? `${sky}\n(${tempRounded}℃, ${rainRounded}mm)`
        : "자료부족\n(-℃, -mm)",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");
  const lat = latParam?.trim() ? Number(latParam) : Number.NaN;
  const lon = lonParam?.trim() ? Number(lonParam) : Number.NaN;
  const start = (searchParams.get("start") || "").trim();
  const end = (searchParams.get("end") || "").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "유효한 lat, lon 파라미터가 필요합니다" }, { status: 400 });
  }
  if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) {
    return NextResponse.json({ error: "start, end 파라미터 필요 (YYYYMMDD)" }, { status: 400 });
  }
  if (start > end) {
    return NextResponse.json({ error: "start는 end보다 작거나 같아야 합니다" }, { status: 400 });
  }

  try {
    const integratedStations = await loadIntegratedStations();
    const nearestTemp = findNearestStation(lat, lon, integratedStations);
    const nearestCloud = findNearestStation(lat, lon, ASOS_STATIONS);
    const tempStation = toStationMeta(
      nearestTemp,
      isAsosStation(nearestTemp.station.stnId) ? "ASOS" : "AWS",
    );
    const cloudStation = toStationMeta(nearestCloud, "ASOS");
    const dates = listDates(start, end);
    // 당일·미래 날짜는 관측 자료가 미확정이라 KMA 조회 대상에서 제외한다
    const kstToday = getKstToday();
    const pastDates = dates.filter((date) => date < kstToday);

    let asosData = new Map<string, AsosDailyParsed>();
    let asosSucceeded = false;
    if (pastDates.length > 0) {
      const asosEnd = end < kstToday ? end : previousUtcDate(kstToday);
      try {
        asosData = await fetchAsosDailyRange(cloudStation.stnId, start, asosEnd);
        asosSucceeded = true;
      } catch (error) {
        console.error(
          `ASOS 일자료 조회 실패 (지점 ${cloudStation.stnId}, ${start}-${asosEnd}): ${getErrorMessage(error)}`,
        );
      }
    }

    const awsData = new Map<string, AwsDailyParsed | null>();
    let awsSucceeded = false;
    for (let index = 0; index < pastDates.length; index += AWS_BATCH_SIZE) {
      const batch = pastDates.slice(index, index + AWS_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (date) => {
          try {
            const data = await fetchAwsDaily(tempStation.stnId, date);
            return { date, data, succeeded: true };
          } catch (error) {
            console.error(
              `AWS 분자료 조회 실패 (지점 ${tempStation.stnId}, ${date}): ${getErrorMessage(error)}`,
            );
            return { date, data: null, succeeded: false };
          }
        }),
      );

      for (const result of batchResults) {
        awsData.set(result.date, result.data);
        awsSucceeded ||= result.succeeded;
      }
    }

    if (pastDates.length > 0 && !asosSucceeded && !awsSucceeded) {
      throw new Error("ASOS 일자료와 AWS 분자료를 모두 조회하지 못했습니다");
    }

    const data = dates.map((date) =>
      date < kstToday
        ? mergeDailyWeather(date, awsData.get(date) ?? null, asosData.get(date))
        : sameDayPlaceholder(date),
    );
    const result: SiteDailyResponse = {
      tempStation,
      cloudStation,
      stnName: tempStation?.stnName ?? cloudStation.stnName,
      data,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error(`현장 일별 기상정보 API 오류: ${getErrorMessage(error)}`);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
