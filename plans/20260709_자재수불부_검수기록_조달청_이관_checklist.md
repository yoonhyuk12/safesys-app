# 체크리스트 — 자재수불부 검수기록 조달청 이관

- [x] `BulkInspectionAssign.tsx` 신규 컴포넌트 — 좌측 수기 행 목록(자재별 그룹, 발주량 취소선)
- [x] 클릭/Ctrl 토글/Shift 범위 선택 + 선택 묶음 드래그
- [x] 우측 납품요구 건 카드 + 품목 드롭 존 + 배정 리스트/해제(×)
- [x] "선택 행 배정" 버튼(드래그 대체 수단)
- [x] 단위 불일치 경고 아이콘
- [x] page.tsx — 일괄 조회 모달 step 상태, "⚒ 등록 + 검수기록 이관" 버튼, 선택 건 상세 일괄 조회
- [x] 적용 핸들러 — 자재 등록(insertMaterialFromDlvrReq 재사용) → 행 UPDATE 재배치(order_qty null, created_at 재부여) → 빈 자재 삭제(재확인 후) → loadData
- [x] 저장 누계 컬럼(pass_qty_total 등) 렌더 방식 확인 후 필요 시 재계산 — 저장값 표시 확인, `recalcPassTotalsForMaterial`로 재계산
- [x] "이관 후 빈 수기 자재 삭제" 체크박스 + 대상 자재명 표시
- [x] `npx tsc --noEmit` 통과 — 대상 2파일 오류 0 (기존 무관 파일 오류만 잔존)
- [x] `npm run lint` 통과 — 대상 2파일 신규 오류 0 (보고된 26건 전부 기존 코드 구간)
- [x] dev 서버 수동 확인 — 페이지 컴파일 HTTP 200 (드래그·적용 실동작은 사용자 브라우저에서 확인 예정)
- [x] Advisor diff 검증 → 커밋 — RLS(`USING (true)`)·트리거 부재 확인으로 created_at/material_id UPDATE 안전
