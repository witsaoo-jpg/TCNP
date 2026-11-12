document.addEventListener('DOMContentLoaded', async () => {
  if (!ENR.requireSession()) return;

  const params = new URLSearchParams(location.search);
  const selectedPatient = ENR.getPatient(); // fallback only for old links; official header comes from PostgreSQL packet.
  const encounterId = Number(
    params.get('encounterId') ||
    selectedPatient?.encounterId ||
    selectedPatient?.encounter_id ||
    0
  );

  if (!Number.isInteger(encounterId) || encounterId <= 0) {
    location.href = 'patient_list.html';
    return;
  }

  const $ = (id) => document.getElementById(id);

  function listFor(note, sectionCode) {
    const items = (note.items || []).filter(item => item.section_code === sectionCode && item.note_text?.trim());
    if (!items.length) return '<span class="pdf-muted">-</span>';
    return `<ul class="pdf-item-list">${items.map(item => `
      <li>${item.tcnp_code ? `<b>[${ENR.escape(item.tcnp_code)}]</b> ` : ''}${ENR.escape(item.note_text)}</li>`).join('')}</ul>`;
  }

  function sameActor(note) {
    const createdId = Number(note?.created_by || 0);
    const signedId = Number(note?.signed_by || 0);
    if (createdId > 0 && signedId > 0) return createdId === signedId;
    const createdName = String(note?.created_by_display || '').trim();
    const signedName = String(note?.signed_by_display || '').trim();
    return Boolean(createdName && signedName && createdName === signedName);
  }

  function signerCellHtml(note) {
    const signer = ENR.escape(note.signed_by_display || note.signed_by || '-');
    const creator = ENR.escape(note.created_by_display || note.created_by || '-');

    // Normal nursing workflow: recorder and signer are the same person.
    // For audit print, avoid duplicated names and internal database User IDs.
    if (sameActor(note)) {
      return `<b>ผู้ลงนาม:</b><br>${signer}<br><small class="pdf-muted">ลงนามอิเล็กทรอนิกส์</small>`;
    }

    // Preserve provenance for exceptional workflows where another person signs.
    return `<b>ผู้ลงนาม:</b><br>${signer}<br><small class="pdf-muted">ลงนามอิเล็กทรอนิกส์</small><br><br><small><b>ผู้บันทึกต้นฉบับ:</b><br>${creator}</small>`;
  }

  function postSignTypeLabel(item) {
    return String(item?.amendment_type || '').toUpperCase() === 'AMENDMENT'
      ? 'Amendment — บันทึกแก้ไข'
      : 'Addendum — บันทึกเพิ่มเติม';
  }

  function postSignHistoryHtml(history) {
    if (!Array.isArray(history) || !history.length) return '';

    return `
      <tr class="pdf-postsign-row">
        <td colspan="5">
          <div class="pdf-postsign">
            <div class="pdf-postsign__title">ประวัติหลังลงนาม</div>
            <div class="pdf-postsign__note">รายการต่อไปนี้ผูกกับ Nursing Note ต้นฉบับด้านบนโดยตรง • ต้นฉบับ SIGNED ไม่ถูกแก้ไข</div>
            <div class="pdf-postsign__list">
              ${history.map((item, index) => {
                const cancelled = Boolean(item.is_cancelled);
                return `
                  <section class="pdf-postsign__item ${cancelled ? 'is-cancelled' : ''}">
                    <div class="pdf-postsign__head">
                      <b>${index + 1}. ${ENR.escape(postSignTypeLabel(item))}</b>
                      <span>${cancelled ? 'ยกเลิกแล้ว — เก็บประวัติ' : 'มีผล'}</span>
                    </div>
                    <div class="pdf-meta-grid">
                      <div><b>วันที่/เวลา:</b> ${ENR.formatThaiDateTime(item.created_at)}</div>
                      <div><b>ผู้บันทึก:</b> ${ENR.escape(item.created_by_display || item.created_by || '-')}</div>
                    </div>
                    ${item.reason ? `<div><b>เหตุผล:</b> ${ENR.escape(item.reason)}</div>` : ''}
                    <div class="pdf-postsign__text"><b>ข้อความ:</b> ${ENR.escape(item.amendment_text || '-')}</div>
                    ${cancelled ? `
                      <div class="pdf-postsign__cancel">
                        <b>รายการนี้ถูกยกเลิก แต่ยังคงแสดงในเอกสารเพื่อ Audit trail</b>
                        <div class="pdf-meta-grid">
                          <div><b>ยกเลิกโดย:</b> ${ENR.escape(item.cancelled_by_display || item.cancelled_by || '-')}</div>
                          <div><b>ยกเลิกเมื่อ:</b> ${ENR.formatThaiDateTime(item.cancelled_at)}</div>
                        </div>
                        <div><b>เหตุผลที่ยกเลิก:</b> ${ENR.escape(item.cancel_reason || '-')}</div>
                      </div>` : ''}
                  </section>`;
              }).join('')}
            </div>
          </div>
        </td>
      </tr>`;
  }

  const body = $('pdfBody');
  body.innerHTML = '<tr><td colspan="5" class="pdf-empty">กำลังสร้าง Nursing Record Packet จาก PostgreSQL...</td></tr>';

  try {
    const packet = await ENR.api.getNursingRecordPacket(encounterId);
    const patient = packet.patient || {};
    const encounter = packet.encounter || {};
    const notes = Array.isArray(packet.notes) ? packet.notes : [];

    // Official patient/encounter header comes from backend/PostgreSQL, not browser local state.
    $('pName').textContent = patient.display_name || '-';
    $('pHN').textContent = patient.hn || '-';
    $('pAN').textContent = encounter.encounter_no || '-';
    $('pWard').textContent = encounter.ward_name || '-';
    $('pWardCode').textContent = encounter.unit_code || '-';
    $('pType').textContent = ENR.encounterTypeLabel ? ENR.encounterTypeLabel(encounter.encounter_type) : (encounter.encounter_type || '-');
    $('pAdmit').textContent = ENR.formatThaiDateTime(encounter.admitted_at);
    $('pDC').textContent = ENR.formatThaiDateTime(encounter.discharged_at);
    $('pDX').textContent = encounter.principal_diagnosis_text || '-';
    $('pBed').textContent = encounter.bed_no || '-';
    $('documentRef').textContent = packet.document_ref || `ENR-NR-ENC-${encounterId}`;
    $('generatedAt').textContent = ENR.formatThaiDateTime(packet.generated_at);
    $('signedCount').textContent = String(packet.signed_note_count ?? notes.length);
    $('postSignCount').textContent = String(packet.post_sign_count ?? 0);
    $('footerIdentity').textContent = `HN ${patient.hn || '-'} • AN ${encounter.encounter_no || '-'} • ${encounter.ward_name || '-'}`;
    $('footerRef').textContent = packet.document_ref || `ENR-NR-ENC-${encounterId}`;

    if (!notes.length) {
      body.innerHTML = '<tr><td colspan="5" class="pdf-empty">ยังไม่มี Nursing Note ที่ลงนามแล้ว (SIGNED) สำหรับ Encounter นี้</td></tr>';
    } else {
      body.innerHTML = notes.map((note, index) => {
        const focus = (note.items || []).find(item => item.section_code === 'F' && item.note_text?.trim());
        const noteRef = `NOTE-${note.id}`;
        return `
          <tr class="pdf-note-ref-row">
            <td colspan="5">
              <div class="pdf-note-ref">
                <span><b>Nursing Note ${index + 1}/${notes.length}</b> • <b>Note ID:</b> ${ENR.escape(noteRef)}</span>
                <span><b>Status:</b> SIGNED • <b>Template:</b> ${ENR.escape(note.template_code_snapshot || '-')} v${ENR.escape(note.template_version_no || '-')}</span>
              </div>
            </td>
          </tr>
          <tr class="pdf-note-original">
            <td>
              <b>Clinical:</b><br>${ENR.formatThaiDateTime(note.clinical_datetime || note.signed_at || note.created_at)}<br>
              <small><b>System created:</b><br>${ENR.formatThaiDateTime(note.created_at)}</small>
              <br><small><b>Signed:</b><br>${ENR.formatThaiDateTime(note.signed_at)}</small>
              <br><small><b>ประเภทผู้ป่วย:</b><br>${note.patient_type_level ? `Type ${ENR.escape(note.patient_type_level)}` : 'ไม่ระบุ (บันทึกเดิม)'}</small>
            </td>
            <td><b>${focus?.tcnp_code ? `[${ENR.escape(focus.tcnp_code)}] ` : ''}${ENR.escape(focus?.note_text || '-')}</b></td>
            <td class="pdf-note-cell">
              <div><b>F:</b> ${listFor(note, 'F')}</div>
              <div><b>A-S:</b> ${listFor(note, 'A_S')}</div>
              <div><b>A-O:</b> ${listFor(note, 'A_O')}</div>
              <div><b>G:</b> ${listFor(note, 'G')}</div>
              <div><b>I:</b> ${listFor(note, 'I')}</div>
              <div><b>E:</b> ${listFor(note, 'E')}</div>
            </td>
            <td>
              <b>แนวโน้ม:</b> ${ENR.trendLabel(note.evaluation_trend)}<br>
              <b>สถานะปัญหา:</b> ${ENR.statusLabel(note.problem_status)}
              ${note.evaluation_note ? `<br><small><b>ผลประเมินเพิ่มเติม:</b> ${ENR.escape(note.evaluation_note)}</small>` : ''}
            </td>
            <td>
              ${signerCellHtml(note)}
            </td>
          </tr>
          ${postSignHistoryHtml(note.post_sign_history || [])}`;
      }).join('');
    }
  } catch (error) {
    console.error('CP6.5 packet load failed:', error);
    body.innerHTML = `<tr><td colspan="5" class="pdf-empty">โหลด Nursing Record Packet ไม่สำเร็จ: ${ENR.escape(error.message)}</td></tr>`;
  }

  $('printNow').onclick = () => window.print();
  $('backNotes').onclick = () => location.href = 'nursing_notes.html';
});
