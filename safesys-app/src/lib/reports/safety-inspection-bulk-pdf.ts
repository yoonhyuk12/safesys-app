import { supabase } from '@/lib/supabase'
import { appendSafetyInspectionPages } from './safety-inspection-report-pdf'

export async function generateBulkSafetyInspectionPdf(options: {
  branchName?: string
  hqName?: string
  projectIds: string[]
  inspectionType?: string
  selectedYear: number
  onProgress: (current: number, total: number, stage: string) => void
}): Promise<void> {
  const { branchName, hqName, projectIds, inspectionType, selectedYear, onProgress } = options

  if (projectIds.length === 0) {
    throw new Error('다운로드할 프로젝트가 없습니다.')
  }

  onProgress(0, 0, '점검 데이터 조회 중...')

  // 1. 프로젝트 정보 조회
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, project_name')
    .in('id', projectIds)
  if (projError) throw new Error(projError.message)
  const projectMap = new Map((projects || []).map(p => [p.id, p]))

  // 2. 점검 목록 조회 (연도 + 유형 필터)
  const BATCH_SIZE = 30
  const allInspections: any[] = []

  for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
    const batchIds = projectIds.slice(i, i + BATCH_SIZE)
    let query = supabase
      .from('safety_inspections')
      .select('*')
      .in('project_id', batchIds)
      .gte('inspection_date', `${selectedYear}-01-01`)
      .lte('inspection_date', `${selectedYear}-12-31`)
      .order('inspection_date', { ascending: true })

    if (inspectionType) {
      query = query.eq('inspection_type', inspectionType)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    if (data) allInspections.push(...data)
  }

  if (allInspections.length === 0) {
    throw new Error('해당 조건의 점검 데이터가 없습니다.')
  }

  // 3. 점검별 결과 + 사진 일괄 조회
  const inspectionIds = allInspections.map(ins => ins.id)
  const allResults: any[] = []
  const allPhotos: any[] = []

  for (let i = 0; i < inspectionIds.length; i += BATCH_SIZE) {
    const batchIds = inspectionIds.slice(i, i + BATCH_SIZE)

    const [resResult, photoResult] = await Promise.all([
      supabase
        .from('safety_inspection_results')
        .select('*')
        .in('inspection_id', batchIds)
        .order('sort_order', { ascending: true }),
      supabase
        .from('safety_inspection_photos')
        .select('*')
        .in('inspection_id', batchIds)
        .order('sort_order', { ascending: true }),
    ])

    if (resResult.error) throw new Error(resResult.error.message)
    if (photoResult.error) throw new Error(photoResult.error.message)
    if (resResult.data) allResults.push(...resResult.data)
    if (photoResult.data) allPhotos.push(...photoResult.data)
  }

  // 그룹핑
  const resultsMap = new Map<string, any[]>()
  allResults.forEach(r => {
    const arr = resultsMap.get(r.inspection_id) || []
    arr.push(r)
    resultsMap.set(r.inspection_id, arr)
  })

  const photosMap = new Map<string, any[]>()
  allPhotos.forEach(p => {
    const arr = photosMap.get(p.inspection_id) || []
    arr.push(p)
    photosMap.set(p.inspection_id, arr)
  })

  // 4. jsPDF 인스턴스 생성 후 순차 페이지 추가
  const jsPDF = (await import('jspdf')).jsPDF
  const pdf = new jsPDF('p', 'mm', 'a4')

  const totalCount = allInspections.length

  for (let idx = 0; idx < totalCount; idx++) {
    const ins = allInspections[idx]
    const project = projectMap.get(ins.project_id) || { project_name: '' }
    const results = resultsMap.get(ins.id) || []
    const photos = photosMap.get(ins.id) || []

    onProgress(idx + 1, totalCount, `PDF 생성 중 (${idx + 1}/${totalCount})`)

    await appendSafetyInspectionPages(pdf, {
      inspection: ins,
      results,
      photos,
      project,
    }, idx === 0)
  }

  // 5. 파일명 생성 및 저장
  const scope = branchName || hqName || '전체'
  const typeLabel = inspectionType || '전체'
  const rawName = `정기안전점검_보고서_${scope}_${typeLabel}_${selectedYear}`
  const fileName = rawName.replace(/[\\/:*?"<>|]/g, '_') + '.pdf'
  pdf.save(fileName)
}
