// PDF 내부 래스터 사진 후보를 브라우저에서 제한된 범위만 추출해 JPEG로 정규화한다.
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'
import {
  ACCIDENT_REPORT_MAX_PHOTOS,
  ACCIDENT_REPORT_PHOTO_MAX_EDGE,
  ACCIDENT_REPORT_PHOTO_MAX_DATA_URL_LENGTH,
  isValidAccidentReportPhotoDataUrl,
  type AccidentReportPhoto,
} from '@/lib/accident-report'

const MAX_BYTES = 4 * 1024 * 1024
const MAX_PAGES = 8
const MAX_PIXELS = 12_000_000
const MAX_OPERATORS = 30_000
const TIMEOUT_MS = 15_000
const MANUAL_NOTICE = 'PDF에서 첨부할 사진 후보를 찾지 못했습니다. 스캔한 전체 쪽·작은 그림은 제외하므로 필요한 사진은 직접 첨부해 주세요.'
const LIMIT_NOTICE = 'PDF 사진 후보는 앞 8쪽에서 표시 순서대로 최대 2장만 채웁니다. 사진대지에서 확인하고 필요하면 삭제 후 다른 사진을 직접 첨부해 주세요.'

export interface AccidentPdfPhotosResult {
  photos: AccidentReportPhoto[]
  warnings: string[]
}

interface RasterImage {
  width: number
  height: number
  kind?: number
  data?: Uint8Array | Uint8ClampedArray
  bitmap?: ImageBitmap
}
type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function multiply(a: Matrix, b: number[]): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

function isPhoto(image: RasterImage, matrix: Matrix, pageWidth: number, pageHeight: number): boolean {
  const { width, height } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 160 || height < 160) return false
  if (width * height < 60_000 || width * height > MAX_PIXELS || Math.max(width / height, height / width) > 4) return false
  // PDF 단위 사각형에 걸린 변환으로 실제 배치 면적을 확인한다. 쪽 전체 스캔은 후보가 아니다.
  const displayedWidth = Math.hypot(matrix[0], matrix[1])
  const displayedHeight = Math.hypot(matrix[2], matrix[3])
  const area = Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])
  if (displayedWidth < 40 || displayedHeight < 40) return false
  if (area >= pageWidth * pageHeight * 0.65) return false
  if (displayedWidth >= pageWidth * 0.8 && displayedHeight >= pageHeight * 0.8) return false
  // GRAYSCALE_1BPP 및 stencil mask는 사진으로 받지 않는다.
  return Boolean(image.bitmap || (image.data && (image.kind === 2 || image.kind === 3)))
}

function rasterToJpeg(image: RasterImage): string {
  const source = document.createElement('canvas')
  const output = document.createElement('canvas')
  try {
    source.width = image.width
    source.height = image.height
    const context = source.getContext('2d')
    if (!context) throw new Error('사진을 변환하지 못했습니다.')
    if (image.bitmap) {
      context.drawImage(image.bitmap, 0, 0)
    } else {
      const channels = image.kind === 2 ? 3 : 4
      const data = image.data
      if (!data || data.length !== image.width * image.height * channels) throw new Error('사진 데이터가 손상되었습니다.')
      const rgba = new Uint8ClampedArray(image.width * image.height * 4)
      for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
        rgba[j] = data[i]
        rgba[j + 1] = data[i + 1]
        rgba[j + 2] = data[i + 2]
        rgba[j + 3] = channels === 4 ? data[i + 3] : 255
      }
      context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0)
    }
    const scale = Math.min(1, ACCIDENT_REPORT_PHOTO_MAX_EDGE / Math.max(image.width, image.height))
    output.width = Math.max(1, Math.round(image.width * scale))
    output.height = Math.max(1, Math.round(image.height * scale))
    const resized = output.getContext('2d')
    if (!resized) throw new Error('사진을 축소하지 못했습니다.')
    resized.fillStyle = '#FFFFFF'
    resized.fillRect(0, 0, output.width, output.height)
    resized.drawImage(source, 0, 0, output.width, output.height)
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const dataUrl = output.toDataURL('image/jpeg', quality)
      if (dataUrl.length <= ACCIDENT_REPORT_PHOTO_MAX_DATA_URL_LENGTH && isValidAccidentReportPhotoDataUrl(dataUrl)) return dataUrl
    }
    throw new Error('사진이 너무 큽니다.')
  } finally {
    source.width = source.height = output.width = output.height = 1
  }
}

async function collectPhotos(
  pdf: PDFDocumentProxy,
  pdfjs: typeof import('pdfjs-dist'),
  photos: AccidentReportPhoto[],
  signal: AbortSignal,
): Promise<void> {
  const { OPS } = pdfjs
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PAGES); pageNumber++) {
    signal.throwIfAborted()
    const page = await pdf.getPage(pageNumber)
    try {
      const list = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE })
      signal.throwIfAborted()
      if (list.fnArray.length > MAX_OPERATORS) throw new Error('PDF 내부 그림 작업이 너무 많습니다.')
      const width = page.view[2] - page.view[0]
      const height = page.view[3] - page.view[1]
      let matrix: Matrix = [...IDENTITY]
      const stack: Matrix[] = []
      const seen = new Set<string>()
      for (let index = 0; index < list.fnArray.length; index++) {
        signal.throwIfAborted()
        const fn = list.fnArray[index]
        const args = list.argsArray[index]
        if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
          stack.push(matrix)
          if (fn === OPS.paintFormXObjectBegin && args[0]) matrix = multiply(matrix, args[0])
        } else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
          matrix = stack.pop() ?? [...IDENTITY]
        } else if (fn === OPS.transform) {
          matrix = multiply(matrix, args)
        } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          let image: RasterImage
          if (fn === OPS.paintImageXObject) {
            const id = args[0] as string
            if (seen.has(id)) continue
            const objects = id.startsWith('g_') ? page.commonObjs : page.objs
            image = await new Promise<RasterImage>((resolve) => objects.get(id, resolve))
            signal.throwIfAborted()
            if (!image || !isPhoto(image, matrix, width, height)) continue
            seen.add(id)
          } else {
            image = args[0] as RasterImage
            if (!image || !isPhoto(image, matrix, width, height)) continue
          }
          photos.push({ dataUrl: rasterToJpeg(image), caption: '' })
          if (photos.length >= ACCIDENT_REPORT_MAX_PHOTOS) return
        }
      }
    } finally {
      page.cleanup()
    }
  }
}

/** 사진 오류는 안내와 부분 결과로 돌려주어 이미 성공한 본문 초안을 잃지 않게 한다. */
export async function extractAccidentPdfPhotos(input: Blob): Promise<AccidentPdfPhotosResult> {
  const photos: AccidentReportPhoto[] = []
  if (input.size > MAX_BYTES) return { photos, warnings: ['PDF 사진 추출은 4MB 이하 파일만 지원합니다. 사진은 직접 첨부해 주세요.'] }
  let loading: PDFDocumentLoadingTask | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  try {
    const work = async () => {
      // PDF.js의 미리 빌드된 ESM을 Next/SWC가 다시 해석하지 않게 같은 사이트의 자산으로 로드한다.
      const moduleUrl = new URL('pdfjs-dist/build/pdf.min.mjs', import.meta.url).toString()
      const pdfjs: typeof import('pdfjs-dist') = await import(/* webpackIgnore: true */ moduleUrl)
      controller.signal.throwIfAborted()
      // Webpack/Next가 worker 파일을 same-origin 정적 자산으로 내보낸다. 외부 CDN은 사용하지 않는다.
      if (typeof window !== 'undefined') {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      }
      const data = new Uint8Array(await input.arrayBuffer())
      controller.signal.throwIfAborted()
      loading = pdfjs.getDocument({
        data, isEvalSupported: false, enableXfa: false, disableFontFace: true,
        useSystemFonts: false, useWorkerFetch: false, useWasm: false,
        isImageDecoderSupported: false, maxImageSize: MAX_PIXELS,
        canvasMaxAreaInBytes: MAX_PIXELS * 4, stopAtErrors: true, verbosity: 0,
      })
      const pdf = await loading.promise
      await collectPhotos(pdf, pdfjs, photos, controller.signal)
    }
    await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('PDF 사진 추출 시간이 초과되었습니다.'))
        }, TIMEOUT_MS)
      }),
    ])
    return { photos, warnings: [photos.length > 0 ? LIMIT_NOTICE : MANUAL_NOTICE] }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    const detail = controller.signal.aborted
      ? 'PDF 사진 추출 시간이 15초를 넘었습니다.'
      : name === 'PasswordException'
      ? '암호가 걸린 PDF의 사진은 추출할 수 없습니다.'
      : name === 'InvalidPDFException'
        ? '손상된 PDF에서 사진을 읽지 못했습니다.'
        : 'PDF 사진을 모두 추출하지 못했습니다. 파일 손상·지원하지 않는 그림 형식 또는 처리 제한이 원인일 수 있습니다.'
    return { photos, warnings: [detail + ' 본문 초안은 유지되며 필요한 사진은 직접 첨부해 주세요.', ...(photos.length ? [LIMIT_NOTICE] : [])] }
  } finally {
    if (timer) clearTimeout(timer)
    controller.abort()
    // 문서 로드 실패와 시간 초과도 worker 및 내부 객체를 해제한다.
    await loading?.destroy().catch(() => undefined)
  }
}
