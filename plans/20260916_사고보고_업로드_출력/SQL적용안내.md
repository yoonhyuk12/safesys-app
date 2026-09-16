# 사고보고 SQL 적용 안내

기존 사고현황 테이블(`public.project_accidents`)이 있는 SafeSys 프로젝트의 Supabase SQL Editor에서 아래 파일을 순서대로 실행한다. 세 파일 모두 재실행 가능하다.

1. [현장 작성·공동 수정 권한](../../database/20260916-1032_사고보고_현장작성_권한.sql).
2. [보고서 추가 항목·사진 컬럼](../../database/20260916-1418_사고보고_보고서_항목.sql).
3. [산재요양 예상 일수 검증 확장](../../database/20260916-1720_사고보고_산재요양_예상일수.sql).

세 번째 파일은 `expectedTreatmentDays`를 허용 키에 추가한다. 빈 문자열 또는 0 이상 안전 정수의 숫자 문자열만 허용하며 사진·문자 형식 검증은 유지한다. 이미 적용한 1418 파일을 수정하지 않고 1720 파일을 후속 적용해야 한다.

두 번째 파일의 핵심 변경은 다음과 같다. **이 한 줄만 실행하지 말고 파일 전체를 실행해야 사진 장수·형식·용량 제한 CHECK가 함께 적용된다.**

```sql
ALTER TABLE public.project_accidents
  ADD COLUMN IF NOT EXISTS report_details JSONB;
```

기존 사고 기록은 그대로 남고 새 컬럼은 NULL이다. 사진 전용 Storage 버킷이나 새 테이블은 만들지 않는다. SQL 적용을 마친 뒤 앱을 배포한다. 자동 채움은 기존 `GEMINI_API_KEY` 환경 변수를 사용한다.

이번 개발 작업에서 운영 SQL 실행과 앱 배포는 하지 않았다.
