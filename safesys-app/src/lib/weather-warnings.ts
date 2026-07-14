// 기상특보 API와 지도 레이어가 공유하는 타입, 파서, 표시 규칙을 제공한다.

export type WeatherWarningLevel = '주의보' | '경보'

export interface WeatherWarning {
  type: string
  level: WeatherWarningLevel
  command: string
  announcedAt: string | null
  effectiveAt: string | null
  endsAt: string | null
}

export interface WeatherWarningStyle {
  fillColor: string
  strokeColor: string
  fillOpacity: number
}

export interface WeatherWarningPolygonGeometry {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface WeatherWarningMultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

export type WeatherWarningGeometry =
  | WeatherWarningPolygonGeometry
  | WeatherWarningMultiPolygonGeometry

export interface WeatherWarningRegion {
  regionId: string
  regionName: string
  parentRegionName: string
  warnings: WeatherWarning[]
  geometry: WeatherWarningGeometry
  center: { lat: number; lng: number }
  approximate: boolean
  style: WeatherWarningStyle
}

export interface WeatherWarningsResponse {
  regions: WeatherWarningRegion[]
  updatedAt: string
  totals: {
    sourceRows: number
    landRows: number
    activeRegions: number
    renderedRegions: number
    skippedRegions: number
  }
}

export interface WeatherWarningWithStyle extends WeatherWarning {
  style: WeatherWarningStyle
}

export interface WeatherWarningLocationResponse {
  regionNames: string[]
  warnings: WeatherWarningWithStyle[]
  updatedAt: string
  approximate: boolean
}

export interface ParsedWeatherWarningRegion {
  regionId: string
  regionName: string
  parentRegionName: string
  warnings: WeatherWarning[]
}

export interface ParsedWeatherWarnings {
  regions: ParsedWeatherWarningRegion[]
  sourceRows: number
  landRows: number
}

const WARNING_COLORS: Record<string, { fill: string; stroke: string }> = {
  태풍: { fill: '#8B5CF6', stroke: '#5B21B6' },
  호우: { fill: '#3B82F6', stroke: '#1D4ED8' },
  폭염: { fill: '#EF4444', stroke: '#B91C1C' },
  열대야: { fill: '#F97316', stroke: '#C2410C' },
  대설: { fill: '#38BDF8', stroke: '#0369A1' },
  한파: { fill: '#2563EB', stroke: '#1E40AF' },
  강풍: { fill: '#14B8A6', stroke: '#0F766E' },
  건조: { fill: '#F59E0B', stroke: '#B45309' },
  풍랑: { fill: '#0EA5E9', stroke: '#075985' },
}

const WARNING_TYPE_PRIORITY = ['태풍', '호우', '폭염', '열대야', '대설', '한파', '강풍', '건조', '풍랑']

function toKoreaIsoTimestamp(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 12) return null
  const second = digits.length >= 14 ? digits.slice(12, 14) : '00'
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${second}+09:00`
}

function warningLevel(value: string): WeatherWarningLevel {
  return value.includes('경보') ? '경보' : '주의보'
}

function warningSortValue(warning: WeatherWarning): number {
  const level = warning.level === '경보' ? 100 : 0
  const typeIndex = WARNING_TYPE_PRIORITY.indexOf(warning.type)
  return level + (typeIndex === -1 ? 0 : WARNING_TYPE_PRIORITY.length - typeIndex)
}

function sortWarnings(warnings: WeatherWarning[]): WeatherWarning[] {
  return [...warnings].sort((a, b) => warningSortValue(b) - warningSortValue(a))
}

/** 기상청의 쉼표 구분 현재 특보 응답을 육상·발효 중 지역 단위로 병합한다. */
export function parseKmaWarningRows(text: string): ParsedWeatherWarnings {
  const regions = new Map<string, ParsedWeatherWarningRegion>()
  let sourceRows = 0
  let landRows = 0

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const fields = line.split(',').map((field) => field.trim())
    if (fields.length < 10) continue
    sourceRows += 1

    const [parentRegionId, parentRegionName, regionId, regionName, announcedAt, effectiveAt, type, level, command, endsAt] = fields
    if (!regionId?.startsWith('L')) continue
    landRows += 1
    if (!regionName || !type || command.includes('해제')) continue

    const warning: WeatherWarning = {
      type,
      level: warningLevel(level),
      command,
      announcedAt: toKoreaIsoTimestamp(announcedAt),
      effectiveAt: toKoreaIsoTimestamp(effectiveAt),
      endsAt: (toKoreaIsoTimestamp(endsAt) ?? endsAt) || null,
    }

    const current = regions.get(regionId) ?? {
      regionId,
      regionName,
      parentRegionName: parentRegionName || parentRegionId,
      warnings: [],
    }
    const sameTypeIndex = current.warnings.findIndex((item) => item.type === warning.type)
    if (sameTypeIndex === -1) {
      current.warnings.push(warning)
    } else if ((warning.announcedAt ?? '') >= (current.warnings[sameTypeIndex].announcedAt ?? '')) {
      current.warnings[sameTypeIndex] = warning
    }
    current.warnings = sortWarnings(current.warnings)
    regions.set(regionId, current)
  }

  return { regions: Array.from(regions.values()), sourceRows, landRows }
}

/** 행정구역명 비교를 위해 공백, 괄호 문구, 광역·기초단체 접미사를 제거한다. */
export function normalizeWeatherRegionName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .replace(/(특별자치도|특별자치시|특별시|광역시|자치도|도|시|군|구)$/g, '')
    .trim()
}

/** 산지·평지·방향권처럼 별도 행정경계가 없는 특보 세분 명칭을 상위 지역명으로 줄인다. */
export function removeWeatherSubdivision(value: string): string {
  let result = value.replace(/\([^)]*\)/g, '').split('/')[0].replace(/\s+/g, '')
  let previous = ''
  while (result !== previous) {
    previous = result
    result = result.replace(/(중북부|동북부|서북부|동남부|서남부|중남부|북부|남부|동부|서부|중부|산지|평지|도서)$/g, '')
  }
  return normalizeWeatherRegionName(result)
}

export function mergeWeatherWarnings(groups: WeatherWarning[][]): WeatherWarning[] {
  const merged = new Map<string, WeatherWarning>()
  for (const warning of groups.flat()) {
    const current = merged.get(warning.type)
    const isHigherLevel = warning.level === '경보' && current?.level !== '경보'
    const isSameLevelAndNewer = warning.level === current?.level
      && (warning.announcedAt ?? '') >= (current.announcedAt ?? '')
    if (!current || isHigherLevel || isSameLevelAndNewer) {
      merged.set(warning.type, warning)
    }
  }
  return sortWarnings(Array.from(merged.values()))
}

export function getWeatherWarningStyle(warnings: WeatherWarning[]): WeatherWarningStyle {
  const primary = sortWarnings(warnings)[0]
  const colors = WARNING_COLORS[primary?.type] ?? { fill: '#64748B', stroke: '#334155' }
  return {
    fillColor: colors.fill,
    strokeColor: colors.stroke,
    fillOpacity: primary?.level === '경보' ? 0.46 : 0.3,
  }
}

export function getWeatherWarningLabel(regionName: string, warnings: WeatherWarning[]): string {
  const shortName = normalizeWeatherRegionName(regionName) || regionName
  const types = Array.from(new Set(sortWarnings(warnings).map((warning) => warning.type)))
  return `${shortName} ${types.join('·')}`.trim()
}

export function formatWeatherWarningTime(value: string | null): string {
  if (!value) return '-'
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  return match ? `${match[1]}.${match[2]} ${match[3]}:${match[4]}` : value
}
