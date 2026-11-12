document.addEventListener('DOMContentLoaded', async () => {
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient();
  if (!patient?.encounterId && !patient?.encounter_id) {
    location.href = 'patient_list.html';
    return;
  }

  const encounterId = Number(patient.encounterId || patient.encounter_id);
  ENR.renderPatientHeader('patientBanner', { edit: false });
  document.getElementById('backNotes').onclick = () => location.href = 'nursing_notes.html';
  document.getElementById('backWard').onclick = () => location.href = 'patient_list.html';
  document.getElementById('printSummary').onclick = () => window.print();

  const activeRoot = document.getElementById('activeList');
  const resolvedRoot = document.getElementById('resolvedList');

  function dt(value) {
    return value ? ENR.formatThaiDateTime(value) : 'ไม่พบเวลา';
  }

  function trendBadge(trend) {
    if (!trend) return '<span class="enr-badge enr-badge--gray">ยังไม่ประเมินแนวโน้ม</span>';
    const cls = trend === 'WORSE'
      ? 'trend-worsened'
      : trend === 'STABLE'
        ? 'trend-stable'
        : 'trend-improved';
    return `<span class="enr-badge ${cls}">${ENR.escape(ENR.trendLabel(trend))}</span>`;
  }

  function renderTimeline(problem) {
    const rows = problem.timeline || [];
    if (!rows.length) return '<div class="timeline-empty">ไม่มี Timeline</div>';

    return `
      <div class="problem-timeline" hidden>
        ${rows.map((row, index) => `
          <div class="timeline-row">
            <div class="timeline-dot ${row.problem_status === 'RESOLVED' ? 'resolved' : ''}"></div>
            <div class="timeline-body">
              <div class="timeline-top">
                <b>#${ENR.escape(row.note_id)}</b>
                <span>${dt(row.effective_datetime)}</span>
                ${index === 0 ? '<span class="timeline-chip">เริ่มปัญหา</span>' : ''}
                ${row.problem_status === 'RESOLVED' ? '<span class="timeline-chip resolved">ปิดปัญหา</span>' : ''}
              </div>
              <div class="timeline-detail">
                ${trendBadge(row.trend)}
                <span>${ENR.escape(row.evaluation || 'ไม่มีรายละเอียดผลการประเมิน')}</span>
              </div>
              <div class="timeline-by">บันทึกโดย ${ENR.escape(row.recorded_by || '-')} • ลงนามโดย ${ENR.escape(row.signed_by || '-')}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function card(problem, resolved) {
    const episodeLabel = Number(problem.episode_number || 1) > 1
      ? `<span class="episode-chip">Episode ${ENR.escape(problem.episode_number)}</span>`
      : '';

    return `
      <article class="problem-card ${resolved ? 'resolved' : ''}" data-episode="${ENR.escape(problem.episode_id)}">
        <div class="problem-card__head">
          <div>
            <div class="problem-card__title">
              ${problem.focus_code ? `[${ENR.escape(problem.focus_code)}] ` : ''}${ENR.escape(problem.focus)}
              ${episodeLabel}
            </div>
            <div class="problem-card__meta">Nursing Note ที่ลงนามแล้ว ${ENR.escape(problem.note_count)} ครั้ง</div>
          </div>
          <span class="enr-badge ${resolved ? 'enr-badge--gray' : 'enr-badge--red'}">${resolved ? 'Resolved' : 'Active'}</span>
        </div>

        <div class="problem-times">
          <div><span>เริ่มปัญหา</span><b>${dt(problem.start_at)}</b></div>
          <div><span>บันทึกล่าสุด</span><b>${dt(problem.latest_at)}</b></div>
          ${resolved ? `<div><span>สิ้นสุดปัญหา</span><b>${dt(problem.resolved_at)}</b></div>` : ''}
        </div>

        <div class="problem-card__trend">${trendBadge(problem.latest_trend)}</div>
        <div class="problem-card__eval"><b>ผลประเมินล่าสุด:</b> ${ENR.escape(problem.latest_evaluation || '-')}</div>
        ${resolved && problem.resolved_by_display
          ? `<div class="resolved-by">สิ้นสุดโดย ${ENR.escape(problem.resolved_by_display)}</div>`
          : ''}

        <div class="problem-card__actions no-print">
          <button class="enr-btn summary-timeline-btn" data-timeline>▾ ดู Timeline (${ENR.escape(problem.note_count)})</button>
          <span class="summary-readonly-note" title="สถานะปัญหาเปลี่ยนอัตโนมัติเมื่อ SIGN Nursing Note">อ่านอย่างเดียว • เปลี่ยนสถานะจาก Nursing Note</span>
        </div>
        ${renderTimeline(problem)}
      </article>`;
  }

  function bindCards(root, list, resolved) {
    root.innerHTML = list.length
      ? list.map((problem) => card(problem, resolved)).join('')
      : `<div class="enr-empty summary-empty">${resolved ? 'ยังไม่มีปัญหาที่สิ้นสุด' : 'ไม่มี Active Problem จากเอกสาร SIGNED'}</div>`;

    root.querySelectorAll('.problem-card').forEach((node, index) => {
      const problem = list[index];
      const timelineButton = node.querySelector('[data-timeline]');
      const timeline = node.querySelector('.problem-timeline');
      if (timelineButton && timeline) {
        timelineButton.onclick = () => {
          const opening = timeline.hidden;
          timeline.hidden = !opening;
          timelineButton.textContent = `${opening ? '▴ ซ่อน' : '▾ ดู'} Timeline (${problem.note_count})`;
        };
      }

    });
  }

  function updateHeadings(data) {
    const activeHeading = document.querySelector('.summary-heading.active');
    const resolvedHeading = document.querySelector('.summary-heading:not(.active)');
    if (activeHeading) activeHeading.innerHTML = `Active Problems <span>${data.counts?.active ?? data.active?.length ?? 0}</span>`;
    if (resolvedHeading) resolvedHeading.innerHTML = `Resolved Problems <span>${data.counts?.resolved ?? data.resolved?.length ?? 0}</span>`;

    let stats = document.getElementById('summaryStats');
    if (!stats) {
      stats = document.createElement('div');
      stats.id = 'summaryStats';
      stats.className = 'summary-stats no-print';
      document.querySelector('.summary-wrap')?.prepend(stats);
    }
    stats.innerHTML = `
      <span>👁 Read only • สรุปอัตโนมัติจาก SIGNED Nursing Note</span>
      <span>✓ ใช้เฉพาะ SIGNED</span>
      <span>Active ${ENR.escape(data.counts?.active ?? 0)}</span>
      <span>Resolved ${ENR.escape(data.counts?.resolved ?? 0)}</span>
      <span>Episodes ${ENR.escape(data.counts?.total_episodes ?? 0)}</span>
      <span>Signed Notes ${ENR.escape(data.counts?.signed_notes_considered ?? 0)}</span>
      ${(Number(data.canonicalization?.template_fallback_rows || 0) + Number(data.canonicalization?.text_alias_rows || 0)) > 0
        ? `<span title="รวม Focus เก่าที่เป็น Manual เข้ากับ TCNP เดียวกัน">Canonicalized ${ENR.escape(Number(data.canonicalization?.template_fallback_rows || 0) + Number(data.canonicalization?.text_alias_rows || 0))}</span>`
        : ''}`;
  }

  try {
    activeRoot.innerHTML = '<div class="enr-empty">กำลังสร้าง Problem Episodes จาก PostgreSQL...</div>';
    resolvedRoot.innerHTML = '<div class="enr-empty">กำลังโหลด...</div>';

    const data = await ENR.api.getNursingProblemSummary(encounterId);
    if (data?.policy?.summary_mutation_allowed !== false) {
      console.warn('[ENR] Care Summary expected READ ONLY policy from CP6.2');
    }
    updateHeadings(data);
    bindCards(activeRoot, data.active || [], false);
    bindCards(resolvedRoot, data.resolved || [], true);
  } catch (error) {
    activeRoot.innerHTML = `<div class="enr-empty">โหลด Nursing Care Summary ไม่สำเร็จ: ${ENR.escape(error.message)}</div>`;
    resolvedRoot.innerHTML = '<div class="enr-empty">-</div>';
  }
});


/* =========================================================
   CP6.11-CARE-SUMMARY-PRINT-FINAL
   Final print metadata for Nursing Care Summary.
   Clinical data remains READ ONLY and comes from the existing
   SIGNED-derived Care Summary API.
   ========================================================= */
(() => {
  const CP = 'CP6.11-CARE-SUMMARY-PRINT-FINAL';

  function esc(value) {
    if (window.ENR?.escape) return ENR.escape(value ?? '');
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function valueOf(obj, keys, fallback = '-') {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return fallback;
  }

  function generatedLabel() {
    const now = new Date();
    try {
      if (window.ENR?.formatThaiDateTime) return ENR.formatThaiDateTime(now.toISOString());
    } catch (_) {}
    return now.toLocaleString('th-TH');
  }

  function headingCount(selector) {
    const text = document.querySelector(selector)?.querySelector('span')?.textContent?.trim();
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  function ensureArtifacts() {
    const wrap = document.querySelector('.summary-wrap');
    if (!wrap) return null;

    let meta = document.getElementById('summaryPrintMeta');
    if (!meta) {
      meta = document.createElement('section');
      meta.id = 'summaryPrintMeta';
      meta.className = 'summary-print-only summary-print-meta';
      const columns = wrap.querySelector('.summary-columns');
      if (columns) wrap.insertBefore(meta, columns);
      else wrap.prepend(meta);
    }

    let footer = document.getElementById('summaryPrintFooter');
    if (!footer) {
      footer = document.createElement('footer');
      footer.id = 'summaryPrintFooter';
      footer.className = 'summary-print-only summary-print-footer';
      document.body.appendChild(footer);
    }

    return { meta, footer };
  }

  function preparePrint() {
    const artifacts = ensureArtifacts();
    if (!artifacts) return;

    const patient = window.ENR?.getPatient?.() || {};
    const hn = valueOf(patient, ['hn', 'HN']);
    const an = valueOf(patient, ['an', 'AN', 'encounter_no', 'encounterNo']);
    const active = headingCount('.summary-heading.active');
    const resolved = headingCount('.summary-heading:not(.active)');
    const generated = generatedLabel();

    artifacts.meta.innerHTML = `
      <div class="summary-print-meta__title">Nursing Care Summary — สรุปปัญหาทางการพยาบาล</div>
      <div class="summary-print-meta__source">
        สรุปอัตโนมัติจาก Nursing Note ที่ลงนามแล้ว (SIGNED) เท่านั้น
      </div>
      <div class="summary-print-meta__facts">
        <span>Active ${esc(active)}</span>
        <span>Resolved ${esc(resolved)}</span>
        <span>Generated ${esc(generated)}</span>
      </div>`;

    artifacts.footer.innerHTML = `
      <span>Nursing Care Summary</span>
      <span>HN: ${esc(hn)} • AN: ${esc(an)}</span>
      <span>Generated: ${esc(generated)}</span>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureArtifacts();
  });

  window.addEventListener('beforeprint', preparePrint);

  // Helpful for acceptance testing from DevTools.
  window.ENR_CARE_SUMMARY_PRINT = Object.freeze({
    checkpoint: CP,
    prepare: preparePrint
  });
})();
