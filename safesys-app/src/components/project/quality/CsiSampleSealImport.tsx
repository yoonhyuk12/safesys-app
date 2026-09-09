'use client'

// CSI 로그인 후 우리 기관이 등록한 시료봉인 목록을 조회해 실시대장 등록 폼으로 가져오는 패널
import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, LogIn, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  clearCsiCredentials,
  loadCsiCredentials,
  saveCsiCredentials,
} from '@/lib/quality/csi-credential-store'
import {
  CsiSampleSealDetail,
  CsiSampleSealDetailResponse,
  CsiSampleSealListResponse,
  CsiSampleSealRow,
} from '@/lib/quality/csi-sample-seal-types'

interface CsiSampleSealImportProps {
  onImport: (detail: CsiSampleSealDetail) => void
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

// SafeSys API 라우트는 Bearer 토큰을 요구한다 — 세션이 없으면 CSI 호출 자체를 시도하지 않는다
const getAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new Error('로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.')
  }
  return accessToken
}

// 라우트가 500·게이트웨이 오류로 HTML을 돌려주면 파싱이 깨진다 — 내부 오류 문구 대신 안내 문구를 쓴다
const readJson = async <T,>(res: Response): Promise<T> => {
  try {
    return (await res.json()) as T
  } catch {
    throw new Error('CSI 조회 서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

export default function CsiSampleSealImport({ onImport }: CsiSampleSealImportProps) {
  // 자격증명은 이 컴포넌트 상태에만 두고, 사용자가 원할 때만 이 기기의 브라우저에 따로 저장한다 (서버 저장 없음)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<CsiSampleSealRow[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [filter, setFilter] = useState('')
  const [importingNo, setImportingNo] = useState('')
  const [importError, setImportError] = useState('')
  // CSI는 로그인 5회 실패로 계정을 잠근다 — setState는 비동기라 요청 중복은 ref로 동기 차단한다
  const inFlightRef = useRef(false)

  // 이 기기에 저장해 둔 값이 있으면 채워만 둔다 — 자동 조회는 하지 않는다
  useEffect(() => {
    const saved = loadCsiCredentials()
    if (!saved) return
    setUserId(saved.userId)
    setPassword(saved.password)
    setRemember(true)
    setHasSaved(true)
  }, [])

  const handleClearSaved = () => {
    clearCsiCredentials()
    setUserId('')
    setPassword('')
    setRemember(false)
    setHasSaved(false)
  }

  const handleLoadList = async () => {
    if (inFlightRef.current) return
    if (!userId.trim() || !password) {
      setError('CSI 아이디와 비밀번호를 입력해주세요.')
      return
    }
    inFlightRef.current = true
    setLoading(true)
    setError('')
    setImportError('')
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/csi/sample-seals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: userId.trim(), password }),
      })
      const json = await readJson<CsiSampleSealListResponse>(res)
      if (!json.success || !json.data) throw new Error(json.error || '조회에 실패했습니다.')
      setRows(json.data.rows)
      setTotalCount(json.data.totalCount)
      setTruncated(json.data.truncated)
      // 조회가 성공한 뒤에만 저장한다 — 틀린 비밀번호를 기기에 남기지 않기 위해서다
      if (remember) saveCsiCredentials({ userId: userId.trim(), password })
      else clearCsiCredentials()
      setHasSaved(remember)
    } catch (err: unknown) {
      setRows(null)
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  const handleImport = async (row: CsiSampleSealRow) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setImportingNo(row.smpslNo)
    setImportError('')
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/csi/sample-seals/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: userId.trim(), password, smpslNo: row.smpslNo }),
      })
      const json = await readJson<CsiSampleSealDetailResponse>(res)
      if (!json.success || !json.data) throw new Error(json.error || '상세 조회에 실패했습니다.')
      onImport(json.data)
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      inFlightRef.current = false
      setImportingNo('')
    }
  }

  const keyword = filter.trim()
  const visibleRows = (rows || []).filter((row) => !keyword || row.constNm.includes(keyword))

  if (rows === null) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-sm space-y-3">
          <p className="text-xs text-gray-500">
            CSI에 로그인해 우리 기관이 등록한 시료봉인(품질검사 의뢰) 목록을 불러옵니다. 가져오면
            실시대장 등록 폼에 자동 입력됩니다.
          </p>
          <div>
            <label className={labelCls} htmlFor="csi-user-id">
              CSI 아이디 *
            </label>
            <input
              id="csi-user-id"
              type="text"
              value={userId}
              autoComplete="off"
              disabled={loading}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleLoadList()
              }}
              className={`${inputCls} disabled:bg-gray-100`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="csi-password">
              CSI 비밀번호 *
            </label>
            <input
              id="csi-password"
              type="password"
              value={password}
              autoComplete="off"
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleLoadList()
              }}
              className={`${inputCls} disabled:bg-gray-100`}
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={remember}
                disabled={loading}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-xs text-gray-600">이 기기에 아이디·비밀번호 저장</span>
            </label>
            <p className="text-xs text-gray-400">
              이 기기의 브라우저에만 저장됩니다. 공유 기기에서는 저장하지 마세요.
            </p>
            {hasSaved && (
              <button
                type="button"
                onClick={handleClearSaved}
                className="text-xs text-gray-500 underline hover:text-red-600"
              >
                저장된 정보 삭제
              </button>
            )}
          </div>
          <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            아이디·비밀번호는 서버에 저장되지 않으며 CSI 로그인에만 사용됩니다.
          </p>
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleLoadList}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? (
              '조회 중...'
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                로그인하고 목록 조회
              </>
            )}
          </button>
          {loading && (
            <div className="flex flex-col items-center gap-2 py-4">
              <LoadingSpinner />
              <p className="text-xs text-gray-400">CSI 응답에 20초가량 걸릴 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className={labelCls} htmlFor="csi-seal-filter">
              공사명 검색
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="csi-seal-filter"
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="공사명 일부를 입력해 목록을 좁힙니다"
                className={`${inputCls} pl-8`}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleLoadList}
            disabled={loading}
            className="flex min-h-[34px] items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
            title="목록 다시 조회"
          >
            <RefreshCw className="h-4 w-4" />
            새로고침
          </button>
        </div>
        <p className="text-xs text-gray-500">
          시료봉인 {visibleRows.length}건 / 조회 {rows.length}건
          {truncated && ` — 전체 ${totalCount}건 중 ${rows.length}건만 표시됩니다.`}
        </p>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {importError && <p className="text-xs font-medium text-red-600">{importError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <LoadingSpinner />
            <p className="text-xs text-gray-400">CSI 응답에 20초가량 걸릴 수 있습니다.</p>
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            {rows.length === 0
              ? '등록된 시료봉인이 없습니다.'
              : '공사명 검색어와 일치하는 시료봉인이 없습니다.'}
          </p>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((row) => (
              <div
                key={row.smpslNo}
                className="rounded-lg border border-gray-200 p-3 hover:border-amber-300 hover:bg-amber-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {row.sealNm || '시료봉인명 없음'}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {row.sealSttsNm || '상태 없음'}
                      </span>
                    </div>
                    {row.constNm && <p className="truncate text-xs text-gray-500">{row.constNm}</p>}
                    <p className="mt-1 text-xs text-gray-600">
                      봉인일 {row.sealYmd || '-'}
                      {row.observerNm && ` · 참관자 ${row.observerNm}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleImport(row)}
                    disabled={loading || Boolean(importingNo)}
                    className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {importingNo === row.smpslNo ? (
                      '불러오는 중...'
                    ) : (
                      <>
                        가져오기
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
