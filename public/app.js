const ORDER = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
let modes = [];
let current = "overall";

function tierColor(t) {
  const map = { HT1:"#ff4d4d", LT1:"#ff6b6b", HT2:"#ff9f43", LT2:"#f5b95e", HT3:"#ffe066", LT3:"#f2e39a", HT4:"#9dff5c", LT4:"#c8f0a0", HT5:"#7fc3ff", LT5:"#b9dbff" };
  return map[t] || "#ddd";
}

async function loadModes() {
  modes = await (await fetch("/api/mode/list")).json();
  const nav = document.getElementById("modes");
  nav.innerHTML = "";
  const all = [{ key: "overall", name: "Overall" }, ...modes];
  for (const m of all) {
    const b = document.createElement("button");
    b.innerHTML = m.img ? `<img src="${m.img}" alt=""> ${m.name}` : `<span class="star">★</span> ${m.name}`;
    if (m.key === current) b.classList.add("active");
    b.onclick = () => { current = m.key; loadModes(); loadBoard(); };
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
    const wrap = document.createElement("div");
    wrap.className = "tier";
    wrap.innerHTML = `<h3 style="color:var(--primary)">Overall <span class="count">${data.length}</span></h3><div class="tier-players"></div>`;
    const players = wrap.querySelector(".tier-players");
    data.forEach((p, i) => {
      const el = document.createElement("span");
      el.className = "pill";
      el.innerHTML = `<span class="rank">#${i + 1}</span>${p.name}<small>${p.region} • ${p.points} pts</small>`;
      el.onclick = () => loadProfile(p.name);
      players.appendChild(el);
    });
    board.appendChild(wrap);
    return;
  }

  const data = await (await fetch(`/api/mode/${current}`)).json();
  let hasAny = false;
  for (const t of ORDER) {
    const arr = (data[t] || []).filter(p => !q || p.name.toLowerCase().includes(q));
    if (!arr.length) continue;
    hasAny = true;
    const wrap = document.createElement("div");
    wrap.className = "tier";
    wrap.innerHTML = `<h3 style="color:${tierColor(t)}">${t} <span class="count">${arr.length}</span></h3><div class="tier-players"></div>`;
    const players = wrap.querySelector(".tier-players");
    arr.forEach(p => {
      const el = document.createElement("span");
      el.className = "pill";
      el.innerHTML = `${p.name}<small>${p.region}</small>`;
      el.onclick = () => loadProfile(p.name);
      players.appendChild(el);
    });
    board.appendChild(wrap);
  }
  if (!hasAny) board.innerHTML = `<div class="empty">Sin jugadores testeados en ${current.toUpperCase()} aún.</div>`;
}

async function loadProfile(name) {
  if (!name) {
    const p = new URLSearchParams(location.search).get("player");
    if (!p) return;
    name = p;
  }
  const r = await fetch(`/api/profile/${encodeURIComponent(name)}`);
  const box = document.getElementById("profile");
  if (!r.ok) { box.innerHTML = `<h3>${name}</h3><p>Sin ranking.</p>`; return; }
  const { player, current: cur, history } = await r.json();
  box.innerHTML = `<h3>${player.name}<br><small>${player.region}</small></h3>` +
    `<div class="profile-grid">` +
    modes.map(g => {
      const v = cur[g.key];
      return `<div class="stat" style="border-color:${tierColor(v)}55"><div class="v" style="color:${tierColor(v)}">${v || "—"}</div><div class="k">${g.name}</div></div>`;
    }).join("") +
    `</div>` +
    `<h4>Últimos tests</h4>` +
    (history.slice(0, 10).map(h => `<div class="hist"><small>${new Date(h.timestamp).toLocaleString()}</small><div>${h.gamemode.toUpperCase()} — <b style="color:${tierColor(h.tier)}">${h.tier}</b></div></div>`).join("") || "<small>Sin historial.</small>");
}

document.getElementById("search").addEventListener("input", loadBoard);
(async () => { await loadModes(); await loadBoard(); await loadProfile(); setInterval(loadBoard, 15000); })();
