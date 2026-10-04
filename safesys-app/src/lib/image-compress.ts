// 브라우저에서 사진을 긴 변 기준으로 줄이고 JPEG로 다시 인코딩하는 공용 압축 유틸

/**
 * 이미지를 긴 변 maxWidth 이하로 줄여 JPEG Blob으로 돌려준다.
 * PNG 투명 배경은 흰색으로 채운다(JPEG 변환 시 검은색 방지).
 */
export function compressImage(file: File | Blob, maxWidth = 1200, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      const longSide = Math.max(width, height)
      if (longSide > maxWidth) {
        const scale = maxWidth / longSide
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      canvas.width = width
      canvas.height = height

      if (ctx) {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
      }

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('이미지 압축 실패: blob 생성 불가'))
          }
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지 로드 실패'))
    }
    img.src = objectUrl
  })
}
