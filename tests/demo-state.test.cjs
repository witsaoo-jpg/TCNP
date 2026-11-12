const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createStore} = require('../demo/demo-state.js');
const payload = {focus:'ความไม่สุขสบาย (สมมติ)', subjective:'ผู้ป่วยสมมติแจ้งว่าปวด', objective:'คะแนนปวด 3/10 (สมมติ)', goal:'ลดอาการปวด', intervention:'ประเมินความปวดตามแนวทาง', evaluation:'อาการดีขึ้น'};

test('demo starts empty and uses only synthetic patient identifiers',()=>{
 const s=createStore();assert.equal(s.ward(),null);assert.equal(s.patient(),null);assert.equal(s.wards().length,3);
 assert.ok(s.patients('34').every(p=>p.hn.startsWith('DEMO-') && p.name.startsWith('ผู้ป่วยสมมติ')));
});
test('ward and patient selection are constrained',()=>{
 const s=createStore();assert.throws(()=>s.selectPatient('DEMO-P01'));s.selectWard('34');assert.throws(()=>s.selectPatient('DEMO-P06'));
 s.selectPatient('DEMO-P01');assert.equal(s.patient().hn,'DEMO-0001');s.selectWard('31');assert.equal(s.patient(),null);
});
test('new notes require focus and intervention',()=>{
 const s=createStore();s.selectWard('34');s.selectPatient('DEMO-P01');
 assert.throws(()=>s.createNote({focus:'x'}));assert.equal(s.notes().length,0);
 assert.equal(s.createNote(payload).status,'DRAFT');assert.equal(s.summary().draft,1);
});
test('draft edits work; signed originals are immutable',()=>{
 const s=createStore();s.selectWard('34');s.selectPatient('DEMO-P01');
 const n=s.createNote(payload);s.updateDraft(n.id,{...payload,goal:'เป้าหมายใหม่'});
 assert.equal(s.notes()[0].goal,'เป้าหมายใหม่');s.signNote(n.id);
 assert.throws(()=>s.updateDraft(n.id,payload));assert.throws(()=>s.signNote(n.id));
 assert.equal(s.notes()[0].goal,'เป้าหมายใหม่');
});
test('signed notes can accept Addendum but not cancelled notes',()=>{
 const s=createStore();s.selectWard('34');s.selectPatient('DEMO-P01');
 const n=s.createNote(payload);assert.throws(()=>s.addendum(n.id,'x'));s.signNote(n.id);
 s.addendum(n.id,'ข้อมูลเพิ่มเติมสมมติ');assert.equal(s.notes()[0].addenda.length,1);
 s.cancelNote(n.id,'ยกเลิกการทดลอง');assert.throws(()=>s.addendum(n.id,'x'));assert.equal(s.summary().cancelled,1);
});
test('cross-patient access is blocked and data stays isolated',()=>{
 const s=createStore();s.selectWard('34');s.selectPatient('DEMO-P01');const n=s.createNote(payload);
 s.selectPatient('DEMO-P02');assert.equal(s.notes().length,0);assert.throws(()=>s.signNote(n.id));
 s.selectPatient('DEMO-P01');assert.equal(s.notes().length,1);
});
test('all demo state clears on reset, including notes and selections',()=>{
 const s=createStore();s.selectWard('34');s.selectPatient('DEMO-P01');s.createNote(payload);s.reset();
 assert.equal(s.ward(),null);s.selectWard('34');s.selectPatient('DEMO-P01');assert.equal(s.notes().length,0);
});
test('returned data cannot mutate the backing note or patient fixtures',()=>{
 const s=createStore();s.selectWard('34');s.selectPatient('DEMO-P01');const n=s.createNote(payload);
 const notes=s.notes();notes[0].focus='tampered';assert.equal(s.notes()[0].focus,payload.focus);
 const p=s.patient();p.name='tampered';assert.equal(s.patient().name,'ผู้ป่วยสมมติ A');
});
