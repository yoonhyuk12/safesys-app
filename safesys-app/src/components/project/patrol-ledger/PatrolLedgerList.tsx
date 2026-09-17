// 순회점검 기록의 날짜·점검자·미흡 건수와 지적사항 유무를 표시한다.
import type { PatrolLedgerInspection } from '@/lib/patrol-ledger/types'
import { Download, Plus } from 'lucide-react'

export default function PatrolLedgerList({ records, onSelect, onStartInspection, startDisabled, onDownload, downloadDisabled }: {
  records: PatrolLedgerInspection[]
  onSelect: (record: PatrolLedgerInspection) => void
  onStartInspection: () => void
  startDisabled: boolean
  onDownload: (record: PatrolLedgerInspection) => void
  downloadDisabled: boolean
}) {
  return <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <div className="bg-blue-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold text-sm sm:text-base truncate">제출 목록</h2>
      {records.length > 0 && <button type="button" disabled={startDisabled} onClick={onStartInspection} className="min-h-[44px] flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium shrink-0 disabled:opacity-50"><Plus className="h-4 w-4" />점검하기</button>}
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200"><tr>
          {['점검일', '점검자', '미흡', '주요 테마', '지적사항', '관리'].map(label => <th key={label} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</th>)}
        </tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">{records.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center">
          <p className="text-sm text-gray-500 mb-4">등록된 점검이 없습니다. 새 점검을 작성해주세요.</p>
          <button type="button" disabled={startDisabled} onClick={onStartInspection} className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-1 mx-auto disabled:opacity-50"><Plus className="h-4 w-4" />점검하기</button>
        </td></tr> : records.map(record => <tr key={record.id} onClick={() => onSelect(record)} className="hover:bg-gray-50 cursor-pointer">
          <td className="px-3 py-3 text-sm text-center"><button onClick={() => onSelect(record)} className="min-h-[44px] text-blue-600 underline" aria-label={`${record.inspection_date} ${record.inspector_name} 점검 상세`}>{record.inspection_date}</button></td>
          <td className="px-3 py-3 text-sm text-center text-gray-900">{record.inspector_name}</td>
          <td className="px-3 py-3 text-sm text-center">{record.items.filter(item => item.result === '미흡').length}건</td>
          <td className="px-3 py-3 text-sm text-center truncate max-w-[12rem]" title={record.theme || undefined}>{record.theme || '—'}</td>
          <td className="px-3 py-3 text-sm text-center">{record.finding_text.trim() ? '있음' : '없음'}</td>
          <td className="px-3 py-3 text-xs text-center">
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button type="button" aria-label="HWPX 다운로드" title="HWPX 다운로드" disabled={downloadDisabled} onClick={event => { event.stopPropagation(); onDownload(record) }} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm disabled:opacity-50"><Download className="h-4 w-4" /></button>
            </div>
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
