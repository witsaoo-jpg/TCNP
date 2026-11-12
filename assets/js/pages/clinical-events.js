document.addEventListener("DOMContentLoaded", () => {
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient();
  const ward = ENR.getWard();
  if (!patient) {
    location.href = "patient_list.html";
    return;
  }

  const Store = window.ClinicalEventStore;
  const $ = (id) => document.getElementById(id);

  const patientName = patient.name || patient.display_name || "ผู้ป่วย";
  const hn = patient.hn || "-";
  const an = patient.an || patient.encounter_no || "-";
  const wardName = patient.wardName || patient.ward_name || ward?.name || "-";
  const dx = patient.dx || patient.principal_diagnosis_text || "-";

  $("patientName").textContent = patientName;
  $("patientHN").textContent = hn;
  $("patientAN").textContent = an;
  $("patientWard").textContent = wardName;
  $("patientDX").textContent = dx;

  const form = $("clinicalEventForm");
  const eventAt = $("eventAt");
  const eventType = $("eventType");
  const eventTypeCode = $("eventTypeCode");
  const eventTypeOptions = $("eventTypeOptions");
  const podOption = $("podOption");
  const countsForPOD = $("countsForPOD");
  const plotSlotHour = $("plotSlotHour");
  const graphicFontPt = $("graphicFontPt");
  const graphicText = $("graphicText");
  const graphicColor = $("graphicColor");
  const graphicColorDot = $("graphicColorDot");
  let plotSlotManuallyChanged = false;

  eventTypeOptions.innerHTML = Store.EVENT_TYPES
    .filter((t) => t.code !== "CUSTOM")
    .map((t) => `<option value="${t.name}">${t.short}</option>`)
    .join("");

  function setEventTypeFromCode(code = "ADMISSION") {
    const meta = Store.EVENT_TYPES.find((item) => item.code === code);
    const fallback = Store.EVENT_TYPES.find((item) => item.code === "ADMISSION");

    eventTypeCode.value = meta?.code && meta.code !== "CUSTOM"
      ? meta.code
      : "CUSTOM";

    eventType.value =
      meta?.code && meta.code !== "CUSTOM"
        ? meta.name
        : (eventType.value || fallback?.name || "รับใหม่");
  }

  function resolvedEventType() {
    const resolved = Store.resolveEventType(eventType.value);
    eventTypeCode.value = resolved.code;
    return resolved;
  }

  setEventTypeFromCode("ADMISSION");

  function localDateTimeValue(date = new Date()) {
    const pad = (v) => String(v).padStart(2,"0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function setNow(force = true) {
    const value = localDateTimeValue(new Date());
    eventAt.max = value;
    if (force || !eventAt.value) eventAt.value = value;
    refreshPreview();
  }

  setNow(true);
  setInterval(() => {
    eventAt.max = localDateTimeValue(new Date());
  }, 60000);

  $("useCurrentTimeBtn").addEventListener("click", () => {
    setNow(true);
    eventAt.focus();
  });

  function value(name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function draftRow() {
    const resolvedType = resolvedEventType();

    return {
      eventType:resolvedType.code,
      eventTypeText:resolvedType.known ? null : resolvedType.text,
      eventAt:eventAt.value,
      plotSlotHour:Number(plotSlotHour.value) || null,
      graphicFontPt:Number(graphicFontPt.value) > 0 ? Number(graphicFontPt.value) : null,
      graphicText:String(graphicText.value || "").trim() || null,
      graphicColor:Store.normalizeEventColor(graphicColor.value),
      source:value("source") || null,
      destination:value("destination") || null,
      eventName:value("eventName") || null,
      site:value("site") || null,
      laterality:value("laterality") || null,
      note:value("note") || null,
      countsForPOD:countsForPOD.checked,
    };
  }

  function syncTypeUI() {
    const resolved = resolvedEventType();
    const type = resolved.code;

    $("podOption").hidden = type !== "OPERATION";

    // CUSTOM is intentionally flexible: keep Source and Event details visible.
    $("sourceWrap").hidden = ["OPERATION","PROCEDURE"].includes(type);
    $("destinationWrap").hidden = !["TRANSFER_OUT","CUSTOM"].includes(type);

    $("sourceLabel").textContent =
      type === "ADMISSION" ? "รับใหม่จาก / Source" :
      type === "TRANSFER_IN" ? "รับย้ายจาก / Source" :
      type === "RETURN_FROM_OR" ? "รับกลับจาก / Source" :
      type === "CUSTOM" ? "Source / ต้นทาง (ถ้ามี)" :
      "Source";

    $("eventNameLabel").textContent =
      type === "OPERATION" ? "ชื่อการผ่าตัด / Operation *" :
      type === "PROCEDURE" ? "ชื่อหัตถการ / Procedure *" :
      type === "CUSTOM" ? "รายละเอียดเพิ่มเติม (ถ้ามี)" :
      "ชื่อเหตุการณ์ / รายละเอียด";

    eventType.classList.toggle("ce-event-type--custom", type === "CUSTOM");
    $("eventTypeHint").textContent =
      type === "CUSTOM"
        ? `Custom Event: “${resolved.text || "-"}” • บันทึกข้อความนี้เป็น Event Type โดยไม่ต้องแก้โค้ด`
        : `Standard Event: ${Store.typeMeta(type).name} • ยังสามารถพิมพ์ Event Type อื่นเองได้`;

    refreshPreview();
  }

  function autoFontPt(label) {
    const length = Array.from(String(label || "")).length;
    if (length <= 32) return 3.6;
    if (length <= 52) return 3.3;
    if (length <= 76) return 3.0;
    return 2.7;
  }

  function effectiveFontPt(row, label) {
    return Number(row.graphicFontPt) > 0
      ? Number(row.graphicFontPt)
      : autoFontPt(label);
  }

  function refreshPreview({ forceNearest = false } = {}) {
    const nearest = Store.nearestGraphicSlot(eventAt.value);

    if (nearest.eligible && (forceNearest || !plotSlotManuallyChanged)) {
      plotSlotHour.value = String(nearest.slotHour);
    }

    const row = draftRow();
    const selected = Store.selectedGraphicSlot(row);

    const presentation = row.eventAt
      ? Store.safeGraphicPresentation(row)
      : { label:"-", fullLabel:"", needsFullNote:false, autoShortened:false, ref:"" };

    const previewLabel = presentation.label;
    const previewFontPt = effectiveFontPt(row, previewLabel);

    $("eventTextPreview").textContent = previewLabel;
    $("eventTextPreview").style.fontSize = `${Math.max(previewFontPt * 2.4, 8)}px`;
    $("eventTextPreview").title =
      presentation.autoShortened
        ? `Auto-safe Graphic Text • Full clinical text retained • ${presentation.ref}`
        : (
            row.graphicFontPt
              ? `กำหนดเอง ${previewFontPt.toFixed(1)} pt`
              : `Auto ${previewFontPt.toFixed(1)} pt`
          );

    $("eventTextPreview").classList.toggle(
      "ce-preview--auto-safe",
      Boolean(presentation.autoShortened)
    );

    const safeHint = $("eventTypeSafeHint");
    if (safeHint) {
      safeHint.textContent = presentation.autoShortened
        ? `ข้อความยาว: Graphic Sheet จะใช้ “${presentation.label}” • ข้อความเต็มยังอยู่ใน Clinical Event/Audit และ Clinical Notes`
        : `Graphic Sheet แสดงข้อความเต็มได้ • ถ้ายาวเกินพื้นที่ ระบบจะย่อเฉพาะบนกราฟโดยอัตโนมัติ`;
    }

    const previewColor = Store.eventColorHex(row.graphicColor);
    $("eventTextPreview").style.color = previewColor;
    graphicColorDot.style.background = previewColor;

    if (nearest.eligible) {
      $("nearestSlotHint").textContent =
        `แนะนำ ${nearest.slotLabel} (ต่าง ${nearest.diffMinutes} นาที)`;

      $("eventSlotPreview").innerHTML = `
        <strong>Plot ที่ช่อง ${selected.slotLabel}</strong>
        Clinical time ${nearest.actualTime}<br>
        <small>
          ${selected.slotHour === nearest.slotHour
            ? `ตรงกับช่องที่ใกล้สุด • ต่าง ${nearest.diffMinutes} นาที`
            : `พยาบาลเลือกเอง • ระบบแนะนำ ${nearest.slotLabel}`}
          • Clinical time ไม่ถูกเปลี่ยน
        </small>
      `;
    }
  }

  eventType.addEventListener("input", syncTypeUI);
  eventType.addEventListener("change", syncTypeUI);

  eventAt.addEventListener("input", () => {
    plotSlotManuallyChanged = false;
    refreshPreview({ forceNearest:true });
  });
  eventAt.addEventListener("change", () => {
    plotSlotManuallyChanged = false;
    refreshPreview({ forceNearest:true });
  });

  plotSlotHour.addEventListener("change", () => {
    plotSlotManuallyChanged = true;
    refreshPreview();
  });

  graphicFontPt.addEventListener("change", refreshPreview);
  graphicText.addEventListener("input", refreshPreview);
  graphicText.addEventListener("change", refreshPreview);
  graphicColor.addEventListener("change", refreshPreview);

  $("useNearestSlotBtn").addEventListener("click", () => {
    plotSlotManuallyChanged = false;
    refreshPreview({ forceNearest:true });
    plotSlotHour.focus();
  });

  form.addEventListener("input", (e) => {
    if (e.target !== eventAt && e.target !== plotSlotHour && e.target !== graphicFontPt && e.target !== graphicText && e.target !== graphicColor) refreshPreview();
  });
  form.addEventListener("change", (e) => {
    if (e.target !== eventAt && e.target !== plotSlotHour && e.target !== graphicFontPt && e.target !== graphicText && e.target !== graphicColor) refreshPreview();
  });

  syncTypeUI();
  refreshPreview({ forceNearest:true });

  form.addEventListener("reset", () => {
    setTimeout(() => {
      setEventTypeFromCode("ADMISSION");
      countsForPOD.checked = true;
      plotSlotManuallyChanged = false;
      graphicFontPt.value = "";
      graphicText.value = "";
      graphicColor.value = "BLACK";
      setNow(true);
      syncTypeUI();
    }, 0);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const row = draftRow();
    const d = new Date(row.eventAt);

    if (!row.eventAt || Number.isNaN(d.getTime())) {
      alert("กรุณาระบุวันที่/เวลาเหตุการณ์");
      return;
    }

    if (!String(eventType.value || "").trim()) {
      alert("กรุณาระบุ Event Type");
      eventType.focus();
      return;
    }


    if (d.getTime() > Date.now() + 60000) {
      alert("ไม่สามารถบันทึกเวลาในอนาคตได้");
      setNow(true);
      return;
    }

    if (["OPERATION","PROCEDURE"].includes(row.eventType) && !row.eventName) {
      alert(row.eventType === "OPERATION"
        ? "กรุณาระบุชื่อการผ่าตัด"
        : "กรุณาระบุชื่อหัตถการ");
      return;
    }

    const session = ENR.getSession?.() || {};
    Store.create(patient, {
      ...row,
      createdBy:session.username || "demo_nurse",
    });

    form.reset();
    renderTables();
  });

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function renderTables() {
    const activeRows = Store.active(patient)
      .sort((a,b) => String(b.eventAt).localeCompare(String(a.eventAt)));
    const cancelledRows = Store.cancelled(patient)
      .sort((a,b) => String(b.cancelledAt).localeCompare(String(a.cancelledAt)));

    $("cancelledCount").textContent = String(cancelledRows.length);
    $("activeEventEmpty").hidden = activeRows.length > 0;

    $("activeEventRows").innerHTML = activeRows.map((row) => {
      const nearest = Store.nearestGraphicSlot(row.eventAt);
      const slot = Store.selectedGraphicSlot(row);
      const pod = row.eventType === "OPERATION" && row.countsForPOD !== false
        ? '<span class="ce-pod-chip">PO start</span>'
        : "-";

      return `
        <tr>
          <td>
            <strong>${esc(Store.thaiDateTime(row.eventAt))}</strong>
            <span class="ce-event-note">System: ${esc(Store.thaiDateTime(row.createdAt))}</span>
          </td>
          <td>
            <span class="ce-event-main">${esc(Store.buildEventText(row))}</span>
            <span class="ce-event-type-chip ${row.eventType === "CUSTOM" ? "ce-event-type-chip--custom" : ""}">
              ${esc(Store.typeMeta(row).name)}
            </span>
            ${(row.graphicText || row.graphicColor)
              ? `<span class="ce-event-graphic-label">
                   <i class="ce-event-color-mini" style="background:${Store.eventColorHex(row.graphicColor)}"></i>
                   Graphic: ${esc(row.graphicText || Store.graphicEventText(row))}
                 </span>`
              : ""}
            ${row.note ? `<span class="ce-event-note">${esc(row.note)}</span>` : ""}
          </td>
          <td>
            <span class="ce-slot-chip">${esc(slot.slotLabel)}</span>
            <span class="ce-event-note">
              ${slot.selectedByNurse ? "Nurse selected" : "Auto fallback"}
              ${slot.slotHour !== nearest.slotHour
                ? ` • แนะนำ ${esc(nearest.slotLabel)}`
                : ` • nearest ${nearest.diffMinutes} นาที`}
            </span>
          </td>
          <td>${pod}</td>
          <td>${esc(row.createdBy || "-")}</td>
          <td><button type="button" class="ce-cancel-btn" data-cancel-id="${esc(row.id)}">ยกเลิก</button></td>
        </tr>
      `;
    }).join("");

    $("cancelledEventRows").innerHTML = cancelledRows.map((row) => `
      <tr>
        <td>${esc(Store.thaiDateTime(row.eventAt))}</td>
        <td>${esc(Store.buildEventText(row))}</td>
        <td>
          ${esc(Store.thaiDateTime(row.cancelledAt))}
          <span class="ce-event-note">${esc(row.cancelledBy || "-")}</span>
        </td>
        <td>${esc(row.cancelReason || "-")}</td>
      </tr>
    `).join("");

    document.querySelectorAll("[data-cancel-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const reason = prompt("เหตุผลการยกเลิก Clinical Event:");
        if (reason === null) return;
        if (!String(reason).trim()) {
          alert("กรุณาระบุเหตุผลการยกเลิก");
          return;
        }
        if (!confirm("ยืนยันยกเลิก? รายการจะถูกซ่อนจาก Graphic Sheet แต่ยังเก็บไว้ใน Audit")) return;

        const session = ENR.getSession?.() || {};
        Store.cancel(
          patient,
          button.dataset.cancelId,
          reason,
          session.username || "demo_nurse"
        );
        renderTables();
      });
    });
  }

  $("toggleCancelledBtn").addEventListener("click", () => {
    $("cancelledCard").hidden = !$("cancelledCard").hidden;
  });

  renderTables();
});