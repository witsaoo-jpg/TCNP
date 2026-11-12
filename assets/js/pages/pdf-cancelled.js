document.addEventListener('DOMContentLoaded', async () => {
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient();
  if (!patient?.encounterId && !patient?.encounter_id) {
    location.href = 'patient_list.html';
    return;
  }

  const encounterId = Number(patient.encounterId || patient.encounter_id);
  const noteId = Number(new URLSearchParams(location.search).get('noteId'));
  const isCancelled = note => ['CANCELED','CANCELLED'].includes(String(note?.status || note?.note_status || '').toUpperCase());

  document.getElementById('pName').textContent = patient.name || '-';
  document.getElementById('pHN').textContent = patient.hn || '-';
  document.getElementById('pAN').textContent = patient.an || '-';
  document.getElementById('pWard').textContent = patient.wardName || patient.ward || '-';
  /* CP6.13-CANCELLED-PDF-TYPE-SNAPSHOT
     Patient Type 1–5 belongs to the Nursing Note snapshot, not the encounter/patient.
     Do not invent Type 1 while the cancelled note is still loading. */
  document.getElementById('pType').textContent = 'กำลังโหลด...';
  document.getElementById('pAdmit').textContent = patient.admit ? ENR.formatThaiDateTime(patient.admit) : '-';
  document.getElementById('pDC').textContent = patient.dc ? ENR.formatThaiDateTime(patient.dc) : '-';
  document.getElementById('pDX').textContent = patient.dx || '-';
  document.getElementById('backCancelled').onclick = () => location.href = 'nursing_notes_cancelled.html';
  document.getElementById('printNow').onclick = () => window.print();

  function listFor(note, sectionCode) {
    const items = (note.items || []).filter(item => item.section_code === sectionCode && item.note_text?.trim());
    if (!items.length) return '-';
    return `<ul>${items.map(item => `<li>${item.tcnp_code ? `<b>[${ENR.escape(item.tcnp_code)}]</b> ` : ''}${ENR.escape(item.note_text)}</li>`).join('')}</ul>`;
  }

  const body = document.getElementById('pdfCancelledBody');
  const meta = document.getElementById('cancelledMeta');

  if (!Number.isInteger(noteId) || noteId <= 0) {
    body.innerHTML = '<tr><td colspan="4" class="pdf-error">ไม่พบ Note ID</td></tr>';
    return;
  }

  try {
    const notes = await ENR.api.getNursingNotes(encounterId);
    const note = notes.find(item => Number(item.id) === noteId && isCancelled(item));
    if (!note) throw new Error('ไม่พบบันทึกที่ยกเลิก หรือบันทึกนี้ไม่ได้อยู่ในสถานะ CANCELLED');

    const patientTypeLevel = Number(note.patient_type_level);
    document.getElementById('pType').textContent =
      Number.isInteger(patientTypeLevel) && patientTypeLevel >= 1 && patientTypeLevel <= 5
        ? `Type ${patientTypeLevel}`
        : 'ไม่ระบุ (บันทึกเดิม)';

    const focus = (note.items || []).find(item => item.section_code === 'F' && item.note_text?.trim());
    meta.innerHTML = `
      <div><b>System created:</b> ${ENR.formatThaiDateTime(note.created_at)}</div>
      <div><b>Clinical:</b> ${ENR.formatThaiDateTime(note.clinical_datetime)}</div>
      <div><b>ผู้บันทึก:</b> ${ENR.escape(note.created_by_display || (note.created_by ? `User #${note.created_by}` : '-'))}</div>
      <div><b>Template:</b> ${ENR.escape(note.template_code || '-')}</div>
      <div><b>ลงนามเมื่อ:</b> ${note.signed_at ? ENR.formatThaiDateTime(note.signed_at) : 'ไม่ได้ลงนามก่อนยกเลิก'}</div>
      <div><b>ผู้ลงนาม:</b> ${note.signed_at ? ENR.escape(note.signed_by_display || (note.signed_by ? `User #${note.signed_by}` : '-')) : '-'}</div>
      <div><b>ยกเลิกเมื่อ:</b> ${ENR.formatThaiDateTime(note.cancelled_at)}</div>
      <div><b>ยกเลิกโดย:</b> ${ENR.escape(note.cancelled_by_display || (note.cancelled_by ? `User #${note.cancelled_by}` : '-'))}</div>
      <div class="wide"><b>เหตุผลการยกเลิก:</b> ${ENR.escape(note.cancel_reason || '-')}</div>`;

    body.innerHTML = `
      <tr>
        <td><b>Clinical:</b><br>${ENR.formatThaiDateTime(note.clinical_datetime)}<br><br><small><b>System created:</b><br>${ENR.formatThaiDateTime(note.created_at)}</small></td>
        <td><b>${focus?.tcnp_code ? `[${ENR.escape(focus.tcnp_code)}] ` : ''}${ENR.escape(focus?.note_text || '-')}</b></td>
        <td>
          <div><b>F:</b> ${listFor(note,'F')}</div>
          <div><b>A-S:</b> ${listFor(note,'A_S')}</div>
          <div><b>A-O:</b> ${listFor(note,'A_O')}</div>
          <div><b>G:</b> ${listFor(note,'G')}</div>
          <div><b>I:</b> ${listFor(note,'I')}</div>
          <div><b>E:</b> ${listFor(note,'E')}</div>
        </td>
        <td><b>แนวโน้ม:</b> ${ENR.trendLabel(note.evaluation_trend)}<br><b>สถานะปัญหาเดิม:</b> ${ENR.statusLabel(note.problem_status)}${note.evaluation_note ? `<br><br><small><b>Eval:</b> ${ENR.escape(note.evaluation_note)}</small>` : ''}<br><br><b>สถานะเอกสาร:</b> CANCELLED</td>
      </tr>`;
  } catch (error) {
    document.getElementById('pType').textContent = '-';
    body.innerHTML = `<tr><td colspan="4" class="pdf-error">โหลด PDF CANCELLED ไม่สำเร็จ: ${ENR.escape(error.message)}</td></tr>`;
    meta.innerHTML = '';
  }
});
