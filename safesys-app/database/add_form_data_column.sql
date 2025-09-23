-- manager_inspections 테이블에 form_data 컬럼 추가
ALTER TABLE manager_inspections 
ADD COLUMN form_data JSONB;

-- inspection-photos 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inspection-photos', 'inspection-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- inspection-photos 버킷에 대한 정책 생성
CREATE POLICY "Anyone can view inspection photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'inspection-photos');

CREATE POLICY "Authenticated users can upload inspection photos" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'inspection-photos' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Users can update their own inspection photos" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'inspection-photos' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their own inspection photos" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'inspection-photos' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
