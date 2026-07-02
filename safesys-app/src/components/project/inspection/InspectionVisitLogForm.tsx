'use client'

// 단속·점검방문 일지 작성/수정 폼 — 별지 제9호 서식 (건설기술 진흥법 시행규칙 제48조)

import React, { useState } from 'react'
import { Building2, CalendarClock, Users, UserCheck, Plus, Trash2 } from 'lucide-react'
import SignatureModal from '@/components/project/SignatureModal'
import {
  InspectionVisitLogFormData,
  VisitorEntry,
  createEmptyVisitor,
} from '@/lib/inspection/inspection-visit-log-types'

interface InspectionVisitLogFormProps {
  formData: InspectionVisitLogFormData
  onChange: (data: InspectionVisitLogFormData) => void
}

// 서명 대상: 방문자(인덱스) 또는 확인자
type SignTarget = { kind: 'visitor'; index: number } | { kind: 'confirmer' } | null

// ③④⑤ 빠른 입력 프리셋 — 방문 유형별 형식적인 기본 문구 (클릭 시 세 칸을 채움)
const QUICK_FILL_PRESETS: Array<{
  label: string
  basis: string // ③ 방문 근거 및 목적
  work: string // ④ 업무 수행내용
  instructions: string // ⑤ 지시사항 또는 특기사항
}> = [
  {
    label: '안전',
    basis: '건설기술 진흥법 제62조에 따른 현장 안전관리 실태 확인',
    work: '현장 안전관리 실태 및 근로자 안전수칙 준수 여부 점검',
    instructions: '안전관리 철저',
  },
  {
    label: '시공',
    basis: '공사 시공 상태 확인 및 공정 관리',
    work: '주요 공종 시공 상태 및 공정 추진 현황 확인',
    instructions: '설계도서에 따른 시공 철저',
  },
  {
    label: '품질',
    basis: '건설기술 진흥법 제55조에 따른 품질관리 실태 확인',
    work: '품질관리 이행 여부 및 주요 자재 품질 확인',
    instructions: '품질관리 기준 준수 철저',
  },
  {
    label: '환경',
    basis: '현장 환경관리 실태 확인',
    work: '비산먼지·소음 등 환경관리 상태 점검',
    instructions: '환경관리 철저',
  },
  {
    label: '공종협의',
    basis: '주요 공종 시공 방안 협의',
    work: '공종별 시공 순서·방법 및 간섭사항 협의',
    instructions: '협의 결과에 따라 시행',
  },
  {
    label: '민원협의',
    basis: '공사 관련 민원 사항 협의',
    work: '민원 내용 확인 및 처리 방안 협의',
    instructions: '민원 처리 결과 확인',
  },
]

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

export default function InspectionVisitLogForm({ formData, onChange }: InspectionVisitLogFormProps) {
  const [signTarget, setSignTarget] = useState<SignTarget>(null)

  const set = <K extends keyof InspectionVisitLogFormData>(
    key: K,
    value: InspectionVisitLogFormData[K]
  ) => {
    onChange({ ...formData, [key]: value })
  }

  const setVisitor = (index: number, patch: Partial<VisitorEntry>) => {
    const visitors = formData.visitors.map((v, i) => (i === index ? { ...v, ...patch } : v))
    onChange({ ...formData, visitors })
  }

  const addVisitor = () => {
    onChange({ ...formData, visitors: [...formData.visitors, createEmptyVisitor()] })
  }

  const removeVisitor = (index: number) => {
    if (formData.visitors.length <= 1) return
    onChange({ ...formData, visitors: formData.visitors.filter((_, i) => i !== index) })
  }

  const handleSignSave = (signatureData: string) => {
    if (!signTarget) return
    if (signTarget.kind === 'visitor') {
      setVisitor(signTarget.index, { signature: signatureData })
    } else {
      set('confirmer_signature', signatureData)
    }
    setSignTarget(null)
  }

  // 서명 버튼/이미지 공통 렌더
  const renderSignature = (signature: string, alt: string, onClick: () => void) =>
    signature ? (
      <button type="button" onClick={onClick} title="다시 서명">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signature} alt={alt} className="h-9 border rounded cursor-pointer hover:opacity-80" />
      </button>
    ) : (
      <button
        type="button"
        onClick={onClick}
        className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
      >
        서명
      </button>
    )

  return (
    <div className="space-y-4">
      {/* ① 공사명 및 발주기관 등 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          ① 공사명 및 발주기관 등
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>공사명</label>
            <input
              type="text"
              value={formData.construction_name}
              onChange={(e) => set('construction_name', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>현장위치</label>
            <input
              type="text"
              value={formData.site_location}
              onChange={(e) => set('site_location', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>발주기관(건축주)</label>
            <input
              type="text"
              value={formData.ordering_agency}
              onChange={(e) => set('ordering_agency', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>공사규모</label>
            <input
              type="text"
              value={formData.construction_scale}
              onChange={(e) => set('construction_scale', e.target.value)}
              placeholder="예: 용수로 1.2km, 교량 1개소"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ②~⑤ 방문 일시·근거·내용 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          ②~⑤ 방문 일시 및 내용
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>② 방문 일자</label>
            <input
              type="date"
              value={formData.visit_date || ''}
              onChange={(e) => set('visit_date', e.target.value || null)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>부터</label>
            <input
              type="time"
              value={formData.visit_time_from}
              onChange={(e) => set('visit_time_from', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>까지</label>
            <input
              type="time"
              value={formData.visit_time_to}
              onChange={(e) => set('visit_time_to', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>③ 방문 근거 및 목적 *</label>
            {/* 빠른 입력 — 방문 유형 버튼 클릭 시 ③④⑤ 기본 문구 채움 */}
            <div className="flex flex-wrap gap-1 mb-1.5">
              {QUICK_FILL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...formData,
                      visit_basis_purpose: preset.basis,
                      work_content: preset.work,
                      instructions: preset.instructions,
                    })
                  }
                  className="px-2 py-1 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  title={`③④⑤에 ${preset.label} 기본 문구 입력`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <textarea
              value={formData.visit_basis_purpose}
              onChange={(e) => set('visit_basis_purpose', e.target.value)}
              rows={2}
              placeholder="방문의 근거가 되는 관계 법령, 지시명령 또는 행정계획과 방문 목적"
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>④ 업무 수행내용</label>
            <textarea
              value={formData.work_content}
              onChange={(e) => set('work_content', e.target.value)}
              rows={3}
              placeholder="업무수행 내용을 개략적으로 작성"
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>⑤ 지시사항 또는 특기사항</label>
            <textarea
              value={formData.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ⑥ 방문자 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            ⑥ 방문자
          </span>
          <button
            type="button"
            onClick={addVisitor}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            방문자 추가
          </button>
        </div>
        <div className="p-3 space-y-3">
          {formData.visitors.map((visitor, index) => (
            <div key={index} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className={labelCls}>소속</label>
                <input
                  type="text"
                  value={visitor.affiliation}
                  onChange={(e) => setVisitor(index, { affiliation: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>직급</label>
                <input
                  type="text"
                  value={visitor.position}
                  onChange={(e) => setVisitor(index, { position: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>성명</label>
                <input
                  type="text"
                  value={visitor.name}
                  onChange={(e) => setVisitor(index, { name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="flex items-center gap-2">
                {renderSignature(visitor.signature, `방문자 ${index + 1} 서명`, () =>
                  setSignTarget({ kind: 'visitor', index })
                )}
                {formData.visitors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVisitor(index)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                    title="방문자 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-gray-400">
            ※ 같은 목적의 방문자가 3명을 초과할 경우 4명째부터는 별지로 출력됩니다.
          </p>
        </div>
      </div>

      {/* ⑦ 확인 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <UserCheck className="h-4 w-4" />
          ⑦ 공사감독원(책임건설사업관리기술자) 또는 현장 배치 건설기술자 확인
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className={labelCls}>소속</label>
            <input
              type="text"
              value={formData.confirmer_affiliation}
              onChange={(e) => set('confirmer_affiliation', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>직책</label>
            <input
              type="text"
              value={formData.confirmer_position}
              onChange={(e) => set('confirmer_position', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>성명</label>
            <input
              type="text"
              value={formData.confirmer_name}
              onChange={(e) => set('confirmer_name', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            {renderSignature(formData.confirmer_signature, '확인자 서명', () =>
              setSignTarget({ kind: 'confirmer' })
            )}
          </div>
        </div>
      </div>

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={signTarget !== null}
        onClose={() => setSignTarget(null)}
        onSave={handleSignSave}
      />
    </div>
  )
}
