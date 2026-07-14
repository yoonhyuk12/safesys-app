'use client'
// 프로젝트의 현재 주소에 발효 중인 기상특보를 캐비넷 문용 세로 LED 전광판으로 표시한다.

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
  const warningLabel = `${primary.type}${primary.level}`
  const isAlert = primary.level === '경보'
  const ledColor = isAlert ? '#ff4b3e' : '#ffd43b'
  const frameColor = isAlert ? '#7f1d1d' : '#92400e'
  return (
    <span
      className="relative inline-flex min-w-[14px] lg:min-w-[20px] shrink-0 flex-col items-center overflow-hidden rounded-[3px] border px-[2px] py-1 lg:px-1 lg:py-1.5"
      aria-label={details}
      title={details}
      style={{
        backgroundColor: '#070908',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 0.55px, transparent 0.7px)',
        backgroundSize: '3px 3px',
        borderColor: frameColor,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 6px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.55), 0 0 4px ${ledColor}55`,
        backfaceVisibility: 'hidden',
      }}
    >
      <span
        className="relative z-[1] flex flex-col items-center gap-[2px] lg:gap-[3px] text-[7px] sm:text-[8px] lg:text-[11px] font-black leading-[0.92] animate-pulse motion-reduce:animate-none"
        style={{
          color: ledColor,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          textShadow: `0 0 2px ${ledColor}, 0 0 5px ${ledColor}, 0 0 8px ${ledColor}99`,
        }}
      >
        {Array.from(warningLabel).map((character, index) => (
          <span key={`${character}-${index}`} aria-hidden="true">{character}</span>
        ))}
      </span>
      {remainingCount > 0 && (
        <span
          className="relative z-[1] mt-1 border-t border-white/15 pt-0.5 text-[6px] lg:text-[8px] font-black leading-none animate-pulse motion-reduce:animate-none"
          style={{ color: ledColor, textShadow: `0 0 3px ${ledColor}` }}
        >
          +{remainingCount}
        </span>
      )}
    </span>
  )
}
