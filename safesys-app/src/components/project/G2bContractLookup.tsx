'use client'

// 나라장터 계약번호·공고번호로 공사 계약을 조회해 프로젝트 폼에 자동입력하는 공용 컴포넌트
import { useState } from 'react'
import { Search, FileText, Loader2 } from 'lucide-react'

export interface G2bContractApplyData {
  projectName: string
  totalBudget: number
  startDate: string
  endDate: string
  cntrctNo: string
  ntceNo: string
}

interface G2bContract {
  cnstwkNm: string
  cntrctNo: string
  ntceNo: string
  untyCntrctNo: string
  totCntrctAmt: number
  cntrctPrd: string
  cntrctCnclsDate: string
  startDate: string
  endDate: string
  cntrctInsttNm: string
  dminsttNms: string[]
  corpNms: string[]
  cntrctInfoUrl: string
}

interface G2bContractLookupProps {
  initialNo?: string
  disabled?: boolean
  onApply: (data: G2bContractApplyData) => void
}

export default function G2bContractLookup({ initialNo, disabled, onApply }: G2bContractLookupProps) {
  const [no, setNo] = useState(initialNo || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contracts, setContracts] = useState<G2bContract[]>([])
  const [appliedNo, setAppliedNo] = useState<string | null>(null)

  const handleSearch = async () => {
    const trimmed = no.trim()
    if (!trimmed) {
      setError('계약번호 또는 공고번호를 입력해주세요.')
      return
    }
    setLoading(true)
    setError(null)
    setContracts([])
    setAppliedNo(null)
    try {
      const res = await fetch(`/api/g2b/contract?no=${encodeURIComponent(trimmed)}`)
      const json = await res.json()
      if (!json.success) {
        setError(json.error || '조회에 실패했습니다.')
        return
      }
      setContracts(json.data.contracts)
    } catch {
      setError('조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = (c: G2bContract) => {
    onApply({
      projectName: c.cnstwkNm,
      totalBudget: c.totCntrctAmt,
      startDate: c.startDate,
      endDate: c.endDate,
      cntrctNo: c.cntrctNo,
      ntceNo: c.ntceNo,
    })
    setAppliedNo(c.cntrctNo || c.ntceNo)
  }

  return (
    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md space-y-3">
      <div className="flex items-center">
        <FileText className="h-5 w-5 text-emerald-600 mr-2" />
        <span className="text-sm font-medium text-emerald-900">나라장터 계약 연계</span>
        <span className="ml-2 text-xs text-emerald-700">
          계약번호 또는 공고번호로 공사명·금액·기간을 자동으로 채웁니다.
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={no}
          onChange={(e) => setNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
          placeholder="예: 확정계약번호 또는 입찰공고번호"
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
          disabled={disabled || loading}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={disabled || loading}
          className="flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Search className="h-4 w-4 mr-1" />
          )}
          조회
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {contracts.map((c) => {
        const key = c.cntrctNo || c.ntceNo || c.untyCntrctNo
        const isApplied = appliedNo === (c.cntrctNo || c.ntceNo)
        return (
          <div key={key} className="p-3 bg-white border border-emerald-200 rounded-md">
            <p className="text-sm font-medium text-gray-900">{c.cnstwkNm || '(공사명 없음)'}</p>
            <div className="mt-1 text-xs text-gray-600 space-y-0.5">
              {c.totCntrctAmt > 0 && <p>총계약금액: {c.totCntrctAmt.toLocaleString('ko-KR')}원</p>}
              {(c.startDate || c.endDate) && (
                <p>공사기간: {c.startDate || '?'} ~ {c.endDate || '?'}</p>
              )}
              {c.cntrctInsttNm && <p>계약기관: {c.cntrctInsttNm}</p>}
              {c.dminsttNms.length > 0 && <p>수요기관: {c.dminsttNms.join(', ')}</p>}
              {c.corpNms.length > 0 && <p>계약업체: {c.corpNms.join(', ')}</p>}
              {c.cntrctNo && <p>확정계약번호: {c.cntrctNo}</p>}
              {c.ntceNo && <p>공고번호: {c.ntceNo}</p>}
            </div>
            <button
              type="button"
              onClick={() => handleApply(c)}
              disabled={disabled}
              className={`mt-2 px-3 py-1.5 text-xs font-medium rounded-md ${
                isApplied
                  ? 'bg-emerald-100 text-emerald-700 cursor-default'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isApplied ? '적용됨' : '이 계약 적용'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
