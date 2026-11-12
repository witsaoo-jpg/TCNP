document.addEventListener('DOMContentLoaded', async () => {
  const session = ENR.requireSession();
  if (!session) return;

  // CP5.7 Nursing Analytics quick access
  const analyticsBtn = document.getElementById('analyticsBtn');
  if (analyticsBtn) {
    analyticsBtn.onclick = () => { location.href = '/v3/admin/analytics.html'; };
  }
  // /CP5.7


  const ward = ENR.getWard();
  if (!ward) {
    location.href = 'ward.html';
    return;
  }

  document.getElementById('wardDisplayName').textContent = `หอผู้ป่วย: ${ward.name}`;
  document.getElementById('wardDisplayCode').textContent = `รหัสวอร์ด: ${ward.code || ward.id || '-'}`;

  const root = document.getElementById('patientListArea');

  function render(list) {
    root.innerHTML = list.length
      ? list.map((patient, index) => `
          <div class="patient-card" data-index="${index}">
            <div class="patient-avatar">♟</div>
            <div class="patient-main">
              <div class="patient-name">
                ${ENR.escape(patient.name)}
                <span class="patient-bed">เตียง ${ENR.escape(patient.bed || '-')}</span>
              </div>
              <div class="patient-sub">HN: ${ENR.escape(patient.hn)} | AN: ${ENR.escape(patient.an)}</div>
              <div class="patient-dx">DX: ${ENR.escape(patient.dx || '-')}</div>
            </div>
            <div class="patient-arrow">›</div>
          </div>`).join('')
      : '<div class="enr-empty">ไม่พบผู้ป่วยที่กำลังรับการรักษาในหน่วยงานนี้</div>';

    root.querySelectorAll('.patient-card').forEach(card => {
      card.onclick = () => {
        const patient = list[Number(card.dataset.index)];
        ENR.setPatient({
          ...patient,
          ward: ward.name,
          wardName: patient.wardName || ward.name,
          wardCode: patient.wardCode || ward.code,
          orgUnitId: patient.orgUnitId || ward.id,
        });
        location.href = 'paperless.html';
      };
    });
  }

  try {
    root.innerHTML = '<div class="enr-empty">กำลังโหลดรายชื่อผู้ป่วยจาก PostgreSQL...</div>';
    const patients = await ENR.api.getPatients('', ward);
    render(patients);
  } catch (error) {
    root.innerHTML = `<div class="enr-empty">โหลดรายชื่อผู้ป่วยไม่สำเร็จ: ${ENR.escape(error.message)}</div>`;
  }

  document.getElementById('changeWardBtn').onclick = () => location.href = 'ward.html';
});
