const LEAGUES = [
  { code: "eng.1", name: "Premier League", tab: "epl" },
  { code: "esp.1", name: "La Liga", tab: "other" },
  { code: "ger.1", name: "Bundesliga", tab: "other" },
  { code: "ita.1", name: "Serie A", tab: "other" },
  { code: "fra.1", name: "Ligue 1", tab: "other" },
  { code: "uefa.champions", name: "Champions League", tab: "europe" },
  { code: "uefa.europa", name: "Europa League", tab: "europe" },
  { code: "uefa.europa.conf", name: "Conference League", tab: "europe" }
];
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const content = document.getElementById("content");
const picker = document.getElementById("datePicker");
const label = document.getElementById("dateLabel");
let current = new Date();
let timer = null;
let activeTab = "epl";
const TAB_NAMES = { epl: "the Premier League", other: "La Liga, Bundesliga, Serie A or Ligue 1", europe: "the Champions, Europa or Conference League" };

const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function dayLabel(d) {
  const t = new Date(); t.setHours(0,0,0,0);
  const x = new Date(d); x.setHours(0,0,0,0);
  const diff = Math.round((x - t) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function load() {
  clearTimeout(timer);
  picker.value = ymd(current);
  label.textContent = dayLabel(current);
  const openIds = new Set([...document.querySelectorAll(".match.open")].map(m => m.dataset.id));
  const dateParam = ymd(current).replace(/-/g, "");

  const results = await Promise.allSettled(
    LEAGUES.filter(l => l.tab === activeTab).map(l => getJSON(`${API}/${l.code}/scoreboard?dates=${dateParam}`).then(j => ({ league: l, data: j })))
  );

  const ok = results.filter(r => r.status === "fulfilled").map(r => r.value);
  if (!ok.length) {
    content.innerHTML = `<p class="msg">Couldn’t load scores. Check your internet connection and press refresh.</p>`;
    return;
  }

  let html = "", anyMatch = false;
  for (const { league, data } of ok) {
    const events = data.events || [];
    if (!events.length) continue;
    anyMatch = true;
    const logo = data.leagues?.[0]?.logos?.[0]?.href;
    html += `<div class="league">${logo ? `<img src="${esc(logo)}" alt="">` : ""}${esc(league.name)}</div>`;
    for (const ev of events) html += matchHTML(ev, league.code, openIds.has(ev.id));
  }
  content.innerHTML = anyMatch ? html : `<p class="msg">No matches in ${TAB_NAMES[activeTab]} on ${esc(dayLabel(current).toLowerCase())}.</p>`;

  content.querySelectorAll(".match.open").forEach(m => loadDetails(m));
  // Auto-refresh every 60s when viewing today
  if (dayLabel(current) === "Today") timer = setTimeout(load, 60000);
}

// Decide what to show under the score, using ESPN's status name/period
// instead of elapsed time (which keeps counting 45'+N through halftime).
function statusInfo(ev) {
  const s = ev.status || {};
  const st = s.type || {};
  const name = st.name || "";
  if (st.state === "pre") {
    return { live: false, statusText: new Date(ev.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
  }
  if (st.state === "in") {
    if (name === "STATUS_HALFTIME" || st.shortDetail === "HT") return { live: true, statusText: "HT" };
    return { live: true, statusText: s.displayClock || st.shortDetail || "LIVE" };
  }
  // post: keep AET / penalties labels, otherwise plain FT
  if (name === "STATUS_FINAL_AET" || name === "STATUS_FINAL_PEN") return { live: false, statusText: st.shortDetail || "FT" };
  return { live: false, statusText: "FT" };
}

function matchHTML(ev, code, open) {
  const comp = ev.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === "home");
  const away = comp?.competitors?.find(c => c.homeAway === "away");
  if (!home || !away) return "";
  const st = ev.status?.type || {};
  const state = st.state; // pre | in | post
  const { statusText, live } = statusInfo(ev);
  const score = state === "pre" ? "vs" : `${esc(home.score)} - ${esc(away.score)}`;
  const team = (c, cls) => `<div class="team ${cls}">
      ${c.team?.logo ? `<img src="${esc(c.team.logo)}" alt="">` : ""}
      <span>${esc(c.team?.shortDisplayName || c.team?.displayName)}</span></div>`;
  return `<div class="match${open ? " open" : ""}" data-id="${esc(ev.id)}" data-league="${esc(code)}" data-state="${esc(state)}">
    <button class="row" aria-expanded="${open}">
      ${team(home, "home")}
      <div class="mid"><div class="score">${score}</div><div class="status${live ? " live" : ""}">${esc(statusText)}</div></div>
      ${team(away, "away")}
    </button>
    <div class="details" data-home="${esc(home.team?.id)}" data-away="${esc(away.team?.id)}"></div>
  </div>`;
}

function classify(k) {
  const t = `${k.type?.text || ""} ${k.type?.type || ""}`.toLowerCase();
  if (t.includes("own goal")) return "own";
  if (t.includes("goal") || t.includes("penalty - scored") || t.includes("penalty-scored")) return "goal";
  if (t.includes("red card") || t.includes("red-card")) return "red";
  if (t.includes("yellow card") || t.includes("yellow-card")) return "yellow";
  if (t.includes("substitution")) return "sub";
  return null;
}

function eventLine(k, kind) {
  const p = k.participants || [];
  const name = i => p[i]?.athlete?.displayName;
  const icon = { goal: "⚽", own: "⚽ (OG)", yellow: `<span class="card-y"></span>`, red: `<span class="card-r"></span>`, sub: "🔁" }[kind];
  if (kind === "sub") {
    const on = name(0), off = name(1);
    if (on && off) return `${icon} <b>${esc(on)}</b><span class="sub">for ${esc(off)}</span>`;
    return `${icon} ${esc(k.shortText || k.text || "Substitution")}`;
  }
  const who = name(0) || k.shortText || k.text || "";
  let extra = "";
  const t = (k.type?.text || "").toLowerCase();
  if (kind === "goal") {
    if (t.includes("penalty")) extra = "penalty";
    else if (name(1)) extra = `assist: ${name(1)}`;
  }
  return `${icon} <b>${esc(who)}</b>${extra ? `<span class="sub">${esc(extra)}</span>` : ""}`;
}

async function loadDetails(matchEl) {
  const box = matchEl.querySelector(".details");
  if (matchEl.dataset.state === "pre") {
    box.innerHTML = `<div class="none">Match hasn’t started yet.</div>`;
    return;
  }
  if (!box.innerHTML) box.innerHTML = `<div class="none">Loading…</div>`;
  try {
    const j = await getJSON(`${API}/${matchEl.dataset.league}/summary?event=${matchEl.dataset.id}`);
    const homeId = box.dataset.home;
    const raw = (j.keyEvents || []).map(k => ({ k, kind: classify(k) })).filter(x => x.kind);
    const rows = raw.map(({ k, kind }) => {
      const isHome = String(k.team?.id) === String(homeId);
      const side = isHome ? "home" : "away";
      const min = esc(k.clock?.displayValue || "");
      const line = eventLine(k, kind);
      return `<div class="ev">
        <div class="home">${isHome ? line : ""}</div>
        <div class="min">${min}</div>
        <div>${!isHome ? line : ""}</div></div>`;
    }).join("");
    const venue = j.gameInfo?.venue?.fullName;
    box.innerHTML = (rows || `<div class="none">No goals, cards or substitutions yet.</div>`) +
      (venue ? `<div class="venue">${esc(venue)}</div>` : "");
  } catch (e) {
    box.innerHTML = `<div class="none">Couldn’t load match details.</div>`;
  }
}

content.addEventListener("click", e => {
  const row = e.target.closest(".row");
  if (!row) return;
  const m = row.closest(".match");
  const open = m.classList.toggle("open");
  row.setAttribute("aria-expanded", open);
  if (open) loadDetails(m);
});

const shift = n => { current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + n); load(); };
document.getElementById("prev").onclick = () => shift(-1);
document.getElementById("next").onclick = () => shift(1);
document.getElementById("refresh").onclick = () => load();
picker.addEventListener("change", () => {
  if (!picker.value) return;
  const [y, m, d] = picker.value.split("-").map(Number);
  current = new Date(y, m - 1, d);
  load();
});

// Tabs
const tabBtns = document.querySelectorAll("#tabs button");
function paintTabs() {
  tabBtns.forEach(b => {
    const on = b.dataset.tab === activeTab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
}
tabBtns.forEach(b => b.addEventListener("click", () => {
  activeTab = b.dataset.tab;
  chrome.storage.local.set({ activeTab });
  paintTabs();
  content.innerHTML = `<p class="msg">Loading scores…</p>`;
  load();
}));
chrome.storage.local.get("activeTab").then(({ activeTab: saved }) => {
  if (saved && TAB_NAMES[saved]) activeTab = saved;
  paintTabs();
  load();
});

// Premier League goal alerts toggle
const bell = document.getElementById("bell");
function paintBell(on) {
  bell.style.opacity = on ? "1" : "0.4";
  bell.title = on ? "Premier League goal alerts: ON" : "Premier League goal alerts: OFF";
  bell.innerHTML = on ? "&#128276;" : "&#128277;";
}
chrome.storage.local.get("notifyEnabled").then(({ notifyEnabled = true }) => paintBell(notifyEnabled));
bell.onclick = async () => {
  const { notifyEnabled = true } = await chrome.storage.local.get("notifyEnabled");
  await chrome.storage.local.set({ notifyEnabled: !notifyEnabled });
  paintBell(!notifyEnabled);
};
