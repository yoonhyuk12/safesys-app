'use client'
// TBM 제출 현장을 AI로 분석해 발주청·시공사에 텔레그램 메시지를 일괄 발송하는 모달
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, Loader2, Send, ArrowLeft, FileSpreadsheet } from 'lucide-react'
import type { TBMRecord } from '@/lib/tbm'
import { parsePersonnelCount } from '@/lib/chat/tbm-personnel'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { exportTbmTelegramAnalysis, type TbmAnalysisExportRow } from '@/lib/excel/tbm-telegram-analysis-export'

const BRANCH_SORT_INDEX = new Map(
  Object.entries(BRANCH_OPTIONS).flatMap(([hq, branches], hqIndex) =>
    branches.map((branch, branchIndex) => [`${hq}||${branch}`, hqIndex * 1000 + branchIndex] as const)
  )
)

const BRANCH_NAME_SORT_INDEX = new Map(
  Array.from(new Set(Object.values(BRANCH_OPTIONS).flat())).map((branch, index) => [branch, index] as const)
)

interface TBMTelegramBroadcastModalProps {
  isOpen: boolean
  onClose: () => void
  records: TBMRecord[]   // 호출부에서 이미 작업없음 제외·당일 필터 적용됨
  selectedDate: string   // YYYY-MM-DD
}

interface PrepareResultItem {
  projectId: string | null
  projectName: string
  projectCategory: string
  hasClientTelegram: boolean
  hasContractorTelegram: boolean
}

interface PrepareResponse {
  success?: boolean
  results?: PrepareResultItem[]
  error?: string
}

interface AnalyzeResultItem {
  key: string
  analysis: string
  message: string
}

interface AnalyzeResponse {
  success?: boolean
  results?: AnalyzeResultItem[]
  error?: string
}

interface SendOutcome {
  attempted: boolean
  ok: boolean
  description?: string
}

interface SendResultItem {
  key: string
  projectId: string | null
  projectName: string
  client: SendOutcome | null
  contractor: SendOutcome | null
}

interface SendResponse {
  success?: boolean
  results?: unknown
  error?: string
}

// TBM 레코드에 prepare 결과(소관사업·수신 가능 여부)를 결합한 대상 행
interface TargetRow {
  record: TBMRecord
  projectId: string | null
  projectCategory: string
  hasClientTelegram: boolean
  hasContractorTelegram: boolean
  personnelText: string
}

// 분석 결과 행 — 메시지는 사용자가 수정 가능, 발송 후 결과 부착
interface AnalyzedRow extends TargetRow {
  analysis: string
  message: string
  sendClient: boolean
  sendContractor: boolean
  sendResult?: SendResultItem
}

// 발송 진행 모달 — 발송 요청 시점의 대상 스냅샷에 결과를 부착해 표시한다
interface SendProgressItem {
  key: string
  projectName: string
  branchName: string
  sendClient: boolean
  sendContractor: boolean
  result?: SendResultItem
}

interface SendProgressState {
  status: 'sending' | 'done' | 'error'
  items: SendProgressItem[]
  error?: string
}

const ALL_CATEGORY = '전체'
const PREPARE_CHUNK_SIZE = 100
const MAX_ANALYZE_TARGETS = 50
const MAX_SEND_TARGETS = 30
const MIN_MODAL_HEIGHT = 320

function isSendOutcome(value: unknown): value is SendOutcome {
  if (!value || typeof value !== 'object') return false
  const outcome = value as Record<string, unknown>
  return (
    typeof outcome.attempted === 'boolean' &&
    typeof outcome.ok === 'boolean' &&
    (outcome.description === undefined || typeof outcome.description === 'string')
  )
}

// 메시지 textarea 높이를 내용에 맞춘다 — border-box 기준이라 위아래 테두리 2px를 더한다
function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

function toUserFacingMessage(message: string): string {
  return message
    .replace(/텔레그램 메시지/g, '메시지')
    .replace(/텔레그램/g, '메시지')
}

async function parseJsonResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const rawBody = await response.text()

  try {
    return JSON.parse(rawBody) as T
  } catch (error) {
    console.error('TBM AI API 응답 파싱 오류', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      preview: rawBody.slice(0, 200),
      error,
    })
    throw new Error(`${fallbackMessage} (HTTP ${response.status})`)
  }
}

function toUserFacingOutcome(outcome: SendOutcome | null): SendOutcome | null {
  if (!outcome) return null
  return {
    ...outcome,
    description: outcome.description
      ? toUserFacingMessage(outcome.description)
      : undefined,
  }
}

function validateSendResults(
  value: unknown,
  expectedKeys: string[]
): Map<string, SendResultItem> | null {
  if (!Array.isArray(value) || value.length !== expectedKeys.length) return null

  const expected = new Set(expectedKeys)
  const byKey = new Map<string, SendResultItem>()
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (
      typeof row.key !== 'string' ||
      !expected.has(row.key) ||
      byKey.has(row.key) ||
      (row.projectId !== null && typeof row.projectId !== 'string') ||
      typeof row.projectName !== 'string' ||
      (row.client !== null && !isSendOutcome(row.client)) ||
      (row.contractor !== null && !isSendOutcome(row.contractor))
    ) {
      return null
    }
    const sendResult = row as unknown as SendResultItem
    byKey.set(row.key, {
      ...sendResult,
      client: toUserFacingOutcome(sendResult.client),
      contractor: toUserFacingOutcome(sendResult.contractor),
    })
  }

  return byKey.size === expected.size ? byKey : null
}

function withoutSendResult(row: AnalyzedRow): AnalyzedRow {
  const next = { ...row }
  delete next.sendResult
  return next
}

// 진행 모달의 수신자별 상태 셀 — 발송 전·중·후 상태를 한눈에 보여준다
function SendProgressOutcomeCell({
  selected,
  status,
  outcome,
}: {
  selected: boolean
  status: SendProgressState['status']
  outcome: SendOutcome | null | undefined
}) {
  if (!selected) return <span className="text-gray-300">—</span>
  if (status === 'sending') {
    return (
      <span className="inline-flex items-center gap-1 text-sky-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        발송 중
      </span>
    )
  }
  if (!outcome) return <span className="text-gray-400">결과 미확인</span>
  if (outcome.ok) return <span className="text-green-600">✓ 성공</span>
  return (
    <span className="text-red-600" title={outcome.description || ''}>
      ✗ 실패{outcome.description ? ` · ${outcome.description}` : ''}
    </span>
  )
}

const getAccessToken = async (forceRefresh = false) => {
  const { data: { session }, error } = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error(
      forceRefresh
        ? '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
        : '로그인 세션이 없습니다. 다시 로그인해 주세요.'
    )
  }
  return session.access_token
}

const fetchWithAuth = async (
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> => {
  const send = async (accessToken: string) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    return fetch(input, { ...init, headers })
  }

  const response = await send(await getAccessToken())
  if (response.status !== 401) return response

  return send(await getAccessToken(true))
}

const TBMTelegramBroadcastModal: React.FC<TBMTelegramBroadcastModalProps> = ({
  isOpen,
  onClose,
  records,
  selectedDate
}) => {
  const [step, setStep] = useState<'targets' | 'results'>('targets')

  // 1단계 — 대상 정리
  const [prepareLoading, setPrepareLoading] = useState(false)
  const [prepareError, setPrepareError] = useState('')
  const [prepareAttempt, setPrepareAttempt] = useState(0)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORY)
  const [userRequest, setUserRequest] = useState('')

  // 2단계 — 분석 결과
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [rows, setRows] = useState<AnalyzedRow[]>([])

  // 발송
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendProgress, setSendProgress] = useState<SendProgressState | null>(null)
  const [sendElapsedSeconds, setSendElapsedSeconds] = useState(0)

  // 창 높이 드래그 조절 — null이면 내용 크기(max-h-[90vh] 상한) 그대로
  const [modalHeight, setModalHeight] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // records는 호출부에서 렌더마다 새 배열로 계산되므로 ref로 받아 effect 재실행을 막는다
  const recordsRef = useRef(records)
  recordsRef.current = records
  const analyzeRequestGenerationRef = useRef(0)
  const sendReservationRef = useRef<{ fingerprint: string; requestId: string } | null>(null)

  // 모달이 열릴 때 상태 초기화 후 prepare 트리거
  useEffect(() => {
    analyzeRequestGenerationRef.current += 1
    if (!isOpen) return
    setStep('targets')
    setTargets([])
    setCategoryFilter(ALL_CATEGORY)
    setUserRequest('')
    setRows([])
    setAnalyzing(false)
    setAnalyzeError('')
    setSendError('')
    setSendProgress(null)
  }, [isOpen])

  // prepare 호출 — 소관사업·텔레그램 수신 가능 여부 로드
  useEffect(() => {
    if (!isOpen) return
    const currentRecords = recordsRef.current
    let cancelled = false

    const run = async () => {
      setPrepareLoading(true)
      setPrepareError('')
      try {
        const results: PrepareResultItem[] = []
        for (let start = 0; start < currentRecords.length; start += PREPARE_CHUNK_SIZE) {
          if (cancelled) return
          const chunk = currentRecords.slice(start, start + PREPARE_CHUNK_SIZE)
          const res = await fetchWithAuth('/api/tbm-telegram/prepare', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              items: chunk.map(r => ({
                projectId: r.project_id || null,
                projectName: r.project_name
              }))
            })
          })
          const data = await parseJsonResponse<PrepareResponse>(
            res,
            '대상 정보를 불러오지 못했습니다.'
          )
          if (!res.ok || !Array.isArray(data.results)) {
            throw new Error(data.error || '대상 정보를 불러오지 못했습니다.')
          }
          if (data.results.length !== chunk.length) {
            throw new Error('대상 정보 응답 건수가 요청과 일치하지 않습니다.')
          }
          results.push(...data.results)
        }
        if (cancelled) return
        const combined: TargetRow[] = currentRecords.map((record, i) => {
          const info = results[i]
          const personnel = typeof record.personnel_total_count === 'number'
            ? record.personnel_total_count
            : parsePersonnelCount(record.attendees)
          return {
            record,
            projectId: info ? info.projectId : (record.project_id || null),
            projectCategory: info?.projectCategory || '미분류',
            hasClientTelegram: info?.hasClientTelegram ?? false,
            hasContractorTelegram: info?.hasContractorTelegram ?? false,
            personnelText: `${personnel}명`
          }
        })
        const sorted = [...combined].sort((a, b) => {
          const aBranchOrder = BRANCH_SORT_INDEX.get(`${a.record.managing_hq}||${a.record.managing_branch}`)
            ?? BRANCH_NAME_SORT_INDEX.get(a.record.managing_branch)
            ?? Number.MAX_SAFE_INTEGER
          const bBranchOrder = BRANCH_SORT_INDEX.get(`${b.record.managing_hq}||${b.record.managing_branch}`)
            ?? BRANCH_NAME_SORT_INDEX.get(b.record.managing_branch)
            ?? Number.MAX_SAFE_INTEGER
          if (aBranchOrder !== bBranchOrder) return aBranchOrder - bBranchOrder

          const byCategory = a.projectCategory.localeCompare(b.projectCategory, 'ko')
          if (byCategory !== 0) return byCategory
          return a.record.project_name.localeCompare(b.record.project_name, 'ko')
        })
        setTargets(sorted)
      } catch (err) {
        if (!cancelled) {
          setPrepareError(err instanceof Error ? err.message : '대상 정보를 불러오지 못했습니다.')
        }
      } finally {
        if (!cancelled) setPrepareLoading(false)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [isOpen, prepareAttempt])

  // 발송 진행 모달의 경과 시간 표시
  useEffect(() => {
    if (sendProgress?.status !== 'sending') return
    setSendElapsedSeconds(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setSendElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [sendProgress?.status])

  // 소관사업 드롭다운 옵션 — prepare 결과의 distinct 카테고리(가나다순)와 대상 건수
  const categories = useMemo(() => {
    const countByCategory = new Map<string, number>()
    for (const t of targets) {
      countByCategory.set(t.projectCategory, (countByCategory.get(t.projectCategory) ?? 0) + 1)
    }
    return Array.from(countByCategory.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [targets])

  // 사용자가 선택한 소관사업으로 필터된 대상 — 이후 분석·발송은 모두 이 배열만 사용
  const filteredTargets = useMemo(() => {
    if (categoryFilter === ALL_CATEGORY) return targets
    return targets.filter(t => t.projectCategory === categoryFilter)
  }, [targets, categoryFilter])

  const checkedCount = rows.filter(r => r.sendClient || r.sendContractor).length
  const selectedClientCount = rows.filter(r => r.sendClient).length
  const selectedContractorCount = rows.filter(r => r.sendContractor).length
  const hasSelectedEmptyMessage = rows.some(
    r => (r.sendClient || r.sendContractor) && !r.message.trim()
  )
  const analyzeLimitExceeded = filteredTargets.length > MAX_ANALYZE_TARGETS
  const sendLimitExceeded = checkedCount > MAX_SEND_TARGETS

  const handleClose = () => {
    if (sending) return
    analyzeRequestGenerationRef.current += 1
    onClose()
  }

  // 하단 핸들 드래그로 창 높이 조절 — 모달이 세로 중앙 정렬이라 커서 이동량의 2배로 키워야 핸들이 커서를 따라온다
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const handle = e.currentTarget
    const startY = e.clientY
    const startHeight = panelRef.current?.getBoundingClientRect().height
    if (!startHeight) return
    handle.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      setModalHeight(Math.max(MIN_MODAL_HEIGHT, startHeight + (ev.clientY - startY) * 2))
    }
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
      handle.removeEventListener('pointercancel', onEnd)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
    handle.addEventListener('pointercancel', onEnd)
  }

  const startAnalyze = async () => {
    const sites = filteredTargets
    if (sites.length === 0 || sites.length > MAX_ANALYZE_TARGETS || !userRequest.trim()) return
    const requestGeneration = analyzeRequestGenerationRef.current + 1
    analyzeRequestGenerationRef.current = requestGeneration
    setStep('results')
    setAnalyzing(true)
    setAnalyzeError('')
    setRows([])
    setSendError('')
    try {
      const res = await fetchWithAuth('/api/tbm-telegram/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userRequest: userRequest.trim(),
          date: selectedDate,
          sites: sites.map(t => ({
            key: t.record.id,
            projectName: t.record.project_name,
            projectCategory: t.projectCategory,
            todayWork: t.record.today_work || '',
            personnel: t.personnelText,
            equipment: t.record.equipment_input || ''
          }))
        })
      })
      const data = await parseJsonResponse<AnalyzeResponse>(
        res,
        'AI 분석 요청을 처리하지 못했습니다.'
      )
      if (!res.ok || !data.results) {
        throw new Error(data.error || 'AI 분석에 실패했습니다.')
      }
      if (requestGeneration !== analyzeRequestGenerationRef.current) return
      const byKey = new Map(data.results.map(r => [r.key, r]))
      setRows(sites.map(t => {
        const result = byKey.get(t.record.id)
        return {
          ...t,
          analysis: result?.analysis || '',
          message: result?.message || '',
          sendClient: t.hasClientTelegram,
          sendContractor: t.hasContractorTelegram
        }
      }))
    } catch (err) {
      if (requestGeneration !== analyzeRequestGenerationRef.current) return
      setAnalyzeError(err instanceof Error ? err.message : 'AI 분석에 실패했습니다.')
    } finally {
      if (requestGeneration === analyzeRequestGenerationRef.current) {
        setAnalyzing(false)
      }
    }
  }

  const updateSendRecipient = (
    id: string,
    recipient: 'client' | 'contractor',
    selected: boolean
  ) => {
    setRows(prev => prev.map(row => {
      if (row.record.id !== id) return row
      return recipient === 'client'
        ? { ...row, sendClient: selected }
        : { ...row, sendContractor: selected }
    }))
  }

  const updateMessage = (id: string, message: string) => {
    setRows(prev => prev.map(r => r.record.id === id ? { ...r, message } : r))
  }

  const handleSend = async () => {
    const targetsToSend = rows.filter(r => r.sendClient || r.sendContractor)
    if (
      targetsToSend.length === 0 ||
      targetsToSend.length > MAX_SEND_TARGETS ||
      hasSelectedEmptyMessage
    ) return
    const recipientSummary = [
      selectedClientCount > 0 ? `발주청 ${selectedClientCount}건` : null,
      selectedContractorCount > 0 ? `시공사 ${selectedContractorCount}건` : null,
    ].filter(Boolean).join(' · ')
    if (!window.confirm(
      `선택한 ${targetsToSend.length}개 현장에 메시지를 발송하시겠습니까?\n(${recipientSummary})`
    )) return

    const items = targetsToSend.map(r => ({
      key: r.record.id,
      projectId: r.projectId,
      projectName: r.record.project_name.trim(),
      message: r.message.trim(),
      recipients: {
        client: r.sendClient,
        contractor: r.sendContractor,
      },
    }))
    const fingerprint = JSON.stringify({ items })
    const previousReservation = sendReservationRef.current
    const requestId = previousReservation?.fingerprint === fingerprint
      ? previousReservation.requestId
      : crypto.randomUUID()
    sendReservationRef.current = { fingerprint, requestId }

    const selectedKeys = new Set(targetsToSend.map(row => row.record.id))
    setRows(prev => prev.map(row => (
      selectedKeys.has(row.record.id) ? withoutSendResult(row) : row
    )))
    setSendProgress({
      status: 'sending',
      items: targetsToSend.map(r => ({
        key: r.record.id,
        projectName: r.record.project_name,
        branchName: r.record.managing_branch || '지사 미분류',
        sendClient: r.sendClient,
        sendContractor: r.sendContractor,
      })),
    })
    setSending(true)
    setSendError('')
    try {
      const res = await fetchWithAuth('/api/tbm-telegram/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId,
          items
        })
      })
      const data = await parseJsonResponse<SendResponse>(
        res,
        '메시지 발송 요청을 처리하지 못했습니다.'
      )
      if (!res.ok || data.success !== true) {
        throw new Error(toUserFacingMessage(data.error || '메시지 발송에 실패했습니다.'))
      }
      const sendResultByRecordId = validateSendResults(
        data.results,
        targetsToSend.map(row => row.record.id)
      )
      if (!sendResultByRecordId) {
        throw new Error('메시지 발송 결과 형식이 올바르지 않습니다.')
      }
      setRows(prev => prev.map(row => {
        const result = sendResultByRecordId.get(row.record.id)
        return result ? { ...row, sendResult: result } : row
      }))
      setSendProgress(prev => prev?.status === 'sending'
        ? {
          ...prev,
          status: 'done',
          items: prev.items.map(item => {
            const result = sendResultByRecordId.get(item.key)
            return result ? { ...item, result } : item
          }),
        }
        : prev)
      sendReservationRef.current = null
    } catch (err) {
      const message = err instanceof Error ? err.message : '메시지 발송에 실패했습니다.'
      setSendError(message)
      setSendProgress(prev => prev?.status === 'sending'
        ? { ...prev, status: 'error', error: message }
        : prev)
    } finally {
      setSending(false)
    }
  }

  const closeSendProgress = () => {
    if (sending) return
    setSendProgress(null)
  }

  // 진행 모달 요약 — 수신자 단위(발주청·시공사 각각 1건)로 집계
  const sendOutcomes = sendProgress
    ? sendProgress.items.flatMap(item =>
      [item.result?.client, item.result?.contractor].filter((o): o is SendOutcome => Boolean(o))
    )
    : []
  const sendSuccessCount = sendOutcomes.filter(o => o.ok).length
  const sendFailCount = sendOutcomes.length - sendSuccessCount
  const sendRecipientCount = sendProgress
    ? sendProgress.items.reduce(
      (sum, item) => sum + (item.sendClient ? 1 : 0) + (item.sendContractor ? 1 : 0),
      0
    )
    : 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={panelRef}
        style={modalHeight === null ? undefined : { height: modalHeight }}
        className={`bg-white rounded-lg shadow-xl w-full max-w-5xl ${step === 'results' ? 'lg:max-w-none' : ''} max-h-[90vh] flex flex-col`}
      >
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">
              TBM AI 분석 및 메시지 발송
              <span className="ml-2 text-xs font-normal text-gray-500">{selectedDate}</span>
            </h2>
            {step === 'results' && (
              <p className="mt-0.5 text-[11px] text-gray-500">
                분석 대상 · 오늘 작업내용 · 투입인원 · 투입장비
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {step === 'results' && rows.length > 0 && (
              <button
                type="button"
                disabled={sending}
                onClick={async () => {
                  try {
                    const exportRows: TbmAnalysisExportRow[] = rows.map((row) => ({
                      projectName: row.record.project_name,
                      branch: row.record.managing_branch || '지사 미분류',
                      projectCategory: row.projectCategory || '소관사업 미분류',
                      todayWork: row.record.today_work || '',
                      personnelText: row.personnelText,
                      equipment: row.record.equipment_input || '',
                      analysis: row.analysis,
                      message: row.message,
                      hasClientTelegram: row.hasClientTelegram,
                      hasContractorTelegram: row.hasContractorTelegram,
                    }))
                    await exportTbmTelegramAnalysis(exportRows, selectedDate)
                  } catch (err) {
                    console.error(err)
                    alert('엑셀 생성에 실패했습니다.')
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                엑셀
              </button>
            )}
            <span className="text-xs text-gray-500">사용 모델 · GPT-5.6 Luna</span>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-100"
              aria-label="닫기"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        {step === 'targets' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
            {prepareLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                <p className="mt-3 text-sm text-gray-600">대상 현장 정보를 불러오는 중…</p>
              </div>
            ) : prepareError ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm text-red-600">{prepareError}</p>
                <button
                  type="button"
                  onClick={() => setPrepareAttempt(prev => prev + 1)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <>
                {/* 소관사업 선택 + 대상 건수 */}
                <div className="flex items-center gap-2 mb-2">
                  <label htmlFor="tbm-telegram-category" className="text-xs font-medium text-gray-600">소관사업</label>
                  <select
                    id="tbm-telegram-category"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-800 bg-white"
                  >
                    <option value={ALL_CATEGORY}>{ALL_CATEGORY} ({targets.length})</option>
                    {categories.map(category => (
                      <option key={category.name} value={category.name}>
                        {category.name} ({category.count})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-500">대상 {filteredTargets.length}건</span>
                </div>

                {/* 대상 표 — 창 높이를 끌어 키우면 함께 늘어난다 */}
                <div className="border border-gray-200 rounded-md flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-gray-600">
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">소관사업</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">
                          <span className="block">현장명</span>
                          <span className="block text-[10px] font-normal text-gray-500">(지사명)</span>
                        </th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">금일 작업내용</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">인원</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">장비</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">수신가능</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTargets.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-2 py-6 text-center text-gray-400">대상 현장이 없습니다.</td>
                        </tr>
                      ) : filteredTargets.map(t => (
                        <tr key={t.record.id} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{t.projectCategory}</td>
                          <td className="px-2 py-1.5 text-gray-900">
                            <span className="block max-w-[180px] truncate font-medium" title={t.record.project_name}>
                              {t.record.project_name}
                            </span>
                            <span className="block max-w-[180px] truncate text-[11px] text-gray-500" title={t.record.managing_branch || '지사 미분류'}>
                              ({t.record.managing_branch || '지사 미분류'})
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-gray-700">
                            <span className="block max-w-[220px] truncate" title={t.record.today_work}>{t.record.today_work || '-'}</span>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-gray-700">{t.personnelText}</td>
                          <td className="px-2 py-1.5 text-gray-700">
                            <span className="block max-w-[140px] truncate" title={t.record.equipment_input || ''}>{t.record.equipment_input || '-'}</span>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-1 ${t.hasClientTelegram ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>발주청</span>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${t.hasContractorTelegram ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>시공사</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 요청사항 입력 + 분석 시작 */}
                <div className="mt-3">
                  <textarea
                    value={userRequest}
                    onChange={e => setUserRequest(e.target.value)}
                    placeholder="어떤 부분에 대해 검토할까요? 예: 우천 대비 작업 안전조치 확인"
                    maxLength={1000}
                    rows={2}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {analyzeLimitExceeded ? (
                      <span className="text-xs text-amber-600">
                        분석 대상이 50건을 초과했습니다. 소관사업 필터로 대상을 줄여주세요.
                      </span>
                    ) : <span />}
                    <button
                      type="button"
                      onClick={() => { void startAnalyze() }}
                      disabled={!userRequest.trim() || filteredTargets.length === 0 || analyzeLimitExceeded}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      AI 분석 시작
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'results' && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
              {analyzing ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  <p className="mt-3 text-sm text-gray-600">AI 분석 중…</p>
                  <p className="mt-1 text-xs text-gray-400">현장 수에 따라 시간이 걸릴 수 있습니다.</p>
                </div>
              ) : analyzeError ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
                  <p className="text-sm text-red-600">{analyzeError}</p>
                  <button
                    type="button"
                    onClick={() => { setAnalyzeError(''); setStep('targets') }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    이전 단계로
                  </button>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-md flex-1 min-h-0 overflow-auto">
                  <table className="w-full min-w-[1500px] table-fixed text-xs">
                    <colgroup>
                      <col className="w-[14%]" />
                      <col className="w-[17%]" />
                      <col className="w-[24%]" />
                      <col />
                      <col className="w-28" />
                      <col className="w-44" />
                    </colgroup>
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-gray-600">
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">
                          <span className="block">현장명</span>
                          <span className="block text-[10px] font-normal text-gray-500">(지사명)</span>
                        </th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">작업·인원·장비</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">분석 요약</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">메시지 (수정 가능)</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">수신 가능</th>
                        <th className="px-2 py-1.5 font-medium whitespace-nowrap">전송</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.record.id} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 text-gray-900">
                            <span className="block truncate font-medium" title={row.record.project_name}>
                              {row.record.project_name}
                            </span>
                            <span className="block truncate text-[11px] text-gray-500" title={row.record.managing_branch || '지사 미분류'}>
                              ({row.record.managing_branch || '지사 미분류'})
                            </span>
                            <span className="block truncate text-[11px] text-gray-500" title={row.projectCategory || '소관사업 미분류'}>
                              ({row.projectCategory || '소관사업 미분류'})
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-gray-700">
                            <span className="block truncate" title={row.record.today_work}>{row.record.today_work || '-'}</span>
                            <span className="block truncate text-gray-500" title={row.record.equipment_input || ''}>
                              {row.personnelText} · {row.record.equipment_input || '장비 없음'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-gray-700">
                            <div className="whitespace-pre-wrap break-words">{row.analysis || '-'}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            <textarea
                              ref={autoResizeTextarea}
                              value={row.message}
                              onChange={e => {
                                updateMessage(row.record.id, e.target.value)
                                autoResizeTextarea(e.target)
                              }}
                              disabled={sending}
                              maxLength={1000}
                              rows={4}
                              className="w-full min-w-[220px] border border-gray-300 rounded-md p-1.5 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${row.hasClientTelegram ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                              발주청
                            </span>
                            <span className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${row.hasContractorTelegram ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                              시공사
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="space-y-1">
                              <label className={`flex items-center gap-1 text-[11px] ${row.hasClientTelegram ? 'text-gray-700' : 'text-gray-400'}`}>
                                <input
                                  type="checkbox"
                                  checked={row.sendClient}
                                  onChange={e => updateSendRecipient(row.record.id, 'client', e.target.checked)}
                                  disabled={sending || !row.hasClientTelegram}
                                  aria-label={`${row.record.project_name} 발주청 전송`}
                                />
                                발주청
                              </label>
                              <label className={`flex items-center gap-1 text-[11px] ${row.hasContractorTelegram ? 'text-gray-700' : 'text-gray-400'}`}>
                                <input
                                  type="checkbox"
                                  checked={row.sendContractor}
                                  onChange={e => updateSendRecipient(row.record.id, 'contractor', e.target.checked)}
                                  disabled={sending || !row.hasContractorTelegram}
                                  aria-label={`${row.record.project_name} 시공사 전송`}
                                />
                                시공사
                              </label>
                            </div>
                            {row.sendResult && (
                              <div className="mt-1 space-y-0.5 text-[10px]">
                                {row.sendResult.client && (
                                  <div
                                    className={row.sendResult.client.ok ? 'text-green-600' : 'text-red-600'}
                                    title={row.sendResult.client.description || ''}
                                  >
                                    발주청 {row.sendResult.client.ok ? '✓' : `✗ ${row.sendResult.client.description || ''}`}
                                  </div>
                                )}
                                {row.sendResult.contractor && (
                                  <div
                                    className={row.sendResult.contractor.ok ? 'text-green-600' : 'text-red-600'}
                                    title={row.sendResult.contractor.description || ''}
                                  >
                                    시공사 {row.sendResult.contractor.ok ? '✓' : `✗ ${row.sendResult.contractor.description || ''}`}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 하단 고정 발송 영역 */}
            {!analyzing && !analyzeError && (
              <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('targets')}
                  disabled={sending}
                  className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  대상 다시 선택
                </button>
                <div className="flex items-center gap-3">
                  {sendError && <span className="text-xs text-red-600">{sendError}</span>}
                  {hasSelectedEmptyMessage && (
                    <span className="text-xs text-amber-600">선택한 현장의 메시지를 입력해 주세요.</span>
                  )}
                  {sendLimitExceeded && (
                    <span className="text-xs text-amber-600">발송 대상은 최대 30건입니다. 일부 선택을 해제해 주세요.</span>
                  )}
                  <span className="text-xs text-gray-500">
                    전송 선택 · 발주청 {selectedClientCount}건 · 시공사 {selectedContractorCount}건
                  </span>
                  <button
                    type="button"
                    onClick={() => { void handleSend() }}
                    disabled={checkedCount === 0 || sendLimitExceeded || hasSelectedEmptyMessage || sending}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {sending ? '발송 중…' : `메시지 발송(${checkedCount}건)`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* 높이 조절 핸들 — 아래로 끌면 창이 커진다 */}
        <div
          onPointerDown={handleResizeStart}
          className="flex h-3 shrink-0 cursor-ns-resize items-center justify-center touch-none"
          title="끌어서 창 높이 조절"
        >
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
      </div>

      {/* 발송 진행·결과 모달 */}
      {sendProgress && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                {sendProgress.status === 'sending' && (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                )}
                {sendProgress.status === 'sending'
                  ? '메시지 발송 진행 중'
                  : sendProgress.status === 'done'
                    ? '메시지 발송 완료'
                    : '메시지 발송 실패'}
              </h3>
              <button
                type="button"
                onClick={closeSendProgress}
                disabled={sending}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="발송 진행 창 닫기"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {sendProgress.status === 'error' && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
                {sendProgress.error || '메시지 발송에 실패했습니다.'}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              <div className="border border-gray-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-600">
                      <th className="px-2 py-1.5 font-medium whitespace-nowrap">현장명</th>
                      <th className="px-2 py-1.5 font-medium whitespace-nowrap w-44">발주청</th>
                      <th className="px-2 py-1.5 font-medium whitespace-nowrap w-44">시공사</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sendProgress.items.map(item => (
                      <tr key={item.key} className="border-t border-gray-100 align-top">
                        <td className="px-2 py-1.5 text-gray-900">
                          <span className="block max-w-[280px] truncate font-medium" title={item.projectName}>
                            {item.projectName}
                          </span>
                          <span className="block text-[11px] text-gray-500">({item.branchName})</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <SendProgressOutcomeCell
                            selected={item.sendClient}
                            status={sendProgress.status}
                            outcome={item.result?.client}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <SendProgressOutcomeCell
                            selected={item.sendContractor}
                            status={sendProgress.status}
                            outcome={item.result?.contractor}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
              {sendProgress.status === 'sending' ? (
                <span className="text-xs text-gray-600">
                  총 {sendRecipientCount}건 발송 중 · 경과 {sendElapsedSeconds}초
                </span>
              ) : sendProgress.status === 'done' ? (
                <span className="text-xs text-gray-700">
                  발송 결과 · <span className="font-medium text-green-600">성공 {sendSuccessCount}건</span>
                  {' · '}
                  <span className={sendFailCount > 0 ? 'font-medium text-red-600' : 'text-gray-500'}>
                    실패 {sendFailCount}건
                  </span>
                </span>
              ) : (
                <span />
              )}
              {sendProgress.status === 'sending' ? (
                <span className="text-xs text-gray-400">현장 수에 따라 시간이 걸릴 수 있습니다.</span>
              ) : (
                <button
                  type="button"
                  onClick={closeSendProgress}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TBMTelegramBroadcastModal
