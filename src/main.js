import { ArrowLeft, BookOpen, Bot, createIcons, RotateCcw, Settings2, Undo2, UsersRound, X } from "lucide";
import { chooseComputerMove, chooseNeutralBridge } from "./ai.js";
import {
  BOARD_SIZE,
  PLAYER,
  allLegalMoves,
  allNeutralMoves,
  createGame,
  endpoints,
  forfeitBlockedPlayer,
  legalMoveAt,
  orientationFor,
  parseMove,
  placeNeutralBridge,
  playMove,
  restoreGame,
  serializeGame,
  undoMove,
} from "./game.js";
import "./style.css";

const STORAGE_KEY = "connections-save-v4";
const SETTINGS_KEY = "connections-settings-v1";
let svgResourceSequence = 0;

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      mode: saved?.mode === "computer" ? "computer" : "hotseat",
      humanPlayer: saved?.humanPlayer === PLAYER.IVORY ? PLAYER.IVORY : PLAYER.RED,
    };
  } catch {
    return { mode: "hotseat", humanPlayer: PLAYER.RED };
  }
}

let settings = loadSettings();
let setupDraft = { ...settings };
let game = restoreGame(localStorage.getItem(STORAGE_KEY));
let rulesOpen = false;
let isThinking = false;
let aiTimer = null;

document.querySelector("#app").innerHTML = `
  <section class="view home-view" id="home-view">
    <main class="home-shell">
      <div class="home-title">
        <span class="home-brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <p>CONNECTIONS</p>
        <h1>连线棋</h1>
      </div>
      <svg id="home-preview" class="home-preview board" viewBox="0 0 1000 1000" aria-hidden="true"></svg>
      <nav class="home-menu" aria-label="开始游戏">
        <button class="home-menu-button tutorial-entry" data-home-action="tutorial">
          <i data-lucide="book-open"></i>
          <span><strong>规则教学</strong><small>四步上手</small></span>
        </button>
        <button class="home-menu-button" data-home-action="hotseat">
          <i data-lucide="users-round"></i>
          <span><strong>双人热座</strong><small>同屏对战</small></span>
        </button>
        <button class="home-menu-button primary" data-home-action="computer">
          <i data-lucide="bot"></i>
          <span><strong>人机对战</strong><small>挑战电脑</small></span>
        </button>
      </nav>
    </main>
  </section>

  <section class="view game-view" id="game-view" hidden>
  <main class="app-shell">
    <header class="topbar">
      <div class="game-title">
        <button class="icon-button" id="game-home-button" aria-label="返回首页" title="返回首页">
          <i data-lucide="arrow-left"></i>
        </button>
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <div>
            <h1>连线棋</h1>
          </div>
        </div>
      </div>
      <div class="top-actions">
        <button class="icon-button" id="setup-button" aria-label="对局设置" title="对局设置">
          <i data-lucide="settings-2"></i>
        </button>
        <button class="icon-button" id="rules-button" aria-label="查看规则" title="查看规则">
          <i data-lucide="book-open"></i>
        </button>
      </div>
    </header>

    <section class="game-layout">
      <div class="play-column">
        <div class="turn-bar" id="turn-bar" aria-live="polite"></div>
        <div class="board-wrap">
          <svg id="board" class="board" viewBox="0 0 1000 1000" role="grid" aria-label="Connections 游戏棋盘"></svg>
        </div>
        <div class="mobile-actions action-row">
          <button class="text-button secondary" data-action="undo">
            <i data-lucide="undo-2"></i><span>撤销</span>
          </button>
          <button class="text-button primary" data-action="restart">
            <i data-lucide="rotate-ccw"></i><span>新对局</span>
          </button>
        </div>
      </div>

      <aside class="game-sidebar">
        <section class="score-section">
          <p class="section-label" id="mode-label">本地双人对战</p>
          <div class="player-row red-player">
            <span class="player-swatch"></span>
            <div><strong id="red-name">红方</strong><small>连接上 · 下</small></div>
            <span class="move-count" id="red-count">0</span>
          </div>
          <div class="player-row ivory-player">
            <span class="player-swatch"></span>
            <div><strong id="ivory-name">白方</strong><small>连接左 · 右</small></div>
            <span class="move-count" id="ivory-count">0</span>
          </div>
        </section>

        <section class="goal-section">
          <p class="section-label">获胜方式</p>
          <p>率先连通自己的两条对边，或用连线形成闭环。</p>
        </section>

        <div class="desktop-actions action-row">
          <button class="text-button secondary" data-action="undo">
            <i data-lucide="undo-2"></i><span>撤销</span>
          </button>
          <button class="text-button primary" data-action="restart">
            <i data-lucide="rotate-ccw"></i><span>新对局</span>
          </button>
        </div>
      </aside>
    </section>
  </main>
  </section>

  <section class="view tutorial-view" id="tutorial-view" hidden>
    <main class="tutorial-shell">
      <header class="tutorial-header">
        <button class="icon-button" id="tutorial-home-button" aria-label="返回首页" title="返回首页">
          <i data-lucide="arrow-left"></i>
        </button>
        <div>
          <p class="section-label">HOW TO PLAY</p>
          <h1>规则教学</h1>
        </div>
        <span id="tutorial-counter">1 / 4</span>
      </header>
      <div class="tutorial-progress" id="tutorial-progress" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </div>
      <section class="tutorial-copy" aria-live="polite">
        <p class="section-label" id="tutorial-eyebrow"></p>
        <h2 id="tutorial-title"></h2>
        <p id="tutorial-description"></p>
      </section>
      <div class="tutorial-board-wrap">
        <svg id="tutorial-board" class="board tutorial-board" viewBox="0 0 1000 1000" role="application" aria-label="规则教学棋盘"></svg>
      </div>
      <div class="tutorial-choices" id="tutorial-choices" hidden>
        <button data-tutorial-choice="red">红方连接上 · 下</button>
        <button data-tutorial-choice="ivory">白方连接左 · 右</button>
      </div>
      <footer class="tutorial-footer">
        <button class="text-button secondary" id="tutorial-reset">
          <i data-lucide="rotate-ccw"></i><span>重来</span>
        </button>
        <button class="text-button primary" id="tutorial-finish" hidden>开始人机对战</button>
      </footer>
    </main>
  </section>

  <dialog id="rules-dialog" class="rules-dialog">
    <div class="dialog-head">
      <div><p class="section-label">HOW TO PLAY</p><h2>游戏规则</h2></div>
      <button class="icon-button dark" id="close-rules" aria-label="关闭规则" title="关闭">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="rules-body">
      <ol>
        <li><span>01</span><p><strong>白方布桥</strong>白方先放置一枚中立桥。红方不能使用；白方需要在自己的回合花费一步将它接通。</p></li>
        <li><span>02</span><p><strong>轮流落子</strong>中立桥放好后红方先手，之后双方轮流放置一枚己方连接块。</p></li>
        <li><span>03</span><p><strong>连接对边</strong>红方要连通上下两边；白方要连通左右两边。</p></li>
        <li><span>04</span><p><strong>围成闭环</strong>也可以用自己的连线形成完整闭环获胜，棋盘边缘不能算作闭环的一部分。</p></li>
      </ol>
    </div>
  </dialog>

  <dialog id="setup-dialog" class="rules-dialog setup-dialog">
    <div class="dialog-head">
      <div><p class="section-label">NEW GAME</p><h2>对局设置</h2></div>
      <button class="icon-button dark" id="close-setup" aria-label="关闭设置" title="关闭">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="setup-body">
      <div class="setup-group">
        <p class="setup-label">对战模式</p>
        <div class="segmented" id="mode-options">
          <button data-mode="hotseat"><i data-lucide="users-round"></i><span>双人热座</span></button>
          <button data-mode="computer"><i data-lucide="bot"></i><span>对战电脑</span></button>
        </div>
      </div>
      <div class="setup-group" id="side-options-wrap">
        <p class="setup-label">选择执子</p>
        <div class="segmented side-options" id="side-options">
          <button data-side="1"><span class="choice-swatch red"></span><span>执红先手</span></button>
          <button data-side="2"><span class="choice-swatch ivory"></span><span>执白后手</span></button>
        </div>
      </div>
      <button class="text-button primary start-button" id="start-game">开始新对局</button>
    </div>
  </dialog>
`;

createIcons({ icons: { ArrowLeft, BookOpen, Bot, RotateCcw, Settings2, Undo2, UsersRound, X } });

const homeView = document.querySelector("#home-view");
const gameView = document.querySelector("#game-view");
const tutorialView = document.querySelector("#tutorial-view");
const homePreview = document.querySelector("#home-preview");
const boardElement = document.querySelector("#board");
const tutorialBoard = document.querySelector("#tutorial-board");
const rulesDialog = document.querySelector("#rules-dialog");
const setupDialog = document.querySelector("#setup-dialog");
let currentView = "home";
let tutorialStep = 0;
let tutorialState = null;
let tutorialTransitioning = false;
let tutorialTimer = null;

function cancelComputerMove() {
  window.clearTimeout(aiTimer);
  aiTimer = null;
  isThinking = false;
}

function showView(view) {
  currentView = view;
  cancelComputerMove();
  homeView.hidden = view !== "home";
  gameView.hidden = view !== "game";
  tutorialView.hidden = view !== "tutorial";
  if (view === "game") {
    saveAndRender();
    scheduleComputerMove();
  }
  if (view === "tutorial") startTutorial();
}

function startMode(mode) {
  settings = { mode, humanPlayer: PLAYER.RED };
  setupDraft = { ...settings };
  game = createGame();
  showView("game");
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function point(index) {
  return 50 + index * (900 / (BOARD_SIZE - 1));
}

function drawHomePreview() {
  drawBoardBase(homePreview);
  const redLines = [
    "7,1,v", "8,2,h", "9,3,v",
    "2,2,h", "4,2,h",
    "1,3,v", "5,3,v",
    "4,4,h", "6,4,h",
    "1,5,v", "3,5,v", "9,5,v",
    "4,6,h",
    "1,7,v", "7,7,v", "9,7,v",
    "6,8,h", "8,8,h",
    "1,9,v", "3,9,v",
  ];
  const ivoryLines = [
    "1,1,h", "3,1,h", "5,1,h", "9,1,h",
    "6,2,v",
    "3,3,h", "7,3,h",
    "2,4,v", "2,6,v", "2,8,v",
    "8,4,v", "8,6,v",
    "7,5,h",
    "3,7,h", "5,7,h",
    "4,8,v",
    "5,9,h", "7,9,h", "9,9,h",
  ];
  const neutralBridge = "5,5,n";
  const moveLayer = svgElement("g", { class: "move-layer home-move-layer" });
  redLines.forEach((key) => moveLayer.append(drawMove(key, PLAYER.RED)));
  ivoryLines.forEach((key) => moveLayer.append(drawMove(key, PLAYER.IVORY)));
  moveLayer.append(drawNeutralBridge(neutralBridge));
  homePreview.append(moveLayer);

  // Keep pegs above the decorative routes, matching the playable board's depth.
  homePreview.append(homePreview.querySelector(".peg-layer"));
}

const TUTORIAL_STEPS = [
  {
    eyebrow: "STEP 01 · 基本操作",
    title: "点击连接两个颜色的点",
    description: "红白双方依次落子，可以连接己方两个颜色的点",
    target: "5,5,v",
  },
  {
    eyebrow: "STEP 02 · 胜利条件",
    title: "连接对边获胜",
    description: "哪方率先连接对边哪方获胜。红方要连通上下两边；白方要连通左右两边。",
    target: "3,9,v",
  },
  {
    eyebrow: "STEP 03 · 另一种胜利",
    title: "围成闭环也能获胜",
    description: "也可以用自己的连线形成完整闭环获胜，棋盘边缘不能算作闭环的一部分。",
    target: "4,6,v",
  },
  {
    eyebrow: "STEP 04 · 后手补偿",
    title: "白方第一手放置金桥",
    description: "作为后手补偿，白方可以在游戏开始前放置一枚金桥，这枚金桥只允许白方通过，红方无法通过。（不默认联通，需要落一子联通）",
    target: "5,5,n",
  },
];

function tutorialGameFromHistory(history) {
  return history.reduce((state, move) => playMove(state, move), createGame());
}

function prepareTutorialStep(step) {
  if (step === 0) {
    tutorialState = tutorialGameFromHistory([
      "1,1,v", "1,3,h", "5,3,v", "7,3,h",
    ]);
  } else if (step === 1) {
    tutorialState = {
      ...tutorialGameFromHistory([
        "3,1,v", "1,1,h", "3,3,v", "5,1,h",
        "3,5,v", "7,3,h", "3,7,v", "9,5,h",
      ]),
    };
  } else if (step === 2) {
    tutorialState = {
      ...createGame(),
      currentPlayer: PLAYER.IVORY,
      history: ["1,1,v", "5,5,h", "3,3,v", "6,6,v", "7,1,v", "5,7,h", "9,3,v"],
      board: new Map([
        ["1,1,v", PLAYER.RED],
        ["3,3,v", PLAYER.RED],
        ["7,1,v", PLAYER.RED],
        ["9,3,v", PLAYER.RED],
        ["5,5,h", PLAYER.IVORY],
        ["6,6,v", PLAYER.IVORY],
        ["5,7,h", PLAYER.IVORY],
      ]),
    };
  } else tutorialState = createGame();
}

function currentTutorialTarget() {
  if (tutorialTransitioning) return null;
  return TUTORIAL_STEPS[tutorialStep]?.target ?? null;
}

function renderTutorial() {
  const step = TUTORIAL_STEPS[tutorialStep];
  const activeTarget = currentTutorialTarget();
  document.querySelector("#tutorial-counter").textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
  document.querySelector("#tutorial-eyebrow").textContent = step.eyebrow;
  document.querySelector("#tutorial-title").textContent = step.title;
  document.querySelector("#tutorial-description").textContent = step.description;
  document.querySelectorAll("#tutorial-progress i").forEach((item, index) => {
    item.classList.toggle("is-complete", index < tutorialStep);
    item.classList.toggle("is-current", index === tutorialStep);
  });

  drawBoardBase(tutorialBoard);
  const pieceLayer = svgElement("g", { class: "move-layer" });
  const winningPath = new Set(tutorialState.winner?.path ?? []);
  tutorialState.board.forEach((player, key) => {
    pieceLayer.append(player === PLAYER.NEUTRAL
      ? drawNeutralBridge(key)
      : drawMove(key, player, {
        winning: winningPath.has(key),
        activatedNeutral: player === PLAYER.IVORY && samePosition(key, tutorialState.neutralBridge),
        neutralBridge: tutorialState.neutralBridge,
      }));
  });
  if (activeTarget) {
    const targetPlayer = tutorialStep === 2 ? PLAYER.IVORY : PLAYER.RED;
    pieceLayer.append(parseMove(activeTarget).orientation === "n"
      ? drawNeutralBridge(activeTarget, { preview: true })
      : drawMove(activeTarget, targetPlayer, {
        preview: true,
        activatedNeutral: false,
        neutralBridge: tutorialState.neutralBridge,
      }));
  }
  tutorialBoard.append(pieceLayer);
  tutorialBoard.append(tutorialBoard.querySelector(".peg-layer"));

  if (activeTarget) {
    const { x, y } = parseMove(activeTarget);
    tutorialBoard.append(svgElement("circle", {
      cx: point(x),
      cy: point(y),
      r: 54,
      class: "hit-target tutorial-target",
      "data-tutorial-target": activeTarget,
      tabindex: 0,
      role: "button",
      "aria-label": step.description,
    }));
  }
  if (tutorialTransitioning && tutorialState.lastMove && parseMove(tutorialState.lastMove).orientation !== "n") {
    const { x, y } = parseMove(tutorialState.lastMove);
    tutorialBoard.append(svgElement("circle", {
      cx: point(x),
      cy: point(y),
      r: 28,
      class: "last-move-ring",
    }));
  }

  document.querySelector("#tutorial-choices").hidden = true;
  document.querySelector("#tutorial-finish").hidden = tutorialStep !== 4;
}

function completeTutorial() {
  document.querySelector("#tutorial-counter").textContent = "完成";
  document.querySelector("#tutorial-eyebrow").textContent = "READY";
  document.querySelector("#tutorial-title").textContent = "你已经掌握规则";
  document.querySelector("#tutorial-description").textContent = "现在可以开始一局人机对战。";
  document.querySelector("#tutorial-choices").hidden = true;
  document.querySelector("#tutorial-finish").hidden = false;
  document.querySelectorAll("#tutorial-progress i").forEach((item) => {
    item.classList.remove("is-current");
    item.classList.add("is-complete");
  });
}

function finishTutorialStep(delay) {
  tutorialTransitioning = true;
  renderTutorial();
  window.clearTimeout(tutorialTimer);
  tutorialTimer = window.setTimeout(() => {
    tutorialTransitioning = false;
    tutorialStep += 1;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
      completeTutorial();
      return;
    }
    prepareTutorialStep(tutorialStep);
    renderTutorial();
  }, delay);
}

function advanceTutorial(key) {
  if (tutorialStep === 0 || tutorialStep === 2) {
    tutorialState = playMove(tutorialState, key);
    finishTutorialStep(380);
    navigator.vibrate?.(15);
    return;
  }
  if (tutorialStep === 1) {
    tutorialState = playMove(tutorialState, key);
    finishTutorialStep(620);
    navigator.vibrate?.(15);
    return;
  }
  if (tutorialStep === 3) {
    tutorialState = placeNeutralBridge(tutorialState, key);
    finishTutorialStep(520);
    navigator.vibrate?.(15);
    return;
  }
}

function startTutorial() {
  window.clearTimeout(tutorialTimer);
  tutorialStep = 0;
  tutorialTransitioning = false;
  prepareTutorialStep(tutorialStep);
  document.querySelector("#tutorial-finish").hidden = true;
  renderTutorial();
}

function computerPlayer() {
  return settings.humanPlayer === PLAYER.RED ? PLAYER.IVORY : PLAYER.RED;
}

function needsNeutralBridge() {
  return !game.neutralBridge && game.history.length === 0;
}

function isComputerTurn() {
  if (settings.mode !== "computer" || game.winner) return false;
  if (needsNeutralBridge()) return computerPlayer() === PLAYER.IVORY;
  return game.currentPlayer === computerPlayer();
}

function isHumanTurn() {
  if (settings.mode === "hotseat") return true;
  if (needsNeutralBridge()) return settings.humanPlayer === PLAYER.IVORY;
  return game.currentPlayer === settings.humanPlayer;
}

function drawBoardBase(target = boardElement) {
  target.replaceChildren();
  const resourceId = `${target.id}-${svgResourceSequence += 1}`;
  const tileShadowId = `${resourceId}-tile-shadow`;
  const pegShadowId = `${resourceId}-peg-shadow`;
  const grainId = `${resourceId}-grain`;

  const defs = svgElement("defs");
  defs.innerHTML = `
    <filter id="${tileShadowId}" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#000" flood-opacity=".44"/>
    </filter>
    <filter id="${pegShadowId}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#000" flood-opacity=".5"/>
    </filter>
    <pattern id="${grainId}" width="70" height="70" patternUnits="userSpaceOnUse">
      <circle cx="9" cy="12" r="1" fill="#fff" opacity=".035"/>
      <circle cx="48" cy="31" r=".8" fill="#000" opacity=".13"/>
      <path d="M5 58L24 52M48 8L66 3" stroke="#fff" stroke-width="1" opacity=".02"/>
    </pattern>
  `;
  target.append(defs);

  target.append(
    svgElement("rect", { x: 8, y: 8, width: 984, height: 984, rx: 24, class: "frame-outer" }),
    svgElement("rect", { x: 25, y: 25, width: 950, height: 950, rx: 14, class: "frame-inner" }),
    svgElement("rect", { x: 38, y: 38, width: 924, height: 924, rx: 7, class: "board-field" }),
    svgElement("rect", { x: 38, y: 38, width: 924, height: 924, rx: 7, fill: `url(#${grainId})` }),
  );

  const edgeData = [
    [50, 31, 900, 10, "red-edge"],
    [50, 959, 900, 10, "red-edge"],
    [31, 50, 10, 900, "ivory-edge"],
    [959, 50, 10, 900, "ivory-edge"],
  ];
  edgeData.forEach(([x, y, width, height, className]) => {
    target.append(svgElement("rect", { x, y, width, height, rx: 5, class: className }));
  });

  const pegLayer = svgElement("g", { class: "peg-layer" });
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (x % 2 === y % 2) continue;
      const player = y % 2 === 0 ? PLAYER.RED : PLAYER.IVORY;
      pegLayer.append(svgElement("rect", {
        x: point(x) - 14,
        y: point(y) - 14,
        width: 28,
        height: 28,
        rx: 4,
        class: `peg ${player === PLAYER.RED ? "peg-red" : "peg-ivory"}`,
        filter: `url(#${pegShadowId})`,
      }));
    }
  }
  target.append(pegLayer);
}

function samePosition(firstKey, secondKey) {
  if (!firstKey || !secondKey) return false;
  const first = parseMove(firstKey);
  const second = parseMove(secondKey);
  return first.x === second.x && first.y === second.y;
}

function drawMove(
  key,
  player,
  {
    preview = false,
    winning = false,
    activatedNeutral = false,
    neutralBridge = game.neutralBridge,
  } = {},
) {
  const [start, end] = endpoints(key);
  const group = svgElement("g", {
    class: `tile ${preview ? "preview" : ""} ${winning ? "winning" : ""} ${activatedNeutral ? "activated-neutral" : ""}`,
    "data-move": key,
  });
  const common = { x1: point(start.x), y1: point(start.y), x2: point(end.x), y2: point(end.y) };
  if (activatedNeutral) {
    group.append(
      svgElement("line", { ...common, class: "activated-channel-bed" }),
      svgElement("line", { ...common, class: `tile-color player-${player}` }),
      drawNeutralBridge(neutralBridge),
    );
  } else {
    group.append(
      svgElement("line", { ...common, class: "tile-outline" }),
      svgElement("line", { ...common, class: "tile-body" }),
      svgElement("line", { ...common, class: `tile-color player-${player}` }),
    );
  }
  if (winning) {
    group.append(svgElement("line", { ...common, class: "win-glow" }));
  }
  return group;
}

function drawNeutralBridge(key, { preview = false } = {}) {
  const { x, y } = parseMove(key);
  const cx = point(x);
  const cy = point(y);
  const whiteOrientation = orientationFor(PLAYER.IVORY, x, y);
  const group = svgElement("g", {
    class: `neutral-bridge ${preview ? "preview" : ""}`,
    transform: whiteOrientation === "v" ? `rotate(90 ${cx} ${cy})` : "",
  });
  const radius = 45;
  const points = Array.from({ length: 8 }, (_, index) => {
    const angle = Math.PI / 8 + index * Math.PI / 4;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  }).join(" ");
  const maskId = `neutral-mask-${svgResourceSequence += 1}`;
  const defs = svgElement("defs");
  const mask = svgElement("mask", {
    id: maskId,
    x: cx - 60,
    y: cy - 60,
    width: 120,
    height: 120,
    maskUnits: "userSpaceOnUse",
  });
  mask.append(
    svgElement("rect", { x: cx - 60, y: cy - 60, width: 120, height: 120, fill: "white" }),
    svgElement("rect", { x: cx - 60, y: cy - 10, width: 120, height: 20, fill: "black" }),
  );
  defs.append(mask);
  group.append(
    defs,
    svgElement("polygon", { points, class: "neutral-body", mask: `url(#${maskId})` }),
  );
  return group;
}

function drawMoves() {
  const moveLayer = svgElement("g", { class: "move-layer" });
  const winPath = new Set(game.winner?.path ?? []);
  game.board.forEach((player, key) => {
    moveLayer.append(player === PLAYER.NEUTRAL
      ? drawNeutralBridge(key)
      : drawMove(key, player, {
        winning: winPath.has(key),
        activatedNeutral: player === PLAYER.IVORY && samePosition(key, game.neutralBridge),
      }));
  });
  boardElement.append(moveLayer);

  const pegLayer = boardElement.querySelector(".peg-layer");
  boardElement.append(pegLayer);

  if (!game.winner && !isThinking && isHumanTurn()) {
    const hitLayer = svgElement("g", { class: "hit-layer" });
    const legalMoves = needsNeutralBridge()
      ? allNeutralMoves(game.board)
      : allLegalMoves(game.board, game.currentPlayer);
    for (const key of legalMoves) {
      const { x, y } = parseMove(key);
      const hit = svgElement("circle", {
        cx: point(x),
        cy: point(y),
        r: 54,
        class: "hit-target",
        tabindex: 0,
        role: "gridcell",
        "aria-label": needsNeutralBridge()
          ? `在第 ${y} 行第 ${x} 列放置中立桥`
          : game.currentPlayer === PLAYER.IVORY && samePosition(key, game.neutralBridge)
            ? "花费一步接通中立桥"
            : `在第 ${y} 行第 ${x} 列放置连接块`,
        [needsNeutralBridge() ? "data-neutral" : "data-key"]: key,
      });
      hitLayer.append(hit);
    }
    boardElement.append(hitLayer);
  }

  if (game.lastMove && parseMove(game.lastMove).orientation !== "n") {
    const { x, y } = parseMove(game.lastMove);
    boardElement.append(svgElement("circle", {
      cx: point(x),
      cy: point(y),
      r: 28,
      class: "last-move-ring",
    }));
  }
}

function playerName(player) {
  return player === PLAYER.RED ? "红方" : "白方";
}

function displayPlayerName(player) {
  if (settings.mode === "hotseat") return playerName(player);
  return player === settings.humanPlayer ? "你" : "电脑";
}

function updateStatus() {
  const status = document.querySelector("#turn-bar");
  if (needsNeutralBridge() && isThinking) {
    status.innerHTML = `
      <span class="neutral-status-mark"></span>
      <div><strong>电脑布桥中</strong><small>白方正在选择中立桥位置</small></div>
      <span class="thinking-pips" aria-hidden="true"><i></i><i></i><i></i></span>
    `;
    status.classList.remove("is-winner");
  } else if (needsNeutralBridge()) {
    status.innerHTML = `
      <span class="neutral-status-mark"></span>
      <div><strong>白方布置中立桥</strong><small>选择一个连接位作为障碍</small></div>
      <span class="turn-number">开局</span>
    `;
    status.classList.remove("is-winner");
  } else if (game.winner) {
    const reason = game.winner.reason === "connection"
      ? "完成贯通"
      : game.winner.reason === "loop"
        ? "围成闭环"
        : `${playerName(game.currentPlayer)}无子可下`;
    status.innerHTML = `
      <span class="turn-dot player-${game.winner.player}"></span>
      <div><strong>${displayPlayerName(game.winner.player)}获胜</strong><small>${playerName(game.winner.player)} · ${reason}</small></div>
    `;
    status.classList.add("is-winner");
  } else if (isThinking) {
    status.innerHTML = `
      <span class="turn-dot player-${game.currentPlayer} thinking-dot"></span>
      <div><strong>电脑思考中</strong><small>${playerName(game.currentPlayer)}正在计算路线</small></div>
      <span class="thinking-pips" aria-hidden="true"><i></i><i></i><i></i></span>
    `;
    status.classList.remove("is-winner");
  } else {
    status.innerHTML = `
      <span class="turn-dot player-${game.currentPlayer}"></span>
      <div><strong>${settings.mode === "computer" ? `${displayPlayerName(game.currentPlayer)}的回合` : `${playerName(game.currentPlayer)}回合`}</strong><small>${game.currentPlayer === PLAYER.RED ? "向上下延伸" : "向左右延伸"}</small></div>
      <span class="turn-number">第 ${game.history.length + 1} 手</span>
    `;
    status.classList.remove("is-winner");
  }
  document.querySelector("#mode-label").textContent = settings.mode === "computer" ? "电脑对战" : "本地双人对战";
  document.querySelector("#red-name").textContent = settings.mode === "computer"
    ? `红方 · ${displayPlayerName(PLAYER.RED)}`
    : "红方";
  document.querySelector("#ivory-name").textContent = settings.mode === "computer"
    ? `白方 · ${displayPlayerName(PLAYER.IVORY)}`
    : "白方";
  document.querySelector("#red-count").textContent = [...game.board.values()].filter((p) => p === PLAYER.RED).length;
  document.querySelector("#ivory-count").textContent = [...game.board.values()].filter((p) => p === PLAYER.IVORY).length;
  document.querySelectorAll('[data-action="undo"]').forEach((button) => {
    const minimumHistory = settings.mode === "computer" && settings.humanPlayer === PLAYER.IVORY ? 1 : 0;
    button.disabled = game.history.length <= minimumHistory;
  });
}

function saveAndRender() {
  game = forfeitBlockedPlayer(game);
  localStorage.setItem(STORAGE_KEY, serializeGame(game));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  drawBoardBase();
  drawMoves();
  updateStatus();
}

function scheduleComputerMove() {
  window.clearTimeout(aiTimer);
  aiTimer = null;
  game = forfeitBlockedPlayer(game);
  if (game.winner) {
    saveAndRender();
    return;
  }
  if (currentView !== "game" || !isComputerTurn()) return;
  isThinking = true;
  saveAndRender();
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    const placingNeutral = needsNeutralBridge();
    const move = placingNeutral ? chooseNeutralBridge(game) : chooseComputerMove(game);
    isThinking = false;
    if (move) game = placingNeutral ? placeNeutralBridge(game, move) : playMove(game, move);
    navigator.vibrate?.(game.winner ? [35, 45, 70] : 12);
    saveAndRender();
    scheduleComputerMove();
  }, 360);
}

function makeNeutralMove(key) {
  if (isThinking || !isHumanTurn() || !needsNeutralBridge()) return;
  game = placeNeutralBridge(game, key);
  navigator.vibrate?.(18);
  saveAndRender();
  scheduleComputerMove();
}

function makeMove(key) {
  if (isThinking || !isHumanTurn()) return;
  const expected = legalMoveAt(game.board, game.currentPlayer, parseMove(key).x, parseMove(key).y);
  if (expected !== key) return;
  game = playMove(game, key);
  navigator.vibrate?.(game.winner ? [35, 45, 70] : 18);
  saveAndRender();
  scheduleComputerMove();
}

boardElement.addEventListener("click", (event) => {
  const neutralTarget = event.target.closest("[data-neutral]");
  if (neutralTarget) {
    makeNeutralMove(neutralTarget.dataset.neutral);
    return;
  }
  const target = event.target.closest("[data-key]");
  if (target) makeMove(target.dataset.key);
});

boardElement.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    const key = event.target.dataset.neutral ?? event.target.dataset.key;
    if (!key) return;
    event.preventDefault();
    if (event.target.dataset.neutral) makeNeutralMove(key);
    else makeMove(key);
  }
});

boardElement.addEventListener("pointerover", (event) => {
  const target = event.target.closest("[data-key], [data-neutral]");
  if (!target || boardElement.querySelector(".preview")) return;
  const preview = target.dataset.neutral
    ? drawNeutralBridge(target.dataset.neutral, { preview: true })
    : drawMove(target.dataset.key, game.currentPlayer, {
      preview: true,
      activatedNeutral: game.currentPlayer === PLAYER.IVORY
        && samePosition(target.dataset.key, game.neutralBridge),
    });
  preview.classList.add("hover-preview");
  target.parentElement.before(preview);
});

boardElement.addEventListener("pointerout", () => {
  boardElement.querySelector(".hover-preview")?.remove();
});

document.querySelector(".home-menu").addEventListener("click", (event) => {
  const action = event.target.closest("[data-home-action]")?.dataset.homeAction;
  if (action === "tutorial") showView("tutorial");
  if (action === "hotseat") startMode("hotseat");
  if (action === "computer") startMode("computer");
});

document.querySelector("#game-home-button").addEventListener("click", () => showView("home"));
document.querySelector("#tutorial-home-button").addEventListener("click", () => showView("home"));
document.querySelector("#tutorial-reset").addEventListener("click", startTutorial);
document.querySelector("#tutorial-finish").addEventListener("click", () => startMode("computer"));

tutorialBoard.addEventListener("click", (event) => {
  const target = event.target.closest("[data-tutorial-target]");
  if (!target || target.dataset.tutorialTarget !== currentTutorialTarget()) return;
  advanceTutorial(target.dataset.tutorialTarget);
});

tutorialBoard.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target.closest("[data-tutorial-target]");
  if (!target || target.dataset.tutorialTarget !== currentTutorialTarget()) return;
  event.preventDefault();
  advanceTutorial(target.dataset.tutorialTarget);
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "undo") {
    const wasThinking = isThinking;
    cancelComputerMove();
    game = undoMove(game);
    if (settings.mode === "computer" && !wasThinking) {
      while (game.history.length && game.currentPlayer !== settings.humanPlayer) {
        game = undoMove(game);
      }
    }
    saveAndRender();
  }
  if (action === "restart") {
    openSetup();
  }
});

function renderSetupOptions() {
  setupDialog.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === setupDraft.mode);
  });
  setupDialog.querySelectorAll("[data-side]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.side) === setupDraft.humanPlayer);
  });
  document.querySelector("#side-options-wrap").hidden = setupDraft.mode !== "computer";
}

function openSetup() {
  setupDraft = { ...settings };
  renderSetupOptions();
  setupDialog.showModal();
}

document.querySelector("#setup-button").addEventListener("click", openSetup);
document.querySelector("#close-setup").addEventListener("click", () => setupDialog.close());

setupDialog.addEventListener("click", (event) => {
  const mode = event.target.closest("[data-mode]")?.dataset.mode;
  const side = event.target.closest("[data-side]")?.dataset.side;
  if (mode) setupDraft.mode = mode;
  if (side) setupDraft.humanPlayer = Number(side);
  if (mode || side) renderSetupOptions();
  if (event.target === setupDialog) setupDialog.close();
});

document.querySelector("#start-game").addEventListener("click", () => {
  cancelComputerMove();
  settings = { ...setupDraft };
  game = createGame();
  setupDialog.close();
  showView("game");
});

document.querySelector("#rules-button").addEventListener("click", () => {
  rulesOpen = true;
  rulesDialog.showModal();
});

document.querySelector("#close-rules").addEventListener("click", () => {
  rulesOpen = false;
  rulesDialog.close();
});

rulesDialog.addEventListener("click", (event) => {
  if (event.target === rulesDialog && rulesOpen) {
    rulesOpen = false;
    rulesDialog.close();
  }
});

drawHomePreview();
showView("home");
