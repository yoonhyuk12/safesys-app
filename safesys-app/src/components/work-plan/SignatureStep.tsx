// 작업계획서 보고서에 들어가는 역할별 손글씨 서명을 수집하는 단계

'use client'

import { useState } from 'react'
import { Eraser, PenLine } from 'lucide-react'
import SignaturePad from '@/components/ui/SignaturePad'
import type {
  PlanType,
  WorkPlanFormData,
  WorkPlanSignatureRole,
  WorkPlanSignatures,
} from '@/lib/work-plan/types'

interface SignatureStepProps {
  selectedTypes: PlanType[]
  formData: WorkPlanFormData
  onChange: (data: WorkPlanFormData) => void
}

interface SignatureSlot {
  type: PlanType
  role: WorkPlanSignatureRole
  roleLabel: string
  name: string
  // 결재란처럼 성명 없이 서명만 받는 항목
  showName?: boolean
}

const TYPE_LABELS: Record<PlanType, string> = {
  loading: '붙임 2-1 차량계 하역운반기계',
  construction: '붙임 2-2 차량계 건설기계',
  electric: '붙임 2-3 전기 작업',
  heavy: '붙임 2-4 중량물 취급',
}

const COMMON_ROLES: Array<{ role: WorkPlanSignatureRole; label: string }> = [
  { role: 'workDirector', label: '작업지휘자' },
  { role: 'operator', label: '운전원' },
  { role: 'guide', label: '유도자' },
]

function buildSlots(selectedTypes: PlanType[], formData: WorkPlanFormData): SignatureSlot[] {
  const slots: SignatureSlot[] = []
  selectedTypes.forEach((type) => {
    if (formData[type]) {
      slots.push(
        { type, role: 'approvalManager', roleLabel: '결재란 담당', name: '', showName: false },
        { type, role: 'approvalApprover', roleLabel: '결재란 승인', name: '', showName: false },
      )
    }
    if (type === 'electric') {
      const form = formData.electric
      if (!form) return
      slots.push(
        { type, role: 'instructionManager', roleLabel: '지시·협의 담당자', name: form.instructionAcknowledgement?.managerName || '' },
        { type, role: 'instructionWorker', roleLabel: '지시·협의 작업자', name: form.instructionAcknowledgement?.workerName || '' },
        { type, role: 'handoverDeliverer', roleLabel: '인계자', name: form.handover?.deliverer || '' },
        { type, role: 'handoverReceiver', roleLabel: '인수자', name: form.handover?.receiver || '' },
      )
      return
    }
    const form = formData[type]
    if (!form) return
    COMMON_ROLES.forEach(({ role, label }) => {
      const person = form[role as 'workDirector' | 'operator' | 'guide']
      slots.push({ type, role, roleLabel: label, name: person?.name || '' })
    })
  })
  return slots
}

export default function SignatureStep({ selectedTypes, formData, onChange }: SignatureStepProps) {
  const [activeSlot, setActiveSlot] = useState<SignatureSlot | null>(null)

  const getSignatures = (type: PlanType): WorkPlanSignatures => formData[type]?.signatures || {}

  // 서명 단계에서 고친 성명을 원래 입력 위치(기본정보·전기 지시확인/인계인수)에 반영한다
  const updateName = (slot: SignatureSlot, name: string) => {
    if (slot.type === 'electric') {
      const form = formData.electric
      if (!form) return
      if (slot.role === 'instructionManager' || slot.role === 'instructionWorker') {
        const key = slot.role === 'instructionManager' ? 'managerName' : 'workerName'
        onChange({ ...formData, electric: { ...form, instructionAcknowledgement: { ...form.instructionAcknowledgement, [key]: name } } })
      } else if (slot.role === 'handoverDeliverer' || slot.role === 'handoverReceiver') {
        const key = slot.role === 'handoverDeliverer' ? 'deliverer' : 'receiver'
        onChange({ ...formData, electric: { ...form, handover: { ...form.handover, [key]: name } } })
      }
      return
    }
    const form = formData[slot.type]
    if (!form || (slot.role !== 'workDirector' && slot.role !== 'operator' && slot.role !== 'guide')) return
    onChange({ ...formData, [slot.type]: { ...form, [slot.role]: { ...form[slot.role], name } } } as WorkPlanFormData)
  }

  const applySignature = (slot: SignatureSlot, dataUrl: string | null) => {
    const current = formData[slot.type]
    if (!current) return
    const signatures = { ...(current.signatures || {}) }
    if (dataUrl) signatures[slot.role] = dataUrl
    else delete signatures[slot.role]
    onChange({ ...formData, [slot.type]: { ...current, signatures } } as WorkPlanFormData)
  }

  const slots = buildSlots(selectedTypes, formData)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">보고서에 들어갈 서명을 받아주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">서명은 보고서의 성명 위에 겹쳐 출력됩니다. 비워두면 성명만 출력되며, 나중에 수정에서 이어서 서명할 수 있습니다.</p>
      </div>
      {selectedTypes.map((type) => {
        const typeSlots = slots.filter((slot) => slot.type === type)
        if (typeSlots.length === 0) return null
        const signatures = getSignatures(type)
        return (
          <div key={type} className="space-y-3 rounded-xl border-2 border-blue-100 bg-blue-50/30 p-3 sm:p-4">
            <div className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">{TYPE_LABELS[type]}</div>
            <div className="grid gap-2 lg:grid-cols-2">
              {typeSlots.map((slot) => {
                const signature = signatures[slot.role]
                return (
                  <div key={`${slot.type}-${slot.role}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-gray-500">{slot.roleLabel}</span>
                      {slot.showName !== false && (
                        <input
                          value={slot.name}
                          onChange={(event) => updateName(slot, event.target.value)}
                          placeholder="성명 입력"
                          aria-label={`${slot.roleLabel} 성명`}
                          className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-gray-800 placeholder:font-normal placeholder:text-gray-400 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none"
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {signature && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={signature} alt={`${slot.roleLabel} 서명`} className="h-9 w-16 rounded border border-gray-200 bg-white object-contain" />
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveSlot(slot)}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${signature ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                      >
                        <PenLine className="h-3.5 w-3.5" />
                        {signature ? '다시 서명' : '서명하기'}
                      </button>
                      {signature && (
                        <button
                          type="button"
                          onClick={() => applySignature(slot, null)}
                          className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          aria-label={`${slot.roleLabel} 서명 지우기`}
                        >
                          <Eraser className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {activeSlot && (
        <SignaturePad
          title={`${activeSlot.roleLabel} ${activeSlot.name || ''} 서명`.trim()}
          onSave={(dataUrl) => {
            applySignature(activeSlot, dataUrl)
            setActiveSlot(null)
          }}
          onCancel={() => setActiveSlot(null)}
        />
      )}
    </div>
  )
}
