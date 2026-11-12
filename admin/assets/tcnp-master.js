document.addEventListener('DOMContentLoaded', async () => {
  ENRAdmin.bindChrome();
  const session = await ENRAdmin.guard();
  if (!session) return;
  const $ = id => document.getElementById(id);
  let timer = null;

  const search = async () => {
    const q = $('tcnpSearch').value.trim();
    if (!q) { $('tcnpTable').innerHTML = '<div class="admin-empty">พิมพ์คำค้นเพื่อค้นหา TCNP</div>'; return; }
    $('tcnpTable').innerHTML = '<div class="admin-empty">กำลังค้นหา...</div>';
    try {
      const rows = await ENR.api.searchTCNP(q, $('sectionFilter').value);
      $('tcnpTable').innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>Code</th><th>ชื่อภาษาไทย</th><th>English / preferred term</th><th>Type</th><th>Version</th></tr></thead><tbody>${rows.map(r => `<tr><td><span class="admin-code-chip">${ENRAdmin.escape(r.code)}</span></td><td><strong>${ENRAdmin.escape(r.name_th || '-')}</strong></td><td>${ENRAdmin.escape(r.name_en || '-')}</td><td>${ENRAdmin.escape(r.code_type || '-')}</td><td>${ENRAdmin.escape(r.version || '-')}</td></tr>`).join('')}</tbody></table>` : '<div class="admin-empty">ไม่พบรหัส TCNP</div>';
    } catch (error) {
      $('tcnpTable').innerHTML = `<div class="admin-alert admin-alert--danger">${ENRAdmin.escape(ENRAdmin.apiError(error))}</div>`;
    }
  };
  $('tcnpSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(search, 250); };
  $('sectionFilter').onchange = search;
});
