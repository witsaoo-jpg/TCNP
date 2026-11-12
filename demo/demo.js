(function () {
  'use strict';
  const store = window.ENRDemo.createStore();
  const screen = document.getElementById('screen');
  const nav = [...document.querySelectorAll('[data-route]')];
  let route = 'home';
  let editId = null;
  let message = '';
  const sections = [
    ['focus', 'F — Focus / ปัญหาทางการพยาบาล', 'ระบุปัญหาที่พบ (ข้อมูลสมมติ)', 'wide'],
    ['subjective', 'A-S — Subjective Data', 'ข้อมูลที่ผู้ป่วยสมมติบอก'],
    ['objective', 'A-O — Objective Data', 'ข้อมูลการประเมินสมมติ'],
    ['goal', 'G — Goal', 'เป้าหมายการพยาบาล (สมมติ)'],
    ['intervention', 'I — Intervention', 'กิจกรรมการพยาบาลที่วางแผน (สมมติ)'],
    ['evaluation', 'E — Evaluation', 'ผลการประเมิน (สมมติ)']
  ];
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when = iso => iso ? new Date(iso).toLocaleString('th-TH', {dateStyle:'medium',timeStyle:'short'}) : '—';
  const count = code => store.patients(code).length;
  function notify(text) { message = text; render(); }
  function navigate(next) {
    if (!['home','wards','patients','notes','summary'].includes(next)) next = 'home';
    if (['patients','notes','summary'].includes(next) && !store.ward()) next = 'wards';
    if (['notes','summary'].includes(next) && !store.patient()) next = 'patients';
    route = next; editId = null; message = ''; render();
    window.scrollTo(0, 0);
  }
  function context() {
    const ward = store.ward(), patient = store.patient();
    if (!ward && route !== 'wards') return '';
    return `<div class="info-strip"><span class="pill demo">โหมดทดลอง</span>${ward ? `<span class="pill">วอร์ด ${escape(ward.code)}: ${escape(ward.name)}</span>` : ''}${patient ? `<span class="pill">${escape(patient.name)} • ${escape(patient.hn)}</span>` : ''}</div>`;
  }
  function home() {
    return `<div class="hero"><div><div class="eyebrow">Presentation Simulation / ENR V3</div><h1>ทดลองใช้ระบบบันทึกทางการพยาบาล<br>ด้วยข้อมูลสมมติทั้งหมด</h1><p>ลองเลือกหอผู้ป่วย เลือกผู้ป่วยตัวอย่าง สร้าง Nursing Note แบบ F–A(S,O)–G–I–E ทดลองบันทึก DRAFT ลงนาม SIGNED และบันทึกเพิ่มเติม</p><div class="btnrow"><button class="btn teal" data-action="start">เริ่มทดลองใช้งาน →</button></div></div><div class="hero-visual"><div><strong>01</strong><span>เลือกหอผู้ป่วย</span></div><div><strong>02</strong><span>ดูผู้ป่วยตัวอย่าง</span></div><div><strong>03</strong><span>ทดลองบันทึกและลงนาม</span></div></div></div><div class="section-title"><div><h2>ขั้นตอนสำหรับผู้เข้าร่วมบรรยาย</h2><p>ใช้ได้ทั้งคอมพิวเตอร์และโทรศัพท์มือถือ โดยไม่ต้องลงทะเบียน</p></div></div><div class="steps-demo"><p><b>1</b><span>กด “เริ่มทดลองใช้งาน” เลือกวอร์ดและผู้ป่วยสมมติ</span></p><p><b>2</b><span>ทดลองสร้าง Nursing Note โดยกรอกเฉพาะข้อมูลสมมติ</span></p><p><b>3</b><span>กดบันทึก DRAFT จากนั้นทดลอง SIGNED และ Addendum</span></p><p><b>4</b><span>กดสรุปผล หรือเริ่มต้นใหม่เพื่อทดลองอีกรอบ</span></p></div><div class="notice warning"><b>เพื่อความปลอดภัย:</b> ห้ามใช้ชื่อ HN AN หรืออาการจริงของผู้ป่วย ระบบนี้จำลองการทำงานเฉพาะหน้าจอเท่านั้น ไม่ใช่ระบบโรงพยาบาลและไม่พิสูจน์ตัวตนผู้ใช้งาน</div>`;
  }
  function wards() {
    return `${context()}<div class="section-title"><div><h1>เลือกหอผู้ป่วย</h1><p>เลือกจากหน่วยงานตัวอย่างเพื่อเข้าสู่ขั้นตอนถัดไป</p></div></div><div class="grid">${store.wards().map(w => `<button class="card pick" data-action="ward" data-code="${escape(w.code)}"><div class="big-icon">🏥</div><h3>${escape(w.name)}</h3><p>รหัสหน่วยงาน: ${escape(w.code)}</p><span class="pill">ผู้ป่วยสมมติ ${count(w.code)} ราย</span></button>`).join('')}</div>`;
  }
  function patients() {
    const ward = store.ward();
    if (!ward) return '';
    return `${context()}<div class="section-title"><div><h1>รายชื่อผู้ป่วยตัวอย่าง</h1><p>ข้อมูลทุกช่องเป็นข้อมูลสมมติ ไม่ใช่เวชระเบียนจริง</p></div><button class="btn subtle" data-action="go-wards">เปลี่ยนวอร์ด</button></div><div class="grid">${store.patients().map(p => `<button class="card pick patient-card" data-action="patient" data-id="${escape(p.id)}"><div><h3>${escape(p.name)}</h3><div class="patient-meta">เตียง ${escape(p.bed)} • HN: ${escape(p.hn)} • AN: ${escape(p.an)}</div><p>DX: ${escape(p.dx)}</p></div><span class="pill">เลือก →</span></button>`).join('')}</div>`;
  }
  function noteFields(values) {
    return sections.map(([key,label,placeholder,wide]) => `<div class="field ${wide || ''}"><label for="f_${key}">${escape(label)} ${['focus','intervention'].includes(key) ? '*' : ''}</label><textarea id="f_${key}" name="${key}" maxlength="1500" placeholder="${escape(placeholder)}">${escape(values?.[key] || '')}</textarea></div>`).join('');
  }
  function noteHtml(n) {
    const status = String(n.status || 'DRAFT');
    return `<article class="note"><div class="note-head"><h3>${escape(n.focus)}</h3><span class="pill ${status.toLowerCase()}">${escape(status)}</span></div><div class="small">บันทึก #${escape(n.id)} • ${when(n.createdAt)}${n.signedAt ? ` • ลงนาม ${when(n.signedAt)}` : ''}</div><dl class="note-grid">${sections.map(([k,label])=>n[k] ? `<dt>${escape(label.split(' — ')[0])}</dt><dd>${escape(n[k])}</dd>` : '').join('')}</dl>${n.addenda.length ? `<div class="notice"><b>Addendum (${n.addenda.length})</b>${n.addenda.map(a => `<p>${escape(a.content)} <span class="small">${when(a.at)}</span></p>`).join('')}</div>` : ''}${n.cancelReason ? `<div class="notice warning">ยกเลิก: ${escape(n.cancelReason)}</div>` : ''}<div class="btnrow">${status === 'DRAFT' ? `<button class="btn sm subtle" data-action="edit" data-id="${escape(n.id)}">แก้ไข DRAFT</button><button class="btn sm teal" data-action="sign" data-id="${escape(n.id)}">✓ ลงนาม</button>` : ''}${status === 'SIGNED' ? `<button class="btn sm subtle" data-action="addendum" data-id="${escape(n.id)}">＋ Addendum</button>` : ''}${status !== 'CANCELLED' ? `<button class="btn sm danger" data-action="cancel" data-id="${escape(n.id)}">ยกเลิกบันทึก</button>` : ''}</div></article>`;
  }
  function notes() {
    const patient = store.patient(); if (!patient) return '';
    const existing = store.notes(); const editing = existing.find(n => n.id === editId && n.status === 'DRAFT');
    return `${context()}<div class="section-title"><div><h1>Nursing Note</h1><p>F–A(S,O)–G–I–E | ทดลองบันทึก ไม่ใช่ข้อมูลทางคลินิกจริง</p></div><button class="btn subtle" data-action="go-patients">เปลี่ยนผู้ป่วย</button></div><section class="panel"><h2>${editing ? `แก้ไขบันทึก DRAFT #${escape(editId)}` : '＋ สร้าง Nursing Note (ข้อมูลสมมติ)'}</h2><form id="noteForm"><div class="form-grid">${noteFields(editing)}</div><div class="btnrow"><button class="btn teal" type="submit">${editing ? 'บันทึกการแก้ไข DRAFT' : 'บันทึกเป็น DRAFT'}</button>${editing ? '<button class="btn subtle" type="button" data-action="stop-edit">ยกเลิกการแก้ไข</button>' : ''}</div><div class="small">* ต้องกรอก Focus และ Intervention อย่างน้อย • ปิดหรือรีเฟรชหน้าแล้วข้อมูลทดลองทั้งหมดจะหายไป</div></form></section><section class="panel"><div class="section-title"><div><h2>รายการบันทึกทดลอง</h2><p>${existing.length} รายการในหน้านี้</p></div><button class="btn subtle" data-action="go-summary">ดูสรุปผล</button></div>${existing.length ? existing.map(noteHtml).join('') : '<div class="empty">ยังไม่มีบันทึก กรอกแบบฟอร์มด้านบนเพื่อทดลองสร้าง DRAFT</div>'}</section>`;
  }
  function summary() {
    const patient = store.patient(); if (!patient) return '';
    const stats = store.summary();
    return `${context()}<div class="section-title"><div><h1>สรุปการทดลองใช้งาน</h1><p>ผลนี้เป็นเพียงสถานะในแท็บปัจจุบัน ไม่ใช่รายงานทางคลินิก</p></div></div><div class="numbers"><div class="metric"><strong>${stats.all}</strong><span>บันทึกทั้งหมด</span></div><div class="metric"><strong>${stats.draft}</strong><span>DRAFT</span></div><div class="metric"><strong>${stats.signed}</strong><span>SIGNED</span></div><div class="metric"><strong>${stats.cancelled}</strong><span>CANCELLED</span></div></div><section class="panel" style="margin-top:18px"><h2>สิ่งที่ทดลองได้</h2><div class="steps-demo"><p><b>✓</b><span>เลือกวอร์ดและข้อมูลผู้ป่วยสมมติ</span></p><p><b>✓</b><span>สร้างบันทึก Nursing Note และแก้ไข DRAFT</span></p><p><b>✓</b><span>จำลอง SIGNED (ล็อกต้นฉบับ) และ Addendum</span></p><p><b>✓</b><span>ยกเลิกบันทึกโดยระบุเหตุผล</span></p></div><div class="btnrow"><button class="btn" data-action="go-notes">กลับไปทดลอง Nursing Note</button><button class="btn subtle" data-action="reset">เริ่มต้นใหม่</button></div></section><div class="notice warning">นี่เป็นการทดสอบหน้าจอและขั้นตอนใช้งานเท่านั้น การลงนาม การกำหนดสิทธิ์ และ Audit ที่มีผลตามระบบโรงพยาบาลต้องทำผ่าน Backend จริงในการพัฒนาระยะถัดไป</div>`;
  }
  function render() {
    nav.forEach(button => {
      if (button.dataset.route === route) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
    screen.innerHTML = (message ? `<div class="inline-message" role="alert">${escape(message)}</div>` : '') + ({home,wards,patients,notes,summary}[route] || home)();
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-route],button[data-action]');
    if (!button) return;
    if (button.dataset.route) { navigate(button.dataset.route); return; }
    const a = button.dataset.action, id = button.dataset.id;
    try {
      if (a === 'start' || a === 'go-wards') navigate('wards');
      else if (a === 'go-patients') navigate('patients');
      else if (a === 'go-notes') navigate('notes');
      else if (a === 'go-summary') navigate('summary');
      else if (a === 'ward') { store.selectWard(button.dataset.code); navigate('patients'); }
      else if (a === 'patient') { store.selectPatient(id); navigate('notes'); }
      else if (a === 'stop-edit') { editId = null; render(); }
      else if (a === 'edit') { editId = id; render(); document.getElementById('f_focus')?.focus(); }
      else if (a === 'sign') { if (confirm('จำลองการลงนาม SIGNED? หลังลงนามจะไม่สามารถแก้ไขต้นฉบับได้')) {store.signNote(id); notify('ลงนามรายการสมมติสำเร็จ');} }
      else if (a === 'cancel') { const reason = prompt('กรอกเหตุผลการยกเลิกบันทึกสมมติ'); if (reason !== null) {store.cancelNote(id, reason); notify('ยกเลิกรายการทดลองแล้ว');} }
      else if (a === 'addendum') { const content = prompt('ข้อความ Addendum (ข้อมูลสมมติเท่านั้น)'); if (content !== null) {store.addendum(id, content); notify('เพิ่ม Addendum ในรายการทดลองแล้ว');} }
      else if (a === 'reset') reset();
    } catch (error) { notify(error.message || 'ไม่สามารถทำรายการได้'); }
  });
  function reset() { if (!confirm('เริ่มต้นใหม่? ข้อมูลการทดลองในแท็บนี้จะถูกล้างทั้งหมด')) return; store.reset(); navigate('home'); }
  document.getElementById('resetBtn').addEventListener('click',reset);
  document.getElementById('homeLink').addEventListener('click',(event)=>{event.preventDefault();navigate('home');});
  document.addEventListener('submit', event => {
    if (event.target.id !== 'noteForm') return;
    event.preventDefault();
    const values = Object.fromEntries(sections.map(([key])=>[key,document.getElementById('f_'+key)?.value || '']));
    try {
      if (editId) {store.updateDraft(editId,values); editId = null; notify('แก้ไขบันทึก DRAFT สำเร็จ');}
      else {store.createNote(values); notify('บันทึก DRAFT ทดลองสำเร็จ');}
    } catch (error) {
      const existing = document.getElementById('demoFormError');
      if (existing) existing.textContent = error.message || 'ข้อมูลไม่ครบ';
      else { const el = document.createElement('p'); el.id = 'demoFormError'; el.className = 'inline-message'; el.setAttribute('role','alert'); el.textContent = error.message || 'ข้อมูลไม่ครบ'; event.target.appendChild(el); }
    }
  });
  render();
})();
