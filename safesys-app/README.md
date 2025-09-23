# SafeSys - 안전관리 시스템

SafeSys는 Next.js와 Supabase를 기반으로 한 현대적이고 스마트한 안전관리 솔루션입니다.

## 🚀 주요 기능

- **안전 점검 관리**: 체계적인 안전 점검 시스템
- **사고 보고**: 신속한 사고 신고 및 관리
- **직원 관리**: 역할 기반 사용자 권한 관리
- **안전 교육**: 교육 과정 관리 및 이수 추적
- **실시간 대시보드**: 안전 현황 모니터링
- **알림 시스템**: 중요한 안전 이벤트 알림

## 🛠 기술 스택

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS, Lucide React Icons
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **Authentication**: Supabase Auth
- **Database**: PostgreSQL with Row Level Security

## 📋 사전 요구사항

- Node.js 18.17 이상
- npm 또는 yarn
- Supabase 계정 및 프로젝트

## 🔧 설치 및 설정

### 1. 프로젝트 클론
```bash
git clone <your-repository-url>
cd safesys-app
```

### 2. 의존성 설치
```bash
npm install
```

### 3. Supabase 프로젝트 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. 프로젝트 설정에서 API URL과 anon key 복사
3. `.env.local` 파일 생성:

```env
# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# 애플리케이션 설정
NEXT_PUBLIC_APP_NAME=SafeSys 안전관리 시스템
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 4. 데이터베이스 스키마 설정

1. Supabase 대시보드의 SQL Editor로 이동
2. `database/schema.sql` 파일의 내용을 복사하여 실행
3. 테이블과 RLS 정책이 생성되었는지 확인

### 5. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속

## 📚 데이터베이스 구조

### 주요 테이블

- **user_profiles**: 사용자 프로필 및 권한 정보
- **safety_inspections**: 안전 점검 기록
- **safety_checklist_items**: 점검 체크리스트 항목
- **incident_reports**: 사고 보고서
- **safety_trainings**: 안전 교육 과정
- **training_completions**: 교육 이수 기록
- **safety_equipment**: 안전 장비 관리
- **safety_policies**: 안전 규정 및 정책
- **notifications**: 시스템 알림
- **system_logs**: 시스템 활동 로그

### 사용자 역할

- **admin**: 시스템 전체 관리자
- **supervisor**: 부서 관리자
- **employee**: 일반 직원
- **contractor**: 외부 계약업체

## 🔐 보안 기능

- **Row Level Security (RLS)**: 데이터 접근 권한 제어
- **인증**: Supabase Auth를 통한 안전한 로그인
- **권한 기반 접근**: 역할에 따른 데이터 접근 제한
- **실시간 감사**: 모든 중요 활동 로깅

## 📱 사용법

### 1. 첫 로그인
- 계정 생성 후 관리자가 역할과 부서를 설정해야 합니다
- 초기 관리자 계정은 데이터베이스에서 직접 설정이 필요합니다

### 2. 안전 점검 수행
1. 대시보드에서 "새 점검 시작" 클릭
2. 점검 정보 입력 (제목, 위치, 설명)
3. 체크리스트 항목별 점검 수행
4. 점검 완료 및 점수 기록

### 3. 사고 신고
1. "사고 신고" 버튼 클릭
2. 사고 정보 상세 입력
3. 심각도 및 상태 설정
4. 관리자에게 자동 알림 발송

### 4. 교육 관리
- 관리자: 교육 과정 생성 및 관리
- 직원: 할당된 교육 수강 및 이수

## 🚀 배포

### Vercel 배포
1. Vercel 계정 생성 및 GitHub 연동
2. 프로젝트 import
3. 환경 변수 설정
4. 자동 배포 완료

### Netlify 배포
1. Netlify 계정 생성
2. GitHub repository 연결
3. 빌드 설정: `npm run build`
4. 환경 변수 설정

## 🧪 개발

### 코드 구조
```
src/
├── app/              # Next.js App Router 페이지
├── components/       # React 컴포넌트
│   ├── auth/        # 인증 관련 컴포넌트
│   └── ui/          # UI 공통 컴포넌트
├── contexts/        # React Context
├── lib/             # 유틸리티 및 설정
└── hooks/           # 커스텀 React Hooks
```

### 개발 명령어
```bash
npm run dev          # 개발 서버 실행
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버 실행
npm run lint         # ESLint 검사
npm run type-check   # TypeScript 타입 검사
```

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 📞 지원

문제가 있거나 질문이 있으시면 이슈를 생성해 주세요.

---

SafeSys로 더 안전한 작업환경을 만들어보세요! 🛡️
