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

let counts = {
  blue:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0},
  red:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0}
};

let scores = {blue:0, red:0};
let remainingMs = settings.duration * 60000;
let timerId = null;
let running = false;
let finishedPending = false;
let combatValidated = false;

let history = JSON.parse(localStorage.getItem("duel-sabre-history") || "[]");

/* =========================
   STATISTIQUES DES COMBATTANTS
   ========================= */

let fighterStats = JSON.parse(
  localStorage.getItem("duel-sabre-fighter-stats") || "{}"
);

let deletedStats = JSON.parse(
  localStorage.getItem("duel-sabre-deleted-stats") || "[]"
);

function saveFighterStats() {
  localStorage.setItem(
    "duel-sabre-fighter-stats",
    JSON.stringify(fighterStats)
  );
}

function saveDeletedStats() {
  localStorage.setItem(
    "duel-sabre-deleted-stats",
    JSON.stringify(deletedStats)
  );
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

/*
  Création/migration des statistiques à partir de l'historique existant.
  Cela permet de conserver les anciens combats déjà enregistrés.
*/
function initializeFighterStats() {
  let changed = false;

  history.slice().reverse().forEach(combat => {
    const players = [
      {
        name: combat.blueName,
        score: Number(combat.blueScore) || 0,
        winner: combat.winner === `🏆 ${combat.blueName}`,
        loser: combat.winner === `🏆 ${combat.redName}`,
        draw: combat.winner === "🤝 Égalité"
      },
      {
        name: combat.redName,
        score: Number(combat.redScore) || 0,
        winner: combat.winner === `🏆 ${combat.redName}`,
        loser: combat.winner === `🏆 ${combat.blueName}`,
        draw: combat.winner === "🤝 Égalité"
      }
    ];

    players.forEach(player => {
      const name = String(player.name || "").trim();
      const key = normalizeName(name);

      if (!name || deletedStats.includes(key)) return;

      if (!fighterStats[key]) {
        fighterStats[key] = {
          name: name,
          fights: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          points: 0
        };
        changed = true;
      }
    });
  });

  if (changed) saveFighterStats();
}

initializeFighterStats();

function registerFighterResult(name, score, result) {
  const cleanName = String(name || "").trim();
  const key = normalizeName(cleanName);

  if (!cleanName || deletedStats.includes(key)) {
    if (deletedStats.includes(key)) {
      deletedStats = deletedStats.filter(k => k !== key);
      saveDeletedStats();
    }
  }

  if (!fighterStats[key]) {
    fighterStats[key] = {
      name: cleanName,
      fights: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0
    };
  }

  fighterStats[key].name = cleanName;
  fighterStats[key].fights++;
  fighterStats[key].points += Number(score) || 0;

  if (result === "win") fighterStats[key].wins++;
  if (result === "loss") fighterStats[key].losses++;
  if (result === "draw") fighterStats[key].draws++;

  saveFighterStats();
}

function renderStats() {
  const list = $("statsList");

  const fighters = Object.values(fighterStats)
    .filter(fighter => !deletedStats.includes(normalizeName(fighter.name)))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.points !== a.points) return b.points - a.points;
      return a.name.localeCompare(b.name, "fr");
    });

  if (!fighters.length) {
    list.innerHTML = `
      <p class="hint">
        Aucun combattant enregistré dans les statistiques.
      </p>
    `;
  } else {
    list.innerHTML = fighters.map(fighter => `
      <div class="fighter-stat-card">
        <div class="fighter-stat-head">
          <h3>👤 ${escapeHtml(fighter.name)}</h3>
          <button
            class="delete-fighter-stats"
            data-name="${escapeHtml(fighter.name)}"
            aria-label="Supprimer les statistiques de ${escapeHtml(fighter.name)}"
          >
            🗑️
          </button>
        </div>

        <div class="fighter-stat-grid">
          <div>
            <span>⚔️ Combats</span>
            <strong>${fighter.fights}</strong>
          </div>

          <div>
            <span>🏆 Victoires</span>
            <strong>${fighter.wins}</strong>
          </div>

          <div>
            <span>❌ Défaites</span>
            <strong>${fighter.losses}</strong>
          </div>

          <div>
            <span>🤝 Égalités</span>
            <strong>${fighter.draws}</strong>
          </div>

          <div>
            <span>🎯 Points</span>
            <strong>${fighter.points}</strong>
          </div>
        </div>
      </div>
    `).join("");
  }

  $("statsTotalFights").textContent = history.length;

  document.querySelectorAll(".delete-fighter-stats").forEach(button => {
    button.onclick = () => {
      const name = button.dataset.name;
      const key = normalizeName(name);

      if (confirm(`Supprimer les statistiques de ${name} ?`)) {
        delete fighterStats[key];

        if (!deletedStats.includes(key)) {
          deletedStats.push(key);
        }

        saveFighterStats();
        saveDeletedStats();
        renderStats();

        toast(`Statistiques de ${name} supprimées.`);
      }
    };
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   PARAMÈTRES
   ========================= */

function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("duel-sabre-settings")
    );

    return saved
      ? {
          ...DEFAULTS,
          ...saved,
          blue:{...DEFAULTS.blue,...saved.blue},
          red:{...DEFAULTS.red,...saved.red}
        }
      : structuredClone(DEFAULTS);

  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveSettings() {
  localStorage.setItem(
    "duel-sabre-settings",
    JSON.stringify(settings)
  );
}

function saveHistory() {
  localStorage.setItem(
    "duel-sabre-history",
    JSON.stringify(history)
  );
}

/* =========================
   HISTORIQUE
   ========================= */

function renderHistory() {
  const list = $("historyList");

  if (!history.length) {
    list.innerHTML =
      "<p class=\"hint\">Aucun combat enregistré.</p>";
    return;
  }

  list.innerHTML = history.map((combat, index) => `
    <div class="history-item">
      <div>
        <strong>Combat ${history.length - index}</strong>
        <small>${combat.date}</small>
      </div>

      <div class="history-score">
        <span>🔵 ${escapeHtml(combat.blueName)} :
          <strong>${combat.blueScore}</strong>
        </span>

        <span>🔴 ${escapeHtml(combat.redName)} :
          <strong>${combat.redScore}</strong>
        </span>
      </div>

      <div class="history-winner">
        ${escapeHtml(combat.winner)}
      </div>

      <button
        class="delete-history"
        data-index="${index}"
        aria-label="Supprimer ce combat"
      >
        🗑️
      </button>
    </div>
  `).join("");

  document.querySelectorAll(".delete-history").forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset.index);

      if (confirm("Supprimer ce combat de l'historique ?")) {
        history.splice(index, 1);
        saveHistory();
        renderHistory();
      }
    };
  });
}

/* =========================
   AFFICHAGE
   ========================= */

const $ = id => document.getElementById(id);

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

  $("blueExitValue").textContent =
    signed(settings.blue.exit);

  $("redExitValue").textContent =
    signed(settings.red.exit);

  $("pauseBtn").disabled = !running;
  $("startBtn").disabled = running || finishedPending;

  document.querySelectorAll(".zone, .exit-zone")
    .forEach(el => {
      el.style.pointerEvents =
        (finishedPending || combatValidated)
          ? "none"
          : "auto";
    });

  renderCounts("blue");
  renderCounts("red");
}

function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function renderCounts(color) {
  const labels = {
    head:"tête",
    torso:"torse",
    arm:"bras",
    leg:"jambes",
    hand:"mains",
    exit:"sorties"
  };

  const parts = Object.entries(counts[color])
    .filter(([,v]) => v)
    .map(([k,v]) => `${labels[k]} ×${v}`);

  $(`${color}Counts`).textContent =
    parts.length ? parts.join(" · ") : "";
}

function showStatus(text) {
  $("status").textContent = text;
}

function toast(msg) {
  const t = $("toast");

  t.textContent = msg;
  t.classList.add("show");

  setTimeout(() => {
    t.classList.remove("show");
  }, 1800);
}

/* =========================
   SON
   ========================= */

function beep(kind) {
  try {
    const C =
      window.AudioContext ||
      window.webkitAudioContext;

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

    for (const [freq,dur,delay]
      of patterns[kind] || []) {

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.frequency.value = freq;
      o.type = "sine";

      g.gain.setValueAtTime(
        .0001,
        now + delay
      );

      g.gain.exponentialRampToValueAtTime(
        .18,
        now + delay + .01
      );

      g.gain.exponentialRampToValueAtTime(
        .0001,
        now + delay + dur
      );

      o.connect(g).connect(ctx.destination);

      o.start(now + delay);
      o.stop(now + delay + dur + .02);
    }

  } catch {}
}

/* =========================
   CHRONOMÈTRE
   ========================= */

function startTimer() {
  if (finishedPending ||
      combatValidated ||
      running) return;

  if (remainingMs <= 0) {
    remainingMs = settings.duration * 60000;
  }

  running = true;
  combatValidated = false;

  beep("start");
  showStatus("Combat en cours");

  let last = performance.now();

  timerId = setInterval(() => {
    const now = performance.now();

    remainingMs -= now - last;
    last = now;

    if (remainingMs <= 0) {
      remainingMs = 0;
      stopTimer();

      beep("end");
      showFinish("Temps écoulé");
    }

    render();

  }, 50);

  render();
}

function pauseTimer() {
  if (!running) return;

  stopTimer();

  beep("pause");
  showStatus("Combat en pause");

  render();
}

function resumeTimer() {
  if (finishedPending ||
      combatValidated ||
      running) return;

  running = true;

  beep("resume");
  showStatus("Combat repris");

  let last = performance.now();

  timerId = setInterval(() => {
    const now = performance.now();

    remainingMs -= now - last;
    last = now;

    if (remainingMs <= 0) {
      remainingMs = 0;

      stopTimer();

      beep("end");
      showFinish("Temps écoulé");
    }

    render();

  }, 50);

  render();
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  running = false;
}

/* =========================
   COMBAT
   ========================= */

function resetCombat() {
  stopTimer();

  counts = {
    blue:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0},
    red:{head:0,torso:0,arm:0,leg:0,hand:0,exit:0}
  };

  scores = {
    blue:0,
    red:0
  };

  remainingMs =
    settings.duration * 60000;

  finishedPending = false;
  combatValidated = false;

  $("finishDialog").close();

  showStatus("Prêt");
  render();
}

function addHit(color, zone) {
  if (finishedPending ||
      combatValidated) return;

  counts[color][zone]++;

  scores[color] += settings[color][zone];

  render();

  const limit =
    color === "blue"
      ? settings.limitBlue
      : settings.limitRed;

  if (scores[color] >= limit) {
    if (running) stopTimer();

    beep("limit");

    showFinish(
      `${color === "blue" ? "Bleu" : "Rouge"} a atteint la limite`
    );
  }
}

function removeHit(color, zone) {
  if (finishedPending ||
      combatValidated) return;

  if (counts[color][zone] <= 0) {
    toast("Aucune occurrence à retirer.");
    return;
  }

  counts[color][zone]--;

  scores[color] -= settings[color][zone];

  render();
}

/* =========================
   TOUCHES LONGUES
   ========================= */

function attachLongPress(el, onShort, onLong) {
  let timer = null;
  let long = false;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  el.addEventListener("pointerdown", e => {
    if (e.button !== undefined && e.button !== 0)
      return;

    long = false;

    timer = setTimeout(() => {
      long = true;
      timer = null;
      onLong();
    }, 700);
  });

  el.addEventListener("pointerup", () => {
    if (timer) {
      cancel();

      if (!long) onShort();
    }
  });

  el.addEventListener(
    "pointercancel",
    cancel
  );

  el.addEventListener(
    "pointerleave",
    cancel
  );

  el.addEventListener(
    "contextmenu",
    e => e.preventDefault()
  );
}

document.querySelectorAll(".fighter")
  .forEach(panel => {

    const color =
      panel.id.startsWith("blue")
        ? "blue"
        : "red";

    panel.querySelectorAll(".zone")
      .forEach(z => {

        const zone = z.dataset.zone;

        attachLongPress(
          z,
          () => addHit(color, zone),
          () => removeHit(color, zone)
        );
      });

    const exit =
      panel.querySelector(".exit-zone");

    attachLongPress(
      exit,
      () => addHit(color, "exit"),
      () => removeHit(color, "exit")
    );
  });

/* =========================
   FIN DU COMBAT
   ========================= */

function showFinish(reason) {
  finishedPending = true;

  stopTimer();

  $("finalBlue").textContent =
    scores.blue;

  $("finalRed").textContent =
    scores.red;

  $("winnerTitle").textContent =
    scores.blue > scores.red
      ? `🏆 Victoire de ${settings.blueName} !`
      : scores.red > scores.blue
        ? `🏆 Victoire de ${settings.redName} !`
        : "🤝 Égalité !";

  $("winnerMessage").textContent =
    scores.blue > scores.red
      ? `🔵 ${settings.blueName} remporte le combat !`
      : scores.red > scores.blue
        ? `🔴 ${settings.redName} remporte le combat !`
        : "Les deux combattants terminent à égalité.";

  showStatus(reason);

  render();

  if (!$("finishDialog").open) {
    $("finishDialog").showModal();
  }
}

/* =========================
   PARAMÈTRES
   ========================= */

function openSettings() {
  if (running ||
      finishedPending ||
      combatValidated) {

    toast(
      "Les paramètres sont verrouillés pendant ce combat."
    );

    return;
  }

  const f = $("settingsForm");

  for (const c of ["blue","red"]) {
    for (const z of [
      "head",
      "torso",
      "arm",
      "leg",
      "hand",
      "exit"
    ]) {
      f.elements[`${c}-${z}`].value =
        settings[c][z];
    }
  }

  f.elements.blueName.value =
    settings.blueName;

  f.elements.redName.value =
    settings.redName;

  f.elements.duration.value =
    settings.duration;

  f.elements.limitBlue.value =
    settings.limitBlue;

  f.elements.limitRed.value =
    settings.limitRed;

  $("settingsDialog").showModal();
}

$("settingsBtn").onclick =
  openSettings;

$("settingsForm").addEventListener(
  "submit",
  e => {

    e.preventDefault();

    const f = e.currentTarget;

    for (const c of ["blue","red"]) {
      for (const z of [
        "head",
        "torso",
        "arm",
        "leg",
        "hand",
        "exit"
      ]) {
        settings[c][z] =
          Number(
            f.elements[`${c}-${z}`].value
          );
      }
    }

    settings.blueName =
      f.elements.blueName.value.trim() ||
      "BLEU";

    settings.redName =
      f.elements.redName.value.trim() ||
      "ROUGE";

    settings.duration =
      Math.max(
        .1,
        Number(f.elements.duration.value) || 3
      );

    settings.limitBlue =
      Number(f.elements.limitBlue.value) || 30;

    settings.limitRed =
      Number(f.elements.limitRed.value) || 30;

    saveSettings();

    remainingMs =
      settings.duration * 60000;

    render();

    $("settingsDialog").close();

    toast("Paramètres enregistrés.");
  }
);

/* =========================
   BOUTONS
   ========================= */

$("startBtn").onclick =
  startTimer;

$("pauseBtn").onclick =
  pauseTimer;

$("resetBtn").onclick =
  resetCombat;

/* Historique */

$("historyBtn").addEventListener(
  "click",
  () => {
    renderHistory();
    $("historyDialog").showModal();
  }
);

/* Statistiques */

$("statsBtn").addEventListener(
  "click",
  () => {
    renderStats();
    $("statsDialog").showModal();
  }
);

$("closeStatsBtn").addEventListener(
  "click",
  () => {
    $("statsDialog").close();
  }
);

$("closeHistoryBtn").addEventListener(
  "click",
  () => {
    $("historyDialog").close();
  }
);

$("clearHistoryBtn").addEventListener(
  "click",
  () => {

    if (!history.length) {
      toast("L'historique est déjà vide.");
      return;
    }

    if (
      confirm(
        "Supprimer tout l'historique des combats ?"
      )
    ) {
      history = [];

      saveHistory();

      renderHistory();

      toast("Historique supprimé.");
    }
  }
);

/* Correction du score */

$("correctBtn").onclick = () => {

  finishedPending = false;

  $("finishDialog").close();

  showStatus("Score à corriger");

  render();
};

/* Validation du combat */

$("validateBtn").onclick = () => {

  let winner;

  if (scores.blue > scores.red) {
    winner = `🏆 ${settings.blueName}`;
  } else if (scores.red > scores.blue) {
    winner = `🏆 ${settings.redName}`;
  } else {
    winner = "🤝 Égalité";
  }

  /* Enregistrement dans l'historique */

  history.unshift({
    date: new Date().toLocaleString("fr-FR"),

    blueName: settings.blueName,
    redName: settings.redName,

    blueScore: scores.blue,
    redScore: scores.red,

    winner: winner
  });

  saveHistory();

  /* Enregistrement des statistiques */

  if (scores.blue > scores.red) {

    registerFighterResult(
      settings.blueName,
      scores.blue,
      "win"
    );

    registerFighterResult(
      settings.redName,
      scores.red,
      "loss"
    );

  } else if (scores.red > scores.blue) {

    registerFighterResult(
      settings.blueName,
      scores.blue,
      "loss"
    );

    registerFighterResult(
      settings.redName,
      scores.red,
      "win"
    );

  } else {

    registerFighterResult(
      settings.blueName,
      scores.blue,
      "draw"
    );

    registerFighterResult(
      settings.redName,
      scores.red,
      "draw"
    );
  }

  finishedPending = false;
  combatValidated = true;

  $("finishDialog").close();

  showStatus(
    "Combat terminé et score validé"
  );

  render();
};

/* =========================
   INITIALISATION
   ========================= */

window.addEventListener(
  "beforeunload",
  () => stopTimer()
);

if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () =>
      navigator.serviceWorker
        .register("sw.js")
        .catch(() => {})
  );
}

render();
