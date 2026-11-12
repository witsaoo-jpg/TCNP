(() => {
  "use strict";

  const EVENT_TYPES = [
    { code:"ADMISSION",      name:"รับใหม่",            short:"รับใหม่" },
    { code:"TRANSFER_IN",    name:"รับย้ายเข้า",        short:"รับย้าย" },
    { code:"TRANSFER_OUT",   name:"ส่งย้าย / ย้ายออก",  short:"ย้ายออก" },
    { code:"RETURN_FROM_OR", name:"กลับจากห้องผ่าตัด",  short:"กลับ OR" },
    { code:"OPERATION",      name:"ผ่าตัด (PO)",        short:"PO" },
    { code:"PROCEDURE",      name:"หัตถการ",            short:"Procedure" },
    { code:"OTHER",          name:"เหตุการณ์อื่น",      short:"Event" },
    { code:"CUSTOM",         name:"กำหนดเอง",           short:"Custom" },
  ];

  const SLOT_HOURS = [2,6,10,14,18,22];

  const EVENT_COLORS = [
    { code:"BLACK", name:"ดำ",    hex:"#263d46" },
    { code:"BLUE",  name:"น้ำเงิน", hex:"#1f5f9a" },
    { code:"RED",   name:"แดง",    hex:"#c52f2f" },
    { code:"GREEN", name:"เขียว",  hex:"#24745f" },
    { code:"PURPLE",name:"ม่วง",    hex:"#66528f" },
  ];

  function normalizeEventColor(code) {
    const value = String(code || "BLACK").toUpperCase();
    return EVENT_COLORS.some((item) => item.code === value) ? value : "BLACK";
  }

  function eventColorHex(code) {
    const normalized = normalizeEventColor(code);
    return EVENT_COLORS.find((item) => item.code === normalized)?.hex || "#263d46";
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("th-TH");
  }

  function resolveEventType(value) {
    const raw = String(value || "").trim();
    const normalized = normalizeText(raw);

    if (!normalized) {
      return {
        code:"CUSTOM",
        text:"",
        known:false,
        meta:EVENT_TYPES.find((item) => item.code === "CUSTOM"),
      };
    }

    const known = EVENT_TYPES.find((item) => {
      if (item.code === "CUSTOM") return false;

      return (
        normalizeText(item.code) === normalized ||
        normalizeText(item.name) === normalized ||
        normalizeText(item.short) === normalized
      );
    });

    if (known) {
      return {
        code:known.code,
        text:known.name,
        known:true,
        meta:known,
      };
    }

    return {
      code:"CUSTOM",
      text:raw,
      known:false,
      meta:EVENT_TYPES.find((item) => item.code === "CUSTOM"),
    };
  }

  const pad2 = (v) => String(v).padStart(2,"0");

  function patientToken(patient = {}) {
    return String(
      patient.an ||
      patient.encounter_no ||
      patient.encounterNo ||
      patient.hn ||
      patient.id ||
      "unknown"
    );
  }

  function storageKey(patient = {}) {
    return `enr_v3_clinical_events_${patientToken(patient)}`;
  }

  function uuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function read(patient = {}) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(patient)) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(patient, rows) {
    localStorage.setItem(storageKey(patient), JSON.stringify(rows || []));
    return rows || [];
  }

  function create(patient, payload = {}) {
    const rows = read(patient);
    const now = new Date().toISOString();

    const row = {
      id: uuid(),
      status: "ACTIVE",
      eventType: payload.eventType || "OTHER",
      eventTypeText: String(payload.eventTypeText || "").trim() || null,
      eventAt: payload.eventAt,
      plotSlotHour: Number(payload.plotSlotHour) || null,
      graphicFontPt: Number(payload.graphicFontPt) > 0 ? Number(payload.graphicFontPt) : null,
      graphicText: String(payload.graphicText || "").trim() || null,
      graphicColor: normalizeEventColor(payload.graphicColor),
      source: payload.source || null,
      destination: payload.destination || null,
      eventName: payload.eventName || null,
      site: payload.site || null,
      laterality: payload.laterality || null,
      note: payload.note || null,
      countsForPOD: payload.eventType === "OPERATION"
        ? payload.countsForPOD !== false
        : false,
      operationSequence: payload.eventType === "OPERATION"
        ? (
            Number(payload.operationSequence) ||
            rows.filter((item) => item.eventType === "OPERATION").length + 1
          )
        : null,
      createdBy: payload.createdBy || "demo_nurse",
      createdAt: now,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
    };

    rows.push(row);
    write(patient, rows);
    return row;
  }

  function cancel(patient, id, reason, cancelledBy = "demo_nurse") {
    const rows = read(patient);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return null;
    if (rows[index].status === "CANCELLED") return rows[index];

    rows[index] = {
      ...rows[index],
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      cancelledBy,
      cancelReason: String(reason || "").trim() || "ไม่ระบุเหตุผล",
    };

    write(patient, rows);
    return rows[index];
  }

  function active(patient) {
    return read(patient).filter((r) => r.status !== "CANCELLED");
  }

  function cancelled(patient) {
    return read(patient).filter((r) => r.status === "CANCELLED");
  }

  function typeMeta(codeOrRow) {
    const row =
      codeOrRow && typeof codeOrRow === "object"
        ? codeOrRow
        : null;

    const code = row ? row.eventType : codeOrRow;
    const found = EVENT_TYPES.find((t) => t.code === code);

    if (found && found.code !== "CUSTOM") return found;

    if (row && String(row.eventTypeText || "").trim()) {
      const text = String(row.eventTypeText).trim();
      return { code:"CUSTOM", name:text, short:text };
    }

    return found || EVENT_TYPES.find((t) => t.code === "CUSTOM");
  }

  function localDateKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function timeText(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function thaiDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH", {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit", hour12:false,
    });
  }

  function lateralityText(code) {
    return ({R:"ขวา", L:"ซ้าย", B:"สองข้าง"})[code] || "";
  }

  function buildEventText(row = {}, options = {}) {
    const compact = Boolean(options.compact);
    const time = timeText(row.eventAt);
    const source = String(row.source || "").trim();
    const destination = String(row.destination || "").trim();
    const name = String(row.eventName || "").trim();
    const site = String(row.site || "").trim();
    const side = lateralityText(row.laterality);

    let text = "";

    switch (row.eventType) {
      case "ADMISSION":
        text = source ? `รับใหม่จาก ${source}` : "รับใหม่";
        break;
      case "TRANSFER_IN":
        text = source ? `รับย้ายจาก ${source}` : "รับย้ายเข้า";
        break;
      case "TRANSFER_OUT":
        text = destination ? `ย้ายไป ${destination}` : "ย้ายออก";
        break;
      case "RETURN_FROM_OR":
        text = `รับกลับจาก OR${name ? ` • ${name}` : ""}`;
        break;
      case "OPERATION":
        text = `PO${name ? ` ${name}` : ""}`;
        break;
      case "PROCEDURE":
        text = name || "หัตถการ";
        break;
      case "CUSTOM": {
        const customType = String(row.eventTypeText || "").trim();
        text = customType || name || "เหตุการณ์";
        if (name && customType && normalizeText(name) !== normalizeText(customType)) {
          text += ` • ${name}`;
        }
        break;
      }
      default:
        text = name || typeMeta(row).name;
        break;
    }

    const siteText = [site, side].filter(Boolean).join("-");
    if (siteText && !compact) text += ` • ${siteText}`;

    return compact ? `${text} ${time}` : `${text} เวลา ${time} น.`;
  }

  function graphicEventText(row = {}) {
    const custom = String(row.graphicText || "").trim();
    return custom || buildEventText(row);
  }

  function eventRef(row = {}) {
    const raw = String(row.id || "EVENT").replace(/[^a-zA-Z0-9]/g, "");
    const tail = raw.slice(-4).toUpperCase().padStart(4, "0");
    return `E${tail}`;
  }

  function graphemes(text) {
    const raw = String(text || "");

    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter("th", { granularity:"grapheme" });
        return Array.from(segmenter.segment(raw), (part) => part.segment);
      }
    } catch {}

    return Array.from(raw);
  }

  function graphemeLength(text) {
    return graphemes(text).length;
  }

  function truncateGraphemeText(text, maxGraphemes) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    const parts = graphemes(raw);

    if (parts.length <= maxGraphemes) return raw;

    const sliced = parts.slice(0, Math.max(1, maxGraphemes - 1)).join("").trim();
    return `${sliced}…`;
  }

  function compactEventCore(row = {}, maxGraphemes = 34) {
    const type = String(row.eventType || "OTHER");
    const customType = String(row.eventTypeText || "").trim();
    const name = String(row.eventName || "").trim();
    const source = String(row.source || "").trim();
    const destination = String(row.destination || "").trim();

    let core = "";

    switch (type) {
      case "ADMISSION":
        core = source ? `รับใหม่ ${source}` : "รับใหม่";
        break;
      case "TRANSFER_IN":
        core = source ? `รับย้าย ${source}` : "รับย้าย";
        break;
      case "TRANSFER_OUT":
        core = destination ? `ย้าย ${destination}` : "ย้ายออก";
        break;
      case "RETURN_FROM_OR":
        core = name ? `กลับ OR ${name}` : "กลับ OR";
        break;
      case "OPERATION":
        core = name ? `PO ${name}` : "PO";
        break;
      case "PROCEDURE":
        core = name || "Procedure";
        break;
      case "CUSTOM":
        core = customType || name || "Event";
        break;
      default:
        core = name || typeMeta(row).short || typeMeta(row).name || "Event";
        break;
    }

    return truncateGraphemeText(core, maxGraphemes);
  }

  function safeGraphicPresentation(row = {}, options = {}) {
    const fullLabel = buildEventText(row);
    const explicitGraphic = String(row.graphicText || "").trim();
    const sourceLabel = explicitGraphic || fullLabel;
    const ref = eventRef(row);

    const safeFullLimit = Number(options.safeFullLimit) || 58;
    const safeGraphicLimit = Number(options.safeGraphicLimit) || 64;

    const sourceLength = graphemeLength(sourceLabel);
    const fullLength = graphemeLength(fullLabel);

    // Nurse-provided short Graphic Text is honored exactly.
    if (explicitGraphic && sourceLength <= safeGraphicLimit) {
      return {
        mode:"manual-short",
        label:explicitGraphic,
        fullLabel,
        ref,
        needsFullNote:
          normalizeText(explicitGraphic) !== normalizeText(fullLabel),
        autoShortened:false,
      };
    }

    // Short generated event text remains exactly as before.
    if (!explicitGraphic && sourceLength <= safeFullLimit) {
      return {
        mode:"full",
        label:sourceLabel,
        fullLabel,
        ref,
        needsFullNote:false,
        autoShortened:false,
      };
    }

    // Long text: never split Thai text into character columns.
    // Use a concise traceable graph label; full source remains in
    // Clinical Event/Audit and is repeated in Clinical Notes.
    const time = timeText(row.eventAt);
    const compactCore = compactEventCore(row, 34);
    const label = `${compactCore} ${time} [${ref}]`;

    return {
      mode:"reference",
      label,
      fullLabel,
      ref,
      needsFullNote:true,
      autoShortened:true,
    };
  }

  // Clinical Event placement is not the same as vital-sign canonical plotting.
  // Events always remain valid; the nearest slot is used only as a paper position.
  function nearestGraphicSlot(eventAt) {
    const d = new Date(eventAt);
    if (Number.isNaN(d.getTime())) {
      return { eligible:false, slotHour:null, slotLabel:"-", dateKey:"", diffMinutes:null };
    }

    const actualMinutes = d.getHours() * 60 + d.getMinutes();
    let best = null;

    SLOT_HOURS.forEach((hour) => {
      const target = hour * 60;
      const diff = Math.abs(actualMinutes - target);

      // Equal-distance tie: choose the later slot when it is at/after the event.
      // Example 04:00 -> 06:00 rather than 02:00.
      if (
        !best ||
        diff < best.diff ||
        (diff === best.diff && target >= actualMinutes && best.target < actualMinutes)
      ) {
        best = { hour, target, diff };
      }
    });

    return {
      eligible:true,
      slotHour:best.hour,
      slotLabel:`${pad2(best.hour)}:00`,
      dateKey:localDateKey(d),
      actualTime:timeText(d),
      diffMinutes:best.diff,
    };
  }

  function selectedGraphicSlot(row = {}) {
    const suggested = nearestGraphicSlot(row.eventAt);
    const chosen = Number(row.plotSlotHour);

    if (!SLOT_HOURS.includes(chosen)) {
      return {
        ...suggested,
        selectionMode:"AUTO_FALLBACK",
        selectedByNurse:false,
      };
    }

    return {
      ...suggested,
      slotHour:chosen,
      slotLabel:`${pad2(chosen)}:00`,
      selectionMode:"MANUAL",
      selectedByNurse:true,
      suggestedSlotHour:suggested.slotHour,
      suggestedSlotLabel:suggested.slotLabel,
    };
  }

  function calendarDayDiff(laterDate, earlierDate) {
    const a = Date.UTC(laterDate.getFullYear(), laterDate.getMonth(), laterDate.getDate());
    const b = Date.UTC(earlierDate.getFullYear(), earlierDate.getMonth(), earlierDate.getDate());
    return Math.round((a - b) / 86400000);
  }

  function operationEvents(patient) {
    const allOperations = read(patient)
      .filter((r) => r.eventType === "OPERATION" && r.countsForPOD !== false)
      .sort((a,b) => String(a.eventAt).localeCompare(String(b.eventAt)));

    const sequenceById = new Map(
      allOperations.map((row, index) => [
        row.id,
        Number(row.operationSequence) || index + 1,
      ])
    );

    return allOperations
      .filter((r) => r.status !== "CANCELLED")
      .map((row) => ({
        ...row,
        operationSequence: sequenceById.get(row.id),
      }));
  }

  function operationForDate(patient, date) {
    const target = new Date(date);
    target.setHours(23,59,59,999);

    return operationEvents(patient)
      .filter((r) => {
        const d = new Date(r.eventAt);
        return !Number.isNaN(d.getTime()) && d <= target;
      })
      .at(-1) || null;
  }

  function podForDate(patient, date) {
    const operation = operationForDate(patient, date);
    if (!operation) return { value:"-", day:null, operation:null };

    const opDate = new Date(operation.eventAt);
    const targetDate = new Date(date);
    const diff = calendarDayDiff(targetDate, opDate);

    if (diff < 0) return { value:"-", day:null, operation:null };
    if (diff === 0) return { value:"✕", day:0, operation, operationDay:true };
    return { value:String(diff), day:diff, operation, operationDay:false };
  }

  /*
    Real Chonburi graphic-sheet behavior for multiple operations:
    every ACTIVE operation keeps its own postoperative-day counter.

    Example:
      OP#1 on day 1  -> ✕, 1, 2, 3, 4...
      OP#2 on day 3  ->       ✕, 1, 2...
    Combined row:
      ✕ | 1 | 2,✕ | 3,1 | 4,2 ...

    Cancelling an operation automatically removes that operation's
    series because operationEvents() returns ACTIVE events only.
  */
  function podSeriesForDate(patient, date) {
    const targetDate = new Date(date);

    const series = operationEvents(patient)
      .map((operation) => {
        const opDate = new Date(operation.eventAt);
        const diff = calendarDayDiff(targetDate, opDate);

        if (diff < 0) return null;

        return {
          sequence:Number(operation.operationSequence) || 1,
          operation,
          day:diff,
          value:diff === 0 ? "✕" : String(diff),
          operationDay:diff === 0,
        };
      })
      .filter(Boolean)
      .sort((a,b) => a.sequence - b.sequence);

    return {
      items:series,
      count:series.length,
      value:series.length ? series.map((item) => item.value).join(",") : "-",
      hasOperationDay:series.some((item) => item.operationDay),
    };
  }

  function earliestAdmissionEvent(patient) {
    return active(patient)
      .filter((r) => r.eventType === "ADMISSION")
      .sort((a,b) => String(a.eventAt).localeCompare(String(b.eventAt)))[0] || null;
  }

  window.ClinicalEventStore = {
    EVENT_TYPES,
    EVENT_COLORS,
    SLOT_HOURS,
    storageKey,
    read,
    write,
    create,
    cancel,
    active,
    cancelled,
    typeMeta,
    localDateKey,
    timeText,
    thaiDateTime,
    buildEventText,
    graphicEventText,
    safeGraphicPresentation,
    eventRef,
    graphemeLength,
    truncateGraphemeText,
    normalizeEventColor,
    eventColorHex,
    resolveEventType,
    nearestGraphicSlot,
    selectedGraphicSlot,
    operationEvents,
    operationForDate,
    podForDate,
    podSeriesForDate,
    earliestAdmissionEvent,
  };
})();