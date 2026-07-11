// 카카오 지도 타일을 안전하게 중계해 캔버스 합성 시 CORS 실패를 보완하는 API

import { NextRequest, NextResponse } from 'next/server'

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 5_000
const ALLOWED_SUFFIXES = ['.daumcdn.net', '.kakaocdn.net', '.daum-img.net']
const ALLOWED_HOST_PREFIX = /^(?:map\d*|mts\d*|t\d+|s\d+|tile\d*|tiles)(?:\.|$)/

function isAllowedUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const allowedSuffix = ALLOWED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && allowedSuffix
      && ALLOWED_HOST_PREFIX.test(hostname)
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

async function readLimitedBody(response: Response) {
  if (!response.body) throw new Error('응답 본문이 없습니다.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('응답 크기 제한을 초과했습니다.')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('url') || ''
  if (!isAllowedUrl(source)) {
    return NextResponse.json({ error: '허용되지 않은 지도 이미지 주소입니다.' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(source, {
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    })
    if (!response.ok) {
      return NextResponse.json({ error: '지도 이미지를 가져오지 못했습니다.' }, { status: 502 })
    }

    const contentType = response.headers.get('content-type')?.split(';')[0].trim() || ''
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 응답만 허용됩니다.' }, { status: 415 })
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json({ error: '지도 이미지가 크기 제한을 초과했습니다.' }, { status: 413 })
    }

    const body = await readLimitedBody(response)
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? '지도 이미지 요청 시간이 초과되었습니다.' : '지도 이미지 중계에 실패했습니다.' },
      { status: timedOut ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
