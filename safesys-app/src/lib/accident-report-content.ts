// 사고보고의 명시 항목 중 전용 필드와 완전히 같은 중복만 출력·추출 시 정리한다.
interface AccidentContent {
  description?: string | null
  work_description?: string | null
  cause?: string | null
}

interface ReportContent {
  victimDetails?: string
  damageDetails?: string
  responsibility?: string
  actionDetails?: string
  noNotificationReason?: string
}

function comparable(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim()
}

function sameDamageItems(body: string, target: string): boolean {
  const items = (value: string) => comparable(value).split(/\n|, +/)
    .map(item => item.trim().replace(/^[○●•-]\s+/, ''))
  const bodyItems = items(body)
  const targetItems = items(target)
  return bodyItems.length > 1 && bodyItems.length === targetItems.length
    && bodyItems.every((item, index) => item !== '' && item === targetItems[index])
}

function removeLabeledDuplicates(text: string, values: Record<string, string | string[] | null | undefined>): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: { label: string; body: string[]; original: string[] }[] = []
  for (const line of lines) {
    const match = /^\s*(?:[○●•-]\s*)?(작업\s*내용|사고\s*내용|사고\s*원인|피해\s*현황|귀책\s*사유|미신고\s*사유)\s*[:：]\s*(.*)$/.exec(line)
    if (match) blocks.push({ label: match[1].replace(/\s/g, ''), body: [match[2]], original: [line] })
    else if (blocks.length) {
      blocks[blocks.length - 1].body.push(line)
      blocks[blocks.length - 1].original.push(line)
    } else blocks.push({ label: '', body: [line], original: [line] })
  }
  const retained = blocks.filter(block => {
    const value = values[block.label]
    const targets = Array.isArray(value) ? value : [value]
    const body = block.body.join('\n')
    return !targets.some(target => target && comparable(target) && (
      comparable(body) === comparable(target) || (block.label === '피해현황' && sameDamageItems(body, target))
    ))
  })
  return retained.length === blocks.length ? text : retained.flatMap(block => block.original).join('\n').trim()
}

function removeVictimPrefix(damage: string, victim: string): string {
  if (!comparable(victim)) return damage
  const normalizedDamage = comparable(damage)
  const normalizedVictim = comparable(victim)
  if (normalizedDamage === normalizedVictim) return ''
  if (normalizedDamage.startsWith(`${normalizedVictim}\n`)) {
    return normalizedDamage.slice(normalizedVictim.length + 1).trim()
  }
  return damage
}

export function cleanAccidentReportContent(accident: AccidentContent, details: ReportContent) {
  const damageDetails = removeVictimPrefix(details.damageDetails ?? '', details.victimDetails ?? '')
  return {
    description: removeLabeledDuplicates(accident.description ?? '', {
      작업내용: accident.work_description,
      사고원인: accident.cause,
      피해현황: [details.damageDetails ?? '', damageDetails],
      귀책사유: details.responsibility,
    }),
    damageDetails,
    actionDetails: removeLabeledDuplicates(details.actionDetails ?? '', { 미신고사유: details.noNotificationReason }),
  }
}
