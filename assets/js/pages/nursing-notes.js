document.addEventListener('DOMContentLoaded', async () => {
  const session = ENR.requireSession();
  if (!session) return;

  let patient = ENR.getPatient();
  if (!patient?.encounterId && !patient?.encounter_id) {
    location.href = 'patient_list.html';
    return;
  }

  const encounterId = Number(patient.encounterId || patient.encounter_id);

  ENR.renderPatientHeader('patientBanner');
  document.getElementById('noteUser').textContent = session.displayName || session.username || 'User';

  const adminTemplateBtn = document.getElementById('adminTemplateBtn');
  if (session.role === 'ADMIN' && adminTemplateBtn) {
    adminTemplateBtn.classList.remove('hidden');
    adminTemplateBtn.onclick = () => location.href = 'admin.html';
  }

  const newNoteBtn = document.getElementById('newNoteBtn');
  const summaryBtn = document.getElementById('summaryBtn');
  const printBtn = document.getElementById('printBtn');
  const cancelledBtn = document.getElementById('cancelledBtn');
  const backWardBtn = document.getElementById('backWardBtn');

  if (newNoteBtn) newNoteBtn.onclick = () => location.href = 'nursing_note_new.html';
  if (summaryBtn) summaryBtn.onclick = () => location.href = 'summary.html';
  if (printBtn) printBtn.onclick = () => location.href = `pdf-preview.html?encounterId=${encodeURIComponent(encounterId)}`;
  if (cancelledBtn) cancelledBtn.onclick = () => location.href = 'nursing_notes_cancelled.html';
  if (backWardBtn) backWardBtn.onclick = () => location.href = 'patient_list.html';

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
          <li>
            ${item.tcnp_code ? `<span class="note-code">[${ENR.escape(item.tcnp_code)}]</span> ` : ''}
            ${ENR.escape(item.note_text)}
          </li>`).join('')}</ul>
      </div>`;
  }

  function trendBadge(note) {
    if (!note.evaluation_trend) {
      return '<span class="enr-badge enr-badge--gray">ยังไม่ประเมินแนวโน้ม</span>';
    }
    const className = note.evaluation_trend === 'WORSE'
      ? 'trend-worsened'
      : note.evaluation_trend === 'STABLE'
        ? 'trend-stable'
        : 'trend-improved';
    return `<span class="enr-badge ${className}">${ENR.trendLabel(note.evaluation_trend)}</span>`;
  }

  function lifecycleMeta(note, noteStatus) {
    if (noteStatus === 'SIGNED') {
      return `<div class="lifecycle-banner lifecycle-banner--signed">🔒 ลงนามแล้ว${note.signed_at ? ` • ${ENR.formatThaiDateTime(note.signed_at)}` : ''} • ต้นฉบับแก้ไขไม่ได้ • ใช้ Addendum (บันทึกเพิ่มเติม) / Amendment (บันทึกแก้ไข) เท่านั้น</div>`;
    }
    if (noteStatus === 'CANCELED') {
      return `<div class="lifecycle-banner lifecycle-banner--canceled">ยกเลิกบันทึก${note.cancelled_at ? ` • ${ENR.formatThaiDateTime(note.cancelled_at)}` : ''}${note.cancel_reason ? ` • เหตุผล: ${ENR.escape(note.cancel_reason)}` : ''}</div>`;
    }
    return '<div class="lifecycle-banner lifecycle-banner--draft">DRAFT • แก้ไขได้จนกว่าจะลงนาม</div>';
  }

  // ---------- CP6.3 modal ----------
  let modalState = null;

  function ensureAmendmentModal() {
    let modal = document.getElementById('noteAmendmentModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'noteAmendmentModal';
    modal.className = 'note-amendment-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="note-amendment-modal__backdrop" data-modal-close></div>
      <section class="note-amendment-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="noteAmendmentModalTitle">
        <div class="note-amendment-modal__head">
          <div>
            <div class="note-amendment-modal__eyebrow" id="noteAmendmentModalEyebrow">SIGNED NOTE</div>
            <h3 id="noteAmendmentModalTitle">Addendum — บันทึกเพิ่มเติม</h3>
          </div>
          <button class="note-amendment-modal__close" type="button" data-modal-close aria-label="ปิด">×</button>
        </div>
        <div class="note-amendment-modal__notice" id="noteAmendmentModalNotice"></div>
        <form id="noteAmendmentForm">
          <div class="note-amendment-field" id="noteAmendmentReasonWrap">
            <label for="noteAmendmentReason" id="noteAmendmentReasonLabel">เหตุผล</label>
            <textarea id="noteAmendmentReason" rows="2" maxlength="1000"></textarea>
            <div class="note-amendment-help" id="noteAmendmentReasonHelp"></div>
          </div>
          <div class="note-amendment-field" id="noteAmendmentTextWrap">
            <label for="noteAmendmentText" id="noteAmendmentTextLabel">ข้อความ</label>
            <textarea id="noteAmendmentText" rows="5" maxlength="5000"></textarea>
            <div class="note-amendment-help">ข้อความนี้จะถูกเพิ่มเป็นประวัติใหม่ โดยไม่แก้ไขต้นฉบับ SIGNED</div>
          </div>
          <div class="note-amendment-error" id="noteAmendmentError" hidden></div>
          <div class="note-amendment-modal__actions">
            <button class="enr-btn" type="button" data-modal-close>ยกเลิก</button>
            <button class="enr-btn enr-btn--primary" type="submit" id="noteAmendmentSubmit">บันทึก</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', closeAmendmentModal);
    });

    modal.querySelector('#noteAmendmentForm').addEventListener('submit', submitAmendmentModal);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) closeAmendmentModal();
    });
    return modal;
  }

  function closeAmendmentModal() {
    const modal = document.getElementById('noteAmendmentModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('note-modal-open');
    modalState = null;
  }

  function openAmendmentModal({ mode, noteId, amendmentId = null, panel = null, historyButton = null }) {
    const modal = ensureAmendmentModal();
    const title = modal.querySelector('#noteAmendmentModalTitle');
    const eyebrow = modal.querySelector('#noteAmendmentModalEyebrow');
    const notice = modal.querySelector('#noteAmendmentModalNotice');
    const reasonWrap = modal.querySelector('#noteAmendmentReasonWrap');
    const reasonLabel = modal.querySelector('#noteAmendmentReasonLabel');
    const reasonHelp = modal.querySelector('#noteAmendmentReasonHelp');
    const textWrap = modal.querySelector('#noteAmendmentTextWrap');
    const textLabel = modal.querySelector('#noteAmendmentTextLabel');
    const reason = modal.querySelector('#noteAmendmentReason');
    const text = modal.querySelector('#noteAmendmentText');
    const submit = modal.querySelector('#noteAmendmentSubmit');
    const error = modal.querySelector('#noteAmendmentError');

    modalState = { mode, noteId: String(noteId), amendmentId, panel, historyButton };
    reason.value = '';
    text.value = '';
    error.hidden = true;
    error.textContent = '';
    submit.disabled = false;

    if (mode === 'ADDENDUM') {
      eyebrow.textContent = 'SIGNED NOTE • บันทึกเพิ่มเติม';
      title.textContent = 'Addendum — บันทึกเพิ่มเติม';
      notice.innerHTML = '<b>Addendum (บันทึกเพิ่มเติม)</b> ใช้สำหรับเพิ่มข้อมูลที่เกิดขึ้นหรือทราบภายหลังการลงนาม โดยไม่แก้หรือแทนที่ข้อความต้นฉบับ';
      reasonWrap.hidden = true;
      textWrap.hidden = false;
      textLabel.textContent = 'ข้อมูลเพิ่มเติม *';
      text.placeholder = 'ระบุข้อมูลเพิ่มเติมที่เกิดขึ้นหรือทราบภายหลัง...';
      submit.textContent = 'บันทึกเพิ่มเติม';
    } else if (mode === 'AMENDMENT') {
      eyebrow.textContent = 'SIGNED NOTE • บันทึกแก้ไข';
      title.textContent = 'Amendment — บันทึกแก้ไข';
      notice.innerHTML = '<b>Amendment (บันทึกแก้ไข)</b> ใช้สำหรับแก้ไขหรือชี้แจงข้อมูลที่ลงนามแล้ว โดยต้นฉบับ SIGNED ยังคงเดิมและตรวจสอบย้อนหลังได้';
      reasonWrap.hidden = false;
      textWrap.hidden = false;
      reasonLabel.textContent = 'เหตุผลที่ต้องแก้ไข/ชี้แจง *';
      reasonHelp.textContent = 'ต้องระบุเหตุผลทุกครั้ง';
      reason.placeholder = 'เช่น บันทึกข้อความคลาดเคลื่อน / ต้องชี้แจงข้อมูลเพิ่มเติม...';
      textLabel.textContent = 'ข้อความแก้ไข/ชี้แจง *';
      text.placeholder = 'ระบุข้อความที่ถูกต้องหรือคำชี้แจง...';
      submit.textContent = 'บันทึกแก้ไข';
    } else {
      eyebrow.textContent = 'ประวัติหลังลงนาม • ยกเลิกรายการ';
      title.textContent = 'ยกเลิกรายการหลังลงนาม';
      notice.innerHTML = 'การยกเลิกจะ <b>ไม่ลบรายการ</b> ออกจากประวัติ แต่จะเก็บสถานะ CANCELED พร้อมผู้ยกเลิก เวลา และเหตุผล';
      reasonWrap.hidden = false;
      textWrap.hidden = true;
      reasonLabel.textContent = 'เหตุผลที่ยกเลิกรายการ *';
      reasonHelp.textContent = 'รายการเดิมจะยังคงอยู่ในประวัติและ Audit trail';
      reason.placeholder = 'ระบุเหตุผลที่ยกเลิกรายการบันทึกเพิ่มเติม/บันทึกแก้ไขนี้...';
      submit.textContent = 'ยืนยันยกเลิกรายการ';
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('note-modal-open');
    window.setTimeout(() => (mode === 'ADDENDUM' ? text : reason).focus(), 30);
  }

  async function submitAmendmentModal(event) {
    event.preventDefault();
    if (!modalState) return;

    const modal = document.getElementById('noteAmendmentModal');
    const reason = modal.querySelector('#noteAmendmentReason').value.trim();
    const text = modal.querySelector('#noteAmendmentText').value.trim();
    const submit = modal.querySelector('#noteAmendmentSubmit');
    const error = modal.querySelector('#noteAmendmentError');

    if (modalState.mode === 'AMENDMENT' && !reason) {
      error.textContent = 'กรุณาระบุเหตุผลที่ต้องบันทึกแก้ไข (Amendment)';
      error.hidden = false;
      return;
    }
    if (modalState.mode === 'CANCEL' && !reason) {
      error.textContent = 'กรุณาระบุเหตุผลที่ยกเลิกรายการ';
      error.hidden = false;
      return;
    }
    if (modalState.mode !== 'CANCEL' && !text) {
      error.textContent = 'กรุณาระบุข้อความ';
      error.hidden = false;
      return;
    }

    submit.disabled = true;
    const oldText = submit.textContent;
    submit.textContent = 'กำลังบันทึก...';
    error.hidden = true;

    try {
      if (modalState.mode === 'CANCEL') {
        await ENR.api.cancelSignedNoteAmendment(
          modalState.noteId,
          modalState.amendmentId,
          reason
        );
        ENR.toast('ยกเลิกรายการแล้ว โดยเก็บประวัติไว้');
      } else {
        await ENR.api.addSignedNoteAmendment(
          modalState.noteId,
          modalState.mode,
          text,
          modalState.mode === 'AMENDMENT' ? reason : null
        );
        ENR.toast(modalState.mode === 'ADDENDUM' ? 'บันทึกเพิ่มเติมแล้ว' : 'บันทึกแก้ไขแล้ว');
      }

      const state = { ...modalState };
      closeAmendmentModal();
      if (state.panel) await loadAmendments(state.noteId, state.panel, state.historyButton, true);
    } catch (err) {
      error.textContent = err.message || 'ไม่สามารถบันทึกได้';
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = oldText;
    }
  }

  function amendmentItemHtml(item, noteId) {
    const type = String(item.amendment_type || 'ADDENDUM').toUpperCase();
    const cancelled = Boolean(item.is_cancelled);
    const typeLabel = type === 'AMENDMENT' ? 'Amendment • บันทึกแก้ไข' : 'Addendum • บันทึกเพิ่มเติม';
    const creator = item.created_by_display || `User #${item.created_by || '-'}`;
    const canceller = item.cancelled_by_display || (item.cancelled_by ? `User #${item.cancelled_by}` : '-');

    return `
      <div class="amendment-item ${cancelled ? 'is-cancelled' : ''}">
        <div class="amendment-item__head">
          <span class="enr-badge ${type === 'AMENDMENT' ? 'enr-badge--amber' : 'enr-badge--teal'}">${ENR.escape(typeLabel)}</span>
          <span class="muted">${ENR.formatThaiDateTime(item.created_at)}</span>
          ${cancelled ? '<span class="enr-badge enr-badge--gray">ยกเลิกแล้ว</span>' : '<span class="enr-badge enr-badge--green">ใช้งาน</span>'}
        </div>
        <div class="amendment-meta">บันทึกโดย <b>${ENR.escape(creator)}</b></div>
        ${item.reason ? `<div class="amendment-reason"><b>เหตุผล:</b> ${ENR.escape(item.reason)}</div>` : ''}
        <div class="amendment-text">${ENR.escape(item.amendment_text || '')}</div>
        ${cancelled ? `
          <div class="amendment-cancelled-box">
            <div><b>ยกเลิกโดย:</b> ${ENR.escape(canceller)}</div>
            <div><b>ยกเลิกเมื่อ:</b> ${ENR.formatThaiDateTime(item.cancelled_at)}</div>
            <div><b>เหตุผล:</b> ${ENR.escape(item.cancel_reason || '-')}</div>
          </div>` : ''}
        ${!cancelled && item.can_cancel ? `
          <div class="amendment-item__actions">
            <button class="enr-btn enr-btn--compact enr-btn--danger" data-cancel-amendment="${ENR.escape(item.amendment_id)}" data-note-id="${ENR.escape(noteId)}">ยกเลิกรายการนี้</button>
          </div>` : ''}
      </div>`;
  }

  function bindHistoryActions(container, historyButton) {
    container.querySelectorAll('[data-cancel-amendment]').forEach((button) => {
      button.onclick = () => {
        openAmendmentModal({
          mode: 'CANCEL',
          noteId: button.dataset.noteId,
          amendmentId: button.dataset.cancelAmendment,
          panel: container,
          historyButton,
        });
      };
    });
  }

  async function loadAmendments(noteId, container, button, forceOpen = false) {
    container.innerHTML = '<div class="muted">กำลังโหลดประวัติการบันทึกหลังลงนาม...</div>';
    container.classList.add('is-open');
    try {
      const data = await ENR.api.getSignedNoteAmendmentHistory(noteId);
      const list = Array.isArray(data?.history) ? data.history : [];
      container.innerHTML = `
        <div class="amendment-history-head">
          <div>
            <b>ประวัติการบันทึกหลังลงนาม</b>
            <div class="muted">Addendum = บันทึกเพิ่มเติม • Amendment = บันทึกแก้ไข • ต้นฉบับ SIGNED ไม่ถูกแก้ไข</div>
          </div>
          <div class="amendment-history-counts">
            <span class="enr-badge enr-badge--green">ใช้งาน ${Number(data?.active_count || 0)}</span>
            ${Number(data?.cancelled_count || 0) ? `<span class="enr-badge enr-badge--gray">ยกเลิก ${Number(data.cancelled_count)}</span>` : ''}
          </div>
        </div>
        ${list.length
          ? `<div class="amendment-list">${list.map((item) => amendmentItemHtml(item, noteId)).join('')}</div>`
          : '<div class="amendment-empty">ยังไม่มีบันทึกเพิ่มเติมหรือบันทึกแก้ไขหลังลงนามสำหรับบันทึกนี้</div>'}`;
      bindHistoryActions(container, button);
      if (button) button.textContent = `ซ่อนประวัติหลังลงนาม${list.length ? ` (${list.length})` : ''}`;
      if (forceOpen) container.classList.add('is-open');
    } catch (error) {
      container.innerHTML = `<div class="lifecycle-error">โหลดประวัติแก้ไขไม่สำเร็จ: ${ENR.escape(error.message)}</div>`;
      container.classList.add('is-open');
    }
  }

  async function render() {
    const root = document.getElementById('noteList');
    root.innerHTML = '<div class="notes-empty">กำลังโหลดบันทึกจาก PostgreSQL...</div>';

    let notes;
    try {
      notes = await ENR.api.getNursingNotes(encounterId);
    } catch (error) {
      root.innerHTML = `<div class="notes-empty">โหลดประวัติการบันทึกไม่สำเร็จ<br><br>${ENR.escape(error.message)}</div>`;
      return;
    }

    const cancelledNotes = notes.filter(isCancelled);
    const activeNotes = notes.filter(note => !isCancelled(note));
    const countEl = document.getElementById('cancelledCount');
    if (countEl) countEl.textContent = String(cancelledNotes.length);

    if (!activeNotes.length) {
      root.innerHTML = `
        <div class="notes-empty">
          ยังไม่มีบันทึกทางการพยาบาลที่ใช้งานอยู่
          ${cancelledNotes.length ? `<br><span class="muted">มีบันทึกที่ยกเลิกแล้ว ${cancelledNotes.length} รายการ สามารถเปิดดูจากปุ่ม “ยกเลิกแล้ว” ด้านบน</span>` : ''}
          <br><br>
          <button class="enr-btn enr-btn--primary" id="emptyCreate">＋ สร้างบันทึกใหม่</button>
        </div>`;
      document.getElementById('emptyCreate').onclick = () => location.href = 'nursing_note_new.html';
      return;
    }

    root.innerHTML = activeNotes.map(note => {
      const items = Array.isArray(note.items) ? note.items : [];
      const bySection = Object.fromEntries(
        ['F', 'A_S', 'A_O', 'G', 'I', 'E'].map(section => [
          section,
          items.filter(item => item.section_code === section && item.note_text?.trim())
        ])
      );

      const focusItem = bySection.F[0];
      const focus = focusItem?.note_text || 'Nursing Problem';
      const code = focusItem?.tcnp_code || '';
      const problemStatusClass = note.problem_status === 'RESOLVED' ? 'status-resolved' : 'status-in_progress';
      const noteStatus = String(note.status || note.note_status || 'DRAFT').toUpperCase();
      const noteStatusClass = noteStatus === 'SIGNED'
        ? 'enr-badge--green'
        : (noteStatus === 'CANCELED' || noteStatus === 'CANCELLED')
          ? 'enr-badge--gray'
          : 'enr-badge--amber';

      let actions = '';
      if (noteStatus === 'DRAFT') {
        actions = `
          <button class="enr-btn" data-edit="${ENR.escape(note.id)}" title="แก้ Draft">✎ แก้ไข</button>
          <button class="enr-btn enr-btn--primary" data-sign="${ENR.escape(note.id)}" title="ลงนามบันทึก">✓ ลงนาม</button>
          <button class="enr-btn enr-btn--danger" data-cancel="${ENR.escape(note.id)}" title="ยกเลิก Draft">ยกเลิก</button>`;
      } else if (noteStatus === 'SIGNED') {
        actions = `
          <button class="enr-btn amendment-action amendment-action--add" data-addendum="${ENR.escape(note.id)}"><span class="amendment-action__main">＋ Addendum</span><span class="amendment-action__sub">บันทึกเพิ่มเติม</span></button>
          <button class="enr-btn amendment-action amendment-action--edit" data-amendment="${ENR.escape(note.id)}"><span class="amendment-action__main">✎ Amendment</span><span class="amendment-action__sub">บันทึกแก้ไข</span></button>
          <button class="enr-btn" data-history="${ENR.escape(note.id)}">ประวัติหลังลงนาม</button>
          <button class="enr-btn enr-btn--danger" data-cancel="${ENR.escape(note.id)}" title="ยกเลิกบันทึกตามสิทธิ์">ยกเลิกบันทึก</button>`;
      }

      return `
        <article class="note-card" data-note-card="${ENR.escape(note.id)}">
          <div class="note-card__head">
            <div>
              <div class="note-focus">
                <span class="note-focus__name">${code ? `[${ENR.escape(code)}] ` : ''}${ENR.escape(focus)}</span>
                <span class="enr-badge ${noteStatusClass}">${ENR.escape(noteStatus)}</span>
                ${note.patient_type_level ? `<span class="enr-badge enr-badge--teal">Type ${ENR.escape(note.patient_type_level)}</span>` : ''}
                <span class="note-time">${ENR.formatThaiDateTime(note.clinical_datetime)}</span>
              </div>
              <div class="note-time">
                เวลาสร้างจริง: ${ENR.formatThaiDateTime(note.created_at)}
                ${note.template_code ? ` • Template: ${ENR.escape(note.template_code)}` : ''}
              </div>
            </div>
            <div class="note-card__actions">${actions}</div>
          </div>

          ${lifecycleMeta(note, noteStatus)}

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
            <span class="enr-badge ${problemStatusClass}">${ENR.statusLabel(note.problem_status)}</span>
            ${note.evaluation_note ? `<span class="muted">Eval: ${ENR.escape(note.evaluation_note)}</span>` : ''}
          </div>
          <div class="amendment-panel" data-amendments-for="${ENR.escape(note.id)}"></div>
        </article>`;
    }).join('');

    root.querySelectorAll('[data-edit]').forEach(button => {
      button.onclick = () => location.href = `nursing_note_new.html?noteId=${encodeURIComponent(button.dataset.edit)}`;
    });

    root.querySelectorAll('[data-sign]').forEach(button => {
      button.onclick = async () => {
        const noteId = button.dataset.sign;
        const ok = confirm('ยืนยันลงนาม Nursing Note นี้?\n\nเมื่อลงนามแล้ว ต้นฉบับจะถูกล็อกและแก้ไขไม่ได้ หากต้องเพิ่มเติมหรือแก้ไขภายหลังให้ใช้ Addendum (บันทึกเพิ่มเติม) / Amendment (บันทึกแก้ไข)');
        if (!ok) return;
        button.disabled = true;
        const old = button.textContent;
        button.textContent = 'กำลังลงนาม...';
        try {
          await ENR.api.signNursingNote(noteId);
          ENR.toast('ลงนาม Nursing Note แล้ว');
          await render();
        } catch (error) {
          alert(`ลงนามไม่สำเร็จ: ${error.message}`);
          button.disabled = false;
          button.textContent = old;
        }
      };
    });

    root.querySelectorAll('[data-cancel]').forEach(button => {
      button.onclick = async () => {
        const reason = prompt('ระบุเหตุผลการยกเลิกบันทึก (ต้องมีเหตุผล)');
        if (!reason?.trim()) return;
        if (!confirm('ยืนยันการยกเลิกบันทึกนี้? การยกเลิกจะถูกเก็บใน Audit trail')) return;
        try {
          await ENR.api.cancelNursingNote(button.dataset.cancel, reason.trim());
          ENR.toast('ยกเลิกบันทึกแล้ว');
          await render();
        } catch (error) {
          alert(`ยกเลิกบันทึกไม่สำเร็จ: ${error.message}`);
        }
      };
    });

    root.querySelectorAll('[data-addendum]').forEach(button => {
      button.onclick = () => {
        const noteId = button.dataset.addendum;
        openAmendmentModal({
          mode: 'ADDENDUM',
          noteId,
          panel: root.querySelector(`[data-amendments-for="${CSS.escape(String(noteId))}"]`),
          historyButton: root.querySelector(`[data-history="${CSS.escape(String(noteId))}"]`),
        });
      };
    });

    root.querySelectorAll('[data-amendment]').forEach(button => {
      button.onclick = () => {
        const noteId = button.dataset.amendment;
        openAmendmentModal({
          mode: 'AMENDMENT',
          noteId,
          panel: root.querySelector(`[data-amendments-for="${CSS.escape(String(noteId))}"]`),
          historyButton: root.querySelector(`[data-history="${CSS.escape(String(noteId))}"]`),
        });
      };
    });

    root.querySelectorAll('[data-history]').forEach(button => {
      button.onclick = async () => {
        const noteId = button.dataset.history;
        const panel = root.querySelector(`[data-amendments-for="${CSS.escape(String(noteId))}"]`);
        if (panel.classList.contains('is-open')) {
          panel.classList.remove('is-open');
          panel.innerHTML = '';
          button.textContent = 'ประวัติหลังลงนาม';
          return;
        }
        await loadAmendments(noteId, panel, button);
      };
    });
  }

  document.addEventListener('enr:patient-updated', event => {
    patient = event.detail;
    ENR.renderPatientHeader('patientBanner');
  });

  ensureAmendmentModal();
  await render();
});
