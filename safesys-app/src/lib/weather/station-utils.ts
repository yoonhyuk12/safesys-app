// 기상 관측소의 최근접 지점 선택과 직선거리 계산을 제공하는 서버 전용 유틸리티
import "server-only";

export type WeatherStation = {
  stnId: string;
  name: string;
  lat: number;
  lon: number;
};

export type StationNetwork = "AWS" | "ASOS";

export type StationMeta = {
  network: StationNetwork;
  stnId: string;
  stnName: string;
  distanceKm: number;
};

export const ASOS_STATIONS: WeatherStation[] = [
  { stnId: "90", name: "속초", lat: 38.2509, lon: 128.5647 },
  { stnId: "93", name: "북춘천", lat: 37.9374, lon: 127.736 },
  { stnId: "95", name: "철원", lat: 38.1479, lon: 127.3042 },
  { stnId: "98", name: "동두천", lat: 37.9019, lon: 127.0617 },
  { stnId: "99", name: "파주", lat: 37.8857, lon: 126.7673 },
  { stnId: "100", name: "대관령", lat: 37.6771, lon: 128.7183 },
  { stnId: "101", name: "춘천", lat: 37.9026, lon: 127.7357 },
  { stnId: "102", name: "백령도", lat: 37.9667, lon: 124.63 },
  { stnId: "104", name: "북강릉", lat: 37.8044, lon: 128.8554 },
  { stnId: "105", name: "강릉", lat: 37.7514, lon: 128.891 },
  { stnId: "106", name: "동해", lat: 37.5071, lon: 129.1242 },
  { stnId: "108", name: "서울", lat: 37.5714, lon: 126.9658 },
  { stnId: "112", name: "인천", lat: 37.4776, lon: 126.6249 },
  { stnId: "114", name: "원주", lat: 37.3375, lon: 127.9464 },
  { stnId: "115", name: "울릉도", lat: 37.4808, lon: 130.8989 },
  { stnId: "119", name: "수원", lat: 37.27, lon: 126.9875 },
  { stnId: "121", name: "영월", lat: 37.1833, lon: 128.4578 },
  { stnId: "127", name: "충주", lat: 36.9703, lon: 127.9522 },
  { stnId: "129", name: "서산", lat: 36.7767, lon: 126.4939 },
  { stnId: "130", name: "울진", lat: 36.9928, lon: 129.4133 },
  { stnId: "131", name: "청주", lat: 36.6392, lon: 127.4411 },
  { stnId: "133", name: "대전", lat: 36.3722, lon: 127.3722 },
  { stnId: "135", name: "추풍령", lat: 36.2194, lon: 127.9964 },
  { stnId: "136", name: "안동", lat: 36.5728, lon: 128.7078 },
  { stnId: "137", name: "상주", lat: 36.4119, lon: 128.1592 },
  { stnId: "138", name: "포항", lat: 36.0325, lon: 129.3794 },
  { stnId: "140", name: "군산", lat: 35.9919, lon: 126.7117 },
  { stnId: "143", name: "대구", lat: 35.8853, lon: 128.6189 },
  { stnId: "146", name: "전주", lat: 35.8214, lon: 127.1547 },
  { stnId: "152", name: "울산", lat: 35.5597, lon: 129.32 },
  { stnId: "155", name: "창원", lat: 35.17, lon: 128.5728 },
  { stnId: "156", name: "광주", lat: 35.1728, lon: 126.8914 },
  { stnId: "159", name: "부산", lat: 35.1047, lon: 129.0319 },
  { stnId: "162", name: "통영", lat: 34.8456, lon: 128.4353 },
  { stnId: "165", name: "목포", lat: 34.8167, lon: 126.3814 },
  { stnId: "168", name: "여수", lat: 34.7392, lon: 127.7406 },
  { stnId: "170", name: "완도", lat: 34.3961, lon: 126.7022 },
  { stnId: "172", name: "흑산도", lat: 34.6869, lon: 125.4514 },
  { stnId: "174", name: "진주", lat: 35.1631, lon: 128.0403 },
  { stnId: "177", name: "거제", lat: 34.8881, lon: 128.6044 },
  { stnId: "184", name: "제주", lat: 33.5142, lon: 126.5297 },
  { stnId: "185", name: "고산", lat: 33.2939, lon: 126.1628 },
  { stnId: "188", name: "성산", lat: 33.3869, lon: 126.88 },
  { stnId: "189", name: "서귀포", lat: 33.2461, lon: 126.5653 },
  { stnId: "192", name: "진도", lat: 34.4728, lon: 126.3219 },
  { stnId: "201", name: "강화", lat: 37.7075, lon: 126.4469 },
  { stnId: "202", name: "양평", lat: 37.4886, lon: 127.4944 },
  { stnId: "203", name: "이천", lat: 37.2644, lon: 127.4842 },
  { stnId: "211", name: "인제", lat: 38.06, lon: 128.1703 },
  { stnId: "212", name: "홍천", lat: 37.6836, lon: 127.8803 },
  { stnId: "216", name: "태백", lat: 37.1714, lon: 128.9886 },
  { stnId: "217", name: "정선군", lat: 37.3808, lon: 128.6608 },
  { stnId: "221", name: "제천", lat: 37.1592, lon: 128.1942 },
  { stnId: "226", name: "보은", lat: 36.4878, lon: 127.7344 },
  { stnId: "232", name: "천안", lat: 36.7639, lon: 127.1222 },
  { stnId: "235", name: "보령", lat: 36.3275, lon: 126.5575 },
  { stnId: "236", name: "부여", lat: 36.2722, lon: 126.9208 },
  { stnId: "238", name: "금산", lat: 36.1058, lon: 127.4822 },
  { stnId: "243", name: "임실", lat: 35.6122, lon: 127.2858 },
  { stnId: "244", name: "정읍", lat: 35.5631, lon: 126.8658 },
  { stnId: "245", name: "남원", lat: 35.4075, lon: 127.3328 },
  { stnId: "247", name: "장수", lat: 35.6478, lon: 127.5203 },
  { stnId: "261", name: "고흥", lat: 34.6181, lon: 127.2758 },
  { stnId: "262", name: "의령군", lat: 35.3222, lon: 128.2631 },
  { stnId: "263", name: "함양군", lat: 35.5203, lon: 127.7253 },
  { stnId: "264", name: "광양시", lat: 34.9406, lon: 127.7011 },
  { stnId: "266", name: "진안", lat: 35.7917, lon: 127.4244 },
  { stnId: "268", name: "거창", lat: 35.67, lon: 127.9106 },
  { stnId: "271", name: "합천", lat: 35.5644, lon: 128.1656 },
  { stnId: "272", name: "밀양", lat: 35.4914, lon: 128.7439 },
  { stnId: "273", name: "산청", lat: 35.4131, lon: 127.8786 },
  { stnId: "277", name: "남해", lat: 34.8164, lon: 127.9261 },
  { stnId: "279", name: "순천", lat: 34.9511, lon: 127.4875 },
  { stnId: "288", name: "구미", lat: 36.1306, lon: 128.3203 },
  { stnId: "289", name: "영천", lat: 35.9772, lon: 128.9514 },
];

const ASOS_STATION_IDS = new Set(ASOS_STATIONS.map((station) => station.stnId));

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function findNearestStation(
  lat: number,
  lon: number,
  stations: readonly WeatherStation[],
): { station: WeatherStation; distanceKm: number } {
  let nearest: { station: WeatherStation; distanceKm: number } | null = null;

  for (const station of stations) {
    const distanceKm = haversineKm(lat, lon, station.lat, station.lon);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { station, distanceKm };
    }
  }

  if (!nearest) {
    throw new Error("관측소를 찾을 수 없습니다");
  }

  return nearest;
}

export function isAsosStation(stnId: string): boolean {
  return ASOS_STATION_IDS.has(stnId);
}

export function toStationMeta(
  nearest: { station: WeatherStation; distanceKm: number },
  network: StationNetwork,
): StationMeta {
  return {
    network,
    stnId: nearest.station.stnId,
    stnName: nearest.station.name,
    distanceKm: Math.round(nearest.distanceKm * 10) / 10,
  };
}
