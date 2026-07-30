'use client'
// 여러 현장의 주소·좌표를 한 번의 요청으로 조회해 현장 id별 발효 중 기상특보를 반환한다.

import { useEffect, useMemo, useState } from 'react'
import type {
  WeatherWarningBulkResponse,
  WeatherWarningBulkResult,
} from '@/lib/weather-warnings'

export interface WeatherWarningLocationInput {
  id: string
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}

interface BulkRequestLocation {
  id: string
  address: string
  lat?: number
  lng?: number
}

function isBulkResponse(value: unknown): value is WeatherWarningBulkResponse {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as Partial<WeatherWarningBulkResponse>).results)
}

/** 주소도 좌표도 없는 현장은 조회 대상에서 제외한다. */
function toRequestLocation(location: WeatherWarningLocationInput): BulkRequestLocation | null {
  const address = location.address?.trim() ?? ''
  const hasCoordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
  if (!address && !hasCoordinates) return null
  return {
    id: location.id,
    address,
    ...(hasCoordinates ? { lat: location.latitude as number, lng: location.longitude as number } : {}),
  }
}

export default function useWeatherWarningsByLocation(
  locations: WeatherWarningLocationInput[],
): Map<string, WeatherWarningBulkResult> {
  const [results, setResults] = useState<Map<string, WeatherWarningBulkResult>>(new Map())

  // 목록 내용이 같으면 재조회하지 않도록 요청 본문을 문자열로 고정한다.
  const requestBody = useMemo(() => {
    const items = locations.map(toRequestLocation).filter((item): item is BulkRequestLocation => item !== null)
    return items.length > 0 ? JSON.stringify({ locations: items }) : ''
  }, [locations])

  useEffect(() => {
    if (!requestBody) {
      setResults(new Map())
      return
    }

    let cancelled = false
    let controller: AbortController | null = null
    const load = async () => {
      controller?.abort()
      controller = new AbortController()
      try {
        const response = await fetch('/api/weather/warnings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`기상특보 일괄 조회 오류 (${response.status})`)
        const data: unknown = await response.json()
        if (cancelled) return
        if (!isBulkResponse(data)) {
          setResults(new Map())
          return
        }
        setResults(new Map(data.results.map((result) => [result.id, result])))
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setResults(new Map())
        }
      }
    }

    void load()
    const interval = window.setInterval(load, 300_000)
    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(interval)
    }
  }, [requestBody])

  return results
}
