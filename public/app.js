const ORDER = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
let modes = [];
let current = "overall";

function tierColor(t) {
  if (t.startsWith("HT1")) return "#ff5555";
  if (t.startsWith("LT1")) return "#ff6666";
  if (t.startsWith("HT2")) return "#ff9c40";
  if (t.startsWith("LT2")) return "#f5b461";
  if (t.startsWith("HT3")) return "#ffe066";
  if (t.startsWith("LT3")) return "#f7e49c";
  if (t.startsWith("HT4")) return "#a3ff5c";
  if (t.startsWith("LT4")) return "#c9f2a3";
  if (t.startsWith("HT5")) return "#7fc3ff";
  if (t.startsWith("LT5")) return "#b7d9ff";
  return "#ddd";
}

async function loadModes() {
  modes = await (await fetch("/api/mode/list")).json();
  const nav = document.getElementById("modes");
  nav.innerHTML = "";
  const all = [{key:"overall",name:"Overall",icon:"★"}, ...modes];
  for (const m of all) {
    const b = document.createElement("button");
    b.textContent = `${m.icon||""} ${m.name}`;
    if (m.key===current) b.classList.add("active");
    b.onclick = ()=>{ current=m.key; loadBoard(); };
    nav.appendChild(b);
  }
}

async function loadBoard() {
  const board = document.getElementById("board");
  const q = document.getElementById("search").value.trim().toLowerCase();
  if (current==="overall") {
    let data = await (await fetch("/api/mode/overall")).json();
    if (q) data = data.filter(p=>p.name.toLowerCase().includes(q));
    const wrap = document.createElement("div");
    wrap.className = "tier";
    wrap.innerHTML = `<h3 style="color:var(--primary)">★ Overall — ${data.length}</h3><div class="tier-players"></div>`;
    const players = wrap.querySelector(".tier-players");
    data.forEach((p,i)=>{
      const el = document.createElement("span");
      el.className = "pill";
      el.innerHTML = `<span class="rank">#${i+1}</span>${p.name}<small>${p.region} • ${p.points} pts</small>`;
      el.onclick = ()=>loadProfile(p.name);
      players.appendChild(el);
    });
    board.innerHTML = ""; board.appendChild(wrap);
    return;
  }
  const data = await (await fetch(`/api/mode/${current}`)).json();
  board.innerHTML = "";
  let hasAny = false;
  for (const t of ORDER) {
    const arr = (data[t]||[]).filter(p=>!q||p.name.toLowerCase().includes(q));
    if (!arr.length) continue;
    hasAny = true;
    const wrap = document.createElement("div");
    wrap.className = "tier";
    wrap.innerHTML = `<h3 style="color:${tierColor(t)}">${t} — ${arr.length}</h3><div class="tier-players"></div>`;
    const players = wrap.querySelector(".tier-players");
    arr.forEach((p,i)=>{
      const el = document.createElement("span");
      el.className = "pill";
      el.innerHTML = `${p.name}<small>${p.region}</small>`;
      el.onclick = ()=>loadProfile(p.name);
      players.appendChild(el);
    });
    board.appendChild(wrap);
  }
  if (!hasAny) board.innerHTML = `<div style="opacity:.7;padding:20px;text-align:center">Sin jugadores testeados en ${current.toUpperCase()} aún.</div>`;
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
  const { player, current:cur, history } = await r.json();
  const modesList = [...modes];
  box.innerHTML = `<h3>${player.name}<br><small>${player.region} • UUID: ${player.uuid||"—"}</small></h3>` +
    `<div class="profile-grid">` +
    modesList.map(g=>{
      const v = cur[g.key];
      return v ? `<div class="stat" style="border-color:${tierColor(v)}55"><div class="v" style="color:${tierColor(v)}">${v}</div><div class="k">${g.name}</div></div>` : `<div class="stat"><div class="v">—</div><div class="k">${g.name}</div></div>`;
    }).join("") +
    `</div>` +
    `<h4 style="margin:8px 0 6px">Últimos tests</h4>` +
    (history.slice(0,10).map(h=>`<div style="padding:6px 0;border-top:1px solid var(--border)"><small>${new Date(h.timestamp).toLocaleString()}</small><div>${h.gamemode.toUpperCase()} — <b style="color:${tierColor(h.tier)}">${h.tier}</b></div></div>`).join("")||"<small>Sin historial.</small>");
}

document.getElementById("search").addEventListener("input", loadBoard);
(async ()=>{ await loadModes(); await loadBoard(); await loadProfile(); setInterval(loadBoard, 15000); })();
