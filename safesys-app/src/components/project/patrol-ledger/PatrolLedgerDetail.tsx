// 순회점검 양식 순서로 저장한 항목·지적사항·점검자 서명을 보여준다.
import { PATROL_LEDGER_PHOTO_KIND_LABELS, type PatrolLedgerInspection } from '@/lib/patrol-ledger/types'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function PatrolLedgerDetail({ record, canEdit, canDelete, busy, downloading, onBack, onEdit, onDelete, onDownload }: {
  record: PatrolLedgerInspection
  canEdit: boolean
  canDelete: boolean
  busy: boolean
  downloading: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onDownload: () => void
}) {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button disabled={busy} onClick={onBack} className="min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">목록으로</button>
      <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={onDownload} className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">HWPX 다운로드</button>
      {canEdit && <button disabled={busy} onClick={onEdit} className="min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">수정</button>}
      {canDelete && <button disabled={busy} onClick={onDelete} className="min-h-[44px] px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">삭제</button>}
      </div>
    </div>
    {downloading && <LoadingSpinner />}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <h2 className="p-4 bg-gray-50 border-b border-gray-200 text-lg font-semibold text-gray-900 text-center">작업장 순회 점검표{record.contractor_name && `(${record.contractor_name})`}</h2>
      <table className="w-full border-collapse">
        <thead className="bg-gray-50 border-b border-gray-200"><tr>{['No.', '점검사항', '점검결과'].map(label => <th key={label} className="px-3 py-3 border-r border-gray-200 last:border-r-0 text-center text-xs font-medium text-gray-500">{label}</th>)}</tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">{Array.from({ length: 10 }, (_, index) => {
          const item = record.items[index]
          return <tr key={index} className="even:bg-gray-50">
            <td className="w-12 px-3 py-3 border-r border-gray-200 text-sm text-center font-medium text-gray-500">{item?.no ?? index + 1}</td>
            <td className="px-3 py-3 border-r border-gray-200 text-sm text-left text-gray-900">{item ? `(${item.category}) ${item.text}` : '—'}</td>
            <td className="w-24 px-3 py-3 text-sm text-center"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${item?.result === '미흡' ? 'bg-red-100 text-red-800' : item?.result === '양호' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{item?.result || '미점검'}</span></td>
          </tr>
        })}</tbody>
      </table>
      <div className="grid sm:grid-cols-2 gap-4 p-4 border-t border-gray-200">
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200"><h3 className="pb-2 border-b border-gray-200 text-sm font-medium text-gray-700 mb-2">{PATROL_LEDGER_PHOTO_KIND_LABELS[record.finding_photo_kind] ?? '지적사진'}</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {record.finding_photo_url ? <img src={record.finding_photo_url} alt={PATROL_LEDGER_PHOTO_KIND_LABELS[record.finding_photo_kind] ?? '점검사진'} className="max-h-64 max-w-full object-contain" /> : <p className="text-sm text-gray-500">사진 없음</p>}
        </div>
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200"><h3 className="pb-2 border-b border-gray-200 text-sm font-medium text-gray-700 mb-2">지적사항</h3><p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{record.finding_photo_kind === 'overview' ? '전경사진 (지적사항 없음)' : record.finding_text || '없음'}</p></div>
      </div>
      {record.finding_photo_kind === 'finding' && record.finding_text.trim() && <div className="grid sm:grid-cols-2 gap-4 px-4 pb-4">
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200"><h3 className="pb-2 border-b border-gray-200 text-sm font-medium text-gray-700 mb-2">조치사진 (지적사항 관리대장)</h3>
          {record.action_photo_url && record.action_photo_url !== 'N/A'
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={record.action_photo_url} alt="조치사진" className="max-h-64 max-w-full object-contain" />
            : <p className="text-sm text-gray-500">{record.action_photo_url === 'N/A' ? '해당없음' : '조치대기'}</p>}
        </div>
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200"><h3 className="pb-2 border-b border-gray-200 text-sm font-medium text-gray-700 mb-2">조치내용{record.action_date ? ` (${record.action_date})` : ''}</h3><p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{record.action_text || '없음'}</p></div>
      </div>}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px border-t border-gray-200 bg-gray-200">
        {[
          ['점검일자', record.inspection_date], ['지구명', record.district_name], ['점검자 소속', record.inspector_affiliation],
          ['직급', record.inspector_position], ['성명', record.inspector_name], ['주요 테마', record.theme],
        ].map(([label, value]) => <div key={label} className="bg-white p-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-sm font-medium text-gray-900 break-words">{value || '—'}</dd></div>)}
        <div className="bg-white p-3"><dt className="text-xs text-gray-500">서명</dt><dd>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={record.signature} alt="점검자 서명" className="h-16 max-w-full object-contain" />
        </dd></div>
      </dl>
    </div>
  </div>
}
