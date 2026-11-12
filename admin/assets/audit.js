(() => {
  const PAGE_SIZE = 100;
  let offset = 0;
  let total = 0;
  let currentEvents = [];

  const $ = (id) => document.getElementById(id);
  const esc = (v) => ENRAdmin.escape(v ?? '');
  const fmt = (v) => v ? ENRAdmin.formatDate(v) : '-';

  const actionThai = {
    CREATE: 'สร้างบันทึก', UPDATE: 'แก้ไข Draft', ADD_ITEM: 'เพิ่มรายการ', EDIT_ITEM: 'แก้รายการ',
    SIGN: 'ลงนาม', CANCEL: 'ยกเลิกบันทึก', DELETE_BLOCKED: 'ป้องกันการลบ',
    ADD_ADDENDUM: 'บันทึกเพิ่มเติม', ADD_AMENDMENT: 'บันทึกแก้ไข', CANCEL_AMENDMENT: 'ยกเลิกบันทึกหลังลงนาม'
  };

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok || data?.ok === false) {
      const e = new Error(data?.error || `HTTP ${r.status}`);
      e.status = r.status; e.code = data?.code; throw e;
    }
    return data || {};
  }

  function isoDate(d) { return d.toISOString().slice(0,10); }
  function setDefaultDates() {
    const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29);
    $('fromDate').value = isoDate(from); $('toDate').value = isoDate(to);
  }

  function params() {
    const p = new URLSearchParams();
    const add = (k,v) => { if (String(v ?? '').trim()) p.set(k, String(v).trim()); };
    add('from', $('fromDate').value); add('to', $('toDate').value); add('user_id', $('userFilter').value);
    add('action', $('actionFilter').value); add('entity_type', $('entityFilter').value); add('note_id', $('noteFilter').value);
    add('encounter_id', $('encounterFilter').value); add('search', $('searchFilter').value); add('limit', PAGE_SIZE); add('offset', offset);
    return p;
  }

  async function loadMeta() {
    const data = await api('/api/admin/audit/meta');
    const users = Array.isArray(data.users) ? data.users : [];
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const entities = Array.isArray(data.entity_types) ? data.entity_types : [];
    $('userFilter').innerHTML = '<option value="">ทุกคน</option>' + users.map(u => `<option value="${esc(u.id)}">${esc(u.display_name || u.username)} (${esc(u.username)})</option>`).join('');
    $('actionFilter').innerHTML = '<option value="">ทุก Action</option>' + actions.map(a => `<option value="${esc(a)}">${esc(a)}${actionThai[a] ? ' • '+esc(actionThai[a]) : ''}</option>`).join('');
    $('entityFilter').innerHTML = '<option value="">ทุก Entity</option>' + entities.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
  }

  function renderStats(rows) {
    $('statEvents').textContent = total.toLocaleString();
    $('statUsers').textContent = new Set(rows.map(x => x.user_id).filter(Boolean)).size.toLocaleString();
    $('statNotes').textContent = new Set(rows.map(x => x.note_id).filter(Boolean)).size.toLocaleString();
    const critical = rows.filter(x => ['SIGN','CANCEL','ADD_ADDENDUM','ADD_AMENDMENT','CANCEL_AMENDMENT'].includes(String(x.action))).length;
    $('statCritical').textContent = critical.toLocaleString();
  }

  function renderRows(rows) {
    const body = $('auditRows'); $('auditEmpty').hidden = rows.length > 0;
    body.innerHTML = rows.map((x, i) => {
      const patient = [x.hn ? `HN ${x.hn}` : '', x.an ? `AN ${x.an}` : ''].filter(Boolean).join(' • ');
      const note = x.note_id ? `Note #${x.note_id}` : `${x.entity_type || ''} #${x.entity_id || ''}`;
      return `<tr>
        <td><div class="audit-time">${esc(fmt(x.event_at))}</div><div class="audit-sub">Audit #${esc(x.audit_id)}</div></td>
        <td class="audit-user"><strong>${esc(x.user_name || x.username || '-')}</strong><div class="audit-sub">${esc(x.username || '')}${x.unit_name ? ' • '+esc(x.unit_name) : ''}</div></td>
        <td><span class="audit-action audit-action--${esc(x.action)}">${esc(x.action || '-')}</span><div class="audit-sub">${esc(actionThai[x.action] || '')}</div></td>
        <td class="audit-doc"><strong>${esc(note)}</strong><div class="audit-sub">${esc(patient || x.patient_name || '-')}</div>${x.patient_name ? `<div class="audit-sub">${esc(x.patient_name)}</div>` : ''}</td>
        <td><div class="audit-desc">${esc(x.description || '-')}</div><div class="audit-sub">${esc(x.entity_type || '')}${x.entity_id ? ' • ID '+esc(x.entity_id) : ''}</div></td>
        <td><button class="admin-btn admin-btn--sm" data-detail="${i}">รายละเอียด</button></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-detail]').forEach(btn => btn.addEventListener('click', () => openDetail(rows[Number(btn.dataset.detail)])));
  }

  function openDetail(x) {
    $('modalTitle').textContent = `${x.action || 'AUDIT'} • Audit #${x.audit_id}`;
    $('modalSubtitle').textContent = `${fmt(x.event_at)} • ${x.user_name || x.username || '-'}`;
    const cards = [
      ['Note ID', x.note_id ? `#${x.note_id}` : '-'], ['Encounter ID', x.encounter_id || '-'], ['HN / AN', [x.hn,x.an].filter(Boolean).join(' / ') || '-'],
      ['ผู้ป่วย', x.patient_name || '-'], ['หน่วยงาน', [x.unit_code,x.unit_name].filter(Boolean).join(' • ') || '-'], ['Entity', `${x.entity_type || '-'} / ${x.entity_id || '-'}`],
      ['IP address', x.ip_address || '-'], ['Username', x.username || '-'], ['User agent', x.user_agent || '-']
    ];
    $('modalBody').innerHTML = `<div class="audit-detail-grid">${cards.map(([k,v]) => `<div class="audit-detail-card"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
      <div><strong>รายละเอียดเหตุการณ์</strong><div class="audit-description-full">${esc(x.description || '-')}</div></div>
      <div><strong>Metadata (JSON)</strong><pre class="audit-json">${esc(JSON.stringify(x.metadata || {}, null, 2))}</pre></div>`;
    $('auditModal').hidden = false;
  }

  function closeModal() { $('auditModal').hidden = true; }

  async function loadEvents(reset = false) {
    if (reset) offset = 0;
    $('auditError').hidden = true; $('searchBtn').disabled = true; $('searchBtn').textContent = 'กำลังโหลด...';
    try {
      const data = await api(`/api/admin/audit/events?${params().toString()}`);
      currentEvents = Array.isArray(data.events) ? data.events : []; total = Number(data.total || 0);
      renderRows(currentEvents); renderStats(currentEvents);
      const first = total ? offset + 1 : 0; const last = Math.min(offset + currentEvents.length, total);
      $('resultCaption').textContent = total ? `แสดง ${first.toLocaleString()}–${last.toLocaleString()} จาก ${total.toLocaleString()} events` : 'ไม่พบข้อมูล';
      $('pageLabel').textContent = `หน้า ${Math.floor(offset/PAGE_SIZE)+1}`;
      $('prevBtn').disabled = offset <= 0; $('nextBtn').disabled = offset + PAGE_SIZE >= total;
    } catch (error) {
      $('auditError').hidden = false;
      $('auditError').innerHTML = `<strong>โหลด Audit Trail ไม่สำเร็จ</strong><br>${esc(ENRAdmin.apiError(error, error.message))}`;
      renderRows([]); total = 0; renderStats([]);
    } finally { $('searchBtn').disabled = false; $('searchBtn').textContent = 'แสดง Audit Trail'; }
  }

  function resetFilters() {
    setDefaultDates(); $('userFilter').value=''; $('actionFilter').value=''; $('entityFilter').value=''; $('noteFilter').value=''; $('encounterFilter').value=''; $('searchFilter').value='';
    document.querySelectorAll('#quickActions button').forEach(b => b.classList.toggle('is-active', b.dataset.action === ''));
    loadEvents(true);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    ENRAdmin.bindChrome();
    const session = await ENRAdmin.guard(); if (!session) return;
    setDefaultDates();
    const noteFromUrl = new URLSearchParams(location.search).get('noteId'); if (/^\d+$/.test(noteFromUrl || '')) $('noteFilter').value = noteFromUrl;
    document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
    $('searchBtn').addEventListener('click', () => loadEvents(true)); $('resetBtn').addEventListener('click', resetFilters);
    $('prevBtn').addEventListener('click', () => { offset = Math.max(0, offset-PAGE_SIZE); loadEvents(false); });
    $('nextBtn').addEventListener('click', () => { if (offset+PAGE_SIZE < total) { offset += PAGE_SIZE; loadEvents(false); } });
    $('searchFilter').addEventListener('keydown', e => { if (e.key === 'Enter') loadEvents(true); });
    document.querySelectorAll('#quickActions button').forEach(btn => btn.addEventListener('click', () => {
      $('actionFilter').value = btn.dataset.action || '';
      document.querySelectorAll('#quickActions button').forEach(b => b.classList.toggle('is-active', b === btn));
      loadEvents(true);
    }));
    try { await api('/api/admin/audit/ping'); await loadMeta(); await loadEvents(true); }
    catch (error) { $('auditError').hidden=false; $('auditError').innerHTML=`<strong>Audit API ยังไม่พร้อม</strong><br>${esc(error.message)}`; }
  });
})();
