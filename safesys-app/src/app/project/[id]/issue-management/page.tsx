'use client'

// 지적사항 관리대장 — 본부 안전점검·정기점검 지적 자동 집계 + 별지 6호 직접 등록 + 조치 write-back + 별지 7호 다운로드
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Trash2, Edit2, FileSpreadsheet, FileText, Ban, X, Upload, Crop } from 'lucide-react'
import ImageEditor from '@/components/ui/ImageEditor'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CopyrightNotice from '@/components/common/CopyrightNotice'
import { downloadIssueActionReportExcel } from '@/lib/excel/issue-action-report-export'
import { downloadCorrectiveActionRequestExcel } from '@/lib/excel/corrective-action-request-export'
import { isRealFinding, isAdditionalFinding, isNaValue, extractUploadDate } from '@/lib/issue-ledger'

// ─── 타입 ───────────────────────────────────────────────

interface DirectIssue {
  id: string
  project_id: string
  created_by: string | null
  inspection_department_head: string | null
  inspector_name: string | null
  inspection_type: string | null
  inspection_date: string | null
  location: string | null
  content: string | null
  before_photo_url: string | null
  after_photo_url: string | null
  action_content: string | null
  action_date: string | null
  contractor_signature: string | null
  supervisor_signature: string | null
}

type IssueSource =
  | { kind: 'hq'; inspectionId: string; issueNo: 1 | 2 }
  | { kind: 'safety_result'; resultId: string }
  | { kind: 'safety_additional'; inspectionId: string; itemIndex: number }
  | { kind: 'direct'; entry: DirectIssue }

interface LedgerIssue {
  key: string
  source: IssueSource
  sourceLabel: string // 본부점검 | 해빙기 | 우기 | 종합 | 특별점검 | 직접등록
  inspectionDate: string | null
  inspectorName: string | null
  location: string | null // 부위/항목
  findingText: string
  beforePhotoUrl: string | null
  actionText: string | null
  afterPhotoUrl: string | null // 'N/A' 또는 '해당 사항 없음' = 해당없음
  contractor: string | null
  writerName: string | null
  confirmerName: string | null
  contractorSignature: string | null
  supervisorSignature: string | null
  actionDate: string | null
}

const isResolved = (issue: LedgerIssue): boolean => !!issue.afterPhotoUrl

const SPECIAL_TYPE = '특별점검(안전혁신건설-287)'
const sourceShort = (t: string): string => (t === SPECIAL_TYPE ? '특별점검' : t)

// 이미지 리사이즈 (본부점검 페이지 업로드 관례: 1920×1440, JPEG 0.95)
const resizeImageToJpeg = (file: File, maxW = 1920, maxH = 1440, quality = 0.95): Promise<File> =>
  new Promise((resolve) => {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })

// 직접 등록 시 점검의 종류 선택지 (별지 6호 ＊점검의 종류 — 정기·특별은 자동 집계로 들어오므로 제외)
const DIRECT_INSPECTION_TYPES = ['수시점검', '기타'] as const

const emptyForm = {
  inspection_department_head: '',
  inspector_name: '',
  inspection_type: '수시점검',
  inspection_date: new Date().toISOString().split('T')[0],
  location: '',
  content: '',
}

export default function IssueManagementPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<{ id: string; project_name: string; created_by: string | null } | null>(null)
  const [projectContractor, setProjectContractor] = useState<string | null>(null)
  const [issues, setIssues] = useState<LedgerIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [unresolvedOnly, setUnresolvedOnly] = useState(false)
  const [workingKey, setWorkingKey] = useState<string | null>(null)
  const [exportingKey, setExportingKey] = useState<string | null>(null)
  const [editingActionKey, setEditingActionKey] = useState<string | null>(null)
  const [tempActionText, setTempActionText] = useState('')

  // 직접 등록 모달
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DirectIssue | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [formPhoto, setFormPhoto] = useState<File | null>(null)
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null)
  const [editingFormPhoto, setEditingFormPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const canRegister = userProfile?.role === '발주청' || userProfile?.role === '감리단'

  // ─── 데이터 로딩 및 집계 ───────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select('id, project_name, created_by')
        .eq('id', projectId)
        .single()
      if (proj) {
        setProject(proj as any)
        // 수급인: 프로젝트 생성자(시공사 계정)의 회사명 (SafetyInspectionForm 패턴)
        if ((proj as any).created_by) {
          const { data: creator } = await supabase
            .from('user_profiles')
            .select('role, company_name')
            .eq('id', (proj as any).created_by)
            .single()
          if ((creator as any)?.role === '시공사' && (creator as any)?.company_name) {
            setProjectContractor((creator as any).company_name)
          }
        }
      }

      const list: LedgerIssue[] = []

      // 1) 본부 안전점검 — 지적 1~2건/점검
      const { data: hqData } = await supabase
        .from('headquarters_inspections')
        .select('id, inspection_date, inspector_name, issue_content1, issue_content2, site_photo_issue1, site_photo_issue2, action_photo_issue1, action_photo_issue2')
        .eq('project_id', projectId)
      hqData?.forEach((ins: any) => {
        ;([1, 2] as const).forEach((no) => {
          const content = (ins[`issue_content${no}`] || '').trim()
          if (!content) return
          list.push({
            key: `hq-${ins.id}-${no}`,
            source: { kind: 'hq', inspectionId: ins.id, issueNo: no },
            sourceLabel: '본부점검',
            inspectionDate: ins.inspection_date,
            inspectorName: ins.inspector_name,
            location: null,
            findingText: content,
            beforePhotoUrl: ins[`site_photo_issue${no}`] || null,
            actionText: null,
            afterPhotoUrl: ins[`action_photo_issue${no}`] || null,
            contractor: null,
            writerName: null,
            confirmerName: null,
            contractorSignature: null,
            supervisorSignature: null,
            actionDate: null,
          })
        })
      })

      // 2) 정기점검 (해빙기/우기/종합/특별) — 결과 항목 실지적 + 추가항목 지적
      const { data: siData } = await supabase
        .from('safety_inspections')
        .select('id, inspection_type, inspection_date, supervisor_name, contractor, additional_items, signatures, safety_inspection_results(id, field_item, findings, action_items, photo_url, after_photo_url, sort_order)')
        .eq('project_id', projectId)
      siData?.forEach((ins: any) => {
        const sigs = Array.isArray(ins.signatures) ? ins.signatures : []
        const writerSig = sigs.find((s: any) => s?.role === '현장대리인')
        const confirmerSig = sigs.find((s: any) => s?.role === '공사감독원')
        const common = {
          sourceLabel: sourceShort((ins.inspection_type || '').trim()),
          inspectionDate: ins.inspection_date,
          inspectorName: ins.supervisor_name,
          contractor: ins.contractor,
          writerName: writerSig?.name || null,
          confirmerName: confirmerSig?.name || null,
          contractorSignature: writerSig?.dataUrl || null,
          supervisorSignature: confirmerSig?.dataUrl || null,
          actionDate: null,
        }
        const results = Array.isArray(ins.safety_inspection_results) ? ins.safety_inspection_results : []
        results
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .filter(isRealFinding)
          .forEach((r: any) => {
            list.push({
              ...common,
              key: `sr-${r.id}`,
              source: { kind: 'safety_result', resultId: r.id },
              location: r.field_item || null,
              findingText: r.findings || '',
              beforePhotoUrl: r.photo_url || null,
              actionText: r.action_items || null,
              afterPhotoUrl: r.after_photo_url || null,
            })
          })
        const additional = Array.isArray(ins.additional_items) ? ins.additional_items : []
        additional.forEach((item: any, idx: number) => {
          if (!isAdditionalFinding(item)) return
          list.push({
            ...common,
            key: `sa-${ins.id}-${idx}`,
            source: { kind: 'safety_additional', inspectionId: ins.id, itemIndex: idx },
            location: item.item || item.category || null,
            findingText: [item.category, item.item].filter(Boolean).join(' - '),
            beforePhotoUrl: item.photo_url || null,
            actionText: item.action || null,
            afterPhotoUrl: item.after_photo_url || null,
          })
        })
      })

      // 3) 직접 등록건
      const { data: directData } = await supabase
        .from('corrective_action_issues')
        .select('*')
        .eq('project_id', projectId)
      directData?.forEach((d: any) => {
        list.push({
          key: `d-${d.id}`,
          source: { kind: 'direct', entry: d },
          sourceLabel: '직접등록',
          inspectionDate: d.inspection_date,
          inspectorName: d.inspector_name,
          location: d.location,
          findingText: d.content || '',
          beforePhotoUrl: d.before_photo_url,
          actionText: d.action_content,
          afterPhotoUrl: d.after_photo_url,
          contractor: null,
          writerName: null,
          confirmerName: null,
          contractorSignature: d.contractor_signature,
          supervisorSignature: d.supervisor_signature,
          actionDate: d.action_date,
        })
      })

      // 점검 시행일 기준 내림차순 정렬
      list.sort((a, b) => (b.inspectionDate || '').localeCompare(a.inspectionDate || ''))
      setIssues(list)
    } catch (err) {
      console.error('지적사항 로딩 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadAll()
  }, [user, projectId, loadAll])

  // ─── 조치 write-back (원본 테이블 갱신 → 원본 화면과 자동 동기화) ───

  const uploadToStorage = async (file: File, bucket: string, path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file)
    if (error || !data) {
      console.error('Storage 업로드 실패:', error)
      return null
    }
    return supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl
  }

  const applyAction = async (issue: LedgerIssue, afterPhotoUrl: string | null) => {
    const src = issue.source
    if (src.kind === 'hq') {
      await (supabase.from('headquarters_inspections') as any)
        .update({
          [`action_photo_issue${src.issueNo}`]: afterPhotoUrl,
          [`issue${src.issueNo}_status`]: afterPhotoUrl ? 'completed' : 'pending',
        })
        .eq('id', src.inspectionId)
    } else if (src.kind === 'safety_result') {
      await (supabase.from('safety_inspection_results') as any)
        .update({ after_photo_url: afterPhotoUrl })
        .eq('id', src.resultId)
    } else if (src.kind === 'safety_additional') {
      const { data: ins } = await supabase
        .from('safety_inspections')
        .select('additional_items')
        .eq('id', src.inspectionId)
        .single()
      const items = Array.isArray((ins as any)?.additional_items) ? [...(ins as any).additional_items] : []
      if (!items[src.itemIndex]) return
      items[src.itemIndex] = { ...items[src.itemIndex], after_photo_url: afterPhotoUrl }
      await (supabase.from('safety_inspections') as any)
        .update({ additional_items: items })
        .eq('id', src.inspectionId)
    } else {
      await (supabase.from('corrective_action_issues') as any)
        .update({
          after_photo_url: afterPhotoUrl,
          action_date: afterPhotoUrl && afterPhotoUrl !== 'N/A' ? new Date().toISOString().split('T')[0] : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', src.entry.id)
    }
  }

  const handleAfterPhotoUpload = async (issue: LedgerIssue, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      alert('파일 크기는 20MB 이하만 가능합니다.')
      return
    }
    setWorkingKey(issue.key)
    try {
      const resized = await resizeImageToJpeg(file)
      const src = issue.source
      let url: string | null = null
      if (src.kind === 'hq') {
        // 본부점검 페이지와 동일 버킷·폴더
        const ext = 'jpg'
        url = await uploadToStorage(resized, 'inspection-photos', `headquarters-actions/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
      } else if (src.kind === 'safety_result') {
        const safeName = resized.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        url = await uploadToStorage(resized, 'safety-inspection-photos', `${projectId}/${Date.now()}_after_${src.resultId}_${encodeURIComponent(safeName)}`)
      } else if (src.kind === 'safety_additional') {
        const safeName = resized.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        url = await uploadToStorage(resized, 'safety-inspection-photos', `${projectId}/${Date.now()}_special_after_${src.itemIndex}_${encodeURIComponent(safeName)}`)
      } else {
        url = await uploadToStorage(resized, 'inspection-photos', `issue-direct/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
      }
      if (!url) throw new Error('업로드 실패')
      await applyAction(issue, url)
      await loadAll()
    } catch (err) {
      console.error(err)
      alert('조치사진 업로드 중 오류가 발생했습니다.')
    } finally {
      setWorkingKey(null)
    }
  }

  const handleToggleNotApplicable = async (issue: LedgerIssue) => {
    setWorkingKey(issue.key)
    try {
      const naValue = issue.source.kind === 'hq' ? '해당 사항 없음' : 'N/A'
      await applyAction(issue, isNaValue(issue.afterPhotoUrl) ? null : naValue)
      await loadAll()
    } catch (err) {
      console.error(err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setWorkingKey(null)
    }
  }

  const handleRemoveAfterPhoto = async (issue: LedgerIssue) => {
    if (!issue.afterPhotoUrl || isNaValue(issue.afterPhotoUrl)) return
    setWorkingKey(issue.key)
    try {
      // 정기점검·직접등록 사진은 Storage에서도 제거 (원본 페이지 관례)
      const url = issue.afterPhotoUrl
      const kind = issue.source.kind
      if (kind === 'safety_result' || kind === 'safety_additional') {
        const path = url.split('/safety-inspection-photos/')[1]
        if (path) await supabase.storage.from('safety-inspection-photos').remove([decodeURIComponent(path)])
      } else if (kind === 'direct') {
        const path = url.split('/inspection-photos/')[1]
        if (path) await supabase.storage.from('inspection-photos').remove([decodeURIComponent(path)])
      }
      await applyAction(issue, null)
      await loadAll()
    } catch (err) {
      console.error(err)
      alert('사진 삭제에 실패했습니다.')
    } finally {
      setWorkingKey(null)
    }
  }

  // 조치내용 인라인 편집 (정기점검 결과 = action_items, 직접 등록건 = action_content)
  const handleSaveActionText = async (issue: LedgerIssue) => {
    setWorkingKey(issue.key)
    try {
      if (issue.source.kind === 'safety_result') {
        await (supabase.from('safety_inspection_results') as any)
          .update({ action_items: tempActionText })
          .eq('id', issue.source.resultId)
      } else if (issue.source.kind === 'direct') {
        await (supabase.from('corrective_action_issues') as any)
          .update({ action_content: tempActionText, updated_at: new Date().toISOString() })
          .eq('id', issue.source.entry.id)
      }
      setEditingActionKey(null)
      await loadAll()
    } catch (err) {
      console.error(err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setWorkingKey(null)
    }
  }

  // ─── 직접 등록 (별지 6호 시정조치요구서 양식) ───────────

  const resetFormPhoto = () => {
    setFormPhoto(null)
    setFormPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const handleFormPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      alert('파일 크기는 20MB 이하만 가능합니다.')
      return
    }
    setFormPhoto(file)
    setFormPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  // 크롭·회전 편집 결과를 새 선택 사진으로 반영 (기존 URL 사진 편집 포함)
  const handleSaveEditedFormPhoto = (blob: Blob) => {
    const file = new File([blob], `edited_${Date.now()}.jpg`, { type: 'image/jpeg' })
    setFormPhoto(file)
    setFormPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setEditingFormPhoto(false)
  }

  const openCreateForm = () => {
    setEditingEntry(null)
    // 점검자 기본값 = 로그인 사용자
    setForm({ ...emptyForm, inspector_name: userProfile?.full_name || '' })
    resetFormPhoto()
    setShowForm(true)
  }

  const openEditForm = (entry: DirectIssue) => {
    setEditingEntry(entry)
    setForm({
      inspection_department_head: entry.inspection_department_head || '',
      inspector_name: entry.inspector_name || '',
      inspection_type: entry.inspection_type || '수시점검',
      inspection_date: entry.inspection_date || new Date().toISOString().split('T')[0],
      location: entry.location || '',
      content: entry.content || '',
    })
    resetFormPhoto()
    setShowForm(true)
  }

  const handleSaveForm = async () => {
    if (!form.content.trim()) {
      alert('점검내용 및 시정조치 요구사항을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      let beforePhotoUrl = editingEntry?.before_photo_url || null
      if (formPhoto) {
        const resized = await resizeImageToJpeg(formPhoto)
        const url = await uploadToStorage(resized, 'inspection-photos', `issue-direct/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
        if (!url) throw new Error('사진 업로드 실패')
        beforePhotoUrl = url
      }
      const payload = {
        inspection_department_head: form.inspection_department_head.trim() || null,
        inspector_name: form.inspector_name.trim() || null,
        inspection_type: form.inspection_type.trim() || null,
        inspection_date: form.inspection_date || null,
        location: form.location.trim() || null,
        content: form.content.trim(),
        before_photo_url: beforePhotoUrl,
      }
      if (editingEntry) {
        const { error } = await (supabase.from('corrective_action_issues') as any)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingEntry.id)
        if (error) throw error
      } else {
        const { error } = await (supabase.from('corrective_action_issues') as any).insert({
          ...payload,
          project_id: projectId,
          created_by: user?.id,
        })
        if (error) throw error
      }
      setShowForm(false)
      await loadAll()
    } catch (err: any) {
      console.error(err)
      alert('저장에 실패했습니다: ' + (err.message || '알 수 없는 오류'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDirect = async (entry: DirectIssue) => {
    try {
      // Storage 사진 정리 후 행 삭제
      for (const url of [entry.before_photo_url, entry.after_photo_url]) {
        if (url && url.startsWith('http')) {
          const path = url.split('/inspection-photos/')[1]
          if (path) await supabase.storage.from('inspection-photos').remove([decodeURIComponent(path)])
        }
      }
      const { error } = await supabase.from('corrective_action_issues').delete().eq('id', entry.id)
      if (error) throw error
      setDeleteConfirmId(null)
      await loadAll()
    } catch (err: any) {
      console.error(err)
      alert('삭제에 실패했습니다: ' + (err.message || '알 수 없는 오류'))
    }
  }

  // ─── 별지 6호 시정조치요구서 다운로드 (지적 1건 = 1문서) ─

  const handleDownloadRequest = async (issue: LedgerIssue) => {
    if (exportingKey) return
    setExportingKey(`req-${issue.key}`)
    try {
      const kind = issue.source.kind
      // 점검내용 및 시정조치 요구사항: 지적부위 + 지적사항 (+ 정기점검의 조치 요구 텍스트)
      let content = issue.findingText || ''
      if (issue.location) content = `(지적부위: ${issue.location})\n${content}`
      if ((kind === 'safety_result' || kind === 'safety_additional') && issue.actionText) {
        content += `\n\n[시정조치 요구사항]\n${issue.actionText}`
      }
      await downloadCorrectiveActionRequestExcel({
        projectName: project?.project_name || '',
        departmentHead: kind === 'direct' ? (issue.source as { kind: 'direct'; entry: DirectIssue }).entry.inspection_department_head : null,
        inspectionType:
          kind === 'hq'
            ? '본부 안전점검'
            : kind === 'direct'
              ? (issue.source as { kind: 'direct'; entry: DirectIssue }).entry.inspection_type
              : issue.sourceLabel,
        inspectorName: issue.inspectorName,
        inspectionDate: issue.inspectionDate,
        content,
        beforePhotoUrl: issue.beforePhotoUrl,
      })
    } catch (err) {
      console.error(err)
      alert('시정조치요구서 다운로드에 실패했습니다.')
    } finally {
      setExportingKey(null)
    }
  }

  // ─── 별지 7호 조치결과 보고 다운로드 ────────────────────

  const handleDownloadReport = async (issue: LedgerIssue) => {
    if (exportingKey) return
    setExportingKey(issue.key)
    try {
      await downloadIssueActionReportExcel({
        projectName: project?.project_name || '',
        contractor: issue.contractor || projectContractor,
        inspectorName: issue.inspectorName,
        inspectionDate: issue.inspectionDate,
        actionDate:
          issue.actionDate ||
          (isNaValue(issue.afterPhotoUrl) ? null : extractUploadDate(issue.afterPhotoUrl)),
        location: issue.location,
        findingText: issue.findingText,
        actionText: issue.actionText,
        beforePhotoUrl: issue.beforePhotoUrl,
        afterPhotoUrl: issue.afterPhotoUrl,
        writerName: issue.writerName,
        confirmerName: issue.confirmerName,
        contractorSignature: issue.contractorSignature,
        supervisorSignature: issue.supervisorSignature,
      })
    } catch (err) {
      console.error(err)
      alert('보고서 다운로드에 실패했습니다.')
    } finally {
      setExportingKey(null)
    }
  }

  // ─── 렌더링 ─────────────────────────────────────────────

  const visibleIssues = useMemo(
    () => (unresolvedOnly ? issues.filter((i) => !isResolved(i)) : issues),
    [issues, unresolvedOnly]
  )
  const unresolvedCount = useMemo(() => issues.filter((i) => !isResolved(i)).length, [issues])

  if (authLoading) {
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

  const roleShort = userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : ''

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center min-w-0">
              <button
                onClick={() => router.push(`/project/${projectId}`)}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {project?.project_name ? `${project.project_name} - ` : ''}지적사항 관리대장
              </h1>
            </div>
            {userProfile?.full_name && (
              <div className="text-sm text-gray-600 flex-shrink-0 ml-2">
                {userProfile.full_name} {roleShort && <span className="text-gray-400">({roleShort})</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="rounded-lg p-3" style={{ backgroundColor: 'rgb(88, 190, 213)' }}>
          <div className="bg-white rounded-lg shadow-inner min-h-[600px] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-700" />
                <h2 className="text-lg font-bold text-gray-900">지적사항 내역</h2>
                <span className="text-sm text-gray-500">
                  총 {issues.length}건 · 미조치 {unresolvedCount}건
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUnresolvedOnly((v) => !v)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    unresolvedOnly ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  미조치만 보기
                </button>
                {canRegister && (
                  <button
                    onClick={openCreateForm}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" /> 지적 등록
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              본부 안전점검·정기점검(해빙기/우기/종합/특별)의 지적사항이 자동으로 표시됩니다. 여기서 등록한 조치는 원본 점검 화면에도 그대로 반영됩니다.
            </p>

            {loading ? (
              <div className="py-20 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : visibleIssues.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                {unresolvedOnly ? '미조치 지적사항이 없습니다.' : '등록된 지적사항이 없습니다.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700">
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">연번</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">출처</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">점검일</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">점검자</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">부위/항목</th>
                      <th className="border border-gray-200 px-2 py-2 min-w-[180px]">지적사항</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">지적사진</th>
                      <th className="border border-gray-200 px-2 py-2 min-w-[140px]">조치내용</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">조치사진</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">상태</th>
                      <th className="border border-gray-200 px-2 py-2 whitespace-nowrap">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIssues.map((issue, idx) => {
                      const resolved = isResolved(issue)
                      const na = isNaValue(issue.afterPhotoUrl)
                      const working = workingKey === issue.key
                      const direct = issue.source.kind === 'direct' ? issue.source.entry : null
                      return (
                        <tr key={issue.key} className="align-top hover:bg-gray-50">
                          <td className="border border-gray-200 px-2 py-2 text-center text-gray-500">{idx + 1}</td>
                          <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs ${
                                issue.sourceLabel === '본부점검'
                                  ? 'bg-purple-100 text-purple-700'
                                  : issue.sourceLabel === '직접등록'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-teal-100 text-teal-700'
                              }`}
                            >
                              {issue.sourceLabel}
                            </span>
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">{issue.inspectionDate || '-'}</td>
                          <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">{issue.inspectorName || '-'}</td>
                          <td className="border border-gray-200 px-2 py-2">{issue.location || '-'}</td>
                          <td className="border border-gray-200 px-2 py-2 whitespace-pre-wrap break-words">{issue.findingText}</td>
                          <td className="border border-gray-200 px-2 py-2 text-center">
                            {issue.beforePhotoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={issue.beforePhotoUrl}
                                alt="지적사진"
                                className="w-20 h-14 object-cover rounded cursor-pointer inline-block"
                                onClick={() => window.open(issue.beforePhotoUrl!, '_blank')}
                              />
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="border border-gray-200 px-2 py-2 whitespace-pre-wrap break-words">
                            {editingActionKey === issue.key ? (
                              <div className="flex flex-col gap-1">
                                <textarea
                                  value={tempActionText}
                                  onChange={(e) => setTempActionText(e.target.value)}
                                  rows={3}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm min-w-[140px]"
                                />
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => setEditingActionKey(null)} className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700">
                                    취소
                                  </button>
                                  <button
                                    onClick={() => handleSaveActionText(issue)}
                                    disabled={working}
                                    className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    저장
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1">
                                <span className="flex-1">{issue.actionText || '-'}</span>
                                {(issue.source.kind === 'safety_result' || issue.source.kind === 'direct') && (
                                  <button
                                    onClick={() => {
                                      setEditingActionKey(issue.key)
                                      setTempActionText(issue.actionText || '')
                                    }}
                                    title="조치내용 편집"
                                    className="p-0.5 text-gray-300 hover:text-blue-600 flex-shrink-0"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center">
                            {working ? (
                              <span className="text-xs text-gray-400">처리중…</span>
                            ) : na ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600">해당 없음</span>
                                <button onClick={() => handleToggleNotApplicable(issue)} className="text-xs text-gray-400 hover:text-gray-600 underline">
                                  취소
                                </button>
                              </div>
                            ) : issue.afterPhotoUrl ? (
                              <div className="flex flex-col items-center gap-1">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={issue.afterPhotoUrl}
                                  alt="조치사진"
                                  className="w-20 h-14 object-cover rounded cursor-pointer inline-block"
                                  onClick={() => window.open(issue.afterPhotoUrl!, '_blank')}
                                />
                                <button onClick={() => handleRemoveAfterPhoto(issue)} className="text-xs text-red-400 hover:text-red-600 underline">
                                  삭제
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700">
                                  <Plus className="h-3 w-3" /> 추가
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAfterPhotoUpload(issue, e)} />
                                </label>
                                <button
                                  onClick={() => handleToggleNotApplicable(issue)}
                                  className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
                                >
                                  <Ban className="h-3 w-3" /> 해당없음
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs ${
                                resolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {resolved ? (na ? '해당없음' : '조치완료') : '조치대기'}
                            </span>
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleDownloadRequest(issue)}
                                disabled={exportingKey === `req-${issue.key}`}
                                title="시정조치요구서 다운로드 (별지 6호)"
                                className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDownloadReport(issue)}
                                disabled={exportingKey === issue.key}
                                title="조치결과 보고 다운로드 (별지 7호)"
                                className="p-1.5 rounded text-green-700 hover:bg-green-50 disabled:opacity-40"
                              >
                                <FileSpreadsheet className="h-4 w-4" />
                              </button>
                              {direct && canRegister && (
                                <button onClick={() => openEditForm(direct)} title="수정" className="p-1.5 rounded text-blue-600 hover:bg-blue-50">
                                  <Edit2 className="h-4 w-4" />
                                </button>
                              )}
                              {direct && user?.id === direct.created_by && (
                                <button onClick={() => setDeleteConfirmId(direct.id)} title="삭제" className="p-1.5 rounded text-red-500 hover:bg-red-50">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <CopyrightNotice />
      </main>

      {/* 직접 등록 모달 (별지 6호 시정조치요구서 양식) */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-gray-900">{editingEntry ? '지적사항 수정' : '지적 등록'} <span className="text-xs font-normal text-gray-400">(별지 6호 시정조치요구서)</span></h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">점검부서장</label>
                  <input
                    type="text"
                    value={form.inspection_department_head}
                    onChange={(e) => setForm({ ...form, inspection_department_head: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">점검의 종류</label>
                  <select
                    value={form.inspection_type}
                    onChange={(e) => setForm({ ...form, inspection_type: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {form.inspection_type && !(DIRECT_INSPECTION_TYPES as readonly string[]).includes(form.inspection_type) && (
                      <option value={form.inspection_type}>{form.inspection_type}</option>
                    )}
                    {DIRECT_INSPECTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">점검자</label>
                  <input
                    type="text"
                    value={form.inspector_name}
                    onChange={(e) => setForm({ ...form, inspector_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">점검일시</label>
                  <input
                    type="date"
                    value={form.inspection_date}
                    onChange={(e) => setForm({ ...form, inspection_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">공사명</label>
                <input type="text" value={project?.project_name || ''} disabled className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">지적부위</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="예: 3공구 옹벽 구간"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  점검내용 및 시정조치 요구사항 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={5}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">지적사진 (시정 전)</label>
                <div className="flex items-center gap-3">
                  {(formPhotoPreview || editingEntry?.before_photo_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={formPhotoPreview || editingEntry!.before_photo_url!}
                      alt="지적사진"
                      title="클릭하여 크롭·회전"
                      className="w-28 h-20 object-cover rounded border border-gray-200 cursor-pointer"
                      onClick={() => setEditingFormPhoto(true)}
                    />
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700">
                      <Upload className="h-4 w-4" />
                      {formPhotoPreview || editingEntry?.before_photo_url ? '사진 변경' : '사진 업로드'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleFormPhotoSelect} />
                    </label>
                    {(formPhotoPreview || editingEntry?.before_photo_url) && (
                      <button
                        type="button"
                        onClick={() => setEditingFormPhoto(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                      >
                        <Crop className="h-4 w-4" /> 크롭·회전
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={handleSaveForm}
                disabled={saving}
                className="px-4 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 지적사진 크롭·회전 편집기 */}
      {editingFormPhoto && (formPhotoPreview || editingEntry?.before_photo_url) && (
        <ImageEditor
          imageUrl={formPhotoPreview || editingEntry!.before_photo_url!}
          onSave={handleSaveEditedFormPhoto}
          onClose={() => setEditingFormPhoto(false)}
        />
      )}

      {/* 직접 등록건 삭제 확인 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5">
            <p className="text-gray-800 mb-4">이 지적사항을 삭제하시겠습니까? 등록된 사진도 함께 삭제됩니다.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-md text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={() => {
                  const entry = issues.find((i) => i.source.kind === 'direct' && i.source.entry.id === deleteConfirmId)
                  if (entry && entry.source.kind === 'direct') handleDeleteDirect(entry.source.entry)
                }}
                className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
