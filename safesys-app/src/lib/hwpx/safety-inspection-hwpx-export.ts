import JSZip from 'jszip'

interface InspectionData {
    id: string
    inspection_type: string
    inspection_date: string
    inspection_team: string | null
    management_entity: string | null
    district_name: string | null
    location_province: string | null
    location_city: string | null
    total_budget: number | null
    construction_start: string | null
    construction_end_planned: string | null
    progress_rate: number | null
    major_work_type: string | null
    contractor: string | null
    supervisor_name: string | null
    inspector_opinion: string | null
    good_example_content?: string | null
    signatures?: any[]
}

interface ResultData {
    field_item: string
    findings: string | null
    action_items: string | null
    photo_url?: string | null
    after_photo_url?: string | null
}

interface PhotoData {
    photo_type: string
    photo_url: string
    description: string | null
    supervisor_name: string | null
    photo_date: string | null
}

interface ImageEntry {
    id: string
    filename: string
    data: Uint8Array
    ext: string
}

// ── helpers ──

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

function buildReportFileBaseName(inspection: InspectionData): string {
    const raw = `safety_inspection_${inspection.inspection_type}_${inspection.inspection_date}`
    return raw.replace(/[\\/:*?"<>|]/g, '_')
}

async function fetchImageAsBuffer(url: string): Promise<{ data: Uint8Array; ext: string } | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        let blob = await res.blob()
        const normalized = await normalizeImageBlob(blob)
        if (normalized) blob = normalized
        const buf = await blob.arrayBuffer()
        const mime = (blob.type || '').toLowerCase()
        const ext = mime.includes('png') ? 'png' : 'jpg'
        return { data: new Uint8Array(buf), ext: ext as string }
    } catch {
        return null
    }
}

async function normalizeImageBlob(blob: Blob): Promise<Blob | null> {
    if (typeof document === 'undefined') return null
    try {
        const image = await loadImageFromBlob(blob)
        const maxEdge = 1200
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    } catch {
        return null
    }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
        img.src = url
    })
}

// ── hp:pic XML builder ──

function buildPicXml(binItemId: string, cellW: number, cellH: number): string {
    // 셀 안쪽 여백을 고려하여 이미지 크기 계산 (좌우 141*2, 상하 141*2)
    const margin = 282
    const imgW = cellW - margin
    const imgH = cellH - margin
    return `<hp:pic reverse="0"><hp:sz width="${imgW}" height="${imgH}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:imgRect x="0" y="0" cx="${imgW}" cy="${imgH}"/><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>`
}

// ── Image collector ──

class ImageCollector {
    private idx = 0
    images: ImageEntry[] = []

    async collect(url: string | null | undefined): Promise<string | null> {
        if (!url || !url.trim() || url.trim() === 'N/A') return null
        const img = await fetchImageAsBuffer(url)
        if (!img) return null
        this.idx++
        const id = `image${this.idx}`
        const filename = `${id}.${img.ext}`
        this.images.push({ id, filename, data: img.data, ext: img.ext })
        return id
    }
}

// ── Text placeholder replacement ──

function replacePlaceholders(xml: string, inspection: InspectionData): string {
    const dateStr = inspection.inspection_date || ''

    // 점검반 이름: signatures에서 우선 추출
    let teamStr = inspection.inspection_team || ''
    if (inspection.signatures && inspection.signatures.length > 0) {
        const fromSig = inspection.signatures
            .filter((s: any) => s.role === '점검자')
            .map((s: any) => `${s.position} ${s.name}`.trim())
            .filter((s: string) => s).join(', ')
        if (fromSig) teamStr = fromSig
    }

    // 감독직급/감독명 분리
    const supervisorName = inspection.supervisor_name || ''
    let supervisorTitle = ''
    let supervisorPureName = supervisorName
    // "직급 이름" 형식 처리
    const parts = supervisorName.trim().split(/\s+/)
    if (parts.length >= 2) {
        supervisorTitle = parts[0]
        supervisorPureName = parts.slice(1).join(' ')
    }

    // 서명란 치환자
    const sig1 = inspection.signatures?.find((s: any) => s.role === '현장대리인')
    const sig3 = inspection.signatures?.filter((s: any) => s.role === '점검자')?.[0]
    const sig4 = inspection.signatures?.filter((s: any) => s.role === '점검자')?.[1]

    const replacements: [string, string][] = [
        ['{{projectname}}', inspection.inspection_type || ''],
        ['{{date}}', dateStr],
        ['{{name}}', teamStr],
        ['{{지사명}}', inspection.management_entity || ''],
        ['{{지구명}}', inspection.district_name || ''],
        ['{{도}}', inspection.location_province || ''],
        ['{{시군}}', inspection.location_city || ''],
        ['{{사업비}}', inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : ''],
        ['{{착공}}', inspection.construction_start || ''],
        ['{{준공}}', inspection.construction_end_planned || ''],
        ['{{공정률}}', inspection.progress_rate != null ? `${inspection.progress_rate}%` : ''],
        ['{{주요공종}}', inspection.major_work_type || ''],
        ['{{회사명}}', inspection.contractor || ''],
        ['{{감독직급}}', supervisorTitle],
        ['{{감독명}}', supervisorPureName],
        ['{{점검자 의견}}', inspection.inspector_opinion || ''],
        ['{{직급1}}', sig1?.position || ''],
        ['{{성명1}}', sig1?.name || ''],
        ['{{직급3}}', sig3?.position || ''],
        ['{{성명3}}', sig3?.name || ''],
        ['{{직급4}}', sig4?.position || ''],
    ]

    let result = xml
    for (const [placeholder, value] of replacements) {
        result = result.split(placeholder).join(esc(value))
    }
    return result
}

// ── Result table row adjustment (Table 2090879179) ──

function adjustResultRows(xml: string, results: ResultData[]): string {
    // 테이블 2090879179 찾기
    const tblStartMarker = 'id="2090879179"'
    const tblStartIdx = xml.indexOf(tblStartMarker)
    if (tblStartIdx === -1) return xml

    // </hp:tbl> 찾기
    const tblTagStart = xml.lastIndexOf('<hp:tbl', tblStartIdx)
    const tblEnd = xml.indexOf('</hp:tbl>', tblStartIdx)
    if (tblTagStart === -1 || tblEnd === -1) return xml
    const tblEndFull = tblEnd + '</hp:tbl>'.length

    const tblXml = xml.substring(tblTagStart, tblEndFull)

    // <hp:tr> 태그들 추출 (첫 번째는 헤더, 나머지는 데이터 행)
    const trRegex = /<hp:tr>[\s\S]*?<\/hp:tr>/g
    const rows: string[] = []
    let match
    while ((match = trRegex.exec(tblXml)) !== null) {
        rows.push(match[0])
    }

    if (rows.length < 2) return xml

    const headerRow = rows[0]
    const templateRow = rows[1] // 첫 번째 데이터 행을 템플릿으로 사용

    // 결과 데이터로 행 생성
    const dataCount = Math.max(results.length, 4) // 최소 4행
    const newDataRows: string[] = []
    for (let i = 0; i < dataCount; i++) {
        const r = results[i] || { field_item: '', findings: '', action_items: '' }
        let row = templateRow
        // rowAddr 업데이트
        row = row.replace(/rowAddr="[^"]*"/g, `rowAddr="${i + 1}"`)
        // 치환자 교체
        row = row.replace('{{점검구분}}', esc(r.field_item))
        row = row.replace('{{지적사항, 수범사례}}', esc(r.findings || ''))
        row = row.replace('{{조치할 사항}}', esc(r.action_items || ''))
        newDataRows.push(row)
    }

    // 새 테이블 XML 구성
    const newRowCnt = 1 + dataCount
    let newTblXml = tblXml
    // rowCnt 업데이트
    newTblXml = newTblXml.replace(/rowCnt="\d+"/, `rowCnt="${newRowCnt}"`)
    // 기존 행들을 새 행으로 교체
    const allOldRows = rows.join('')
    const allNewRows = headerRow + newDataRows.join('')
    newTblXml = newTblXml.replace(allOldRows, allNewRows)

    // 높이 재계산 (헤더 2995 + 데이터행 2880/2496 각각)
    const headerH = 2995
    const rowH = 2496
    const firstRowH = 2880
    const totalH = headerH + firstRowH + rowH * (dataCount - 1)
    newTblXml = newTblXml.replace(/height="\d+" heightRelTo/, `height="${totalH}" heightRelTo`)

    return xml.substring(0, tblTagStart) + newTblXml + xml.substring(tblEndFull)
}

// ── Photo page duplication (Table 2090879182 - 지적사항 사진대지) ──

function duplicatePhotoPages(xml: string, results: ResultData[]): string {
    // 지적사항이 있는 결과만 필터링 (after_photo_url 'N/A'는 해당없음 표시이므로 제외)
    const resultsWithPhotos = results.filter(r =>
        (r.photo_url && r.photo_url.trim()) || (r.after_photo_url && r.after_photo_url.trim() && r.after_photo_url.trim() !== 'N/A') ||
        r.findings || r.action_items
    )

    if (resultsWithPhotos.length <= 1) return xml // 1개 이하면 복제 불필요

    // Para 16 (Table 2090879182를 포함하는 paragraph) 찾기
    const tblMarker = 'id="2090879182"'
    const tblIdx = xml.indexOf(tblMarker)
    if (tblIdx === -1) return xml

    // 이 테이블을 포함하는 <hp:p> 찾기
    const paraStart = xml.lastIndexOf('<hp:p ', tblIdx)
    // 이 paragraph의 끝 찾기 - </hp:p> 중 tblIdx 이후의 것
    const afterTbl = xml.indexOf('</hp:tbl>', tblIdx)
    const paraEnd = xml.indexOf('</hp:p>', afterTbl)
    if (paraStart === -1 || paraEnd === -1) return xml
    const paraEndFull = paraEnd + '</hp:p>'.length

    const originalPara = xml.substring(paraStart, paraEndFull)

    // 수범사례 페이지 시작 위치 (복제본 삽입 지점)
    const insertPoint = paraEndFull

    // 첫 번째 결과는 원본 paragraph에서 처리, 나머지를 복제
    // ID를 2091000000부터 시작하여 기존 테이블 ID(2090879177~2090879183)와 충돌 방지
    const copies: string[] = []
    for (let i = 1; i < resultsWithPhotos.length; i++) {
        let copy = originalPara
        const newTblId = 2091000000 + i
        const newZOrder = 100 + i
        copy = copy.replace('id="2090879182"', `id="${newTblId}"`)
        copy = copy.replace(/zOrder="\d+"/, `zOrder="${newZOrder}"`)
        copies.push(copy)
    }

    return xml.substring(0, insertPoint) + copies.join('') + xml.substring(insertPoint)
}

// ── Image placeholder replacement ──

function replaceImagePlaceholder(
    xml: string,
    placeholder: string,
    imageId: string | null,
    cellW: number,
    cellH: number
): string {
    if (!imageId) {
        // 이미지가 없으면 치환자를 빈 문자열로 교체
        return xml.split(placeholder).join('')
    }

    // 치환자를 포함하는 <hp:t> 태그를 찾아서 hp:pic으로 교체
    // 패턴: <hp:t>{{placeholder}}</hp:t> 또는 <hp:t> 로 시작하고 placeholder를 포함
    const picXml = buildPicXml(imageId, cellW, cellH)

    // 치환자가 <hp:t> 안에 단독으로 있는 경우
    const exactPattern = `<hp:t>${placeholder}</hp:t>`
    if (xml.includes(exactPattern)) {
        return xml.replace(exactPattern, picXml)
    }

    // 치환자가 다른 텍스트와 함께 있는 경우는 그냥 제거
    return xml.split(placeholder).join('')
}

// ── 지적사항 사진대지에 사진/텍스트 삽입 ──

function insertPhotosIntoDefectPages(
    xml: string,
    results: ResultData[],
    resultImageIds: { beforeId: string | null; afterId: string | null }[]
): string {
    const resultsWithContent = results.filter(r =>
        (r.photo_url && r.photo_url.trim()) || (r.after_photo_url && r.after_photo_url.trim() && r.after_photo_url.trim() !== 'N/A') ||
        r.findings || r.action_items
    )

    if (resultsWithContent.length === 0) {
        // 사진/내용 없으면 지적사항/조치사항 치환자만 제거
        return xml.replace(/\{\{지적사항\}\}/g, '').replace(/\{\{조치할 사항\}\}/g, '')
    }

    // 각 Table 2090879182 (및 복제본)에 대해 처리
    let result = xml
    for (let i = 0; i < resultsWithContent.length; i++) {
        const origIdx = results.indexOf(resultsWithContent[i])
        const r = resultsWithContent[i]
        const imgIds = resultImageIds[origIdx] || { beforeId: null, afterId: null }

        const tblId = i === 0 ? '2090879182' : `${2091000000 + i}`
        const tblMarker = `id="${tblId}"`
        const tblIdx = result.indexOf(tblMarker)
        if (tblIdx === -1) continue

        // 이 테이블의 범위 찾기
        const tblStart = result.lastIndexOf('<hp:tbl', tblIdx)
        const tblEndTag = result.indexOf('</hp:tbl>', tblIdx)
        if (tblStart === -1 || tblEndTag === -1) continue
        const tblEndFull = tblEndTag + '</hp:tbl>'.length

        let tblXml = result.substring(tblStart, tblEndFull)

        // 지적사항 텍스트 교체 (조치 전 설명)
        tblXml = tblXml.replace('{{지적사항}}', esc(r.findings || ''))
        tblXml = tblXml.replace('{{조치할 사항}}', esc(r.action_items || ''))

        // 조치 전 사진 삽입 (rowAddr="2" 셀)
        if (imgIds.beforeId) {
            tblXml = insertPhotoIntoCell(tblXml, 'rowAddr="2"', imgIds.beforeId, 47900, 27698)
        }

        // 조치 후 사진 삽입 (rowAddr="6" 셀)
        if (imgIds.afterId) {
            tblXml = insertPhotoIntoCell(tblXml, 'rowAddr="6"', imgIds.afterId, 47900, 27425)
        }

        result = result.substring(0, tblStart) + tblXml + result.substring(tblEndFull)
    }

    // 아직 남아있는 치환자 제거
    result = result.replace(/\{\{지적사항\}\}/g, '').replace(/\{\{조치할 사항\}\}/g, '')

    return result
}

function insertPhotoIntoCell(tblXml: string, rowAddrAttr: string, imageId: string, cellW: number, cellH: number): string {
    // 해당 rowAddr의 셀(colSpan="7"인 사진 셀) 찾기
    const rowAddrIdx = tblXml.indexOf(rowAddrAttr)
    if (rowAddrIdx === -1) return tblXml

    // 이 셀의 <hp:run>을 찾아서 안에 pic 삽입
    // 해당 cellAddr 앞의 <hp:tc> 안의 <hp:run> 찾기
    const tcStart = tblXml.lastIndexOf('<hp:tc', rowAddrIdx)
    const tcEnd = tblXml.indexOf('</hp:tc>', rowAddrIdx)
    if (tcStart === -1 || tcEnd === -1) return tblXml

    const tcXml = tblXml.substring(tcStart, tcEnd + '</hp:tc>'.length)

    // <hp:run ...>...</hp:run> 패턴 찾기 (셀 안의 첫 번째 run)
    const runMatch = tcXml.match(/<hp:run charPrIDRef="[^"]*">([\s\S]*?)<\/hp:run>/)
    if (!runMatch) {
        // run이 자기 닫힘인 경우 (<hp:run charPrIDRef="52"/>)
        const selfClosingRun = tcXml.match(/<hp:run charPrIDRef="([^"]*)"\/?>/)
        if (selfClosingRun) {
            const picXml = buildPicXml(imageId, cellW, cellH)
            const newRun = `<hp:run charPrIDRef="${selfClosingRun[1]}">${picXml}</hp:run>`
            const newTcXml = tcXml.replace(selfClosingRun[0], newRun)
            return tblXml.substring(0, tcStart) + newTcXml + tblXml.substring(tcEnd + '</hp:tc>'.length)
        }
        return tblXml
    }

    const picXml = buildPicXml(imageId, cellW, cellH)
    // run 내용을 pic으로 교체
    const charPrMatch = runMatch[0].match(/charPrIDRef="([^"]*)"/)
    const charPrId = charPrMatch ? charPrMatch[1] : '0'
    const newRun = `<hp:run charPrIDRef="${charPrId}">${picXml}</hp:run>`
    const newTcXml = tcXml.replace(runMatch[0], newRun)
    return tblXml.substring(0, tcStart) + newTcXml + tblXml.substring(tcEnd + '</hp:tc>'.length)
}

// ── Content manifest update ──

function addImageManifest(contentHpf: string, images: ImageEntry[]): string {
    if (images.length === 0) return contentHpf

    const manifestItems = images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')

    // </opf:manifest> 앞에 이미지 항목 삽입
    return contentHpf.replace('</opf:manifest>', manifestItems + '</opf:manifest>')
}

// ── Main export function ──

async function buildSafetyInspectionHwpxBlob(
    inspection: InspectionData,
    results: ResultData[],
    photos: PhotoData[],
    _project: unknown
): Promise<{ blob: Blob; fileName: string }> {
    // 1. 템플릿 로드
    const templateResponse = await fetch('/안전점검 양식.hwpx')
    if (!templateResponse.ok) {
        throw new Error(`템플릿 파일 로드 실패: ${templateResponse.status}`)
    }
    const templateZip = await JSZip.loadAsync(await templateResponse.arrayBuffer())

    // 2. XML 파일 읽기
    let sectionXml = await templateZip.file('Contents/section0.xml')!.async('string')
    let contentHpf = await templateZip.file('Contents/content.hpf')!.async('string')

    // 3. 이미지 수집
    const collector = new ImageCollector()
    const imageMap = new Map<string, string | null>()

    // 전경사진
    const sitePhotos = photos.filter(p => p.photo_type === 'site_before')
    imageMap.set('전경사진1', sitePhotos.length > 0 ? await collector.collect(sitePhotos[0].photo_url) : null)
    imageMap.set('전경사진2', sitePhotos.length > 1 ? await collector.collect(sitePhotos[1].photo_url) : null)

    // 지적사항 사진 (조치 전/후)
    const resultImageIds: { beforeId: string | null; afterId: string | null }[] = []
    for (const r of results) {
        const beforeId = await collector.collect(r.photo_url)
        const afterId = await collector.collect(r.after_photo_url)
        resultImageIds.push({ beforeId, afterId })
    }

    // 수범사례 사진
    const goodExPhotos = photos.filter(p => p.photo_type === 'good_example')
    imageMap.set('수범사례1', goodExPhotos.length > 0 ? await collector.collect(goodExPhotos[0].photo_url) : null)
    imageMap.set('수범사례2', goodExPhotos.length > 1 ? await collector.collect(goodExPhotos[1].photo_url) : null)

    // 수범사례 설명 텍스트 치환
    const goodExContent1 = (inspection as any).good_example_content || ''
    const goodExContent2 = goodExPhotos.length > 1 ? (goodExPhotos[1].description || '') : ''
    sectionXml = sectionXml.split('{{수범사례 설명1}}').join(esc(goodExContent1))
    sectionXml = sectionXml.split('{{수범사례 설명2}}').join(esc(goodExContent2))

    // 4. 텍스트 치환
    sectionXml = replacePlaceholders(sectionXml, inspection)

    // 5. 점검결과 테이블 행 조정
    sectionXml = adjustResultRows(sectionXml, results)

    // 6. 지적사항 사진대지 페이지 복제
    sectionXml = duplicatePhotoPages(sectionXml, results)

    // 7. 이미지 치환자 → hp:pic 교체 (전경사진, 수범사례)
    sectionXml = replaceImagePlaceholder(sectionXml, '{{전경사진1}}', imageMap.get('전경사진1') ?? null, 47900, 27132)
    sectionXml = replaceImagePlaceholder(sectionXml, '{{전경사진2}}', imageMap.get('전경사진2') ?? null, 47900, 26859)
    sectionXml = replaceImagePlaceholder(sectionXml, '{{수범사례1}}', imageMap.get('수범사례1') ?? null, 47900, 27698)
    sectionXml = replaceImagePlaceholder(sectionXml, '{{수범사례2}}', imageMap.get('수범사례2') ?? null, 47900, 27425)

    // 8. 지적사항 사진대지에 사진/텍스트 삽입
    sectionXml = insertPhotosIntoDefectPages(sectionXml, results, resultImageIds)

    // 9. content.hpf에 이미지 manifest 추가
    contentHpf = addImageManifest(contentHpf, collector.images)

    // 10. ZIP에 수정된 파일 저장

    // header.xml은 <hh:binDataList>를 변경하면 파일이 손상되므로 수정하지 않습니다.
    templateZip.file('Contents/section0.xml', sectionXml)
    templateZip.file('Contents/content.hpf', contentHpf)
    for (const img of collector.images) {
        templateZip.file(`BinData/${img.filename}`, img.data)
    }



    // 10-2. mimetype은 반드시 STORE(비압축) 방식으로 저장
    const mimetypeFile = templateZip.file('mimetype')
    if (mimetypeFile) {
        const mimetypeContent = await mimetypeFile.async('string')
        templateZip.file('mimetype', mimetypeContent, { compression: 'STORE' })
    }

    // 11. 생성
    const blob = await templateZip.generateAsync({
        type: 'blob',
        mimeType: 'application/hwp+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    })
    const fileName = `${buildReportFileBaseName(inspection)}.hwpx`
    return { blob, fileName }
}

export async function downloadSafetyInspectionHwpx(
    inspection: InspectionData,
    results: ResultData[],
    photos: PhotoData[],
    project: unknown
) {
    const { blob, fileName } = await buildSafetyInspectionHwpxBlob(inspection, results, photos, project)
    triggerDownload(blob, fileName)
}

