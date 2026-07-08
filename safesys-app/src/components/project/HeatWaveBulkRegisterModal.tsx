'use client'

// 폭염점검 여러 날짜를 시간 구간·확인자·서명으로 한 번에 등록하는 일괄 등록 모달
import React, { useState, useEffect } from 'react'
import { X, CalendarPlus, AlertTriangle, User } from 'lucide-react'
import SignatureModal from './SignatureModal'

interface HeatWaveBulkRegisterModalProps {
  isOpen: boolean
  onClose: () => void
  dates: string[]
  onSave: (data: { hours: number[]; inspectorName: string; signature: string }) => Promise<void>
}

// 슬라이더 값 범위 (시)
const HOUR_MIN = 5
const HOUR_MAX = 20

// 'YYYY-MM-DD' → 'M월 D일'
function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

// 시작~종료(포함) 사이를 2시간 간격으로 측정 시각 배열 생성 (8~17 → 8,10,12,14,16)
function buildMeasureHours(startHour: number, endHour: number): number[] {
  const hours: number[] = []
  for (let h = startHour; h <= endHour; h += 2) {
    hours.push(h)
  }
  return hours
}

export default function HeatWaveBulkRegisterModal({
  isOpen,
  onClose,
  dates,
  onSave,
}: HeatWaveBulkRegisterModalProps) {
  const [step, setStep] = useState<'input' | 'consent'>('input')
  const [startHour, setStartHour] = useState(8)
  const [endHour, setEndHour] = useState(17)
  const [inspectorName, setInspectorName] = useState('')
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 모달이 닫혔다 다시 열릴 때 단계 1로 초기화
  useEffect(() => {
    if (isOpen) {
      setStep('input')
      setStartHour(8)
      setEndHour(17)
      setInspectorName('')
      setShowSignatureModal(false)
      setIsSubmitting(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const sortedDates = [...dates].sort()
  const measureHours = buildMeasureHours(startHour, endHour)

  // 슬라이더 채움 구간 백분율
  const span = HOUR_MAX - HOUR_MIN
  const startPct = ((startHour - HOUR_MIN) / span) * 100
  const endPct = ((endHour - HOUR_MIN) / span) * 100

  const handleStartChange = (value: number) => {
    // 시작은 종료-1 이하로 클램프
    setStartHour(Math.min(value, endHour - 1))
  }

  const handleEndChange = (value: number) => {
    setEndHour(Math.max(value, startHour + 1))
  }

  const handleSubmitStep1 = () => {
    if (!inspectorName.trim()) {
      alert('확인자 이름을 입력해주세요.')
      return
    }
    setStep('consent')
  }

  const handleSignatureSave = async (signature: string) => {
    setIsSubmitting(true)
    try {
      await onSave({ hours: measureHours, inspectorName: inspectorName.trim(), signature })
      // 성공: 내부 상태 초기화 후 닫기
      setShowSignatureModal(false)
      setStep('input')
      onClose()
    } catch (e) {
      // 실패: 알림 후 모달 유지 (서명 모달만 닫아 동의 단계로 복귀)
      alert(e instanceof Error ? e.message : '일괄 등록 중 오류가 발생했습니다.')
      setShowSignatureModal(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            <CalendarPlus className="h-6 w-6 inline mr-2 text-amber-600" />
            폭염점검 일괄 등록
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {step === 'input' ? (
          <>
            {/* 내용 - 입력 단계 */}
            <div className="p-6 space-y-6">
              {/* 선택된 날짜 요약 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">선택된 날짜</label>
                  <span className="text-sm font-semibold text-amber-700">총 {sortedDates.length}일</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-gray-50 rounded-md border border-gray-200">
                  {sortedDates.map((d) => (
                    <span
                      key={d}
                      className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded"
                    >
                      {formatMonthDay(d)}
                    </span>
                  ))}
                </div>
              </div>

              {/* 체감온도 조회 시간 구간 - 듀얼 레인지 슬라이더 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">체감온도 조회 시간 구간</label>
                <div className="relative pt-6">
                  {/* 현재 값 라벨 */}
                  <span
                    className="absolute top-0 -translate-x-1/2 text-xs font-semibold text-blue-700 whitespace-nowrap"
                    style={{ left: `${startPct}%` }}
                  >
                    {startHour}시
                  </span>
                  <span
                    className="absolute top-0 -translate-x-1/2 text-xs font-semibold text-blue-700 whitespace-nowrap"
                    style={{ left: `${endPct}%` }}
                  >
                    {endHour}시
                  </span>
                  {/* 슬라이더 바 */}
                  <div className="relative h-5">
                    {/* 트랙 */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded bg-gray-200" />
                    {/* 채움 구간 */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded bg-blue-500"
                      style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
                    />
                    {/* 시작 핸들 */}
                    <input
                      type="range"
                      min={HOUR_MIN}
                      max={HOUR_MAX}
                      value={startHour}
                      onChange={(e) => handleStartChange(Number(e.target.value))}
                      className="hw-bulk-range absolute inset-0 w-full"
                      aria-label="시작 시각"
                    />
                    {/* 종료 핸들 */}
                    <input
                      type="range"
                      min={HOUR_MIN}
                      max={HOUR_MAX}
                      value={endHour}
                      onChange={(e) => handleEndChange(Number(e.target.value))}
                      className="hw-bulk-range absolute inset-0 w-full"
                      aria-label="종료 시각"
                    />
                  </div>
                </div>

                {/* 측정 시각 미리보기 칩 */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">측정 시각 (2시간 간격)</span>
                    <span className="text-xs font-semibold text-blue-700">총 {measureHours.length}회/일</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {measureHours.map((h) => (
                      <span
                        key={h}
                        className="inline-block px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
                      >
                        {String(h).padStart(2, '0')}시
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 안내 문구 */}
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-800">
                  각 시각의 기상청 관측 체감온도가 자동 입력됩니다. 5대 기본수칙·작업시간 조정은 모두 양호(O)로 등록됩니다.
                </p>
              </div>

              {/* 확인자 이름 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="h-4 w-4 inline mr-1" />
                  확인자 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="확인자 이름을 입력하세요"
                  required
                />
              </div>
            </div>

            {/* 푸터 - 입력 단계 */}
            <div className="flex items-center justify-end space-x-4 p-6 border-t bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                취소
              </button>
              <button
                onClick={handleSubmitStep1}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                제출
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 내용 - 동의 단계 */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center py-6">
                <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
                  <AlertTriangle className="h-9 w-9 text-amber-600" />
                </div>
                <p className="text-lg font-bold text-gray-900 leading-relaxed">
                  폭염 조치에 대한 모든 책임은<br />본인에게 있습니다
                </p>
                <p className="mt-3 text-sm text-gray-500">
                  동의하면 서명 후 선택한 {sortedDates.length}일에 일괄 등록됩니다.
                </p>
              </div>
            </div>

            {/* 푸터 - 동의 단계 */}
            <div className="flex items-center justify-end space-x-4 p-6 border-t bg-gray-50">
              <button
                onClick={() => setStep('input')}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                이전
              </button>
              <button
                onClick={() => setShowSignatureModal(true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-transparent rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                동의
              </button>
            </div>
          </>
        )}
      </div>

      {/* 겹친 레인지 슬라이더 핸들이 각각 조작되도록 pointer-events 제어 */}
      <style>{`
        .hw-bulk-range {
          -webkit-appearance: none;
          appearance: none;
          margin: 0;
          background: transparent;
          pointer-events: none;
        }
        .hw-bulk-range:focus { outline: none; }
        .hw-bulk-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          pointer-events: auto;
          height: 20px;
          width: 20px;
          border-radius: 9999px;
          background: #2563eb;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .hw-bulk-range::-moz-range-thumb {
          pointer-events: auto;
          height: 20px;
          width: 20px;
          border-radius: 9999px;
          background: #2563eb;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .hw-bulk-range::-webkit-slider-runnable-track { background: transparent; }
        .hw-bulk-range::-moz-range-track { background: transparent; }
      `}</style>

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSignatureSave}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
