// CP6.14-FULL-TEMPLATE-MANAGEMENT
document.addEventListener('DOMContentLoaded', async () => {
  ENRAdmin.bindChrome();
  const session = await ENRAdmin.guard();
  if (!session) return;

  const $ = id => document.getElementById(id);
  const SECTIONS = ['F', 'A_S', 'A_O', 'G', 'I', 'E'];
  const LABELS = {
    F: ['F — Focus', 'ปัญหาทางการพยาบาล'],
    A_S: ['A-S — Subjective', 'ข้อมูลจากผู้ป่วย/ญาติ'],
    A_O: ['A-O — Objective', 'ข้อมูลที่ตรวจพบ/ประเมินได้'],
    G: ['G — Goal', 'เป้าหมายการพยาบาล'],
    I: ['I — Intervention', 'กิจกรรมการพยาบาล'],
    E: ['E — Evaluation', 'การประเมินผล']
  };

  const params = new URLSearchParams(location.search);
  const editId = Number(params.get('id') || 0) || null;
  let current = null;
  let wards = [];
  let dirty = false;
  let readOnly = false;
  let tcnpTarget = null;
  let searchTimer = null;

  const fresh = () => ({
    id: null, code: '', name_th: '', description: '', version: 1, status: 'DRAFT',
    scope_type: 'HOSPITAL', org_unit_id: null, org_unit_code: '', focus_code: '', focus_text: '', items: []
  });

  const manualItem = section => ({
    id: ENRAdmin.makeId('MANUAL'), section_code: section, source_type: 'MANUAL', code_id: null,
    tcnp_code: null, tcnp_name_th: '', tcnp_name_en: '', note_template: '', display_order: 1,
    is_required: false, allow_manual: true, is_active: true
  });

  const tcnpItem = (section, term) => ({
    id: ENRAdmin.makeId('TCNP'), section_code: section, source_type: 'TCNP',
    code_id: Number(term.code_id || term.id || 0) || null, tcnp_code: term.code,
    tcnp_name_th: term.name_th || '', tcnp_name_en: term.name_en || '',
    note_template: term.name_th || term.name_en || '', display_order: 1,
    is_required: false, allow_manual: true, is_active: true
  });

  const setNotice = (message, kind = '') => {
    const box = $('builderNotice');
    box.hidden = !message;
    box.className = `admin-alert ${kind ? `admin-alert--${kind}` : ''}`;
    box.innerHTML = message || '';
  };

  const markDirty = () => {
    if (readOnly) return;
    dirty = true;
    $('saveState').textContent = 'มีการแก้ไขที่ยังไม่บันทึก';
    $('saveState').className = 'admin-pill admin-pill--amber';
  };

  const normalizeOrders = () => {
    SECTIONS.forEach(section => current.items.filter(i => i.section_code === section).forEach((i, idx) => i.display_order = idx + 1));
  };

  const normalizeClinicalText = value => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('th-TH');

  const cleanCanonicalFocusDuplicates = ({ announce = false } = {}) => {
    const focusCode = String(current.focus_code || '').trim().toUpperCase();
    const focusText = normalizeClinicalText(current.focus_text);
    const before = current.items.length;

    current.items = current.items.filter(item => {
      if (String(item.section_code || '').toUpperCase() !== 'F' || item.is_active === false) return true;

      const itemCode = String(item.tcnp_code || '').trim().toUpperCase();
      const itemText = normalizeClinicalText(item.note_template || item.default_text || item.tcnp_name_th);

      if (focusCode && itemCode && itemCode === focusCode) return false;
      if (!itemCode && focusText && itemText === focusText) return false;
      return true;
    });

    const removed = before - current.items.length;
    if (removed > 0 && announce) {
      setNotice(`นำ Focus ที่ซ้ำกับ Focus หลักออก ${removed} รายการแล้ว • Focus หลักด้านบนเป็นค่ามาตรฐานเพียงแหล่งเดียว`, 'info');
    }
    return removed;
  };

  const populateWards = async () => {
    wards = await ENR.api.getOrgUnits();
    $('templateWard').innerHTML = '<option value="">— เลือก Ward —</option>' + wards.map(w => `<option value="${ENRAdmin.escape(w.id)}">${ENRAdmin.escape(w.code)} • ${ENRAdmin.escape(w.name)}</option>`).join('');
  };

  const collect = () => {
    current.code = $('templateCode').value.trim().toUpperCase();
    current.name_th = $('templateName').value.trim();
    current.description = $('templateDescription').value.trim();
    current.version = Math.max(1, Number($('templateVersion').value || 1));
    current.scope_type = $('templateScope').value;
    current.org_unit_id = current.scope_type === 'WARD' ? (Number($('templateWard').value) || null) : null;
    current.org_unit_code = current.scope_type === 'WARD' ? (wards.find(w => Number(w.id) === current.org_unit_id)?.code || '') : '';
    current.focus_code = $('focusCode').value.trim();
    current.focus_text = $('focusText').value.trim();
    if (!readOnly) cleanCanonicalFocusDuplicates();
    normalizeOrders();
  };

  const fillMeta = () => {
    $('templateCode').value = current.code || '';
    $('templateName').value = current.name_th || '';
    $('templateDescription').value = current.description || '';
    $('templateVersion').value = current.version || 1;
    $('templateScope').value = current.scope_type || 'HOSPITAL';
    $('templateWard').disabled = (current.scope_type || 'HOSPITAL') !== 'WARD' || readOnly;
    $('templateWard').value = current.org_unit_id || '';
    $('templateStatus').value = current.status || 'DRAFT';
    $('focusCode').value = current.focus_code || '';
    $('focusText').value = current.focus_text || '';
    $('pageTitle').textContent = current.id ? `${current.code} • ${current.name_th}` : 'สร้าง Nursing Template';
    $('pageSubtitle').textContent = current.id ? `PostgreSQL ID ${current.id} • v${current.version || 1} • ${current.status}` : 'Template ใหม่จะเริ่มต้นเป็น DRAFT';
    $('saveState').textContent = current.id ? `${current.status} • โหลดจาก PostgreSQL` : 'Template ใหม่ • ยังไม่ได้บันทึก';
    $('saveState').className = `admin-pill ${current.status === 'ACTIVE' ? 'admin-status-ACTIVE' : current.status === 'RETIRED' ? 'admin-status-RETIRED' : 'admin-pill--amber'}`;
    $('duplicateBtn').hidden = !current.id;
    $('editVersionBtn').hidden = !current.id || current.status === 'DRAFT';
    $('retireBtn').hidden = !current.id || current.status !== 'ACTIVE';
  };

  const itemCard = item => {
    const isTCNP = item.source_type === 'TCNP' || item.code_id || item.tcnp_code;
    return `<article class="admin-item-card" data-item-id="${ENRAdmin.escape(item.id)}">
      <div class="admin-item-card__head">
        <div>${isTCNP ? `<span class="admin-pill admin-pill--teal">TCNP</span> <strong>[${ENRAdmin.escape(item.tcnp_code || '')}] ${ENRAdmin.escape(item.tcnp_name_th || '')}</strong>` : '<span class="admin-pill">MANUAL</span> <strong>ข้อความกำหนดเอง</strong>'}</div>
        <div class="admin-item-controls"><button class="admin-icon-btn" data-up title="เลื่อนขึ้น">↑</button><button class="admin-icon-btn" data-down title="เลื่อนลง">↓</button>${isTCNP ? '<button class="admin-btn admin-btn--sm" data-change-tcnp>เปลี่ยน TCNP</button>' : ''}<button class="admin-btn admin-btn--danger admin-btn--sm" data-remove>นำออก</button></div>
      </div>
      <label class="admin-field"><span>Default text</span><textarea rows="2" data-default-text placeholder="ข้อความตั้งต้นที่พยาบาลแก้ไขได้ก่อนบันทึก">${ENRAdmin.escape(item.note_template || '')}</textarea></label>
      <div class="admin-item-options"><label><input type="checkbox" data-required ${item.is_required ? 'checked' : ''}> Required</label><label><input type="checkbox" data-allow-manual ${item.allow_manual !== false ? 'checked' : ''}> Allow manual</label><label><input type="checkbox" data-active ${item.is_active !== false ? 'checked' : ''}> Active</label></div>
    </article>`;
  };

  const renderBuilder = () => {
    $('builderSections').innerHTML = SECTIONS.map(section => {
      const items = current.items.filter(i => i.section_code === section);
      const [label, sub] = LABELS[section];
      return `<section class="admin-section admin-section-${section.replace('_','-')}">
        <header class="admin-section__head"><div><strong>${label}</strong><span>${sub}</span></div><div class="admin-section__actions"><button class="admin-btn admin-btn--sm" data-add-manual="${section}">＋ Manual</button><button class="admin-btn admin-btn--sm" data-add-tcnp="${section}">⌕ TCNP</button></div></header>
        <div class="admin-section__body">${items.length ? items.map(itemCard).join('') : '<div class="admin-empty admin-empty--compact">ยังไม่มีรายการ</div>'}</div>
      </section>`;
    }).join('');

    document.querySelectorAll('[data-add-manual]').forEach(btn => btn.onclick = () => { current.items.push(manualItem(btn.dataset.addManual)); renderBuilder(); markDirty(); });
    document.querySelectorAll('[data-add-tcnp]').forEach(btn => btn.onclick = () => openTCNP({ section: btn.dataset.addTcnp, mode: 'add' }));
    document.querySelectorAll('.admin-item-card').forEach(card => {
      const item = current.items.find(i => String(i.id) === card.dataset.itemId);
      if (!item) return;
      card.querySelector('[data-default-text]').oninput = e => { item.note_template = e.target.value; markDirty(); };
      card.querySelector('[data-required]').onchange = e => { item.is_required = e.target.checked; markDirty(); };
      card.querySelector('[data-allow-manual]').onchange = e => { item.allow_manual = e.target.checked; markDirty(); };
      card.querySelector('[data-active]').onchange = e => { item.is_active = e.target.checked; markDirty(); };
      card.querySelector('[data-remove]').onclick = () => { current.items = current.items.filter(i => i !== item); renderBuilder(); markDirty(); };
      card.querySelector('[data-change-tcnp]')?.addEventListener('click', () => openTCNP({ section: item.section_code, mode: 'replace', item }));
      card.querySelector('[data-up]').onclick = () => move(item, -1);
      card.querySelector('[data-down]').onclick = () => move(item, 1);
    });
    applyReadOnly();
  };

  const move = (item, delta) => {
    const same = current.items.filter(i => i.section_code === item.section_code);
    const at = same.indexOf(item); const other = same[at + delta];
    if (!other) return;
    const a = current.items.indexOf(item), b = current.items.indexOf(other);
    [current.items[a], current.items[b]] = [current.items[b], current.items[a]];
    renderBuilder(); markDirty();
  };

  const applyReadOnly = () => {
    document.querySelectorAll('main input, main select, main textarea, main button').forEach(el => {
      if (['duplicateBtn', 'previewBtn', 'editVersionBtn', 'retireBtn'].includes(el.id)) return;
      el.disabled = readOnly;
    });
    $('templateWard').disabled = readOnly || $('templateScope').value !== 'WARD';

    $('saveDraftBtn').hidden = readOnly;
    $('saveBottomBtn').hidden = readOnly;
    $('activateBtn').hidden = readOnly;

    if (readOnly) {
      const usedText = Number(current.usage_count || 0) > 0
        ? ` • มี Nursing Note อ้างอิง ${current.usage_count} รายการ`
        : '';
      setNotice(
        `<strong>Nursing Admin สามารถแก้ Template นี้ได้</strong>${usedText}<br>` +
        `เพื่อไม่เปลี่ยนเอกสารย้อนหลัง ระบบจะสร้าง <strong>DRAFT v${Math.max(1, Number(current.version || 1) + 1)}</strong> ให้อัตโนมัติเมื่อกด “แก้ไข Template”`,
        'info'
      );
    }
  };

  const validate = () => {
    collect();
    if (!current.code || !current.name_th) throw new Error('กรุณาระบุ Template Code และ Template Name');
    if (current.scope_type === 'WARD' && !current.org_unit_id) throw new Error('กรุณาเลือก Ward');
    if (!current.focus_code && !current.focus_text && !current.items.some(i => i.section_code === 'F' && i.is_active !== false)) throw new Error('กรุณากำหนด Focus อย่างน้อย 1 รายการ');
  };

  const save = async status => {
    if (readOnly) return;
    try {
      cleanCanonicalFocusDuplicates({ announce: true });
      validate();
      current.status = status || 'DRAFT';
      const saved = await ENR.api.adminSaveTemplate(current);
      current = ENRAdmin.clone(saved);
      dirty = false;
      readOnly = current.status !== 'DRAFT';
      fillMeta(); renderBuilder();
      ENR.toast?.(current.status === 'ACTIVE' ? 'บันทึกและเปิดใช้ Template แล้ว' : 'บันทึก Draft แล้ว');
      history.replaceState(null, '', `admin/template-builder.html?id=${encodeURIComponent(current.id)}`);
    } catch (error) {
      alert(`บันทึก Template ไม่สำเร็จ: ${ENRAdmin.apiError(error)}`);
    }
  };

  const editAsNewVersion = async () => {
    if (!current.id) return;
    try {
      const sourceId = current.id;
      const sourceVersion = current.version || 1;
      const next = await ENR.api.adminCreateTemplateVersion(sourceId);
      current = ENRAdmin.clone(next);
      cleanCanonicalFocusDuplicates();
      readOnly = false;
      dirty = false;
      fillMeta();
      renderBuilder();
      history.replaceState(null, '', `admin/template-builder.html?id=${encodeURIComponent(current.id)}`);
      setNotice(
        `<strong>สร้าง DRAFT v${ENRAdmin.escape(current.version || sourceVersion + 1)} สำหรับแก้ไขแล้ว</strong><br>` +
        `ต้นฉบับเดิมยังไม่เปลี่ยน เมื่อ Save & Activate เวอร์ชันใหม่นี้ ระบบจะ Retire เวอร์ชัน ACTIVE เดิมอัตโนมัติ`,
        'info'
      );
    } catch (error) {
      alert(`สร้างเวอร์ชันแก้ไขไม่สำเร็จ: ${ENRAdmin.apiError(error)}`);
    }
  };

  const duplicate = () => {
    collect();
    const copy = ENRAdmin.clone(current);
    copy.id = null;
    copy.parent_template_id = null;
    copy.code = `${String(copy.code || 'TPL').replace(/-V\d+$/i, '')}-COPY`;
    copy.name_th = `${copy.name_th || 'Template'} (สำเนา)`;
    copy.version = 1;
    copy.status = 'DRAFT';
    copy.created_at = null; copy.updated_at = null;
    copy.items = copy.items.map(item => ({ ...item, id: ENRAdmin.makeId(item.source_type || 'ITEM') }));
    current = copy; readOnly = false; dirty = true;
    cleanCanonicalFocusDuplicates();
    fillMeta(); renderBuilder(); markDirty();
    setNotice('สร้างสำเนาเป็น <strong>DRAFT ใหม่</strong> แล้ว กรุณาตรวจ Template Code ก่อนบันทึก เพื่อไม่แก้ทับ Template ที่เคยใช้งาน', 'info');
  };

  const retire = async () => {
    if (!current.id || !confirm(`Retire ${current.code} หรือไม่?`)) return;
    readOnly = false;
    await save('RETIRED');
  };

  const preview = () => {
    collect(); normalizeOrders();
    if (!readOnly) cleanCanonicalFocusDuplicates();
    $('previewBody').innerHTML = `<div class="admin-preview__title"><h2>${ENRAdmin.escape(current.code || 'NEW')} • ${ENRAdmin.escape(current.name_th || 'Template')}</h2><p>${ENRAdmin.escape(current.description || '')}</p><div><span class="admin-pill">v${ENRAdmin.escape(current.version)}</span> <span class="admin-pill admin-status-${ENRAdmin.escape(current.status)}">${ENRAdmin.escape(current.status)}</span></div></div>` + SECTIONS.map(section => {
      const rows = current.items.filter(i => i.section_code === section && i.is_active !== false);
      const canonicalFocus = section === 'F' && (current.focus_code || current.focus_text)
        ? `<li>${current.focus_code ? `<b>[${ENRAdmin.escape(current.focus_code)}]</b> ` : ''}${ENRAdmin.escape(current.focus_text || '')}</li>`
        : '';
      const itemRows = rows.map(i => `<li>${i.tcnp_code ? `<b>[${ENRAdmin.escape(i.tcnp_code)}]</b> ` : ''}${ENRAdmin.escape(i.note_template || i.tcnp_name_th || '(ไม่มี default text)')}</li>`).join('');
      const combined = `${canonicalFocus}${itemRows}`;
      return `<div class="admin-preview__section"><strong>${LABELS[section][0]}</strong>${combined ? `<ul>${combined}</ul>` : '<span>ยังไม่มีรายการ</span>'}</div>`;
    }).join('');
    $('previewModal').hidden = false;
  };

  const openTCNP = async target => {
    tcnpTarget = target; $('tcnpQuery').value = '';
    $('tcnpHint').textContent = target.section === 'F' ? 'Focus • ค้นหา F code' : `${target.section.replace('_', '-')} • ค้นหา P code`;
    $('tcnpModal').hidden = false; await searchTCNP(''); $('tcnpQuery').focus();
  };

  const searchTCNP = async query => {
    $('tcnpResults').innerHTML = '<div class="admin-empty">กำลังค้นหา...</div>';
    try {
      const results = await ENR.api.searchTCNP(query, tcnpTarget?.section || 'F');
      $('tcnpResults').innerHTML = results.length ? results.map((term, idx) => `<button class="admin-tcnp-row" data-index="${idx}"><div><strong>[${ENRAdmin.escape(term.code)}] ${ENRAdmin.escape(term.name_th || '-')}</strong><span>${ENRAdmin.escape(term.name_en || '')}</span></div><span class="admin-pill admin-pill--teal">${ENRAdmin.escape(term.code_type || '')}</span></button>`).join('') : '<div class="admin-empty">ไม่พบรหัส TCNP</div>';
      $('tcnpResults').querySelectorAll('[data-index]').forEach(btn => btn.onclick = () => {
        const term = results[Number(btn.dataset.index)];
        if (tcnpTarget.mode === 'focus') {
          current.focus_code = term.code;
          current.focus_text = term.name_th || term.name_en || '';
          cleanCanonicalFocusDuplicates();
          fillMeta(); renderBuilder(); markDirty();
        }
        else if (tcnpTarget.mode === 'replace') {
          if (
            tcnpTarget.item.section_code === 'F' &&
            String(term.code || '').toUpperCase() === String(current.focus_code || '').toUpperCase()
          ) {
            setNotice('รหัสนี้เป็น Focus หลักของ Template อยู่แล้ว จึงไม่เพิ่มซ้ำใน F items', 'info');
          } else {
            Object.assign(tcnpTarget.item, tcnpItem(tcnpTarget.item.section_code, term), { id: tcnpTarget.item.id, note_template: tcnpTarget.item.note_template || term.name_th || term.name_en || '' });
            renderBuilder(); markDirty();
          }
        }
        else {
          if (
            tcnpTarget.section === 'F' &&
            String(term.code || '').toUpperCase() === String(current.focus_code || '').toUpperCase()
          ) {
            setNotice('รหัสนี้เป็น Focus หลักของ Template อยู่แล้ว จึงไม่เพิ่มซ้ำใน F items', 'info');
          } else {
            current.items.push(tcnpItem(tcnpTarget.section, term)); renderBuilder(); markDirty();
          }
        }
        $('tcnpModal').hidden = true;
      });
    } catch (error) {
      $('tcnpResults').innerHTML = `<div class="admin-alert admin-alert--danger">${ENRAdmin.escape(ENRAdmin.apiError(error))}</div>`;
    }
  };

  await populateWards();
  if (editId) {
    try {
      current = await ENR.api.adminGetTemplate(editId);
      current = ENRAdmin.clone(current);
      readOnly = current.status !== 'DRAFT';
    } catch (error) {
      setNotice(`<strong>โหลด Template ไม่สำเร็จ</strong><br>${ENRAdmin.escape(ENRAdmin.apiError(error))}`, 'danger');
      current = fresh();
    }
  } else current = fresh();
  fillMeta(); renderBuilder();

  ['templateCode','templateName','templateDescription','templateVersion','focusText'].forEach(id => $(id).addEventListener('input', markDirty));
  $('templateScope').onchange = () => { $('templateWard').disabled = $('templateScope').value !== 'WARD'; markDirty(); };
  $('templateWard').onchange = markDirty;
  $('focusSearchBtn').onclick = () => openTCNP({ section: 'F', mode: 'focus' });
  $('saveDraftBtn').onclick = () => save('DRAFT'); $('saveBottomBtn').onclick = () => save('DRAFT'); $('activateBtn').onclick = () => save('ACTIVE');
  $('editVersionBtn').onclick = editAsNewVersion;
  $('duplicateBtn').onclick = duplicate; $('retireBtn').onclick = retire; $('previewBtn').onclick = preview;
  $('tcnpQuery').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchTCNP($('tcnpQuery').value), 250); };
  document.querySelectorAll('[data-close-modal]').forEach(el => el.onclick = () => $('tcnpModal').hidden = true);
  document.querySelectorAll('[data-close-preview]').forEach(el => el.onclick = () => $('previewModal').hidden = true);

  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault(); event.returnValue = '';
  });
});
