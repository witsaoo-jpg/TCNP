(() => {
  "use strict";

  const SLOT_HOURS = [2, 6, 10, 14, 18, 22];
  const SLOT_TOLERANCE_MINUTES = 20;
  const STORAGE_PREFIX = "enr_v3_patient_parameters_";

  const GRAPH_VALUE_RULES = {
    temp:      {},
    pulse:     {},
    resp:      {},
    sbp:       {},
    dbp:       {},
    spo2:      {},
    sos:       {},
    pain:      { min:0, max:10, integerOnly:true },
    sedative:  {},
  };

  const pad = (n) => String(n).padStart(2, "0");

  function localDateKey(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function localDateTimeValue(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function encounterKey(patient) {
    return String(
      patient?.encounter_id ??
      patient?.encounterId ??
      patient?.an ??
      patient?.encounter_no ??
      patient?.hn ??
      "unknown"
    );
  }

  function storageKey(patient) {
    return `${STORAGE_PREFIX}${encounterKey(patient)}`;
  }

  function read(patient) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(patient)) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(patient, records) {
    localStorage.setItem(storageKey(patient), JSON.stringify(records));
  }

  function isCancelledRecord(record) {
    const status = String(record?.status || "").trim().toUpperCase();
    return status === "CANCELLED" || status === "CANCELED";
  }

  function isActiveRecord(record) {
    return !isCancelledRecord(record);
  }

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `pp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function targetSlotForObservedAt(observedAt) {
    const d = new Date(observedAt);
    if (Number.isNaN(d.getTime())) {
      return { eligible: false, reason: "invalid_datetime" };
    }

    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    let best = null;

    SLOT_HOURS.forEach((hour) => {
      const targetMinute = hour * 60;
      const diff = Math.abs(minuteOfDay - targetMinute);
      if (!best || diff < best.diffMinutes) {
        best = { hour, targetMinute, diffMinutes: diff };
      }
    });

    if (!best || best.diffMinutes > SLOT_TOLERANCE_MINUTES) {
      return {
        eligible: false,
        dateKey: localDateKey(d),
        actualTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        diffMinutes: best?.diffMinutes ?? null,
        reason: "outside_window",
      };
    }

    const hh = pad(best.hour);
    return {
      eligible: true,
      dateKey: localDateKey(d),
      hour: best.hour,
      slotKey: `${localDateKey(d)}@${hh}`,
      slotLabel: `${hh}:00`,
      windowLabel: `${pad((best.hour + 23) % 24)}:40–${hh}:20`,
      actualTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      diffMinutes: best.diffMinutes,
    };
  }

  function activeRecords(patient) {
    return read(patient).filter(isActiveRecord);
  }

  function chooseCanonicalSlotRecords(records) {
    const groups = new Map();

    records
      .filter(isActiveRecord)
      .forEach((record) => {
        const slot = targetSlotForObservedAt(record.observedAt);
        if (!slot.eligible) return;

        if (!groups.has(slot.slotKey)) groups.set(slot.slotKey, []);
        groups.get(slot.slotKey).push({ record, slot });
      });

    const selected = new Map();

    groups.forEach((entries, slotKey) => {
      entries.sort((a, b) => {
        if (a.slot.diffMinutes !== b.slot.diffMinutes) {
          return a.slot.diffMinutes - b.slot.diffMinutes;
        }
        // Tie-breaker: later system creation wins, while both records remain in history.
        return String(b.record.createdAt || "").localeCompare(String(a.record.createdAt || ""));
      });
      selected.set(slotKey, entries[0].record);
    });

    return selected;
  }

  function chooseCanonicalSlotRecordsForValue(records, key, options = {}) {
    const min = Number.isFinite(options.min) ? Number(options.min) : -Infinity;
    const max = Number.isFinite(options.max) ? Number(options.max) : Infinity;
    const integerOnly = options.integerOnly === true;
    const groups = new Map();

    records
      .filter(isActiveRecord)
      .forEach((record) => {
        const raw = record?.values?.[key];
        if (raw === null || raw === undefined || raw === "") return;

        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        if (value < min || value > max) return;
        if (integerOnly && !Number.isInteger(value)) return;

        const slot = targetSlotForObservedAt(record.observedAt);
        if (!slot.eligible) return;

        if (!groups.has(slot.slotKey)) groups.set(slot.slotKey, []);
        groups.get(slot.slotKey).push({ record, slot, value });
      });

    const selected = new Map();

    groups.forEach((entries, slotKey) => {
      entries.sort((a, b) => {
        if (a.slot.diffMinutes !== b.slot.diffMinutes) {
          return a.slot.diffMinutes - b.slot.diffMinutes;
        }

        // Same rule as the main parameter engine:
        // when distance is equal, the later system-created record wins.
        return String(b.record.createdAt || "")
          .localeCompare(String(a.record.createdAt || ""));
      });

      selected.set(slotKey, entries[0].record);
    });

    return selected;
  }

  function graphState(record, allRecords) {
    if (record.status === "CANCELLED") {
      return { code: "CANCELLED", label: "ยกเลิกแล้ว" };
    }

    const slot = targetSlotForObservedAt(record.observedAt);

    if (!slot.eligible) {
      return {
        code: "OUTSIDE",
        label: "ไม่เข้า Plot window",
        detail: "เก็บใน Parameters table / Audit",
        slot,
      };
    }

    const presentKeys = Object.keys(GRAPH_VALUE_RULES)
      .filter((key) => {
        const raw = record?.values?.[key];
        return raw !== null && raw !== undefined && raw !== "";
      });

    const canonicalKeys = presentKeys.filter((key) => {
      const selected = chooseCanonicalSlotRecordsForValue(
        allRecords,
        key,
        GRAPH_VALUE_RULES[key]
      );
      return selected.get(slot.slotKey)?.id === record.id;
    });

    if (canonicalKeys.length) {
      return {
        code: "PLOT",
        label: `Plot ${slot.slotLabel}`,
        detail:
          `Canonical: ${canonicalKeys.join(", ")} • ` +
          `วัดจริง ${slot.actualTime} • ต่าง ${slot.diffMinutes} นาที`,
        slot,
        canonicalKeys,
      };
    }

    if (!presentKeys.length) {
      return {
        code: "NO_GRAPH_VALUE",
        label: "บันทึกข้อมูล",
        detail: "ไม่มีค่า Graphic Parameter ในรายการนี้",
        slot,
      };
    }

    return {
      code: "ELIGIBLE_NOT_SELECTED",
      label: `Eligible ${slot.slotLabel}`,
      detail:
        "เข้าเกณฑ์เวลา แต่แต่ละค่ามี ACTIVE observation " +
        "ที่ใกล้ Slot มากกว่าหรือใหม่กว่าตาม tie-break rule",
      slot,
      canonicalKeys:[],
    };
  }

  function save(patient, payload) {
    const records = read(patient);
    const now = new Date().toISOString();

    const record = {
      id: uuid(),
      status: "ACTIVE",
      observedAt: payload.observedAt,
      createdAt: now,
      createdBy: payload.createdBy || "demo_nurse",
      orgUnit: payload.orgUnit || null,
      values: payload.values || {},
      notes: payload.notes || {},
      cancelReason: null,
      cancelledAt: null,
    };

    records.push(record);
    write(patient, records);
    return record;
  }

  function cancel(patient, id, reason = "") {
    const records = read(patient);
    const row = records.find((r) => r.id === id);
    if (!row) return null;

    row.status = "CANCELLED";
    row.cancelReason = reason || "ยกเลิกรายการ";
    row.cancelledAt = new Date().toISOString();
    write(patient, records);
    return row;
  }

  function clearAll(patient) {
    localStorage.removeItem(storageKey(patient));
  }

  function parseNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function value(record, key) {
    return record?.values?.[key] ?? null;
  }

  function latestNonEmpty(records, key) {
    const rows = [...records]
      .filter(isActiveRecord)
      .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));

    let found = null;
    rows.forEach((r) => {
      const v = value(r, key);
      if (v !== null && v !== undefined && v !== "") found = v;
    });
    return found;
  }

  function sum(records, key) {
    return records
      .filter(isActiveRecord)
      .reduce((acc, r) => acc + (parseNumber(value(r, key)) || 0), 0);
  }

  function recordsForDate(records, dateKey, options = {}) {
    const activeOnly = options.activeOnly === true;

    return records.filter((record) => {
      if (activeOnly && !isActiveRecord(record)) return false;
      return localDateKey(record.observedAt) === dateKey;
    });
  }

  window.ParameterStore = {
    SLOT_HOURS,
    SLOT_TOLERANCE_MINUTES,
    GRAPH_VALUE_RULES,
    localDateKey,
    localDateTimeValue,
    encounterKey,
    read,
    isCancelledRecord,
    isActiveRecord,
    activeRecords,
    save,
    cancel,
    clearAll,
    targetSlotForObservedAt,
    chooseCanonicalSlotRecords,
    chooseCanonicalSlotRecordsForValue,
    graphState,
    parseNumber,
    value,
    latestNonEmpty,
    sum,
    recordsForDate,
  };
})();