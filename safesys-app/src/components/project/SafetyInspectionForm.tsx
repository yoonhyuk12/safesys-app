'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, Upload, Image as ImageIcon, Save, MoreVertical, Crop, RotateCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import SignatureCanvas from 'react-signature-canvas'
import { useAuth } from '@/contexts/AuthContext'
import type { Project } from '@/lib/projects'
import ImageEditor from '@/components/ui/ImageEditor'

interface Props {
    projectId: string
    project: Project | null
    editingId: string | null
    onClose: () => void
    onSaved: () => void
}

interface ResultRow {
    id?: string
    field_item: string
    findings: string
    action_items: string
    sort_order: number
    photo_url?: string
}

interface PhotoItem {
    id?: string
    photo_type: 'site_before' | 'finding_before' | 'good_example'
    photo_url: string
    description: string
    supervisor_name: string
    photo_date: string
    sort_order: number
    file?: File
    preview?: string
}

const INSPECTION_TYPES = ['해빙기', '우기', '종합', '특별'] as const
const PHOTO_TYPE_LABELS: Record<string, string> = {
    site_before: '점검 전경',
    finding_before: '지적사항 (조치 전)',
    good_example: '수범사례'
}

const THAW_SEASON_ITEMS = [
    { category: '가. 안전관리 5대 핵심항목 이행 여부', item: '1. 작업 전 근로자 대상 TBM 실시', action: '해당없음' },
    { category: '가. 안전관리 5대 핵심항목 이행 여부', item: '2. 신규근로자 작업 전 현장 둘러보기', action: '해당없음' },
    { category: '가. 안전관리 5대 핵심항목 이행 여부', item: '3. 건설기계 주변 접근금지', action: '해당없음' },
    { category: '가. 안전관리 5대 핵심항목 이행 여부', item: '4. 개인보호구 착용', action: '해당없음' },
    { category: '가. 안전관리 5대 핵심항목 이행 여부', item: '5. 안전보건표지의 설치·부착', action: '해당없음' },
    { category: '나. 중점사항', item: '1. 위험성평가 활동 적정성', action: '해당없음' },
    { category: '나. 중점사항', item: '2. 작업계획서 작성 적정성', action: '해당없음' },
    { category: '나. 중점사항', item: '3. 현장 주변의 공중을 위한 안전조치 적정성', action: '해당없음' },
    { category: '나. 중점사항', item: '4. 근로자 이동통로 등 안전시설 설치 여부', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '1. 흙막이 지보공 이상유무', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '2. 배면공동 충진 및 토사유출 방지 조치', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '3. 계측관리 실시 여부', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '4. 표면수 유입방지 조치', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '5. 흙막이 판 설치', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '6. 비계 또는 거푸집동바리 등 가시설의 설치상태 이상 유무', action: '해당없음' },
    { category: '다. 흙막이지보공 및 거푸집동바리', item: '7. 설계도서의 검토', action: '해당없음' },
    { category: '라. 굴착면 및 지반', item: '1. 굴착면 기울기 준수여부', action: '해당없음' },
    { category: '라. 굴착면 및 지반', item: '2. 굴착면 지반상태의 적정성', action: '해당없음' },
    { category: '라. 굴착면 및 지반', item: '3. 굴착면 주변 안전조치', action: '해당없음' },
    { category: '라. 굴착면 및 지반', item: '4. 침하·균열·변형 여부', action: '해당없음' },
    { category: '라. 굴착면 및 지반', item: '5. 차량 및 건설기계 등의 전도 전락방지 조치', action: '해당없음' },
    { category: '마. 주변시설', item: '1. 공사용 가설도로 상태의 적정성', action: '해당없음' },
    { category: '마. 주변시설', item: '2. 지하매설물 보호조치의 적정성', action: '해당없음' },
    { category: '마. 주변시설', item: '3. 주변지반에 대한 이상유무', action: '해당없음' },
    { category: '마. 주변시설', item: '4. 지하매설물 조사', action: '해당없음' }
]

export default function SafetyInspectionForm({ projectId, project, editingId, onClose, onSaved }: Props) {
    const { user } = useAuth()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [step, setStep] = useState(1)
    const [saving, setSaving] = useState(false)
    const [uploadingPhoto, setUploadingPhoto] = useState(false)

    // 점검개요
    const [inspectionType, setInspectionType] = useState<string>('해빙기')
    const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0])
    const [managementEntity, setManagementEntity] = useState('')
    const [districtName, setDistrictName] = useState('')
    const [locationProvince, setLocationProvince] = useState('')
    const [locationCity, setLocationCity] = useState('')
    const [totalBudget, setTotalBudget] = useState('')
    const [constructionStart, setConstructionStart] = useState('')
    const [constructionEndPlanned, setConstructionEndPlanned] = useState('')
    const [progressRate, setProgressRate] = useState('')
    const [majorWorkType, setMajorWorkType] = useState('')
    const [contractor, setContractor] = useState('')
    const [supervisorName, setSupervisorName] = useState('')

    // 점검결과
    const [results, setResults] = useState<ResultRow[]>([
        { field_item: '안전', findings: '', action_items: '', sort_order: 0, photo_url: '' }
    ])

    // 사진
    const [photos, setPhotos] = useState<PhotoItem[]>([])
    const [currentPhotoType, setCurrentPhotoType] = useState<string>('site_before')

    // 점검자 의견
    const [inspectorOpinion, setInspectorOpinion] = useState('')
    const [goodExampleContent, setGoodExampleContent] = useState('')

    // 추가 점검 항목
    const [additionalItems, setAdditionalItems] = useState<{ category: string; item: string; action: string }[]>([])
    // 5대 핵심항목 선택 슬롯 3개
    const [coreItemSlots, setCoreItemSlots] = useState<(number | null)[]>([null, null, null])
    // 단일 선택 항목 (나/다/라/마 - 카테고리별 1개)
    const [selectedSingleItems, setSelectedSingleItems] = useState<Map<string, number>>(new Map())

    // 서명
    const [signatures, setSignatures] = useState<any[]>([
        { role: '현장대리인', position: '', name: '', dataUrl: '' },
        { role: '공사감독원', position: '', name: '', dataUrl: '' },
        { role: '점검자', position: '', name: '', dataUrl: '' },
        { role: '점검자', position: '', name: '', dataUrl: '' }
    ])
    const [signatureModalOpen, setSignatureModalOpen] = useState(false)
    const [currentSignIndex, setCurrentSignIndex] = useState<number | null>(null)
    const signatureCanvasRef = useRef<SignatureCanvas>(null)

    // 사진 편집 (크롭/회전/삭제) 메뉴
    const [photoMenuOpen, setPhotoMenuOpen] = useState<string | null>(null) // "result-{index}" or "photo-{globalIndex}"
    const [editingImage, setEditingImage] = useState<{ url: string; type: 'result' | 'photo'; index: number } | null>(null)

    // 사진 메뉴 외부 클릭 시 닫기
    useEffect(() => {
        if (!photoMenuOpen) return
        const handler = () => setPhotoMenuOpen(null)
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [photoMenuOpen])

    // 해빙기 추가 점검 항목 초기화
    useEffect(() => {
        if (!editingId && inspectionType === '해빙기' && additionalItems.length === 0) {
            setAdditionalItems(JSON.parse(JSON.stringify(THAW_SEASON_ITEMS)))
        }
    }, [inspectionType, editingId])

    // 프로젝트 정보 자동 불러오기
    useEffect(() => {
        const fetchContractor = async () => {
            if (!project) return

            setDistrictName(project.project_name || '')
            setManagementEntity(project.managing_branch || '')

            const position = (project as any).supervisor_position || ''
            const name = project.supervisor_name || ''
            setSupervisorName(position && name ? `${position} ${name}`.trim() : name)

            if (project.total_budget) setTotalBudget(project.total_budget)

            // 주소에서 도/시군 파싱
            if (project.site_address) {
                const parts = project.site_address.split(' ')
                if (parts.length >= 1) setLocationProvince(parts[0])
                if (parts.length >= 2) setLocationCity(parts[1])
            }

            // 시공사 정보 및 현장대리인/공사감독원 기본값 세팅
            try {
                const createdBy = (project as any).created_by
                let siteAgentName = ''
                let siteAgentPosition = ''

                if (createdBy) {
                    const { data: profileData } = await supabase
                        .from('user_profiles')
                        .select('company_name, full_name, position')
                        .eq('id', createdBy)
                        .single()

                    if (profileData) {
                        setContractor((profileData as any).company_name || '')
                        siteAgentName = (profileData as any).full_name || ''
                        siteAgentPosition = (profileData as any).position || ''
                    } else {
                        setContractor('')
                    }
                } else {
                    setContractor('')
                }

                // 서명 기본값 세팅
                setSignatures(prev => {
                    const newSigs = [...prev];

                    // 현장대리인 (인덱스 0)
                    if (newSigs[0] && newSigs[0].role === '현장대리인') {
                        newSigs[0].name = siteAgentName;
                        newSigs[0].position = siteAgentPosition;
                    }

                    // 공사감독원 (인덱스 1)
                    if (newSigs[1] && newSigs[1].role === '공사감독원') {
                        newSigs[1].name = name;
                        newSigs[1].position = position;
                    }

                    return newSigs;
                });
            } catch (err) {
                console.error('기본 정보 로드 실패:', err)
                setContractor('')
            }
        }

        if (project && !editingId) {
            fetchContractor()
        }
    }, [project, editingId])

    // 수정 모드: 기존 데이터 로드
    useEffect(() => {
        if (editingId) {
            loadExistingData()
        }
    }, [editingId])

    const loadExistingData = async () => {
        const { data: inspectionRaw } = await supabase
            .from('safety_inspections')
            .select('*')
            .eq('id', editingId as string)
            .single()
        const inspection = inspectionRaw as any
        if (!inspection) return

        setInspectionType(inspection.inspection_type)
        setInspectionDate(inspection.inspection_date)
        setManagementEntity(inspection.management_entity || '')
        setDistrictName(inspection.district_name || '')
        setLocationProvince(inspection.location_province || '')
        setLocationCity(inspection.location_city || '')
        setTotalBudget(inspection.total_budget?.toString() || '')
        setConstructionStart(inspection.construction_start || '')
        setConstructionEndPlanned(inspection.construction_end_planned || '')
        setProgressRate(inspection.progress_rate?.toString() || '')
        setMajorWorkType(inspection.major_work_type || '')
        setContractor(inspection.contractor || '')
        setSupervisorName(inspection.supervisor_name || '')
        setInspectorOpinion(inspection.inspector_opinion || '')
        setGoodExampleContent(inspection.good_example_content || '')

        if (inspection.additional_items && Array.isArray(inspection.additional_items)) {
            setAdditionalItems(inspection.additional_items)
            const slots: (number | null)[] = [null, null, null]
            let slotIdx = 0
            const singleSelected = new Map<string, number>()
            inspection.additional_items.forEach((item: any, idx: number) => {
                if (item.category === '가. 안전관리 5대 핵심항목 이행 여부') {
                    if (item.action && item.action !== '해당없음' && slotIdx < 3) slots[slotIdx++] = idx
                } else if (item.action && item.action !== '해당없음' && !singleSelected.has(item.category)) {
                    singleSelected.set(item.category, idx)
                }
            })
            setCoreItemSlots(slots)
            setSelectedSingleItems(singleSelected)
        } else if (inspection.inspection_type === '해빙기') {
            setAdditionalItems(JSON.parse(JSON.stringify(THAW_SEASON_ITEMS)))
            setCoreItemSlots([null, null, null])
            setSelectedSingleItems(new Map())
        }

        if (inspection.signatures && Array.isArray(inspection.signatures) && inspection.signatures.length > 0) {
            setSignatures(inspection.signatures)
        }

        const { data: resultsDataRaw } = await supabase
            .from('safety_inspection_results')
            .select('*')
            .eq('inspection_id', editingId as string)
            .order('sort_order')
        const resultsData = resultsDataRaw as any[]
        if (resultsData && resultsData.length > 0) {
            setResults(resultsData.map(r => ({
                id: r.id,
                field_item: r.field_item,
                findings: r.findings || '',
                action_items: r.action_items || '',
                sort_order: r.sort_order,
                photo_url: r.photo_url || ''
            })))
        }

        const { data: photosDataRaw } = await supabase
            .from('safety_inspection_photos')
            .select('*')
            .eq('inspection_id', editingId as string)
            .order('sort_order')
        const photosData = photosDataRaw as any[]
        if (photosData) {
            setPhotos(photosData.map(p => ({
                id: p.id,
                photo_type: p.photo_type,
                photo_url: p.photo_url,
                description: p.description || '',
                supervisor_name: p.supervisor_name || '',
                photo_date: p.photo_date || '',
                sort_order: p.sort_order
            })))
        }
    }

    const addResultRow = () => {
        setResults([...results, {
            field_item: '안전', findings: '', action_items: '', sort_order: results.length, photo_url: ''
        }])
    }

    const removeResultRow = (index: number) => {
        setResults(results.filter((_, i) => i !== index))
    }

    const updateResult = (index: number, field: keyof ResultRow, value: string) => {
        const updated = [...results]
            ; (updated[index] as any)[field] = value
        setResults(updated)
    }

    const setCoreSlot = (slotIndex: number, itemIdx: number | null) => {
        const prevIdx = coreItemSlots[slotIndex]
        const newItems = [...additionalItems]
        if (prevIdx !== null) newItems[prevIdx].action = '해당없음'
        if (itemIdx !== null && newItems[itemIdx].action === '해당없음') newItems[itemIdx].action = ''
        setAdditionalItems(newItems)
        setCoreItemSlots(prev => { const next = [...prev]; next[slotIndex] = itemIdx; return next })
    }

    const selectSingleItem = (category: string, idx: number | null) => {
        const prevIdx = selectedSingleItems.get(category)
        const newItems = [...additionalItems]
        if (prevIdx !== undefined) newItems[prevIdx].action = '해당없음'
        if (idx !== null && newItems[idx].action === '해당없음') newItems[idx].action = ''
        setAdditionalItems(newItems)
        setSelectedSingleItems(prev => {
            const next = new Map(prev)
            idx === null ? next.delete(category) : next.set(category, idx)
            return next
        })
    }

    const handleResultPhotoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadingPhoto(true)
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const fileName = `${projectId}/${Date.now()}_result_${index}_${encodeURIComponent(safeName)}`

        const { data, error } = await supabase.storage
            .from('safety-inspection-photos')
            .upload(fileName, file)

        if (!error && data) {
            const { data: urlData } = supabase.storage
                .from('safety-inspection-photos')
                .getPublicUrl(data.path)

            updateResult(index, 'photo_url', urlData.publicUrl)
        }
        setUploadingPhoto(false)
        e.target.value = ''
    }

    const removeResultPhoto = async (index: number) => {
        const photoUrl = results[index].photo_url
        if (photoUrl) {
            const path = photoUrl.split('/safety-inspection-photos/')[1]
            if (path) {
                await supabase.storage.from('safety-inspection-photos').remove([path])
            }
        }
        updateResult(index, 'photo_url', '')
    }

    const handlePhotoUploadType = async (e: React.ChangeEvent<HTMLInputElement>, targetType: string) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        setUploadingPhoto(true)
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
            const fileName = `${projectId}/${Date.now()}_${i}_${encodeURIComponent(safeName)}`

            const { data, error } = await supabase.storage
                .from('safety-inspection-photos')
                .upload(fileName, file)

            if (!error && data) {
                const { data: urlData } = supabase.storage
                    .from('safety-inspection-photos')
                    .getPublicUrl(data.path)

                setPhotos(prev => [...prev, {
                    photo_type: targetType as any,
                    photo_url: urlData.publicUrl,
                    description: '',
                    supervisor_name: supervisorName,
                    photo_date: inspectionDate,
                    sort_order: prev.length
                }])
            }
        }
        setUploadingPhoto(false)
        e.target.value = ''
    }

    const removePhoto = async (index: number) => {
        const photo = photos[index]
        if (photo.photo_url) {
            const path = photo.photo_url.split('/safety-inspection-photos/')[1]
            if (path) {
                await supabase.storage.from('safety-inspection-photos').remove([path])
            }
        }
        if (photo.id) {
            await supabase.from('safety_inspection_photos').delete().eq('id', photo.id)
        }
        setPhotos(photos.filter((_, i) => i !== index))
    }

    const handleSaveEditedImage = async (blob: Blob) => {
        if (!editingImage) return
        setUploadingPhoto(true)
        try {
            const fileName = `${projectId}/${Date.now()}_edited_${Math.random().toString(36).slice(2, 8)}.jpg`
            const { data, error } = await supabase.storage
                .from('safety-inspection-photos')
                .upload(fileName, blob, { contentType: 'image/jpeg' })

            if (!error && data) {
                const { data: urlData } = supabase.storage
                    .from('safety-inspection-photos')
                    .getPublicUrl(data.path)

                if (editingImage.type === 'result') {
                    // 기존 사진 스토리지에서 삭제
                    const oldUrl = results[editingImage.index].photo_url
                    if (oldUrl) {
                        const oldPath = oldUrl.split('/safety-inspection-photos/')[1]
                        if (oldPath) await supabase.storage.from('safety-inspection-photos').remove([oldPath])
                    }
                    updateResult(editingImage.index, 'photo_url', urlData.publicUrl)
                } else if (editingImage.type === 'photo') {
                    // 기존 사진 스토리지에서 삭제
                    const oldUrl = photos[editingImage.index].photo_url
                    if (oldUrl) {
                        const oldPath = oldUrl.split('/safety-inspection-photos/')[1]
                        if (oldPath) await supabase.storage.from('safety-inspection-photos').remove([oldPath])
                    }
                    const updated = [...photos]
                    updated[editingImage.index].photo_url = urlData.publicUrl
                    setPhotos(updated)
                }
            }
        } catch (err) {
            console.error('편집된 이미지 저장 실패:', err)
            alert('이미지 저장에 실패했습니다.')
        }
        setUploadingPhoto(false)
        setEditingImage(null)
    }

    const handleSave = async () => {
        if (!user) return
        setSaving(true)

        try {
            const derivedInspectionTeam = signatures
                .filter(s => s.role === '점검자')
                .map(s => `${s.position} ${s.name}`.trim())
                .filter(s => s)
                .join(', ')

            const inspectionData = {
                project_id: projectId,
                inspection_type: inspectionType,
                inspection_date: inspectionDate,
                inspection_team: derivedInspectionTeam || null,
                management_entity: managementEntity || null,
                district_name: districtName || null,
                location_province: locationProvince || null,
                location_city: locationCity || null,
                total_budget: totalBudget ? parseFloat(totalBudget) : null,
                construction_start: constructionStart || null,
                construction_end_planned: constructionEndPlanned || null,
                progress_rate: progressRate ? parseFloat(progressRate) : null,
                major_work_type: majorWorkType || null,
                contractor: contractor || null,
                supervisor_name: supervisorName || null,
                inspector_opinion: inspectorOpinion || null,
                good_example_content: goodExampleContent || null,
                additional_items: inspectionType === '해빙기' ? additionalItems : null,
                signatures: signatures,
                created_by: user.id,
                updated_at: new Date().toISOString()
            }

            let inspectionId = editingId

            if (editingId) {
                await (supabase.from('safety_inspections') as any).update(inspectionData).eq('id', editingId)
            } else {
                const { data } = await (supabase.from('safety_inspections') as any).insert(inspectionData).select('id').single()
                if (data) inspectionId = data.id
            }

            if (!inspectionId) throw new Error('점검 ID를 가져올 수 없습니다.')

            if (editingId) {
                // Save Results
                if (results.length > 0) {
                    const existingResultIds = results.filter(r => r.id).map(r => r.id)

                    if (existingResultIds.length > 0) {
                        // 남아있는 기존 항목 외 삭제 (사용자가 - 버튼으로 지운 것)
                        await supabase
                            .from('safety_inspection_results')
                            .delete()
                            .eq('inspection_id', inspectionId)
                            .not('id', 'in', `(${existingResultIds.join(',')})`)
                    } else {
                        // 남은 기존 항목이 없으면 해당 점검의 결과를 전체 삭제
                        await supabase
                            .from('safety_inspection_results')
                            .delete()
                            .eq('inspection_id', inspectionId)
                    }

                    // 순회하며 upsert (기존 데이터의 after_photo_url 등 보존을 위해)
                    for (const r of results) {
                        const updateData = {
                            field_item: r.field_item,
                            findings: r.findings || null,
                            action_items: r.action_items || null,
                            sort_order: r.sort_order,
                            photo_url: r.photo_url || null
                        }

                        if (r.id) {
                            await (supabase.from('safety_inspection_results') as any)
                                .update(updateData)
                                .eq('id', r.id)
                        } else {
                            await (supabase.from('safety_inspection_results') as any)
                                .insert({
                                    inspection_id: inspectionId,
                                    ...updateData
                                })
                        }
                    }
                } else {
                    await supabase.from('safety_inspection_results').delete().eq('inspection_id', inspectionId)
                }
            } else {
                if (results.length > 0) {
                    const resultRows = results.map((r, i) => ({
                        inspection_id: inspectionId!,
                        field_item: r.field_item,
                        findings: r.findings || null,
                        action_items: r.action_items || null,
                        sort_order: i,
                        photo_url: r.photo_url || null
                    }))
                    await (supabase.from('safety_inspection_results') as any).insert(resultRows)
                }
            }

            const newPhotos = photos.filter(p => !p.id)
            if (newPhotos.length > 0) {
                const photoRows = newPhotos.map((p, i) => ({
                    inspection_id: inspectionId!,
                    photo_type: p.photo_type,
                    photo_url: p.photo_url,
                    description: p.description || null,
                    supervisor_name: p.supervisor_name || null,
                    photo_date: p.photo_date || null,
                    sort_order: photos.indexOf(p)
                }))
                await (supabase.from('safety_inspection_photos') as any).insert(photoRows)
            }

            const existingPhotos = photos.filter(p => p.id)
            for (const p of existingPhotos) {
                await (supabase.from('safety_inspection_photos') as any)
                    .update({ description: p.description, supervisor_name: p.supervisor_name, photo_date: p.photo_date })
                    .eq('id', p.id as string)
            }

            onSaved()
        } catch (err) {
            console.error('저장 실패:', err)
            alert('저장에 실패했습니다.')
        } finally {
            setSaving(false)
        }
    }

    // 사진 렌더링 헬퍼
    const renderPhotoGroup = (type: string, label: string) => {
        const typePhotos = photos.filter(p => p.photo_type === type)
        if (typePhotos.length === 0) return null
        return (
            <div key={type} className="border rounded-lg p-3 bg-white mt-3">
                <h4 className="text-[13px] font-semibold text-gray-700 mb-2">{label} ({typePhotos.length}장)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {typePhotos.map((photo, i) => {
                        const globalIdx = photos.indexOf(photo)
                        return (
                            <div key={i} className="relative group">
                                <img src={photo.photo_url} alt={photo.description || label}
                                    className="w-full h-24 object-cover rounded-lg border bg-gray-50" />
                                {/* 점점점 메뉴 버튼 */}
                                <div className="absolute top-1 right-1 z-10">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setPhotoMenuOpen(photoMenuOpen === `photo-${globalIdx}` ? null : `photo-${globalIdx}`) }}
                                        className="p-1 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                    >
                                        <MoreVertical className="h-3.5 w-3.5" />
                                    </button>
                                    {photoMenuOpen === `photo-${globalIdx}` && (
                                        <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[100px] z-20">
                                            <button onClick={() => { setEditingImage({ url: photo.photo_url, type: 'photo', index: globalIdx }); setPhotoMenuOpen(null) }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors">
                                                <Crop className="h-3.5 w-3.5" /> 크롭/회전
                                            </button>
                                            <button onClick={() => { removePhoto(globalIdx); setPhotoMenuOpen(null) }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                                                <Trash2 className="h-3.5 w-3.5" /> 삭제
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <input type="text" value={photo.description}
                                    onChange={e => {
                                        const updated = [...photos]
                                        updated[globalIdx].description = e.target.value
                                        setPhotos(updated)
                                    }}
                                    placeholder="설명 (선택)"
                                    className="mt-1 w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-blue-400" />
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">
                        {editingId ? '점검 수정' : '새 점검 등록'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
                </div>

                {/* 스텝 인디케이터 */}
                <div className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-50 border-b">
                    {['점검개요', '점검결과 및 사진', '점검자 의견 및 서명', ...(inspectionType === '해빙기' ? ['추가 점검 항목'] : [])].map((label, i) => (
                        <button
                            key={i}
                            onClick={() => setStep(i + 1)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${step === i + 1
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-500 border hover:border-blue-300'
                                }`}
                        >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === i + 1 ? 'bg-white/20' : 'bg-gray-200'}`}>
                                {i + 1}
                            </span>
                            {label}
                        </button>
                    ))}
                </div>

                {/* 컨텐츠 */}
                <div className="px-6 py-5 max-h-[65vh] overflow-y-auto bg-gray-100">
                    {/* Step 1: 점검개요 */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">점검유형 *</label>
                                    <select value={inspectionType} onChange={e => setInspectionType(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm">
                                        {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">점검일시 *</label>
                                    <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">점검반 (점검자)</label>
                                    <button
                                        onClick={() => setSignatures([...signatures, { role: '점검자', position: '', name: '', dataUrl: '' }])}
                                        className="text-xs bg-blue-50 text-blue-600 px-2 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> 인원 추가
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {signatures.map((sig, idx) => {
                                        if (sig.role !== '점검자') return null;
                                        return (
                                            <div key={idx} className="flex gap-2 items-center bg-gray-50/50 md:bg-transparent p-2 md:p-0 border border-gray-100 md:border-none rounded-lg">
                                                <div className="flex flex-col md:flex-row gap-2 flex-1">
                                                    <input type="text" value={sig.position} onChange={e => {
                                                        const newSigs = [...signatures];
                                                        newSigs[idx].position = e.target.value;
                                                        setSignatures(newSigs);
                                                    }} placeholder="직급 (예: 3급)" className="w-full md:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                                    <input type="text" value={sig.name} onChange={e => {
                                                        const newSigs = [...signatures];
                                                        newSigs[idx].name = e.target.value;
                                                        setSignatures(newSigs);
                                                    }} placeholder="성명 (예: 홍길동)" className="w-full md:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                                </div>
                                                <button onClick={() => {
                                                    const newSigs = signatures.filter((_, i) => i !== idx);
                                                    setSignatures(newSigs);
                                                }} className="p-2.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors bg-white border border-gray-200 shadow-sm shrink-0" title="삭제">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {signatures.filter(s => s.role === '점검자').length === 0 && (
                                        <div className="text-sm text-gray-500 py-3 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                                            우측 상단의 "인원 추가" 버튼을 눌러 점검자를 추가해주세요.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t mt-4">
                                <h3 className="text-sm font-semibold text-gray-800 mb-3 px-1">점검지구 현황</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-100 p-4 rounded-lg border border-gray-200">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">관리주체</label>
                                        <input type="text" value={managementEntity} onChange={e => setManagementEntity(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">지구명</label>
                                        <input type="text" value={districtName} onChange={e => setDistrictName(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">위치 (도)</label>
                                        <input type="text" value={locationProvince} onChange={e => setLocationProvince(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">위치 (시군)</label>
                                        <input type="text" value={locationCity} onChange={e => setLocationCity(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">총사업비 (백만원)</label>
                                        <input type="text" value={totalBudget ? Number(totalBudget).toLocaleString() : ''} onChange={e => {
                                            const raw = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '')
                                            setTotalBudget(raw)
                                        }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">공정율 (%)</label>
                                        <input type="number" value={progressRate} onChange={e => setProgressRate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">착공일</label>
                                        <input type="date" value={constructionStart} onChange={e => setConstructionStart(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">준공(예정)일</label>
                                        <input type="date" value={constructionEndPlanned} onChange={e => setConstructionEndPlanned(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">주요공종</label>
                                        <input type="text" value={majorWorkType} onChange={e => setMajorWorkType(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">비고 (시공사)</label>
                                        <input type="text" value={contractor} onChange={e => setContractor(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs text-gray-500 mb-1">공사감독원</label>
                                        <input type="text" value={supervisorName} onChange={e => setSupervisorName(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: 점검결과 및 사진 */}
                    {step === 2 && (
                        <div className="space-y-6">
                            {/* 1. 점검 전경업로드 영역 */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                <h3 className="text-[15px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                                    점검 전경 사진
                                </h3>
                                <div className="flex gap-3 mb-2">
                                    <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-4 hover:bg-gray-50 cursor-pointer transition-colors">
                                        <Upload className="h-5 w-5 text-gray-400 mb-1" />
                                        <span className="text-[13px] text-gray-600 font-medium">점검 전경 사진 업로드</span>
                                        <input type="file" accept="image/*" multiple onChange={e => handlePhotoUploadType(e, 'site_before')} className="hidden" disabled={uploadingPhoto} />
                                    </label>
                                </div>
                                {renderPhotoGroup('site_before', '점검 전경')}
                            </div>

                            {/* 2. 지적사항 및 수범사례 영역 */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
                                        <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                                        지적사항 및 조치사항 내용
                                    </h3>
                                    <button onClick={addResultRow}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
                                        <Plus className="h-4 w-4" /> 항목 추가
                                    </button>
                                </div>

                                {/* 지적사항 목록 (Responsive) */}
                                <div className="space-y-4 mb-5">
                                    {results.map((row, i) => (
                                        <div key={i} className="border border-gray-200 rounded-lg bg-gray-50 p-4 relative">
                                            <div className="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
                                                <h4 className="font-semibold text-gray-700 text-sm">지적사항 항목 {i + 1}</h4>
                                                {results.length > 1 && (
                                                    <button onClick={() => removeResultRow(i)} className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors" title="삭제">
                                                        <Trash2 className="h-3.5 w-3.5" /> 삭제
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex flex-col md:flex-row gap-4">
                                                <div className="flex flex-col gap-3 md:w-1/4 shrink-0">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">분야(종류)</label>
                                                        <select value={row.field_item} onChange={e => updateResult(i, 'field_item', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                                            <option value="안전">안전</option>
                                                            <option value="품질">품질</option>
                                                            <option value="환경">환경</option>
                                                            <option value="기타">기타</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">참고 사진</label>
                                                        {row.photo_url ? (
                                                            <div className="relative group w-full h-32 md:h-24">
                                                                <img src={row.photo_url} alt="설명" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                                                                {/* 점점점 메뉴 버튼 */}
                                                                <div className="absolute top-1 right-1 z-10">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setPhotoMenuOpen(photoMenuOpen === `result-${i}` ? null : `result-${i}`) }}
                                                                        className="p-1 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors shadow-sm"
                                                                    >
                                                                        <MoreVertical className="h-3.5 w-3.5" />
                                                                    </button>
                                                                    {photoMenuOpen === `result-${i}` && (
                                                                        <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[100px] z-20">
                                                                            <button onClick={() => { setEditingImage({ url: row.photo_url!, type: 'result', index: i }); setPhotoMenuOpen(null) }}
                                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors">
                                                                                <Crop className="h-3.5 w-3.5" /> 크롭/회전
                                                                            </button>
                                                                            <button onClick={() => { removeResultPhoto(i); setPhotoMenuOpen(null) }}
                                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                                                                                <Trash2 className="h-3.5 w-3.5" /> 삭제
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-32 md:h-24 bg-white hover:bg-gray-50 cursor-pointer w-full text-xs text-gray-500 relative transition-colors shadow-sm">
                                                                {uploadingPhoto ? '업로드중...' : (
                                                                    <>
                                                                        <Upload className="h-5 w-5 mb-1 text-gray-400" />
                                                                        <span className="font-medium text-gray-500 select-none mt-1">사진 추가</span>
                                                                    </>
                                                                )}
                                                                <input type="file" accept="image/*" onChange={e => handleResultPhotoUpload(i, e)} className="hidden" disabled={uploadingPhoto} />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col md:flex-row gap-4 md:w-3/4">
                                                    <div className="flex-1 flex flex-col">
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">지적사항 내용</label>
                                                        <textarea value={row.findings} onChange={e => updateResult(i, 'findings', e.target.value)}
                                                            className="w-full flex-1 min-h-[100px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="위반 사항이나 지적할 내용을 입력하세요." />
                                                    </div>
                                                    <div className="flex-1 flex flex-col">
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">조치할 사항</label>
                                                        <textarea value={row.action_items} onChange={e => updateResult(i, 'action_items', e.target.value)}
                                                            className="w-full flex-1 min-h-[100px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="필요한 후속 조치 내용을 입력하세요." />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: 점검자 의견 (및 수범사례) */}
                    {step === 3 && (
                        <div className="space-y-6">
                            {/* 종합결과 의견 */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                <h3 className="text-[15px] font-bold text-gray-800 mb-3 border-b pb-2 flex items-center gap-2">
                                    <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                                    점검자 의견 (종합의견)
                                </h3>
                                <textarea
                                    value={inspectorOpinion}
                                    onChange={e => setInspectorOpinion(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white shadow-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    rows={6}
                                    placeholder="해당 점검에 대한 전체적인 평가 및 의견을 기재해주세요."
                                />
                            </div>

                            {/* 수범사례 영역 */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                <div className="flex items-center justify-between mb-3 border-b pb-2">
                                    <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
                                        <span className="bg-gray-100 text-gray-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">+</span>
                                        수범사례 (선택사항)
                                    </h3>
                                    <button
                                        onClick={() => {
                                            setPhotos(prev => [...prev, {
                                                photo_type: 'good_example',
                                                photo_url: '',
                                                description: '',
                                                supervisor_name: supervisorName,
                                                photo_date: inspectionDate,
                                                sort_order: prev.length
                                            }])
                                        }}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                                    >
                                        <Plus className="h-4 w-4" /> 수범사례 추가
                                    </button>
                                </div>

                                {/* 수범사례 카드 목록 */}
                                <div className="space-y-4 mt-4">
                                    {photos.filter(p => p.photo_type === 'good_example').map((photo, i) => {
                                        const globalIdx = photos.indexOf(photo)
                                        return (
                                            <div key={globalIdx} className="flex flex-col md:flex-row gap-4 bg-white border border-gray-200 rounded-lg p-4">
                                                {/* 사진 */}
                                                <div className="w-full md:w-40 shrink-0">
                                                    {photo.photo_url ? (
                                                        <div className="relative group w-full h-32 md:h-28">
                                                            <img src={photo.photo_url} alt={photo.description || `수범사례 ${i + 1}`}
                                                                className="w-full h-full object-cover rounded-lg border border-gray-200 bg-gray-50" />
                                                            {/* 점점점 메뉴 버튼 */}
                                                            <div className="absolute top-1 right-1 z-10">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setPhotoMenuOpen(photoMenuOpen === `good-${globalIdx}` ? null : `good-${globalIdx}`) }}
                                                                    className="p-1 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                                                >
                                                                    <MoreVertical className="h-3.5 w-3.5" />
                                                                </button>
                                                                {photoMenuOpen === `good-${globalIdx}` && (
                                                                    <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[100px] z-20">
                                                                        <button onClick={() => { setEditingImage({ url: photo.photo_url, type: 'photo', index: globalIdx }); setPhotoMenuOpen(null) }}
                                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors">
                                                                            <Crop className="h-3.5 w-3.5" /> 크롭/회전
                                                                        </button>
                                                                        <button onClick={() => { removePhoto(globalIdx); setPhotoMenuOpen(null) }}
                                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                                                                            <Trash2 className="h-3.5 w-3.5" /> 삭제
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                                                                {i + 1}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-32 md:h-28 bg-white hover:bg-gray-50 cursor-pointer transition-colors relative">
                                                            {uploadingPhoto ? '업로드중...' : (
                                                                <>
                                                                    <Upload className="h-5 w-5 mb-1 text-gray-400" />
                                                                    <span className="text-xs font-medium text-gray-500">사진 추가</span>
                                                                </>
                                                            )}
                                                            <input type="file" accept="image/*" onChange={async (e) => {
                                                                const file = e.target.files?.[0]
                                                                if (!file) return
                                                                setUploadingPhoto(true)
                                                                const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
                                                                const fileName = `${projectId}/${Date.now()}_0_${encodeURIComponent(safeName)}`
                                                                const { data, error } = await supabase.storage.from('safety-inspection-photos').upload(fileName, file)
                                                                if (!error && data) {
                                                                    const { data: urlData } = supabase.storage.from('safety-inspection-photos').getPublicUrl(data.path)
                                                                    const updated = [...photos]
                                                                    updated[globalIdx].photo_url = urlData.publicUrl
                                                                    setPhotos(updated)
                                                                }
                                                                setUploadingPhoto(false)
                                                                e.target.value = ''
                                                            }} className="hidden" disabled={uploadingPhoto} />
                                                            <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                                                                {i + 1}
                                                            </div>
                                                        </label>
                                                    )}
                                                </div>
                                                {/* 설명 */}
                                                <div className="flex-1 flex flex-col">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="block text-xs font-semibold text-gray-600">수범사례 내용</label>
                                                        <button onClick={() => removePhoto(globalIdx)}
                                                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-50 rounded transition-colors">
                                                            <Trash2 className="h-3 w-3" /> 삭제
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        value={photo.description}
                                                        onChange={e => {
                                                            const updated = [...photos]
                                                            updated[globalIdx].description = e.target.value
                                                            setPhotos(updated)
                                                        }}
                                                        className="w-full flex-1 min-h-[80px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                                        placeholder="수범사례에 대한 내용을 기재해주세요."
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* 수범사례가 없을 때 안내 */}
                                    {photos.filter(p => p.photo_type === 'good_example').length === 0 && (
                                        <div className="text-sm text-gray-400 py-6 text-center border-2 border-dashed border-gray-200 rounded-lg bg-white/50">
                                            우측 상단의 "수범사례 추가" 버튼을 눌러 수범사례를 등록하세요.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 서명 영역 */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-5 mt-6">
                                <h3 className="text-[15px] font-bold text-gray-800 mb-3 border-b pb-2 flex items-center gap-2">
                                    <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">4</span>
                                    참석자 서명
                                </h3>

                                {/* 모바일 카드 레이아웃 */}
                                <div className="md:hidden space-y-3 mt-3">
                                    {signatures.map((sig, index) => (
                                        <div key={index} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-md border border-blue-100">
                                                    {sig.role}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[11px] text-gray-500 mb-0.5">직급</label>
                                                    <input type="text" value={sig.position} onChange={e => {
                                                        const newSigs = [...signatures]
                                                        newSigs[index].position = e.target.value
                                                        setSignatures(newSigs)
                                                    }} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="직급" />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] text-gray-500 mb-0.5">성명</label>
                                                    <input type="text" value={sig.name} onChange={e => {
                                                        const newSigs = [...signatures]
                                                        newSigs[index].name = e.target.value
                                                        setSignatures(newSigs)
                                                    }} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="성명" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] text-gray-500 mb-1">서명</label>
                                                {sig.dataUrl ? (
                                                    <div className="relative w-full h-14 border border-gray-200 bg-white rounded-lg overflow-hidden flex items-center justify-center">
                                                        <img src={sig.dataUrl} alt="서명" className="h-full object-contain mix-blend-multiply" />
                                                        <div className="absolute top-1 right-1 flex gap-1">
                                                            <button onClick={() => { setCurrentSignIndex(index); setSignatureModalOpen(true); }} className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-bold hover:bg-blue-100 transition-colors">재서명</button>
                                                            <button onClick={() => {
                                                                const newSigs = [...signatures]
                                                                newSigs[index].dataUrl = ''
                                                                setSignatures(newSigs)
                                                            }} className="px-2 py-1 bg-red-50 text-red-600 rounded text-[10px] font-bold hover:bg-red-100 transition-colors">삭제</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => { setCurrentSignIndex(index); setSignatureModalOpen(true); }} className="w-full py-3 bg-white border border-dashed border-gray-400 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                                                        <span>서명 열기</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* 데스크톱 테이블 레이아웃 */}
                                <div className="hidden md:block overflow-x-auto mt-4">
                                    <table className="w-full text-sm text-center border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100 border-y border-gray-200 text-gray-700">
                                                <th className="py-3 px-2 font-semibold border-x w-[15%]">구분</th>
                                                <th className="py-3 px-2 font-semibold border-x w-[20%]">직급</th>
                                                <th className="py-3 px-2 font-semibold border-x w-[20%]">성명</th>
                                                <th className="py-3 px-2 font-semibold border-x w-[25%]">서명</th>
                                                <th className="py-3 px-2 font-semibold border-x w-[20%]">비고</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {signatures.map((sig, index) => (
                                                <tr key={index} className="border-b border-gray-200 hover:bg-gray-50/30 transition-colors">
                                                    <td className="py-2 px-2 border-x bg-gray-50/50 font-medium text-gray-800">
                                                        {sig.role}
                                                    </td>
                                                    <td className="py-2 px-2 border-x">
                                                        <input type="text" value={sig.position} onChange={e => {
                                                            const newSigs = [...signatures]
                                                            newSigs[index].position = e.target.value
                                                            setSignatures(newSigs)
                                                        }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center bg-white shadow-sm focus:ring-1 focus:ring-blue-500" placeholder="직급" />
                                                    </td>
                                                    <td className="py-2 px-2 border-x">
                                                        <input type="text" value={sig.name} onChange={e => {
                                                            const newSigs = [...signatures]
                                                            newSigs[index].name = e.target.value
                                                            setSignatures(newSigs)
                                                        }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center bg-white shadow-sm focus:ring-1 focus:ring-blue-500" placeholder="성명" />
                                                    </td>
                                                    <td className="py-2 px-2 border-x p-1">
                                                        <div className="flex justify-center flex-col items-center">
                                                            {sig.dataUrl ? (
                                                                <div className="relative group w-full h-10 border border-gray-200 bg-white rounded overflow-hidden flex items-center justify-center">
                                                                    <div className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center gap-2 transition-all">
                                                                        <button onClick={() => { setCurrentSignIndex(index); setSignatureModalOpen(true); }} className="px-2 py-1 bg-white text-blue-600 rounded text-[10px] font-bold shadow hover:bg-gray-100">재서명</button>
                                                                        <button onClick={() => {
                                                                            const newSigs = [...signatures]
                                                                            newSigs[index].dataUrl = ''
                                                                            setSignatures(newSigs)
                                                                        }} className="px-2 py-1 bg-white text-red-600 rounded text-[10px] font-bold shadow hover:bg-gray-100">삭제</button>
                                                                    </div>
                                                                    <img src={sig.dataUrl} alt="서명" className="h-full object-contain mix-blend-multiply" />
                                                                </div>
                                                            ) : (
                                                                <button onClick={() => { setCurrentSignIndex(index); setSignatureModalOpen(true); }} className="w-full py-1.5 bg-white border border-dashed border-gray-400 text-gray-500 rounded text-xs hover:bg-gray-50 transition-colors h-10 flex items-center justify-center">
                                                                    서명 열기
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-2 border-x text-xs text-gray-400">
                                                        <input type="text" className="w-full px-2 py-1.5 border border-gray-300 md:border-transparent hover:border-gray-300 focus:border-gray-300 rounded text-sm text-center bg-transparent" placeholder="-" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: 추가 점검 항목 (해빙기 등) */}
                    {step === 4 && inspectionType === '해빙기' && (
                        <div className="space-y-6">
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-5">
                                <h3 className="text-[15px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">4</span>
                                    추가 점검 항목
                                </h3>
                                {/* Mobile View (Card Layout) */}
                                <div className="block md:hidden space-y-4">
                                    {Object.entries(additionalItems.reduce((acc, current, idx) => {
                                        if (!acc[current.category]) acc[current.category] = [];
                                        acc[current.category].push({ ...current, originalIndex: idx });
                                        return acc;
                                    }, {} as Record<string, any[]>)).map(([category, items]) => {
                                        const isCoreCategory = category === '가. 안전관리 5대 핵심항목 이행 여부'
                                        if (!isCoreCategory) {
                                            const selectedIdx = selectedSingleItems.get(category)
                                            const selectedItem = selectedIdx !== undefined ? items.find((i: any) => i.originalIndex === selectedIdx) : null
                                            return (
                                                <div key={category} className="space-y-3">
                                                    <div className="bg-blue-50 text-blue-800 font-semibold text-sm px-3 py-2 rounded-lg border border-blue-100 mt-2 flex items-center justify-between">
                                                        <span>{category}</span>
                                                        {selectedItem && (
                                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-600 text-white">선택됨</span>
                                                        )}
                                                    </div>
                                                    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col gap-3">
                                                        <div>
                                                            <span className="block text-[11px] font-semibold text-gray-500 mb-1">점검항목 선택</span>
                                                            <select
                                                                value={selectedIdx !== undefined ? String(selectedIdx) : ''}
                                                                onChange={(e) => selectSingleItem(category, e.target.value === '' ? null : Number(e.target.value))}
                                                                className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none"
                                                            >
                                                                <option value="">항목 선택...</option>
                                                                {items.map((item: any) => (
                                                                    <option key={item.originalIndex} value={String(item.originalIndex)}>{item.item}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        {selectedItem && (
                                                            <div className="border-t border-gray-100 pt-2">
                                                                <span className="block mb-1 text-[11px] font-semibold text-gray-500">조치내용</span>
                                                                <input
                                                                    type="text"
                                                                    value={selectedItem.action}
                                                                    onChange={(e) => {
                                                                        const newItems = [...additionalItems];
                                                                        newItems[selectedItem.originalIndex].action = e.target.value;
                                                                        setAdditionalItems(newItems);
                                                                    }}
                                                                    onFocus={(e) => {
                                                                        if (e.target.value === '해당없음') {
                                                                            const newItems = [...additionalItems];
                                                                            newItems[selectedItem.originalIndex].action = '';
                                                                            setAdditionalItems(newItems);
                                                                        }
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        if (e.target.value.trim() === '') {
                                                                            const newItems = [...additionalItems];
                                                                            newItems[selectedItem.originalIndex].action = '해당없음';
                                                                            setAdditionalItems(newItems);
                                                                        }
                                                                    }}
                                                                    className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none transition-colors"
                                                                    placeholder="지적시 또는 발견시 조치내용 입력"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        }
                                        const filledCount = coreItemSlots.filter(v => v !== null).length
                                        return (
                                            <div key={category} className="space-y-3">
                                                <div className="bg-blue-50 text-blue-800 font-semibold text-sm px-3 py-2 rounded-lg border border-blue-100 mt-2 flex items-center justify-between">
                                                    <span>{category}</span>
                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${filledCount === 3 ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                        {filledCount}/3 선택
                                                    </span>
                                                </div>
                                                {[0, 1, 2].map(slotIndex => {
                                                    const selectedIdx = coreItemSlots[slotIndex]
                                                    const selectedItem = selectedIdx !== null ? items.find((i: any) => i.originalIndex === selectedIdx) : null
                                                    const usedIndices = coreItemSlots.filter((v, s) => v !== null && s !== slotIndex) as number[]
                                                    return (
                                                        <div key={slotIndex} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col gap-3">
                                                            <div>
                                                                <span className="block text-[11px] font-semibold text-gray-500 mb-1">선택 {slotIndex + 1}</span>
                                                                <select
                                                                    value={selectedIdx !== null ? String(selectedIdx) : ''}
                                                                    onChange={(e) => setCoreSlot(slotIndex, e.target.value === '' ? null : Number(e.target.value))}
                                                                    className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none"
                                                                >
                                                                    <option value="">항목 선택...</option>
                                                                    {items.map((item: any) => (
                                                                        <option key={item.originalIndex} value={String(item.originalIndex)} disabled={usedIndices.includes(item.originalIndex)}>
                                                                            {item.item}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            {selectedItem && (
                                                                <div className="border-t border-gray-100 pt-2">
                                                                    <span className="block mb-1 text-[11px] font-semibold text-gray-500">조치내용</span>
                                                                    <input
                                                                        type="text"
                                                                        value={selectedItem.action}
                                                                        onChange={(e) => {
                                                                            const newItems = [...additionalItems];
                                                                            newItems[selectedItem.originalIndex].action = e.target.value;
                                                                            setAdditionalItems(newItems);
                                                                        }}
                                                                        onFocus={(e) => {
                                                                            if (e.target.value === '해당없음') {
                                                                                const newItems = [...additionalItems];
                                                                                newItems[selectedItem.originalIndex].action = '';
                                                                                setAdditionalItems(newItems);
                                                                            }
                                                                        }}
                                                                        onBlur={(e) => {
                                                                            if (e.target.value.trim() === '') {
                                                                                const newItems = [...additionalItems];
                                                                                newItems[selectedItem.originalIndex].action = '해당없음';
                                                                                setAdditionalItems(newItems);
                                                                            }
                                                                        }}
                                                                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none transition-colors"
                                                                        placeholder="지적시 또는 발견시 조치내용 입력"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View (Table Layout) */}
                                <div className="hidden md:block overflow-x-auto bg-white border border-gray-200 rounded-lg">
                                    <table className="w-full text-sm text-center border-collapse min-w-[600px]">
                                        <thead>
                                            <tr className="bg-gray-100 text-gray-700">
                                                <th className="py-2.5 px-4 font-semibold border border-gray-200 w-[20%]">구분</th>
                                                <th className="py-2.5 px-4 font-semibold border border-gray-200 w-[50%]">점검항목</th>
                                                <th className="py-2.5 px-4 font-semibold border border-gray-200 w-[30%]">조치내용</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(additionalItems.reduce((acc, current, idx) => {
                                                if (!acc[current.category]) acc[current.category] = [];
                                                acc[current.category].push({ ...current, originalIndex: idx });
                                                return acc;
                                            }, {} as Record<string, any[]>)).map(([category, items]) => {
                                                const isCoreCategory = category === '가. 안전관리 5대 핵심항목 이행 여부'
                                                if (!isCoreCategory) {
                                                    const selectedIdx = selectedSingleItems.get(category)
                                                    const selectedItem = selectedIdx !== undefined ? items.find((i: any) => i.originalIndex === selectedIdx) : null
                                                    return (
                                                        <tr key={`cat-${category}`} className="hover:bg-gray-50/50">
                                                            <td className="py-2 px-4 border border-gray-200 text-left font-semibold text-gray-800 align-middle bg-gray-50/70 break-keep w-[20%]">
                                                                {category}
                                                            </td>
                                                            <td className="py-2 px-3 border border-gray-200 w-[50%]">
                                                                <select
                                                                    value={selectedIdx !== undefined ? String(selectedIdx) : ''}
                                                                    onChange={(e) => selectSingleItem(category, e.target.value === '' ? null : Number(e.target.value))}
                                                                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none"
                                                                >
                                                                    <option value="">항목 선택...</option>
                                                                    {items.map((item: any) => (
                                                                        <option key={item.originalIndex} value={String(item.originalIndex)}>{item.item}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="py-1.5 px-2 border border-gray-200 w-[30%]">
                                                                {selectedItem ? (
                                                                    <input
                                                                        type="text"
                                                                        value={selectedItem.action}
                                                                        onChange={(e) => {
                                                                            const newItems = [...additionalItems];
                                                                            newItems[selectedItem.originalIndex].action = e.target.value;
                                                                            setAdditionalItems(newItems);
                                                                        }}
                                                                        onFocus={(e) => {
                                                                            if (e.target.value === '해당없음') {
                                                                                const newItems = [...additionalItems];
                                                                                newItems[selectedItem.originalIndex].action = '';
                                                                                setAdditionalItems(newItems);
                                                                            }
                                                                        }}
                                                                        onBlur={(e) => {
                                                                            if (e.target.value.trim() === '') {
                                                                                const newItems = [...additionalItems];
                                                                                newItems[selectedItem.originalIndex].action = '해당없음';
                                                                                setAdditionalItems(newItems);
                                                                            }
                                                                        }}
                                                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none"
                                                                        placeholder="조치내용 입력"
                                                                    />
                                                                ) : (
                                                                    <span className="text-sm text-gray-400 italic">항목 선택 후 입력</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                }
                                                const filledCount = coreItemSlots.filter(v => v !== null).length
                                                return [0, 1, 2].map(slotIndex => {
                                                    const selectedIdx = coreItemSlots[slotIndex]
                                                    const selectedItem = selectedIdx !== null ? items.find((i: any) => i.originalIndex === selectedIdx) : null
                                                    const usedIndices = coreItemSlots.filter((v, s) => v !== null && s !== slotIndex) as number[]
                                                    return (
                                                        <tr key={`core-slot-${slotIndex}`} className="hover:bg-gray-50/50">
                                                            {slotIndex === 0 && (
                                                                <td rowSpan={3} className="py-2 px-4 border border-gray-200 text-left font-semibold text-gray-800 align-middle bg-gray-50/70 break-keep">
                                                                    {category}
                                                                    <div className={`mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full inline-block ${filledCount === 3 ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                                        {filledCount}/3 선택
                                                                    </div>
                                                                </td>
                                                            )}
                                                            <td className="py-2 px-3 border border-gray-200">
                                                                <select
                                                                    value={selectedIdx !== null ? String(selectedIdx) : ''}
                                                                    onChange={(e) => setCoreSlot(slotIndex, e.target.value === '' ? null : Number(e.target.value))}
                                                                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none"
                                                                >
                                                                    <option value="">항목 선택...</option>
                                                                    {items.map((item: any) => (
                                                                        <option key={item.originalIndex} value={String(item.originalIndex)} disabled={usedIndices.includes(item.originalIndex)}>
                                                                            {item.item}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="py-1.5 px-2 border border-gray-200">
                                                                {selectedItem ? (
                                                                    <input
                                                                        type="text"
                                                                        value={selectedItem.action}
                                                                        onChange={(e) => {
                                                                            const newItems = [...additionalItems];
                                                                            newItems[selectedItem.originalIndex].action = e.target.value;
                                                                            setAdditionalItems(newItems);
                                                                        }}
                                                                        onFocus={(e) => {
                                                                            if (e.target.value === '해당없음') {
                                                                                const newItems = [...additionalItems];
                                                                                newItems[selectedItem.originalIndex].action = '';
                                                                                setAdditionalItems(newItems);
                                                                            }
                                                                        }}
                                                                        onBlur={(e) => {
                                                                            if (e.target.value.trim() === '') {
                                                                                const newItems = [...additionalItems];
                                                                                newItems[selectedItem.originalIndex].action = '해당없음';
                                                                                setAdditionalItems(newItems);
                                                                            }
                                                                        }}
                                                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white shadow-sm focus:ring-1 focus:border-blue-500 outline-none"
                                                                        placeholder="조치내용 입력"
                                                                    />
                                                                ) : (
                                                                    <span className="text-sm text-gray-400 italic">항목 선택 후 입력</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                })
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 하단 버튼 */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-white rounded-b-xl">
                    <div>
                        {step > 1 && (
                            <button onClick={() => setStep(step - 1)}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
                                ← 이전 단계
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} title="취소" className="flex items-center justify-center w-10 h-10 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                        {step < (inspectionType === '해빙기' ? 4 : 3) ? (
                            <button onClick={() => setStep(step + 1)}
                                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm">
                                다음 단계 →
                            </button>
                        ) : (
                            <button onClick={handleSave} disabled={saving} title={editingId ? '수정 완료' : '등록 완료'}
                                className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                                {saving ? (
                                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Save className="h-5 w-5" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 사진 편집 모달 (ImageEditor) */}
            {editingImage && (
                <ImageEditor
                    imageUrl={editingImage.url}
                    onSave={handleSaveEditedImage}
                    onClose={() => setEditingImage(null)}
                />
            )}

            {/* Signature Canvas Modal (Nested) */}
            {signatureModalOpen && currentSignIndex !== null && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                                {signatures[currentSignIndex].role} 서명
                            </h3>
                            <button onClick={() => setSignatureModalOpen(false)} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="bg-blue-50/50 p-3 rounded-lg mb-4 text-sm text-blue-800 border border-blue-100">
                            <strong>{signatures[currentSignIndex].name || signatures[currentSignIndex].role}</strong>님의 서명을 아래 영역에 그려주세요.
                        </div>
                        <div className="border border-gray-300 rounded-lg bg-gray-50 mb-5 relative touch-none shadow-inner overflow-hidden">
                            <SignatureCanvas
                                ref={signatureCanvasRef}
                                canvasProps={{ className: 'w-full h-56 cursor-crosshair sm:h-48' }}
                                backgroundColor="rgba(0,0,0,0)"
                            />
                            <div className="absolute inset-x-0 bottom-4 pointer-events-none flex justify-center">
                                <div className="border-b-2 border-dashed border-gray-300 w-3/4 opacity-50"></div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <button onClick={() => signatureCanvasRef.current?.clear()} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                                지우기
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => setSignatureModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors">취소</button>
                                <button onClick={() => {
                                    if (signatureCanvasRef.current?.isEmpty()) {
                                        alert('서명을 입력해주세요.');
                                        return;
                                    }
                                    const newSigs = [...signatures];
                                    newSigs[currentSignIndex].dataUrl = signatureCanvasRef.current!.toDataURL('image/png');
                                    setSignatures(newSigs);
                                    setSignatureModalOpen(false);
                                }} className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-sm inline-flex items-center gap-1.5">
                                    <Save className="h-4 w-4" /> 서명 완료
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
