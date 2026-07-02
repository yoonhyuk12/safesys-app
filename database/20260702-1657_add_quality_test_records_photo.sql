-- 품질검사 실시대장 시험 항목별 사진 첨부 (사진대지 출력용)
ALTER TABLE quality_test_records ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- quality-test-photos 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quality-test-photos', 'quality-test-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- quality-test-photos 버킷에 대한 정책 생성 (경로가 ${projectId}/... 이라 safety-inspection-photos와 동일하게 authenticated 기준으로 판단)
CREATE POLICY "quality_test_photos_storage_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'quality-test-photos');

CREATE POLICY "quality_test_photos_storage_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'quality-test-photos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "quality_test_photos_storage_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'quality-test-photos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "quality_test_photos_storage_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'quality-test-photos'
        AND auth.role() = 'authenticated'
    );
