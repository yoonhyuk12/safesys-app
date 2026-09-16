'use client'
// 사고발생보고서 추가 항목(보고 개요·피해·신고조치·특이사항·사진대지) 입력 섹션 묶음

import {
  ACCIDENT_NOTIFICATION_OPTIONS,
  ACCIDENT_REPORT_TEXT_LABELS,
  ACCIDENT_VICTIM_ACTION_OPTIONS,
  maxLengthOfReportText,
  type AccidentNotificationTarget,
  type AccidentReportDetails,
  type AccidentReportTextKey,
  type AccidentVictimAction,
} from '@/lib/accident-report'
import AccidentReportPhotoField from '@/components/project/accident-report/AccidentReportPhotoField'
import {
  accidentReportInputClassName,
  accidentReportLabelClassName,
  accidentReportSectionTitleClassName,
} from '@/components/project/accident-report/accident-report-form-styles'

interface AccidentReportFormSectionsProps {
  details: AccidentReportDetails
  disabled: boolean
  /** 최신 항목에서 다음 항목을 계산하는 함수를 넘긴다. 비동기 처리 중 다른 칸을 되돌리지 않는다. */
  onChange: (update: (current: AccidentReportDetails) => AccidentReportDetails) => void
  /** 사진 압축이 도는 동안 참. */
  onPhotoBusyChange?: (busy: boolean) => void
}

type FieldKind = 'text' | 'textarea' | 'date' | 'time'

const FIELD_KINDS: Record<AccidentReportTextKey, FieldKind> = {
  reportTitle: 'text',
  reportDate: 'date',
  reporterName: 'text',
  reporterPosition: 'text',
  reporterPhone: 'text',
  summary: 'textarea',
  accidentTime: 'time',
  victimDetails: 'textarea',
  damageDetails: 'textarea',
  propertyDamage: 'textarea',
  responsibility: 'textarea',
  noNotificationReason: 'textarea',
  compensationDetails: 'textarea',
  actionDetails: 'textarea',
  otherNotes: 'textarea',
  relatedContacts: 'textarea',
}

interface TextFieldProps {
  fieldKey: AccidentReportTextKey
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

function ReportTextField({ fieldKey, value, disabled, onChange }: TextFieldProps) {
  const id = `accident-report-${fieldKey}`
  const kind = FIELD_KINDS[fieldKey]
  const label = ACCIDENT_REPORT_TEXT_LABELS[fieldKey]
  const maxLength = maxLengthOfReportText(fieldKey)

  return (
    <div className={kind === 'textarea' ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className={accidentReportLabelClassName}>{label}</label>
      {kind === 'textarea' ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          aria-label={label}
          className={`${accidentReportInputClassName} min-h-20 resize-y`}
        />
      ) : (
        <input
          id={id}
          type={kind === 'date' ? 'date' : kind === 'time' ? 'time' : 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          aria-label={label}
          className={accidentReportInputClassName}
        />
      )}
    </div>
  )
}

interface CheckboxGroupProps<T extends string> {
  name: string
  legend: string
  options: ReadonlyArray<{ value: T; label: string }>
  selected: T[]
  disabled: boolean
  onChange: (next: T[]) => void
}

function CheckboxGroup<T extends string>({ name, legend, options, selected, disabled, onChange }: CheckboxGroupProps<T>) {
  const toggle = (value: T, checked: boolean) => {
    // 선택 순서는 옵션 순서로 고정해 저장값이 흔들리지 않게 한다.
    const next = options
      .map((option) => option.value)
      .filter((option) => (option === value ? checked : selected.includes(option)))
    onChange(next)
  }

  return (
    <fieldset className="sm:col-span-2">
      <legend className={accidentReportLabelClassName}>{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => {
          const id = `accident-report-${name}-${option.value}`
          return (
            <label key={option.value} htmlFor={id} className="min-h-[44px] inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                id={id}
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={(event) => toggle(option.value, event.target.checked)}
                disabled={disabled}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-3 border-t border-gray-100 pt-4">
      <h3 className={accidentReportSectionTitleClassName}>{title}</h3>
      {children}
    </section>
  )
}

export default function AccidentReportFormSections({ details, disabled, onChange, onPhotoBusyChange }: AccidentReportFormSectionsProps) {
  const setText = (key: AccidentReportTextKey, value: string) => {
    onChange((current) => ({ ...current, [key]: value }))
  }

  const renderFields = (keys: AccidentReportTextKey[]) =>
    keys.map((key) => (
      <ReportTextField
        key={key}
        fieldKey={key}
        value={details[key]}
        disabled={disabled}
        onChange={(value) => setText(key, value)}
      />
    ))

  return (
    <div className="space-y-4">
      <Section title="보고 개요">
        <div className="grid gap-4 sm:grid-cols-2">
          {renderFields(['reportTitle', 'reportDate', 'reporterName', 'reporterPosition', 'reporterPhone', 'summary'])}
        </div>
      </Section>

      <Section title="사고 시각·피해">
        <div className="grid gap-4 sm:grid-cols-2">
          {renderFields(['accidentTime', 'victimDetails', 'damageDetails', 'propertyDamage'])}
          <CheckboxGroup<AccidentVictimAction>
            name="victimActions"
            legend="피해자 조치"
            options={ACCIDENT_VICTIM_ACTION_OPTIONS}
            selected={details.victimActions}
            disabled={disabled}
            onChange={(victimActions) => onChange((current) => ({ ...current, victimActions }))}
          />
        </div>
      </Section>

      <Section title="신고·조치">
        <div className="grid gap-4 sm:grid-cols-2">
          <CheckboxGroup<AccidentNotificationTarget>
            name="notifications"
            legend="신고처"
            options={ACCIDENT_NOTIFICATION_OPTIONS}
            selected={details.notifications}
            disabled={disabled}
            onChange={(notifications) => onChange((current) => ({ ...current, notifications }))}
          />
          {renderFields(['noNotificationReason', 'actionDetails', 'responsibility', 'compensationDetails'])}
        </div>
      </Section>

      <Section title="특이사항·연락처">
        <div className="grid gap-4 sm:grid-cols-2">
          {renderFields(['otherNotes', 'relatedContacts'])}
        </div>
      </Section>

      <Section title="사진대지">
        <AccidentReportPhotoField
          photos={details.photos}
          disabled={disabled}
          onChange={(update) => onChange((current) => ({ ...current, photos: update(current.photos) }))}
          onBusyChange={onPhotoBusyChange}
        />
      </Section>
    </div>
  )
}
