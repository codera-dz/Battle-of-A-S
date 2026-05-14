// script.js
const ONLINE_TABLE = "tic_tac_toe_rooms";
const DEFAULT_SUPABASE_URL = "";
const DEFAULT_SUPABASE_ANON_KEY = "";

const $ = (selector) => document.querySelector(selector);

const els = {
  themeSelect: $("#themeSelect"),
  modeSelect: $("#modeSelect"),
  sizeSelect: $("#sizeSelect"),
  playerXInput: $("#playerXInput"),
  playerOInput: $("#playerOInput"),
  onlineNameInput: $("#onlineNameInput"),
  roomInput: $("#roomInput"),
  supabaseUrlInput: $("#supabaseUrlInput"),
  supabaseKeyInput: $("#supabaseKeyInput"),
  onlinePanel: $("#onlinePanel"),
  roomButton: $("#roomButton"),
  startButton: $("#startButton"),
  newRoundButton: $("#newRoundButton"),
  resetButton: $("#resetButton"),
  board: $("#board"),
  statusText: $("#statusText"),
  winLengthText: $("#winLengthText"),
  xNameLabel: $("#xNameLabel"),
  oNameLabel: $("#oNameLabel"),
  xScore: $("#xScore"),
  oScore: $("#oScore"),
  drawScore: $("#drawScore"),
  xScoreCard: $("#xScoreCard"),
  oScoreCard: $("#oScoreCard")
};

const state = {
  mode: "local",
  boardSize: 3,
  winLength: 3,
  board: [],
  current: "X",
  players: { X: "Player X", O: "Player O" },
  scores: { X: 0, O: 0, draws: 0 },
  gameOver: false,
  winnerCells: [],
  lastMove: null,
  aiThinking: false,
  online: {
    client: null,
    channel: null,
    roomId: "",
    playerMark: null,
    ready: false,
    syncing: false
  }
};

function cleanName(value, fallback) {
  return value.trim().slice(0, 18) || fallback;
}

function getWinLength(size) {
  return size === 3 ? 3 : 4;
}

function emptyBoard(size = state.boardSize) {
  return Array(size * size).fill("");
}

function applySettings({ resetScores = false } = {}) {
  state.mode = els.modeSelect.value;
  state.boardSize = Number(els.sizeSelect.value);
  state.winLength = getWinLength(state.boardSize);

  if (state.mode === "ai") {
    state.players.X = cleanName(els.playerXInput.value, "You");
    state.players.O = cleanName(els.playerOInput.value, "AI");
  } else {
    state.players.X = cleanName(els.playerXInput.value, "Player X");
    state.players.O = cleanName(els.playerOInput.value, "Player O");
  }

  if (resetScores) {
    state.scores = { X: 0, O: 0, draws: 0 };
  }

  startRound(false);
}

function startRound(pushOnline = true) {
  state.board = emptyBoard();
  state.current = "X";
  state.gameOver = false;
  state.winnerCells = [];
  state.lastMove = null;
  state.aiThinking = false;

  playSound("reset");
  render();

  if (state.mode === "online" && pushOnline) {
    pushOnlineState();
  }
}

function resetScores() {
  state.scores = { X: 0, O: 0, draws: 0 };
  startRound();
}

function canCurrentClientMove() {
  if (state.gameOver || state.aiThinking) return false;
  if (state.mode === "ai") return state.current === "X";
  if (state.mode === "online") {
    return state.online.ready && state.online.playerMark === state.current;
  }
  return true;
}

function handleCellClick(index) {
  if (!canCurrentClientMove() || state.board[index]) return;

  makeMove(index, state.current);

  if (state.mode === "online") {
    pushOnlineState();
  }

  if (state.mode === "ai" && !state.gameOver && state.current === "O") {
    state.aiThinking = true;
    render();
    window.setTimeout(makeAiMove, 420);
  }
}

function makeMove(index, mark) {
  state.board[index] = mark;
  state.lastMove = index;
  playSound("move");

  const result = findWinner(state.board, state.boardSize, state.winLength);

  if (result) {
    state.gameOver = true;
    state.winnerCells = result.cells;
    state.scores[result.mark] += 1;
    playSound("win");
  } else if (state.board.every(Boolean)) {
    state.gameOver = true;
    state.scores.draws += 1;
    playSound("draw");
  } else {
    state.current = mark === "X" ? "O" : "X";
  }

  render();
}

function makeAiMove() {
  if (state.gameOver || state.current !== "O") return;

  const move =
    findImmediateMove("O") ??
    findImmediateMove("X") ??
    findBestAiMove();

  state.aiThinking = false;
  makeMove(move, "O");
}

function findImmediateMove(mark) {
  for (let index = 0; index < state.board.length; index += 1) {
    if (state.board[index]) continue;

    const copy = [...state.board];
    copy[index] = mark;

    if (findWinner(copy, state.boardSize, state.winLength)) {
      return index;
    }
  }

  return null;
}

function findBestAiMove() {
  const center = Math.floor(state.board.length / 2);
  if (!state.board[center]) return center;

  const candidates = state.board
    .map((cell, index) => (cell ? null : index))
    .filter((index) => index !== null);

  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const index of candidates) {
    const score = scoreMove(index, "O") - scoreMove(index, "X") * 0.85;
    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  }

  return bestMove;
}

function scoreMove(index, mark) {
  const copy = [...state.board];
  copy[index] = mark;
  const lines = collectLines(state.boardSize, state.winLength);
  let score = 0;

  for (const line of lines) {
    if (!line.includes(index)) continue;

    const values = line.map((cellIndex) => copy[cellIndex]);
    const own = values.filter((value) => value === mark).length;
    const blocked = values.some((value) => value && value !== mark);

    if (!blocked) {
      score += own * own + values.filter((value) => !value).length;
    }
  }

  return score;
}

function collectLines(size, length) {
  const lines = [];
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      for (const [dr, dc] of directions) {
        const endRow = row + (length - 1) * dr;
        const endCol = col + (length - 1) * dc;

        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) {
          continue;
        }

        const line = [];
        for (let step = 0; step < length; step += 1) {
          line.push((row + step * dr) * size + (col + step * dc));
        }
        lines.push(line);
      }
    }
  }

  return lines;
}

function findWinner(board, size, length) {
  for (const line of collectLines(size, length)) {
    const first = board[line[0]];
    if (!first) continue;

    if (line.every((index) => board[index] === first)) {
      return { mark: first, cells: line };
    }
  }

  return null;
}

function render() {
  document.body.dataset.theme = els.themeSelect.value;
  els.onlinePanel.hidden = state.mode !== "online";

  els.board.style.setProperty("--size", state.boardSize);
   els.board.classList.toggle("has-win", state.winnerCells.length > 0);
  els.board.innerHTML = "";

  state.board.forEach((mark, index) => {
    const button = document.createElement("button");
    button.className = `cell ${mark.toLowerCase()}`;
    button.type = "button";
    button.role = "gridcell";
    button.textContent = mark;
    button.disabled = Boolean(mark) || state.gameOver || !canCurrentClientMove();
    button.setAttribute("aria-label", `Cell ${index + 1}${mark ? `, ${mark}` : ""}`);

    if (state.winnerCells.includes(index)) button.classList.add("win");
    if (state.winnerCells.includes(index)) {
      const winIndex = state.winnerCells.indexOf(index);
      button.classList.add("win");
      button.style.setProperty("--win-delay", `${winIndex * 90}ms`);
    }
    if (state.lastMove === index) button.classList.add("last-move");

    button.addEventListener("click", () => handleCellClick(index));
    els.board.appendChild(button);
  });

  els.xNameLabel.textContent = state.players.X;
  els.oNameLabel.textContent = state.players.O;
  els.xScore.textContent = state.scores.X;
  els.oScore.textContent = state.scores.O;
  els.drawScore.textContent = state.scores.draws;
  els.winLengthText.textContent = `${state.winLength} in a row wins`;

  els.xScoreCard.classList.toggle("active", !state.gameOver && state.current === "X");
  els.oScoreCard.classList.toggle("active", !state.gameOver && state.current === "O");

  els.statusText.textContent = getStatusText();
}

function getStatusText() {
  if (state.gameOver && state.winnerCells.length) {
    const winner = state.board[state.winnerCells[0]];
    return `${state.players[winner]} wins this round.`;
  }

  if (state.gameOver) {
    return "Round ended in a draw.";
  }

  if (state.mode === "ai" && state.current === "O") {
    return `${state.players.O} is thinking...`;
  }

  if (state.mode === "online") {
    if (!state.online.ready) return "Create or join a room to play online.";
    if (state.online.playerMark !== state.current) {
      return `Waiting for ${state.players[state.current]}.`;
    }
    return `Your turn, ${state.players[state.current]}.`;
  }

  return `${state.players[state.current]}'s turn.`;
}

async function setupOnlineRoom() {
  const url = els.supabaseUrlInput.value.trim() || DEFAULT_SUPABASE_URL;
  const key = els.supabaseKeyInput.value.trim() || DEFAULT_SUPABASE_ANON_KEY;
  const roomId = cleanRoomId(els.roomInput.value || createRoomId());
  const onlineName = cleanName(els.onlineNameInput.value, "Player");

  els.roomInput.value = roomId;

  if (!url || !key) {
    els.statusText.textContent = "Add Supabase URL and anon key to use online multiplayer.";
    return;
  }

  localStorage.setItem("ttt_supabase_url", url);
  localStorage.setItem("ttt_supabase_key", key);

  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  state.online.client = createClient(url, key);
  state.online.roomId = roomId;

  const existing = await fetchRoom(roomId);

  if (!existing) {
    state.online.playerMark = "X";
    state.players = { X: onlineName, O: "Waiting..." };
    state.scores = { X: 0, O: 0, draws: 0 };
    startRound(false);

    await state.online.client.from(ONLINE_TABLE).insert({
      id: roomId,
      state: serializeOnlineState()
    });
  } else {
    const roomState = existing.state;
    const openO = !roomState.players?.O || roomState.players.O === "Waiting...";

    if (openO) {
      roomState.players.O = onlineName;
      state.online.playerMark = "O";
      await state.online.client
        .from(ONLINE_TABLE)
        .update({ state: roomState, updated_at: new Date().toISOString() })
        .eq("id", roomId);
    } else if (roomState.players.X === onlineName) {
      state.online.playerMark = "X";
    } else if (roomState.players.O === onlineName) {
      state.online.playerMark = "O";
    } else {
      els.statusText.textContent = "That room is full. Try another room code.";
      return;
    }

    hydrateFromOnlineState(roomState);
  }

  subscribeToRoom(roomId);
  state.online.ready = true;
  render();
}

async function fetchRoom(roomId) {
  const { data, error } = await state.online.client
    .from(ONLINE_TABLE)
    .select("state")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    els.statusText.textContent = `Online setup error: ${error.message}`;
    return null;
  }

  return data;
}

function subscribeToRoom(roomId) {
  if (state.online.channel) {
    state.online.client.removeChannel(state.online.channel);
  }

  state.online.channel = state.online.client
    .channel(`tic-tac-toe-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: ONLINE_TABLE,
        filter: `id=eq.${roomId}`
      },
      (payload) => {
        if (state.online.syncing) return;
        hydrateFromOnlineState(payload.new.state);
        render();
      }
    )
    .subscribe();
}

async function pushOnlineState() {
  if (!state.online.ready || !state.online.client || state.online.syncing) return;

  state.online.syncing = true;

  await state.online.client
    .from(ONLINE_TABLE)
    .update({
      state: serializeOnlineState(),
      updated_at: new Date().toISOString()
    })
    .eq("id", state.online.roomId);

  state.online.syncing = false;
}

function serializeOnlineState() {
  return {
    boardSize: state.boardSize,
    winLength: state.winLength,
    board: state.board,
    current: state.current,
    players: state.players,
    scores: state.scores,
    gameOver: state.gameOver,
    winnerCells: state.winnerCells,
    lastMove: state.lastMove
  };
}

function hydrateFromOnlineState(roomState) {
  state.boardSize = roomState.boardSize;
  state.winLength = roomState.winLength;
  state.board = roomState.board;
  state.current = roomState.current;
  state.players = roomState.players;
  state.scores = roomState.scores;
  state.gameOver = roomState.gameOver;
  state.winnerCells = roomState.winnerCells || [];
  state.lastMove = roomState.lastMove ?? null;

  els.sizeSelect.value = String(state.boardSize);
}

function cleanRoomId(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function createRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function playSound(type) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = playSound.context || new AudioContext();
  playSound.context = context;

  const patterns = {
    move: [440],
    win: [523, 659, 784],
    draw: [330, 294],
    reset: [196, 247]
  };

  patterns[type].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type === "reset" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + index * 0.08 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.08 + 0.16);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(context.currentTime + index * 0.08);
    oscillator.stop(context.currentTime + index * 0.08 + 0.18);
  });
}

els.themeSelect.addEventListener("change", render);

els.modeSelect.addEventListener("change", () => {
  state.mode = els.modeSelect.value;
  els.onlinePanel.hidden = state.mode !== "online";

  if (state.mode === "ai" && els.playerOInput.value === "Player O") {
    els.playerOInput.value = "AI";
  }

  render();
});

els.startButton.addEventListener("click", () => {
  applySettings({ resetScores: true });
});

els.newRoundButton.addEventListener("click", () => {
  startRound();
});

els.resetButton.addEventListener("click", resetScores);

els.roomButton.addEventListener("click", async () => {
  state.mode = "online";
  els.modeSelect.value = "online";
  applySettings({ resetScores: false });
  await setupOnlineRoom();
});

els.supabaseUrlInput.value = localStorage.getItem("ttt_supabase_url") || DEFAULT_SUPABASE_URL;
els.supabaseKeyInput.value = localStorage.getItem("ttt_supabase_key") || DEFAULT_SUPABASE_ANON_KEY;

applySettings({ resetScores: true });
