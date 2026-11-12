document.addEventListener("DOMContentLoaded", () => {
  // CP7.12.1 — Cancelled Plot Purge + Fresh Render Guard
  if (!ENR.requireSession()) return;

  const patient = ENR.getPatient();
  const ward = ENR.getWard();

  if (!patient) {
    location.href = "patient_list.html";
    return;
  }

  const $ = (id) => document.getElementById(id);
  const startDateInput = $("startDate");

  const patientName = patient.name || patient.display_name || "ผู้ป่วย";
  const hn = patient.hn || "-";
  const an = patient.an || patient.encounter_no || "-";
  const wardName = patient.wardName || patient.ward_name || ward?.name || "-";
  const dx = patient.dx || patient.principal_diagnosis_text || "-";

  ["patientName","sheetPatientName"].forEach((id) => $(id).textContent = patientName);
  ["patientHN","sheetHN"].forEach((id) => $(id).textContent = hn);
  ["patientAN","sheetAN"].forEach((id) => $(id).textContent = an);
  ["patientWard","sheetWard"].forEach((id) => $(id).textContent = wardName);
  $("sheetDX").textContent = dx;

  function parseLocalDate(value) {
    const [y,m,d] = String(value).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  }

  function dateInputValue(date) {
    return ParameterStore.localDateKey(date);
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatShortDate(date) {
    return date.toLocaleDateString("th-TH", {day:"2-digit",month:"2-digit",year:"2-digit"});
  }

  function formatDayName(date) {
    return date.toLocaleDateString("th-TH", {weekday:"short"});
  }

  function normalizeCalendarDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function calendarDayDiff(laterDate, earlierDate) {
    const laterUtc = Date.UTC(
      laterDate.getFullYear(),
      laterDate.getMonth(),
      laterDate.getDate()
    );
    const earlierUtc = Date.UTC(
      earlierDate.getFullYear(),
      earlierDate.getMonth(),
      earlierDate.getDate()
    );
    return Math.round((laterUtc - earlierUtc) / 86400000);
  }

  function patientAdmitDate() {
    const raw =
      patient.admitted_at ||
      patient.admittedAt ||
      patient.admit_datetime ||
      patient.admitDate;

    if (!raw) return null;

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : normalizeCalendarDate(d);
  }

  function patientDischargeDate() {
    const raw =
      patient.discharged_at ||
      patient.dischargedAt ||
      patient.discharge_datetime ||
      patient.dischargeDate;

    if (!raw) return null;

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : normalizeCalendarDate(d);
  }

  function formatSheetDate(date) {
    return date.toLocaleDateString("th-TH", {
      day:"numeric",
      month:"short",
      year:"numeric",
    });
  }

  function formatSheetDateRange(start, end) {
    return `${formatSheetDate(start)} – ${formatSheetDate(end)}`;
  }

  function padSheetNo(value) {
    return String(Math.max(1, Number(value) || 1)).padStart(2, "0");
  }

  function admissionAnchorStorageKey() {
    return `enr_v3_graphic_admit_anchor_${an || hn || "patient"}`;
  }

  let admissionAnchorDate = null;

  function resolveAdmissionAnchor(records) {
    const realAdmit = patientAdmitDate();
    if (realAdmit) return realAdmit;

    const admissionEvent = window.ClinicalEventStore?.earliestAdmissionEvent?.(patient);
    if (admissionEvent?.eventAt) {
      const eventDate = new Date(admissionEvent.eventAt);
      if (!Number.isNaN(eventDate.getTime())) {
        return normalizeCalendarDate(eventDate);
      }
    }

    const key = admissionAnchorStorageKey();
    const saved = localStorage.getItem(key);

    if (saved) {
      const parsed = parseLocalDate(saved);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const fallback = defaultStartDate(records);
    localStorage.setItem(key, dateInputValue(fallback));
    return fallback;
  }

  function dayAfterAdmission(date) {
    if (!admissionAnchorDate || isAfterDischarge(date)) return "-";

    const diff = calendarDayDiff(
      normalizeCalendarDate(date),
      normalizeCalendarDate(admissionAnchorDate)
    );

    return diff >= 0 ? diff + 1 : "-";
  }

  function dayAfterOperationInfo(date) {
    if (!window.ClinicalEventStore || !dateWithinEncounter(date)) {
      return { items:[], count:0, value:"-", hasOperationDay:false };
    }
    return ClinicalEventStore.podSeriesForDate(patient, date);
  }

  function dayAfterOperationTitle(date) {
    const pod = dayAfterOperationInfo(date);
    if (!pod.items.length) return "";

    return pod.items
      .map((item) => {
        const opName = item.operation.eventName || `Operation #${item.sequence}`;
        const when = ClinicalEventStore.thaiDateTime(item.operation.eventAt);
        return `OP#${item.sequence} ${opName} • ${when} • ${item.value}`;
      })
      .join(" | ");
  }

  function dayAfterOperationFontPt(count, value) {
    const length = String(value || "").length;
    if (count <= 1 && length <= 2) return 6.2;
    if (count <= 2 && length <= 5) return 5.6;
    if (count <= 3 && length <= 8) return 5.0;
    return 4.3;
  }

  function dayAfterOperationCell(date) {
    const pod = dayAfterOperationInfo(date);
    const activeClass = pod.count ? " gs-dayafter-cell--postop" : "";
    const opClass = pod.hasOperationDay ? " gs-dayafter-cell--operation-day" : "";
    const fontPt = dayAfterOperationFontPt(pod.count, pod.value);

    return `
      <div
        class="gs-dayafter-cell${activeClass}${opClass}"
        style="--pod-font:${fontPt}pt"
        title="${esc(dayAfterOperationTitle(date))}"
      >
        ${esc(pod.value)}
      </div>
    `;
  }

  function defaultStartDate(records) {
    if (records.length) {
      const sorted = [...records].sort((a,b) => String(a.observedAt).localeCompare(String(b.observedAt)));
      const d = new Date(sorted[0].observedAt);
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const records = ParameterStore.read(patient);
  admissionAnchorDate = resolveAdmissionAnchor(records);

  const sheetSelect = $("sheetSelect");
  const prevSheetBtn = $("prevSheetBtn");
  const nextSheetBtn = $("nextSheetBtn");
  const printAllHost = $("printAllSheets");
  const rolloverNotice = $("sheetRolloverNotice");
  const rolloverTitle = $("sheetRolloverTitle");
  const rolloverText = $("sheetRolloverText");
  const openCurrentSheetBtn = $("openCurrentSheetBtn");
  const lastSheetStorageKey = `enr_v3_graphic_sheet_no_${an || hn || "patient"}`;

  function latestObservedCalendarDate(allRecords) {
    let latest = null;

    allRecords.forEach((record) => {
      if (!record?.observedAt) return;
      const d = new Date(record.observedAt);
      if (Number.isNaN(d.getTime())) return;
      const normalized = normalizeCalendarDate(d);
      if (!latest || normalized > latest) latest = normalized;
    });

    return latest;
  }

  function hospitalizationEndDate(allRecords) {
    const discharge = patientDischargeDate();
    if (discharge) return discharge;

    // Active encounter pagination is driven by the calendar date,
    // never by a future/back-entered observation timestamp.
    return normalizeCalendarDate(new Date());
  }

  function dateWithinEncounter(date) {
    const target = normalizeCalendarDate(date);

    if (admissionAnchorDate) {
      const admit = normalizeCalendarDate(admissionAnchorDate);
      if (target < admit) return false;
    }

    const discharge = patientDischargeDate();
    if (discharge && target > discharge) return false;

    return true;
  }

  function isAfterDischarge(date) {
    const discharge = patientDischargeDate();
    return Boolean(
      discharge &&
      normalizeCalendarDate(date) > normalizeCalendarDate(discharge)
    );
  }

  function sheetNoForDate(date) {
    if (!admissionAnchorDate) return 1;

    const diff = calendarDayDiff(
      normalizeCalendarDate(date),
      normalizeCalendarDate(admissionAnchorDate)
    );

    if (diff <= 0) return 1;
    return Math.floor(diff / 7) + 1;
  }

  function sheetStartDate(sheetNo) {
    if (!admissionAnchorDate) {
      return defaultStartDate(ParameterStore.read(patient));
    }

    const no = Math.max(1, Number(sheetNo) || 1);
    return addDays(admissionAnchorDate, (no - 1) * 7);
  }

  function sheetEndDate(sheetNo) {
    return addDays(sheetStartDate(sheetNo), 6);
  }

  function totalSheetCount(allRecords) {
    if (!admissionAnchorDate) return 1;

    const end = hospitalizationEndDate(allRecords);
    const diff = Math.max(
      0,
      calendarDayDiff(end, normalizeCalendarDate(admissionAnchorDate))
    );

    return Math.floor(diff / 7) + 1;
  }

  function currentClinicalSheetNo(allRecords) {
    const end = hospitalizationEndDate(allRecords);
    return sheetNoForDate(end);
  }

  function sheetMeta(sheetNo, total = null) {
    const no = Math.max(1, Number(sheetNo) || 1);
    const start = sheetStartDate(no);
    const windowEnd = sheetEndDate(no);
    const encounterEnd = hospitalizationEndDate(ParameterStore.read(patient));
    const isLastSheet = total ? no === total : false;
    const discharge = patientDischargeDate();

    const clinicalEnd =
      isLastSheet && encounterEnd < windowEnd
        ? encounterEnd
        : windowEnd;

    const hdStart = dayAfterAdmission(start);
    const hdWindowEnd = admissionAnchorDate
      ? calendarDayDiff(
          normalizeCalendarDate(windowEnd),
          normalizeCalendarDate(admissionAnchorDate)
        ) + 1
      : "-";
    const hdClinicalEnd = admissionAnchorDate
      ? calendarDayDiff(
          normalizeCalendarDate(clinicalEnd),
          normalizeCalendarDate(admissionAnchorDate)
        ) + 1
      : "-";

    const partialLastSheet =
      Boolean(isLastSheet && discharge && clinicalEnd < windowEnd);

    return {
      sheetNo:no,
      total,
      start,
      end:windowEnd,
      windowEnd,
      clinicalEnd,
      hdStart,
      hdEnd:partialLastSheet ? hdClinicalEnd : hdWindowEnd,
      hdWindowEnd,
      hdClinicalEnd,
      partialLastSheet,
      discharged:Boolean(discharge),
      dateRange:formatSheetDateRange(start, clinicalEnd),
      windowDateRange:formatSheetDateRange(start, windowEnd),
    };
  }

  function populateSheetSelect(total, activeSheetNo) {
    if (!sheetSelect) return;

    sheetSelect.innerHTML = Array.from({length:total}, (_, index) => {
      const no = index + 1;
      const meta = sheetMeta(no, total);
      return `
        <option value="${no}" ${no === activeSheetNo ? "selected" : ""}>
          แผ่น ${padSheetNo(no)} • HD ${meta.hdStart}–${meta.hdEnd} • ${esc(meta.dateRange)}${meta.partialLastSheet ? " • จำหน่าย" : ""}
        </option>
      `;
    }).join("");
  }

  function updateSheetUrl(sheetNo) {
    try {
      const url = new URL(location.href);
      url.searchParams.set("sheet", String(sheetNo));
      history.replaceState({sheetNo}, "", url);
    } catch {
      // Keep navigation functional even when URL APIs are restricted.
    }
  }

  function setActiveSheet(sheetNo, {renderNow = true, clampToAvailable = true} = {}) {
    const allRecords = ParameterStore.read(patient);
    const total = totalSheetCount(allRecords);

    let no = Math.max(1, Number(sheetNo) || 1);
    if (clampToAvailable) no = Math.min(no, total);

    startDateInput.value = dateInputValue(sheetStartDate(no));
    localStorage.setItem(lastSheetStorageKey, String(no));
    updateSheetUrl(no);

    if (renderNow) render();
  }

  function requestedInitialSheetNo(allRecords) {
    const total = totalSheetCount(allRecords);

    try {
      const url = new URL(location.href);
      const fromUrl = Number(url.searchParams.get("sheet"));
      if (Number.isInteger(fromUrl) && fromUrl >= 1) {
        return Math.min(fromUrl, total);
      }
    } catch {}

    const saved = Number(localStorage.getItem(lastSheetStorageKey));
    if (Number.isInteger(saved) && saved >= 1) {
      return Math.min(saved, total);
    }

    return currentClinicalSheetNo(allRecords);
  }

  let lastSeenCalendarKey = ParameterStore.localDateKey(new Date());
  let lastKnownCurrentSheetNo = currentClinicalSheetNo(records);

  function showRolloverNotice(title, text, showOpenCurrent = false) {
    if (!rolloverNotice) return;

    rolloverTitle.textContent = title;
    rolloverText.textContent = text;
    rolloverNotice.hidden = false;

    if (openCurrentSheetBtn) {
      openCurrentSheetBtn.hidden = !showOpenCurrent;
    }
  }

  function hideRolloverNotice() {
    if (!rolloverNotice) return;
    rolloverNotice.hidden = true;
    if (openCurrentSheetBtn) openCurrentSheetBtn.hidden = true;
  }

  openCurrentSheetBtn?.addEventListener("click", () => {
    const allRecords = ParameterStore.read(patient);
    setActiveSheet(currentClinicalSheetNo(allRecords));
    hideRolloverNotice();
  });

  function checkClinicalClockAndSheet() {
    if (patientDischargeDate()) return;

    const nowKey = ParameterStore.localDateKey(new Date());
    const allRecords = ParameterStore.read(patient);
    const newCurrentSheetNo = currentClinicalSheetNo(allRecords);
    const activeSheetNo = sheetNoForDate(parseLocalDate(startDateInput.value));

    const calendarChanged = nowKey !== lastSeenCalendarKey;
    const newSheetCreated = newCurrentSheetNo !== lastKnownCurrentSheetNo;

    if (!calendarChanged && !newSheetCreated) return;

    if (newSheetCreated && activeSheetNo === lastKnownCurrentSheetNo) {
      setActiveSheet(newCurrentSheetNo);
      const meta = sheetMeta(newCurrentSheetNo, totalSheetCount(allRecords));
      showRolloverNotice(
        "เปิด Graphic Sheet แผ่นใหม่อัตโนมัติ",
        `เข้าสู่ Hospital Day ${meta.hdStart} • Sheet ${padSheetNo(newCurrentSheetNo)}`,
        false
      );
    } else {
      // If the nurse is intentionally reviewing an older sheet,
      // never steal the screen. Refresh totals and offer one-click navigation.
      render();

      if (newSheetCreated) {
        showRolloverNotice(
          "มี Graphic Sheet แผ่นใหม่แล้ว",
          `Sheet ${padSheetNo(newCurrentSheetNo)} พร้อมใช้งาน • ระบบไม่เปลี่ยนหน้าที่กำลังทบทวน`,
          true
        );
      }
    }

    lastSeenCalendarKey = nowKey;
    lastKnownCurrentSheetNo = newCurrentSheetNo;
  }

  function refreshAfterClinicalStorageChange(event) {
    const key = String(event?.key || "");

    if (
      !key.startsWith("enr_v3_patient_parameters_") &&
      !key.startsWith("enr_v3_clinical_events_")
    ) {
      return;
    }

    // Recompute all per-value canonical maps. If the currently plotted
    // observation was cancelled in another tab, the next closest ACTIVE
    // observation becomes visible automatically.
    render();
    showRolloverNotice(
      "Graphic Sheet อัปเดตแล้ว",
      "ข้อมูล Parameter / Clinical Event เปลี่ยนแปลง • ระบบคำนวณ Plot ใหม่อัตโนมัติ",
      false
    );
  }

  function refreshGraphicSheetFromStorage(reason = "refresh") {
    render();

    console.info(
      `[CP7.12.1] Graphic Sheet refreshed from current ParameterStore • ${reason}`
    );
  }

  window.addEventListener("storage", refreshAfterClinicalStorageChange);

  window.addEventListener("focus", () => {
    checkClinicalClockAndSheet();
    refreshGraphicSheetFromStorage("focus");
  });

  window.addEventListener("pageshow", (event) => {
    refreshGraphicSheetFromStorage(
      event.persisted ? "pageshow-bfcache" : "pageshow"
    );
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkClinicalClockAndSheet();
      refreshGraphicSheetFromStorage("visibilitychange");
    }
  });

  window.setInterval(checkClinicalClockAndSheet, 60 * 1000);

  startDateInput.value = dateInputValue(
    sheetStartDate(requestedInitialSheetNo(records))
  );

  prevSheetBtn?.addEventListener("click", () => {
    const current = sheetNoForDate(parseLocalDate(startDateInput.value));
    setActiveSheet(current - 1);
  });

  nextSheetBtn?.addEventListener("click", () => {
    const current = sheetNoForDate(parseLocalDate(startDateInput.value));
    setActiveSheet(current + 1);
  });

  sheetSelect?.addEventListener("change", () => {
    setActiveSheet(Number(sheetSelect.value));
  });

  $("admissionBtn")?.addEventListener("click", () => {
    setActiveSheet(1);
  });

  $("currentSheetBtn")?.addEventListener("click", () => {
    const allRecords = ParameterStore.read(patient);
    setActiveSheet(currentClinicalSheetNo(allRecords));
  });

  startDateInput.addEventListener("change", () => {
    const requested = parseLocalDate(startDateInput.value);
    setActiveSheet(sheetNoForDate(requested));
  });

  $("printBtn")?.addEventListener("click", () => {
    document.body.classList.remove("gs-print-all-mode");
    if (printAllHost) {
      printAllHost.innerHTML = "";
      printAllHost.setAttribute("aria-hidden", "true");
    }
    window.print();
  });


  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function slotValueFitClass(rawValue) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return "";

    // Auto-fit by visible character count. This is intentionally
    // presentation-only: the underlying clinical value is unchanged.
    const length = Array.from(raw).length;
    if (length <= 1) return " gs-slot-value--fit-1";
    if (length === 2) return " gs-slot-value--fit-2";
    if (length === 3) return " gs-slot-value--fit-3";
    if (length === 4) return " gs-slot-value--fit-4";
    return " gs-slot-value--fit-5plus";
  }

  function slotCell(value, title = "") {
    const raw = value === null || value === undefined || value === "" ? "" : String(value);
    const display = raw ? esc(raw) : "";
    const fitClass = slotValueFitClass(raw);

    return `<div class="gs-slot-cell" title="${esc(title)}">${
      display ? `<span class="gs-slot-value${fitClass}">${display}</span>` : ""
    }</div>`;
  }

  function dailyCell(value) {
    const display = value === null || value === undefined || value === "" ? "" : esc(value);
    return `<div class="gs-daily-cell">${display}</div>`;
  }

  function val(r,key) {
    return r?.values?.[key] ?? null;
  }

  function selectedValueSlotMap(allRecords, key, options = {}) {
    return ParameterStore.chooseCanonicalSlotRecordsForValue(
      allRecords,
      key,
      options
    );
  }

  function currentParameterSource() {
    const allRecords = ParameterStore.read(patient);
    const activeRecords = allRecords.filter(ParameterStore.isActiveRecord);

    return { allRecords, activeRecords };
  }

  function selectedGraphicValueMaps(allRecords) {
    return {
      temp:selectedValueSlotMap(allRecords, "temp"),
      pulse:selectedValueSlotMap(allRecords, "pulse"),
      resp:selectedValueSlotMap(allRecords, "resp"),
      sbp:selectedValueSlotMap(allRecords, "sbp"),
      dbp:selectedValueSlotMap(allRecords, "dbp"),
      spo2:selectedValueSlotMap(allRecords, "spo2"),
      sos:selectedValueSlotMap(allRecords, "sos"),
      pain:selectedValueSlotMap(
        allRecords,
        "pain",
        { min:0, max:10, integerOnly:true }
      ),
      sedative:selectedValueSlotMap(allRecords, "sedative"),
    };
  }

  function slotRecordsForRange(days, selectedMap) {
    const out = [];
    days.forEach((day) => {
      const dateKey = ParameterStore.localDateKey(day);
      ParameterStore.SLOT_HOURS.forEach((hour) => {
        if (!dateWithinEncounter(day)) {
          out.push(null);
          return;
        }

        out.push(
          selectedMap.get(`${dateKey}@${String(hour).padStart(2,"0")}`) || null
        );
      });
    });
    return out;
  }

  function linePoints(slotRecords, key, min, max, width = 1000, height = 1000) {
    const points = [];

    slotRecords.forEach((record, index) => {
      // IMPORTANT:
      // An empty Graphic Sheet slot is represented by null.
      // Number(null) === 0 in JavaScript, so converting first would create
      // a fake data point and later crash when record.observedAt is read.
      if (!record) return;

      const raw = val(record, key);
      if (raw === null || raw === undefined || raw === "") return;

      const v = Number(raw);
      if (!Number.isFinite(v)) return;

      const x = ((index + 0.5) / 42) * width;
      const clamped = Math.max(min, Math.min(max, v));
      const y = (1 - (clamped - min) / (max - min)) * height;

      points.push({x, y, index, value:v, record});
    });

    return points;
  }

  function polyline(points) {
    return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  }

  function circles(points, cls) {
    return points
      .filter((p) => p && p.record && p.record.observedAt)
      .map((p) => `
        <circle class="${cls}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="5">
          <title>${esc(p.value)} • ${esc(new Date(p.record.observedAt).toLocaleString("th-TH"))}</title>
        </circle>
      `)
      .join("");
  }

  function painPointCircles(points) {
    return points
      .filter((p) => p && p.record && p.record.observedAt)
      .map((p) => {
        const slot = ParameterStore.targetSlotForObservedAt(p.record.observedAt);
        const slotText = slot?.eligible ? `Plot ${slot.slotLabel}` : "";
        const observedText = new Date(p.record.observedAt).toLocaleString("th-TH", {
          year:"numeric",
          month:"short",
          day:"numeric",
          hour:"2-digit",
          minute:"2-digit",
          hour12:false,
        });

        return `
          <circle
            class="gs-pain-point"
            cx="${p.x.toFixed(2)}"
            cy="${p.y.toFixed(2)}"
            r="4.2"
            data-pain="${p.value}"
            data-slot-index="${p.index}"
          >
            <title>Pain ${esc(p.value)}/10 • ${esc(slotText)} • วัดจริง ${esc(observedText)}</title>
          </circle>
        `;
      })
      .join("");
  }

  function painPlotSummary(points) {
    if (!points.length) return "";
    return points
      .map((p) => {
        const slot = ParameterStore.targetSlotForObservedAt(p.record.observedAt);
        return `${slot?.slotLabel || "-"}=${p.value}`;
      })
      .join(" • ");
  }

  function chartScaleLabels() {
    const rows = [];
    for (let p = 160, t = 41; p >= 40; p -= 20, t -= 1) {
      const rawPct = ((160 - p) / 120) * 100;
      const pct = 6 + (rawPct * 88 / 100);
      rows.push(`
        <span class="gs-scale-label" style="top:${pct}%">
          <b class="gs-scale-p">${p}</b>
          <em class="gs-scale-t">${t}</em>
        </span>
      `);
    }
    return rows.join("");
  }

  function daySummary(recordsForDay) {
    const active = recordsForDay.filter((r) => r.status !== "CANCELLED");
    const ioTotals = IOEngine.totalsForRecords(active);

    const intakeOral = ParameterStore.sum(active,"oralFluid");
    const intakePar = ParameterStore.sum(active,"parenteralFluid");
    const outUrine = ParameterStore.sum(active,"urineMl");
    const outEmesis = ParameterStore.sum(active,"emesisMl");
    const legacyDrain = ParameterStore.sum(active,"drainageMl");
    const legacyOther = ParameterStore.sum(active,"otherOutputMl");

    const flexIn = IOEngine.allEvents(active, "IN");
    const flexOut = IOEngine.allEvents(active, "OUT");

    const flexInText = IOEngine.groupedText(flexIn);
    const flexOutParts = [];
    if (legacyDrain) flexOutParts.push(`Drainage ${legacyDrain}`);
    if (legacyOther) flexOutParts.push(`Other ${legacyOther}`);
    const flexOutText = IOEngine.groupedText(flexOut);
    if (flexOutText) flexOutParts.push(flexOutText);

    const collect = (key) => {
      const values = active.map((r) => val(r,key)).filter((x) => x !== null && x !== undefined && x !== "");
      return [...new Set(values.map(String))].join(" • ");
    };

    const notes = active
      .map((r) => val(r,"medicationNote"))
      .filter(Boolean)
      .join("\n");

    return {
      weight: ParameterStore.latestNonEmpty(active,"weight")
        ? `${ParameterStore.latestNonEmpty(active,"weight")} kg`
        : "",
      height: ParameterStore.latestNonEmpty(active,"height")
        ? `${ParameterStore.latestNonEmpty(active,"height")} cm`
        : "",
      diet: ParameterStore.latestNonEmpty(active,"diet") || "",
      oral: intakeOral || "",
      parenteral: intakePar || "",
      otherIntake: flexInText,
      intakeTotal: ioTotals.intake || "",
      urineMl: outUrine || "",
      emesis: outEmesis || "",
      drainOther: flexOutParts.join(" • "),
      outputTotal: ioTotals.output || "",
      ioBalance: ioTotals.balance,
      stool: collect("stool"),
      urineNote: collect("urineNote"),
      notes,
    };
  }

  function buildDateHeader(days) {
    return `
      <div class="gs-date-header">
        <div class="gs-left">DATE</div>
        ${days.map((d) => `<div class="gs-date-cell">${formatDayName(d)} ${formatShortDate(d)}</div>`).join("")}
      </div>
      <div class="gs-dayafter-row">
        <div class="gs-left">DAY AFTER ADMISSION</div>
        ${days.map((d) => `<div class="gs-dayafter-cell">${dayAfterAdmission(d)}</div>`).join("")}
      </div>
      <div class="gs-dayafter-row gs-dayafter-row--operation">
        <div class="gs-left">DAY AFTER OPERATION</div>
        ${days.map((d) => dayAfterOperationCell(d)).join("")}
      </div>
      <div class="gs-time-header">
        <div class="gs-left">TIME</div>
        ${days.flatMap(() => ParameterStore.SLOT_HOURS).map((h) => slotCell(String(h))).join("")}
      </div>
    `;
  }

  function eventsForRange(days) {
    if (!window.ClinicalEventStore) return [];

    const allowedDates = new Set(
      days.map((d) => ParameterStore.localDateKey(d))
    );

    return ClinicalEventStore.active(patient)
      .filter((event) => {
        const eventDate = new Date(event.eventAt);
        return (
          dateWithinEncounter(eventDate) &&
          allowedDates.has(ClinicalEventStore.localDateKey(event.eventAt))
        );
      })
      .sort((a,b) => String(a.eventAt).localeCompare(String(b.eventAt)));
  }

  function autoClinicalEventFontPt(label) {
    const length = Array.from(String(label || "")).length;

    // CP7.10.2: do not solve long legal text by making it microscopic.
    // Once a phrase becomes long, the layout engine adds columns instead.
    if (length <= 44) return 3.6;
    if (length <= 80) return 3.25;
    if (length <= 120) return 3.0;
    if (length <= 160) return 2.8;
    return 2.9;
  }

  function clinicalEventFontPt(event, label) {
    const auto = autoClinicalEventFontPt(label);
    const manual = Number(event?.graphicFontPt);

    // Nurse-selected font remains respected, but it cannot exceed the
    // safe auto size for a long annotation.
    return manual > 0
      ? Math.min(auto, Math.min(4.0, Math.max(2.6, manual)))
      : auto;
  }

  function clinicalEventLayout(event) {
    const presentation = ClinicalEventStore.safeGraphicPresentation(event);

    return {
      mode:presentation.mode,
      columns:[presentation.label],
      graphLabel:presentation.label,
      fullLabel:presentation.fullLabel,
      needsFullNote:presentation.needsFullNote,
      autoShortened:presentation.autoShortened,
      ref:presentation.ref,
    };
  }

  function clinicalEventColumnOffsets() {
    return [0];
  }

  function clinicalEventFullNotesForDate(day) {
    if (!window.ClinicalEventStore) return "";

    const dateKey = ParameterStore.localDateKey(day);

    return ClinicalEventStore.active(patient)
      .filter((event) => {
        if (ClinicalEventStore.localDateKey(event.eventAt) !== dateKey) {
          return false;
        }

        return clinicalEventLayout(event).needsFullNote;
      })
      .map((event) => {
        const layout = clinicalEventLayout(event);
        const fullLabel = layout.fullLabel;
        const time = ClinicalEventStore.timeText
          ? ClinicalEventStore.timeText(event.eventAt)
          : new Date(event.eventAt).toLocaleTimeString("th-TH", {
              hour:"2-digit",
              minute:"2-digit",
              hour12:false,
            });

        return `[${layout.ref}] ${time} ${fullLabel}`;
      })
      .join("\n");
  }

  // CP7.10.1.1 HOTFIX — Clinical Event slot scope:
  // `slot` is carried from visible[] into the renderer so slotLabel is defined.
  // CP7.10.4 — Safe Long Clinical Event Rendering
  // Long Thai/custom text is never split into character columns.
  // The graph uses one concise traceable label; full text stays in legal records.
  function buildClinicalEventAnnotations(days) {
    const events = eventsForRange(days);
    if (!events.length) return "";

    const dayIndexByKey = new Map(
      days.map((d,index) => [ParameterStore.localDateKey(d), index])
    );

    const levelBySlot = new Map();
    const visible = [];
    const overflow = new Map();

    events.forEach((event) => {
      const slot = ClinicalEventStore.selectedGraphicSlot(event);
      const dayIndex = dayIndexByKey.get(slot.dateKey);
      const slotIndex = ParameterStore.SLOT_HOURS.indexOf(slot.slotHour);

      if (dayIndex === undefined || slotIndex < 0) return;

      const absoluteIndex = dayIndex * 6 + slotIndex;
      const lane = levelBySlot.get(absoluteIndex) || 0;
      levelBySlot.set(absoluteIndex, lane + 1);

      // Vertical notes are most readable when multiple events in one slot
      // are placed side-by-side, not on top of each other.
      if (lane < 3) {
        visible.push({event, slot, absoluteIndex, lane});
      } else {
        overflow.set(absoluteIndex, (overflow.get(absoluteIndex) || 0) + 1);
      }
    });

    const eventHtml = visible.map(({event, slot, absoluteIndex, lane}) => {
      const slotWidthPct = 100 / 42;
      const slotCenter = ((absoluteIndex + 0.5) / 42) * 100;
      const slotIndexWithinSheet = absoluteIndex;

      /*
        CP7.10.1 lane rule retained:
        - single event = center of selected slot
        - same-slot events fan sideways
        - first/last slots fan inward
      */
      let laneOffsets = [0, -0.48, 0.48];

      if (slotIndexWithinSheet === 0) {
        laneOffsets = [0, 0.48, 0.92];
      } else if (slotIndexWithinSheet === 41) {
        laneOffsets = [0, -0.48, -0.92];
      }

      const rawX = slotCenter + (laneOffsets[lane] || 0);
      const slotStart = absoluteIndex * slotWidthPct;
      const slotEnd = slotStart + slotWidthPct;
      const safeInset = Math.min(0.42, slotWidthPct * 0.18);
      const x = Math.max(
        slotStart + safeInset,
        Math.min(slotEnd - safeInset, rawX)
      );

      const layout = clinicalEventLayout(event);
      const fullLabel = layout.fullLabel;
      const fontPt = clinicalEventFontPt(event, layout.graphLabel);
      const columnOffsets = clinicalEventColumnOffsets();

      const columnHtml = layout.columns.map((columnText, columnIndex) => `
        <span
          class="gs-clinical-event__column"
          style="--event-col-x:${columnOffsets[columnIndex]}mm"
        >${esc(columnText)}</span>
      `).join("");

      return `
        <div
          class="gs-clinical-event gs-clinical-event--${esc(event.eventType.toLowerCase())}"
          data-slot-index="${absoluteIndex}"
          data-event-lane="${lane}"
          data-slot-label="${esc(slot.slotLabel || "")}"
          data-event-layout="${esc(layout.mode)}"
          data-event-ref="${esc(layout.ref)}"
          data-full-note="${layout.needsFullNote ? "1" : "0"}"
          style="left:${x}%;top:50%;--event-font:${fontPt}pt;--event-color:${ClinicalEventStore.eventColorHex(event.graphicColor)}"
          title="${esc(fullLabel)} • ${esc(slot.slotLabel || "")} • ${esc(layout.mode)} • ${fontPt.toFixed(1)} pt"
        >
          <span class="gs-clinical-event__columns" aria-label="${esc(fullLabel)}">
            ${columnHtml}
          </span>
        </div>
      `;
    }).join("");

    const overflowHtml = [...overflow.entries()].map(([absoluteIndex, count]) => {
      const x = ((absoluteIndex + 0.5) / 42) * 100;
      return `<div class="gs-clinical-event-more" style="left:${x}%;top:3.5%" title="มี Clinical Event เพิ่มอีก ${count} รายการ">+${count}</div>`;
    }).join("");

    return `<div class="gs-clinical-events-layer">${eventHtml}${overflowHtml}</div>`;
  }

  function buildTPChart(tempSlotRecords, pulseSlotRecords, days) {
    const tempPts = linePoints(tempSlotRecords,"temp",35,41);
    const pulsePts = linePoints(pulseSlotRecords,"pulse",40,160);
    const feverY = (1 - (37 - 35) / 6) * 1000;

    return `
      <div class="gs-chart-row">
        <div class="gs-chart-scale">
          <div class="gs-chart-scale__title">
            <span class="gs-chart-scale__pulse">PULSE</span>
            <span class="gs-chart-scale__temp">T (°C)</span>
          </div>
          ${chartScaleLabels()}
        </div>
        <div class="gs-chart-area">
          <svg class="gs-chart-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <line class="gs-fever-line" x1="0" y1="${feverY}" x2="1000" y2="${feverY}"></line>
            ${pulsePts.length ? `<polyline class="gs-pulse-line" points="${polyline(pulsePts)}"></polyline>${circles(pulsePts,"gs-pulse-point")}` : ""}
            ${tempPts.length ? `<polyline class="gs-temp-line" points="${polyline(tempPts)}"></polyline>${circles(tempPts,"gs-temp-point")}` : ""}
          </svg>
          ${buildClinicalEventAnnotations(days)}
        </div>
      </div>
    `;
  }

  function buildSlotRow(label, slotRecords, key, formatter = (v) => v) {
    return `
      <div class="gs-slot-row">
        <div class="gs-left">${label}</div>
        ${slotRecords.map((r) => {
          const v = val(r,key);
          const title = r ? `วัดจริง ${new Date(r.observedAt).toLocaleString("th-TH")}` : "";
          return slotCell(v === null || v === undefined ? "" : formatter(v), title);
        }).join("")}
      </div>
    `;
  }

  function buildBP(sbpSlotRecords, dbpSlotRecords) {
    return `
      <div class="gs-bp-row">
        <div class="gs-bp-labels"><span>B.P. Systolic</span><span>Diastolic</span></div>
        <div class="gs-bp-values">
          <div class="gs-bp-line">${sbpSlotRecords.map((r) => slotCell(val(r,"sbp") ?? "")).join("")}</div>
          <div class="gs-bp-line">${dbpSlotRecords.map((r) => slotCell(val(r,"dbp") ?? "")).join("")}</div>
        </div>
      </div>
    `;
  }

  function buildPainChart(slotRecords) {
    // Pain uses the same slot positions as T/P/R/BP:
    // 02 / 06 / 10 / 14 / 18 / 22 ±20 min.
    // Only ACTIVE, valid integer Pain 0–10 observations are supplied here.
    const pts = linePoints(slotRecords, "pain", 0, 10);
    const thresholdY = (1 - 4/10) * 1000;

    // IMPORTANT: use real DOM grid cells for the 42 time columns.
    // This is the same column model used by the parameter rows above,
    // so vertical lines stay aligned on screen and in A4/Print.
    const painColumnGrid = Array.from({length:42}, () =>
      `<span class="gs-pain-grid-col"></span>`
    ).join("");

    const painRowGrid = Array.from({length:10}, () =>
      `<span class="gs-pain-grid-row"></span>`
    ).join("");

    const plotSummary = painPlotSummary(pts);

    return `
      <div
        class="gs-pain-chart-row"
        data-pain-points="${pts.length}"
        title="${esc(plotSummary)}"
      >
        <div class="gs-pain-scale">
          <strong>PAIN SCORE</strong>
          <div class="gs-pain-scale__numbers">
            ${[10,8,6,4,2,0].map((score) => {
              const painIndex = 10 - score;
              const edgeClass =
                score === 10 ? " gs-pain-mark--top" :
                score === 0 ? " gs-pain-mark--bottom" :
                "";
              const thresholdClass = score === 4 ? " gs-pain-scale__threshold" : "";
              return `<span
                class="gs-pain-mark${edgeClass}${thresholdClass}"
                style="--pain-index:${painIndex}"
              >${score}</span>`;
            }).join("")}
          </div>
        </div>

        <div class="gs-pain-area">
          <div class="gs-pain-grid-columns" aria-hidden="true">${painColumnGrid}</div>
          <div class="gs-pain-grid-rows" aria-hidden="true">${painRowGrid}</div>

          <svg
            class="gs-pain-svg"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            role="img"
            aria-label="Pain score plot"
          >
            <line
              class="gs-pain-threshold"
              x1="0"
              y1="${thresholdY}"
              x2="1000"
              y2="${thresholdY}"
            ></line>

            ${
              pts.length
                ? `
                  <polyline
                    class="gs-pain-line"
                    points="${polyline(pts)}"
                  ></polyline>
                  ${painPointCircles(pts)}
                `
                : ""
            }
          </svg>
        </div>
      </div>
    `;
  }

  function buildSectionBand(label, detail = "") {
    return `
      <div class="gs-section-band">
        <strong>${esc(label)}</strong>
        ${detail ? `<span>${esc(detail)}</span>` : ""}
      </div>
    `;
  }

  function buildDailyRow(label, days, summaries, key, extraClass = "") {
    return `
      <div class="gs-daily-row ${extraClass}">
        <div class="gs-left">${label}</div>
        ${days.map((_,i) => dailyCell(summaries[i][key])).join("")}
      </div>
    `;
  }

  function buildBalanceRow(days, summaries) {
    return `
      <div class="gs-daily-row gs-daily-row--io-total gs-daily-row--io-balance">
        <div class="gs-left">I/O BALANCE</div>
        ${days.map((_,i) => {
          const value = Number(summaries[i].ioBalance || 0);
          const display = value > 0 ? `+${value}` : String(value);
          return dailyCell(display);
        }).join("")}
      </div>
    `;
  }

  function buildPatientIdentityStrip() {
    return `
      <div class="gs-identity-strip">
        <div><span>Name of Patient</span><b>${esc(patientName)}</b></div>
        <div><span>Age</span><b>-</b></div>
        <div><span>Hospital Number</span><b>${esc(hn)}</b></div>
        <div><span>Department of Service</span><b>-</b></div>
        <div><span>Ward</span><b>${esc(wardName)}</b></div>
        <div><span>Attending Physician</span><b>-</b></div>
      </div>
    `;
  }

  function buildSheetBody(days, allRecords, valueMaps) {
    const tempSlots = slotRecordsForRange(days, valueMaps.temp);
    const pulseSlots = slotRecordsForRange(days, valueMaps.pulse);
    const respSlots = slotRecordsForRange(days, valueMaps.resp);
    const sbpSlots = slotRecordsForRange(days, valueMaps.sbp);
    const dbpSlots = slotRecordsForRange(days, valueMaps.dbp);
    const spo2Slots = slotRecordsForRange(days, valueMaps.spo2);
    const sosSlots = slotRecordsForRange(days, valueMaps.sos);
    const painSlots = slotRecordsForRange(days, valueMaps.pain);
    const sedativeSlots = slotRecordsForRange(days, valueMaps.sedative);

    const summaries = days.map((d) => {
      if (!dateWithinEncounter(d)) return daySummary([]);

      const summary = daySummary(
        ParameterStore.recordsForDate(
          allRecords,
          ParameterStore.localDateKey(d),
          { activeOnly:true }
        )
      );

      const eventFullNotes = clinicalEventFullNotesForDate(d);
      if (eventFullNotes) {
        summary.notes = [summary.notes, eventFullNotes]
          .filter(Boolean)
          .join("\n");
      }

      return summary;
    });

    return `
      <div class="sheet-grid">
        ${buildDateHeader(days)}

        ${buildTPChart(tempSlots, pulseSlots, days)}
        ${buildSlotRow("RESPIRATIONS RATE",respSlots,"resp")}
        ${buildBP(sbpSlots,dbpSlots)}
        ${buildSlotRow("SpO₂ / O₂ SAT (%)",spo2Slots,"spo2")}
        ${buildSlotRow("SOS SCORE",sosSlots,"sos")}

        ${buildPainChart(painSlots)}
        ${buildSlotRow("SEDATIVE SCORE",sedativeSlots,"sedative")}
        <!-- GCS remains in Patient Parameters/Audit only. -->

        ${buildDailyRow("WEIGHT",days,summaries,"weight")}
        ${buildDailyRow("HEIGHT",days,summaries,"height")}
        ${buildDailyRow("DIET",days,summaries,"diet")}

        ${buildSectionBand("FLUID INTAKE","Oral / Parenteral / Additional / Total")}
        ${buildDailyRow("Oral Fluid",days,summaries,"oral")}
        ${buildDailyRow("Parenteral / IV",days,summaries,"parenteral")}
        ${buildDailyRow("Other Intake",days,summaries,"otherIntake","gs-daily-row--io-detail")}
        ${buildDailyRow("TOTAL INTAKE",days,summaries,"intakeTotal","gs-daily-row--io-total")}

        ${buildSectionBand("FLUID OUTPUT","Urine / Emesis / Drain-Other / Total")}
        ${buildDailyRow("Urine (mL)",days,summaries,"urineMl")}
        ${buildDailyRow("Emesis (mL)",days,summaries,"emesis")}
        ${buildDailyRow("Drain / Other Output",days,summaries,"drainOther","gs-daily-row--io-detail")}
        ${buildDailyRow("TOTAL OUTPUT",days,summaries,"outputTotal","gs-daily-row--io-total")}
        ${buildBalanceRow(days,summaries)}

        ${buildSectionBand("ELIMINATION / MEDICATION")}
        ${buildDailyRow("Stool",days,summaries,"stool")}
        ${buildDailyRow("Urine characteristic",days,summaries,"urineNote")}
        ${buildDailyRow("Medications / Clinical notes",days,summaries,"notes","gs-daily-row--med")}

        ${buildPatientIdentityStrip()}
      </div>
    `;
  }

  function staticSheetHeader(meta, totalForSnapshot = null) {
    const numberText = totalForSnapshot
      ? `Graphic Sheet No. ${padSheetNo(meta.sheetNo)} of ${padSheetNo(totalForSnapshot)}`
      : `Graphic Sheet No. ${padSheetNo(meta.sheetNo)}`;

    const hospitalDayText =
      `Hospital Day ${meta.hdStart}–${meta.hdEnd}` +
      (meta.partialLastSheet ? " • DISCHARGED" : "");

    return `
      <header class="sheet-header">
        <div class="sheet-hospital">โรงพยาบาลชลบุรี • Chonburi Hospital</div>
        <h1>ฟอร์มปรอท</h1>
        <div class="sheet-subtitle">Patient Parameters &amp; Graphic Sheet</div>

        <div class="sheet-patient-meta">
          <span>ชื่อ-สกุล: <b>${esc(patientName)}</b></span>
          <span>HN: <b>${esc(hn)}</b></span>
          <span>AN: <b>${esc(an)}</b></span>
          <span>Ward: <b>${esc(wardName)}</b></span>
          <span>DX: <b>${esc(dx)}</b></span>
        </div>

        <div class="sheet-document-meta">
          <span>${esc(numberText)}</span>
          <span>${esc(hospitalDayText)}</span>
          <span>${esc(meta.dateRange)}</span>
        </div>
      </header>
    `;
  }

  function staticSheetFooter(meta, totalForSnapshot = null) {
    const pageText = totalForSnapshot
      ? `Sheet ${padSheetNo(meta.sheetNo)} of ${padSheetNo(totalForSnapshot)} • HD ${meta.hdStart}–${meta.hdEnd} • AN ${an}`
      : `Sheet ${padSheetNo(meta.sheetNo)} • HD ${meta.hdStart}–${meta.hdEnd} • AN ${an}`;

    return `
      <footer class="sheet-footer">
        <span>Electronic Nursing Record • Graphic Sheet Prototype</span>
        <span>${esc(pageText)}</span>
        <span>Plot slots: 02 / 06 / 10 / 14 / 18 / 22 ±20 min</span>
      </footer>
    `;
  }

  function buildPrintAllSheets() {
    if (!printAllHost) return;

    const source = currentParameterSource();
    const allRecords = source.allRecords;
    const activeRecords = source.activeRecords;
    const valueMaps = selectedGraphicValueMaps(activeRecords);
    const total = totalSheetCount(allRecords);

    printAllHost.innerHTML = Array.from({length:total}, (_, index) => {
      const sheetNo = index + 1;
      const meta = sheetMeta(sheetNo, total);
      const days = Array.from({length:7}, (_, dayIndex) =>
        addDays(meta.start, dayIndex)
      );

      return `
        <article class="graphic-sheet-page gs-print-sheet" data-sheet-no="${sheetNo}">
          ${staticSheetHeader(meta, total)}
          ${buildSheetBody(days, activeRecords, valueMaps)}
          ${staticSheetFooter(meta, total)}
        </article>
      `;
    }).join("");

    printAllHost.setAttribute("aria-hidden", "false");
  }

  $("printAllBtn")?.addEventListener("click", () => {
    buildPrintAllSheets();
    document.body.classList.add("gs-print-all-mode");

    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 30);
    });
  });

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("gs-print-all-mode");
    if (printAllHost) {
      printAllHost.innerHTML = "";
      printAllHost.setAttribute("aria-hidden", "true");
    }
  });

  function render() {
    const source = currentParameterSource();
    const allRecords = source.allRecords;
    const activeRecords = source.activeRecords;
    const valueMaps = selectedGraphicValueMaps(activeRecords);
    const total = totalSheetCount(allRecords);

    let activeSheetNo = sheetNoForDate(parseLocalDate(startDateInput.value));
    activeSheetNo = Math.max(1, Math.min(activeSheetNo, total));

    const meta = sheetMeta(activeSheetNo, total);
    const days = Array.from({length:7}, (_,i) => addDays(meta.start,i));

    // Always snap the date field to the legal 7-day sheet boundary.
    startDateInput.value = dateInputValue(meta.start);
    localStorage.setItem(lastSheetStorageKey, String(activeSheetNo));
    updateSheetUrl(activeSheetNo);

    const activePatient = !patientDischargeDate();
    const totalSuffix = activePatient ? ` / ${total} (ถึงปัจจุบัน)` : ` / ${total}`;

    $("sheetPosition").textContent = `แผ่นที่ ${padSheetNo(activeSheetNo)}${totalSuffix}`;
    $("sheetRange").textContent =
      `Hospital Day ${meta.hdStart}–${meta.hdEnd} • ${meta.dateRange}` +
      (meta.partialLastSheet ? " • จำหน่าย" : "");

    const rangeEl = $("hospitalDayRange");
    if (rangeEl) {
      rangeEl.textContent = `HD ${meta.hdStart}–${meta.hdEnd}`;
    }

    populateSheetSelect(total, activeSheetNo);

    if (prevSheetBtn) {
      prevSheetBtn.disabled = activeSheetNo <= 1;
      prevSheetBtn.setAttribute("aria-disabled", String(activeSheetNo <= 1));
    }

    if (nextSheetBtn) {
      nextSheetBtn.disabled = activeSheetNo >= total;
      nextSheetBtn.setAttribute("aria-disabled", String(activeSheetNo >= total));
    }

    $("sheetNumberMeta").textContent = `Graphic Sheet No. ${padSheetNo(activeSheetNo)}`;
    $("sheetHospitalDayMeta").textContent =
      `Hospital Day ${meta.hdStart}–${meta.hdEnd}` +
      (meta.partialLastSheet ? " • DISCHARGED" : "");
    $("sheetDateRangeMeta").textContent = meta.dateRange;
    $("sheetFooterPage").textContent =
      `Sheet ${padSheetNo(activeSheetNo)} • HD ${meta.hdStart}–${meta.hdEnd} • AN ${an}`;

    $("sheetBody").innerHTML =
      buildSheetBody(days, activeRecords, valueMaps);
  }

  try {
    render();
  } catch (error) {
    console.error("Graphic Sheet render failed:", error);

    const body = $("sheetBody");
    if (body) {
      body.innerHTML = `
        <div class="gs-empty-note">
          <strong>Graphic Sheet render error</strong><br>
          ${esc(error?.message || "Unknown render error")}
        </div>
      `;
    }
  }
});