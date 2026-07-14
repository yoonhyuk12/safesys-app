'use client'
// 프로젝트의 현재 주소에 발효 중인 기상특보를 캐비넷용 소형 스티커로 표시한다.

import { useEffect, useMemo, useState } from 'react'
import {
  formatWeatherWarningTime,
  type WeatherWarningLocationResponse,
} from '@/lib/weather-warnings'

interface WeatherWarningStickersProps {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}

function isLocationResponse(value: unknown): value is WeatherWarningLocationResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<WeatherWarningLocationResponse>
  return Array.isArray(response.regionNames) && Array.isArray(response.warnings)
}

export default function WeatherWarningStickers({
  address,
  latitude,
  longitude,
}: WeatherWarningStickersProps) {
  const [data, setData] = useState<WeatherWarningLocationResponse | null>(null)

  useEffect(() => {
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    if (!address?.trim() && !hasCoordinates) {
      setData(null)
      return
    }

    let cancelled = false
    let controller: AbortController | null = null
    const load = async () => {
      controller?.abort()
      controller = new AbortController()
      const params = new URLSearchParams({ scope: 'location' })
      if (address?.trim()) params.set('address', address.trim())
      if (hasCoordinates) {
        params.set('lat', String(latitude))
        params.set('lng', String(longitude))
      }

      try {
        const response = await fetch(`/api/weather/warnings?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`기상특보 조회 오류 (${response.status})`)
        const nextData: unknown = await response.json()
        if (!cancelled) setData(isLocationResponse(nextData) ? nextData : null)
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) setData(null)
      }
    }

    void load()
    const interval = window.setInterval(load, 300_000)
    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(interval)
    }
  }, [address, latitude, longitude])

  const details = useMemo(() => {
    if (!data?.warnings.length) return ''
    const region = data.regionNames.join(', ') || '현재 위치'
    const warnings = data.warnings.map((warning) => {
      const effectiveAt = formatWeatherWarningTime(warning.effectiveAt)
      return `${warning.type} ${warning.level}${effectiveAt !== '-' ? ` (${effectiveAt} 발효)` : ''}`
    })
    return `${region}: ${warnings.join(', ')}`
  }, [data])

  const primary = data?.warnings[0]
  if (!primary) return null

  const remainingCount = data.warnings.length - 1
  return (
    <span
      className="relative flex min-w-0 shrink-0 items-center"
      aria-label={details}
      title={details}
    >
      <span
        className="-rotate-2 whitespace-nowrap rounded-[2px] border px-0.5 py-[1px] text-[6px] lg:px-1 lg:text-[8px] font-extrabold leading-none text-white"
        style={{
          backgroundColor: primary.style.fillColor,
          borderColor: primary.style.strokeColor,
          boxShadow: primary.level === '경보'
            ? `0 0 0 1px ${primary.style.strokeColor}, 1px 1px 2px rgba(0,0,0,0.35)`
            : '1px 1px 2px rgba(0,0,0,0.3)',
        }}
      >
        {primary.type}{primary.level}
      </span>
      {remainingCount > 0 && (
        <span className="absolute -right-2 -top-1 shrink-0 rounded-full bg-gray-800 px-0.5 text-[6px] lg:text-[8px] font-bold leading-tight text-white shadow-sm">
          +{remainingCount}
        </span>
      )}
    </span>
  )
}
