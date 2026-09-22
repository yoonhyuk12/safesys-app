# 관리자 프로필 저장 오류 수정

운영 로그의 check_company_name_by_role 위반을 재현하고 기존 ProfileEditModal 저장 규칙을 관리자 PATCH에 적용한다. 회사명은 trim 후 빈 값을 null로 저장하고 최종 발주청 역할에는 회사명을 null로 강제한다. 나머지 문자열은 trim만 적용하여 null 의미를 변경하지 않는다. 부분 수정은 현재 역할·회사만 조회하여 생략 필드를 보존한다.

기존 node:test TypeScript transpile/mock 패턴으로 RED → GREEN을 검증한다. 인증·DB 스키마는 변경하지 않는다. 추가 지시에 따라 관리자 편집 모달에서 발주청 회사는 한국농어촌공사로 고정 표시한다. 빌드·커밋·푸시는 수행하지 않는다.
