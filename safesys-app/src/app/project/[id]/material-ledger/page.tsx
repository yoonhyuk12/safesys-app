'use client'
// 주요자재 수불부와 조달청 납품요구 연계를 관리하는 프로젝트 화면

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Package, Plus, Trash2, X, PenTool, Check, Printer, Pencil, Link2, Loader2, Download, LayoutGrid, Table, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { guessInstName } from '@/lib/g2b-inst'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignaturePad from '@/components/ui/SignaturePad'
import { downloadMaterialLedgerExcel } from '@/lib/excel/material-ledger-export'
import { downloadMaterialContractStatusExcel, type MaterialContractRow } from '@/lib/excel/material-contract-status-export'
import MaterialInspectionPhotoField, { materialInspectionPhotoStoragePath, MATERIAL_INSPECTION_PHOTO_BUCKET } from '@/components/project/material/MaterialInspectionPhotoField'
import BulkInspectionAssign from '@/components/project/material/BulkInspectionAssign'
import CopyrightNotice from '@/components/common/CopyrightNotice'

// ── 타입 ──

const gemPalette = [
  { name: '루비', color: 'from-red-600 to-red-900', border: 'border-red-400' },
  { name: '에메랄드', color: 'from-green-500 to-green-800', border: 'border-green-400' },
  { name: '사파이어', color: 'from-blue-500 to-blue-800', border: 'border-blue-400' },
  { name: '토파즈', color: 'from-amber-400 to-amber-700', border: 'border-amber-300' },
  { name: '자수정', color: 'from-purple-500 to-purple-800', border: 'border-purple-400' },
  { name: '다이아', color: 'from-gray-300 to-gray-600', border: 'border-gray-300' },
  { name: '루벨', color: 'from-pink-400 to-pink-700', border: 'border-pink-400' },
  { name: '아쿠아', color: 'from-cyan-400 to-cyan-700', border: 'border-cyan-400' },
  { name: '가넷', color: 'from-orange-500 to-orange-800', border: 'border-orange-400' },
]


interface Material {
  id: string
  name: string
  unit: string
  rows: MaterialRow[]
  sortOrder?: number
  colorIndex?: number
  realOrder?: number
  dlvrReqNo?: string | null
  dlvrSupplier?: string | null
  dlvrSupplierTel?: string | null
  dlvrDeadline?: string | null
}

interface MaterialRow {
  id: string
  nameOrSpec: string
  orderQty: string
  receiveDate: string
  receiveQty: string
  passQtyCurrent: string
  passQtyTotal: string
  failQty: string
  action: string
  releaseDate: string
  releaseQty: string
  remainQty: string
  supervisorConfirm: string
  dlvrReqNo?: string | null
  dlvrReqPrdctSno?: number | null
  dlvrCndtn?: string
  unitPrice?: string
  prdctAmt?: string
  feeAmt?: string
  inspectionPhotos?: string[]
}

// 연계 모달 매핑에서 "새 규격 행으로 추가"를 뜻하는 값
const NEW_SPEC = '__new_spec__'
// 연계 매핑 값 구분자 — "자재ID(구분자)규격" 형태로 다른 자재의 규격도 선택 가능 (U+001F)
const MAP_SEP = String.fromCharCode(31)

interface RowFormData {
  nameOrSpec: string
  orderQty: string
  dlvrCndtn: string
  unitPrice: string
  prdctAmt: string
  feeAmt: string
  receiveDate: string
  receiveQty: string
  passQtyCurrent: string
  failQty: string
  action: string
  releaseDate: string
  releaseQty: string
}

// 조달청 납품요구 조회 결과 (자재 등록 모달 — 납품요구번호 입력 방식)
interface G2bItem {
  sno: number
  name: string
  spec: string
  unit: string
  unitPrice: number
  qty: number
  amt?: number // 품대(품목금액, 원)
  cndtn?: string // 인도조건 (예: 현장설치도)
  deadline: string
}

interface G2bDlvrReq {
  dlvrReqNo: string
  title: string
  demandOrg: string
  supplier: string
  supplierTel: string
  items: G2bItem[]
}

// /api/g2b/pay-insp 응답 문서 — 납품요구번호 완전일치 결과만 상세 모달에 표시한다
interface G2bPayDoc {
  docNo: string
  name: string
  payDate: string
  amt: number
  dlvrReqNo: string
  dminsttNm: string
}

interface G2bInspDoc {
  docNo: string
  name: string
  inspDate: string
  amt: number
  dlvrReqNo: string
  dminsttNm: string
}

interface G2bPayInspDocs {
  pays: G2bPayDoc[]
  insps: G2bInspDoc[]
}

// 납품요구번호별 지급·검사검수 세션 캐시 — 빈 결과도 조회 성공으로 기록해 재호출을 막는다
const dlvrPayInspCache = new Map<string, G2bPayInspDocs>()
const dlvrPayInspPending = new Map<string, Promise<G2bPayInspDocs>>()
const dlvrPayInspDemandScoped = new Set<string>()
const mergeDlvrPayInspDocs = (...results: G2bPayInspDocs[]): G2bPayInspDocs => ({
  pays: [...new Map(results.flatMap(result => result.pays).map(doc => [doc.docNo, doc])).values()],
  insps: [...new Map(results.flatMap(result => result.insps).map(doc => [doc.docNo, doc])).values()],
})

const PAY_INSP_GENERIC_WORDS = ['구매', '지급자재', '관급자재', '사업', '공사', '설치', '제조', '제작', '납품']
const normalizeDlvrReqNo = (value: string) => value.replace(/\s+/g, '').toUpperCase().replace(/-\d{1,3}$/, '')
const cleanPayInspCandidate = (value: string) => value.replace(/[\[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim()
const isSpecificPayInspCandidate = (value: string) => {
  const compact = value.replace(/[^0-9A-Za-z가-힣]/g, '')
  return compact.length >= 2
    && !/^\d+$/.test(compact)
    && !PAY_INSP_GENERIC_WORDS.some(word => compact === word || compact.endsWith(word))
}

// 넓은 첫 단어 대신 품목을 가장 잘 특정하는 괄호 내용 또는 최장 토큰을 선택한다
const payInspKeyword = (title: string): string => {
  const parenthesized = [...title.matchAll(/\(([^()]*)\)/g)]
    .map(match => cleanPayInspCandidate(match[1]))
    .filter(isSpecificPayInspCandidate)
    .sort((a, b) => b.length - a.length)[0]
  if (parenthesized) return parenthesized

  return title.replace(/\([^()]*\)/g, ' ')
    .split(/[\s,·/]+/)
    .map(cleanPayInspCandidate)
    .filter(isSpecificPayInspCandidate)
    .sort((a, b) => b.length - a.length)[0] || ''
}

const fetchDlvrPayInsp = async (no: string, title: string, demandOrg = ''): Promise<G2bPayInspDocs> => {
  const cached = dlvrPayInspCache.get(no)
  if (cached && (!demandOrg || dlvrPayInspDemandScoped.has(no))) return cached
  const pendingKey = `${no}|${demandOrg ? 'demand' : 'background'}`
  const pending = dlvrPayInspPending.get(pendingKey)
  if (pending) return pending

  const request = (async () => {
    const keyword = payInspKeyword(title)
    if (keyword.length < 2) {
      const current = dlvrPayInspCache.get(no) || { pays: [], insps: [] }
      dlvrPayInspCache.set(no, current)
      if (demandOrg) dlvrPayInspDemandScoped.add(no)
      return current
    }
    const res = await fetch(
      `/api/g2b/pay-insp?nm=${encodeURIComponent(keyword)}${demandOrg ? `&inst=${encodeURIComponent(demandOrg)}` : ''}`
    )
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error || '지급·검사검수 내역을 불러오지 못했습니다.')
    const payRows: G2bPayDoc[] = Array.isArray(json.data?.pays) ? json.data.pays : []
    const inspRows: G2bInspDoc[] = Array.isArray(json.data?.insps) ? json.data.insps : []
    const exact: G2bPayInspDocs = {
      pays: [...new Map(
        payRows.filter(doc => doc.dlvrReqNo === no).map(doc => [doc.docNo, doc])
      ).values()],
      insps: [...new Map(
        inspRows.filter(doc => doc.dlvrReqNo === no).map(doc => [doc.docNo, doc])
      ).values()],
    }
    const merged = mergeDlvrPayInspDocs(dlvrPayInspCache.get(no) || { pays: [], insps: [] }, exact)
    dlvrPayInspCache.set(no, merged)
    if (demandOrg) dlvrPayInspDemandScoped.add(no)
    return merged
  })().finally(() => {
    dlvrPayInspPending.delete(pendingKey)
  })

  dlvrPayInspPending.set(pendingKey, request)
  return request
}

// 조달청 납품요구 목록 일괄 조회 결과 행 (수요기관·기간 검색, /api/g2b/dlvr-req-list)
interface BulkDlvrItem {
  dlvrReqNo: string
  chgOrd: string
  rcptDate: string
  name: string
  dminsttNm: string
  corpNm: string
  prdctNm: string
  deadline: string
}

// ── 유틸 ──

// 숫자에 1000단위 콤마 포맷
function formatNumber(value: string): string {
  if (!value || value === '-') return value
  
  // 콤마 제거
  const cleanValue = value.replace(/,/g, '')
  
  // 숫자가 아니면 그대로 반환
  if (isNaN(Number(cleanValue))) return value
  
  const parts = cleanValue.split('.')
  const rawInteger = parts[0]
  
  let integerPart = ''
  if (rawInteger === '') {
    integerPart = ''
  } else if (rawInteger === '-') {
    integerPart = '-'
  } else {
    const parsed = parseFloat(rawInteger)
    if (isNaN(parsed)) {
      integerPart = rawInteger
    } else {
      integerPart = parsed.toLocaleString()
      if (rawInteger.startsWith('-') && !integerPart.startsWith('-')) {
        integerPart = '-' + integerPart
      }
    }
  }
  
  if (parts.length > 1) {
    return `${integerPart}.${parts[1]}`
  }
  
  return integerPart
}

// 콤마 제거 (저장용)
function stripComma(value: string): string {
  return value.replace(/,/g, '')
}

// 날짜 포맷: 2025-01-20 → 25-01-20
function formatDate(value: string): string {
  if (!value) return ''
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  return `${m[1].slice(2)}-${m[2]}-${m[3]}`
}

// 상세 표의 품명/규격 표시 — 품명(첫 줄)이 상단 자재명과 같으면 중복이므로 규격만 남긴다.
// 저장값("품명\n(규격)")은 그대로 두고 화면 표기만 바꾼다 (규격 그룹 매칭·엑셀 출력에 영향 없음)
function stripDupItemName(nameOrSpec: string, materialName: string): string {
  const [first, ...rest] = nameOrSpec.split('\n')
  if (first.trim() !== materialName.trim()) return nameOrSpec
  return rest.join('\n').replace(/^\(/, '').replace(/\)$/, '').trim()
}

// 조달청 품목 → 원장 품명/규격 문자열. 규격 전문이 "품명, 제조사, 모델…"로 길어서
// 품명 뒤 나머지를 줄바꿈 + 괄호로 묶는다. 예: "배수로관\n(토암콘크리트, TAS-06, …)"
function formatG2bSpec(item: G2bItem): string {
  const name = (item.name || '').trim()
  let rest = (item.spec || '').trim()
  if (name && rest.startsWith(name)) {
    rest = rest.slice(name.length).replace(/^[,\s]+/, '')
  }
  if (!name) return rest
  if (!rest) return name
  return `${name}\n(${rest})`
}

// 조달수수료 계산 — 조달청고시 제2025-33호(2025-12-01 시행) 내자구매 '단가(일반·3자·MAS)' 요율.
// 10억원까지 0.54%, 10억 초과분 0.47%, 100억 초과분 0.37% (초과분 체감적용). 면제·감경 특례 미반영 추정치.
function calcG2bFee(amt: number): number {
  if (!amt || amt <= 0) return 0
  const b1 = 1_000_000_000
  const b2 = 10_000_000_000
  let fee = Math.min(amt, b1) * 0.0054
  if (amt > b1) fee += (Math.min(amt, b2) - b1) * 0.0047
  if (amt > b2) fee += (amt - b2) * 0.0037
  return Math.round(fee)
}

// 품목별 조달수수료 안분 — 체감 요율이라 납품요구 건 전체 금액으로 산출한 뒤 품목 금액 비례로 나눈다
function calcG2bItemFee(items: G2bItem[], item: G2bItem): number {
  const total = items.reduce((s, it) => s + (it.amt || 0), 0)
  if (total <= 0 || !item.amt) return 0
  return Math.round(calcG2bFee(total) * (item.amt / total))
}

// 검수기록 이관 대상 판별 — 반입일·반입량·합격량·불출량 중 하나라도 값이 있는 "실적 행"
function isActivityRow(r: MaterialRow): boolean {
  return !!(r.receiveDate || r.receiveQty || r.passQtyCurrent || r.releaseQty)
}

// ── 컴포넌트 ──

export default function MaterialLedgerPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 자재 목록
  const [materials, setMaterials] = useState<Material[]>([])

  // 현재 선택한 자재 (null이면 대시보드)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)

  // 자재 등록 모달
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [materialForm, setMaterialForm] = useState<{ name: string; unit: string; colorIndex: number; supplier: string; supplierTel: string; deadline: string }>({ name: '', unit: '', colorIndex: 0, supplier: '', supplierTel: '', deadline: '' })

  // 자재 등록 모달 — 입력 방식 (직접 입력 / 납품요구번호)
  const [materialInputMode, setMaterialInputMode] = useState<'manual' | 'g2b'>('manual')
  const [g2bNo, setG2bNo] = useState('')
  const [g2bLoading, setG2bLoading] = useState(false)
  const [g2bError, setG2bError] = useState('')
  const [g2bResult, setG2bResult] = useState<G2bDlvrReq | null>(null)
  const [g2bChecked, setG2bChecked] = useState<Set<number>>(new Set())

  // 조달청 연계/동기화 모달 (기존 자재 ↔ 납품요구번호 연결, 발주량 비교·보정)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [linkNo, setLinkNo] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linkResult, setLinkResult] = useState<G2bDlvrReq | null>(null)
  const [linkMapping, setLinkMapping] = useState<Record<number, string>>({}) // 품목순번 → 원장 규격 ('' = 연결 안 함, NEW_SPEC = 새 규격 행)
  const [linkAdjust, setLinkAdjust] = useState<Record<number, boolean>>({}) // 품목순번 → 발주량 차이 보정 여부
  const [linkApplying, setLinkApplying] = useState(false)

  // 자재명 클릭용 실제 납품요구 읽기 전용 상세 모달
  const [dlvrDetailOpen, setDlvrDetailOpen] = useState(false)
  const [dlvrDetailNo, setDlvrDetailNo] = useState('')
  const [dlvrDetail, setDlvrDetail] = useState<G2bDlvrReq | null>(null)
  const [dlvrDetailLoading, setDlvrDetailLoading] = useState(false)
  const [dlvrDetailProgress, setDlvrDetailProgress] = useState(0)
  const [dlvrDetailError, setDlvrDetailError] = useState('')
  const [dlvrPays, setDlvrPays] = useState<G2bPayDoc[]>([])
  const [dlvrInsps, setDlvrInsps] = useState<G2bInspDoc[]>([])
  const [dlvrInspsLoading, setDlvrInspsLoading] = useState(false)
  const [dlvrInspsError, setDlvrInspsError] = useState('')
  const [dlvrInspByNo, setDlvrInspByNo] = useState<Map<string, G2bInspDoc[]>>(
    () => new Map([...dlvrPayInspCache].map(([no, docs]) => [no, docs.insps]))
  )
  const dlvrDetailRequestRef = useRef(0)
  const dlvrDetailProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dlvrDetailCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 조달청 일괄 조회 모달 (수요기관·기간으로 납품요구 건 전수 조회 → 선택 등록)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkInst, setBulkInst] = useState('')
  const [bulkInstLoading, setBulkInstLoading] = useState(false)
  const [bulkFrom, setBulkFrom] = useState('') // YYYY-MM
  const [bulkTo, setBulkTo] = useState('')
  const [bulkKeyword, setBulkKeyword] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const [bulkError, setBulkError] = useState('')
  const [bulkItems, setBulkItems] = useState<BulkDlvrItem[] | null>(null)
  const [bulkChecked, setBulkChecked] = useState<Set<string>>(new Set())
  const [bulkImporting, setBulkImporting] = useState(false)
  // 일괄 조회 2단계 — 검수기록 이관 매핑 화면
  const [bulkStep, setBulkStep] = useState<'list' | 'assign'>('list')
  const [bulkDetails, setBulkDetails] = useState<G2bDlvrReq[]>([])
  const [bulkDetailLoading, setBulkDetailLoading] = useState(false)

  // 지급자재 계약 현황 엑셀 다운로드
  const [contractExporting, setContractExporting] = useState(false)
  const [contractProgress, setContractProgress] = useState(0)

  // 수불부 엑셀 다운로드 (검수조서·사진대지 포함)
  const [ledgerExporting, setLedgerExporting] = useState(false)

  // 내역 등록/수정 모달
  const [isRowModalOpen, setIsRowModalOpen] = useState(false)
  const [editingRowId, setEditingRowId] = useState<string | null>(null) // null=신규, string=수정
  const [rowForm, setRowForm] = useState<RowFormData>({ nameOrSpec: '', orderQty: '', dlvrCndtn: '', unitPrice: '', prdctAmt: '', feeAmt: '', receiveDate: '', receiveQty: '', passQtyCurrent: '', failQty: '', action: '', releaseDate: '', releaseQty: '' })
  const [rowPhotos, setRowPhotos] = useState<string[]>([]) // 검수 사진 (선택 항목)

  // 자재명/규격 수정 모달
  const [isMaterialEditModalOpen, setIsMaterialEditModalOpen] = useState(false)
  const [materialEditForm, setMaterialEditForm] = useState<{ name: string; unit: string; colorIndex: number; supplier: string; supplierTel: string; deadline: string }>({ name: '', unit: '', colorIndex: 0, supplier: '', supplierTel: '', deadline: '' })

  // 감독 서명 모드
  const [signatureMode, setSignatureMode] = useState(false)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false)
  const [isSavingSignature, setIsSavingSignature] = useState(false)

  // 대시보드 보기 모드 — 계약 목록 표(기본) ↔ 아이템 슬롯창. 선택은 기기(localStorage)에 저장
  const [dashboardView, setDashboardView] = useState<'table' | 'slots'>(() => {
    if (typeof window === 'undefined') return 'table'
    try {
      return localStorage.getItem('materialLedgerView') === 'slots' ? 'slots' : 'table'
    } catch {
      return 'table'
    }
  })

  // 드래그 삭제 & 자리이동 상태 (아이템 슬롯 뷰 전용)
  const [draggingMaterialId, setDraggingMaterialId] = useState<string | null>(null)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [isOverTrash, setIsOverTrash] = useState(false)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const trashZoneRef = useRef<HTMLDivElement>(null)
  const materialRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const wasDragging = useRef(false)

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || null

  useEffect(() => {
    if (user && projectId) {
      loadData()
    }
  }, [user, projectId])

  // 납품요구번호가 연계된 자재 상세 진입 시 조달청을 자동 조회해 계약(발주량·납품기한) 변경 확인.
  // 같으면 조용히 넘어가고, 다르면 팝업으로 알린 뒤 연계 화면으로 유도. 세션당 자재별 1회만 확인.
  const g2bAutoChecked = useRef<Set<string>>(new Set())
  useEffect(() => {
    const mat = materials.find(m => m.id === selectedMaterialId)
    if (!mat?.dlvrReqNo || g2bAutoChecked.current.has(mat.id)) return
    g2bAutoChecked.current.add(mat.id)
    ;(async () => {
      try {
        const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(mat.dlvrReqNo!)}`)
        const json = await res.json()
        if (!res.ok || !json.success) return
        const result: G2bDlvrReq = json.data
        const diffs: string[] = []
        for (const item of result.items) {
          // 연계된 행(번호+품목순번) 우선, 없으면 규격 문자열로 매칭
          const linkedRow = mat.rows.find(r => r.dlvrReqNo === result.dlvrReqNo && r.dlvrReqPrdctSno === item.sno)
          const spec = linkedRow?.nameOrSpec
            || getSpecList(mat).find(s => s === formatG2bSpec(item) || s === item.spec)
            || ''
          if (!spec) continue
          const matching = mat.rows.filter(r => r.nameOrSpec === spec)
          if (matching.length === 0) continue
          const ledgerQty = calcEffectiveOrderQty(matching)
          const diff = Math.round((item.qty - ledgerQty) * 1000) / 1000
          if (diff !== 0) {
            diffs.push(`· ${item.name} 발주량: 원장 ${ledgerQty} → 조달청 ${item.qty} (${diff > 0 ? '+' : ''}${diff})`)
          }
        }
        const apiDeadline = result.items.reduce((mx, i) => (i.deadline > mx ? i.deadline : mx), '')
        if (mat.dlvrDeadline && apiDeadline && mat.dlvrDeadline !== apiDeadline) {
          diffs.push(`· 납품기한: ${mat.dlvrDeadline} → ${apiDeadline}`)
        }
        if (diffs.length > 0) {
          const go = confirm(
            `조달청 납품요구(${result.dlvrReqNo}) 변경이 감지되었습니다.\n\n${diffs.join('\n')}\n\n연계 화면에서 확인하고 보정하시겠습니까?`
          )
          if (go) openLinkModal()
        }
      } catch {
        // 자동 확인 실패는 업무를 막지 않도록 조용히 무시
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterialId, materials])

  // ── 계약 목록 건명 (조달청 납품요구 건명) ──

  // 건명 조회가 건당 수 초 걸리므로 localStorage에 캐시해 재방문 시 즉시 표시한다.
  // 값 의미: undefined = 조회 전/조회 중, '' = 조회 실패(자재명으로 대체 표시)
  const [dlvrTitles, setDlvrTitles] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const saved = JSON.parse(localStorage.getItem('g2bDlvrReqTitles') || '{}')
      return saved && typeof saved === 'object' ? saved : {}
    } catch {
      return {}
    }
  })
  const titleFetchStarted = useRef<Set<string>>(new Set())

  // 연계된 납품요구번호의 건명을 백그라운드로 채운다 (동시 3건, 실패는 자재명으로 대체)
  useEffect(() => {
    const nos = [...new Set(
      materials.map(m => m.dlvrReqNo || m.rows.find(r => r.dlvrReqNo)?.dlvrReqNo).filter((v): v is string => !!v)
    )].filter(no => dlvrTitles[no] === undefined && !titleFetchStarted.current.has(no))
    if (nos.length === 0) return
    nos.forEach(no => titleFetchStarted.current.add(no))
    const queue = [...nos]
    ;(async () => {
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (queue.length > 0) {
          const no = queue.shift()
          if (!no) break
          let title = ''
          try {
            const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
            const json = await res.json()
            if (res.ok && json.success && json.data?.title) title = String(json.data.title)
          } catch {
            // 건명은 부가 정보 — 실패하면 자재명으로 표시
          }
          setDlvrTitles(prev => ({ ...prev, [no]: title }))
        }
      }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials])

  // 조회 성공한 건명만 저장 — 실패(빈 값)는 저장하지 않아 다음 방문에 재시도된다
  useEffect(() => {
    const toSave = Object.fromEntries(Object.entries(dlvrTitles).filter(([, v]) => v))
    if (Object.keys(toSave).length === 0) return
    try {
      localStorage.setItem('g2bDlvrReqTitles', JSON.stringify(toSave))
    } catch {
      // 저장 실패는 무시 (다음 방문에 재조회)
    }
  }, [dlvrTitles])

  // 계약 목록의 연계 납품요구 검사검수를 동시 2건씩 배경 조회한다. 실패는 캐시하지 않아 재방문 시 다시 시도한다
  useEffect(() => {
    const materialNamesByNo = new Map<string, string[]>()
    const titleKeyByNo = new Map<string, string>()
    for (const material of materials) {
      const rawNo = material.dlvrReqNo || material.rows.find(row => row.dlvrReqNo)?.dlvrReqNo || ''
      const no = normalizeDlvrReqNo(rawNo)
      if (!no) continue
      const names = materialNamesByNo.get(no) || []
      names.push(material.name)
      materialNamesByNo.set(no, names)
      titleKeyByNo.set(no, rawNo)
    }

    const queue = [...materialNamesByNo.entries()].flatMap(([no, names]) => {
      if (dlvrPayInspCache.has(no)) return []
      const rawNo = titleKeyByNo.get(no) || no
      const fetchedTitle = dlvrTitles[rawNo]
      if (fetchedTitle === undefined) return []
      const fallback = [...names].sort((a, b) => b.length - a.length)[0] || ''
      const title = fetchedTitle || fallback
      return title ? [{ no, title }] : []
    })
    if (queue.length === 0) {
      setDlvrInspByNo(new Map([...dlvrPayInspCache].map(([no, docs]) => [no, docs.insps])))
      return
    }

    let cancelled = false
    ;(async () => {
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (queue.length > 0) {
          const target = queue.shift()
          if (!target) break
          try {
            await fetchDlvrPayInsp(target.no, target.title)
            if (!cancelled) {
              setDlvrInspByNo(new Map([...dlvrPayInspCache].map(([no, docs]) => [no, docs.insps])))
            }
          } catch {
            // 배경 조회 실패는 배지를 숨기고 캐시하지 않아 다음 방문에 재시도한다
          }
        }
      }))
    })()
    return () => { cancelled = true }
  }, [materials, dlvrTitles])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      // 프로젝트 조회 (소유자 이름 포함 — 검수조서 인수자 기본값)
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*, user_profiles!projects_created_by_fkey(full_name)')
        .eq('id', projectId)
        .single()
      if (projectError) throw new Error(projectError.message)
      setProject(projectData)

      // 자재 목록 조회
      const { data: materialsData, error: matError } = await supabase
        .from('materials')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (matError) {
        console.error('Materials load error:', matError)
      }

      // 내역 조회
      const matList: Material[] = (materialsData || []).map((m: any, idx: number) => {
        const val = m.sort_order || 0
        let colorIndex = idx % 9
        let realOrder = val
        if (val >= 1000) {
          colorIndex = Math.floor(val / 1000) - 1
          realOrder = val % 1000
        }
        if (colorIndex < 0 || colorIndex >= 9) colorIndex = 0
        return {
          id: m.id,
          name: m.name,
          unit: m.unit || '',
          rows: [],
          sortOrder: val,
          colorIndex,
          realOrder,
          dlvrReqNo: m.dlvr_req_no || null,
          dlvrSupplier: m.dlvr_supplier || null,
          dlvrSupplierTel: m.dlvr_supplier_tel || null,
          dlvrDeadline: m.dlvr_deadline || null
        }
      })
      matList.sort((a: any, b: any) => (a.realOrder || 0) - (b.realOrder || 0))

      if (matList.length > 0) {
        const matIds = matList.map(m => m.id)
        const { data: entriesData, error: entError } = await supabase
          .from('material_ledger_entries')
          .select('*')
          .in('material_id', matIds)
          .order('created_at', { ascending: true })
        if (entError) {
          console.error('Entries load error:', entError)
        }
        const entriesByMat: Record<string, MaterialRow[]> = {}
        for (const e of (entriesData || [])) {
          if (!entriesByMat[e.material_id]) entriesByMat[e.material_id] = []
          entriesByMat[e.material_id].push({
            id: e.id,
            nameOrSpec: e.name_or_spec || '',
            orderQty: e.order_qty != null ? String(e.order_qty) : '',
            receiveDate: e.receive_date || '',
            receiveQty: e.receive_qty != null ? String(e.receive_qty) : '',
            passQtyCurrent: e.pass_qty_current != null ? String(e.pass_qty_current) : '',
            passQtyTotal: e.pass_qty_total != null ? String(e.pass_qty_total) : '',
            failQty: e.fail_qty != null ? String(e.fail_qty) : (e.fail_qty_text || ''),
            action: e.action || '',
            releaseDate: e.release_date || '',
            releaseQty: e.release_qty != null ? String(e.release_qty) : '',
            remainQty: e.remain_qty != null ? String(e.remain_qty) : '',
            supervisorConfirm: e.supervisor_confirm || '',
            dlvrReqNo: e.dlvr_req_no || null,
            dlvrReqPrdctSno: e.dlvr_req_prdct_sno ?? null,
            dlvrCndtn: e.dlvr_cndtn || '',
            unitPrice: e.unit_price != null ? String(e.unit_price) : '',
            prdctAmt: e.prdct_amt != null ? String(e.prdct_amt) : '',
            feeAmt: e.fee_amt != null ? String(e.fee_amt) : '',
            inspectionPhotos: Array.isArray(e.inspection_photos)
              ? e.inspection_photos.filter((u: unknown): u is string => typeof u === 'string')
              : [],
          })
        }
        for (const mat of matList) {
          const rawRows = entriesByMat[mat.id] || []
          // 품명/규격 기준으로 정렬 (첫 등장 순서 유지, 같은 품명끼리 그룹화)
          const nameOrSpecOrder: string[] = []
          for (const row of rawRows) {
            if (!nameOrSpecOrder.includes(row.nameOrSpec)) {
              nameOrSpecOrder.push(row.nameOrSpec)
            }
          }
          mat.rows = rawRows.sort((a, b) => {
            const aIdx = nameOrSpecOrder.indexOf(a.nameOrSpec)
            const bIdx = nameOrSpecOrder.indexOf(b.nameOrSpec)
            return aIdx - bIdx
          })
        }
      }

      setMaterials(matList)
    } catch (err: any) {
      console.error('데이터 로드 실패:', err)
      setError(err.message || '데이터를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 진입 경로를 returnUrl 쿼리로 받은 경우 그 위치(지사 프로젝트 목록 등)로 정확히 복귀.
  const navigateBack = () => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/project/${projectId}`)
  }

  const handleBack = () => {
    if (selectedMaterialId) {
      setSelectedMaterialId(null)
    } else {
      navigateBack()
    }
  }

  // ── 자재 CRUD ──

  const openMaterialModal = () => {
    setMaterialForm({ name: '', unit: '', colorIndex: Math.floor(Math.random() * gemPalette.length), supplier: '', supplierTel: '', deadline: '' })
    setMaterialInputMode('manual')
    setG2bNo('')
    setG2bError('')
    setG2bResult(null)
    setG2bChecked(new Set())
    setIsMaterialModalOpen(true)
  }

  const handleAddMaterial = async () => {
    if (!materialForm.name.trim()) return
    try {
      const realOrder = materials.length + 1
      const encodedSortOrder = (materialForm.colorIndex + 1) * 1000 + realOrder
      const { data, error: insertError } = await supabase
        .from('materials')
        .insert({
          project_id: projectId,
          name: materialForm.name.trim(),
          unit: materialForm.unit.trim() || null,
          created_by: user?.id,
          sort_order: encodedSortOrder,
          dlvr_supplier: materialForm.supplier.trim() || null,
          dlvr_supplier_tel: materialForm.supplierTel.trim() || null,
          dlvr_deadline: materialForm.deadline || null,
        })
        .select()
        .single()
      if (insertError) throw insertError
      setMaterials(prev => [...prev, {
        id: data.id,
        name: data.name,
        unit: data.unit || '',
        rows: [],
        sortOrder: data.sort_order,
        colorIndex: materialForm.colorIndex,
        realOrder,
        dlvrSupplier: data.dlvr_supplier || null,
        dlvrSupplierTel: data.dlvr_supplier_tel || null,
        dlvrDeadline: data.dlvr_deadline || null
      }])
      setMaterialForm({ name: '', unit: '', colorIndex: Math.floor(Math.random() * gemPalette.length), supplier: '', supplierTel: '', deadline: '' })
      setIsMaterialModalOpen(false)
    } catch (err: any) {
      console.error('자재 등록 실패:', err)
      alert('자재 등록에 실패했습니다.')
    }
  }

  // ── 납품요구번호 조회 → 자재 + 발주 행 생성 ──

  const handleG2bLookup = async () => {
    const no = g2bNo.trim()
    if (!no || g2bLoading) return
    setG2bLoading(true)
    setG2bError('')
    setG2bResult(null)
    try {
      const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
      const result: G2bDlvrReq = json.data
      setG2bResult(result)
      // 유효 수량이 남아있는 품목만 기본 선택 (전량 취소 품목 제외)
      setG2bChecked(new Set(result.items.filter(i => i.qty > 0).map(i => i.sno)))
    } catch (err: unknown) {
      setG2bError(err instanceof Error ? err.message : '조회에 실패했습니다.')
    } finally {
      setG2bLoading(false)
    }
  }

  // 납품요구 조회 결과로 자재 + 품목별 발주 행 생성 (단건 등록·일괄 등록 공용)
  const insertMaterialFromDlvrReq = async (result: G2bDlvrReq, selected: G2bItem[], colorIndex: number, realOrder: number): Promise<Material> => {
    const encodedSortOrder = (colorIndex + 1) * 1000 + realOrder
    const maxDeadline = selected.reduce((mx, i) => (i.deadline > mx ? i.deadline : mx), '')
    const { data, error: insertError } = await supabase
      .from('materials')
      .insert({
        project_id: projectId,
        name: selected[0].name || result.title,
        unit: selected[0].unit || null,
        created_by: user?.id,
        sort_order: encodedSortOrder,
        dlvr_req_no: result.dlvrReqNo,
        dlvr_req_synced_at: new Date().toISOString(),
        dlvr_supplier: result.supplier || null,
        dlvr_supplier_tel: result.supplierTel || null,
        dlvr_deadline: maxDeadline || null,
      })
      .select()
      .single()
    if (insertError) throw insertError

    // 품목별 발주 행 생성 — 규격·발주량·품대·인도조건만 채우고 반입/검수/불출은 현장 입력
    const { data: rowsData, error: rowsError } = await supabase
      .from('material_ledger_entries')
      .insert(selected.map(i => ({
        material_id: data.id,
        name_or_spec: formatG2bSpec(i),
        order_qty: i.qty || null,
        created_by: user?.id,
        dlvr_req_no: result.dlvrReqNo,
        dlvr_req_prdct_sno: i.sno,
        dlvr_cndtn: i.cndtn || null,
        unit_price: i.unitPrice || null,
        prdct_amt: i.amt || null,
        fee_amt: calcG2bItemFee(result.items, i) || null,
      })))
      .select()
    if (rowsError) throw rowsError

    const newRows: MaterialRow[] = (rowsData || []).map((e: { id: string; name_or_spec: string | null; order_qty: number | null; dlvr_req_no: string | null; dlvr_req_prdct_sno: number | null; dlvr_cndtn: string | null; unit_price: number | null; prdct_amt: number | null; fee_amt: number | null }) => ({
      id: e.id,
      nameOrSpec: e.name_or_spec || '',
      orderQty: e.order_qty != null ? String(e.order_qty) : '',
      receiveDate: '', receiveQty: '', passQtyCurrent: '', passQtyTotal: '',
      failQty: '', action: '', releaseDate: '', releaseQty: '', remainQty: '',
      supervisorConfirm: '',
      dlvrReqNo: e.dlvr_req_no || null,
      dlvrReqPrdctSno: e.dlvr_req_prdct_sno ?? null,
      dlvrCndtn: e.dlvr_cndtn || '',
      unitPrice: e.unit_price != null ? String(e.unit_price) : '',
      prdctAmt: e.prdct_amt != null ? String(e.prdct_amt) : '',
      feeAmt: e.fee_amt != null ? String(e.fee_amt) : '',
    }))

    return {
      id: data.id,
      name: data.name,
      unit: data.unit || '',
      rows: newRows,
      sortOrder: data.sort_order,
      colorIndex,
      realOrder,
      dlvrReqNo: data.dlvr_req_no || null,
      dlvrSupplier: data.dlvr_supplier || null,
      dlvrSupplierTel: data.dlvr_supplier_tel || null,
      dlvrDeadline: data.dlvr_deadline || null
    }
  }

  const handleAddMaterialFromG2b = async () => {
    if (!g2bResult) return
    const selected = g2bResult.items.filter(i => g2bChecked.has(i.sno))
    if (selected.length === 0) return
    try {
      const mat = await insertMaterialFromDlvrReq(g2bResult, selected, materialForm.colorIndex, materials.length + 1)
      setMaterials(prev => [...prev, mat])
      setIsMaterialModalOpen(false)
    } catch (err: unknown) {
      console.error('납품요구 자재 등록 실패:', err)
      alert('자재 등록에 실패했습니다.')
    }
  }

  // ── 조달청 일괄 조회 (수요기관·기간 → 납품요구 건 전수 조회 → 선택 등록) ──

  // 자재/행에 이미 연계된 납품요구번호 집합
  const registeredDlvrNos = new Set<string>()
  for (const m of materials) {
    if (m.dlvrReqNo) registeredDlvrNos.add(m.dlvrReqNo)
    for (const r of m.rows) {
      if (r.dlvrReqNo) registeredDlvrNos.add(r.dlvrReqNo)
    }
  }

  const openBulkModal = () => {
    setBulkError('')
    setBulkItems(null)
    setBulkChecked(new Set())
    setBulkStep('list')
    setBulkDetails([])
    // 검색어 기본값 = 프로젝트명 (말미의 용역/공사 표기는 조달청 건명에 잘 안 붙어 제거)
    setBulkKeyword((project?.project_name || '').trim().replace(/(용역|공사)$/, ''))
    const today = new Date().toISOString().split('T')[0]
    const toMonth = today.slice(0, 7)
    let fromMonth: string = project?.construction_start_date?.slice(0, 7) || ''
    if (!fromMonth || fromMonth > toMonth) {
      const d = new Date()
      d.setMonth(d.getMonth() - 11)
      fromMonth = d.toISOString().slice(0, 7)
    }
    // 첫 자동 조회가 오래 걸리지 않게 기본 기간은 최근 12개월로 제한 — 더 긴 기간은 프리셋/기간 입력으로 확장
    const minD = new Date()
    minD.setMonth(minD.getMonth() - 11)
    const minFrom = minD.toISOString().slice(0, 7)
    if (fromMonth < minFrom) fromMonth = minFrom
    setBulkFrom(fromMonth)
    setBulkTo(toMonth)
    setIsBulkModalOpen(true)
    // 수요기관 프리필만 하고 조회는 사용자가 검색어·수요기관을 확인한 뒤 조회 버튼으로 직접 시작.
    // 기본값은 ① 프로젝트 관리지사(복합 지사는 조달청 표기가 제각각이라 마지막 지명만 — guessInstName 참고)
    // ② 본부 관리 프로젝트는 연계 계약의 수요기관 — 계약이 다른 사업에 잘못 연계된 경우에도 ①이 프로젝트와 일치
    const branch = String(project?.managing_branch || '').trim()
    if (!bulkInst.trim()) {
      if (branch.endsWith('지사')) {
        setBulkInst(guessInstName(branch))
      } else if (project?.g2b_cntrct_no) {
        // 나라장터 계약의 수요기관 프리필 (실패 시 조용히 직접 입력으로)
        setBulkInstLoading(true)
        fetch(`/api/g2b/contract?no=${encodeURIComponent(project.g2b_cntrct_no)}`)
          .then(res => res.json())
          .then(json => {
            const nm = json?.success ? json.data?.contracts?.[0]?.dminsttNms?.[0] : ''
            if (nm) setBulkInst(prev => prev || nm)
          })
          .catch(() => {})
          .finally(() => setBulkInstLoading(false))
      }
    }
  }

  // 기간 프리셋 — 오늘 기준 최근 n개월로 설정만 하고, 조회는 조회 버튼으로 직접 시작
  const applyBulkPreset = (n: number) => {
    if (bulkLoading || bulkImporting) return
    const to = new Date().toISOString().slice(0, 7)
    const d = new Date()
    d.setMonth(d.getMonth() - (n - 1))
    setBulkFrom(d.toISOString().slice(0, 7))
    setBulkTo(to)
  }

  // 'YYYY-MM' 범위를 월 단위 {bgn, end}(YYYYMMDD) 목록으로 변환 — 오늘 이후는 제외
  const buildBulkMonths = (from: string, to: string): Array<{ bgn: string; end: string }> => {
    const months: Array<{ bgn: string; end: string }> = []
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return months
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    let y = Number(from.slice(0, 4))
    let mo = Number(from.slice(5, 7))
    const limit = Number(to.slice(0, 4)) * 100 + Number(to.slice(5, 7))
    while (y * 100 + mo <= limit && months.length < 61) {
      const mm = String(mo).padStart(2, '0')
      const lastDay = new Date(y, mo, 0).getDate()
      const bgn = `${y}${mm}01`
      if (bgn > today) break
      let end = `${y}${mm}${String(lastDay).padStart(2, '0')}`
      if (end > today) end = today
      months.push({ bgn, end })
      mo += 1
      if (mo > 12) { mo = 1; y += 1 }
    }
    return months
  }

  const handleBulkSearch = async (instParam?: string, range?: { from: string; to: string }) => {
    if (bulkLoading || bulkImporting || bulkDetailLoading) return
    const inst = (instParam ?? bulkInst).trim()
    if (!inst) {
      setBulkError('수요기관명을 입력해주세요.')
      return
    }
    const months = buildBulkMonths(range?.from ?? bulkFrom, range?.to ?? bulkTo)
    if (months.length === 0) {
      setBulkError('조회 기간을 확인해주세요.')
      return
    }
    if (months.length > 60) {
      setBulkError('조회 기간은 최대 60개월까지 가능합니다.')
      return
    }
    setBulkLoading(true)
    setBulkError('')
    setBulkItems(null)
    setBulkChecked(new Set())
    setBulkProgress({ done: 0, total: months.length })
    const collected: BulkDlvrItem[] = []
    let firstError = ''
    // 월별 조회를 동시 5개씩 처리
    const queue = [...months]
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (queue.length > 0) {
        const mth = queue.shift()
        if (!mth) break
        try {
          const res = await fetch(`/api/g2b/dlvr-req-list?inst=${encodeURIComponent(inst)}&bgn=${mth.bgn}&end=${mth.end}`)
          const json = await res.json()
          if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
          collected.push(...(json.data?.items || []))
        } catch (err: unknown) {
          if (!firstError) firstError = err instanceof Error ? err.message : '조회에 실패했습니다.'
        } finally {
          setBulkProgress(p => ({ ...p, done: p.done + 1 }))
        }
      }
    }))
    // 납품요구번호별 최신 차수만 유지 (변경 차수는 다른 달에 접수될 수 있어 전체 수집 후 dedupe)
    const byNo = new Map<string, BulkDlvrItem>()
    for (const it of collected) {
      const prev = byNo.get(it.dlvrReqNo)
      if (!prev || it.chgOrd > prev.chgOrd) byNo.set(it.dlvrReqNo, it)
    }
    const list = [...byNo.values()].sort((a, b) => b.rcptDate.localeCompare(a.rcptDate))
    setBulkItems(list)
    if (firstError) {
      setBulkError(list.length === 0 ? firstError : `일부 구간 조회 실패: ${firstError}`)
    }
    setBulkLoading(false)
  }

  // 키워드(건명·품명) 매칭 — API가 건명 파라미터를 지원하지 않아 클라이언트에서 처리.
  // 조달청 건명은 띄어쓰기·축약 표기가 제각각이라("캠프 레드클라우드" vs "캠프레드클라우드") 공백을 제거하고
  // 부분 일치(단어 하나 이상 포함)로 판정 — 일치 단어가 없는 건은 목록에서 제외.
  // 정렬은 일치 단어 많은 순 → 최종납품기한 늦은 순
  const bulkKeywordTokens = bulkKeyword.trim().split(/\s+/).filter(Boolean)
  const bulkMatchCount = (i: BulkDlvrItem) => {
    const target = (i.name + i.prdctNm).replace(/\s+/g, '')
    return bulkKeywordTokens.filter(t => target.includes(t.replace(/\s+/g, ''))).length
  }
  const bulkVisibleItems = (bulkItems || [])
    .filter(i => bulkKeywordTokens.length === 0 || bulkMatchCount(i) > 0)
    .sort((a, b) =>
      bulkMatchCount(b) - bulkMatchCount(a) ||
      (b.deadline || '').localeCompare(a.deadline || '') ||
      b.rcptDate.localeCompare(a.rcptDate))

  const handleBulkImport = async () => {
    if (!bulkItems || bulkImporting || bulkLoading || bulkDetailLoading) return
    const targets = bulkItems.filter(i => bulkChecked.has(i.dlvrReqNo) && !registeredDlvrNos.has(i.dlvrReqNo))
    if (targets.length === 0) return
    setBulkImporting(true)
    setBulkError('')
    setBulkProgress({ done: 0, total: targets.length })
    const added: Material[] = []
    const failed: string[] = []
    // sort_order가 순번 기반이라 순차 등록
    let order = materials.length
    for (const t of targets) {
      try {
        const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(t.dlvrReqNo)}`)
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
        const result: G2bDlvrReq = json.data
        const items = result.items.filter(i => i.qty > 0)
        if (items.length === 0) {
          failed.push(`${t.dlvrReqNo} (유효 품목 없음)`)
          continue
        }
        order += 1
        const mat = await insertMaterialFromDlvrReq(result, items, Math.floor(Math.random() * gemPalette.length), order)
        added.push(mat)
      } catch (err: unknown) {
        console.error('일괄 등록 실패:', t.dlvrReqNo, err)
        failed.push(t.dlvrReqNo)
      } finally {
        setBulkProgress(p => ({ ...p, done: p.done + 1 }))
      }
    }
    if (added.length > 0) setMaterials(prev => [...prev, ...added])
    setBulkImporting(false)
    if (failed.length > 0) {
      setBulkError(`등록 실패 ${failed.length}건: ${failed.join(', ')}`)
      setBulkChecked(new Set(failed.map(f => f.split(' ')[0])))
    } else {
      setIsBulkModalOpen(false)
      if (added.length > 0) alert(`조달청 납품요구 ${added.length}건을 자재로 등록했습니다.`)
    }
  }

  // ── 조달청 일괄 조회 2단계 — 검수기록 이관 ──

  // 선택 건들의 납품요구 상세를 동시 3개씩 조회한 뒤 매핑 화면으로 전환 (이 시점까지 DB 쓰기 없음)
  const handleBulkDetailsFetch = async () => {
    if (!bulkItems || bulkImporting || bulkLoading || bulkDetailLoading) return
    const targets = bulkItems.filter(i => bulkChecked.has(i.dlvrReqNo) && !registeredDlvrNos.has(i.dlvrReqNo))
    if (targets.length === 0) return
    setBulkDetailLoading(true)
    setBulkError('')
    setBulkProgress({ done: 0, total: targets.length })
    const collected: G2bDlvrReq[] = []
    const failed: string[] = []
    const queue = [...targets]
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (queue.length > 0) {
        const t = queue.shift()
        if (!t) break
        try {
          const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(t.dlvrReqNo)}`)
          const json = await res.json()
          if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
          collected.push(json.data as G2bDlvrReq)
        } catch (err: unknown) {
          console.error('납품요구 상세 조회 실패:', t.dlvrReqNo, err)
          failed.push(t.dlvrReqNo)
        } finally {
          setBulkProgress(p => ({ ...p, done: p.done + 1 }))
        }
      }
    }))
    setBulkDetailLoading(false)
    if (collected.length === 0) {
      setBulkError(`상세 조회 실패 ${failed.length}건: ${failed.join(', ')}`)
      return
    }
    // 조회 완료 순서가 선택 순서와 무관하므로 목록 표시 순서로 정렬
    const orderMap = new Map(targets.map((t, i) => [t.dlvrReqNo, i]))
    collected.sort((a, b) => (orderMap.get(a.dlvrReqNo) ?? 0) - (orderMap.get(b.dlvrReqNo) ?? 0))
    setBulkDetails(collected)
    setBulkError(failed.length > 0 ? `일부 상세 조회 실패 ${failed.length}건: ${failed.join(', ')}` : '')
    setBulkStep('assign')
  }

  // 한 자재의 규격 그룹별 합격량 누계(pass_qty_total)를 created_at 순 pass_qty_current 누계로 재계산해 갱신.
  // 수불부 표(2554행)가 저장값을 그대로 표시하므로 이관·재배치 후 필수.
  const recalcPassTotalsForMaterial = async (materialId: string) => {
    const { data, error: qErr } = await supabase
      .from('material_ledger_entries')
      .select('id, name_or_spec, pass_qty_current, pass_qty_total, created_at')
      .eq('material_id', materialId)
      .order('created_at', { ascending: true })
    if (qErr) throw qErr
    const runningBySpec = new Map<string, number>()
    for (const r of data || []) {
      const spec = r.name_or_spec || ''
      const cur = r.pass_qty_current != null ? Number(r.pass_qty_current) : 0
      const running = (runningBySpec.get(spec) || 0) + cur
      runningBySpec.set(spec, running)
      const desired = running > 0 ? running : null
      const stored = r.pass_qty_total != null ? Number(r.pass_qty_total) : null
      const same = (stored == null && desired == null) || (stored != null && desired != null && stored === desired)
      if (!same) {
        const { error: upErr } = await supabase
          .from('material_ledger_entries')
          .update({ pass_qty_total: desired })
          .eq('id', r.id)
        if (upErr) throw upErr
      }
    }
  }

  // 이관 적용 — 건별 자재+발주 행 신규 생성 후 배정된 기존 행을 새 자재로 UPDATE 재배치 (INSERT/DELETE 아님)
  const handleBulkAssignApply = async (
    assignments: { rowId: string; dlvrReqNo: string; sno: number }[],
    deleteEmptied: boolean
  ) => {
    if (bulkImporting) return
    setBulkImporting(true)
    setBulkError('')
    setBulkProgress({ done: 0, total: bulkDetails.length })

    // 좌측 표시(평면) 순서 — 이관 행 created_at을 이 순서대로 부여
    const eligible = materials.filter(m => !m.dlvrReqNo && m.rows.every(r => !r.dlvrReqNo))
    const leftFlatOrder = new Map<string, number>()
    let flatIdx = 0
    for (const m of eligible) {
      for (const r of m.rows) {
        if (isActivityRow(r)) leftFlatOrder.set(r.id, flatIdx++)
      }
    }
    // rowId → 원본 자재
    const rowOwner = new Map<string, string>()
    for (const m of materials) {
      for (const r of m.rows) rowOwner.set(r.id, m.id)
    }

    // 배정을 납품요구번호별로 묶기
    const byReq = new Map<string, { rowId: string; sno: number }[]>()
    for (const a of assignments) {
      const arr = byReq.get(a.dlvrReqNo) || []
      arr.push({ rowId: a.rowId, sno: a.sno })
      byReq.set(a.dlvrReqNo, arr)
    }

    const failed: string[] = []
    const affectedOrigIds = new Set<string>()
    const newMatIds: string[] = []
    let registeredCount = 0
    let movedCount = 0
    let deletedCount = 0
    let order = materials.length

    for (const result of bulkDetails) {
      try {
        const items = result.items.filter(i => i.qty > 0)
        if (items.length === 0) {
          failed.push(`${result.dlvrReqNo} (유효 품목 없음)`)
          continue
        }
        order += 1
        const newMat = await insertMaterialFromDlvrReq(result, items, Math.floor(Math.random() * gemPalette.length), order)
        registeredCount += 1
        newMatIds.push(newMat.id)

        const groupAssigns = byReq.get(result.dlvrReqNo) || []
        if (groupAssigns.length > 0) {
          // 새 자재 발주 행의 created_at 최댓값을 기준으로 이관 행을 그 뒤에 배치 (서버 시각 기준이라 시계 오차 무관)
          const { data: baseRows } = await supabase
            .from('material_ledger_entries')
            .select('created_at')
            .eq('material_id', newMat.id)
            .order('created_at', { ascending: false })
            .limit(1)
          const baseTs = baseRows?.[0]?.created_at ? new Date(baseRows[0].created_at).getTime() : Date.now()
          const ordered = [...groupAssigns].sort((a, b) => (leftFlatOrder.get(a.rowId) ?? 0) - (leftFlatOrder.get(b.rowId) ?? 0))
          let k = 0
          for (const asg of ordered) {
            const item = result.items.find(i => i.sno === asg.sno)
            if (!item) {
              failed.push(`${result.dlvrReqNo} 품목#${asg.sno} (품목 없음)`)
              continue
            }
            const origId = rowOwner.get(asg.rowId)
            if (origId) affectedOrigIds.add(origId)
            k += 1
            const createdAt = new Date(baseTs + k * 1000).toISOString()
            const { error: upErr } = await supabase
              .from('material_ledger_entries')
              .update({
                material_id: newMat.id,
                name_or_spec: formatG2bSpec(item),
                order_qty: null,
                dlvr_req_no: result.dlvrReqNo,
                dlvr_req_prdct_sno: item.sno,
                created_at: createdAt,
              })
              .eq('id', asg.rowId)
            if (upErr) {
              console.error('행 이관 실패:', asg.rowId, upErr)
              failed.push(`${result.dlvrReqNo} 행 이관 실패`)
              continue
            }
            movedCount += 1
          }
        }
      } catch (err: unknown) {
        console.error('이관 등록 실패:', result.dlvrReqNo, err)
        failed.push(result.dlvrReqNo)
      } finally {
        setBulkProgress(p => ({ ...p, done: p.done + 1 }))
      }
    }

    // 합격량 누계 재계산 — 새 자재 + 부분 이관/삭제 해제로 남는 원본 자재
    for (const mid of new Set<string>([...newMatIds, ...affectedOrigIds])) {
      try {
        await recalcPassTotalsForMaterial(mid)
      } catch (err: unknown) {
        console.error('합격 누계 재계산 실패:', mid, err)
      }
    }

    // 빈 수기 자재 삭제 — 삭제 직전 남은 행 수를 재확인해 0건일 때만 (CASCADE 오삭제 방지)
    if (deleteEmptied) {
      for (const origId of affectedOrigIds) {
        try {
          const { count, error: cErr } = await supabase
            .from('material_ledger_entries')
            .select('id', { count: 'exact', head: true })
            .eq('material_id', origId)
          if (cErr) throw cErr
          if ((count ?? 0) === 0) {
            const { error: delErr } = await supabase.from('materials').delete().eq('id', origId)
            if (delErr) throw delErr
            deletedCount += 1
          }
        } catch (err: unknown) {
          console.error('빈 자재 삭제 실패:', origId, err)
        }
      }
    }

    await loadData()
    setBulkImporting(false)
    setIsBulkModalOpen(false)
    const summary = `등록 ${registeredCount}건 · 이관 ${movedCount}행` + (deletedCount > 0 ? ` · 삭제 ${deletedCount}자재` : '')
    if (failed.length > 0) {
      setBulkError(`일부 실패 ${failed.length}건: ${failed.join(', ')}`)
      alert(`${summary}\n실패 ${failed.length}건: ${failed.join(', ')}`)
    } else {
      alert(summary)
    }
  }

  // 이관 매핑 화면 좌측 — 미연계 수기 자재의 실적 행만 평면화
  const assignLeftRows = materials
    .filter(m => !m.dlvrReqNo && m.rows.every(r => !r.dlvrReqNo))
    .flatMap(m => m.rows.filter(isActivityRow).map(r => ({
      rowId: r.id,
      materialId: m.id,
      materialName: m.name,
      unit: m.unit || '',
      spec: stripDupItemName(r.nameOrSpec || '', m.name) || (r.nameOrSpec || ''),
      orderQty: r.orderQty || '',
      receiveDate: r.receiveDate || '',
      receiveQty: r.receiveQty || '',
      passQty: r.passQtyCurrent || '',
      releaseQty: r.releaseQty || '',
    })))

  // 이관 매핑 화면 우측 — 선택 건의 품목 (qty 0 품목 제외)
  const assignRightItems = bulkDetails.flatMap(req => {
    const maxDeadline = req.items.reduce((mx, i) => (i.deadline > mx ? i.deadline : mx), '')
    return req.items.filter(i => i.qty > 0).map(i => ({
      dlvrReqNo: req.dlvrReqNo,
      title: req.title,
      deadline: maxDeadline,
      sno: i.sno,
      name: i.name,
      spec: formatG2bSpec(i),
      unit: i.unit || '',
      qty: i.qty,
      unitPrice: i.unitPrice,
    }))
  })

  // ── 지급자재 계약 현황 엑셀 다운로드 ──

  // 자재별 계약 정보(납품요구번호·계약자·품대·수수료·인도조건·납품기한)를 일괄로 엑셀에 담는다.
  // 계약명은 조달청 납품요구 건명을 조회해 채우고, 실패하거나 미연계면 자재명으로 대체.
  const handleDownloadContractStatus = async () => {
    if (contractExporting) return
    if (materials.length === 0) {
      alert('다운로드할 자재가 없습니다.')
      return
    }
    setContractExporting(true)
    setContractProgress(0)
    try {
      const nos = [...new Set(
        materials.flatMap(m => [m.dlvrReqNo, ...m.rows.map(r => r.dlvrReqNo)]).filter((v): v is string => !!v)
      )]
      const titles = new Map<string, string>()
      // 납품요구 건명 조회를 동시 5개씩 처리 (조회 완료 수로 진행률 표시)
      const queue = [...nos]
      const total = nos.length
      let done = 0
      await Promise.all(Array.from({ length: 5 }, async () => {
        while (queue.length > 0) {
          const no = queue.shift()
          if (!no) break
          try {
            const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
            const json = await res.json()
            if (res.ok && json.success && json.data?.title) titles.set(no, json.data.title)
          } catch {
            // 건명 조회 실패는 자재명으로 대체하므로 조용히 넘어간다
          } finally {
            done += 1
            // 건명 조회는 전체의 90%까지, 나머지 10%는 엑셀 생성 단계
            setContractProgress(total > 0 ? Math.round((done / total) * 90) : 90)
          }
        }
      }))
      // 품목(규격)당 한 줄 — 같은 규격의 행들(연계 행·보정 행)을 묶어 금액을 합산
      const rows: MaterialContractRow[] = materials.flatMap(m => {
        const specs = getSpecList(m)
        if (specs.length === 0) specs.push('')
        return specs.map(spec => {
          const specRows = m.rows.filter(r => r.nameOrSpec === spec)
          const prdctAmt = specRows.reduce((s, r) => s + (parseFloat(stripComma(r.prdctAmt || '')) || 0), 0)
          const feeAmt = specRows.reduce((s, r) => s + (parseFloat(stripComma(r.feeAmt || '')) || 0), 0)
          const cndtn = [...new Set(specRows.map(r => r.dlvrCndtn).filter(Boolean))].join(', ')
          const dlvrReqNo = specRows.find(r => r.dlvrReqNo)?.dlvrReqNo || m.dlvrReqNo || ''
          return {
            contractName: (dlvrReqNo && titles.get(dlvrReqNo)) || m.name,
            itemName: m.name,
            spec,
            qty: calcEffectiveOrderQty(specRows),
            unit: m.unit || '',
            dlvrReqNo,
            supplier: m.dlvrSupplier || '',
            cndtn,
            deadline: m.dlvrDeadline || '',
            prdctAmt,
            feeAmt,
            note: m.dlvrSupplierTel || '',
          }
        })
      })
      setContractProgress(95)
      await downloadMaterialContractStatusExcel(project?.project_name || '', rows)
      setContractProgress(100)
    } catch (err: unknown) {
      console.error('계약 현황 다운로드 실패:', err)
      alert('엑셀 다운로드에 실패했습니다.')
    } finally {
      setContractExporting(false)
      setContractProgress(0)
    }
  }

  // ── 수불부 엑셀 다운로드 (검수조서 + 사진대지 + 수불부 + 출고요청서) ──

  const handleDownloadLedgerExcel = async () => {
    if (!selectedMaterial || ledgerExporting) return
    const mat = selectedMaterial
    setLedgerExporting(true)
    try {
      // 계약명 = 납품요구 건명 (캐시 우선, 없으면 조회 — 실패 시 자재명으로 대체)
      const no = mat.dlvrReqNo || mat.rows.find(r => r.dlvrReqNo)?.dlvrReqNo || ''
      let contractTitle = (no && dlvrTitles[no]) || ''
      if (no && !contractTitle) {
        try {
          const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
          const json = await res.json()
          if (res.ok && json.success && json.data?.title) {
            contractTitle = String(json.data.title)
            setDlvrTitles(prev => ({ ...prev, [no]: contractTitle }))
          }
        } catch {
          // 건명 조회 실패는 자재명으로 대체
        }
      }
      // 검수조서 내역 — 규격당 한 줄 (수량 = 유효 발주량, 금액 = 품대 합산)
      const josaItems = getSpecList(mat).map(spec => {
        const specRows = mat.rows.filter(r => r.nameOrSpec === spec)
        const [firstLine, ...restLines] = spec.split('\n')
        return {
          name: firstLine || mat.name,
          spec: restLines.join('\n').replace(/^\(/, '').replace(/\)$/, ''),
          unit: mat.unit || '',
          qty: calcEffectiveOrderQty(specRows),
          amt: specRows.reduce((s, r) => s + (parseFloat(stripComma(r.prdctAmt || '')) || 0), 0),
        }
      })
      const cndtn = [...new Set(mat.rows.map(r => r.dlvrCndtn).filter(Boolean))].join(', ')
      // 검수 사진 — 행 순서대로, 사진설명은 해당 행의 규격 + 반입일 (자재명은 구분란에 이미 표기)
      const photos = mat.rows.flatMap(r => {
        const spec = stripDupItemName(r.nameOrSpec || '', mat.name).replace(/\n/g, ' ')
        return (r.inspectionPhotos || []).map(url => ({
          url,
          caption: `${spec ? `${spec} ` : ''}검수${r.receiveDate ? ` (반입일 ${r.receiveDate})` : ''}`,
        }))
      })
      await downloadMaterialLedgerExcel(
        mat.name,
        mat.unit,
        mat.rows,
        project?.project_name,
        project?.supervisor_name,
        {
          contractTitle: contractTitle || mat.name,
          dlvrReqNo: no,
          supplier: mat.dlvrSupplier || '',
          deadline: mat.dlvrDeadline || '',
          cndtn,
          receiverName: project?.user_profiles?.full_name || '',
          josaItems,
          photos,
        }
      )
    } catch (err: unknown) {
      console.error('수불부 엑셀 다운로드 실패:', err)
      alert('엑셀 다운로드에 실패했습니다.')
    } finally {
      setLedgerExporting(false)
    }
  }

  // ── 조달청 연계/동기화 (기존 자재 ↔ 납품요구번호) ──

  // 자재의 규격 목록 (첫 등장 순서 유지)
  const getSpecList = (mat: Material) => {
    const list: string[] = []
    for (const r of mat.rows) {
      if (r.nameOrSpec && !list.includes(r.nameOrSpec)) list.push(r.nameOrSpec)
    }
    return list
  }

  const clearDlvrDetailProgressTimers = useCallback(() => {
    if (dlvrDetailProgressTimerRef.current) clearInterval(dlvrDetailProgressTimerRef.current)
    if (dlvrDetailCompleteTimerRef.current) clearTimeout(dlvrDetailCompleteTimerRef.current)
    dlvrDetailProgressTimerRef.current = null
    dlvrDetailCompleteTimerRef.current = null
  }, [])

  const startDlvrDetailProgress = useCallback(() => {
    clearDlvrDetailProgressTimers()
    setDlvrDetailProgress(0)
    dlvrDetailProgressTimerRef.current = setInterval(() => {
      setDlvrDetailProgress(prev => Math.min(90, prev + Math.max(1, Math.ceil((90 - prev) * 0.12))))
    }, 300)
  }, [clearDlvrDetailProgressTimers])

  const finishDlvrDetailProgress = useCallback((requestId: number) => {
    if (dlvrDetailRequestRef.current !== requestId) return
    clearDlvrDetailProgressTimers()
    setDlvrDetailProgress(100)
    dlvrDetailCompleteTimerRef.current = setTimeout(() => {
      if (dlvrDetailRequestRef.current === requestId) setDlvrDetailLoading(false)
      dlvrDetailCompleteTimerRef.current = null
    }, 180)
  }, [clearDlvrDetailProgressTimers])

  useEffect(() => () => {
    dlvrDetailRequestRef.current += 1
    clearDlvrDetailProgressTimers()
  }, [clearDlvrDetailProgressTimers])

  // 지급·검사검수는 기본 납품요구 상세를 먼저 표시한 뒤 별도로 조회하고, 납품요구번호 완전일치 문서만 남긴다
  const loadDlvrPayInsp = async (requestId: number, no: string, detail: G2bDlvrReq) => {
    if (dlvrDetailRequestRef.current !== requestId) return
    setDlvrInspsLoading(true)
    setDlvrInspsError('')
    try {
      const exact = await fetchDlvrPayInsp(no, detail.title, detail.demandOrg)
      if (dlvrDetailRequestRef.current !== requestId) return
      setDlvrPays(exact.pays)
      setDlvrInsps(exact.insps)
      setDlvrInspByNo(new Map([...dlvrPayInspCache].map(([cachedNo, docs]) => [cachedNo, docs.insps])))
    } catch (err: unknown) {
      if (dlvrDetailRequestRef.current !== requestId) return
      setDlvrInspsError(err instanceof Error ? err.message : '지급·검사검수 내역을 불러오지 못했습니다.')
    } finally {
      if (dlvrDetailRequestRef.current === requestId) setDlvrInspsLoading(false)
    }
  }

  // 자재명 클릭 — 상위 단가계약이 아닌 실제 수요기관 납품요구를 읽기 전용으로 표시한다
  const openDlvrDetail = async (noParam?: string) => {
    const no = normalizeDlvrReqNo(noParam || selectedMaterial?.dlvrReqNo || '')
    if (!no) return
    const requestId = ++dlvrDetailRequestRef.current
    startDlvrDetailProgress()
    setDlvrDetailNo(no)
    setDlvrDetail(null)
    setDlvrDetailError('')
    const cachedDocs = dlvrPayInspCache.get(no)
    setDlvrPays(cachedDocs?.pays || [])
    setDlvrInsps(cachedDocs?.insps || [])
    setDlvrInspsLoading(false)
    setDlvrInspsError('')
    setDlvrDetailLoading(true)
    setDlvrDetailOpen(true)
    try {
      const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
      const json = await res.json()
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || '납품요구 상세를 불러오지 못했습니다.')
      }
      if (dlvrDetailRequestRef.current !== requestId) return
      const detail = json.data as G2bDlvrReq
      setDlvrDetail(detail)
      void loadDlvrPayInsp(requestId, no, detail)
    } catch (err: unknown) {
      if (dlvrDetailRequestRef.current !== requestId) return
      setDlvrDetailError(err instanceof Error ? err.message : '납품요구 상세를 불러오지 못했습니다.')
    } finally {
      finishDlvrDetailProgress(requestId)
    }
  }

  const closeDlvrDetail = () => {
    // 닫힌 뒤 도착하거나 다음 클릭보다 늦게 도착한 응답이 모달을 다시 채우지 못하게 무효화한다
    dlvrDetailRequestRef.current += 1
    clearDlvrDetailProgressTimers()
    setDlvrDetailOpen(false)
    setDlvrDetailLoading(false)
    setDlvrDetailProgress(0)
    setDlvrInspsLoading(false)
  }

  const openLinkModal = () => {
    if (!selectedMaterial) return
    setLinkNo(selectedMaterial.dlvrReqNo || '')
    setLinkError('')
    setLinkResult(null)
    setLinkMapping({})
    setLinkAdjust({})
    setIsLinkModalOpen(true)
    // 이미 연계된 자재는 저장된 번호로 바로 조회 (동기화)
    if (selectedMaterial.dlvrReqNo) void handleLinkLookup(selectedMaterial.dlvrReqNo)
  }

  const handleLinkLookup = async (noParam?: string) => {
    const no = (noParam ?? linkNo).trim()
    if (!no || linkLoading || !selectedMaterial) return
    setLinkLoading(true)
    setLinkError('')
    setLinkResult(null)
    try {
      const res = await fetch(`/api/g2b/dlvr-req?no=${encodeURIComponent(no)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || '조회에 실패했습니다.')
      const result: G2bDlvrReq = json.data
      // 기본 매칭 — ① 행에 저장된 번호+품목순번 ② 규격 문자열 일치 ③ 품목·규격이 각 1개면 자동 연결
      // 현재 자재를 우선하되 다른 자재의 규격도 후보로 탐색
      const matsInOrder = [selectedMaterial, ...materials.filter(m => m.id !== selectedMaterial.id)]
      const mapping: Record<number, string> = {}
      const adjust: Record<number, boolean> = {}
      for (const item of result.items) {
        let value = ''
        for (const m of matsInOrder) {
          const bySno = m.rows.find(r => r.dlvrReqNo === result.dlvrReqNo && r.dlvrReqPrdctSno === item.sno)
          if (bySno?.nameOrSpec) { value = m.id + MAP_SEP + bySno.nameOrSpec; break }
        }
        if (!value) {
          const fmt = formatG2bSpec(item)
          for (const m of matsInOrder) {
            const hit = getSpecList(m).find(s => s === fmt || s === item.spec)
            if (hit) { value = m.id + MAP_SEP + hit; break }
          }
        }
        if (!value && result.items.length === 1 && getSpecList(selectedMaterial).length === 1) {
          value = selectedMaterial.id + MAP_SEP + getSpecList(selectedMaterial)[0]
        }
        mapping[item.sno] = value
        adjust[item.sno] = true
      }
      setLinkResult(result)
      setLinkMapping(mapping)
      setLinkAdjust(adjust)
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : '조회에 실패했습니다.')
    } finally {
      setLinkLoading(false)
    }
  }

  // 매핑 값("자재ID(구분자)규격") 해석
  const parseLinkTarget = (value: string): { matId: string; spec: string } | null => {
    if (!value) return null
    const idx = value.indexOf(MAP_SEP)
    if (idx < 0) return null
    return { matId: value.slice(0, idx), spec: value.slice(idx + MAP_SEP.length) }
  }

  // 매핑된 품목의 대상 자재·원장 발주량·차이·초과반입 여부 계산
  const getLinkDiff = (item: G2bItem) => {
    const target = parseLinkTarget(linkMapping[item.sno] || '')
    if (!target || target.spec === NEW_SPEC) return null
    const targetMat = materials.find(m => m.id === target.matId)
    if (!targetMat) return null
    const matching = targetMat.rows.filter(r => r.nameOrSpec === target.spec)
    if (matching.length === 0) return null
    const ledgerQty = calcEffectiveOrderQty(matching)
    const passTotal = matching.reduce((sum, r) => sum + (parseFloat(r.passQtyCurrent) || 0), 0)
    return {
      matName: targetMat.name,
      isOtherMat: targetMat.id !== selectedMaterial?.id,
      ledgerQty,
      diff: Math.round((item.qty - ledgerQty) * 1000) / 1000,
      overDelivered: passTotal > item.qty,
    }
  }

  const handleApplyLink = async () => {
    if (!selectedMaterial || !linkResult || linkApplying) return
    // 같은 자재·규격에 품목 두 개 이상 매핑 방지
    const chosen = Object.values(linkMapping).filter(v => v && parseLinkTarget(v)?.spec !== NEW_SPEC)
    if (new Set(chosen).size !== chosen.length) {
      alert('같은 규격에 두 개 이상의 품목을 연결할 수 없습니다.')
      return
    }
    setLinkApplying(true)
    try {
      // 연계 정보가 기록될 자재 목록 (현재 자재 + 매핑으로 선택된 다른 자재)
      const linkedMatIds = new Set<string>([selectedMaterial.id])

      for (const item of linkResult.items) {
        const target = parseLinkTarget(linkMapping[item.sno] || '')
        if (!target) continue
        const targetMat = materials.find(m => m.id === target.matId)
        if (!targetMat) continue

        // 새 규격 행으로 추가
        if (target.spec === NEW_SPEC) {
          const { error: insErr } = await supabase.from('material_ledger_entries').insert({
            material_id: targetMat.id,
            name_or_spec: formatG2bSpec(item),
            order_qty: item.qty || null,
            created_by: user?.id,
            dlvr_req_no: linkResult.dlvrReqNo,
            dlvr_req_prdct_sno: item.sno,
            dlvr_cndtn: item.cndtn || null,
            unit_price: item.unitPrice || null,
            prdct_amt: item.amt || null,
            fee_amt: calcG2bItemFee(linkResult.items, item) || null,
          })
          if (insErr) throw insErr
          linkedMatIds.add(targetMat.id)
          continue
        }

        const matching = targetMat.rows.filter(r => r.nameOrSpec === target.spec)
        if (matching.length === 0) continue

        // 규격의 첫 행에 연계 정보 저장 — 인도조건·단가·품대·수수료(고시 요율 추정)를 조달청 값으로 갱신
        const { error: updErr } = await supabase.from('material_ledger_entries')
          .update({
            dlvr_req_no: linkResult.dlvrReqNo,
            dlvr_req_prdct_sno: item.sno,
            dlvr_cndtn: item.cndtn || null,
            unit_price: item.unitPrice || null,
            prdct_amt: item.amt || null,
            fee_amt: calcG2bItemFee(linkResult.items, item) || null,
          })
          .eq('id', matching[0].id)
        if (updErr) throw updErr
        linkedMatIds.add(targetMat.id)

        // 발주량 차이 보정 — 증감 행 추가 (초과 반입 상태면 자동 보정하지 않음)
        const info = getLinkDiff(item)
        if (info && info.diff !== 0 && linkAdjust[item.sno] && !info.overDelivered) {
          const { error: adjErr } = await supabase.from('material_ledger_entries').insert({
            material_id: targetMat.id,
            name_or_spec: target.spec,
            order_qty: info.diff,
            created_by: user?.id,
            dlvr_req_no: linkResult.dlvrReqNo,
            dlvr_req_prdct_sno: item.sno,
          })
          if (adjErr) throw adjErr
        }
      }

      const maxDeadline = linkResult.items.reduce((mx, i) => (i.deadline > mx ? i.deadline : mx), '')
      const { error: matErr } = await supabase.from('materials')
        .update({
          dlvr_req_no: linkResult.dlvrReqNo,
          dlvr_req_synced_at: new Date().toISOString(),
          dlvr_supplier: linkResult.supplier || null,
          ...(linkResult.supplierTel ? { dlvr_supplier_tel: linkResult.supplierTel } : {}),
          dlvr_deadline: maxDeadline || null,
        })
        .in('id', Array.from(linkedMatIds))
      if (matErr) throw matErr

      setIsLinkModalOpen(false)
      await loadData()
    } catch (err: unknown) {
      console.error('조달청 연계 실패:', err)
      alert('연계 적용에 실패했습니다.')
    } finally {
      setLinkApplying(false)
    }
  }

  const handleDeleteMaterial = async (id: string) => {
    const mat = materials.find(m => m.id === id)
    if (!mat) return
    if (!confirm(`"${mat.name}" 자재를 삭제하시겠습니까?`)) return
    try {
      const { error: deleteError } = await supabase
        .from('materials')
        .delete()
        .eq('id', id)
      if (deleteError) throw deleteError
      const remaining = materials.filter(m => m.id !== id)
      setMaterials(remaining)
      // 삭제 후 순서 재정렬 및 인코딩
      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i] as any
        const newRealOrder = i + 1
        const newEncoded = ((item.colorIndex ?? 0) + 1) * 1000 + newRealOrder
        await supabase.from('materials').update({ sort_order: newEncoded }).eq('id', item.id)
      }
    } catch (err: any) {
      console.error('자재 삭제 실패:', err)
      alert('자재 삭제에 실패했습니다.')
    }
  }

  // ── 자재명/규격 수정 ──

  const openMaterialEditModal = () => {
    if (!selectedMaterial) return
    const selMat = selectedMaterial as any
    setMaterialEditForm({
      name: selMat.name,
      unit: selMat.unit,
      colorIndex: selMat.colorIndex !== undefined ? selMat.colorIndex : 0,
      supplier: selMat.dlvrSupplier || '',
      supplierTel: selMat.dlvrSupplierTel || '',
      deadline: selMat.dlvrDeadline || ''
    })
    setIsMaterialEditModalOpen(true)
  }

  const handleUpdateMaterial = async () => {
    if (!selectedMaterial || !materialEditForm.name.trim()) return
    try {
      const selMat = selectedMaterial as any
      const realOrder = selMat.realOrder || 1
      const newEncoded = (materialEditForm.colorIndex + 1) * 1000 + realOrder
      const { error: updateError } = await supabase
        .from('materials')
        .update({
          name: materialEditForm.name.trim(),
          unit: materialEditForm.unit.trim() || null,
          sort_order: newEncoded,
          dlvr_supplier: materialEditForm.supplier.trim() || null,
          dlvr_supplier_tel: materialEditForm.supplierTel.trim() || null,
          dlvr_deadline: materialEditForm.deadline || null,
        })
        .eq('id', selectedMaterial.id)
      if (updateError) throw updateError
      setMaterials(prev => prev.map(m =>
        m.id === selectedMaterial.id
          ? {
              ...m,
              name: materialEditForm.name.trim(),
              unit: materialEditForm.unit.trim(),
              sortOrder: newEncoded,
              colorIndex: materialEditForm.colorIndex,
              realOrder,
              dlvrSupplier: materialEditForm.supplier.trim() || null,
              dlvrSupplierTel: materialEditForm.supplierTel.trim() || null,
              dlvrDeadline: materialEditForm.deadline || null
            } as any
          : m
      ))
      setIsMaterialEditModalOpen(false)
    } catch (err: any) {
      console.error('자재 수정 실패:', err)
      alert('자재 수정에 실패했습니다.')
    }
  }

  // ── 내역 행 CRUD ──

  // 유효 발주량 = 첫 행 발주량 + 증감 행의 발주량 합산.
  // 증감 행: 발주량만 입력되고 반입·합격·불출이 전부 빈 행 (계약수량 변경 시 ± 행으로 추가하는 용도)
  const calcEffectiveOrderQty = (matchingRows: MaterialRow[]) => {
    if (matchingRows.length === 0) return 0
    const base = parseFloat(matchingRows[0].orderQty) || 0
    const adjustments = matchingRows.slice(1)
      .filter(r =>
        (parseFloat(r.orderQty) || 0) !== 0 &&
        !(parseFloat(r.receiveQty) || 0) &&
        !(parseFloat(r.passQtyCurrent) || 0) &&
        !(parseFloat(r.releaseQty) || 0)
      )
      .reduce((sum, r) => sum + (parseFloat(r.orderQty) || 0), 0)
    return base + adjustments
  }

  // 표시용 잔량 자동 계산 — 같은 규격 행들의 (반입 - 불합격 - 출고)를 현재 행까지 누적.
  // 저장된 remain_qty는 행 수정 순서에 따라 낡을 수 있어 표에서는 항상 계산값을 보여준다
  const calcRunningRemain = (rows: MaterialRow[], idx: number): string => {
    const spec = rows[idx].nameOrSpec
    let remain = 0
    let hasActivity = false
    for (let i = 0; i <= idx; i++) {
      const r = rows[i]
      if (r.nameOrSpec !== spec) continue
      const rec = parseFloat(r.receiveQty) || 0
      const fail = parseFloat(r.failQty) || 0
      const rel = parseFloat(r.releaseQty) || 0
      if (rec || rel) hasActivity = true
      remain += rec - fail - rel
    }
    if (!hasActivity) return ''
    return String(Math.round(remain * 1000) / 1000)
  }

  // 표시용 반입잔량 자동 계산 — 발주량(유효: 첫 행 + 증감 행) 대비 현재 행까지의 반입 누계 차감
  const calcRunningReceiveRemain = (rows: MaterialRow[], idx: number): string => {
    const spec = rows[idx].nameOrSpec
    const upto = rows.slice(0, idx + 1).filter(r => r.nameOrSpec === spec)
    const orderQty = calcEffectiveOrderQty(upto)
    if (!orderQty) return ''
    const received = upto.reduce((sum, r) => sum + (parseFloat(r.receiveQty) || 0), 0)
    return String(Math.round((orderQty - received) * 1000) / 1000)
  }

  // 이전 등록 행에서 인도조건·단가·품대·수수료 기본값 추출 — 같은 규격의 최근 행부터 비어있지 않은 값 사용
  const getPrevCondDefaults = (rows: MaterialRow[], nameOrSpec: string) => {
    const matching = rows.filter(r => r.nameOrSpec === nameOrSpec)
    const lastNonEmpty = (get: (r: MaterialRow) => string | undefined) => {
      for (let i = matching.length - 1; i >= 0; i--) {
        const v = (get(matching[i]) || '').trim()
        if (v) return v
      }
      return ''
    }
    return {
      dlvrCndtn: lastNonEmpty(r => r.dlvrCndtn),
      unitPrice: lastNonEmpty(r => r.unitPrice),
      prdctAmt: lastNonEmpty(r => r.prdctAmt),
      feeAmt: lastNonEmpty(r => r.feeAmt),
    }
  }

  const openRowModal = () => {
    const today = new Date().toISOString().split('T')[0]
    const rows = selectedMaterial?.rows || []

    // 최근 행의 품명/규격을 기본값으로 사용 (내역이 없으면 자재 이름 사용)
    let defaultNameOrSpec = ''
    let defaultOrderQty = ''

    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1]
      defaultNameOrSpec = lastRow.nameOrSpec || ''

      // 같은 품명의 모든 행을 찾아서 발주잔량 계산
      if (defaultNameOrSpec) {
        const matchingRows = rows.filter(row => row.nameOrSpec === defaultNameOrSpec)
        if (matchingRows.length > 0) {
          const originalOrderQty = calcEffectiveOrderQty(matchingRows)
          // 합격량 누계
          const totalPassed = matchingRows.reduce((sum, row) => {
            return sum + (parseFloat(row.passQtyCurrent) || 0)
          }, 0)
          // 발주잔량 = 발주량 - 합격량 누계
          const remainingQty = originalOrderQty - totalPassed
          if (remainingQty > 0) defaultOrderQty = String(remainingQty)
        }
      }
    } else {
      // 내역이 없는 경우 자재 이름을 기본값으로 사용
      defaultNameOrSpec = selectedMaterial?.name || ''
    }

    // 이전 등록의 인도조건·단가·품대·수수료를 기본값으로 사용
    const condDefaults = getPrevCondDefaults(rows, defaultNameOrSpec)

    setEditingRowId(null)
    setRowForm({
      nameOrSpec: defaultNameOrSpec,
      orderQty: defaultOrderQty,
      ...condDefaults,
      receiveDate: today, receiveQty: '', passQtyCurrent: '',
      failQty: '-', action: '해당없음', releaseDate: today, releaseQty: '',
    })
    setRowPhotos([])
    setIsRowModalOpen(true)
  }

  const openEditRowModal = (row: MaterialRow) => {
    setEditingRowId(row.id)
    setRowForm({
      nameOrSpec: row.nameOrSpec,
      orderQty: row.orderQty,
      dlvrCndtn: row.dlvrCndtn || '',
      unitPrice: row.unitPrice || '',
      prdctAmt: row.prdctAmt || '',
      feeAmt: row.feeAmt || '',
      receiveDate: row.receiveDate,
      receiveQty: row.receiveQty,
      passQtyCurrent: row.passQtyCurrent,
      failQty: row.failQty,
      action: row.action,
      releaseDate: row.releaseDate,
      releaseQty: row.releaseQty,
    })
    setRowPhotos(row.inspectionPhotos || [])
    setIsRowModalOpen(true)
  }

  // 품명/규격이 변경되면 발주잔량 및 등록 조건 기본값 자동 계산
  const handleNameOrSpecChange = (value: string) => {
    if (!selectedMaterial) {
      setRowForm(p => ({ ...p, nameOrSpec: value, orderQty: '' }))
      return
    }

    // 같은 품명/규격을 가진 기존 행 찾기
    const matchingRows = selectedMaterial.rows.filter(
      row => row.nameOrSpec === value && (!editingRowId || row.id !== editingRowId)
    )

    let newOrderQty = ''

    if (matchingRows.length > 0) {
      // 같은 품명이 있는 경우: 유효 발주량(첫 행 + 증감 행 합산)에서 합격량 누계를 빼서 잔량 계산
      const originalOrderQty = calcEffectiveOrderQty(matchingRows)

      // 같은 품명의 모든 행의 합격량 누계
      const totalPassed = matchingRows.reduce((sum, row) => {
        return sum + (parseFloat(row.passQtyCurrent) || 0)
      }, 0)

      // 발주잔량 = 발주량 - 합격량 누계
      const remainingQty = originalOrderQty - totalPassed
      newOrderQty = remainingQty > 0 ? String(remainingQty) : ''
    }

    // 신규 등록 중 규격 변경 시 인도조건·단가·품대·수수료도 해당 규격의 이전 값으로 갱신
    const condDefaults = editingRowId ? null : getPrevCondDefaults(selectedMaterial.rows, value)

    setRowForm(p => ({
      ...p,
      nameOrSpec: value,
      orderQty: newOrderQty,
      ...(condDefaults ?? {}),
    }))
  }

  // 반입량 입력 시 합격량·출고량이 같이 따라감 (직접 수정하면 동기화 중단).
  // 출고량은 해당 행의 반입량만 따라가고 이전 보관 잔량은 합산하지 않는다 — 잔량 계산이 어긋나던 원인
  const handleReceiveQtyChange = (value: string) => {
    setRowForm(p => {
      const syncPass = p.passQtyCurrent === '' || p.passQtyCurrent === p.receiveQty
      const syncRelease = p.releaseQty === '' || p.releaseQty === p.passQtyCurrent || p.releaseQty === p.receiveQty
      const newPass = syncPass ? value : p.passQtyCurrent
      return {
        ...p,
        receiveQty: value,
        passQtyCurrent: newPass,
        ...(syncRelease ? { releaseQty: newPass } : {}),
      }
    })
  }

  // 합격량이 반입량보다 적으면 자동으로 불합격량 계산
  const handlePassQtyChange = (value: string) => {
    setRowForm(p => {
      const receiveQty = parseFloat(p.receiveQty) || 0
      const passQty = parseFloat(value) || 0

      // 불합격량 계산: 반입량 - 합격량 (합격량이 반입량보다 적을 때만)
      let newFailQty = p.failQty
      if (receiveQty > 0 && passQty < receiveQty) {
        newFailQty = String(receiveQty - passQty)
      } else if (passQty >= receiveQty) {
        // 합격량이 반입량 이상이면 불합격량 없음
        newFailQty = '-'
      }

      // 출고량이 합격량을 따라가던 중이면 같이 갱신 (불합격분 출고 제외)
      const syncRelease = p.releaseQty === '' || p.releaseQty === p.passQtyCurrent || p.releaseQty === p.receiveQty

      return {
        ...p,
        passQtyCurrent: value,
        failQty: newFailQty,
        ...(syncRelease ? { releaseQty: value } : {}),
      }
    })
  }

  const handleAddRow = async () => {
    if (!selectedMaterial) return
    const rows = selectedMaterial.rows

    // 같은 품명/규격의 행만 찾아서 누계 계산
    const matchingRows = rows.filter(row => row.nameOrSpec === rowForm.nameOrSpec)
    const prevTotal = matchingRows.length > 0
      ? matchingRows.reduce((sum, row) => sum + (parseFloat(row.passQtyCurrent) || 0), 0)
      : 0
    const currentPass = parseFloat(rowForm.passQtyCurrent) || 0
    const newTotal = prevTotal + currentPass

    // 같은 품명/규격의 마지막 행에서 잔량 가져오기
    const prevRemain = matchingRows.length > 0 ? parseFloat(matchingRows[matchingRows.length - 1].remainQty) || 0 : 0
    const receiveQty = parseFloat(rowForm.receiveQty) || 0
    const releaseQty = parseFloat(rowForm.releaseQty) || 0
    // 불합격량 (숫자인 경우만)
    const failQtyForCalc = parseFloat(rowForm.failQty) || 0
    // 잔량 = 이전 잔량 + (반입량 - 불합격량) - 출고량
    const newRemain = prevRemain + (receiveQty - failQtyForCalc) - releaseQty

    const passQtyTotal = newTotal > 0 ? newTotal : null
    const remainQty = newRemain !== 0 ? newRemain : null

    // failQty: 숫자면 숫자로 저장, "-" 등 텍스트면 텍스트로
    const failQtyNum = parseFloat(rowForm.failQty)
    const isFailQtyNumeric = !isNaN(failQtyNum) && rowForm.failQty.trim() !== '' && rowForm.failQty.trim() !== '-'

    try {
      const { data, error: insertError } = await supabase
        .from('material_ledger_entries')
        .insert({
          material_id: selectedMaterialId,
          name_or_spec: rowForm.nameOrSpec || null,
          order_qty: parseFloat(rowForm.orderQty) || null,
          dlvr_cndtn: rowForm.dlvrCndtn.trim() || null,
          unit_price: parseFloat(stripComma(rowForm.unitPrice)) || null,
          prdct_amt: parseFloat(stripComma(rowForm.prdctAmt)) || null,
          fee_amt: parseFloat(stripComma(rowForm.feeAmt)) || null,
          receive_date: rowForm.receiveDate || null,
          receive_qty: receiveQty || null,
          pass_qty_current: currentPass || null,
          pass_qty_total: passQtyTotal,
          fail_qty: isFailQtyNumeric ? failQtyNum : null,
          fail_qty_text: !isFailQtyNumeric ? rowForm.failQty : null,
          action: rowForm.action || null,
          release_date: rowForm.releaseDate || null,
          release_qty: releaseQty || null,
          remain_qty: remainQty,
          supervisor_confirm: null,
          created_by: user?.id,
          // 마이그레이션 전에도 사진 없는 등록은 동작하도록 사진이 있을 때만 컬럼 포함
          ...(rowPhotos.length > 0 ? { inspection_photos: rowPhotos } : {}),
        })
        .select()
        .single()
      if (insertError) throw insertError

      const newRow: MaterialRow = {
        id: data.id,
        nameOrSpec: rowForm.nameOrSpec,
        orderQty: rowForm.orderQty,
        dlvrCndtn: rowForm.dlvrCndtn.trim(),
        unitPrice: stripComma(rowForm.unitPrice),
        prdctAmt: stripComma(rowForm.prdctAmt),
        feeAmt: stripComma(rowForm.feeAmt),
        receiveDate: rowForm.receiveDate,
        receiveQty: rowForm.receiveQty,
        passQtyCurrent: rowForm.passQtyCurrent,
        passQtyTotal: passQtyTotal != null ? String(passQtyTotal) : '',
        failQty: rowForm.failQty,
        action: rowForm.action,
        releaseDate: rowForm.releaseDate,
        releaseQty: rowForm.releaseQty,
        remainQty: remainQty != null ? String(remainQty) : '',
        supervisorConfirm: '',
        inspectionPhotos: rowPhotos,
      }

      setMaterials(prev =>
        prev.map(m => m.id === selectedMaterialId ? { ...m, rows: [...m.rows, newRow] } : m)
      )
      setIsRowModalOpen(false)
    } catch (err: any) {
      console.error('내역 등록 실패:', err)
      alert('내역 등록에 실패했습니다.')
    }
  }

  const handleUpdateRow = async () => {
    if (!selectedMaterial || !editingRowId) return
    const rows = selectedMaterial.rows
    const editIdx = rows.findIndex(r => r.id === editingRowId)

    // 같은 품명/규격의 행만 찾아서 누계 계산 (현재 수정중인 행 제외)
    const matchingRows = rows.filter(row => row.nameOrSpec === rowForm.nameOrSpec && row.id !== editingRowId)
    const prevTotal = matchingRows.reduce((sum, row) => sum + (parseFloat(row.passQtyCurrent) || 0), 0)
    const currentPass = parseFloat(rowForm.passQtyCurrent) || 0
    const newTotal = prevTotal + currentPass

    // 같은 품명/규격의 마지막 행에서 잔량 가져오기 (현재 수정중인 행 제외)
    const prevRemain = matchingRows.length > 0 ? parseFloat(matchingRows[matchingRows.length - 1].remainQty) || 0 : 0
    const receiveQty = parseFloat(rowForm.receiveQty) || 0
    const releaseQty = parseFloat(rowForm.releaseQty) || 0
    // 불합격량 (숫자인 경우만)
    const failQtyForCalc = parseFloat(rowForm.failQty) || 0
    // 잔량 = 이전 잔량 + (반입량 - 불합격량) - 출고량
    const newRemain = prevRemain + (receiveQty - failQtyForCalc) - releaseQty

    const passQtyTotal = newTotal > 0 ? newTotal : null
    const remainQty = newRemain !== 0 ? newRemain : null

    const failQtyNum = parseFloat(rowForm.failQty)
    const isFailQtyNumeric = !isNaN(failQtyNum) && rowForm.failQty.trim() !== '' && rowForm.failQty.trim() !== '-'

    try {
      const { error: updateError } = await supabase
        .from('material_ledger_entries')
        .update({
          name_or_spec: rowForm.nameOrSpec || null,
          order_qty: parseFloat(rowForm.orderQty) || null,
          dlvr_cndtn: rowForm.dlvrCndtn.trim() || null,
          unit_price: parseFloat(stripComma(rowForm.unitPrice)) || null,
          prdct_amt: parseFloat(stripComma(rowForm.prdctAmt)) || null,
          fee_amt: parseFloat(stripComma(rowForm.feeAmt)) || null,
          receive_date: rowForm.receiveDate || null,
          receive_qty: receiveQty || null,
          pass_qty_current: currentPass || null,
          pass_qty_total: passQtyTotal,
          fail_qty: isFailQtyNumeric ? failQtyNum : null,
          fail_qty_text: !isFailQtyNumeric ? rowForm.failQty : null,
          action: rowForm.action || null,
          release_date: rowForm.releaseDate || null,
          release_qty: releaseQty || null,
          remain_qty: remainQty,
          // 마이그레이션 전에도 사진을 안 쓰는 수정은 동작하도록 사진 변화가 있을 때만 컬럼 포함
          ...(rowPhotos.length > 0 || (rows[editIdx].inspectionPhotos || []).length > 0
            ? { inspection_photos: rowPhotos.length > 0 ? rowPhotos : null }
            : {}),
        })
        .eq('id', editingRowId)
      if (updateError) throw updateError

      const updatedRow: MaterialRow = {
        id: editingRowId,
        nameOrSpec: rowForm.nameOrSpec,
        orderQty: rowForm.orderQty,
        dlvrCndtn: rowForm.dlvrCndtn.trim(),
        unitPrice: stripComma(rowForm.unitPrice),
        prdctAmt: stripComma(rowForm.prdctAmt),
        feeAmt: stripComma(rowForm.feeAmt),
        receiveDate: rowForm.receiveDate,
        receiveQty: rowForm.receiveQty,
        passQtyCurrent: rowForm.passQtyCurrent,
        passQtyTotal: passQtyTotal != null ? String(passQtyTotal) : '',
        failQty: rowForm.failQty,
        action: rowForm.action,
        releaseDate: rowForm.releaseDate,
        releaseQty: rowForm.releaseQty,
        remainQty: remainQty != null ? String(remainQty) : '',
        supervisorConfirm: rows[editIdx].supervisorConfirm,
        dlvrReqNo: rows[editIdx].dlvrReqNo,
        dlvrReqPrdctSno: rows[editIdx].dlvrReqPrdctSno,
        inspectionPhotos: rowPhotos,
      }

      setMaterials(prev =>
        prev.map(m => m.id === selectedMaterialId
          ? { ...m, rows: m.rows.map(r => r.id === editingRowId ? updatedRow : r) }
          : m
        )
      )
      setIsRowModalOpen(false)
      setEditingRowId(null)
    } catch (err: any) {
      console.error('내역 수정 실패:', err)
      alert('내역 수정에 실패했습니다.')
    }
  }

  const handleDeleteRow = async (rowId: string) => {
    // 삭제 확인
    if (!confirm('정말로 이 내역을 삭제하시겠습니까?')) {
      return
    }

    try {
      const { error: deleteError } = await supabase
        .from('material_ledger_entries')
        .delete()
        .eq('id', rowId)
      if (deleteError) throw deleteError
      // 검수 사진 Storage 파일 정리 (실패해도 행 삭제는 유지 — 프로젝트 삭제 시 폴더째 정리됨)
      const deletedRow = selectedMaterial?.rows.find(r => r.id === rowId)
      const photoPaths = (deletedRow?.inspectionPhotos || [])
        .map(materialInspectionPhotoStoragePath)
        .filter((p): p is string => !!p)
      if (photoPaths.length > 0) {
        void supabase.storage.from(MATERIAL_INSPECTION_PHOTO_BUCKET).remove(photoPaths)
      }
      setMaterials(prev =>
        prev.map(m => m.id === selectedMaterialId ? { ...m, rows: m.rows.filter(r => r.id !== rowId) } : m)
      )
    } catch (err: any) {
      console.error('내역 삭제 실패:', err)
      alert('내역 삭제에 실패했습니다.')
    }
  }

  // ── 감독 서명 ──

  const toggleSignatureMode = () => {
    if (signatureMode) {
      // 서명 모드 종료
      setSignatureMode(false)
      setSelectedRowIds(new Set())
    } else {
      // 서명 모드 진입
      setSignatureMode(true)
      setSelectedRowIds(new Set())
    }
  }

  const toggleRowSelection = (rowId: string) => {
    if (!signatureMode) return
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const handleSignatureSave = async (signatureData: string) => {
    if (selectedRowIds.size === 0) return
    setIsSavingSignature(true)
    try {
      const ids = Array.from(selectedRowIds)
      const { error: updateError } = await supabase
        .from('material_ledger_entries')
        .update({ supervisor_confirm: signatureData })
        .in('id', ids)
      if (updateError) throw updateError

      // 로컬 상태 업데이트
      setMaterials(prev =>
        prev.map(m => m.id === selectedMaterialId
          ? { ...m, rows: m.rows.map(r => ids.includes(r.id) ? { ...r, supervisorConfirm: signatureData } : r) }
          : m
        )
      )
      setIsSignaturePadOpen(false)
      setSignatureMode(false)
      setSelectedRowIds(new Set())
    } catch (err: any) {
      console.error('서명 저장 실패:', err)
      alert('서명 저장에 실패했습니다.')
    } finally {
      setIsSavingSignature(false)
    }
  }

  // ── 드래그 삭제 핸들러 (아이템 슬롯 뷰) ──

  const handleDragStart = useCallback((materialId: string, clientX: number, clientY: number) => {
    wasDragging.current = true
    setDraggingMaterialId(materialId)
    setDragPosition({ x: clientX, y: clientY })
    dragStartPos.current = { x: clientX, y: clientY }
  }, [])

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!draggingMaterialId) return
    setDragPosition({ x: clientX, y: clientY })

    // 쓰레기통 영역 위에 있는지 확인
    if (trashZoneRef.current) {
      const rect = trashZoneRef.current.getBoundingClientRect()
      const isOver = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      setIsOverTrash(isOver)

      if (isOver) {
        setDropTargetIndex(null)
        return
      }
    }

    // 자재 박스 위에 있는지 확인 (자리이동 대상)
    let foundTarget = false
    materialRefs.current.forEach((el, matId) => {
      if (matId === draggingMaterialId) return
      const rect = el.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        const targetIdx = materials.findIndex(m => m.id === matId)
        if (targetIdx !== -1) {
          setDropTargetIndex(targetIdx)
          foundTarget = true
        }
      }
    })
    if (!foundTarget) {
      setDropTargetIndex(null)
    }
  }, [draggingMaterialId, materials])

  const handleReorder = useCallback(async (fromIndex: number, toIndex: number) => {
    // 로컬 상태 즉시 업데이트 (optimistic)
    const newMaterials = [...materials]
    const [moved] = newMaterials.splice(fromIndex, 1)
    newMaterials.splice(toIndex, 0, moved)

    // 로컬의 realOrder, sortOrder 도 업데이트해준다.
    const updatedMaterials = newMaterials.map((m, i) => {
      const realOrder = i + 1
      const colorIndex = (m as any).colorIndex ?? 0
      const sortOrder = (colorIndex + 1) * 1000 + realOrder
      return {
        ...m,
        realOrder,
        sortOrder,
      } as Material
    })
    setMaterials(updatedMaterials)

    // DB 순서 업데이트
    try {
      for (const m of updatedMaterials) {
        await supabase
          .from('materials')
          .update({ sort_order: m.sortOrder })
          .eq('id', m.id)
      }
    } catch (err) {
      console.error('순서 저장 실패:', err)
      // 실패 시 원래 순서로 복원
      loadData()
    }
  }, [materials])

  const handleDragEnd = useCallback(() => {
    if (draggingMaterialId) {
      if (isOverTrash) {
        // 쓰레기통에 드롭 - 삭제 실행
        handleDeleteMaterial(draggingMaterialId)
      } else if (dropTargetIndex !== null) {
        // 다른 위치에 드롭 - 자리 이동
        const fromIndex = materials.findIndex(m => m.id === draggingMaterialId)
        if (fromIndex !== -1 && fromIndex !== dropTargetIndex) {
          handleReorder(fromIndex, dropTargetIndex)
        }
      }
    }
    // 상태 초기화
    setDraggingMaterialId(null)
    setDragPosition(null)
    setIsOverTrash(false)
    setDropTargetIndex(null)
    dragStartPos.current = null
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // 클릭 방지를 위해 잠시 후 wasDragging 초기화
    setTimeout(() => {
      wasDragging.current = false
    }, 100)
  }, [draggingMaterialId, isOverTrash, dropTargetIndex, materials, handleReorder])

  const handleLongPressStart = useCallback((materialId: string, clientX: number, clientY: number) => {
    longPressTimer.current = setTimeout(() => {
      handleDragStart(materialId, clientX, clientY)
    }, 500) // 500ms 길게 누르기
  }, [handleDragStart])

  const handleLongPressCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // 드래그 중 마우스/터치 이벤트
  useEffect(() => {
    if (!draggingMaterialId) return

    // 드래그 중 body 스크롤 완전 잠금
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => {
      // 드래그 중 스크롤 방지
      e.preventDefault()
      if (e.touches.length > 0) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    const handleMouseUp = () => handleDragEnd()
    const handleTouchEnd = () => handleDragEnd()

    window.addEventListener('mousemove', handleMouseMove)
    // passive: false 옵션으로 preventDefault() 호출 가능하게 설정
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      // body 스크롤 잠금 해제 및 원래 위치 복원
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)

      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [draggingMaterialId, handleDragMove, handleDragEnd])

  // ── 렌더 가드 ──

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button onClick={navigateBack} className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">주요자재 수불부</h1>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-sm text-red-700">{error}</div>
            <button onClick={loadData} className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium">다시 시도</button>
          </div>
        </main>
      </div>
    )
  }

  // 조달청 연계/동기화 모달 — 자재 상세 뷰가 별도 return 분기라 공용 JSX로 정의해 상세 뷰에서 렌더링
  const linkModalJsx = isLinkModalOpen && selectedMaterial ? (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => { if (!linkApplying) setIsLinkModalOpen(false) }}>
      <div
        className="max-w-md w-full rounded-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
          border: '3px solid #4a3a28',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)'
        }}
      >
        <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900 flex-shrink-0" style={{
          boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
        }} />

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{
          background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
          borderBottom: '2px solid #5a4a35'
        }}>
          <h3 className="text-base font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
            ⚔ 조달청 납품요구 연계
          </h3>
          <button
            onClick={() => { if (!linkApplying) setIsLinkModalOpen(false) }}
            className="p-1 text-amber-200/50 hover:text-amber-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
              납품요구번호
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={linkNo}
                onChange={e => setLinkNo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLinkLookup() }}
                placeholder="예: R25TB00824197"
                className="flex-1 min-w-0 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                style={{
                  background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                  border: '2px solid #4a4a55',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                }}
              />
              <button
                type="button"
                onClick={() => handleLinkLookup()}
                disabled={linkLoading || !linkNo.trim()}
                className="px-4 py-2 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                style={{
                  background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                  border: '2px solid #6a5a40',
                  borderRadius: '6px',
                  color: '#f5d78e',
                  fontFamily: 'serif'
                }}
              >
                {linkLoading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />조회중</span> : '조회'}
              </button>
            </div>
            <p className="text-[11px] text-amber-200/40 mt-2">
              조달청 품목과 이 자재의 규격을 연결하고, 발주량이 다르면 증감 행으로 보정합니다. 기존 수불 기록은 변경되지 않습니다.
            </p>
            {linkError && (
              <p className="text-xs text-red-400 mt-2">{linkError}</p>
            )}
          </div>

          {linkResult && (
            <div className="rounded p-3" style={{
              background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
              border: '2px solid #4a4a55',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
            }}>
              <p className="text-sm text-amber-100 font-medium break-all">{linkResult.title}</p>
              <p className="text-[11px] text-amber-200/50 mt-0.5">
                {linkResult.demandOrg} → {linkResult.supplier}
              </p>

              <div className="mt-3 space-y-3">
                {linkResult.items.map(item => (
                  <div key={item.sno} className="rounded p-2.5" style={{ border: '1px solid #3a3a45', background: 'rgba(0,0,0,0.25)' }}>
                    <p className="text-xs text-amber-100 break-all">{item.spec || item.name}</p>
                    <p className="text-[11px] text-amber-200/50 mt-0.5">
                      조달청 발주량 {formatNumber(String(item.qty))} {item.unit}
                      {item.deadline ? ` · 납품기한 ${item.deadline}` : ''}
                    </p>
                    <select
                      value={linkMapping[item.sno] ?? ''}
                      onChange={e => setLinkMapping(prev => ({ ...prev, [item.sno]: e.target.value }))}
                      className="w-full mt-2 px-2 py-2 rounded text-xs text-amber-100"
                      style={{
                        backgroundColor: '#1f1f28',
                        border: '1px solid #6a5a40',
                        colorScheme: 'dark'
                      }}
                    >
                      <option value="" style={{ backgroundColor: '#1a1a22', color: '#e8dcc0' }}>연결 안 함</option>
                      {[selectedMaterial, ...materials.filter(m => m.id !== selectedMaterial.id)]
                        .filter(m => getSpecList(m).length > 0)
                        .map(m => (
                          <optgroup key={m.id} label={m.id === selectedMaterial.id ? `${m.name} (현재 자재)` : m.name} style={{ backgroundColor: '#1a1a22', color: '#a8a8b0' }}>
                            {getSpecList(m).map(spec => (
                              <option key={spec} value={m.id + MAP_SEP + spec} style={{ backgroundColor: '#1a1a22', color: '#e8dcc0' }}>{spec.replace(/\n/g, ' ')}</option>
                            ))}
                          </optgroup>
                        ))}
                      <option value={selectedMaterial.id + MAP_SEP + NEW_SPEC} style={{ backgroundColor: '#1a1a22', color: '#7ec8ff' }}>+ 새 규격 행으로 추가 (현재 자재)</option>
                    </select>
                    {(() => {
                      const target = parseLinkTarget(linkMapping[item.sno] || '')
                      if (!target) return <p className="text-[11px] text-amber-200/40 mt-1.5">이 품목은 원장에 반영하지 않습니다.</p>
                      if (target.spec === NEW_SPEC) return <p className="text-[11px] text-sky-300/80 mt-1.5">발주량 {formatNumber(String(item.qty))} {item.unit}의 새 규격 행이 추가됩니다.</p>
                      const info = getLinkDiff(item)
                      if (!info) return null
                      if (info.diff === 0) return <p className="text-[11px] text-green-400/90 mt-1.5">✓ 발주량 일치 ({formatNumber(String(info.ledgerQty))}){info.isOtherMat ? ` — "${info.matName}" 자재` : ''}</p>
                      return (
                        <div className="mt-1.5">
                          <p className="text-[11px] text-amber-300">
                            발주량 차이 — {info.isOtherMat ? `"${info.matName}" ` : ''}원장 {formatNumber(String(info.ledgerQty))} → 조달청 {formatNumber(String(item.qty))} ({info.diff > 0 ? '+' : ''}{formatNumber(String(info.diff))})
                          </p>
                          {info.overDelivered ? (
                            <p className="text-[11px] text-red-400 mt-1">합격 누계가 조달청 수량을 초과한 상태라 자동 보정하지 않습니다. 현장 확인이 필요합니다.</p>
                          ) : (
                            <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={linkAdjust[item.sno] ?? true}
                                onChange={e => setLinkAdjust(prev => ({ ...prev, [item.sno]: e.target.checked }))}
                                className="accent-amber-600"
                              />
                              <span className="text-[11px] text-amber-100">
                                증감 행({info.diff > 0 ? '+' : ''}{formatNumber(String(info.diff))})을 추가해 조달청 기준으로 보정
                              </span>
                            </label>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{
          background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)',
          borderTop: '2px solid #5a4a35'
        }}>
          <button
            onClick={() => setIsLinkModalOpen(false)}
            disabled={linkApplying}
            className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
              border: '2px solid #4a4a55',
              borderRadius: '6px',
              color: '#a8a8b0',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
            }}
          >
            취소
          </button>
          <button
            onClick={handleApplyLink}
            disabled={!linkResult || linkApplying}
            className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: linkResult
                ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
              border: '2px solid #6a5a40',
              borderRadius: '6px',
              color: '#f5d78e',
              boxShadow: linkResult ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
              fontFamily: 'serif'
            }}
          >
            {linkApplying ? <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />적용중</span> : '⚔ 연계 적용'}
          </button>
        </div>

        <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900 flex-shrink-0" style={{
          boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
        }} />
      </div>
    </div>
  ) : null

  // 실제 수요기관 납품요구 상세 모달 — 조회만 수행하며 원장 데이터는 변경하지 않는다
  const dlvrDetailModalJsx = dlvrDetailOpen && selectedMaterial ? (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={closeDlvrDetail}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlvr-detail-title"
        className="max-w-5xl w-full rounded-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
          border: '3px solid #4a3a28',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 gap-3 shrink-0" style={{
          background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
          borderBottom: '2px solid #5a4a35',
        }}>
          <div className="min-w-0">
            <h3 id="dlvr-detail-title" className="text-base font-bold text-amber-100 truncate" style={{ fontFamily: 'serif' }}>
              조달청 납품요구 상세
            </h3>
            <p className="text-xs text-amber-200/50 truncate">{dlvrDetailNo}</p>
          </div>
          <button type="button" onClick={closeDlvrDetail} className="p-1 text-amber-200/50 hover:text-amber-200 shrink-0" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {dlvrDetailLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-amber-200/60">
              <div className="w-full max-w-xs" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dlvrDetailProgress}>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/40 border border-blue-500/30">
                  <div className="h-full rounded-full bg-blue-400 transition-[width] duration-300" style={{ width: `${dlvrDetailProgress}%` }} />
                </div>
                <p className="mt-2 text-center text-sm font-medium tabular-nums text-blue-300">{dlvrDetailProgress}%</p>
              </div>
              조달청에서 실제 납품요구 내역을 불러오는 중입니다.
            </div>
          ) : dlvrDetailError ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-red-400 mb-4">{dlvrDetailError}</p>
              <button
                type="button"
                onClick={() => void openDlvrDetail(dlvrDetailNo)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded text-blue-100 bg-blue-900/60 border border-blue-500/50 hover:bg-blue-800/70"
              >
                <RefreshCw className="h-4 w-4" />
                다시 조회
              </button>
            </div>
          ) : dlvrDetail ? (
            <div className="flex flex-col gap-4">
              <div className="order-1 rounded border border-amber-900/60 overflow-hidden text-sm">
                <dl className="grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)_8rem_minmax(0,1fr)]">
                  <dt className="bg-black/25 px-3 py-2 font-medium text-amber-200/60 border-b border-amber-900/40">건명</dt>
                  <dd className="px-3 py-2 text-amber-100 border-b border-amber-900/40 sm:col-span-3 break-words">{dlvrDetail.title || '-'}</dd>
                  <dt className="bg-black/25 px-3 py-2 font-medium text-amber-200/60 border-b border-amber-900/40">납품요구번호</dt>
                  <dd className="px-3 py-2 text-amber-100 border-b border-amber-900/40 break-all">{dlvrDetail.dlvrReqNo || dlvrDetailNo}</dd>
                  <dt className="bg-black/25 px-3 py-2 font-medium text-amber-200/60 border-b border-amber-900/40">수요기관</dt>
                  <dd className="px-3 py-2 text-amber-100 border-b border-amber-900/40 break-words">{dlvrDetail.demandOrg || '-'}</dd>
                  <dt className="bg-black/25 px-3 py-2 font-medium text-amber-200/60">계약상대자</dt>
                  <dd className="px-3 py-2 text-amber-100 break-words">{dlvrDetail.supplier || '-'}</dd>
                  <dt className="bg-black/25 px-3 py-2 font-medium text-amber-200/60">업체 연락처</dt>
                  <dd className="px-3 py-2 text-amber-100 break-words">
                    {(dlvrDetail.supplierTel || selectedMaterial.dlvrSupplierTel) ? (
                      <a
                        href={`tel:${(dlvrDetail.supplierTel || selectedMaterial.dlvrSupplierTel || '').replace(/[^\d+]/g, '')}`}
                        className="text-blue-300 hover:text-blue-200 hover:underline"
                      >
                        {dlvrDetail.supplierTel || selectedMaterial.dlvrSupplierTel}
                      </a>
                    ) : '-'}
                  </dd>
                </dl>
              </div>

              <div className="order-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-amber-100">품목 내역</h4>
                  <span className="text-xs text-amber-200/50">{dlvrDetail.items.length}건</span>
                </div>
                {dlvrDetail.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-amber-200/40 border border-amber-900/50 rounded">조회된 품목이 없습니다.</p>
                ) : (
                  <div className="border border-amber-900/50 rounded overflow-x-auto">
                    <table className="w-full min-w-[840px] text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-black/30 text-xs text-amber-200/50 border-b border-amber-900/50">
                          <th className="px-3 py-2 text-center font-medium">순번</th>
                          <th className="px-3 py-2 text-left font-medium">품목</th>
                          <th className="px-3 py-2 text-left font-medium">규격</th>
                          <th className="px-3 py-2 text-right font-medium">수량</th>
                          <th className="px-3 py-2 text-right font-medium">단가(원)</th>
                          <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                          <th className="px-3 py-2 text-center font-medium">납품기한</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dlvrDetail.items.map((item, idx) => (
                          <tr key={`${item.sno}-${idx}`} className="border-b border-amber-900/30 last:border-b-0 hover:bg-white/5">
                            <td className="px-3 py-2 text-center text-amber-200/50">{item.sno || idx + 1}</td>
                            <td className="px-3 py-2 text-amber-100 max-w-[220px] truncate" title={item.name}>{item.name || '-'}</td>
                            <td className="px-3 py-2 text-amber-200/70 max-w-[320px] truncate" title={item.spec}>{item.spec || '-'}</td>
                            <td className="px-3 py-2 text-right text-amber-100 tabular-nums">{formatNumber(String(item.qty))}{item.unit ? ` ${item.unit}` : ''}</td>
                            <td className="px-3 py-2 text-right text-amber-100 tabular-nums">{formatNumber(String(item.unitPrice))}</td>
                            <td className="px-3 py-2 text-right text-amber-100 tabular-nums font-medium">{formatNumber(String(item.amt ?? item.unitPrice * item.qty))}</td>
                            <td className="px-3 py-2 text-center text-amber-100">{item.deadline || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {dlvrInspsLoading && (
                <p className="order-2 py-4 text-center text-sm text-blue-300 border border-blue-500/30 rounded bg-blue-950/20">
                  나라장터 지급·검사검수 내역을 확인하는 중입니다.
                </p>
              )}

              {dlvrInspsError && (
                <p className="order-2 py-4 px-3 text-center text-sm text-red-400 border border-red-500/30 rounded bg-red-950/20">
                  {dlvrInspsError}
                </p>
              )}

              {dlvrPays.length > 0 && (() => {
                const paidTotal = dlvrPays.reduce((sum, pay) => sum + pay.amt, 0)
                const productTotal = dlvrDetail.items.reduce((sum, item) => sum + (item.amt || 0), 0)
                const estimatedFee = calcG2bFee(productTotal)
                return (
                  <div className="order-2">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-amber-100">지급완료 내역</h4>
                      <span className="text-xs text-amber-200/50">{dlvrPays.length}건</span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2 text-xs">
                      {[
                        ['지급액 합계', paidTotal],
                        ['물품금액', productTotal],
                        ['조달수수료', estimatedFee],
                        ['수수료 포함 합계', productTotal + estimatedFee],
                      ].map(([label, amount]) => (
                        <div key={String(label)} className="rounded border border-amber-900/50 bg-black/25 px-3 py-2">
                          <p className="text-amber-200/50">{label}</p>
                          <p className="mt-0.5 text-right font-semibold text-amber-100 tabular-nums">{formatNumber(String(amount))}원</p>
                        </div>
                      ))}
                    </div>
                    <p className="mb-2 text-[11px] text-amber-200/50">조달수수료는 고시 요율에 따른 추정치입니다. 실제 납부금액은 조달청 수수료 고지 금액을 확인해야 합니다.</p>
                    <div className="border border-amber-900/50 rounded overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm whitespace-nowrap">
                        <thead>
                          <tr className="bg-black/30 text-xs text-amber-200/50 border-b border-amber-900/50">
                            <th className="px-3 py-2 text-left font-medium">문서번호</th>
                            <th className="px-3 py-2 text-left font-medium">명칭</th>
                            <th className="px-3 py-2 text-center font-medium">지급일</th>
                            <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                            <th className="px-3 py-2 text-left font-medium">수요기관</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dlvrPays.map((pay) => (
                            <tr key={pay.docNo} className="border-b border-amber-900/30 last:border-b-0 hover:bg-white/5">
                              <td className="px-3 py-2 text-amber-200/70 font-mono text-xs">{pay.docNo}</td>
                              <td className="px-3 py-2 text-amber-100 max-w-[260px] truncate" title={pay.name}>{pay.name || '-'}</td>
                              <td className="px-3 py-2 text-center text-amber-100">{pay.payDate || '-'}</td>
                              <td className="px-3 py-2 text-right text-amber-100 tabular-nums font-medium">{formatNumber(String(pay.amt))}</td>
                              <td className="px-3 py-2 text-amber-200/70 max-w-[260px] truncate" title={pay.dminsttNm}>{pay.dminsttNm || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {dlvrInsps.length > 0 && (
                <div className="order-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-amber-100">검사검수 완료 내역</h4>
                    <span className="text-xs text-amber-200/50">{dlvrInsps.length}건</span>
                  </div>
                  <div className="border border-amber-900/50 rounded overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm whitespace-nowrap">
                        <thead>
                          <tr className="bg-black/30 text-xs text-amber-200/50 border-b border-amber-900/50">
                            <th className="px-3 py-2 text-left font-medium">문서번호</th>
                            <th className="px-3 py-2 text-left font-medium">명칭</th>
                            <th className="px-3 py-2 text-center font-medium">검사일</th>
                            <th className="px-3 py-2 text-right font-medium">금액(원)</th>
                            <th className="px-3 py-2 text-left font-medium">수요기관</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dlvrInsps.map((insp) => (
                            <tr key={insp.docNo} className="border-b border-amber-900/30 last:border-b-0 hover:bg-white/5">
                              <td className="px-3 py-2 text-amber-200/70 font-mono text-xs">{insp.docNo}</td>
                              <td className="px-3 py-2 text-amber-100 max-w-[260px] truncate" title={insp.name}>{insp.name || '-'}</td>
                              <td className="px-3 py-2 text-center text-amber-100">{insp.inspDate || '-'}</td>
                              <td className="px-3 py-2 text-right text-amber-100 tabular-nums font-medium">{formatNumber(String(insp.amt))}</td>
                              <td className="px-3 py-2 text-amber-200/70 max-w-[260px] truncate" title={insp.dminsttNm}>{insp.dminsttNm || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-5 py-3 flex justify-end shrink-0" style={{ borderTop: '2px solid #5a4a35' }}>
          <button
            type="button"
            onClick={closeDlvrDetail}
            className="px-4 py-2 text-sm rounded text-amber-100 bg-black/20 border border-amber-800/60 hover:bg-white/5"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ── 자재별 테이블 뷰 ──

  if (selectedMaterial) {
    return (
      <div className="min-h-screen" style={{
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d15 50%, #000000 100%)',
        isolation: 'isolate'
      }}>
        {/* 창고 배경 사진 — 흐림 + 어두운 그라데이션 오버레이로 다크 테마와 조화 (스크롤 시 고정) */}
        <div
          className="fixed inset-0"
          style={{
            zIndex: -1,
            backgroundImage: "linear-gradient(180deg, rgba(20,18,30,0.72) 0%, rgba(10,10,16,0.8) 55%, rgba(0,0,0,0.92) 100%), url('/창고 배경 사진.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(3px)',
            transform: 'scale(1.03)'
          }}
        />
        {/* 헤더 - 디아블로 스타일 */}
        <header className="relative" style={{
          background: 'linear-gradient(180deg, #2a2a3a 0%, #1a1a25 100%)',
          borderBottom: '3px solid #4a3a2a',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,215,0,0.1)'
        }}>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button onClick={handleBack} className="mr-4 p-2 text-amber-200/70 hover:text-amber-200 rounded-md transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Package className="h-6 w-6 text-amber-400 mr-3" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-amber-100 truncate" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  {project?.project_name}
                </h1>
                <p className="text-xs text-amber-200/50">주요자재 수불부 및 검사부</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto py-6 px-4 sm:px-6 lg:px-4">
          {/* 테이블 컨테이너 - 디아블로 스타일 */}
          <div className="rounded-lg overflow-hidden" style={{
            background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
            border: '3px solid #4a3a28',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9)'
          }}>
            {/* 상단 금속 테두리 */}
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />

            {/* 상단 바 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-6 py-3" style={{
              background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
              borderBottom: '2px solid #5a4a35'
            }}>
              <div className="min-w-0">
                <span className="text-sm font-medium text-amber-100" style={{ fontFamily: 'serif' }}>
                  {'⚔ '}
                  {selectedMaterial.dlvrReqNo ? (
                    <button
                      onClick={() => void openDlvrDetail()}
                      className="inline-flex items-center gap-1 align-baseline hover:underline"
                      style={{ color: '#7ec8ff' }}
                      title={`실제 납품요구 상세 보기 (${selectedMaterial.dlvrReqNo})`}
                    >
                      {selectedMaterial.name}
                      {selectedMaterial.unit && <span className="font-normal opacity-70">({selectedMaterial.unit})</span>}
                      {dlvrDetailLoading && dlvrDetailNo === selectedMaterial.dlvrReqNo
                        ? (
                          <span className="inline-flex items-center gap-1 shrink-0" aria-label={`조회 진행률 ${dlvrDetailProgress}%`}>
                            <span className="w-10 h-1.5 overflow-hidden rounded-full bg-black/40 border border-blue-500/30">
                              <span className="block h-full bg-blue-300 transition-[width] duration-300" style={{ width: `${dlvrDetailProgress}%` }} />
                            </span>
                            <span className="text-[10px] tabular-nums text-blue-300">{dlvrDetailProgress}%</span>
                          </span>
                        )
                        : <Package className="h-3 w-3 shrink-0" />}
                    </button>
                  ) : (
                    <>{selectedMaterial.name}{selectedMaterial.unit && <span className="text-amber-200/60 font-normal ml-1">({selectedMaterial.unit})</span>}</>
                  )}
                  <span className="text-amber-200/40 font-normal ml-2">{selectedMaterial.rows.length}건</span>
                </span>
                {(selectedMaterial.dlvrSupplier || selectedMaterial.dlvrSupplierTel || selectedMaterial.dlvrDeadline) && (
                  <p className="text-[11px] text-amber-200/50 mt-0.5 truncate">
                    {[
                      selectedMaterial.dlvrSupplier,
                      selectedMaterial.dlvrSupplierTel && `☎ ${selectedMaterial.dlvrSupplierTel}`,
                      selectedMaterial.dlvrDeadline && `납품기한 ${selectedMaterial.dlvrDeadline}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                {signatureMode ? (
                  <>
                    <span className="text-xs text-amber-300 font-medium">{selectedRowIds.size}건 선택</span>
                    <button
                      onClick={() => setIsSignaturePadOpen(true)}
                      disabled={selectedRowIds.size === 0}
                      className="px-3 py-2 text-sm rounded transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                      style={{
                        background: 'linear-gradient(180deg, #1a5a1a 0%, #0a3a0a 100%)',
                        border: '2px solid #2a7a2a',
                        color: '#90ee90',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}
                    >
                      <PenTool className="h-4 w-4" />
                      서명 하기
                    </button>
                    <button
                      onClick={toggleSignatureMode}
                      className="px-3 py-2 text-sm rounded transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: '2px solid #4a4a55',
                        color: '#a8a8b0'
                      }}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={openLinkModal}
                      className="p-2 rounded transition-all hover:scale-105"
                      style={{
                        background: selectedMaterial.dlvrReqNo
                          ? 'linear-gradient(180deg, #1a3a5a 0%, #0a2038 100%)'
                          : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: selectedMaterial.dlvrReqNo ? '2px solid #2a5a8a' : '2px solid #4a4a55',
                        color: selectedMaterial.dlvrReqNo ? '#7ec8ff' : '#a8a8b0'
                      }}
                      title={selectedMaterial.dlvrReqNo ? `조달청 동기화 (${selectedMaterial.dlvrReqNo})` : '조달청 납품요구 연계'}
                    >
                      <Link2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={openMaterialEditModal}
                      className="p-2 rounded transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: '2px solid #4a4a55',
                        color: '#a8a8b0'
                      }}
                      title="자재명/규격 수정"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleDownloadLedgerExcel}
                      disabled={ledgerExporting}
                      className="p-2 rounded transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: '2px solid #4a4a55',
                        color: '#a8a8b0'
                      }}
                      title="엑셀 다운로드 (검수조서·사진대지·수불부·출고요청서)"
                    >
                      {ledgerExporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={toggleSignatureMode}
                      className="p-2 rounded transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                        border: '2px solid #6a5a40',
                        color: '#f5d78e'
                      }}
                      title="감독 서명"
                    >
                      <PenTool className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => { openRowModal() }}
                      className="p-2 rounded transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)',
                        border: '2px solid #aa2020',
                        color: '#fca5a5'
                      }}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 서명 모드 안내 */}
            {signatureMode && (
              <div className="px-6 py-2" style={{
                background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
                borderBottom: '1px solid #5a4a35'
              }}>
                <p className="text-xs text-amber-200/70">⚔ 서명할 행을 클릭하여 선택한 후 "서명 하기" 버튼을 눌러주세요.</p>
              </div>
            )}

            {/* 테이블 */}
            {selectedMaterial.rows.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="h-12 w-12 text-amber-200/30 mx-auto mb-4" />
                <p className="text-amber-200/50 mb-4" style={{ fontFamily: 'serif' }}>등록된 내역이 없습니다.</p>
                <button
                  onClick={() => { openRowModal() }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                    border: '2px solid #6a5a40',
                    color: '#f5d78e',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
                    fontFamily: 'serif'
                  }}
                >
                  <Plus className="h-5 w-5" />
                  내역 등록하기
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'linear-gradient(180deg, #3a3040 0%, #2a2030 100%)' }}>
                    <tr>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>No</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>품명 및<br />규격</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>발주량<br />(설계량)</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>인도조건</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>단가<br />(원)</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>품대<br />(원)</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>수수료<br />(원)</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>합계<br />(원)</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>반입일</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>반입량</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>반입잔량</th>
                      <th colSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>합격량</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>불합격량</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>조치사항</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>출고일</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>출고량</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>잔량<br />(보관)</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>감독원<br />확인</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>삭제</th>
                    </tr>
                    <tr>
                      <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>금회</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>누계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMaterial.rows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer transition-colors"
                        style={{
                          background: selectedRowIds.has(row.id)
                            ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                            : idx % 2 === 0 ? '#1a1a22' : '#22222a'
                        }}
                        onClick={() => {
                          if (signatureMode) {
                            toggleRowSelection(row.id)
                          } else {
                            openEditRowModal(row)
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedRowIds.has(row.id)) {
                            e.currentTarget.style.background = 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 100%)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selectedRowIds.has(row.id)) {
                            e.currentTarget.style.background = idx % 2 === 0 ? '#1a1a22' : '#22222a'
                          }
                        }}
                      >
                        <td className="px-2 py-2 text-center text-xs text-amber-100/70" style={{ border: '1px solid #3a3a45' }}>
                          {signatureMode ? (
                            <div className={`w-5 h-5 mx-auto rounded flex items-center justify-center ${selectedRowIds.has(row.id) ? 'bg-amber-500' : ''}`} style={{
                              border: selectedRowIds.has(row.id) ? '2px solid #d97706' : '2px solid #4a4a55',
                              background: selectedRowIds.has(row.id) ? 'linear-gradient(180deg, #d97706 0%, #b45309 100%)' : 'transparent'
                            }}>
                              {selectedRowIds.has(row.id) && <Check className="h-3 w-3 text-white" />}
                            </div>
                          ) : (
                            idx + 1
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-pre-line" style={{ border: '1px solid #3a3a45' }}>{stripDupItemName(row.nameOrSpec || '', selectedMaterial.name) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.orderQty) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{row.dlvrCndtn || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.unitPrice || '') || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.prdctAmt || '') || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.feeAmt || '') || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>
                          {(() => {
                            const total = (parseFloat(row.prdctAmt || '') || 0) + (parseFloat(row.feeAmt || '') || 0)
                            return total ? formatNumber(String(total)) : '-'
                          })()}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatDate(row.receiveDate) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.receiveQty) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>
                          {(() => {
                            const remain = calcRunningReceiveRemain(selectedMaterial.rows, idx)
                            return remain !== '' ? formatNumber(remain) : '-'
                          })()}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.passQtyCurrent) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.passQtyTotal) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{row.failQty || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{row.action || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatDate(row.releaseDate) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.releaseQty) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>
                          {(() => {
                            const auto = calcRunningRemain(selectedMaterial.rows, idx)
                            return auto !== '' ? formatNumber(auto) : '-'
                          })()}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>
                          {row.supervisorConfirm && row.supervisorConfirm.startsWith('data:image') ? (
                            <img src={row.supervisorConfirm} alt="서명" className="h-6 mx-auto" style={{ filter: 'invert(1)' }} />
                          ) : (
                            row.supervisorConfirm || '-'
                          )}
                        </td>
                        <td className="px-2 py-2 text-center" style={{ border: '1px solid #3a3a45' }}>
                          {!signatureMode && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteRow(row.id) }} className="p-1 text-amber-200/40 hover:text-red-400 transition-colors" title="행 삭제">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 하단 안내 */}
            <div className="px-6 py-4" style={{
              background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
              borderTop: '2px solid #5a4a35'
            }}>
              <p className="text-xs text-amber-200/70" style={{ fontFamily: 'serif' }}>
                ⚔ 현장 반입 후 작업장 반출시 까지는 감독원이 관리하고 매 출고시 반출량 및 잔량을 확인
              </p>
              <p className="text-xs text-amber-200/70 mt-1" style={{ fontFamily: 'serif' }}>
                ⚔ 조달 수수료는 자동 계산 값과 다를수 있으므로 꼭 조달청 수수료 확인 필요
              </p>
            </div>

            {/* 하단 금속 테두리 */}
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />
          </div>
        </main>

        {/* 감독 서명 모달 */}
        {isSignaturePadOpen && (
          <SignaturePad
            onSave={handleSignatureSave}
            onCancel={() => setIsSignaturePadOpen(false)}
            selectedCount={selectedRowIds.size}
            isSaving={isSavingSignature}
          />
        )}

        {/* 내역 등록/수정 모달 - 디아블로 스타일 */}
        {isRowModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => { setIsRowModalOpen(false); setEditingRowId(null) }}>
            <div
              className="max-w-md w-full rounded-lg overflow-hidden max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
                border: '3px solid #4a3a28',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)'
              }}
            >
              {/* 상단 금속 테두리 */}
              <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900 flex-shrink-0" style={{
                boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
              }} />

              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{
                background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
                borderBottom: '2px solid #5a4a35'
              }}>
                <h3 className="text-base font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  ⚔ {editingRowId ? '내역 수정' : '내역 등록'}
                </h3>
                <button
                  onClick={() => { setIsRowModalOpen(false); setEditingRowId(null) }}
                  className="p-1 text-amber-200/50 hover:text-amber-200 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 본문 - 스크롤 가능 */}
              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                {/* 품명 또는 규격 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>품명 또는 규격</label>
                  {(() => {
                    const specList = getSpecList(selectedMaterial!)
                    const isDirect = specList.length === 0 || !specList.includes(rowForm.nameOrSpec)
                    return (
                      <>
                        {specList.length > 0 && (
                          <select
                            value={isDirect ? '__direct__' : rowForm.nameOrSpec}
                            onChange={e => handleNameOrSpecChange(e.target.value === '__direct__' ? '' : e.target.value)}
                            className="w-full px-2 py-2 rounded text-xs text-amber-100"
                            style={{
                              backgroundColor: '#1f1f28',
                              border: '1px solid #6a5a40',
                              colorScheme: 'dark'
                            }}
                          >
                            {specList.map(spec => (
                              <option key={spec} value={spec} style={{ backgroundColor: '#1a1a22', color: '#e8dcc0' }}>{spec.replace(/\n/g, ' ')}</option>
                            ))}
                            <option value="__direct__" style={{ backgroundColor: '#1a1a22', color: '#7ec8ff' }}>+ 직접 입력…</option>
                          </select>
                        )}
                        {isDirect && (
                          <textarea
                            rows={2}
                            value={rowForm.nameOrSpec}
                            onChange={e => handleNameOrSpecChange(e.target.value)}
                            placeholder="품명 또는 규격 입력"
                            className={`w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm ${specList.length > 0 ? 'mt-2' : ''}`}
                            style={{
                              background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                              border: '2px solid #4a4a55',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                            }}
                          />
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* 발주량 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>발주량(설계량)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatNumber(rowForm.orderQty)}
                      onChange={e => setRowForm(p => ({ ...p, orderQty: stripComma(e.target.value) }))}
                      placeholder="수량 입력"
                      className="flex-1 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                    {selectedMaterial?.unit && <span className="text-sm text-amber-200/60 whitespace-nowrap">{selectedMaterial.unit}</span>}
                  </div>
                </div>

                {/* 인도조건 · 단가 · 품대 · 수수료 — 단가·품대·인도조건은 조달청 등록 시 자동, 수수료는 API 미제공으로 수동 입력 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>인도조건</label>
                    <input
                      type="text"
                      value={rowForm.dlvrCndtn}
                      onChange={e => setRowForm(p => ({ ...p, dlvrCndtn: e.target.value }))}
                      placeholder="예: 도착도"
                      className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>단가(원)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(rowForm.unitPrice)}
                      onChange={e => setRowForm(p => ({ ...p, unitPrice: stripComma(e.target.value) }))}
                      placeholder="품목 단가"
                      className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>품대(원)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(rowForm.prdctAmt)}
                      onChange={e => setRowForm(p => ({ ...p, prdctAmt: stripComma(e.target.value) }))}
                      placeholder="물품대금"
                      className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>수수료(원)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(rowForm.feeAmt)}
                      onChange={e => setRowForm(p => ({ ...p, feeAmt: stripComma(e.target.value) }))}
                      placeholder="조달수수료"
                      className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                </div>
                {((parseFloat(stripComma(rowForm.prdctAmt)) || 0) + (parseFloat(stripComma(rowForm.feeAmt)) || 0)) > 0 && (
                  <p className="text-[11px] text-amber-200/50">
                    합계 {formatNumber(String((parseFloat(stripComma(rowForm.prdctAmt)) || 0) + (parseFloat(stripComma(rowForm.feeAmt)) || 0)))} 원 (품대 + 수수료 자동 계산)
                  </p>
                )}

                {/* 구분선 */}
                <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

                {/* 반입일 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>반입일</label>
                  <input
                    type="date"
                    value={rowForm.receiveDate}
                    onChange={e => setRowForm(p => ({ ...p, receiveDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded text-amber-100 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                      colorScheme: 'dark'
                    }}
                  />
                </div>

                {/* 반입량 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>반입량</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatNumber(rowForm.receiveQty)}
                      onChange={e => handleReceiveQtyChange(stripComma(e.target.value))}
                      placeholder="수량 입력"
                      className="flex-1 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                    {selectedMaterial?.unit && <span className="text-sm text-amber-200/60 whitespace-nowrap">{selectedMaterial.unit}</span>}
                  </div>
                </div>

                {/* 합격량 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>합격량 (금회)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatNumber(rowForm.passQtyCurrent)}
                      onChange={e => handlePassQtyChange(stripComma(e.target.value))}
                      placeholder="수량 입력"
                      className="flex-1 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                    {selectedMaterial?.unit && <span className="text-sm text-amber-200/60 whitespace-nowrap">{selectedMaterial.unit}</span>}
                  </div>
                </div>

                {/* 검수 사진 (선택) — 검수조서 사진대지 출력에 사용 */}
                <MaterialInspectionPhotoField projectId={projectId} photos={rowPhotos} onChange={setRowPhotos} />

                {/* 불합격량 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>불합격량</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={rowForm.failQty}
                      onChange={e => setRowForm(p => ({ ...p, failQty: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                    {selectedMaterial?.unit && <span className="text-sm text-amber-200/60 whitespace-nowrap">{selectedMaterial.unit}</span>}
                  </div>
                </div>

                {/* 조치사항 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>조치사항</label>
                  <input
                    type="text"
                    value={rowForm.action}
                    onChange={e => setRowForm(p => ({ ...p, action: e.target.value }))}
                    className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                    }}
                  />
                </div>

                {/* 구분선 */}
                <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

                {/* 출고일 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>출고일</label>
                  <input
                    type="date"
                    value={rowForm.releaseDate}
                    onChange={e => setRowForm(p => ({ ...p, releaseDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded text-amber-100 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                      colorScheme: 'dark'
                    }}
                  />
                </div>

                {/* 출고량 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>출고량</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatNumber(rowForm.releaseQty)}
                      onChange={e => setRowForm(p => ({ ...p, releaseQty: stripComma(e.target.value) }))}
                      placeholder="수량 입력"
                      className="flex-1 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                    {selectedMaterial?.unit && <span className="text-sm text-amber-200/60 whitespace-nowrap">{selectedMaterial.unit}</span>}
                  </div>
                </div>
              </div>

              {/* 하단 버튼 */}
              <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{
                background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)',
                borderTop: '2px solid #5a4a35'
              }}>
                <button
                  onClick={() => { setIsRowModalOpen(false); setEditingRowId(null) }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                    border: '2px solid #4a4a55',
                    borderRadius: '6px',
                    color: '#a8a8b0',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                  }}
                >
                  취소
                </button>
                <button
                  onClick={editingRowId ? handleUpdateRow : handleAddRow}
                  className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                    border: '2px solid #6a5a40',
                    borderRadius: '6px',
                    color: '#f5d78e',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
                    fontFamily: 'serif'
                  }}
                >
                  ⚔ {editingRowId ? '수정' : '등록'}
                </button>
              </div>

              {/* 하단 금속 테두리 */}
              <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900 flex-shrink-0" style={{
                boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
              }} />
            </div>
          </div>
        )}

        {/* 자재명/규격 수정 모달 */}
        {isMaterialEditModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setIsMaterialEditModalOpen(false)}>
            <div
              className="max-w-sm w-full rounded-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
                border: '3px solid #4a3a28',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9)'
              }}
            >
              <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
                boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
              }} />

              <div className="flex items-center justify-between px-5 py-3" style={{
                background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
                borderBottom: '2px solid #5a4a35'
              }}>
                <h3 className="text-base font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  ⚔ 자재 수정
                </h3>
                <button onClick={() => setIsMaterialEditModalOpen(false)} className="text-amber-200/50 hover:text-amber-200 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                    자재명 <span className="text-amber-200/60 text-xs ml-1">(의무사항)</span>
                  </label>
                  <input
                    type="text"
                    value={materialEditForm.name}
                    onChange={e => setMaterialEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                    }}
                  />
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                    단위 <span className="text-amber-200/60 text-xs ml-1">(의무사항)</span>
                  </label>
                  <input
                    type="text"
                    value={materialEditForm.unit}
                    onChange={e => setMaterialEditForm(p => ({ ...p, unit: e.target.value }))}
                    placeholder="예: 포, m³, EA"
                    className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                    }}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {['ton', 'kg', 'm³', 'm²', 'm', '포', '대', 'EA', '본', '세트', '장'].map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setMaterialEditForm(p => ({ ...p, unit: u }))}
                        className="px-2.5 py-1 text-xs transition-all duration-200"
                        style={{
                          background: materialEditForm.unit === u
                            ? 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)'
                            : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                          border: materialEditForm.unit === u ? '1px solid #aa2020' : '1px solid #4a4a55',
                          borderRadius: '4px',
                          color: materialEditForm.unit === u ? '#fca5a5' : '#a8a8b0',
                          boxShadow: materialEditForm.unit === u ? '0 0 10px rgba(139,0,0,0.5)' : 'none'
                        }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

                {/* 조달청 계약 부가정보 (선택항목, 엑셀 미출력) */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                      계약업체명 <span className="text-amber-200/50 text-xs ml-1">(선택사항)</span>
                    </label>
                    <input
                      type="text"
                      value={materialEditForm.supplier}
                      onChange={e => setMaterialEditForm(p => ({ ...p, supplier: e.target.value }))}
                      placeholder="예: 주식회사 토암콘크리트"
                      className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                        업체 연락처 <span className="text-amber-200/50 text-xs ml-1">(선택)</span>
                      </label>
                      <input
                        type="tel"
                        value={materialEditForm.supplierTel}
                        onChange={e => setMaterialEditForm(p => ({ ...p, supplierTel: e.target.value }))}
                        placeholder="예: 031-000-0000"
                        className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                        style={{
                          background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                          border: '2px solid #4a4a55',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                        납품기한 <span className="text-amber-200/50 text-xs ml-1">(선택)</span>
                      </label>
                      <input
                        type="date"
                        value={materialEditForm.deadline}
                        onChange={e => setMaterialEditForm(p => ({ ...p, deadline: e.target.value }))}
                        className="w-full px-3 py-2 rounded text-amber-100 text-sm"
                        style={{
                          background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                          border: '2px solid #4a4a55',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                          colorScheme: 'dark'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

                {/* 배치 아이콘 배경색(보석) 선택 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                    보석 색상 <span className="text-amber-200/50 text-xs ml-1">(선택사항)</span>
                  </label>
                  <div className="grid grid-cols-5 gap-2 p-2 rounded" style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}>
                    {gemPalette.map((gem, index) => {
                      const isSelected = materialEditForm.colorIndex === index
                      return (
                        <button
                          key={gem.name}
                          type="button"
                          onClick={() => setMaterialEditForm(p => ({ ...p, colorIndex: index }))}
                          className={`w-full aspect-square rounded relative flex flex-col items-center justify-center transition-all ${
                            isSelected ? 'scale-110 z-10' : 'hover:scale-105'
                          }`}
                          title={gem.name}
                        >
                          {isSelected && (
                            <div className="absolute -inset-1 rounded animate-pulse" style={{
                              border: '2px solid #f5d78e',
                              boxShadow: '0 0 10px #f5d78e, inset 0 0 5px #f5d78e'
                            }} />
                          )}
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gem.color} ${gem.border} border flex items-center justify-center shadow-md`}
                            style={{
                              boxShadow: isSelected ? '0 0 15px rgba(255,255,255,0.4)' : 'none'
                            }}
                          >
                            <div className="absolute top-1 left-2 w-1.5 h-1.5 bg-white/40 rounded-full blur-[0.5px]" />
                            {isSelected && <Check className="h-4 w-4 text-white drop-shadow-md" />}
                          </div>
                          <span className="text-[10px] text-amber-200/70 mt-1 truncate max-w-full px-1">{gem.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-5 py-4" style={{
                background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)',
                borderTop: '2px solid #5a4a35'
              }}>
                <button
                  onClick={() => setIsMaterialEditModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                    border: '2px solid #4a4a55',
                    borderRadius: '6px',
                    color: '#a8a8b0',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleUpdateMaterial}
                  disabled={!materialEditForm.name.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  style={{
                    background: materialEditForm.name.trim()
                      ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                      : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                    border: '2px solid #6a5a40',
                    borderRadius: '6px',
                    color: '#f5d78e',
                    boxShadow: materialEditForm.name.trim() ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
                    fontFamily: 'serif'
                  }}
                >
                  ⚔ 수정
                </button>
              </div>

              <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
                boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
              }} />
            </div>
          </div>
        )}

        {linkModalJsx}
        {dlvrDetailModalJsx}
      </div>
    )
  }

  // ── 대시보드 (호라드릭 큐브 스타일) ──

  // 자재 타입에 따른 아이콘 색상 (보석/룬 스타일)
  const getMaterialGemStyle = (name: string, index: number, colorIndex?: number) => {
    const gemStyles = [
      { bg: 'from-red-600 to-red-900', glow: 'shadow-red-500/50', border: 'border-red-400' },        // 루비
      { bg: 'from-green-500 to-green-800', glow: 'shadow-green-500/50', border: 'border-green-400' }, // 에메랄드
      { bg: 'from-blue-500 to-blue-800', glow: 'shadow-blue-500/50', border: 'border-blue-400' },     // 사파이어
      { bg: 'from-amber-400 to-amber-700', glow: 'shadow-amber-500/50', border: 'border-amber-300' }, // 토파즈
      { bg: 'from-purple-500 to-purple-800', glow: 'shadow-purple-500/50', border: 'border-purple-400' }, // 자수정
      { bg: 'from-gray-300 to-gray-600', glow: 'shadow-gray-400/50', border: 'border-gray-300' },     // 다이아
      { bg: 'from-pink-400 to-pink-700', glow: 'shadow-pink-500/50', border: 'border-pink-400' },     // 핑크
      { bg: 'from-cyan-400 to-cyan-700', glow: 'shadow-cyan-500/50', border: 'border-cyan-400' },     // 시안
      { bg: 'from-orange-500 to-orange-800', glow: 'shadow-orange-500/50', border: 'border-orange-400' }, // 오렌지
    ]
    const finalIndex = colorIndex !== undefined && colorIndex >= 0 && colorIndex < gemStyles.length ? colorIndex : index
    return gemStyles[finalIndex % gemStyles.length]
  }

  // 계약(자재) 단위 목록 행 — 엑셀 계약 현황 양식처럼 계약별로 집계하고, 세부 규격은 상세에서 확인
  const contractRows = materials.map(m => ({
    mat: m,
    dlvrReqNo: m.dlvrReqNo || m.rows.find(r => r.dlvrReqNo)?.dlvrReqNo || '',
    prdctAmt: m.rows.reduce((s, r) => s + (parseFloat(stripComma(r.prdctAmt || '')) || 0), 0),
    feeAmt: m.rows.reduce((s, r) => s + (parseFloat(stripComma(r.feeAmt || '')) || 0), 0),
    cndtn: [...new Set(m.rows.map(r => r.dlvrCndtn).filter(Boolean))].join(', '),
  }))
  const totalPrdctAmt = contractRows.reduce((s, r) => s + r.prdctAmt, 0)
  const totalFeeAmt = contractRows.reduce((s, r) => s + r.feeAmt, 0)
  // 납품기한 연도(년차)별 그룹 — 소계 행을 해당 연도 계약들 바로 위에 표시.
  // 최근년도가 맨 위(내림차순), 납품기한 없는 계약은 마지막에 소계 없이 배치.
  const yearOfRow = (r: { mat: Material }) => {
    const y = (r.mat.dlvrDeadline || '').slice(0, 4)
    return /^\d{4}$/.test(y) ? y : ''
  }
  let contractSeq = 0
  const yearGroups = [...[...new Set(contractRows.map(yearOfRow).filter(Boolean))].sort().reverse(), '']
    .map(year => {
      const rows = contractRows.filter(r => yearOfRow(r) === year).map(r => ({ ...r, no: ++contractSeq }))
      return {
        year,
        rows,
        prdctAmt: rows.reduce((s, r) => s + r.prdctAmt, 0),
        feeAmt: rows.reduce((s, r) => s + r.feeAmt, 0),
      }
    })
    .filter(g => g.rows.length > 0)
  // 금액 표시 — 0은 '-'로
  const fmtAmt = (n: number) => (n ? formatNumber(String(Math.round(n))) : '-')

  // 아이템 슬롯 뷰 — 빈 슬롯 생성: 자재 + 추가 버튼이 한 행을 꽉 채워도 항상 다음 행에 여분 칸이 보이도록
  // 열 수(모바일 4 / md 8)로 나누어 떨어지게 올림하여 마지막 행이 깔끔하게 채워지고
  // 최소 1칸 이상의 여분이 남도록 한다.
  const SLOT_COLS = 8
  const usedSlots = materials.length + 1 // 자재 + 추가 버튼
  const totalSlots = Math.max(32, Math.ceil((usedSlots + 1) / SLOT_COLS) * SLOT_COLS)
  const emptySlots = totalSlots - usedSlots

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d15 50%, #000000 100%)',
      isolation: 'isolate'
    }}>
      {/* 창고 배경 사진 — 흐림 + 어두운 그라데이션 오버레이로 다크 테마와 조화 (스크롤 시 고정) */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: -1,
          backgroundImage: "linear-gradient(180deg, rgba(20,18,30,0.72) 0%, rgba(10,10,16,0.8) 55%, rgba(0,0,0,0.92) 100%), url('/창고 배경 사진.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(3px)',
          transform: 'scale(1.03)'
        }}
      />
      {/* 드래그 중 흔들림 애니메이션 (아이템 슬롯 뷰) */}
      {draggingMaterialId && (
        <style>{`
          @keyframes wobble {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-1.5deg); }
            75% { transform: rotate(1.5deg); }
          }
        `}</style>
      )}
      {/* 드래그 중 쓰레기통 영역 */}
      {draggingMaterialId && (
        <div
          ref={trashZoneRef}
          className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-6 transition-all duration-200 ${isOverTrash ? 'bg-red-900/90' : 'bg-black/80'
            }`}
          style={{
            boxShadow: isOverTrash ? '0 0 40px rgba(220,38,38,0.6)' : '0 4px 20px rgba(0,0,0,0.8)'
          }}
        >
          <div className={`flex flex-col items-center gap-2 transition-transform duration-200 ${isOverTrash ? 'scale-125' : ''}`}>
            <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${isOverTrash ? 'bg-red-600' : 'bg-gray-700'
              }`} style={{
                border: isOverTrash ? '2px solid #ef4444' : '2px solid #6b7280',
                boxShadow: isOverTrash ? '0 0 20px rgba(239,68,68,0.5)' : 'none'
              }}>
              <Trash2 className={`h-8 w-8 ${isOverTrash ? 'text-white' : 'text-gray-400'}`} />
            </div>
            <span className={`text-sm font-medium ${isOverTrash ? 'text-red-300' : 'text-gray-400'}`}>
              {isOverTrash ? '놓아서 삭제' : '여기에 놓아서 삭제'}
            </span>
          </div>
        </div>
      )}

      {/* 드래그 중인 아이템 (플로팅) */}
      {draggingMaterialId && dragPosition && (() => {
        const mat = materials.find(m => m.id === draggingMaterialId)
        if (!mat) return null
        const idx = materials.findIndex(m => m.id === draggingMaterialId)
        const gemStyle = getMaterialGemStyle(mat.name, idx, mat.colorIndex)
        return (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: dragPosition.x - 40,
              top: dragPosition.y - 40,
              width: 80,
              height: 80,
            }}
          >
            <div className="w-full h-full rounded animate-pulse" style={{
              background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 50%, #1a1a22 100%)',
              border: '2px solid #4a4a55',
              boxShadow: '0 10px 40px rgba(0,0,0,0.8), 0 0 20px rgba(255,215,0,0.3)'
            }}>
              <div className={`absolute inset-1 rounded bg-gradient-to-br ${gemStyle.bg} ${gemStyle.border} border flex flex-col items-center justify-center`}
                style={{ boxShadow: `0 0 15px rgba(0,0,0,0.5), 0 0 30px currentColor` }}
              >
                <Package className="h-8 w-8 text-white drop-shadow-lg" />
                <span className="text-white text-xs font-bold text-center leading-tight drop-shadow-lg px-1 mt-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                  {mat.name}
                </span>
              </div>
            </div>
          </div>
        )
      })()}
      {/* 헤더 - 고딕 스타일 */}
      <header className="relative" style={{
        background: 'linear-gradient(180deg, #2a2a3a 0%, #1a1a25 100%)',
        borderBottom: '3px solid #4a3a2a',
        boxShadow: '0 4px 20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,215,0,0.1)'
      }}>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex flex-wrap items-center gap-y-2 py-3 sm:h-16 sm:py-0 sm:flex-nowrap">
            <button onClick={handleBack} className="mr-4 p-2 text-amber-200/60 hover:text-amber-200 rounded-md hover:bg-amber-900/20 transition-all">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  지급자재 수불부
                </h1>
                <p className="text-xs text-amber-200/50">{project?.project_name}</p>
              </div>
            </div>

            {/* 액션 버튼 그룹: 모바일에서 제목줄 아래로 줄바꿈 */}
            <div className="w-full flex items-center justify-end gap-2 sm:w-auto sm:ml-auto">
            {/* 보기 전환: 계약 목록 표 ↔ 아이템 슬롯창 */}
            <button
              onClick={() => setDashboardView(v => {
                const next = v === 'table' ? 'slots' : 'table'
                try {
                  localStorage.setItem('materialLedgerView', next)
                } catch {
                  // 저장 실패는 무시 (이번 접속에서만 유지)
                }
                return next
              })}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all hover:scale-105 shrink-0"
              style={{
                background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                border: '2px solid #4a4a55',
                borderRadius: '6px',
                color: '#a8a8b0',
                fontFamily: 'serif'
              }}
              title={dashboardView === 'table' ? '아이템 슬롯창으로 보기' : '계약 목록 표로 보기'}
            >
              {dashboardView === 'table' ? <LayoutGrid className="h-4 w-4" /> : <Table className="h-4 w-4" />}
              <span className="hidden sm:inline">{dashboardView === 'table' ? '슬롯 보기' : '표 보기'}</span>
            </button>

            {/* 지급자재 계약 현황 엑셀 다운로드 */}
            <button
              onClick={handleDownloadContractStatus}
              disabled={contractExporting}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all hover:scale-105 shrink-0 disabled:opacity-60"
              style={{
                background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                border: '2px solid #6a5a40',
                borderRadius: '6px',
                color: '#f5d78e',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
                fontFamily: 'serif'
              }}
            >
              {contractExporting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">계약 현황 다운</span>
              <span className="sm:hidden">다운</span>
            </button>

            {/* 조달청 지급자재 계약건 일괄 조회 */}
            <button
              onClick={openBulkModal}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all hover:scale-105 shrink-0"
              style={{
                background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                border: '2px solid #6a5a40',
                borderRadius: '6px',
                color: '#f5d78e',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
                fontFamily: 'serif'
              }}
            >
              <img src="/g2b.png" alt="" className="h-4 w-4 rounded-full bg-white/90 p-[1px] object-contain" />
              <span className="hidden sm:inline">조달청 일괄 조회</span>
              <span className="sm:hidden">일괄 조회</span>
            </button>
            </div>
          </div>
        </div>
      </header>

      {/* 계약 현황 다운로드 진행률 오버레이 */}
      {contractExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div
            className="w-[85%] max-w-md px-6 py-6 rounded-lg"
            style={{
              background: 'linear-gradient(180deg, #252530 0%, #1a1a22 100%)',
              border: '3px solid #4a3a28',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.8)',
              fontFamily: 'serif',
            }}
          >
            <div className="flex items-center gap-2 mb-4 text-amber-100">
              <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
              <span className="text-sm font-medium">계약 현황 엑셀 생성 중…</span>
            </div>
            <div
              className="w-full h-4 rounded-full overflow-hidden"
              style={{ background: '#12121a', border: '1px solid #4a3a28', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)' }}
            >
              <div
                className="h-full transition-all duration-300 ease-out"
                style={{
                  width: `${contractProgress}%`,
                  background: 'linear-gradient(90deg, #8a6a30 0%, #f5d78e 50%, #8a6a30 100%)',
                  boxShadow: '0 0 10px rgba(245,215,142,0.6)',
                }}
              />
            </div>
            <div className="mt-2 text-right text-xs text-amber-200/70">{contractProgress}%</div>
          </div>
        </div>
      )}

      {dashboardView === 'slots' ? (
      /* 아이템 슬롯창 뷰 (호라드릭 큐브 스타일) */
      <main className="flex-1 w-full max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-4">
        {/* 호라드릭 큐브 프레임 */}
        <div className="relative">
          {/* 외곽 장식 프레임 */}
          <div className="absolute -inset-4 rounded-lg opacity-60" style={{
            background: 'linear-gradient(135deg, #3d3020 0%, #2a2015 50%, #1a150d 100%)',
            border: '2px solid #5a4a35',
            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)'
          }} />

          {/* 코너 장식 */}
          <div className="absolute -top-6 -left-6 w-12 h-12 bg-gradient-to-br from-amber-700 to-amber-900 rounded-full border-2 border-amber-500/50 shadow-lg" style={{ boxShadow: '0 0 20px rgba(180,130,50,0.3)' }} />
          <div className="absolute -top-6 -right-6 w-12 h-12 bg-gradient-to-br from-amber-700 to-amber-900 rounded-full border-2 border-amber-500/50 shadow-lg" style={{ boxShadow: '0 0 20px rgba(180,130,50,0.3)' }} />
          <div className="absolute -bottom-6 -left-6 w-12 h-12 bg-gradient-to-br from-amber-700 to-amber-900 rounded-full border-2 border-amber-500/50 shadow-lg" style={{ boxShadow: '0 0 20px rgba(180,130,50,0.3)' }} />
          <div className="absolute -bottom-6 -right-6 w-12 h-12 bg-gradient-to-br from-amber-700 to-amber-900 rounded-full border-2 border-amber-500/50 shadow-lg" style={{ boxShadow: '0 0 20px rgba(180,130,50,0.3)' }} />

          {/* 메인 인벤토리 컨테이너 */}
          <div className="relative rounded-lg overflow-hidden" style={{
            background: 'linear-gradient(180deg, #252530 0%, #1a1a22 50%, #12121a 100%)',
            border: '3px solid #4a3a28',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9), 0 10px 40px rgba(0,0,0,0.8)'
          }}>
            {/* 상단 금속 테두리 */}
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />

            {/* 인벤토리 그리드 */}
            <div className="p-4">
              {materials.length === 0 ? (
                /* 빈 상태 */
                <div className="py-16 text-center">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-gray-600 flex items-center justify-center" style={{
                    boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)'
                  }}>
                    <Package className="h-10 w-10 text-gray-500" />
                  </div>
                  <p className="text-amber-200/50 mb-6" style={{ fontFamily: 'serif' }}>보관창이 비어있습니다</p>
                  <button
                    onClick={openMaterialModal}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-amber-100 font-medium transition-all hover:scale-105"
                    style={{
                      background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                      border: '2px solid #6a5a40',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
                      fontFamily: 'serif'
                    }}
                  >
                    <Plus className="h-5 w-5" />
                    자재 추가
                  </button>
                </div>
              ) : (
                /* 자재 인벤토리 그리드 (호라드릭 큐브 스타일) */
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1">
                  {materials.map((mat, idx) => {
                    const gemStyle = getMaterialGemStyle(mat.name, idx, mat.colorIndex)
                    const isDragging = draggingMaterialId === mat.id
                    const isDropTarget = dropTargetIndex === idx && !isDragging
                    return (
                      <div
                        key={mat.id}
                        ref={(el) => {
                          if (el) materialRefs.current.set(mat.id, el)
                          else materialRefs.current.delete(mat.id)
                        }}
                        className={`relative group select-none transition-all duration-200 ${isDragging ? 'opacity-30 scale-90' : ''} ${isDropTarget ? 'scale-110 z-10' : ''}`}
                        style={{
                          WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'none',
                          ...(draggingMaterialId && !isDragging ? { animation: 'wobble 0.8s ease-in-out infinite' } : {}),
                        }}
                        onMouseDown={(e) => {
                          if (e.button === 0) {
                            handleLongPressStart(mat.id, e.clientX, e.clientY)
                          }
                        }}
                        onMouseUp={handleLongPressCancel}
                        onMouseLeave={handleLongPressCancel}
                        onTouchStart={(e) => {
                          if (e.touches.length === 1) {
                            // 모바일에서 롱프레스 시 텍스트 선택 팝업 방지
                            e.preventDefault()
                            handleLongPressStart(mat.id, e.touches[0].clientX, e.touches[0].clientY)
                          }
                        }}
                        onTouchEnd={handleLongPressCancel}
                        onTouchCancel={handleLongPressCancel}
                      >
                        {/* 드롭 대상 표시 - 빛나는 테두리 */}
                        {isDropTarget && (
                          <div className="absolute -inset-1 rounded-lg z-0 animate-pulse" style={{
                            border: '2px solid #fbbf24',
                            boxShadow: '0 0 12px rgba(251,191,36,0.6), inset 0 0 12px rgba(251,191,36,0.2)',
                          }} />
                        )}
                        <button
                          onClick={() => !draggingMaterialId && !wasDragging.current && setSelectedMaterialId(mat.id)}
                          className="w-full aspect-square rounded transition-all duration-200 hover:scale-110 hover:z-10 relative"
                          style={{
                            background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 50%, #1a1a22 100%)',
                            border: '2px solid #4a4a55',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(255,255,255,0.02)'
                          }}
                        >
                          {/* 자재명이 들어있는 도형 */}
                          <div className={`absolute inset-1 rounded bg-gradient-to-br ${gemStyle.bg} ${gemStyle.border} border flex flex-col items-center justify-center`}
                            style={{
                              boxShadow: `0 0 15px rgba(0,0,0,0.5), 0 0 30px currentColor`,
                            }}
                          >
                            {/* 광택 효과 */}
                            <div className="absolute top-1 left-1 w-2 h-2 bg-white/40 rounded-full blur-sm" />
                            <div className="absolute top-2 left-2 w-1 h-1 bg-white/60 rounded-full" />

                            {/* 상자 아이콘 */}
                            <Package className="h-8 w-8 text-white drop-shadow-lg" />

                            {/* 자재명 */}
                            <span className="text-white text-xs font-bold text-center leading-tight drop-shadow-lg px-1 mt-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                              {mat.name}
                            </span>
                          </div>

                          {/* 나라장터(납품요구) 연계 마크 — 우측 상단 */}
                          {mat.dlvrReqNo && (
                            <img
                              src="/g2b.png"
                              alt="나라장터 연계"
                              title={`나라장터 연계 (${mat.dlvrReqNo})`}
                              className="absolute top-1 right-1 h-4 w-4 z-10 rounded-full bg-white/90 p-[1px] object-contain shadow"
                            />
                          )}
                        </button>
                      </div>
                    )
                  })}

                  {/* 자재 추가 슬롯 */}
                  <button
                    onClick={openMaterialModal}
                    className="w-full aspect-square rounded transition-all duration-200 hover:scale-105 group"
                    style={{
                      background: 'linear-gradient(180deg, #2a2a32 0%, #1a1a22 100%)',
                      border: '2px dashed #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)'
                    }}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <Plus className="h-6 w-6 text-amber-200/30 group-hover:text-amber-200/60 transition-colors" />
                    </div>
                  </button>

                  {/* 빈 슬롯들 */}
                  {Array.from({ length: emptySlots }).map((_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      className="w-full aspect-square rounded"
                      style={{
                        background: 'linear-gradient(180deg, #252530 0%, #1a1a22 100%)',
                        border: '2px solid #35353d',
                        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 하단 금속 테두리 */}
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />
          </div>
        </div>

        {/* 하단 안내 - 고딕 스크롤 스타일 */}
        <div className="mt-10 px-5 py-3 rounded-lg" style={{
          background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
          border: '2px solid #5a4a30',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <p className="text-xs text-amber-200/70" style={{ fontFamily: 'serif' }}>
            ⚔ 현장 반입 후 작업장 반출시 까지는 감독원이 관리하고 매 출고시 반출량 및 잔량을 확인
          </p>
        </div>
      </main>
      ) : (
      /* 계약 목록 표 뷰 */
      <main className="flex-1 w-full max-w-[1400px] mx-auto py-8 px-4 sm:px-6 lg:px-4">
        {/* 계약 목록 — 엑셀 계약 현황 양식처럼 계약 단위로 보여주고, 행을 누르면 세부 수불부로 이동 */}
        <div className="rounded-lg overflow-hidden" style={{
          background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
          border: '3px solid #4a3a28',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9)'
        }}>
          {/* 상단 금속 테두리 */}
          <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
            boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
          }} />

          {/* 상단 바 */}
          <div className="flex items-center justify-between gap-2 px-6 py-3" style={{
            background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
            borderBottom: '2px solid #5a4a35'
          }}>
            <span className="text-sm font-medium text-amber-100" style={{ fontFamily: 'serif' }}>
              ⚔ 계약 목록
              <span className="text-amber-200/40 font-normal ml-2">{materials.length}건</span>
            </span>
            <button
              onClick={openMaterialModal}
              className="p-2 rounded transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)',
                border: '2px solid #aa2020',
                color: '#fca5a5'
              }}
              title="계약(자재) 등록"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {materials.length === 0 ? (
            /* 빈 상태 */
            <div className="py-16 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-gray-600 flex items-center justify-center" style={{
                boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)'
              }}>
                <Package className="h-10 w-10 text-gray-500" />
              </div>
              <p className="text-amber-200/50 mb-6" style={{ fontFamily: 'serif' }}>등록된 계약(자재)이 없습니다</p>
              <button
                onClick={openMaterialModal}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-amber-100 font-medium transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                  border: '2px solid #6a5a40',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
                  fontFamily: 'serif'
                }}
              >
                <Plus className="h-5 w-5" />
                자재 추가
              </button>
            </div>
          ) : (
            /* 계약 목록 테이블 (계약 현황 엑셀 양식 기반, 계약 단위) */
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ background: 'linear-gradient(180deg, #3a3040 0%, #2a2030 100%)' }}>
                  <tr>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>번호</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>계약명</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>품목</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>납품요구(계약)<br />번호</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>계약자</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>인도조건</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>납품기한</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>품대계<br />(원)</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>수수료<br />(원)</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>합계<br />(원)</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 합계 행 — 엑셀 양식과 동일하게 데이터 위에 표시 */}
                  <tr style={{ background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)' }}>
                    <td colSpan={7} className="px-3 py-2 text-center text-xs font-bold" style={{ border: '1px solid #5a4a55', color: '#f5d78e' }}>합계</td>
                    <td className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap" style={{ border: '1px solid #5a4a55', color: '#f5d78e' }}>{fmtAmt(totalPrdctAmt)}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap" style={{ border: '1px solid #5a4a55', color: '#f5d78e' }}>{fmtAmt(totalFeeAmt)}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap" style={{ border: '1px solid #5a4a55', color: '#f5d78e' }}>{fmtAmt(totalPrdctAmt + totalFeeAmt)}</td>
                    <td style={{ border: '1px solid #5a4a55' }} />
                  </tr>
                  {/* 년차별 그룹 — 소계(년차) 행을 해당 연도 계약들 바로 위에 표시 */}
                  {yearGroups.map(g => (
                    <React.Fragment key={g.year || 'no-year'}>
                      {g.year && (
                        <tr style={{ background: '#2a2820' }}>
                          <td colSpan={7} className="px-3 py-1.5 text-center text-xs font-medium" style={{ border: '1px solid #5a4a55', color: '#d9c9a0' }}>소계 ({g.year}년)</td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium whitespace-nowrap" style={{ border: '1px solid #5a4a55', color: '#d9c9a0' }}>{fmtAmt(g.prdctAmt)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium whitespace-nowrap" style={{ border: '1px solid #5a4a55', color: '#d9c9a0' }}>{fmtAmt(g.feeAmt)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium whitespace-nowrap" style={{ border: '1px solid #5a4a55', color: '#d9c9a0' }}>{fmtAmt(g.prdctAmt + g.feeAmt)}</td>
                          <td style={{ border: '1px solid #5a4a55' }} />
                        </tr>
                      )}
                      {g.rows.map(row => {
                        const mat = row.mat
                        const gemStyle = getMaterialGemStyle(mat.name, row.no - 1, mat.colorIndex)
                        const title = row.dlvrReqNo ? dlvrTitles[row.dlvrReqNo] : ''
                        const rowInsps = row.dlvrReqNo
                          ? dlvrInspByNo.get(normalizeDlvrReqNo(row.dlvrReqNo)) || []
                          : []
                        const lastInspDate = rowInsps.reduce((latest, insp) => insp.inspDate > latest ? insp.inspDate : latest, '')
                        return (
                          <tr
                            key={mat.id}
                            className="cursor-pointer transition-colors"
                            style={{ background: (row.no - 1) % 2 === 0 ? '#1a1a22' : '#22222a' }}
                            onClick={() => setSelectedMaterialId(mat.id)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 100%)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = (row.no - 1) % 2 === 0 ? '#1a1a22' : '#22222a' }}
                          >
                            <td className="px-2 py-2 text-center text-xs text-amber-100/70" style={{ border: '1px solid #3a3a45' }}>{row.no}</td>
                            <td className="px-3 py-2 text-left text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45', minWidth: '200px' }}>
                              <span>
                                {title || mat.name}
                                {row.dlvrReqNo && title === undefined && (
                                  <Loader2 className="inline-block h-3 w-3 ml-1.5 animate-spin text-amber-200/40 align-middle" />
                                )}
                              </span>
                              {rowInsps.length > 0 && (
                                <span className="block w-fit mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-700/70 text-emerald-100 border border-emerald-500/40 whitespace-nowrap">
                                  검사검수 완료 · {lastInspDate || '-'} · {rowInsps.length}건
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-left text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>
                              <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle bg-gradient-to-br ${gemStyle.bg} border ${gemStyle.border}`} />
                              {mat.name}
                              {mat.unit && <span className="text-amber-200/50 ml-1">({mat.unit})</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>
                              {row.dlvrReqNo ? (
                                <span className="inline-flex items-center gap-1">
                                  <img src="/g2b.png" alt="나라장터 연계" className="h-3.5 w-3.5 rounded-full bg-white/90 p-[1px] object-contain" />
                                  {row.dlvrReqNo}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>
                              {mat.dlvrSupplier || '-'}
                              {mat.dlvrSupplierTel && <span className="block text-[10px] text-amber-200/50">☎ {mat.dlvrSupplierTel}</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{row.cndtn || '-'}</td>
                            <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatDate(mat.dlvrDeadline || '') || '-'}</td>
                            <td className="px-3 py-2 text-right text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{fmtAmt(row.prdctAmt)}</td>
                            <td className="px-3 py-2 text-right text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{fmtAmt(row.feeAmt)}</td>
                            <td className="px-3 py-2 text-right text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{fmtAmt(row.prdctAmt + row.feeAmt)}</td>
                            <td className="px-2 py-2 text-center" style={{ border: '1px solid #3a3a45' }}>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteMaterial(mat.id) }} className="p-1 text-amber-200/40 hover:text-red-400 transition-colors" title="계약(자재) 삭제">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 하단 안내 */}
          <div className="px-6 py-4" style={{
            background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
            borderTop: '2px solid #5a4a35'
          }}>
            <p className="text-xs text-amber-200/70" style={{ fontFamily: 'serif' }}>
              ⚔ 계약을 누르면 세부 수불 내역으로 이동합니다 · 현장 반입 후 작업장 반출시 까지는 감독원이 관리하고 매 출고시 반출량 및 잔량을 확인
            </p>
          </div>

          {/* 하단 금속 테두리 */}
          <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
            boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
          }} />
        </div>
      </main>
      )}

      <footer className="w-full px-4 py-6 [&_p]:!text-amber-200/60 [&_p:first-child]:!text-amber-100/80" style={{ fontFamily: 'serif' }}>
        <CopyrightNotice withDivider={false} />
      </footer>

      {/* 자재 등록 모달 - 디아블로 스타일 */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setIsMaterialModalOpen(false)}>
          <div
            className="max-w-sm md:max-w-2xl w-full max-h-[90dvh] flex flex-col rounded-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
              border: '3px solid #4a3a28',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)'
            }}
          >
            {/* 상단 금속 테두리 */}
            <div className="h-2 shrink-0 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{
              background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
              borderBottom: '2px solid #5a4a35'
            }}>
              <h3 className="text-base font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                ⚔ 자재 등록
              </h3>
              <button
                onClick={() => setIsMaterialModalOpen(false)}
                className="p-1 text-amber-200/50 hover:text-amber-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 본문 — 화면보다 길면 본문만 스크롤 */}
            <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {/* 입력 방식 선택 */}
              <div className="grid grid-cols-2 gap-2">
                {([['manual', '직접 입력'], ['g2b', '납품요구번호']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMaterialInputMode(mode)}
                    className="px-3 py-2 text-sm font-medium transition-all duration-200"
                    style={{
                      background: materialInputMode === mode
                        ? 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)'
                        : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                      border: materialInputMode === mode ? '1px solid #aa2020' : '1px solid #4a4a55',
                      borderRadius: '6px',
                      color: materialInputMode === mode ? '#fca5a5' : '#a8a8b0',
                      boxShadow: materialInputMode === mode ? '0 0 10px rgba(139,0,0,0.5)' : 'none',
                      fontFamily: 'serif'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

              {/* 데스크탑 2열 배치 — 모바일은 기존 1열 유지 */}
              <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6 md:items-start">
              {/* 좌측 열 */}
              <div className="flex flex-col gap-4">
              {/* 납품요구번호 조회 */}
              {materialInputMode === 'g2b' && (
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                    납품요구번호 <span className="text-amber-200/60 text-xs ml-1">(나라장터 종합쇼핑몰)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={g2bNo}
                      onChange={e => setG2bNo(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleG2bLookup() }}
                      placeholder="예: R25TB00824197"
                      className="flex-1 min-w-0 px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleG2bLookup}
                      disabled={g2bLoading || !g2bNo.trim()}
                      className="px-4 py-2 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                      style={{
                        background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                        border: '2px solid #6a5a40',
                        borderRadius: '6px',
                        color: '#f5d78e',
                        fontFamily: 'serif'
                      }}
                    >
                      {g2bLoading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />조회중</span> : '조회'}
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-200/40 mt-2">
                    조달청 납품요구 내역을 불러와 품명·규격·발주량을 자동 입력합니다. 전일까지 결재된 건만 조회됩니다.
                  </p>
                  {g2bError && (
                    <p className="text-xs text-red-400 mt-2">{g2bError}</p>
                  )}
                  {g2bResult && (
                    <div className="mt-3 rounded p-3" style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                    }}>
                      <p className="text-sm text-amber-100 font-medium break-all">{g2bResult.title}</p>
                      <p className="text-[11px] text-amber-200/50 mt-0.5">
                        {g2bResult.demandOrg} → {g2bResult.supplier}
                      </p>
                      <div className="mt-2 space-y-2 max-h-44 overflow-y-auto">
                        {g2bResult.items.map(item => (
                          <label key={item.sno} className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={g2bChecked.has(item.sno)}
                              onChange={() => setG2bChecked(prev => {
                                const next = new Set(prev)
                                if (next.has(item.sno)) next.delete(item.sno)
                                else next.add(item.sno)
                                return next
                              })}
                              className="mt-0.5 accent-amber-600 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs text-amber-100 break-all">{item.spec || item.name}</p>
                              <p className="text-[11px] text-amber-200/50">
                                발주량 {formatNumber(String(item.qty))} {item.unit}
                                {item.deadline ? ` · 납품기한 ${item.deadline}` : ''}
                                {item.qty <= 0 ? ' · 전량 취소됨' : ''}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 자재명 입력 */}
              {materialInputMode === 'manual' && (
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  자재명 <span className="text-amber-200/60 text-xs ml-1">(의무사항)</span>
                </label>
                <input
                  type="text"
                  value={materialForm.name}
                  onChange={e => setMaterialForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="예: 시멘트"
                  className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {['레미콘', '철근', '시멘트', 'PE관', '폴리에틸렌피복강관', '흄관', '맨홀', '수로관', 'PC박스'].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaterialForm(p => ({ ...p, name: n }))}
                      className="px-2.5 py-1 text-xs transition-all duration-200"
                      style={{
                        background: materialForm.name === n
                          ? 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)'
                          : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: materialForm.name === n ? '1px solid #aa2020' : '1px solid #4a4a55',
                        borderRadius: '4px',
                        color: materialForm.name === n ? '#fca5a5' : '#a8a8b0',
                        boxShadow: materialForm.name === n ? '0 0 10px rgba(139,0,0,0.5)' : 'none'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              )}

              {/* 단위 입력 */}
              {materialInputMode === 'manual' && (
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  단위 <span className="text-amber-200/60 text-xs ml-1">(의무사항)</span>
                </label>
                <input
                  type="text"
                  value={materialForm.unit}
                  onChange={e => setMaterialForm(p => ({ ...p, unit: e.target.value }))}
                  placeholder="예: 포, m³, EA"
                  className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}
                />
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {['ton', 'kg', 'm³', 'm²', 'm', '포', '대', 'EA', '본', '세트', '장'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setMaterialForm(p => ({ ...p, unit: u }))}
                      className="px-2.5 py-1 text-xs transition-all duration-200"
                      style={{
                        background: materialForm.unit === u
                          ? 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)'
                          : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: materialForm.unit === u ? '1px solid #aa2020' : '1px solid #4a4a55',
                        borderRadius: '4px',
                        color: materialForm.unit === u ? '#fca5a5' : '#a8a8b0',
                        boxShadow: materialForm.unit === u ? '0 0 10px rgba(139,0,0,0.5)' : 'none'
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              )}
              </div>{/* /좌측 열 */}

              {/* 우측 열 */}
              <div className="flex flex-col gap-4">
              {/* 계약 부가정보 — 직접 입력 시 선택사항 */}
              {materialInputMode === 'manual' && (
              <>
              <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent md:hidden" />
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  계약업체명 <span className="text-amber-200/50 text-xs ml-1">(선택사항)</span>
                </label>
                <input
                  type="text"
                  value={materialForm.supplier}
                  onChange={e => setMaterialForm(p => ({ ...p, supplier: e.target.value }))}
                  placeholder="예: 주식회사 토암콘크리트"
                  className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}
                />
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                      업체 연락처 <span className="text-amber-200/50 text-xs ml-1">(선택)</span>
                    </label>
                    <input
                      type="tel"
                      value={materialForm.supplierTel}
                      onChange={e => setMaterialForm(p => ({ ...p, supplierTel: e.target.value }))}
                      placeholder="예: 031-000-0000"
                      className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                      납품기한 <span className="text-amber-200/50 text-xs ml-1">(선택)</span>
                    </label>
                    <input
                      type="date"
                      value={materialForm.deadline}
                      onChange={e => setMaterialForm(p => ({ ...p, deadline: e.target.value }))}
                      className="w-full px-3 py-2 rounded text-amber-100 text-sm"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                        colorScheme: 'dark'
                      }}
                    />
                  </div>
                </div>
              </div>
              </>
              )}

              <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent md:hidden" />

              {/* 배치 아이콘 배경색(보석) 선택 */}
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  보석 색상 <span className="text-amber-200/50 text-xs ml-1">(선택사항)</span>
                </label>
                <div className="grid grid-cols-5 gap-2 p-2 rounded" style={{
                  background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                  border: '2px solid #4a4a55',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {gemPalette.map((gem, index) => {
                    const isSelected = materialForm.colorIndex === index
                    return (
                      <button
                        key={gem.name}
                        type="button"
                        onClick={() => setMaterialForm(p => ({ ...p, colorIndex: index }))}
                        className={`w-full aspect-square rounded relative flex flex-col items-center justify-center transition-all ${
                          isSelected ? 'scale-110 z-10' : 'hover:scale-105'
                        }`}
                        title={gem.name}
                      >
                        {isSelected && (
                          <div className="absolute -inset-1 rounded animate-pulse" style={{
                            border: '2px solid #f5d78e',
                            boxShadow: '0 0 10px #f5d78e, inset 0 0 5px #f5d78e'
                          }} />
                        )}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gem.color} ${gem.border} border flex items-center justify-center shadow-md`}
                          style={{
                            boxShadow: isSelected ? '0 0 15px rgba(255,255,255,0.4)' : 'none'
                          }}
                        >
                          <div className="absolute top-1 left-2 w-1.5 h-1.5 bg-white/40 rounded-full blur-[0.5px]" />
                          {isSelected && <Check className="h-4 w-4 text-white drop-shadow-md" />}
                        </div>
                        <span className="text-[10px] text-amber-200/70 mt-1 truncate max-w-full px-1">{gem.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              </div>{/* /우측 열 */}
              </div>{/* /2열 배치 */}
            </div>

            {/* 하단 버튼 */}
            <div className="flex gap-3 px-5 py-4 shrink-0" style={{
              background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)',
              borderTop: '2px solid #5a4a35'
            }}>
              <button
                onClick={() => setIsMaterialModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                  border: '2px solid #4a4a55',
                  borderRadius: '6px',
                  color: '#a8a8b0',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                }}
              >
                취소
              </button>
              <button
                onClick={materialInputMode === 'manual' ? handleAddMaterial : handleAddMaterialFromG2b}
                disabled={materialInputMode === 'manual' ? !materialForm.name.trim() : (!g2bResult || g2bChecked.size === 0)}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: (materialInputMode === 'manual' ? !!materialForm.name.trim() : !!(g2bResult && g2bChecked.size > 0))
                    ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                    : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                  border: '2px solid #6a5a40',
                  borderRadius: '6px',
                  color: '#f5d78e',
                  boxShadow: (materialInputMode === 'manual' ? !!materialForm.name.trim() : !!(g2bResult && g2bChecked.size > 0)) ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
                  fontFamily: 'serif'
                }}
              >
                ⚔ {materialInputMode === 'manual' ? '등록' : '선택 품목 등록'}
              </button>
            </div>

            {/* 하단 금속 테두리 */}
            <div className="h-2 shrink-0 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />
          </div>
        </div>
      )}

      {/* 자재명/규격 수정 모달 */}
      {isMaterialEditModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setIsMaterialEditModalOpen(false)}>
          <div
            className="max-w-sm w-full rounded-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
              border: '3px solid #4a3a28',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9)'
            }}
          >
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />

            <div className="flex items-center justify-between px-5 py-3" style={{
              background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
              borderBottom: '2px solid #5a4a35'
            }}>
              <h3 className="text-base font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                ⚔ 자재 수정
              </h3>
              <button onClick={() => setIsMaterialEditModalOpen(false)} className="text-amber-200/50 hover:text-amber-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>자재명 <span className="text-amber-200/60 text-xs ml-1">(의무사항)</span></label>
                <input
                  type="text"
                  value={materialEditForm.name}
                  onChange={e => setMaterialEditForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}
                />
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>단위 <span className="text-amber-200/60 text-xs ml-1">(의무사항)</span></label>
                <input
                  type="text"
                  value={materialEditForm.unit}
                  onChange={e => setMaterialEditForm(p => ({ ...p, unit: e.target.value }))}
                  placeholder="예: 포, m³, EA"
                  className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}
                />
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {['ton', 'kg', 'm³', 'm²', 'm', '포', '대', 'EA', '본', '세트', '장'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setMaterialEditForm(p => ({ ...p, unit: u }))}
                      className="px-2.5 py-1 text-xs transition-all duration-200"
                      style={{
                        background: materialEditForm.unit === u
                          ? 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)'
                          : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: materialEditForm.unit === u ? '1px solid #aa2020' : '1px solid #4a4a55',
                        borderRadius: '4px',
                        color: materialEditForm.unit === u ? '#fca5a5' : '#a8a8b0',
                        boxShadow: materialEditForm.unit === u ? '0 0 10px rgba(139,0,0,0.5)' : 'none'
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

              {/* 배치 아이콘 배경색(보석) 선택 */}
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  보석 색상 <span className="text-amber-200/50 text-xs ml-1">(선택사항)</span>
                </label>
                <div className="grid grid-cols-5 gap-2 p-2 rounded" style={{
                  background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                  border: '2px solid #4a4a55',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {gemPalette.map((gem, index) => {
                    const isSelected = materialEditForm.colorIndex === index
                    return (
                      <button
                        key={gem.name}
                        type="button"
                        onClick={() => setMaterialEditForm(p => ({ ...p, colorIndex: index }))}
                        className={`w-full aspect-square rounded relative flex flex-col items-center justify-center transition-all ${
                          isSelected ? 'scale-110 z-10' : 'hover:scale-105'
                        }`}
                        title={gem.name}
                      >
                        {isSelected && (
                          <div className="absolute -inset-1 rounded animate-pulse" style={{
                            border: '2px solid #f5d78e',
                            boxShadow: '0 0 10px #f5d78e, inset 0 0 5px #f5d78e'
                          }} />
                        )}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gem.color} ${gem.border} border flex items-center justify-center shadow-md`}
                          style={{
                            boxShadow: isSelected ? '0 0 15px rgba(255,255,255,0.4)' : 'none'
                          }}
                        >
                          <div className="absolute top-1 left-2 w-1.5 h-1.5 bg-white/40 rounded-full blur-[0.5px]" />
                          {isSelected && <Check className="h-4 w-4 text-white drop-shadow-md" />}
                        </div>
                        <span className="text-[10px] text-amber-200/70 mt-1 truncate max-w-full px-1">{gem.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4" style={{
              background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)',
              borderTop: '2px solid #5a4a35'
            }}>
              <button
                onClick={() => setIsMaterialEditModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                  border: '2px solid #4a4a55',
                  borderRadius: '6px',
                  color: '#a8a8b0',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                }}
              >
                취소
              </button>
              <button
                onClick={handleUpdateMaterial}
                disabled={!materialEditForm.name.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: materialEditForm.name.trim()
                    ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                    : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                  border: '2px solid #6a5a40',
                  borderRadius: '6px',
                  color: '#f5d78e',
                  boxShadow: materialEditForm.name.trim() ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
                  fontFamily: 'serif'
                }}
              >
                ⚔ 수정
              </button>
            </div>

            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />
          </div>
        </div>
      )}

      {/* 조달청 일괄 조회 모달 - 디아블로 스타일 */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => { if (!bulkImporting && !bulkLoading && !bulkDetailLoading && bulkStep === 'list') setIsBulkModalOpen(false) }}>
          <div
            className={`${bulkStep === 'assign' ? 'max-w-5xl' : 'max-w-2xl'} w-full rounded-lg overflow-hidden max-h-[90vh] flex flex-col`}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
              border: '3px solid #4a3a28',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)'
            }}
          >
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900 flex-shrink-0" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{
              background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
              borderBottom: '2px solid #5a4a35'
            }}>
              <h3 className="text-base font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                {bulkStep === 'assign' ? '⚒ 검수기록 이관 — 납품요구 품목 배정' : '⚔ 조달청 지급자재 일괄 조회'}
              </h3>
              <button
                onClick={() => { if (!bulkImporting && !bulkLoading && !bulkDetailLoading) setIsBulkModalOpen(false) }}
                className="p-1 text-amber-200/50 hover:text-amber-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {bulkStep === 'list' ? (
            <>
            {/* 본문 */}
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  프로젝트명(건명) 검색 <span className="text-amber-200/60 text-xs ml-1">(부분 일치 — 단어 하나만 포함돼도 표시, 일치 많은 순)</span>
                </label>
                <input
                  type="text"
                  value={bulkKeyword}
                  onChange={e => setBulkKeyword(e.target.value)}
                  placeholder="예: 캠프레드클라우드 (비우면 수요기관 전체 표시)"
                  className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                    border: '2px solid #4a4a55',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                  }}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-medium text-amber-200/70 mb-1.5" style={{ fontFamily: 'serif' }}>
                    수요기관명 <span className="text-amber-200/40 ml-1">(관리지사 기준 자동 입력 · 부분일치 검색)</span>
                  </label>
                  <input
                    type="text"
                    value={bulkInst}
                    onChange={e => setBulkInst(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleBulkSearch() }}
                    placeholder={bulkInstLoading ? '계약정보에서 불러오는 중…' : '예: 한국농어촌공사 경기지역본부'}
                    className="w-full h-10 px-3 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                    }}
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="block text-xs font-medium text-amber-200/70 mb-1.5" style={{ fontFamily: 'serif' }}>조회 기간</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="month"
                      value={bulkFrom}
                      onChange={e => setBulkFrom(e.target.value)}
                      className="h-10 px-3 rounded text-amber-100 text-sm flex-1 min-w-0 sm:flex-none"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                        colorScheme: 'dark'
                      }}
                    />
                    <span className="text-amber-200/50 shrink-0">~</span>
                    <input
                      type="month"
                      value={bulkTo}
                      onChange={e => setBulkTo(e.target.value)}
                      className="h-10 px-3 rounded text-amber-100 text-sm flex-1 min-w-0 sm:flex-none"
                      style={{
                        background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                        border: '2px solid #4a4a55',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                        colorScheme: 'dark'
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleBulkSearch()}
                  disabled={bulkLoading || bulkImporting || bulkDetailLoading}
                  className="h-10 px-5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shrink-0 w-full sm:w-auto"
                  style={{
                    background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
                    border: '2px solid #6a5a40',
                    borderRadius: '6px',
                    color: '#f5d78e',
                    fontFamily: 'serif'
                  }}
                >
                  {bulkLoading
                    ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />{bulkProgress.done}/{bulkProgress.total}개월</span>
                    : '조회'}
                </button>
              </div>
              {/* 기간 프리셋 — 누르면 오늘 기준 최근 n개월로 설정 후 즉시 조회 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-amber-200/50" style={{ fontFamily: 'serif' }}>오늘 기준</span>
                {[6, 12, 18, 24, 30, 36].map(n => {
                  const d = new Date()
                  d.setMonth(d.getMonth() - (n - 1))
                  const isActive = bulkTo === new Date().toISOString().slice(0, 7) && bulkFrom === d.toISOString().slice(0, 7)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => applyBulkPreset(n)}
                      disabled={bulkLoading || bulkImporting}
                      className="px-2.5 py-1 text-xs transition-all duration-200 disabled:opacity-50"
                      style={{
                        background: isActive
                          ? 'linear-gradient(180deg, #8b0000 0%, #5a0000 100%)'
                          : 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: isActive ? '1px solid #aa2020' : '1px solid #4a4a55',
                        borderRadius: '4px',
                        color: isActive ? '#fca5a5' : '#a8a8b0',
                        boxShadow: isActive ? '0 0 10px rgba(139,0,0,0.5)' : 'none'
                      }}
                    >
                      {n}개월
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-amber-200/40">
                조달청 API가 건명 검색을 지원하지 않아, 수요기관 명의의 기간 내 납품요구 전체를 월 단위로 조회한 뒤 프로젝트명으로 추립니다.
              </p>
              {bulkError && (
                <p className="text-xs text-red-400 break-all">{bulkError}</p>
              )}

              {bulkItems && (
                <div className="rounded p-3" style={{
                  background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                  border: '2px solid #4a4a55',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {bulkItems.length === 0 ? (
                    <p className="text-xs text-amber-200/50">조회된 납품요구가 없습니다. 수요기관명·기간을 확인해주세요.</p>
                  ) : bulkVisibleItems.length === 0 ? (
                    <p className="text-xs text-amber-200/50">
                      사업명과 일치하는 건이 없습니다. (전체 {bulkItems.length}건)
                      <br />검색어를 줄이거나 비우면 수요기관 전체 건을 확인할 수 있습니다.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-amber-200/50 mb-2">
                        {bulkKeywordTokens.length > 0
                          ? `사업명 일치 ${bulkVisibleItems.length}건 / 전체 ${bulkItems.length}건 — 납품기한 늦은 순`
                          : `총 ${bulkItems.length}건 — 납품기한 늦은 순`}
                      </p>
                      {(() => {
                        const visibleUnregistered = bulkVisibleItems.filter(i => !registeredDlvrNos.has(i.dlvrReqNo))
                        const allChecked = visibleUnregistered.length > 0 && visibleUnregistered.every(i => bulkChecked.has(i.dlvrReqNo))
                        return (
                          <label className="flex items-center gap-2 pb-2 mb-1 cursor-pointer" style={{ borderBottom: '1px solid rgba(255,215,0,0.15)' }}>
                            <input
                              type="checkbox"
                              checked={allChecked}
                              disabled={bulkImporting || visibleUnregistered.length === 0}
                              onChange={() => setBulkChecked(prev => {
                                const next = new Set(prev)
                                if (allChecked) visibleUnregistered.forEach(i => next.delete(i.dlvrReqNo))
                                else visibleUnregistered.forEach(i => next.add(i.dlvrReqNo))
                                return next
                              })}
                              className="accent-amber-600 shrink-0"
                            />
                            <span className="text-[11px] text-amber-200/60">표시된 미등록 건 전체 선택</span>
                          </label>
                        )
                      })()}
                      <div className="space-y-1 max-h-[38vh] overflow-y-auto">
                        {bulkVisibleItems.map(item => {
                          const isRegistered = registeredDlvrNos.has(item.dlvrReqNo)
                          return (
                            <label
                              key={item.dlvrReqNo}
                              className={`flex items-start gap-2 p-1.5 rounded ${isRegistered ? 'opacity-50' : 'cursor-pointer hover:bg-white/5'}`}
                            >
                              <input
                                type="checkbox"
                                disabled={isRegistered || bulkImporting}
                                checked={bulkChecked.has(item.dlvrReqNo)}
                                onChange={() => setBulkChecked(prev => {
                                  const next = new Set(prev)
                                  if (next.has(item.dlvrReqNo)) next.delete(item.dlvrReqNo)
                                  else next.add(item.dlvrReqNo)
                                  return next
                                })}
                                className="mt-0.5 accent-amber-600 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-amber-100 break-all">{item.name || item.prdctNm}</p>
                                <p className="text-[11px] text-amber-200/50 break-all">
                                  {item.dlvrReqNo}-{item.chgOrd} · 접수 {item.rcptDate}
                                  {item.prdctNm ? ` · ${item.prdctNm}` : ''}
                                  {item.deadline ? ` · 납품기한 ${item.deadline}` : ''}
                                </p>
                                <p className="text-[11px] text-amber-200/40 break-all">{item.dminsttNm} → {item.corpNm}</p>
                              </div>
                              {isRegistered && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{
                                  background: 'rgba(34,197,94,0.15)',
                                  border: '1px solid rgba(34,197,94,0.4)',
                                  color: '#86efac'
                                }}>등록됨</span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="flex flex-wrap gap-3 px-5 py-4 flex-shrink-0" style={{
              background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)',
              borderTop: '2px solid #5a4a35'
            }}>
              <button
                onClick={() => { if (!bulkImporting && !bulkLoading && !bulkDetailLoading) setIsBulkModalOpen(false) }}
                disabled={bulkImporting || bulkLoading || bulkDetailLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                  border: '2px solid #4a4a55',
                  borderRadius: '6px',
                  color: '#a8a8b0',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                }}
              >
                취소
              </button>
              {(() => {
                const selectedCount = [...bulkChecked].filter(no => !registeredDlvrNos.has(no)).length
                const canAct = selectedCount > 0 && !bulkImporting && !bulkLoading && !bulkDetailLoading
                return (
                  <>
                    <button
                      onClick={handleBulkImport}
                      disabled={!canAct}
                      className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                      style={{
                        background: canAct
                          ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                          : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                        border: '2px solid #6a5a40',
                        borderRadius: '6px',
                        color: '#f5d78e',
                        boxShadow: canAct ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
                        fontFamily: 'serif'
                      }}
                    >
                      {bulkImporting
                        ? <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />{bulkProgress.done}/{bulkProgress.total}건 등록 중</span>
                        : `⚔ 선택 건 등록${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                    </button>
                    <button
                      onClick={handleBulkDetailsFetch}
                      disabled={!canAct}
                      className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                      style={{
                        background: canAct
                          ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                          : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                        border: '2px solid #6a5a40',
                        borderRadius: '6px',
                        color: '#f5d78e',
                        boxShadow: canAct ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
                        fontFamily: 'serif'
                      }}
                      title="선택 건을 등록하고, 미연계 수기 자재의 검수 기록을 드래그앤드랍으로 이관합니다."
                    >
                      {bulkDetailLoading
                        ? <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />{bulkProgress.done}/{bulkProgress.total} 조회 중</span>
                        : `⚒ 등록 + 검수기록 이관${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                    </button>
                  </>
                )
              })()}
            </div>
            </>
            ) : (
              <BulkInspectionAssign
                leftRows={assignLeftRows}
                rightItems={assignRightItems}
                applying={bulkImporting}
                onBack={() => setBulkStep('list')}
                onApply={handleBulkAssignApply}
              />
            )}

            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900 flex-shrink-0" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
