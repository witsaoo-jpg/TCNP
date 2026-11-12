(() => {
  "use strict";

  const TARGET = "parameter_master.html";

  function alreadyLinked() {
    return Array.from(document.querySelectorAll("a[href]")).some((a) => {
      const href = String(a.getAttribute("href") || "");
      return href.includes("parameter_master.html") || href.includes("admin_parameter_master.html");
    });
  }

  function chooseContainer() {
    const selectors = [
      "[data-admin-modules]",
      "#adminModules",
      ".admin-modules",
      ".admin-grid",
      ".module-grid",
      ".dashboard-grid",
      ".cards-grid",
      ".card-grid",
      ".admin-dashboard",
      "main"
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return document.body;
  }

  function inferCardClass(container) {
    const candidate = container.querySelector(
      ":scope > a, :scope > article, :scope > section, :scope > .card, :scope > div"
    );
    if (!candidate) return "";
    return String(candidate.className || "")
      .split(/\s+/)
      .filter((name) => /card|module|tile|menu|admin/i.test(name))
      .join(" ");
  }

  function createCard(container) {
    const a = document.createElement("a");
    a.href = TARGET;
    a.setAttribute("data-cp7111-parameter-master", "");
    a.setAttribute("aria-label", "เปิด Parameter Master");

    const inherited = inferCardClass(container);
    a.className = inherited || "cp7111-admin-module-card";
    if (inherited) a.classList.add("cp7111-parameter-master-card");

    a.innerHTML = `
      <span class="cp7111-admin-module-card__icon" aria-hidden="true">📊</span>
      <span class="cp7111-admin-module-card__body">
        <strong>Parameter Master</strong>
        <small>เพิ่ม / แก้ / Retire Parameter • Hospital/Ward scope</small>
        <small class="cp7111-admin-module-card__safe">🔒 Custom Parameter ไม่ Plot Graphic Sheet</small>
      </span>
      <span class="cp7111-admin-module-card__arrow" aria-hidden="true">›</span>
    `;
    return a;
  }

  function mount() {
    if (alreadyLinked()) return;

    const container = chooseContainer();
    const card = createCard(container);

    if (container.tagName === "MAIN" || container === document.body) {
      const section = document.createElement("section");
      section.className = "cp7111-admin-module-section";
      section.setAttribute("data-cp7111-section", "");

      const heading = document.createElement("div");
      heading.className = "cp7111-admin-module-section__head";
      heading.innerHTML = `<div><span>NURSING ADMIN</span><h2>Parameter Management</h2></div>`;

      const grid = document.createElement("div");
      grid.className = "cp7111-admin-module-grid";
      grid.appendChild(card);

      section.appendChild(heading);
      section.appendChild(grid);
      container.appendChild(section);
    } else {
      container.appendChild(card);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once:true });
  } else {
    mount();
  }
})();
