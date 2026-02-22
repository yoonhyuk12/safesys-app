export interface SafetyInspectionReportPdfParams {
  inspection: any;
  results: any[];
  photos: any[];
  project: any;
}

export async function generateSafetyInspectionReportPdf(params: SafetyInspectionReportPdfParams): Promise<void> {
  const { inspection, results, photos, project } = params;

  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = (await import('jspdf')).jsPDF;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgW = 210;

  // Parse supervisor name into title + name
  const supervisorName = inspection.supervisor_name || ''
  let supervisorTitle = ''
  let supervisorPureName = supervisorName
  const parts = supervisorName.trim().split(/\s+/)
  if (parts.length >= 2) {
    supervisorTitle = parts[0]
    supervisorPureName = parts.slice(1).join(' ')
  }

  // Format Date
  const parseDate = (dStr: string) => {
    if (!dStr) return '';
    try {
      const d = new Date(dStr);
      return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return dStr;
    }
  }

  // Format Date short: YY.MM.DD
  const parseDateShort = (dStr: string) => {
    if (!dStr) return '';
    try {
      const d = new Date(dStr);
      const yy = String(d.getFullYear()).slice(2);
      return `${yy}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return dStr;
    }
  }

  // Sort photos
  const sitePhotos = photos.filter((p: any) => p.photo_type === 'site_before')
  const goodExPhotos = photos.filter((p: any) => p.photo_type === 'good_example')

  // Signatures
  const sig1 = inspection.signatures?.find((s: any) => s.role === '현장대리인')
  const sigSupervisor = inspection.signatures?.find((s: any) => s.role === '공사감독원')
  const inspectorSigs = inspection.signatures?.filter((s: any) => s.role === '점검자') || []

  // Common styles
  const commonStyles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #000; font-size: 11px; padding: 4px 6px; word-break: break-all; }
      th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
    </style>
  `;

  // Hidden container for off-screen rendering
  const hiddenContainer = document.createElement('div');
  hiddenContainer.style.position = 'fixed';
  hiddenContainer.style.left = '0';
  hiddenContainer.style.top = '0';
  hiddenContainer.style.width = '210mm';
  hiddenContainer.style.overflow = 'hidden';
  hiddenContainer.style.opacity = '0';
  hiddenContainer.style.pointerEvents = 'none';
  hiddenContainer.style.zIndex = '-9999';
  document.body.appendChild(hiddenContainer);

  // Helper: render a page element, capture canvas, add to PDF
  const renderPage = async (el: HTMLDivElement, addNewPage: boolean) => {
    hiddenContainer.appendChild(el);
    await new Promise(r => setTimeout(r, 300));
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
    hiddenContainer.removeChild(el);
    const imgH = (canvas.height * imgW) / canvas.width;
    if (addNewPage) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST');
  }

  const createPageDiv = () => {
    const div = document.createElement('div');
    div.style.width = '210mm';
    div.style.minHeight = '297mm';
    div.style.padding = '15mm 20mm';
    div.style.background = '#ffffff';
    div.style.fontFamily = '"Malgun Gothic", "맑은 고딕", Arial, sans-serif';
    div.style.color = '#000000';
    div.style.fontSize = '12px';
    return div;
  }

  // Prepare result rows - 지적사항 rows (actual count)
  const goodExampleContent = inspection.good_example_content || '';
  const resultRows = [];

  // 지적사항 행: 실제 데이터 건수만큼
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    resultRows.push(`
      <tr>
        <td style="border: 1px solid #000; padding: 6px 6px 10px; text-align: center; height: 64px; width: 20%;">${r.field_item || ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px 10px; text-align: left; height: 64px; width: 40%;">${r.findings ? '- ' + r.findings : ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px 10px; text-align: left; height: 64px; width: 40%;">${r.action_items ? '- ' + r.action_items : ''}</td>
      </tr>
    `);
  }

  // 수범사례 행: 사진 건수만큼 (사진 없으면 내용이 있을 때 1행)
  if (goodExPhotos.length > 0) {
    for (let i = 0; i < goodExPhotos.length; i++) {
      const photo = goodExPhotos[i];
      const desc = photo.description || goodExampleContent || '';
      resultRows.push(`
        <tr>
          <td style="border: 1px solid #000; padding: 6px 6px 10px; text-align: center; height: 64px; width: 20%;">수범사례</td>
          <td style="border: 1px solid #000; padding: 6px 8px 10px; text-align: left; height: 64px; width: 40%;" colspan="2">${desc ? '- ' + desc : ''}</td>
        </tr>
      `);
    }
  } else if (goodExampleContent) {
    resultRows.push(`
      <tr>
        <td style="border: 1px solid #000; padding: 6px 6px 10px; text-align: center; height: 64px; width: 20%;">수범사례</td>
        <td style="border: 1px solid #000; padding: 6px 8px 10px; text-align: left; height: 64px; width: 40%;" colspan="2">${'- ' + goodExampleContent.replace(/\n/g, '<br/>- ')}</td>
      </tr>
    `);
  }


  const projectName = project?.project_name || inspection.district_name || '';

  // ============================================================
  // Page 1: 건설현장 점검카드
  // ============================================================
  const page1 = createPageDiv();
  page1.innerHTML = `
    ${commonStyles}

    <div style="text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 25px; text-decoration: underline; text-underline-offset: 6px;">
      건설현장 점검카드(${projectName})
    </div>

    <!-- 1. 점검개요 -->
    <div style="font-size: 15px; font-weight: bold; margin-bottom: 10px;">1. 점검개요</div>

    <div style="margin-left: 10px; margin-bottom: 6px; font-size: 12px;">
      ○ 점검일시 : ${parseDate(inspection.inspection_date)}
    </div>
    <div style="margin-left: 10px; margin-bottom: 10px; font-size: 12px;">
      ○ 점 검 반 : ${inspection.inspection_team || ''}
    </div>
    <div style="margin-left: 10px; margin-bottom: 6px; font-size: 12px;">
      ○ 점검지구 현황
    </div>

    <table style="margin-bottom: 20px;">
      <tr>
        <th rowspan="2" style="width: 9%; padding-bottom: 10px;">관리주체</th>
        <th rowspan="2" style="width: 11%; padding-bottom: 10px;">지구명</th>
        <th colspan="2" style="width: 14%; padding-bottom: 10px;">위 치</th>
        <th rowspan="2" style="width: 10%; padding-bottom: 10px;">총사업비<br/>(백만원)</th>
        <th colspan="3" style="width: 24%; padding-bottom: 10px;">공사추진실적</th>
        <th rowspan="2" style="width: 10%; padding-bottom: 10px;">주요공종</th>
        <th rowspan="2" style="width: 12%; padding-bottom: 10px;">비고<br/>(시공사)</th>
      </tr>
      <tr>
        <th style="width: 7%; padding-bottom: 10px;">도</th>
        <th style="width: 7%; padding-bottom: 10px;">시군</th>
        <th style="width: 8%; padding-bottom: 10px;">착공</th>
        <th style="width: 8%; padding-bottom: 10px;">준공<br/>(예정)</th>
        <th style="width: 8%; padding-bottom: 10px;">공정율</th>
      </tr>
      <tr>
        <td style="text-align: center; height: 32px; padding-bottom: 10px;">${inspection.management_entity || ''}</td>
        <td style="text-align: center; padding-bottom: 10px;">${inspection.district_name || ''}</td>
        <td style="text-align: center; padding-bottom: 10px;">${inspection.location_province || ''}</td>
        <td style="text-align: center; padding-bottom: 10px;">${inspection.location_city || ''}</td>
        <td style="text-align: center; padding-bottom: 10px;">${inspection.total_budget ? Number(inspection.total_budget).toLocaleString() : ''}</td>
        <td style="text-align: center; font-size: 10px; padding-bottom: 10px;">${parseDateShort(inspection.construction_start)}</td>
        <td style="text-align: center; font-size: 10px; padding-bottom: 10px;">${parseDateShort(inspection.construction_end_planned)}</td>
        <td style="text-align: center; padding-bottom: 10px;">${inspection.progress_rate != null ? inspection.progress_rate + '%' : ''}</td>
        <td style="text-align: center; font-size: 10px; padding-bottom: 10px;">${inspection.major_work_type || ''}</td>
        <td style="text-align: center; padding-bottom: 10px;">${inspection.contractor || ''}</td>
      </tr>
    </table>

    <!-- 2. 점검결과 -->
    <div style="font-size: 15px; font-weight: bold; margin-bottom: 5px; display: flex; align-items: baseline; gap: 15px;">
      <span>2. 점검결과</span>
      <span style="font-size: 11px; font-weight: normal;">* 지적사항(또는 수범사례, 현장점검) 증빙사진 첨부</span>
    </div>

    <table style="margin-bottom: 20px;">
      <tr>
        <th style="width: 20%; padding: 8px 8px 10px;">분야(항목)</th>
        <th style="width: 40%; padding: 8px 8px 10px;">지적사항(수범사례)</th>
        <th style="width: 40%; padding: 8px 8px 10px;">조치할 사항</th>
      </tr>
      ${resultRows.join('')}
    </table>

    <!-- 3. 점검자 의견 -->
    <div style="font-size: 15px; font-weight: bold; margin-bottom: 8px;">3. 점검자 의견</div>
    <div style="margin-left: 10px; margin-bottom: 30px; font-size: 12px; min-height: 40px;">
      ○ ${(inspection.inspector_opinion || '').replace(/\n/g, '<br/>&nbsp;&nbsp;&nbsp;')}
    </div>

    <!-- 날짜 -->
    <div style="text-align: center; font-size: 12px; margin-bottom: 25px;">
      ${parseDate(inspection.inspection_date)}
    </div>

    <!-- 서명란 -->
    <div style="padding: 0 30px;">
      <table style="border: none;">
        <tr style="border: none;">
          <td style="border: none; width: 25%; text-align: left; padding: 6px 0; font-size: 12px; letter-spacing: 8px;">현장대리인</td>
          <td style="border: none; width: 12%; text-align: right; padding: 6px 0; font-size: 12px;">직 &nbsp; 급</td>
          <td style="border: none; width: 18%; text-align: center; padding: 6px 0; font-size: 12px;">${sig1?.position || ''}</td>
          <td style="border: none; width: 12%; text-align: right; padding: 6px 0; font-size: 12px;">성 &nbsp; 명</td>
          <td style="border: none; width: 18%; text-align: center; padding: 6px 0; font-size: 12px;">${sig1?.name || ''}</td>
          <td style="border: none; width: 15%; text-align: center; padding: 6px 0; font-size: 12px; position: relative;">
            ${sig1?.dataUrl ? '<img src="' + sig1.dataUrl + '" style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); height: 40px; object-fit: contain;" />' : ''}(서명)
          </td>
        </tr>
        <tr style="border: none;">
          <td style="border: none; text-align: left; padding: 6px 0; font-size: 12px; letter-spacing: 8px;">공사감독원</td>
          <td style="border: none; text-align: right; padding: 6px 0; font-size: 12px;">직 &nbsp; 급</td>
          <td style="border: none; text-align: center; padding: 6px 0; font-size: 12px;">${supervisorTitle || sigSupervisor?.position || ''}</td>
          <td style="border: none; text-align: right; padding: 6px 0; font-size: 12px;">성 &nbsp; 명</td>
          <td style="border: none; text-align: center; padding: 6px 0; font-size: 12px;">${supervisorPureName || sigSupervisor?.name || ''}</td>
          <td style="border: none; text-align: center; padding: 6px 0; font-size: 12px; position: relative;">
            ${sigSupervisor?.dataUrl ? '<img src="' + sigSupervisor.dataUrl + '" style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); height: 40px; object-fit: contain;" />' : ''}(서명)
          </td>
        </tr>
        ${inspectorSigs.map((sig: any) => `
        <tr style="border: none;">
          <td style="border: none; text-align: left; padding: 6px 0; font-size: 12px; letter-spacing: 14px;">점 검 자</td>
          <td style="border: none; text-align: right; padding: 6px 0; font-size: 12px;">직 &nbsp; 급</td>
          <td style="border: none; text-align: center; padding: 6px 0; font-size: 12px;">${sig.position || ''}</td>
          <td style="border: none; text-align: right; padding: 6px 0; font-size: 12px;">성 &nbsp; 명</td>
          <td style="border: none; text-align: center; padding: 6px 0; font-size: 12px;">${sig.name || ''}</td>
          <td style="border: none; text-align: center; padding: 6px 0; font-size: 12px; position: relative;">
            ${sig.dataUrl ? '<img src="' + sig.dataUrl + '" style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); height: 40px; object-fit: contain;" />' : ''}(서명)
          </td>
        </tr>
        `).join('')}
      </table>
    </div>
  `;

  await renderPage(page1, false);

  // ============================================================
  // Page 2: 건설현장 점검사진 (전경사진 2장, 각각 별도 테이블)
  // ============================================================
  const page2 = createPageDiv();

  const photoInfoHeader = (photoIndex: number) => {
    const hasPhoto = !!sitePhotos[photoIndex]?.photo_url;
    return `
    <table style="margin-bottom: 0;">
      <tr>
        <th style="width: 12%; padding: 6px 6px 15px;">지구명</th>
        <td style="width: 38%; text-align: center; padding: 6px 6px 15px;">${hasPhoto ? (inspection.district_name || '') : ''}</td>
        <th style="width: 14%; padding: 6px 6px 15px;">공사감독원</th>
        <td style="width: 36%; text-align: center; padding: 6px 6px 15px;">${hasPhoto ? (supervisorTitle ? supervisorTitle + ' ' : '') + supervisorPureName : ''}</td>
      </tr>
      <tr>
        <th style="padding: 6px 6px 15px;">일 &nbsp; 시</th>
        <td style="text-align: center; padding: 6px 6px 15px;">${hasPhoto ? parseDate(inspection.inspection_date) : ''}</td>
        <th style="padding: 6px 6px 15px;">설 &nbsp; 명</th>
        <td style="text-align: center; padding: 6px 6px 15px;">${hasPhoto ? '점검 전경사진' : ''}</td>
      </tr>
    </table>
  `;
  };

  const photoBox = (photoUrl: string | null, placeholder: string) => `
    <table>
      <tr>
        <td style="height: 350px; text-align: center; vertical-align: middle; padding: 10px;">
          ${photoUrl ? '<img src="' + photoUrl + '" style="max-width: 95%; max-height: 330px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">' + placeholder + '</span>'}
        </td>
      </tr>
    </table>
  `;

  page2.innerHTML = `
    ${commonStyles}

    <div style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px; text-decoration: underline; text-underline-offset: 6px;">
      건설현장 점검사진
    </div>

    ${photoInfoHeader(0)}
    ${photoBox(sitePhotos[0]?.photo_url || null, '전경사진 1')}

    <div style="height: 15px;"></div>

    ${photoInfoHeader(1)}
    ${photoBox(sitePhotos[1]?.photo_url || null, '(공란)')}
  `;

  await renderPage(page2, true);

  // ============================================================
  // Page 3+: 지적사항 및 조치사항 사진대지 (각 지적사항별 1페이지)
  // ============================================================
  const resultsWithContent = results.filter((r: any) =>
    (r.photo_url && r.photo_url.trim()) || (r.after_photo_url && r.after_photo_url.trim()) ||
    r.findings || r.action_items
  );

  for (const r of resultsWithContent) {
    const pageN = createPageDiv();

    const findingPhotoHeader = `
      <table style="margin-bottom: 0;">
        <tr>
          <th style="width: 12%; padding: 6px 6px 12px;">지구명</th>
          <td style="width: 38%; text-align: center; padding: 6px 6px 12px;">${inspection.district_name || ''}</td>
          <th style="width: 14%; padding: 6px 6px 12px;">공사감독원</th>
          <td style="width: 36%; text-align: center; padding: 6px 6px 12px;">${supervisorTitle ? supervisorTitle + ' ' : ''}${supervisorPureName}</td>
        </tr>
        <tr>
          <th style="padding: 6px 6px 12px;">일 &nbsp; 시</th>
          <td style="text-align: center; padding: 6px 6px 12px;">${parseDate(inspection.inspection_date)}</td>
          <th style="padding: 6px 6px 12px;">설 &nbsp; 명</th>
          <td style="padding: 6px 6px 12px;">(조치 전) ${r.findings || ''}</td>
        </tr>
      </table>
    `;

    const actionPhotoHeader = `
      <table style="margin-bottom: 0;">
        <tr>
          <th style="width: 12%; padding: 6px 6px 12px;">지구명</th>
          <td style="width: 38%; text-align: center; padding: 6px 6px 12px;">${inspection.district_name || ''}</td>
          <th style="width: 14%; padding: 6px 6px 12px;">공사감독원</th>
          <td style="width: 36%; text-align: center; padding: 6px 6px 12px;">${supervisorTitle ? supervisorTitle + ' ' : ''}${supervisorPureName}</td>
        </tr>
        <tr>
          <th style="padding: 6px 6px 12px;">일 &nbsp; 시</th>
          <td style="text-align: center; padding: 6px 6px 12px;">${parseDate(inspection.inspection_date)}</td>
          <th style="padding: 6px 6px 12px;">설 &nbsp; 명</th>
          <td style="padding: 6px 6px 12px;">(조치 후) ${r.action_items || ''}</td>
        </tr>
      </table>
    `;

    pageN.innerHTML = `
      ${commonStyles}

      <div style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; text-decoration: underline; text-underline-offset: 6px;">
        &lt;지적사항 및 조치사항 사진대지&gt;
      </div>

      ${findingPhotoHeader}
      <table>
        <tr>
          <td style="height: 350px; text-align: center; vertical-align: middle; padding: 10px;">
            ${r.photo_url ? '<img src="' + r.photo_url + '" style="max-width: 95%; max-height: 330px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">사진 없음</span>'}
          </td>
        </tr>
      </table>

      <div style="height: 15px;"></div>

      ${actionPhotoHeader}
      <table>
        <tr>
          <td style="height: 350px; text-align: center; vertical-align: middle; padding: 10px;">
            ${r.after_photo_url ? '<img src="' + r.after_photo_url + '" style="max-width: 95%; max-height: 330px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">사진 없음</span>'}
          </td>
        </tr>
      </table>
    `;

    await renderPage(pageN, true);
  }

  // ============================================================
  // Page: 수범사례 사진대지 (수범사례 사진이 있을 때만)
  // ============================================================
  if (goodExPhotos.length > 0) {
    const pageGood = createPageDiv();

    const goodExBlock = (photo: any, placeholder: string, index: number) => `
      <table style="margin-bottom: 0;">
        <tr>
          <th style="width: 12%; padding: 6px 6px 16px;">지구명</th>
          <td style="width: 88%; text-align: center; padding: 6px 6px 16px;">${photo?.photo_url ? (inspection.district_name || '') : ''}</td>
        </tr>
        <tr>
          <th style="padding: 6px 6px 16px;">설 &nbsp; 명</th>
          <td style="padding: 6px 6px 16px;">${photo?.photo_url ? (photo?.description || goodExampleContent || '') : ''}</td>
        </tr>
      </table>
      <table>
        <tr>
          <td style="height: 350px; text-align: center; vertical-align: middle; padding: 10px 10px 20px;">
            ${photo?.photo_url ? '<img src="' + photo.photo_url + '" style="max-width: 95%; max-height: 330px; object-fit: contain; display: block; margin: 0 auto;" />' : '<span style="color: #aaa; font-size: 13px;">' + placeholder + '</span>'}
          </td>
        </tr>
      </table>
    `;

    pageGood.innerHTML = `
      ${commonStyles}

      <div style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; text-decoration: underline; text-underline-offset: 6px;">
        &lt;수범사례 사진대지&gt;
      </div>

      ${goodExBlock(goodExPhotos[0] || null, '수범사례 1', 0)}

      <div style="height: 15px;"></div>

      ${goodExBlock(goodExPhotos[1] || null, '(공란)', 1)}
    `;

    await renderPage(pageGood, true);
  }

  // Clean up hidden container
  document.body.removeChild(hiddenContainer);

  const rawName = `건설현장_점검카드_${inspection.inspection_type}_${inspection.inspection_date}`
  const fileName = rawName.replace(/[\\/:*?"<>|]/g, '_') + '.pdf'
  pdf.save(fileName)
}
