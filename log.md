# 작업 로그

<!-- worklog -->
260907_155410 : docs/database.md 수정
260907_155336 : safesys-app/tests/merge-projects-api.test.mjs 수정 — "test('충돌 안내 문구는 0건 항목을 빼고 마지막 낱말에 맞는 조사를 붙인다', () => { asser…"
260907_155326 : safesys-app/tests/merge-projects-api.test.mjs 수정 — "const mergeConflicts = await transpile('../src/lib/merge-con…"
260907_155234 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "assert.match(missingTarget.message, /target/) }) test('미리보기가…"
260907_155216 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "test('두 현장 공정표가 서로 다르면 MERGE_SCHEDULE_CONFLICT로 전체가 롤백된다', a…"
260907_155150 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "겹치는 작업일보와 품질시험 월간보고서가 없고, 시공공정표도 그대로 옮길 수 있습니다."
260907_155143 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs leadi…"
260907_155134 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "<div className="rounded-md border border-blue-200 bg-blue-50…"
260907_155110 : safesys-app/src/lib/merge-conflicts.ts 수정 — "/** 마지막 글자의 받침에 따라 주격 조사(이/가)를 고른다. */ function subjectParti…"
260907_155056 : database/20260907-1525_merge_projects_preserve_data.sql 수정
260907_155043 : database/20260907-1525_merge_projects_preserve_data.sql 수정
260907_155018 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "v_conflicts := public.preview_project_merge_v2(p_source, p_t…"
260907_155007 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "-- source 공정표를 원본 그대로 옮길 수 없는 두 경우를 모두 충돌로 본다. -- (1) 두 현장 모…"
260907_154936 : plans/20260907_프로젝트병합_데이터보존.md 수정, plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_154453 : plans/20260907_프로젝트병합_데이터보존_checklist.md 수정, plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_154259 : docs/database.md 수정 — "- **프로젝트 병합(`merge_projects` DB 함수)도 함께 갱신한다.** 병합은 자식 테이블의 …"
260907_154227 : docs/database.md 수정 — "- 2026-09-07 기준 `projects`를 참조하는 자식 테이블은 27개이며, 비용 귀속용 `ai_u…"
260907_154206 : plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_154141 : safesys-app/package.json 수정 — ""lint": "next lint", "test:merge-sql": "node --test tests/me…"
260907_154101 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "// 프로젝트 병합 SQL(merge_projects/merge_projects_safe_v2/preview…"
260907_153920 : safesys-app/tests/fixtures/merge-projects-db.mjs 수정 — "/** 스키마와 병합 마이그레이션을 적용한 새 PGlite DB를 만든다. 준비 중 실패하면 인스턴스를 닫고…"
260907_153909 : database/20260907-1525_merge_projects_preserve_data.sql 수정
260907_153903 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "construction_schedule = CASE WHEN v_copy_schedule THEN v_src…"
260907_153854 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "v_copy_address := (v_tgt.site_address IS NULL OR BTRIM(v_tgt…"
260907_153843 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "IF (v_conflicts ->> 'workDailyReports')::INT > 0 OR (v_confl…"
260907_153834 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "v_src projects%ROWTYPE; v_tgt projects%ROWTYPE; v_copy_addre…"
260907_153826 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "-- 공정표 인덱스는 착공·준공일 기준 상대 위치라, 보충 후 날짜가 달라지면 원본 의미가 훼손된다. SEL…"
260907_153816 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "DECLARE v_work_daily INT; v_quality_monthly INT; v_schedule_…"
260907_153810 : database/20260907-1525_merge_projects_preserve_data.sql 수정, plans/20260907_프로젝트병합_데이터보존_checklist.md 수정, plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_153611 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "assert.equal(dates.rows[0].end_date, '2026-12-30')"
260907_153605 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "await callMerge(db) const target = await projectRow(db, IDS.…"
260907_153449 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "-- 프로젝트 병합에서 작업일보·품질 월간보고서 삭제를 없애고 누락 등록값을 묶음 단위로 보충한다 -- 배경…"
260907_153447 : safesys-app/tests/merge-projects-api.test.mjs 수정
260907_153425 : safesys-app/tests/merge-projects-api.test.mjs 수정
260907_153400 : safesys-app/tests/merge-projects-api-modal.test.mjs 삭제
260907_153354 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "setError('겹치는 자료가 있어 합칠 수 없습니다.')"
260907_153346 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "{previewLoading && ( <p className="flex items-center gap-2 t…"
260907_153329 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "import { hasMergeConflict, parseMergeConflictCounts, type Me…"
260907_153322 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const conflicts = previewReady && preview ? preview.conflict…"
260907_153309 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "// 4. 겹치는 보고서나 공사기간이 다른 공정표가 있으면 원본 보존을 위해 병합을 시작하지 않는다"
260907_153301 : safesys-app/src/app/api/projects/merge/route.ts 수정
260907_153253 : safesys-app/src/lib/merge-conflicts.ts 수정 — "const parts: string[] = [] if (counts.workDailyReports > 0) …"
260907_153243 : safesys-app/src/lib/merge-conflicts.ts 수정 — "const { message, details } = error as { message?: unknown; d…"
260907_153236 : safesys-app/src/lib/merge-conflicts.ts 수정 — "/** 유한한 0 이상 정수 두 개와 공정표 충돌 여부를 갖춘 객체만 충돌 정보로 인정한다. */ expor…"
260907_153225 : safesys-app/src/lib/merge-conflicts.ts 수정 — "export interface MergeConflictCounts { workDailyReports: num…"
260907_153216 : database/20260907-1525_merge_projects_preserve_data.sql 추가
260907_153125 : safesys-app/tests/fixtures/merge-projects-schema.sql 수정 — "-- 프로젝트 병합 SQL 회귀 테스트용 최소 스키마. 운영 DB 구조(projects + FK 자식 27개…"
260907_153112 : safesys-app/tests/merge-projects-sql.test.mjs 추가 — "// 프로젝트 병합 SQL(merge_projects/merge_projects_safe_v2/preview…"
260907_152854 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "disabled={loading || previewLoading || !previewReady || bloc…"
260907_152853 : safesys-app/tests/fixtures/merge-projects-db.mjs 추가 — "// 프로젝트 병합 SQL 테스트용 PGlite 인메모리 DB 준비와 표준 시드 데이터 헬퍼. import …"
260907_152849 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "{previewLoading && ( <p className="flex items-center gap-2 t…"
260907_152835 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const json = await res.json() as { success?: boolean; error?…"
260907_152822 : plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정, safesys-app/src/components/project/MergeProjectsModal.tsx 수정
260907_152806 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정, tests_tmp_placeholder.txt 삭제
260907_152752 : tests_tmp_placeholder.txt 추가 — "placeholder"
260907_152751 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const previewReady = Boolean( source && target && preview &&…"
260907_152737 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const json = await response.json() as MergePreviewResponse i…"
260907_152717 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "// 확인 모달이 열리면 서버 미리보기로 겹치는 보고서 건수와 공유자 전환 계정을 함께 조회한다. useEf…"
260907_152659 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const [preview, setPreview] = useState<MergePreview | null>(…"
260907_152654 : safesys-app/tests/fixtures/merge-projects-schema.sql 추가 — "-- 프로젝트 병합 SQL 회귀 테스트용 최소 스키마. 운영 DB 구조(projects + FK 자식 27개…"
260907_152647 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "interface MergePreview { sourceId: string targetId: string t…"
260907_152637 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "import type { Project } from '@/lib/projects' import { supab…"
260907_152628 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "// 4. 겹치는 보고서가 있으면 원본 보존을 위해 병합을 시작하지 않는다 const conflictResu…"
260907_152612 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "return NextResponse.json({ success: true, targetProjectName:…"
260907_152604 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "const conflictResult = await loadMergeConflicts(sourceId, ta…"
260907_152557 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "import { NextRequest, NextResponse } from 'next/server' impo…"
260907_152541 : safesys-app/src/lib/merge-conflicts.ts 추가 — "// 프로젝트 병합 미리보기의 충돌 건수를 엄격히 검증하고 안내 문구·오류 종류를 판별하는 유틸. expor…"
260907_152521 : safesys-app/tests/merge-projects-api-modal.test.mjs 추가 — "// 병합 모달이 서버 미리보기 충돌 건수만 쓰고 폐기 안내를 남기지 않는지 검증하는 정적 회귀 테스트. i…"
260907_152451 : safesys-app/tests/merge-projects-api.test.mjs 추가 — "// 프로젝트 병합 API의 권한·충돌 차단·버전 RPC 호출·오류 응답을 검증한다. import asser…"
260907_152448 : plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_152323 : safesys-app/package-lock.json 수정, safesys-app/package.json 수정
260907_152136 : plans/20260907_프로젝트병합_데이터보존.md 추가, plans/20260907_프로젝트병합_데이터보존_checklist.md 추가, plans/20260907_프로젝트병합_데이터보존_context-notes.md 추가
260904_180333 : .claude/hooks/log_change.py 수정
260904_180059 : .claude/hooks/worklog.js 삭제
260904_180044 : .claude/hooks/log_change.py 수정, .claude/hooks/session_brief.py 수정
260904_175631 : .claude/skills/worklog/SKILL.md 수정
260904_175615 : .claude/skills/worklog/SKILL.md 수정
260904_175155 : .claude/skills/worklog/SKILL.md 수정 — "--- name: worklog description: log.md 작업 로그 자동 기록 장치(git sta…"
260904_175103 : .gitignore 수정 — ".claude/hooks/.log_state.json .claude/hooks/.log.lock"
260904_111449 : 수정 CLAUDE.md, docs/index.md | 실행 git checkout, git commit, git push
260904_104107 : 수정 CLAUDE.md, docs/index.md | 생성 docs/design-canvas/Controls.dc.html, docs/design-canvas/Deviations.dc.html, docs/design-canvas/Main.dc.html, docs/design-canvas/Patterns.dc.html, docs/design-canvas/Typography.dc.html, docs/design-canvas/canvas.json 외 1개
260903_102837 : 수정 docs/현행시스템_정의서.md | 실행 npm i, sed 's
260903_101323 : 수정 docs/현행시스템_정의서_조사원문.md | 생성 docs/현행시스템_정의서.md | 실행 git mv
260902_105223 : 수정 docs/environment.md
260902_104642 : 수정 docs/environment.md
260902_090759 : 수정 CLAUDE.md, docs/environment.md, docs/troubleshooting.md
260902_235928 : 실행 npm install
260902_185254 : 실행 git push
260902_184958 : 실행 git commit, git push
260902_184423 : 생성 .claude/hooks/worklog.js, .claude/settings.json, .claude/skills/worklog/SKILL.md
