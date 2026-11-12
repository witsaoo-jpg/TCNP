document.addEventListener("DOMContentLoaded", () => {
  const el = (id) => document.getElementById(id);
  if (!window.ENR || !window.ParameterStore || !window.IOEngine) return;
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient?.() || {};
  const ward = ENR.getWard?.() || {};
  el("patientName").textContent = patient.name || patient.displayName || "-";
  el("patientHN").textContent = patient.hn || "-";
  el("patientAN").textContent = patient.an || patient.encounterNo || "-";
  el("patientWard").textContent = patient.wardName || ward.name || "-";
  el("patientDX").textContent = patient.dx || patient.diagnosis || "-";

  let rangeHours = 0;
  const fmt = (v) => v === null || v === undefined || v === "" ? "-" : v;
  const fmtDate = (v) => new Date(v).toLocaleString("th-TH", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});

  function rowsForRange() {
    const rows = ParameterStore.read(patient)
      .filter((r) => r.status !== "CANCELLED")
      .sort((a,b) => new Date(a.observedAt) - new Date(b.observedAt));
    if (!rangeHours || !rows.length) return rows;
    const end = Math.max(...rows.map(r => new Date(r.observedAt).getTime()));
    const start = end - rangeHours*3600000;
    return rows.filter(r => new Date(r.observedAt).getTime() >= start);
  }

  function renderChart(rows) {
    const box = el("trendChart");
    const empty = el("trendEmpty");
    if (!rows.length) { box.innerHTML=""; empty.hidden=false; return; }
    empty.hidden=true;

    const W=1200,H=330,L=56,R=56,T=28,B=52;
    const times = rows.map(r => new Date(r.observedAt).getTime());
    const minX=Math.min(...times), maxX=Math.max(...times);
    const span=Math.max(maxX-minX, 60*60*1000);
    const x=(ms)=>L+((ms-minX)/span)*(W-L-R);
    const yT=(v)=>T+(41-Number(v))/(41-35)*(H-T-B);
    const yP=(v)=>T+(160-Number(v))/(160-40)*(H-T-B);

    const tempPts = rows.filter(r => Number.isFinite(Number(r.values?.temp))).map(r => ({x:x(new Date(r.observedAt).getTime()),y:yT(r.values.temp),r}));
    const pulsePts = rows.filter(r => Number.isFinite(Number(r.values?.pulse))).map(r => ({x:x(new Date(r.observedAt).getTime()),y:yP(r.values.pulse),r}));
    const poly = (pts,cls) => pts.length ? `<polyline class="${cls}" points="${pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}"/>` : "";
    const circles = (pts,cls) => pts.map(p=>`<circle class="${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"><title>${fmtDate(p.r.observedAt)}</title></circle>`).join("");

    let grids="", labels="";
    for(let i=0;i<=6;i++){const gy=T+i*(H-T-B)/6; grids+=`<line class="mt-grid" x1="${L}" y1="${gy}" x2="${W-R}" y2="${gy}"/>`;}
    const tickCount=Math.min(8,Math.max(2,rows.length));
    for(let i=0;i<tickCount;i++){const tm=minX+(span*i/(tickCount-1));const gx=x(tm);grids+=`<line class="mt-grid" x1="${gx}" y1="${T}" x2="${gx}" y2="${H-B}"/>`;labels+=`<text class="mt-time-label" x="${gx}" y="${H-22}" text-anchor="middle">${fmtDate(tm)}</text>`;}

    box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monitoring trend">
      ${grids}<line class="mt-axis" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"/>
      <text class="mt-y-label" x="8" y="${T+8}">41°C / 160</text><text class="mt-y-label" x="8" y="${H-B}">35°C / 40</text>
      ${poly(tempPts,"mt-temp-line")}${poly(pulsePts,"mt-pulse-line")}${circles(tempPts,"mt-temp-point")}${circles(pulsePts,"mt-pulse-point")}${labels}
    </svg>`;
  }

  function renderRows(rows){
    el("trendRows").innerHTML = [...rows].reverse().map(r=>{
      const io=IOEngine.totalsForValues(r.values||{});
      const bal=io.intake-io.output;
      return `<tr><td>${fmtDate(r.observedAt)}</td><td>${fmt(r.values?.temp)}</td><td>${fmt(r.values?.pulse)}</td><td>${fmt(r.values?.resp)}</td><td>${fmt(r.values?.sbp)} / ${fmt(r.values?.dbp)}</td><td>${fmt(r.values?.spo2)}</td><td>${fmt(r.values?.sos)}</td><td>${fmt(r.values?.pain)}</td><td>${fmt(r.values?.gcsTotal)}</td><td>I ${io.intake||0} / O ${io.output||0} / Bal ${bal>0?"+":""}${bal}</td></tr>`;
    }).join("");
  }

  function render(){const rows=rowsForRange();renderChart(rows);renderRows(rows);}
  document.querySelectorAll(".mt-range-btn").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".mt-range-btn").forEach(b=>b.classList.remove("mt-range-btn--active"));btn.classList.add("mt-range-btn--active");rangeHours=Number(btn.dataset.hours||0);render();}));
  render();
});
