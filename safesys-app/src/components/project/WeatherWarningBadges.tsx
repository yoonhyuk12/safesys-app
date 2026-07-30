'use client'
// 표 셀처럼 좁은 자리에 현장 주소 기준 발효 중 기상특보를 2글자 축약 배지로 표시한다.

import {
  formatWeatherWarningShortLabel,
  formatWeatherWarningTime,
  type WeatherWarning,
} from '@/lib/weather-warnings'

interface WeatherWarningBadgesProps {
  regionNames: string[]
  warnings: WeatherWarning[]
}

export default function WeatherWarningBadges({ regionNames, warnings }: WeatherWarningBadgesProps) {
  if (warnings.length === 0) return null

  const region = regionNames.join(', ')
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
      {warnings.map((warning) => {
        const effectiveAt = formatWeatherWarningTime(warning.effectiveAt)
        const detail = [
          region ? `${region} ` : '',
          `${warning.type} ${warning.level}`,
          effectiveAt !== '-' ? ` (${effectiveAt} 발효)` : '',
        ].join('')
        return (
          <span
            key={`${warning.type}-${warning.level}`}
            title={detail}
            aria-label={detail}
            className={`inline-flex items-center rounded px-1 text-[10px] font-bold leading-4 ${
              warning.level === '경보' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950'
            }`}
          >
            {formatWeatherWarningShortLabel(warning)}
          </span>
        )
      })}
    </div>
  )
}
