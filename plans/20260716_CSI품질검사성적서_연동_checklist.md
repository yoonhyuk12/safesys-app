# CSI 품질검사 성적서 연동 체크리스트

- [x] `.env.local`에 `CSI_API_KEY` 자리 추가 (사용자 키 기입 완료)
- [x] `src/lib/quality/csi-report-types.ts` — 정규화 타입 정의
- [x] `src/app/api/csi/quality-reports/route.ts` — 조회·그룹핑 라우트
- [x] `src/components/project/quality/CsiReportImportModal.tsx` — 조회 모달
- [x] `QualityTestRecordsTab.tsx` — 헤더 버튼 + 가져오기 프리필 핸들러
- [x] `npm run lint` 통과 (신규·변경 파일 경고 0)
- [x] `npx tsc --noEmit` 통과
- [ ] CSI 신청기관 IP를 개발 PC 공인 IP(58.232.131.219)로 수정 후 로컬 조회 재검증 (사용자 조치 필요)
- [ ] 운영(Vercel) IP 문제 해결 방안 확정 — CSI 문의 또는 고정 IP 프록시 (미해결)
- [ ] Vercel 환경변수 `CSI_API_KEY` 등록 + 재배포 (운영 반영 시)
