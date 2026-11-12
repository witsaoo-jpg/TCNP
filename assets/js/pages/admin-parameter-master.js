document.addEventListener("DOMContentLoaded", () => {
  const Store = window.ParameterMasterStore;
  if (!Store) {
    alert("ParameterMasterStore ไม่พร้อมใช้งาน");
    return;
  }

  if (window.ENR?.requireSession && !ENR.requireSession()) return;

  const $ = (id) => document.getElementById(id);
  const session = window.ENR?.getSession?.() || {};
  $("adminUser").textContent =
    session.display_name ||
    session.displayName ||
    session.username ||
    "Nursing Admin";

  let selectedCode = null;
  let selectedSystem = false;

  function actor() {
    return session.username || "nursing_admin";
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function fmtDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("th-TH", {
      year:"numeric", month:"short", day:"numeric",
      hour:"2-digit", minute:"2-digit", hour12:false,
    });
  }

  function badge(def) {
    if (def.graphicLocked) {
      return `
        <span class="pm-badge pm-badge--fixed">FIXED</span>
        <span class="pm-badge pm-badge--core">CORE</span>
      `;
    }

    if (def.systemLocked && def.adminManageable) {
      return `
        <span class="pm-badge pm-badge--core">CORE</span>
        ${
          def.status === "RETIRED"
            ? `<span class="pm-badge pm-badge--retired">RETIRED</span>`
            : `<span class="pm-badge pm-badge--active">ACTIVE</span>`
        }
      `;
    }

    return def.status === "RETIRED"
      ? `<span class="pm-badge pm-badge--retired">RETIRED</span>`
      : `<span class="pm-badge pm-badge--active">ACTIVE</span>`;
  }

  function filteredRows() {
    const query = $("parameterSearch").value.trim().toLocaleLowerCase("th-TH");
    const filter = $("parameterFilter").value;

    return Store.all().filter((def) => {
      const haystack = [
        def.code, def.nameTh, def.nameEn, def.shortLabel, def.unit,
        def.graphicMapping, def.scopeType, def.scopeValue,
      ].join(" ").toLocaleLowerCase("th-TH");

      if (query && !haystack.includes(query)) return false;
      if (filter === "CORE" && !def.systemLocked) return false;
      if (filter === "CUSTOM_ACTIVE" && (def.systemLocked || def.status !== "ACTIVE")) return false;
      if (filter === "CUSTOM_RETIRED" && (def.systemLocked || def.status !== "RETIRED")) return false;
      return true;
    });
  }

  function renderSummary() {
    const rows = Store.all();
    const custom = rows.filter((x) => !x.systemLocked);
    const manageableCore = rows.filter((x) => x.systemLocked && x.adminManageable);
    const fixedGraphic = rows.filter((x) => x.graphicLocked);

    const cards = [
      ["Graphic Core • FIXED", fixedGraphic.length],
      ["Manageable Core", manageableCore.length],
      ["Custom ACTIVE", custom.filter((x) => x.status === "ACTIVE").length],
      ["RETIRED", rows.filter((x) => x.adminManageable && x.status === "RETIRED").length],
    ];

    $("summaryCards").innerHTML = cards.map(([label,value]) => `
      <div class="pm-summary-card">
        <span>${esc(label)}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }

  function renderList() {
    const rows = filteredRows();

    $("parameterList").innerHTML = rows.length
      ? rows.map((def) => `
          <button
            type="button"
            class="pm-list-item ${selectedCode === def.code ? "is-selected" : ""}"
            data-code="${esc(def.code)}"
          >
            <div class="pm-list-item__top">
              <span class="pm-code">${esc(def.code)}</span>
              <span>
                ${def.showInGraphicSheet ? `<span class="pm-badge pm-badge--graphic">GRAPHIC</span>` : ""}
                ${badge(def)}
              </span>
            </div>
            <div class="pm-list-item__name">${esc(def.nameTh || def.nameEn || "-")}</div>
            <div class="pm-list-item__meta">
              ${esc(def.dataType)} • ${esc(def.unit || "ไม่มีหน่วย")} • ${esc(def.scopeType)}
              ${def.scopeValue ? ` • ${esc(def.scopeValue)}` : ""}
            </div>
          </button>
        `).join("")
      : `<div class="pm-audit-empty">ไม่พบ Parameter</div>`;

    $("parameterList").querySelectorAll("[data-code]").forEach((button) => {
      button.addEventListener("click", () => selectDefinition(button.dataset.code));
    });
  }

  function renderAudit() {
    const rows = Store.audit(20);

    $("auditList").innerHTML = rows.length
      ? rows.map((row) => `
          <div class="pm-audit-row">
            <span>${esc(fmtDate(row.at))}</span>
            <strong>${esc(row.action)}</strong>
            <span>${esc(row.parameterCode || "-")}</span>
            <span>${esc(row.parameterName || "-")} • ${esc(row.by || "-")}</span>
          </div>
        `).join("")
      : `<div class="pm-audit-empty">ยังไม่มีการเปลี่ยนแปลง Custom Parameter</div>`;
  }

  function syncTypeFields() {
    const type = $("parameterDataType").value;
    document.querySelectorAll(".pm-number-only").forEach((el) => {
      el.hidden = type !== "NUMBER";
    });
    $("selectOptionsField").hidden = type !== "SELECT";
  }

  function syncScope() {
    $("wardScopeField").hidden = $("parameterScope").value !== "WARD";
  }

  function clearEditor() {
    selectedCode = null;
    selectedSystem = false;

    $("systemParameterView").hidden = true;
    $("parameterForm").hidden = false;
    $("saveParameterBtn").hidden = false;

    $("editorKicker").textContent = "CREATE CUSTOM PARAMETER";
    $("editorTitle").textContent = "เพิ่ม Parameter";
    $("editorSubtext").textContent =
      "Custom Parameter จะแสดงใน Patient Parameters แต่ไม่ Plot ใน Graphic Sheet";

    $("parameterForm").reset();
    $("parameterId").value = "";
    $("parameterCode").readOnly = false;
    $("parameterDecimals").value = "0";
    $("parameterOrder").value = "900";
    $("parameterScope").value = "HOSPITAL";
    $("parameterStatus").value = "ACTIVE";
    $("showInParameters").checked = true;
    $("showInMonitoringTrend").checked = false;
    syncTypeFields();
    syncScope();
    renderList();
  }

  function renderSystem(def) {
    selectedCode = def.code;
    selectedSystem = true;

    $("parameterForm").hidden = true;
    $("systemParameterView").hidden = false;
    $("saveParameterBtn").hidden = true;

    if (def.graphicLocked) {
      $("editorKicker").textContent = "GRAPHIC CORE • FIXED";
      $("editorTitle").textContent = `${def.code} • ${def.nameTh || def.nameEn}`;
      $("editorSubtext").textContent =
        "อยู่ในฟอร์มปรอทแล้ว • Nursing Admin ดูได้อย่างเดียว และไม่สามารถ Retire/แก้ Graphic Mapping";
    } else if (def.adminManageable) {
      $("editorKicker").textContent = "CORE PARAMETER • STATUS MANAGEABLE";
      $("editorTitle").textContent = `${def.code} • ${def.nameTh || def.nameEn}`;
      $("editorSubtext").textContent =
        "แก้คำจำกัดความไม่ได้ แต่ Nursing Admin สามารถ ACTIVE / RETIRED การรับค่ารายการใหม่ได้";
    } else {
      $("editorKicker").textContent = "CORE / SYSTEM PARAMETER";
      $("editorTitle").textContent = `${def.code} • ${def.nameTh || def.nameEn}`;
      $("editorSubtext").textContent = "Core Parameter ถูกควบคุมโดยระบบ";
    }

    const lockBanner = $("systemParameterView").querySelector(".pm-lock-banner");
    if (lockBanner) {
      lockBanner.innerHTML = def.graphicLocked
        ? `<strong>🔒 Graphic Core • FIXED</strong>
           <span>อยู่ใน Graphic Sheet แล้ว • ไม่ Retire • ไม่แก้ mapping จาก Nursing Admin</span>`
        : `<strong>🛡 Core Definition • Locked</strong>
           <span>คำจำกัดความล็อก แต่สถานะการรับค่ารายการใหม่จัดการได้</span>`;
    }

    const detailRows = [
      ["Code", def.code],
      ["Thai Name", def.nameTh || "-"],
      ["English Name", def.nameEn || "-"],
      ["Type", def.dataType],
      ["Unit", def.unit || "-"],
      ["Patient Parameters", def.showInParameters ? "YES" : "NO"],
      ["Monitoring Trend", def.showInMonitoringTrend ? "YES" : "NO"],
      ["Graphic Sheet", def.showInGraphicSheet ? "YES • FIXED" : "NO"],
      ["Graphic Mapping", def.graphicMapping || "NONE"],
      ["Scope", def.scopeType],
      ["Status", def.status],
      ["Admin Status", def.adminManageable ? "MANAGEABLE" : "LOCKED"],
    ];

    $("systemParameterDetails").innerHTML = detailRows.map(([label,value]) => `
      <div class="pm-system-detail">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
      </div>
    `).join("");

    const statusControl = $("systemStatusControl");
    statusControl.hidden = !def.adminManageable;

    if (def.adminManageable) {
      $("systemParameterStatus").value = def.status || "ACTIVE";
      $("saveSystemStatusBtn").textContent =
        def.status === "RETIRED" ? "Restore → ACTIVE" : "Retire Parameter";
      $("saveSystemStatusBtn").classList.toggle(
        "pm-btn--retire",
        def.status !== "RETIRED"
      );
    }

    renderList();
  }

  function renderCustom(def) {
    selectedCode = def.code;
    selectedSystem = false;

    $("systemParameterView").hidden = true;
    $("parameterForm").hidden = false;
    $("saveParameterBtn").hidden = false;

    $("editorKicker").textContent = "EDIT CUSTOM PARAMETER";
    $("editorTitle").textContent = `${def.code} • ${def.nameTh || def.nameEn}`;
    $("editorSubtext").textContent =
      "แก้ไข metadata ได้ • Code ล็อก • Graphic Sheet ยังคง System Controlled";

    $("parameterId").value = def.id || "";
    $("parameterCode").value = def.code || "";
    $("parameterCode").readOnly = true;
    $("parameterNameTh").value = def.nameTh || "";
    $("parameterNameEn").value = def.nameEn || "";
    $("parameterShortLabel").value = def.shortLabel || "";
    $("parameterDataType").value = def.dataType || "NUMBER";
    $("parameterUnit").value = def.unit || "";
    $("parameterMin").value = def.minValue ?? "";
    $("parameterMax").value = def.maxValue ?? "";
    $("parameterDecimals").value = def.decimalPlaces ?? 0;
    $("parameterOrder").value = def.displayOrder ?? 900;
    $("parameterScope").value = def.scopeType || "HOSPITAL";
    $("parameterWard").value = def.scopeValue || "";
    $("parameterOptions").value = (def.options || []).join("\n");
    $("showInParameters").checked = def.showInParameters !== false;
    $("showInMonitoringTrend").checked = def.showInMonitoringTrend === true;
    $("parameterStatus").value = def.status || "ACTIVE";

    syncTypeFields();
    syncScope();
    renderList();
  }

  function selectDefinition(code) {
    const def = Store.get(code);
    if (!def) return;

    if (def.systemLocked) renderSystem(def);
    else renderCustom(def);
  }

  function collect() {
    return {
      id:$("parameterId").value || null,
      code:$("parameterCode").value,
      nameTh:$("parameterNameTh").value,
      nameEn:$("parameterNameEn").value,
      shortLabel:$("parameterShortLabel").value,
      dataType:$("parameterDataType").value,
      unit:$("parameterUnit").value,
      minValue:$("parameterMin").value,
      maxValue:$("parameterMax").value,
      decimalPlaces:$("parameterDecimals").value,
      displayOrder:$("parameterOrder").value,
      scopeType:$("parameterScope").value,
      scopeValue:$("parameterWard").value,
      optionsText:$("parameterOptions").value,
      showInParameters:$("showInParameters").checked,
      showInMonitoringTrend:$("showInMonitoringTrend").checked,
      status:$("parameterStatus").value,
    };
  }

  function save() {
    try {
      const row = Store.saveCustom(collect(), actor());
      selectedCode = row.code;
      renderSummary();
      renderAudit();
      renderCustom(row);
      alert(`บันทึก Parameter ${row.code} แล้ว`);
    } catch (error) {
      alert(error?.message || String(error));
    }
  }

  function saveSystemStatus() {
    if (!selectedCode) return;

    const current = Store.get(selectedCode);
    if (!current || !current.adminManageable) {
      alert("Parameter นี้ถูก FIX และไม่อนุญาตให้เปลี่ยนสถานะ");
      return;
    }

    const target = $("systemParameterStatus").value;
    const message = target === "RETIRED"
      ? `Retire ${current.code}?\n\nหยุดแสดงช่องสำหรับบันทึกใหม่ แต่ข้อมูลย้อนหลังจะไม่ถูกลบ`
      : `Restore ${current.code} กลับเป็น ACTIVE?`;

    if (!confirm(message)) return;

    try {
      const updated = Store.setStatus(current.code, target, actor());
      renderSummary();
      renderAudit();
      renderSystem(updated);
    } catch (error) {
      alert(error?.message || String(error));
    }
  }

  $("newParameterBtn").addEventListener("click", clearEditor);
  $("resetEditorBtn").addEventListener("click", () => {
    if (selectedCode && !selectedSystem) {
      const row = Store.customByCode(selectedCode);
      if (row) renderCustom(row);
      else clearEditor();
    } else {
      clearEditor();
    }
  });
  $("saveParameterBtn").addEventListener("click", save);
  $("saveSystemStatusBtn").addEventListener("click", saveSystemStatus);
  $("parameterSearch").addEventListener("input", renderList);
  $("parameterFilter").addEventListener("change", renderList);
  $("parameterDataType").addEventListener("change", syncTypeFields);
  $("parameterScope").addEventListener("change", syncScope);

  renderSummary();
  renderAudit();
  clearEditor();
});
