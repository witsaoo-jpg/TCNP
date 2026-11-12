/*
 * TCNP / ENR V3 presentation-only API replacement.
 * Real frontend screens, synthetic patient records, TCNP code lookup and
 * note lifecycle simulation. No hospital server, credentials or API calls.
 * Only activate when ENR_CONFIG.USE_MOCK_DATA === true.
 */
(function () {
  'use strict';
  if (!window.ENR_CONFIG?.USE_MOCK_DATA) return;
  const KEY = 'tcnp.v3.presentation.state.v1';
  const nativeFetch = window.fetch.bind(window);
  const base = new URL('../../../', document.currentScript?.src || document.baseURI);
  const assets = (path) => new URL(path, base).href;
  const loadJSON = (path) => nativeFetch(assets(path), { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error('ไม่พบข้อมูล TCNP หรือรายการต้นแบบที่จำเป็น');
    return response.json();
  });
  let termsPromise, wardsPromise, templatesPromise;
  const terms = () => termsPromise ||= loadJSON('data/tcnp_master_codes_v1.8.json');
  const wards = () => wardsPromise ||= loadJSON('assets/js/mock/wards.json');
  const templates = () => templatesPromise ||= loadJSON('assets/js/mock/templates.json');

  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const currentUser = () => ({ id: 1, username: 'demo', full_name_th: 'ผู้เข้าร่วมทดลองระบบ (DEMO)', must_change_password: false });
  const userContext = () => ({ user_context: { role: 'ADMIN', unit_code: '34', org_unit_id: 34, roles: ['ADMIN'] } });
  const session = () => ({ authenticated: true, user: currentUser(), userContext: userContext(), mustChangePassword: false });
  function state() {
    try {
      const old = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (old && Array.isArray(old.notes) && Array.isArray(old.amendments)) return old;
    } catch (_) {}
    return { notes: [], amendments: [], templates: [], serial: 100 };
  }
  function persist(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (_) { throw new Error('ไม่สามารถบันทึกข้อมูลจำลองในเบราว์เซอร์นี้ กรุณาตรวจสอบพื้นที่ Local Storage'); }
  }
  const fail = (message, status = 400, code = 'DEMO_VALIDATION') => ({ status, data: { ok: false, error: message, code } });
  const ok = data => ({ status: 200, data });
  function noteById(db, id) { return db.notes.find(item => String(item.id) === String(id)); }
  function enforceDraft(db, id) {
    const note = noteById(db, id);
    if (!note) return { error: 'ไม่พบ Nursing Note จำลอง' };
    if (note.status !== 'DRAFT') return { error: 'บันทึกที่ลงนามแล้วแก้ไขต้นฉบับไม่ได้' };
    return { note };
  }
  function patientFor(id, allWards) {
    const wardCode = String(Math.floor(Number(id) / 1000));
    const ward = allWards.find(w => String(w.code) === wardCode);
    if (!ward || !Number.isInteger(Number(id))) return null;
    const num = Number(id) % 1000;
    if (num < 1 || num > 3) return null;
    const token = String(num).padStart(2, '0');
    return {
      encounter_id: Number(id), patient_id: Number(id),
      patient_name: `ผู้ป่วยสมมติ ${String.fromCharCode(64 + num)}`,
      hn: `DEMO-${ward.code}-${token}`, an: `TEST-${ward.code}-${token}`,
      bed_no: token, principal_diagnosis_text: ['ภาวะคลื่นไส้ (ตัวอย่าง)','อาการปวด (ตัวอย่าง)','เตรียมจำหน่าย (ตัวอย่าง)'][num - 1],
      admit_datetime: '2026-11-12T08:00:00', encounter_type: 'IPD',
      org_unit_id: Number(ward.code) || 34, unit_code: String(ward.code),
      unit_name_th: ward.name
    };
  }
  function notesFor(db, id) { return db.notes.filter(note => String(note.encounter_id) === String(id)).sort((a, b) => b.id - a.id); }
  function shapeNote(payload, id, existing) {
    const custom = payload.custom_items || payload.items || [];
    const items = custom.map((x, index) => ({
      id: Number(x.id) || (index + 1), section_code: x.section_code,
      source_type: x.source_type || (x.tcnp_code ? 'TCNP' : 'MANUAL'),
      code_id: x.code_id || null, tcnp_code: x.tcnp_code || null,
      note_text: String(x.note_text || ''), sort_order: Number(x.sort_order || x.display_order || index + 1)
    }));
    // A selected template focus must remain available in the original editor.
    return {
      ...(existing || {}), id: existing?.id || id, encounter_id: existing?.encounter_id || Number(id),
      status: 'DRAFT', note_status: 'DRAFT', items,
      clinical_datetime: payload.clinical_datetime || now(),
      patient_type_level: payload.patient_type_level || null,
      created_at: existing?.created_at || now(), updated_at: now(),
      created_by_display: 'ผู้เข้าร่วมทดลองระบบ (DEMO)',
      evaluation_trend: payload.evaluation_outcome_code ?? payload.evaluation_trend ?? null,
      problem_status: payload.care_plan_status_code ?? payload.problem_status ?? 'IN_PROGRESS',
      evaluation_note: payload.evaluation_text ?? payload.evaluation_note ?? '',
      template_code: payload.template_code || existing?.template_code || null,
    };
  }
  function formatAmendments(db, noteId) {
    const list = db.amendments.filter(item => String(item.note_id) === String(noteId));
    return { history: clone(list), active_count: list.filter(a => !a.is_cancelled).length, cancelled_count: list.filter(a => a.is_cancelled).length };
  }
  function summary(db, id) {
    const signed = notesFor(db, id).filter(x => x.status === 'SIGNED').reverse();
    const map = new Map();
    for (const n of signed) {
      const focus = n.items.find(i => i.section_code === 'F' && i.note_text?.trim());
      if (!focus) continue;
      const code = focus.tcnp_code || focus.note_text.trim();
      let ep = map.get(code);
      if (!ep) { ep = { episode_id: code, episode_number: 1, focus_code: focus.tcnp_code || '', focus: focus.note_text, note_count: 0, start_at: n.clinical_datetime, timeline: [] };map.set(code, ep); }
      ep.note_count++; ep.latest_at = n.clinical_datetime; ep.latest_trend = n.evaluation_trend;
      ep.latest_evaluation = n.evaluation_note; ep.problem_status = n.problem_status;
      ep.timeline.push({ note_id: n.id, effective_datetime: n.clinical_datetime,
        trend: n.evaluation_trend, evaluation: n.evaluation_note, problem_status: n.problem_status,
        recorded_by: n.created_by_display, signed_by: n.signed_by_display || n.created_by_display });
      if (n.problem_status === 'RESOLVED') { ep.resolved_at = n.clinical_datetime; ep.resolved_by_display = n.signed_by_display; }
    }
    const all = [...map.values()];const active = all.filter(x => x.problem_status !== 'RESOLVED');
    const resolved = all.filter(x => x.problem_status === 'RESOLVED');
    return { active, resolved, counts: { active: active.length, resolved: resolved.length, total_episodes: all.length, signed_notes_considered: signed.length }, policy: { summary_mutation_allowed: false } };
  }
  async function dispatch(path, method, body) {
    const url = new URL(path, location.origin);
    const p = url.pathname.replace(/^\/api\//, '');
    const db = state();
    const getId = regex => p.match(regex)?.[1];
    if (p === 'auth/login' && method === 'POST') {
      // Login is NOT authentication; no passwords are checked or transmitted.
      return ok(session());
    }
    if (p === 'auth/session' && method === 'GET') return ok(session());
    if (p === 'auth/logout' && method === 'POST') return ok({ ok: true });
    if (p === 'admin/auth/status') return ok({ ok: true, eligible: true, configured: true, verified: true, roles: ['ADMIN'], adminRole: 'ADMIN' });
    if (p === 'admin/auth/logout') return ok({ ok: true });
    if (p.startsWith('admin/auth/')) return ok({ ok: true });
    if (p === 'org-units' && method === 'GET') return ok({ units: (await wards()).map(w => ({id: Number(w.code) || 999, code: String(w.code), name: w.name, is_active: true})) });
    if (p === 'patients' && method === 'GET') {
      const all = await wards();const wardCode = url.searchParams.get('unit_code');
      const w = wardCode ? all.filter(x => String(x.code) === wardCode) : all.slice(0, 10);
      const search = (url.searchParams.get('q') || '').toLowerCase();
      const patients = w.flatMap(a => [1,2,3].map(n => patientFor((Number(a.code)||999)*1000+n, all))).filter(Boolean)
        .filter(x => !search || [x.patient_name,x.hn,x.an].some(y => y.toLowerCase().includes(search)));
      return ok({ patients });
    }
    if (getId(/^patients\/(\d+)\/nursing-patient-type\/suggestion$/)) return ok({ suggestion: null });
    if (p === 'tcnp/search') {
      const q = (url.searchParams.get('q') || '').trim().toLocaleLowerCase();
      const section = (url.searchParams.get('section_code') || 'F').toUpperCase();
      if (!q) return ok({items:[]});
      const type = section === 'F' ? 'F' : 'P';
      const max = Math.min(100, Number(url.searchParams.get('limit') || 80));
      const items = (await terms()).filter(x => (x.code_type === type || x.code?.startsWith(type)) &&
        [x.code, x.name_th, x.name_en].some(v => String(v || '').toLocaleLowerCase().includes(q))).slice(0, max);
      return ok({ items });
    }
    if (p === 'nursing-templates' || p === 'admin/templates') {
      const q = (url.searchParams.get('q') || '').toLocaleLowerCase();
      const items = [...(await templates()).map((t, i) => ({...t,id:i+1})), ...db.templates];
      return ok({templates: items.filter(t => !q || String(t.code+' '+t.name_th).toLocaleLowerCase().includes(q))});
    }
    const templateCode = getId(/^nursing-templates\/by-code\/(.+)$/);
    if (templateCode) return ok({ template: (await templates()).find(t => t.code === decodeURIComponent(templateCode)) || db.templates.find(t => t.code === decodeURIComponent(templateCode)) || null });
    const adminTemplateId = getId(/^admin\/templates\/(\d+)$/);
    if (adminTemplateId && method === 'GET') return ok({template: [...(await templates()).map((t,i)=>({...t,id:i+1})),...db.templates].find(t=>String(t.id)===adminTemplateId) || null});
    if (p === 'admin/templates' && method === 'POST') {
      const added = {...body,id: ++db.serial,status:'DRAFT'};db.templates.push(added);persist(db);return ok({template: added});
    }
    if (adminTemplateId && method === 'PATCH') {
      const ix = db.templates.findIndex(t=>String(t.id)===adminTemplateId);
      if(ix<0) return fail('Template ตัวอย่างแก้ไขไม่ได้ กรุณาสร้าง Template ใหม่');
      db.templates[ix] = {...db.templates[ix],...body};persist(db);return ok({template:db.templates[ix]});
    }
    const newVersion = getId(/^admin\/templates\/(\d+)\/new-version$/);
    if(newVersion) return fail('การสร้างเวอร์ชัน Template จริงต้องใช้ Backend');
    if(p==='admin/template-management/ping') return ok({ok:true});
    const encounter = getId(/^patients\/(\d+)\/nursing-notes$/);
    if (encounter) return ok({notes:notesFor(db, encounter)});
    const noteId = getId(/^nursing-notes\/(\d+)$/);
    if (noteId && method === 'GET') return noteById(db,noteId) ? ok({note:noteById(db,noteId)}) : fail('ไม่พบ Note',404);
    const createId=getId(/^patients\/(\d+)\/nursing-problems\/compose$/);
    if(createId && method==='POST') {
      const newId=++db.serial;
      const note=shapeNote(body,createId);
      note.id=newId;
      if(body.template_id){
        const ts=await templates();const tpl=ts[Number(body.template_id)-1]||db.templates.find(t=>String(t.id)===String(body.template_id));
        if(tpl){note.template_code=tpl.code;note.template_version=tpl.version;
          const selected=body.selected_template_items||[];
          const it=selected.map((s,i)=>{const origin=tpl.items.find(t=>String(t.id)===String(s.template_item_id));return {section_code:origin?.section_code||'I',source_type:origin?.source_type||'MANUAL',tcnp_code:origin?.tcnp_code||null,note_text:s.note_text,sort_order:i+1};});
          note.items=[...it,...note.items];
          if(tpl.focus_code&&!note.items.some(x=>x.section_code==='F')) note.items.unshift({section_code:'F',source_type:'TCNP',tcnp_code:tpl.focus_code,note_text:tpl.focus_text||tpl.name_th,sort_order:0});
        }
      }
      db.notes.push(note);persist(db);return ok({ok:true,note_id:newId,note});
    }
    const updateId=getId(/^v3\/nursing-notes\/(\d+)$/);
    if(updateId && method==='PATCH'){
      const {note,error}=enforceDraft(db,updateId);if(error)return fail(error,409);
      const next=shapeNote(body,note.encounter_id,note);Object.assign(note,next);persist(db);return ok({note});
    }
    const signId=getId(/^nursing-notes\/(\d+)\/sign$/);
    if(signId && method==='POST'){
      const {note,error}=enforceDraft(db,signId);if(error)return fail(error,409);
      note.status=note.note_status='SIGNED';note.signed_at=now();note.signed_by_display='ผู้เข้าร่วมทดลองระบบ (DEMO)';persist(db);return ok({ok:true,note});
    }
    const cancelId=getId(/^nursing-notes\/(\d+)\/cancel$/);
    if(cancelId && method==='POST'){
      const note=noteById(db,cancelId);if(!note)return fail('ไม่พบ Note',404);
      if(!String(body?.reason||body?.cancel_reason||'').trim())return fail('กรุณาระบุเหตุผล');
      note.status=note.note_status='CANCELED';note.cancel_reason=String(body.reason||body.cancel_reason);note.cancelled_at=now();note.cancelled_by_display='ผู้เข้าร่วมทดลองระบบ (DEMO)';persist(db);return ok({ok:true});
    }
    const amendmentCancel=getId(/^nursing-notes\/(\d+)\/amendment-actions\/(\d+)\/cancel$/);
    if(amendmentCancel && method==='POST') {
      const m=p.match(/^nursing-notes\/(\d+)\/amendment-actions\/(\d+)\/cancel$/);
      const item=db.amendments.find(a=>String(a.note_id)===m[1]&&String(a.amendment_id)===m[2]);
      if(!item)return fail('ไม่พบ Amendment',404);item.is_cancelled=true;item.cancel_reason=body?.reason;item.cancelled_at=now();item.cancelled_by_display='ผู้เข้าร่วมทดลองระบบ (DEMO)';persist(db);return ok({ok:true});
    }
    const amendId=getId(/^nursing-notes\/(\d+)\/(?:amendment-actions|amendments)$/);
    if(amendId && method==='GET')return ok({...formatAmendments(db,amendId),amendments:formatAmendments(db,amendId).history});
    if(amendId && method==='POST'){
      const note=noteById(db,amendId);if(!note||note.status!=='SIGNED')return fail('บันทึกเพิ่มเติมได้เฉพาะ SIGNED');
      const item={amendment_id:++db.serial,note_id:note.id,amendment_type:body.amendment_type||'ADDENDUM',amendment_text:body.amendment_text,reason:body.reason,created_at:now(),created_by_display:'ผู้เข้าร่วมทดลองระบบ (DEMO)',can_cancel:true,is_cancelled:false};
      db.amendments.push(item);persist(db);return ok({ok:true,item});
    }
    const probId=getId(/^patients\/(\d+)\/nursing-problem-summary$/);
    if(probId)return ok(summary(db,probId));
    const packetId=getId(/^encounters\/(\d+)\/nursing-record-packet$/);
    if(packetId){
      const all=await wards();const pat=all.flatMap(w=>[1,2,3].map(n=>patientFor((Number(w.code)||999)*1000+n,all))).find(x=>x.encounter_id===Number(packetId));
      if(!pat)return fail('ไม่พบข้อมูลผู้ป่วยจำลอง',404);
      const signed=notesFor(db,packetId).filter(x=>x.status==='SIGNED').map(n=>({...n,post_sign_history:formatAmendments(db,n.id).history}));
      return ok({patient:{display_name:pat.patient_name,hn:pat.hn},encounter:{encounter_no:pat.an,unit_code:pat.unit_code,ward_name:pat.unit_name_th,encounter_type:'IPD',admitted_at:pat.admit_datetime,principal_diagnosis_text:pat.principal_diagnosis_text,bed_no:pat.bed_no},notes:signed,signed_note_count:signed.length,post_sign_count:db.amendments.length,document_ref:`DEMO-${packetId}`,generated_at:now()});
    }
    const bulkHistory=getId(/^encounters\/(\d+)\/nursing-note-amendment-history$/);
    if(bulkHistory)return ok({history:[],notes:[]});
    if(p==='admin/audit/meta')return ok({ok:true,users:[],units:[],event_types:[],actions:[]});
    if(p==='admin/audit/ping')return ok({ok:true});
    if(p==='admin/audit/events')return ok({ok:true,events:[],total:0});
    return fail('ฟังก์ชันนี้ต้องใช้ Backend ของโรงพยาบาล (โหมดทดลองไม่รองรับ)',501,'BACKEND_REQUIRED');
  }
  window.ENRLocalDemo = Object.freeze({
    active: true,
    reset() {
      localStorage.removeItem(KEY);
      const exact = new Set(['selectedWard','patientProfile','currentHN','dischargeRecords','masterDiagnosis']);
      const prefixes = ['enr.v3.','enr_v3_','tcnp.v3.presentation.','notes_','problemStatus_',
        'discharge_current_','discharge_history_','PFE_Form_','RN_Form_'];
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if(k && (exact.has(k) || prefixes.some(prefix => k.startsWith(prefix)))) localStorage.removeItem(k);
      }
      ['enr.v3.session','isLoggedIn','currentUser'].forEach(k => sessionStorage.removeItem(k));
      location.href = new URL('login.html',base).href;
    },
    terms: terms,
  });
  window.fetch = function (resource, opts = {}) {
    const value = typeof resource === 'string' || resource instanceof URL ? String(resource) : resource?.url;
    const u = new URL(value, location.href);
    // Intercept only the application's same-origin API. Never forward credentials.
    if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return nativeFetch(resource,opts);
    const method = (opts.method || resource?.method || 'GET').toUpperCase();
    let body={};if(opts.body){try{body=JSON.parse(opts.body);}catch(_){return Promise.resolve(new Response(JSON.stringify({error:'Invalid JSON'}),{status:400,headers:{'Content-Type':'application/json'}}));}}
    return Promise.resolve().then(()=>dispatch(u.href,method,body)).then(({status,data})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})).catch(error=>new Response(JSON.stringify({error:error.message||'Demo API error'}),{status:500,headers:{'Content-Type':'application/json'}}));
  };
  function banner() {
    if (!document.body || document.getElementById('enrDemoBanner'))return;
    const bar=document.createElement('div');bar.id='enrDemoBanner';
    bar.setAttribute('role','note');
    bar.style.cssText='position:sticky;top:0;z-index:2147483646;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#fff2ca;color:#6a4300;border-bottom:2px solid #e6be59;padding:5px 12px;font:600 13px/1.45 system-ui,Tahoma,sans-serif';
    bar.innerHTML='<span>🧪 ENR V3 / TCNP — โหมดทดลอง ข้อมูลผู้ป่วยสมมติเท่านั้น • เก็บในเบราว์เซอร์ของท่าน • ไม่ใช่เวชระเบียนจริง</span><button type="button" id="enrDemoReset" style="border:1px solid #c69d32;border-radius:8px;padding:4px 10px;background:white;color:#624600;cursor:pointer">ล้างข้อมูลทดลอง</button>';
    document.body.prepend(bar);bar.querySelector('button').addEventListener('click',()=>{if(confirm('ลบข้อมูลทดลองทั้งหมดในเบราว์เซอร์นี้?'))window.ENRLocalDemo.reset();});
    if(location.pathname.endsWith('/login.html')){
      const form=document.getElementById('loginForm');
      if(form){const notice=document.createElement('div');notice.style.cssText='padding:12px;margin:12px 0;background:#e8f6ed;border:1px solid #a7dcb5;border-radius:9px;color:#185a36';notice.textContent='ทดลองด้วย Frontend V3 ตัวจริง: ระบบจำลองการเข้าสู่ระบบเท่านั้น ห้ามใช้รหัสผ่านส่วนตัวหรือข้อมูลผู้ป่วยจริง';form.before(notice);
      const button=document.createElement('button');button.type='button';button.textContent='เข้าทดลอง Frontend V3 (ไม่ต้องใช้รหัสผ่าน)';button.className='enr-btn enr-btn--primary';button.style.cssText='width:100%;padding:12px;margin:8px 0;cursor:pointer;background:#1761a0;color:white;border:0;border-radius:9px';button.onclick=async()=>{const data=await window.ENR.api.login('demo','');window.ENR.setSession(data.session);location.href=new URL('ward.html',base).href;};form.before(button);}
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner,{once:true});else banner();
})();
