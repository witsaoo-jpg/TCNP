document.addEventListener("DOMContentLoaded", () => {
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient();
  const ward = ENR.getWard();

  if (!patient) {
    location.href = "patient_list.html";
    return;
  }

  const el = (id) => document.getElementById(id);
  const form = el("parameterForm");
  const observedAt = el("observedAt");
  const slotPreview = el("slotPreview");
  const recordsBody = el("recordsBody");
  const emptyState = el("emptyState");
  const cancelledArchiveBtn = el("cancelledArchiveBtn");
  const tableModeDescription = el("tableModeDescription");
  const archiveNote = el("archiveNote");
  let tableMode = "ACTIVE";
  const gcsTotal = el("gcsTotal");
  const additionalParameterSection = el("additionalParameterSection");
  const additionalParameterFields = el("additionalParameterFields");
  const additionalParameterCount = el("additionalParameterCount");

  el("patientName").textContent = patient.name || patient.display_name || "ผู้ป่วย";
  el("patientHN").textContent = patient.hn || "-";
  el("patientAN").textContent = patient.an || patient.encounter_no || "-";
  el("patientWard").textContent = patient.wardName || patient.ward_name || ward?.name || "-";
  el("patientDX").textContent = patient.dx || patient.principal_diagnosis_text || "-";

  function setObservedTimeToNow({ forceValue = true } = {}) {
    const now = new Date();
    const localNow = ParameterStore.localDateTimeValue(now);

    // No min attribute: nurses can backdate to the actual measurement time.
    // max = current local time: prevents accidental future documentation.
    observedAt.max = localNow;

    if (forceValue || !observedAt.value) {
      observedAt.value = localNow;
    }

    updateSlotPreview();
  }

  setObservedTimeToNow({ forceValue: true });

  const useCurrentTimeBtn = el("useCurrentTimeBtn");
  useCurrentTimeBtn?.addEventListener("click", () => {
    setObservedTimeToNow({ forceValue: true });
    observedAt.focus();
  });

  // Keep the maximum permitted time reasonably current while the page remains open.
  window.setInterval(() => {
    const nowValue = ParameterStore.localDateTimeValue(new Date());
    observedAt.max = nowValue;
  }, 60000);

  const numberOrNull = (formData, key) => ParameterStore.parseNumber(formData.get(key));
  const textOrNull = (formData, key) => {
    const v = String(formData.get(key) || "").trim();
    return v || null;
  };

  function parameterMasterContext() {
    return {
      wardCode:
        ward?.code ||
        ward?.unit_code ||
        patient?.wardCode ||
        patient?.ward_code ||
        "",
      wardName:
        ward?.name ||
        patient?.wardName ||
        patient?.ward_name ||
        "",
      orgUnitCode:
        patient?.org_unit_code ||
        patient?.orgUnitCode ||
        "",
      orgUnitName:
        patient?.org_unit_name ||
        patient?.orgUnitName ||
        "",
    };
  }

  function activeAdditionalDefinitions() {
    if (!window.ParameterMasterStore) return [];
    return ParameterMasterStore.activeAdditional(parameterMasterContext());
  }

  function applyManagedCoreAvailability() {
    if (!window.ParameterMasterStore) return;

    document.querySelectorAll("[data-master-parameter]").forEach((container) => {
      const code = container.dataset.masterParameter;
      const definition = ParameterMasterStore.get(code);
      const retired =
        definition &&
        definition.adminManageable &&
        definition.status === "RETIRED";

      container.hidden = Boolean(retired);

      container.querySelectorAll("input,select,textarea,button").forEach((control) => {
        control.disabled = Boolean(retired);
        if (retired && "value" in control) control.value = "";
      });
    });

    updateGCS();
  }

  function customInputName(code) {
    return `pm_${String(code || "").replace(/[^A-Z0-9_]/gi, "_")}`;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderAdditionalParameters() {
    if (!additionalParameterSection || !additionalParameterFields) return;

    const defs = activeAdditionalDefinitions();
    additionalParameterSection.hidden = defs.length === 0;
    additionalParameterCount.textContent = `${defs.length} รายการ`;

    additionalParameterFields.innerHTML = defs.map((def) => {
      const name = customInputName(def.code);
      const label = def.nameTh || def.nameEn || def.code;
      const unit = def.unit ? ` (${def.unit})` : "";
      const common = `name="${esc(name)}" data-parameter-code="${esc(def.code)}"`;

      let control = "";

      if (def.dataType === "TEXT") {
        control = `<input ${common} type="text" placeholder="${esc(def.shortLabel || label)}">`;
      } else if (def.dataType === "BOOLEAN") {
        control = `
          <select ${common}>
            <option value="">-</option>
            <option value="true">Yes / Positive</option>
            <option value="false">No / Negative</option>
          </select>
        `;
      } else if (def.dataType === "SELECT") {
        control = `
          <select ${common}>
            <option value="">-</option>
            ${(def.options || []).map((option) =>
              `<option value="${esc(option)}">${esc(option)}</option>`
            ).join("")}
          </select>
        `;
      } else {
        const decimals = Math.max(0, Number(def.decimalPlaces || 0));
        const step = decimals > 0 ? (1 / (10 ** decimals)).toFixed(decimals) : "1";
        const min = def.minValue === null || def.minValue === undefined
          ? "" : `min="${esc(def.minValue)}"`;
        const max = def.maxValue === null || def.maxValue === undefined
          ? "" : `max="${esc(def.maxValue)}"`;

        control = `
          <input
            ${common}
            type="number"
            inputmode="${decimals > 0 ? "decimal" : "numeric"}"
            step="${step}"
            ${min}
            ${max}
            placeholder="${esc(def.shortLabel || label)}"
          >
        `;
      }

      return `
        <label class="pp-field pp-dynamic-parameter">
          <span>${esc(label)}${esc(unit)}</span>
          ${control}
          <small>${esc(def.code)} • ${esc(def.scopeType)} • ไม่ Plot Graphic Sheet</small>
        </label>
      `;
    }).join("");
  }

  function collectAdditionalParameters() {
    const defs = activeAdditionalDefinitions();
    const out = {};

    defs.forEach((def) => {
      const input = form.elements[customInputName(def.code)];
      if (!input) return;

      const raw = String(input.value ?? "").trim();
      if (raw === "") return;

      let value = raw;
      if (def.dataType === "NUMBER") {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        value = n;
      } else if (def.dataType === "BOOLEAN") {
        value = raw === "true";
      }

      /*
        Snapshot critical metadata with the observation.
        If Admin later renames/retires the master, old documentation
        still explains exactly what was recorded.
      */
      out[def.code] = {
        value,
        code:def.code,
        nameTh:def.nameTh || "",
        nameEn:def.nameEn || "",
        shortLabel:def.shortLabel || def.code,
        unit:def.unit || "",
        dataType:def.dataType,
        masterUpdatedAt:def.updatedAt || def.createdAt || null,
      };
    });

    return Object.keys(out).length ? out : null;
  }

  function additionalValueHtml(row) {
    const values = row?.values?.additionalParameters;
    if (!values || typeof values !== "object") return "-";

    const rows = Object.values(values);
    if (!rows.length) return "-";

    return `
      <div class="pp-additional-cell">
        ${rows.map((item) => {
          const label = item.shortLabel || item.code || item.nameTh || "Parameter";
          const value = item.value === true
            ? "Yes"
            : item.value === false
              ? "No"
              : item.value;
          return `
            <span class="pp-additional-chip">
              <b>${esc(label)}</b>
              <span>${esc(value)}${item.unit ? ` ${esc(item.unit)}` : ""}</span>
            </span>
          `;
        }).join("")}
      </div>
    `;
  }

  renderAdditionalParameters();
  applyManagedCoreAvailability();

  function readGcsComponent(name, min, max) {
    const input = form.elements[name];
    if (!input) return null;

    const raw = String(input.value ?? "").trim();
    if (raw === "") return null;

    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    return n;
  }

  function computeGcs() {
    const e = readGcsComponent("gcsE", 1, 4);
    const v = readGcsComponent("gcsV", 1, 5);
    const m = readGcsComponent("gcsM", 1, 6);

    const complete = [e, v, m].every((x) => Number.isInteger(x));
    const total = complete ? e + v + m : "";

    gcsTotal.value = total;
    gcsTotal.dataset.complete = complete ? "true" : "false";
    gcsTotal.setAttribute(
      "aria-label",
      complete ? `GCS Total ${total}` : "GCS Total รอคะแนน Eye Verbal Motor ให้ครบ"
    );

    const hint = document.getElementById("gcsTotalHint");
    if (hint) {
      hint.textContent = complete
        ? `รวมอัตโนมัติ: ${e} + ${v} + ${m} = ${total}`
        : "กรอก E + V + M ให้ครบ ระบบจะรวมคะแนนอัตโนมัติ";
      hint.className = complete ? "pp-gcs-total-hint pp-gcs-total-hint--ready" : "pp-gcs-total-hint";
    }

    return total;
  }

  ["gcsE", "gcsV", "gcsM"].forEach((name) => {
    const input = form.elements[name];
    ["input", "change", "keyup", "blur"].forEach((eventName) => {
      input?.addEventListener(eventName, computeGcs);
    });
  });

  // Initial sync in case browser restores form values after reload.
  computeGcs();

  const intakeItemsEl = el("intakeItems");
  const outputItemsEl = el("outputItems");

  function sourceOptions(direction) {
    return IOSourceMaster.byDirection(direction)
      .map((s) => `<option value="${s.code}">${s.name}</option>`)
      .join("");
  }

  function makeFlexibleIORow(direction, initial = {}) {
    const row = document.createElement("div");
    row.className = "pp-io-item";
    row.dataset.direction = direction;

    row.innerHTML = `
      <label class="pp-io-item__source">
        <span>Type</span>
        <select data-field="sourceCode">${sourceOptions(direction)}</select>
      </label>
      <label class="pp-io-item__custom" hidden>
        <span>ชื่อรายการ</span>
        <input data-field="customName" type="text" placeholder="กำหนดชื่อเอง">
      </label>
      <label>
        <span>Site</span>
        <input data-field="site" type="text" placeholder="เช่น chest / abdomen">
      </label>
      <label>
        <span>Side</span>
        <select data-field="laterality">
          <option value="">-</option>
          <option value="R">Right</option>
          <option value="L">Left</option>
          <option value="B">Bilateral</option>
        </select>
      </label>
      <label>
        <span>Amount (mL)</span>
        <input data-field="amountMl" type="number" min="0" step="1" inputmode="numeric">
      </label>
      <label class="pp-io-item__note">
        <span>Note</span>
        <input data-field="note" type="text" placeholder="รายละเอียดเพิ่มเติม">
      </label>
      <button type="button" class="pp-io-remove-btn" title="นำรายการออก">นำออก</button>
    `;

    const sourceSelect = row.querySelector('[data-field="sourceCode"]');
    const customWrap = row.querySelector('.pp-io-item__custom');

    const syncCustom = () => {
      const source = IOSourceMaster.find(sourceSelect.value);
      customWrap.hidden = !source?.customName;
      if (!source?.customName) {
        row.querySelector('[data-field="customName"]').value = "";
      }
    };

    if (initial.sourceCode) sourceSelect.value = initial.sourceCode;
    ["customName", "site", "laterality", "amountMl", "note"].forEach((key) => {
      const input = row.querySelector(`[data-field="${key}"]`);
      if (input && initial[key] !== undefined && initial[key] !== null) input.value = initial[key];
    });

    sourceSelect.addEventListener("change", () => {
      syncCustom();
      computeCurrentIO();
    });
    row.querySelectorAll("input,select").forEach((input) => {
      ["input", "change", "keyup", "blur"].forEach((eventName) => {
        input.addEventListener(eventName, computeCurrentIO);
      });
    });
    row.querySelector(".pp-io-remove-btn").addEventListener("click", () => {
      row.remove();
      computeCurrentIO();
    });

    syncCustom();
    return row;
  }

  function addFlexibleIOItem(direction, initial = {}) {
    const target = direction === "IN" ? intakeItemsEl : outputItemsEl;
    target?.appendChild(makeFlexibleIORow(direction, initial));
    computeCurrentIO();
  }

  function collectFlexibleIOEvents() {
    const rows = [...document.querySelectorAll(".pp-io-item")];
    const events = rows.map((row) => {
      const field = (name) => row.querySelector(`[data-field="${name}"]`)?.value ?? "";
      const sourceCode = field("sourceCode");
      const source = IOSourceMaster.find(sourceCode);
      const amountMl = Number(field("amountMl"));

      if (!sourceCode || !Number.isFinite(amountMl) || amountMl <= 0) return null;

      return {
        direction: row.dataset.direction,
        sourceCode,
        sourceName: source?.shortName || source?.name || sourceCode,
        customName: field("customName").trim() || null,
        site: field("site").trim() || null,
        laterality: field("laterality") || null,
        amountMl,
        note: field("note").trim() || null,
        status: "ACTIVE",
      };
    }).filter(Boolean);

    return events.length ? events : null;
  }

  function clearFlexibleIOItems() {
    if (intakeItemsEl) intakeItemsEl.innerHTML = "";
    if (outputItemsEl) outputItemsEl.innerHTML = "";
  }

  el("addIntakeItem")?.addEventListener("click", () => addFlexibleIOItem("IN"));
  el("addOutputItem")?.addEventListener("click", () => addFlexibleIOItem("OUT"));

  function numericFieldValue(name) {
    const input = form.elements[name];
    if (!input) return 0;
    const n = Number(input.value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function computeCurrentIO() {
    const values = {
      oralFluid: numericFieldValue("oralFluid"),
      parenteralFluid: numericFieldValue("parenteralFluid"),
      urineMl: numericFieldValue("urineMl"),
      emesisMl: numericFieldValue("emesisMl"),
      ioEvents: collectFlexibleIOEvents(),
    };

    const { intake, output, balance } = IOEngine.totalsForValues(values);

    const intakeEl = el("ioIntakeTotal");
    const outputEl = el("ioOutputTotal");
    const balanceEl = el("ioBalance");

    if (intakeEl) intakeEl.textContent = String(intake);
    if (outputEl) outputEl.textContent = String(output);
    if (balanceEl) {
      balanceEl.textContent = balance > 0 ? `+${balance}` : String(balance);
      balanceEl.dataset.balance = balance > 0 ? "positive" : balance < 0 ? "negative" : "zero";
    }

    return { intake, output, balance };
  }

  [
    "oralFluid",
    "parenteralFluid",
    "urineMl",
    "emesisMl",
  ].forEach((name) => {
    const input = form.elements[name];
    ["input", "change", "keyup", "blur"].forEach((eventName) => {
      input?.addEventListener(eventName, computeCurrentIO);
    });
  });

  computeCurrentIO();

  function updateSlotPreview() {
    const slot = ParameterStore.targetSlotForObservedAt(observedAt.value);

    if (slot.eligible) {
      slotPreview.className = "pp-slot pp-slot--eligible";
      slotPreview.innerHTML = `
        <strong>Eligible → ${slot.slotLabel}</strong>
        <small>
          วัดจริง ${slot.actualTime} • ต่าง ${slot.diffMinutes} นาที •
          หลังบันทึก ระบบจะเลือกค่าที่ใกล้ ${slot.slotLabel} ที่สุด
        </small>
      `;
    } else {
      slotPreview.className = "pp-slot pp-slot--outside";
      slotPreview.innerHTML = `
        <strong>ไม่เข้า Plot window</strong>
        <small>ยังเก็บใน Parameters table / Audit ตามเวลาที่วัดจริง</small>
      `;
    }
  }

  observedAt.addEventListener("change", updateSlotPreview);
  observedAt.addEventListener("input", updateSlotPreview);
  updateSlotPreview();

  function payloadFromForm() {
    computeGcs();
    const fd = new FormData(form);

    return {
      observedAt: fd.get("observedAt"),
      createdBy: ENR.getSession?.()?.username || "demo_nurse",
      orgUnit: ward?.name || patient.wardName || patient.ward_name || null,
      values: {
        temp: numberOrNull(fd, "temp"),
        pulse: numberOrNull(fd, "pulse"),
        resp: numberOrNull(fd, "resp"),
        sbp: numberOrNull(fd, "sbp"),
        dbp: numberOrNull(fd, "dbp"),
        spo2: numberOrNull(fd, "spo2"),
        sos: numberOrNull(fd, "sos"),
        pain: numberOrNull(fd, "pain"),
        sedative: numberOrNull(fd, "sedative"),
        braden: numberOrNull(fd, "braden"),
        pps: numberOrNull(fd, "pps"),
        oxygenNote: textOrNull(fd, "oxygenNote"),
        gcsE: numberOrNull(fd, "gcsE"),
        gcsV: numberOrNull(fd, "gcsV"),
        gcsM: numberOrNull(fd, "gcsM"),
        gcsTotal: ParameterStore.parseNumber(gcsTotal.value),
        gcsNote: textOrNull(fd, "gcsNote"),
        weight: numberOrNull(fd, "weight"),
        height: numberOrNull(fd, "height"),
        diet: textOrNull(fd, "diet"),
        oralFluid: numberOrNull(fd, "oralFluid"),
        parenteralFluid: numberOrNull(fd, "parenteralFluid"),
        intakeNote: textOrNull(fd, "intakeNote"),
        urineMl: numberOrNull(fd, "urineMl"),
        drainageMl: null,
        emesisMl: numberOrNull(fd, "emesisMl"),
        otherOutputMl: null,
        outputNote: textOrNull(fd, "outputNote"),
        ioEvents: collectFlexibleIOEvents(),
        stool: textOrNull(fd, "stool"),
        urineNote: textOrNull(fd, "urineNote"),
        medicationNote: textOrNull(fd, "medicationNote"),
        additionalParameters: collectAdditionalParameters(),
      },
    };
  }

  function hasClinicalValue(payload) {
    return Object.values(payload.values).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === "object") return Object.keys(v).length > 0;
      return v !== null && v !== "";
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const payload = payloadFromForm();
    if (!payload.observedAt) {
      alert("กรุณาระบุวันที่และเวลาที่วัด");
      return;
    }

    const observedDate = new Date(payload.observedAt);
    const now = new Date();
    if (Number.isNaN(observedDate.getTime())) {
      alert("วันที่/เวลาที่วัดไม่ถูกต้อง");
      return;
    }

    if (observedDate.getTime() > now.getTime() + 60000) {
      alert("ไม่สามารถบันทึกเวลาในอนาคตได้ กรุณาใช้เวลาปัจจุบันหรือเลือกย้อนหลัง");
      setObservedTimeToNow({ forceValue: true });
      return;
    }

    const painScore = payload.values.pain;
    if (
      painScore !== null &&
      (
        !Number.isFinite(Number(painScore)) ||
        !Number.isInteger(Number(painScore)) ||
        Number(painScore) < 0 ||
        Number(painScore) > 10
      )
    ) {
      alert("Pain Score ต้องเป็นจำนวนเต็ม 0–10");
      const painInput = form.elements.namedItem("pain");
      painInput?.focus?.();
      return;
    }

    if (!hasClinicalValue(payload)) {
      alert("กรุณากรอก Parameter อย่างน้อย 1 รายการ");
      return;
    }

    ParameterStore.save(patient, payload);
    alert("บันทึก Patient Parameters แล้ว");
    resetClinicalFields();
    renderTable();
  });

  function resetClinicalFields() {
    form.reset();
    gcsTotal.value = "";
    setObservedTimeToNow({ forceValue: true });
    computeGcs();
    clearFlexibleIOItems();
    computeCurrentIO();
  }

  el("clearFormBtn").addEventListener("click", resetClinicalFields);

  function fmtDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("th-TH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
  }

  function val(row, key, suffix = "") {
    const v = row.values?.[key];
    return v === null || v === undefined || v === "" ? "-" : `${v}${suffix}`;
  }

  function graphChip(state) {
    const cls = state.code === "PLOT"
      ? "pp-graph-chip--plot"
      : state.code === "ELIGIBLE_NOT_SELECTED"
        ? "pp-graph-chip--backup"
        : "pp-graph-chip--outside";

    const detail = state.detail
      ? `<small class="pp-graph-chip__detail">${state.detail}</small>`
      : "";

    return `
      <span class="pp-graph-chip ${cls}">
        <strong>${state.label}</strong>
        ${detail}
      </span>
    `;
  }

  function renderTable() {
    const allRows = ParameterStore.read(patient)
      .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)));

    const activeRows = allRows.filter((r) => r.status !== "CANCELLED");
    const cancelledRows = allRows.filter((r) => r.status === "CANCELLED");
    const rows = tableMode === "CANCELLED" ? cancelledRows : activeRows;

    if (cancelledArchiveBtn) {
      cancelledArchiveBtn.textContent = tableMode === "CANCELLED"
        ? `← กลับรายการใช้งาน ${activeRows.length}`
        : `🚫 ยกเลิกแล้ว ${cancelledRows.length}`;
      cancelledArchiveBtn.classList.toggle("pp-cancelled-archive-btn--active", tableMode === "CANCELLED");
    }

    if (tableModeDescription) {
      tableModeDescription.textContent = tableMode === "CANCELLED"
        ? "กำลังแสดงเฉพาะรายการที่ยกเลิก • Read only • ไม่มีผลต่อกราฟ/Trend/I&O"
        : "แสดงเฉพาะรายการ ACTIVE เพื่อไม่ให้ตารางรก • รายการที่ยกเลิกยังเก็บไว้ใน Audit/Archive";
    }

    if (archiveNote) archiveNote.hidden = tableMode !== "CANCELLED";

    recordsBody.innerHTML = "";
    emptyState.hidden = rows.length > 0;
    if (!rows.length) {
      emptyState.textContent = tableMode === "CANCELLED"
        ? "ยังไม่มีรายการ Parameters ที่ถูกยกเลิก"
        : "ยังไม่มี Patient Parameters ที่ใช้งานสำหรับผู้ป่วยรายนี้";
    }

    rows.forEach((row) => {
      const state = ParameterStore.graphState(row, allRows);
      const ioTotals = IOEngine.totalsForValues(row.values || {});
      const intake = ioTotals.intake;
      const output = ioTotals.output;
      const flexInText = IOEngine.groupedText(IOEngine.eventsFromValues(row.values || {}, "IN"));
      const flexOutText = IOEngine.groupedText(IOEngine.eventsFromValues(row.values || {}, "OUT"));
      const ioDetail = [
        flexInText ? `IN: ${flexInText}` : "",
        flexOutText ? `OUT: ${flexOutText}` : "",
      ].filter(Boolean).join(" | ");

      const tr = document.createElement("tr");
      if (row.status === "CANCELLED") tr.classList.add("pp-row--cancelled");

      const cancelAudit = row.status === "CANCELLED"
        ? `<div class="pp-cancel-audit">
             <strong>ยกเลิกเมื่อ ${fmtDateTime(row.cancelledAt)}</strong>
             <span>เหตุผล: ${row.cancelReason || "-"}</span>
           </div>`
        : "";

      tr.innerHTML = `
        <td>
          <strong>${fmtDateTime(row.observedAt)}</strong><br>
          <small>System: ${fmtDateTime(row.createdAt)}</small>
          ${cancelAudit}
        </td>
        <td>${graphChip(state)}</td>
        <td>${val(row,"temp")}</td>
        <td>${val(row,"pulse")}</td>
        <td>${val(row,"resp")}</td>
        <td>${val(row,"sbp")} / ${val(row,"dbp")}</td>
        <td>${val(row,"spo2")}</td>
        <td>${val(row,"sos")}</td>
        <td>${val(row,"pain")}</td>
        <td>${val(row,"sedative")}</td>
        <td>${val(row,"gcsTotal")}</td>
        <td>${val(row,"braden")}</td>
        <td>${additionalValueHtml(row)}</td>
        <td class="pp-table-io">
          <span>I <b>${intake || 0}</b></span>
          <span>O <b>${output || 0}</b></span>
          <span>Bal <b>${(intake - output) > 0 ? "+" : ""}${intake - output}</b></span>
          ${ioDetail ? `<small class="pp-table-io__detail">${ioDetail}</small>` : ""}
        </td>
        <td><span class="pp-status-chip ${row.status === "CANCELLED" ? "pp-status-chip--cancelled" : "pp-status-chip--active"}">${row.status}</span></td>
        <td>${row.status === "CANCELLED" ? "" : `<button class="pp-cancel-btn" data-id="${row.id}">ยกเลิก</button>`}</td>
      `;
      recordsBody.appendChild(tr);
    });

    recordsBody.querySelectorAll(".pp-cancel-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const reason = prompt("เหตุผลการยกเลิกรายการ Parameters:");
        if (reason === null) return;
        if (!String(reason).trim()) {
          alert("กรุณาระบุเหตุผลการยกเลิก เพื่อ Audit trail");
          return;
        }
        const ok = confirm("ยืนยันยกเลิกรายการนี้? ข้อมูลจะไม่ถูกลบ และจะย้ายไป Cancelled Archive");
        if (!ok) return;
        ParameterStore.cancel(patient, button.dataset.id, reason.trim());
        tableMode = "ACTIVE";
        renderTable();
      });
    });
  }

  cancelledArchiveBtn?.addEventListener("click", () => {
    tableMode = tableMode === "ACTIVE" ? "CANCELLED" : "ACTIVE";
    renderTable();
  });

  function addDemoData() {
    const base = new Date();
    base.setSeconds(0,0);

    const examples = [
      { deltaMin: 0, temp:37.4, pulse:88, resp:20, sbp:126, dbp:74, spo2:98, pain:2, sos:1, sedative:0, gcsTotal:15, braden:19 },
      { deltaMin: 250, temp:38.2, pulse:104, resp:22, sbp:118, dbp:70, spo2:96, pain:4, sos:3, sedative:0, gcsTotal:15, braden:19 },
      { deltaMin: 490, temp:37.8, pulse:96, resp:20, sbp:122, dbp:72, spo2:97, pain:3, sos:2, sedative:0, gcsTotal:15, braden:19 },
    ];

    examples.forEach((e, idx) => {
      const d = new Date(base.getTime() + e.deltaMin * 60000);
      ParameterStore.save(patient, {
        observedAt: ParameterStore.localDateTimeValue(d),
        createdBy: "demo_nurse",
        orgUnit: ward?.name || null,
        values: {
          ...e,
          weight: idx === 0 ? 60.2 : null,
          height: idx === 0 ? 165 : null,
          diet: idx === 0 ? "Regular" : null,
          oralFluid: idx === 0 ? 250 : 100,
          parenteralFluid: idx === 0 ? 500 : null,
          urineMl: idx === 1 ? 300 : null,
          stool: idx === 2 ? "1 ครั้ง" : null,
        },
      });
    });

    renderTable();
  }

  el("demoBtn").addEventListener("click", addDemoData);

  window.addEventListener("storage", (event) => {
    const Master = window.ParameterMasterStore;
    if (!Master) return;

    if (event.key === Master.CORE_OVERRIDE_KEY || event.key === Master.STORAGE_KEY) {
      renderAdditionalParameters();
      applyManagedCoreAvailability();
    }
  });

  renderTable();
});