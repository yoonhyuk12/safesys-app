# 근거와 결정

- 운영 장애 근거는 코디네이터가 제공한 2026-09-22T21:17 SQLSTATE 23514 로그이며 PII는 기록하지 않는다.
- ProfileEditModal은 발주청 회사 null, 다른 역할 회사 trim을 사용한다. 신규 의존성 없이 기존 패턴을 재사용한다.
- GitHub supabase-js 검색에서 maybeSingle 구현을 확인했다. Supabase 웹 문서 조회는 도구의 404/콘텐츠 형식 오류로 실패했으므로 로컬 기존 maybeSingle 패턴을 따른다.
- 지정 superpowers 스킬은 현재 카탈로그에 없으며 기존 계획·node:test·직접 diff 검토로 진행한다. 최종 독립 검증은 코디네이터가 수행한다.
- 코디네이터 추가 지시에 따라 blank→null 변환은 회사명만 적용했다. 본부·지사·이름·연락처·직책의 기존 빈 문자열/null 구분을 보존한다.
- 시공사·감리단 회사 필수는 기존 ProfileEditModal company_name input의 required와 일치한다. 다른 필수 항목은 추가하지 않았다.
- 역할 조회와 수정 사이 경쟁 상태는 DB CHECK가 최종 방어하며 알려진 회사 CHECK는 사용자에게 안전한 400 메시지를 반환한다. 오류 로그는 code만 기록하여 DB details의 레코드 PII를 남기지 않는다.
- 검증 결과: npm run test:admin-user-profile 13/13 통과, npm run lint exit 0(기존 경고), npx tsc --noEmit exit 0. 실제 운영 DB에 쓰지 않았고 빌드·커밋·푸시는 수행하지 않았다.
- 관리자 모달의 발주청 회사 입력은 한국농어촌공사 readOnly 표시다. 다른 역할로 돌아가면 기존 draft 회사명이 다시 편집 가능하며 DB에는 발주청 회사 null만 저장된다.
