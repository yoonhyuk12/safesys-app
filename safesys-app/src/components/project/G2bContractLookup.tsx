'use client'

// 나라장터 계약번호·공고번호로 공사 계약을 조회해 프로젝트 폼에 자동입력하는 공용 컴포넌트
import { useState } from 'react'
import { Search, FileText, Loader2 } from 'lucide-react'
import { BRANCH_OPTIONS } from '@/lib/constants'

export interface G2bContractApplyData {
  projectName: string
  totalBudget: number
  startDate: string
  endDate: string
  cntrctNo: string
  ntceNo: string
  // 계약업체명 (공동도급이면 쉼표로 연결)
  corpNm: string
  // 수요기관명에서 매칭된 관할 본부·지사 (매칭 실패 시 빈 문자열)
  managingHq: string
  managingBranch: string
}

// 수요기관명(예: "한국농어촌공사 경기지역본부 여주.이천지사")에서 본부·지사 옵션 매칭
// 구분자 차이(·/.)와 공백을 제거하고 포함 여부로 비교, 지사명이 긴 매치를 우선
function matchOrgFromDminsttNms(names: string[]): { hq: string; branch: string } {
  const norm = (s: string) => s.replace(/[·.\s]/g, '')
  for (const name of names) {
    if (!name.includes('농어촌공사')) continue
    const n = norm(name)
    let matchedHq = ''
    // 긴 이름 우선 매칭 (예: '새만금산업단지'가 '새만금'보다 먼저)
    const hqKeys = Object.keys(BRANCH_OPTIONS).sort((a, b) => b.length - a.length)
    for (const hq of hqKeys) {
      const h = norm(hq)
      if (n.includes(`${h}지역본부`) || n.includes(`${h}사업단`) || n.includes(`${h}본부`)) {
        matchedHq = hq
        break
      }
    }
    const searchHqs = matchedHq ? [matchedHq] : Object.keys(BRANCH_OPTIONS)
    let best: { hq: string; branch: string } | null = null
    for (const hq of searchHqs) {
      for (const branch of BRANCH_OPTIONS[hq] || []) {
        if (n.includes(norm(branch)) && (!best || norm(branch).length > norm(best.branch).length)) {
          best = { hq, branch }
        }
      }
    }
    if (best) return best
    if (matchedHq) {
      // 지사 없이 지역본부 자체가 수요기관인 경우
      const hqBranch = (BRANCH_OPTIONS[matchedHq] || []).find((b) => b === `${matchedHq}본부`)
      return { hq: matchedHq, branch: hqBranch || '' }
    }
  }
  return { hq: '', branch: '' }
}

interface G2bContract {
  cnstwkNm: string
  bsnsDivNm: string
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
  // 적용 시 채워지는 항목 안내 문구 (폼별로 적용 범위가 다름)
  subtitle?: string
  onApply: (data: G2bContractApplyData) => void
}

export default function G2bContractLookup({
  initialNo,
  disabled,
  subtitle = '계약번호 또는 공고번호로 공사명·금액·기간을 자동으로 채웁니다.',
  onApply,
}: G2bContractLookupProps) {
  const [no, setNo] = useState(initialNo || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contracts, setContracts] = useState<G2bContract[]>([])
  const [appliedNo, setAppliedNo] = useState<string | null>(null)

  const handleSearch = async () => {
    // 붙여넣기 시 섞이는 공백 제거 (예: "20231019521 - 000")
    const trimmed = no.replace(/\s+/g, '')
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
    const org = matchOrgFromDminsttNms(c.dminsttNms)
    onApply({
      projectName: c.cnstwkNm,
      totalBudget: c.totCntrctAmt,
      startDate: c.startDate,
      endDate: c.endDate,
      cntrctNo: c.cntrctNo,
      ntceNo: c.ntceNo,
      corpNm: c.corpNms.join(', '),
      managingHq: org.hq,
      managingBranch: org.branch,
    })
    setAppliedNo(c.cntrctNo || c.ntceNo)
  }

  return (
    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md space-y-3">
      <div className="flex items-center">
        <FileText className="h-5 w-5 text-emerald-600 mr-2" />
        <span className="text-sm font-medium text-emerald-900">나라장터 계약 연계</span>
        <span className="ml-2 text-xs text-emerald-700">{subtitle}</span>
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

      {contracts.length > 1 && (
        <p className="text-xs text-emerald-700">
          동일 번호로 {contracts.length}건이 조회되어 가장 최신 계약만 표시합니다.
        </p>
      )}

      {contracts.slice(0, 1).map((c) => {
        const key = c.cntrctNo || c.ntceNo || c.untyCntrctNo
        const isApplied = appliedNo === (c.cntrctNo || c.ntceNo)
        return (
          <div key={key} className="p-3 bg-white border border-emerald-200 rounded-md">
            <p className="text-sm font-medium text-gray-900">
              {c.bsnsDivNm && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-700 align-middle">
                  {c.bsnsDivNm}
                </span>
              )}
              {c.cnstwkNm || '(계약명 없음)'}
            </p>
            <div className="mt-1 text-xs text-gray-600 space-y-0.5">
              {c.totCntrctAmt > 0 && <p>총계약금액: {c.totCntrctAmt.toLocaleString('ko-KR')}원</p>}
              {(c.startDate || c.endDate) && (
                <p>공사기간: {c.startDate || '?'} ~ {c.endDate || '?'}</p>
              )}
              {!c.startDate && !c.endDate && c.cntrctPrd && (
                <p>계약기간(원문): {c.cntrctPrd} — 날짜 형식이 아니라 자동 입력되지 않습니다</p>
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
