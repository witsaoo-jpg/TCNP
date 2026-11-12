const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'assets/js/mock/browser-api.js'),'utf8');
function simulate() {
  const memory = new Map();
  const network=[];
  const store = {
    getItem(k) { return memory.has(k)?memory.get(k):null; },
    setItem(k,v) { memory.set(k,String(v)); },
    removeItem(k) { memory.delete(k); },
    key(i) { return Array.from(memory.keys())[i] ?? null; },
    get length(){return memory.size;}
  };
  const location={href:'https://witsaoo-jpg.github.io/TCNP/login.html',origin:'https://witsaoo-jpg.github.io',pathname:'/TCNP/login.html'};
  const fetch=async (uri) => {
    network.push(String(uri));
    const u=new URL(String(uri));
    const filename=u.pathname.replace('/TCNP/','');
    return new Response(fs.readFileSync(path.join(root,filename)),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const window={ENR_CONFIG:{USE_MOCK_DATA:true},fetch,location,localStorage:store,sessionStorage:store};
  const ctx={window,document:{readyState:'loading',currentScript:{src:'https://witsaoo-jpg.github.io/TCNP/assets/js/mock/browser-api.js'},baseURI:location.href,addEventListener(){}},
    localStorage:store,sessionStorage:store,fetch,location,URL,Response,console,confirm:()=>true};
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  const api=(url,method='GET',body) => ctx.window.fetch('/api/'+url,{method,...(body?{body:JSON.stringify(body)}:{})}).then(async r=>({status:r.status,body:await r.json()}));
  return {api,memory,network,window,location};
}
test('TCNP v1.8 search returns genuine code and Thai label', async()=>{
  const d=simulate();
  const r=await d.api('tcnp/search?q=F0019&section_code=F');
  assert.equal(r.status,200);
  assert.equal(r.body.items[0].code,'F0019');
  assert.equal(r.body.items[0].name_th,'คลื่นไส้');
  assert.ok(d.network.every(x=>x.includes('/TCNP/data/')));
});
test('all wards including 34 and only synthetic patients are available',async()=>{
  const d=simulate();const wards=await d.api('org-units?ward_only=1');
  assert.ok(wards.body.units.some(w=>w.code==='34'));
  const patients=await d.api('patients?unit_code=34');
  assert.equal(patients.body.patients.length,3);
  assert.ok(patients.body.patients.every(p=>p.hn.startsWith('DEMO-34-')));
});
test('DRAFT, SIGNED, post-sign history and summary stay in localStorage',async()=>{
  const d=simulate();
  const created=await d.api('patients/34001/nursing-problems/compose','POST',{
    clinical_datetime:'2026-11-12T12:00:00Z',patient_type_level:2,
    custom_items:[{section_code:'F',tcnp_code:'F0019',source_type:'TCNP',note_text:'คลื่นไส้',display_order:1},{section_code:'I',tcnp_code:'P0001',source_type:'TCNP',note_text:'สอนการดูแลตนเอง',display_order:2}]
  });
  assert.equal(created.status,200);
  const id=created.body.note_id;
  let notes=await d.api('patients/34001/nursing-notes');
  assert.equal(notes.body.notes[0].note_status,'DRAFT');
  assert.equal(notes.body.notes[0].items[0].tcnp_code,'F0019');
  assert.equal((await d.api(`nursing-notes/${id}/sign`,'POST',{})).status,200);
  assert.equal((await d.api(`v3/nursing-notes/${id}`,'PATCH',{items:[]})).status,409);
  assert.equal((await d.api(`nursing-notes/${id}/amendment-actions`,'POST',{amendment_type:'ADDENDUM',amendment_text:'ทดลองบันทึกเพิ่มเติม'})).status,200);
  let history=await d.api(`nursing-notes/${id}/amendment-actions`);
  assert.equal(history.body.active_count,1);
  const summary=await d.api('patients/34001/nursing-problem-summary');
  assert.equal(summary.body.counts.active,1);
  assert.equal(summary.body.active[0].focus_code,'F0019');
  assert.ok([...d.memory.keys()].some(x=>x.startsWith('tcnp.v3.presentation.')));
  assert.equal((await d.api('patients/34002/nursing-notes')).body.notes.length,0);
});
test('mock login never checks or sends a real secret to a network server',async()=>{
  const d=simulate();
  const r=await d.api('auth/login','POST',{username:'demo',password:'not-used'});
  assert.equal(r.body.authenticated,true);
  assert.equal(r.body.user.username,'demo');
  assert.equal(d.network.length,0);
});
