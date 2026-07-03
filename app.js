(() => {
  "use strict";

  const GAME_SECONDS = 60;

  const screens = {
    settings: document.getElementById("screen-settings"),
    game: document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
  };

  const boardEl = document.getElementById("board");
  const targetEl = document.getElementById("target");
  const expressionEl = document.getElementById("expression");
  const timeLeftEl = document.getElementById("timeLeft");
  const scoreEl = document.getElementById("score");
  const btnDecide = document.getElementById("btn-decide");
  const btnStart = document.getElementById("btn-start");
  const btnRetry = document.getElementById("btn-retry");
  const btnBack = document.getElementById("btn-back");

  let settings = { boardSize: 5, mode: "normal", adjacencyOnly: false };

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

  function randomBoard(size) {
    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        cells.push({ row: r, col: c, value: randInt(1, 9) });
      }
    }
    return cells;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 盤面から合計が target になる部分集合を探す（サイズ2〜maxSize）
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
    const sum = picked.reduce((s, c) => s + c.value, 0);
    return sum;
  }

  function generateBoardForSettings() {
    let size = settings.boardSize;
    if (settings.mode === "normal") {
      return randomBoard(size);
    }
    const fixedTarget = parseInt(settings.mode, 10);
    for (let attempt = 0; attempt < 200; attempt++) {
      const board = randomBoard(size);
      if (findSubsetSumming(board, fixedTarget, 5)) {
        return board;
      }
    }
    // 最終手段：作れなかった場合は強制的に組み込む
    const board = randomBoard(size);
    const forced = forceSubsetInto(board, fixedTarget);
    return forced;
  }

  function forceSubsetInto(board, target) {
    const count = randInt(2, 4);
    const indices = shuffle(board.map((_, i) => i)).slice(0, count);
    let remaining = target;
    indices.forEach((idx, i) => {
      const isLast = i === indices.length - 1;
      const minV = 1;
      const maxV = Math.min(9, remaining - (count - i - 1) * 1);
      const v = isLast ? remaining : randInt(minV, Math.max(minV, maxV - (count - i - 1)));
      board[idx].value = v;
      remaining -= v;
    });
    return board;
  }

  function generateTarget() {
    if (settings.mode !== "normal") {
      return parseInt(settings.mode, 10);
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      const sum = randomSubsetSum(state.board);
      if (sum >= 6 && sum <= 24) return sum;
    }
    return randomSubsetSum(state.board);
  }

  // ---- 盤面描画 ----
  function renderBoard() {
    const size = settings.boardSize;
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    boardEl.innerHTML = "";
    state.board.forEach((cell, idx) => {
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.textContent = cell.value;
      btn.dataset.idx = idx;
      btn.addEventListener("click", () => onCellClick(idx));
      boardEl.appendChild(btn);
    });
    refreshCellStates();
  }

  function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1 && !(a.row === b.row && a.col === b.col);
  }

  function onCellClick(idx) {
    const selPos = state.selected.indexOf(idx);
    if (selPos !== -1) {
      // 選択済みなら解除
      state.selected.splice(selPos, 1);
      refreshCellStates();
      updateExpression();
      return;
    }

    if (settings.adjacencyOnly && state.selected.length > 0) {
      const lastCell = state.board[state.selected[state.selected.length - 1]];
      const thisCell = state.board[idx];
      if (!isAdjacent(lastCell, thisCell)) return;
    }

    state.selected.push(idx);
    refreshCellStates();
    updateExpression();
  }

  function refreshCellStates() {
    const cells = boardEl.children;
    let allowedSet = null;
    if (settings.adjacencyOnly && state.selected.length > 0) {
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

  function currentSum() {
    return state.selected.reduce((s, i) => s + state.board[i].value, 0);
  }

  function onDecide() {
    if (state.selected.length === 0) return;
    state.attempts++;
    if (currentSum() === state.target) {
      const now = performance.now();
      const elapsed = (now - state.questionStartedAt) / 1000;
      state.responseTimes.push(elapsed);
      state.score++;
      scoreEl.textContent = state.score;
      state.selected = [];
      state.target = generateTarget();
      targetEl.textContent = state.target;
      state.questionStartedAt = performance.now();
      renderBoard();
      updateExpression();
    }
    // 不正解時は何もしない
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
    settings.adjacencyOnly = document.getElementById("adjacencyOnly").checked;
  }

  function startGame() {
    state = {
      board: [],
      selected: [],
      target: null,
      score: 0,
      attempts: 0,
      responseTimes: [],
      timeLeft: GAME_SECONDS,
      timerId: null,
      questionStartedAt: 0,
    };
    state.board = generateBoardForSettings();
    state.target = generateTarget();

    scoreEl.textContent = "0";
    targetEl.textContent = state.target;
    renderBoard();
    updateExpression();
    showScreen("game");
    state.questionStartedAt = performance.now();
    startTimer();
  }

  function endGame() {
    showScreen("result");
    const correct = state.score;
    const attempts = state.attempts;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
    const avg =
      state.responseTimes.length > 0
        ? state.responseTimes.reduce((a, b) => a + b, 0) / state.responseTimes.length
        : null;
    const fastest = state.responseTimes.length > 0 ? Math.min(...state.responseTimes) : null;

    document.getElementById("stat-correct").textContent = `${correct}問`;
    document.getElementById("stat-accuracy").textContent = accuracy === null ? "-" : `${accuracy}%`;
    document.getElementById("stat-avg").textContent = avg === null ? "-" : `${avg.toFixed(1)}秒`;
    document.getElementById("stat-fastest").textContent = fastest === null ? "-" : `${fastest.toFixed(1)}秒`;
  }

  // ---- イベント登録 ----
  btnStart.addEventListener("click", () => {
    readSettingsFromUI();
    startGame();
  });

  btnDecide.addEventListener("click", onDecide);

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
