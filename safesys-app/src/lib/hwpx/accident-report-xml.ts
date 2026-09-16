// 확정 사고보고 양식의 중첩 XML 요소를 원문 서식 그대로 읽고 치환한다.
// ── 양식 XML 스캐너 (중첩 표를 정규식으로 가를 수 없다) ──

export function indexOfTag(xml: string, tag: string, from: number): number {
    let i = from
    for (;;) {
        const at = xml.indexOf(`<${tag}`, i)
        if (at < 0) return -1
        const next = xml[at + tag.length + 1]
        if (next === ' ' || next === '>' || next === '/' || next === '\t' || next === '\n' || next === '\r') return at
        i = at + 1
    }
}

export function matchEnd(xml: string, tag: string, start: number): number {
    const openEnd = xml.indexOf('>', start)
    if (openEnd < 0) throw new Error(`${tag} 여는 태그가 닫히지 않았습니다.`)
    if (xml[openEnd - 1] === '/') return openEnd + 1
    const closeToken = `</${tag}>`
    let depth = 1
    let i = openEnd + 1
    while (depth > 0) {
        const nextOpen = indexOfTag(xml, tag, i)
        const nextClose = xml.indexOf(closeToken, i)
        if (nextClose < 0) throw new Error(`${tag} 닫는 태그를 찾지 못했습니다.`)
        if (nextOpen >= 0 && nextOpen < nextClose) {
            const q = xml.indexOf('>', nextOpen)
            if (xml[q - 1] !== '/') depth++
            i = q + 1
        } else {
            depth--
            i = nextClose + closeToken.length
        }
    }
    return i
}

export type Range = [number, number]

export function topLevelRanges(xml: string, tag: string): Range[] {
    const ranges: Range[] = []
    let i = 0
    for (;;) {
        const start = indexOfTag(xml, tag, i)
        if (start < 0) return ranges
        const end = matchEnd(xml, tag, start)
        ranges.push([start, end])
        i = end
    }
}

export function rebuild(xml: string, ranges: Range[], replacements: string[]): string {
    let out = ''
    let prev = 0
    ranges.forEach(([start, end], i) => {
        out += xml.slice(prev, start) + replacements[i]
        prev = end
    })
    return out + xml.slice(prev)
}

export function stripLineseg(xml: string): string {
    const ranges = topLevelRanges(xml, 'hp:linesegarray')
    return rebuild(xml, ranges, ranges.map(() => ''))
}
