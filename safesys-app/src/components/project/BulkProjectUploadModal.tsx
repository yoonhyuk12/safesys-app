'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { X, Upload, Download, ChevronRight, ChevronLeft, Check, AlertTriangle, Loader2, FileSpreadsheet, Search, MapPin, RotateCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createProject, type CreateProjectData } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS, PROJECT_CATEGORY_OPTIONS } from '@/lib/constants'

// ─── Types ───────────────────────────────────────────────────────────

interface BulkProjectUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

type Step = 'upload' | 'columns' | 'validate' | 'geocode' | 'progress' | 'done'

interface ColumnMapping {
  project_name: number | null
  managing_hq: number | null
  managing_branch: number | null
  site_address: number | null
  site_address_detail: number | null
  project_category: number | null
  total_budget: number | null
  supervisor_position: number | null
  supervisor_name: number | null
  supervisor_phone: number | null
}

interface RowData {
  rowIndex: number
  project_name: string
  managing_hq: string
  managing_branch: string
  site_address: string
  site_address_detail: string
  project_category: string
  total_budget: string
  supervisor_position: string
  supervisor_name: string
  supervisor_phone: string
  errors: string[]
  selected: boolean
  // Geocode
  latitude?: number
  longitude?: number
  geocodeStatus: 'pending' | 'searching' | 'success' | 'failed'
}

interface RegistrationResult {
  rowIndex: number
  project_name: string
  success: boolean
  error?: string
}

// ─── Constants ───────────────────────────────────────────────────────

const FIELD_DEFINITIONS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'project_name', label: '프로젝트명', required: true },
  { key: 'managing_hq', label: '본부', required: true },
  { key: 'managing_branch', label: '지사', required: true },
  { key: 'site_address', label: '현장주소', required: true },
  { key: 'site_address_detail', label: '상세주소', required: false },
  { key: 'project_category', label: '사업분류', required: false },
  { key: 'total_budget', label: '총사업비', required: false },
  { key: 'supervisor_position', label: '직급(감독)', required: false },
  { key: 'supervisor_name', label: '감독명', required: false },
  { key: 'supervisor_phone', label: '감독 연락처', required: false },
]

const FIELD_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  project_name: ['프로젝트명', '사업명', '현장명', '공사명', '프로젝트'],
  managing_hq: ['본부', '관리본부'],
  managing_branch: ['지사', '관리지사'],
  site_address: ['현장주소', '주소', '소재지', '현장위치'],
  site_address_detail: ['상세주소', '상세'],
  project_category: ['사업분류', '분류', '카테고리'],
  total_budget: ['총사업비', '사업비', '예산'],
  supervisor_position: ['직급', '감독직급'],
  supervisor_name: ['감독명', '감독자', '담당자명', '감독'],
  supervisor_phone: ['연락처', '전화번호', '감독연락처', '휴대폰'],
}

const TEMPLATE_HEADERS = ['프로젝트명', '본부', '지사', '현장주소', '상세주소', '사업분류', '총사업비', '직급', '감독명', '감독연락처']

// ─── Kakao Geocoding Helpers ────────────────────────────────────────

/** 주소 전처리: 괄호, 전화번호, 다중 공백 제거 */
function preprocessAddress(address: string): string {
  return address
    .trim()
    .replace(/\([^)]*\)/g, '')      // 괄호 및 내용 제거
    .replace(/（[^）]*）/g, '')      // 전각 괄호 제거
    .replace(/\d{2,4}-\d{3,4}-\d{4}/g, '') // 전화번호 제거
    .replace(/\s+/g, ' ')           // 다중 공백 → 하나
    .trim()
}

/** 상위 주소 생성 (뒤에서부터 단어 제거, 최소 2단어 유지) */
function generateParentAddresses(address: string): string[] {
  const parts = address.split(' ').filter(p => p.length > 0)
  const parents: string[] = []
  for (let i = parts.length - 1; i >= 2; i--) {
    const parent = parts.slice(0, i).join(' ')
    if (parent.length > 5) parents.push(parent)
  }
  return parents
}

/** 카카오맵 Geocoder로 주소 → 좌표 변환 (유사 주소 매칭 + 상위 주소 폴백) */
function kakaoGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const kakao = (window as any).kakao
  return new Promise((resolve) => {
    if (!kakao?.maps?.services) {
      resolve(null)
      return
    }

    const geocoder = new kakao.maps.services.Geocoder()
    const cleaned = preprocessAddress(address)

    if (!cleaned || cleaned.length < 3) {
      resolve(null)
      return
    }

    const isKoreaCoords = (lat: number, lng: number) => lat >= 33 && lat <= 43 && lng >= 124 && lng <= 132

    // 1차: SIMILAR 모드로 검색
    geocoder.addressSearch(cleaned, async (result: any[], status: any) => {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const lat = parseFloat(result[0].y)
        const lng = parseFloat(result[0].x)
        if (isKoreaCoords(lat, lng)) {
          resolve({ lat, lng })
          return
        }
      }

      // 2차: 상위 주소 축약 재시도
      const parentAddresses = generateParentAddresses(cleaned)
      for (const parentAddr of parentAddresses) {
        const parentResult = await new Promise<{ lat: number; lng: number } | null>((innerResolve) => {
          geocoder.addressSearch(parentAddr, (res: any[], st: any) => {
            if (st === kakao.maps.services.Status.OK && res.length > 0) {
              const lat = parseFloat(res[0].y)
              const lng = parseFloat(res[0].x)
              innerResolve(isKoreaCoords(lat, lng) ? { lat, lng } : null)
            } else {
              innerResolve(null)
            }
          })
        })
        if (parentResult) {
          resolve(parentResult)
          return
        }
        // API 안정성 딜레이
        await new Promise(r => setTimeout(r, 200))
      }

      resolve(null)
    }, {
      analyze_type: kakao.maps.services.AnalyzeType?.SIMILAR,
      size: 10,
    })
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────

function autoMatchColumns(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {
    project_name: null, managing_hq: null, managing_branch: null,
    site_address: null, site_address_detail: null, project_category: null,
    total_budget: null, supervisor_position: null, supervisor_name: null,
    supervisor_phone: null,
  }
  const usedIndices = new Set<number>()
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    const exactIdx = headers.findIndex((h, i) => !usedIndices.has(i) && keywords.includes(h.trim()))
    if (exactIdx !== -1) {
      result[field as keyof ColumnMapping] = exactIdx
      usedIndices.add(exactIdx)
      continue
    }
    const partialIdx = headers.findIndex((h, i) =>
      !usedIndices.has(i) && keywords.some(kw => h.trim().includes(kw))
    )
    if (partialIdx !== -1) {
      result[field as keyof ColumnMapping] = partialIdx
      usedIndices.add(partialIdx)
    }
  }
  return result
}

function cleanBudget(value: unknown): string {
  if (!value) return ''
  return String(value).replace(/[,\s]/g, '')
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '프로젝트목록')
  XLSX.writeFile(wb, '프로젝트_일괄등록_템플릿.xlsx')
}

/** 문자열 정규화: 공백, 가운뎃점(·), 쉼표 등 구분자 제거 후 비교용 문자열 반환 */
function normalize(s: string): string {
  return s.replace(/[\s·・,，.。\-_\/\\()（）]/g, '').trim()
}

/** 본부 퍼지 매칭: 정확 → 정규화 → 포함 순서 */
function matchHq(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  // 1) 정확 일치
  if ((HEADQUARTERS_OPTIONS as readonly string[]).includes(trimmed)) return trimmed
  // 2) 정규화 일치
  const normInput = normalize(trimmed)
  const found = HEADQUARTERS_OPTIONS.find(h => normalize(h) === normInput)
  if (found) return found
  // 3) 포함 매칭 (입력이 옵션에 포함되거나, 옵션이 입력에 포함)
  const partial = HEADQUARTERS_OPTIONS.find(h =>
    normalize(h).includes(normInput) || normInput.includes(normalize(h))
  )
  return partial || null
}

/** 지사 퍼지 매칭: 정확 → 정규화 → 접미어 '지사'/'본부' 추가 → 포함 순서 */
function matchBranch(input: string, hq: string): string | null {
  if (!input || !hq) return null
  const branches = BRANCH_OPTIONS[hq]
  if (!branches) return null
  const trimmed = input.trim()
  // 1) 정확 일치
  if (branches.includes(trimmed)) return trimmed
  // 2) 정규화 일치
  const normInput = normalize(trimmed)
  const found = branches.find(b => normalize(b) === normInput)
  if (found) return found
  // 3) 접미어 추가 시도 ('지사', '본부')
  for (const suffix of ['지사', '본부']) {
    const withSuffix = normInput.endsWith(suffix) ? normInput : normInput + suffix
    const match = branches.find(b => normalize(b) === withSuffix)
    if (match) return match
  }
  // 4) 포함 매칭 (가장 많이 겹치는 것 우선)
  const partial = branches.find(b =>
    normalize(b).includes(normInput) || normInput.includes(normalize(b))
  )
  return partial || null
}

function revalidateRow(row: RowData): string[] {
  const errors: string[] = []
  if (!row.project_name) errors.push('프로젝트명 누락')
  if (!row.managing_hq) errors.push('본부 누락')
  if (!row.managing_branch) errors.push('지사 누락')
  if (!row.site_address) errors.push('현장주소 누락')

  // 본부 퍼지 매칭
  if (row.managing_hq) {
    const matched = matchHq(row.managing_hq)
    if (matched) {
      row.managing_hq = matched
    } else {
      errors.push('본부 불일치')
    }
  }

  // 지사 퍼지 매칭
  if (row.managing_hq && row.managing_branch) {
    const branches = BRANCH_OPTIONS[row.managing_hq]
    if (!branches) {
      errors.push('지사 확인 불가')
    } else {
      const matched = matchBranch(row.managing_branch, row.managing_hq)
      if (matched) {
        row.managing_branch = matched
      } else {
        errors.push('지사 불일치')
      }
    }
  }
  return errors
}

// ─── Component ───────────────────────────────────────────────────────

export default function BulkProjectUploadModal({ isOpen, onClose, onComplete }: BulkProjectUploadModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const geocodeCacheRef = useRef<Record<string, { lat: number; lng: number } | null>>({})

  // Excel data
  const [fileName, setFileName] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawData, setRawData] = useState<unknown[][]>([])
  const workbookRef = useRef<XLSX.WorkBook | null>(null)

  // Column mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    project_name: null, managing_hq: null, managing_branch: null,
    site_address: null, site_address_detail: null, project_category: null,
    total_budget: null, supervisor_position: null, supervisor_name: null,
    supervisor_phone: null,
  })

  // Rows
  const [rows, setRows] = useState<RowData[]>([])

  // Geocoding
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geocodeProgress, setGeocodeProgress] = useState(0)

  // Progress
  const [isRegistering, setIsRegistering] = useState(false)
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [progressLog, setProgressLog] = useState<RegistrationResult[]>([])
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 })

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep('upload')
      setFileName('')
      setSheetNames([])
      setSelectedSheet('')
      setHeaders([])
      setRawData([])
      workbookRef.current = null
      setMapping({
        project_name: null, managing_hq: null, managing_branch: null,
        site_address: null, site_address_detail: null, project_category: null,
        total_budget: null, supervisor_position: null, supervisor_name: null,
        supervisor_phone: null,
      })
      setRows([])
      setIsGeocoding(false)
      setGeocodeProgress(0)
      setIsRegistering(false)
      setProgressCurrent(0)
      setProgressTotal(0)
      setProgressLog([])
      setResults({ success: 0, failed: 0 })
      geocodeCacheRef.current = {}
    }
  }, [isOpen])

  // ─── File handling ─────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      workbookRef.current = wb
      setFileName(file.name)
      setSheetNames(wb.SheetNames)
      setSelectedSheet(wb.SheetNames[0])
      parseSheet(wb, wb.SheetNames[0])
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    if (jsonData.length < 2) {
      alert('데이터가 없습니다. 1행은 헤더, 2행부터 데이터여야 합니다.')
      return
    }
    const headerRow = (jsonData[0] as unknown[]).map(h => String(h ?? ''))
    const dataRows = jsonData.slice(1).filter(row =>
      (row as unknown[]).some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '')
    )
    setHeaders(headerRow)
    setRawData(dataRows as unknown[][])
    const autoMap = autoMatchColumns(headerRow)
    setMapping(autoMap)
    setStep('columns')
  }

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName)
    if (workbookRef.current) {
      parseSheet(workbookRef.current, sheetName)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      processFile(file)
    } else {
      alert('.xlsx 또는 .xls 파일만 지원합니다.')
    }
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  // ─── Column mapping ────────────────────────────────────────────────

  const handleMappingChange = (field: keyof ColumnMapping, value: number | null) => {
    setMapping(prev => ({ ...prev, [field]: value }))
  }

  const requiredFieldsMapped = FIELD_DEFINITIONS
    .filter(f => f.required)
    .every(f => mapping[f.key] !== null)

  // ─── Build rows from raw data ──────────────────────────────────────

  const buildRows = useCallback(() => {
    const newRows: RowData[] = rawData.map((raw, idx) => {
      const row = raw as unknown[]
      const getValue = (field: keyof ColumnMapping): string => {
        const colIdx = mapping[field]
        if (colIdx === null || colIdx === undefined) return ''
        const val = row[colIdx]
        return val !== undefined && val !== null ? String(val).trim() : ''
      }

      const rowData: RowData = {
        rowIndex: idx + 2,
        project_name: getValue('project_name'),
        managing_hq: getValue('managing_hq'),
        managing_branch: getValue('managing_branch'),
        site_address: getValue('site_address'),
        site_address_detail: getValue('site_address_detail'),
        project_category: getValue('project_category'),
        total_budget: cleanBudget(getValue('total_budget')),
        supervisor_position: getValue('supervisor_position'),
        supervisor_name: getValue('supervisor_name'),
        supervisor_phone: getValue('supervisor_phone'),
        errors: [],
        selected: true,
        geocodeStatus: 'pending',
      }
      rowData.errors = revalidateRow(rowData)
      if (rowData.errors.length > 0) rowData.selected = false
      return rowData
    })

    setRows(newRows)
    setStep('validate')
  }, [rawData, mapping])

  // ─── Row field editing (validate step) ─────────────────────────────

  const updateRowField = (idx: number, field: keyof RowData, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: value }
      // When hq changes, reset branch if it doesn't match
      if (field === 'managing_hq') {
        const matchedHq = matchHq(value) || value
        updated.managing_hq = matchedHq
        const branches = BRANCH_OPTIONS[matchedHq]
        if (branches && !matchBranch(updated.managing_branch, matchedHq)) {
          updated.managing_branch = branches[0] || ''
        }
      }
      updated.errors = revalidateRow(updated)
      if (updated.errors.length === 0 && !r.selected) updated.selected = true
      if (updated.errors.length > 0) updated.selected = false
      return updated
    }))
  }

  // ─── Toggle selection ──────────────────────────────────────────────

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx && r.errors.length === 0 ? { ...r, selected: !r.selected } : r))
  }

  const toggleAll = () => {
    const validRows = rows.filter(r => r.errors.length === 0)
    const allSelected = validRows.length > 0 && validRows.every(r => r.selected)
    setRows(prev => prev.map(r => r.errors.length === 0 ? { ...r, selected: !allSelected } : r))
  }

  // ─── Geocoding (카카오맵 Geocoder) ─────────────────────────────────

  const geocodeSingleRow = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    const key = preprocessAddress(address)
    if (geocodeCacheRef.current[key] !== undefined) return geocodeCacheRef.current[key]
    const result = await kakaoGeocode(address)
    geocodeCacheRef.current[key] = result
    return result
  }

  const geocodeRow = async (idx: number): Promise<void> => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, geocodeStatus: 'searching', latitude: undefined, longitude: undefined } : r))
    try {
      const row = rows[idx]
      const result = await geocodeSingleRow(row.site_address)
      if (result) {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, geocodeStatus: 'success', latitude: result.lat, longitude: result.lng } : r))
      } else {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, geocodeStatus: 'failed' } : r))
      }
    } catch {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, geocodeStatus: 'failed' } : r))
    }
  }

  const startGeocoding = async () => {
    const selectedIndices = rows
      .map((r, i) => r.selected ? i : -1)
      .filter(i => i !== -1)

    if (selectedIndices.length === 0) return

    setStep('geocode')
    setIsGeocoding(true)
    setGeocodeProgress(0)

    // Mark all selected as searching
    setRows(prev => prev.map((r, i) =>
      selectedIndices.includes(i) ? { ...r, geocodeStatus: 'searching', latitude: undefined, longitude: undefined } : r
    ))

    // 순차 처리 (카카오 API rate limit 준수, 한 건씩)
    for (let i = 0; i < selectedIndices.length; i++) {
      const rowIdx = selectedIndices[i]
      const address = rows[rowIdx]?.site_address

      const result = await geocodeSingleRow(address)

      setRows(prev => {
        const next = [...prev]
        if (result) {
          next[rowIdx] = { ...next[rowIdx], geocodeStatus: 'success', latitude: result.lat, longitude: result.lng }
        } else {
          next[rowIdx] = { ...next[rowIdx], geocodeStatus: 'failed' }
        }
        return next
      })
      setGeocodeProgress(i + 1)

      // API 안정성 딜레이
      if (i < selectedIndices.length - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setIsGeocoding(false)
  }

  const retryFailedGeocoding = async () => {
    const failedIndices = rows
      .map((r, i) => r.selected && r.geocodeStatus === 'failed' ? i : -1)
      .filter(i => i !== -1)

    if (failedIndices.length === 0) return
    setIsGeocoding(true)

    setRows(prev => prev.map((r, i) =>
      failedIndices.includes(i) ? { ...r, geocodeStatus: 'searching' } : r
    ))

    // 실패 건은 캐시 제거 후 재시도
    for (const idx of failedIndices) {
      const key = preprocessAddress(rows[idx]?.site_address || '')
      delete geocodeCacheRef.current[key]
    }

    for (let i = 0; i < failedIndices.length; i++) {
      const rowIdx = failedIndices[i]
      const address = rows[rowIdx]?.site_address

      const result = await geocodeSingleRow(address)

      setRows(prev => {
        const next = [...prev]
        if (result) {
          next[rowIdx] = { ...next[rowIdx], geocodeStatus: 'success', latitude: result.lat, longitude: result.lng }
        } else {
          next[rowIdx] = { ...next[rowIdx], geocodeStatus: 'failed' }
        }
        return next
      })

      if (i < failedIndices.length - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setIsGeocoding(false)
  }

  // ─── Registration ──────────────────────────────────────────────────

  const startRegistration = async () => {
    const selectedRows = rows.filter(r => r.selected)
    if (selectedRows.length === 0) return

    setStep('progress')
    setIsRegistering(true)
    setProgressTotal(selectedRows.length)
    setProgressCurrent(0)
    setProgressLog([])

    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < selectedRows.length; i++) {
      const row = selectedRows[i]
      const data: CreateProjectData = {
        project_name: row.project_name,
        managing_hq: row.managing_hq,
        managing_branch: row.managing_branch,
        site_address: row.site_address,
        site_address_detail: row.site_address_detail || '',
        latitude: row.latitude,
        longitude: row.longitude,
        project_category: row.project_category || undefined,
        total_budget: row.total_budget || undefined,
        supervisor_position: row.supervisor_position || undefined,
        supervisor_name: row.supervisor_name || undefined,
        supervisor_phone: row.supervisor_phone || undefined,
      }

      const result = await createProject(data)
      const logEntry: RegistrationResult = {
        rowIndex: row.rowIndex,
        project_name: row.project_name,
        success: result.success,
        error: result.error,
      }

      if (result.success) successCount++
      else failedCount++

      setProgressCurrent(i + 1)
      setProgressLog(prev => [...prev, logEntry])
    }

    setResults({ success: successCount, failed: failedCount })
    setIsRegistering(false)
    setStep('done')
  }

  const handleDone = () => {
    onComplete()
    onClose()
  }

  if (!isOpen) return null

  // ─── Derived state ─────────────────────────────────────────────────

  const selectedRows = rows.filter(r => r.selected)
  const errorRows = rows.filter(r => r.errors.length > 0)
  const hqMismatchRows = rows.filter(r => r.selected && r.errors.some(e => e.includes('본부')))
  const branchMismatchRows = rows.filter(r => r.selected && r.errors.some(e => e.includes('지사')))
  const geocodeFailedRows = rows.filter(r => r.selected && r.geocodeStatus === 'failed')
  const geocodeSuccessRows = rows.filter(r => r.selected && r.geocodeStatus === 'success')
  const allSelectedGeocodeDone = selectedRows.length > 0 && selectedRows.every(r => r.geocodeStatus === 'success' || r.geocodeStatus === 'failed')
  const validateHasIssues = rows.some(r => r.errors.length > 0)
  const canProceedToGeocode = selectedRows.length > 0 && selectedRows.every(r => r.errors.length === 0)

  // ─── Step titles ───────────────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    upload: '프로젝트 일괄 등록',
    columns: '컬럼 매칭',
    validate: `데이터 검증 (${rows.length}건)`,
    geocode: `주소 검색 (${selectedRows.length}건)`,
    progress: '등록 중...',
    done: '등록 완료',
  }

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">{stepTitles[step]}</h2>
          </div>
          {step !== 'progress' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">

          {/* ═══ Step: Upload ═══════════════════════════════ */}
          {step === 'upload' && (
            <div className="space-y-4">
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">파일: {fileName}</span>
                  <select value={selectedSheet} onChange={e => handleSheetChange(e.target.value)} className="border rounded-md px-3 py-1.5 text-sm">
                    {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              )}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600 font-medium">엑셀 파일을 드래그하거나 클릭하여 선택</p>
                <p className="text-gray-400 text-sm mt-1">.xlsx, .xls 지원</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
              </div>
              <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
                <Download className="h-4 w-4" />
                템플릿 다운로드
              </button>
            </div>
          )}

          {/* ═══ Step: Column Mapping ══════════════════════ */}
          {step === 'columns' && (
            <div className="space-y-4">
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm text-gray-500">시트:</span>
                  <select value={selectedSheet} onChange={e => handleSheetChange(e.target.value)} className="border rounded-md px-3 py-1.5 text-sm">
                    {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              )}
              <p className="text-sm text-gray-600">엑셀 헤더를 각 필드에 매칭해주세요</p>
              <div className="space-y-3">
                {FIELD_DEFINITIONS.map(field => (
                  <div key={field.key} className="flex items-center gap-4">
                    <label className="w-32 text-sm font-medium text-gray-700 text-right">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={e => handleMappingChange(field.key, e.target.value === '' ? null : parseInt(e.target.value, 10))}
                      className={`flex-1 border rounded-md px-3 py-2 text-sm ${field.required && mapping[field.key] === null ? 'border-red-300' : 'border-gray-300'}`}
                    >
                      <option value="">매칭 안 함</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Step: Validate ════════════════════════════ */}
          {step === 'validate' && (
            <div className="space-y-3">
              {/* Summary */}
              {validateHasIssues && (
                <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 px-3 py-2 rounded-md">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {hqMismatchRows.length > 0 && `본부 불일치 ${hqMismatchRows.length}건`}
                    {hqMismatchRows.length > 0 && branchMismatchRows.length > 0 && ' / '}
                    {branchMismatchRows.length > 0 && `지사 불일치 ${branchMismatchRows.length}건`}
                    {(hqMismatchRows.length > 0 || branchMismatchRows.length > 0) && errorRows.length > hqMismatchRows.length + branchMismatchRows.length && ' / '}
                    {errorRows.filter(r => r.errors.some(e => e.includes('누락'))).length > 0 && `필수값 누락 ${errorRows.filter(r => r.errors.some(e => e.includes('누락'))).length}건`}
                    {' — 드롭다운으로 수정하세요'}
                  </span>
                </div>
              )}

              <div className="overflow-auto border rounded-lg max-h-[55vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">
                        <input type="checkbox" checked={selectedRows.length > 0 && rows.filter(r => r.errors.length === 0).every(r => r.selected)} onChange={toggleAll} className="rounded" />
                      </th>
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left min-w-[120px]">프로젝트명</th>
                      <th className="px-2 py-2 text-left min-w-[100px]">본부</th>
                      <th className="px-2 py-2 text-left min-w-[130px]">지사</th>
                      <th className="px-2 py-2 text-left min-w-[160px]">현장주소</th>
                      <th className="px-2 py-2 text-left w-16">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const hasError = row.errors.length > 0
                      const hqBad = row.errors.some(e => e.includes('본부'))
                      const branchBad = row.errors.some(e => e.includes('지사'))
                      return (
                        <tr key={idx} className={`border-t ${hasError ? 'bg-red-50' : ''}`}>
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={row.selected} onChange={() => toggleRow(idx)} disabled={hasError} className="rounded" />
                          </td>
                          <td className="px-2 py-1.5 text-gray-400 text-xs">{row.rowIndex}</td>
                          <td className="px-2 py-1.5 font-medium text-xs">{row.project_name || <span className="text-red-400 italic">누락</span>}</td>

                          {/* 본부 - dropdown if mismatched */}
                          <td className="px-2 py-1.5">
                            {hqBad || !row.managing_hq ? (
                              <select
                                value={row.managing_hq}
                                onChange={e => updateRowField(idx, 'managing_hq', e.target.value)}
                                className="w-full border border-red-300 rounded px-1 py-0.5 text-xs bg-red-50"
                              >
                                <option value="">선택</option>
                                {HEADQUARTERS_OPTIONS.map(hq => <option key={hq} value={hq}>{hq}</option>)}
                              </select>
                            ) : (
                              <span className="text-xs">{row.managing_hq}</span>
                            )}
                          </td>

                          {/* 지사 - dropdown if mismatched */}
                          <td className="px-2 py-1.5">
                            {branchBad || !row.managing_branch ? (
                              <select
                                value={row.managing_branch}
                                onChange={e => updateRowField(idx, 'managing_branch', e.target.value)}
                                className="w-full border border-red-300 rounded px-1 py-0.5 text-xs bg-red-50"
                              >
                                <option value="">선택</option>
                                {(BRANCH_OPTIONS[row.managing_hq] || []).map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            ) : (
                              <span className="text-xs">{row.managing_branch}</span>
                            )}
                          </td>

                          <td className="px-2 py-1.5 text-xs max-w-[200px] truncate">{row.site_address || <span className="text-red-400 italic">누락</span>}</td>
                          <td className="px-2 py-1.5">
                            {hasError ? (
                              <span className="text-red-600 text-xs" title={row.errors.join(', ')}>오류</span>
                            ) : (
                              <span className="text-green-600 text-xs">정상</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ Step: Geocode ═════════════════════════════ */}
          {step === 'geocode' && (
            <div className="space-y-3">
              {/* Progress bar during geocoding */}
              {isGeocoding && (
                <div className="space-y-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${selectedRows.length > 0 ? (geocodeProgress / selectedRows.length) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 text-center">주소 검색 중... {geocodeProgress}/{selectedRows.length}</p>
                </div>
              )}

              {/* Summary */}
              {!isGeocoding && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600 flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> 좌표 확인: {geocodeSuccessRows.length}건
                  </span>
                  {geocodeFailedRows.length > 0 && (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> 검색 실패: {geocodeFailedRows.length}건
                    </span>
                  )}
                  {geocodeFailedRows.length > 0 && (
                    <button
                      onClick={retryFailedGeocoding}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 ml-auto"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      실패 전체 재검색
                    </button>
                  )}
                </div>
              )}

              <div className="overflow-auto border rounded-lg max-h-[55vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left">프로젝트명</th>
                      <th className="px-2 py-2 text-left min-w-[250px]">현장주소</th>
                      <th className="px-2 py-2 text-left w-24">좌표</th>
                      <th className="px-2 py-2 text-left w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => r.selected).map(row => {
                      const idx = rows.indexOf(row)
                      const isFailed = row.geocodeStatus === 'failed'
                      const isSearching = row.geocodeStatus === 'searching'
                      return (
                        <tr key={idx} className={`border-t ${isFailed ? 'bg-red-50' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-400 text-xs">{row.rowIndex}</td>
                          <td className="px-2 py-1.5 text-xs font-medium">{row.project_name}</td>
                          <td className="px-2 py-1.5">
                            {isFailed ? (
                              <input
                                type="text"
                                value={row.site_address}
                                onChange={e => {
                                  const val = e.target.value
                                  setRows(prev => prev.map((r, i) => i === idx ? { ...r, site_address: val, geocodeStatus: 'failed' } : r))
                                }}
                                className="w-full border border-red-300 rounded px-2 py-1 text-xs bg-red-50"
                              />
                            ) : (
                              <span className="text-xs">{row.site_address}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-xs">
                            {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
                            {row.geocodeStatus === 'success' && (
                              <span className="text-green-600" title={`${row.latitude}, ${row.longitude}`}>확인</span>
                            )}
                            {isFailed && <span className="text-red-500">실패</span>}
                            {row.geocodeStatus === 'pending' && <span className="text-gray-400">대기</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {isFailed && !isGeocoding && (
                              <button
                                onClick={() => geocodeRow(idx)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              >
                                <Search className="h-3 w-3" />
                                재검색
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ Step: Progress ════════════════════════════ */}
          {step === 'progress' && (
            <div className="space-y-4">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0}%` }} />
              </div>
              <p className="text-sm text-gray-600 text-center">{progressCurrent} / {progressTotal}</p>
              <div className="max-h-60 overflow-auto space-y-1 text-sm">
                {progressLog.map((log, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {log.success ? <Check className="h-4 w-4 text-green-600 flex-shrink-0" /> : <X className="h-4 w-4 text-red-600 flex-shrink-0" />}
                    <span>{log.project_name}</span>
                    {!log.success && <span className="text-red-600 text-xs">{log.error}</span>}
                  </div>
                ))}
                {isRegistering && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span>처리 중...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ Step: Done ════════════════════════════════ */}
          {step === 'done' && (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-2">
                <p className="text-lg"><span className="text-green-600 font-semibold">성공: {results.success}건</span></p>
                {results.failed > 0 && <p className="text-red-600 font-semibold">실패: {results.failed}건</p>}
              </div>

              {/* 실패 상세 목록 */}
              {progressLog.some(l => !l.success) && (
                <div className="border border-red-200 rounded-lg bg-red-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-red-800">실패 내역</p>
                    <button
                      onClick={() => {
                        const failedLogs = progressLog.filter(l => !l.success)
                        const excelRows = failedLogs.map(log => {
                          const row = rows.find(r => r.rowIndex === log.rowIndex)
                          return {
                            '원본행': log.rowIndex,
                            '프로젝트명': log.project_name,
                            '본부': row?.managing_hq || '',
                            '지사': row?.managing_branch || '',
                            '현장주소': row?.site_address || '',
                            '상세주소': row?.site_address_detail || '',
                            '사업분류': row?.project_category || '',
                            '총사업비': row?.total_budget || '',
                            '감독명': row?.supervisor_name || '',
                            '감독연락처': row?.supervisor_phone || '',
                            '실패사유': log.error || '알 수 없음',
                          }
                        })
                        const ws = XLSX.utils.json_to_sheet(excelRows)
                        const wb = XLSX.utils.book_new()
                        XLSX.utils.book_append_sheet(wb, ws, '실패목록')
                        XLSX.writeFile(wb, `프로젝트_등록실패_${new Date().toISOString().slice(0, 10)}.xlsx`)
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-white border border-red-300 rounded hover:bg-red-100 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      실패목록 다운로드
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto space-y-1">
                    {progressLog.filter(l => !l.success).map((log, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-gray-800">[{log.rowIndex}행] {log.project_name}</span>
                          {log.error && <span className="text-red-600 ml-1">— {log.error}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 성공 목록 (접을 수 있게) */}
              {progressLog.some(l => l.success) && (
                <details className="border border-green-200 rounded-lg bg-green-50 p-3">
                  <summary className="text-sm font-medium text-green-800 cursor-pointer">성공 내역 ({results.success}건)</summary>
                  <div className="max-h-48 overflow-auto space-y-1 mt-2">
                    {progressLog.filter(l => l.success).map((log, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="text-gray-700">[{log.rowIndex}행] {log.project_name}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div>
            {step === 'columns' && (
              <button onClick={() => setStep('upload')} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                <ChevronLeft className="h-4 w-4" /> 이전
              </button>
            )}
            {step === 'validate' && (
              <button onClick={() => setStep('columns')} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                <ChevronLeft className="h-4 w-4" /> 이전
              </button>
            )}
            {step === 'geocode' && !isGeocoding && (
              <button onClick={() => setStep('validate')} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                <ChevronLeft className="h-4 w-4" /> 이전
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 'upload' && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
            )}

            {step === 'columns' && (
              <button
                onClick={buildRows}
                disabled={!requiredFieldsMapped}
                className={`flex items-center gap-1 px-4 py-2 text-sm rounded-md ${requiredFieldsMapped ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                다음 <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {step === 'validate' && (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
                <button
                  onClick={startGeocoding}
                  disabled={!canProceedToGeocode}
                  className={`flex items-center gap-1 px-4 py-2 text-sm rounded-md ${canProceedToGeocode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                >
                  <Search className="h-4 w-4" />
                  주소 검색 ({selectedRows.length}건)
                </button>
              </>
            )}

            {step === 'geocode' && (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800" disabled={isGeocoding}>취소</button>
                <button
                  onClick={startRegistration}
                  disabled={isGeocoding || !allSelectedGeocodeDone}
                  className={`px-4 py-2 text-sm rounded-md ${!isGeocoding && allSelectedGeocodeDone ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                >
                  일괄 등록 ({selectedRows.length}건)
                </button>
              </>
            )}

            {step === 'done' && (
              <button onClick={handleDone} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">확인</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
