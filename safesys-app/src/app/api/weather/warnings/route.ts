// 기상청 현재 특보와 공개 행정경계를 결합해 지도 GeoJSON 또는 위치별 경량 응답을 반환한다.
import { NextRequest, NextResponse } from 'next/server'
import { getKmaHubKey } from '@/lib/kma-auth'
import {
  getWeatherWarningStyle,
  mergeWeatherWarnings,
  normalizeWeatherRegionName,
  parseKmaWarningRows,
  removeWeatherSubdivision,
  type ParsedWeatherWarningRegion,
  type WeatherWarningGeometry,
  type WeatherWarningLocationResponse,
  type WeatherWarningRegion,
} from '@/lib/weather-warnings'

export const runtime = 'nodejs'

const KMA_WARNING_URL = 'https://apihub.kma.go.kr/api/typ01/url/wrn_now_data_new.php'
const ARCGIS_LAYERS = {
  sgg: 'https://portal.esrikr.com/arcgis/rest/services/Hosted/SGG_view/FeatureServer/0',
  sido: 'https://portal.esrikr.com/arcgis/rest/services/Hosted/SIDO_view/FeatureServer/0',
} as const

type BoundaryLayer = keyof typeof ARCGIS_LAYERS

interface BoundaryFeature {
  layer: BoundaryLayer
  objectId: number
  name: string
  parentName: string
  normalizedName: string
  normalizedBaseName: string
}

interface ArcGisAttributeResponse {
  features?: Array<{ attributes?: Record<string, unknown> }>
  error?: { message?: string }
}

interface GeoJsonFeatureCollection {
  type?: string
  features?: Array<{
    properties?: Record<string, unknown>
    geometry?: WeatherWarningGeometry | null
  }>
  error?: { message?: string }
}

interface BoundaryMatch {
  layer: BoundaryLayer
  boundaries: BoundaryFeature[]
  displayName: string
  approximate: boolean
}

interface BoundaryWarningGroup {
  layer: BoundaryLayer
  boundaries: BoundaryFeature[]
  regionIds: Set<string>
  parentNames: Set<string>
  warningGroups: ParsedWeatherWarningRegion['warnings'][]
  displayName: string
  approximate: boolean
}

interface LocationBoundaryMatch {
  sgg: BoundaryFeature | null
  sido: BoundaryFeature | null
  source: 'address' | 'coordinates'
}

function buildArcGisQueryUrl(layer: BoundaryLayer, params: Record<string, string>): string {
  const url = new URL(`${ARCGIS_LAYERS[layer]}/query`)
  url.search = new URLSearchParams(params).toString()
  return url.toString()
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 86_400 } })
  if (!response.ok) {
    throw new Error(`${label} 서비스 응답 오류 (${response.status})`)
  }
  const data = await response.json() as T & { error?: { message?: string } }
  if (data.error) {
    throw new Error(`${label} 서비스가 요청을 처리하지 못했습니다.`)
  }
  return data
}

function stringProperty(properties: Record<string, unknown>, name: string): string {
  const entry = Object.entries(properties).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return typeof entry?.[1] === 'string' || typeof entry?.[1] === 'number' ? String(entry[1]) : ''
}

function cityBaseName(name: string): string {
  const compact = name.replace(/\s+/g, '').replace(/\([^)]*\)/g, '')
  const cityDistrict = compact.match(/^(.+?시).+구$/)
  return normalizeWeatherRegionName(cityDistrict?.[1] ?? compact)
}

async function fetchBoundaryAttributes(layer: BoundaryLayer): Promise<BoundaryFeature[]> {
  const outFields = layer === 'sgg'
    ? 'objectid,sig_cd,sig_kor_nm,ctprvn_cd,ctp_kor_nm'
    : 'objectid,ctprvn_cd,ctp_kor_nm'
  const url = buildArcGisQueryUrl(layer, {
    where: '1=1',
    outFields,
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  })
  const data = await fetchJson<ArcGisAttributeResponse>(url, `ArcGIS ${layer.toUpperCase()} 경계`)
  if (!Array.isArray(data.features)) {
    throw new Error(`ArcGIS ${layer.toUpperCase()} 경계 속성 형식이 올바르지 않습니다.`)
  }

  return data.features.flatMap((feature) => {
    const attributes = feature.attributes
    if (!attributes) return []
    const objectId = Number(stringProperty(attributes, 'objectid'))
    const name = stringProperty(attributes, layer === 'sgg' ? 'sig_kor_nm' : 'ctp_kor_nm')
    const parentName = layer === 'sgg' ? stringProperty(attributes, 'ctp_kor_nm') : name
    if (!Number.isInteger(objectId) || !name) return []
    return [{
      layer,
      objectId,
      name,
      parentName,
      normalizedName: normalizeWeatherRegionName(name),
      normalizedBaseName: cityBaseName(name),
    }]
  })
}

function addressCompact(value: string): string {
  return value.replace(/\([^)]*\)/g, '').replace(/\s+/g, '')
}

function findAddressBoundary(
  address: string,
  sggBoundaries: BoundaryFeature[],
  sidoBoundaries: BoundaryFeature[],
): LocationBoundaryMatch | null {
  const compact = addressCompact(address)
  if (!compact) return null

  const sidoMatches = sidoBoundaries.filter((boundary) => compact.includes(addressCompact(boundary.name)))
  const sido = sidoMatches.length === 1 ? sidoMatches[0] : null
  const sggMatches = sggBoundaries
    .filter((boundary) => compact.includes(addressCompact(boundary.name)))
    .filter((boundary) => !sido || sameProvince(boundary.parentName, sido.name))
    .sort((left, right) => addressCompact(right.name).length - addressCompact(left.name).length)

  if (sggMatches.length > 0) {
    const longestLength = addressCompact(sggMatches[0].name).length
    const longestMatches = sggMatches.filter((boundary) => addressCompact(boundary.name).length === longestLength)
    if (longestMatches.length === 1) {
      const sgg = longestMatches[0]
      const parentSido = sido ?? sidoBoundaries.find((boundary) => sameProvince(boundary.name, sgg.parentName)) ?? null
      return { sgg, sido: parentSido, source: 'address' }
    }
  }

  return sido ? { sgg: null, sido, source: 'address' } : null
}

async function fetchBoundaryAtPoint(
  layer: BoundaryLayer,
  latitude: number,
  longitude: number,
): Promise<BoundaryFeature | null> {
  const outFields = layer === 'sgg'
    ? 'objectid,sig_cd,sig_kor_nm,ctprvn_cd,ctp_kor_nm'
    : 'objectid,ctprvn_cd,ctp_kor_nm'
  const url = buildArcGisQueryUrl(layer, {
    geometry: `${longitude},${latitude}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'false',
    f: 'json',
  })
  const data = await fetchJson<ArcGisAttributeResponse>(url, `ArcGIS ${layer.toUpperCase()} 위치`)
  const attributes = data.features?.[0]?.attributes
  if (!attributes) return null

  const objectId = Number(stringProperty(attributes, 'objectid'))
  const name = stringProperty(attributes, layer === 'sgg' ? 'sig_kor_nm' : 'ctp_kor_nm')
  const parentName = layer === 'sgg' ? stringProperty(attributes, 'ctp_kor_nm') : name
  if (!Number.isInteger(objectId) || !name) return null
  return {
    layer,
    objectId,
    name,
    parentName,
    normalizedName: normalizeWeatherRegionName(name),
    normalizedBaseName: cityBaseName(name),
  }
}

async function findLocationBoundary(
  address: string,
  latitude: number | null,
  longitude: number | null,
  sggBoundaries: BoundaryFeature[],
  sidoBoundaries: BoundaryFeature[],
): Promise<LocationBoundaryMatch | null> {
  const addressMatch = findAddressBoundary(address, sggBoundaries, sidoBoundaries)
  if (addressMatch?.sgg) return addressMatch
  if (latitude !== null && longitude !== null) {
    const [sgg, sido] = await Promise.all([
      fetchBoundaryAtPoint('sgg', latitude, longitude),
      fetchBoundaryAtPoint('sido', latitude, longitude),
    ])
    if (sgg || sido) return { sgg, sido, source: 'coordinates' }
  }
  return addressMatch
}

function provinceGroup(name: string): string {
  const normalized = normalizeWeatherRegionName(name)
  const aliases: Record<string, string> = {
    전라북: '전북',
    전북: '전북',
    충청북: '충북',
    충북: '충북',
    충청남: '충남',
    충남: '충남',
    경상북: '경북',
    경북: '경북',
    경상남: '경남',
    경남: '경남',
    전라남: '전남',
    전남: '전남',
    광주: '광주',
  }
  return aliases[normalized] ?? normalized
}

function sameProvince(left: string, right: string): boolean {
  if (!left || !right) return false
  const leftGroup = provinceGroup(left)
  const rightGroup = provinceGroup(right)
  const combinedGroups = new Set(['전남광주', '전남광주통합'])
  if (combinedGroups.has(leftGroup)) return rightGroup === '전남' || rightGroup === '광주'
  if (combinedGroups.has(rightGroup)) return leftGroup === '전남' || leftGroup === '광주'
  return leftGroup === rightGroup
}

function findSggBoundaries(
  sggBoundaries: BoundaryFeature[],
  candidateName: string,
  provinceName: string | null,
): BoundaryFeature[] {
  const normalizedCandidate = normalizeWeatherRegionName(candidateName)
  if (!normalizedCandidate) return []
  const nameMatches = sggBoundaries.filter((boundary) =>
    boundary.normalizedName === normalizedCandidate || boundary.normalizedBaseName === normalizedCandidate
  )
  if (!provinceName) return nameMatches
  const provinceMatches = nameMatches.filter((boundary) => sameProvince(boundary.parentName, provinceName))
  return provinceMatches.length > 0 ? provinceMatches : nameMatches
}

function hasApproximateDescriptor(name: string): boolean {
  return /\(|산지|평지|도서|중북부|동북부|서북부|동남부|서남부|중남부|북부|남부|동부|서부|중부/.test(name)
}

function matchBoundary(
  region: ParsedWeatherWarningRegion,
  sggBoundaries: BoundaryFeature[],
  sidoBoundaries: BoundaryFeature[],
): BoundaryMatch | null {
  const regionName = normalizeWeatherRegionName(region.regionName)
  const parentName = normalizeWeatherRegionName(region.parentRegionName)
  const parentSidoMatches = sidoBoundaries.filter((boundary) => sameProvince(boundary.name, parentName))
  const parentSido = parentSidoMatches.length === 1 ? parentSidoMatches[0] : undefined
  const regionSidoMatches = sidoBoundaries.filter((boundary) => sameProvince(boundary.name, regionName))
  const regionSido = regionSidoMatches.length === 1 ? regionSidoMatches[0] : undefined
  const parentIsProvince = parentSidoMatches.length > 0

  if (regionSido && (!region.parentRegionName || parentIsProvince && sameProvince(regionName, parentName))) {
    return {
      layer: 'sido',
      boundaries: [regionSido],
      displayName: region.regionName,
      approximate: hasApproximateDescriptor(region.regionName),
    }
  }

  const provinceName = parentIsProvince ? region.parentRegionName : null
  const exact = findSggBoundaries(sggBoundaries, region.regionName, provinceName)
  if (exact.length > 0) {
    return {
      layer: 'sgg',
      boundaries: exact,
      displayName: region.regionName,
      approximate: hasApproximateDescriptor(region.regionName),
    }
  }

  const reducedRegion = removeWeatherSubdivision(region.regionName)
  if (reducedRegion && reducedRegion !== regionName) {
    const reduced = findSggBoundaries(sggBoundaries, reducedRegion, provinceName)
    if (reduced.length > 0) {
      return { layer: 'sgg', boundaries: reduced, displayName: reduced[0].normalizedBaseName, approximate: true }
    }
  }

  if (!parentIsProvince) {
    const parent = findSggBoundaries(sggBoundaries, region.parentRegionName, null)
    if (parent.length > 0) {
      return { layer: 'sgg', boundaries: parent, displayName: parent[0].normalizedBaseName, approximate: true }
    }
    const reducedParent = removeWeatherSubdivision(region.parentRegionName)
    const parentFallback = findSggBoundaries(sggBoundaries, reducedParent, null)
    if (parentFallback.length > 0) {
      return { layer: 'sgg', boundaries: parentFallback, displayName: parentFallback[0].normalizedBaseName, approximate: true }
    }
  }

  if (regionSido) {
    return { layer: 'sido', boundaries: [regionSido], displayName: regionSido.normalizedName, approximate: true }
  }
  if (parentSido) {
    return { layer: 'sido', boundaries: [parentSido], displayName: parentSido.normalizedName, approximate: true }
  }
  return null
}

function groupMatches(
  regions: ParsedWeatherWarningRegion[],
  sggBoundaries: BoundaryFeature[],
  sidoBoundaries: BoundaryFeature[],
): { groups: BoundaryWarningGroup[]; skippedRegions: number } {
  const groups = new Map<string, BoundaryWarningGroup>()
  let skippedRegions = 0

  for (const region of regions) {
    const match = matchBoundary(region, sggBoundaries, sidoBoundaries)
    if (!match) {
      skippedRegions += 1
      continue
    }
    const boundaries = [...match.boundaries].sort((a, b) => a.objectId - b.objectId)
    const key = `${match.layer}:${boundaries.map((boundary) => boundary.objectId).join(',')}`
    const group = groups.get(key) ?? {
      layer: match.layer,
      boundaries,
      regionIds: new Set<string>(),
      parentNames: new Set<string>(),
      warningGroups: [],
      displayName: match.displayName,
      approximate: false,
    }
    group.regionIds.add(region.regionId)
    group.parentNames.add(region.parentRegionName)
    group.warningGroups.push(region.warnings)
    group.approximate ||= match.approximate
    groups.set(key, group)
  }

  return { groups: Array.from(groups.values()), skippedRegions }
}

function isWeatherGeometry(value: unknown): value is WeatherWarningGeometry {
  if (!value || typeof value !== 'object') return false
  const geometry = value as { type?: unknown; coordinates?: unknown }
  return (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') && Array.isArray(geometry.coordinates)
}

async function fetchBoundaryGeometries(
  layer: BoundaryLayer,
  objectIds: number[],
): Promise<Map<number, WeatherWarningGeometry>> {
  if (objectIds.length === 0) return new Map()
  const url = buildArcGisQueryUrl(layer, {
    objectIds: Array.from(new Set(objectIds)).join(','),
    outFields: 'objectid',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5',
    maxAllowableOffset: '0.002',
    f: 'geojson',
  })
  const data = await fetchJson<GeoJsonFeatureCollection>(url, `ArcGIS ${layer.toUpperCase()} 형상`)
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error(`ArcGIS ${layer.toUpperCase()} 형상 응답이 올바르지 않습니다.`)
  }
  const geometries = new Map<number, WeatherWarningGeometry>()
  for (const feature of data.features) {
    const objectId = Number(stringProperty(feature.properties ?? {}, 'objectid'))
    if (Number.isInteger(objectId) && isWeatherGeometry(feature.geometry)) {
      geometries.set(objectId, feature.geometry)
    }
  }
  return geometries
}

function combineGeometries(geometries: WeatherWarningGeometry[]): WeatherWarningGeometry | null {
  const polygons = geometries.flatMap((geometry) =>
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  )
  if (polygons.length === 0) return null
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons }
}

function geometryCenter(geometry: WeatherWarningGeometry): { lat: number; lng: number } {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let bestRing: number[][] = []
  let bestArea = -1
  for (const polygon of polygons) {
    const ring = polygon[0] ?? []
    let area = 0
    for (let index = 0; index < ring.length - 1; index += 1) {
      area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
    }
    if (Math.abs(area) > bestArea) {
      bestArea = Math.abs(area)
      bestRing = ring
    }
  }

  let twiceArea = 0
  let longitude = 0
  let latitude = 0
  for (let index = 0; index < bestRing.length - 1; index += 1) {
    const point = bestRing[index]
    const next = bestRing[index + 1]
    const cross = point[0] * next[1] - next[0] * point[1]
    twiceArea += cross
    longitude += (point[0] + next[0]) * cross
    latitude += (point[1] + next[1]) * cross
  }
  if (Math.abs(twiceArea) > 1e-10) {
    return { lng: longitude / (3 * twiceArea), lat: latitude / (3 * twiceArea) }
  }
  const points = bestRing.length > 0 ? bestRing : polygons.flat(2) as number[][]
  const lngs = points.map((point) => point[0]).filter(Number.isFinite)
  const lats = points.map((point) => point[1]).filter(Number.isFinite)
  return {
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
  }
}

async function fetchKmaWarnings(): Promise<ReturnType<typeof parseKmaWarningRows>> {
  const url = new URL(KMA_WARNING_URL)
  url.search = new URLSearchParams({
    fe: 'e',
    tm: '',
    disp: '1',
    help: '0',
    authKey: getKmaHubKey(),
  }).toString()
  const response = await fetch(url, { next: { revalidate: 300 } })
  if (!response.ok) {
    throw new Error(`기상청 특보 서비스 응답 오류 (${response.status})`)
  }
  const bytes = await response.arrayBuffer()
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  let text = new TextDecoder(contentType.includes('euc-kr') ? 'euc-kr' : 'utf-8').decode(bytes)
  if (text.includes('\uFFFD')) {
    text = new TextDecoder('euc-kr').decode(bytes)
  }
  const parsed = parseKmaWarningRows(text)
  if (parsed.sourceRows === 0) {
    throw new Error('기상청 특보 응답에 유효한 데이터가 없습니다.')
  }
  return parsed
}

function locationCoordinate(searchParams: URLSearchParams, name: 'lat' | 'lng'): number | null {
  const value = searchParams.get(name)
  if (!value?.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (name === 'lat' && (parsed < 32 || parsed > 40)) return null
  if (name === 'lng' && (parsed < 123 || parsed > 133)) return null
  return parsed
}

async function buildLocationResponse(
  parsed: ReturnType<typeof parseKmaWarningRows>,
  sggBoundaries: BoundaryFeature[],
  sidoBoundaries: BoundaryFeature[],
  address: string,
  latitude: number | null,
  longitude: number | null,
): Promise<WeatherWarningLocationResponse> {
  const location = await findLocationBoundary(address, latitude, longitude, sggBoundaries, sidoBoundaries)
  if (!location) {
    return { regionNames: [], warnings: [], updatedAt: new Date().toISOString(), approximate: true }
  }

  const matched = groupMatches(parsed.regions, sggBoundaries, sidoBoundaries)
  const locationGroups = matched.groups.filter((group) => {
    const target = group.layer === 'sgg' ? location.sgg : location.sido
    return target !== null && group.boundaries.some((boundary) => boundary.objectId === target.objectId)
  })
  const warnings = mergeWeatherWarnings(locationGroups.map((group) => mergeWeatherWarnings(group.warningGroups)))

  return {
    regionNames: Array.from(new Set(locationGroups.map((group) => group.displayName))).sort((a, b) => a.localeCompare(b, 'ko')),
    warnings: warnings.map((warning) => ({ ...warning, style: getWeatherWarningStyle([warning]) })),
    updatedAt: new Date().toISOString(),
    approximate: locationGroups.some((group) => group.approximate),
  }
}

export async function GET(request: NextRequest) {
  try {
    const locationScope = request.nextUrl.searchParams.get('scope') === 'location'
    const address = request.nextUrl.searchParams.get('address')?.trim().slice(0, 250) ?? ''
    const latitude = locationCoordinate(request.nextUrl.searchParams, 'lat')
    const longitude = locationCoordinate(request.nextUrl.searchParams, 'lng')
    if (locationScope && !address && (latitude === null || longitude === null)) {
      return NextResponse.json(
        { error: '위치 특보 조회에는 주소 또는 좌표가 필요합니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const [parsed, sggBoundaries, sidoBoundaries] = await Promise.all([
      fetchKmaWarnings(),
      fetchBoundaryAttributes('sgg'),
      fetchBoundaryAttributes('sido'),
    ])
    if (locationScope) {
      const response = await buildLocationResponse(parsed, sggBoundaries, sidoBoundaries, address, latitude, longitude)
      return NextResponse.json(response, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
      })
    }

    const matched = groupMatches(parsed.regions, sggBoundaries, sidoBoundaries)
    const sggIds = matched.groups.filter((group) => group.layer === 'sgg').flatMap((group) => group.boundaries.map((item) => item.objectId))
    const sidoIds = matched.groups.filter((group) => group.layer === 'sido').flatMap((group) => group.boundaries.map((item) => item.objectId))
    const [sggGeometries, sidoGeometries] = await Promise.all([
      fetchBoundaryGeometries('sgg', sggIds),
      fetchBoundaryGeometries('sido', sidoIds),
    ])

    let skippedRegions = matched.skippedRegions
    const regions: WeatherWarningRegion[] = []
    for (const group of matched.groups) {
      const geometryMap = group.layer === 'sgg' ? sggGeometries : sidoGeometries
      const geometry = combineGeometries(group.boundaries.flatMap((boundary) => {
        const item = geometryMap.get(boundary.objectId)
        return item ? [item] : []
      }))
      if (!geometry) {
        skippedRegions += group.regionIds.size
        continue
      }
      const warnings = mergeWeatherWarnings(group.warningGroups)
      regions.push({
        regionId: Array.from(group.regionIds).sort().join('|'),
        regionName: group.displayName,
        parentRegionName: Array.from(group.parentNames)[0] ?? '',
        warnings,
        geometry,
        center: geometryCenter(geometry),
        approximate: group.approximate,
        style: getWeatherWarningStyle(warnings),
      })
    }

    regions.sort((a, b) => a.regionName.localeCompare(b.regionName, 'ko'))
    return NextResponse.json({
      regions,
      updatedAt: new Date().toISOString(),
      totals: {
        sourceRows: parsed.sourceRows,
        landRows: parsed.landRows,
        activeRegions: parsed.regions.length,
        renderedRegions: regions.length,
        skippedRegions,
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('기상특보 지도 API 조회 실패:', error instanceof Error ? error.message : '알 수 없는 오류')
    return NextResponse.json(
      { error: '기상특보 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
