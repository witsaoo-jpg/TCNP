(() => {
  const state = {
    meta: { groups: [], units: [], users: [], access: null, taxonomy: { domains: [], classes: [], action_types: [] } },
    overview: null,
    diagnoses: null,
    interventions: null,
    outcomes: null,
    activeTab: 'overview',
    loadingOverview: false,
    loadingClinical: false,
  };

  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('th-TH');
  const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
  const DONUT_COLORS = ['#0a897d','#56aa9f','#8bbdb7','#b4cfcb','#617e87','#8ea3aa','#c1cdd1','#d9e1e3'];

  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function setRange(days) {
    const end = new Date();
    const start = new Date();
    if (Number(days) > 0) start.setDate(end.getDate() - Number(days) + 1);
    $('fromDate').value = isoDate(start);
    $('toDate').value = isoDate(end);
    document.querySelectorAll('.analytics-quickrange button').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.days) === Number(days));
    });
  }



  // CP5.10: Analytics remains available to authenticated ENR users.
  // Admin Dashboard visibility is derived from the server, not browser storage.
  async function analyticsSessionGuard() {
    try {
      const sessionResponse = await fetch('/api/auth/session', { credentials: 'include', headers: { Accept: 'application/json' } });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !session.authenticated) {
        location.href = '/v3/login.html';
        return null;
      }

      const user = session.user || {};
      const userEl = document.getElementById('adminUser');
      if (userEl) userEl.textContent = user.full_name_th || user.username || 'ผู้ใช้งาน';

      const adminLink = document.getElementById('adminDashboardLink');
      if (adminLink) {
        adminLink.hidden = true;
        try {
          const statusResponse = await fetch('/api/admin/auth/status', { credentials: 'include', headers: { Accept: 'application/json' } });
          const status = await statusResponse.json().catch(() => ({}));
          adminLink.hidden = !(statusResponse.ok && status.eligible);
        } catch (_) {
          adminLink.hidden = true;
        }
      }

      return session;
    } catch (_) {
      location.href = '/v3/login.html';
      return null;
    }
  }

  async function request(path, params = {}) {
    const url = new URL(path, location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, value);
    });
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      const error = new Error(body.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function currentFilters(extra = {}) {
    return {
      from: $('fromDate').value,
      to: $('toDate').value,
      group: $('groupFilter').value,
      unit_id: $('unitFilter').value,
      user_id: $('userFilter').value,
      status: $('statusFilter').value,
      tcnp_type: $('tcnpTypeFilter').value,
      metric: $('metricSelect').value,
      dimension: $('dimensionSelect').value,
      bucket: $('bucketSelect').value,
      top: $('topSelect').value,
      ...extra,
    };
  }

  function fillSelect(select, items, valueKey, labelFn, keepFirst = true) {
    const previous = String(select.value || '');
    const first = keepFirst ? select.options[0]?.outerHTML || '' : '';
    select.innerHTML = first;
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item[valueKey];
      option.textContent = labelFn(item);
      if (item.group_code) option.dataset.group = item.group_code;
      if (item.domain_id) option.dataset.domainId = String(item.domain_id);
      select.appendChild(option);
    });
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
  }

  function renderUnitOptions() {
    const group = $('groupFilter').value;
    const previous = $('unitFilter').value;
    const units = state.meta.units.filter((unit) => !group || unit.group_code === group);
    fillSelect($('unitFilter'), units, 'id', (u) => `${u.code || ''} • ${u.name}`);
    if (previous && units.some((u) => String(u.id) === String(previous))) {
      $('unitFilter').value = previous;
    } else if (state.meta.access?.scope_level === 'WARD' && units.length) {
      $('unitFilter').value = String(units[0].id);
    }
    updateScopeLine();
  }

  function populateTaxonomy(meta) {
    const taxonomy = meta.taxonomy || { domains: [], classes: [], action_types: [] };
    state.meta.taxonomy = taxonomy;
    fillSelect($('diagnosisDomain'), taxonomy.domains || [], 'id', (d) => `${d.code || ''}${d.code ? ' • ' : ''}${d.name_th || d.name_en || 'Domain'}`);
    renderClassOptions();
    if (taxonomy.warning) {
      $('taxonomyWarning').hidden = false;
      $('taxonomyWarning').textContent = `TCNP Hierarchy: ${taxonomy.warning} — Diagnoses/Interventions/Outcomes ยังใช้ F/P ได้ตามปกติ แต่ Domain/Class อาจยังไม่แสดงจนกว่าจะให้ SELECT permission ตาราง taxonomy`;
    } else {
      $('taxonomyWarning').hidden = true;
    }
  }

  function renderClassOptions() {
    const domainId = Number($('diagnosisDomain').value || 0);
    const classes = (state.meta.taxonomy.classes || []).filter((c) => !domainId || !Number(c.domain_id) || Number(c.domain_id) === domainId);
    fillSelect($('diagnosisClass'), classes, 'id', (c) => `${c.code || ''}${c.code ? ' • ' : ''}${c.name_th || c.name_en || 'Class'}`);
  }

  function applyAccessUi(access) {
    access = access || {};
    state.meta.access = access;
    const groupSelect = $('groupFilter');
    const unitSelect = $('unitFilter');
    const userSelect = $('userFilter');
    const groups = access.allowed_group_codes || [];
    const units = access.allowed_unit_ids || [];

    if (['GROUP','WARD'].includes(access.scope_level) && groups.length) {
      if (!groupSelect.value || !groups.includes(groupSelect.value)) groupSelect.value = groups[0];
    }
    renderUnitOptions();
    if (access.scope_level === 'WARD' && units.length) {
      if (!unitSelect.value || !units.map(String).includes(String(unitSelect.value))) unitSelect.value = String(units[0]);
    }
    if (access.self_only) {
      const own = state.meta.users?.[0];
      if (own) userSelect.value = String(own.id);
    }

    // UI lock is only a usability feature. The backend enforces the same scope.
    groupSelect.disabled = access.scope_level === 'GROUP' && groups.length === 1 || access.scope_level === 'WARD' && groups.length === 1;
    unitSelect.disabled = access.scope_level === 'WARD' && units.length === 1;
    userSelect.disabled = Boolean(access.self_only);

    const pill = $('accessScopePill');
    if (pill) {
      pill.textContent = access.hospital_wide
        ? '👁 Read only • Analytics ทั้งโรงพยาบาล'
        : `🔒 ${access.label || access.role_code || 'Analytics scope'}`;
    }
  }

  function populateMeta(meta) {
    state.meta = { ...state.meta, ...meta, access: meta.access || null };
    fillSelect($('groupFilter'), meta.groups || [], 'code', (g) => `${g.code} • ${g.name}`);
    fillSelect($('userFilter'), meta.users || [], 'id', (u) => `${u.display_name}${u.username ? ` • ${u.username}` : ''}`);
    applyAccessUi(meta.access || {});
    populateTaxonomy(meta);
    updateScopeLine();
  }

  function updateScopeLine() {
    if (!$('scopeLine')) return;
    const groupOpt = $('groupFilter').selectedOptions[0];
    const unitOpt = $('unitFilter').selectedOptions[0];
    const userOpt = $('userFilter').selectedOptions[0];
    const parts = [];
    if ($('groupFilter').value) parts.push(groupOpt?.textContent || $('groupFilter').value);
    if ($('unitFilter').value) parts.push(unitOpt?.textContent || $('unitFilter').value);
    if ($('userFilter').value) parts.push(`พยาบาล: ${userOpt?.textContent || $('userFilter').value}`);
    const access = state.meta.access;
    const accessText = access?.label ? `สิทธิ์: ${access.label} • ` : '';
    $('scopeLine').textContent = `${accessText}ขอบเขต: ${parts.length ? parts.join('  ›  ') : 'ทั้งโรงพยาบาล'} • ${$('fromDate').value || '-'} ถึง ${$('toDate').value || '-'} • ${$('statusFilter').selectedOptions[0]?.textContent || ''}`;
  }

  function allowedChartTypes(dimension) {
    if (dimension === 'time') return [['line','📈 เส้น'],['bar','📊 แท่ง'],['area','▰ พื้นที่']];
    return [['bar','📊 แท่ง'],['donut','◔ วงแหวน']];
  }

  function updateChartControls() {
    const dimension = $('dimensionSelect').value;
    const select = $('chartTypeSelect');
    const previous = select.value;
    select.innerHTML = '';
    allowedChartTypes(dimension).forEach(([value,label]) => {
      const option = document.createElement('option'); option.value=value; option.textContent=label; select.appendChild(option);
    });
    if ([...select.options].some((o)=>o.value===previous)) select.value=previous;
    $('bucketWrap').hidden = dimension !== 'time';
    $('topWrap').hidden = !['group','unit','user','tcnp'].includes(dimension);
    if (dimension === 'tcnp' && $('metricSelect').value !== 'tcnp_usage') $('metricSelect').value = 'tcnp_usage';
  }

  function metricLabel(metric) {
    return ({ tcnp_usage:'จำนวน TCNP', notes:'จำนวน Nursing Note', patients:'จำนวนผู้ป่วย', manual_items:'จำนวน Manual' })[metric] || metric;
  }
  function dimensionLabel(dimension) {
    return ({ time:'ตามเวลา', group:'ตามกลุ่มงาน', unit:'ตามหน่วยงาน', user:'ตามพยาบาล', tcnp:'ตามรหัส TCNP' })[dimension] || dimension;
  }

  function niceMax(max) {
    if (!max || max <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(max));
    const n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' })[c]);
  }

  function truncate(value, max = 32) {
    const s = String(value || '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function renderBar(container, rows, opts = {}) {
    const width = opts.width || 1100;
    const height = opts.height || Math.max(350, rows.length * (opts.band || 34) + 55);
    const pad = { l: opts.padLeft || 220, r: 75, t: 18, b: 30 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const max = niceMax(Math.max(...rows.map((r)=>Number(r.value||0)),1));
    const n = Math.max(rows.length,1);
    const band = plotH / n;
    const barH = Math.min(28, band * .62);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" style="height:${height}px">`;
    [0,.25,.5,.75,1].forEach((f)=>{
      const x=pad.l+plotW*f;
      svg += `<line class="chart-grid-line" x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t+plotH}"/><text class="chart-axis-label" x="${x}" y="${height-7}" text-anchor="middle">${nf.format(Math.round(max*f))}</text>`;
    });
    rows.forEach((row,i)=>{
      const value=Number(row.value||0); const y=pad.t+band*i+(band-barH)/2; const w=plotW*value/max;
      const full=String(row.label||row.key||''); const label=truncate(full,opts.labelMax||38);
      svg += `<text class="chart-axis-label" x="${pad.l-10}" y="${y+barH/2+4}" text-anchor="end"><title>${escapeXml(full)}</title>${escapeXml(label)}</text>`;
      svg += `<rect class="chart-bar${i%2?' chart-bar-alt':''}" x="${pad.l}" y="${y}" width="${Math.max(w,1)}" height="${barH}" rx="5"><title>${escapeXml(full)}: ${nf.format(value)}</title></rect>`;
      svg += `<text class="chart-value-label" x="${Math.min(pad.l+w+8,width-10)}" y="${y+barH/2+4}">${nf.format(value)}</text>`;
    });
    svg += '</svg>'; container.innerHTML=svg;
  }

  function renderLine(container, rows, area = false) {
    const width=1100,height=350,pad={l:58,r:24,t:24,b:52},plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;
    const max=niceMax(Math.max(...rows.map(r=>Number(r.value||0)),1));
    const xAt=(i)=>rows.length<=1?pad.l+plotW/2:pad.l+plotW*i/(rows.length-1); const yAt=(v)=>pad.t+plotH-plotH*Number(v||0)/max;
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img">`;
    [0,.25,.5,.75,1].forEach((f)=>{const y=pad.t+plotH*(1-f);svg+=`<line class="chart-grid-line" x1="${pad.l}" y1="${y}" x2="${pad.l+plotW}" y2="${y}"/><text class="chart-axis-label" x="${pad.l-9}" y="${y+4}" text-anchor="end">${nf.format(Math.round(max*f))}</text>`;});
    const pts=rows.map((r,i)=>`${xAt(i)},${yAt(r.value)}`).join(' ');
    if(area&&rows.length)svg+=`<polygon class="chart-area" points="${pad.l},${pad.t+plotH} ${pts} ${xAt(rows.length-1)},${pad.t+plotH}"/>`;
    svg+=`<polyline class="chart-line" points="${pts}"/>`;
    const step=Math.max(1,Math.ceil(rows.length/8));
    rows.forEach((row,i)=>{const x=xAt(i),y=yAt(row.value);svg+=`<circle class="chart-point" cx="${x}" cy="${y}" r="4"><title>${escapeXml(row.label)}: ${nf.format(row.value)}</title></circle>`;if(i%step===0||i===rows.length-1)svg+=`<text class="chart-axis-label" x="${x}" y="${height-17}" text-anchor="middle">${escapeXml(truncate(row.label,12))}</text>`;});
    svg+='</svg>';container.innerHTML=svg;
  }

  function renderDonut(container, rows, centerLabel = '', colors = DONUT_COLORS) {
    const sorted=rows.filter(r=>Number(r.value)>0).slice(0,8); const total=sorted.reduce((s,r)=>s+Number(r.value||0),0);
    const width=500,height=300,cx=250,cy=143,r=86,circ=2*Math.PI*r; let offset=0;
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img"><circle class="chart-donut-bg" cx="${cx}" cy="${cy}" r="${r}"/>`;
    sorted.forEach((row,i)=>{const fraction=total?Number(row.value)/total:0,dash=Math.max(0,circ*fraction);svg+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="26" stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeXml(row.label)}: ${nf.format(row.value)}</title></circle>`;offset+=dash;});
    svg+=`<text class="chart-donut-label" x="${cx}" y="${cy+3}">${nf.format(total)}</text><text class="chart-donut-sub" x="${cx}" y="${cy+23}">${escapeXml(centerLabel||'รวม')}</text></svg>`;container.innerHTML=svg;
  }

  function renderStacked100(container, rows) {
    const width=1200, rowH=45, height=Math.max(410, rows.length*rowH+70), pad={l:285,r:30,t:24,b:45},plotW=width-pad.l-pad.r;
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" style="height:${height}px">`;
    [0,25,50,75,100].forEach((v)=>{const x=pad.l+plotW*v/100;svg+=`<line class="chart-grid-line" x1="${x}" y1="${pad.t}" x2="${x}" y2="${height-pad.b}"/><text class="chart-axis-label" x="${x}" y="${height-12}" text-anchor="middle">${v}%</text>`;});
    rows.forEach((row,i)=>{
      const y=pad.t+i*rowH+6,h=25;const imp=Number(row.improved_pct||0),st=Number(row.stable_pct||0),wo=Number(row.worse_pct||0);
      const label=`${row.code || ''} • ${row.name_th || row.name_en || ''}`;
      svg+=`<text class="chart-stack-label" x="${pad.l-10}" y="${y+17}" text-anchor="end"><title>${escapeXml(label)}</title>${escapeXml(truncate(label,38))}</text>`;
      let x=pad.l;
      [[imp,'chart-stack-improved','ดีขึ้น'],[st,'chart-stack-stable','คงตัว'],[wo,'chart-stack-worse','แย่ลง']].forEach(([value,cls,name])=>{
        const w=plotW*value/100;if(w>0){svg+=`<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${w>10?3:0}"><title>${name} ${value.toFixed(1)}%</title></rect>`;if(value>=9)svg+=`<text class="chart-stack-pct" x="${x+w/2}" y="${y+17}">${value.toFixed(0)}%</text>`;x+=w;}
      });
    });
    svg+='</svg>';container.innerHTML=svg;
  }

  // ---------- Overview renderers ----------
  function renderOverviewChart() {
    const rows=state.overview?.chart||[],container=$('mainChart');$('chartEmpty').hidden=rows.length>0;container.hidden=rows.length===0;if(!rows.length){container.innerHTML='';return;}
    const type=$('chartTypeSelect').value;if(type==='line')renderLine(container,rows,false);else if(type==='area')renderLine(container,rows,true);else if(type==='donut')renderDonut(container,rows,metricLabel($('metricSelect').value));else renderBar(container,rows,{padLeft:240});
    $('mainChartTitle').textContent=`${metricLabel($('metricSelect').value)} ${dimensionLabel($('dimensionSelect').value)}`;
    $('mainChartSubtitle').textContent=`${$('fromDate').value} ถึง ${$('toDate').value} • ${$('statusFilter').selectedOptions[0].textContent}`;
    $('chartTableBody').innerHTML=rows.map(r=>`<tr><td>${ENRAdmin.escape(r.label||r.key)}</td><td class="is-number">${nf.format(r.value||0)}</td></tr>`).join('');
  }

  function renderKpis() {
    const k=state.overview?.kpis||{};$('kpiNotes').textContent=nf.format(k.notes||0);$('kpiTcnp').textContent=nf.format(k.tcnp_usage||0);$('kpiPatients').textContent=nf.format(k.patients||0);$('kpiNurses').textContent=nf.format(k.nurses||0);$('kpiAdoption').textContent=pct(k.tcnp_adoption_pct||0);
  }
  function renderMix(){const m=state.overview?.mix||{tcnp:0,manual:0};renderDonut($('mixChart'),[{label:'TCNP',value:m.tcnp||0},{label:'Manual',value:m.manual||0}],'items');$('mixTcnp').textContent=nf.format(m.tcnp||0);$('mixManual').textContent=nf.format(m.manual||0);}
  function renderTopCodes(){const list=state.overview?.top_codes||[];$('topCodeScope').textContent=`Top ${list.length||10}`;$('topCodesList').innerHTML=list.length?list.map((r,i)=>`<div class="analytics-rank-row"><span class="analytics-rank-no">${i+1}</span><div class="analytics-rank-name"><strong>${ENRAdmin.escape(r.code||'-')} • ${ENRAdmin.escape(r.name_th||'')}</strong><span>${ENRAdmin.escape(r.name_en||'')}</span></div><span class="analytics-rank-value">${nf.format(r.value||0)}</span></div>`).join(''):'<div class="admin-empty admin-empty--compact">ยังไม่มี TCNP ในช่วงเวลานี้</div>';}
  function renderOutcomeDonut(){const rows=state.overview?.outcomes||[];renderDonut($('outcomeChart'),rows.map(r=>({label:r.name_th||r.code,value:r.value})),'evaluations');$('outcomeLegend').innerHTML=rows.map(r=>`<span class="analytics-outcome-pill">${ENRAdmin.escape(r.name_th||r.code)} <strong>${nf.format(r.value||0)}</strong></span>`).join('');}
  function renderUsers(){const rows=state.overview?.user_activity||[];$('userActivityBody').innerHTML=rows.length?rows.map(r=>`<tr><td><div class="analytics-user-name"><strong>${ENRAdmin.escape(r.display_name||r.username||`User #${r.user_id}`)}</strong><span>${ENRAdmin.escape(r.username||'')}</span></div></td><td class="is-number">${nf.format(r.notes||0)}</td><td class="is-number">${nf.format(r.patients||0)}</td><td class="is-number">${nf.format(r.tcnp_usage||0)}</td><td class="is-number">${nf.format(r.manual_items||0)}</td><td class="is-number">${Number(r.items_per_note||0).toFixed(1)}</td></tr>`).join(''):'<tr><td colspan="6" class="admin-empty admin-empty--compact">ยังไม่มีข้อมูล</td></tr>';}
  function renderGroups(){const rows=state.overview?.group_activity||[];$('groupActivity').innerHTML=rows.length?rows.map(r=>`<button type="button" class="analytics-group-card" data-group-code="${ENRAdmin.escape(r.group_code||'')}"><strong>${ENRAdmin.escape(r.group_name||r.group_code||'ไม่ระบุกลุ่มงาน')}</strong><small>${ENRAdmin.escape(r.group_code||'')}</small><div class="analytics-group-metrics"><span><b>${nf.format(r.notes||0)}</b> Notes</span><span><b>${nf.format(r.patients||0)}</b> Patients</span><span><b>${nf.format(r.nurses||0)}</b> Nurses</span></div></button>`).join(''):'<div class="admin-empty">ยังไม่มีข้อมูลกลุ่มงานในช่วงเวลานี้</div>';document.querySelectorAll('[data-group-code]').forEach(btn=>btn.addEventListener('click',()=>{const code=btn.dataset.groupCode;if([...$('groupFilter').options].some(o=>o.value===code)){$('groupFilter').value=code;renderUnitOptions();loadAllForCurrentScope();}}));}
  function renderPaperlessModules(){
    const k=state.overview?.kpis||{};
    const notes=Number(k.notes||0),patients=Number(k.patients||0),nurses=Number(k.nurses||0),adoption=Number(k.tcnp_adoption_pct||0);
    if($('moduleNoteRecords')) $('moduleNoteRecords').textContent=nf.format(notes);
    if($('moduleNotePatients')) $('moduleNotePatients').textContent=nf.format(patients);
    if($('moduleNoteNurses')) $('moduleNoteNurses').textContent=nf.format(nurses);
    if($('moduleNoteAdoption')) $('moduleNoteAdoption').textContent=`${adoption.toFixed(1)}%`;
    const rows=[{label:'บันทึกทางการพยาบาล',value:notes,sub:'Nursing Note'}].filter(r=>r.value>=0);
    const host=$('moduleUsageChart');
    if(host){
      if(notes>0){renderBar(host,rows,{height:160,padLeft:230,labelMax:36});}
      else{host.innerHTML='<div class="admin-empty admin-empty--compact">ยังไม่มี Nursing Note ในขอบเขตที่เลือก</div>';}
    }
  }
  function openNursingNoteAnalytics(){
    switchTab('overview');
    document.querySelector('.analytics-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderOverview(){renderKpis();renderPaperlessModules();renderOverviewChart();renderMix();renderTopCodes();renderOutcomeDonut();renderUsers();renderGroups();}

  // ---------- Diagnoses ----------
  function renderRankList(container, rows, valueKey='value') {
    container.innerHTML=rows.length?rows.slice(0,12).map((r,i)=>`<div class="analytics-rank-row"><span class="analytics-rank-no">${i+1}</span><div class="analytics-rank-name"><strong>${ENRAdmin.escape(r.label||r.name_th||r.code||'')}</strong><span>${ENRAdmin.escape(r.code||'')}</span></div><span class="analytics-rank-value">${nf.format(r[valueKey]||0)}</span></div>`).join(''):'<div class="admin-empty admin-empty--compact">ยังไม่มีข้อมูล</div>';
  }

  function renderDiagnoses() {
    const d=state.diagnoses||{}, rows=d.top_diagnoses||[];
    $('diagnosisCountBadge').textContent=`Top ${rows.length||$('diagnosisTop').value}`;
    const chartRows=rows.map(r=>({label:`${r.code} • ${r.name_th||r.name_en||''}`,value:r.usages}));
    $('diagnosisEmpty').hidden=rows.length>0;$('diagnosisChart').hidden=rows.length===0;
    if(rows.length){if($('diagnosisChartType').value==='donut')renderDonut($('diagnosisChart'),chartRows,'F usages');else renderBar($('diagnosisChart'),chartRows,{height:Math.max(410,rows.length*42+60),padLeft:330,labelMax:48});}else $('diagnosisChart').innerHTML='';
    $('diagnosisTableBody').innerHTML=rows.length?rows.map(r=>`<tr><td><strong>${ENRAdmin.escape(r.code||'')}</strong> • ${ENRAdmin.escape(r.name_th||r.name_en||'')}</td><td class="is-number">${nf.format(r.usages||0)}</td><td class="is-number">${nf.format(r.notes||0)}</td><td class="is-number">${nf.format(r.patients||0)}</td></tr>`).join(''):'<tr><td colspan="4" class="admin-empty admin-empty--compact">ยังไม่มีข้อมูล</td></tr>';
    renderRankList($('domainBreakdown'),d.domain_breakdown||[]);
    renderRankList($('classBreakdown'),d.class_breakdown||[]);
  }

  async function loadDiagnoses(){if(state.loadingClinical)return;state.loadingClinical=true;showError(null);try{state.diagnoses=await request('/api/admin/analytics/diagnoses',currentFilters({domain_id:$('diagnosisDomain').value,class_id:$('diagnosisClass').value,top:$('diagnosisTop').value}));renderDiagnoses();}catch(e){showError(`โหลด Diagnoses Analytics ไม่สำเร็จ: ${e.message}`);}finally{state.loadingClinical=false;}}

  // ---------- Interventions ----------
  function populateFocusOptions(rows){const prev=$('interventionFocus').value;fillSelect($('interventionFocus'),rows||[],'code_id',(r)=>`${r.code} • ${r.name_th||r.name_en||''}`);if([...$('interventionFocus').options].some(o=>o.value===prev))$('interventionFocus').value=prev;}
  function actionTypeText(row) {
    const code = String(row?.action_code || '').trim().toUpperCase();
    if (!code) return '-';
    const label = row?.action_label_th || row?.action_label_en || '';
    return label ? `${code} • ${label}` : code;
  }

  function renderInterventions(){const d=state.interventions||{},actions=d.action_breakdown||[],rows=d.top_procedures||[];populateFocusOptions(d.focus_options||[]);renderDonut($('actionTypeChart'),actions.map(a=>({label:`${a.label_th} (${a.label_en})`,value:a.value})),'P items');$('actionTypeLegend').innerHTML=actions.length?actions.map((a,i)=>`<div class="analytics-action-item"><i class="legend-dot" style="background:${DONUT_COLORS[i%DONUT_COLORS.length]}"></i><strong>${ENRAdmin.escape(a.label_th||a.code)} <span>${nf.format(a.value||0)}</span></strong>${ENRAdmin.escape(a.label_en||'')}</div>`).join(''):'<div class="admin-empty admin-empty--compact">ยังไม่มีข้อมูล Action Type</div>';$('procedureCountBadge').textContent=`Top ${rows.length||$('interventionTop').value}`;const chartRows=rows.map(r=>({label:`${r.code} • ${r.name_th||r.name_en||''}`,value:r.usages}));$('procedureEmpty').hidden=rows.length>0;$('procedureChart').hidden=rows.length===0;if(rows.length){if($('interventionChartType').value==='donut')renderDonut($('procedureChart'),chartRows,'P usages');else renderBar($('procedureChart'),chartRows,{height:Math.max(410,rows.length*42+60),padLeft:330,labelMax:46});}else $('procedureChart').innerHTML='';$('procedureTableBody').innerHTML=rows.length?rows.map(r=>`<tr><td><strong>${ENRAdmin.escape(r.code||'')}</strong> • ${ENRAdmin.escape(r.name_th||r.name_en||'')}</td><td>${ENRAdmin.escape(actionTypeText(r))}</td><td class="is-number">${nf.format(r.usages||0)}</td><td class="is-number">${nf.format(r.notes||0)}</td><td class="is-number">${nf.format(r.patients||0)}</td></tr>`).join(''):'<tr><td colspan="5" class="admin-empty admin-empty--compact">ยังไม่มีข้อมูล</td></tr>';}
  async function loadInterventions(){if(state.loadingClinical)return;state.loadingClinical=true;showError(null);try{state.interventions=await request('/api/admin/analytics/interventions',currentFilters({focus_code_id:$('interventionFocus').value,top:$('interventionTop').value}));renderInterventions();}catch(e){showError(`โหลด Interventions Analytics ไม่สำเร็จ: ${e.message}`);}finally{state.loadingClinical=false;}}

  // ---------- Outcomes ----------
  function populateInterventionOptions(rows){const prev=$('outcomeIntervention').value;fillSelect($('outcomeIntervention'),rows||[],'code_id',(r)=>`${r.code} • ${r.name_th||r.name_en||''}`);if([...$('outcomeIntervention').options].some(o=>o.value===prev))$('outcomeIntervention').value=prev;}
  function renderClinicalOutcomes(){const d=state.outcomes||{},rows=d.outcome_by_diagnosis||[],t=d.totals||{};populateInterventionOptions(d.intervention_options||[]);$('outcomeImproved').textContent=nf.format(t.improved||0);$('outcomeStable').textContent=nf.format(t.stable||0);$('outcomeWorse').textContent=nf.format(t.worse||0);$('outcomeTotal').textContent=nf.format(t.total||0);$('outcomeStackedEmpty').hidden=rows.length>0;$('outcomeStackedChart').hidden=rows.length===0;if(rows.length)renderStacked100($('outcomeStackedChart'),rows);else $('outcomeStackedChart').innerHTML='';$('outcomeInterpretation').textContent=d.interpretation_note||'ผลลัพธ์นี้เป็นความสัมพันธ์จากข้อมูลเอกสารการพยาบาล ไม่ใช่หลักฐานเชิงสาเหตุ';}
  async function loadOutcomes(){if(state.loadingClinical)return;state.loadingClinical=true;showError(null);try{state.outcomes=await request('/api/admin/analytics/outcomes',currentFilters({intervention_code_id:$('outcomeIntervention').value,top:$('outcomeTop').value}));renderClinicalOutcomes();}catch(e){showError(`โหลด Outcomes Analytics ไม่สำเร็จ: ${e.message}`);}finally{state.loadingClinical=false;}}

  function showError(message){if(!message){$('analyticsError').hidden=true;$('analyticsError').innerHTML='';return;}$('analyticsError').hidden=false;$('analyticsError').innerHTML=`<strong>Analytics error</strong><br>${ENRAdmin.escape(message)}`;}

  async function loadOverview(){if(state.loadingOverview)return;state.loadingOverview=true;$('applyFilters').disabled=true;showError(null);if(state.activeTab==='overview')$('mainChart').innerHTML='<div class="analytics-loading">กำลังประมวลผลข้อมูลจาก PostgreSQL...</div>';try{state.overview=await request('/api/admin/analytics/overview',currentFilters());renderOverview();}catch(e){showError(`โหลด Analytics ไม่สำเร็จ: ${e.message}`);}finally{state.loadingOverview=false;$('applyFilters').disabled=false;}}

  async function loadActiveClinical(){if(state.activeTab==='diagnoses')return loadDiagnoses();if(state.activeTab==='interventions')return loadInterventions();if(state.activeTab==='outcomes')return loadOutcomes();}
  async function loadAllForCurrentScope(){updateScopeLine();await loadOverview();if(state.activeTab!=='overview')await loadActiveClinical();}

  function switchTab(tab){state.activeTab=tab;document.querySelectorAll('.analytics-tab').forEach(b=>b.classList.toggle('is-active',b.dataset.tab===tab));document.querySelectorAll('.analytics-tabpanel').forEach(p=>{const active=p.dataset.panel===tab;p.hidden=!active;p.classList.toggle('is-active',active);});if(tab==='overview')renderOverview();else loadActiveClinical();}

  function bindEvents(){
    $('applyFilters').addEventListener('click',loadAllForCurrentScope);
    $('groupFilter').addEventListener('change',()=>{renderUnitOptions();updateScopeLine();});
    $('unitFilter').addEventListener('change',updateScopeLine);$('userFilter').addEventListener('change',updateScopeLine);$('statusFilter').addEventListener('change',updateScopeLine);$('fromDate').addEventListener('change',updateScopeLine);$('toDate').addEventListener('change',updateScopeLine);
    $('dimensionSelect').addEventListener('change',()=>{updateChartControls();loadOverview();});$('metricSelect').addEventListener('change',()=>{updateChartControls();loadOverview();});$('bucketSelect').addEventListener('change',loadOverview);$('topSelect').addEventListener('change',loadOverview);$('chartTypeSelect').addEventListener('change',renderOverviewChart);
    document.querySelectorAll('.analytics-quickrange button').forEach(button=>button.addEventListener('click',()=>{setRange(Number(button.dataset.days));loadAllForCurrentScope();}));
    document.querySelectorAll('.analytics-tab').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
    const noteModuleCard=$('nursingNoteModuleCard');
    if(noteModuleCard){
      noteModuleCard.addEventListener('click',openNursingNoteAnalytics);
      noteModuleCard.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openNursingNoteAnalytics();}});
    }
    $('diagnosisDomain').addEventListener('change',()=>{renderClassOptions();loadDiagnoses();});$('diagnosisClass').addEventListener('change',loadDiagnoses);$('diagnosisTop').addEventListener('change',loadDiagnoses);$('diagnosisChartType').addEventListener('change',renderDiagnoses);
    $('interventionFocus').addEventListener('change',loadInterventions);$('interventionTop').addEventListener('change',loadInterventions);$('interventionChartType').addEventListener('change',renderInterventions);
    $('outcomeIntervention').addEventListener('change',loadOutcomes);$('outcomeTop').addEventListener('change',loadOutcomes);
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    ENRAdmin.bindChrome();const session=await analyticsSessionGuard();if(!session)return;setRange(30);updateChartControls();bindEvents();
    try{const meta=await request('/api/admin/analytics/meta');populateMeta(meta);await loadOverview();}catch(e){showError(`Analytics API ยังไม่พร้อม: ${e.message}`);}
  });
})();
