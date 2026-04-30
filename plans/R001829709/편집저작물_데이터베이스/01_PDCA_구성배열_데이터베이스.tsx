/*
 * ============================================================================
 *  SafeSys - 편집저작물(데이터베이스) 구성배열 정의 소스코드
 *  파일출처: safesys-app/src/app/project/[id]/page.tsx (전체 974줄 중 666~872줄 발췌)
 *  ----------------------------------------------------------------------------
 *  본 코드는 SafeSys 안전관리시스템 "프로젝트 상세 화면"의
 *  PDCA(Plan-Do-Check-Act) 4단계 분류체계와
 *  각 단계 안에 배치된 19종 안전관리 서류(DocumentFolder)의
 *  선택·배열·색상·연결경로(라우팅/외부URL)를
 *  데이터 구조로 정의한 핵심 부분입니다.
 *
 *  편집저작물 데이터베이스의 실체:
 *   - PDCA 4그룹의 순서적 배열 (P → D → C → A)
 *   - 각 그룹별 서류의 선택과 순번
 *   - 각 서류의 색상 카테고리(분홍/노랑/하늘/연두/회색)
 *   - 각 서류의 연결 행위(내부 라우팅 / 외부 URL / 준비중 안내)
 *   - 상태 표시(준비중, 비활성, 뱃지카운트)
 * ============================================================================
 */

{/* 문서철 그리드 - PDCA 그룹핑 */}
<div className="flex flex-wrap justify-center gap-3">
  {/* P (계획) */}
  <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>P (계획)</div>
    <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
      <DocumentFolder
        title="안전
서류
관리"
        year={new Date().getFullYear().toString()}
        isActive={false}
        onClick={() => router.push(`/project/${projectId}/safe-documents`)}
        pdcaCategory="P"
      />
      <DocumentFolder
        title="시공
서류
관리"
        year={new Date().getFullYear().toString()}
        isActive={false}
        externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSdY1beSxNGj6niH6_jG7onccyQsUoIBfldYbIWsbMkc7VoQKA/viewform"
        pdcaCategory="P"
      />
      <DocumentFolder
        title="품질
서류
관리"
        year={new Date().getFullYear().toString()}
        isActive={false}
        externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSeSTpnRsOBiy0myufl0itGdeDeVzfkYWeybqBhR7ThDef5HHw/viewform"
        pdcaCategory="P"
      />
      <DocumentFolder
        title="위험성평가 AI GPT"
        year={new Date().getFullYear().toString()}
        isActive={false}
        externalUrl="https://chatgpt.com/g/g-uhvOsghT3-hangugnongeocongongsa-wiheomseongpyeongga-jagseong-ai"
        pdcaCategory="P"
      />
      <DocumentFolder
        title="︵AI︶수시
위험성 평가"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        isPending={true}
        onClick={() => router.push(`/project/${projectId}/risk-assessment`)}
        pdcaCategory="P"
      />
    </div>
  </div>

  {/* D (실행) */}
  <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>D (실행)</div>
    <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
      <DocumentFolder
        title="일일안전교육
︵AI TBM일지︶"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        onClick={() => router.push(`/project/${projectId}/tbm-submission`)}
        isProjectActive={project.is_active !== false}
      />
      <DocumentFolder
        title="신규근로자
현장안내"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        onClick={() => router.push(`/project/${projectId}/new-worker-orientation`)}
      />
      <DocumentFolder
        title="근로자
관리대장"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        onClick={() => router.push(`/project/${projectId}/worker-management`)}
      />
      <DocumentFolder
        title="폭염대비점검"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        isProjectActive={project.is_active !== false}
      />
      <DocumentFolder
        title="자재
수불부"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        onClick={() => router.push(`/project/${projectId}/material-ledger`)}
        bottomLabel="사업"
      />
      <DocumentFolder
        title="위험공종
작업허가제
︵PTW︶"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        isPending={true}
        onClick={() => router.push(`/project/${projectId}/ptw`)}
      />
    </div>
  </div>

  {/* C (점검) */}
  <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>C (점검)</div>
    <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
      <DocumentFolder
        title="︵본부︶ 안전점검"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        projectName={project?.project_name}
        managingBranch={project?.managing_branch}
        onClick={() => router.push(`/project/${projectId}/headquarters-inspection`)}
        badgeCount={hqPendingCount}
        pdcaCategory="C"
      />
      {project?.managing_branch?.endsWith('지사') && (
        <DocumentFolder
          title="︵지사︶ 안전점검"
          year={new Date().getFullYear().toString()}
          isActive={false}
          projectId={projectId}
          projectName={project?.project_name}
          managingBranch={project?.managing_branch}
          onClick={() => router.push(`/project/${projectId}/manager-inspection`)}
          pdcaCategory="C"
        />
      )}
      <DocumentFolder
        title="정기점검
︵해빙,우기,
종합,특별︶"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        onClick={() => router.push(`/project/${projectId}/safety-inspection-ledger`)}
        badgeCount={safetyLedgerPendingCount}
        pdcaCategory="C"
      />
      <DocumentFolder
        title="안전점검 GPT"
        year={new Date().getFullYear().toString()}
        isActive={false}
        externalUrl="https://chatgpt.com/g/g-nsUeMuOdM-hangugnongeocongongsa-anjeonjeomgeom-caesbos"
        pdcaCategory="C"
      />
      <DocumentFolder
        title="︵AI︶
일일안전점검"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        isPending={true}
        onClick={() => router.push(`/project/${projectId}/daily-inspection`)}
        pdcaCategory="C"
      />
    </div>
  </div>

  {/* A (조치) */}
  <div className="relative border-2 border-dashed border-white/60 rounded-lg p-4 pt-5 w-fit">
    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-white/80 text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: 'rgb(23, 37, 84)' }}>A (조치)</div>
    <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
      <DocumentFolder
        title="관리자 TBM
활동 점검"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        onClick={() => router.push(`/project/${projectId}/tbm-safety-inspection`)}
        pdcaCategory="A"
      />
      <DocumentFolder
        title="휴일작업
관리대장"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        isPending={true}
        onClick={() => router.push(`/project/${projectId}/holiday-work`)}
        pdcaCategory="A"
      />
      <DocumentFolder
        title="︵자동︶
지적사항
관리대장"
        year={new Date().getFullYear().toString()}
        isActive={false}
        projectId={projectId}
        isPending={true}
        onClick={() => router.push(`/project/${projectId}/issue-management`)}
        pdcaCategory="A"
      />
    </div>
  </div>
</div>
