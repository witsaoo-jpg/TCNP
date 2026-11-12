(() => {
  "use strict";

  const STORAGE_KEY = "enr_v3_parameter_master_custom_v1";
  const CORE_OVERRIDE_KEY = "enr_v3_parameter_master_core_overrides_v1";
  const AUDIT_KEY = "enr_v3_parameter_master_audit_v1";

  /*
    Core Graphic Sheet mappings are SYSTEM CONTROLLED.
    Nursing Admin can see them, but cannot create a new Graphic Sheet
    row/plot by ticking a checkbox. That protects the approved A4 geometry.
  */
  const CORE_DEFINITIONS = [
    {
      code:"TEMP", nameTh:"อุณหภูมิ", nameEn:"Temperature",
      shortLabel:"T", dataType:"NUMBER", unit:"°C",
      decimalPlaces:1, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"T_GRAPH",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:10,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"PULSE", nameTh:"ชีพจร", nameEn:"Pulse",
      shortLabel:"P", dataType:"NUMBER", unit:"bpm",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"P_GRAPH",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:20,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"RESP", nameTh:"อัตราการหายใจ", nameEn:"Respiratory Rate",
      shortLabel:"R", dataType:"NUMBER", unit:"ครั้ง/นาที",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"RESP_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:30,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"SBP", nameTh:"ความดันโลหิตตัวบน", nameEn:"Systolic Blood Pressure",
      shortLabel:"SBP", dataType:"NUMBER", unit:"mmHg",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"BP_SYSTOLIC_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:40,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"DBP", nameTh:"ความดันโลหิตตัวล่าง", nameEn:"Diastolic Blood Pressure",
      shortLabel:"DBP", dataType:"NUMBER", unit:"mmHg",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"BP_DIASTOLIC_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:50,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"SPO2", nameTh:"ออกซิเจนในเลือด", nameEn:"Oxygen Saturation",
      shortLabel:"SpO₂", dataType:"NUMBER", unit:"%",
      decimalPlaces:0, minValue:0, maxValue:100,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"SPO2_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:60,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"SOS", nameTh:"SOS Score", nameEn:"SOS Score",
      shortLabel:"SOS", dataType:"NUMBER", unit:"",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"SOS_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:70,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"PAIN", nameTh:"Pain Score", nameEn:"Pain Score",
      shortLabel:"Pain", dataType:"NUMBER", unit:"0–10",
      decimalPlaces:0, minValue:0, maxValue:10,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:true, graphicMapping:"PAIN_GRAPH",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:80,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"SEDATIVE", nameTh:"Sedative Score", nameEn:"Sedative Score",
      shortLabel:"Sedative", dataType:"NUMBER", unit:"",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:false,
      showInGraphicSheet:true, graphicMapping:"SEDATIVE_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:90,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"GCS", nameTh:"Glasgow Coma Scale", nameEn:"Glasgow Coma Scale",
      shortLabel:"GCS", dataType:"NUMBER", unit:"3–15",
      decimalPlaces:0, minValue:3, maxValue:15,
      showInParameters:true, showInMonitoringTrend:true,
      showInGraphicSheet:false, graphicMapping:null,
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:100,
      status:"ACTIVE", graphicLocked:false, adminManageable:true, systemLocked:true,
    },
    {
      code:"BRADEN", nameTh:"Braden Score", nameEn:"Braden Score",
      shortLabel:"Braden", dataType:"NUMBER", unit:"",
      decimalPlaces:0, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:false,
      showInGraphicSheet:false, graphicMapping:null,
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:110,
      status:"ACTIVE", graphicLocked:false, adminManageable:true, systemLocked:true,
    },
    {
      code:"WEIGHT", nameTh:"น้ำหนัก", nameEn:"Weight",
      shortLabel:"Weight", dataType:"NUMBER", unit:"kg",
      decimalPlaces:1, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:false,
      showInGraphicSheet:true, graphicMapping:"WEIGHT_DAILY_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:120,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
    {
      code:"HEIGHT", nameTh:"ส่วนสูง", nameEn:"Height",
      shortLabel:"Height", dataType:"NUMBER", unit:"cm",
      decimalPlaces:1, minValue:null, maxValue:null,
      showInParameters:true, showInMonitoringTrend:false,
      showInGraphicSheet:true, graphicMapping:"HEIGHT_DAILY_ROW",
      scopeType:"HOSPITAL", scopeValue:"", displayOrder:130,
      status:"ACTIVE", graphicLocked:true, adminManageable:false, systemLocked:true,
    },
  ];

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function readCustom() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function writeCustom(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }

  function readCoreOverrides() {
    try {
      const value = JSON.parse(localStorage.getItem(CORE_OVERRIDE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  }

  function writeCoreOverrides(value) {
    localStorage.setItem(CORE_OVERRIDE_KEY, JSON.stringify(value || {}));
  }

  function coreWithOverrides() {
    const overrides = readCoreOverrides();

    return CORE_DEFINITIONS.map((definition) => {
      const row = clone(definition);
      const override = overrides[row.code];

      if (row.adminManageable && override) {
        row.status = override.status === "RETIRED" ? "RETIRED" : "ACTIVE";
        row.updatedAt = override.updatedAt || null;
        row.updatedBy = override.updatedBy || null;
      }

      return row;
    });
  }

  function readAudit() {
    try {
      const rows = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function appendAudit(action, parameter, details = {}) {
    const rows = readAudit();
    rows.unshift({
      id: crypto?.randomUUID?.() || `pma-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      parameterCode: parameter?.code || null,
      parameterName: parameter?.nameTh || parameter?.nameEn || null,
      at: new Date().toISOString(),
      by: details.by || "nursing_admin",
      details,
    });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 300)));
  }

  function normalizeCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9_]/g, "");
  }

  function all() {
    return [
      ...coreWithOverrides(),
      ...readCustom().map((row) => ({
        ...clone(row),
        graphicLocked:false,
        adminManageable:true,
        systemLocked:false,
      })),
    ].sort((a, b) =>
      Number(a.displayOrder || 9999) - Number(b.displayOrder || 9999) ||
      String(a.code).localeCompare(String(b.code))
    );
  }

  function get(code) {
    const normalized = normalizeCode(code);
    return all().find((row) => row.code === normalized) || null;
  }

  function customByCode(code) {
    const normalized = normalizeCode(code);
    return readCustom().find((row) => row.code === normalized) || null;
  }

  function saveCustom(payload, actor = "nursing_admin") {
    const rows = readCustom();
    const code = normalizeCode(payload.code);

    if (!code) throw new Error("Parameter Code is required");
    if (CORE_DEFINITIONS.some((row) => row.code === code)) {
      throw new Error(`Code ${code} เป็น Core Parameter ของระบบ`);
    }

    const duplicate = rows.find((row) => row.code === code && row.id !== payload.id);
    if (duplicate) throw new Error(`Parameter Code ${code} มีอยู่แล้ว`);

    const now = new Date().toISOString();
    const existingIndex = rows.findIndex((row) => row.id === payload.id || row.code === code);

    const normalized = {
      id: payload.id || crypto?.randomUUID?.() || `pm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      code,
      nameTh: String(payload.nameTh || "").trim(),
      nameEn: String(payload.nameEn || "").trim(),
      shortLabel: String(payload.shortLabel || code).trim(),
      dataType: ["NUMBER","TEXT","BOOLEAN","SELECT"].includes(payload.dataType)
        ? payload.dataType
        : "NUMBER",
      unit: String(payload.unit || "").trim(),
      minValue: payload.minValue === "" || payload.minValue === null || payload.minValue === undefined
        ? null : Number(payload.minValue),
      maxValue: payload.maxValue === "" || payload.maxValue === null || payload.maxValue === undefined
        ? null : Number(payload.maxValue),
      decimalPlaces: Math.max(0, Math.min(4, Number(payload.decimalPlaces || 0))),
      options: Array.isArray(payload.options)
        ? payload.options.map((x) => String(x).trim()).filter(Boolean)
        : String(payload.optionsText || "")
            .split(/\r?\n|,/)
            .map((x) => x.trim())
            .filter(Boolean),
      showInParameters: payload.showInParameters !== false,
      showInMonitoringTrend: payload.showInMonitoringTrend === true,
      /*
        HARD RULE:
        Custom parameter definitions cannot enter Graphic Sheet automatically.
        A future SYSTEM mapping change is required.
      */
      showInGraphicSheet:false,
      graphicMapping:null,
      scopeType: payload.scopeType === "WARD" ? "WARD" : "HOSPITAL",
      scopeValue: payload.scopeType === "WARD"
        ? String(payload.scopeValue || "").trim()
        : "",
      displayOrder: Math.max(1, Number(payload.displayOrder || 900)),
      status: payload.status === "RETIRED" ? "RETIRED" : "ACTIVE",
      systemLocked:false,
      createdAt: existingIndex >= 0 ? rows[existingIndex].createdAt : now,
      createdBy: existingIndex >= 0 ? rows[existingIndex].createdBy : actor,
      updatedAt: now,
      updatedBy: actor,
    };

    if (!normalized.nameTh && !normalized.nameEn) {
      throw new Error("กรุณาระบุชื่อ Parameter อย่างน้อย 1 ภาษา");
    }

    if (
      normalized.minValue !== null &&
      normalized.maxValue !== null &&
      normalized.minValue > normalized.maxValue
    ) {
      throw new Error("Minimum ต้องไม่มากกว่า Maximum");
    }

    if (existingIndex >= 0) {
      rows[existingIndex] = normalized;
      appendAudit("UPDATE", normalized, { by:actor });
    } else {
      rows.push(normalized);
      appendAudit("CREATE", normalized, { by:actor });
    }

    writeCustom(rows);
    return clone(normalized);
  }

  function setStatus(code, status, actor = "nursing_admin") {
    const normalizedCode = normalizeCode(code);
    const targetStatus = status === "ACTIVE" ? "ACTIVE" : "RETIRED";
    const core = CORE_DEFINITIONS.find((row) => row.code === normalizedCode);

    if (core) {
      if (!core.adminManageable) {
        throw new Error(
          `${core.code} เป็น Graphic Core ที่ FIX ไว้ในฟอร์มปรอท ไม่สามารถ Retire จาก Nursing Admin`
        );
      }

      const overrides = readCoreOverrides();
      overrides[normalizedCode] = {
        status:targetStatus,
        updatedAt:new Date().toISOString(),
        updatedBy:actor,
      };
      writeCoreOverrides(overrides);

      const updated = get(normalizedCode);
      appendAudit(
        targetStatus === "ACTIVE" ? "RESTORE" : "RETIRE",
        updated,
        { by:actor, source:"CORE_STATUS" }
      );
      return clone(updated);
    }

    const rows = readCustom();
    const index = rows.findIndex((row) => row.code === normalizedCode);
    if (index < 0) return null;

    rows[index].status = targetStatus;
    rows[index].updatedAt = new Date().toISOString();
    rows[index].updatedBy = actor;
    writeCustom(rows);

    appendAudit(
      targetStatus === "ACTIVE" ? "RESTORE" : "RETIRE",
      rows[index],
      { by:actor, source:"CUSTOM" }
    );
    return clone(rows[index]);
  }

  function isActive(code) {
    const row = get(code);
    return !row || row.status !== "RETIRED";
  }

  function canManageStatus(code) {
    const row = get(code);
    return Boolean(row && row.adminManageable);
  }

  function scopeMatches(definition, context = {}) {
    if (definition.scopeType !== "WARD") return true;

    const target = String(definition.scopeValue || "").trim().toLocaleLowerCase("th-TH");
    if (!target) return false;

    const candidates = [
      context.wardCode,
      context.wardName,
      context.orgUnitCode,
      context.orgUnitName,
    ]
      .map((value) => String(value || "").trim().toLocaleLowerCase("th-TH"))
      .filter(Boolean);

    return candidates.includes(target);
  }

  function activeAdditional(context = {}) {
    return readCustom()
      .filter((row) =>
        row.status === "ACTIVE" &&
        row.showInParameters !== false &&
        scopeMatches(row, context)
      )
      .sort((a, b) =>
        Number(a.displayOrder || 9999) - Number(b.displayOrder || 9999) ||
        String(a.code).localeCompare(String(b.code))
      );
  }

  function audit(limit = 50) {
    return readAudit().slice(0, Math.max(1, limit));
  }

  window.ParameterMasterStore = {
    STORAGE_KEY,
    CORE_OVERRIDE_KEY,
    AUDIT_KEY,
    CORE_DEFINITIONS:clone(CORE_DEFINITIONS),
    normalizeCode,
    readCustom,
    all,
    get,
    customByCode,
    saveCustom,
    setStatus,
    isActive,
    canManageStatus,
    readCoreOverrides,
    activeAdditional,
    scopeMatches,
    audit,
  };
})();
