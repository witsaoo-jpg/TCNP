document.addEventListener('DOMContentLoaded', async () => {
  const session = ENR.requireSession();
  if (!session) return;
  if (session.role !== 'ADMIN') {
    alert('หน้านี้สำหรับพยาบาล Admin เท่านั้น');
    location.href = 'ward.html';
    return;
  }

  document.getElementById('adminUser').textContent = session.displayName || session.username || 'Admin';
  document.getElementById('backWardBtn').onclick = () => location.href = 'ward.html';
  document.getElementById('logoutBtn').onclick = async () => {
    try { await ENR.api.logout(); } catch (_) {}
    ENR.clearSession();
    location.href = 'login.html';
  };

  const SECTIONS = ['F','A_S','A_O','G','I','E'];
  const SECTION_LABELS = {F:'F — Focus',A_S:'A-S — Subjective',A_O:'A-O — Objective',G:'G — Goal',I:'I — Intervention',E:'E — Evaluation'};
  let templates = [];
  let current = null;
  let selectedCode = null;
  let dirty = false;
  let tcnpTarget = null;
  let searchTimer = null;
  let adminWards = [];

  const $ = id => document.getElementById(id);
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const makeId = () => `TMPITEM-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  function newTemplate() {
    return {
      id: null, code: '', name_th: '', name_en: '', description: '', version: 1,
      scope_type: 'HOSPITAL', org_unit_id: null, org_unit_code: '', status: 'DRAFT',
      focus_code: '', focus_text: '', items: []
    };
  }

  function makeManual(section) {
    return { id: makeId(), section_code: section, source_type: 'MANUAL', tcnp_code: null, tcnp_name_th: '', tcnp_name_en: '', note_template: '', display_order: 1, is_required: false, allow_manual: true, is_active: true };
  }

  function makeTCNP(section, term) {
    return {
      id: makeId(),
      section_code: section,
      source_type: 'TCNP',
      code_id: Number(term.code_id ?? term.id ?? 0) || null,
      tcnp_code: term.code,
      tcnp_name_th: term.name_th || '',
      tcnp_name_en: term.name_en || '',
      note_template: term.name_th || term.name_en || '',
      display_order: 1,
      is_required: false,
      allow_manual: true,
      is_active: true
    };
  }

  function normalizeOrders() {
    SECTIONS.forEach(section => {
      current.items.filter(x => x.section_code === section).forEach((item, index) => item.display_order = index + 1);
    });
  }

  function markDirty() {
    dirty = true;
    $('templateSaveState').textContent = 'มีการแก้ไขที่ยังไม่บันทึก';
    $('templateSaveState').className = 'enr-badge enr-badge--amber';
  }

  async function refreshTemplates() {
    templates = await ENR.api.adminListTemplates($('templateListSearch').value || '');
    renderTemplateList();
  }

  function renderTemplateList() {
    const statusFilter = $('templateStatusFilter').value;
    const list = templates.filter(t => !statusFilter || t.status === statusFilter);
    $('templateList').innerHTML = list.length ? list.map(t => `
      <button class="template-list-item ${selectedCode === t.code ? 'is-active' : ''}" data-code="${ENR.escape(t.code)}">
        <div class="template-list-item__top">
          <span class="template-list-item__code">${ENR.escape(t.code)}</span>
          <span class="enr-badge status-${ENR.escape(t.status || 'DRAFT')}">${ENR.escape(t.status || 'DRAFT')}</span>
        </div>
        <div class="template-list-item__name">${ENR.escape(t.name_th || '-')}</div>
        <div class="template-list-item__meta">v${ENR.escape(t.version || 1)} • ${ENR.escape(t.scope_type || 'HOSPITAL')} • ${(t.items || []).length} items</div>
      </button>`).join('') : '<div class="enr-empty">ไม่พบ Template</div>';

    $('templateList').querySelectorAll('[data-code]').forEach(button => {
      button.onclick = () => loadTemplate(button.dataset.code);
    });
  }

  async function populateWardOptions() {
    try {
      adminWards = await ENR.api.getOrgUnits();
      $('templateWard').innerHTML =
        '<option value="">— เลือก Ward —</option>' +
        adminWards.map(ward => `
          <option value="${ENR.escape(ward.code)}" data-org-unit-id="${ENR.escape(ward.id || '')}">
            ${ENR.escape(ward.code || ward.id || '-')} • ${ENR.escape(ward.name)}
          </option>`).join('');
    } catch (error) {
      adminWards = [];
      $('templateWard').innerHTML = '<option value="">โหลด Ward ไม่สำเร็จ</option>';
      ENR.toast(`โหลด Ward ไม่สำเร็จ: ${error.message}`);
    }
  }

  function renderMeta() {
    $('templateCode').value = current.code || '';
    $('templateCode').readOnly = Boolean(current.id);
    $('templateName').value = current.name_th || '';
    $('templateDescription').value = current.description || '';
    $('templateVersion').value = Number(current.version || 1);
    $('templateScope').value = current.scope_type || 'HOSPITAL';
    $('templateWard').value = current.org_unit_code || '';
    $('templateWard').disabled = $('templateScope').value !== 'WARD';
    $('templateStatus').value = current.status || 'DRAFT';
    $('templateFocusCode').value = current.focus_code || '';
    $('templateFocusText').value = current.focus_text || '';
    $('workspaceTitle').textContent = current.code ? `${current.code} • ${current.name_th || 'Template'}` : 'สร้าง Nursing Template';
    $('retireTemplateBtn').disabled = !current.code || current.status === 'RETIRED';
  }

  function renderBuilder() {
    normalizeOrders();
    $('builderSections').innerHTML = SECTIONS.map(section => {
      const rows = current.items.filter(item => item.section_code === section);
      return `<section class="admin-section" data-section="${section}">
        <div class="admin-section__head">
          <span>${SECTION_LABELS[section]}</span>
          <div class="admin-section__actions"><button class="enr-btn" data-add-manual="${section}">＋ Manual</button><button class="enr-btn" data-add-tcnp="${section}">🔎 TCNP</button></div>
        </div>
        <div class="admin-items" data-admin-items="${section}">
          ${rows.length ? rows.map((item,index) => itemHtml(item,index,rows.length)).join('') : '<div class="admin-empty">ยังไม่มีรายการในหัวข้อนี้</div>'}
        </div>
      </section>`;
    }).join('');

    bindBuilderEvents();
  }

  function itemHtml(item, index, total) {
    const id = ENR.escape(item.id);
    return `<div class="admin-item" data-item-id="${id}">
      <div class="admin-item__top">
        <div class="admin-item__identity">
          <span class="enr-badge ${item.source_type === 'TCNP' ? 'enr-badge--teal' : 'enr-badge--gray'}">${item.source_type}</span>
          ${item.tcnp_code ? `<b>[${ENR.escape(item.tcnp_code)}] ${ENR.escape(item.tcnp_name_th || '')}</b>` : '<b>ข้อความ Manual</b>'}
        </div>
        <div class="admin-item__tools">
          <button class="mini-btn" data-up ${index===0?'disabled':''}>↑</button>
          <button class="mini-btn" data-down ${index===total-1?'disabled':''}>↓</button>
          ${item.source_type === 'TCNP' ? '<button class="mini-btn" data-change-tcnp>เปลี่ยน TCNP</button>' : ''}
          <button class="mini-btn danger" data-remove>นำออก</button>
        </div>
      </div>
      <div class="admin-item__grid">
        <div class="enr-field"><label>Default text</label><textarea class="enr-textarea" data-default-text>${ENR.escape(item.note_template || '')}</textarea></div>
        <label class="admin-check"><input type="checkbox" data-required ${item.is_required?'checked':''}> Required</label>
        <label class="admin-check"><input type="checkbox" data-allow-manual ${item.allow_manual!==false?'checked':''}> Allow manual</label>
        <label class="admin-check"><input type="checkbox" data-active ${item.is_active!==false?'checked':''}> Active</label>
      </div>
    </div>`;
  }

  function bindBuilderEvents() {
    document.querySelectorAll('[data-add-manual]').forEach(btn => btn.onclick = () => { current.items.push(makeManual(btn.dataset.addManual)); renderBuilder(); markDirty(); });
    document.querySelectorAll('[data-add-tcnp]').forEach(btn => btn.onclick = () => openTCNP({ section: btn.dataset.addTcnp, mode: 'add' }));

    document.querySelectorAll('.admin-item').forEach(card => {
      const item = current.items.find(x => String(x.id) === String(card.dataset.itemId));
      if (!item) return;
      card.querySelector('[data-default-text]').oninput = e => { item.note_template = e.target.value; markDirty(); };
      card.querySelector('[data-required]').onchange = e => { item.is_required = e.target.checked; markDirty(); };
      card.querySelector('[data-allow-manual]').onchange = e => { item.allow_manual = e.target.checked; markDirty(); };
      card.querySelector('[data-active]').onchange = e => { item.is_active = e.target.checked; markDirty(); };
      card.querySelector('[data-remove]').onclick = () => { current.items = current.items.filter(x => x !== item); renderBuilder(); markDirty(); };
      card.querySelector('[data-change-tcnp]')?.addEventListener('click', () => openTCNP({ section: item.section_code, mode: 'replace', item }));
      card.querySelector('[data-up]').onclick = () => moveItem(item, -1);
      card.querySelector('[data-down]').onclick = () => moveItem(item, 1);
    });
  }

  function moveItem(item, delta) {
    const same = current.items.filter(x => x.section_code === item.section_code);
    const index = same.indexOf(item);
    const other = same[index + delta];
    if (!other) return;
    const a = current.items.indexOf(item), b = current.items.indexOf(other);
    [current.items[a], current.items[b]] = [current.items[b], current.items[a]];
    renderBuilder(); markDirty();
  }

  function loadTemplate(code) {
    if (dirty && !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการเปลี่ยน Template หรือไม่?')) return;
    const found = templates.find(t => t.code === code);
    if (!found) return;
    current = clone(found); selectedCode = code; dirty = false;
    renderMeta(); renderBuilder(); renderTemplateList();
    $('templateSaveState').textContent = `${current.status} • ข้อมูลจาก PostgreSQL`;
    $('templateSaveState').className = `enr-badge status-${current.status}`;
  }

  function startNew() {
    if (dirty && !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการสร้าง Template ใหม่หรือไม่?')) return;
    current = newTemplate(); selectedCode = null; dirty = false; renderMeta(); renderBuilder(); renderTemplateList();
    $('templateSaveState').textContent = 'Template ใหม่ • ยังไม่ได้บันทึก';
    $('templateSaveState').className = 'enr-badge enr-badge--amber';
  }

  function collectMeta() {
    current.code = $('templateCode').value.trim().toUpperCase();
    current.name_th = $('templateName').value.trim();
    current.description = $('templateDescription').value.trim();
    current.version = Math.max(1, Number($('templateVersion').value || 1));
    current.scope_type = $('templateScope').value;
    current.org_unit_code = current.scope_type === 'WARD' ? $('templateWard').value : '';
    const selectedWard = adminWards.find(ward => String(ward.code) === String(current.org_unit_code));
    current.org_unit_id = current.scope_type === 'WARD' ? (selectedWard?.id || null) : null;
    current.status = $('templateStatus').value;
    current.focus_code = $('templateFocusCode').value.trim();
    current.focus_text = $('templateFocusText').value.trim();
    normalizeOrders();
  }

  async function saveTemplate(forceStatus = null) {
    collectMeta();
    if (!current.code || !current.name_th) { alert('กรุณาระบุ Template Code และ Template Name'); return; }
    if (current.scope_type === 'WARD' && !current.org_unit_code) { alert('กรุณาเลือก Ward สำหรับ Template แบบ WARD'); return; }
    const focusItems = current.items.filter(x => x.section_code === 'F' && x.is_active !== false);
    if (!focusItems.length && !current.focus_code && !current.focus_text) { alert('กรุณากำหนด Focus อย่างน้อย 1 รายการ'); return; }
    if (forceStatus) current.status = forceStatus;
    const saved = await ENR.api.adminSaveTemplate(current);
    current = clone(saved); selectedCode = current.code; dirty = false;
    await refreshTemplates(); renderMeta(); renderBuilder();
    $('templateSaveState').textContent = `${current.status} • บันทึกแล้ว`;
    $('templateSaveState').className = `enr-badge status-${current.status}`;
    ENR.audit('ADMIN_SAVE_TEMPLATE', { template_code: current.code, status: current.status, item_count: current.items.length });
    ENR.toast(current.status === 'ACTIVE' ? 'บันทึกและเปิดใช้ Template แล้ว' : 'บันทึก Template แล้ว');
  }

  async function duplicateTemplate() {
    collectMeta();
    const copy = clone(current);
    copy.id = null; copy.code = `${copy.code || 'TPL'}-COPY`; copy.name_th = `${copy.name_th || 'Template'} (สำเนา)`; copy.status = 'DRAFT'; copy.version = 1;
    copy.items = copy.items.map(x => ({...x,id:makeId()}));
    current = copy; selectedCode = null; dirty = true; renderMeta(); renderBuilder(); renderTemplateList();
    $('templateSaveState').textContent = 'สำเนาใหม่ • ยังไม่ได้บันทึก'; $('templateSaveState').className = 'enr-badge enr-badge--amber';
  }

  async function retireTemplate() {
    if (!current.code || !confirm(`Retire Template ${current.code} หรือไม่?`)) return;
    await saveTemplate('RETIRED');
  }

  function previewTemplate() {
    collectMeta();
    const grouped = Object.fromEntries(SECTIONS.map(s => [s,current.items.filter(x => x.section_code === s && x.is_active !== false)]));
    $('templatePreviewBody').innerHTML = `<div class="preview-template-title"><h2>${ENR.escape(current.code || 'NEW')} • ${ENR.escape(current.name_th || 'Template')}</h2><div class="muted">${ENR.escape(current.description || '')}</div><div style="margin-top:8px"><span class="enr-badge status-${ENR.escape(current.status)}">${ENR.escape(current.status)}</span> <span class="enr-badge enr-badge--teal">v${ENR.escape(current.version)}</span></div></div>` + SECTIONS.map(section => `<div class="preview-section"><div class="preview-section__label">${section.replace('_','-')}</div><div>${grouped[section].length ? `<ul>${grouped[section].map(x => `<li>${x.tcnp_code?`<b>[${ENR.escape(x.tcnp_code)}]</b> `:''}${ENR.escape(x.note_template || x.tcnp_name_th || '(ไม่มี default text)')}</li>`).join('')}</ul>` : '<span class="muted">ไม่มีรายการ</span>'}</div></div>`).join('');
    $('templatePreviewModal').classList.add('is-open');
  }

  async function openTCNP(target) {
    tcnpTarget = target;
    $('tcnpAdminQuery').value = '';
    $('tcnpAdminHint').textContent = target.section === 'F' ? 'Focus • ค้นหา F code' : `${target.section.replace('_','-')} • ค้นหา P code`;
    $('tcnpAdminModal').classList.add('is-open');
    await renderTCNP(''); $('tcnpAdminQuery').focus();
  }

  async function renderTCNP(query) {
    $('tcnpAdminResults').innerHTML = '<div class="enr-empty">กำลังค้นหา TCNP...</div>';
    const results = await ENR.api.searchTCNP(query, tcnpTarget?.section || 'F');
    $('tcnpAdminResults').innerHTML = results.length ? results.map((term,index) => `<div class="tcnp-admin-result" data-index="${index}"><div class="tcnp-admin-result__top"><span>[${ENR.escape(term.code)}] ${ENR.escape(term.name_th || '-')}</span><span class="enr-badge enr-badge--teal">${ENR.escape(term.code_type)}</span></div><div class="tcnp-admin-result__en">${ENR.escape(term.name_en || '')}</div></div>`).join('') : '<div class="enr-empty">ไม่พบรหัส TCNP</div>';
    $('tcnpAdminResults').querySelectorAll('[data-index]').forEach((el,index) => el.onclick = () => {
      const term = results[index];
      if (tcnpTarget.mode === 'focus') { current.focus_code = term.code; current.focus_text = term.name_th || term.name_en || ''; renderMeta(); markDirty(); }
      else if (tcnpTarget.mode === 'replace') { Object.assign(tcnpTarget.item,{code_id:Number(term.code_id ?? term.id ?? 0)||null,tcnp_code:term.code,tcnp_name_th:term.name_th||'',tcnp_name_en:term.name_en||'',note_template:tcnpTarget.item.note_template || term.name_th || term.name_en || ''}); renderBuilder(); markDirty(); }
      else { current.items.push(makeTCNP(tcnpTarget.section,term)); renderBuilder(); markDirty(); }
      $('tcnpAdminModal').classList.remove('is-open');
    });
  }

  ['templateCode','templateName','templateDescription','templateVersion','templateFocusText'].forEach(id => $(id).addEventListener('input', markDirty));
  $('templateScope').onchange = () => { $('templateWard').disabled = $('templateScope').value !== 'WARD'; markDirty(); };
  $('templateWard').onchange = markDirty; $('templateStatus').onchange = markDirty;
  $('newTemplateBtn').onclick = startNew; $('saveTemplateBtn').onclick = () => saveTemplate(); $('saveDraftBottomBtn').onclick = () => saveTemplate('DRAFT'); $('activateTemplateBtn').onclick = () => saveTemplate('ACTIVE'); $('retireTemplateBtn').onclick = retireTemplate; $('duplicateTemplateBtn').onclick = duplicateTemplate; $('previewTemplateBtn').onclick = previewTemplate;
  $('pickFocusBtn').onclick = () => openTCNP({section:'F',mode:'focus'});
  $('templateListSearch').oninput = () => { clearTimeout(searchTimer); searchTimer=setTimeout(refreshTemplates,180); };
  $('templateStatusFilter').onchange = renderTemplateList;
  $('tcnpAdminQuery').oninput = () => { clearTimeout(searchTimer); searchTimer=setTimeout(()=>renderTCNP($('tcnpAdminQuery').value),250); };
  document.querySelectorAll('[data-close-tcnp-admin]').forEach(x => x.onclick = () => $('tcnpAdminModal').classList.remove('is-open'));
  document.querySelectorAll('[data-close-preview]').forEach(x => x.onclick = () => $('templatePreviewModal').classList.remove('is-open'));

  await populateWardOptions();
  await refreshTemplates();
  if (templates.length) loadTemplate(templates[0].code); else startNew();
});
