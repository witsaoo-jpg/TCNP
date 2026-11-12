/* Labels legacy screens as a synthetic-only public presentation prototype. */
(function(){
  if (document.getElementById('enrLegacyDemoNotice')) return;
  const box = document.createElement('div');
  box.id = 'enrLegacyDemoNotice';
  box.style.cssText='position:sticky;top:0;z-index:2147483646;background:#fff2ca;padding:7px 12px;color:#6a4300;border-bottom:2px solid #e6be59;font:600 13px system-ui,Tahoma,sans-serif';
  box.textContent='🧪 ENR V3 • หน้าระบบเดิมสำหรับทดลองเท่านั้น • ไม่บันทึกเข้าสู่ระบบโรงพยาบาล • ห้ามกรอกข้อมูลผู้ป่วยจริง';
  document.body.prepend(box);
})();
