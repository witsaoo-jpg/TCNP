document.addEventListener('DOMContentLoaded', () => {
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient();
  const ward = ENR.getWard();

  const backToPatientList = document.getElementById('backToPatientList');
  if (backToPatientList) {
    backToPatientList.addEventListener('click', () => {
      location.href = 'patient_list.html';
    });
  }

  if (!patient) {
    location.href = 'patient_list.html';
    return;
  }

  document.getElementById('headName').textContent = patient.name || patient.display_name || '-';
  document.getElementById('headHN').textContent = patient.hn || '-';
  document.getElementById('headAN').textContent = patient.an || patient.encounter_no || '-';
  document.getElementById('headWard').textContent = patient.wardName || patient.ward_name || ward?.name || '-';

  document.querySelectorAll('[data-href]').forEach(card => {
    card.addEventListener('click', () => {
      location.href = card.dataset.href;
    });
  });

  const toast = document.getElementById('paperlessToast');
  let toastTimer = null;

  const showPlanned = (moduleName) => {
    if (!toast) return;
    toast.textContent = moduleName === 'Patient Parameters & Graphic Sheet'
      ? 'Patient Parameters & Graphic Sheet • วางแผนให้บันทึกค่าครั้งเดียว แล้วใบบันทึกกราฟอัปเดตอัตโนมัติ'
      : `${moduleName} • อยู่ในแผนพัฒนาและจะใช้ร่วมกันทุก Ward`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  };

  document.querySelectorAll('[data-module]').forEach(card => {
    card.addEventListener('click', () => showPlanned(card.dataset.module || 'โมดูล'));
  });
});
