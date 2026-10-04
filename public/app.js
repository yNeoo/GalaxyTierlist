const ORDER = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
let modes = [];
let current = "overall";

// Los nombres vienen de usuarios de Discord / tests, no son datos de confianza:
// siempre se escapan antes de meterlos en innerHTML.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

function tierColor(t) {
  const m = { HT1:"#ff4d4d", LT1:"#ff8080", HT2:"#ff9f43", LT2:"#f7b96c", HT3:"#ffe066", LT3:"#f3e6a6", HT4:"#b6ff5c", LT4:"#d3f5a6", HT5:"#7fc3ff", LT5:"#c2ddff" };
  return m[t] || "#ddd";
}

async function loadModes() {
  modes = await (await fetch("/api/mode/list")).json();
  const nav = document.getElementById("modes");
  nav.innerHTML = "";
  const all = [{ key: "overall", name: "Overall" }, ...modes];
  for (const m of all) {
    const b = document.createElement("button");
    b.innerHTML = m.img
      ? `<img src="${esc(m.img)}" alt=""> ${esc(m.name)}`
      : `<span>★</span> ${esc(m.name)}`;
    if (m.key === current) b.classList.add("active");
    b.onclick = () => { current = m.key; loadBoard(); };
    nav.appendChild(b);
  }
}

async function loadBoard() {
  const board = document.getElementById("board");
  const q = document.getElementById("search").value.trim().toLowerCase();
  board.innerHTML = "";
  if (current === "overall") {
    let data = await (await fetch("/api/mode/overall")).json();
    if (q) data = data.filter(p => p.name.toLowerCase().includes(q));
    const w = document.createElement("div"); w.className = "tier";
    w.innerHTML = `<h3>Overall <span class="count">${data.length}</span></h3><div class="tier-players"></div>`;
    const p = w.querySelector(".tier-players");
    data.forEach((x, i) => {
      const el = document.createElement("span");
      el.className = "pill";
      el.innerHTML = `<span class="rank">#${i + 1}</span>` + esc(x.name) +
        `<small>${esc(x.region)} • ${Number(x.points) || 0} pts</small>`;
      el.onclick = () => loadProfile(x.name);
      p.appendChild(el);
    });
    board.appendChild(w); return;
  }
  const data = await (await fetch(`/api/mode/${current}`)).json();
  let ok = false;
  for (const t of ORDER) {
    const arr = (data[t]||[]).filter(p=>!q||p.name.toLowerCase().includes(q));
    if (!arr.length) continue; ok = true;
    const w = document.createElement("div"); w.className = "tier";
    w.innerHTML = `<h3 style="color:${tierColor(t)}">${esc(t)} <span class="count">${arr.length}</span></h3><div class="tier-players"></div>`;
    const p = w.querySelector(".tier-players");
    arr.forEach(x => {
      const el = document.createElement("span");
      el.className = "pill";
      el.innerHTML = esc(x.name) + (x.region ? `<small>${esc(x.region)}</small>` : "");
      el.onclick = () => loadProfile(x.name);
      p.appendChild(el);
    });
    board.appendChild(w);
  }
  if (!ok) board.innerHTML = `<div class="empty">No players tested in ${esc(current.toUpperCase())} yet.</div>`;
}

async function loadProfile(name) {
  if (!name) { const p = new URLSearchParams(location.search).get("player"); if (!p) return; name = p; }
  const r = await fetch(`/api/profile/${encodeURIComponent(name)}`);
  const box = document.getElementById("profile");
  if (!r.ok) { box.innerHTML = `<h3>${esc(name)}</h3><p>No ranking data.</p>`; return; }
  const { player, current: cur, history } = await r.json();
  box.innerHTML = `<h3>${esc(player.name)}<br><small>${esc(player.region)}</small></h3><div class="profile-grid">` +
    modes.map(g => {
      const v = cur[g.key];
      return `<div class="stat" style="border-color:${tierColor(v)}55"><div class="v" style="color:${tierColor(v)}">${esc(v || "—")}</div><div class="k">${esc(g.name)}</div></div>`;
    }).join("") +
    `</div><h4>Recent Tests</h4>` +
    (history.slice(0,10).map(h =>
      `<div class="hist"><small>${new Date(h.timestamp).toLocaleString()}</small><div>${esc(String(h.gamemode).toUpperCase())} — <b style="color:${tierColor(h.tier)}">${esc(h.tier)}</b></div></div>`
    ).join("") || "<small>No history.</small>");
}

document.getElementById("search").addEventListener("input", loadBoard);
(async ()=>{ await loadModes(); await loadBoard(); await loadProfile(); setInterval(loadBoard, 15000); })();
