document.addEventListener('DOMContentLoaded', async () => {
  const session = ENR.requireSession();
  if (!session) return;

  let patient = ENR.getPatient();
  if (!patient) {
    location.href = 'patient_list.html';
    return;
  }

  ENR.renderPatientHeader('patientBanner');
  document.getElementById('editorUser').textContent = session.displayName || session.username || 'User';

  const params = new URLSearchParams(location.search);
  const noteId = params.get('noteId');
  let existing = null;

  if (noteId) {
    try {
      // V3 history endpoint already returns the exact normalized shape used by
      // the History screen (items + latest evaluation + lifecycle metadata).
      // Use it as the primary edit source so the Draft editor opens with the
      // same content the nurse just saw in History. The legacy detail endpoint
      // is kept only as a fallback because api_get_nursing_note() may return a
      // different JSON shape depending on database function version.
      const encounterId = Number(patient?.encounterId || patient?.encounter_id || 0);
      if (encounterId > 0) {
        const history = await ENR.api.getNursingNotes(encounterId);
        existing = history.find(note => String(note?.id) === String(noteId)) || null;
      }

      if (!existing) {
        existing = await ENR.api.getNursingNote(noteId);
      }

      if (!existing || !existing.id) {
        throw new Error('ไม่พบ Nursing Note ที่ต้องการแก้ไข');
      }

      const existingStatus = String(existing?.note_status || existing?.status || 'DRAFT').toUpperCase();
      if (existingStatus !== 'DRAFT') {
        alert(`บันทึกนี้เป็น ${existingStatus} และแก้ไขต้นฉบับไม่ได้`);
        location.href = 'nursing_notes.html';
        return;
      }
    } catch (error) {
      console.error('Load existing Draft failed:', error);
      alert(`โหลด Draft ไม่สำเร็จ: ${error.message}`);
      location.href = 'nursing_notes.html';
      return;
    }
  }

  const sections = ['F', 'A_S', 'A_O', 'G', 'I', 'E'];
  let createdAt = existing?.created_at || new Date().toISOString();
  let items = existing ? structuredCloneSafe(existing.items || []) : [];
  let selectedTrend = existing?.evaluation_trend || null;
  let selectedStatus = existing?.problem_status || 'IN_PROGRESS';
  let selectedTemplateCode = existing?.template_code || '';
  let templateList = [];
  let searchSection = 'F';
  let tcnpDebounce = null;

  if (!existing) ensureManualDefaults();
  else items = dedupeExactFocusDuplicates(items);

  const presetFocus = params.get('focus');
  const presetFocusCode = params.get('focusCode');
  if (!existing && presetFocus) {
    items = items.filter(item => item.section_code !== 'F');
    items.push(presetFocusCode
      ? makeTCNP('F', { code: presetFocusCode, name_th: presetFocus, name_en: '', version: '1.8' }, presetFocus)
      : makeManual('F', presetFocus));
    ensureManualDefaults();
  }
  if (!existing && params.get('resolve') === '1') selectedStatus = 'RESOLVED';

  const clinicalInput = document.getElementById('clinicalDatetime');
  clinicalInput.value = existing?.clinical_datetime
    ? ENR.toLocalInput(existing.clinical_datetime)
    : ENR.toLocalInput();

  const patientTypeSelect = document.getElementById('patientTypeLevel');
  const patientTypeHelp = document.getElementById('patientTypeHelp');
  const patientTypeShiftBadge = document.getElementById('patientTypeShiftBadge');
  let patientTypeTouched = Boolean(existing?.patient_type_level);

  if (existing?.patient_type_level) {
    patientTypeSelect.value = String(existing.patient_type_level);
    patientTypeHelp.textContent = `ประเภทผู้ป่วยของ Draft นี้: Type ${existing.patient_type_level}`;
    patientTypeHelp.className = 'patient-type-help is-carried';
  }

  function localShiftKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}:${ENR.shiftFor(date).code}`;
  }

  async function refreshPatientTypeSuggestion() {
    const shift = ENR.shiftFor(clinicalInput.value);
    patientTypeShiftBadge.textContent = shift.label;

    if (existing || patientTypeTouched) return;

    const currentPatient = ENR.getPatient() || patient || {};
    const encounterId = Number(currentPatient?.encounterId || currentPatient?.encounter_id);
    if (!Number.isInteger(encounterId) || encounterId <= 0) return;

    try {
      const clinicalIso = new Date(clinicalInput.value).toISOString();
      const suggestion = await ENR.api.getNursingPatientTypeSuggestion(encounterId, clinicalIso);
      const level = Number(suggestion?.patient_type_level);
      if (!Number.isInteger(level) || level < 1 || level > 5) {
        patientTypeSelect.value = '';
        patientTypeHelp.textContent = 'ยังไม่มีค่าก่อนหน้า • กรุณาเลือก Type 1-5 สำหรับบันทึกนี้';
        patientTypeHelp.className = 'patient-type-help is-required';
        return;
      }

      patientTypeSelect.value = String(level);
      const sameShift = localShiftKey(suggestion?.clinical_datetime) === localShiftKey(clinicalInput.value);
      patientTypeHelp.textContent = sameShift
        ? `ใช้ Type ${level} จากบันทึกล่าสุดในเวรเดียวกัน • เปลี่ยนได้หากอาการผู้ป่วยเปลี่ยน`
        : `ค่าล่าสุดคือ Type ${level} จากบันทึกก่อนหน้า • กรุณาทบทวนสำหรับเวรนี้`;
      patientTypeHelp.className = 'patient-type-help is-carried';
    } catch (error) {
      console.warn('Patient type suggestion unavailable:', error);
      patientTypeHelp.textContent = 'ไม่สามารถดึง Type ก่อนหน้าได้ • กรุณาเลือก Type 1-5';
      patientTypeHelp.className = 'patient-type-help is-required';
    }
  }

  patientTypeSelect.addEventListener('change', () => {
    patientTypeTouched = true;
    const level = Number(patientTypeSelect.value);
    if (Number.isInteger(level) && level >= 1 && level <= 5) {
      patientTypeHelp.textContent = `เลือก Type ${level} สำหรับบันทึกนี้`;
      patientTypeHelp.className = 'patient-type-help is-carried';
    } else {
      patientTypeHelp.textContent = 'กรุณาเลือกประเภทผู้ป่วย Type 1-5';
      patientTypeHelp.className = 'patient-type-help is-required';
    }
    markDirty();
  });

  document.getElementById('systemCreated').textContent = ENR.formatThaiDateTime(createdAt);
  document.getElementById('evalNote').value = existing?.evaluation_note || '';
  document.getElementById('saveNoteBtn').textContent = existing ? 'บันทึกการแก้ไขทั้งหมด' : 'สร้าง Nursing Problem';
  document.getElementById('savebarStatus').textContent = existing
    ? `กำลังแก้ไข Draft ${existing.id} • การเปลี่ยนแปลงยังไม่ถูกบันทึก`
    : 'Draft ใหม่ • ยังไม่ได้บันทึกลงฐานข้อมูล';

  function structuredCloneSafe(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function id() {
    return `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function makeManual(section, text = '', sourceTemplateItemId = null) {
    return {
      id: id(),
      section_code: section,
      source_type: 'MANUAL',
      source_template_item_id: sourceTemplateItemId,
      code_id: null,
      tcnp_code: null,
      tcnp_name_snapshot: null,
      tcnp_name_en_snapshot: null,
      tcnp_version: null,
      note_text: text,
      sort_order: Date.now() + Math.random()
    };
  }

  function makeTCNP(section, term, text = '', sourceTemplateItemId = null) {
    return {
      id: id(),
      section_code: section,
      source_type: 'TCNP',
      source_template_item_id: sourceTemplateItemId,
      code_id: Number(term.code_id ?? term.id ?? 0) || null,
      tcnp_code: term.code,
      tcnp_name_snapshot: term.name_th || term.name_en || '',
      tcnp_name_en_snapshot: term.name_en || '',
      tcnp_version: term.version || '1.8',
      note_text: text || term.name_th || term.name_en || '',
      sort_order: Date.now() + Math.random()
    };
  }

  function ensureManualDefaults() {
    sections.forEach(section => {
      if (!items.some(item => item.section_code === section && item.source_type === 'MANUAL')) {
        items.push(makeManual(section));
      }
    });
  }
  /*
    CP6.12-FOCUS-DUPLICATE-GUARD

    Keep canonical TCNP Focus and remove only an exact duplicate MANUAL Focus.
    Different MANUAL wording is preserved. SIGNED notes are never mutated here.
  */
  function normalizeFocusText(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('th-TH');
  }

  function dedupeExactFocusDuplicates(sourceItems) {
    const list = Array.isArray(sourceItems) ? sourceItems : [];
    const canonical = new Set();

    list.forEach(item => {
      if (
        String(item?.section_code || '').toUpperCase() === 'F' &&
        String(item?.source_type || '').toUpperCase() === 'TCNP'
      ) {
        const noteText = normalizeFocusText(item?.note_text);
        const nameText = normalizeFocusText(item?.tcnp_name_snapshot);
        if (noteText) canonical.add(noteText);
        if (nameText) canonical.add(nameText);
      }
    });

    if (!canonical.size) return list;

    let removed = 0;
    const result = list.filter(item => {
      const isManualFocus =
        String(item?.section_code || '').toUpperCase() === 'F' &&
        String(item?.source_type || '').toUpperCase() === 'MANUAL';

      if (!isManualFocus) return true;

      const manualText = normalizeFocusText(item?.note_text);
      if (manualText && canonical.has(manualText)) {
        removed += 1;
        return false;
      }
      return true;
    });

    if (removed > 0) {
      console.info(`[ENR] CP6.12 removed ${removed} exact duplicate MANUAL Focus item(s)`);
    }
    return result;
  }


  function markDirty() {
    const el = document.getElementById('savebarStatus');
    el.textContent = existing
      ? `มีการแก้ไขที่ยังไม่บันทึก • ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`
      : 'Draft ใหม่ • ยังไม่ได้บันทึกลงฐานข้อมูล';
  }

  function updateClinicalTimeUI() {
    const shift = ENR.shiftFor(clinicalInput.value);
    const validation = ENR.validateClinicalDatetime(clinicalInput.value);
    document.getElementById('shiftBadge').textContent = shift.label;
    const help = document.getElementById('clinicalTimeHelp');
    help.textContent = validation.message;
    help.className = `clinical-time-help ${validation.ok ? 'ok' : 'error'}`;
  }

  clinicalInput.addEventListener('change', async () => {
    updateClinicalTimeUI();
    if (!existing && !patientTypeTouched) await refreshPatientTypeSuggestion();
    markDirty();
  });
  updateClinicalTimeUI();
  await refreshPatientTypeSuggestion();

  function placeholderFor(section) {
    return {
      F: 'ระบุปัญหาทางการพยาบาล...',
      A_S: 'เช่น ผู้ป่วยบอกว่าเหนื่อย ปวด คลื่นไส้...',
      A_O: 'เช่น SpO₂, RR, BP, อาการที่ตรวจพบ...',
      G: 'ระบุเป้าหมายหรือผลลัพธ์ที่คาดหวัง...',
      I: 'ระบุกิจกรรมการพยาบาลที่ปฏิบัติ...',
      E: 'ระบุผลหลังการพยาบาล...'
    }[section] || 'พิมพ์ข้อความทางการพยาบาล...';
  }

  function render() {
    sections.forEach(section => {
      const root = document.querySelector(`[data-items="${section}"]`);
      const sectionItems = items
        .filter(item => item.section_code === section)
        .sort((a, b) => a.sort_order - b.sort_order);

      root.innerHTML = sectionItems.map(item => `
        <div class="item-card" data-item="${ENR.escape(item.id)}">
          <div class="item-card__top">
            <div class="item-identity">
              <span class="item-source ${item.source_type === 'TCNP' ? 'tcnp' : ''}">${item.source_type}</span>
              ${item.tcnp_code ? `
                <span class="item-code">${ENR.escape(item.tcnp_code)}</span>
                <span class="item-term">${ENR.escape(item.tcnp_name_snapshot || '')}</span>
                <span class="item-version">v${ENR.escape(item.tcnp_version || '1.8')}</span>` : ''}
            </div>
            <button class="enr-btn enr-btn--danger" data-remove>นำออก</button>
          </div>
          <textarea class="enr-textarea" data-text placeholder="${placeholderFor(section)}">${ENR.escape(item.note_text || '')}</textarea>
        </div>`).join('');

      root.querySelectorAll('.item-card').forEach(card => {
        const item = items.find(candidate => String(candidate.id) === String(card.dataset.item));
        card.querySelector('[data-text]').addEventListener('input', event => {
          item.note_text = event.target.value;
          markDirty();
        });
        card.querySelector('[data-remove]').addEventListener('click', () => {
          items = items.filter(candidate => String(candidate.id) !== String(item.id));
          render();
          markDirty();
        });
      });
    });

    document.querySelectorAll('[data-trend]').forEach(button => {
      button.classList.toggle('is-selected', button.dataset.trend === selectedTrend);
    });
    document.querySelectorAll('[data-status]').forEach(button => {
      button.classList.toggle('is-selected', button.dataset.status === selectedStatus);
    });
  }

  document.querySelectorAll('[data-add-manual]').forEach(button => {
    button.addEventListener('click', () => {
      items.push(makeManual(button.dataset.addManual));
      render();
      markDirty();
    });
  });

  document.querySelectorAll('[data-add-tcnp]').forEach(button => {
    button.addEventListener('click', () => openTCNP(button.dataset.addTcnp));
  });

  document.querySelectorAll('[data-trend]').forEach(button => {
    button.addEventListener('click', () => {
      selectedTrend = selectedTrend === button.dataset.trend ? null : button.dataset.trend;
      render();
      markDirty();
    });
  });

  document.querySelectorAll('[data-status]').forEach(button => {
    button.addEventListener('click', () => {
      selectedStatus = button.dataset.status;
      render();
      markDirty();
    });
  });

  document.getElementById('evalNote').addEventListener('input', markDirty);

  const tcnpModal = document.getElementById('tcnpModal');
  const tcnpQuery = document.getElementById('tcnpQuery');
  const tcnpResults = document.getElementById('tcnpResults');
  const tcnpSectionHint = document.getElementById('tcnpSectionHint');

  async function openTCNP(section) {
    searchSection = section;
    tcnpQuery.value = '';
    tcnpSectionHint.textContent = `${section.replace('_', '-')} • ${section === 'F' ? 'ค้นหา Focus (F code)' : 'ค้นหา Procedure (P code)'}`;
    tcnpModal.classList.add('is-open');
    await renderTCNP('');
    tcnpQuery.focus();
  }

  async function renderTCNP(query) {
    tcnpResults.innerHTML = '<div class="enr-empty">กำลังค้นหา TCNP...</div>';
    try {
      const results = await ENR.api.searchTCNP(query, searchSection);
      tcnpResults.innerHTML = results.length
        ? results.map((term, index) => `
          <div class="tcnp-result" data-index="${index}">
            <div class="tcnp-result__top">
              <span>[${ENR.escape(term.code)}] ${ENR.escape(term.name_th || '-')}</span>
              <span class="enr-badge enr-badge--teal">${ENR.escape(term.code_type)}</span>
            </div>
            <div class="tcnp-result__en">${ENR.escape(term.name_en || '')}</div>
            ${term.action_code ? `<div class="tcnp-result__meta">Action: ${ENR.escape(term.action_code)} • ${ENR.escape(term.type_source || '')}</div>` : ''}
          </div>`).join('')
        : '<div class="enr-empty">ไม่พบรหัส TCNP</div>';

      tcnpResults.querySelectorAll('.tcnp-result').forEach((element, index) => {
        element.addEventListener('click', () => {
          const term = results[index];
          items.push(makeTCNP(searchSection, term));
          tcnpModal.classList.remove('is-open');
          render();
          markDirty();
        });
      });
    } catch (error) {
      tcnpResults.innerHTML = `<div class="enr-empty">ค้นหา TCNP ไม่สำเร็จ: ${ENR.escape(error.message)}</div>`;
    }
  }

  tcnpQuery.addEventListener('input', () => {
    clearTimeout(tcnpDebounce);
    tcnpDebounce = setTimeout(() => renderTCNP(tcnpQuery.value), window.ENR_CONFIG?.TCNP_SEARCH_DEBOUNCE_MS || 250);
  });

  document.querySelectorAll('[data-close-tcnp]').forEach(button => {
    button.addEventListener('click', () => tcnpModal.classList.remove('is-open'));
  });

  const templateSearch = document.getElementById('templateSearch');
  const templateSelect = document.getElementById('templateSelect');
  const templateState = document.getElementById('templateState');

  async function loadTemplates(query = '') {
    templateList = await ENR.api.getTemplates(query);
    templateSelect.innerHTML = '<option value="">— เลือก Template —</option>' + templateList.map(template => `
      <option value="${ENR.escape(template.code)}" ${template.code === selectedTemplateCode ? 'selected' : ''}>
        ${ENR.escape(template.code)} • ${ENR.escape(template.name_th)}
      </option>`).join('');
  }

  let templateDebounce = null;
  templateSearch.addEventListener('input', () => {
    clearTimeout(templateDebounce);
    templateDebounce = setTimeout(() => loadTemplates(templateSearch.value), 250);
  });

  templateSelect.addEventListener('change', () => {
    const selected = templateList.find(template => template.code === templateSelect.value);
    templateState.textContent = selected
      ? `${selected.code} • ${selected.name_th} • v${selected.version}`
      : 'ยังไม่ได้เลือก Template · สามารถเขียนเองได้ทันที';
  });

  document.getElementById('useTemplateBtn').addEventListener('click', async () => {
    const button = document.getElementById('useTemplateBtn');
    const code = templateSelect.value;
    if (!code) {
      ENR.toast('กรุณาเลือก Template ก่อน');
      return;
    }

    const selectedFromList = templateList.find(template => template.code === code) || null;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '⏳ กำลังโหลด...';
    templateState.textContent = `${code} • กำลังโหลดข้อมูล Template จาก PostgreSQL...`;

    try {
      const template = await ENR.api.getTemplate(code);
      if (!template) {
        throw new Error('ไม่พบ Template ที่เลือก');
      }

      const hasTypedData = items.some(item => item.note_text?.trim());
      if (hasTypedData && !confirm('การใช้ Template จะเติมชุดข้อมูลใหม่แทนรายการปัจจุบัน ต้องการดำเนินการต่อหรือไม่?')) {
        templateState.textContent = selectedFromList
          ? `${selectedFromList.code} • ${selectedFromList.name_th} • v${selectedFromList.version}`
          : `${code} • ยังไม่ได้โหลด`;
        return;
      }

      const nextItems = (template.items || [])
        .filter(row => row.is_active !== false)
        .map(row => {
          const sourceTemplateItemId = Number(row.template_item_id ?? row.id ?? 0) || null;
          if (row.source_type === 'MANUAL') {
            return makeManual(
              row.section_code,
              row.note_template || row.default_text || '',
              sourceTemplateItemId
            );
          }

          const term = {
            id: row.code_id,
            code_id: row.code_id,
            code: row.tcnp_code,
            name_th: row.tcnp_name_th || row.tcnp_code,
            name_en: row.tcnp_name_en || '',
            version: row.tcnp_version || '1.8'
          };

          return makeTCNP(
            row.section_code,
            term,
            row.note_template || row.default_text || term.name_th || term.name_en || '',
            sourceTemplateItemId
          );
        });

      // Focus is stored on nursing_templates (focus_code_id/focus_text),
      // while A_S/A_O/G/I/E are stored in nursing_template_items.
      // Add the template Focus to F when the item list does not already contain F.
      if (!nextItems.some(item => item.section_code === 'F')) {
        if (template.focus_code) {
          nextItems.unshift(makeTCNP('F', {
            id: template.focus_code_id || null,
            code_id: template.focus_code_id || null,
            code: template.focus_code,
            name_th: template.focus_text || template.focus_code,
            name_en: '',
            version: '1.8'
          }, template.focus_text || template.focus_code, null));
        } else if (template.focus_text) {
          nextItems.unshift(makeManual('F', template.focus_text, null));
        }
      }

      items = dedupeExactFocusDuplicates(nextItems);
      ensureManualDefaults();
      selectedTemplateCode = template.code || code;
      templateState.textContent = `${template.code || code} • ${template.name_th || selectedFromList?.name_th || ''} • v${template.version || selectedFromList?.version || 1} • โหลดแล้ว`;
      render();
      markDirty();
      ENR.toast('โหลด Template แล้ว สามารถแก้ไขต่อได้');
    } catch (error) {
      console.error('Load nursing template failed:', error);
      templateState.textContent = `${code} • โหลดไม่สำเร็จ: ${error.message}`;
      templateState.className = 'enr-badge enr-badge--amber';
      alert(`โหลด Template ไม่สำเร็จ

${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  document.getElementById('writeOwnBtn').addEventListener('click', () => {
    if (items.some(item => item.note_text?.trim()) && !confirm('ต้องการเริ่มเขียนเองใหม่หรือไม่? ข้อความปัจจุบันจะถูกล้าง')) return;
    items = [];
    selectedTemplateCode = '';
    ensureManualDefaults();
    templateSelect.value = '';
    templateState.textContent = 'โหมดเขียนเอง • MANUAL พร้อมใช้ทุกหัวข้อ';
    render();
    markDirty();
  });

  async function save() {
    items = dedupeExactFocusDuplicates(items);
    const usefulItems = items.filter(item => item.note_text?.trim());

    if (!usefulItems.some(item => item.section_code === 'F')) {
      alert('กรุณาระบุ F – Focus อย่างน้อย 1 รายการ');
      return;
    }

    const validation = ENR.validateClinicalDatetime(clinicalInput.value);
    if (!validation.ok) {
      alert(validation.message);
      clinicalInput.focus();
      return;
    }


    // CP6.9.1 — always read Patient Type as a numeric value from the actual
    // select element. Do not rely on browser named globals from element IDs.
    const selectedPatientTypeLevel = Number(patientTypeSelect?.value || 0);
    if (
      !Number.isInteger(selectedPatientTypeLevel) ||
      selectedPatientTypeLevel < 1 ||
      selectedPatientTypeLevel > 5
    ) {
      alert('กรุณาเลือกประเภทผู้ป่วย Type 1-5');
      patientTypeSelect?.focus();
      return;
    }

    const evaluationTextRaw = document.getElementById('evalNote').value.trim();
    const evaluationFromE = usefulItems
      .filter(item => item.section_code === 'E' && item.note_text?.trim())
      .map(item => item.note_text.trim())
      .join(' • ');
    const evaluationText = evaluationTextRaw || (selectedTrend ? evaluationFromE : '');

    if (selectedTrend && !evaluationText) {
      alert('เมื่อเลือก ดีขึ้น / คงตัว / แย่ลง กรุณาระบุ E – Evaluation หรือรายละเอียดผลการประเมิน');
      return;
    }

    if (selectedStatus === 'RESOLVED' && !selectedTrend) {
      alert('การสิ้นสุดปัญหาต้องเลือกผลการประเมิน ดีขึ้น / คงตัว / แย่ลง');
      return;
    }

    if (evaluationText && !selectedTrend) {
      alert('หากระบุรายละเอียดผลการประเมิน กรุณาเลือก ดีขึ้น / คงตัว / แย่ลง');
      return;
    }

    patient = ENR.getPatient();
    const encounterId = Number(patient?.encounterId || patient?.encounter_id);
    if (!Number.isInteger(encounterId) || encounterId <= 0) {
      alert('ไม่พบ Encounter ID ของผู้ป่วย กรุณากลับไปเลือกรายชื่อผู้ป่วยใหม่');
      return;
    }

    const clinicalDate = new Date(clinicalInput.value);
    const orderedItems = usefulItems.map((item, index) => ({
      ...item,
      sort_order: index + 1,
      display_order: index + 1
    }));

    const commonPayload = {
      clinical_datetime: clinicalDate.toISOString(),
      patient_type_level: selectedPatientTypeLevel,
      evaluation_outcome_code: selectedTrend,
      care_plan_status_code: selectedStatus,
      evaluation_text: evaluationText
    };

    console.debug('[ENR] CP6.9.1 Patient Type save', {
      mode: existing ? 'UPDATE_DRAFT' : 'CREATE',
      patient_type_level: selectedPatientTypeLevel
    });

    const saveButton = document.getElementById('saveNoteBtn');
    saveButton.disabled = true;
    const originalButtonText = saveButton.textContent;
    saveButton.textContent = window.ENR_CONFIG?.USE_MOCK_DATA ? 'กำลังบันทึกข้อมูลทดลอง...' : 'กำลังบันทึก PostgreSQL...';

    try {
      if (existing) {
        await ENR.api.updateNursingNote(existing.id, {
          ...commonPayload,
          items: orderedItems.map(item => ({
            id: Number(item.id) || item.id,
            section_code: item.section_code,
            source_type: item.source_type,
            source_template_item_id: item.source_template_item_id || null,
            code_id: item.code_id || null,
            tcnp_code: item.tcnp_code || null,
            note_text: item.note_text,
            sort_order: item.sort_order
          }))
        });
        ENR.toast(window.ENR_CONFIG?.USE_MOCK_DATA ? 'บันทึก Draft ทดลองในเบราว์เซอร์แล้ว' : 'บันทึกการแก้ไข Draft ลง PostgreSQL แล้ว');
      } else {
        const selectedTemplate = selectedTemplateCode
          ? templateList.find(template => template.code === selectedTemplateCode)
          : null;

        const selectedTemplateItems = [];
        const customItems = [];

        orderedItems.forEach(item => {
          const templateItemId = Number(item.source_template_item_id || 0);

          // Template Focus lives on nursing_templates.focus_code_id/focus_text and
          // api_compose_nursing_problem creates it automatically. Do not send the
          // same unchanged Focus again as custom_items (prevents duplicate F).
          const isAutoTemplateFocus = Boolean(
            selectedTemplate &&
            item.section_code === 'F' &&
            templateItemId <= 0 &&
            selectedTemplate.focus_code &&
            String(item.tcnp_code || '').toUpperCase() === String(selectedTemplate.focus_code || '').toUpperCase() &&
            String(item.note_text || '').trim() === String(selectedTemplate.focus_text || selectedTemplate.focus_code || '').trim()
          );
          if (isAutoTemplateFocus) return;

          if (templateItemId > 0) {
            selectedTemplateItems.push({
              id: templateItemId,
              template_item_id: templateItemId,
              source_template_item_id: templateItemId,
              note_text: item.note_text,
              display_order: item.sort_order
            });
          } else {
            customItems.push({
              section_code: item.section_code,
              source_type: item.source_type,
              code_id: item.code_id || null,
              tcnp_code: item.tcnp_code || null,
              note_text: item.note_text,
              display_order: item.sort_order,
              is_manual: item.source_type !== 'TCNP'
            });
          }
        });

        await ENR.api.createNursingNote(encounterId, {
          template_id: selectedTemplate?.id || null,
          clinical_datetime: commonPayload.clinical_datetime,
          patient_type_level: commonPayload.patient_type_level,
          selected_template_items: selectedTemplateItems,
          custom_items: customItems,
          evaluation_outcome_code: commonPayload.evaluation_outcome_code,
          care_plan_status_code: commonPayload.care_plan_status_code,
          evaluation_text: commonPayload.evaluation_text
        });

        ENR.toast(window.ENR_CONFIG?.USE_MOCK_DATA ? 'สร้าง Nursing Problem ทดลองในเบราว์เซอร์แล้ว' : 'สร้าง Nursing Problem ใน PostgreSQL แล้ว');
      }

      location.href = 'nursing_notes.html';
    } catch (error) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = originalButtonText;
    }
  }

  document.getElementById('saveNoteBtn').addEventListener('click', save);
  document.getElementById('cancelBtn').addEventListener('click', () => location.href = 'nursing_notes.html');

  document.addEventListener('enr:patient-updated', event => {
    patient = event.detail;
    ENR.renderPatientHeader('patientBanner');
  });

  await loadTemplates();
  render();
});
