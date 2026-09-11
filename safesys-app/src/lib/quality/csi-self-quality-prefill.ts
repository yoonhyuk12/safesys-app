// CSI 자체 품질시험 실적을 실시대장 입력값으로 변환한다.
import type { CsiSelfQualityDetail } from './csi-self-quality-types'
import { createEmptyQualityTestCommon, createEmptyQualityTestItem, type TestVerdict } from './quality-test-types'

const dateValue = (value: string): string | null => {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

const verdictValue = (value: string): TestVerdict => {
  if (['합격', '적합'].includes(value.trim())) return '합격'
  if (['불합격', '부적합'].includes(value.trim())) return '불합격'
  return value.trim() === '재시험' ? '재시험' : ''
}

export const prefillCsiSelfQuality = (detail: CsiSelfQualityDetail, supervisorName = '') => ({
  common: createEmptyQualityTestCommon({
    test_date: dateValue(detail.items[0]?.testDate || ''),
    test_category: '자체(관리)시험',
    target_material: detail.materialName,
    supplier_factory: detail.producerName,
    test_place: detail.testPlace,
    quality_engineer_name: detail.testerName,
    supervision_engineer_name: supervisorName,
    note: [`CSI 자체 품질시험 ${detail.reportNo || detail.groupNo}`, detail.note].filter(Boolean).join('\n'),
  }),
  items: detail.items.map((item) => ({
    ...createEmptyQualityTestItem({
      test_item: item.testItem,
      test_standard: item.testStandard,
      test_result: item.testResult.replace(/\r\n|\r|\n/g, ' / '),
      result_verdict: verdictValue(item.verdict),
    }),
    test_date: dateValue(item.testDate),
  })),
})
