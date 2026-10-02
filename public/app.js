const ORDER = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
let modes = [];
let current = "overall";

async function loadModes() {
  modes = await (await fetch("/api/mode/list")).json();
  const nav = document.getElementById("modes");
  nav.innerHTML = "";
  const all = [{key:"overall",name:"Overall",icon:"🏆"}, ...modes];
  for (const m of all) {
    const b = document.createElement("button");
    b.textContent = `${m.icon||""} ${m.name}`;
    if (m.key===current) b.classList.add("active");
    b.onclick = ()=>{ current=m.key; loadModes(); loadBoard(); };
    nav.appendChild(b);
  }
}
async function loadBoard() {
  const board = document.getElementById("board");
  const q = document.getElementById("search").value.trim().toLowerCase();
  if (current==="overall") {
    let data = await (await fetch("/api/mode/overall")).json();
    if (q) data = data.filter(p=>p.name.toLowerCase().includes(q));
    board.innerHTML = `<div class="tier"><h3>🏆 Overall (${data.length})</h3>` +
      data.map((p,i)=>`<span class="pill" data-p="${p.name}">#${i+1} ${p.name}<small>${p.region} ${p.points}pts</small></span>`).join("") + `</div>`;
  } else {
    const data = await (await fetch(`/api/mode/${current}`)).json();
    board.innerHTML = ORDER.filter(t=>data[t]).map(t=>{
      let arr = data[t].filter(p=>!q||p.name.toLowerCase().includes(q));
      if (!arr.length) return "";
      return `<div class="tier"><h3>${t} (${arr.length})</h3>` +
        arr.map(p=>`<span class="pill" data-p="${p.name}">${p.name}<small>${p.region}</small></span>`).join("") + `</div>`;
    }).join("") || "<p>Sin testeos aún.</p>";
  }
  board.querySelectorAll(".pill").forEach(el=>el.onclick=()=>loadProfile(el.dataset.p));
}
async function loadProfile(name) {
  if (!name) { const p = new URLSearchParams(location.search).get("player"); if(!p) return; name=p; }
  const r = await fetch(`/api/profile/${encodeURIComponent(name)}`);
  const box = document.getElementById("profile");
  if (!r.ok) { box.innerHTML = `<h3>${name}</h3><p>Sin rank.</p>`; return; }
  const { player, current:cur, history } = await r.json();
  box.innerHTML = `<h3>👤 ${player.name} <small>${player.region}</small></h3>` +
    Object.entries(cur).map(([k,v])=>`<div><b>${k}:</b> ${v}</div>`).join("") +
    `<h4>Historial</h4>` + history.slice(0,10).map(h=>`<div>${new Date(h.timestamp).toLocaleString()} — ${h.gamemode} <b>${h.tier}</b></div>`).join("");
}
document.getElementById("search").oninput = loadBoard;
await loadModes(); await loadBoard(); await loadProfile();
setInterval(loadBoard, 15000); // auto-actualiza cuando el bot da un tier
