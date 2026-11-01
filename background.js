// Premier League goal notifications only.
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

function setup() {
  chrome.alarms.create("pl-poll", { periodInMinutes: 1 });
}
setup();

chrome.alarms.onAlarm.addListener(a => { if (a.name === "pl-poll") poll(); });

async function poll() {
  const { notifyEnabled = true, scores = {} } = await chrome.storage.local.get(["notifyEnabled", "scores"]);
  if (!notifyEnabled) return;

  let events;
  try {
    const r = await fetch(`${API}/scoreboard`);
    events = (await r.json()).events || [];
  } catch (e) { return; }

  const next = {};
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === "home");
    const away = comp?.competitors?.find(c => c.homeAway === "away");
    if (!home || !away || ev.status?.type?.state !== "in") continue;

    const h = Number(home.score) || 0, a = Number(away.score) || 0;
    next[ev.id] = [h, a];
    const prev = scores[ev.id];

    // Only notify if we already knew this match's score and it went up.
    if (prev && (h > prev[0] || a > prev[1])) {
      const scoringTeam = h > prev[0] ? home : away;
      const detail = await lastGoal(ev.id);
      const who = detail?.name ? `${detail.name} ${detail.minute || ""}`.trim() : scoringTeam.team.displayName;
      chrome.notifications.create(`goal-${ev.id}-${h}-${a}`, {
        type: "basic",
        iconUrl: "icon128.png",
        title: `⚽ GOAL! ${home.team.shortDisplayName} ${h} - ${a} ${away.team.shortDisplayName}`,
        message: `${who} (${scoringTeam.team.displayName})`,
        priority: 2
      });
    }
  }
  await chrome.storage.local.set({ scores: next });
}

async function lastGoal(eventId) {
  try {
    const j = await (await fetch(`${API}/summary?event=${eventId}`)).json();
    const goals = (j.keyEvents || []).filter(k => {
      const t = (k.type?.text || "").toLowerCase();
      return t.includes("goal") || t.includes("penalty - scored");
    });
    const g = goals[goals.length - 1];
    if (!g) return null;
    return { name: g.participants?.[0]?.athlete?.displayName, minute: g.clock?.displayValue };
  } catch (e) { return null; }
}
