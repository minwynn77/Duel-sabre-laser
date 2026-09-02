const DEFAULTS = {
  blue: {head:2, torso:5, arm:3, leg:3, hand:1, exit:-2},
  red:  {head:2, torso:5, arm:3, leg:3, hand:1, exit:-2},
  blueName:"BLEU",
  redName:"ROUGE",
  duration:3,
  limitBlue:30,
  limitRed:30
};

let settings = loadSettings();
let counts = {blue:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0},
              red:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0}};
let scores = {blue:0, red:0};
let remainingMs = settings.duration * 60000;
let timerId = null;
let running = false;
let finishedPending = false;
let combatValidated = false;

const $ = id => document.getElementById(id);

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("duel-sabre-settings"));
    return saved ? {...DEFAULTS, ...saved, blue:{...DEFAULTS.blue,...saved.blue}, red:{...DEFAULTS.red,...saved.red}} : structuredClone(DEFAULTS);
  } catch { return structuredClone(DEFAULTS); }
}
function saveSettings() { localStorage.setItem("duel-sabre-settings", JSON.stringify(settings)); }

function formatTime(ms) {
  ms = Math.max(0, ms);
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function render() {
  $("timer").textContent = formatTime(remainingMs);
  $("blueScore").textContent = scores.blue;
  $("redScore").textContent = scores.red;
  $("blueName").textContent = settings.blueName;
  $("redName").textContent = settings.redName;
  $("blueLimit").textContent = settings.limitBlue;
  $("redLimit").textContent = settings.limitRed;
  $("blueExitValue").textContent = signed(settings.blue.exit);
  $("redExitValue").textContent = signed(settings.red.exit);
  $("pauseBtn").disabled = !running;
  $("startBtn").disabled = running || finishedPending;
  document.querySelectorAll(".zone, .exit-zone").forEach(el => el.style.pointerEvents = (finishedPending || combatValidated) ? "none" : "auto");
  renderCounts("blue"); renderCounts("red");
}
function signed(n) { return n > 0 ? `+${n}` : `${n}`; }
function renderCounts(color) {
  const labels = {head:"tête",torso:"torse",arm:"bras",leg:"jambes",hand:"mains",exit:"sorties"};
  const parts = Object.entries(counts[color]).filter(([,v])=>v).map(([k,v])=>`${labels[k]} ×${v}`);
  $(`${color}Counts`).textContent = parts.length ? parts.join(" · ") : "";
}
function showStatus(text) { $("status").textContent = text; }
function beep(kind) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    const now = ctx.currentTime;
    const patterns = {
      start:[[660,.12,0],[880,.16,.13]],
      pause:[[440,.18,0]],
      resume:[[660,.12,0],[990,.18,.13]],
      end:[[880,.18,0],[660,.18,.2],[440,.3,.4]],
      limit:[[990,.12,0],[990,.12,.16],[660,.25,.32]]
    };
    for (const [freq,dur,delay] of patterns[kind] || []) {
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.frequency.value=freq; o.type="sine";
      g.gain.setValueAtTime(.0001, now+delay);
      g.gain.exponentialRampToValueAtTime(.18, now+delay+.01);
      g.gain.exponentialRampToValueAtTime(.0001, now+delay+dur);
      o.connect(g).connect(ctx.destination); o.start(now+delay); o.stop(now+delay+dur+.02);
    }
  } catch {}
}
function startTimer() {
  if (finishedPending || combatValidated || running) return;
  if (remainingMs <= 0) remainingMs = settings.duration*60000;
  running = true; combatValidated=false;
  beep("start"); showStatus("Combat en cours");
  let last = performance.now();
  timerId = setInterval(() => {
    const now = performance.now();
    remainingMs -= now-last; last=now;
    if (remainingMs <= 0) {
      remainingMs=0; stopTimer();
      beep("end"); showFinish("Temps écoulé");
    }
    render();
  }, 50);
  render();
}
function pauseTimer() {
  if (!running) return;
  stopTimer(); beep("pause"); showStatus("Combat en pause"); render();
}
function resumeTimer() {
  if (finishedPending || combatValidated || running) return;
  running=true; beep("resume"); showStatus("Combat repris");
  let last=performance.now();
  timerId=setInterval(()=>{
    const now=performance.now(); remainingMs-=now-last; last=now;
    if(remainingMs<=0){remainingMs=0;stopTimer();beep("end");showFinish("Temps écoulé");}
    render();
  },50);
  render();
}
function stopTimer() { clearInterval(timerId); timerId=null; running=false; }
function resetCombat() {
  stopTimer(); counts={blue:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0},red:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0}};
  scores={blue:0,red:0}; remainingMs=settings.duration*60000; finishedPending=false; combatValidated=false;
  $("finishDialog").close(); showStatus("Prêt"); render();
}
function addHit(color, zone) {
  if (finishedPending || combatValidated) return;
  counts[color][zone]++;
  scores[color]+=settings[color][zone];
  render();
  if (scores[color] >= settings[color === "blue" ? "limitBlue" : "limitRed"]) {
    if (running) stopTimer();
    beep("limit"); showFinish(`${color==="blue"?"Bleu":"Rouge"} a atteint la limite`);
  }
}
function removeHit(color, zone) {
  if (finishedPending || combatValidated) return;
  if (counts[color][zone] <= 0) { toast("Aucune occurrence à retirer."); return; }
  counts[color][zone]--; scores[color]-=settings[color][zone];
  render();
}
function attachLongPress(el, onShort, onLong) {
  let timer=null, long=false;
  const cancel=()=>{if(timer){clearTimeout(timer);timer=null;}};
  el.addEventListener("pointerdown", e=>{
    if (e.button!==undefined && e.button!==0) return;
    long=false; timer=setTimeout(()=>{long=true; timer=null; onLong();}, 700);
  });
  el.addEventListener("pointerup", e=>{ if(timer){cancel(); if(!long) onShort();} });
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("contextmenu", e=>e.preventDefault());
}
document.querySelectorAll(".fighter").forEach(panel=>{
  const color=panel.id.startsWith("blue")?"blue":"red";
  panel.querySelectorAll(".zone").forEach(z=>{
    const zone=z.dataset.zone;
    attachLongPress(z,()=>addHit(color,zone),()=>removeHit(color,zone));
  });
  const exit=panel.querySelector(".exit-zone");
  attachLongPress(exit,()=>addHit(color,"exit"),()=>removeHit(color,"exit"));
});

function showFinish(reason) {
  finishedPending = true;
  stopTimer();

  $("finalBlue").textContent = scores.blue;
  $("finalRed").textContent = scores.red;

  $("winnerTitle").textContent = scores.blue > scores.red
    ? `🏆 Victoire de ${settings.blueName} !`
    : scores.red > scores.blue
      ? `🏆 Victoire de ${settings.redName} !`
      : "🤝 Égalité !";

  $("winnerMessage").textContent = scores.blue > scores.red
    ? `🔵 ${settings.blueName} remporte le combat !`
    : scores.red > scores.blue
      ? `🔴 ${settings.redName} remporte le combat !`
      : "Les deux combattants terminent à égalité.";

  showStatus(reason);
  render();

  if (!$("finishDialog").open) $("finishDialog").showModal();
}

  showStatus(reason);
  render();

  if (!$("finishDialog").open) $("finishDialog").showModal();
}

function openSettings() {
  if (running || finishedPending || combatValidated) { toast("Les paramètres sont verrouillés pendant ce combat."); return; }
  const f=$("settingsForm");
  for(const c of ["blue","red"]) for(const z of ["head","torso","arm","leg","hand","exit"]) f.elements[`${c}-${z}`].value=settings[c][z];
  f.elements.blueName.value=settings.blueName;
f.elements.redName.value=settings.redName;
  f.elements.duration.value=settings.duration;
f.elements.limitBlue.value=settings.limitBlue;
f.elements.limitRed.value=settings.limitRed;
  $("settingsDialog").showModal();
}
$("settingsBtn").onclick=openSettings;
$("settingsForm").addEventListener("submit",e=>{
  e.preventDefault();
  const f=e.currentTarget;
  for(const c of ["blue","red"]) for(const z of ["head","torso","arm","leg","hand","exit"]) settings[c][z]=Number(f.elements[`${c}-${z}`].value);
  settings.blueName = f.elements.blueName.value.trim() || "BLEU";
settings.redName = f.elements.redName.value.trim() || "ROUGE";
  settings.duration=Math.max(.1,Number(f.elements.duration.value)||3);
  settings.limitBlue=Number(f.elements.limitBlue.value)||30;
settings.limitRed=Number(f.elements.limitRed.value)||30;
  saveSettings(); remainingMs=settings.duration*60000; render(); $("settingsDialog").close(); toast("Paramètres enregistrés.");
});
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800);}

window.addEventListener("beforeunload",()=>stopTimer());
if ("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
render();
