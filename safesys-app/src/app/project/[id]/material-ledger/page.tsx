'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Package, Plus, Trash2, X, PenTool, Check, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignaturePad from '@/components/ui/SignaturePad'
import { downloadMaterialLedgerExcel } from '@/lib/excel/material-ledger-export'

// ── 타입 ──

interface Material {
  id: string
  name: string
  unit: string
  rows: MaterialRow[]
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
}

interface RowFormData {
  nameOrSpec: string
  orderQty: string
  receiveDate: string
  receiveQty: string
  passQtyCurrent: string
  failQty: string
  action: string
  releaseDate: string
  releaseQty: string
}

// ── 유틸 ──

// 숫자에 1000단위 콤마 포맷
function formatNumber(value: string): string {
  if (!value || value === '-') return value
  const num = parseFloat(value.replace(/,/g, ''))
  if (isNaN(num)) return value
  return num.toLocaleString()
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

// ── 컴포넌트 ──

export default function MaterialLedgerPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
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
  const [materialForm, setMaterialForm] = useState<{ name: string; unit: string }>({ name: '', unit: '' })

  // 내역 등록/수정 모달
  const [isRowModalOpen, setIsRowModalOpen] = useState(false)
  const [editingRowId, setEditingRowId] = useState<string | null>(null) // null=신규, string=수정
  const [rowForm, setRowForm] = useState<RowFormData>({ nameOrSpec: '', orderQty: '', receiveDate: '', receiveQty: '', passQtyCurrent: '', failQty: '', action: '', releaseDate: '', releaseQty: '' })

  // 감독 서명 모드
  const [signatureMode, setSignatureMode] = useState(false)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false)
  const [isSavingSignature, setIsSavingSignature] = useState(false)

  // 드래그 삭제 상태
  const [draggingMaterialId, setDraggingMaterialId] = useState<string | null>(null)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [isOverTrash, setIsOverTrash] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const trashZoneRef = useRef<HTMLDivElement>(null)
  const wasDragging = useRef(false)

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || null

  useEffect(() => {
    if (user && projectId) {
      loadData()
    }
  }, [user, projectId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      // 프로젝트 조회
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (projectError) throw new Error(projectError.message)
      setProject(projectData)

      // 자재 목록 조회
      const { data: materialsData, error: matError } = await supabase
        .from('materials')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (matError) {
        console.error('Materials load error:', matError)
      }

      // 내역 조회
      const matList: Material[] = (materialsData || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        unit: m.unit || '',
        rows: [],
      }))

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

  const handleBack = () => {
    if (selectedMaterialId) {
      setSelectedMaterialId(null)
    } else {
      router.back()
    }
  }

  // ── 자재 CRUD ──

  const handleAddMaterial = async () => {
    if (!materialForm.name.trim()) return
    try {
      const { data, error: insertError } = await supabase
        .from('materials')
        .insert({
          project_id: projectId,
          name: materialForm.name.trim(),
          unit: materialForm.unit.trim() || null,
          created_by: user?.id,
        })
        .select()
        .single()
      if (insertError) throw insertError
      setMaterials(prev => [...prev, { id: data.id, name: data.name, unit: data.unit || '', rows: [] }])
      setMaterialForm({ name: '', unit: '' })
      setIsMaterialModalOpen(false)
    } catch (err: any) {
      console.error('자재 등록 실패:', err)
      alert('자재 등록에 실패했습니다.')
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
      setMaterials(prev => prev.filter(m => m.id !== id))
    } catch (err: any) {
      console.error('자재 삭제 실패:', err)
      alert('자재 삭제에 실패했습니다.')
    }
  }

  // ── 내역 행 CRUD ──

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
          const firstRow = matchingRows[0]
          const originalOrderQty = parseFloat(firstRow.orderQty) || 0
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

    // 같은 품명/규격의 이전 잔량이 있으면 출고량 기본값에 반영
    let prevRemain = 0
    if (defaultNameOrSpec && rows.length > 0) {
      const matchingRows = rows.filter(row => row.nameOrSpec === defaultNameOrSpec)
      if (matchingRows.length > 0) {
        prevRemain = parseFloat(matchingRows[matchingRows.length - 1].remainQty) || 0
      }
    }
    const defaultReleaseQty = prevRemain !== 0 ? String(prevRemain) : ''

    setEditingRowId(null)
    setRowForm({
      nameOrSpec: defaultNameOrSpec,
      orderQty: defaultOrderQty,
      receiveDate: today, receiveQty: '', passQtyCurrent: '',
      failQty: '-', action: '해당없음', releaseDate: today, releaseQty: defaultReleaseQty,
    })
    setIsRowModalOpen(true)
  }

  const openEditRowModal = (row: MaterialRow) => {
    setEditingRowId(row.id)
    setRowForm({
      nameOrSpec: row.nameOrSpec,
      orderQty: row.orderQty,
      receiveDate: row.receiveDate,
      receiveQty: row.receiveQty,
      passQtyCurrent: row.passQtyCurrent,
      failQty: row.failQty,
      action: row.action,
      releaseDate: row.releaseDate,
      releaseQty: row.releaseQty,
    })
    setIsRowModalOpen(true)
  }

  const calcAutoRelease = (receiveValue: string, nameOrSpec: string, failQtyValue?: string) => {
    const rows = selectedMaterial?.rows || []
    // 같은 품명/규격의 마지막 행에서 잔량 가져오기
    const matchingRows = rows.filter(row => row.nameOrSpec === nameOrSpec)
    const prevRemain = matchingRows.length > 0 ? parseFloat(matchingRows[matchingRows.length - 1].remainQty) || 0 : 0
    const receive = parseFloat(receiveValue) || 0
    // 불합격량 제외 (숫자인 경우만)
    const failQty = parseFloat(failQtyValue || '') || 0
    const total = receive + prevRemain - failQty
    return total !== 0 ? String(total) : ''
  }

  // 품명/규격이 변경되면 발주잔량 및 출고량 자동 계산
  const handleNameOrSpecChange = (value: string) => {
    if (!selectedMaterial) {
      setRowForm(p => ({ ...p, nameOrSpec: value, orderQty: '', releaseQty: '' }))
      return
    }

    // 같은 품명/규격을 가진 기존 행 찾기
    const matchingRows = selectedMaterial.rows.filter(
      row => row.nameOrSpec === value && (!editingRowId || row.id !== editingRowId)
    )

    let newOrderQty = ''
    let prevRemainQty = 0

    if (matchingRows.length > 0) {
      // 같은 품명이 있는 경우: 첫 번째 행의 발주량에서 합격량 누계를 빼서 잔량 계산
      const firstRow = matchingRows[0]
      const originalOrderQty = parseFloat(firstRow.orderQty) || 0

      // 같은 품명의 모든 행의 합격량 누계
      const totalPassed = matchingRows.reduce((sum, row) => {
        return sum + (parseFloat(row.passQtyCurrent) || 0)
      }, 0)

      // 발주잔량 = 발주량 - 합격량 누계
      const remainingQty = originalOrderQty - totalPassed
      newOrderQty = remainingQty > 0 ? String(remainingQty) : ''

      // 같은 품명의 마지막 행의 잔량 (재고)
      prevRemainQty = parseFloat(matchingRows[matchingRows.length - 1].remainQty) || 0
    }

    setRowForm(p => {
      // 현재 반입량을 가져와서 출고량 계산 (불합격량 제외)
      const currentReceiveQty = parseFloat(p.receiveQty) || 0
      const currentFailQty = parseFloat(p.failQty) || 0
      const newReleaseQty = currentReceiveQty + prevRemainQty - currentFailQty

      return {
        ...p,
        nameOrSpec: value,
        orderQty: newOrderQty,
        releaseQty: newReleaseQty !== 0 ? String(newReleaseQty) : ''
      }
    })
  }

  const handleReceiveQtyChange = (value: string) => {
    setRowForm(p => {
      const prevAutoRelease = calcAutoRelease(p.receiveQty, p.nameOrSpec, p.failQty)
      const syncRelease = p.releaseQty === '' || p.releaseQty === prevAutoRelease || p.releaseQty === p.receiveQty
      const syncPass = p.passQtyCurrent === '' || p.passQtyCurrent === p.receiveQty
      const newAutoRelease = calcAutoRelease(value, p.nameOrSpec, p.failQty)
      return {
        ...p,
        receiveQty: value,
        ...(syncRelease ? { releaseQty: newAutoRelease } : {}),
        ...(syncPass ? { passQtyCurrent: value } : {}),
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

      // 출고량 재계산 (불합격량 반영)
      const failQtyNum = parseFloat(newFailQty) || 0
      const newAutoRelease = calcAutoRelease(p.receiveQty, p.nameOrSpec, newFailQty)
      const prevAutoRelease = calcAutoRelease(p.receiveQty, p.nameOrSpec, p.failQty)
      const syncRelease = p.releaseQty === '' || p.releaseQty === prevAutoRelease

      return {
        ...p,
        passQtyCurrent: value,
        failQty: newFailQty,
        ...(syncRelease ? { releaseQty: newAutoRelease } : {}),
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
        })
        .select()
        .single()
      if (insertError) throw insertError

      const newRow: MaterialRow = {
        id: data.id,
        nameOrSpec: rowForm.nameOrSpec,
        orderQty: rowForm.orderQty,
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
        })
        .eq('id', editingRowId)
      if (updateError) throw updateError

      const updatedRow: MaterialRow = {
        id: editingRowId,
        nameOrSpec: rowForm.nameOrSpec,
        orderQty: rowForm.orderQty,
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

  // ── 드래그 삭제 핸들러 ──

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
    }
  }, [draggingMaterialId])

  const handleDragEnd = useCallback(() => {
    if (draggingMaterialId && isOverTrash) {
      // 쓰레기통에 드롭 - 삭제 실행
      handleDeleteMaterial(draggingMaterialId)
    }
    // 상태 초기화
    setDraggingMaterialId(null)
    setDragPosition(null)
    setIsOverTrash(false)
    dragStartPos.current = null
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // 클릭 방지를 위해 잠시 후 wasDragging 초기화
    setTimeout(() => {
      wasDragging.current = false
    }, 100)
  }, [draggingMaterialId, isOverTrash])

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
              <button onClick={() => router.back()} className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
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

  // ── 자재별 테이블 뷰 ──

  if (selectedMaterial) {
    return (
      <div className="min-h-screen" style={{
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d15 50%, #000000 100%)'
      }}>
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
            <div className="flex items-center justify-between px-6 py-3" style={{
              background: 'linear-gradient(180deg, #3a3020 0%, #2a2015 100%)',
              borderBottom: '2px solid #5a4a35'
            }}>
              <span className="text-sm font-medium text-amber-100" style={{ fontFamily: 'serif' }}>
                ⚔ {selectedMaterial.name}{selectedMaterial.unit && <span className="text-amber-200/60 font-normal ml-1">({selectedMaterial.unit})</span>}
                <span className="text-amber-200/40 font-normal ml-2">{selectedMaterial.rows.length}건</span>
              </span>
              <div className="flex items-center gap-2">
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
                      onClick={() => {
                        if (!selectedMaterial) return
                        downloadMaterialLedgerExcel(
                          selectedMaterial.name,
                          selectedMaterial.unit,
                          selectedMaterial.rows,
                          project?.project_name,
                          project?.supervisor_name,
                        )
                      }}
                      className="p-2 rounded transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
                        border: '2px solid #4a4a55',
                        color: '#a8a8b0'
                      }}
                      title="엑셀 다운로드"
                    >
                      <Printer className="h-5 w-5" />
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
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>반입일</th>
                      <th rowSpan={2} className="px-2 py-2 text-center text-xs font-medium text-amber-100 whitespace-nowrap" style={{ border: '1px solid #5a4a55' }}>반입량</th>
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
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{row.nameOrSpec || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.orderQty) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatDate(row.receiveDate) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.receiveQty) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.passQtyCurrent) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.passQtyTotal) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{row.failQty || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{row.action || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90 whitespace-nowrap" style={{ border: '1px solid #3a3a45' }}>{formatDate(row.releaseDate) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.releaseQty) || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-amber-100/90" style={{ border: '1px solid #3a3a45' }}>{formatNumber(row.remainQty) || '-'}</td>
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
                  <input
                    type="text"
                    value={rowForm.nameOrSpec}
                    onChange={e => handleNameOrSpecChange(e.target.value)}
                    placeholder="품명 또는 규격 입력"
                    className="w-full px-3 py-2 rounded text-amber-100 placeholder-amber-200/30 text-sm"
                    style={{
                      background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
                      border: '2px solid #4a4a55',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                    }}
                  />
                </div>

                {/* 발주량 */}
                <div>
                  <label className="block text-sm font-medium text-amber-100 mb-1" style={{ fontFamily: 'serif' }}>발주량(설계량)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
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
                      inputMode="numeric"
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
                      inputMode="numeric"
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
                      inputMode="numeric"
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
      </div>
    )
  }

  // ── 대시보드 (호라드릭 큐브 스타일) ──

  // 자재 타입에 따른 아이콘 색상 (보석/룬 스타일)
  const getMaterialGemStyle = (name: string, index: number) => {
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
    return gemStyles[index % gemStyles.length]
  }

  // 빈 슬롯 생성 (8x4 그리드 = 32슬롯, 최소 표시)
  const totalSlots = Math.max(32, materials.length + 1)
  const emptySlots = totalSlots - materials.length - 1 // -1 for add button

  return (
    <div className="min-h-screen" style={{
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d15 50%, #000000 100%)'
    }}>
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
        const gemStyle = getMaterialGemStyle(mat.name, idx)
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
          <div className="flex items-center h-16">
            <button onClick={handleBack} className="mr-4 p-2 text-amber-200/60 hover:text-amber-200 rounded-md hover:bg-amber-900/20 transition-all">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-800 flex items-center justify-center shadow-lg shadow-amber-900/50 border border-amber-400/50">
                <Package className="h-5 w-5 text-amber-100" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-amber-100" style={{ fontFamily: 'serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  지급자재 수불부
                </h1>
                <p className="text-xs text-amber-200/50">{project?.project_name}</p>
              </div>
            </div>

          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-4">
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
                    onClick={() => { setMaterialForm({ name: '', unit: '' }); setIsMaterialModalOpen(true) }}
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
                    const gemStyle = getMaterialGemStyle(mat.name, idx)
                    const isDragging = draggingMaterialId === mat.id
                    return (
                      <div
                        key={mat.id}
                        className={`relative group select-none ${isDragging ? 'opacity-30' : ''}`}
                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
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
                        </button>
                      </div>
                    )
                  })}

                  {/* 자재 추가 슬롯 */}
                  <button
                    onClick={() => { setMaterialForm({ name: '', unit: '' }); setIsMaterialModalOpen(true) }}
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
                  {Array.from({ length: Math.min(emptySlots, 31) }).map((_, idx) => (
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

      {/* 자재 등록 모달 - 디아블로 스타일 */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setIsMaterialModalOpen(false)}>
          <div
            className="max-w-sm w-full rounded-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a22 50%, #12121a 100%)',
              border: '3px solid #4a3a28',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 40px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)'
            }}
          >
            {/* 상단 금속 테두리 */}
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3" style={{
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

            {/* 본문 */}
            <div className="px-5 py-4 space-y-4">
              {/* 자재명 입력 */}
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  자재명 <span className="text-red-400">*</span>
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

              {/* 구분선 */}
              <div className="h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />

              {/* 단위 입력 */}
              <div>
                <label className="block text-sm font-medium text-amber-100 mb-2" style={{ fontFamily: 'serif' }}>
                  단위
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
            </div>

            {/* 하단 버튼 */}
            <div className="flex gap-3 px-5 py-4" style={{
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
                onClick={handleAddMaterial}
                disabled={!materialForm.name.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: materialForm.name.trim()
                    ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)'
                    : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                  border: '2px solid #6a5a40',
                  borderRadius: '6px',
                  color: '#f5d78e',
                  boxShadow: materialForm.name.trim() ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)' : 'none',
                  fontFamily: 'serif'
                }}
              >
                ⚔ 등록
              </button>
            </div>

            {/* 하단 금속 테두리 */}
            <div className="h-2 bg-gradient-to-r from-amber-900 via-amber-600 to-amber-900" style={{
              boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)'
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
