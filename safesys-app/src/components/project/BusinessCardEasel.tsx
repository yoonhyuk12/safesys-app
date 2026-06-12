'use client'

import React from 'react'
import { MapPin } from 'lucide-react'

interface BusinessCardEaselProps {
  onClick?: () => void
}

// 목재 질감 (서류 캐비넷 amber 테마와 동일 계열)
const WOOD_LEG = 'linear-gradient(90deg, #d97706 0%, #b45309 55%, #92400e 100%)'
const WOOD_BAR = 'linear-gradient(180deg, #d97706 0%, #b45309 60%, #92400e 100%)'

// 사업카드 PDF를 여는 이젤 그래픽 — 서류 캐비넷 옆에 배치
const BusinessCardEasel: React.FC<BusinessCardEaselProps> = ({ onClick }) => {
  return (
    <div
      className={`
        group relative w-20 sm:w-24 lg:w-32 h-32 sm:h-36 lg:h-52
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
      title="사업카드 보기"
    >
      {/* 뒷다리 (중앙 수직) */}
      <div
        className="absolute left-1/2 top-2 -translate-x-1/2 w-[3px] lg:w-1 h-[90%]"
        style={{ background: '#78350f', boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}
      />

      {/* 앞다리 좌/우 (A자형) */}
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className="absolute left-1/2 top-1 w-[4px] lg:w-[6px] h-[96%] rounded-b-[2px]"
          style={{
            background: WOOD_LEG,
            boxShadow: '1px 2px 3px rgba(0,0,0,0.45)',
            transform: `translateX(-50%) rotate(${side === 'left' ? '-' : ''}11deg)`,
            transformOrigin: 'top center',
          }}
        />
      ))}

      {/* 하단 가로 지지대 */}
      <div
        className="absolute bottom-[12%] left-1/2 -translate-x-1/2 w-[55%] h-[3px] lg:h-1 rounded-full"
        style={{ background: WOOD_BAR, boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
      />

      {/* 상단 고정 볼트 */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full z-20"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #d1d5db 0%, #6b7280 60%, #374151 100%)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}
      />

      {/* 카드 보드 */}
      <div
        className="absolute top-[20%] left-1/2 w-[72%] h-[52%] z-10 rounded-[2px] bg-white border border-gray-300 flex flex-col items-center pt-1 lg:pt-1.5 pb-1 lg:pb-1.5 px-1 lg:px-1.5 gap-0.5 lg:gap-1 origin-bottom transition-transform duration-300 ease-out -translate-x-1/2 group-hover:scale-[1.35] group-hover:z-30"
        style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.45), inset 0 1px 2px rgba(0,0,0,0.1)' }}
      >
        <span
          className="block whitespace-nowrap text-[9px] sm:text-[10px] lg:text-sm font-bold text-gray-800 leading-tight text-center"
          style={{ fontFamily: 'ChosunBg, serif' }}
        >
          사업카드
        </span>
        {/* 지도 모양 */}
        <div
          className="relative w-full flex-1 rounded-[2px] overflow-hidden border border-gray-300"
          style={{ background: 'linear-gradient(135deg, #d9f99d 0%, #bbf7d0 55%, #a7f3d0 100%)' }}
        >
          {/* 도로 */}
          <div
            className="absolute -inset-y-1 left-1/3 w-[3px] bg-white/90"
            style={{ transform: 'rotate(20deg)' }}
          />
          <div
            className="absolute -inset-x-1 top-1/2 h-[3px] bg-white/90"
            style={{ transform: 'rotate(-10deg)' }}
          />
          {/* 위치 핀 */}
          <MapPin
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 lg:h-4 lg:w-4 text-red-600"
            strokeWidth={2.5}
          />
        </div>
      </div>

      {/* 보드 받침 트레이 */}
      <div
        className="absolute top-[72%] left-1/2 -translate-x-1/2 w-[84%] h-1 lg:h-1.5 z-10 rounded-[2px]"
        style={{ background: WOOD_BAR, boxShadow: '0 2px 3px rgba(0,0,0,0.5)' }}
      />
    </div>
  )
}

export default BusinessCardEasel
