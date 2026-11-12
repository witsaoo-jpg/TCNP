document.addEventListener('DOMContentLoaded', async () => {
  const session = ENR.requireSession();
  if (!session) return;

  const patient = ENR.getPatient();
  if (!patient?.encounterId && !patient?.encounter_id) {
    location.href = 'patient_list.html';
    return;
  }

  const encounterId = Number(patient.encounterId || patient.encounter_id);
  ENR.renderPatientHeader('patientBanner', { edit: false });
  document.getElementById('noteUser').textContent = session.displayName || session.username || 'User';
  const back = () => location.href = 'nursing_notes.html';
  document.getElementById('backNotesBtn').onclick = back;
  document.getElementById('backNotesBtn2').onclick = back;

  function isCancelled(note) {
    const status = String(note?.status || note?.note_status || '').toUpperCase();
    return status === 'CANCELED' || status === 'CANCELLED';
  }

  function sectionHtml(bySection, sectionCode, label) {
    const list = bySection[sectionCode] || [];
    if (!list.length) return '';
    return `
      <div class="note-label">${label}:</div>
      <div class="note-content">
        <ul>${list.map(item => `
          <li>${item.tcnp_code ? `<span class="note-code">[${ENR.escape(item.tcnp_code)}]</span> ` : ''}${ENR.escape(item.note_text)}</li>`).join('')}</ul>
      </div>`;
  }

  function trendBadge(note) {
    if (!note.evaluation_trend) return '<span class="enr-badge enr-badge--gray">ยังไม่ประเมินแนวโน้ม</span>';
    const cls = note.evaluation_trend === 'WORSE' ? 'trend-worsened' : note.evaluation_trend === 'STABLE' ? 'trend-stable' : 'trend-improved';
    return `<span class="enr-badge ${cls}">${ENR.trendLabel(note.evaluation_trend)}</span>`;
  }

  const root = document.getElementById('cancelledList');
  root.innerHTML = '<div class="notes-empty">กำลังโหลดบันทึกที่ยกเลิกจาก PostgreSQL...</div>';

  try {
    const notes = (await ENR.api.getNursingNotes(encounterId))
      .filter(isCancelled)
      .sort((a, b) => new Date(b.cancelled_at || b.updated_at || b.created_at) - new Date(a.cancelled_at || a.updated_at || a.created_at));

    if (!notes.length) {
      root.innerHTML = '<div class="notes-empty">ยังไม่มีบันทึกที่ยกเลิก</div>';
      return;
    }

    root.innerHTML = notes.map(note => {
      const items = Array.isArray(note.items) ? note.items : [];
      const bySection = Object.fromEntries(['F','A_S','A_O','G','I','E'].map(section => [
        section,
        items.filter(item => item.section_code === section && item.note_text?.trim())
      ]));
      const focus = bySection.F[0];
      const focusText = focus?.note_text || 'Nursing Problem';
      const code = focus?.tcnp_code || '';
      const signedInfo = note.signed_at
        ? `<div><b>ลงนามเมื่อ:</b> ${ENR.formatThaiDateTime(note.signed_at)}${note.signed_by_display ? ` • <b>ผู้ลงนาม:</b> ${ENR.escape(note.signed_by_display)}` : ''}</div>`
        : '<div><b>ก่อนยกเลิก:</b> ยังไม่ได้ลงนาม</div>';

      return `
        <article class="note-card" data-note-id="${ENR.escape(note.id)}">
          <div class="note-card__head">
            <div>
              <div class="note-focus">
                <span class="note-focus__name">${code ? `[${ENR.escape(code)}] ` : ''}${ENR.escape(focusText)}</span>
                <span class="enr-badge enr-badge--gray">CANCELLED</span>
                <span class="note-time">Clinical: ${ENR.formatThaiDateTime(note.clinical_datetime)}</span>
              </div>
              <div class="note-time">System created: ${ENR.formatThaiDateTime(note.created_at)}${note.template_code ? ` • Template: ${ENR.escape(note.template_code)}` : ''}</div>
            </div>
            <div class="cancelled-actions">
              <button class="enr-btn" data-pdf-cancelled="${ENR.escape(note.id)}">🖨 PDF CANCELLED</button>
            </div>
          </div>

          <div class="lifecycle-banner lifecycle-banner--canceled cancelled-readonly">🚫 ยกเลิกแล้ว • เอกสารนี้ถูกเก็บไว้เพื่อ Audit และไม่สามารถแก้ไขได้</div>
          <div class="cancelled-summary">
            ${signedInfo}
            <div><strong>ยกเลิกเมื่อ:</strong> ${ENR.formatThaiDateTime(note.cancelled_at)}</div>
            <div><strong>ยกเลิกโดย:</strong> ${ENR.escape(note.cancelled_by_display || (note.cancelled_by ? `User #${note.cancelled_by}` : '-'))}</div>
            <div><strong>เหตุผล:</strong> ${ENR.escape(note.cancel_reason || '-')}</div>
          </div>

          <div class="note-grid">
            ${sectionHtml(bySection, 'F', 'F')}
            ${sectionHtml(bySection, 'A_S', 'A-S')}
            ${sectionHtml(bySection, 'A_O', 'A-O')}
            ${sectionHtml(bySection, 'G', 'G')}
            ${sectionHtml(bySection, 'I', 'I')}
            ${sectionHtml(bySection, 'E', 'E')}
          </div>

          <div class="note-footer">
            ${trendBadge(note)}
            <span class="enr-badge status-in_progress">${ENR.statusLabel(note.problem_status)}</span>
            ${note.evaluation_note ? `<span class="muted">Eval: ${ENR.escape(note.evaluation_note)}</span>` : ''}
          </div>
        </article>`;
    }).join('');

    root.querySelectorAll('[data-pdf-cancelled]').forEach(button => {
      button.onclick = () => location.href = `pdf-cancelled.html?noteId=${encodeURIComponent(button.dataset.pdfCancelled)}`;
    });
  } catch (error) {
    root.innerHTML = `<div class="notes-empty">โหลดรายการที่ยกเลิกไม่สำเร็จ<br><br>${ENR.escape(error.message)}</div>`;
  }
});
