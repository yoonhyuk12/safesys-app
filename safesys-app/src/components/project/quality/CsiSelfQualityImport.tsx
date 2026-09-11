'use client'

// CSI 로그인 후 사업별 자체 품질시험 실적을 실시대장 등록 폼으로 가져오는 패널
import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, LogIn, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  clearCsiCredentials,
  loadCsiCredentials,
  saveCsiCredentials,
} from '@/lib/quality/csi-credential-store'
import {
  CsiSelfQualityDetail,
  CsiSelfQualityDetailResponse,
  CsiSelfQualityListResponse,
  CsiSelfQualityRow,
  CsiSelfQualityProject,
} from '@/lib/quality/csi-self-quality-types'

interface CsiSelfQualityImportProps {
  projectName: string
  onImport: (detail: CsiSelfQualityDetail) => void
}

const inputCls =
  'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm'
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

export default function CsiSelfQualityImport({ projectName, onImport }: CsiSelfQualityImportProps) {
  // 자격증명은 이 컴포넌트 상태에만 두고, 사용자가 원할 때만 이 기기의 브라우저에 따로 저장한다 (서버 저장 없음)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState<CsiSelfQualityProject[] | null>(null)
  const [projectsTruncated, setProjectsTruncated] = useState(false)
  const [bizMngNo, setBizMngNo] = useState('')
  const [rows, setRows] = useState<CsiSelfQualityRow[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [truncated, setTruncated] = useState(false)
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

  const handleLoadList = async (selectedBizMngNo = '') => {
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
      const res = await fetch('/api/csi/self-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: userId.trim(), password, ...(selectedBizMngNo ? { bizMngNo: selectedBizMngNo } : {}) }),
      })
      const json = await readJson<CsiSelfQualityListResponse>(res)
      if (!json.success || !json.data) throw new Error(json.error || '조회에 실패했습니다.')
      if (!selectedBizMngNo) {
        setProjects(json.data.projects)
        setProjectsTruncated(json.data.truncated)
        setBizMngNo('')
      }
      setRows(selectedBizMngNo ? json.data.rows : null)
      setTotalCount(selectedBizMngNo ? json.data.totalCount : 0)
      setTruncated(selectedBizMngNo ? json.data.truncated : false)
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

  const handleImport = async (row: CsiSelfQualityRow) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setImportingNo(row.groupNo)
    setImportError('')
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/csi/self-quality/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId: userId.trim(), password, groupNo: row.groupNo, bizMngNo: row.bizMngNo }),
      })
      const json = await readJson<CsiSelfQualityDetailResponse>(res)
      if (!json.success || !json.data) throw new Error(json.error || '상세 조회에 실패했습니다.')
      onImport(json.data)
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      inFlightRef.current = false
      setImportingNo('')
    }
  }

  if (projects === null) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-sm space-y-3">
          <p className="text-xs text-gray-500">
            CSI에 로그인해 사업별 자체 품질시험 실적을 불러옵니다. 가져온 실적은
            실시대장 등록 폼에 입력되며, 공종과 내용을 확인한 뒤 저장해주세요.
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
                disabled={loading}
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
            onClick={() => handleLoadList()}
            disabled={loading}
            className="flex min-h-[44px] w-full items-center justify-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              '조회 중...'
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                로그인하고 사업 조회
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
        <p className="text-xs text-gray-600">현재 현장. {projectName}</p>
        {projectsTruncated && <p className="text-xs text-amber-800">CSI 사업 목록의 일부만 조회되었습니다.</p>}
        <label className={labelCls} htmlFor="csi-self-quality-project">가져올 CSI 사업</label>
        <select
          id="csi-self-quality-project"
          value={bizMngNo}
          disabled={loading || Boolean(importingNo)}
          className={inputCls}
          onChange={(event) => {
            setBizMngNo(event.target.value)
            setRows(null)
            setTotalCount(0)
            setTruncated(false)
            setError('')
            setImportError('')
          }}
        >
          <option value="">사업을 선택해주세요</option>
          {projects.map((project) => <option key={project.bizMngNo} value={project.bizMngNo}>{project.projectName} ({project.totalCount}건)</option>)}
        </select>
        {projects.length === 0 && <p className="text-xs text-gray-500">조회 가능한 자체 품질시험 사업이 없습니다.</p>}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => handleLoadList(bizMngNo)}
            disabled={loading || Boolean(importingNo) || !bizMngNo}
            className="flex min-h-[44px] items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="목록 다시 조회"
          >
            <RefreshCw className="h-4 w-4" />
            {rows === null ? '실적 조회' : '새로고침'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          자체 품질시험 조회 {rows?.length || 0}건
          {truncated && ` — 전체 ${totalCount}건 중 일부만 조회되었습니다.`}
        </p>
        <p className="text-xs text-gray-500">가져오기는 등록 폼에 입력합니다. 공종·시험 결과를 확인한 뒤 저장해주세요.</p>
        <button type="button" disabled={loading || Boolean(importingNo)} onClick={() => { setProjects(null); setRows(null); setBizMngNo(''); setProjectsTruncated(false); setError(''); setImportError('') }} className="min-h-[44px] text-xs text-gray-600 underline disabled:opacity-50">다른 계정으로 조회</button>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {importError && <p className="text-xs font-medium text-red-600">{importError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <LoadingSpinner />
            <p className="text-xs text-gray-400">CSI 응답에 20초가량 걸릴 수 있습니다.</p>
          </div>
        ) : rows === null ? (
          <p className="py-10 text-center text-sm text-gray-500">CSI 사업을 선택하고 실적 조회를 눌러주세요.</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            등록된 자체 품질시험 실적이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.groupNo}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {row.materialName || '재료명 없음'}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {row.status || '상태 없음'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{row.reportNo} · {row.projectName}</p>
                    <p className="text-xs text-gray-600">{row.testSummary}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      등록일 {row.registeredDate || '-'} · {row.testPlace || '-'}
                      {row.testerName && ` · 시험자 ${row.testerName}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleImport(row)}
                    disabled={loading || Boolean(importingNo)}
                    className="flex min-h-[44px] shrink-0 items-center gap-1 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {importingNo === row.groupNo ? (
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
