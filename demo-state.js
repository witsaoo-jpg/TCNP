/* Standalone, ephemeral ENR demonstration data. No API, storage, or hospital integration. */
(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root) root.ENRDemo = exported;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const wards = Object.freeze([
    { code: '34', name: 'หอผู้ป่วยเคมีบำบัด' },
    { code: '21', name: 'หอผู้ป่วยศัลยกรรม' },
    { code: '31', name: 'หอผู้ป่วยอายุรกรรม' }
  ]);
  const patients = Object.freeze([
    { id: 'DEMO-P01', wardCode: '34', name: 'ผู้ป่วยสมมติ A', hn: 'DEMO-0001', an: 'DEMO-AN01', bed: '01', dx: 'รับยาเคมีบำบัด (สมมติ)' },
    { id: 'DEMO-P02', wardCode: '34', name: 'ผู้ป่วยสมมติ B', hn: 'DEMO-0002', an: 'DEMO-AN02', bed: '02', dx: 'ติดตามอาการหลังให้ยา (สมมติ)' },
    { id: 'DEMO-P03', wardCode: '34', name: 'ผู้ป่วยสมมติ C', hn: 'DEMO-0003', an: 'DEMO-AN03', bed: '03', dx: 'ประเมินอาการทั่วไป (สมมติ)' },
    { id: 'DEMO-P04', wardCode: '21', name: 'ผู้ป่วยสมมติ D', hn: 'DEMO-0004', an: 'DEMO-AN04', bed: '04', dx: 'หลังผ่าตัด (สมมติ)' },
    { id: 'DEMO-P05', wardCode: '21', name: 'ผู้ป่วยสมมติ E', hn: 'DEMO-0005', an: 'DEMO-AN05', bed: '05', dx: 'เตรียมผ่าตัด (สมมติ)' },
    { id: 'DEMO-P06', wardCode: '31', name: 'ผู้ป่วยสมมติ F', hn: 'DEMO-0006', an: 'DEMO-AN06', bed: '06', dx: 'ติดตามอาการทางอายุรกรรม (สมมติ)' }
  ]);
  const fields = ['focus', 'subjective', 'objective', 'goal', 'intervention', 'evaluation'];
  const copy = value => JSON.parse(JSON.stringify(value));
  function createStore() {
    let ward = null;
    let patient = null;
    let notes = [];
    let sequence = 1;
    const now = () => new Date().toISOString();
    const selected = () => patients.find(p => p.id === patient) || null;
    const find = id => notes.find(n => n.id === String(id));
    function requireSelected() {
      if (!selected()) throw new Error('กรุณาเลือกผู้ป่วยสมมติก่อน');
    }
    function cleanData(values) {
      const out = {};
      for (const key of fields) out[key] = String(values?.[key] || '').trim().slice(0, 1500);
      if (!out.focus || !out.intervention) throw new Error('กรอก Focus และ Intervention ก่อนบันทึก');
      return out;
    }
    return {
      wards: () => copy(wards),
      patients: (code) => copy(patients.filter(p => p.wardCode === String(code || ward))),
      ward: () => copy(wards.find(w => w.code === ward) || null),
      patient: () => copy(selected()),
      selectWard(code) {
        if (!wards.some(w => w.code === String(code))) throw new Error('ไม่พบหอผู้ป่วยตัวอย่าง');
        ward = String(code); patient = null;
      },
      selectPatient(id) {
        if (!patients.some(p => p.id === String(id) && p.wardCode === ward)) throw new Error('ไม่พบผู้ป่วยตัวอย่างในวอร์ดนี้');
        patient = String(id);
      },
      notes: () => copy(notes.filter(n => n.patientId === patient)),
      createNote(values) {
        requireSelected();
        const data = cleanData(values);
        const note = {id: String(sequence++), patientId: patient, ...data, status: 'DRAFT', createdAt: now(), signedAt: null, cancelledAt: null, cancelReason: null, addenda: []};
        notes.unshift(note);
        return copy(note);
      },
      updateDraft(id, values) {
        requireSelected();
        const note = find(id);
        if (!note || note.patientId !== patient || note.status !== 'DRAFT') throw new Error('แก้ไขได้เฉพาะบันทึก DRAFT ของผู้ป่วยที่เลือก');
        Object.assign(note, cleanData(values));
        return copy(note);
      },
      signNote(id) {
        const note = find(id);
        if (!note || note.patientId !== patient || note.status !== 'DRAFT') throw new Error('ลงนามได้เฉพาะ DRAFT');
        note.status = 'SIGNED'; note.signedAt = now();
        return copy(note);
      },
      cancelNote(id, reason) {
        const note = find(id);
        if (!note || note.patientId !== patient || note.status === 'CANCELLED') throw new Error('ไม่พบบันทึกที่ยกเลิกได้');
        if (!String(reason || '').trim()) throw new Error('กรุณาระบุเหตุผลที่ยกเลิก');
        note.status = 'CANCELLED'; note.cancelledAt = now(); note.cancelReason = String(reason).trim().slice(0, 500);
        return copy(note);
      },
      addendum(id, content) {
        const note = find(id);
        if (!note || note.patientId !== patient || note.status !== 'SIGNED') throw new Error('บันทึกเพิ่มเติมได้เฉพาะรายการ SIGNED');
        if (!String(content || '').trim()) throw new Error('กรุณากรอกข้อความเพิ่มเติม');
        note.addenda.push({content: String(content).trim().slice(0, 1500), at: now()});
        return copy(note);
      },
      summary() {
        const list = notes.filter(n => n.patientId === patient);
        return {all: list.length, draft: list.filter(n => n.status === 'DRAFT').length, signed: list.filter(n => n.status === 'SIGNED').length, cancelled: list.filter(n => n.status === 'CANCELLED').length};
      },
      reset() { ward = null; patient = null; notes = []; sequence = 1; }
    };
  }
  return { createStore };
});
