// 카카오 지도나 현장 사진 위에 작업계획 동선을 표시하고 합성 이미지를 만드는 편집기

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ImagePlus, Lock, Map as MapIcon, Trash2, Undo2, Upload } from 'lucide-react'
import type {
  DrawingPoint,
  DrawingToolType,
  MapDrawingData,
  MapDrawingObject,
  WorkPlanElectricAttachments,
} from '@/lib/work-plan/types'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 540
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
  setMapTypeId: (mapType: unknown) => void
  relayout: () => void
}

interface KakaoGeocoderResult {
  x: string
  y: string
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
  { type: 'label', label: '라벨' },
]

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
    context.moveTo(first.x, first.y)
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
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
    context.fillStyle = '#111827'
    context.fillRect(first.x - 25, first.y - 25, 50, 50)
  } else if (object.type === 'guide') {
    context.strokeStyle = '#2563eb'
    context.lineWidth = 5
    context.beginPath()
    context.arc(first.x, first.y, 25, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.arc(first.x, first.y, 15, 0, Math.PI * 2)
    context.stroke()
  } else if (object.type === 'workDirector') {
    context.fillStyle = '#2563eb'
    context.strokeStyle = '#1e3a8a'
    drawStar(context, first, 31, 14)
    context.fill()
    context.stroke()
  } else if (object.type === 'safetySign') {
    context.fillStyle = '#16a34a'
    context.strokeStyle = '#14532d'
    context.fillRect(first.x - 25, first.y - 25, 50, 50)
    context.strokeRect(first.x - 25, first.y - 25, 50, 50)
    context.fillStyle = '#ffffff'
    context.font = 'bold 13px sans-serif'
    context.fillText('안전', first.x, first.y)
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

function createObject(type: DrawingToolType, point: DrawingPoint): MapDrawingObject {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    points: [point],
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
  const [draftObject, setDraftObject] = useState<MapDrawingObject | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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
    if (electricOnly || frozen || !mapElementRef.current) return
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
    drawObjects(context, objects, CANVAS_WIDTH, CANVAS_HEIGHT)
    if (draftObject) drawObject(context, draftObject, CANVAS_WIDTH, CANVAS_HEIGHT)
  }, [draftObject, objects])

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

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraftObject(createObject(activeTool, pointerPoint(event)))
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftObject || disabled) return
    const point = pointerPoint(event)
    if (draftObject.type === 'route') {
      const previous = draftObject.points[draftObject.points.length - 1]
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 4) return
      setDraftObject({ ...draftObject, points: [...draftObject.points, point] })
    } else if (draftObject.type === 'restrictedArea') {
      setDraftObject({ ...draftObject, points: [draftObject.points[0], point] })
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftObject || disabled) return
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 lg:col-start-2 lg:row-start-1">
          {!frozen ? (
            <div className="flex flex-wrap items-center justify-center gap-2 lg:flex-col lg:items-stretch">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600"><MapIcon className="h-4 w-4 text-blue-600" />지도 배경</span>
              <div className="flex gap-1.5 lg:grid lg:grid-cols-2">
                <button type="button" disabled={disabled} onClick={() => setMapType('hybrid')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mapType === 'hybrid' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>위성지도</button>
                <button type="button" disabled={disabled} onClick={() => setMapType('roadmap')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mapType === 'roadmap' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>일반지도</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-1.5 lg:grid lg:grid-cols-2">
              {TOOL_OPTIONS.map((tool) => (
                <button key={tool.type} type="button" disabled={disabled} onClick={() => setActiveTool(tool.type)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${activeTool === tool.type ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}>{tool.label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-inner">
            {!frozen ? (
              <div ref={mapElementRef} data-work-plan-map="true" className="h-full w-full" />
            ) : (
              <>
                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(backgroundSource)})` }} />
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => setDraftObject(null)}
                  className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
                />
              </>
            )}
          </div>
          {frozen && compositeSource && <p className="mt-1.5 text-xs text-emerald-700">배경과 표시가 PDF 출력용 이미지로 합성되었습니다.</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2.5 lg:col-start-2 lg:row-start-2">
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
                      <span className="truncate">{index + 1}. {TOOL_OPTIONS.find((tool) => tool.type === object.type)?.label || object.type}{object.text ? ` · ${object.text}` : ''}</span>
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
