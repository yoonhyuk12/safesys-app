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
    additional_items?: any[] | null
    signatures?: any[]
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
        return { data: new Uint8Array(buf), ext }
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

function buildPicXml(binItemId: string, cellW: number, cellH: number): string {
    const margin = 282
    const imgW = cellW - margin
    const imgH = cellH - margin
    return `<hp:pic reverse="0"><hp:sz width="${imgW}" height="${imgH}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:imgRect x="0" y="0" cx="${imgW}" cy="${imgH}"/><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${binItemId}</hp:shapeComment><hc:img binaryItemIDRef="${binItemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>`
}

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

// ── 셀 위치 기반 텍스트 삽입 ──

/** 특정 테이블 내에서 colAddr/rowAddr로 셀을 찾아 텍스트 삽입 */
function setCellText(tblXml: string, rowAddr: number, colAddr: number, text: string): string {
    const cellLocator = `colAddr="${colAddr}" rowAddr="${rowAddr}"`
    const cellIdx = tblXml.indexOf(cellLocator)
    if (cellIdx === -1) return tblXml

    const tcStart = tblXml.lastIndexOf('<hp:tc', cellIdx)
    const tcEnd = tblXml.indexOf('</hp:tc>', cellIdx)
    if (tcStart === -1 || tcEnd === -1) return tblXml
    const tcEndFull = tcEnd + '</hp:tc>'.length

    let tcXml = tblXml.substring(tcStart, tcEndFull)
    const escaped = esc(text)

    // Case 1: 빈 <hp:t></hp:t> → 텍스트 삽입
    if (tcXml.includes('<hp:t></hp:t>')) {
        tcXml = tcXml.replace('<hp:t></hp:t>', `<hp:t>${escaped}</hp:t>`)
    }
    // Case 2: self-closing <hp:run charPrIDRef="X"/> → 열린 태그 + <hp:t> + 닫힌 태그로 변환
    else {
        const selfClosingRun = tcXml.match(/<hp:run charPrIDRef="([^"]*)"(\s*)\/?>/)
        if (selfClosingRun) {
            tcXml = tcXml.replace(selfClosingRun[0], `<hp:run charPrIDRef="${selfClosingRun[1]}"><hp:t>${escaped}</hp:t></hp:run>`)
        }
    }

    return tblXml.substring(0, tcStart) + tcXml + tblXml.substring(tcEndFull)
}

/** 특정 테이블 내에서 colAddr/rowAddr로 셀을 찾아 사진(hp:pic) 삽입 */
function setCellPhoto(tblXml: string, rowAddr: number, colAddr: number, imageId: string, cellW: number, cellH: number): string {
    const cellLocator = `colAddr="${colAddr}" rowAddr="${rowAddr}"`
    const cellIdx = tblXml.indexOf(cellLocator)
    if (cellIdx === -1) return tblXml

    const tcStart = tblXml.lastIndexOf('<hp:tc', cellIdx)
    const tcEnd = tblXml.indexOf('</hp:tc>', cellIdx)
    if (tcStart === -1 || tcEnd === -1) return tblXml
    const tcEndFull = tcEnd + '</hp:tc>'.length

    let tcXml = tblXml.substring(tcStart, tcEndFull)
    const picXml = buildPicXml(imageId, cellW, cellH)

    // Case 1: <hp:run ...>내용</hp:run> → pic으로 교체
    const runMatch = tcXml.match(/<hp:run charPrIDRef="([^"]*)">([\s\S]*?)<\/hp:run>/)
    if (runMatch) {
        tcXml = tcXml.replace(runMatch[0], `<hp:run charPrIDRef="${runMatch[1]}">${picXml}</hp:run>`)
    } else {
        // Case 2: self-closing <hp:run .../> → pic 삽입
        const selfRun = tcXml.match(/<hp:run charPrIDRef="([^"]*)"(\s*)\/?>/)
        if (selfRun) {
            tcXml = tcXml.replace(selfRun[0], `<hp:run charPrIDRef="${selfRun[1]}">${picXml}</hp:run>`)
        }
    }

    return tblXml.substring(0, tcStart) + tcXml + tblXml.substring(tcEndFull)
}

/** 테이블 XML 범위 추출 */
function extractTable(xml: string, tableId: string): { start: number; end: number; tbl: string } | null {
    const marker = `id="${tableId}"`
    const markerIdx = xml.indexOf(marker)
    if (markerIdx === -1) return null
    const start = xml.lastIndexOf('<hp:tbl', markerIdx)
    const endTag = xml.indexOf('</hp:tbl>', markerIdx)
    if (start === -1 || endTag === -1) return null
    const end = endTag + '</hp:tbl>'.length
    return { start, end, tbl: xml.substring(start, end) }
}

/** 테이블을 포함하는 <hp:p> paragraph 범위 추출 */
function extractTableParagraph(xml: string, tableId: string): { start: number; end: number; para: string } | null {
    const marker = `id="${tableId}"`
    const markerIdx = xml.indexOf(marker)
    if (markerIdx === -1) return null
    const paraStart = xml.lastIndexOf('<hp:p ', markerIdx)
    const afterTbl = xml.indexOf('</hp:tbl>', markerIdx)
    const paraEnd = xml.indexOf('</hp:p>', afterTbl)
    if (paraStart === -1 || paraEnd === -1) return null
    const end = paraEnd + '</hp:p>'.length
    return { start: paraStart, end, para: xml.substring(paraStart, end) }
}

// ── 카테고리별 행 매핑 (Table 2132489188) ──
// Row 0: 헤더
// Row 1-3: 사전조사 및 작업 전 점검
// Row 4-6: 가설통로의 구조
// Row 7-9: 사다리식 통로의 구조
// Row 10-11: 기타 점검 사항

const CATEGORY_ROW_RANGES: Record<string, number[]> = {
    '가. 사전조사 및 작업 전 점검': [1, 2, 3],
    '나. 가설통로의 구조': [4, 5, 6],
    '다. 사다리식 통로의 구조': [7, 8, 9],
    '라. 기타점검사항': [10, 11],
}

// ── 1. 헤더 영역 텍스트 치환 ──

function fillHeaderText(xml: string, inspection: InspectionData): string {
    const dateStr = inspection.inspection_date || ''
    const dateParts = dateStr.split('-')
    const yymmdd = dateParts.length === 3
        ? `${dateParts[0].slice(2)}. ${dateParts[1]}. ${dateParts[2]}`
        : dateStr

    let teamStr = inspection.inspection_team || ''
    if (inspection.signatures && inspection.signatures.length > 0) {
        const fromSig = inspection.signatures
            .filter((s: any) => s.role === '점검자')
            .map((s: any) => `${s.position} ${s.name}`.trim())
            .filter((s: string) => s).join(', ')
        if (fromSig) teamStr = fromSig
    }

    let result = xml

    // "건설현장 점검카드(사업명)" → "건설현장 점검카드(지구명)"
    result = result.replace(
        '<hp:t>건설현장 점검카드(사업명)</hp:t>',
        `<hp:t>건설현장 점검카드(${esc(inspection.district_name || '')})</hp:t>`
    )

    // " ○ 점검일시 : \u2019일자" → " ○ 점검일시 : YY. MM. DD"
    result = result.replace(
        `<hp:t> ○ 점검일시 : \u2019일자</hp:t>`,
        `<hp:t> ○ 점검일시 : ${esc(yymmdd)}</hp:t>`
    )

    // " ○ 점 검 반 : " → " ○ 점 검 반 : 팀이름"
    result = result.replace(
        '<hp:t> ○ 점 검 반 : </hp:t>',
        `<hp:t> ○ 점 검 반 : ${esc(teamStr)}</hp:t>`
    )

    return result
}

// ── 2. 점검지구 현황 테이블 (Table 2132489187) ──

function fillProjectInfoTable(xml: string, inspection: InspectionData): string {
    const tbl = extractTable(xml, '2132489187')
    if (!tbl) return xml

    const dateStr = inspection.inspection_date || ''
    const dateParts = dateStr.split('-')
    const yymm = dateParts.length >= 2
        ? `${dateParts[0].slice(2)}.${dateParts[1]}`
        : dateStr

    // Row 2 (data row): col0=지구명, col1=도, col2=시군, col3=총사업비, col4=착공, col5=준공, col6=점검공종, col7=시공사
    let tblXml = tbl.tbl
    tblXml = setCellText(tblXml, 2, 0, inspection.district_name || '')
    tblXml = setCellText(tblXml, 2, 1, inspection.location_province || '')
    tblXml = setCellText(tblXml, 2, 2, inspection.location_city || '')
    tblXml = setCellText(tblXml, 2, 3, inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : '')
    tblXml = setCellText(tblXml, 2, 4, inspection.construction_start || '')
    tblXml = setCellText(tblXml, 2, 5, inspection.construction_end_planned || '')
    tblXml = setCellText(tblXml, 2, 6, inspection.major_work_type || '')
    tblXml = setCellText(tblXml, 2, 7, inspection.contractor || '')

    return xml.substring(0, tbl.start) + tblXml + xml.substring(tbl.end)
}

// ── 3. 점검결과 테이블 (Table 2132489188) 지적/조치 내용 삽입 ──

function fillFindingsTable(xml: string, items: any[]): string {
    const tbl = extractTable(xml, '2132489188')
    if (!tbl) return xml

    let tblXml = tbl.tbl

    // 카테고리별로 아이템 그룹핑
    const grouped: Record<string, any[]> = {}
    for (const item of items) {
        if (!grouped[item.category]) grouped[item.category] = []
        grouped[item.category].push(item)
    }

    // 각 카테고리의 행에 지적사항/조치내용 삽입
    for (const [category, rowAddrs] of Object.entries(CATEGORY_ROW_RANGES)) {
        const catItems = (grouped[category] || []).filter((item: any) => item.action && item.action !== '해당없음' && !item.custom)
        const customItem = (grouped[category] || []).find((item: any) => item.custom && item.action && item.action !== '해당없음')
        const allFindings = [...catItems]
        if (customItem) allFindings.push(customItem)

        for (let i = 0; i < rowAddrs.length; i++) {
            const finding = allFindings[i]
            const findingText = finding ? finding.item || '' : ''
            const actionText = finding ? finding.action || '' : ''

            // col=1: 지적사항, col=2: 조치사항
            if (findingText) tblXml = setCellText(tblXml, rowAddrs[i], 1, findingText)
            if (actionText) tblXml = setCellText(tblXml, rowAddrs[i], 2, actionText)
        }
    }

    return xml.substring(0, tbl.start) + tblXml + xml.substring(tbl.end)
}

// ── 4. 사진대지 (Table 2132489189) 복제 및 사진/텍스트 삽입 ──

function fillPhotoPages(
    xml: string,
    findings: any[],
    findingImageIds: { beforeId: string | null; afterId: string | null }[],
    inspection: InspectionData
): string {
    const paraBounds = extractTableParagraph(xml, '2132489189')
    if (!paraBounds) return xml

    if (findings.length === 0) {
        // 지적사항 없으면 사진대지 페이지 제거
        return xml.substring(0, paraBounds.start) + xml.substring(paraBounds.end)
    }

    const dateStr = inspection.inspection_date || ''
    const dateParts = dateStr.split('-')
    const yymmdd = dateParts.length === 3
        ? `${dateParts[0].slice(2)}. ${dateParts[1]}. ${dateParts[2]}`
        : dateStr

    const copies: string[] = []
    for (let i = 0; i < findings.length; i++) {
        let copy = i === 0
            ? paraBounds.para
            : paraBounds.para.replace('id="2132489189"', `id="${2133000000 + i}"`)

        const f = findings[i]
        const imgs = findingImageIds[i] || { beforeId: null, afterId: null }
        const findingText = f.item || ''
        const actionText = f.action || ''

        // 테이블 범위 추출 (copy 내에서)
        const tblId = i === 0 ? '2132489189' : `${2133000000 + i}`
        const tblBounds = extractTable(copy, tblId)
        if (!tblBounds) { copies.push(copy); continue }

        let tblXml = tblBounds.tbl

        // Row 0: col=1 → 지구명값, col=5 → 공사감독원값
        tblXml = setCellText(tblXml, 0, 1, inspection.district_name || '')
        tblXml = setCellText(tblXml, 0, 5, inspection.supervisor_name || '')

        // Row 1: col=1 → 일시, col=4에 지적사항 텍스트 추가
        tblXml = setCellText(tblXml, 1, 1, yymmdd)
        // "(조치 전) " 뒤에 지적사항 텍스트 삽입
        tblXml = tblXml.replace(
            '<hp:t> (조치 전) </hp:t>',
            `<hp:t> (조치 전) ${esc(findingText)}</hp:t>`
        )
        // fallback: 텍스트가 약간 다를 수 있음
        tblXml = tblXml.replace(
            '<hp:t> (조치 전)</hp:t>',
            `<hp:t> (조치 전) ${esc(findingText)}</hp:t>`
        )

        // Row 2: 조치전 사진
        if (imgs.beforeId) {
            tblXml = setCellPhoto(tblXml, 2, 0, imgs.beforeId, 47900, 27698)
        }

        // Row 4: col=1 → 지구명값, col=6 → 공사감독원값
        tblXml = setCellText(tblXml, 4, 1, inspection.district_name || '')
        tblXml = setCellText(tblXml, 4, 6, inspection.supervisor_name || '')

        // Row 5: col=1 → 일시, col=4에 조치할 사항 텍스트 추가
        tblXml = setCellText(tblXml, 5, 1, yymmdd)
        tblXml = tblXml.replace(
            '<hp:t> (조치 후)</hp:t>',
            `<hp:t> (조치 후) ${esc(actionText)}</hp:t>`
        )

        // Row 6: 조치후 사진
        if (imgs.afterId) {
            tblXml = setCellPhoto(tblXml, 6, 0, imgs.afterId, 47900, 27425)
        }

        copy = copy.substring(0, tblBounds.start) + tblXml + copy.substring(tblBounds.end)
        copies.push(copy)
    }

    return xml.substring(0, paraBounds.start) + copies.join('') + xml.substring(paraBounds.end)
}

// ── content.hpf 이미지 manifest 추가 ──

function addImageManifest(contentHpf: string, images: ImageEntry[]): string {
    if (images.length === 0) return contentHpf
    const manifestItems = images.map(img =>
        `<opf:item id="${img.id}" href="BinData/${img.filename}" media-type="image/${img.ext === 'jpg' ? 'jpeg' : img.ext}" isEmbeded="1"/>`
    ).join('')
    return contentHpf.replace('</opf:manifest>', manifestItems + '</opf:manifest>')
}

// ── Main export function ──

async function buildSpecialInspectionHwpxBlob(
    inspection: InspectionData
): Promise<{ blob: Blob; fileName: string }> {
    // 1. 템플릿 로드
    const templateResponse = await fetch('/특별점검 양식.hwpx')
    if (!templateResponse.ok) {
        throw new Error(`템플릿 파일 로드 실패: ${templateResponse.status}`)
    }
    const templateZip = await JSZip.loadAsync(await templateResponse.arrayBuffer())

    // 2. XML 파일 읽기
    let sectionXml = await templateZip.file('Contents/section0.xml')!.async('string')
    let contentHpf = await templateZip.file('Contents/content.hpf')!.async('string')

    const items = (inspection.additional_items as any[]) || []
    const findings = items.filter(item => item.action && item.action !== '해당없음')

    // 3. 이미지 수집
    const collector = new ImageCollector()
    const findingImageIds: { beforeId: string | null; afterId: string | null }[] = []
    for (const f of findings) {
        const beforeId = await collector.collect(f.photo_url)
        const afterId = await collector.collect(f.after_photo_url)
        findingImageIds.push({ beforeId, afterId })
    }

    // 4. 헤더 영역 텍스트 채우기 (사업명, 일자, 점검반)
    sectionXml = fillHeaderText(sectionXml, inspection)

    // 5. 점검지구 현황 테이블 채우기
    sectionXml = fillProjectInfoTable(sectionXml, inspection)

    // 6. 점검결과 테이블 채우기
    sectionXml = fillFindingsTable(sectionXml, items)

    // 7. 사진대지 처리
    sectionXml = fillPhotoPages(sectionXml, findings, findingImageIds, inspection)

    // 8. 이미지 manifest 추가
    contentHpf = addImageManifest(contentHpf, collector.images)

    // 9. ZIP에 수정된 파일 저장
    templateZip.file('Contents/section0.xml', sectionXml)
    templateZip.file('Contents/content.hpf', contentHpf)
    for (const img of collector.images) {
        templateZip.file(`BinData/${img.filename}`, img.data)
    }

    const mimetypeFile = templateZip.file('mimetype')
    if (mimetypeFile) {
        const mimetypeContent = await mimetypeFile.async('string')
        templateZip.file('mimetype', mimetypeContent, { compression: 'STORE' })
    }

    // 10. 생성
    const blob = await templateZip.generateAsync({
        type: 'blob',
        mimeType: 'application/hwp+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    })
    const dateStr = (inspection.inspection_date || '').replace(/-/g, '')
    const fileName = `특별점검_${dateStr}.hwpx`
    return { blob, fileName }
}

export async function downloadSpecialInspectionHwpx(inspection: InspectionData) {
    const { blob, fileName } = await buildSpecialInspectionHwpxBlob(inspection)
    triggerDownload(blob, fileName)
}
