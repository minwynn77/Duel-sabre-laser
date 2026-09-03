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
  return number > 0
    ? `+${number}`
    : `${number}`;
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


/* =========================
   ÉTAT DU COMBAT
   ========================= */

let settings = loadSettings();


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
  settings.duration * 60000;


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
   STATISTIQUES DES COMBATTANTS
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


/* =========================
   INITIALISATION DES STATS
   ========================= */

function initializeFighterStats() {

  let changed = false;

  history
    .slice()
    .reverse()
    .forEach(combat => {

      const players = [

        {
          name: combat.blueName
        },

        {
          name: combat.redName
        }

      ];


      players.forEach(player => {

        const name =
          String(player.name || "").trim();

        const key =
          normalizeName(name);


        if (
          !name ||
          deletedStats.includes(key)
        ) {
          return;
        }


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


  /*
    Si le combattant avait été supprimé
    individuellement, on le recrée
    lorsqu'il rejoue.
  */

  if (deletedStats.includes(key)) {

    deletedStats =
      deletedStats.filter(
        k => k !== key
      );

    saveDeletedStats();
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

  const list =
    $("statsList");


  if (!list) {
    return;
  }


  const fighters =
    Object.values(fighterStats)

      .filter(
        fighter =>
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
      history.length;
  }


  document
    .querySelectorAll(
      ".delete-fighter-stats"
    )
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


          if (
            !deletedStats.includes(key)
          ) {

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

  $("timer").textContent =
    formatTime(remainingMs);


  $("blueScore").textContent =
    scores.blue;


  $("redScore").textContent =
    scores.red;


  $("blueName").textContent =
    settings.blueName;


  $("redName").textContent =
    settings.redName;


  $("blueLimit").textContent =
    settings.limitBlue;


  $("redLimit").textContent =
    settings.limitRed;


  $("blueExitValue").textContent =
    signed(settings.blue.exit);


  $("redExitValue").textContent =
    signed(settings.red.exit);


  $("pauseBtn").disabled =
    !running;


  $("startBtn").disabled =
    running || finishedPending;


  document
    .querySelectorAll(
      ".zone, .exit-zone"
    )
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

  $("status").textContent =
    text;
}


function toast(message) {

  const element =
    $("toast");


  if (!element) {
    return;
  }


  element.textContent =
    message;


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
      settings.duration * 60000;
  }


  running = true;

  combatValidated = false;


  beep("start");

  showStatus(
    "Combat en cours"
  );


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

        showFinish(
          "Temps écoulé"
        );
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

  showStatus(
    "Combat en pause"
  );

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

  showStatus(
    "Combat repris"
  );


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

        showFinish(
          "Temps écoulé"
        );
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
    settings.duration * 60000;


  finishedPending = false;

  combatValidated = false;


  $("finishDialog").close();


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
    settings[color][zone];


  render();


  const limit =
    color === "blue"
      ? settings.limitBlue
      : settings.limitRed;


  if (scores[color] >= limit) {

    if (running) {
      stopTimer();
    }


    beep("limit");


    showFinish(
      `${color === "blue" ? "Bleu" : "Rouge"} a atteint la limite`
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
    settings[color][zone];


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

      clearTimeout
