// 시정조치 결과보고서 사진을 TBM 정본 그림 구조로 변환한다.
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('점검 이미지를 읽지 못했습니다.')) }
    image.src = url
  })
}

export interface Picture { id: string; data: Uint8Array; ext: 'png' | 'jpg'; width: number; height: number }
export async function collectImage(url: string, id: string, raw: boolean): Promise<Picture> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('점검 사진 또는 서명 이미지를 가져오지 못했습니다.')
  let blob = await response.blob()
  const image = await loadImage(blob)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) throw new Error('점검 이미지의 크기를 읽지 못했습니다.')
  if (!raw) {
    const scale = Math.min(1, 1200 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('점검 사진을 변환하지 못했습니다.')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => {
      if (result) resolve(result)
      else reject(new Error('점검 사진을 JPEG로 변환하지 못했습니다.'))
    }, 'image/jpeg', 0.85))
  }
  return { id, data: new Uint8Array(await blob.arrayBuffer()), ext: raw ? 'png' : 'jpg', width, height }
}

export function fit(picture: Picture, width: number, height: number): { w: number; h: number } {
  const scale = Math.min(width / picture.width, height / picture.height)
  return { w: Math.max(1, Math.round(picture.width * scale)), h: Math.max(1, Math.round(picture.height * scale)) }
}

// TBM 정본의 완전한 그림 XML을 복사한다. 번호는 이미지 ID에서 얻어 동시 다운로드끼리 공유하지 않는다.
function buildPicXml(binItemId: string, imgW: number, imgH: number, textWrap: string, pos: string): string {
    const _picSeq = Number(binItemId.replace('image', ''))
    const id = 1149648000 + _picSeq
    const instid = 75906000 + _picSeq
    const identity = `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`
    return `<hp:pic id="${id}" zOrder="${10 + _picSeq}" numberingType="PICTURE" textWrap="${textWrap}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instid}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>${identity}</hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/>${pos}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}

// 셀 안에 넣는 인라인 그림 (사진용, 최종 크기를 직접 지정)
export function buildInlinePicXml(binItemId: string, imgW: number, imgH: number): string {
    const pos = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    return buildPicXml(binItemId, Math.max(1, imgW), Math.max(1, imgH), 'TOP_AND_BOTTOM', pos)
}
