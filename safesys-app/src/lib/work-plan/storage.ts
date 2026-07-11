// 작업계획서 이미지·PDF 데이터 URL의 Storage 업로드와 저장 파일 정리를 담당하는 모듈

import { supabase } from '@/lib/supabase'

const BUCKET = 'work-plans'
const MAX_FILE_BYTES = 50 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
])

export interface WorkPlanUploadResult {
  url: string | null
  uploaded: boolean
}

function parseDataUrl(source: string): Blob {
  const match = /^data:([^;,]+)((?:;[^,]*)*),([\s\S]*)$/.exec(source)
  if (!match) throw new Error('파일 데이터를 읽을 수 없습니다.')

  const contentType = match[1].toLowerCase()
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('PNG, JPEG, WebP 이미지 또는 PDF 파일만 사용할 수 있습니다.')
  }

  const parameters = match[2].split(';').filter(Boolean).map((parameter) => parameter.toLowerCase())
  const payload = match[3]

  try {
    let bytes: Uint8Array
    if (parameters.includes('base64')) {
      const maximumBase64Length = Math.ceil(MAX_FILE_BYTES / 3) * 4
      if (payload.length > maximumBase64Length || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
        throw new Error('invalid base64')
      }
      const decoded = globalThis.atob(payload)
      if (decoded.length > MAX_FILE_BYTES) throw new Error('file too large')
      bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
    } else {
      if (payload.length > MAX_FILE_BYTES * 3) throw new Error('file too large')
      bytes = new TextEncoder().encode(decodeURIComponent(payload))
    }

    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error('file too large')
    }
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    return new Blob([buffer], { type: contentType })
  } catch (error) {
    if (error instanceof Error && error.message === 'file too large') {
      throw new Error('파일 크기는 50MB 이하여야 합니다.')
    }
    throw new Error('파일 데이터가 올바르지 않습니다.')
  }
}

function isPublicUrl(source: string): boolean {
  try {
    const url = new URL(source)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function safeFileName(fileName: string, contentType: string): string {
  const extensionByType: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  }
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[/\\]+/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120)

  return normalized || `upload.${extensionByType[contentType]}`
}

function safeProjectId(projectId: string): string {
  const normalized = projectId.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error('프로젝트 식별자가 올바르지 않습니다.')
  }
  return normalized
}

export async function uploadWorkPlanSource(
  source: string | null,
  projectId: string,
  fileName: string,
): Promise<WorkPlanUploadResult> {
  const normalizedSource = source?.trim() || null
  if (!normalizedSource) return { url: null, uploaded: false }
  if (isPublicUrl(normalizedSource)) return { url: normalizedSource, uploaded: false }

  const blob = parseDataUrl(normalizedSource)
  const path = `${safeProjectId(projectId)}/${Date.now()}_${safeFileName(fileName, blob.type)}`
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  })

  if (error) throw new Error(`파일 업로드에 실패했습니다. ${error.message}`)
  const { publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(data.path).data
  if (!publicUrl) throw new Error('업로드한 파일의 공개 주소를 만들지 못했습니다.')
  return { url: publicUrl, uploaded: true }
}

function storagePathFromPublicUrl(source: string): string | null {
  try {
    const url = new URL(source)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const match = /^\/storage\/v1\/object\/public\/work-plans\/(.+)$/.exec(url.pathname)
    if (!match) return null

    const path = decodeURIComponent(match[1])
    const segments = path.split('/')
    if (segments.length !== 2
      || !/^[A-Za-z0-9_-]+$/.test(segments[0])
      || !/^\d+_[A-Za-z0-9._-]+$/.test(segments[1])) {
      return null
    }
    return path
  } catch {
    return null
  }
}

export async function removeWorkPlanStorageUrls(
  urls: readonly (string | null | undefined)[],
): Promise<void> {
  const paths = [...new Set(urls.flatMap((url) => {
    if (!url) return []
    const path = storagePathFromPublicUrl(url)
    return path ? [path] : []
  }))]
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) throw new Error(`저장 파일 삭제에 실패했습니다. ${error.message}`)
}
