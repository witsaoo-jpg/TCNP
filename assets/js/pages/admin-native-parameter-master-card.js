(() => {
  "use strict";

  const TARGET = "parameter_master.html";
  const MARKER = "data-cp71111-native-parameter-master";

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  function existingParameterMasterLink() {
    return Array.from(document.querySelectorAll("a[href]")).find((a) => {
      const href = String(a.getAttribute("href") || "");
      return href.includes("parameter_master.html") ||
             href.includes("admin_parameter_master.html");
    }) || null;
  }

  function cardLikeElementFromText(patterns) {
    const all = Array.from(document.querySelectorAll("a,article,section,div,button"));
    const matches = all.filter((el) => {
      const t = normalize(el.textContent);
      return patterns.some((pattern) => t.includes(pattern));
    });

    // Prefer an actual clickable card.
    const clickable = matches.find((el) =>
      el.matches("a[href],button") &&
      el.children.length >= 1
    );
    if (clickable) return clickable;

    // Walk upward from a text-bearing node until we hit a card-like element.
    for (const el of matches) {
      let node = el;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        if (!node) break;
        const cls = String(node.className || "");
        const hasCardishClass = /card|module|tile|menu|panel/i.test(cls);
        const clickableAncestor = node.matches("a[href],button,[role='link']");
        if (hasCardishClass || clickableAncestor) return node;
      }
    }

    return null;
  }

  function findTemplateCard() {
    // Screenshot-confirmed native cards. Prefer User & Role so the new card
    // lands at the end of the same last row.
    return (
      cardLikeElementFromText(["user & role", "user &amp; role"]) ||
      cardLikeElementFromText(["audit viewer"]) ||
      cardLikeElementFromText(["nursing analytics"]) ||
      cardLikeElementFromText(["tcnp master"]) ||
      cardLikeElementFromText(["nursing template"])
    );
  }

  function nearestCardContainer(card) {
    if (!card) return null;

    let parent = card.parentElement;
    for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
      const children = Array.from(parent.children);
      if (children.length >= 2) {
        const siblingCardCount = children.filter((child) => {
          const cls = String(child.className || "");
          return (
            child.matches("a[href],article,section,div") &&
            (/card|module|tile|panel/i.test(cls) || child.tagName === card.tagName)
          );
        }).length;

        if (siblingCardCount >= 2) return parent;
      }
    }
    return card.parentElement;
  }

  function replaceTextNode(root, matcher, replacement) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = normalize(node.nodeValue);
          return matcher(text)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const node = walker.nextNode();
    if (node) {
      node.nodeValue = replacement;
      return true;
    }
    return false;
  }

  function findByText(root, tags, patterns) {
    const selector = tags.join(",");
    return Array.from(root.querySelectorAll(selector)).find((el) => {
      const t = normalize(el.textContent);
      return patterns.some((p) => t.includes(p));
    }) || null;
  }

  function resetInteractiveState(card) {
    card.classList.remove(
      "disabled",
      "is-disabled",
      "inactive",
      "is-inactive",
      "locked",
      "is-locked",
      "read-only"
    );

    card.removeAttribute("disabled");
    card.removeAttribute("aria-disabled");
    card.removeAttribute("tabindex");

    card.querySelectorAll("[disabled],[aria-disabled='true']").forEach((el) => {
      el.removeAttribute("disabled");
      el.removeAttribute("aria-disabled");
    });
  }

  function makeClickable(card) {
    if (card.tagName === "A") {
      card.setAttribute("href", TARGET);
      card.removeAttribute("target");
      return card;
    }

    // Preserve full visual DOM but wrap it in a real anchor.
    const anchor = document.createElement("a");
    anchor.href = TARGET;
    anchor.className = String(card.className || "");
    anchor.innerHTML = card.innerHTML;

    // Preserve inline style if the original uses it.
    const style = card.getAttribute("style");
    if (style) anchor.setAttribute("style", style);

    card.replaceWith(anchor);
    return anchor;
  }

  function setIcon(card) {
    const iconCandidates = Array.from(
      card.querySelectorAll("svg,[class*='icon'],[class*='Icon'],span,div")
    );

    const candidate = iconCandidates.find((el) => {
      const cls = String(el.className?.baseVal || el.className || "");
      const t = normalize(el.textContent);
      return /icon/i.test(cls) || ["▦","▥","◯","↪","◷","♟"].includes(t);
    });

    if (candidate) {
      // Avoid disturbing an SVG container. Replace with a simple native-sized glyph.
      const icon = document.createElement("span");
      icon.textContent = "▦";
      icon.setAttribute("aria-hidden", "true");
      icon.className = String(candidate.className?.baseVal || candidate.className || "");
      try {
        candidate.replaceWith(icon);
      } catch {
        candidate.textContent = "▦";
      }
    }
  }

  function setBadge(card) {
    // Screenshot shows small top-right badges such as Read only / Phase E.
    const candidates = Array.from(card.querySelectorAll("span,small,div"));
    const badge = candidates.find((el) => {
      const t = normalize(el.textContent);
      const cls = String(el.className || "");
      return (
        /badge|status|phase|chip|pill/i.test(cls) ||
        ["read only","interactive","พร้อมใช้งาน","phase b","phase c","phase d","phase e"].includes(t)
      );
    });

    if (badge) {
      badge.textContent = "Ready";
      return;
    }
  }

  function populate(card) {
    resetInteractiveState(card);

    // Title
    const title = findByText(
      card,
      ["h1","h2","h3","h4","strong","b","div","span"],
      ["user & role","audit viewer","nursing analytics","tcnp master","nursing template"]
    );
    if (title) {
      title.textContent = "Parameter Master";
    } else {
      replaceTextNode(
        card,
        (t) =>
          t.includes("user & role") ||
          t.includes("audit viewer") ||
          t.includes("nursing analytics") ||
          t.includes("tcnp master") ||
          t.includes("nursing template"),
        "Parameter Master"
      );
    }

    // Description
    const textEls = Array.from(card.querySelectorAll("p,small,div,span"));
    const desc = textEls.find((el) => {
      const t = normalize(el.textContent);
      return (
        t.includes("จัดการผู้ใช้") ||
        t.includes("ตรวจสอบ") ||
        t.includes("dashboard") ||
        t.includes("ค้นหาและตรวจสอบ") ||
        t.includes("สร้างและจัดการ")
      );
    });

    if (desc) {
      desc.textContent = "เพิ่ม / แก้ / Retire Parameter และกำหนด Hospital/Ward scope";
    } else {
      const p = document.createElement("p");
      p.textContent = "เพิ่ม / แก้ / Retire Parameter และกำหนด Hospital/Ward scope";
      card.appendChild(p);
    }

    setIcon(card);
    setBadge(card);

    card.setAttribute(MARKER, "");
    card.setAttribute("aria-label", "เปิด Parameter Master");
  }

  function mount() {
    const existing = existingParameterMasterLink();

    // Remove only the previous CP7.11.1 injected fallback card if it exists.
    // Do not remove a genuine native/manual Parameter Master card.
    if (existing && existing.hasAttribute("data-cp7111-parameter-master")) {
      const section = existing.closest("[data-cp7111-section]");
      if (section) section.remove();
      else existing.remove();
    } else if (existing) {
      return;
    }

    const template = findTemplateCard();
    if (!template) {
      console.warn("[CP7.11.1.1] Native Admin card template not found.");
      return;
    }

    const container = nearestCardContainer(template);
    if (!container) {
      console.warn("[CP7.11.1.1] Native Admin card container not found.");
      return;
    }

    let clone = template.cloneNode(true);

    // If we cloned a nested element rather than its direct grid item,
    // normalize to the direct child so CSS Grid behavior matches siblings.
    if (template.parentElement !== container) {
      let direct = template;
      while (direct.parentElement && direct.parentElement !== container) {
        direct = direct.parentElement;
      }
      clone = direct.cloneNode(true);
    }

    populate(clone);
    clone = makeClickable(clone);
    clone.setAttribute(MARKER, "");

    // Put after User & Role when possible, matching screenshot target:
    // Audit Viewer | User & Role | Parameter Master
    const userRoleCard = cardLikeElementFromText(["user & role"]);
    if (userRoleCard) {
      let direct = userRoleCard;
      while (direct.parentElement && direct.parentElement !== container) {
        direct = direct.parentElement;
      }

      if (direct.parentElement === container) {
        direct.insertAdjacentElement("afterend", clone);
        return;
      }
    }

    container.appendChild(clone);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once:true });
  } else {
    mount();
  }
})();
