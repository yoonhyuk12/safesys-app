// 770 특별점검 사진을 압축해 safety-inspection-photos 버킷에 올리고 지우는 저장소 헬퍼
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image-compress'

const BUCKET = 'safety-inspection-photos'

/** 사진을 압축(긴 변 1200px, JPEG 0.75)해 올리고 공개 URL을 돌려준다. */
export async function uploadSpecial770Photo(projectId: string, file: File | Blob, tag: string): Promise<string> {
  const compressed = await compressImage(file, 1200, 0.75)
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = `${projectId}/${Date.now()}_770_${safeTag}_${Math.random().toString(36).slice(2, 8)}.jpg`
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, compressed, { contentType: 'image/jpeg' })
  if (error || !data) throw new Error(error?.message || '사진 업로드 실패')
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

/** 공개 URL에 해당하는 저장소 파일을 지운다. 실패해도 화면 흐름은 막지 않는다. */
export async function removeSpecial770Photo(url: string | null | undefined): Promise<void> {
  if (!url || url === 'N/A') return
  const path = url.split(`/${BUCKET}/`)[1]
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.warn('사진 저장소 삭제 경고:', error)
}
