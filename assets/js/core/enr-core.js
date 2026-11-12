(function () {
  const ENR = window.ENR = window.ENR || {};
  const config = window.ENR_CONFIG || {};

  ENR.keys = {
    session: 'enr.v3.session',
    ward: 'enr.v3.selectedWard',
    patient: 'enr.v3.patient',
    audit: 'enr.v3.audit'
  };

  ENR.read = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  };

  ENR.write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  ENR.readSession = () => {
    try { return JSON.parse(sessionStorage.getItem(ENR.keys.session) || 'null'); }
    catch (_) { return null; }
  };

  ENR.setSession = session => {
    sessionStorage.setItem(ENR.keys.session, JSON.stringify(session));
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('currentUser', session.displayName || session.username || 'User');
  };

  ENR.clearSession = () => {
    sessionStorage.removeItem(ENR.keys.session);
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('currentUser');
  };

  ENR.requireSession = () => {
    const session = ENR.readSession();
    if (!session) {
      location.href = 'login.html';
      return null;
    }
    return session;
  };

  ENR.getWard = () => ENR.read(ENR.keys.ward, ENR.read('selectedWard', null));
  ENR.setWard = ward => {
    ENR.write(ENR.keys.ward, ward);
    ENR.write('selectedWard', ward);
  };

  ENR.getPatient = () => ENR.read(ENR.keys.patient, ENR.read('patientProfile', null));
  ENR.setPatient = patient => {
    ENR.write(ENR.keys.patient, patient);
    ENR.write('patientProfile', patient);
    if (patient && patient.hn) localStorage.setItem('currentHN', patient.hn);
  };

  ENR.notesKey = hn => `enr.v3.notes.${hn || 'unknown'}`;
  ENR.getNotes = hn => ENR.read(ENR.notesKey(hn), []);
  ENR.saveNotes = (hn, notes) => ENR.write(ENR.notesKey(hn), notes);

  ENR.migratePrototypeNotes = (oldHn, newHn) => {
    if (!oldHn || !newHn || oldHn === newHn) return;
    const oldNotes = ENR.getNotes(oldHn);
    const newNotes = ENR.getNotes(newHn);
    if (oldNotes.length) {
      ENR.saveNotes(newHn, [...newNotes, ...oldNotes]);
      localStorage.removeItem(ENR.notesKey(oldHn));
    }
  };

  ENR.audit = (action, details = {}) => {
    const list = ENR.read(ENR.keys.audit, []);
    list.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      action,
      details,
      at: new Date().toISOString(),
      user: ENR.readSession()?.username || 'unknown'
    });
    ENR.write(ENR.keys.audit, list.slice(-1000));
  };

  ENR.escape = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  ENR.formatThaiDateTime = value => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  };

  ENR.toLocalInput = dateValue => {
    const date = dateValue ? new Date(dateValue) : new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };

  ENR.shiftFor = value => {
    const date = new Date(value);
    const hour = date.getHours();
    if (hour >= 8 && hour < 16) return { code: 'DAY', label: 'เวรเช้า · 08:00–16:00' };
    if (hour >= 16) return { code: 'EVENING', label: 'เวรบ่าย · 16:00–00:00' };
    return { code: 'NIGHT', label: 'เวรดึก · 00:00–08:00' };
  };

  ENR.currentShiftStart = (now = new Date()) => {
    const start = new Date(now);
    const hour = start.getHours();
    start.setHours(hour < 8 ? 0 : hour < 16 ? 8 : 16, 0, 0, 0);
    return start;
  };

  ENR.validateClinicalDatetime = (value, now = new Date()) => {
    const clinical = new Date(value);
    if (Number.isNaN(clinical.getTime())) return { ok: false, message: 'กรุณาระบุวัน–เวลาทางการพยาบาล' };

    const futureAllowance = Number(config.CLINICAL_TIME_ALLOW_FUTURE_MINUTES || 0) * 60 * 1000;
    if (clinical.getTime() > now.getTime() + futureAllowance) {
      return { ok: false, message: 'ไม่สามารถเลือกเวลาทางการพยาบาลในอนาคตได้' };
    }

    const maxBackShifts = Number(config.CLINICAL_TIME_MAX_BACK_SHIFTS ?? 2);
    const earliest = ENR.currentShiftStart(now);
    earliest.setHours(earliest.getHours() - (maxBackShifts * 8));
    if (clinical < earliest) {
      return {
        ok: false,
        message: `ย้อนหลังได้ไม่เกิน ${maxBackShifts} เวร (เร็วที่สุด ${ENR.formatThaiDateTime(earliest)})`
      };
    }

    return { ok: true, message: `อยู่ในช่วงเวลาที่อนุญาต • ${ENR.shiftFor(clinical).label}` };
  };

  ENR.trendLabel = value => ({
    IMPROVED: '↑ ดีขึ้น',
    STABLE: '→ คงตัว',
    WORSE: '↓ แย่ลง'
  }[value] || 'ยังไม่ประเมินแนวโน้ม');

  ENR.statusLabel = value => ({
    IN_PROGRESS: 'In-progress · กำลังดำเนินการ',
    RESOLVED: 'Resolved · สิ้นสุดปัญหา'
  }[value] || '-');

  ENR.problemKey = items => {
    const focus = (items || []).find(item => item.section_code === 'F' && item.note_text?.trim());
    if (!focus) return null;
    return focus.tcnp_code || `MANUAL:${focus.note_text.trim().toLowerCase()}`;
  };

  ENR.toast = message => {
    let toast = document.getElementById('enrToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'enrToast';
      toast.className = 'enr-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(ENR._toastTimer);
    ENR._toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };


  // CP6.6 — Encounter type is a HIS/Backend field, not a nurse-editable patient setting.
  ENR.encounterTypeValue = patient => {
    const value = patient?.encounterType
      ?? patient?.encounter_type
      ?? patient?.raw?.encounter_type
      ?? patient?.raw?.encounterType
      ?? patient?.raw?.visit_type
      ?? '';
    const normalized = String(value || '').trim().toUpperCase();
    // Numeric legacy patient "Type 1" is intentionally not treated as encounter type.
    return /^\d+$/.test(normalized) ? '' : normalized;
  };


  ENR.encounterTypeLabel = value => {
    const type = String(value || '').trim().toUpperCase();
    const labels = {
      IPD: 'ผู้ป่วยใน (IPD)',
      OPD: 'ผู้ป่วยนอก (OPD)',
      ER: 'ฉุกเฉิน (ER)',
      ED: 'ฉุกเฉิน (ED)',
      OBS: 'สังเกตอาการ (OBS)',
      DAYCARE: 'Day Care',
      DAY_CARE: 'Day Care'
    };
    return labels[type] || type || '-';
  };

  ENR.renderPatientHeader = (rootId = 'patientBanner', opts = {}) => {
    const patient = ENR.getPatient();
    const root = document.getElementById(rootId);
    if (!root || !patient) return;

    const ward = patient.wardName || patient.ward || '-';
    const dc = patient.dc ? ENR.formatThaiDateTime(patient.dc) : '-';
    const encounterType = ENR.encounterTypeValue(patient);
    root.innerHTML = `
      <div>
        <div class="enr-patient-name">
          ${ENR.escape(patient.name || '-')}
          ${opts.edit === false ? '' : '<button class="enr-btn patient-edit-btn" data-open-patient-settings>✎ แก้ไขข้อมูล</button>'}
        </div>
        <div class="enr-patient-meta">
          <span>▣ HN: ${ENR.escape(patient.hn || '-')}</span>
          <span>⚑ AN: ${ENR.escape(patient.an || '-')}</span>
          <span>⌂ Ward: ${ENR.escape(ward)}</span>
          <span>▱ บริการ: <b>${ENR.escape(ENR.encounterTypeLabel(encounterType))}</b></span>
          <span>☑ Admit: ${ENR.escape(patient.admit ? ENR.formatThaiDateTime(patient.admit) : '-')}</span>
          <span>⚕ DX: ${ENR.escape(patient.dx || '-')}</span>
          <span>↪ D/C: ${ENR.escape(dc)}</span>
        </div>
      </div>
      ${opts.actions || ''}`;

    if (opts.edit !== false) {
      root.querySelector('[data-open-patient-settings]')?.addEventListener('click', ENR.openPatientSettings);
    }
  };

  ENR.ensurePatientModal = () => {
    if (document.getElementById('patientSettingsModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="enr-modal-backdrop" id="patientSettingsModal">
        <div class="enr-modal">
          <div class="enr-modal__header">
            <div class="enr-modal__title">♟ แก้ไขข้อมูลผู้ป่วย</div>
            <button class="enr-modal__close" data-close>×</button>
          </div>
          <div class="enr-grid-2">
            <div class="enr-field" style="grid-column:1/-1">
              <label>ชื่อ-นามสกุล (อายุ)</label>
              <input class="enr-input" id="ps_name">
            </div>
            <div class="enr-field"><label>HN</label><input class="enr-input" id="ps_hn"></div>
            <div class="enr-field"><label>AN</label><input class="enr-input" id="ps_an"></div>
            <div class="enr-field"><label>Ward</label><input class="enr-input" id="ps_ward"></div>
            <div class="enr-field"><label>Admit Date/Time</label><input class="enr-input" id="ps_admit" type="datetime-local"></div>
            <div class="enr-field"><label>D/C Date/Time</label><input class="enr-input" id="ps_dc" type="datetime-local"></div>
            <div class="enr-field" style="grid-column:1/-1">
              <label>Principal Diagnosis (DX)</label>
              <input class="enr-input" id="ps_dx">
            </div>
          </div>
          <div class="prototype-permission-note">Prototype V3: ข้อมูลประเภทผู้ป่วย Type 1-5 ย้ายไปบันทึกตามวัน–เวลาทางการพยาบาลแล้ว • หน้านี้ใช้สำหรับข้อมูลผู้ป่วย/Encounter เท่านั้น</div>
          <div class="enr-modal__footer">
            <button class="enr-btn" data-close>ยกเลิก</button>
            <button class="enr-btn enr-btn--primary" id="ps_save">บันทึก (Save)</button>
          </div>
        </div>
      </div>`);

    const modal = document.getElementById('patientSettingsModal');
    modal.querySelectorAll('[data-close]').forEach(button => button.onclick = () => modal.classList.remove('is-open'));
    modal.querySelector('#ps_save').onclick = () => {
      const before = ENR.getPatient() || {};
      const patient = {
        ...before,
        name: document.getElementById('ps_name').value.trim(),
        hn: document.getElementById('ps_hn').value.trim(),
        an: document.getElementById('ps_an').value.trim(),
        ward: document.getElementById('ps_ward').value.trim(),
        wardName: document.getElementById('ps_ward').value.trim(),
        admit: document.getElementById('ps_admit').value,
        dc: document.getElementById('ps_dc').value,
        dx: document.getElementById('ps_dx').value.trim()
      };

      if (!patient.name || !patient.hn) {
        alert('กรุณาระบุชื่อผู้ป่วยและ HN');
        return;
      }

      ENR.migratePrototypeNotes(before.hn, patient.hn);
      ENR.setPatient(patient);
      ENR.audit('UPDATE_PATIENT_PROFILE', { before, after: patient });
      modal.classList.remove('is-open');
      ENR.renderPatientHeader('patientBanner');
      ENR.toast('บันทึกข้อมูลผู้ป่วยแล้ว');
      document.dispatchEvent(new CustomEvent('enr:patient-updated', { detail: patient }));
    };
  };

  ENR.openPatientSettings = () => {
    ENR.ensurePatientModal();
    const patient = ENR.getPatient() || {};
    document.getElementById('ps_name').value = patient.name || '';
    document.getElementById('ps_hn').value = patient.hn || '';
    document.getElementById('ps_an').value = patient.an || '';
    document.getElementById('ps_ward').value = patient.wardName || patient.ward || '';
    document.getElementById('ps_admit').value = patient.admit ? ENR.toLocalInput(patient.admit) : '';
    document.getElementById('ps_dc').value = patient.dc ? ENR.toLocalInput(patient.dc) : '';
    document.getElementById('ps_dx').value = patient.dx || '';
    document.getElementById('patientSettingsModal').classList.add('is-open');
  };
})();
