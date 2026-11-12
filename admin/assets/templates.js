// CP6.14-FULL-TEMPLATE-MANAGEMENT
document.addEventListener('DOMContentLoaded', async () => {
  ENRAdmin.bindChrome();
  const session = await ENRAdmin.guard();
  if (!session) return;

  const $ = id => document.getElementById(id);
  let all = [];
  let timer = null;

  const updateStats = () => {
    $('statAll').textContent = all.length;
    $('statDraft').textContent = all.filter(x => x.status === 'DRAFT').length;
    $('statActive').textContent = all.filter(x => x.status === 'ACTIVE').length;
    $('statRetired').textContent = all.filter(x => x.status === 'RETIRED').length;
  };

  const render = () => {
    const status = $('statusFilter').value;
    const rows = all.filter(x => !status || x.status === status);
    if (!rows.length) {
      $('templateList').innerHTML = '<div class="admin-empty">ไม่พบ Nursing Template ตามเงื่อนไข</div>';
      return;
    }
    $('templateList').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Template</th><th>Focus</th><th>Scope</th><th>Version</th><th>Status</th><th>Updated</th><th></th></tr></thead>
        <tbody>${rows.map(t => `
          <tr>
            <td><div class="admin-table__code">${ENRAdmin.escape(t.code)}</div><div class="admin-table__name">${ENRAdmin.escape(t.name_th || '-')}</div><div class="admin-table__sub">${ENRAdmin.escape(t.description || '')}</div></td>
            <td>${t.focus_code ? `<span class="admin-code-chip">${ENRAdmin.escape(t.focus_code)}</span> ${ENRAdmin.escape(t.focus_text || '')}` : ENRAdmin.escape(t.focus_text || '-')}</td>
            <td>${ENRAdmin.escape(t.scope_type || 'HOSPITAL')}${t.org_unit_name ? `<div class="admin-table__sub">${ENRAdmin.escape(t.org_unit_name)}</div>` : ''}</td>
            <td>v${ENRAdmin.escape(t.version || 1)}<div class="admin-table__sub">${(t.items || []).filter(i => i.is_active !== false).length} items${Number(t.usage_count || 0) > 0 ? ` • ใช้งานแล้ว ${ENRAdmin.escape(t.usage_count)}` : ''}</div></td>
            <td><span class="admin-pill admin-status-${ENRAdmin.escape(t.status || 'DRAFT')}">${ENRAdmin.escape(t.status || 'DRAFT')}</span></td>
            <td>${ENRAdmin.escape(ENRAdmin.formatDate(t.updated_at))}</td>
            <td class="admin-table__actions"><a class="admin-btn admin-btn--sm" href="admin/template-builder.html?id=${encodeURIComponent(t.id)}">✎ แก้ไข</a></td>
          </tr>`).join('')}</tbody>
      </table>`;
  };

  const load = async () => {
    $('templateList').innerHTML = '<div class="admin-empty">กำลังโหลด Template จาก PostgreSQL...</div>';
    try {
      all = await ENR.api.adminListTemplates($('templateSearch').value.trim());
      updateStats();
      render();
    } catch (error) {
      $('templateList').innerHTML = `<div class="admin-alert admin-alert--danger"><strong>โหลด Template ไม่สำเร็จ</strong><br>${ENRAdmin.escape(ENRAdmin.apiError(error))}</div>`;
    }
  };

  $('templateSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  $('statusFilter').addEventListener('change', render);
  $('refreshBtn').addEventListener('click', load);
  await load();
});
