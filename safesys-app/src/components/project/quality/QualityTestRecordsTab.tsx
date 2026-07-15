'use client'

// 품질검사 실시대장 탭 (별지 제42호서식) — 대장 행 목록·작성·수정·삭제·엑셀 출력
// 한 제출건(일련번호)에 시험·검사 종목을 여러 건 등록하고 감독 서명은 목록에서 선택해 입력한다.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus,
  Printer,
  X,
  Trash2,
  FileText,
  FileDown,
  Upload,
  Image as ImageIcon,
  PenTool,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Building2,
  BadgeCheck,
  ArrowRight,
  History,
  Mountain,
  ListChecks,
  Hammer,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import { downloadQualityTestLedgerExcel } from '@/lib/excel/quality-test-ledger-export'
import { downloadQualityTestPhotoReport } from '@/lib/reports/quality-test-photo-report'
import {
  QualityTestRecord,
  QualityTestItemFields,
  QualityTestCommonFields,
  TestVerdict,
  TEST_CATEGORY_OPTIONS,
  createEmptyQualityTestItem,
  createEmptyQualityTestCommon,
} from '@/lib/quality/quality-test-types'

interface QualityTestRecordsTabProps {
  projectId: string
  userId: string
  canDeleteQualityRecords: boolean
  canSignQualityRecords: boolean
  projectName: string
  supervisorName?: string
}

// 실시대장 폼에서 고를 수 있는 소속 총괄표 옵션
interface SummaryOption {
  id: string
  report_date: string | null
  writer_name: string | null
  created_at: string
}

type SignatureField = 'quality_engineer_signature'
type FormItem = QualityTestItemFields & {
  test_date: QualityTestCommonFields['test_date']
  _key: string
  _id?: string
}
type FormItemField = keyof QualityTestItemFields | 'test_date'
type ConcretePresetMode = 'standard' | 'schmidt'

interface ConcretePreset {
  label: string
  aggregate: number
  strength: number
  slump: number
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const TEST_CATEGORY_DEFINITIONS: Record<string, string> = {
  '자체(관리)시험': '시공자가 현장 시험실이나 이동 장비를 활용해 직접 수행하는 시험입니다.',
  '의뢰(수탁)시험':
    '현장에서 하기 어려운 시험을 공인 품질검사 전문기관에 의뢰하는 시험입니다.',
  확인시험:
    '기존 시험 결과를 검증하기 위해 발주자·공사감독자가 직접 하거나 전문기관에 의뢰하는 시험입니다.',
}

const TEST_CATEGORY_CARD_STYLES = [
  {
    icon: FlaskConical,
    card: 'border-amber-200 hover:border-amber-400 hover:shadow-amber-100',
    iconBox: 'bg-amber-100 text-amber-700',
    number: 'bg-amber-50 text-amber-700',
    action: 'text-amber-700',
  },
  {
    icon: Building2,
    card: 'border-sky-200 hover:border-sky-400 hover:shadow-sky-100',
    iconBox: 'bg-sky-100 text-sky-700',
    number: 'bg-sky-50 text-sky-700',
    action: 'text-sky-700',
  },
  {
    icon: BadgeCheck,
    card: 'border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-100',
    iconBox: 'bg-emerald-100 text-emerald-700',
    number: 'bg-emerald-50 text-emerald-700',
    action: 'text-emerald-700',
  },
]

const VERDICT_OPTIONS: TestVerdict[] = ['합격', '불합격', '재시험']
const COMPRESSION_STRENGTH_TEST_ITEM = '압축강도'

const isCompressionStrengthTest = (testItem: string) => testItem.trim() === COMPRESSION_STRENGTH_TEST_ITEM

const getTodayDateString = () => {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

const formatShortDate = (date: string | null) => {
  if (!date) return '-'
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(2) : date
}

const getCompressionStrengthTestDate = (
  baseDate: QualityTestCommonFields['test_date']
): QualityTestCommonFields['test_date'] => {
  if (!baseDate) return null

  const [year, month, day] = baseDate.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + 28))
  return result.toISOString().slice(0, 10)
}

const CONCRETE_PRESETS: ConcretePreset[] = [
  { label: '콘크리트(25-24-80)', aggregate: 25, strength: 24, slump: 80 },
  { label: '콘크리트(25-24-120)', aggregate: 25, strength: 24, slump: 120 },
  { label: '콘크리트(25-24-150)', aggregate: 25, strength: 24, slump: 150 },
  { label: '콘크리트(25-27-80)', aggregate: 25, strength: 27, slump: 80 },
  { label: '콘크리트(25-27-120)', aggregate: 25, strength: 27, slump: 120 },
  { label: '콘크리트(25-27-150)', aggregate: 25, strength: 27, slump: 150 },
  { label: '콘크리트(25-30-80)', aggregate: 25, strength: 30, slump: 80 },
  { label: '콘크리트(25-30-120)', aggregate: 25, strength: 30, slump: 120 },
  { label: '콘크리트(25-30-150)', aggregate: 25, strength: 30, slump: 150 },
]

export default function QualityTestRecordsTab({
  projectId,
  userId,
  canDeleteQualityRecords,
  canSignQualityRecords,
  projectName,
  supervisorName = '',
}: QualityTestRecordsTabProps) {
  const [records, setRecords] = useState<QualityTestRecord[]>([])
  const [summaries, setSummaries] = useState<SummaryOption[]>([])
  const [selectedSummaryId, setSelectedSummaryId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [isListExpanded, setIsListExpanded] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [commonData, setCommonData] = useState<QualityTestCommonFields | null>(null)
  const [items, setItems] = useState<FormItem[]>([])
  const [showMaterialPresets, setShowMaterialPresets] = useState(false)
  const [concretePresetMode, setConcretePresetMode] = useState<ConcretePresetMode>('standard')
  const [copySourceSerialNo, setCopySourceSerialNo] = useState('')
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [ledgerDownloading, setLedgerDownloading] = useState(false)
  const [photoReportDownloading, setPhotoReportDownloading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [activeSign, setActiveSign] = useState<SignatureField | null>(null)
  const [showTestCategorySelector, setShowTestCategorySelector] = useState(false)
  const [isSupervisorSignMode, setIsSupervisorSignMode] = useState(false)
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(() => new Set())
  const [showSupervisorSignature, setShowSupervisorSignature] = useState(false)
  const [supervisorSigning, setSupervisorSigning] = useState(false)
  const nextKeyRef = useRef(0)
  const newKey = () => String(nextKeyRef.current++)

  // 같은 일련번호(제출건)의 항목들이 항상 붙어 보이도록 일련번호 오름차순으로 로드
  // (test_date로 정렬하면 기존 제출건에 항목을 나중에 추가할 때 created_at이 최신이라 그룹이 흩어짐)
  const loadRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('quality_test_records')
      .select('*')
      .eq('project_id', projectId)
      .order('serial_no', { ascending: true })
      .order('created_at', { ascending: true })
    if (!error && data) setRecords(data as QualityTestRecord[])
    setLoading(false)
  }, [projectId])

  // 소속 총괄표 목록 — 생성순(created_at 오름차순)으로 로드, 마지막이 최신 총괄표
  const loadSummaries = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('quality_summary_reports')
      .select('id, report_date, writer_name, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (!error && data) setSummaries(data as SummaryOption[])
  }, [projectId])

  useEffect(() => {
    loadRecords()
    loadSummaries()
  }, [loadRecords, loadSummaries])

  useEffect(() => {
    if (!showTestCategorySelector) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTestCategorySelector(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [showTestCategorySelector])

  const computeNextSerialNo = () => records.reduce((max, r) => Math.max(max, r.serial_no || 0), 0) + 1
  const availablePreviousSerialNos = Array.from(
    new Set(
      records.flatMap((record) => {
        const upperLimit = editingSerialNo ?? Number.POSITIVE_INFINITY
        return record.serial_no !== null && record.serial_no < upperLimit ? [record.serial_no] : []
      })
    )
  ).sort((a, b) => b - a)
  const selectedCopySerialNo = availablePreviousSerialNos.includes(Number(copySourceSerialNo))
    ? Number(copySourceSerialNo)
    : availablePreviousSerialNos[0] ?? null

  const resetForm = () => {
    setIsListExpanded(true)
    setShowForm(false)
    setCommonData(null)
    setItems([])
    setShowMaterialPresets(false)
    setCopySourceSerialNo('')
    setEditingSerialNo(null)
    setSelectedSummaryId('')
  }

  const handleAddClick = () => {
    setShowTestCategorySelector(true)
  }

  const handleTestCategorySelect = (testCategory: QualityTestCommonFields['test_category']) => {
    // 직전 제출건의 품질관리기술인 성명·서명을 기본값으로 이어받아 반복 입력을 줄인다.
    // 건설사업관리기술인 성명은 프로젝트 감독자 이름을 우선 기본값으로 사용한다.
    const last = records[records.length - 1]
    const supervisionName = supervisorName || last?.supervision_engineer_name || ''

    // 총괄표가 있으면 최신 항목을 기본 선택하고, 없으면 미지정으로 저장한다.
    setSelectedSummaryId(summaries.length === 0 ? '' : summaries[summaries.length - 1].id)
    setEditingSerialNo(null)
    setShowMaterialPresets(false)
    setCopySourceSerialNo('')
    const initialCommonData = createEmptyQualityTestCommon({
      test_category: testCategory,
      test_place: '현장시험실',
      quality_engineer_name: last?.quality_engineer_name || '',
      quality_engineer_signature: last?.quality_engineer_signature || '',
      supervision_engineer_name: supervisionName,
      supervision_engineer_signature: '',
    })
    setCommonData(initialCommonData)
    setItems([
      {
        ...createEmptyQualityTestItem(),
        test_date: initialCommonData.test_date,
        _key: newKey(),
      },
    ])
    setShowTestCategorySelector(false)
    setIsListExpanded(false)
    setShowForm(true)
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        ...createEmptyQualityTestItem(),
        test_date: commonData?.test_date ?? null,
        _key: newKey(),
      },
    ])
  }

  const handleRemoveItem = (itemKey: string) => {
    setItems((prev) => prev.filter((it) => it._key !== itemKey))
  }

  const handleApplyTestPreset = (
    targetMaterial: string,
    workType: string,
    presetDescription: string,
    presetTests: Array<{ test_item: string; test_standard: string }>
  ) => {
    if (!commonData) return

    const hasEnteredTestContent = items.some(
      (item) => item.test_item.trim() || item.test_standard.trim() || item.test_result.trim()
    )
    if (hasEnteredTestContent && !confirm(`현재 입력한 시험 항목을 ${presetDescription}으로 교체할까요?`)) {
      return
    }

    setCommonData({ ...commonData, target_material: targetMaterial, work_type: workType })
    setItems(
      presetTests.map((test) => ({
        ...createEmptyQualityTestItem(test),
        test_date: isCompressionStrengthTest(test.test_item)
          ? getCompressionStrengthTestDate(commonData.test_date)
          : commonData.test_date,
        _key: newKey(),
      }))
    )
    setShowMaterialPresets(false)
  }

  const handleApplyConcretePreset = (preset: ConcretePreset, mode: ConcretePresetMode = 'standard') => {
    const presetTests =
      mode === 'schmidt'
        ? [{ test_item: '슈미트해머', test_standard: `${preset.strength} 이상` }]
        : [
            { test_item: '슬럼프', test_standard: `${preset.slump}±25` },
            { test_item: '공기량', test_standard: '4.5±1.5' },
            { test_item: '염화물', test_standard: '0.3 이하' },
            { test_item: '단위수량', test_standard: '시방배합±20' },
            { test_item: '압축강도', test_standard: `${preset.strength} 이상` },
          ]

    handleApplyTestPreset(
      preset.label,
      '레미콘',
      mode === 'schmidt' ? '슈미트해머 1개 항목' : '콘크리트 프리셋 5개 항목',
      presetTests
    )
  }

  const handleApplyEarthworkPreset = () => {
    handleApplyTestPreset('되메우기', '토공', '되메우기 프리셋 2개 항목', [
      { test_item: '함수비', test_standard: '±2.0%' },
      { test_item: '현장밀도', test_standard: '90% 이상' },
    ])
  }

  const handleCopyPreviousRecord = () => {
    if (!commonData) return
    if (selectedCopySerialNo === null) {
      alert('불러올 이전 일련번호 기록이 없습니다.')
      return
    }

    const previousRecords = records
      .filter((record) => record.serial_no === selectedCopySerialNo)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const first = previousRecords[0]
    if (!first) {
      alert('이전 일련번호 기록을 찾을 수 없습니다.')
      return
    }

    const hasEnteredContent =
      Boolean(commonData.target_material.trim()) ||
      items.some((item) => item.test_item.trim() || item.test_standard.trim() || item.test_result.trim())
    if (hasEnteredContent && !confirm(`현재 입력 내용을 ${selectedCopySerialNo}번 기록으로 교체할까요?`)) {
      return
    }

    const today = getTodayDateString()
    setCommonData({
      test_date: today,
      test_category: first.test_category,
      work_type: first.work_type,
      target_material: first.target_material,
      supplier_factory: first.supplier_factory,
      test_place: first.test_place,
      photo_url: '',
      quality_engineer_name: first.quality_engineer_name,
      quality_engineer_signature: first.quality_engineer_signature,
      supervision_engineer_name: supervisorName || first.supervision_engineer_name,
      supervision_engineer_signature: '',
      note: first.note,
    })
    setItems(
      previousRecords.map((record) => ({
        test_date: isCompressionStrengthTest(record.test_item)
          ? getCompressionStrengthTestDate(today)
          : today,
        test_item: record.test_item,
        test_standard: record.test_standard,
        test_result: record.test_result,
        result_verdict: record.result_verdict,
        _key: newKey(),
      }))
    )
    setShowMaterialPresets(false)
  }

  const handleSelectRecord = (record: QualityTestRecord) => {
    const group = records
      .filter((r) => r.serial_no === record.serial_no)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const first = group[0] ?? record

    // 제출건의 현재 소속 총괄표를 기본값으로 — 레거시(미지정) 기록은 ''
    setSelectedSummaryId(first.summary_id ?? '')
    setShowMaterialPresets(false)
    setCopySourceSerialNo('')
    setCommonData({
      test_date: first.test_date,
      test_category: first.test_category,
      work_type: first.work_type,
      target_material: first.target_material,
      supplier_factory: first.supplier_factory,
      test_place: first.test_place,
      photo_url: first.photo_url || '',
      quality_engineer_name: first.quality_engineer_name,
      quality_engineer_signature: first.quality_engineer_signature,
      supervision_engineer_name: first.supervision_engineer_name,
      supervision_engineer_signature: first.supervision_engineer_signature,
      note: first.note,
    })
    setItems(
      group.map((r) => ({
        test_date: r.test_date,
        test_item: r.test_item,
        test_standard: r.test_standard,
        test_result: r.test_result,
        result_verdict: r.result_verdict,
        _id: r.id,
        _key: newKey(),
      }))
    )
    setEditingSerialNo(record.serial_no)
    setIsListExpanded(false)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!commonData) return
    if (items.length === 0) {
      alert('시험·검사 항목을 1개 이상 추가해주세요.')
      return
    }

    const commonRequiredFields: Array<{ missing: boolean; message: string }> = [
      {
        missing: !commonData.quality_engineer_name.trim(),
        message: '품질관리기술인 이름을 입력해주세요.',
      },
      {
        missing: !commonData.quality_engineer_signature.trim(),
        message: '품질관리기술인 서명을 입력해주세요.',
      },
      { missing: !commonData.test_date, message: '연월일을 입력해주세요.' },
      { missing: !commonData.test_category.trim(), message: '시험·검사구분을 선택해주세요.' },
      { missing: !commonData.target_material.trim(), message: '품질검사 대상 재료를 입력해주세요.' },
      { missing: !commonData.work_type.trim(), message: '공종을 입력해주세요.' },
      { missing: !commonData.supplier_factory.trim(), message: '공급받은 공장을 입력해주세요.' },
      { missing: !commonData.test_place.trim(), message: '시험·검사 장소를 입력해주세요.' },
      { missing: !commonData.photo_url.trim(), message: '사진을 추가해주세요.' },
    ]
    const missingCommonField = commonRequiredFields.find((field) => field.missing)
    if (missingCommonField) {
      alert(missingCommonField.message)
      return
    }

    for (const [index, item] of items.entries()) {
      const itemNumber = index + 1
      if (!item.test_date) {
        alert(`항목 ${itemNumber}의 연월일을 입력해주세요.`)
        return
      }
      if (!item.test_item.trim()) {
        alert(`항목 ${itemNumber}의 시험·검사 종목을 입력해주세요.`)
        return
      }
      if (!item.test_standard.trim()) {
        alert(`항목 ${itemNumber}의 시험 기준을 입력해주세요.`)
        return
      }
      if (!item.test_result.trim()) {
        alert(`항목 ${itemNumber}의 시험 결과를 입력해주세요.`)
        return
      }
      if (!item.result_verdict) {
        alert(`항목 ${itemNumber}의 시험 결과 판정을 선택해주세요.`)
        return
      }
    }

    // RLS상 수정은 작성자 본인만 가능 — 사전에 명확히 안내
    if (editingSerialNo !== null) {
      const group = records.filter((r) => r.serial_no === editingSerialNo)
      if (group.some((r) => r.created_by !== userId)) {
        alert('작성자 본인만 수정할 수 있습니다.')
        return
      }
    }

    setSaving(true)
    try {
      const serialNo = editingSerialNo ?? computeNextSerialNo()
      const original = editingSerialNo !== null ? records.filter((r) => r.serial_no === editingSerialNo) : []
      const keptIds = new Set(items.filter((it) => it._id).map((it) => it._id as string))
      const toDelete = original.filter((r) => !keptIds.has(r.id))

      const summaryId: string | null = selectedSummaryId === '' ? null : selectedSummaryId

      for (const it of items) {
        const rowData = {
          test_date: it.test_date,
          test_category: commonData.test_category,
          work_type: commonData.work_type,
          target_material: commonData.target_material,
          supplier_factory: commonData.supplier_factory,
          test_place: commonData.test_place,
          photo_url: commonData.photo_url,
          quality_engineer_name: commonData.quality_engineer_name,
          quality_engineer_signature: commonData.quality_engineer_signature,
          note: commonData.note,
          summary_id: summaryId,
          test_item: it.test_item,
          test_standard: it.test_standard,
          test_result: it.test_result,
          result_verdict: it.result_verdict,
          serial_no: serialNo,
          project_id: projectId,
          updated_at: new Date().toISOString(),
        }
        if (it._id) {
          const { error } = await (supabase as any).from('quality_test_records').update(rowData).eq('id', it._id)
          if (error) throw error
        } else {
          const { error } = await (supabase as any)
            .from('quality_test_records')
            .insert([{
              ...rowData,
              supervision_engineer_name: commonData.supervision_engineer_name,
              supervision_engineer_signature: '',
              created_by: userId,
            }])
          if (error) throw error
        }
      }

      if (toDelete.length > 0) {
        const { error } = await (supabase as any)
          .from('quality_test_records')
          .delete()
          .in('id', toDelete.map((r) => r.id))
        if (error) throw error
      }

      resetForm()
      loadRecords()
      loadSummaries()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: QualityTestRecord) => {
    if (!confirm('정말 삭제하시겠습니까? (같은 일련번호의 모든 항목이 함께 삭제됩니다)')) return

    if (!canDeleteQualityRecords) {
      alert('프로젝트 소유자 또는 발주청만 삭제할 수 있습니다.')
      return
    }

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (sessionError || !accessToken) {
        throw new Error('로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.')
      }

      const response = await fetch(
        `/api/projects/${projectId}/quality-test-records/${record.id}/delete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      const result = (await response.json()) as {
        success?: boolean
        error?: string
        renumberedSerialNos?: Array<{ currentSerialNo: number; nextSerialNo: number }>
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || '삭제에 실패했습니다.')
      }

      const renumberPlan = result.renumberedSerialNos ?? []

      if (editingSerialNo === record.serial_no) {
        resetForm()
      } else {
        const editingRenumber = renumberPlan.find(({ currentSerialNo }) => currentSerialNo === editingSerialNo)
        if (editingRenumber) setEditingSerialNo(editingRenumber.nextSerialNo)
      }
      await loadRecords()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('삭제 실패: ' + message)
      await loadRecords()
    }
  }

  const handleLedgerDownload = async () => {
    setLedgerDownloading(true)
    try {
      await downloadQualityTestLedgerExcel(records, projectName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setLedgerDownloading(false)
    }
  }

  const handlePhotoReportDownload = async () => {
    setPhotoReportDownloading(true)
    try {
      await downloadQualityTestPhotoReport(records, projectName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('사진대지 생성 실패: ' + message)
    } finally {
      setPhotoReportDownloading(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from('quality-test-photos').upload(fileName, file)
      if (error) throw error
      const { data: urlData } = supabase.storage.from('quality-test-photos').getPublicUrl(data.path)
      setCommon('photo_url', urlData.publicUrl)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('사진 업로드 실패: ' + message)
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  const handleRemovePhoto = async () => {
    const photoUrl = commonData?.photo_url
    if (!photoUrl) return
    const path = photoUrl.split('/quality-test-photos/')[1]
    if (path) await supabase.storage.from('quality-test-photos').remove([decodeURIComponent(path)])
    setCommon('photo_url', '')
  }

  const setCommon = <K extends keyof QualityTestCommonFields>(key: K, value: QualityTestCommonFields[K]) => {
    setCommonData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleCommonTestDateChange = (testDate: QualityTestCommonFields['test_date']) => {
    const previousTestDate = commonData?.test_date ?? null
    setCommon('test_date', testDate)
    setItems((prev) =>
      prev.map((item) => {
        const isCompressionStrength = isCompressionStrengthTest(item.test_item)
        const previousDefaultDate = isCompressionStrength
          ? getCompressionStrengthTestDate(previousTestDate)
          : previousTestDate

        if (item.test_date && item.test_date !== previousDefaultDate) return item

        return {
          ...item,
          test_date: isCompressionStrength ? getCompressionStrengthTestDate(testDate) : testDate,
        }
      })
    )
  }

  const handleTestItemChange = (itemKey: string, testItem: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item._key !== itemKey) return item

        const wasCompressionStrength = isCompressionStrengthTest(item.test_item)
        const isCompressionStrength = isCompressionStrengthTest(testItem)
        const baseDate = commonData?.test_date ?? null
        let testDate = item.test_date

        if (!wasCompressionStrength && isCompressionStrength && (!testDate || testDate === baseDate)) {
          testDate = getCompressionStrengthTestDate(baseDate)
        } else if (
          wasCompressionStrength &&
          !isCompressionStrength &&
          testDate === getCompressionStrengthTestDate(baseDate)
        ) {
          testDate = baseDate
        }

        return { ...item, test_item: testItem, test_date: testDate }
      })
    )
  }

  const setItemField = <K extends FormItemField>(itemKey: string, field: K, value: FormItem[K]) => {
    setItems((prev) => prev.map((it) => (it._key === itemKey ? { ...it, [field]: value } : it)))
  }

  const selectableRecordIds = records.map((record) => record.id)
  const allRecordsSelected =
    selectableRecordIds.length > 0 && selectableRecordIds.every((id) => selectedRecordIds.has(id))

  const startSupervisorSignMode = () => {
    setIsListExpanded(true)
    setSelectedRecordIds(new Set())
    setIsSupervisorSignMode(true)
  }

  const closeSupervisorSignMode = () => {
    setShowSupervisorSignature(false)
    setSelectedRecordIds(new Set())
    setIsSupervisorSignMode(false)
  }

  const toggleRecordSelection = (record: QualityTestRecord) => {
    setSelectedRecordIds((previous) => {
      const next = new Set(previous)
      if (next.has(record.id)) next.delete(record.id)
      else next.add(record.id)
      return next
    })
  }

  const toggleAllRecords = () => {
    setSelectedRecordIds(allRecordsSelected ? new Set() : new Set(selectableRecordIds))
  }

  const handleSupervisorSignatureSave = async (signatureData: string) => {
    if (selectedRecordIds.size === 0) return

    setSupervisorSigning(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (sessionError || !accessToken) {
        throw new Error('로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.')
      }

      const response = await fetch('/api/bulk-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          project_id: projectId,
          signature_data: signatureData,
          signer: 'supervisor',
          replace_existing: true,
          items: { quality_test_record: Array.from(selectedRecordIds) },
        }),
      })
      const result = (await response.json()) as {
        success?: boolean
        error?: string
        updated_total?: number
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || '감독 서명 저장에 실패했습니다.')
      }

      const updatedCount = result.updated_total ?? 0
      closeSupervisorSignMode()
      await loadRecords()
      alert(`${updatedCount}건의 감독 서명이 완료되었습니다.`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('감독 서명 실패: ' + message)
    } finally {
      setSupervisorSigning(false)
    }
  }

  // 목록 렌더용 — 로드 정렬(일련번호·created_at 오름차순) 유지
  const shouldHideRepeatedField = (
    record: QualityTestRecord,
    index: number,
    field:
      | 'test_date'
      | 'test_category'
      | 'work_type'
      | 'target_material'
      | 'supplier_factory'
      | 'test_place'
  ) => {
    const previous = records[index - 1]
    return (
      record.serial_no !== null &&
      previous?.serial_no === record.serial_no &&
      previous[field] === record[field]
    )
  }
  const renderRecordRow = (record: QualityTestRecord, index: number) => (
    <tr
      key={record.id}
      onClick={() => {
        if (isSupervisorSignMode) toggleRecordSelection(record)
        else handleSelectRecord(record)
      }}
      aria-selected={isSupervisorSignMode ? selectedRecordIds.has(record.id) : undefined}
      className={`border-t border-gray-100 ${
        isSupervisorSignMode
          ? 'cursor-pointer hover:bg-amber-50'
          : 'cursor-pointer hover:bg-amber-50'
      } ${
        selectedRecordIds.has(record.id) || editingSerialNo === record.serial_no ? 'bg-amber-50' : ''
      }`}
    >
      {isSupervisorSignMode && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={selectedRecordIds.has(record.id)}
            onClick={(event) => event.stopPropagation()}
            onChange={() => toggleRecordSelection(record)}
            aria-label={`일련번호 ${record.serial_no ?? index + 1} 감독 서명 선택`}
            title={record.supervision_engineer_signature ? '기존 감독 서명을 새 서명으로 대체' : '감독 서명 선택'}
            className="h-4 w-4 accent-amber-600"
          />
        </td>
      )}
      <td className="px-2 py-2 text-center text-gray-500">{record.serial_no ?? index + 1}</td>
      <td className="px-2 py-2 text-center">
        {canDeleteQualityRecords && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(record)
            }}
            className="p-1 text-gray-400 hover:text-red-600"
            title="삭제"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        {shouldHideRepeatedField(record, index, 'test_date')
          ? ''
          : formatShortDate(record.test_date)}
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        {shouldHideRepeatedField(record, index, 'test_category') ? '' : record.test_category || '-'}
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        {shouldHideRepeatedField(record, index, 'work_type') ? '' : record.work_type || '-'}
      </td>
      <td className="px-2 py-2 text-center">
        {shouldHideRepeatedField(record, index, 'target_material') ? '' : record.target_material || '-'}
      </td>
      <td className="px-2 py-2 text-center">
        {shouldHideRepeatedField(record, index, 'supplier_factory') ? '' : record.supplier_factory || '-'}
      </td>
      <td className="px-2 py-2 text-center">
        {shouldHideRepeatedField(record, index, 'test_place') ? '' : record.test_place || '-'}
      </td>
      <td className="px-2 py-2 text-center">{record.test_item || '-'}</td>
      <td className="px-2 py-2 text-center">{record.test_standard || '-'}</td>
      <td className="px-2 py-2 text-center">{record.test_result || '-'}</td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
            record.result_verdict === '합격'
              ? 'bg-green-100 text-green-700'
              : record.result_verdict === '불합격'
                ? 'bg-red-100 text-red-700'
                : record.result_verdict === '재시험'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-500'
          }`}
        >
          {record.result_verdict || '-'}
        </span>
      </td>
      <td className="min-w-[140px] px-2 py-2 text-center">
        {record.quality_engineer_name || record.quality_engineer_signature ? (
          <div className="flex items-center justify-center gap-2">
            <span className="whitespace-nowrap">{record.quality_engineer_name || '-'}</span>
            {record.quality_engineer_signature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={record.quality_engineer_signature}
                alt={`${record.quality_engineer_name || '품질관리기술인'} 서명`}
                className="h-8 max-w-24 object-contain"
              />
            )}
          </div>
        ) : (
          '-'
        )}
      </td>
      <td className="min-w-[160px] px-2 py-2 text-center">
        {record.supervision_engineer_name || record.supervision_engineer_signature ? (
          <div className="flex items-center justify-center gap-2">
            <span className="whitespace-nowrap">{record.supervision_engineer_name || '-'}</span>
            {record.supervision_engineer_signature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={record.supervision_engineer_signature}
                alt={`${record.supervision_engineer_name || '건설사업관리기술인'} 서명`}
                className="h-8 max-w-24 object-contain"
              />
            )}
          </div>
        ) : (
          '-'
        )}
      </td>
    </tr>
  )

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold sm:text-base">품질검사 실시대장 (별지 제42호서식)</h2>
            <button
              type="button"
              onClick={() => setIsListExpanded((current) => !current)}
              aria-expanded={isListExpanded}
              aria-controls="quality-test-record-list"
              className="flex shrink-0 items-center gap-1 rounded border border-white/60 px-2 py-1 text-xs font-medium text-white hover:bg-white/10"
              title={isListExpanded ? '실시대장 목록 접기' : '실시대장 목록 펼치기'}
            >
              {isListExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isListExpanded ? '목록 접기' : '목록 펼치기'}</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="https://drive.google.com/uc?export=download&id=1QUNV-8SxYgThRcf5afTo7LyJdaM3xtn_"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
              title="품질검사 실시대장 HWP 양식 다운로드"
            >
              <FileDown className="h-4 w-4" />
              HWP 양식
            </a>
            {canSignQualityRecords && (
              <button
                type="button"
                onClick={() => {
                  if (isSupervisorSignMode) setShowSupervisorSignature(true)
                  else startSupervisorSignMode()
                }}
                disabled={
                  records.length === 0 ||
                  (isSupervisorSignMode && selectedRecordIds.size === 0)
                }
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSupervisorSignMode
                    ? 'bg-amber-950 text-white hover:bg-amber-900'
                    : 'bg-white text-amber-700 hover:bg-amber-50'
                }`}
                title={
                  records.length === 0
                    ? '감독 서명할 항목이 없습니다.'
                    : isSupervisorSignMode
                      ? `선택한 ${selectedRecordIds.size}건의 감독 서명을 저장하거나 대체`
                      : '목록에서 항목을 선택해 감독 서명 또는 기존 서명 대체'
                }
              >
                <PenTool className="h-4 w-4" />
                {isSupervisorSignMode ? `${selectedRecordIds.size}건 서명` : '감독서명'}
              </button>
            )}
            {isSupervisorSignMode ? (
              <button
                type="button"
                onClick={closeSupervisorSignMode}
                className="flex items-center gap-1 rounded-lg border border-white/60 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/10 sm:text-sm"
              >
                취소
              </button>
            ) : (
              <>
                <button
                  onClick={handleLedgerDownload}
                  disabled={ledgerDownloading || records.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium disabled:opacity-50"
                  title="품질검사 실시대장 엑셀 출력"
                >
                  <Printer className="h-4 w-4" />
                  대장 출력
                </button>
                <button
                  onClick={handlePhotoReportDownload}
                  disabled={photoReportDownloading || !records.some((r) => r.photo_url)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium disabled:opacity-50"
                  title="사진대지 PDF 출력"
                >
                  <ImageIcon className="h-4 w-4" />
                  사진대지
                </button>
                <button
                  onClick={handleAddClick}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  추가
                </button>
              </>
            )}
          </div>
        </div>

        {isSupervisorSignMode && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            <span>서명할 행을 체크한 뒤 상단의 서명 버튼을 눌러주세요. 기존 서명은 새 서명으로 대체됩니다.</span>
            <span className="shrink-0 font-semibold">{selectedRecordIds.size}건 선택</span>
          </div>
        )}

        {isListExpanded && (
          <div id="quality-test-record-list">
            {records.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  등록된 시험·검사 기록이 없습니다. 추가 버튼으로 대장 행을 등록합니다.
                </p>
                <button
                  type="button"
                  onClick={handleAddClick}
                  className="mt-4 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <Plus className="h-4 w-4" />
                  추가
                </button>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-12rem)] overflow-auto">
                <table className="w-full border-collapse text-sm [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-200 [&_td:last-child]:border-r-0">
                  <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_#e5e7eb]">
                    <tr className="bg-gray-50 text-gray-600 text-xs">
                      {isSupervisorSignMode && (
                        <th className="px-2 py-2 text-center whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={allRecordsSelected}
                            onChange={toggleAllRecords}
                            aria-label="감독 서명 항목 전체 선택"
                            title="감독 서명 항목 전체 선택"
                            className="h-4 w-4 accent-amber-600"
                          />
                        </th>
                      )}
                      <th className="px-2 py-2 text-center whitespace-nowrap">일련번호</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">삭제</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">연월일</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">구분</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">공종</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">대상 재료</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">공급처</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">시험검사<br />장소</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">시험·검사 종목</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">시험 기준</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">시험 결과</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">판정</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">품질관리기술인<br />(이름·서명)</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">건설사업관리기술인<br />(이름·서명)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, index) => renderRecordRow(record, index))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showTestCategorySelector && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowTestCategorySelector(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="시험·검사구분 선택"
            aria-describedby="quality-test-category-dialog-description"
            className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/60 bg-gradient-to-br from-white via-white to-amber-50 p-5 shadow-2xl sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">시험·검사구분 선택</h2>
                <p
                  id="quality-test-category-dialog-description"
                  className="mt-1 text-sm text-gray-500"
                >
                  등록할 기록의 시험·검사구분을 선택해주세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTestCategorySelector(false)}
                aria-label="시험·검사구분 선택 창 닫기"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {TEST_CATEGORY_OPTIONS.map((option, index) => {
                const definition = TEST_CATEGORY_DEFINITIONS[option]
                const style = TEST_CATEGORY_CARD_STYLES[index]
                const Icon = style.icon

                return (
                  <button
                    key={option}
                    type="button"
                    autoFocus={index === 0}
                    onClick={() => handleTestCategorySelect(option)}
                    className={`group flex h-full min-h-[14rem] flex-col rounded-2xl border-2 bg-white/90 p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${style.card}`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${style.iconBox}`}
                      >
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wider ${style.number}`}
                      >
                        0{index + 1}
                      </span>
                    </span>
                    <span className="mt-5 text-lg font-bold text-gray-900">{option}</span>
                    <span className="mt-2 flex-1 text-sm leading-6 text-gray-600">
                      {definition}
                    </span>
                    <span
                      className={`mt-5 flex items-center gap-1.5 text-sm font-semibold ${style.action}`}
                    >
                      선택하기
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 작성/수정 폼 */}
      {showForm && commonData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-visible">
          <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between rounded-t-lg">
            <h2 className="font-semibold text-sm sm:text-base truncate">
              시험·검사 기록 {editingSerialNo !== null ? '수정' : '등록'}
            </h2>
            <button onClick={resetForm} className="text-white hover:text-amber-200 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-4 bg-gray-100 rounded-b-lg">
            {/* 공통 항목 — 한 제출건 내 모든 시험 항목이 공유 */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div>
                  <label className={labelCls}>일련번호</label>
                  <input
                    type="text"
                    value={editingSerialNo ?? computeNextSerialNo()}
                    disabled
                    className={`${inputCls} disabled:bg-gray-200 text-gray-500`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>품질관리기술인 *</label>
                  <div
                    className="flex items-center gap-2"
                    role="group"
                    aria-label="품질관리기술인 이름 및 서명 (필수)"
                  >
                    <input
                      type="text"
                      value={commonData.quality_engineer_name}
                      onChange={(e) => setCommon('quality_engineer_name', e.target.value)}
                      placeholder="성명"
                      required
                      aria-required="true"
                      className={`${inputCls} max-w-[180px]`}
                    />
                    {commonData.quality_engineer_signature ? (
                      <button
                        type="button"
                        onClick={() => setActiveSign('quality_engineer_signature')}
                        aria-label="품질관리기술인 다시 서명 (필수)"
                        title="다시 서명"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={commonData.quality_engineer_signature}
                          alt="품질관리기술인 서명"
                          className="h-9 border rounded cursor-pointer hover:opacity-80"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveSign('quality_engineer_signature')}
                        aria-label="품질관리기술인 서명 (필수)"
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                      >
                        서명
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>연월일 *</label>
                  <input
                    type="date"
                    value={commonData.test_date || ''}
                    onChange={(e) => handleCommonTestDateChange(e.target.value || null)}
                    required
                    aria-required="true"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>시험·검사구분 *</label>
                  <div
                    className="flex gap-1.5"
                    role="group"
                    aria-label="시험·검사구분 (필수)"
                  >
                    {TEST_CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCommon('test_category', opt)}
                        className={`flex-1 whitespace-nowrap px-2 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                          commonData.test_category === opt
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-amber-100'
                        }`}
                      >
                        {opt.replace('시험', '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                <label className={labelCls}>품질검사 대상 재료 *</label>
                <div
                  className="relative"
                  onBlur={(e) => {
                    const nextFocus = e.relatedTarget as Node | null
                    if (!e.currentTarget.contains(nextFocus)) setShowMaterialPresets(false)
                  }}
                >
                  <input
                    type="text"
                    value={commonData.target_material}
                    onFocus={() => setShowMaterialPresets(true)}
                    onChange={(e) => {
                      setCommon('target_material', e.target.value)
                      setShowMaterialPresets(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowMaterialPresets(false)
                    }}
                    placeholder="프리셋 선택 또는 직접 입력"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-haspopup="dialog"
                    aria-expanded={showMaterialPresets}
                    aria-controls="concrete-material-presets"
                    required
                    aria-required="true"
                    className={inputCls}
                  />
                  {showMaterialPresets && (
                    <div
                      id="concrete-material-presets"
                      role="dialog"
                      aria-label="품질검사 대상 재료 프리셋"
                      className="absolute left-0 z-30 mt-2 max-h-[min(38rem,70vh)] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50/95 p-4 shadow-2xl backdrop-blur"
                    >
                      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-start justify-between gap-4 border-b border-gray-200 bg-gray-50/95 px-4 py-4 backdrop-blur">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                            <FlaskConical className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <h3 className="text-sm font-bold text-gray-900">시험 항목 프리셋</h3>
                            <p className="mt-0.5 text-xs text-gray-500">
                              필요한 항목 묶음을 선택하면 입력란이 자동으로 채워집니다.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMaterialPresets(false)}
                          aria-label="시험 항목 프리셋 닫기"
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <section className="rounded-xl border border-violet-100 bg-violet-50/70 p-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-violet-800">
                            <History className="h-4 w-4" aria-hidden="true" />
                            이전 기록 불러오기
                            <span className="font-normal text-violet-600">사진 제외</span>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={selectedCopySerialNo ?? ''}
                              onChange={(e) => setCopySourceSerialNo(e.target.value)}
                              disabled={availablePreviousSerialNos.length === 0}
                              aria-label="불러올 이전 일련번호 선택"
                              className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              {availablePreviousSerialNos.length === 0 ? (
                                <option value="">이전 기록 없음</option>
                              ) : (
                                availablePreviousSerialNos.map((serialNo) => (
                                  <option key={serialNo} value={serialNo}>
                                    일련번호 {serialNo}번
                                  </option>
                                ))
                              )}
                            </select>
                            <button
                              type="button"
                              onClick={handleCopyPreviousRecord}
                              disabled={selectedCopySerialNo === null}
                              className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                            >
                              불러오기
                            </button>
                          </div>
                        </section>

                        <section>
                          <p className="mb-2 text-xs font-bold text-gray-700">토공</p>
                          <button
                            type="button"
                            aria-pressed={commonData.target_material === '되메우기'}
                            onClick={handleApplyEarthworkPreset}
                            className={`flex w-full items-center justify-between rounded-xl border-2 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                              commonData.target_material === '되메우기'
                                ? 'border-emerald-400 bg-emerald-50'
                                : 'border-emerald-100 hover:border-emerald-300'
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                                <Mountain className="h-5 w-5" aria-hidden="true" />
                              </span>
                              <span>
                                <span className="block text-sm font-bold text-gray-900">되메우기</span>
                                <span className="mt-0.5 block text-xs text-gray-500">
                                  함수비 · 현장밀도
                                </span>
                              </span>
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              2개 항목
                            </span>
                          </button>
                        </section>

                        <section>
                          <div className="mb-3">
                            <p className="text-xs font-bold text-gray-700">콘크리트</p>
                            <p className="mt-1 text-xs text-gray-500">
                              시험 유형을 고른 뒤 규격 카드를 선택해주세요.
                            </p>
                          </div>

                          <div className="mb-3 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              aria-pressed={concretePresetMode === 'standard'}
                              onClick={() => setConcretePresetMode('standard')}
                              className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                                concretePresetMode === 'standard'
                                  ? 'border-amber-400 bg-amber-50'
                                  : 'border-gray-200 bg-white hover:border-amber-200'
                              }`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                                <ListChecks className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span>
                                <span className="block text-xs font-bold text-gray-900">
                                  기본 품질시험
                                </span>
                                <span className="mt-0.5 block text-[11px] text-gray-500">
                                  슬럼프 등 5개 항목
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-pressed={concretePresetMode === 'schmidt'}
                              onClick={() => setConcretePresetMode('schmidt')}
                              className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                                concretePresetMode === 'schmidt'
                                  ? 'border-sky-400 bg-sky-50'
                                  : 'border-gray-200 bg-white hover:border-sky-200'
                              }`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                                <Hammer className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span>
                                <span className="block text-xs font-bold text-gray-900">
                                  슈미트해머
                                </span>
                                <span className="mt-0.5 block text-[11px] text-gray-500">
                                  반발경도 1개 항목
                                </span>
                              </span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {CONCRETE_PRESETS.map((preset) => {
                              const isSchmidtSelected =
                                commonData.target_material === preset.label &&
                                items.length === 1 &&
                                items[0]?.test_item === '슈미트해머'
                              const isSelected =
                                commonData.target_material === preset.label &&
                                (concretePresetMode === 'schmidt'
                                  ? isSchmidtSelected
                                  : !isSchmidtSelected)

                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  aria-label={`${preset.label}, ${
                                    concretePresetMode === 'schmidt'
                                      ? '슈미트해머 1개 항목'
                                      : '기본 품질시험 5개 항목'
                                  }`}
                                  aria-pressed={isSelected}
                                  onClick={() => handleApplyConcretePreset(preset, concretePresetMode)}
                                  className={`group relative rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 ${
                                    isSelected
                                      ? concretePresetMode === 'schmidt'
                                        ? 'border-sky-400 bg-sky-50 focus:ring-sky-400'
                                        : 'border-amber-400 bg-amber-50 focus:ring-amber-400'
                                      : 'border-gray-200 bg-white hover:border-amber-200 focus:ring-amber-400'
                                  }`}
                                >
                                  {isSelected && (
                                    <BadgeCheck
                                      className={`absolute right-2.5 top-2.5 h-4 w-4 ${
                                        concretePresetMode === 'schmidt'
                                          ? 'text-sky-600'
                                          : 'text-amber-600'
                                      }`}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="block text-[10px] font-semibold tracking-wide text-gray-400">
                                    {preset.aggregate}-{preset.strength}-{preset.slump}
                                  </span>
                                  <span className="mt-1 block text-sm font-bold text-gray-900">
                                    강도 {preset.strength} MPa
                                  </span>
                                  <span className="mt-1 block text-[11px] leading-5 text-gray-500">
                                    골재 {preset.aggregate} mm · 슬럼프 {preset.slump} mm
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>공종 (총괄표 집계용) *</label>
                <input
                  type="text"
                  value={commonData.work_type}
                  onChange={(e) => setCommon('work_type', e.target.value)}
                  placeholder="예: 흙쌓기공"
                  required
                  aria-required="true"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>공급받은 공장 *</label>
                <input
                  type="text"
                  value={commonData.supplier_factory}
                  onChange={(e) => setCommon('supplier_factory', e.target.value)}
                  placeholder="건설자재·부재 공급 공장"
                  required
                  aria-required="true"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험·검사 장소 *</label>
                <input
                  type="text"
                  value={commonData.test_place}
                  onChange={(e) => setCommon('test_place', e.target.value)}
                  placeholder="예: 현장 시험실"
                  required
                  aria-required="true"
                  className={inputCls}
                />
              </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div role="group" aria-label="사진 (필수)">
                  <label className={labelCls}>사진 (사진대지 출력용) *</label>
                  {commonData.photo_url ? (
                    <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={commonData.photo_url}
                      alt="시험·검사 사진"
                      className="h-16 rounded border border-gray-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-2 -right-2 p-1 bg-white border border-gray-300 rounded-full text-gray-400 hover:text-red-600 shadow-sm"
                      title="사진 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    </div>
                  ) : (
                    <label className="flex w-fit items-center justify-center gap-1 border border-gray-300 rounded-lg px-4 py-2 bg-white hover:bg-gray-50 cursor-pointer text-xs text-gray-500">
                    {uploadingPhoto ? (
                      '업로드중...'
                    ) : (
                      <>
                        <Upload className="h-4 w-4 text-gray-400" />
                        <span>사진 추가</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={uploadingPhoto}
                      required
                      aria-required="true"
                    />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* 항목별 반복 등록 — 시험·검사 종목 ~ 시험 결과 판정 */}
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item._key} className="border border-gray-300 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-700">항목 {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item._key)}
                      className="p-1 text-red-600 hover:text-red-700"
                      title="이 항목 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-12 lg:items-end">
                    <div className="lg:col-span-2">
                      <label className={labelCls}>연월일 *</label>
                      <input
                        type="date"
                        value={item.test_date || ''}
                        onChange={(e) => setItemField(item._key, 'test_date', e.target.value || null)}
                        required
                        aria-required="true"
                        className={inputCls}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className={labelCls}>시험·검사 종목 *</label>
                      <input
                        type="text"
                        value={item.test_item}
                        onChange={(e) => handleTestItemChange(item._key, e.target.value)}
                        placeholder="예: 슬럼프, 압축강도"
                        required
                        aria-required="true"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 lg:col-span-2">
                      <label className={labelCls}>시험 기준 *</label>
                      <input
                        type="text"
                        value={item.test_standard}
                        onChange={(e) => setItemField(item._key, 'test_standard', e.target.value)}
                        placeholder="예: KS F 2402"
                        required
                        aria-required="true"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 lg:col-span-3">
                      <label className={labelCls}>시험 결과 *</label>
                      <input
                        type="text"
                        value={item.test_result}
                        onChange={(e) => setItemField(item._key, 'test_result', e.target.value)}
                        placeholder="측정값 등"
                        required
                        aria-required="true"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-4 lg:col-span-3">
                      <label className={labelCls}>시험 결과 판정 *</label>
                      <div
                        className="grid grid-cols-3 overflow-hidden rounded border border-gray-300"
                        role="group"
                        aria-label="시험 결과 판정 (필수)"
                      >
                        {VERDICT_OPTIONS.map((opt, optionIndex) => {
                          const isSelected = item.result_verdict === opt
                          const selectedClass =
                            opt === '합격'
                              ? 'bg-green-600 text-white'
                              : opt === '불합격'
                                ? 'bg-red-600 text-white'
                                : 'bg-orange-500 text-white'

                          return (
                            <button
                              key={opt}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setItemField(item._key, 'result_verdict', opt)}
                              className={`px-2 py-1.5 text-sm font-medium transition-colors ${
                                optionIndex > 0 ? 'border-l border-gray-300' : ''
                              } ${isSelected ? selectedClass : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-lg border border-dashed border-amber-400 text-amber-700 hover:bg-amber-50"
              >
                <Plus className="h-4 w-4" />
                항목 추가
              </button>
            </div>

            <div>
              <label className={labelCls}>비고</label>
              <input
                type="text"
                value={commonData.note}
                onChange={(e) => setCommon('note', e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : editingSerialNo !== null ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={activeSign !== null}
        onClose={() => setActiveSign(null)}
        onSave={(signatureData) => {
          if (activeSign) setCommon(activeSign, signatureData)
          setActiveSign(null)
        }}
      />
      <SignatureModal
        isOpen={showSupervisorSignature}
        onClose={() => setShowSupervisorSignature(false)}
        onSave={handleSupervisorSignatureSave}
        isSubmitting={supervisorSigning}
      />
    </div>
  )
}
