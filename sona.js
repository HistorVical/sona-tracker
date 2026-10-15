"use strict";

/*
  Sona Tracker — shared core, loaded first by every page.

  UNIFIED SAVE SYSTEM
  One student = one JSON object, saved in this browser's localStorage under
  "sona-tracker:data:<REGISTER NUMBER>". Every page reads and writes that same
  object through Sona.data and Sona.save(). "Save backup" downloads it as a file;
  "Load backup" restores it. Nothing is ever sent to a server.
*/

const Sona = (() => {
  const APP = "sona-tracker";
  const VERSION = 1;
  const LOGIN = "login.html";   // change these two lines if you rename the files
  const HUB = "hub.html";
  const SESSION = `${APP}:session`;
  const KEY = reg => `${APP}:data:${reg}`;
  const REG = /^[A-Z0-9][A-Z0-9/_-]{3,24}$/;

  const S = { data: null, reg: null, page: "", onSync: null, HUB, LOGIN };

  /* ---------- small helpers ---------- */

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const icon = n => `<svg class="i" aria-hidden="true"><use href="#${n}"/></svg>`;
  const pad = n => String(n).padStart(2, "0");
  const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dstr(new Date());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const daysLeft = due => Math.round((new Date(due + "T00:00") - new Date(today() + "T00:00")) / 864e5);
  const pretty = d => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#d6cfc4";

  Object.assign(S, { $, esc, icon, today, dstr, uid, daysLeft, pretty, safeColor });

  /* ---------- data shape ---------- */

  const defaults = () => ({
    profile: { name: "", reg: "", dept: "", year: "", created: Date.now(), lastBackup: 0 },
    academics: {
      term: "",
      labels: [
        { id: "l1", name: "Maths", color: "#f0a99f" }, { id: "l2", name: "Computer Science", color: "#a7c4d9" },
        { id: "l3", name: "Physics", color: "#b9a7d6" }, { id: "l4", name: "English", color: "#a9cfae" }
      ],
      lists: [{ id: "a1", title: "To do", tasks: [] }, { id: "a2", title: "In progress", tasks: [] }, { id: "a3", title: "Submitted", tasks: [] }]
    },
    finance: {
      currency: "₹", budget: 0, setup: false,
      labels: [
        { id: "f1", name: "Food", color: "#f0a99f" }, { id: "f2", name: "Transport", color: "#a7c4d9" },
        { id: "f3", name: "Books & Fees", color: "#b9a7d6" }, { id: "f4", name: "Fun", color: "#f3d27a" },
        { id: "f5", name: "Allowance / Salary", color: "#a9cfae" }, { id: "f6", name: "Other", color: "#d6cfc4" }
      ],
      lists: [{ id: "w1", title: "Cash", tasks: [] }, { id: "w2", title: "Bank / UPI", tasks: [] }, { id: "w3", title: "Savings", tasks: [] }]
    },
    services: {
      seq: 0,
      menu: [
        { id: "m1", name: "Idli (2)", price: 30, on: true }, { id: "m2", name: "Dosa", price: 50, on: true },
        { id: "m3", name: "Veg meals", price: 70, on: true }, { id: "m4", name: "Samosa", price: 15, on: true },
        { id: "m5", name: "Tea", price: 10, on: true }, { id: "m6", name: "Coffee", price: 15, on: true }
      ],
      lost: [], complaints: [], canteen: []
    },
    community: { registrations: [], requests: [], donor: null, bookings: [] }
  });

  /* Rebuilds a safe object from anything: unknown or malformed parts fall back to defaults. */
  function clean(raw) {
    const d = defaults(), r = raw && typeof raw === "object" ? raw : {};
    for (const sec in d) {
      const s = r[sec] && typeof r[sec] === "object" ? r[sec] : {};
      for (const k in d[sec]) {
        const v = s[k], t = d[sec][k];
        if (v !== undefined && typeof v === typeof t && Array.isArray(v) === Array.isArray(t)) d[sec][k] = v;
      }
    }
    const rec = a => a.filter(x => x && typeof x === "object" && !Array.isArray(x));
    for (const sec of ["academics", "finance"]) {
      const b = d[sec];
      b.labels = rec(b.labels);
      b.lists = rec(b.lists).filter(l => Array.isArray(l.tasks)).map(l => ({ ...l, tasks: rec(l.tasks) }));
    }
    for (const k of ["menu", "lost", "complaints", "canteen"]) d.services[k] = rec(d.services[k]);
    d.community.registrations = rec(d.community.registrations);
    d.community.bookings = rec(d.community.bookings);
    d.community.requests = d.community.requests.filter(x => typeof x === "string");
    return d;
  }

  const read = reg => {
    try { const j = JSON.parse(localStorage.getItem(KEY(reg))); return j ? clean(j) : null; } catch { return null; }
  };

  S.save = () => {
    try { localStorage.setItem(KEY(S.reg), JSON.stringify(S.data)); return true; }
    catch { S.toast("Couldn't save: browser storage is full or blocked. Download a backup now."); return false; }
  };

  /* ---------- sign in / out ---------- */

  S.signIn = ({ name, reg, dept, year }) => {
    name = String(name).trim();
    reg = String(reg).trim().toUpperCase();
    if (!name) return { error: "Please enter your name." };
    if (!REG.test(reg)) return { error: "Enter your register number using letters and numbers only (4 to 25 characters)." };
    try {
      const d = read(reg) || defaults();
      Object.assign(d.profile, { name, reg, dept, year });
      localStorage.setItem(KEY(reg), JSON.stringify(d));
      localStorage.setItem(SESSION, reg);
    } catch { return { error: "Browser storage is blocked or full. Allow site data and try again." }; }
    return {};
  };

  S.logout = () => {
    try { localStorage.removeItem(SESSION); } catch { /* still leave */ }
    location.replace(LOGIN);
  };

  S.wipe = () => S.confirmBox("Delete all data on this device?",
    "Your assignments, finances, bookings and profile will be erased from this browser. Download a backup first if you want to keep them.",
    () => {
      try { localStorage.removeItem(KEY(S.reg)); localStorage.removeItem(SESSION); } catch { /* ignore */ }
      location.replace(LOGIN);
    }, "Erase everything");

  /* ---------- backup and restore ---------- */

  S.backup = () => {
    S.data.profile.lastBackup = Date.now();
    S.save();
    const file = JSON.stringify({ app: APP, v: VERSION, exported: new Date().toISOString(), data: S.data }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file], { type: "application/json" }));
    a.download = `sona-tracker-backup-${S.reg}-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.toast("Backup saved to your downloads");
    S.onSync?.();
  };

  S.restore = file => {
    const fail = () => S.toast("That file isn't a valid Sona Tracker backup");
    const r = new FileReader();
    r.onerror = fail;
    r.onload = () => {
      let j, reg;
      try {
        j = JSON.parse(r.result);
        reg = String(j.data.profile.reg).trim().toUpperCase();
        if (j.app !== APP || !REG.test(reg)) throw 0;
      } catch { return fail(); }
      const d = clean(j.data);
      d.profile.reg = reg;
      const go = () => {
        try { localStorage.setItem(KEY(reg), JSON.stringify(d)); localStorage.setItem(SESSION, reg); }
        catch { return S.toast("Couldn't restore: browser storage is full or blocked."); }
        S.page === "login" ? location.replace(HUB) : location.reload();
      };
      if (localStorage.getItem(KEY(reg))) S.confirmBox(`Replace data for ${reg}?`, "The data saved on this device for this register number will be replaced by the backup file.", go, "Restore");
      else go();
    };
    r.readAsText(file);
  };

  /* ---------- toast, modals, copy ---------- */

  let toastTimer, opener = null;

  S.toast = msg => {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  };

  S.openModal = id => {
    const m = $(id);
    opener = document.activeElement;
    m.classList.add("on");
    m.querySelector(".box").classList.remove("out");
    setTimeout(() => m.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea,button")?.focus(), 60);
  };

  S.closeModal = id => {
    const m = $(id), b = m.querySelector(".box");
    b.classList.add("out");
    setTimeout(() => { m.classList.remove("on"); b.classList.remove("out"); }, 230);
    opener?.focus?.();
  };

  S.confirmBox = (title, msg, ok, label = "Delete") => {
    $("cTitle").textContent = title; $("cMsg").textContent = msg; $("cOkText").textContent = label;
    $("cOk").onclick = () => { S.closeModal("confirmModal"); ok(); };
    S.openModal("confirmModal");
  };

  S.copy = async text => {
    let ok = true;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement("textarea");
      t.value = text; document.body.appendChild(t); t.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      t.remove();
    }
    S.toast(ok ? "Copied to clipboard" : "Couldn't copy. Select the text manually.");
  };

  /* ---------- helpers shared by the card boards ---------- */

  S.moveTask = (lists, { task, from, to, index }) => {
    const a = lists.find(l => l.id === from), b = lists.find(l => l.id === to);
    const i = a ? a.tasks.findIndex(t => t.id === task) : -1;
    if (i < 0 || !b) return;
    const [t] = a.tasks.splice(i, 1);
    b.tasks.splice(Math.min(index, b.tasks.length), 0, t);
  };

  S.crumple = (selector, done) => {
    const el = document.querySelector(selector);
    if (!el) return done();
    $("trash").classList.add("go"); el.classList.add("crumple");
    setTimeout(done, 480);
    setTimeout(() => $("trash").classList.remove("go"), 1000);
  };

  /* Drag and drop. Mouse: drag the whole card. Touch: drag the grip handle.
     axis "y" = lists stack cards vertically, "x" = cards sit in a row. */
  S.drag = ({ lists, box, axis, scroller, onDrop }) => {
    const CARD = ".card.dnd:not(.ghost)";
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let d = null;

    document.addEventListener("pointerdown", e => {
      const card = e.target.closest(".card.dnd");
      if (!card || e.target.closest("button,input,select,textarea,a")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.pointerType === "touch" && !e.target.closest(".grip")) return;
      d = { card, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, started: false };
    });

    document.addEventListener("pointermove", e => {
      if (!d) return;
      d.cx = e.clientX; d.cy = e.clientY;
      if (!d.started) { if (Math.hypot(d.cx - d.x0, d.cy - d.y0) < 6) return; start(d); }
      e.preventDefault();
    }, { passive: false });

    document.addEventListener("pointerup", () => end(false));
    document.addEventListener("pointercancel", () => end(true));

    function start(x) {
      const r = x.card.getBoundingClientRect();
      x.started = true; x.dx = x.x0 - r.left; x.dy = x.y0 - r.top;
      x.parent = x.card.parentNode; x.next = x.card.nextSibling;
      x.px = r.left; x.py = r.top; x.tilt = 0;
      x.ghost = x.card.cloneNode(true);
      x.ghost.classList.add("ghost");
      Object.assign(x.ghost.style, { width: r.width + "px", left: "0", top: "0", transform: `translate3d(${r.left}px,${r.top}px,0)` });
      document.body.appendChild(x.ghost);
      x.card.classList.add("placeholder");
      document.body.classList.add("dragging");
      x.raf = requestAnimationFrame(() => tick(x));
    }

    function move(parent, card, before) {
      const sibs = [...document.querySelectorAll(CARD)].filter(c => c !== card);
      const first = new Map(sibs.map(c => [c, c.getBoundingClientRect()]));
      parent.insertBefore(card, before);
      sibs.forEach(c => {
        const o = first.get(c), n = c.getBoundingClientRect(), dx = o.left - n.left, dy = o.top - n.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    }

    function tick(x) {
      if (x.done) return;
      let tx, ty, k;
      if (x.settling) { tx = x.sx; ty = x.sy; k = .22; }
      else {
        tx = x.cx - x.dx; ty = x.cy - x.dy; k = .3;
        if (x.cy > innerHeight - 80) scrollBy(0, 12); else if (x.cy < 80) scrollBy(0, -12);
        if (scroller) {
          const sr = scroller.getBoundingClientRect();
          if (x.cx > sr.right - 70) scroller.scrollLeft += 12; else if (x.cx < sr.left + 70) scroller.scrollLeft -= 12;
        }
        const all = [...document.querySelectorAll(lists)];
        const over = all.find(l => { const r = l.getBoundingClientRect(); return x.cx >= r.left && x.cx <= r.right && x.cy >= r.top && x.cy <= r.bottom; });
        all.forEach(l => l.classList.toggle("over", l === over));
        x.over = over;
        if (over) {
          const b = over.querySelector(box), br = b.getBoundingClientRect();
          if (axis === "y") { if (x.cy < br.top + 36) b.scrollTop -= 8; else if (x.cy > br.bottom - 36) b.scrollTop += 8; }
          else { if (x.cx < br.left + 50) b.scrollLeft -= 10; else if (x.cx > br.right - 50) b.scrollLeft += 10; }
          const before = [...b.querySelectorAll(CARD)].filter(c => c !== x.card).find(c => {
            const r = c.getBoundingClientRect();
            return axis === "y" ? x.cy < r.top + r.height / 2 : x.cx < r.left + r.width / 2;
          }) || null;
          if (x.card.parentNode !== b || x.card.nextSibling !== before) move(b, x.card, before);
        } else if (x.card.parentNode !== x.parent || x.card.nextSibling !== x.next) move(x.parent, x.card, x.next);
      }
      const ox = x.px;
      x.px += (tx - x.px) * k; x.py += (ty - x.py) * k;
      x.tilt += ((x.settling ? 0 : clamp((x.px - ox) * 1.1, -10, 10)) - x.tilt) * .12;
      x.ghost.style.transform = `translate3d(${x.px}px,${x.py}px,0) rotate(${x.tilt}deg)`;
      if (x.settling && Math.hypot(tx - x.px, ty - x.py) < .6 && Math.abs(x.tilt) < .3) return finish(x);
      x.raf = requestAnimationFrame(() => tick(x));
    }

    function end(cancel) {
      const x = d; d = null;
      if (!x || !x.started) return;
      document.querySelectorAll(lists).forEach(l => l.classList.remove("over"));
      x.dropped = !!x.over && !cancel;
      if (!x.dropped && (x.card.parentNode !== x.parent || x.card.nextSibling !== x.next)) x.parent.insertBefore(x.card, x.next);
      x.card.getAnimations().forEach(a => a.cancel());
      const r = x.card.getBoundingClientRect();
      x.sx = r.left; x.sy = r.top; x.settling = true;
      setTimeout(() => finish(x), 900);
    }

    function finish(x) {
      if (x.done) return;
      x.done = true; cancelAnimationFrame(x.raf);
      x.ghost.remove(); x.card.classList.remove("placeholder");
      document.body.classList.remove("dragging");
      const to = x.dropped && x.card.closest(lists);
      if (!to) return;
      onDrop({ task: x.card.dataset.task, from: x.card.dataset.list, to: to.dataset.list, index: [...x.card.parentNode.querySelectorAll(CARD)].indexOf(x.card) });
    }
  };

  /* ---------- page shell: header, shared modal, toast ---------- */

  const NAV = [["hub", HUB, "Home"], ["academics", "academics.html", "Academics"], ["services", "services.html", "Campus Services"], ["community", "community.html", "Community"], ["finance", "finance.html", "Finance"]];

  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="tag" viewBox="0 0 24 24"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/></symbol>
    <symbol id="download" viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M4 20h16"/></symbol>
    <symbol id="upload" viewBox="0 0 24 24"><path d="M12 16V5M7 9l5-5 5 5M4 20h16"/></symbol>
    <symbol id="check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6"/></symbol>
    <symbol id="gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></symbol>
    <symbol id="pencil" viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/></symbol>
    <symbol id="bin" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></symbol>
    <symbol id="x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
    <symbol id="cal" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></symbol>
    <symbol id="next" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
    <symbol id="copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></symbol>
    <symbol id="grip" viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></symbol>
    <symbol id="out" viewBox="0 0 24 24"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></symbol>
  </defs></svg>`;

  function shell(page) {
    document.body.insertAdjacentHTML("beforeend", `${SPRITE}
      <div id="trash">${icon("bin")}</div>
      <div id="toast" role="status" aria-live="polite"></div>
      <div id="confirmModal" class="overlay"><div class="box confirm" role="dialog" aria-modal="true" aria-labelledby="cTitle">
        <h3 id="cTitle"></h3><p id="cMsg"></p>
        <div class="btns"><button class="btn" data-act="close">Cancel</button><button class="btn danger" id="cOk">${icon("bin")}<span id="cOkText">Delete</span></button></div>
      </div></div>`);
    if (page === "login") return;

    const p = S.data.profile;
    const who = [p.name, p.reg, p.dept, p.year].filter(Boolean).map(esc).join(" · ");
    document.body.insertAdjacentHTML("afterbegin", `
      <header class="site-header"><div class="hin">
        <div><a class="brand" href="${HUB}">Sona Tracker</a><div class="sub">${who}</div></div>
        <div class="actions">
          <button class="btn sm" data-sona="backup">${icon("download")}Save backup</button>
          <button class="btn sm" data-sona="restore">${icon("upload")}Load backup</button>
          <button class="btn sm danger" data-sona="logout">${icon("out")}Log out</button>
          <input type="file" id="sonaRestore" accept=".json,application/json" hidden>
        </div>
        <nav class="nav" aria-label="Sections">${NAV.map(([k, href, label]) => `<a class="btn sm" href="${href}"${k === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
      </div></header>`);
  }

  function wire() {
    // Explicitly prevent any accidental exit prompts or browser-level page leave dialogs
    window.onbeforeunload = null;

    document.addEventListener("click", e => {
      const close = e.target.closest('[data-act="close"]');
      if (close) S.closeModal(close.closest(".overlay").id);
      const b = e.target.closest("[data-sona]");
      if (!b) return;
      const a = b.dataset.sona;
      if (a === "backup") S.backup();
      else if (a === "restore") $("sonaRestore").click();
      else if (a === "logout") S.logout();
      else if (a === "wipe") S.wipe();
    });

    document.addEventListener("mousedown", e => { if (e.target.classList.contains("overlay")) S.closeModal(e.target.id); });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { const m = [...document.querySelectorAll(".overlay.on")].pop(); if (m) S.closeModal(m.id); }
      else if (e.key === "Enter" && e.target.matches(".overlay.on input:not([type=checkbox]):not([type=file])")) {
        const primary = e.target.closest(".box").querySelector("[data-primary]");
        if (primary) { e.preventDefault(); primary.click(); }
      }
    });

    $("sonaRestore")?.addEventListener("change", e => { if (e.target.files[0]) S.restore(e.target.files[0]); e.target.value = ""; });

    // Keep several open tabs in step and handle logging in or out elsewhere.
    addEventListener("storage", e => {
      if (S.page === "login") return;
      if (e.key === SESSION && e.newValue !== S.reg) location.reload();
      else if (e.key === KEY(S.reg)) {
        const d = read(S.reg);
        if (!d) return;
        S.data = d;
        if (!document.querySelector(".overlay.on,.ghost")) S.onSync?.();
      }
    });

    // Never show a cached page after logging out and pressing Back.
    addEventListener("pageshow", e => { if (e.persisted) location.reload(); });
  }

  /* ---------- start ---------- */

  S.boot = page => {
    S.page = page;
    let reg = null;
    try { reg = localStorage.getItem(SESSION); } catch { /* storage blocked */ }
    const d = reg && read(reg);

    if (page === "login" && d) { location.replace(HUB); return false; }
    if (page !== "login" && !d) { location.replace(LOGIN); return false; }

    if (d) { S.reg = reg; S.data = d; }
    shell(page);
    wire();
    document.body.classList.remove("wait");
    return true;
  };

  return S;
})();
