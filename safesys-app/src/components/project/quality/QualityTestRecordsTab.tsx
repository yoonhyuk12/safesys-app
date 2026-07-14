'use client'

// 품질검사 실시대장 탭 (별지 제42호서식) — 대장 행 목록·작성·수정·삭제·엑셀 출력
// 한 제출건(일련번호)에 시험·검사 종목~건설사업관리기술인 확인 항목을 여러 건 등록할 수 있다.

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
  ChevronDown,
  ChevronUp,
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

type SignatureField = 'quality_engineer_signature' | 'supervision_engineer_signature'
type FormItem = QualityTestItemFields & {
  test_date: QualityTestCommonFields['test_date']
  _key: string
  _id?: string
}
type FormItemField = keyof QualityTestItemFields | 'test_date'
type ConcretePresetMode = 'standard' | 'schmidt'

interface ConcretePreset {
  label: string
  strength: number
  slump: number
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const VERDICT_OPTIONS: TestVerdict[] = ['합격', '불합격', '재시험']
const COMPRESSION_STRENGTH_TEST_ITEM = '압축강도'

const isCompressionStrengthTest = (testItem: string) => testItem.trim() === COMPRESSION_STRENGTH_TEST_ITEM

const getTodayDateString = () => {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
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
  { label: '콘크리트(25-24-80)', strength: 24, slump: 80 },
  { label: '콘크리트(25-24-120)', strength: 24, slump: 120 },
  { label: '콘크리트(25-24-150)', strength: 24, slump: 150 },
  { label: '콘크리트(25-27-80)', strength: 27, slump: 80 },
  { label: '콘크리트(25-27-120)', strength: 27, slump: 120 },
  { label: '콘크리트(25-27-150)', strength: 27, slump: 150 },
  { label: '콘크리트(25-30-80)', strength: 30, slump: 80 },
  { label: '콘크리트(25-30-120)', strength: 30, slump: 120 },
  { label: '콘크리트(25-30-150)', strength: 30, slump: 150 },
]

export default function QualityTestRecordsTab({
  projectId,
  userId,
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
  const [copySourceSerialNo, setCopySourceSerialNo] = useState('')
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [ledgerDownloading, setLedgerDownloading] = useState(false)
  const [photoReportDownloading, setPhotoReportDownloading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [activeSign, setActiveSign] = useState<SignatureField | null>(null)
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
    // 직전 제출건의 기술인 성명·서명을 기본값으로 이어받아 반복 입력을 줄인다.
    // 건설사업관리기술인 성명은 프로젝트 감독자 이름을 우선 기본값으로 사용한다.
    const last = records[records.length - 1]
    const supervisionName = supervisorName || last?.supervision_engineer_name || ''
    const supervisionSignature =
      last && last.supervision_engineer_name === supervisionName ? last.supervision_engineer_signature : ''

    // 총괄표가 있으면 최신 항목을 기본 선택하고, 없으면 미지정으로 저장한다.
    setSelectedSummaryId(summaries.length === 0 ? '' : summaries[summaries.length - 1].id)
    setEditingSerialNo(null)
    setShowMaterialPresets(false)
    setCopySourceSerialNo('')
    const initialCommonData = createEmptyQualityTestCommon({
      test_place: '현장시험실',
      quality_engineer_name: last?.quality_engineer_name || '',
      quality_engineer_signature: last?.quality_engineer_signature || '',
      supervision_engineer_name: supervisionName,
      supervision_engineer_signature: supervisionSignature,
    })
    setCommonData(initialCommonData)
    setItems([
      {
        ...createEmptyQualityTestItem(),
        test_date: initialCommonData.test_date,
        _key: newKey(),
      },
    ])
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
    handleApplyTestPreset('토공', '토공', '토공 프리셋 2개 항목', [
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
      supervision_engineer_name: first.supervision_engineer_name,
      supervision_engineer_signature: first.supervision_engineer_signature,
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
      {
        missing: !commonData.supervision_engineer_name.trim(),
        message: '건설사업관리기술인 이름을 입력해주세요.',
      },
      {
        missing: !commonData.supervision_engineer_signature.trim(),
        message: '건설사업관리기술인 서명을 입력해주세요.',
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
          ...commonData,
          test_date: it.test_date,
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
            .insert([{ ...rowData, created_by: userId }])
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

    const deleteTargets = records.filter((item) =>
      record.serial_no === null ? item.id === record.id : item.serial_no === record.serial_no
    )
    if (deleteTargets.some((item) => item.created_by !== userId)) {
      alert('같은 일련번호에 다른 작성자의 기록이 포함되어 삭제할 수 없습니다.')
      return
    }

    const deleteTargetIds = new Set(deleteTargets.map((item) => item.id))
    const remainingRecords = records.filter((item) => !deleteTargetIds.has(item.id))
    const remainingSerialNos = Array.from(
      new Set(
        remainingRecords.flatMap((item) => (item.serial_no === null ? [] : [item.serial_no]))
      )
    ).sort((a, b) => a - b)
    const renumberPlan = remainingSerialNos
      .map((currentSerialNo, index) => ({ currentSerialNo, nextSerialNo: index + 1 }))
      .filter(({ currentSerialNo, nextSerialNo }) => currentSerialNo !== nextSerialNo)

    const hasUnauthorizedRenumberTarget = renumberPlan.some(({ currentSerialNo }) =>
      remainingRecords.some(
        (item) => item.serial_no === currentSerialNo && item.created_by !== userId
      )
    )
    if (hasUnauthorizedRenumberTarget) {
      alert('다른 작성자의 기록이 포함되어 일련번호를 자동 재정렬할 수 없습니다.')
      return
    }

    try {
      let deleteQuery = (supabase as any)
        .from('quality_test_records')
        .delete()
        .eq('project_id', projectId)
      deleteQuery = record.serial_no === null
        ? deleteQuery.eq('id', record.id)
        : deleteQuery.eq('serial_no', record.serial_no)
      const { error: deleteError } = await deleteQuery
      if (deleteError) throw deleteError

      for (const { currentSerialNo, nextSerialNo } of renumberPlan) {
        const recordIds = remainingRecords
          .filter((item) => item.serial_no === currentSerialNo)
          .map((item) => item.id)
        const { error: renumberError } = await (supabase as any)
          .from('quality_test_records')
          .update({ serial_no: nextSerialNo, updated_at: new Date().toISOString() })
          .in('id', recordIds)
        if (renumberError) throw renumberError
      }

      if (editingSerialNo === record.serial_no) {
        resetForm()
      } else {
        const editingRenumber = renumberPlan.find(({ currentSerialNo }) => currentSerialNo === editingSerialNo)
        if (editingRenumber) setEditingSerialNo(editingRenumber.nextSerialNo)
      }
      await loadRecords()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('삭제 또는 일련번호 재정렬 실패: ' + message)
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

  // 목록 렌더용 — 로드 정렬(일련번호·created_at 오름차순) 유지
  const shouldHideRepeatedField = (
    record: QualityTestRecord,
    index: number,
    field: 'test_date' | 'test_category' | 'work_type' | 'target_material'
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
      onClick={() => handleSelectRecord(record)}
      className={`border-t border-gray-100 cursor-pointer hover:bg-amber-50 ${
        editingSerialNo === record.serial_no ? 'bg-amber-50' : ''
      }`}
    >
      <td className="px-2 py-2 text-center text-gray-500">{record.serial_no ?? index + 1}</td>
      <td className="px-2 py-2 text-center">
        {record.created_by === userId && (
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
        {shouldHideRepeatedField(record, index, 'test_date') ? '' : record.test_date || '-'}
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
          </div>
        </div>

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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm [&_th]:border-r [&_th]:border-gray-200 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-200 [&_td:last-child]:border-r-0">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs">
                      <th className="px-2 py-2 text-center whitespace-nowrap">일련번호</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">삭제</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">연월일</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">구분</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">공종</th>
                      <th className="px-2 py-2 text-center whitespace-nowrap">대상 재료</th>
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

      {/* 작성/수정 폼 */}
      {showForm && commonData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm sm:text-base truncate">
              시험·검사 기록 {editingSerialNo !== null ? '수정' : '등록'}
            </h2>
            <button onClick={resetForm} className="text-white hover:text-amber-200 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-4">
            {/* 공통 항목 — 한 제출건 내 모든 시험 항목이 공유 */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className={labelCls}>일련번호</label>
                  <input
                    type="text"
                    value={editingSerialNo ?? computeNextSerialNo()}
                    disabled
                    className={`${inputCls} bg-gray-100 text-gray-500`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>품질관리기술인 *</label>
                  <div
                    className="flex items-center gap-2"
                    role="group"
                    aria-label="품질관리기술인 이름 및 서명 (필수)"
                    aria-required="true"
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
                  <label className={labelCls}>건설사업관리기술인 확인 *</label>
                  <div
                    className="flex items-center gap-2"
                    role="group"
                    aria-label="건설사업관리기술인 이름 및 서명 (필수)"
                    aria-required="true"
                  >
                    <input
                      type="text"
                      value={commonData.supervision_engineer_name}
                      onChange={(e) => setCommon('supervision_engineer_name', e.target.value)}
                      placeholder="성명"
                      required
                      aria-required="true"
                      className={`${inputCls} max-w-[180px]`}
                    />
                    {commonData.supervision_engineer_signature ? (
                      <button
                        type="button"
                        onClick={() => setActiveSign('supervision_engineer_signature')}
                        aria-label="건설사업관리기술인 다시 서명 (필수)"
                        title="다시 서명"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={commonData.supervision_engineer_signature}
                          alt="건설사업관리기술인 서명"
                          className="h-9 border rounded cursor-pointer hover:opacity-80"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveSign('supervision_engineer_signature')}
                        aria-label="건설사업관리기술인 서명 (필수)"
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
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <div>
                <label className={labelCls}>시험·검사구분 *</label>
                <div
                  className="flex gap-1.5"
                  role="group"
                  aria-label="시험·검사구분 (필수)"
                  aria-required="true"
                >
                  {TEST_CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCommon('test_category', opt)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                        commonData.test_category === opt
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-amber-100'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
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
                    placeholder="콘크리트 규격 선택 또는 직접 입력"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-expanded={showMaterialPresets}
                    aria-controls="concrete-material-presets"
                    required
                    aria-required="true"
                    className={inputCls}
                  />
                  {showMaterialPresets && (
                    <div
                      id="concrete-material-presets"
                      role="listbox"
                      aria-label="품질검사 대상 재료 프리셋"
                      className="absolute z-30 mt-1 w-full min-w-[280px] rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
                    >
                      <div className="mb-2 flex gap-1.5 rounded border border-violet-200 bg-violet-50 p-2">
                        <select
                          value={selectedCopySerialNo ?? ''}
                          onChange={(e) => setCopySourceSerialNo(e.target.value)}
                          disabled={availablePreviousSerialNos.length === 0}
                          aria-label="불러올 이전 일련번호 선택"
                          className="min-w-0 flex-1 rounded border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-800 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-gray-100 disabled:text-gray-400"
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
                          className="shrink-0 rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          불러오기
                          <span className="ml-1 text-[10px] font-normal opacity-80">사진 제외</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        role="option"
                        aria-selected={commonData.target_material === '토공'}
                        onClick={handleApplyEarthworkPreset}
                        className={`mb-2 flex w-full items-center justify-between rounded border px-3 py-2 text-left text-xs transition-colors ${
                          commonData.target_material === '토공'
                            ? 'border-emerald-300 bg-emerald-100 font-semibold text-emerald-800'
                            : 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        <span>토공</span>
                        <span className="text-[11px] font-normal">함수비 · 현장밀도</span>
                      </button>
                      <p className="px-1 pb-2 text-xs font-semibold text-gray-600">
                        콘크리트 규격은 시험 항목 5개, 옆의 ‘슈’는 슈미트해머 항목 1개를 입력합니다.
                      </p>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                        {CONCRETE_PRESETS.map((preset) => {
                          const isSchmidtSelected =
                            commonData.target_material === preset.label &&
                            items.length === 1 &&
                            items[0]?.test_item === '슈미트해머'
                          const isStandardSelected =
                            commonData.target_material === preset.label && !isSchmidtSelected

                          return (
                            <div key={preset.label} className="flex overflow-hidden rounded border border-gray-100">
                              <button
                                type="button"
                                role="option"
                                aria-selected={isStandardSelected}
                                onClick={() => handleApplyConcretePreset(preset)}
                                className={`min-w-0 flex-1 px-2 py-2 text-left text-xs transition-colors ${
                                  isStandardSelected
                                    ? 'bg-amber-100 font-semibold text-amber-800'
                                    : 'text-gray-700 hover:bg-amber-50 hover:text-amber-800'
                                }`}
                              >
                                {preset.label}
                              </button>
                              <button
                                type="button"
                                role="option"
                                aria-label={`${preset.label} 슈미트해머 프리셋`}
                                aria-selected={isSchmidtSelected}
                                onClick={() => handleApplyConcretePreset(preset, 'schmidt')}
                                title="슈미트해머 항목만 입력"
                                className={`shrink-0 border-l px-2 py-2 text-xs font-bold transition-colors ${
                                  isSchmidtSelected
                                    ? 'border-blue-300 bg-blue-600 text-white'
                                    : 'border-gray-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                }`}
                              >
                                슈
                              </button>
                            </div>
                          )
                        })}
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
                <div role="group" aria-label="사진 (필수)" aria-required="true">
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
                    <label className="flex items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg h-16 bg-white hover:bg-gray-50 cursor-pointer text-xs text-gray-500">
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
                <div key={item._key} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/50">
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
                        aria-required="true"
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
    </div>
  )
}
