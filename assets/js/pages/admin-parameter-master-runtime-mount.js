(() => {
  "use strict";

  const TARGET = "parameter_master.html";
  const MARKER = "data-cp71112-parameter-master";
  const MAX_RETRIES = 80;           // ~20 sec at 250 ms
  const RETRY_MS = 250;

  let retryCount = 0;
  let observer = null;
  let retryTimer = null;
  let mounting = false;

  function norm(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 80 &&
      rect.height > 50 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function currentNativeCard() {
    return document.querySelector(`[${MARKER}]`);
  }

  function titleElementFor(card) {
    if (!card) return null;

    const selectors = [
      "h1","h2","h3","h4",
      ".title","[class*='title']",
      "strong","b"
    ];

    for (const selector of selectors) {
      const el = card.querySelector(selector);
      if (el && norm(el.textContent)) return el;
    }

    return null;
  }

  function containsExactTitle(el, title) {
    if (!el) return false;
    const wanted = norm(title);

    const titleCandidates = Array.from(
      el.querySelectorAll("h1,h2,h3,h4,strong,b,.title,[class*='title']")
    );

    return titleCandidates.some((candidate) => norm(candidate.textContent) === wanted);
  }

  function findCardByTitle(title) {
    // First: search actual title nodes, then climb to a card-sized ancestor.
    const wanted = norm(title);

    const titleNodes = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,strong,b,div,span")
    ).filter((el) => norm(el.textContent) === wanted);

    for (const titleNode of titleNodes) {
      let node = titleNode;

      for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        if (!node || node === document.body) break;

        const rect = node.getBoundingClientRect();
        const cls = String(node.className || "");

        const cardGeometry =
          rect.width >= 220 &&
          rect.height >= 100 &&
          rect.height <= 320;

        const cardClass =
          /card|tile|module|menu|panel|feature|admin/i.test(cls);

        const likelyGridItem =
          node.parentElement &&
          node.parentElement.children.length >= 3 &&
          rect.width < node.parentElement.getBoundingClientRect().width * 0.8;

        if (
          cardGeometry &&
          (cardClass || likelyGridItem) &&
          containsExactTitle(node, title)
        ) {
          return node;
        }
      }
    }

    return null;
  }

  function findTemplateCard() {
    return (
      findCardByTitle("User & Role") ||
      findCardByTitle("Audit Viewer") ||
      findCardByTitle("Nursing Analytics") ||
      findCardByTitle("TCNP Master") ||
      findCardByTitle("Nursing Template")
    );
  }

  function findGridContainer(card) {
    if (!card) return null;

    let parent = card.parentElement;

    for (let depth = 0; parent && depth < 6; depth += 1, parent = parent.parentElement) {
      const children = Array.from(parent.children);
      const rect = parent.getBoundingClientRect();

      if (children.length < 3 || rect.width < 600) continue;

      const siblingCards = children.filter((child) => {
        const r = child.getBoundingClientRect();
        return (
          r.width >= 220 &&
          r.height >= 100 &&
          r.height <= 320 &&
          isVisible(child)
        );
      });

      if (siblingCards.length >= 3) {
        return parent;
      }
    }

    return card.parentElement;
  }

  function cloneToDirectGridItem(template, grid) {
    let direct = template;

    while (direct.parentElement && direct.parentElement !== grid) {
      direct = direct.parentElement;
    }

    return direct.cloneNode(true);
  }

  function removeBadStates(root) {
    const nodes = [root, ...root.querySelectorAll("*")];

    nodes.forEach((el) => {
      if (!(el instanceof Element)) return;

      for (const cls of Array.from(el.classList || [])) {
        if (/disabled|inactive|locked|readonly|read-only/i.test(cls)) {
          el.classList.remove(cls);
        }
      }

      el.removeAttribute("disabled");
      el.removeAttribute("aria-disabled");
    });
  }

  function setTitle(root) {
    const title = titleElementFor(root);
    if (title) {
      title.textContent = "Parameter Master";
      return;
    }

    const fallback = document.createElement("h3");
    fallback.textContent = "Parameter Master";
    root.appendChild(fallback);
  }

  function setDescription(root) {
    const paragraphs = Array.from(root.querySelectorAll("p"));

    if (paragraphs.length) {
      paragraphs[0].textContent =
        "เพิ่ม / แก้ / Retire Parameter และกำหนด Hospital/Ward scope";
      return;
    }

    // Screenshot cards sometimes use div text rather than p.
    const textBlocks = Array.from(root.querySelectorAll("div,span")).filter((el) => {
      const text = norm(el.textContent);
      return (
        text.includes("จัดการผู้ใช้") ||
        text.includes("ตรวจสอบผู้ใช้งาน") ||
        text.includes("dashboard การใช้") ||
        text.includes("ค้นหาและตรวจสอบรหัส") ||
        text.includes("สร้างและจัดการ")
      );
    });

    if (textBlocks.length) {
      textBlocks[0].textContent =
        "เพิ่ม / แก้ / Retire Parameter และกำหนด Hospital/Ward scope";
    }
  }

  function setBadge(root) {
    const candidates = Array.from(root.querySelectorAll("span,small,div"));

    const badge = candidates.find((el) => {
      const text = norm(el.textContent);
      const cls = String(el.className || "");
      return (
        /badge|chip|pill|status|phase/i.test(cls) ||
        ["phase e","phase d","phase c","phase b","read only","interactive","พร้อมใช้งาน"].includes(text)
      );
    });

    if (badge) badge.textContent = "Ready";
  }

  function setIcon(root) {
    const svg = root.querySelector("svg");

    if (svg) {
      const replacement = document.createElement("span");
      replacement.textContent = "▦";
      replacement.setAttribute("aria-hidden", "true");

      const cls = svg.getAttribute("class");
      if (cls) replacement.setAttribute("class", cls);

      svg.replaceWith(replacement);
      return;
    }

    const candidates = Array.from(root.querySelectorAll("span,div")).filter((el) => {
      if (el.children.length) return false;
      const t = norm(el.textContent);
      return ["♟","◷","◯","↪","▥","▦"].includes(t);
    });

    if (candidates[0]) candidates[0].textContent = "▦";
  }

  function makeLink(root) {
    if (root.tagName === "A") {
      root.href = TARGET;
      root.removeAttribute("target");
      return root;
    }

    const link = document.createElement("a");
    link.href = TARGET;

    // Preserve classes / inline style / content of native grid item.
    link.className = String(root.className || "");
    const style = root.getAttribute("style");
    if (style) link.setAttribute("style", style);

    link.innerHTML = root.innerHTML;
    return link;
  }

  function decorate(root) {
    removeBadStates(root);
    setTitle(root);
    setDescription(root);
    setBadge(root);
    setIcon(root);

    root.setAttribute(MARKER, "");
    root.setAttribute("aria-label", "เปิด Parameter Master");

    return root;
  }

  function insertAfterUserRole(grid, node) {
    const userRole = findCardByTitle("User & Role");

    if (userRole) {
      let direct = userRole;

      while (direct.parentElement && direct.parentElement !== grid) {
        direct = direct.parentElement;
      }

      if (direct.parentElement === grid) {
        direct.insertAdjacentElement("afterend", node);
        return true;
      }
    }

    grid.appendChild(node);
    return true;
  }

  function mount() {
    if (mounting) return false;
    mounting = true;

    try {
      const existing = currentNativeCard();
      if (existing && isVisible(existing)) return true;

      // If a stale native card exists but has been detached/hidden by rerender,
      // remove it before rebuilding.
      if (existing) existing.remove();

      const template = findTemplateCard();
      if (!template) return false;

      const grid = findGridContainer(template);
      if (!grid) return false;

      let clone = cloneToDirectGridItem(template, grid);
      clone = decorate(clone);
      clone = makeLink(clone);
      clone.setAttribute(MARKER, "");

      insertAfterUserRole(grid, clone);

      // Verify it really entered the rendered grid.
      requestAnimationFrame(() => {
        const mounted = currentNativeCard();
        if (mounted) {
          console.info(
            "[CP7.11.1.2] Parameter Master mounted",
            mounted.getBoundingClientRect()
          );
        }
      });

      return true;
    } finally {
      mounting = false;
    }
  }

  function scheduleRetry() {
    if (retryTimer) return;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryCount += 1;

      const ok = mount();

      if (!ok && retryCount < MAX_RETRIES) {
        scheduleRetry();
      }
    }, RETRY_MS);
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      // Main Admin JS may render/replace the cards after DOMContentLoaded.
      // Recheck after every meaningful DOM mutation.
      if (!currentNativeCard()) {
        scheduleRetry();
      }
    });

    observer.observe(document.documentElement, {
      childList:true,
      subtree:true
    });
  }

  function boot() {
    mount();
    scheduleRetry();
    startObserver();

    // SPA/history visibility recovery.
    window.addEventListener("focus", mount);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) mount();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }
})();
