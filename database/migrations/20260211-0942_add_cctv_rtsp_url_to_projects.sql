-- Add CCTV RTSP URL column to projects table
ALTER TABLE projects
ADD COLUMN cctv_rtsp_url TEXT;

COMMENT ON COLUMN projects.cctv_rtsp_url IS 'CCTV RTSP 스트림 URL';
