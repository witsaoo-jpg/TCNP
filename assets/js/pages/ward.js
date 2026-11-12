document.addEventListener('DOMContentLoaded', async () => {
  const appRoot = new URL('.', location.href).pathname;
  const session = ENR.requireSession();
  if (!session) return;

  document.getElementById('navUserName').textContent = session.displayName || session.username || 'ผู้ใช้งาน';
  // CP5.7 Nursing Analytics quick access
  const analyticsBtn = document.getElementById('analyticsBtn');
  if (analyticsBtn) {
    analyticsBtn.onclick = () => { location.href = `${appRoot}admin/analytics.html`; };
  }
  // /CP5.7


  const adminBtn = document.getElementById('adminBtn');
  const adminContext = JSON.stringify(session.serverContext || {}).toUpperCase();
  const adminRole = String(session.role || '').toUpperCase();
  const canOpenAdmin =
    adminRole === 'ADMIN' ||
    adminRole === 'NURSING_ADMIN' ||
    adminRole === 'SUPER_ADMIN' ||
    adminContext.includes('NURSING_ADMIN') ||
    adminContext.includes('SUPER_ADMIN') ||
    adminContext.includes('\"ADMIN\"');

  if (canOpenAdmin && adminBtn) {
    adminBtn.classList.remove('hidden');
    adminBtn.onclick = () => { location.href = `${appRoot}admin/`; };
  }

  const grid = document.getElementById('wardGrid');
  const search = document.getElementById('wardSearch');
  let wards = [];

  function render(list) {
    grid.innerHTML = list.length
      ? list.map((ward, index) => `
          <button class="ward-card" data-index="${index}">
            <span class="ward-name">${ENR.escape(ward.name)}</span>
            <span class="ward-code">${ENR.escape(ward.code || ward.id || '-')}</span>
          </button>
        `).join('')
      : '<div class="enr-empty" style="grid-column:1/-1">ไม่พบหน่วยงานที่สามารถเข้าถึงได้</div>';

    grid.querySelectorAll('.ward-card').forEach(button => {
      button.onclick = () => {
        const ward = list[Number(button.dataset.index)];
        ENR.setWard(ward);
        location.href = 'patient_list.html';
      };
    });
  }

  try {
    grid.innerHTML = '<div class="enr-empty" style="grid-column:1/-1">กำลังโหลดหน่วยงาน...</div>';
    wards = await ENR.api.getOrgUnits();

    // ถ้า account มี ward เดียวจาก session context แต่ org_units ถูก RLS จำกัด
    // ผลลัพธ์ก็จะเหลือ ward ที่มีสิทธิ์เท่านั้น
    render(wards);
  } catch (error) {
    grid.innerHTML = `<div class="enr-empty" style="grid-column:1/-1">โหลดหน่วยงานไม่สำเร็จ: ${ENR.escape(error.message)}</div>`;
  }

  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    render(wards.filter(ward =>
      !q ||
      String(ward.name || '').toLowerCase().includes(q) ||
      String(ward.code || '').toLowerCase().includes(q)
    ));
  };

  document.getElementById('logoutBtn').onclick = async () => {
    try { await ENR.api.logout(); } catch (_) {}
    ENR.clearSession();
    location.href = 'login.html';
  };
});
