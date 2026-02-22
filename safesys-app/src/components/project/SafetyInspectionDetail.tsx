'use client'

import React, { useState, useEffect } from 'react'
import { X, FileText, Edit } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'

interface Props {
    inspectionId: string
    project: Project | null
    onClose: () => void
    onEdit: (id: string) => void
    onExport: (id: string) => void
}

const PHOTO_TYPE_LABELS: Record<string, string> = {
    site_before: '점검 전경',
    finding_before: '지적사항 (조치 전)',
    good_example: '수범사례'
}

export default function SafetyInspectionDetail({ inspectionId, project, onClose, onEdit, onExport }: Props) {
    const [inspection, setInspection] = useState<any>(null)
    const [results, setResults] = useState<any[]>([])
    const [photos, setPhotos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [inspectionId])

    const loadData = async () => {
        setLoading(true)
        const { data: ins } = await supabase.from('safety_inspections').select('*').eq('id', inspectionId).single()
        const { data: res } = await supabase.from('safety_inspection_results').select('*').eq('inspection_id', inspectionId).order('sort_order')
        const { data: pht } = await supabase.from('safety_inspection_photos').select('*').eq('inspection_id', inspectionId).order('sort_order')
        if (ins) setInspection(ins)
        if (res) setResults(res)
        if (pht) setPhotos(pht)
        setLoading(false)
    }

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-8"><p className="text-gray-500">불러오는 중...</p></div>
            </div>
        )
    }

    if (!inspection) return null

    return (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl">
                    <h2 className="text-lg font-bold text-gray-900">
                        건설현장 점검카드 - {inspection.inspection_type}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onEdit(inspectionId)} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-sm hover:bg-orange-100">
                            <Edit className="h-4 w-4" /> 수정
                        </button>
                        <button onClick={() => onExport(inspectionId)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100">
                            <FileText className="h-4 w-4" /> PDF
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
                    </div>
                </div>

                <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-6">
                    {/* 1. 점검개요 */}
                    <section>
                        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">1. 점검개요</h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                            <div><span className="text-gray-500">점검일시:</span> <span className="font-medium">{inspection.inspection_date}</span></div>
                            <div><span className="text-gray-500">점검유형:</span> <span className="font-medium">{inspection.inspection_type}</span></div>
                            {(() => {
                                const teamFromSignatures = inspection.signatures?.filter((s: any) => s.role === '점검자').map((s: any) => `${s.position} ${s.name}`.trim()).filter((s: string) => s).join(', ');
                                const displayTeam = teamFromSignatures || inspection.inspection_team;
                                return displayTeam ? (
                                    <div className="col-span-2"><span className="text-gray-500">점검반:</span> <span className="font-medium">{displayTeam}</span></div>
                                ) : null;
                            })()}
                        </div>

                        {/* 점검지구 현황 모바일 친화적 카드 레이아웃 */}
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">관리주체</span>
                                <span className="text-sm font-medium text-gray-800">{inspection.management_entity || '-'}</span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">지구명</span>
                                <span className="text-sm font-medium text-gray-800">{inspection.district_name || '-'}</span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">위치 (도/시군)</span>
                                <span className="text-sm font-medium text-gray-800">
                                    {inspection.location_province || '-'} {inspection.location_city || '-'}
                                </span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">총사업비 (백만원)</span>
                                <span className="text-sm font-medium text-gray-800">{inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : '-'}</span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">공정율 (%)</span>
                                <span className="text-sm font-medium text-gray-800">{inspection.progress_rate ? `${inspection.progress_rate}%` : '-'}</span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">착공 / 준공(예정)</span>
                                <span className="text-sm font-medium text-gray-800">
                                    {inspection.construction_start || '-'} ~ {inspection.construction_end_planned || '-'}
                                </span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">주요공종</span>
                                <span className="text-sm font-medium text-gray-800">{inspection.major_work_type || '-'}</span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">비고 (시공사)</span>
                                <span className="text-sm font-medium text-gray-800">{inspection.contractor || '-'}</span>
                            </div>
                        </div>
                    </section>

                    {/* 2. 점검결과 */}
                    <section>
                        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">2. 점검결과</h3>
                        {results.length > 0 ? (
                            <div className="space-y-4">
                                {results.map((r, i) => (
                                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="flex flex-col md:w-1/4 shrink-0 gap-3">
                                                <div>
                                                    <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-md border border-blue-100">
                                                        {r.field_item}
                                                    </span>
                                                </div>
                                                <div className="w-full">
                                                    {r.photo_url ? (
                                                        <img src={r.photo_url} alt="지적사항 사진" className="w-full h-40 md:h-32 object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setEnlargedPhoto(r.photo_url)} />
                                                    ) : (
                                                        <div className="w-full h-40 md:h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                                                            사진 없음
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col md:flex-row md:w-3/4 gap-4">
                                                <div className="flex-1 bg-gray-50/50 rounded-lg p-3 border border-gray-100">
                                                    <h4 className="text-xs font-semibold text-gray-600 mb-2 border-b border-gray-200 pb-1">지적사항 (수범사례)</h4>
                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.findings || '-'}</p>
                                                </div>
                                                <div className="flex-1 bg-gray-50/50 rounded-lg p-3 border border-gray-100">
                                                    <h4 className="text-xs font-semibold text-gray-600 mb-2 border-b border-gray-200 pb-1">조치할 사항</h4>
                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.action_items || '-'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">점검결과가 없습니다.</p>
                        )}
                    </section>

                    {/* 3. 사진 */}
                    <section>
                        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">3. 점검사진</h3>
                        {photos.length > 0 ? (
                            <div className="space-y-4">
                                {Object.entries(PHOTO_TYPE_LABELS).map(([type, label]) => {
                                    const typePhotos = photos.filter((p: any) => p.photo_type === type)
                                    if (typePhotos.length === 0) return null
                                    return (
                                        <div key={type}>
                                            <h4 className="text-sm font-semibold text-gray-600 mb-2">{label}</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {typePhotos.map((p: any, i: number) => (
                                                    <div key={i} className="space-y-1">
                                                        <img
                                                            src={p.photo_url} alt={p.description || label}
                                                            className="w-full h-40 object-cover rounded-lg border cursor-pointer hover:opacity-90"
                                                            onClick={() => setEnlargedPhoto(p.photo_url)}
                                                        />
                                                        {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">첨부된 사진이 없습니다.</p>
                        )}
                    </section>

                    {/* 4. 점검자 의견 (및 수범사례) */}
                    <section>
                        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">4. 점검자 의견 및 수범사례</h3>
                        <div className="space-y-4">
                            {inspection.good_example_content && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-1">수범사례 내용</h4>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4">
                                        {inspection.good_example_content}
                                    </p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-1">종합의견</h4>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4">
                                    {inspection.inspector_opinion || '의견이 없습니다.'}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 5. 참석자 서명 */}
                    <section>
                        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">5. 참석자 서명</h3>
                        {inspection.signatures && inspection.signatures.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {inspection.signatures.map((sig: any, index: number) => (
                                    <div key={index} className="border border-gray-200 bg-gray-50/50 rounded-lg p-3 text-center">
                                        <div className="text-xs font-semibold text-gray-700 mb-1">{sig.role}</div>
                                        <div className="text-[11px] text-gray-500 mb-2">{sig.position} {sig.name}</div>
                                        <div className="bg-white border border-gray-200 rounded h-16 flex items-center justify-center p-1">
                                            {sig.dataUrl ? (
                                                <img src={sig.dataUrl} alt="서명" className="h-full object-contain mix-blend-multiply" />
                                            ) : (
                                                <span className="text-[10px] text-gray-400">서명 없음</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">등록된 서명이 없습니다.</p>
                        )}
                    </section>
                </div>
            </div>

            {/* 사진 확대 보기 */}
            {enlargedPhoto && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]" onClick={() => setEnlargedPhoto(null)}>
                    <img src={enlargedPhoto} alt="확대 보기" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
                    <button onClick={() => setEnlargedPhoto(null)} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 rounded-full">
                        <X className="h-6 w-6 text-white" />
                    </button>
                </div>
            )}
        </div>
    )
}
