const DEFAULTS = {
  blue: {
    head: 2,
    torso: 5,
    arm: 3,
    leg: 3,
    hand: 1,
    exit: -2
  },

  red: {
    head: 2,
    torso: 5,
    arm: 3,
    leg: 3,
    hand: 1,
    exit: -2
  },

  blueName: "BLEU",
  redName: "ROUGE",

  duration: 3,

  limitBlue: 30,
  limitRed: 30
};


/* =========================
   OUTILS
   ========================= */

const $ = id => document.getElementById(id);


function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}


function signed(number) {
  return number > 0 ? `+${number}` : `${number}`;
}


/* =========================
   PARAMÈTRES
   ========================= */

function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("duel-sabre-settings")
    );

    if (!saved) {
      return structuredClone(DEFAULTS);
    }

    return {
      ...DEFAULTS,
      ...saved,

      blue: {
        ...DEFAULTS.blue,
        ...(saved.blue || {})
      },

      red: {
        ...DEFAULTS.red,
        ...(saved.red || {})
      }
    };
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


let settings = loadSettings();


/* =========================
   ÉTAT DU COMBAT
   ========================= */

let counts = {
  blue: {
    head: 0,
    torso: 0,
    arm: 0,
    leg: 0,
    hand: 0,
    exit: 0
  },

  red: {
    head: 0,
    torso: 0,
    arm: 0,
    leg: 0,
    hand: 0,
    exit: 0
  }
};


let scores = {
  blue: 0,
  red: 0
};


let remainingMs =
  Number(settings.duration) * 60000;

let timerId = null;
let running = false;
let finishedPending = false;
let combatValidated = false;


/* =========================
   HISTORIQUE
   ========================= */

let history = [];

try {
  history = JSON.parse(
    localStorage.getItem("duel-sabre-history") || "[]"
  );

  if (!Array.isArray(history)) {
    history = [];
  }
} catch {
  history = [];
}


function saveHistory() {
  localStorage.setItem(
    "duel-sabre-history",
    JSON.stringify(history)
  );
}


/* =========================
   STATISTIQUES
   ========================= */

let fighterStats = {};

try {
  fighterStats = JSON.parse(
    localStorage.getItem(
      "duel-sabre-fighter-stats"
    ) || "{}"
  );

  if (
    !fighterStats ||
    typeof fighterStats !== "object" ||
    Array.isArray(fighterStats)
  ) {
    fighterStats = {};
  }
} catch {
  fighterStats = {};
}


let deletedStats = [];

try {
  deletedStats = JSON.parse(
    localStorage.getItem(
      "duel-sabre-deleted-stats"
    ) || "[]"
  );

  if (!Array.isArray(deletedStats)) {
    deletedStats = [];
  }
} catch {
  deletedStats = [];
}


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


function createFighterStats(name) {
  return {
    name: String(name || "").trim(),
    fights: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0
  };
}


/* =========================
   INITIALISATION DES STATS
   ========================= */

function initializeFighterStats() {
  let changed = false;

  history.forEach(combat => {
    const names = [
      combat.blueName,
      combat.redName
    ];

    names.forEach(name => {
      const cleanName =
        String(name || "").trim();

      const key =
        normalizeName(cleanName);

      if (!cleanName || deletedStats.includes(key)) {
        return;
      }

      if (!fighterStats[key]) {
        fighterStats[key] =
          createFighterStats(cleanName);

        changed = true;
      }
    });
  });

  if (changed) {
    saveFighterStats();
  }
}


initializeFighterStats();


/* =========================
   ENREGISTRER UN RÉSULTAT
   ========================= */

function registerFighterResult(
  name,
  score,
  result
) {
  const cleanName =
    String(name || "").trim();

  if (!cleanName) {
    return;
  }

  const key =
    normalizeName(cleanName);

  if (deletedStats.includes(key)) {
    deletedStats =
      deletedStats.filter(k => k !== key);

    saveDeletedStats();
  }

  if (!fighterStats[key]) {
    fighterStats[key] =
      createFighterStats(cleanName);
  }

  fighterStats[key].name =
    cleanName;

  fighterStats[key].fights++;

  fighterStats[key].points +=
    Number(score) || 0;

  if (result === "win") {
    fighterStats[key].wins++;
  }

  if (result === "loss") {
    fighterStats[key].losses++;
  }

  if (result === "draw") {
    fighterStats[key].draws++;
  }

  saveFighterStats();
}


/* =========================
   AFFICHAGE DES STATS
   ========================= */

function renderStats() {
  const list = $("statsList");

  if (!list) {
    return;
  }

  const fighters =
    Object.values(fighterStats)
      .filter(fighter =>
        !deletedStats.includes(
          normalizeName(fighter.name)
        )
      )
      .sort((a, b) => {
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }

        if (b.points !== a.points) {
          return b.points - a.points;
        }

        return a.name.localeCompare(
          b.name,
          "fr"
        );
      });

  if (!fighters.length) {
    list.innerHTML = `
      <p class="hint">
        Aucun combattant enregistré dans les statistiques.
      </p>
    `;
  } else {
    list.innerHTML =
      fighters.map(fighter => `
        <div class="fighter-stat-card">

          <div class="fighter-stat-head">

            <h3>
              👤 ${escapeHtml(fighter.name)}
            </h3>

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

  const totalFights =
    $("statsTotalFights");

if (totalFights) {
    totalFights.textContent =
      Object.values(fighterStats)
        .reduce((total, fighter) => total + fighter.fights, 0);
}

  document
    .querySelectorAll(".delete-fighter-stats")
    .forEach(button => {

      button.onclick = () => {

        const name =
          button.dataset.name;

        const key =
          normalizeName(name);

        if (
          confirm(
            `Supprimer les statistiques de ${name} ?`
          )
        ) {

          delete fighterStats[key];

          if (!deletedStats.includes(key)) {
            deletedStats.push(key);
          }

          saveFighterStats();
          saveDeletedStats();

          renderStats();

          toast(
            `Statistiques de ${name} supprimées.`
          );
        }
      };
    });
}


/* =========================
   AFFICHAGE
   ========================= */

function formatTime(ms) {
  ms = Math.max(0, ms);

  const total =
    Math.ceil(ms / 1000);

  const minutes =
    Math.floor(total / 60);

  const seconds =
    total % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


function render() {

  if ($("timer")) {
    $("timer").textContent =
      formatTime(remainingMs);
  }

  if ($("blueScore")) {
    $("blueScore").textContent =
      scores.blue;
  }

  if ($("redScore")) {
    $("redScore").textContent =
      scores.red;
  }

  if ($("blueName")) {
    $("blueName").textContent =
      settings.blueName;
  }

  if ($("redName")) {
    $("redName").textContent =
      settings.redName;
  }

  if ($("blueLimit")) {
    $("blueLimit").textContent =
      settings.limitBlue;
  }

  if ($("redLimit")) {
    $("redLimit").textContent =
      settings.limitRed;
  }

  if ($("blueExitValue")) {
    $("blueExitValue").textContent =
      signed(settings.blue.exit);
  }

  if ($("redExitValue")) {
    $("redExitValue").textContent =
      signed(settings.red.exit);
  }

  if ($("pauseBtn")) {
    $("pauseBtn").disabled =
      !running;
  }

  if ($("startBtn")) {
    $("startBtn").disabled =
      running || finishedPending;
  }

  document
    .querySelectorAll(".zone, .exit-zone")
    .forEach(element => {

      element.style.pointerEvents =
        (
          finishedPending ||
          combatValidated
        )
          ? "none"
          : "auto";
    });

  renderCounts("blue");
  renderCounts("red");
}


function renderCounts(color) {

  const labels = {
    head: "tête",
    torso: "torse",
    arm: "bras",
    leg: "jambes",
    hand: "mains",
    exit: "sorties"
  };

  const parts =
    Object.entries(counts[color])
      .filter(([, value]) => value)
      .map(
        ([key, value]) =>
          `${labels[key]} ×${value}`
      );

  const element =
    $(`${color}Counts`);

  if (element) {
    element.textContent =
      parts.length
        ? parts.join(" · ")
        : "";
  }
}


function showStatus(text) {
  const element = $("status");

  if (element) {
    element.textContent = text;
  }
}


function toast(message) {

  const element = $("toast");

  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 1800);
}


/* =========================
   SON
   ========================= */

function beep(kind) {

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    const context =
      new AudioContext();

    const now =
      context.currentTime;

    const patterns = {

      start: [
        [660, 0.12, 0],
        [880, 0.16, 0.13]
      ],

      pause: [
        [440, 0.18, 0]
      ],

      resume: [
        [660, 0.12, 0],
        [990, 0.18, 0.13]
      ],

      end: [
        [880, 0.18, 0],
        [660, 0.18, 0.2],
        [440, 0.3, 0.4]
      ],

      limit: [
        [990, 0.12, 0],
        [990, 0.12, 0.16],
        [660, 0.25, 0.32]
      ]
    };

    for (
      const [frequency, duration, delay]
      of patterns[kind] || []
    ) {

      const oscillator =
        context.createOscillator();

      const gain =
        context.createGain();

      oscillator.frequency.value =
        frequency;

      oscillator.type =
        "sine";

      gain.gain.setValueAtTime(
        0.0001,
        now + delay
      );

      gain.gain.exponentialRampToValueAtTime(
        0.18,
        now + delay + 0.01
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + delay + duration
      );

      oscillator
        .connect(gain)
        .connect(context.destination);

      oscillator.start(
        now + delay
      );

      oscillator.stop(
        now + delay + duration + 0.02
      );
    }

  } catch {}
}


/* =========================
   CHRONOMÈTRE
   ========================= */

function startTimer() {

  if (
    finishedPending ||
    combatValidated ||
    running
  ) {
    return;
  }

  if (remainingMs <= 0) {
    remainingMs =
      Number(settings.duration) * 60000;
  }

  running = true;
  combatValidated = false;

  beep("start");

  showStatus("Combat en cours");

  let last =
    performance.now();

  timerId =
    setInterval(() => {

      const now =
        performance.now();

      remainingMs -=
        now - last;

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

  if (!running) {
    return;
  }

  stopTimer();

  beep("pause");

  showStatus("Combat en pause");

  render();
}


function resumeTimer() {

  if (
    finishedPending ||
    combatValidated ||
    running
  ) {
    return;
  }

  running = true;

  beep("resume");

  showStatus("Combat repris");

  let last =
    performance.now();

  timerId =
    setInterval(() => {

      const now =
        performance.now();

      remainingMs -=
        now - last;

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

  if (timerId !== null) {
    clearInterval(timerId);
  }

  timerId = null;
  running = false;
}


/* =========================
   COMBAT
   ========================= */

function resetCombat() {

  stopTimer();

  counts = {
    blue: {
      head: 0,
      torso: 0,
      arm: 0,
      leg: 0,
      hand: 0,
      exit: 0
    },

    red: {
      head: 0,
      torso: 0,
      arm: 0,
      leg: 0,
      hand: 0,
      exit: 0
    }
  };

  scores = {
    blue: 0,
    red: 0
  };

  remainingMs =
    Number(settings.duration) * 60000;

  finishedPending = false;
  combatValidated = false;

  const dialog =
    $("finishDialog");

  if (dialog && dialog.open) {
    dialog.close();
  }

  showStatus("Prêt");

  render();
}


function addHit(color, zone) {

  if (
    finishedPending ||
    combatValidated
  ) {
    return;
  }

  counts[color][zone]++;

  scores[color] +=
    Number(settings[color][zone]) || 0;

  render();

  const limit =
    color === "blue"
      ? Number(settings.limitBlue)
      : Number(settings.limitRed);

  if (scores[color] >= limit) {

  if (firstToLimit === null) {
    firstToLimit = color;
  }

  if (running) {
    stopTimer();
  }

  beep("limit");

  showFinish(
    `${color === "blue" ? settings.blueName : settings.redName} a atteint la limite`
  );
}
}


function removeHit(color, zone) {

  if (
    finishedPending ||
    combatValidated
  ) {
    return;
  }

  if (counts[color][zone] <= 0) {

    toast(
      "Aucune occurrence à retirer."
    );

    return;
  }

  counts[color][zone]--;

  scores[color] -=
    Number(settings[color][zone]) || 0;

  render();
}


/* =========================
   TOUCHES LONGUES
   ========================= */

function attachLongPress(
  element,
  onShort,
  onLong
) {

  let timer = null;
  let long = false;

  const cancel = () => {

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };


  element.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();

      long = false;

      timer =
        setTimeout(() => {

          long = true;

          onLong();

          timer = null;

        }, 600);
    }
  );


  element.addEventListener(
    "pointerup",
    event => {

      event.preventDefault();

      if (timer) {

        clearTimeout(timer);
        timer = null;

        if (!long) {
          onShort();
        }
      }
    }
  );


  element.addEventListener(
    "pointerleave",
    cancel
  );


  element.addEventListener(
    "pointercancel",
    cancel
  );
}


/* =========================
   FIN DU COMBAT
   ========================= */

function getWinner() {

  if (scores.blue > scores.red) {
    return "blue";
  }

  if (scores.red > scores.blue) {
    return "red";
  }

  return "draw";
}


function showFinish(message) {

  finishedPending = true;

  stopTimer();

  const winner =
    getWinner();

  if ($("winnerTitle")) {
    $("winnerTitle").textContent =
      "🏁 Fin du combat";
  }

  if ($("winnerMessage")) {

    if (winner === "blue") {
      $("winnerMessage").textContent =
        `${settings.blueName} gagne ! ${message}`;
    } else if (winner === "red") {
      $("winnerMessage").textContent =
        `${settings.redName} gagne ! ${message}`;
    } else {
      $("winnerMessage").textContent =
        `Égalité ! ${message}`;
    }
  }

  if ($("finalBlue")) {
    $("finalBlue").textContent =
      scores.blue;
  }

  if ($("finalRed")) {
    $("finalRed").textContent =
      scores.red;
  }

  const dialog =
    $("finishDialog");

  if (dialog && !dialog.open) {
    dialog.showModal();
  }

  render();
}


/* =========================
   VALIDATION DU COMBAT
   ========================= */

function validateCombat() {

  if (combatValidated) {
    return;
  }

  const winner =
    getWinner();

  const blueName =
    settings.blueName;

  const redName =
    settings.redName;

  let winnerText = "";

  if (winner === "blue") {
    winnerText =
      `🏆 ${blueName}`;
  } else if (winner === "red") {
    winnerText =
      `🏆 ${redName}`;
  } else {
    winnerText =
      "🤝 Égalité";
  }


  history.unshift({

    date: new Date().toLocaleString(
      "fr-FR"
    ),

    blueName: blueName,

    redName: redName,

    blueScore: scores.blue,

    redScore: scores.red,

    winner: winnerText

  });


  saveHistory();


  if (winner === "blue") {

    registerFighterResult(
      blueName,
      scores.blue,
      "win"
    );

    registerFighterResult(
      redName,
      scores.red,
      "loss"
    );

  } else if (winner === "red") {

    registerFighterResult(
      blueName,
      scores.blue,
      "loss"
    );

    registerFighterResult(
      redName,
      scores.red,
      "win"
    );

  } else {

    registerFighterResult(
      blueName,
      scores.blue,
      "draw"
    );

    registerFighterResult(
      redName,
      scores.red,
      "draw"
    );
  }


  combatValidated = true;
  finishedPending = false;

  const dialog =
    $("finishDialog");

  if (dialog && dialog.open) {
    dialog.close();
  }

  showStatus("Combat terminé");

  render();

  toast("Combat enregistré.");
}


/* =========================
   HISTORIQUE
   ========================= */

function renderHistory() {

  const list =
    $("historyList");

  if (!list) {
    return;
  }

  if (!history.length) {

    list.innerHTML = `
      <p class="hint">
        Aucun combat enregistré.
      </p>
    `;

    return;
  }

  list.innerHTML =
    history.map(combat => `

      <div class="history-item">

        <div class="history-date">
          ${escapeHtml(combat.date || "")}
        </div>

        <div class="history-fighters">
          <span>
            🔵 ${escapeHtml(combat.blueName || "BLEU")}
          </span>

          <strong>
            ${Number(combat.blueScore) || 0}
            -
            ${Number(combat.redScore) || 0}
          </strong>

          <span>
            🔴 ${escapeHtml(combat.redName || "ROUGE")}
          </span>
        </div>

        <div class="history-winner">
          ${escapeHtml(combat.winner || "")}
        </div>

      </div>

    `).join("");
}


/* =========================
   PARAMÈTRES
   ========================= */

function openSettings() {

  const form =
    $("settingsForm");

  if (!form) {
    return;
  }

  form.elements["blue-head"].value =
    settings.blue.head;

  form.elements["blue-torso"].value =
    settings.blue.torso;

  form.elements["blue-arm"].value =
    settings.blue.arm;

  form.elements["blue-leg"].value =
    settings.blue.leg;

  form.elements["blue-hand"].value =
    settings.blue.hand;

  form.elements["blue-exit"].value =
    settings.blue.exit;

  form.elements["red-head"].value =
    settings.red.head;

  form.elements["red-torso"].value =
    settings.red.torso;

  form.elements["red-arm"].value =
    settings.red.arm;

  form.elements["red-leg"].value =
    settings.red.leg;

  form.elements["red-hand"].value =
    settings.red.hand;

  form.elements["red-exit"].value =
    settings.red.exit;

  form.elements["blueName"].value =
    settings.blueName;

  form.elements["redName"].value =
    settings.redName;

  form.elements["duration"].value =
    settings.duration;

  form.elements["limitBlue"].value =
    settings.limitBlue;

  form.elements["limitRed"].value =
    settings.limitRed;

  const dialog =
    $("settingsDialog");

  if (dialog && !dialog.open) {
    dialog.showModal();
  }
}


function saveSettingsFromForm(event) {

  event.preventDefault();

  if (running) {

    toast(
      "Impossible de modifier les paramètres pendant le combat."
    );

    return;
  }

  const form =
    $("settingsForm");

  if (!form) {
    return;
  }


  const numberValue =
    (name, fallback) => {

      const value =
        Number(form.elements[name].value);

      return Number.isFinite(value)
        ? value
        : fallback;
    };


  settings.blue.head =
    numberValue(
      "blue-head",
      DEFAULTS.blue.head
    );

  settings.blue.torso =
    numberValue(
      "blue-torso",
      DEFAULTS.blue.torso
    );

  settings.blue.arm =
    numberValue(
      "blue-arm",
      DEFAULTS.blue.arm
    );

  settings.blue.leg =
    numberValue(
      "blue-leg",
      DEFAULTS.blue.leg
    );

  settings.blue.hand =
    numberValue(
      "blue-hand",
      DEFAULTS.blue.hand
    );

  settings.blue.exit =
    numberValue(
      "blue-exit",
      DEFAULTS.blue.exit
    );


  settings.red.head =
    numberValue(
      "red-head",
      DEFAULTS.red.head
    );

  settings.red.torso =
    numberValue(
      "red-torso",
      DEFAULTS.red.torso
    );

  settings.red.arm =
    numberValue(
      "red-arm",
      DEFAULTS.red.arm
    );

  settings.red.leg =
    numberValue(
      "red-leg",
      DEFAULTS.red.leg
    );

  settings.red.hand =
    numberValue(
      "red-hand",
      DEFAULTS.red.hand
    );

  settings.red.exit =
    numberValue(
      "red-exit",
      DEFAULTS.red.exit
    );


  const blueName =
    String(
      form.elements["blueName"].value
    ).trim();

  const redName =
    String(
      form.elements["redName"].value
    ).trim();


  settings.blueName =
    blueName || "BLEU";

  settings.redName =
    redName || "ROUGE";


  settings.duration =
    Math.max(
      0.1,
      numberValue(
        "duration",
        DEFAULTS.duration
      )
    );


  settings.limitBlue =
    Math.max(
      1,
      numberValue(
        "limitBlue",
        DEFAULTS.limitBlue
      )
    );


  settings.limitRed =
    Math.max(
      1,
      numberValue(
        "limitRed",
        DEFAULTS.limitRed
      )
    );


  saveSettings();


  remainingMs =
    Number(settings.duration) * 60000;


  resetCombat();

  toast("Paramètres enregistrés.");
}


/* =========================
   ÉVÉNEMENTS
   ========================= */

function setupEvents() {

  /* Zones Bleu */

  document
    .querySelectorAll("#bluePanel .zone")
    .forEach(element => {

      const zone =
        element.dataset.zone;

      attachLongPress(
        element,
        () => addHit("blue", zone),
        () => removeHit("blue", zone)
      );
    });


  /* Zones Rouge */

  document
    .querySelectorAll("#redPanel .zone")
    .forEach(element => {

      const zone =
        element.dataset.zone;

      attachLongPress(
        element,
        () => addHit("red", zone),
        () => removeHit("red", zone)
      );
    });


  /* Sortie de zone Bleu */

  const blueExit =
    document.querySelector(
      "#bluePanel .exit-zone"
    );

  if (blueExit) {

    attachLongPress(
      blueExit,
      () => addHit("blue", "exit"),
      () => removeHit("blue", "exit")
    );
  }


  /* Sortie de zone Rouge */

  const redExit =
    document.querySelector(
      "#redPanel .exit-zone"
    );

  if (redExit) {

    attachLongPress(
      redExit,
      () => addHit("red", "exit"),
      () => removeHit("red", "exit")
    );
  }


  /* Chronomètre */

  if ($("startBtn")) {
    $("startBtn").addEventListener(
      "click",
      startTimer
    );
  }


  if ($("pauseBtn")) {
    $("pauseBtn").addEventListener(
      "click",
      pauseTimer
    );
  }


  if ($("resetBtn")) {
    $("resetBtn").addEventListener(
      "click",
      resetCombat
    );
  }


  /* Paramètres */

  if ($("settingsBtn")) {
    $("settingsBtn").addEventListener(
      "click",
      openSettings
    );
  }


  if ($("settingsForm")) {
    $("settingsForm").addEventListener(
      "submit",
      saveSettingsFromForm
    );
  }


  /* Fin du combat */

  if ($("correctBtn")) {

    $("correctBtn").addEventListener(
      "click",
      () => {

        finishedPending = false;

        const dialog =
          $("finishDialog");

        if (dialog && dialog.open) {
          dialog.close();
        }

        render();
      }
    );
  }


  if ($("validateBtn")) {

    $("validateBtn").addEventListener(
      "click",
      validateCombat
    );
  }


  /* Historique */

  if ($("historyBtn")) {

    $("historyBtn").addEventListener(
      "click",
      () => {

        renderHistory();

        const dialog =
          $("historyDialog");

        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      }
    );
  }


  if ($("closeHistoryBtn")) {

    $("closeHistoryBtn").addEventListener(
      "click",
      () => {

        const dialog =
          $("historyDialog");

        if (dialog && dialog.open) {
          dialog.close();
        }
      }
    );
  }


  if ($("clearHistoryBtn")) {

    $("clearHistoryBtn").addEventListener(
      "click",
      () => {

        if (!history.length) {

          toast(
            "L'historique est déjà vide."
          );

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

          toast(
            "Historique supprimé."
          );
        }
      }
    );
  }


  /* Statistiques */

  if ($("statsBtn")) {

    $("statsBtn").addEventListener(
      "click",
      () => {

        renderStats();

        const dialog =
          $("statsDialog");

        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      }
    );
  }


  if ($("closeStatsBtn")) {

    $("closeStatsBtn").addEventListener(
      "click",
      () => {

        const dialog =
          $("statsDialog");

        if (dialog && dialog.open) {
          dialog.close();
        }
      }
    );
  }


  /* Réinitialisation globale des statistiques */

  if ($("resetStatsBtn")) {

    $("resetStatsBtn").addEventListener(
      "click",
      () => {

        const hasStats =
          Object.keys(fighterStats).length > 0;

        if (!hasStats) {

          toast(
            "Aucune statistique à réinitialiser."
          );

          return;
        }


        if (
          confirm(
            "Réinitialiser toutes les statistiques ?\n\nL'historique des combats sera conservé."
          )
        ) {

          deletedStats = Object.keys(fighterStats);

fighterStats = {};

saveFighterStats();

saveDeletedStats();

renderStats();
        }
      }
    );
  }
}


/* =========================
   DÉMARRAGE DE L'APPLICATION
   ========================= */

function init() {

  setupEvents();

  render();

  renderHistory();
}


if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();
}


/* =========================
   SERVICE WORKER
   ========================= */

if ("serviceWorker" in navigator) {

  window.addEventListener(
    "load",
    () => {

      navigator.serviceWorker
        .register("sw.js")
        .catch(() => {});
    }
  );
}
