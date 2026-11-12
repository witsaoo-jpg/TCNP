(() => {
  "use strict";

  const amount = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  function eventsFromValues(values = {}, direction = null) {
    const events = Array.isArray(values.ioEvents) ? values.ioEvents : [];
    return events.filter((e) => {
      if (!e || e.status === "CANCELLED") return false;
      if (direction && e.direction !== direction) return false;
      return amount(e.amountMl) > 0;
    });
  }

  function flexibleTotal(values = {}, direction) {
    return eventsFromValues(values, direction)
      .reduce((sum, e) => sum + amount(e.amountMl), 0);
  }

  function totalsForValues(values = {}) {
    const intakeBase = amount(values.oralFluid) + amount(values.parenteralFluid);
    const outputBase = amount(values.urineMl)
      + amount(values.drainageMl)
      + amount(values.emesisMl)
      + amount(values.otherOutputMl);

    const intake = intakeBase + flexibleTotal(values, "IN");
    const output = outputBase + flexibleTotal(values, "OUT");

    return {
      intake,
      output,
      balance: intake - output,
      flexibleIntake: flexibleTotal(values, "IN"),
      flexibleOutput: flexibleTotal(values, "OUT"),
    };
  }

  function totalsForRecords(records = []) {
    return records
      .filter((r) => r && r.status !== "CANCELLED")
      .reduce((acc, record) => {
        const t = totalsForValues(record.values || {});
        acc.intake += t.intake;
        acc.output += t.output;
        return acc;
      }, { intake: 0, output: 0, get balance() { return this.intake - this.output; } });
  }

  function allEvents(records = [], direction = null) {
    return records
      .filter((r) => r && r.status !== "CANCELLED")
      .flatMap((r) => eventsFromValues(r.values || {}, direction));
  }

  function eventLabel(event) {
    const masterName = window.IOSourceMaster?.displayName?.(event) || event.sourceName || event.sourceCode || "Other";
    const laterality = String(event.laterality || "").trim();
    const site = String(event.site || "").trim();

    const suffix = [laterality, site].filter(Boolean).join("/");
    return suffix ? `${masterName}-${suffix}` : masterName;
  }

  function groupedDetails(events = []) {
    const groups = new Map();

    events.forEach((event) => {
      if (!event || event.status === "CANCELLED") return;
      const ml = amount(event.amountMl);
      if (!ml) return;
      const label = eventLabel(event);
      groups.set(label, (groups.get(label) || 0) + ml);
    });

    return [...groups.entries()].map(([label, ml]) => ({ label, amountMl: ml }));
  }

  function groupedText(events = []) {
    return groupedDetails(events)
      .map((g) => `${g.label} ${g.amountMl}`)
      .join(" • ");
  }

  window.IOEngine = {
    amount,
    eventsFromValues,
    flexibleTotal,
    totalsForValues,
    totalsForRecords,
    allEvents,
    eventLabel,
    groupedDetails,
    groupedText,
  };
})();
