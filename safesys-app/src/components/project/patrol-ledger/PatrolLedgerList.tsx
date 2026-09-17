// 순회점검 기록의 날짜·점검자·미흡 건수와 지적사항 유무를 표시한다.
import type { PatrolLedgerInspection } from '@/lib/patrol-ledger/types'

export default function PatrolLedgerList({ records, onSelect }: {
  records: PatrolLedgerInspection[]
  onSelect: (record: PatrolLedgerInspection) => void
}) {
  if (!records.length) return <p className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500">등록된 점검이 없습니다. 새 점검을 작성해주세요.</p>
  return <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200"><tr>
          {['점검일', '점검자', '미흡', '주요 테마', '지적사항'].map(label => <th key={label} className="px-3 py-3 text-center text-xs font-medium text-gray-500">{label}</th>)}
        </tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">{records.map(record => <tr key={record.id} onClick={() => onSelect(record)} className="hover:bg-gray-50 cursor-pointer">
          <td className="px-3 py-3 text-sm text-center"><button onClick={() => onSelect(record)} className="min-h-[44px] text-blue-600 underline" aria-label={`${record.inspection_date} ${record.inspector_name} 점검 상세`}>{record.inspection_date}</button></td>
          <td className="px-3 py-3 text-sm text-center text-gray-900">{record.inspector_name}</td>
          <td className="px-3 py-3 text-sm text-center">{record.items.filter(item => item.result === '미흡').length}건</td>
          <td className="px-3 py-3 text-sm text-center truncate max-w-[12rem]" title={record.theme || undefined}>{record.theme || '—'}</td>
          <td className="px-3 py-3 text-sm text-center">{record.finding_text.trim() ? '있음' : '없음'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
