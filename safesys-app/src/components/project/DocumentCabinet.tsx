'use client'

import React from 'react'

type CabinetColor = 'blue' | 'green' | 'amber'

interface DocumentCabinetProps {
  title: string
  titleSuffix?: string // 명판 제목 옆 부가 표시 (예: 공정률 %)
  color: CabinetColor
  isOpen?: boolean
  onClick?: () => void
  pendingCount?: number // 미조치 건수 — 있으면 닫힌 문틈에 라벨이 튀어나옴
}

// 내부 선반에 꽂힌 서류철 스파인 (서류철 색상 팔레트와 동일 계열)
const SHELF_SPINES = [
  { height: 62, color: '#fde68a' },
  { height: 78, color: '#f9a8d4' },
  { height: 55, color: '#7dd3fc' },
  { height: 82, color: '#bef264' },
  { height: 68, color: '#fdba74' },
  { height: 74, color: '#a5b4fc' },
]

interface CabinetTheme {
  frame: string
  bodyGradient: string
  topGradient: string
  doorGradient: string
  panelLine: string
  louver: string
}

const COLOR_THEMES: Record<CabinetColor, CabinetTheme> = {
  blue: {
    frame: '#1e40af',
    bodyGradient: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
    topGradient: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
    doorGradient: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 60%, #2563eb 100%)',
    panelLine: 'rgba(30, 64, 175, 0.55)',
    louver: 'rgba(30, 58, 138, 0.55)',
  },
  green: {
    frame: '#15803d',
    bodyGradient: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
    topGradient: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
    doorGradient: 'linear-gradient(180deg, #4ade80 0%, #22c55e 60%, #16a34a 100%)',
    panelLine: 'rgba(21, 128, 61, 0.55)',
    louver: 'rgba(20, 83, 45, 0.55)',
  },
  amber: {
    frame: '#b45309',
    bodyGradient: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
    topGradient: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
    doorGradient: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%)',
    panelLine: 'rgba(180, 83, 9, 0.55)',
    louver: 'rgba(120, 53, 15, 0.55)',
  },
}

const DocumentCabinet: React.FC<DocumentCabinetProps> = ({ title, titleSuffix, color, isOpen = false, onClick, pendingCount = 0 }) => {
  const theme = COLOR_THEMES[color]

  return (
    <div
      className={`
        relative w-24 sm:w-28 lg:w-36 transition-transform duration-200
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
      `}
      onClick={onClick}
    >
      {/* 캐비넷 본체 */}
      <div
        className="relative rounded-t-sm overflow-hidden transition-shadow duration-300"
        style={{
          background: theme.bodyGradient,
          border: `2px solid ${theme.frame}`,
          borderBottom: 'none',
          boxShadow: isOpen
            ? '0 0 0 3px rgba(255,255,255,0.65), 0 6px 18px rgba(0,0,0,0.5)'
            : '0 6px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}
      >
        {/* 상단 명판 */}
        <div
          className="flex items-center justify-center py-1.5 lg:py-2"
          style={{
            background: theme.topGradient,
            borderBottom: `2px solid ${theme.frame}`,
          }}
        >
          <div
            className={`bg-white border border-gray-300 rounded-[2px] py-0.5 flex items-baseline justify-center ${titleSuffix ? 'px-1.5 lg:px-2.5' : 'px-2.5 lg:px-4'}`}
            style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)' }}
          >
            <span
              className="block whitespace-nowrap text-xs lg:text-base font-bold text-gray-800 tracking-[0.25em] -mr-[0.25em]"
              style={{ fontFamily: 'ChosunBg, serif' }}
            >
              {title}
            </span>
            {titleSuffix && (
              <span
                className="whitespace-nowrap text-[9px] lg:text-xs font-bold text-blue-700"
                style={{ fontFamily: 'ChosunBg, serif' }}
              >
                {titleSuffix}
              </span>
            )}
          </div>
        </div>

        {/* 양문 도어 + 내부 */}
        <div className="relative h-28 sm:h-32 lg:h-44" style={{ perspective: '600px' }}>
          {/* 내부 - 선반과 서류철 (도어 열림 시 노출) */}
          <div
            className="absolute inset-0 flex flex-col"
            style={{
              background: 'linear-gradient(180deg, #374151 0%, #1f2937 100%)',
              boxShadow: 'inset 0 0 12px rgba(0,0,0,0.7)',
            }}
          >
            {[0, 1].map((row) => (
              <div key={row} className="flex-1 relative" style={{ borderBottom: '3px solid #6b7280' }}>
                <div className="absolute bottom-0 left-1 right-1 top-1 flex items-end gap-[2px]">
                  {SHELF_SPINES.map((spine, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-[1px]"
                      style={{
                        height: `${spine.height}%`,
                        background: spine.color,
                        opacity: 0.9,
                        boxShadow: 'inset -1px 0 1px rgba(0,0,0,0.25)',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 도어 */}
          {(['left', 'right'] as const).map((side) => (
            <div
              key={side}
              className={`
                absolute top-0 bottom-0 w-1/2 transition-transform duration-500
                ${side === 'left' ? 'left-0 origin-left' : 'right-0 origin-right'}
              `}
              style={{
                background: theme.doorGradient,
                borderRight: side === 'left' ? `1px solid ${theme.frame}` : undefined,
                borderLeft: side === 'right' ? '1px solid rgba(255,255,255,0.3)' : undefined,
                boxShadow: 'inset 0 0 6px rgba(0,0,0,0.18)',
                transform: isOpen ? `rotateY(${side === 'left' ? '-' : ''}105deg)` : 'rotateY(0deg)',
                backfaceVisibility: 'hidden',
              }}
            >
              {/* 도어 패널 인셋 */}
              <div
                className="absolute inset-1.5 lg:inset-2 rounded-[2px]"
                style={{
                  border: `1px solid ${theme.panelLine}`,
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2), inset 0 -1px 1px rgba(255,255,255,0.15)',
                }}
              >
                {/* 환기구 루버 */}
                <div className="absolute top-1.5 lg:top-2.5 left-1/2 -translate-x-1/2 flex flex-col gap-[3px] lg:gap-1 w-2/3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-[2px] rounded-full"
                      style={{
                        background: theme.louver,
                        boxShadow: '0 1px 0 rgba(255,255,255,0.25)',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 손잡이 (중앙 분할선 쪽) */}
              <div
                className={`
                  absolute top-1/2 -translate-y-1/2 w-[3px] lg:w-1 h-5 lg:h-8 rounded-full
                  ${side === 'left' ? 'right-1 lg:right-1.5' : 'left-1 lg:left-1.5'}
                `}
                style={{
                  background: 'linear-gradient(90deg, #e5e7eb 0%, #9ca3af 60%, #6b7280 100%)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                }}
              />

              {/* 잠금장치 (우측 도어) */}
              {side === 'right' && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 left-3 lg:left-5 w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 35% 35%, #d1d5db 0%, #6b7280 60%, #374151 100%)',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.4)',
                  }}
                />
              )}
            </div>
          ))}

          {/* 미조치 라벨 — 닫힌 문틈에 끼여 튀어나온 모양 */}
          {!isOpen && pendingCount > 0 && (
            <div
              className="absolute left-1/2 top-[24%] z-10 flex items-center whitespace-nowrap pl-1 pr-1.5 lg:pl-1.5 lg:pr-2 py-[1px] lg:py-[2px] bg-red-500 text-white text-[9px] lg:text-xs font-bold rounded-r-md border border-white/80"
              style={{
                transform: 'rotate(-6deg)',
                transformOrigin: 'left center',
                boxShadow: '2px 2px 4px rgba(0,0,0,0.45)',
              }}
              title="미조치 항목 있음"
            >
              미조치 {pendingCount}
            </div>
          )}
        </div>
      </div>

      {/* 받침대 */}
      <div
        className="h-1.5 lg:h-2"
        style={{
          background: theme.frame,
          boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
        }}
      />

      {/* 다리 */}
      <div className="flex justify-between px-2 lg:px-3">
        <div className="w-1.5 lg:w-2 h-1.5 lg:h-2 rounded-b-[2px]" style={{ background: '#1f2937' }} />
        <div className="w-1.5 lg:w-2 h-1.5 lg:h-2 rounded-b-[2px]" style={{ background: '#1f2937' }} />
      </div>

      {/* 열림 표시 화살표 */}
      {isOpen && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm animate-bounce">
          ▼
        </div>
      )}
    </div>
  )
}

export default DocumentCabinet
