/* ==========================================================================
   ODD RIGGING — shared script (all pages)
   - Mobile menu and cart use native <dialog> (focus is trapped, background
     is inert, Escape closes, focus returns to the button that opened it).
   - The cart builds a WhatsApp order message. No payment is taken here.
   - All text is written with textContent. No innerHTML, no eval.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
     SETTINGS — the only place to change ordering details
     ------------------------------------------------------------------ */
  var OR_CONFIG = {
    whatsappNumber: "17587235872",
    currency: "EC$",            // CONFIRM: EC$ assumed. Change here only.
    deliveryFee: 5,             // Islandwide Saint Lucia delivery fee
    deliveryText: "Islandwide delivery in Saint Lucia, 2–3 days. Cash on delivery.",
    sizes: ["S", "M", "L", "XL", "2XL"],
    maxQty: 20,
    maxLines: 30,
    storageKey: "or-order-v1",
    // Paste full profile URLs (https://...) when ready. Empty = icon shown, not clickable.
    social: {
      instagram: "",
      facebook: "",
      tiktok: "",
      threads: ""
    }
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- one shared live region for announcements ---------- */
  var live = document.getElementById("or-live");
  function announce(msg) {
    if (!live) return;
    live.textContent = "";
    window.setTimeout(function () { live.textContent = msg; }, 60);
  }

  function money(n) {
    var fixed = Math.round(n * 100) / 100;
    return OR_CONFIG.currency + (fixed % 1 === 0 ? String(fixed) : fixed.toFixed(2));
  }

  /* ---------- fill config-driven text (delivery fee etc.) ---------- */
  $$("[data-or='delivery-fee']").forEach(function (el) { el.textContent = money(OR_CONFIG.deliveryFee); });
  $$("[data-or='delivery-text']").forEach(function (el) { el.textContent = OR_CONFIG.deliveryText; });
  $$("[data-or='year']").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- hide images that fail to load (no inline onerror under strict CSP) ---------- */
  function hideBroken(img) { img.style.display = "none"; }
  $$("img").forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) hideBroken(img);
  });
  document.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "IMG") hideBroken(e.target);
  }, true);

  /* ---------- dialogs ---------- */
  function wireDialog(dialog, openers) {
    if (!dialog || typeof dialog.showModal !== "function") return;
    openers.forEach(function (btn) {
      btn.addEventListener("click", function () {
        dialog.showModal();
        btn.setAttribute("aria-expanded", "true");
      });
    });
    dialog.addEventListener("close", function () {
      openers.forEach(function (btn) { btn.setAttribute("aria-expanded", "false"); });
    });
    // click on the backdrop closes
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    $$("[data-close-dialog]", dialog).forEach(function (b) {
      b.addEventListener("click", function () { dialog.close(); });
    });
  }

  var menu = document.getElementById("menu-dialog");
  wireDialog(menu, $$("[data-open='menu']"));
  if (menu) {
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { menu.close(); }); });
  }

  var cartDialog = document.getElementById("cart-dialog");
  wireDialog(cartDialog, $$("[data-open='cart']"));

  /* ---------- order storage ---------- */
  var allowedSizes = {};
  OR_CONFIG.sizes.forEach(function (s) { allowedSizes[s] = true; });

  function cleanLine(x) {
    if (!x || typeof x !== "object") return null;
    var id = typeof x.id === "string" ? x.id.slice(0, 40) : "";
    var name = typeof x.name === "string" ? x.name.slice(0, 80) : "";
    var size = typeof x.size === "string" ? x.size : "";
    var qty = parseInt(x.qty, 10);
    var price = (typeof x.price === "number" && isFinite(x.price) && x.price >= 0) ? x.price : null;
    if (!/^[a-z0-9-]+$/.test(id) || !name || !allowedSizes[size] || !(qty >= 1)) return null;
    return { id: id, name: name, size: size, qty: Math.min(qty, OR_CONFIG.maxQty), price: price };
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(OR_CONFIG.storageKey);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.map(cleanLine).filter(Boolean).slice(0, OR_CONFIG.maxLines);
    } catch (e) { return []; }
  }
  function save(lines) {
    try { window.localStorage.setItem(OR_CONFIG.storageKey, JSON.stringify(lines)); } catch (e) { /* private mode: order lasts for this page only */ }
  }

  var order = load();

  function itemCount() { return order.reduce(function (n, l) { return n + l.qty; }, 0); }

  /* ---------- WhatsApp message ---------- */
  function buildMessage() {
    var lines = ["Hi ODD RIGGING, I'd like to order:", ""];
    var allPriced = true, subtotal = 0;
    order.forEach(function (l, i) {
      var priceText = l.price === null ? "price to confirm" : money(l.price) + " each";
      if (l.price === null) allPriced = false; else subtotal += l.price * l.qty;
      lines.push((i + 1) + ". " + l.name + " – Size " + l.size + " – Qty " + l.qty + " – " + priceText);
    });
    lines.push("");
    if (allPriced) {
      lines.push("Items: " + money(subtotal));
      lines.push("Delivery: " + money(OR_CONFIG.deliveryFee));
      lines.push("Total: " + money(subtotal + OR_CONFIG.deliveryFee) + " (cash on delivery)");
    } else {
      lines.push("Total: to confirm (cash on delivery)");
    }
    lines.push("");
    lines.push("My name: ");
    lines.push("Delivery area: ");
    return lines.join("\n");
  }

  /* ---------- render cart ---------- */
  var listEl = $("#cart-lines");
  var emptyEl = $("#cart-empty");
  var summaryEl = $("#cart-summary");
  var sendEl = $("#cart-send");
  var clearEl = $("#cart-clear");
  var sentEl = $("#cart-sent");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function render() {
    var count = itemCount();
    $$("[data-or='cart-count']").forEach(function (c) { c.textContent = String(count); });
    $$("[data-or='cart-unit']").forEach(function (u) { u.textContent = count === 1 ? " item" : " items"; });
    if (!listEl) return;

    listEl.textContent = "";
    var hasItems = order.length > 0;
    emptyEl.hidden = hasItems;
    summaryEl.hidden = !hasItems;
    clearEl.hidden = !hasItems;
    if (!hasItems) sentEl.hidden = true;

    var subtotal = 0, allPriced = true;
    order.forEach(function (l, i) {
      var li = el("li", "cart-line");
      li.appendChild(el("p", "cart-line-name", l.name));
      li.appendChild(el("p", "cart-line-meta", l.price === null ? "Price to confirm" : money(l.price * l.qty)));
      var meta = el("p", "cart-line-meta full", "Size " + l.size + (l.price === null ? "" : " · " + money(l.price) + " each"));
      li.appendChild(meta);

      var controls = el("div", "cart-line-controls");
      var qty = el("div", "qty");
      var label = l.name + ", size " + l.size;
      var minus = el("button", "", "−"); minus.type = "button";
      minus.setAttribute("aria-label", "Decrease quantity of " + label);
      minus.disabled = l.qty <= 1;
      var out = el("output", "", String(l.qty));
      out.setAttribute("aria-label", "Quantity");
      var plus = el("button", "", "+"); plus.type = "button";
      plus.setAttribute("aria-label", "Increase quantity of " + label);
      plus.disabled = l.qty >= OR_CONFIG.maxQty;
      minus.addEventListener("click", function () { changeQty(i, -1); });
      plus.addEventListener("click", function () { changeQty(i, 1); });
      qty.appendChild(minus); qty.appendChild(out); qty.appendChild(plus);

      var remove = el("button", "link-btn", "Remove"); remove.type = "button";
      remove.setAttribute("aria-label", "Remove " + label);
      remove.addEventListener("click", function () { removeLine(i); });

      controls.appendChild(qty); controls.appendChild(remove);
      li.appendChild(controls);
      listEl.appendChild(li);

      if (l.price === null) allPriced = false; else subtotal += l.price * l.qty;
    });

    if (hasItems) {
      $("#sum-items").textContent = allPriced ? money(subtotal) : "To confirm";
      $("#sum-delivery").textContent = money(OR_CONFIG.deliveryFee);
      $("#sum-total").textContent = allPriced ? money(subtotal + OR_CONFIG.deliveryFee) : "To confirm";
      sendEl.href = "https://wa.me/" + OR_CONFIG.whatsappNumber + "?text=" + encodeURIComponent(buildMessage());
      sendEl.removeAttribute("aria-disabled");
      sendEl.removeAttribute("tabindex");
    } else {
      sendEl.removeAttribute("href");
      sendEl.setAttribute("aria-disabled", "true");
      sendEl.setAttribute("tabindex", "-1");
    }
  }

  function changeQty(i, delta) {
    var l = order[i]; if (!l) return;
    var next = l.qty + delta;
    if (next < 1 || next > OR_CONFIG.maxQty) return;
    l.qty = next; save(order); render();
    announce(l.name + ", size " + l.size + ": quantity " + next + ".");
    // keep keyboard focus on the same control after re-render
    var btns = $$(".cart-line")[i] ? $$(".qty button", $$(".cart-line")[i]) : [];
    var target = btns[delta < 0 ? 0 : 1];
    if (target && !target.disabled) target.focus(); else if (btns[delta < 0 ? 1 : 0]) btns[delta < 0 ? 1 : 0].focus();
  }
  function removeLine(i) {
    var l = order[i]; if (!l) return;
    order.splice(i, 1); save(order); render();
    announce("Removed " + l.name + ", size " + l.size + ".");
    var closeBtn = cartDialog ? $(".close-btn", cartDialog) : null;
    var first = $(".cart-line .qty button");
    (first || closeBtn || document.body).focus();
  }

  if (clearEl) {
    clearEl.addEventListener("click", function () {
      order = []; save(order); render();
      announce("Order cleared.");
      var closeBtn = cartDialog ? $(".close-btn", cartDialog) : null;
      if (closeBtn) closeBtn.focus();
    });
  }
  if (sendEl) {
    sendEl.addEventListener("click", function (e) {
      if (!order.length) { e.preventDefault(); return; }
      sentEl.hidden = false;
    });
  }

  function addLine(item) {
    for (var i = 0; i < order.length; i++) {
      if (order[i].id === item.id && order[i].size === item.size) {
        order[i].qty = Math.min(order[i].qty + 1, OR_CONFIG.maxQty);
        order[i].price = item.price; order[i].name = item.name;
        save(order); render(); return;
      }
    }
    if (order.length >= OR_CONFIG.maxLines) { announce("Your order is full. Send it, then start a new one."); return; }
    order.push(item); save(order); render();
  }

  /* ---------- product cards (collection pages) ---------- */
  var products = $$(".product[data-id]");
  products.forEach(function (card) {
    var id = card.getAttribute("data-id");
    var nameEl = $(".product-name", card);
    var name = nameEl ? nameEl.textContent.trim() : "";
    var priceAttr = (card.getAttribute("data-price") || "").trim();
    var price = /^\d+(\.\d{1,2})?$/.test(priceAttr) ? parseFloat(priceAttr) : null;
    var priceEl = $(".product-price", card);
    if (priceEl) priceEl.textContent = price === null ? "Price to be confirmed" : money(price);

    var opts = $(".product-options", card);
    if (!opts || !/^[a-z0-9-]+$/.test(id) || !name) return;

    var sizes = (card.getAttribute("data-sizes") || "").split(",").map(function (s) { return s.trim(); })
      .filter(function (s) { return allowedSizes[s]; });
    if (!sizes.length) sizes = OR_CONFIG.sizes.slice();

    var errId = "err-" + id;
    var fs = el("fieldset", "sizes");
    fs.setAttribute("aria-describedby", errId);
    fs.appendChild(el("legend", "", "Size"));
    var row = el("div", "size-row");
    sizes.forEach(function (s) {
      var lab = el("label", "size-opt");
      var input = document.createElement("input");
      input.type = "radio"; input.name = "size-" + id; input.value = s;
      lab.appendChild(input);
      lab.appendChild(el("span", "", s));
      row.appendChild(lab);
    });
    fs.appendChild(row);
    var err = el("p", "size-error", "Choose a size first.");
    err.id = errId; err.hidden = true;

    var add = el("button", "btn btn-solid btn-block", "Add to WhatsApp order");
    add.type = "button";
    var added = el("p", "added-note");
    added.hidden = true;

    opts.appendChild(fs); opts.appendChild(err); opts.appendChild(add); opts.appendChild(added);

    row.addEventListener("change", function () {
      err.hidden = true; fs.removeAttribute("aria-invalid");
    });

    add.addEventListener("click", function () {
      var checked = $("input:checked", fs);
      if (!checked) {
        err.hidden = false; fs.setAttribute("aria-invalid", "true");
        var first = $("input", fs); if (first) first.focus();
        announce("Choose a size for " + name + " first.");
        return;
      }
      addLine({ id: id, name: name, size: checked.value, qty: 1, price: price });
      added.textContent = "";
      added.appendChild(document.createTextNode("Added: size " + checked.value + ". "));
      var view = el("button", "link-btn", "View order"); view.type = "button";
      view.addEventListener("click", function () { if (cartDialog) cartDialog.showModal(); });
      added.appendChild(view);
      added.hidden = false;
      announce("Added " + name + ", size " + checked.value + ". Cart has " + itemCount() + " items.");
    });

    // TeePublic — only shown when a valid TeePublic link is supplied
    var tp = (card.getAttribute("data-teepublic") || "").trim();
    if (/^https:\/\/(www\.)?teepublic\.com\//.test(tp)) {
      var a = el("a", "btn btn-block");
      a.href = tp; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.appendChild(document.createTextNode("Buy on TeePublic"));
      a.appendChild(el("span", "vh", " (opens TeePublic in a new tab)"));
      opts.appendChild(a);
    }
  });

  var empty = $("#collection-empty");
  if (empty) empty.hidden = products.length > 0;

  /* ---------- social links ---------- */
  $$("[data-social]").forEach(function (a) {
    var url = OR_CONFIG.social[a.getAttribute("data-social")] || "";
    if (/^https:\/\//.test(url)) {
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex");
    } else {
      a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); a.setAttribute("tabindex", "-1");
    }
  });

  /* ---------- Kit newsletter: stays disabled until a real form ID is in the action ---------- */
  $$("form[data-kit-form]").forEach(function (form) {
    var ready = /^https:\/\/app\.kit\.com\/forms\/\d+\/subscriptions$/.test(form.getAttribute("action") || "");
    var btn = $("button[type='submit']", form);
    var note = $(".newsletter-note", form);
    if (ready) {
      if (btn) btn.disabled = false;
      if (note) note.textContent = "New designs, occasionally. Unsubscribe anytime.";
      var sending = false;
      form.addEventListener("submit", function (e) {
        if (sending) { e.preventDefault(); return; }   // stops double sign-up on fast double-click
        sending = true; if (btn) btn.disabled = true;
      });
    } else if (btn) {
      btn.disabled = true;
    }
  });

  // keep the cart in step if another tab changes it
  window.addEventListener("storage", function (e) {
    if (e.key === OR_CONFIG.storageKey) { order = load(); render(); }
  });

  render();
})();
