// 사고발생보고서 사진을 브라우저에서 축소해 JPEG data URL로 만드는 유틸 (브라우저 전용)

import {
  ACCIDENT_REPORT_PHOTO_MAX_DATA_URL_LENGTH,
  ACCIDENT_REPORT_PHOTO_MAX_EDGE,
  isValidAccidentReportPhotoDataUrl,
} from '@/lib/accident-report'

/** 처음 품질로 담기지 않으면 순서대로 낮춰 다시 시도한다. */
const JPEG_QUALITY_STEPS: readonly number[] = [0.82, 0.7, 0.55, 0.4]

const TOO_LARGE_MESSAGE = '사진이 너무 큽니다. 다른 사진을 선택해 주세요.'

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지를 읽을 수 없습니다.'))
    }
    image.src = objectUrl
  })
}

/**
 * 긴 변을 ACCIDENT_REPORT_PHOTO_MAX_EDGE로 줄이고 흰 배경 위에 그려 JPEG data URL로 만든다.
 * 길이 한도를 넘으면 품질을 낮춰 다시 만들고, 그래도 넘으면 오류를 던진다.
 */
export async function compressAccidentReportPhoto(file: File | Blob): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 첨부할 수 있습니다.')
  }

  const image = await loadImage(file)
  const longest = Math.max(image.width, image.height)
  const scale = longest > ACCIDENT_REPORT_PHOTO_MAX_EDGE ? ACCIDENT_REPORT_PHOTO_MAX_EDGE / longest : 1
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('사진을 축소하지 못했습니다.')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  for (const quality of JPEG_QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length > ACCIDENT_REPORT_PHOTO_MAX_DATA_URL_LENGTH) continue
    if (!isValidAccidentReportPhotoDataUrl(dataUrl)) {
      throw new Error('사진을 JPEG로 변환하지 못했습니다. 다른 사진을 선택해 주세요.')
    }
    return dataUrl
  }

  throw new Error(TOO_LARGE_MESSAGE)
}
