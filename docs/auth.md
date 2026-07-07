<!-- 인증·권한: 역할 체계·조직 구조·접근 권한 패턴·인증 플로우 -->
# 인증 및 권한

## 역할 체계

- **발주청** (클라이언트): 전사 데이터 조회 가능 (본부급 또는 관리자)
- **감리단** (감독): 소속 지사 데이터만 조회
- **시공사** (계약업체): 소속 지사 데이터만 조회

## 조직 구조

본부(hq_division) → 지사(branch_division) 계층 구조.

## 접근 권한 패턴

```typescript
// 전사 보기 권한
const canSeeAllHq = userProfile?.role === '발주청' &&
  (userProfile.hq_division == null || userProfile.branch_division?.endsWith('본부'))
```

## 인증 플로우

- **AuthContext** (`src/contexts/AuthContext.tsx`): 전역 인증 상태 (user, userProfile, refreshProfile, signOut)
- **SupabaseProvider** (`src/providers/SupabaseProvider.tsx`): Supabase 클라이언트/세션 제공
- 자동 토큰 갱신 (`autoRefreshToken` 활성화)

## 보안 체크리스트 (커밋 전)

- [ ] 하드코딩된 시크릿(API 키·비밀번호·토큰) 없음
- [ ] 모든 사용자 입력 검증
- [ ] SQL 인젝션 방지(파라미터화 쿼리), XSS 방지(HTML 새니타이즈)
- [ ] 인증/인가 검증, 엔드포인트 레이트 리밋
- [ ] 에러 메시지가 민감 정보를 노출하지 않음
- 시크릿은 절대 소스에 하드코딩하지 말고 환경 변수/시크릿 매니저를 쓴다. 노출 시 즉시 교체한다.
