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
    currency: "US$",            // all prices are shown in USD
    ecRate: 2.70,               // EC$ per US$1 (official ECCB peg). EC$ amounts are shown for local customers.
    // Standard price for EVERY design. A card can override with data-prices="3XL:32.99" etc.
    prices: { "S": 26.99, "M": 26.99, "L": 26.99, "XL": 26.99, "2XL": 28.99, "3XL": 30.99 },
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    // Local shipping & handling (Saint Lucia). Customer picks one in the cart.
    shipping: {
      delivery: { label: "Delivery", fee: 1.84, note: "Islandwide, 2–3 days. Cash on delivery." },
      pickup:   { label: "Pickup",   fee: 0,    note: "Free. Cash on pickup.", place: "Vieux-Fort Independence Square, Vieux-Fort" }
    },
    defaultShipping: "delivery",
    shippingKey: "or-shipping-v1",
    deliveryText: "Islandwide delivery in Saint Lucia, 2–3 days, or free pickup at Vieux-Fort Independence Square. Cash on delivery or pickup.",
    maxQty: 20,
    maxLines: 30,
    storageKey: "or-order-v1",
    siteUrl: "https://oddrigging.store/",
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
    return OR_CONFIG.currency + (Math.round(n * 100) / 100).toFixed(2);
  }
  function ec(n) {
    return "EC$" + (Math.round(n * OR_CONFIG.ecRate * 100) / 100).toFixed(2);
  }
  function feeText(method) {
    var m = OR_CONFIG.shipping[method];
    return m.fee > 0 ? money(m.fee) : "Free";
  }

  /* ---------- fill config-driven text (delivery fee etc.) ---------- */
  $$("[data-or='delivery-fee']").forEach(function (el) { el.textContent = money(OR_CONFIG.shipping.delivery.fee); });
  $$("[data-or='delivery-text']").forEach(function (el) { el.textContent = OR_CONFIG.deliveryText; });
  $$("[data-or='ec-rate']").forEach(function (el) { el.textContent = OR_CONFIG.ecRate.toFixed(2); });
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
    var name = typeof x.name === "string" ? x.name.slice(0, 100) : "";
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
  /* ---------- shipping method (delivery / pickup) ---------- */
  function loadShipping() {
    try { var v = window.localStorage.getItem(OR_CONFIG.shippingKey); if (OR_CONFIG.shipping[v]) return v; } catch (e) {}
    return OR_CONFIG.defaultShipping;
  }
  var shipping = loadShipping();
  function setShipping(v) {
    if (!OR_CONFIG.shipping[v]) return;
    shipping = v;
    try { window.localStorage.setItem(OR_CONFIG.shippingKey, v); } catch (e) {}
    render();
  }

  function buildMessage() {
    var rule = "------------------------------";
    var lines = ["*ODD RIGGING ORDER*", rule];
    var allPriced = true, subtotal = 0, qtyTotal = 0;
    order.forEach(function (l) {
      qtyTotal += l.qty;
      var priceText;
      if (l.price === null) { allPriced = false; priceText = "price to confirm"; }
      else { subtotal += l.price * l.qty; priceText = money(l.price) + " each = " + money(l.price * l.qty); }
      lines.push("• " + l.name);
      lines.push("  Size: " + l.size + " · Qty: " + l.qty + " · " + priceText);
    });
    lines.push(rule);
    lines.push("Items: " + qtyTotal);
    var ship = OR_CONFIG.shipping[shipping];
    var pay = shipping === "pickup" ? "cash on pickup" : "cash on delivery";
    if (allPriced) lines.push("Subtotal: " + money(subtotal));
    lines.push("Shipping & handling: " + ship.label + " – " + feeText(shipping) + (ship.place ? " (" + ship.place + ")" : ""));
    lines.push("(Pickup – Free · Delivery – " + money(OR_CONFIG.shipping.delivery.fee) + ")");
    if (allPriced) {
      lines.push("*TOTAL: " + money(subtotal + ship.fee) + "* (" + pay + ")");
      lines.push("EC$ equivalent: " + ec(subtotal + ship.fee) + " (at " + OR_CONFIG.ecRate.toFixed(2) + ")");
    } else {
      lines.push("*TOTAL: to confirm* (" + pay + ")");
    }
    lines.push("");
    lines.push("My name: ");
    if (shipping === "delivery") lines.push("Delivery area: ");
    lines.push("");
    lines.push("Ordered via: " + OR_CONFIG.siteUrl);
    return lines.join("\n");
  }

  /* ---------- floating order bar (from Boutique Corner) ---------- */
  var bar = document.getElementById("order-bar");
  function updateBar(count) {
    if (!bar) return;
    var styles = {}; order.forEach(function (l) { styles[l.id] = true; });
    var nStyles = Object.keys(styles).length;
    $("#ob-items").textContent = count + (count === 1 ? " item" : " items") + " · " + nStyles + (nStyles === 1 ? " design" : " designs");
    var allPriced = order.every(function (l) { return l.price !== null; });
    var sub = order.reduce(function (n, l) { return n + (l.price || 0) * l.qty; }, 0);
    $("#ob-total").textContent = allPriced ? money(sub + OR_CONFIG.shipping[shipping].fee) + " · " + ec(sub + OR_CONFIG.shipping[shipping].fee) : "Total to confirm";
    var send = $("#ob-send");
    if (count > 0) send.href = "https://wa.me/" + OR_CONFIG.whatsappNumber + "?text=" + encodeURIComponent(buildMessage());
    bar.classList.toggle("visible", count > 0);
    document.body.classList.toggle("has-order-bar", count > 0);
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
    updateBar(count);
    if (typeof refreshCards === "function") refreshCards();
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
      $("#sum-delivery-label").textContent = OR_CONFIG.shipping[shipping].label;
      $("#sum-delivery").textContent = feeText(shipping);
      $("#sum-total").textContent = allPriced ? money(subtotal + OR_CONFIG.shipping[shipping].fee) : "To confirm";
      $("#sum-total-ec").textContent = allPriced ? ec(subtotal + OR_CONFIG.shipping[shipping].fee) : "To confirm";
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

  function setLine(item) {
    for (var i = 0; i < order.length; i++) {
      if (order[i].id === item.id && order[i].size === item.size) {
        order[i].qty = Math.min(item.qty, OR_CONFIG.maxQty);
        order[i].price = item.price; order[i].name = item.name;
        save(order); render(); return;
      }
    }
    if (order.length >= OR_CONFIG.maxLines) { announce("Your order is full. Send it, then start a new one."); return; }
    order.push(item); save(order); render();
  }

  /* ---------- product cards: hover "Select & Order" + in-card order panel ----------
     Mechanism adapted from Boutique Corner:
     hover (or tap) shows "Select & Order" → panel slides up inside the card →
     choose size (price per size), set quantity, live subtotal → Add to order.
     Only one panel is open at a time. Escape or ✕ closes it and discards changes. */
  var activeCard = null;

  function parseCard(card) {
    var id = card.getAttribute("data-id") || "";
    var nameEl = $(".product-name", card);
    var sizes = (card.getAttribute("data-sizes") || "").split(",").map(function (s) { return s.trim(); })
      .filter(function (s) { return allowedSizes[s]; });
    if (!sizes.length) sizes = OR_CONFIG.sizes.slice();
    var base = (card.getAttribute("data-price") || "").trim();
    var basePrice = /^\d+(\.\d{1,2})?$/.test(base) ? parseFloat(base) : null;
    var perSize = {};
    (card.getAttribute("data-prices") || "").split(",").forEach(function (pair) {
      var m = pair.trim().match(/^([A-Z0-9]+)\s*:\s*(\d+(?:\.\d{1,2})?)$/);
      if (m && allowedSizes[m[1]]) perSize[m[1]] = parseFloat(m[2]);
    });
    var prices = {};
    sizes.forEach(function (s) {
      if (perSize[s] !== undefined) prices[s] = perSize[s];
      else if (basePrice !== null) prices[s] = basePrice;
      else prices[s] = typeof OR_CONFIG.prices[s] === "number" ? OR_CONFIG.prices[s] : null;
    });
    var tp = (card.getAttribute("data-teepublic") || "").trim();
    return {
      id: /^[a-z0-9-]+$/.test(id) ? id : "",
      name: nameEl ? nameEl.textContent.trim() : "",
      sizes: sizes, prices: prices,
      teepublic: /^https:\/\/(www\.)?teepublic\.com\//.test(tp) ? tp : ""
    };
  }

  function priceLabel(d) {
    var vals = d.sizes.map(function (s) { return d.prices[s]; });
    if (vals.some(function (v) { return v === null; })) return "Price to be confirmed";
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    return (min === max ? "" : "From ") + money(min);
  }

  function linesFor(id) { return order.filter(function (l) { return l.id === id; }); }

  function refreshCards() {
    $$(".product[data-id]").forEach(function (card) {
      var d = card._or; if (!d) return;
      var mine = linesFor(d.id);
      card.classList.toggle("is-selected", mine.length > 0);
      var note = $(".in-order", card);
      if (note) {
        note.hidden = mine.length === 0;
        note.textContent = mine.length ? "In your order: " + mine.map(function (l) { return l.size + " × " + l.qty; }).join(", ") : "";
      }
      var hb = $(".card-hover-btn .hb-text", card);
      if (hb) hb.textContent = mine.length ? "Edit selection" : "Select & Order";
    });
  }

  function closePanel(card, returnFocus) {
    if (!card) return;
    var panel = $(".order-panel", card);
    var toggle = $(".card-hover-btn", card);
    panel.classList.remove("open");
    card.classList.remove("panel-open");
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus({ preventScroll: true });
    if (activeCard === card) activeCard = null;
  }

  function panelSync(card) {
    // update subtotal + button label from the current draft
    var d = card._or, dr = card._draft;
    var price = dr.size ? d.prices[dr.size] : d.prices[d.sizes[0]];
    $(".op-qty-num", card).textContent = String(dr.qty);
    $(".op-qty-minus", card).disabled = dr.qty <= 1;
    $(".op-qty-plus", card).disabled = dr.qty >= OR_CONFIG.maxQty;
    $(".op-subtotal-amount", card).textContent = price === null ? "To confirm" : money(price * dr.qty);
    $(".op-subtotal-ec", card).textContent = price === null ? "" : "≈ " + ec(price * dr.qty) + " (at " + OR_CONFIG.ecRate.toFixed(2) + ")";
    var exists = dr.size && linesFor(d.id).some(function (l) { return l.size === dr.size; });
    $(".op-add-text", card).textContent = exists ? "Update order" : "Add to order";
  }

  function openPanel(card) {
    if (activeCard && activeCard !== card) closePanel(activeCard);
    var panel = $(".order-panel", card);
    card._draft = { size: null, qty: 1 };
    $$("input[type='radio']", panel).forEach(function (r) { r.checked = false; });
    $(".size-error", panel).hidden = true;
    $(".sizes", panel).removeAttribute("aria-invalid");
    panelSync(card);
    panel.classList.add("open");
    card.classList.add("panel-open");
    $(".card-hover-btn", card).setAttribute("aria-expanded", "true");
    activeCard = card;
    var first = $("input[type='radio']", panel);
    if (first) window.setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
  }

  function buildPanel(card, d, idx) {
    var pid = "op-" + d.id;
    var panel = el("div", "order-panel");
    panel.id = pid;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Choose size and quantity for " + d.name);

    var head = el("div", "op-header");
    head.appendChild(el("p", "op-title", "Choose your size & qty"));
    var x = el("button", "op-close", "×"); x.type = "button";
    x.setAttribute("aria-label", "Close size and quantity for " + d.name);
    x.addEventListener("click", function () { closePanel(card, true); });
    head.appendChild(x);
    panel.appendChild(head);

    var errId = "err-" + d.id;
    var fs = el("fieldset", "sizes");
    fs.setAttribute("aria-describedby", errId);
    fs.appendChild(el("legend", "", "Size"));
    var row = el("div", "size-row");
    d.sizes.forEach(function (s) {
      var lab = el("label", "size-opt");
      var input = document.createElement("input");
      input.type = "radio"; input.name = "size-" + d.id; input.value = s;
      var box = el("span", "");
      box.appendChild(el("strong", "", s));
      box.appendChild(el("small", "", d.prices[s] === null ? "TBC" : money(d.prices[s])));
      lab.appendChild(input); lab.appendChild(box);
      row.appendChild(lab);
    });
    fs.appendChild(row);
    panel.appendChild(fs);
    var err = el("p", "size-error", "Choose a size to add this design."); err.id = errId; err.hidden = true;
    panel.appendChild(err);

    var qrow = el("div", "op-qty-row");
    var qlab = el("p", "op-qty-label", "Quantity"); qlab.id = "ql-" + d.id;
    var qctrl = el("div", "op-qty-ctrl");
    qctrl.setAttribute("role", "group"); qctrl.setAttribute("aria-labelledby", qlab.id);
    var minus = el("button", "op-qty-btn op-qty-minus", "−"); minus.type = "button";
    minus.setAttribute("aria-label", "Decrease quantity");
    var num = el("span", "op-qty-num", "1");
    var plus = el("button", "op-qty-btn op-qty-plus", "+"); plus.type = "button";
    plus.setAttribute("aria-label", "Increase quantity");
    qctrl.appendChild(minus); qctrl.appendChild(num); qctrl.appendChild(plus);
    qrow.appendChild(qlab); qrow.appendChild(qctrl);
    panel.appendChild(qrow);

    var sub = el("div", "op-subtotal");
    sub.appendChild(el("span", "op-subtotal-label", "Subtotal"));
    var amt = el("span", "op-subtotal-amounts");
    amt.appendChild(el("span", "op-subtotal-amount", ""));
    amt.appendChild(el("span", "op-subtotal-ec", ""));
    sub.appendChild(amt);
    panel.appendChild(sub);

    var add = el("button", "btn btn-solid btn-block op-add"); add.type = "button";
    add.appendChild(el("span", "op-add-text", "Add to order"));
    panel.appendChild(add);

    // TeePublic — greyed out until a real teepublic.com link is added to the card
    var tp = el("a", "btn btn-block op-tp");
    tp.appendChild(document.createTextNode("Buy on TeePublic"));
    if (d.teepublic) {
      tp.href = d.teepublic; tp.target = "_blank"; tp.rel = "noopener noreferrer";
      tp.appendChild(el("span", "vh", " (opens TeePublic in a new tab)"));
    } else {
      tp.setAttribute("aria-disabled", "true");
      tp.setAttribute("role", "link");
      tp.appendChild(el("span", "vh", " (link coming soon)"));
    }
    panel.appendChild(tp);

    // events
    row.addEventListener("change", function (e) {
      card._draft.size = e.target.value;
      var existing = linesFor(d.id).filter(function (l) { return l.size === e.target.value; })[0];
      if (existing) card._draft.qty = existing.qty;
      err.hidden = true; fs.removeAttribute("aria-invalid");
      panelSync(card);
    });
    function step(delta) {
      var next = card._draft.qty + delta;
      if (next < 1 || next > OR_CONFIG.maxQty) return;
      card._draft.qty = next; panelSync(card);
      announce("Quantity " + next + ". Subtotal " + $(".op-subtotal-amount", card).textContent + ", " + $(".op-subtotal-ec", card).textContent.replace("≈ ", "about ") + ".");
      if ((delta < 0 ? minus : plus).disabled) (delta < 0 ? plus : minus).focus();
    }
    minus.addEventListener("click", function () { step(-1); });
    plus.addEventListener("click", function () { step(1); });

    add.addEventListener("click", function () {
      var dr = card._draft;
      if (!dr.size) {
        err.hidden = false; fs.setAttribute("aria-invalid", "true");
        var first = $("input", fs); if (first) first.focus();
        announce("Choose a size for " + d.name + " first.");
        return;
      }
      setLine({ id: d.id, name: d.cartName, size: dr.size, qty: dr.qty, price: d.prices[dr.size] });
      closePanel(card, true);
      announce("Added " + d.name + ", size " + dr.size + ", quantity " + dr.qty + ". Order has " + itemCount() + " items.");
    });

    return panel;
  }

  $$(".product[data-id]").forEach(function (card, idx) {
    var d = parseCard(card);
    if (!d.id || !d.name) return;
    card._or = d;
    // cart/WhatsApp name includes the collection, so "Design 04" in two collections can't be confused
    var kicker = $(".ch-kicker");
    d.cartName = (d.name + (kicker ? " · " + kicker.textContent.trim() : "")).slice(0, 100);

    var priceEl = $(".product-price", card);
    if (priceEl) priceEl.textContent = priceLabel(d);

    var dots = $(".size-dots", card);
    if (dots) {
      dots.textContent = "";
      dots.appendChild(el("span", "vh", "Sizes: "));
      d.sizes.forEach(function (s, i) {
        dots.appendChild(el("span", "dot", s));
        if (i < d.sizes.length - 1) dots.appendChild(el("span", "vh", ", "));
      });
    }

    var media = $(".product-media", card);
    var tick = el("span", "card-tick", "✓"); tick.setAttribute("aria-hidden", "true");
    media.appendChild(tick);
    var hb = el("button", "card-hover-btn"); hb.type = "button";
    hb.setAttribute("aria-expanded", "false");
    hb.setAttribute("aria-controls", "op-" + d.id);
    hb.appendChild(el("span", "hb-text", "Select & Order"));
    hb.appendChild(el("span", "vh", ": " + d.name));
    hb.addEventListener("click", function () {
      if (activeCard === card) closePanel(card, true); else openPanel(card);
    });
    media.appendChild(hb);

    if (!$(".in-order", card)) {
      var note = el("p", "in-order"); note.hidden = true;
      $(".product-body", card).appendChild(note);
    }
    card.appendChild(buildPanel(card, d, idx));
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && activeCard && !document.querySelector("dialog[open]")) closePanel(activeCard, true);
  });

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

  $$("input[name='or-shipping']").forEach(function (r) {
    r.checked = r.value === shipping;
    r.addEventListener("change", function () { if (r.checked) { setShipping(r.value); announce(OR_CONFIG.shipping[r.value].label + " selected."); } });
  });

  // keep the cart in step if another tab changes it
  window.addEventListener("storage", function (e) {
    if (e.key === OR_CONFIG.storageKey) { order = load(); render(); }
  });

  render();
})();
