import JSZip from 'jszip'
import type { SafetyInspectionDetailForExcel } from '@/lib/projects'

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

async function fetchAndCompressImage(url: string | null): Promise<{ data: Uint8Array; ext: string; width: number; height: number } | null> {
    if (!url) return null
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const blob = await res.blob()
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

function fillSectionRows(
    templateRows: string[],
    insp: SafetyInspectionDetailForExcel,
    res: SafetyInspectionDetailForExcel['results'][0],
    rowOffset: number,
    beforeImgId: { id: string, width: number, height: number } | null,
    afterImgId: { id: string, width: number, height: number } | null
): string[] {
    return templateRows.map((row, i) => {
        let r = row
        r = r.replace(/rowAddr="[^"]*"/g, `rowAddr="${rowOffset + i}"`)

        r = r.split('{{지구명}}').join(esc(insp.district_name))
        const supervisor = insp.supervisor_name || ''
        const supParts = supervisor.trim().split(/\s+/)
        const supTitle = supParts.length >= 2 ? supParts[0] : ''
        const supName = supParts.length >= 2 ? supParts.slice(1).join(' ') : supervisor
        r = r.split('{{감독직급}}').join(esc(supTitle))
        r = r.split('{{감독명}}').join(esc(supName))
        r = r.split('{{date}}').join(esc(insp.inspection_date))
        r = r.split('{{지적사항}}').join(esc(res.findings))
        r = r.split('{{조치할 사항}}').join(esc(res.action_items))

        r = replacePhotoPlaceholder(r, '{{조치전 사진}}', beforeImgId, 47900, 27698)
        r = replacePhotoPlaceholder(r, '{{조치후 사진}}', afterImgId, 47900, 27425)

        return r
    })
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

export async function downloadDefectPhotoHwpx(
    inspections: SafetyInspectionDetailForExcel[],
    filename: string
): Promise<void> {
    const allResults: { insp: SafetyInspectionDetailForExcel; res: SafetyInspectionDetailForExcel['results'][0] }[] = []
    for (const insp of inspections) {
        for (const res of insp.results) {
            if ((res.photo_url || res.after_photo_url || res.findings || res.action_items)) {
                allResults.push({ insp, res })
            }
        }
    }

    if (allResults.length === 0) {
        alert('다운로드할 지적사항 사진이 없습니다.')
        return
    }

    const res = await fetch('/지적사항 사진.hwpx')
    if (!res.ok) throw new Error(`템플릿 파일 로드 실패: ${res.status}`)
    const buf = await res.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)

    let sectionXml = await zip.file('Contents/section0.xml')!.async('string')
    let contentHpf = await zip.file('Contents/content.hpf')!.async('string')

    const tblSt = sectionXml.indexOf('<hp:tbl')
    const tblEnd = sectionXml.indexOf('</hp:tbl>', tblSt) + '</hp:tbl>'.length
    const pSt = sectionXml.lastIndexOf('<hp:p ', tblSt)
    const pEnd = sectionXml.indexOf('</hp:p>', tblEnd) + '</hp:p>'.length

    if (tblSt === -1 || tblEnd === -1 || pSt === -1 || pEnd === -1) {
        alert("양식 파일 형식이 올바르지 않습니다.")
        return
    }

    const templatePara = sectionXml.substring(pSt, pEnd)

    const trRegex = /<hp:tr>[\s\S]*?<\/hp:tr>/g
    const templateRows: string[] = []
    let mVar: RegExpExecArray | null
    while ((mVar = trRegex.exec(templatePara)) !== null) {
        templateRows.push(mVar[0])
    }

    if (templateRows.length === 0) {
        console.error("지적사항 사진 양식에 tr 행이 없습니다.")
        alert("지적사항 사진 양식에 tr 행이 없습니다.")
        return
    }

    const baseTemplateRows = templateRows.slice()

    const images: ImageEntry[] = []
    const newParas: string[] = []
    let imgIdx = 0

    for (let i = 0; i < allResults.length; i++) {
        const { insp, res: result } = allResults[i]
        let beforeImgId = null
        let afterImgId = null

        const bImg = await fetchAndCompressImage(result.photo_url)
        if (bImg) {
            const id = `img_defect_b_${imgIdx}`
            images.push({ id, filename: `${id}.${bImg.ext}`, data: bImg.data, ext: bImg.ext, width: bImg.width, height: bImg.height })
            beforeImgId = { id, width: bImg.width, height: bImg.height }
        }
        const aImg = await fetchAndCompressImage(result.after_photo_url)
        if (aImg) {
            const id = `img_defect_a_${imgIdx}`
            images.push({ id, filename: `${id}.${aImg.ext}`, data: aImg.data, ext: aImg.ext, width: aImg.width, height: aImg.height })
            afterImgId = { id, width: aImg.width, height: aImg.height }
        }
        imgIdx++

        // Each section is an independent table, so row offsets start at 0
        const rows = fillSectionRows(baseTemplateRows, insp, result, 0, beforeImgId, afterImgId)

        let newPara = templatePara

        // Ensure unique IDs for duplicate elements to maintain valid XML
        if (i > 0) {
            const newTblId = 2091000000 + i
            const newZOrder = 100 + i
            const newParaId = 2147483648 + i

            newPara = newPara.replace(/<hp:tbl([^>]*)id="(\d+)"/, `<hp:tbl$1id="${newTblId}"`)
            newPara = newPara.replace(/<hp:tbl([^>]+)zOrder="(\d+)"/, `<hp:tbl$1zOrder="${newZOrder}"`)
            newPara = newPara.replace(/<hp:p([^>]*)id="(\d+)"/, `<hp:p$1id="${newParaId}"`)
        }

        const originalRowsBlock = templateRows.join('')
        const newRowsBlock = rows.join('')
        newPara = newPara.replace(originalRowsBlock, newRowsBlock)

        newParas.push(newPara)
    }

    // Replace the original paragraph with the replicated paragraphs
    sectionXml = sectionXml.substring(0, pSt) + newParas.join('') + sectionXml.substring(pEnd)

    for (const img of images) {
        zip.file(`BinData/${img.filename}`, img.data)
    }

    contentHpf = addImageManifest(contentHpf, images)

    zip.file('Contents/section0.xml', sectionXml)
    zip.file('Contents/content.hpf', contentHpf)
    // header.xml은 손상을 방지하기 위해 건드리지 않음.

    const mimetypeContent = await zip.file('mimetype')!.async('string')
    zip.file('mimetype', mimetypeContent, { compression: 'STORE' })

    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    })
    triggerDownload(blob, filename)
}
