(() => {
  "use strict";

  // ===================================================================
  // Basics
  // ===================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, "0");
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const SITE = "https://goodlaith01.github.io/gg/";
  const onSite = (location.protocol === "https:" && /github\.io$/.test(location.hostname)) || location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

  // ===================================================================
  // Toast (with optional Undo)
  // ===================================================================
  const toastEl = $("#toast"), toastMsg = $("#toast-msg"), toastAct = $("#toast-act");
  let toastTimer = 0, toastFn = null;
  function hideToast() { toastEl.classList.remove("show"); toastFn = null; }
  function toast(msg, onUndo) {
    toastMsg.textContent = msg;
    toastFn = onUndo || null;
    toastAct.hidden = !toastFn;
    if (toastFn) toastAct.textContent = t("common.undo");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, toastFn ? 5000 : 1900);
  }
  toastAct.addEventListener("click", () => { const fn = toastFn; hideToast(); if (fn) fn(); });

  // ===================================================================
  // Storage: every key lives under "daybook:"; a failed write warns once
  // ===================================================================
  const K = "daybook:";
  let storageWarned = false;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) {
      try { localStorage.setItem(K + k, JSON.stringify(v)); return true; }
      catch (e) { if (!storageWarned) { storageWarned = true; setTimeout(() => toast(t("common.storageFull")), 0); } return false; }
    },
  };
  // schema 2: example plans carry an `ex` flag like example notes and ideas
  if (store.get("schema", 1) < 2) {
    const ev = store.get("events", null);
    if (ev) {
      for (const day of Object.keys(ev)) for (const e of ev[day]) if (/^Example/.test(e.text || "")) e.ex = true;
      store.set("events", ev);
    }
    store.set("schema", 2);
  }

  // ===================================================================
  // Language: English / Arabic
  // ===================================================================
  const DICTS = window.DAYBOOK_I18N || {};
  let lang = store.get("lang", (navigator.language || "").slice(0, 2) === "ar" ? "ar" : "en");
  if (!DICTS[lang]) lang = "en";
  // Arabic keeps Western digits so the clock, dates and temperatures share one set of numerals.
  const locale = () => (lang === "ar" ? "ar-u-nu-latn" : (navigator.language || "").startsWith("en") ? navigator.language : "en");
  let plural = new Intl.PluralRules(lang);
  let rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  const dig = (path, d) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
  const lookup = (key) => { const v = dig(key, DICTS[lang]); return v == null ? dig(key, DICTS.en) : v; };
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s);
  /** Translate a text key, e.g. t("wx.feels", { t: 21 }). */
  function t(key, vars) { const v = lookup(key); return typeof v === "string" ? fill(v, vars) : key; }
  /** Translate a counted phrase with the right plural form for the language. */
  function tp(key, n, vars) {
    const forms = lookup(key);
    if (!forms || typeof forms !== "object") return key;
    return fill(forms[plural.select(n)] || forms.other, Object.assign({ n }, vars));
  }
  /** Same as tp, but returns HTML with the number in bold. */
  function tpHTML(key, n) { return esc(tp(key, n, { n: "\u0000" })).replace("\u0000", `<b>${n}</b>`); }
  /** Marks a key that is looked up later, so the build can check it exists. */
  const key = (k) => k;

  function applyStatic(scope = document) {
    $$("[data-i18n]", scope).forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-ph]", scope).forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $$("[data-i18n-aria]", scope).forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    $$("[data-i18n-title]", scope).forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.title = t("app.name");
  }
  function applyDir() { root.lang = lang; root.dir = lang === "ar" ? "rtl" : "ltr"; }
  const langListeners = [];
  const onLang = (fn) => langListeners.push(fn);
  function setLang(l) {
    if (!DICTS[l] || l === lang) return;
    lang = l; store.set("lang", l);
    plural = new Intl.PluralRules(lang);
    rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
    applyDir(); applyStatic();
    langListeners.forEach((fn) => fn());
    toast(t("lang.changed"));
  }
  applyDir(); applyStatic();

  function rel(at) {
    const s = (at - Date.now()) / 1000, a = Math.abs(s);
    if (a < 60) return rtf.format(0, "second");
    if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
    if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
    if (a < 604800) return rtf.format(Math.round(s / 86400), "day");
    return new Date(at).toLocaleDateString(locale(), { month: "short", day: "numeric" });
  }

  // ===================================================================
  // Settings: theme, motion, units, clock, week start
  // ===================================================================
  const hostTheme = root.getAttribute("data-theme");
  let theme = store.get("theme", "system");
  let motion = store.get("motion", !reduceMotion);
  let unit = store.get("unit", "c");
  let h12 = store.get("h12", false);
  let weekStart = store.get("weekStart", lang === "ar" ? 6 : 0);
  const isDark = () => root.getAttribute("data-theme") === "dark" ||
    (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  function applyTheme() {
    if (theme === "system") { if (hostTheme) root.setAttribute("data-theme", hostTheme); else root.removeAttribute("data-theme"); }
    else root.setAttribute("data-theme", theme);
  }
  function applyMotion() { document.body.classList.toggle("calm", !motion); }
  if (theme !== "system") applyTheme();
  applyMotion();

  // ===================================================================
  // Time formatting
  // ===================================================================
  const ampm = (h) => (h < 12 ? t("clock.am") : t("clock.pm"));
  const fmtTime = (h, m) => (h12 ? `${h % 12 || 12}:${pad(m)} ${ampm(h)}` : `${pad(h)}:${pad(m)}`);
  const fmtIso = (iso) => fmtTime(+iso.slice(11, 13), +iso.slice(14, 16));
  const fmtHour = (iso) => { const h = +iso.slice(11, 13); return h12 ? `${h % 12 || 12} ${ampm(h)}` : `${pad(h)}:00`; };
  const fmtDur = (mins) => t("day.dur", { h: Math.floor(mins / 60), m: mins % 60 });

  // ===================================================================
  // Name
  // ===================================================================
  const nameIn = $("#name-input"), mirror = $("#name-mirror");
  function sizeName() { mirror.textContent = nameIn.value || nameIn.placeholder; nameIn.style.width = mirror.offsetWidth + 8 + "px"; }
  nameIn.value = store.get("name", "");
  nameIn.addEventListener("input", () => { store.set("name", nameIn.value.trim()); sizeName(); });
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") nameIn.blur(); });
  onLang(sizeName);

  // ===================================================================
  // Weather icons
  // ===================================================================
  const CLOUD = "M18 47a10 10 0 0 1 0-20 14 14 0 0 1 27-4 12.5 12.5 0 0 1 3 24z";
  const svg = (inner) => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const SUN = `<g class="i-sun"><g class="rays" stroke="var(--sun)" stroke-width="3" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="32" y1="8" x2="32" y2="13" transform="rotate(${a} 32 32)"/>`).join("")}</g><circle cx="32" cy="32" r="11" fill="var(--sun)"/></g>`;
  const MOON = `<path class="i-moon" d="M38 13a19 19 0 1 0 14 31A16 16 0 0 1 38 13z" fill="var(--sun)"/>`;
  const cloud = (cls = "") => `<path class="i-cloud ${cls}" d="${CLOUD}" fill="var(--cloud)" stroke="var(--cloud-edge)" stroke-width="1.5" stroke-linejoin="round"/>`;
  const up = (s) => `<g transform="translate(0 -6)">${s}</g>`;
  function wxIcon(kind, night) {
    switch (kind) {
      case "clear": return svg(night ? MOON : SUN);
      case "partly": return svg(`<g transform="translate(-9 -10) scale(.82)">${night ? MOON : SUN}</g>${cloud()}`);
      case "cloud": return svg(`<g opacity=".6" transform="translate(-9 -9) scale(.8)">${cloud("back")}</g>${cloud()}`);
      case "fog": return svg(up(cloud()) + `<g stroke="var(--cloud-edge)" stroke-width="3" stroke-linecap="round"><line class="fogline" x1="14" y1="49" x2="44" y2="49"/><line class="fogline" style="animation-delay:-2s" x1="22" y1="56" x2="52" y2="56"/></g>`);
      case "rain": return svg(up(cloud()) + `<g stroke="var(--rain)" stroke-width="3" stroke-linecap="round">${[22, 32, 42].map((x, i) => `<line class="drop" style="animation-delay:${i * -0.37}s" x1="${x}" y1="47" x2="${x - 2}" y2="53"/>`).join("")}</g>`);
      case "snow": return svg(up(cloud()) + `<g fill="var(--snow)">${[22, 32, 42].map((x, i) => `<circle class="flake" style="animation-delay:${i * -0.85}s" cx="${x}" cy="51" r="2.6"/>`).join("")}</g>`);
      case "storm": return svg(up(cloud()) + `<path class="bolt" d="M34 41l-8 11h6l-3 9 10-13h-6l3-7z" fill="var(--bolt)"/>`);
      default: return svg(cloud());
    }
  }
  /** WMO weather code -> [icon kind, label key] */
  function wxInfo(c) {
    if (c === 0) return ["clear", key("wx.cond.clear")];
    if (c === 1) return ["partly", key("wx.cond.mostlyClear")];
    if (c === 2) return ["partly", key("wx.cond.partly")];
    if (c === 3) return ["cloud", key("wx.cond.overcast")];
    if (c === 45 || c === 48) return ["fog", key("wx.cond.fog")];
    if (c >= 51 && c <= 57) return ["rain", key("wx.cond.drizzle")];
    if (c === 61) return ["rain", key("wx.cond.lightRain")];
    if (c === 63) return ["rain", key("wx.cond.rain")];
    if (c >= 64 && c <= 67) return ["rain", key("wx.cond.heavyRain")];
    if (c >= 71 && c <= 77) return ["snow", key("wx.cond.snow")];
    if (c >= 80 && c <= 82) return ["rain", key("wx.cond.rainShowers")];
    if (c === 85 || c === 86) return ["snow", key("wx.cond.snowShowers")];
    if (c >= 95) return ["storm", key("wx.cond.storm")];
    return ["cloud", key("wx.cond.cloudy")];
  }

  // ===================================================================
  // Ambient particles (rain, snow, stars)
  // Kept cheap: 1x pixel ratio, ~30 fps, few particles, stops when hidden.
  // ===================================================================
  const fx = (() => {
    const cv = $("#fx"), ctx = cv.getContext("2d");
    let mode = "none", want = "none", parts = [], w = 0, h = 0, raf = 0, last = 0, rgb = "255,255,255";
    function size() { w = innerWidth; h = innerHeight; cv.width = w; cv.height = h; }
    function build() {
      const n = mode === "rain" ? Math.min(140, Math.round(w / 10)) : mode === "snow" ? Math.min(90, Math.round(w / 16)) : mode === "stars" ? Math.min(120, Math.round((w * h) / 12000)) : 0;
      parts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h * (mode === "stars" ? 0.7 : 1), v: Math.random(), p: Math.random() * 6.28 }));
    }
    function draw(tm) {
      ctx.clearRect(0, 0, w, h);
      if (mode === "rain") {
        ctx.strokeStyle = `rgba(${rgb},.32)`; ctx.lineWidth = 1.2; ctx.beginPath();
        for (const q of parts) {
          ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - 3, q.y + 12 + q.v * 10);
          q.y += 16 + q.v * 14; q.x -= 2.4;
          if (q.y > h) { q.y = -24; q.x = Math.random() * (w + 80); }
        }
        ctx.stroke();
      } else if (mode === "snow") {
        ctx.fillStyle = `rgba(${rgb},.75)`; ctx.beginPath();
        for (const q of parts) {
          const r = 1 + q.v * 2.2; ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, 6.29);
          q.y += 1 + q.v * 1.8; q.x += Math.sin(tm / 1100 + q.p) * 0.8;
          if (q.y > h + 5) { q.y = -5; q.x = Math.random() * w; }
        }
        ctx.fill();
      } else if (mode === "stars") {
        for (const q of parts) {
          const a = (0.25 + 0.75 * Math.abs(Math.sin(tm / 1600 + q.p * 3))) * (0.4 + q.v * 0.6);
          ctx.fillStyle = `rgba(${rgb},${a.toFixed(2)})`;
          const r = 0.7 + q.v * 1.1; ctx.fillRect(q.x - r / 2, q.y - r / 2, r, r);
        }
      }
    }
    function loop(tm) { raf = requestAnimationFrame(loop); if (tm - last < 33) return; last = tm; draw(tm); }
    function refresh() {
      cancelAnimationFrame(raf); raf = 0;
      rgb = getComputedStyle(root).getPropertyValue("--fx").trim() || "255,255,255";
      mode = !motion || (want === "stars" && !isDark()) ? "none" : want;
      size(); build(); ctx.clearRect(0, 0, w, h);
      if (mode === "none" || document.hidden) return;
      if (reduceMotion) { if (mode === "stars") draw(0); return; }
      raf = requestAnimationFrame(loop);
    }
    let lastW = innerWidth;
    // phones fire resize when the address bar slides; only rebuild on real width changes
    addEventListener("resize", debounce(() => { if (innerWidth !== lastW) { lastW = innerWidth; refresh(); } else { h = innerHeight; cv.height = h; } }, 250));
    document.addEventListener("visibilitychange", refresh);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => refresh());
    return { set(m) { if (m !== want) { want = m; refresh(); } }, refresh };
  })();

  // ===================================================================
  // Weather (Open-Meteo, no key needed)
  // ===================================================================
  let loc = store.get("loc", null);
  let wx = store.get("wx", null);
  let wxState = "empty";
  const T = (c) => Math.round(unit === "f" ? (c * 9) / 5 + 32 : c);
  const locKey = () => (loc ? `${loc.lat},${loc.lon}` : "");
  const haveWx = () => !!(wx && loc && wx.key === locKey());
  if (!onSite) $("#wx-site-link").hidden = false;
  $("#wx-site-link").href = SITE;

  function setUnitLabel() { $("#unit-btn").textContent = t(unit === "c" ? key("wx.unitC") : key("wx.unitF")); }
  function setPlace() { $("#wx-place").textContent = loc ? loc.name : t("wx.setLocation"); }
  function showWx(state) {
    wxState = state;
    $("#wx-loading").hidden = state !== "loading";
    $("#wx-error").hidden = state !== "error";
    $("#wx-body").hidden = state !== "body";
    if (state === "error") $("#wx-error-msg").textContent = onSite ? t("wx.loadError") : t("wx.previewError");
    if (state === "empty") openSearch(true);
  }
  function openSearch(open) {
    $("#wx-search").hidden = !open;
    $("#wx-place-btn").setAttribute("aria-expanded", String(open));
    if (open) { $("#city-results").innerHTML = ""; $("#wx-search-msg").textContent = loc ? t("wx.changeWhere") : t("wx.askWhere"); }
  }
  $("#wx-place-btn").addEventListener("click", () => {
    const open = $("#wx-search").hidden; openSearch(open);
    if (open) $("#city-input").focus();
  });
  $("#unit-btn").addEventListener("click", () => setUnit(unit === "c" ? "f" : "c"));
  function setUnit(u) { unit = u; store.set("unit", u); setUnitLabel(); if (haveWx()) renderWx(); }
  $("#wx-retry").addEventListener("click", () => loadWeather(true));

  async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

  async function loadWeather(force) {
    setPlace();
    if (!loc) { showWx("empty"); return; }
    const have = haveWx();
    if (have) renderWx(); else showWx("loading");
    if (have && !force && Date.now() - wx.at < 20 * 60e3) return;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
        "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max" +
        "&timezone=auto&forecast_days=6";
      const d = await getJSON(u);
      if (!d || !d.current || !d.hourly || !d.daily) throw new Error("bad data");
      wx = { key: locKey(), at: Date.now(), d }; store.set("wx", wx); renderWx();
    } catch (e) {
      if (have) toast(t("wx.refreshFailed")); else showWx("error");
    }
  }

  function renderWx() {
    const d = wx.d, c = d.current;
    const [kind, labelKey] = wxInfo(c.weather_code);
    const night = !c.is_day;
    showWx("body");
    $("#wx-icon").innerHTML = wxIcon(kind, night);
    $("#wx-temp").textContent = T(c.temperature_2m);
    $("#wx-cond").textContent = t(labelKey);
    $("#wx-feels").textContent = t("wx.feels", { t: T(c.apparent_temperature) });
    $("#wx-hi").textContent = t("wx.hi", { t: T(d.daily.temperature_2m_max[0]) });
    $("#wx-lo").textContent = t("wx.lo", { t: T(d.daily.temperature_2m_min[0]) });
    $("#wx-hum").textContent = `${c.relative_humidity_2m}%`;
    $("#wx-wind").textContent = unit === "f" ? t("wx.mph", { v: Math.round(c.wind_speed_10m * 0.621) }) : t("wx.kmh", { v: Math.round(c.wind_speed_10m) });
    $("#wx-rain").textContent = `${(d.daily.precipitation_probability_max || [])[0] ?? 0}%`;

    // next 12 hours, from the location's current hour
    const nowIso = c.time.slice(0, 13) + ":00";
    let i0 = d.hourly.time.indexOf(nowIso); if (i0 < 0) i0 = 0;
    let hh = "";
    for (let k = 0; k < 12 && i0 + k < d.hourly.time.length; k++) {
      const i = i0 + k, [hk] = wxInfo(d.hourly.weather_code[i]), pr = d.hourly.precipitation_probability[i];
      hh += `<div class="hr${k === 0 ? " now" : ""}" style="--k:${k}"><span>${k === 0 ? esc(t("wx.now")) : fmtHour(d.hourly.time[i])}</span>${wxIcon(hk, !d.hourly.is_day[i])}<b>${T(d.hourly.temperature_2m[i])}°</b><em>${pr >= 20 ? pr + "%" : ""}</em></div>`;
    }
    $("#wx-hourly").innerHTML = hh;

    // next days, with low/high bars on one shared scale
    const mins = d.daily.temperature_2m_min, maxs = d.daily.temperature_2m_max;
    const lo = Math.min(...mins), hi = Math.max(...maxs), span = Math.max(1, hi - lo);
    const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: "short" });
    $("#wx-daily").innerHTML = d.daily.time.map((day, k) => {
      const [dk] = wxInfo(d.daily.weather_code[k]);
      const name = k === 0 ? t("wx.today") : dayFmt.format(new Date(day + "T12:00"));
      const l = ((mins[k] - lo) / span) * 100, wd = Math.max(((maxs[k] - mins[k]) / span) * 100, 4);
      return `<li style="--k:${k}"><span>${esc(name)}</span>${wxIcon(dk, false)}<span class="lo">${T(mins[k])}°</span><div class="range"><i style="--l:${l.toFixed(1)}%;--w:${wd.toFixed(1)}%"></i></div><span class="hi">${T(maxs[k])}°</span></li>`;
    }).join("");
    $("#wx-updated").textContent = t("wx.updated", { ago: rel(wx.at) });

    fx.set(kind === "rain" || kind === "storm" ? "rain" : kind === "snow" ? "snow" : night && (kind === "clear" || kind === "partly") ? "stars" : "none");
    sunArc();
  }

  // city search
  let searchSeq = 0;
  const runSearch = debounce(async (q) => {
    const ul = $("#city-results"), seq = ++searchSeq;
    if (q.length < 2) { ul.innerHTML = ""; return; }
    try {
      const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${lang}&format=json`);
      if (seq !== searchSeq) return; // a newer search already started
      const res = r.results || [];
      ul.innerHTML = res.length
        ? res.map((p, i) => `<li><button type="button" data-i="${i}"><span>${esc(p.name)}</span><small>${esc([p.admin1, p.country].filter(Boolean).join(lang === "ar" ? "، " : ", "))}</small></button></li>`).join("")
        : `<li class="note muted small">${esc(t("wx.noMatch", { q }))}</li>`;
      ul.onclick = (e) => {
        const b = e.target.closest("button[data-i]"); if (!b) return;
        const p = res[+b.dataset.i];
        setLoc({ name: p.name, lat: +p.latitude.toFixed(3), lon: +p.longitude.toFixed(3) });
      };
    } catch (e) {
      if (seq !== searchSeq) return;
      ul.innerHTML = onSite ? `<li class="note muted small">${esc(t("wx.searchDown"))}</li>`
        : `<li class="note muted small">${esc(t("wx.searchOnSite"))} <a href="${SITE}" target="_blank" rel="noopener" dir="ltr">${SITE.replace("https://", "")}</a></li>`;
    }
  }, 320);
  $("#city-input").addEventListener("input", (e) => runSearch(e.target.value.trim()));
  $("#city-input").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = $("#city-results button[data-i]"); if (first) first.click();
  });

  function setLoc(l) {
    loc = l; store.set("loc", loc); openSearch(false); $("#city-input").value = "";
    toast(t("wx.setTo", { city: loc.name })); loadWeather(true);
  }
  $("#locate-btn").addEventListener("click", () => {
    const msg = $("#wx-search-msg");
    if (!navigator.geolocation || !window.isSecureContext) { msg.textContent = onSite ? t("wx.noGeo") : t("wx.previewGeo"); return; }
    msg.textContent = t("wx.finding");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = +pos.coords.latitude.toFixed(3), lon = +pos.coords.longitude.toFixed(3);
      let name = t("wx.myLocation");
      try {
        const r = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`);
        name = r.city || r.locality || r.principalSubdivision || name;
      } catch (e) { /* the name is optional; keep "My location" */ }
      setLoc({ name, lat, lon });
    }, (err) => {
      msg.textContent = err && err.code === 1 ? t("wx.geoDenied") : t("wx.geoFailed");
    }, { timeout: 15000, maximumAge: 600000, enableHighAccuracy: false });
  });
  onLang(() => {
    setPlace(); setUnitLabel();
    if (!$("#wx-search").hidden) $("#wx-search-msg").textContent = loc ? t("wx.changeWhere") : t("wx.askWhere");
    if (wxState === "body" && haveWx()) renderWx(); else showWx(wxState);
  });

  // ===================================================================
  // Sun arc
  // ===================================================================
  const arcPath = $("#arc-path"), arcDone = $("#arc-done"), sunDot = $("#sun-dot");
  const arcLen = arcPath.getTotalLength ? arcPath.getTotalLength() : 320;
  arcDone.style.strokeDasharray = arcLen;
  function sunArc() {
    if (!haveWx()) { $("#sun-box").hidden = true; return; }
    const d = wx.d, off = d.utc_offset_seconds || 0;
    const local = new Date(Date.now() + off * 1000);
    const nowM = local.getUTCHours() * 60 + local.getUTCMinutes();
    const toM = (iso) => +iso.slice(11, 13) * 60 + +iso.slice(14, 16);
    const rise = toM(d.daily.sunrise[0]), set = toM(d.daily.sunset[0]);
    $("#sun-box").hidden = false;
    $("#sunrise").textContent = fmtIso(d.daily.sunrise[0]);
    $("#sunset").textContent = fmtIso(d.daily.sunset[0]);
    const p = Math.min(1, Math.max(0, (nowM - rise) / Math.max(1, set - rise)));
    const pt = arcPath.getPointAtLength(p * arcLen);
    sunDot.setAttribute("cx", pt.x); sunDot.setAttribute("cy", pt.y);
    sunDot.style.opacity = nowM < rise || nowM > set ? 0.35 : 1;
    arcDone.style.strokeDashoffset = arcLen * (1 - p);
    $("#sun-note").textContent = nowM < rise ? t("sun.riseIn", { dur: fmtDur(rise - nowM) })
      : nowM < set ? t("sun.daylightLeft", { dur: fmtDur(set - nowM) }) : t("sun.hasSet");
  }

  // ===================================================================
  // Summary pills
  // ===================================================================
  function summary() {
    const ev = (store.get("events", {})[dkey(new Date())] || []).length;
    const n = store.get("notes", []).length, i = store.get("ideas", []).length;
    $("#summary").innerHTML = [tpHTML("summary.plansToday", ev), tpHTML("summary.notes", n), tpHTML("summary.ideas", i)]
      .map((h) => `<span class="pill">${h}</span>`).join("");
  }
  onLang(summary);

  // ===================================================================
  // Clock
  // ===================================================================
  const clockEl = $("#clock");
  function setClock(str) {
    if (clockEl.children.length !== str.length) {
      clockEl.innerHTML = [...str].map((c) => `<span class="dg${c === ":" ? " colon" : ""}">${c}</span>`).join("");
      return;
    }
    [...str].forEach((c, i) => {
      const s = clockEl.children[i];
      if (s.textContent !== c) { s.textContent = c; s.classList.remove("roll"); void s.offsetWidth; s.classList.add("roll"); }
    });
  }
  function isoWeek(d) {
    const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = u.getUTCDay() || 7; u.setUTCDate(u.getUTCDate() + 4 - day);
    return Math.ceil(((u - new Date(Date.UTC(u.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
  }
  let lastDay = dkey(new Date()), lastMin = -1;
  function tick() {
    const n = new Date(), hr = n.getHours();
    setClock(`${h12 ? hr % 12 || 12 : pad(hr)}:${pad(n.getMinutes())}`);
    $("#secs").textContent = pad(n.getSeconds());
    $("#ampm").hidden = !h12; $("#ampm").textContent = ampm(hr);
    if (n.getMinutes() === lastMin) return;
    lastMin = n.getMinutes();
    $("#greet").textContent = t(hr < 5 ? key("greet.night") : hr < 12 ? key("greet.morning") : hr < 17 ? key("greet.afternoon") : hr < 21 ? key("greet.evening") : key("greet.night"));
    $("#date-line").textContent = n.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const mins = hr * 60 + n.getMinutes();
    $("#day-bar").style.setProperty("--p", mins / 1440);
    $("#day-pct").textContent = t("day.gone", { p: Math.round((mins / 1440) * 100) });
    $("#day-left").textContent = t("day.left", { dur: fmtDur(1440 - mins) });
    const doy = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(n.getFullYear(), 0, 0)) / 864e5);
    const leap = new Date(n.getFullYear(), 1, 29).getDate() === 29;
    $("#doy").textContent = t("day.yearPos", { d: doy, total: leap ? 366 : 365, w: isoWeek(n) });
    if (!haveWx()) fx.set(hr < 6 || hr >= 19 ? "stars" : "none");
    if (dkey(n) !== lastDay) { lastDay = dkey(n); cal.goToday(); }
    sunArc();
  }
  function setClockMode(is12) {
    h12 = is12; store.set("h12", h12); lastMin = -1; clockEl.innerHTML = ""; tick();
    if (haveWx()) renderWx();
    cal.render(0);
  }
  $("#clock-btn").addEventListener("click", () => { setClockMode(!h12); toast(t(h12 ? key("clock.h12") : key("clock.h24"))); });
  onLang(() => { lastMin = -1; tick(); });

  // ===================================================================
  // Calendar
  // ===================================================================
  const cal = (() => {
    let events = store.get("events", null);
    if (!events) {
      const td = new Date(), later = new Date(td.getFullYear(), td.getMonth(), td.getDate() + 2);
      events = {
        [dkey(td)]: [{ id: uid(), time: "18:30", text: t("examples.plan1"), ex: true }],
        [dkey(later)]: [{ id: uid(), time: "", text: t("examples.plan2"), ex: true }],
      };
      store.set("events", events);
    }
    const view = new Date(); view.setDate(1);
    let sel = dkey(new Date());
    const save = () => { store.set("events", events); summary(); };
    const fmtPlanTime = (s) => { const [h, m] = s.split(":").map(Number); return fmtTime(h, m); };

    function renderWeek() {
      const f = new Intl.DateTimeFormat(locale(), { weekday: lang === "ar" ? "narrow" : "short" });
      $("#cal-week").innerHTML = Array.from({ length: 7 }, (_, i) => {
        const name = f.format(new Date(2023, 0, 1 + ((weekStart + i) % 7))); // 1 Jan 2023 was a Sunday
        return `<span>${esc(lang === "ar" ? name : name.slice(0, 2))}</span>`;
      }).join("");
    }
    function render(dir) {
      const y = view.getFullYear(), m = view.getMonth(), grid = $("#cal-grid");
      $("#cal-title").textContent = view.toLocaleDateString(locale(), { month: "long", year: "numeric" });
      const lead = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
      const start = new Date(y, m, 1 - lead), today = dkey(new Date());
      let html = "";
      for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = dkey(d), n = (events[k] || []).length;
        const cls = ["day", d.getMonth() !== m && "out", k === today && "today", k === sel && "sel"].filter(Boolean).join(" ");
        const label = d.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" }) + (n ? ", " + tp("cal.plans", n) : "");
        html += `<button type="button" class="${cls}" data-k="${k}" aria-pressed="${k === sel}" aria-label="${esc(label)}"><span>${d.getDate()}</span>${n ? "<i></i>" : ""}</button>`;
      }
      grid.innerHTML = html;
      if (dir && !reduceMotion) {
        const fromRight = (dir > 0) !== (root.dir === "rtl");
        grid.classList.remove("slide-l", "slide-r"); void grid.offsetWidth; grid.classList.add(fromRight ? "slide-l" : "slide-r");
      }
      renderDay();
    }
    function renderDay() {
      const [y, mo, da] = sel.split("-").map(Number), d = new Date(y, mo - 1, da);
      $("#day-title").textContent = (sel === dkey(new Date()) ? t("cal.todayPrefix") : "") + d.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" });
      const list = (events[sel] || []).slice().sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
      $("#day-list").innerHTML = list.map((e) => `<li data-id="${e.id}"><span class="t">${e.time ? fmtPlanTime(e.time) : esc(t("cal.allDay"))}</span><span class="txt" dir="auto">${esc(e.text)}</span><button type="button" class="x" aria-label="${esc(t("cal.remove"))}">${X_ICON}</button></li>`).join("");
      $("#day-empty").hidden = list.length > 0;
    }
    $("#cal-grid").addEventListener("click", (e) => {
      const b = e.target.closest(".day"); if (!b) return;
      sel = b.dataset.k;
      const [y, m] = sel.split("-").map(Number);
      if (y !== view.getFullYear() || m - 1 !== view.getMonth()) {
        const dir = y * 12 + m - 1 > view.getFullYear() * 12 + view.getMonth() ? 1 : -1;
        view.setFullYear(y, m - 1, 1); render(dir);
      } else render(0);
      $("#ev-text").focus({ preventScroll: true });
    });
    $("#cal-prev").addEventListener("click", () => { view.setMonth(view.getMonth() - 1); render(-1); });
    $("#cal-next").addEventListener("click", () => { view.setMonth(view.getMonth() + 1); render(1); });
    function goToday() {
      const td = new Date(), dir = Math.sign(td.getFullYear() * 12 + td.getMonth() - (view.getFullYear() * 12 + view.getMonth()));
      sel = dkey(td); view.setFullYear(td.getFullYear(), td.getMonth(), 1); render(dir); summary();
    }
    $("#cal-today").addEventListener("click", goToday);
    $("#ev-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $("#ev-text").value.trim(); if (!text) { $("#ev-text").focus(); return; }
      (events[sel] = events[sel] || []).push({ id: uid(), time: $("#ev-time").value, text });
      $("#ev-text").value = ""; $("#ev-time").value = ""; save(); render(0); toast(t("cal.added"));
    });
    $("#day-list").addEventListener("click", (e) => {
      const b = e.target.closest(".x"); if (!b) return;
      const id = b.closest("li").dataset.id, day = sel;
      const item = (events[day] || []).find((x) => x.id === id);
      events[day] = (events[day] || []).filter((x) => x.id !== id);
      if (!events[day].length) delete events[day];
      save(); render(0);
      toast(t("cal.removed"), () => { (events[day] = events[day] || []).push(item); save(); render(0); toast(t("common.restored")); });
    });
    function setWeekStart(ws) { weekStart = ws; store.set("weekStart", ws); renderWeek(); render(0); }
    onLang(() => { renderWeek(); render(0); });
    renderWeek();
    return { render, goToday, setWeekStart };
  })();

  // ===================================================================
  // Notes
  // ===================================================================
  (() => {
    let list = store.get("notes", null);
    if (!list) {
      list = [
        { id: uid(), text: t("examples.note1"), color: 1, at: Date.now() - 6e5, ex: true },
        { id: uid(), text: t("examples.note2"), color: 3, at: Date.now() - 36e5 * 5, ex: true },
      ];
      store.set("notes", list);
    }
    let color = 1;
    const box = $("#notes-list"), search = $("#notes-search");
    const save = () => { store.set("notes", list); summary(); $("#notes-count").textContent = list.length; $("#notes-empty").hidden = list.length > 0; };
    const grow = (ta) => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    const rot = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return ((Math.abs(h) % 7) - 3) * 0.35; };
    const noteHTML = (n) => `<article class="note c${n.color}" data-id="${n.id}" style="--rot:${rot(n.id)}deg"><textarea id="note-${n.id}" rows="1" dir="auto" aria-label="${esc(t("notes.noteAria"))}">${esc(n.text)}</textarea><footer><time>${esc(rel(n.at))}</time>${n.ex ? `<span class="tag">${esc(t("notes.example"))}</span>` : ""}<button type="button" class="x" aria-label="${esc(t("notes.delete"))}">${X_ICON}</button></footer></article>`;
    function filter() {
      const q = search.value.trim().toLocaleLowerCase();
      let shown = 0;
      for (const el of box.children) {
        const n = list.find((x) => x.id === el.dataset.id);
        const hit = !q || (n && n.text.toLocaleLowerCase().includes(q));
        el.hidden = !hit; if (hit) shown++;
      }
      $("#notes-nomatch").hidden = !(q && list.length && !shown);
    }
    function render() { box.innerHTML = list.map(noteHTML).join(""); box.querySelectorAll("textarea").forEach(grow); save(); filter(); }
    const persist = debounce(save, 400);
    box.addEventListener("input", (e) => {
      if (e.target.tagName !== "TEXTAREA") return;
      const n = list.find((x) => x.id === e.target.closest(".note").dataset.id);
      if (n) { n.text = e.target.value; n.at = Date.now(); delete n.ex; grow(e.target); persist(); }
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".x"); if (!b) return;
      const el = b.closest(".note"), id = el.dataset.id;
      const idx = list.findIndex((x) => x.id === id), item = list[idx];
      list = list.filter((x) => x.id !== id); save();
      el.classList.add("leaving");
      setTimeout(() => { el.remove(); filter(); }, reduceMotion ? 0 : 240);
      toast(t("notes.deleted"), () => { list.splice(Math.min(idx, list.length), 0, item); render(); toast(t("common.restored")); });
    });
    $(".swatches").addEventListener("click", (e) => {
      const b = e.target.closest(".sw"); if (!b) return;
      color = +b.dataset.c;
      $$(".sw").forEach((s) => s.setAttribute("aria-pressed", String(s === b)));
    });
    const input = $("#note-new");
    function add() {
      const text = input.value.trim(); if (!text) { input.focus(); return; }
      const n = { id: uid(), text, color, at: Date.now() };
      list.unshift(n); input.value = "";
      box.insertAdjacentHTML("afterbegin", noteHTML(n)); grow(box.querySelector("textarea"));
      save(); filter(); toast(t("notes.added"));
    }
    $("#note-form").addEventListener("submit", (e) => { e.preventDefault(); add(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
    search.addEventListener("input", filter);
    onLang(render);
    render();
  })();

  // ===================================================================
  // Ideas
  // ===================================================================
  (() => {
    let list = store.get("ideas", null);
    if (!list) {
      list = [{ id: uid(), title: t("examples.ideaTitle"), body: t("examples.ideaBody"), at: Date.now() - 864e5, ex: true }];
      store.set("ideas", list);
    }
    let active = store.get("ideaActive", list[0] && list[0].id);
    if (!list.some((x) => x.id === active)) active = list[0] && list[0].id;
    const ul = $("#idea-list"), tIn = $("#idea-title"), bIn = $("#idea-body"), status = $("#idea-status");
    const cur = () => list.find((x) => x.id === active);
    const words = (s) => (s.trim().match(/\S+/g) || []).length;
    const growTitle = () => { tIn.style.height = "auto"; tIn.style.height = tIn.scrollHeight + "px"; };

    function renderList() {
      ul.innerHTML = list.map((x) => {
        const snip = x.body.split("\n").find((l) => l.trim()) || t("ideas.emptySnippet");
        return `<li><button type="button" class="idea-item${x.id === active ? " on" : ""}" data-id="${x.id}"><strong dir="auto">${esc(x.title || t("ideas.untitled"))}</strong><span dir="auto">${esc(snip)}</span><time>${esc(rel(x.at))}</time></button></li>`;
      }).join("");
      $("#ideas-count").textContent = list.length;
    }
    function renderEditor(anim) {
      const x = cur(), ed = $("#idea-editor");
      ed.hidden = !x; $("#idea-empty").hidden = !!x;
      $("#idea-confirm").hidden = true; $("#idea-del").hidden = false;
      if (!x) return;
      tIn.value = x.title; bIn.value = x.body; growTitle();
      $("#idea-words").textContent = tp("ideas.words", words(x.body));
      if (anim && !reduceMotion) { ed.classList.remove("swap"); void ed.offsetWidth; ed.classList.add("swap"); }
    }
    const save = () => { store.set("ideas", list); store.set("ideaActive", active); summary(); };
    const persist = debounce(() => {
      save(); renderList();
      status.classList.add("show"); clearTimeout(status.tm); status.tm = setTimeout(() => status.classList.remove("show"), 1400);
    }, 450);
    function edit() {
      const x = cur(); if (!x) return;
      growTitle();
      x.title = tIn.value; x.body = bIn.value; x.at = Date.now(); delete x.ex;
      $("#idea-words").textContent = tp("ideas.words", words(x.body)); persist();
    }
    tIn.addEventListener("input", edit); bIn.addEventListener("input", edit);
    tIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); bIn.focus(); } });
    addEventListener("resize", debounce(growTitle, 150));
    ul.addEventListener("click", (e) => {
      const b = e.target.closest(".idea-item"); if (!b || b.dataset.id === active) return;
      active = b.dataset.id; store.set("ideaActive", active); renderList(); renderEditor(true);
    });
    $("#idea-new").addEventListener("click", () => {
      const x = { id: uid(), title: "", body: "", at: Date.now() };
      list.unshift(x); active = x.id; save(); renderList(); renderEditor(true); tIn.focus();
    });
    $("#idea-del").addEventListener("click", () => { $("#idea-confirm").hidden = false; $("#idea-del").hidden = true; $("#idea-no").focus(); });
    $("#idea-no").addEventListener("click", () => { $("#idea-confirm").hidden = true; $("#idea-del").hidden = false; });
    $("#idea-yes").addEventListener("click", () => {
      const idx = list.findIndex((x) => x.id === active), item = list[idx];
      list = list.filter((x) => x.id !== active); active = list[0] && list[0].id;
      save(); renderList(); renderEditor(true);
      toast(t("ideas.deleted"), () => { list.splice(Math.min(idx, list.length), 0, item); active = item.id; save(); renderList(); renderEditor(true); toast(t("common.restored")); });
    });
    onLang(() => { renderList(); renderEditor(false); });
    renderList(); renderEditor(false);
  })();

  // ===================================================================
  // Move data between devices
  // ===================================================================
  (() => {
    const dlg = $("#sync-dlg"), out = $("#sync-out"), inp = $("#sync-in"), msg = $("#sync-msg");
    const KEYS = ["notes", "ideas", "events", "name", "loc", "unit", "h12", "lang", "weekStart"];
    const b64 = {
      enc: (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
      dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
    };
    async function gz(u8, dir) {
      const stream = new Blob([u8]).stream().pipeThrough(dir === "c" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    function snapshot() { const o = { v: 2 }; for (const k of KEYS) o[k] = store.get(k, null); return o; }
    async function encode() {
      const raw = new TextEncoder().encode(JSON.stringify(snapshot()));
      if (window.CompressionStream) { try { return "DAYBOOK-Z:" + b64.enc(await gz(raw, "c")); } catch (e) { /* fall back to plain */ } }
      return "DAYBOOK:" + b64.enc(raw);
    }
    async function decode(code) {
      code = code.replace(/\s+/g, "");
      if (code.startsWith("{")) return JSON.parse(code);
      if (code.startsWith("DAYBOOK-Z:")) return JSON.parse(new TextDecoder().decode(await gz(b64.dec(code.slice(10)), "d")));
      if (code.startsWith("DAYBOOK:")) return JSON.parse(new TextDecoder().decode(b64.dec(code.slice(8))));
      throw new Error("format");
    }
    // merge by id; the newer edit wins; examples are never copied
    function mergeList(mine, theirs) {
      const map = new Map((mine || []).map((x) => [x.id, x]));
      for (const x of theirs || []) {
        if (!x || !x.id || x.ex) continue;
        const m = map.get(x.id);
        if (!m || (x.at || 0) > (m.at || 0)) map.set(x.id, x);
      }
      return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
    }
    const isExamplePlan = (x) => x.ex || /^Example/.test(x.text || "");
    function apply(d) {
      if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("format");
      const notes = (d.notes || []).filter((x) => x && !x.ex), ideas = (d.ideas || []).filter((x) => x && !x.ex);
      let count = notes.length + ideas.length;
      store.set("notes", mergeList(store.get("notes", []), notes));
      store.set("ideas", mergeList(store.get("ideas", []), ideas));
      const ev = store.get("events", {});
      for (const [day, items] of Object.entries(d.events || {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(items)) continue;
        const have = new Set((ev[day] || []).map((x) => x.id));
        const add = items.filter((x) => x && x.id && typeof x.text === "string" && !have.has(x.id) && !isExamplePlan(x));
        count += items.length;
        if (add.length) ev[day] = (ev[day] || []).concat(add);
      }
      store.set("events", ev);
      if (d.name && !store.get("name", "")) store.set("name", d.name);
      if (d.loc && !store.get("loc", null)) store.set("loc", d.loc);
      return count;
    }
    $("#sync-btn").addEventListener("click", () => { msg.textContent = ""; out.hidden = true; dlg.showModal(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    $("#sync-copy").addEventListener("click", async () => {
      const code = await encode();
      out.value = code; out.hidden = false;
      try { await navigator.clipboard.writeText(code); toast(t("sync.copied")); }
      catch (e) { out.focus(); out.select(); toast(t("sync.selectCopy")); }
    });
    $("#sync-save").addEventListener("click", async () => {
      const json = JSON.stringify(snapshot(), null, 1), filename = `daybook-backup-${dkey(new Date())}.json`;
      // inside the Claude viewer, files go through its save dialog
      const dl = window.claude && window.claude.use ? await window.claude.use("downloads").catch(() => null) : null;
      if (dl) {
        try { await dl.save({ filename, data: json }); toast(t("sync.fileSaved")); }
        catch (e) { if (!e || e.code !== "declined") toast(t("sync.fileFailed")); }
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    async function load(text) {
      try {
        const n = apply(await decode(text));
        msg.textContent = t("sync.done", { items: tp("sync.items", n) });
        setTimeout(() => location.reload(), 900);
      } catch (e) {
        msg.textContent = t("sync.badCode");
      }
    }
    $("#sync-load").addEventListener("click", () => { const v = inp.value.trim(); if (!v) { inp.focus(); msg.textContent = t("sync.pasteFirst"); return; } load(v); });
    $("#sync-file").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) load(await f.text()); e.target.value = ""; });
  })();

  // ===================================================================
  // Settings dialog
  // ===================================================================
  (() => {
    const dlg = $("#settings-dlg"), form = $("#settings-form");
    function labelDays() {
      const f = new Intl.DateTimeFormat(locale(), { weekday: "long" });
      $$(".wd", form).forEach((el) => { el.textContent = f.format(new Date(2023, 0, 1 + +el.dataset.day)); });
    }
    function sync() {
      const pick = (name, value) => { const el = form.querySelector(`input[name="${name}"][value="${value}"]`); if (el) el.checked = true; };
      pick("lang", lang); pick("theme", theme); pick("motion", motion ? "on" : "off");
      pick("unit", unit); pick("clock", h12 ? "12" : "24"); pick("week", String(weekStart));
      labelDays();
    }
    $("#settings-btn").addEventListener("click", () => { sync(); dlg.showModal(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    form.addEventListener("change", (e) => {
      const { name, value } = e.target;
      if (name === "lang") setLang(value);
      else if (name === "theme") { theme = value; store.set("theme", theme); applyTheme(); fx.refresh(); }
      else if (name === "motion") { motion = value === "on"; store.set("motion", motion); applyMotion(); fx.refresh(); toast(t(motion ? key("settings.motionOn") : key("settings.motionOff"))); }
      else if (name === "unit") setUnit(value);
      else if (name === "clock") setClockMode(value === "12");
      else if (name === "week") cal.setWeekStart(+value);
    });
    onLang(labelDays);
  })();

  $("#lang-btn").addEventListener("click", () => setLang(lang === "en" ? "ar" : "en"));

  // ===================================================================
  // Boot
  // ===================================================================
  setUnitLabel();
  tick();
  setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
  cal.render(0);
  summary();
  loadWeather(false);
  setInterval(() => loadWeather(true), 30 * 60e3);
  sizeName();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeName);
})();
