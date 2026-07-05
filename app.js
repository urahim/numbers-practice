(() => {
  "use strict";

  const GAME_SECONDS = 60;

  const screens = {
    settings: document.getElementById("screen-settings"),
    game: document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
  };

  const boardEl = document.getElementById("board");
  const selectionLineEl = document.getElementById("selectionLine");
  const targetEl = document.getElementById("target");
  const expressionEl = document.getElementById("expression");
  const timeLeftEl = document.getElementById("timeLeft");
  const scoreEl = document.getElementById("score");
  const btnStart = document.getElementById("btn-start");
  const btnRetry = document.getElementById("btn-retry");
  const btnBack = document.getElementById("btn-back");

  let settings = { boardSize: 5, mode: "normal" };

  let state = null; // per-game state

  function showScreen(name) {
    for (const key in screens) {
      screens[key].classList.toggle("hidden", key !== name);
    }
  }

  // ---- 乱数ユーティリティ ----
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 本番アプリの盤面は1〜9が均等ではなく、小さい数字ほど多く出る傾向があった
  // （実際のプレイ画面を確認：1・2・4が多数、7・8はほぼ出ないコマもあった）ため、
  // それに近づけて小さい数字ほど出やすい重み付き乱数にしている。
  const DIGIT_WEIGHTS = [18, 16, 14, 12, 10, 8, 6, 4, 2]; // 1〜9に対応
  const DIGIT_WEIGHT_TOTAL = DIGIT_WEIGHTS.reduce((a, b) => a + b, 0);

  function randDigit() {
    let r = Math.random() * DIGIT_WEIGHT_TOTAL;
    for (let i = 0; i < DIGIT_WEIGHTS.length; i++) {
      if (r < DIGIT_WEIGHTS[i]) return i + 1;
      r -= DIGIT_WEIGHTS[i];
    }
    return DIGIT_WEIGHTS.length;
  }

  function makeGrid(size) {
    const grid = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(randDigit());
      grid.push(row);
    }
    return grid;
  }

  function flattenGrid(grid) {
    const cells = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        cells.push({ row: r, col: c, value: grid[r][c] });
      }
    }
    return cells;
  }

  // 揃ったマスを抜いた後、各列を落として上から補充する
  function applyGravity(grid, size) {
    for (let c = 0; c < size; c++) {
      const remaining = [];
      for (let r = 0; r < size; r++) {
        if (grid[r][c] !== null) remaining.push(grid[r][c]);
      }
      const missing = size - remaining.length;
      const refilled = [];
      for (let i = 0; i < missing; i++) refilled.push(randDigit());
      const finalCol = refilled.concat(remaining);
      for (let r = 0; r < size; r++) grid[r][c] = finalCol[r];
    }
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 盤面から合計が target になる部分集合が存在するか探す（サイズ2〜maxSize）
  function findSubsetSumming(cells, target, maxSize) {
    const order = shuffle(cells);
    const n = order.length;
    const path = [];

    function backtrack(startIdx, remaining, depth) {
      if (depth > 0 && remaining === 0) return path.slice();
      if (depth >= maxSize || remaining <= 0) return null;
      for (let i = startIdx; i < n; i++) {
        const v = order[i].value;
        if (v > remaining) continue;
        path.push(order[i]);
        const found = backtrack(i + 1, remaining - v, depth + 1);
        if (found) return found;
        path.pop();
      }
      return null;
    }

    return backtrack(0, target, 0);
  }

  // 盤面からランダムな部分集合（2〜4マス）を選んで合計を作る
  function randomSubsetSum(cells) {
    const count = randInt(2, Math.min(4, cells.length));
    const picked = shuffle(cells).slice(0, count);
    return picked.reduce((s, c) => s + c.value, 0);
  }

  function isPrime(n) {
    if (n < 2) return false;
    for (let i = 2; i * i <= n; i++) {
      if (n % i === 0) return false;
    }
    return true;
  }

  const PROPERTY_MODES = {
    odd: { label: "奇数", predicate: (sum) => sum % 2 === 1 },
    even: { label: "偶数", predicate: (sum) => sum % 2 === 0 },
    prime: { label: "素数", predicate: (sum) => isPrime(sum) },
  };

  function resolveMode() {
    return settings.mode === "normal" ? shuffle(["number", "odd", "even", "prime"])[0] : settings.mode;
  }

  // 指定した盤面(board)の上でお題が解けるか確認し、解ければお題を返す。解けなければnull。
  function buildTargetForBoard(board) {
    const mode = resolveMode();

    if (mode === "number") {
      for (let i = 0; i < 200; i++) {
        const sum = randomSubsetSum(board);
        if (sum >= 6 && sum <= 24) {
          return { target: sum, label: String(sum), predicate: (s) => s === sum };
        }
      }
      return null;
    }

    if (mode in PROPERTY_MODES) {
      const { label, predicate } = PROPERTY_MODES[mode];
      for (let i = 0; i < 300; i++) {
        if (predicate(randomSubsetSum(board))) {
          return { target: null, label, predicate };
        }
      }
      return null;
    }

    // 固定数字モード（16 / 20 / 21 / 23）
    const fixedTarget = parseInt(mode, 10);
    if (findSubsetSumming(board, fixedTarget, 5)) {
      return { target: fixedTarget, label: String(fixedTarget), predicate: (s) => s === fixedTarget };
    }
    return null;
  }

  // ゲーム開始時：解けるお題が見つかるまで盤面を作り直す
  function buildRound() {
    const size = settings.boardSize;
    for (let attempt = 0; attempt < 100; attempt++) {
      const grid = makeGrid(size);
      const board = flattenGrid(grid);
      const t = buildTargetForBoard(board);
      if (t) return { grid, board, ...t };
    }
    const grid = makeGrid(size);
    const board = flattenGrid(grid);
    const sum = randomSubsetSum(board);
    return { grid, board, target: sum, label: String(sum), predicate: (s) => s === sum };
  }

  // 正解後：今の盤面（補充済み）の上で次のお題を探す。解けなければ最終手段として盤面を作り直す
  function nextTargetForCurrentBoard() {
    let t = buildTargetForBoard(state.board);
    if (!t) {
      state.grid = makeGrid(settings.boardSize);
      state.board = flattenGrid(state.grid);
      t = buildTargetForBoard(state.board);
    }
    if (!t) {
      const sum = randomSubsetSum(state.board);
      t = { target: sum, label: String(sum), predicate: (s) => s === sum };
    }
    return t;
  }

  // ---- 盤面描画 ----
  function renderBoard(dropCols) {
    const size = settings.boardSize;
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    boardEl.innerHTML = "";
    state.board.forEach((cell, idx) => {
      const btn = document.createElement("button");
      btn.className = `cell n${cell.value}`;
      if (dropCols && dropCols.has(cell.col)) btn.classList.add("drop-in");
      if (cell.row % 2 === 1) btn.style.setProperty("--row-shift", "50%");
      btn.textContent = cell.value;
      btn.dataset.idx = idx;
      btn.addEventListener("pointerdown", (e) => onPointerDown(e, idx));
      boardEl.appendChild(btn);
    });
    refreshCellStates();
    updateSelectionLine();
  }

  function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1 && !(a.row === b.row && a.col === b.col);
  }

  function cellIdxFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cellEl = el && el.closest ? el.closest(".cell") : null;
    if (!cellEl || cellEl.dataset.idx === undefined) return null;
    return parseInt(cellEl.dataset.idx, 10);
  }

  // ---- なぞって選択（ドラッグ） ----
  function onPointerDown(e, idx) {
    if (state.locked) return;
    e.preventDefault();
    state.dragging = true;
    state.selected = [idx];
    refreshCellStates();
    updateExpression();
    updateSelectionLine();
  }

  function onPointerMove(e) {
    if (!state.dragging || state.locked) return;
    const idx = cellIdxFromPoint(e.clientX, e.clientY);
    if (idx === null) return;
    const path = state.selected;
    const last = path[path.length - 1];
    if (idx === last) return;

    if (path.length >= 2 && idx === path[path.length - 2]) {
      // 1つ前のマスに戻ったら、そこまで選択を戻す
      path.pop();
      refreshCellStates();
      updateExpression();
      updateSelectionLine();
      return;
    }

    if (path.includes(idx)) return;

    if (!isAdjacent(state.board[last], state.board[idx])) return;

    path.push(idx);
    refreshCellStates();
    updateExpression();
    updateSelectionLine();
  }

  function onPointerUp() {
    if (!state.dragging) return;
    state.dragging = false;
    submitSelection();
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);

  function refreshCellStates() {
    const cells = boardEl.children;
    let allowedSet = null;
    if (state.selected.length > 0) {
      const lastCell = state.board[state.selected[state.selected.length - 1]];
      allowedSet = new Set();
      state.board.forEach((c, i) => {
        if (isAdjacent(lastCell, c)) allowedSet.add(i);
      });
    }
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i];
      const isSelected = state.selected.includes(i);
      el.classList.toggle("selected", isSelected);
      const disabled = allowedSet && !allowedSet.has(i) && !isSelected;
      el.classList.toggle("disabled", disabled);
    }
  }

  function updateExpression() {
    if (state.selected.length === 0) {
      expressionEl.innerHTML = "&nbsp;";
      return;
    }
    const values = state.selected.map((i) => state.board[i].value);
    const sum = values.reduce((a, b) => a + b, 0);
    expressionEl.textContent = `${values.join(" + ")} = ${sum}`;
  }

  // 選択したマスの中心をつなぐ線を描画
  function updateSelectionLine() {
    if (!state || state.selected.length < 2) {
      selectionLineEl.innerHTML = "";
      return;
    }
    const wrapRect = boardEl.parentElement.getBoundingClientRect();
    const points = state.selected
      .map((idx) => {
        const el = boardEl.children[idx];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2 - wrapRect.left;
        const y = r.top + r.height / 2 - wrapRect.top;
        return `${x},${y}`;
      })
      .filter(Boolean)
      .join(" ");
    selectionLineEl.setAttribute("viewBox", `0 0 ${wrapRect.width} ${wrapRect.height}`);
    selectionLineEl.innerHTML = `<polyline points="${points}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />`;
  }

  function currentSum() {
    return state.selected.reduce((s, i) => s + state.board[i].value, 0);
  }

  const CLEAR_ANIM_MS = 220;

  // 指を離した瞬間に自動で判定する
  function submitSelection() {
    if (state.locked) return;
    if (state.selected.length < 2) {
      state.selected = [];
      refreshCellStates();
      updateExpression();
      updateSelectionLine();
      return;
    }
    state.attempts++;
    if (!state.predicate(currentSum())) {
      // 不正解：選択だけリセットして仕切り直し
      state.selected = [];
      refreshCellStates();
      updateExpression();
      updateSelectionLine();
      return;
    }

    const now = performance.now();
    const seconds = (now - state.questionStartedAt) / 1000;
    state.responseTimes.push(seconds);
    state.blocksCleared += state.selected.length;
    state.correctCount++;

    const gained = ScoringEngine.scoreForAnswer({
      sum: currentSum(),
      blockCount: state.selected.length,
    });
    state.rawScore += gained;
    scoreEl.textContent = state.rawScore.toLocaleString();

    const clearedIdx = state.selected.slice();
    const affectedCols = new Set(clearedIdx.map((idx) => state.board[idx].col));

    // 消えるアニメーション
    clearedIdx.forEach((idx) => {
      const el = boardEl.children[idx];
      if (el) {
        el.classList.remove("selected");
        el.classList.add("clearing");
      }
    });
    state.selected = [];
    state.locked = true;
    updateExpression();
    updateSelectionLine();

    setTimeout(() => {
      // 正解したマスを盤面から消し、上から補充する
      clearedIdx.forEach((idx) => {
        const cell = state.board[idx];
        state.grid[cell.row][cell.col] = null;
      });
      applyGravity(state.grid, settings.boardSize);
      state.board = flattenGrid(state.grid);

      const nextRound = nextTargetForCurrentBoard();
      state.target = nextRound.target;
      state.label = nextRound.label;
      state.predicate = nextRound.predicate;
      targetEl.textContent = state.label;
      state.questionStartedAt = performance.now();
      renderBoard(affectedCols);
      updateExpression();
      state.locked = false;
    }, CLEAR_ANIM_MS);
  }

  // ---- タイマー ----
  function startTimer() {
    state.timeLeft = GAME_SECONDS;
    timeLeftEl.textContent = state.timeLeft;
    state.timerId = setInterval(() => {
      state.timeLeft--;
      timeLeftEl.textContent = state.timeLeft;
      if (state.timeLeft <= 0) {
        clearInterval(state.timerId);
        endGame();
      }
    }, 1000);
  }

  // ---- ゲーム開始/終了 ----
  function readSettingsFromUI() {
    const boardSizeInput = document.querySelector('input[name="boardSize"]:checked');
    const modeInput = document.querySelector('input[name="mode"]:checked');
    settings.boardSize = parseInt(boardSizeInput.value, 10);
    settings.mode = modeInput.value;
  }

  function startGame() {
    const round = buildRound();
    state = {
      grid: round.grid,
      board: round.board,
      selected: [],
      target: round.target,
      label: round.label,
      predicate: round.predicate,
      correctCount: 0,
      rawScore: 0,
      attempts: 0,
      blocksCleared: 0,
      responseTimes: [],
      timeLeft: GAME_SECONDS,
      timerId: null,
      questionStartedAt: 0,
      locked: false,
      dragging: false,
    };

    scoreEl.textContent = "0";
    targetEl.textContent = state.label;
    renderBoard();
    updateExpression();
    showScreen("game");
    state.questionStartedAt = performance.now();
    startTimer();
  }

  function endGame() {
    showScreen("result");
    const correct = state.correctCount;
    const attempts = state.attempts;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
    const avg =
      state.responseTimes.length > 0
        ? state.responseTimes.reduce((a, b) => a + b, 0) / state.responseTimes.length
        : null;

    const result = ScoringEngine.finalizeScore(state.rawScore, correct);

    document.getElementById("final-score").textContent = result.finalTotal.toLocaleString();
    document.getElementById("stat-raw-score").textContent = result.rawTotal.toLocaleString();
    document.getElementById("stat-bonus").textContent =
      `+${result.bonus.toLocaleString()}（${Math.round(result.bonusRate * 100)}%）`;
    document.getElementById("stat-correct").textContent = `${correct}問`;
    document.getElementById("stat-accuracy").textContent = accuracy === null ? "-" : `${accuracy}%`;
    document.getElementById("stat-avg").textContent = avg === null ? "-" : `${avg.toFixed(1)}秒`;
    document.getElementById("stat-blocks").textContent = `${state.blocksCleared}個`;
  }

  // ---- イベント登録 ----
  btnStart.addEventListener("click", async () => {
    readSettingsFromUI();
    await ScoringEngine.ready;
    startGame();
  });

  btnRetry.addEventListener("click", () => {
    startGame();
  });

  btnBack.addEventListener("click", () => {
    showScreen("settings");
  });

  // ---- PWA ----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
