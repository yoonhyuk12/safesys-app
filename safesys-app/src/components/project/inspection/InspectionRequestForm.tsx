'use client'

import React, { useState } from 'react'
import { ClipboardList, FileCheck, BookOpen } from 'lucide-react'
import SignatureModal from '@/components/project/SignatureModal'
import { InspectionRequestFormData, PassStatus } from '@/lib/inspection/inspection-types'

interface InspectionRequestFormProps {
  formData: InspectionRequestFormData
  onChange: (data: InspectionRequestFormData) => void
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

export default function InspectionRequestForm({ formData, onChange }: InspectionRequestFormProps) {
  const [activeSignType, setActiveSignType] = useState<
    'field_agent_signature' | 'inspector_signature' | 'supervisor_signature' | null
  >(null)

  const set = <K extends keyof InspectionRequestFormData>(key: K, value: InspectionRequestFormData[K]) => {
    onChange({ ...formData, [key]: value })
  }

  // 요청서 번호 변경 시 통보번호도 동일하게 유지 (통보번호를 따로 수정한 경우는 제외)
  const setRequestNo = (value: string) => {
    onChange({
      ...formData,
      request_no: value,
      ...(formData.result_no === formData.request_no ? { result_no: value } : {}),
    })
  }

  return (
    <div className="space-y-4">
      {/* 검측요청서 (별지 제4호) */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          검측요청서 (별지 제4호)
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>번호</label>
            <input
              type="text"
              value={formData.request_no}
              onChange={(e) => setRequestNo(e.target.value)}
              placeholder="예: 1"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>요청일자</label>
            <input
              type="date"
              value={formData.request_date || ''}
              onChange={(e) => set('request_date', e.target.value || null)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>현장대리인</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.field_agent_name}
                onChange={(e) => set('field_agent_name', e.target.value)}
                placeholder="성명"
                className={`${inputCls} max-w-[180px]`}
              />
              {formData.field_agent_signature ? (
                <button type="button" onClick={() => setActiveSignType('field_agent_signature')} title="다시 서명">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.field_agent_signature}
                    alt="현장대리인 서명"
                    className="h-9 border rounded cursor-pointer hover:opacity-80"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSignType('field_agent_signature')}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                >
                  서명
                </button>
              )}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>위치 및 공종 *</label>
            <input
              type="text"
              value={formData.location_and_type}
              onChange={(e) => set('location_and_type', e.target.value)}
              placeholder="예: ○○지구 용수로 구간, 흙쌓기공"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>검측 부위</label>
            <input
              type="text"
              value={formData.inspection_part}
              onChange={(e) => set('inspection_part', e.target.value)}
              placeholder="예: STA.0+200 ~ 0+350"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>검측요구 일자</label>
            <input
              type="date"
              value={formData.requested_datetime}
              onChange={(e) => set('requested_datetime', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>검측 사항</label>
            <textarea
              value={formData.inspection_items}
              onChange={(e) => set('inspection_items', e.target.value)}
              rows={3}
              placeholder="검측을 요청하는 세부 사항"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* 검측대장 (별지 제3호) 항목 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          검측대장 항목 (별지 제3호)
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className={labelCls}>공종</label>
            <input
              type="text"
              value={formData.work_type}
              onChange={(e) => set('work_type', e.target.value)}
              placeholder="예: 토공"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>구조물명</label>
            <input
              type="text"
              value={formData.structure_name}
              onChange={(e) => set('structure_name', e.target.value)}
              placeholder="예: 용수로"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>설계규격</label>
            <input
              type="text"
              value={formData.design_spec}
              onChange={(e) => set('design_spec', e.target.value)}
              placeholder="예: B=600"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>단위</label>
            <input
              type="text"
              value={formData.unit}
              onChange={(e) => set('unit', e.target.value)}
              placeholder="예: m"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>수량</label>
            <input
              type="text"
              value={formData.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              placeholder="예: 150"
              className={inputCls}
            />
          </div>
        </div>
        <p className="px-3 pb-2 text-[11px] text-gray-400">
          ※ 노선명·위치 및 부위는 검측 부위(미입력 시 위치 및 공종)로 대장에 표기됩니다.
        </p>
      </div>

      {/* 검측결과통보 (별지 제4호 하단) */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <FileCheck className="h-4 w-4" />
          검측결과통보
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>통보번호</label>
            <input
              type="text"
              value={formData.result_no}
              onChange={(e) => set('result_no', e.target.value)}
              placeholder="예: 1"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>통보일자</label>
            <input
              type="date"
              value={formData.result_date || ''}
              onChange={(e) => set('result_date', e.target.value || null)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>검측자</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.inspector_name}
                onChange={(e) => set('inspector_name', e.target.value)}
                placeholder="성명"
                className={`${inputCls} max-w-[180px]`}
              />
              {formData.inspector_signature ? (
                <button type="button" onClick={() => setActiveSignType('inspector_signature')} title="다시 서명">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.inspector_signature}
                    alt="검측자 서명"
                    className="h-9 border rounded cursor-pointer hover:opacity-80"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSignType('inspector_signature')}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                >
                  서명
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>합격여부</label>
            <select
              value={formData.pass_status}
              onChange={(e) => set('pass_status', e.target.value as PassStatus)}
              className={inputCls}
            >
              <option value="">미정</option>
              <option value="합격">합격</option>
              <option value="불합격">불합격</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>검측결과</label>
            <textarea
              value={formData.result_content}
              onChange={(e) => set('result_content', e.target.value)}
              rows={2}
              placeholder="검측결과 내용"
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>지시사항</label>
            <textarea
              value={formData.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              rows={2}
              placeholder="지시사항"
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>공사감독원</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.supervisor_name}
                onChange={(e) => set('supervisor_name', e.target.value)}
                placeholder="성명"
                className={`${inputCls} max-w-[180px]`}
              />
              {formData.supervisor_signature ? (
                <button type="button" onClick={() => setActiveSignType('supervisor_signature')} title="다시 서명">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.supervisor_signature}
                    alt="공사감독원 서명"
                    className="h-9 border rounded cursor-pointer hover:opacity-80"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSignType('supervisor_signature')}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                >
                  서명
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={activeSignType !== null}
        onClose={() => setActiveSignType(null)}
        onSave={(signatureData) => {
          if (activeSignType) {
            set(activeSignType, signatureData)
          }
          setActiveSignType(null)
        }}
      />
    </div>
  )
}
