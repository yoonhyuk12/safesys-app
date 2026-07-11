// 카카오 지도나 현장 사진 위에 작업계획 동선을 표시하고 합성 이미지를 만드는 편집기

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ImagePlus, Lock, Map as MapIcon, Search, Trash2, Undo2, Upload } from 'lucide-react'
import type {
  DrawingPoint,
  DrawingToolType,
  MapDrawingData,
  MapDrawingObject,
  WorkPlanElectricAttachments,
} from '@/lib/work-plan/types'

// PDF 작업계획도 칸(폭 약 123mm × 높이 120mm 이상)에 여백 없이 담기도록 1:1 비율로 캡처·합성한다.
const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 960
const DEFAULT_CENTER = { latitude: 37.5665, longitude: 126.978 }

interface MapDrawingEditorProps {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  value: MapDrawingData | null
  onChange: (value: MapDrawingData | null) => void
  compositeSource: string | null
  onCompositeChange: (source: string | null) => void
  electricOnly: boolean
  electricAttachments: WorkPlanElectricAttachments
  onElectricAttachmentsChange: (value: WorkPlanElectricAttachments) => void
  disabled?: boolean
}

interface KakaoLatLng {
  getLat: () => number
  getLng: () => number
}

interface KakaoMapInstance {
  getCenter: () => KakaoLatLng
  getLevel: () => number
  setCenter: (latLng: KakaoLatLng) => void
  setMapTypeId: (mapType: unknown) => void
  relayout: () => void
}

interface KakaoGeocoderResult {
  x: string
  y: string
  address_name?: string
}

interface KakaoPlaceResult {
  x: string
  y: string
  place_name: string
  address_name: string
}

interface KakaoMapsNamespace {
  Map: new (element: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng
  MapTypeId: { HYBRID: unknown; ROADMAP: unknown }
  services?: {
    Geocoder: new () => {
      addressSearch: (
        address: string,
        callback: (result: KakaoGeocoderResult[], status: string) => void,
      ) => void
    }
    Places: new () => {
      keywordSearch: (
        keyword: string,
        callback: (result: KakaoPlaceResult[], status: string) => void,
      ) => void
    }
    Status: { OK: string }
  }
}

interface KakaoNamespace {
  maps?: KakaoMapsNamespace
}

const TOOL_OPTIONS: Array<{ type: DrawingToolType; label: string }> = [
  { type: 'equipment', label: '장비' },
  { type: 'route', label: '이동경로' },
  { type: 'guide', label: '유도자' },
  { type: 'workDirector', label: '지휘자' },
  { type: 'restrictedArea', label: '통제구역' },
  { type: 'safetySign', label: '표지판' },
  { type: 'safetyCone', label: '안전콘' },
  { type: 'label', label: '라벨' },
]

export const EQUIPMENT_PRESETS = [
  { type: 'crane', label: '크레인' },
  { type: 'excavator', label: '굴착기' },
  { type: 'forklift', label: '지게차' },
  { type: 'skycar', label: '고소작업차' },
  { type: 'truck', label: '화물차' },
  { type: 'pumpcar', label: '펌프카' },
  { type: 'mixer', label: '레미콘차' },
  { type: 'generic', label: '일반장비' },
]

function EquipmentUiIcon({ type, active }: { type: string; active: boolean }) {
  const strokeColor = active ? 'stroke-orange-600' : 'stroke-gray-500'
  const fillColor = 'fill-none'

  switch (type) {
    case 'crane':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="3" y="15" width="18" height="5" rx="1" />
          <rect x="7" y="10" width="10" height="5" />
          <path d="M 12,10 L 20,2" />
          <line x1="20" y1="2" x2="20" y2="8" />
        </svg>
      )
    case 'excavator':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="4" y="16" width="16" height="4" rx="1" />
          <rect x="7" y="10" width="10" height="6" />
          <path d="M 12,10 L 16,5 L 21,9" />
          <path d="M 21,9 A 2,2 0 0,1 19,11" />
        </svg>
      )
    case 'forklift':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="3" y="10" width="12" height="7" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="12" cy="18" r="2" />
          <line x1="15" y1="5" x2="15" y2="17" />
          <path d="M 15,13 L 20,13" />
        </svg>
      )
    case 'skycar':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="3" y="14" width="18" height="6" rx="1" />
          <line x1="8" y1="14" x2="15" y2="6" />
          <rect x="13" y="3" width="7" height="5" />
        </svg>
      )
    case 'truck':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="3" y="9" width="12" height="7" />
          <path d="M 15,16 L 21,16 L 21,11 L 18,9 L 15,9 Z" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="15" cy="18" r="2" />
        </svg>
      )
    case 'pumpcar':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="3" y="15" width="18" height="5" rx="1" />
          <rect x="16" y="10" width="5" height="5" />
          <path d="M 6,15 L 4,6 L 12,3 L 19,7" />
          <line x1="19" y1="7" x2="19" y2="10" />
        </svg>
      )
    case 'mixer':
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <rect x="3" y="14" width="18" height="5" rx="1" />
          <rect x="16" y="9" width="5" height="5" />
          <ellipse cx="9" cy="8" rx="7" ry="4" transform="rotate(-12 9 8)" />
          <line x1="8" y1="4" x2="9" y2="12" />
          <circle cx="7" cy="21" r="1.5" />
          <circle cx="16" cy="21" r="1.5" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${strokeColor} ${fillColor}`} strokeWidth="2" fill="none">
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      )
  }
}

function getKakaoMaps() {
  return (window as unknown as { kakao?: KakaoNamespace }).kakao?.maps
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('파일을 읽지 못했습니다.'))
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function scaledPoint(point: DrawingPoint, sourceWidth: number, sourceHeight: number) {
  return {
    x: point.x * CANVAS_WIDTH / sourceWidth,
    y: point.y * CANVAS_HEIGHT / sourceHeight,
  }
}

function drawArrowHead(context: CanvasRenderingContext2D, previous: DrawingPoint, end: DrawingPoint) {
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x)
  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(end.x - 18 * Math.cos(angle - Math.PI / 6), end.y - 18 * Math.sin(angle - Math.PI / 6))
  context.moveTo(end.x, end.y)
  context.lineTo(end.x - 18 * Math.cos(angle + Math.PI / 6), end.y - 18 * Math.sin(angle + Math.PI / 6))
  context.stroke()
}

function drawStar(context: CanvasRenderingContext2D, center: DrawingPoint, outerRadius: number, innerRadius: number) {
  context.beginPath()
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    const angle = -Math.PI / 2 + index * Math.PI / 5
    const x = center.x + Math.cos(angle) * radius
    const y = center.y + Math.sin(angle) * radius
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (image.naturalWidth - sourceWidth) / 2
  const sourceY = (image.naturalHeight - sourceHeight) / 2
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
}

function strokeCrane(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Chassis
  context.strokeRect(cx - 16, cy + 2, 32, 5)
  // Outriggers
  context.beginPath()
  context.moveTo(cx - 14, cy + 7)
  context.lineTo(cx - 17, cy + 10)
  context.moveTo(cx + 14, cy + 7)
  context.lineTo(cx + 17, cy + 10)
  context.stroke()
  // Wheels
  context.beginPath()
  context.arc(cx - 9, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx + 9, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  // Cab & Turntable
  context.strokeRect(cx - 10, cy - 3, 7, 5)
  context.strokeRect(cx - 3, cy - 3, 9, 5)
  // Boom (truss style with lattice)
  context.beginPath()
  context.moveTo(cx - 6, cy - 3)
  context.lineTo(cx + 15, cy - 17)
  context.moveTo(cx - 4, cy)
  context.lineTo(cx + 15, cy - 13)
  // Lattice cross
  context.moveTo(cx - 2, cy - 4)
  context.lineTo(cx - 1, cy - 9)
  context.moveTo(cx + 4, cy - 8)
  context.lineTo(cx + 5, cy - 13)
  context.moveTo(cx + 10, cy - 12)
  context.lineTo(cx + 11, cy - 16)
  // Cable & Hook
  context.moveTo(cx + 15, cy - 13)
  context.lineTo(cx + 15, cy - 2)
  context.stroke()
  // Hook
  context.beginPath()
  context.arc(cx + 14, cy - 1, 1.5, 0, Math.PI)
  context.stroke()
}

function strokeExcavator(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Tracks
  context.strokeRect(cx - 16, cy + 4, 32, 5)
  // Rollers inside track
  context.beginPath()
  context.arc(cx - 11, cy + 6.5, 1, 0, Math.PI * 2)
  context.arc(cx, cy + 6.5, 1, 0, Math.PI * 2)
  context.arc(cx + 11, cy + 6.5, 1, 0, Math.PI * 2)
  context.stroke()
  // Cab & Engine housing
  context.strokeRect(cx - 12, cy - 4, 18, 8)
  context.strokeRect(cx - 6, cy - 11, 10, 7)
  // Window line
  context.beginPath()
  context.moveTo(cx + 1, cy - 11)
  context.lineTo(cx - 3, cy - 4)
  context.stroke()
  // Boom
  context.beginPath()
  context.moveTo(cx - 2, cy - 4)
  context.lineTo(cx + 6, cy - 14)
  context.lineTo(cx + 15, cy - 4)
  context.stroke()
  // Bucket
  context.beginPath()
  context.arc(cx + 15, cy - 4, 3.5, 0, Math.PI)
  context.stroke()
  // Bucket teeth
  context.beginPath()
  context.moveTo(cx + 13, cy - 1)
  context.lineTo(cx + 11, cy + 1)
  context.moveTo(cx + 15, cy - 1)
  context.lineTo(cx + 14, cy + 2)
  context.stroke()
}

function strokeForklift(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Body
  context.strokeRect(cx - 15, cy - 3, 20, 9)
  // Cage
  context.strokeRect(cx - 11, cy - 11, 11, 8)
  // vertical bar in cage
  context.beginPath()
  context.moveTo(cx - 6, cy - 11)
  context.lineTo(cx - 6, cy - 3)
  context.stroke()
  // Steering wheel
  context.beginPath()
  context.moveTo(cx - 1, cy - 3)
  context.lineTo(cx + 1, cy - 6)
  context.lineTo(cx + 3, cy - 6)
  context.stroke()
  // Mast
  context.beginPath()
  context.moveTo(cx + 5, cy - 15)
  context.lineTo(cx + 5, cy + 8)
  context.moveTo(cx + 7, cy - 15)
  context.lineTo(cx + 7, cy + 8)
  // Fork
  context.moveTo(cx + 7, cy + 3)
  context.lineTo(cx + 16, cy + 3)
  context.stroke()
  // Crate on fork
  context.strokeRect(cx + 8, cy - 6, 8, 9)
  context.beginPath()
  context.moveTo(cx + 8, cy - 6)
  context.lineTo(cx + 16, cy + 3)
  context.moveTo(cx + 16, cy - 6)
  context.lineTo(cx + 8, cy + 3)
  context.stroke()
  // Wheels
  context.beginPath()
  context.arc(cx - 10, cy + 8, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx + 1, cy + 8, 2.5, 0, Math.PI * 2)
  context.stroke()
}

function strokeSkycar(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Base
  context.strokeRect(cx - 18, cy + 2, 36, 5)
  // Outriggers
  context.beginPath()
  context.moveTo(cx - 15, cy + 7)
  context.lineTo(cx - 18, cy + 10)
  context.moveTo(cx + 15, cy + 7)
  context.lineTo(cx + 18, cy + 10)
  context.stroke()
  // Wheels
  context.beginPath()
  context.arc(cx - 10, cy + 8.5, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx + 9, cy + 8.5, 2.5, 0, Math.PI * 2)
  context.stroke()
  // Cab
  context.strokeRect(cx + 7, cy - 3, 9, 5)
  context.beginPath()
  context.moveTo(cx + 12, cy - 3)
  context.lineTo(cx + 9, cy + 2)
  context.stroke()
  // Telescoping boom
  context.beginPath()
  context.moveTo(cx - 7, cy + 2)
  context.lineTo(cx + 5, cy - 10)
  context.moveTo(cx + 2, cy - 7)
  context.lineTo(cx + 9, cy - 14)
  context.stroke()
  // Basket
  context.strokeRect(cx + 5, cy - 21, 10, 7)
  // basket bars
  context.beginPath()
  context.moveTo(cx + 8, cy - 21)
  context.lineTo(cx + 8, cy - 14)
  context.moveTo(cx + 12, cy - 21)
  context.lineTo(cx + 12, cy - 14)
  context.stroke()
}

function strokeTruck(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Bed
  context.strokeRect(cx - 18, cy - 3, 22, 9)
  // Loaded boxes
  context.strokeRect(cx - 14, cy - 8, 7, 5)
  context.strokeRect(cx - 7, cy - 9, 8, 6)
  context.beginPath()
  context.moveTo(cx - 14, cy - 8)
  context.lineTo(cx - 7, cy - 3)
  context.moveTo(cx - 7, cy - 9)
  context.lineTo(cx + 1, cy - 3)
  context.stroke()
  // Cab
  context.strokeRect(cx + 4, cy - 3, 10, 9)
  context.strokeRect(cx + 7, cy - 8, 7, 5)
  // split window
  context.beginPath()
  context.moveTo(cx + 11, cy - 8)
  context.lineTo(cx + 11, cy - 3)
  context.stroke()
  // Wheels (Tandem rear axles + Front axle)
  context.beginPath()
  context.arc(cx - 12, cy + 8, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx - 6, cy + 8, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx + 9, cy + 8, 2.5, 0, Math.PI * 2)
  context.stroke()
}

function strokePumpcar(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Chassis
  context.strokeRect(cx - 16, cy + 2, 32, 5)
  // Cab (front-right)
  context.strokeRect(cx + 10, cy - 4, 6, 6)
  context.beginPath()
  context.moveTo(cx + 13, cy - 4)
  context.lineTo(cx + 13, cy + 2)
  context.stroke()
  // Outriggers
  context.beginPath()
  context.moveTo(cx - 14, cy + 7)
  context.lineTo(cx - 17, cy + 10)
  context.moveTo(cx + 7, cy + 7)
  context.lineTo(cx + 10, cy + 10)
  context.stroke()
  // Wheels
  context.beginPath()
  context.arc(cx - 9, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx - 3, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx + 13, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  // Boom turret
  context.strokeRect(cx - 11, cy - 2, 6, 4)
  // Folding placing boom (Z자 접이식 붐)
  context.beginPath()
  context.moveTo(cx - 8, cy - 2)
  context.lineTo(cx - 14, cy - 12)
  context.lineTo(cx + 3, cy - 16)
  context.lineTo(cx + 14, cy - 9)
  context.stroke()
  // End hose
  context.beginPath()
  context.moveTo(cx + 14, cy - 9)
  context.lineTo(cx + 14, cy - 3)
  context.stroke()
}

function strokeMixer(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Chassis
  context.strokeRect(cx - 16, cy + 2, 32, 5)
  // Cab (front-right)
  context.strokeRect(cx + 10, cy - 4, 6, 6)
  context.beginPath()
  context.moveTo(cx + 13, cy - 4)
  context.lineTo(cx + 13, cy + 2)
  context.stroke()
  // Wheels
  context.beginPath()
  context.arc(cx - 10, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx - 3, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx + 13, cy + 9, 2.5, 0, Math.PI * 2)
  context.stroke()
  // Mixer drum (앞쪽이 살짝 올라간 기울어진 드럼)
  context.beginPath()
  context.ellipse(cx - 4, cy - 7, 10, 5.5, -0.22, 0, Math.PI * 2)
  context.stroke()
  // Drum stripes
  context.beginPath()
  context.moveTo(cx - 9, cy - 11.5)
  context.lineTo(cx - 8, cy - 3)
  context.moveTo(cx - 2, cy - 12.5)
  context.lineTo(cx - 1, cy - 3.5)
  context.stroke()
  // Drum supports
  context.beginPath()
  context.moveTo(cx - 12, cy + 2)
  context.lineTo(cx - 12, cy - 4)
  context.moveTo(cx + 4, cy + 2)
  context.lineTo(cx + 4, cy - 5)
  context.stroke()
}

function strokeGeneric(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Cog wheel / Gear
  context.beginPath()
  context.arc(cx, cy, 11, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(cx, cy, 5, 0, Math.PI * 2)
  context.stroke()
  // Cog teeth
  context.beginPath()
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4
    context.moveTo(cx + Math.cos(angle) * 11, cy + Math.sin(angle) * 11)
    context.lineTo(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14)
  }
  context.stroke()
}

function strokeGuide(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Head
  context.beginPath()
  context.arc(0, -8, 2.5, 0, Math.PI * 2)
  context.stroke()
  // Helmet
  context.beginPath()
  context.arc(0, -8.5, 3.5, Math.PI, 0)
  context.stroke()
  // Helmet brim
  context.beginPath()
  context.moveTo(-4.5, -8.5)
  context.lineTo(4.5, -8.5)
  context.stroke()
  // Torso
  context.beginPath()
  context.moveTo(0, -5.5)
  context.lineTo(0, 3)
  // Left arm holding flag
  context.moveTo(0, -4)
  context.lineTo(-6, -2)
  context.lineTo(-10, -6)
  // Flag 1
  context.moveTo(-10, -11)
  context.lineTo(-10, -1)
  context.lineTo(-15, -6)
  context.closePath()
  // Right arm holding flag
  context.moveTo(0, -4)
  context.lineTo(6, -2)
  context.lineTo(10, -6)
  // Flag 2
  context.moveTo(10, -11)
  context.lineTo(10, -1)
  context.lineTo(15, -6)
  context.closePath()
  // Legs
  context.moveTo(0, 3)
  context.lineTo(-4, 11)
  context.moveTo(0, 3)
  context.lineTo(4, 11)
  context.stroke()
}

function strokeWorkDirector(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Head
  context.beginPath()
  context.arc(0, -8, 2.5, 0, Math.PI * 2)
  context.stroke()
  // Helmet
  context.beginPath()
  context.arc(0, -8.5, 3.5, Math.PI, 0)
  context.stroke()
  // Helmet brim
  context.beginPath()
  context.moveTo(-4.5, -8.5)
  context.lineTo(4.5, -8.5)
  context.stroke()
  // Torso
  context.beginPath()
  context.moveTo(0, -5.5)
  context.lineTo(0, 3)
  // Left arm holding megaphone
  context.moveTo(0, -4)
  context.lineTo(-5, -6)
  // Megaphone
  context.moveTo(-5, -7)
  context.lineTo(-10, -9)
  context.lineTo(-9, -4)
  context.lineTo(-5, -6)
  context.closePath()
  // Megaphone handle
  context.moveTo(-5, -6)
  context.lineTo(-5, -9)
  // Right arm pointing
  context.moveTo(0, -4)
  context.lineTo(7, -6)
  context.lineTo(12, -3)
  // Legs
  context.moveTo(0, 3)
  context.lineTo(-4, 11)
  context.moveTo(0, 3)
  context.lineTo(4, 11)
  context.stroke()
}

function strokeSafetyCone(context: CanvasRenderingContext2D, cx: number, cy: number) {
  // Base plate
  context.beginPath()
  context.ellipse(0, 10, 16, 3, 0, 0, Math.PI * 2)
  context.fillStyle = '#f97316'
  context.fill()
  context.stroke()

  // Cone body (orange)
  context.beginPath()
  context.moveTo(-3, -15)
  context.lineTo(3, -15)
  context.lineTo(12, 10)
  context.lineTo(-12, 10)
  context.closePath()
  context.fillStyle = '#f97316'
  context.fill()
  context.stroke()

  // Top stripe (white)
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.moveTo(-4.8, -7)
  context.lineTo(4.8, -7)
  context.lineTo(6.6, -2)
  context.lineTo(-6.6, -2)
  context.closePath()
  context.fill()
  context.stroke()

  // Bottom stripe (white)
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.moveTo(-8.4, 3)
  context.lineTo(8.4, 3)
  context.lineTo(10.2, 8)
  context.lineTo(-10.2, 8)
  context.closePath()
  context.fill()
  context.stroke()
}

function drawObject(
  context: CanvasRenderingContext2D,
  object: MapDrawingObject,
  sourceWidth: number,
  sourceHeight: number,
) {
  const points = object.points.map((point) => scaledPoint(point, sourceWidth, sourceHeight))
  if (points.length === 0) return
  const first = points[0]
  const last = points[points.length - 1]

  context.save()
  context.lineWidth = 5
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.font = 'bold 18px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  if (object.type === 'route') {
    context.strokeStyle = '#ef4444'
    context.beginPath()
    if (points.length >= 3) {
      context.moveTo(first.x, first.y)
      let i = 1
      for (i = 1; i < points.length - 2; i += 1) {
        const xc = (points[i].x + points[i + 1].x) / 2
        const yc = (points[i].y + points[i + 1].y) / 2
        context.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
      }
      context.quadraticCurveTo(
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y,
      )
    } else {
      context.moveTo(first.x, first.y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    }
    context.stroke()
    if (points.length > 1) drawArrowHead(context, points[points.length - 2], last)
  } else if (object.type === 'restrictedArea') {
    const width = Math.max(Math.abs(last.x - first.x), 12)
    const height = Math.max(Math.abs(last.y - first.y), 12)
    context.strokeStyle = '#7e22ce'
    context.fillStyle = 'rgba(126, 34, 206, 0.1)'
    context.setLineDash([12, 8])
    context.beginPath()
    context.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  } else if (object.type === 'equipment') {
    const subType = object.text || 'generic'
    const cx = first.x
    const cy = first.y

    // Draw circular badge background (2x size: radius 50)
    context.fillStyle = 'rgba(255, 255, 255, 0.95)'
    context.strokeStyle = '#f97316'
    context.lineWidth = 5
    context.beginPath()
    context.arc(cx, cy, 50, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    // Draw inside at 2x scale
    context.save()
    context.translate(cx, cy)
    context.scale(2, 2)
    context.strokeStyle = '#111827'
    context.lineWidth = 1.5

    if (subType === 'crane') {
      strokeCrane(context, 0, 0)
    } else if (subType === 'excavator') {
      strokeExcavator(context, 0, 0)
    } else if (subType === 'forklift') {
      strokeForklift(context, 0, 0)
    } else if (subType === 'skycar') {
      strokeSkycar(context, 0, 0)
    } else if (subType === 'truck') {
      strokeTruck(context, 0, 0)
    } else if (subType === 'pumpcar') {
      strokePumpcar(context, 0, 0)
    } else if (subType === 'mixer') {
      strokeMixer(context, 0, 0)
    } else {
      strokeGeneric(context, 0, 0)
    }
    context.restore()
  } else if (object.type === 'guide') {
    const cx = first.x
    const cy = first.y

    // Draw circular badge background (2x size: radius 50, Red background)
    context.fillStyle = '#ef4444'
    context.strokeStyle = '#ffffff'
    context.lineWidth = 5
    context.beginPath()
    context.arc(cx, cy, 50, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    // Draw inside at 2x scale (White stick figure)
    context.save()
    context.translate(cx, cy)
    context.scale(2, 2)
    context.strokeStyle = '#ffffff'
    context.lineWidth = 1.5
    strokeGuide(context, 0, 0)
    context.restore()
  } else if (object.type === 'workDirector') {
    const cx = first.x
    const cy = first.y

    // Draw circular badge background (2x size: radius 50)
    context.fillStyle = 'rgba(255, 255, 255, 0.95)'
    context.strokeStyle = '#2563eb'
    context.lineWidth = 5
    context.beginPath()
    context.arc(cx, cy, 50, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    // Draw inside at 2x scale (글자 공간을 위해 살짝 위로)
    context.save()
    context.translate(cx, cy - 6)
    context.scale(2, 2)
    context.strokeStyle = '#111827'
    context.lineWidth = 1.5
    strokeWorkDirector(context, 0, 0)
    context.restore()

    // 배지 하단에 역할 글자 표기
    context.fillStyle = '#2563eb'
    context.font = 'bold 20px sans-serif'
    context.fillText('지휘', cx, cy + 36)
  } else if (object.type === 'safetySign') {
    const cx = first.x
    const cy = first.y

    // Draw folding back legs (depth)
    context.strokeStyle = '#854d0e'
    context.lineWidth = 4
    context.beginPath()
    context.moveTo(cx - 25, cy + 30)
    context.lineTo(cx - 32, cy + 42)
    context.moveTo(cx + 25, cy + 30)
    context.lineTo(cx + 32, cy + 42)
    context.stroke()

    // Draw main A-frame board
    context.fillStyle = '#facc15' // bright yellow
    context.strokeStyle = '#ca8a04' // dark yellow border
    context.lineWidth = 4
    context.beginPath()
    context.moveTo(cx - 18, cy - 35)
    context.lineTo(cx + 18, cy - 35)
    context.lineTo(cx + 26, cy + 35)
    context.lineTo(cx - 26, cy + 35)
    context.closePath()
    context.fill()
    context.stroke()

    // Front legs extending down
    context.beginPath()
    context.moveTo(cx - 24, cy + 35)
    context.lineTo(cx - 27, cy + 44)
    context.moveTo(cx + 24, cy + 35)
    context.lineTo(cx + 27, cy + 44)
    context.stroke()

    // Top handle cutout
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(cx, cy - 26, 4, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    // Inner white sign board insert
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#ef4444' // red inner border
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(cx - 13, cy - 18)
    context.lineTo(cx + 13, cy - 18)
    context.lineTo(cx + 18, cy + 26)
    context.lineTo(cx - 18, cy + 26)
    context.closePath()
    context.fill()
    context.stroke()

    // "안전" Text in bold red/black
    context.fillStyle = '#111827'
    context.font = 'bold 15px sans-serif'
    context.fillText('안전', cx, cy + 5)
  } else if (object.type === 'safetyCone') {
    const cx = first.x
    const cy = first.y

    // Draw inside at 2x scale directly (No circle background, no border)
    context.save()
    context.translate(cx, cy)
    context.scale(2, 2)
    context.strokeStyle = '#111827'
    context.lineWidth = 1.5
    strokeSafetyCone(context, 0, 0)
    context.restore()
  } else {
    const text = object.text?.trim() || '라벨'
    context.textAlign = 'left'
    const width = context.measureText(text).width + 20
    context.fillStyle = 'rgba(255, 255, 255, 0.9)'
    context.strokeStyle = '#111827'
    context.fillRect(first.x, first.y - 18, width, 36)
    context.strokeRect(first.x, first.y - 18, width, 36)
    context.fillStyle = '#111827'
    context.fillText(text, first.x + 10, first.y)
  }
  context.restore()
}

function drawObjects(
  context: CanvasRenderingContext2D,
  objects: MapDrawingObject[],
  sourceWidth: number,
  sourceHeight: number,
) {
  objects.forEach((object) => drawObject(context, object, sourceWidth, sourceHeight))
}

// 점과 선분 사이 거리 — 이동경로 히트 판정용
function distanceToSegment(point: DrawingPoint, a: DrawingPoint, b: DrawingPoint) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

function labelWidth(object: MapDrawingObject, context: CanvasRenderingContext2D | null) {
  if (!context) return 80
  context.save()
  context.font = 'bold 18px sans-serif'
  const width = context.measureText(object.text?.trim() || '라벨').width + 20
  context.restore()
  return width
}

// 캔버스 좌표 기준으로 점이 도형 위에 있는지 판정한다 (호버 표시·드래그 이동 대상 선택용)
function isPointOnObject(point: DrawingPoint, object: MapDrawingObject, context: CanvasRenderingContext2D | null): boolean {
  const points = object.points
  if (points.length === 0) return false
  const first = points[0]
  const last = points[points.length - 1]
  if (object.type === 'route') {
    if (points.length === 1) return Math.hypot(point.x - first.x, point.y - first.y) <= 14
    return points.some((current, index) => index > 0 && distanceToSegment(point, points[index - 1], current) <= 14)
  }
  if (object.type === 'restrictedArea') {
    const rx = Math.max(Math.abs(last.x - first.x), 12) / 2
    const ry = Math.max(Math.abs(last.y - first.y), 12) / 2
    const nx = (point.x - (first.x + last.x) / 2) / rx
    const ny = (point.y - (first.y + last.y) / 2) / ry
    return nx * nx + ny * ny <= 1
  }
  if (object.type === 'label') {
    const width = labelWidth(object, context)
    return point.x >= first.x && point.x <= first.x + width && Math.abs(point.y - first.y) <= 18
  }
  // 배지형 마커(장비·유도자·지휘자·표지판·안전콘)는 중심 반경 50px로 판정
  return Math.hypot(point.x - first.x, point.y - first.y) <= 50
}

// 도형 우측 상단 삭제(X) 배지 중심.
// 배지 판정 원(반경 20)이 도형 히트 영역과 겹치도록 도형 가장자리에 붙여, 도형→배지로 포인터를 옮기는 동안 호버가 끊기지 않게 한다.
function deleteBadgeCenter(object: MapDrawingObject, context: CanvasRenderingContext2D | null): DrawingPoint {
  const points = object.points
  const first = points[0]
  const last = points[points.length - 1]
  let x: number
  let y: number
  if (object.type === 'route') {
    x = last.x + 20
    y = last.y - 20
  } else if (object.type === 'restrictedArea') {
    const rx = Math.max(Math.abs(last.x - first.x), 12) / 2
    const ry = Math.max(Math.abs(last.y - first.y), 12) / 2
    x = (first.x + last.x) / 2 + rx * Math.SQRT1_2
    y = (first.y + last.y) / 2 - ry * Math.SQRT1_2
  } else if (object.type === 'label') {
    x = first.x + labelWidth(object, context)
    y = first.y - 18
  } else {
    x = first.x + 50 * Math.SQRT1_2
    y = first.y - 50 * Math.SQRT1_2
  }
  return {
    x: Math.min(Math.max(x, 20), CANVAS_WIDTH - 20),
    y: Math.min(Math.max(y, 20), CANVAS_HEIGHT - 20),
  }
}

function isOnDeleteBadge(point: DrawingPoint, object: MapDrawingObject, context: CanvasRenderingContext2D | null) {
  const center = deleteBadgeCenter(object, context)
  return Math.hypot(point.x - center.x, point.y - center.y) <= 20
}

function drawDeleteBadge(context: CanvasRenderingContext2D, center: DrawingPoint) {
  context.save()
  context.beginPath()
  context.arc(center.x, center.y, 16, 0, Math.PI * 2)
  context.fillStyle = '#ef4444'
  context.fill()
  context.strokeStyle = '#ffffff'
  context.lineWidth = 3
  context.stroke()
  context.beginPath()
  context.moveTo(center.x - 6, center.y - 6)
  context.lineTo(center.x + 6, center.y + 6)
  context.moveTo(center.x + 6, center.y - 6)
  context.lineTo(center.x - 6, center.y + 6)
  context.stroke()
  context.restore()
}

function translateObject(object: MapDrawingObject, dx: number, dy: number): MapDrawingObject {
  return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) }
}

// 드래그 중 상단 중앙에 나타나는 쓰레기통 드롭 영역 (캔버스 좌표)
const TRASH_ZONE = { x: CANVAS_WIDTH / 2 - 160, y: 16, width: 320, height: 120 }

function isInTrashZone(point: DrawingPoint) {
  return point.x >= TRASH_ZONE.x && point.x <= TRASH_ZONE.x + TRASH_ZONE.width
    && point.y >= TRASH_ZONE.y && point.y <= TRASH_ZONE.y + TRASH_ZONE.height
}

function createObject(type: DrawingToolType, point: DrawingPoint, subType?: string): MapDrawingObject {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    points: [point],
    text: subType,
  }
}

function containsTaintedImage(element: HTMLElement) {
  return Array.from(element.querySelectorAll('img')).some((image) => {
    if (!image.complete || image.naturalWidth === 0) return false
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const context = probe.getContext('2d')
    if (!context) return false
    try {
      context.drawImage(image, 0, 0, 1, 1)
      context.getImageData(0, 0, 1, 1)
      return false
    } catch {
      return true
    }
  })
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('이미지를 읽지 못했습니다.'))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}

async function fetchTileAsDataUrl(source: string) {
  const response = await fetch(`/api/map-tile?url=${encodeURIComponent(source)}`)
  if (!response.ok) throw new Error('지도 타일을 가져오지 못했습니다.')
  return readBlobAsDataUrl(await response.blob())
}

// SVG 렌더링 시 외부 요청이 차단되므로 복제본의 모든 원격 이미지를 data URL로 인라인한다.
async function inlineCloneImages(clone: HTMLElement) {
  const imageElements = Array.from(clone.querySelectorAll('img'))
  const svgImageElements = Array.from(clone.querySelectorAll('image'))
  await Promise.all([
    ...imageElements.map(async (image) => {
      const source = image.getAttribute('src') || ''
      image.removeAttribute('srcset')
      image.removeAttribute('loading')
      if (!/^https?:/i.test(source)) return
      try {
        image.src = await fetchTileAsDataUrl(source)
      } catch {
        image.removeAttribute('src')
      }
    }),
    ...svgImageElements.map(async (image) => {
      const source = image.getAttribute('href') || image.getAttribute('xlink:href') || ''
      if (!/^https?:/i.test(source)) return
      try {
        const dataUrl = await fetchTileAsDataUrl(source)
        image.setAttribute('href', dataUrl)
        image.removeAttribute('xlink:href')
      } catch {
        image.removeAttribute('href')
        image.removeAttribute('xlink:href')
      }
    }),
  ])
}

// cloneNode는 캔버스 픽셀을 복사하지 않으므로 원본 캔버스 내용을 이미지로 옮겨 심는다.
function copyCanvasContent(element: HTMLElement, clone: HTMLElement) {
  const sourceCanvases = element.querySelectorAll('canvas')
  const cloneCanvases = clone.querySelectorAll('canvas')
  sourceCanvases.forEach((sourceCanvas, index) => {
    const target = cloneCanvases[index]
    if (!target) return
    try {
      const replacement = document.createElement('img')
      replacement.src = sourceCanvas.toDataURL('image/png')
      const style = target.getAttribute('style')
      if (style) replacement.setAttribute('style', style)
      if (target.className) replacement.setAttribute('class', target.className)
      replacement.width = sourceCanvas.width
      replacement.height = sourceCanvas.height
      target.replaceWith(replacement)
    } catch {
      target.remove()
    }
  })
}

// 카카오 벡터(SVG) 지도는 html2canvas가 그리지 못하므로 DOM을 foreignObject SVG로 직렬화해 캡처한다.
async function captureMapViaSvg(element: HTMLElement) {
  const rectangle = element.getBoundingClientRect()
  const width = Math.max(1, Math.round(rectangle.width))
  const height = Math.max(1, Math.round(rectangle.height))
  const clone = element.cloneNode(true) as HTMLElement
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.backgroundColor = '#ffffff'
  copyCanvasContent(element, clone)
  await inlineCloneImages(clone)
  const markup = new XMLSerializer().serializeToString(clone)
  const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('지도 화면을 이미지로 변환하지 못했습니다.'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`
  })
  const output = document.createElement('canvas')
  output.width = CANVAS_WIDTH
  output.height = CANVAS_HEIGHT
  const context = output.getContext('2d')
  if (!context) throw new Error('캔버스를 만들지 못했습니다.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  return output
}

// 캡처가 "성공"했지만 내용이 없는 흰 이미지인 경우를 걸러낸다 (오염된 캔버스도 실패로 간주).
function isMostlyBlankCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return true
  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const stride = 4 * 61
    let sampled = 0
    let varied = 0
    for (let index = 0; index < data.length; index += stride) {
      sampled += 1
      const delta = Math.abs(data[index] - data[0])
        + Math.abs(data[index + 1] - data[1])
        + Math.abs(data[index + 2] - data[2])
      if (delta > 30) varied += 1
    }
    return sampled === 0 || varied / sampled < 0.02
  } catch {
    return true
  }
}

export default function MapDrawingEditor({
  latitude,
  longitude,
  address,
  value,
  onChange,
  compositeSource,
  onCompositeChange,
  electricOnly,
  electricAttachments,
  onElectricAttachmentsChange,
  disabled = false,
}: MapDrawingEditorProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<KakaoMapInstance | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapType, setMapType] = useState<'hybrid' | 'roadmap'>(value?.background.type === 'roadmap' ? 'roadmap' : 'hybrid')
  const initialMapTypeRef = useRef<'hybrid' | 'roadmap'>(mapType)
  const [frozen, setFrozen] = useState(Boolean(value?.background.imageUrl))
  const [backgroundSource, setBackgroundSource] = useState(value?.background.imageUrl || '')
  const [activeTool, setActiveTool] = useState<DrawingToolType>('equipment')
  const [selectedEquipment, setSelectedEquipment] = useState<string>('excavator')
  const [draftObject, setDraftObject] = useState<MapDrawingObject | null>(null)
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [hoveringDelete, setHoveringDelete] = useState(false)
  // 드래그 중에는 onChange를 부르지 않고 로컬 오프셋으로만 미리 그리다 pointerUp에 한 번 커밋한다(합성 이미지 재생성 비용 때문).
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [overTrash, setOverTrash] = useState(false)
  const dragStartRef = useRef<{ id: string; start: DrawingPoint } | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ latitude: number; longitude: number; title: string; subtitle?: string }>>([])
  const [searchMessage, setSearchMessage] = useState('')

  const sourceWidth = value?.canvasWidth || CANVAS_WIDTH
  const sourceHeight = value?.canvasHeight || CANVAS_HEIGHT
  const rawObjects = useMemo(() => value?.objects || [], [value?.objects])
  const objects = useMemo(() => rawObjects.map((object) => ({
    ...object,
    points: object.points.map((point) => scaledPoint(point, sourceWidth, sourceHeight)),
  })), [rawObjects, sourceHeight, sourceWidth])

  useEffect(() => {
    if (value?.background.imageUrl) {
      setBackgroundSource(value.background.imageUrl)
      setFrozen(true)
    }
  }, [value?.background.imageUrl])

  useEffect(() => {
    const mountedElement = mapElementRef.current
    if (electricOnly || frozen || !mountedElement) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const initialize = () => {
      const maps = getKakaoMaps()
      const element = mapElementRef.current
      if (!maps?.Map || !maps.LatLng || !element) {
        attempts += 1
        if (attempts < 50) retryTimer = setTimeout(initialize, 100)
        else if (!cancelled) setErrorMessage('카카오 지도 SDK를 불러오지 못했습니다. 현장 전경 사진을 배경으로 사용할 수 있습니다.')
        return
      }

      const createMap = (center: { latitude: number; longitude: number }) => {
        if (cancelled || mapInstanceRef.current) return
        const initialCenter = value?.background.center || center
        const map = new maps.Map(element, {
          center: new maps.LatLng(initialCenter.latitude, initialCenter.longitude),
          level: value?.background.level || 4,
        })
        map.setMapTypeId(initialMapTypeRef.current === 'hybrid' ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP)
        mapInstanceRef.current = map
        setTimeout(() => map.relayout(), 0)
      }

      if (typeof latitude === 'number' && typeof longitude === 'number') {
        createMap({ latitude, longitude })
      } else if (address && maps.services?.Geocoder) {
        const geocoder = new maps.services.Geocoder()
        geocoder.addressSearch(address, (result, status) => {
          const match = result[0]
          if (status === maps.services?.Status.OK && match) {
            createMap({ latitude: Number(match.y), longitude: Number(match.x) })
          } else {
            createMap(DEFAULT_CENTER)
          }
        })
      } else {
        createMap(DEFAULT_CENTER)
      }
    }

    initialize()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      mapInstanceRef.current = null
      // 카카오가 심은 자식 DOM을 비워 재초기화 시 지도가 겹겹이 쌓이는 것을 막는다.
      mountedElement.replaceChildren()
    }
  }, [address, electricOnly, frozen, latitude, longitude, value?.background.center, value?.background.level])

  useEffect(() => {
    const maps = getKakaoMaps()
    const map = mapInstanceRef.current
    if (maps && map) map.setMapTypeId(mapType === 'hybrid' ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP)
  }, [mapType])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    const rendered = dragOffset
      ? objects.map((object) => object.id === dragOffset.id ? translateObject(object, dragOffset.dx, dragOffset.dy) : object)
      : objects
    drawObjects(context, rendered, CANVAS_WIDTH, CANVAS_HEIGHT)
    if (draftObject) drawObject(context, draftObject, CANVAS_WIDTH, CANVAS_HEIGHT)
    // 호버 중인 도형 우측 상단에 삭제(X) 배지 표시 (드래그·그리기 중에는 숨김)
    if (hoveredObjectId && !dragOffset && !draftObject) {
      const hovered = objects.find((object) => object.id === hoveredObjectId)
      if (hovered) drawDeleteBadge(context, deleteBadgeCenter(hovered, context))
    }
  }, [draftObject, dragOffset, hoveredObjectId, objects])

  useEffect(() => {
    if (!backgroundSource || electricOnly) return
    let cancelled = false
    const image = new Image()
    if (/^https?:/i.test(backgroundSource)) image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (cancelled) return
      const composite = document.createElement('canvas')
      composite.width = CANVAS_WIDTH
      composite.height = CANVAS_HEIGHT
      const context = composite.getContext('2d')
      if (!context) return
      drawCoverImage(context, image, CANVAS_WIDTH, CANVAS_HEIGHT)
      drawObjects(context, objects, CANVAS_WIDTH, CANVAS_HEIGHT)
      try {
        onCompositeChange(composite.toDataURL('image/png'))
      } catch {
        onCompositeChange(null)
        setErrorMessage('배경 이미지 보안 제한으로 합성하지 못했습니다. 현장 전경 사진을 다시 업로드해주세요.')
      }
    }
    image.onerror = () => {
      if (!cancelled) setErrorMessage('저장된 배경 이미지를 불러오지 못했습니다.')
    }
    image.src = backgroundSource
    return () => {
      cancelled = true
    }
  }, [backgroundSource, electricOnly, objects, onCompositeChange])

  const dataWithObjects = (nextObjects: MapDrawingObject[]) => ({
    background: value?.background || { type: mapType },
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    objects: nextObjects,
  } satisfies MapDrawingData)

  const pointerPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rectangle = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rectangle.left) * CANVAS_WIDTH / rectangle.width,
      y: (event.clientY - rectangle.top) * CANVAS_HEIGHT / rectangle.height,
    }
  }

  const findObjectAt = (point: DrawingPoint) => {
    const context = canvasRef.current?.getContext('2d') || null
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      if (isPointOnObject(point, objects[index], context)) return objects[index]
    }
    return null
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPoint(event)
    const context = canvasRef.current?.getContext('2d') || null
    const hovered = hoveredObjectId ? objects.find((object) => object.id === hoveredObjectId) : null
    if (hovered && isOnDeleteBadge(point, hovered, context)) {
      onChange(dataWithObjects(objects.filter((object) => object.id !== hovered.id)))
      setHoveredObjectId(null)
      setHoveringDelete(false)
      return
    }
    const hit = findObjectAt(point)
    if (hit) {
      dragStartRef.current = { id: hit.id, start: point }
      setDragOffset({ id: hit.id, dx: 0, dy: 0 })
      return
    }
    setDraftObject(createObject(activeTool, point, activeTool === 'equipment' ? selectedEquipment : undefined))
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const point = pointerPoint(event)
    const dragging = dragStartRef.current
    if (dragging) {
      setDragOffset({ id: dragging.id, dx: point.x - dragging.start.x, dy: point.y - dragging.start.y })
      setOverTrash(isInTrashZone(point))
      return
    }
    if (!draftObject) {
      // 삭제 배지 위에 있는 동안은 호버를 유지하고 배지 판정을 도형 판정보다 우선한다(클릭 시 삭제와 일치)
      const context = canvasRef.current?.getContext('2d') || null
      const hovered = hoveredObjectId ? objects.find((object) => object.id === hoveredObjectId) : null
      if (hovered && isOnDeleteBadge(point, hovered, context)) {
        setHoveringDelete(true)
        return
      }
      const hit = findObjectAt(point)
      setHoveredObjectId(hit?.id || null)
      setHoveringDelete(false)
      return
    }
    if (draftObject.type === 'route') {
      const previous = draftObject.points[draftObject.points.length - 1]
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 4) return
      setDraftObject({ ...draftObject, points: [...draftObject.points, point] })
    } else if (draftObject.type === 'restrictedArea') {
      setDraftObject({ ...draftObject, points: [draftObject.points[0], point] })
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const dragging = dragStartRef.current
    if (dragging) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      const point = pointerPoint(event)
      if (isInTrashZone(point)) {
        onChange(dataWithObjects(objects.filter((object) => object.id !== dragging.id)))
        setHoveredObjectId(null)
      } else {
        const dx = point.x - dragging.start.x
        const dy = point.y - dragging.start.y
        if (dx !== 0 || dy !== 0) {
          onChange(dataWithObjects(objects.map((object) => object.id === dragging.id ? translateObject(object, dx, dy) : object)))
        }
      }
      dragStartRef.current = null
      setDragOffset(null)
      setOverTrash(false)
      return
    }
    if (!draftObject) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    let completed = draftObject
    if (draftObject.type === 'label') {
      const text = window.prompt('지도에 표시할 라벨을 입력하세요.', '')?.trim()
      if (!text) {
        setDraftObject(null)
        return
      }
      completed = { ...draftObject, text }
    }
    onChange(dataWithObjects([...objects, completed]))
    setDraftObject(null)
  }

  const moveMapTo = (targetLatitude: number, targetLongitude: number) => {
    const maps = getKakaoMaps()
    const map = mapInstanceRef.current
    if (!maps || !map) return
    map.setCenter(new maps.LatLng(targetLatitude, targetLongitude))
    setSearchResults([])
  }

  const searchLocation = () => {
    const query = searchQuery.trim()
    if (!query) return
    const maps = getKakaoMaps()
    const services = maps?.services
    if (!services || !mapInstanceRef.current) {
      setSearchMessage('지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    setSearchMessage('')
    const applyResults = (results: Array<{ latitude: number; longitude: number; title: string; subtitle?: string }>) => {
      if (results.length === 0) {
        setSearchResults([])
        setSearchMessage('검색 결과가 없습니다. 주소나 장소명을 확인해주세요.')
      } else if (results.length === 1) {
        moveMapTo(results[0].latitude, results[0].longitude)
      } else {
        setSearchResults(results.slice(0, 5))
      }
    }
    // 주소 검색을 먼저 시도하고, 없으면 장소명(키워드) 검색으로 폴백한다.
    new services.Geocoder().addressSearch(query, (addressResults, status) => {
      if (status === services.Status.OK && addressResults.length > 0) {
        applyResults(addressResults.map((result) => ({
          latitude: Number(result.y),
          longitude: Number(result.x),
          title: result.address_name || query,
        })))
        return
      }
      new services.Places().keywordSearch(query, (placeResults, placesStatus) => {
        if (placesStatus === services.Status.OK && placeResults.length > 0) {
          applyResults(placeResults.map((result) => ({
            latitude: Number(result.y),
            longitude: Number(result.x),
            title: result.place_name,
            subtitle: result.address_name,
          })))
        } else {
          applyResults([])
        }
      })
    })
  }

  const captureMapWithHtml2canvas = async (element: HTMLElement, proxyImages: boolean) => {
    if (!proxyImages && containsTaintedImage(element)) {
      throw new Error('지도 타일에 CORS 제한이 있습니다.')
    }
    const html2canvas = (await import('html2canvas')).default
    const captured = await html2canvas(element, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: 1,
      useCORS: true,
      onclone: proxyImages
        ? (documentClone) => {
            const clone = documentClone.querySelector<HTMLElement>('[data-work-plan-map="true"]')
            clone?.querySelectorAll('img').forEach((image) => {
              const source = image.currentSrc || image.src
              if (/^https?:/i.test(source)) image.src = `/api/map-tile?url=${encodeURIComponent(source)}`
            })
          }
        : undefined,
    })
    const resized = document.createElement('canvas')
    resized.width = CANVAS_WIDTH
    resized.height = CANVAS_HEIGHT
    const context = resized.getContext('2d')
    if (!context) throw new Error('캔버스를 만들지 못했습니다.')
    context.drawImage(captured, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    return resized
  }

  const freezeMap = async () => {
    const map = mapInstanceRef.current
    const element = mapElementRef.current
    if (!map || !element || disabled) return
    setIsCapturing(true)
    setErrorMessage('')
    try {
      const attempts = [
        () => captureMapViaSvg(element),
        () => captureMapWithHtml2canvas(element, false),
        () => captureMapWithHtml2canvas(element, true),
      ]
      let source: string | null = null
      for (const attempt of attempts) {
        try {
          const candidate = await attempt()
          if (isMostlyBlankCanvas(candidate)) continue
          source = candidate.toDataURL('image/png')
          break
        } catch {
          continue
        }
      }
      if (!source) throw new Error('지도 캡처에 실패했습니다.')
      const center = map.getCenter()
      const nextValue: MapDrawingData = {
        background: {
          type: mapType,
          imageUrl: source,
          center: { latitude: center.getLat(), longitude: center.getLng() },
          level: map.getLevel(),
        },
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        objects,
      }
      setBackgroundSource(source)
      setFrozen(true)
      onChange(nextValue)
    } catch {
      setErrorMessage('지도 캡처를 완료하지 못했습니다. 지도가 화면에 완전히 표시된 상태에서 다시 시도하거나, 현장 전경 사진을 배경으로 업로드해주세요.')
    } finally {
      setIsCapturing(false)
    }
  }

  const setPhotoBackground = async (file: File) => {
    try {
      const source = await readFile(file)
      setErrorMessage('')
      setBackgroundSource(source)
      setFrozen(true)
      onChange({
        background: { type: 'photo', imageUrl: source },
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        objects,
      })
    } catch {
      setErrorMessage('현장 전경 사진을 읽지 못했습니다.')
    }
  }

  const updateElectricFile = async (file: File, kind: 'drawing' | 'sitePhoto') => {
    try {
      const source = await readFile(file)
      const next = kind === 'drawing'
        ? { ...electricAttachments, drawingSource: source, drawingFileName: file.name }
        : { ...electricAttachments, sitePhotoSource: source, sitePhotoFileName: file.name }
      onElectricAttachmentsChange(next)
      if (kind === 'drawing') onCompositeChange(file.type.startsWith('image/') ? source : null)
      setErrorMessage('')
    } catch {
      setErrorMessage('첨부 파일을 읽지 못했습니다.')
    }
  }

  if (electricOnly) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">전기 작업 도면을 첨부해주세요.</h2>
          <p className="mt-1 text-sm text-gray-500">전기 작업은 지도 표시 대신 도면 이미지 또는 PDF와 현장사진을 첨부합니다.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-5 text-center">
            <Upload className="mx-auto h-7 w-7 text-violet-600" />
            <span className="mt-2 block text-sm font-bold text-gray-800">도면 이미지 또는 PDF</span>
            <span className="mt-1 block truncate text-xs text-gray-500">{electricAttachments.drawingFileName || '파일을 선택하세요.'}</span>
            <input disabled={disabled} type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void updateElectricFile(file, 'drawing') }} className="mt-3 block w-full text-xs" />
          </label>
          <label className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-5 text-center">
            <ImagePlus className="mx-auto h-7 w-7 text-emerald-600" />
            <span className="mt-2 block text-sm font-bold text-gray-800">현장사진</span>
            <span className="mt-1 block truncate text-xs text-gray-500">{electricAttachments.sitePhotoFileName || '사진을 선택하세요.'}</span>
            <input disabled={disabled} type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void updateElectricFile(file, 'sitePhoto') }} className="mt-3 block w-full text-xs" />
          </label>
        </div>
        {compositeSource && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">도면 이미지가 PDF 출력용으로 준비되었습니다.</p>}
        {errorMessage && <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{errorMessage}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">작업 위치와 안전 배치를 표시해주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">지도 화면을 맞춘 뒤 고정하거나 현장 전경 사진을 배경으로 사용하세요.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:items-start">
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 lg:col-start-1 lg:row-start-1">
          {!frozen ? (
            <div className="flex flex-wrap items-center justify-center gap-2 lg:flex-col lg:items-stretch">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600"><MapIcon className="h-4 w-4 text-blue-600" />지도 배경</span>
              <div className="flex gap-1.5 lg:grid lg:grid-cols-2">
                <button type="button" disabled={disabled} onClick={() => setMapType('hybrid')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mapType === 'hybrid' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>위성지도</button>
                <button type="button" disabled={disabled} onClick={() => setMapType('roadmap')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mapType === 'roadmap' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>일반지도</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5 lg:grid lg:grid-cols-2">
                {TOOL_OPTIONS.map((tool) => (
                  <button
                    key={tool.type}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setActiveTool(tool.type)
                      if (tool.type === 'equipment') {
                        setSelectedEquipment('excavator')
                      }
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      activeTool === tool.type
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              {activeTool === 'equipment' && (
                <div className="border-t border-gray-100 pt-2.5">
                  <span className="mb-1.5 block text-left text-[11px] font-bold text-gray-500">배치할 장비 선택</span>
                  <div className="flex flex-wrap justify-center gap-1.5 lg:grid lg:grid-cols-2">
                    {EQUIPMENT_PRESETS.map((preset) => {
                      const selected = selectedEquipment === preset.type
                      return (
                        <button
                          key={preset.type}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedEquipment(preset.type)}
                          className={`flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all duration-150 ${
                            selected
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <EquipmentUiIcon type={preset.type} active={selected} />
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-start-2 lg:row-start-1">
          <div className="relative mx-auto aspect-square w-full max-w-[540px] overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-inner">
            {!frozen ? (
              <>
                {/* key 분리 필수 — React가 카카오 SDK가 인라인 스타일·자식을 심은 이 노드를 배경 div로 재사용하면 높이가 0으로 붕괴한다. */}
                <div key="kakao-map" ref={mapElementRef} data-work-plan-map="true" className="h-full w-full" />
                {/* 캡처 대상(mapElementRef) 바깥의 오버레이라 화면 고정 이미지에는 찍히지 않는다. */}
                <div className="absolute inset-x-2 top-2 z-10">
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/95 p-1.5 shadow-md">
                    <input
                      type="text"
                      value={searchQuery}
                      disabled={disabled}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          searchLocation()
                        }
                      }}
                      placeholder="주소 또는 장소명 검색"
                      className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                    />
                    <button type="button" disabled={disabled} onClick={searchLocation} className="flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                      <Search className="h-3.5 w-3.5" />검색
                    </button>
                  </div>
                  {searchResults.length > 0 && (
                    <ul className="mt-1 overflow-hidden rounded-lg bg-white/95 shadow-md">
                      {searchResults.map((result, index) => (
                        <li key={`${result.latitude}-${result.longitude}-${index}`}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => moveMapTo(result.latitude, result.longitude)}
                            className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50"
                          >
                            <span className="block truncate font-semibold">{result.title}</span>
                            {result.subtitle && <span className="block truncate text-xs text-gray-500">{result.subtitle}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {searchMessage && <p className="mt-1 rounded-lg bg-white/95 px-3 py-1.5 text-xs text-red-600 shadow-md">{searchMessage}</p>}
                </div>
              </>
            ) : (
              <>
                <div key="frozen-background" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(backgroundSource)})` }} />
                <canvas
                  key="drawing-canvas"
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => {
                    setDraftObject(null)
                    dragStartRef.current = null
                    setDragOffset(null)
                    setOverTrash(false)
                  }}
                  onPointerLeave={() => {
                    setHoveredObjectId(null)
                    setHoveringDelete(false)
                  }}
                  className={`absolute inset-0 h-full w-full touch-none ${dragOffset ? 'cursor-grabbing' : hoveringDelete ? 'cursor-pointer' : hoveredObjectId ? 'cursor-move' : 'cursor-crosshair'}`}
                />
                {/* 드래그 중에만 나타나는 쓰레기통 드롭 영역 — 여기에 도형을 놓으면 삭제 */}
                {dragOffset && (
                  <div
                    className={`pointer-events-none absolute z-10 flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs font-bold transition-colors ${overTrash ? 'border-red-500 bg-red-500/25 text-red-600' : 'border-gray-400 bg-white/75 text-gray-500'}`}
                    style={{
                      left: `${TRASH_ZONE.x / CANVAS_WIDTH * 100}%`,
                      top: `${TRASH_ZONE.y / CANVAS_HEIGHT * 100}%`,
                      width: `${TRASH_ZONE.width / CANVAS_WIDTH * 100}%`,
                      height: `${TRASH_ZONE.height / CANVAS_HEIGHT * 100}%`,
                    }}
                  >
                    <Trash2 className="h-4 w-4" />삭제
                  </div>
                )}
              </>
            )}
          </div>
          {frozen && compositeSource && <p className="mx-auto mt-1.5 w-full max-w-[540px] text-xs text-emerald-700">배경과 표시가 PDF 출력용 이미지로 합성되었습니다.</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2.5 lg:col-start-3 lg:row-start-1">
          {!frozen ? (
            <div className="flex flex-wrap items-center justify-center gap-2 lg:flex-col lg:items-stretch">
              <button type="button" disabled={disabled || isCapturing} onClick={() => void freezeMap()} className="flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Lock className="h-4 w-4" />{isCapturing ? '화면 고정 중...' : '현재 화면 고정'}</button>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
                <ImagePlus className="h-4 w-4" />현장 전경 사진
                <input disabled={disabled} type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setPhotoBackground(file) }} className="sr-only" />
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-center gap-1.5 lg:grid lg:grid-cols-2">
                <button type="button" disabled={disabled || objects.length === 0} onClick={() => onChange(dataWithObjects(objects.slice(0, -1)))} className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" />실행 취소</button>
                <button type="button" disabled={disabled || objects.length === 0} onClick={() => onChange(dataWithObjects([]))} className="flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />전체 지우기</button>
                <button type="button" disabled={disabled} onClick={() => { onChange(null); onCompositeChange(null); setFrozen(false); setBackgroundSource(''); setDraftObject(null); setErrorMessage('') }} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 lg:col-span-2">배경 다시 선택</button>
              </div>
              {objects.length > 0 && (
                <div className="grid max-h-40 gap-1.5 overflow-y-auto border-t border-gray-100 pt-2 sm:grid-cols-2 lg:max-h-56 lg:grid-cols-1">
                  {objects.map((object, index) => (
                    <div key={object.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                      <span className="truncate">
                        {index + 1}.{' '}
                        {object.type === 'equipment'
                          ? `장비 (${EQUIPMENT_PRESETS.find((p) => p.type === object.text)?.label || '일반'})`
                          : TOOL_OPTIONS.find((t) => t.type === object.type)?.label || object.type}
                        {object.type !== 'equipment' && object.text ? ` · ${object.text}` : ''}
                      </span>
                      <button type="button" disabled={disabled} onClick={() => onChange(dataWithObjects(objects.filter((item) => item.id !== object.id)))} className="shrink-0 font-semibold text-red-600">삭제</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {errorMessage && <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{errorMessage}</p>}
    </div>
  )
}
