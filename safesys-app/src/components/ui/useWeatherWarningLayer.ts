'use client'
// 카카오 지도에서 기상특보 폴리곤과 대화형 지역 라벨의 생명주기를 관리한다.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatWeatherWarningTime,
  getWeatherWarningLabel,
  getWeatherWarningStyle,
  type WeatherWarningRegion,
  type WeatherWarningsResponse,
} from '@/lib/weather-warnings'

export interface WeatherWarningTypeOption {
  type: string
  regionCount: number
  color: string
}

interface WeatherWarningLayerState {
  count: number
  totalCount: number
  types: WeatherWarningTypeOption[]
  loading: boolean
  error: string | null
}

function isWarningsResponse(value: unknown): value is WeatherWarningsResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { regions?: unknown; updatedAt?: unknown; totals?: unknown }
  return Array.isArray(candidate.regions) && typeof candidate.updatedAt === 'string' && !!candidate.totals
}

function createDetailLine(label: string, value: string | null): HTMLSpanElement {
  const span = document.createElement('span')
  span.textContent = `${label} ${formatWeatherWarningTime(value)}`
  return span
}

function createWarningLabel(region: WeatherWarningRegion): HTMLDivElement {
  const container = document.createElement('div')
  container.setAttribute('role', 'button')
  container.setAttribute('tabindex', '0')
  container.setAttribute('aria-label', `${getWeatherWarningLabel(region.regionName, region.warnings)} 상세보기`)
  Object.assign(container.style, {
    position: 'relative',
    color: '#FFFFFF',
    background: region.style.strokeColor,
    border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: '6px',
    boxShadow: '0 2px 7px rgba(15,23,42,0.35)',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    pointerEvents: 'auto',
    whiteSpace: 'nowrap',
  })

  const title = document.createElement('div')
  title.textContent = getWeatherWarningLabel(region.regionName, region.warnings)
  Object.assign(title.style, {
    padding: '4px 7px',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1.2',
  })
  container.appendChild(title)

  const details = document.createElement('div')
  Object.assign(details.style, {
    display: 'none',
    position: 'absolute',
    left: '50%',
    bottom: 'calc(100% + 6px)',
    transform: 'translateX(-50%)',
    minWidth: '210px',
    maxWidth: '280px',
    padding: '8px 10px',
    color: '#F8FAFC',
    background: '#0F172A',
    borderRadius: '8px',
    boxShadow: '0 5px 16px rgba(15,23,42,0.45)',
    whiteSpace: 'normal',
    fontSize: '11px',
    lineHeight: '1.45',
  })

  for (const warning of region.warnings) {
    const item = document.createElement('div')
    item.style.padding = '3px 0'
    const heading = document.createElement('div')
    heading.textContent = `${warning.type} ${warning.level}${warning.command ? ` · ${warning.command}` : ''}`
    heading.style.fontWeight = '700'
    item.appendChild(heading)

    const times = document.createElement('div')
    Object.assign(times.style, { display: 'flex', flexWrap: 'wrap', gap: '0 7px', color: '#CBD5E1' })
    times.append(
      createDetailLine('발표', warning.announcedAt),
      createDetailLine('발효', warning.effectiveAt),
      createDetailLine('해제예고', warning.endsAt),
    )
    item.appendChild(times)
    details.appendChild(item)
  }
  if (region.approximate) {
    const note = document.createElement('div')
    note.textContent = '세분 특보구역을 상위 행정구역 경계로 표시했습니다.'
    Object.assign(note.style, { marginTop: '4px', color: '#FDE68A', fontSize: '10px' })
    details.appendChild(note)
  }
  container.appendChild(details)

  let pinned = false
  const show = () => { details.style.display = 'block' }
  const hide = () => { if (!pinned) details.style.display = 'none' }
  const toggle = () => {
    pinned = !pinned
    details.style.display = pinned ? 'block' : 'none'
  }
  container.addEventListener('mouseenter', show)
  container.addEventListener('mouseleave', hide)
  container.addEventListener('focus', show)
  container.addEventListener('blur', hide)
  container.addEventListener('click', (event) => {
    event.stopPropagation()
    toggle()
  })
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  })
  return container
}

function regionPolygons(region: WeatherWarningRegion): number[][][][] {
  return region.geometry.type === 'Polygon'
    ? [region.geometry.coordinates]
    : region.geometry.coordinates
}

export function useWeatherWarningLayer(
  map: any,
  enabled: boolean,
  selectedTypes: string[] | null = null,
): WeatherWarningLayerState {
  const [data, setData] = useState<WeatherWarningsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<WeatherWarningsResponse | null>(null)

  useEffect(() => {
    if (!map) {
      setLoading(false)
      return
    }

    let disposed = false
    let controller: AbortController | null = null
    const load = async () => {
      controller?.abort()
      controller = new AbortController()
      if (!dataRef.current) setLoading(true)
      try {
        const response = await fetch('/api/weather/warnings', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        const result: unknown = await response.json()
        if (!response.ok) {
          const message = result && typeof result === 'object' && 'error' in result
            ? String((result as { error: unknown }).error)
            : '기상특보를 불러오지 못했습니다.'
          throw new Error(message)
        }
        if (!isWarningsResponse(result)) {
          throw new Error('기상특보 응답 형식이 올바르지 않습니다.')
        }
        if (!disposed) {
          dataRef.current = result
          setData(result)
          setError(null)
        }
      } catch (loadError) {
        if (!disposed && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError(loadError instanceof Error ? loadError.message : '기상특보를 불러오지 못했습니다.')
        }
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void load()
    const refreshTimer = window.setInterval(load, 300_000)
    return () => {
      disposed = true
      controller?.abort()
      window.clearInterval(refreshTimer)
    }
  }, [map])

  const types = useMemo<WeatherWarningTypeOption[]>(() => {
    if (!data) return []
    const warningsByType = new Map<string, { regionIds: Set<string>; warnings: WeatherWarningRegion['warnings'] }>()

    for (const region of data.regions) {
      for (const warning of region.warnings) {
        const current = warningsByType.get(warning.type) ?? { regionIds: new Set<string>(), warnings: [] }
        current.regionIds.add(region.regionId)
        current.warnings.push(warning)
        warningsByType.set(warning.type, current)
      }
    }

    return Array.from(warningsByType, ([type, value]) => ({
      type,
      regionCount: value.regionIds.size,
      color: getWeatherWarningStyle(value.warnings).fillColor,
    }))
  }, [data])

  const visibleRegions = useMemo<WeatherWarningRegion[]>(() => {
    if (!data) return []
    if (selectedTypes === null) return data.regions
    const selected = new Set(selectedTypes)

    return data.regions.flatMap((region) => {
      const warnings = region.warnings.filter((warning) => selected.has(warning.type))
      return warnings.length > 0
        ? [{ ...region, warnings, style: getWeatherWarningStyle(warnings) }]
        : []
    })
  }, [data, selectedTypes])

  useEffect(() => {
    if (!map || !enabled || visibleRegions.length === 0 || typeof window.kakao === 'undefined') return
    const kakao = (window as any).kakao
    const polygons: any[] = []
    const labels: any[] = []

    for (const region of visibleRegions) {
      for (const polygonCoordinates of regionPolygons(region)) {
        const paths = polygonCoordinates.map((ring) =>
          ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))
        )
        if (paths.length === 0 || paths[0].length < 3) continue
        const polygon = new kakao.maps.Polygon({
          path: paths.length === 1 ? paths[0] : paths,
          strokeWeight: 1,
          strokeColor: region.style.strokeColor,
          strokeOpacity: 0.65,
          strokeStyle: 'solid',
          fillColor: region.style.fillColor,
          fillOpacity: Math.min(region.style.fillOpacity, 0.16),
        })
        polygon.setMap(map)
        if (typeof polygon.setZIndex === 'function') polygon.setZIndex(-10)
        polygons.push(polygon)
      }

      const label = new kakao.maps.CustomOverlay({
        content: createWarningLabel(region),
        position: new kakao.maps.LatLng(region.center.lat, region.center.lng),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: -1,
      })
      label.setMap(map)
      labels.push(label)
    }

    const updateLabelVisibility = () => {
      const labelMap = map.getLevel() <= 8 ? map : null
      labels.forEach((label) => label.setMap(labelMap))
    }
    updateLabelVisibility()
    kakao.maps.event.addListener(map, 'zoom_changed', updateLabelVisibility)

    return () => {
      if (typeof kakao.maps.event.removeListener === 'function') {
        kakao.maps.event.removeListener(map, 'zoom_changed', updateLabelVisibility)
      }
      polygons.forEach((polygon) => polygon.setMap(null))
      labels.forEach((label) => label.setMap(null))
    }
  }, [map, enabled, visibleRegions])

  return {
    count: visibleRegions.length,
    totalCount: data?.regions.length ?? 0,
    types,
    loading,
    error,
  }
}
