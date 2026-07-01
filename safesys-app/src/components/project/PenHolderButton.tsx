'use client'

// 일괄서명 진입용 만년필 펜통 버튼 — 서류 캐비넷 옆에 놓인 책상 소품 모양 (감독/현장소장 공용)

import React from 'react'

type PenTheme = 'purple' | 'blue'

interface PenHolderButtonProps {
  label: string // 펜통 명판 텍스트 (예: "감독 일괄서명" — 공백에서 줄바꿈)
  theme: PenTheme
  onClick: () => void
  size?: 'md' | 'sm' // sm: 캐비넷 서랍 안 배치용 축소 사이즈
  className?: string
}

const SIZE_CLASSES: Record<'md' | 'sm', { button: string; plateText: string }> = {
  md: { button: 'w-14 sm:w-16 lg:w-20 h-28 sm:h-32 lg:h-40', plateText: 'text-[9px] sm:text-[10px] lg:text-xs' },
  sm: { button: 'w-11 sm:w-12 lg:w-16 h-20 sm:h-24 lg:h-32', plateText: 'text-[8px] sm:text-[9px] lg:text-[10px]' },
}

const PEN_THEMES: Record<PenTheme, { barrel: string; cup: string; cupRim: string; frame: string }> = {
  purple: {
    barrel: 'linear-gradient(90deg, #7e22ce 0%, #a855f7 45%, #6b21a8 100%)',
    cup: 'linear-gradient(180deg, #a855f7 0%, #7e22ce 60%, #6b21a8 100%)',
    cupRim: '#581c87',
    frame: '#7e22ce',
  },
  blue: {
    barrel: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 45%, #1e40af 100%)',
    cup: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 60%, #1e40af 100%)',
    cupRim: '#1e3a8a',
    frame: '#1e40af',
  },
}

const GOLD = 'linear-gradient(90deg, #a16207 0%, #facc15 45%, #ca8a04 100%)'

const PenHolderButton: React.FC<PenHolderButtonProps> = ({ label, theme, onClick, size = 'md', className = '' }) => {
  const colors = PEN_THEMES[theme]
  const sizeClasses = SIZE_CLASSES[size]
  const [line1, ...rest] = label.split(' ')
  const line2 = rest.join(' ')

  return (
    <button
      type="button"
      data-cabinet
      onClick={onClick}
      className={`group relative ${sizeClasses.button} cursor-pointer transition-transform duration-200 hover:scale-105 ${className}`}
      title={label}
    >
      {/* 만년필 — 펜촉이 위로 꽂힌 모습, 호버 시 살짝 뽑힘 */}
      <div
        className="absolute left-1/2 bottom-[30%] w-[10px] lg:w-[14px] h-[72%] transition-transform duration-300 group-hover:-translate-y-2"
        style={{ transform: 'translateX(-50%) rotate(10deg)', transformOrigin: 'bottom center' }}
      >
        {/* 펜촉 (금촉) */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[8px] lg:w-[11px] h-[16%]"
          style={{
            background: GOLD,
            clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}
        />
        {/* 촉 슬릿 */}
        <div className="absolute top-[2%] left-1/2 -translate-x-1/2 w-[1px] h-[10%]" style={{ background: '#78350f' }} />
        {/* 그립부 */}
        <div
          className="absolute top-[15%] left-1/2 -translate-x-1/2 w-full h-[12%] rounded-[1px]"
          style={{ background: 'linear-gradient(90deg, #111827 0%, #4b5563 50%, #111827 100%)' }}
        />
        {/* 몸통 */}
        <div
          className="absolute top-[26%] left-1/2 -translate-x-1/2 w-full h-[64%] rounded-b-[4px]"
          style={{ background: colors.barrel, boxShadow: 'inset -2px 0 3px rgba(0,0,0,0.35), 1px 2px 3px rgba(0,0,0,0.35)' }}
        />
        {/* 몸통 금장 밴드 */}
        <div className="absolute top-[26%] left-1/2 -translate-x-1/2 w-full h-[4%]" style={{ background: GOLD }} />
      </div>

      {/* 펜통 (컵) */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-[42%] rounded-b-md overflow-hidden z-10"
        style={{
          background: colors.cup,
          border: `2px solid ${colors.frame}`,
          boxShadow: '0 5px 12px rgba(0,0,0,0.45), inset 0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* 상단 림 안쪽 그림자 */}
        <div
          className="absolute top-0 left-0 right-0 h-[6px] lg:h-[8px]"
          style={{ background: colors.cupRim, boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)' }}
        />
        {/* 명판 */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[38%] bg-white border border-gray-300 rounded-[2px] px-1 lg:px-1.5 py-0.5"
          style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)' }}
        >
          <span
            className={`block whitespace-nowrap ${sizeClasses.plateText} font-bold text-gray-800 leading-tight text-center`}
            style={{ fontFamily: 'ChosunBg, serif' }}
          >
            {line1}
            {line2 && (
              <>
                <br />
                {line2}
              </>
            )}
          </span>
        </div>
        {/* 하이라이트 */}
        <div
          className="absolute top-0 bottom-0 left-[8%] w-[10%]"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.05) 100%)' }}
        />
      </div>
    </button>
  )
}

export default PenHolderButton
