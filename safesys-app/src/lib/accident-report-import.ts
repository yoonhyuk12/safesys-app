// 사고보고 문서 업로드의 브라우저 측 처리 — HWPX 텍스트 추출과 자동 채움 API 호출을 담당한다.
import JSZip from 'jszip'

import {
  ACCIDENT_IMPORT_HWPX_MAX_BYTES,
  ACCIDENT_IMPORT_HWPX_MAX_ENTRIES,
  ACCIDENT_IMPORT_HWPX_MAX_SECTION_BYTES,
  ACCIDENT_IMPORT_HWPX_MAX_TOTAL_SECTION_BYTES,
  ACCIDENT_IMPORT_PDF_MAX_BYTES,
  ACCIDENT_IMPORT_TEXT_MAX_CHARS,
  normalizeAccidentExtraction,
} from '@/lib/accident-report-extraction'
import type { AccidentPrefillFields, AccidentPrefillResult } from '@/lib/accident-report-extraction'
import type { AccidentReportPhoto } from '@/lib/accident-report'
import { extractAccidentPdfPhotos } from '@/lib/accident-report-pdf-photos'

/** 사진은 AI 응답이 아닌 로컬 PDF 추출에서만 가져온다. */
export type AccidentDocumentPrefillResult = AccidentPrefillResult & { photos: AccidentReportPhoto[] }

/** 사용자에게 그대로 보여 줄 한국어 메시지를 담는 오류. */
export class AccidentImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccidentImportError'
  }
}

/** 문서 내용을 담은 XML 섹션만 읽는다. 디렉터리 traversal 여지가 없는 정확한 형태다. */
const SECTION_ENTRY_PATTERN = /^Contents\/section(\d+)\.xml$/

const HWPX_MIMETYPE_PREFIX = 'application/hwp+zip'
const HWPX_PACKAGE_ENTRY = 'Contents/content.hpf'
/** mimetype 엔트리는 원래 수십 바이트다. 이보다 크면 읽지 않는다. */
const MIMETYPE_MAX_BYTES = 1024

/**
 * 구조 태그와 글자 태그만 골라 읽는 토큰 패턴.
 * hp:t 안쪽은 자식 태그를 지우고 텍스트 노드만 남긴다.
 */
const HWPX_TOKEN_PATTERN =
  /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|<hp:t(?:\s[^>]*)?\/>|<\/?hp:p(?:\s[^>]*)?\/?>|<\/?hp:tc(?:\s[^>]*)?\/?>|<\/?hp:tr(?:\s[^>]*)?\/?>|<hp:lineBreak(?:\s[^>]*)?\/?>/g

/**
 * 구조 경계는 먼저 표시만 해 두고 마지막에 글자로 바꾼다.
 * 표 칸 안의 단락 경계까지 줄바꿈으로 바꾸면 한 행이 여러 줄로 흩어지기 때문이다.
 */
const MARKER_PARAGRAPH = '\u0001'
const MARKER_CELL = '\u0002'
const MARKER_ROW = '\u0003'

/** JSZip 3.10 런타임에는 있으나 번들된 index.d.ts에 선언되지 않은 부분을 좁게 기술한다. */
interface JSZipStreamingEntry {
  internalStream?: (type: 'uint8array') => {
    on(event: 'data', callback: (chunk: Uint8Array) => void): unknown
    on(event: 'end', callback: () => void): unknown
    on(event: 'error', callback: (error: Error) => void): unknown
    resume(): unknown
    pause(): unknown
  }
  _data?: { uncompressedSize?: number }
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    switch (entity) {
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'amp':
        return '&'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      default:
        return whole
    }
  })
}

/** 구조 표시를 줄바꿈·탭으로 바꾸고 연속 공백·빈 줄을 정리한다. */
function tidyExtractedText(value: string): string {
  const lines = value
    // 이어지는 단락 경계는 하나로 본다.
    .replace(/\u0001+/g, MARKER_PARAGRAPH)
    // 칸 경계에 붙은 단락 경계는 표 한 행이 한 줄로 남도록 흡수한다.
    .replace(/\u0001*\u0002[\u0001\u0002]*/g, MARKER_CELL)
    // 단락·행 경계가 겹쳐도 줄바꿈은 하나다.
    .replace(/[\u0001\u0003]+/g, '\n')
    .replace(/\u0002/g, '\t')
    .split('\n')
    .map((line) => line.replace(/\t{2,}/g, '\t').replace(/[ \u00a0\u3000]{2,}/g, ' ').trim())

  const result: string[] = []
  for (const line of lines) {
    if (!line && (result.length === 0 || !result[result.length - 1])) continue
    result.push(line)
  }
  while (result.length > 0 && !result[result.length - 1]) result.pop()

  return result.join('\n')
}

/** 섹션 XML 한 편에서 글자만 뽑는다. DOMParser를 쓰지 않아 node 테스트에서도 같은 결과가 나온다. */
function extractSectionText(xml: string): string {
  const pieces: string[] = []

  for (const match of xml.matchAll(HWPX_TOKEN_PATTERN)) {
    const tagName = match[0].match(/^<\/?([\w:]+)/)?.[1] ?? ''

    if (tagName === 'hp:t') {
      const inner = match[1]
      // 자식 태그를 지우고 텍스트 노드만 남긴다. 자기닫음 태그는 글자가 없다.
      if (typeof inner === 'string') pieces.push(decodeXmlEntities(inner.replace(/<[^>]*>/g, '')))
      continue
    }
    if (tagName === 'hp:lineBreak') {
      pieces.push('\n')
      continue
    }
    // 열고 닫는 태그 모두 같은 경계로 본다 — 뒤에서 한 번에 정리한다.
    if (tagName === 'hp:tc') pieces.push(MARKER_CELL)
    else if (tagName === 'hp:tr') pieces.push(MARKER_ROW)
    else if (tagName === 'hp:p') pieces.push(MARKER_PARAGRAPH)
  }

  return tidyExtractedText(pieces.join(''))
}

function byteLengthOf(input: ArrayBuffer | Uint8Array | Blob): number {
  if (input instanceof Uint8Array) return input.byteLength
  if (typeof Blob !== 'undefined' && input instanceof Blob) return input.size
  return (input as ArrayBuffer).byteLength
}

async function toBytes(input: ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input
  if (typeof Blob !== 'undefined' && input instanceof Blob) return new Uint8Array(await input.arrayBuffer())
  return new Uint8Array(input as ArrayBuffer)
}

/** 엔트리가 스스로 밝힌 압축해제 크기. 알 수 없으면 null이다. */
function declaredSizeOf(entry: JSZip.JSZipObject): number | null {
  const size = (entry as unknown as JSZipStreamingEntry)._data?.uncompressedSize
  return typeof size === 'number' && Number.isFinite(size) ? size : null
}

/**
 * 엔트리를 상한 안에서만 압축해제한다.
 * zip이 밝힌 크기를 먼저 보고, 스트림을 읽는 동안에도 누적 바이트를 확인해 zip 폭탄을 막는다.
 */
async function readEntryBytes(
  entry: JSZip.JSZipObject,
  budget: number,
  overflowMessage: string
): Promise<Uint8Array> {
  const declared = declaredSizeOf(entry)
  if (declared !== null && declared > budget) throw new AccidentImportError(overflowMessage)

  const streaming = entry as unknown as JSZipStreamingEntry
  if (typeof streaming.internalStream !== 'function') {
    // 스트림 API가 없으면 한 번에 읽고 길이를 확인한다.
    const bytes = await entry.async('uint8array')
    if (bytes.byteLength > budget) throw new AccidentImportError(overflowMessage)
    return bytes
  }

  const stream = streaming.internalStream('uint8array')
  const chunks: Uint8Array[] = []
  let total = 0

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => {
      total += chunk.length
      if (total > budget) {
        stream.pause()
        reject(new AccidentImportError(overflowMessage))
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', () => reject(new AccidentImportError('HWPX 문서를 읽지 못했습니다.')))
    stream.on('end', () => resolve())
    stream.resume()
  })

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

/** HWPX가 맞는지 mimetype 또는 패키지 파일 존재로 판단한다. */
async function assertHwpxPackage(zip: JSZip): Promise<void> {
  const mimetypeEntry = zip.file('mimetype')
  if (mimetypeEntry) {
    const declared = declaredSizeOf(mimetypeEntry)
    if (declared === null || declared <= MIMETYPE_MAX_BYTES) {
      const bytes = await readEntryBytes(
        mimetypeEntry,
        MIMETYPE_MAX_BYTES,
        'HWPX 형식이 아닙니다. 한글(.hwpx) 파일인지 확인해 주세요.'
      )
      if (decodeUtf8(bytes).trim().startsWith(HWPX_MIMETYPE_PREFIX)) return
    }
  }

  if (zip.file(HWPX_PACKAGE_ENTRY)) return

  throw new AccidentImportError('HWPX 형식이 아닙니다. 한글(.hwpx) 파일인지 확인해 주세요.')
}

/**
 * HWPX(zip) 안의 본문 섹션에서 글자만 뽑는다.
 * BinData·Preview·header 등 본문이 아닌 엔트리는 압축해제하지 않는다.
 */
export async function extractHwpxText(
  input: ArrayBuffer | Uint8Array | Blob
): Promise<{ text: string; truncated: boolean }> {
  if (byteLengthOf(input) > ACCIDENT_IMPORT_HWPX_MAX_BYTES) {
    throw new AccidentImportError('HWPX 파일 크기가 15MB를 넘습니다. 사진을 줄여 다시 시도해 주세요.')
  }

  const bytes = await toBytes(input)

  // 인스턴스 생성은 try 밖에 둔다 — 라이브러리 로딩 실패를 "손상된 파일"로 둘러대지 않는다.
  const archive = new JSZip()
  let zip: JSZip
  try {
    zip = await archive.loadAsync(bytes)
  } catch {
    throw new AccidentImportError('암호가 걸렸거나 손상된 HWPX 파일입니다.')
  }

  const entryNames = Object.keys(zip.files)
  if (entryNames.length > ACCIDENT_IMPORT_HWPX_MAX_ENTRIES) {
    throw new AccidentImportError('HWPX 내부 파일이 너무 많습니다.')
  }

  await assertHwpxPackage(zip)

  const sectionNames = entryNames
    .map((name) => ({ name, matched: name.match(SECTION_ENTRY_PATTERN) }))
    .filter((entry): entry is { name: string; matched: RegExpMatchArray } => entry.matched !== null)
    .sort((left, right) => Number(left.matched[1]) - Number(right.matched[1]))
    .map((entry) => entry.name)

  if (sectionNames.length === 0) {
    throw new AccidentImportError('HWPX에서 본문을 찾지 못했습니다.')
  }

  const overflowMessage = 'HWPX 본문이 너무 커서 분석할 수 없습니다.'
  const sections: string[] = []
  let totalBytes = 0

  for (const name of sectionNames) {
    const entry = zip.file(name)
    if (!entry) continue

    const remaining = Math.min(
      ACCIDENT_IMPORT_HWPX_MAX_SECTION_BYTES,
      ACCIDENT_IMPORT_HWPX_MAX_TOTAL_SECTION_BYTES - totalBytes
    )
    if (remaining <= 0) throw new AccidentImportError(overflowMessage)

    const sectionBytes = await readEntryBytes(entry, remaining, overflowMessage)
    totalBytes += sectionBytes.byteLength
    sections.push(extractSectionText(decodeUtf8(sectionBytes)))
  }

  const joined = sections.filter((section) => section.length > 0).join('\n\n')
  if (!joined) {
    throw new AccidentImportError('문서에서 글자를 찾지 못했습니다. 직접 입력해 주세요.')
  }

  const truncated = joined.length > ACCIDENT_IMPORT_TEXT_MAX_CHARS
  return {
    text: truncated ? joined.slice(0, ACCIDENT_IMPORT_TEXT_MAX_CHARS) : joined,
    truncated,
  }
}

type UploadKind = 'pdf' | 'hwpx'

function detectUploadKind(file: File): UploadKind {
  const name = (file.name ?? '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.hwpx')) return 'hwpx'
  if (file.type === 'application/pdf') return 'pdf'
  throw new AccidentImportError('PDF 또는 HWPX 파일만 올릴 수 있습니다.')
}

function messageForStatus(status: number): string {
  switch (status) {
    case 401:
      return '로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.'
    case 403:
      return '이 현장에 접근할 수 없습니다.'
    case 413:
      return '문서가 너무 커서 분석할 수 없습니다.'
    case 429:
      return '문서 분석 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
    case 504:
      return '문서 분석 시간이 초과되었습니다.'
    default:
      return '문서를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

interface PrefillApiResponse {
  success?: unknown
  fields?: unknown
  warnings?: unknown
  error?: unknown
}

function serverWarningsOf(payload: PrefillApiResponse): string[] {
  if (!Array.isArray(payload.warnings)) return []
  return payload.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.length > 0)
}

/** 순서를 지키며 중복 안내를 없앤다 — 서버와 클라이언트가 같은 문장을 낼 수 있다. */
function dedupe(warnings: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const warning of warnings) {
    if (seen.has(warning)) continue
    seen.add(warning)
    result.push(warning)
  }
  return result
}

/**
 * 문서를 자동 채움 API로 보내 초안 필드를 받는다.
 * 실패하면 예외만 던지고 호출자의 초안을 건드리지 않는다.
 */
export async function requestAccidentPrefill(
  file: File,
  projectId: string,
  accessToken: string
): Promise<AccidentDocumentPrefillResult> {
  const trimmedProjectId = (projectId ?? '').trim()
  if (!trimmedProjectId) throw new AccidentImportError('현장을 먼저 선택해 주세요.')

  const trimmedToken = (accessToken ?? '').trim()
  if (!trimmedToken) throw new AccidentImportError('로그인이 필요합니다.')

  const kind = detectUploadKind(file)
  const body = new FormData()
  body.append('project_id', trimmedProjectId)

  let truncatedWarning: string | null = null

  if (kind === 'pdf') {
    if (file.size > ACCIDENT_IMPORT_PDF_MAX_BYTES) {
      throw new AccidentImportError('PDF 크기가 4MB를 넘습니다. 필요한 쪽만 남겨 다시 시도해 주세요.')
    }
    body.append('file', file)
  } else {
    const extracted = await extractHwpxText(file)
    body.append('text', extracted.text)
    if (extracted.truncated) truncatedWarning = '문서가 길어 앞부분 10만 자만 분석했습니다.'
  }

  let response: Response
  try {
    response = await fetch('/api/ai/accident-report', {
      method: 'POST',
      headers: { Authorization: `Bearer ${trimmedToken}` },
      body,
    })
  } catch {
    throw new AccidentImportError('문서 분석 서버에 연결하지 못했습니다.')
  }

  let payload: PrefillApiResponse = {}
  try {
    payload = (await response.json()) as PrefillApiResponse
  } catch {
    payload = {}
  }

  if (!response.ok || payload.success !== true) {
    const serverMessage = typeof payload.error === 'string' && payload.error.trim().length > 0
      ? payload.error.trim()
      : messageForStatus(response.status)
    throw new AccidentImportError(serverMessage)
  }

  // 서버가 이미 정규화했지만 클라이언트도 응답을 신뢰하지 않고 한 번 더 통과시킨다.
  const normalized = normalizeAccidentExtraction(payload.fields)
  const fields: AccidentPrefillFields = normalized.fields
  // 본문 분석이 성공한 뒤 사진 실패는 안내만 추가한다. HWPX 사진 자동 추출은 지원하지 않는다.
  const photoResult = kind === 'pdf'
    ? await extractAccidentPdfPhotos(file).catch(() => ({
        photos: [] as AccidentReportPhoto[],
        warnings: ['PDF 사진을 추출하지 못했습니다. 본문 초안은 유지되며 사진은 직접 첨부해 주세요.'],
      }))
    : { photos: [], warnings: [] }

  return {
    fields,
    photos: photoResult.photos,
    warnings: dedupe([
      ...(truncatedWarning ? [truncatedWarning] : []),
      ...serverWarningsOf(payload),
      ...normalized.warnings,
      ...photoResult.warnings,
    ]),
  }
}
