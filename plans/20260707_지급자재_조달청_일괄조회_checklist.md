# 체크리스트 — 지급자재 조달청 일괄 조회

- [x] `/api/g2b/dlvr-req-list` 라우트 신설 (월 단위 + dminsttNm + 페이징 + 정규화)
- [x] `handleAddMaterialFromG2b`의 insert 로직을 `insertMaterialFromDlvrReq` 헬퍼로 추출
- [x] 대시보드 헤더에 "조달청 일괄 조회" 버튼 추가
- [x] 일괄 조회 모달 (수요기관 프리필, 기간, 진행률, 키워드 필터, 등록됨 배지, 선택 등록)
- [x] tsc로 변경 파일 타입 검증 (신규 오류 없음), 라우트 dev 서버 실호출 검증 (정상·검증에러 케이스), 페이지 200 확인
- [x] 커밋
