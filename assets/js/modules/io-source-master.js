(() => {
  "use strict";

  const SOURCES = [
    // Additional intake sources. Oral and standard IV remain quick fields.
    { code: "ENTERAL", direction: "IN", name: "Enteral feeding", shortName: "Enteral" },
    { code: "BLOOD", direction: "IN", name: "Blood / Blood product", shortName: "Blood" },
    { code: "TPN", direction: "IN", name: "TPN / Parenteral nutrition", shortName: "TPN" },
    { code: "OTHER_IN", direction: "IN", name: "Other intake", shortName: "Other IN", customName: true },

    // Flexible output / drain sources.
    { code: "ICD", direction: "OUT", name: "Intercostal Drain (ICD)", shortName: "ICD" },
    { code: "PTBD", direction: "OUT", name: "PTBD / Biliary drainage", shortName: "PTBD" },
    { code: "JP", direction: "OUT", name: "Jackson-Pratt Drain", shortName: "JP" },
    { code: "HEMOVAC", direction: "OUT", name: "Hemovac Drain", shortName: "Hemovac" },
    { code: "PENROSE", direction: "OUT", name: "Penrose Drain", shortName: "Penrose" },
    { code: "PIGTAIL", direction: "OUT", name: "Pigtail Drain", shortName: "Pigtail" },
    { code: "NG_ASP", direction: "OUT", name: "NG Aspiration", shortName: "NG" },
    { code: "COLOSTOMY", direction: "OUT", name: "Colostomy Output", shortName: "Colostomy" },
    { code: "ILEOSTOMY", direction: "OUT", name: "Ileostomy Output", shortName: "Ileostomy" },
    { code: "NEPHROSTOMY", direction: "OUT", name: "Nephrostomy Output", shortName: "Nephrostomy" },
    { code: "DRAIN_OTHER", direction: "OUT", name: "Other Drain", shortName: "Drain", customName: true },
    { code: "OTHER_OUT", direction: "OUT", name: "Other Output", shortName: "Other OUT", customName: true },
  ];

  function byDirection(direction) {
    return SOURCES.filter((s) => s.direction === direction);
  }

  function find(code) {
    return SOURCES.find((s) => s.code === code) || null;
  }

  function displayName(event) {
    if (!event) return "";
    const source = find(event.sourceCode);
    const custom = String(event.customName || "").trim();
    if (custom) return custom;
    return event.sourceName || source?.shortName || source?.name || event.sourceCode || "Other";
  }

  window.IOSourceMaster = {
    SOURCES,
    byDirection,
    find,
    displayName,
  };
})();
