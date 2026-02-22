import JSZip from 'jszip'
import type { SafetyInspectionPhotoForHwpx } from '@/lib/projects'

interface ImageEntry {
  id: string
  filename: string
  data: Uint8Array
  ext: string
  width: number
  height: number
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')) }
    img.src = url
  })
}

// 항상 캔버스를 통해 PNG로 변환 — 원본 포맷(WEBP/HEIC 등)에 관계없이 HWP 호환 보장
async function convertToPng(blob: Blob, maxEdge = 800): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null
  try {
    const img = await loadImage(blob)
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const outBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!outBlob) return null
    return { blob: outBlob, width: w, height: h }
  } catch {
    return null
  }
}

async function fetchAndCompressImage(url: string): Promise<{ data: Uint8Array; ext: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    // 원본 포맷을 무시하고 항상 PNG로 강제 변환 (HWP 호환성 최우선)
    const result = await convertToPng(blob, 800)
    if (!result) return null
    const buf = await result.blob.arrayBuffer()
    return { data: new Uint8Array(buf), ext: 'png', width: result.width, height: result.height }
  } catch {
    return null
  }
}

function buildPicXml(binItemId: string, cellW: number, cellH: number, origW: number, origH: number): string {
  const margin = 282
  const maxW = cellW - margin
  const maxH = cellH - margin

  let imgW = maxW
  let imgH = maxW * (origH / origW)
  if (imgH > maxH) {
    imgH = maxH
    imgW = maxH * (origW / origH)
  }

  imgW = Math.round(imgW)
  imgH = Math.round(imgH)

  const dimW = origW * 75
  const dimH = origH * 75
  const rid = Math.floor(Math.random() * 2000000000) + 100000000
  const instId = Math.floor(Math.random() * 2000000000) + 100000000

  return `<hp:pic id="${rid}" instid="${instId}" zOrder="0" numberingType="PICTURE" textWrap="SQUARE" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${imgW}" height="${imgH}"/><hp:curSz width="${imgW}" height="${imgH}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.floor(imgW / 2)}" centerY="${Math.floor(imgH / 2)}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${imgW}" y="0"/><hc:pt2 x="${imgW}" y="${imgH}"/><hc:pt3 x="0" y="${imgH}"/></hp:imgRect><hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${imgW}" widthRelTo="ABSOLUTE" height="${imgH}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment></hp:pic>`
}


function replacePhotoPlaceholder(
  row: string,
  placeholder: string,
  imageAttr: { id: string, width: number, height: number } | null,
  cellW: number,
  cellH: number
): string {
  if (!imageAttr) {
    return row.split(`<hp:t>${placeholder}</hp:t>`).join('').split(placeholder).join('')
  }
  const picXml = buildPicXml(imageAttr.id, cellW, cellH, imageAttr.width, imageAttr.height)
  const exactPattern = `<hp:t>${placeholder}</hp:t>`
  if (row.includes(exactPattern)) {
    return row.replace(exactPattern, picXml)
  }
  return row.split(placeholder).join('')
}

function addImageManifest(contentHpf: string, images: ImageEntry[]): string {
  if (images.length === 0) return contentHpf
  const items = images.map(img =>
    `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
  ).join('')
  return contentHpf.replace('</opf:manifest>', items + '</opf:manifest>')
}

export async function downloadPanoramaHwpx(
  photoEntries: SafetyInspectionPhotoForHwpx[],
  filename: string
): Promise<void> {
  if (photoEntries.length === 0) {
    alert('다운로드할 전경사진이 없습니다.')
    return
  }

  // 1. 템플릿 로드
  const res = await fetch('/전경사진 양식.hwpx')
  if (!res.ok) throw new Error(`템플릿 파일 로드 실패: ${res.status}`)
  const buf = await res.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)

  let sectionXml = await zip.file('Contents/section0.xml')!.async('string')
  let contentHpf = await zip.file('Contents/content.hpf')!.async('string')

  // 2. 템플릿 단락(페이지) 추출 — 표를 포함하는 <hp:p>...</hp:p>
  const tblSt = sectionXml.indexOf('<hp:tbl')
  const tblEnd = sectionXml.indexOf('</hp:tbl>', tblSt) + '</hp:tbl>'.length
  const pSt = sectionXml.lastIndexOf('<hp:p ', tblSt)
  const pEnd = sectionXml.indexOf('</hp:p>', tblEnd) + '</hp:p>'.length

  if (tblSt === -1 || tblEnd === -1 || pSt === -1 || pEnd === -1) {
    alert('전경사진 양식 파일 형식이 올바르지 않습니다.')
    return
  }

  const templatePara = sectionXml.substring(pSt, pEnd)

  // 3. 템플릿 행 추출 (한 페이지 = 7행: 상단정보+사진1+구분 / 하단정보+사진2)
  const trRegex = /<hp:tr>[\s\S]*?<\/hp:tr>/g
  const templateRows: string[] = []
  let m: RegExpExecArray | null
  while ((m = trRegex.exec(templatePara)) !== null) {
    templateRows.push(m[0])
  }

  if (templateRows.length === 0) {
    alert('전경사진 양식에 행이 없습니다.')
    return
  }

  // 4. 이미지 다운로드 (2개씩 묶어서 처리)
  const images: ImageEntry[] = []
  const imageIds: ({ id: string, width: number, height: number } | null)[] = []

  for (let i = 0; i < photoEntries.length; i++) {
    const url = photoEntries[i].photo_url
    if (!url) { imageIds.push(null); continue }
    const imgAttr = await fetchAndCompressImage(url)
    if (!imgAttr) { imageIds.push(null); continue }
    const id = `img_pano_${i}`
    images.push({ id, filename: `${id}.${imgAttr.ext}`, data: imgAttr.data, ext: imgAttr.ext, width: imgAttr.width, height: imgAttr.height })
    imageIds.push({ id, width: imgAttr.width, height: imgAttr.height })
  }

  // 5. 2개씩 묶어서 페이지(단락) 복제
  const newParas: string[] = []
  const emptyEntry: SafetyInspectionPhotoForHwpx = {
    inspection_id: '',
    project_name: '',
    district_name: '',
    inspection_date: '',
    supervisor_name: null,
    photo_url: null,
  }

  // 구분 행 인덱스: {{전경사진1}} 행 다음을 구분 행으로 사용
  const pic1Idx = templateRows.findIndex(r => r.includes('{{전경사진1}}'))
  // 상단: 0 ~ pic1Idx 포함, 구분: pic1Idx+1, 하단: 그 이후
  const sepIdx = pic1Idx + 1

  function applyEntry(row: string, ri: number, entry: SafetyInspectionPhotoForHwpx, photoPlaceholder: string, imgAttr: { id: string, width: number, height: number } | null, cellH: number): string {
    let r = row
    r = r.replace(/rowAddr="[^"]*"/g, `rowAddr="${ri}"`)
    const supervisor = entry.supervisor_name || ''
    const parts = supervisor.trim().split(/\s+/)
    const title = parts.length >= 2 ? parts[0] : ''
    const name = parts.length >= 2 ? parts.slice(1).join(' ') : supervisor
    r = r.split('{{지구명}}').join(esc(entry.district_name))
    r = r.split('{{감독직급}}').join(esc(title))
    r = r.split('{{감독명}}').join(esc(name))
    r = r.split('{{date}}').join(esc(entry.inspection_date))
    r = replacePhotoPlaceholder(r, photoPlaceholder, imgAttr, 47900, cellH)
    return r
  }

  let pageIdx = 0
  for (let i = 0; i < photoEntries.length; i += 2) {
    const pA = photoEntries[i]
    const pB = i + 1 < photoEntries.length ? photoEntries[i + 1] : null
    const imgA = imageIds[i] ?? null
    const imgB = pB ? (imageIds[i + 1] ?? null) : null

    // 각 행을 상단/하단/구분으로 분류하여 적절한 데이터 적용
    const filledRows = templateRows.map((row, ri) => {
      if (ri <= pic1Idx) {
        // 상단 섹션 (pA)
        return applyEntry(row, ri, pA, '{{전경사진1}}', imgA, 27132)
      } else if (ri === sepIdx) {
        // 구분 행
        return row.replace(/rowAddr="[^"]*"/g, `rowAddr="${ri}"`)
      } else {
        // 하단 섹션 (pB) - pB가 없으면 emptyEntry로 데이터 셀만 공란 처리
        const entryB: SafetyInspectionPhotoForHwpx = pB ?? {
          inspection_id: '', project_name: '', district_name: '',
          inspection_date: '', supervisor_name: null, photo_url: null,
        }
        return applyEntry(row, ri, entryB, '{{전경사진2}}', imgB, 26859)
      }
    })

    let newPara = templatePara

    // 고유 ID 부여 (복제본끼리 충돌 방지)
    if (pageIdx > 0) {
      const newTblId = 2091000000 + pageIdx
      const newZOrder = 100 + pageIdx
      const newParaId = 2147483648 + pageIdx
      newPara = newPara.replace(/<hp:tbl([^>]*)id="(\d+)"/, `<hp:tbl$1id="${newTblId}"`)
      newPara = newPara.replace(/<hp:tbl([^>]+)zOrder="(\d+)"/, `<hp:tbl$1zOrder="${newZOrder}"`)
      newPara = newPara.replace(/<hp:p([^>]*)id="(\d+)"/, `<hp:p$1id="${newParaId}"`)
    }

    const originalRowsBlock = templateRows.join('')
    const newRowsBlock = filledRows.join('')
    newPara = newPara.replace(originalRowsBlock, newRowsBlock)

    newParas.push(newPara)
    pageIdx++
  }



  // 6. 원본 단락을 복제 단락들로 교체
  sectionXml = sectionXml.substring(0, pSt) + newParas.join('') + sectionXml.substring(pEnd)

  // 7. 이미지 파일 추가
  for (const img of images) {
    zip.file(`BinData/${img.filename}`, img.data)
  }

  // 8. content.hpf 매니페스트 업데이트
  contentHpf = addImageManifest(contentHpf, images)

  // 9. XML 파일 업데이트 (header.xml은 건드리지 않음)
  zip.file('Contents/section0.xml', sectionXml)
  zip.file('Contents/content.hpf', contentHpf)

  // 10. mimetype은 반드시 STORE(비압축) 방식으로 저장
  const mimetypeContent = await zip.file('mimetype')!.async('string')
  zip.file('mimetype', mimetypeContent, { compression: 'STORE' })

  // 11. ZIP 생성 및 다운로드
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  triggerDownload(blob, filename)
}

