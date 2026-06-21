import { isFirebaseConfigured } from "./firebase-config.js";
import { authSystem, lobbySystem, inviteSystem } from "./auth-lobby.js";
import { audioSystem } from "./audio.js";
import { 
  createBoard, 
  canPlacePiece, 
  placePiece, 
  checkLineClears, 
  hasAnyLegalMoves, 
  getRandomPieces, 
  calculateScore 
} from "./game.js";
import { GameRelay } from "./relay.js";

// App State
let currentUser = null;
let activeLobby = null;
let relay = null;
let lobbyHeartbeatInterval = null;
let gameStartTimeout = null;
let sentInviteId = null;
let sentInviteUnsubscribe = null;
let incomingInvitesUnsubscribe = null;

const gameState = {
  board: createBoard(),
  p1Username: "",
  p2Username: "",
  p1Score: 0,
  p2Score: 0,
  p1Streak: 0,
  p2Streak: 0,
  p1Pieces: [null, null, null],
  p2Pieces: [null, null, null],
  turn: "", // Username of active player
  playerRole: "", // "host" (P1) or "guest" (P2)
  mode: "score", // "score" or "sudden_death"
  isGameOver: false,
  rematchRequested: false,
  opponentRematchRequested: false
};

// Drag & Drop State
const dragInfo = {
  isDragging: false,
  slotIndex: null, // 0, 1, 2
  piece: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  offsetX: 0,
  offsetY: -60, // Floating offset above finger (essential for mobile)
  floatingVisual: null,
  boardRect: null,
  cellWidth: 0,
  cellHeight: 0
};

// DOM Elements
const views = {
  auth: document.getElementById("auth-view"),
  lobby: document.getElementById("lobby-view"),
  waiting: document.getElementById("waiting-view"),
  game: document.getElementById("game-view"),
  gameoverModal: document.getElementById("gameover-modal")
};

// Auth view elements
const authForm = {
  title: document.getElementById("auth-title"),
  usernameInput: document.getElementById("auth-username"),
  passwordInput: document.getElementById("auth-password"),
  submitBtn: document.getElementById("auth-submit-btn"),
  toggleMsg: document.getElementById("auth-toggle-msg"),
  toggleLink: document.getElementById("auth-toggle-link"),
  fbWarning: document.getElementById("fb-warning")
};

// Lobby view elements
const lobbyUI = {
  profileName: document.getElementById("profile-name"),
  profileLevel: document.getElementById("profile-level"),
  soundBtn: document.getElementById("sound-toggle-btn"),
  highScore: document.getElementById("stat-high-score"),
  totalWins: document.getElementById("stat-total-wins"),
  playedScore: document.getElementById("stat-played-score"),
  winsScore: document.getElementById("stat-wins-score"),
  lossesScore: document.getElementById("stat-losses-score"),
  playedSudden: document.getElementById("stat-played-sudden"),
  winsSudden: document.getElementById("stat-wins-sudden"),
  lossesSudden: document.getElementById("stat-losses-sudden"),
  modeTabs: document.querySelectorAll(".mode-tab"),
  quickPlayBtn: document.getElementById("quick-play-btn"),
  logoutBtn: document.getElementById("lobby-logout-btn"),
  
  // Friends list UI additions
  addFriendInput: document.getElementById("add-friend-input"),
  addFriendBtn: document.getElementById("add-friend-btn"),
  friendsList: document.getElementById("friends-list")
};

// Waiting view elements
const waitingUI = {
  title: document.getElementById("waiting-title"),
  subtitle: document.getElementById("waiting-subtitle"),
  roomCodeSection: document.getElementById("waiting-room-code-section"),
  roomCodeVal: document.getElementById("room-code-val"),
  copyBtn: document.getElementById("copy-code-btn"),
  hostName: document.getElementById("lobby-host-name"),
  guestName: document.getElementById("lobby-guest-name"),
  guestDot: document.getElementById("lobby-guest-dot"),
  statusText: document.getElementById("waiting-status-text"),
  cancelBtn: document.getElementById("cancel-waiting-btn")
};

// Game view elements
const gameUI = {
  p1Name: document.querySelector("#hud-p1 .hud-player-name"),
  p2Name: document.querySelector("#hud-p2 .hud-player-name"),
  p1Score: document.getElementById("p1-score"),
  p2Score: document.getElementById("p2-score"),
  p1Streak: document.getElementById("p1-streak"),
  p2Streak: document.getElementById("p2-streak"),
  modeBadge: document.getElementById("game-mode-badge"),
  turnIndicator: document.getElementById("turn-indicator"),
  board: document.getElementById("game-board"),
  alerts: document.getElementById("game-alerts"),
  mySlots: [
    document.getElementById("my-slot-0"),
    document.getElementById("my-slot-1"),
    document.getElementById("my-slot-2")
  ],
  reactionToggle: document.getElementById("reaction-toggle"),
  reactionOptions: document.getElementById("reaction-options"),
  reactionBtns: document.querySelectorAll(".emoji-react-btn"),
  emojiContainer: document.getElementById("emoji-flight-container")
};

// Game Over elements
const gameoverUI = {
  title: document.getElementById("gameover-result-title"),
  reason: document.getElementById("gameover-reason"),
  p1Name: document.getElementById("go-p1-name"),
  p2Name: document.getElementById("go-p2-name"),
  p1Score: document.getElementById("go-p1-score"),
  p2Score: document.getElementById("go-p2-score"),
  rematchBtn: document.getElementById("rematch-btn"),
  rematchStatus: document.getElementById("rematch-status"),
  menuBtn: document.getElementById("gameover-menu-btn")
};

// Initialize Application
window.addEventListener("DOMContentLoaded", () => {
  setupViewSwitcher();
  setupAuthHandlers();
  setupLobbyHandlers();
  setupWaitingHandlers();
  setupGameControls();
  setupGameOverHandlers();

  // Show Firebase Config Warning if not initialized
  if (!isFirebaseConfigured) {
    authForm.fbWarning.classList.remove("hidden");
  }

  // Subscribe to Auth Status changes
  authSystem.onAuthChange((userData) => {
    if (userData) {
      currentUser = userData;
      updateLobbyProfileUI(userData);
      switchView("lobby-view");
      
      // Start listening to incoming invites
      startIncomingInvitesListener(userData.uid);
      
      // Render friends list
      renderFriendsList();
    } else {
      currentUser = null;
      stopIncomingInvitesListener();
      switchView("auth-view");
    }
  });

  // Tap triggers browser gesture audio initialization
  document.body.addEventListener("click", () => {
    audioSystem.playTap();
  }, { once: true });
});

// View switching helper
function switchView(viewId) {
  Object.keys(views).forEach(key => {
    if (views[key].id === viewId) {
      views[key].classList.add("active");
    } else {
      views[key].classList.remove("active");
    }
  });
  // Hide Game Over modal when leaving game/gameover views
  if (viewId !== "game-view" && viewId !== "gameover-modal") {
    views.gameoverModal.classList.add("hidden");
  }
}

// 1. AUTH SCREEN LOGIC
let isRegisterMode = false;

function setupAuthHandlers() {
  authForm.toggleLink.addEventListener("click", () => {
    const card = document.querySelector(".auth-card");
    card.classList.add("card-swap-anim");
    
    setTimeout(() => {
      isRegisterMode = !isRegisterMode;
      const btnSpan = authForm.submitBtn.querySelector("span");
      if (isRegisterMode) {
        authForm.title.textContent = "Crear Cuenta";
        if (btnSpan) btnSpan.textContent = "REGISTRARSE";
        authForm.toggleMsg.innerHTML = '¿Ya tienes cuenta? <span id="auth-toggle-link">Inicia Sesión</span>';
      } else {
        authForm.title.textContent = "Iniciar Sesión";
        if (btnSpan) btnSpan.textContent = "INGRESAR";
        authForm.toggleMsg.innerHTML = '¿No tienes cuenta? <span id="auth-toggle-link">Regístrate</span>';
      }
      
      // Re-bind the click event
      document.getElementById("auth-toggle-link").addEventListener("click", () => {
        authForm.toggleLink.click();
      });
    }, 150);

    setTimeout(() => {
      card.classList.remove("card-swap-anim");
    }, 300);

    audioSystem.playTap();
  });

  authForm.submitBtn.addEventListener("click", async () => {
    const username = authForm.usernameInput.value.trim();
    const password = authForm.passwordInput.value;

    if (!username || !password) {
      alert("Por favor completa todos los campos.");
      return;
    }

    const btnSpan = authForm.submitBtn.querySelector("span");
    authForm.submitBtn.disabled = true;
    if (btnSpan) btnSpan.textContent = "PROCESANDO...";

    try {
      if (isRegisterMode) {
        await authSystem.register(username, password);
      } else {
        await authSystem.login(username, password);
      }
    } catch (e) {
      alert(e.message);
      authForm.submitBtn.disabled = false;
      if (btnSpan) btnSpan.textContent = isRegisterMode ? "REGISTRARSE" : "INGRESAR";
    }
  });
}



// 2. LOBBY SCREEN LOGIC
let selectedMode = "score"; // "score" or "sudden_death"

function setupLobbyHandlers() {
  // Mode Tabs selection
  lobbyUI.modeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      lobbyUI.modeTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      selectedMode = tab.dataset.mode;
      
      const descBox = document.getElementById("mode-detail-desc");
      if (descBox) {
        if (selectedMode === "score") {
          descBox.textContent = "Consigue puntos limpiando líneas. Si mueres, gana el que tenga más puntos.";
        } else {
          descBox.textContent = "Coloca bloques. El primero que no pueda mover, pierde la partida.";
        }
      }
      
      audioSystem.playTap();
    });
  });

  // Sound Toggle
  const initialSoundEnabled = audioSystem.isSoundEnabled();
  lobbyUI.soundBtn.classList.toggle("muted", !initialSoundEnabled);
  
  lobbyUI.soundBtn.addEventListener("click", () => {
    const enabled = audioSystem.toggleSound();
    lobbyUI.soundBtn.classList.toggle("muted", !enabled);
    audioSystem.playTap();
  });

  // Add Friend Handler
  lobbyUI.addFriendBtn.addEventListener("click", async () => {
    const friendUsername = lobbyUI.addFriendInput.value.trim();
    if (!friendUsername) {
      alert("Por favor ingresa un nombre de usuario.");
      return;
    }
    
    lobbyUI.addFriendBtn.disabled = true;
    const origText = lobbyUI.addFriendBtn.textContent;
    lobbyUI.addFriendBtn.textContent = "...";
    
    try {
      await authSystem.addFriend(currentUser, friendUsername);
      lobbyUI.addFriendInput.value = "";
      alert(`¡${friendUsername} ha sido agregado a tus amigos!`);
      
      // Refresh cache and render list
      const updatedStats = await authSystem.getUserStats(currentUser.uid);
      if (updatedStats) {
        currentUser = updatedStats;
        renderFriendsList();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      lobbyUI.addFriendBtn.disabled = false;
      lobbyUI.addFriendBtn.textContent = origText;
    }
  });

  // Quick Play Matchmaking
  lobbyUI.quickPlayBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    lobbyUI.quickPlayBtn.disabled = true;
    lobbyUI.quickPlayBtn.textContent = "BUSCANDO...";

    try {
      await lobbySystem.quickPlay(
        currentUser,
        selectedMode,
        // Match found!
        (lobbyData) => {
          activeLobby = lobbyData;
          lobbyUI.quickPlayBtn.disabled = false;
          lobbyUI.quickPlayBtn.textContent = "PARTIDA RÁPIDA";
          
          // Only connect to relay if we are not already connected as Host
          const isHost = lobbyData.hostUsername === currentUser.username;
          if (!isHost) {
            connectToGameRelay(lobbyData.roomCode, currentUser.username);
          } else {
            // Update waiting room UI with guest info
            setupWaitingRoom(lobbyData);
          }
        },
        // Waiting in lobby...
        (roomCode) => {
          activeLobby = { roomCode, mode: selectedMode, hostUsername: currentUser.username, guestUsername: null };
          setupWaitingRoom(activeLobby);
          switchView("waiting-view");
          lobbyUI.quickPlayBtn.disabled = false;
          lobbyUI.quickPlayBtn.textContent = "PARTIDA RÁPIDA";
        }
      );
    } catch (e) {
      alert(e.message);
      lobbyUI.quickPlayBtn.disabled = false;
      lobbyUI.quickPlayBtn.textContent = "PARTIDA RÁPIDA";
    }
  });

  // Logout
  lobbyUI.logoutBtn.addEventListener("click", () => {
    authSystem.logout();
    audioSystem.playTap();
  });
}

function updateLobbyProfileUI(userData) {
  lobbyUI.profileName.textContent = userData.username;
  
  // Calculate a mock Rank Level based on total wins
  const wins = userData.totalWins || 0;
  let rank = "RECLUTA";
  if (wins >= 50) rank = "LEYENDA ELITE";
  else if (wins >= 25) rank = "MAESTRO TÁCTICO";
  else if (wins >= 10) rank = "ESPECIALISTA";
  else if (wins >= 3) rank = "VETERANO DE COMBATE";
  
  lobbyUI.profileLevel.textContent = `Rango: ${rank}`;
  
  // Calculate Gamer Level and XP Progress bar
  const levelNum = Math.floor(wins / 3) + 1;
  const winsInCurrentLevel = wins % 3;
  const xpPercentage = (winsInCurrentLevel / 3) * 100;

  const levelNumEl = document.getElementById("gamer-level-num");
  const xpTextEl = document.getElementById("gamer-xp-text");
  const xpFillEl = document.getElementById("gamer-xp-fill");

  if (levelNumEl) levelNumEl.textContent = `NIVEL ${levelNum}`;
  if (xpTextEl) xpTextEl.textContent = `${winsInCurrentLevel}/3 Victorias`;
  if (xpFillEl) xpFillEl.style.width = `${xpPercentage}%`;

  lobbyUI.highScore.textContent = userData.highScoreScoreMode || 0;
  lobbyUI.totalWins.textContent = wins;
  
  lobbyUI.playedScore.textContent = userData.gamesPlayedScoreMode || 0;
  lobbyUI.winsScore.textContent = userData.winsScoreMode || 0;
  lobbyUI.lossesScore.textContent = userData.lossesScoreMode || 0;

  lobbyUI.playedSudden.textContent = userData.gamesPlayedSuddenDeath || 0;
  lobbyUI.winsSudden.textContent = userData.winsSuddenDeath || 0;
  lobbyUI.lossesSudden.textContent = userData.lossesSuddenDeath || 0;
}

// 3. WAITING SCREEN LOGIC
function startLobbyHeartbeat(roomCode) {
  stopLobbyHeartbeat();
  
  // Immediately update heartbeat once
  lobbySystem.updateHeartbeat(roomCode);
  
  lobbyHeartbeatInterval = setInterval(() => {
    lobbySystem.updateHeartbeat(roomCode);
  }, 10000); // 10 seconds
}

function stopLobbyHeartbeat() {
  if (lobbyHeartbeatInterval) {
    clearInterval(lobbyHeartbeatInterval);
    lobbyHeartbeatInterval = null;
  }
}

function setupWaitingRoom(lobbyData) {
  waitingUI.roomCodeVal.textContent = lobbyData.roomCode;
  waitingUI.hostName.textContent = `${lobbyData.hostUsername} (P1)`;
  
  if (lobbyData.guestUsername) {
    waitingUI.guestName.textContent = `${lobbyData.guestUsername} (P2)`;
    waitingUI.guestDot.className = "player-dot dot-online";
    waitingUI.statusText.textContent = "¡Jugador conectado! Iniciando...";
  } else {
    waitingUI.guestName.textContent = "Esperando oponente...";
    waitingUI.guestDot.className = "player-dot dot-offline";
    waitingUI.statusText.textContent = "Esperando que se unan a la sala...";
    
    // Connect to WebSocket Relay room while waiting as Host
    connectToGameRelay(lobbyData.roomCode, currentUser.username);

    // Start heartbeat updates to Firestore
    startLobbyHeartbeat(lobbyData.roomCode);
  }
}

function setupWaitingHandlers() {
  waitingUI.copyBtn.addEventListener("click", () => {
    const code = waitingUI.roomCodeVal.textContent;
    navigator.clipboard.writeText(code).then(() => {
      alert(`¡Código ${code} copiado al portapapeles!`);
    });
    audioSystem.playTap();
  });

  waitingUI.cancelBtn.addEventListener("click", async () => {
    audioSystem.playTap();
    if (sentInviteId) {
      await cancelWaitingRoom();
    } else {
      stopLobbyHeartbeat();
      if (activeLobby) {
        lobbySystem.cancelActiveLobbyListener();
        if (activeLobby.hostUsername === currentUser.username) {
          await lobbySystem.deleteLobby(activeLobby.roomCode);
        }
      }
      if (relay) {
        relay.close();
        relay = null;
      }
      activeLobby = null;
      switchView("lobby-view");
    }
  });
}

// 4. GAME SCREEN REALTIME SYNC (WEBSOCKETS RELAY)
function connectToGameRelay(roomCode, username) {
  if (relay) {
    relay.close();
  }

  relay = new GameRelay();
  relay.connect(roomCode, username, {
    onConnect: () => {
      console.log("[App] WebSocket connected.");
      // Send ready handshake
      relay.send({
        action: "client_ready",
        username: currentUser.username
      });
    },
    onSystem: (action, user, message) => {
      console.log(`[App System] ${user} did ${action}`);
      if (action === "join") {
        // Ignore our own join system message
        if (user === currentUser.username) return;

        // Player 2 connected to websocket room!
        if (activeLobby && currentUser.username === activeLobby.hostUsername) {
          // Host updates active lobby data
          activeLobby.guestUsername = user;
          setupWaitingRoom(activeLobby);
        }
      } else if (action === "leave") {
        // Ignore our own leave system message (though we won't get it since we'd be closed)
        if (user === currentUser.username) return;
        handleOpponentDisconnected(user);
      }
    },
    onGameMessage: (sender, payload) => {
      handleIncomingGameAction(sender, payload);
    },
    onDisconnect: () => {
      console.log("[App] WebSocket closed.");
    },
    onError: (err) => {
      console.error("[App] WebSocket error:", err);
    }
  });
}

// Host determines initial conditions and syncs them to Guest
function initiateGameStart() {
  if (gameStartTimeout) return; // Prevent double trigger
  if (views.game.classList.contains("active")) return; // Game already in progress
  
  // Decide randomly who goes first
  const goesFirst = Math.random() < 0.5 ? activeLobby.hostUsername : activeLobby.guestUsername;
  
  // Generate initial pools of pieces
  const p1Initial = getRandomPieces();
  const p2Initial = getRandomPieces();

  const initPayload = {
    action: "game_init",
    mode: activeLobby.mode,
    hostUsername: activeLobby.hostUsername,
    guestUsername: activeLobby.guestUsername,
    turn: goesFirst,
    p1Pieces: p1Initial,
    p2Pieces: p2Initial
  };

  // Send to guest
  gameStartTimeout = setTimeout(() => {
    relay.send(initPayload);
    // Initialize our own local game state
    setupLocalGameState(initPayload);
    gameStartTimeout = null;
  }, 1000); // Small timeout to ensure guest socket is ready
}

function setupLocalGameState(payload) {
  stopLobbyHeartbeat();
  if (gameStartTimeout) {
    clearTimeout(gameStartTimeout);
    gameStartTimeout = null;
  }
  gameState.board = createBoard();
  gameState.p1Username = payload.hostUsername;
  gameState.p2Username = payload.guestUsername;
  gameState.p1Score = 0;
  gameState.p2Score = 0;
  gameState.p1Streak = 0;
  gameState.p2Streak = 0;
  gameState.p1Pieces = payload.p1Pieces;
  gameState.p2Pieces = payload.p2Pieces;
  gameState.turn = payload.turn;
  gameState.mode = payload.mode;
  gameState.isGameOver = false;
  gameState.rematchRequested = false;
  gameState.opponentRematchRequested = false;

  // Determine our role
  gameState.playerRole = (currentUser.username === gameState.p1Username) ? "host" : "guest";

  // Hide Waiting room / game over screen & enter Game view
  switchView("game-view");
  
  // Render Board & HUD
  renderBoard();
  renderHUD();
  renderPieces();
  
  // Check if we start and if we have legal moves (always true at start)
  checkLocalMoveValidity();
}

function handleIncomingGameAction(sender, payload) {
  switch (payload.action) {
    case "client_ready":
      // If we are Host, check if the ready message is from the Guest
      const isHost = (activeLobby && activeLobby.hostUsername === currentUser.username) || gameState.playerRole === "host";
      if (isHost) {
        if (sender !== currentUser.username) {
          console.log(`[App] Guest "${sender}" is ready. Starting game...`);
          initiateGameStart();
        }
      } else {
        // If we are Guest, and we receive Host's ready, send ready back to confirm handshake
        if (sender !== currentUser.username) {
          console.log(`[App] Host "${sender}" is ready. Confirming ready...`);
          relay.send({
            action: "client_ready",
            username: currentUser.username
          });
        }
      }
      break;

    case "game_init":
      setupLocalGameState(payload);
      break;

    case "game_move":
      // Synch board layout and scores
      gameState.board = payload.board;
      gameState.p1Score = payload.scores.host;
      gameState.p2Score = payload.scores.guest;
      gameState.p1Streak = payload.streaks.host;
      gameState.p2Streak = payload.streaks.guest;
      
      // Update piece trays
      if (gameState.playerRole === "host") {
        // We are host, so the opponent's pieces are the guest's pieces
        gameState.p2Pieces = payload.opponentPieces;
      } else {
        // We are guest, so the opponent's pieces are the host's pieces
        gameState.p1Pieces = payload.opponentPieces;
      }
      
      gameState.turn = payload.nextTurn;

      // Render updates
      renderBoard();
      renderHUD();
      renderPieces();

      // Trigger board-clear visual animations if lines were cleared by opponent
      if (payload.clears && payload.clears.count > 0) {
        animateLineClears(payload.clears);
        audioSystem.playClear();
        showComboAlertText(payload.clears, sender);
      } else {
        audioSystem.playPlace();
      }

      // Check if it's now our turn and if we can move
      checkLocalMoveValidity();
      break;

    case "game_over":
      triggerGameOver(payload.winner, payload.loser, payload.reason);
      break;

    case "reaction":
      spawnFloatingEmoji(payload.emoji);
      break;

    case "rematch_request":
      gameState.opponentRematchRequested = true;
      updateRematchUI();
      break;

    case "rematch_accept":
      // Start a new game with Host generating new configurations
      if (gameState.playerRole === "host") {
        initiateGameStart();
      }
      break;
  }
}

// 5. CORE GAME MECHANICS & RENDER LOGIC

function renderBoard() {
  gameUI.board.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      
      const fillColor = gameState.board[r][c];
      if (fillColor) {
        cell.classList.add("block-filled");
        cell.style.backgroundColor = fillColor;
        cell.style.boxShadow = `inset 0 3px 5px rgba(255, 255, 255, 0.4), inset 0 -3px 5px rgba(0, 0, 0, 0.35), 0 6px 14px ${fillColor}55`;
      }
      gameUI.board.appendChild(cell);
    }
  }
}

function renderHUD() {
  gameUI.p1Name.textContent = gameState.p1Username;
  gameUI.p2Name.textContent = gameState.p2Username;
  gameUI.p1Score.textContent = gameState.p1Score;
  gameUI.p2Score.textContent = gameState.p2Score;

  // Streak indicators
  if (gameState.p1Streak > 1) {
    gameUI.p1Streak.classList.remove("hidden");
    gameUI.p1Streak.textContent = `${gameState.p1Streak} 🔥`;
  } else {
    gameUI.p1Streak.classList.add("hidden");
  }

  if (gameState.p2Streak > 1) {
    gameUI.p2Streak.classList.remove("hidden");
    gameUI.p2Streak.textContent = `${gameState.p2Streak} 🔥`;
  } else {
    gameUI.p2Streak.classList.add("hidden");
  }

  // Turn badge
  const isMyTurn = (gameState.turn === currentUser.username);
  if (isMyTurn) {
    gameUI.turnIndicator.textContent = "TU TURNO";
    gameUI.turnIndicator.className = "turn-badge your-turn";
    document.getElementById("game-view").classList.add("my-turn-active");
  } else {
    gameUI.turnIndicator.textContent = `TURNO DE ${gameState.turn.toUpperCase()}`;
    gameUI.turnIndicator.className = "turn-badge op-turn";
    document.getElementById("game-view").classList.remove("my-turn-active");
  }

  // Mode badge
  gameUI.modeBadge.textContent = gameState.mode === "score" ? "Puntaje" : "Muerte Súbita";
}

function renderPieces() {
  // Clear trays
  gameUI.mySlots.forEach(slot => slot.innerHTML = "");

  const isMyTurn = (gameState.turn === currentUser.username);
  const myPieces = (gameState.playerRole === "host") ? gameState.p1Pieces : gameState.p2Pieces;

  // Render My Pieces
  myPieces.forEach((piece, index) => {
    const slot = gameUI.mySlots[index];
    if (!piece) return;

    const pieceEl = createPieceDOM(piece, false);
    pieceEl.dataset.slotIndex = index;
    
    // Only bind drag events if it is indeed my turn
    if (isMyTurn) {
      bindDragEvents(pieceEl);
    } else {
      pieceEl.style.opacity = "0.7";
      pieceEl.style.cursor = "not-allowed";
    }

    slot.appendChild(pieceEl);
  });
}

// Create the grid representation of a piece
function createPieceDOM(piece, isMini = false) {
  const container = document.createElement("div");
  container.className = "piece-visual";
  
  const grid = piece.grid;
  const rCount = grid.length;
  const cCount = grid[0].length;
  
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "2px";

  // If rendering inside tray slots, scale it down slightly so larger pieces fit
  const scaleVal = isMini ? 0.45 : 0.65;
  container.style.transform = `scale(${scaleVal})`;

  for (let r = 0; r < rCount; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "piece-row";
    rowEl.style.display = "flex";
    rowEl.style.gap = "2px";

    for (let c = 0; c < cCount; c++) {
      const blockEl = document.createElement("div");
      blockEl.className = "piece-block";
      
      if (grid[r][c] === 1) {
        blockEl.style.backgroundColor = piece.color;
        blockEl.style.borderColor = "rgba(255,255,255,0.2)";
        blockEl.style.boxShadow = `inset 0 1px 2px rgba(255,255,255,0.25)`;
      } else {
        blockEl.style.backgroundColor = "transparent";
        blockEl.style.border = "none";
        blockEl.style.boxShadow = "none";
      }
      rowEl.appendChild(blockEl);
    }
    container.appendChild(rowEl);
  }

  return container;
}

// Line clears animations
function animateLineClears(clears) {
  const boardCells = gameUI.board.querySelectorAll(".board-cell");
  
  boardCells.forEach(cell => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);

    if (clears.rows.includes(r) || clears.cols.includes(c)) {
      cell.classList.remove("block-filled");
      cell.classList.add("block-cleared");
      
      // Cleanup animation class after completion
      setTimeout(() => {
        cell.classList.remove("block-cleared");
        cell.style.backgroundColor = "";
        cell.style.boxShadow = "";
      }, 300);
    }
  });
}

// floating alert texts like "+30 COMBO!"
function showComboAlertText(clears, player) {
  let text = "";
  if (clears.count > 1) {
    text = `¡COMBO x${clears.count}!`;
  } else {
    text = "+10 LÍNEA";
  }

  // Find streak
  const streak = (player === gameState.p1Username) ? gameState.p1Streak : gameState.p2Streak;
  if (streak > 1) {
    text += `<br>${streak} EN RACHA 🔥`;
  }

  const alertEl = document.createElement("div");
  alertEl.className = "floating-text-alert";
  alertEl.innerHTML = text;
  
  // Random placement offset inside board
  alertEl.style.left = `${20 + Math.random() * 50}%`;
  alertEl.style.top = `${35 + Math.random() * 20}%`;
  
  gameUI.alerts.appendChild(alertEl);
  
  setTimeout(() => {
    alertEl.remove();
  }, 1000);
}

// 6. TOUCH / MOUSE DRAG AND DROP ENGINE

function bindDragEvents(element) {
  // Unify touch and mouse interactions
  element.addEventListener("touchstart", onDragStart, { passive: false });
  element.addEventListener("mousedown", onDragStart);
}

function getPointerCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function onDragStart(e) {
  // Prevent default scroll behavior
  e.preventDefault();

  const element = e.currentTarget;
  const slotIndex = parseInt(element.dataset.slotIndex);
  
  const myPieces = (gameState.playerRole === "host") ? gameState.p1Pieces : gameState.p2Pieces;
  const piece = myPieces[slotIndex];
  
  if (!piece) return;

  dragInfo.isDragging = true;
  dragInfo.slotIndex = slotIndex;
  dragInfo.piece = piece;
  dragInfo.isTouch = !!e.touches;

  const coords = getPointerCoords(e);
  dragInfo.startX = coords.x;
  dragInfo.startY = coords.y;

  // Calculate board layout dimensions for hover hitboxes first
  dragInfo.boardRect = gameUI.board.getBoundingClientRect();
  dragInfo.cellWidth = dragInfo.boardRect.width / 8;
  dragInfo.cellHeight = dragInfo.boardRect.height / 8;

  // Initialize snapping states
  dragInfo.lastHitRow = -1;
  dragInfo.lastHitCol = -1;
  dragInfo.lastIsValid = false;

  // Create floating representation matching board cell size
  createFloatingDragVisual(piece, coords.x, coords.y);

  // Hide original element inside tray
  element.style.visibility = "hidden";

  audioSystem.playTap();

  // Attach window event handlers
  window.addEventListener("touchmove", onDragMove, { passive: false });
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("touchend", onDragEnd);
  window.addEventListener("mouseup", onDragEnd);
}

function createFloatingDragVisual(piece, x, y) {
  if (dragInfo.floatingVisual) {
    dragInfo.floatingVisual.remove();
  }

  const container = document.createElement("div");
  container.id = "dragged-piece-visual-floating";
  
  const grid = piece.grid;
  const rCount = grid.length;
  const cCount = grid[0].length;
  
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "5px"; // Match board gap

  for (let r = 0; r < rCount; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "piece-row";
    rowEl.style.display = "flex";
    rowEl.style.gap = "5px"; // Match board gap

    for (let c = 0; c < cCount; c++) {
      const blockEl = document.createElement("div");
      blockEl.className = "piece-block";
      
      // Match board cell size exactly
      blockEl.style.width = `${dragInfo.cellWidth - 5}px`;
      blockEl.style.height = `${dragInfo.cellHeight - 5}px`;
      
      if (grid[r][c] === 1) {
        blockEl.style.backgroundColor = piece.color;
        blockEl.style.borderColor = "rgba(255,255,255,0.22)";
        blockEl.style.boxShadow = `inset 0 3px 5px rgba(255, 255, 255, 0.4), inset 0 -3px 5px rgba(0, 0, 0, 0.35)`;
      } else {
        blockEl.style.backgroundColor = "transparent";
        blockEl.style.border = "none";
        blockEl.style.boxShadow = "none";
      }
      rowEl.appendChild(blockEl);
    }
    container.appendChild(rowEl);
  }

  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.transform = "translate3d(0, 0, 0)";

  document.body.appendChild(container);
  dragInfo.floatingVisual = container;

  // Center visual slightly and offset vertically above finger
  updateFloatingVisualPosition(x, y);
}

function updateFloatingVisualPosition(x, y) {
  if (!dragInfo.floatingVisual) return;
  
  // Piece grid dimensions
  const grid = dragInfo.piece.grid;
  const rCount = grid.length;
  const cCount = grid[0].length;
  
  // Exact dimensions based on board scale
  const visualWidth = cCount * dragInfo.cellWidth - 5;
  const visualHeight = rCount * dragInfo.cellHeight - 5;

  // Position it so the pointer is centered
  const offsetY = dragInfo.isTouch ? dragInfo.offsetY : 0;
  const posX = x - (visualWidth / 2);
  const posY = y + offsetY - (visualHeight / 2);

  dragInfo.floatingVisual.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;

  dragInfo.currentX = posX;
  dragInfo.currentY = posY;
}

function onDragMove(e) {
  if (!dragInfo.isDragging) return;
  e.preventDefault();

  const coords = getPointerCoords(e);
  updateFloatingVisualPosition(coords.x, coords.y);

  // Clear all hover grid highlights
  clearBoardHighlights();

  // Find board row and column under the floating piece's hot spot (top-left block index)
  const hitRow = Math.round((dragInfo.currentY - dragInfo.boardRect.top) / dragInfo.cellHeight);
  const hitCol = Math.round((dragInfo.currentX - dragInfo.boardRect.left) / dragInfo.cellWidth);

  // Check if target coordinates are within boundaries
  const isValid = canPlacePiece(gameState.board, dragInfo.piece.grid, hitRow, hitCol);

  // Save snapping target values
  dragInfo.lastHitRow = hitRow;
  dragInfo.lastHitCol = hitCol;
  dragInfo.lastIsValid = isValid;

  if (isValid) {
    highlightBoardCells(hitRow, hitCol, dragInfo.piece.grid, true);
  } else {
    // Show hovered single cell as red/invalid if floating overlap
    if (hitRow >= 0 && hitRow < 8 && hitCol >= 0 && hitCol < 8) {
      const cellEl = gameUI.board.querySelector(`[data-row="${hitRow}"][data-col="${hitCol}"]`);
      if (cellEl) cellEl.classList.add("cell-invalid-hover");
    }
  }
}

function highlightBoardCells(startRow, startCol, pieceGrid, isValid) {
  const pRows = pieceGrid.length;
  const pCols = pieceGrid[0].length;

  for (let r = 0; r < pRows; r++) {
    for (let c = 0; c < pCols; c++) {
      if (pieceGrid[r][c] === 1) {
        const boardRow = startRow + r;
        const boardCol = startCol + c;
        
        if (boardRow >= 0 && boardRow < 8 && boardCol >= 0 && boardCol < 8) {
          const cellEl = gameUI.board.querySelector(`[data-row="${boardRow}"][data-col="${boardCol}"]`);
          if (cellEl) {
            cellEl.classList.add(isValid ? "cell-valid-hover" : "cell-invalid-hover");
          }
        }
      }
    }
  }
}

function clearBoardHighlights() {
  const cells = gameUI.board.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.classList.remove("cell-valid-hover", "cell-invalid-hover");
  });
}

async function onDragEnd(e) {
  if (!dragInfo.isDragging) return;
  dragInfo.isDragging = false;

  // Cleanup events
  window.removeEventListener("touchmove", onDragMove);
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("touchend", onDragEnd);
  window.removeEventListener("mouseup", onDragEnd);

  // Remove visual floating element
  if (dragInfo.floatingVisual) {
    dragInfo.floatingVisual.remove();
    dragInfo.floatingVisual = null;
  }

  // Restore hidden slot element
  const slotEl = gameUI.mySlots[dragInfo.slotIndex].querySelector(".piece-visual");
  if (slotEl) {
    slotEl.style.visibility = "visible";
  }

  // Compute final placement target
  const hitRow = dragInfo.lastHitRow;
  const hitCol = dragInfo.lastHitCol;

  const isValid = dragInfo.lastIsValid && canPlacePiece(gameState.board, dragInfo.piece.grid, hitRow, hitCol);

  if (isValid) {
    // 1. Write blocks to board
    const cellsCount = placePiece(gameState.board, dragInfo.piece, hitRow, hitCol);
    
    // 2. Check for completed lines
    const clears = checkLineClears(gameState.board);
    
    // 3. Compute score changes
    const curStreak = (gameState.playerRole === "host") ? gameState.p1Streak : gameState.p2Streak;
    const scoreResult = calculateScore(cellsCount, clears.count, curStreak);

    // 4. Update state variables
    if (gameState.playerRole === "host") {
      gameState.p1Score += scoreResult.scoreGained;
      gameState.p1Streak = scoreResult.nextStreak;
      gameState.p1Pieces[dragInfo.slotIndex] = null;
      
      // Replenish Host pieces if all 3 used
      if (gameState.p1Pieces.every(p => p === null)) {
        gameState.p1Pieces = getRandomPieces();
      }
    } else {
      gameState.p2Score += scoreResult.scoreGained;
      gameState.p2Streak = scoreResult.nextStreak;
      gameState.p2Pieces[dragInfo.slotIndex] = null;

      // Replenish Guest pieces if all 3 used
      if (gameState.p2Pieces.every(p => p === null)) {
        gameState.p2Pieces = getRandomPieces();
      }
    }

    // Play sounds
    if (clears.count > 0) {
      if (clears.count > 2 || scoreResult.nextStreak > 1) {
        audioSystem.playCombo(clears.count + scoreResult.nextStreak);
      } else {
        audioSystem.playClear();
      }
      animateLineClears(clears);
      showComboAlertText(clears, currentUser.username);
    } else {
      audioSystem.playPlace();
    }

    // Switch turn control
    const nextTurn = (gameState.playerRole === "host") ? gameState.p2Username : gameState.p1Username;
    gameState.turn = nextTurn;

    // Redraw screen
    renderBoard();
    renderHUD();
    renderPieces();

    // 5. Send state updates via websocket
    const myUpdatedPieces = (gameState.playerRole === "host") ? gameState.p1Pieces : gameState.p2Pieces;
    
    relay.send({
      action: "game_move",
      board: gameState.board,
      scores: {
        host: gameState.p1Score,
        guest: gameState.p2Score
      },
      streaks: {
        host: gameState.p1Streak,
        guest: gameState.p2Streak
      },
      clears: clears.count > 0 ? clears : null,
      opponentPieces: myUpdatedPieces,
      nextTurn: nextTurn
    });

    // Check if the game is over due to the opponent having no moves.
    // However, the opponent checks this themselves when they receive their turn message.

  } else {
    // Snapback failure
    audioSystem.playError();
  }

  clearBoardHighlights();
}

// 7. GAME PLAY VALIDATION & GAME OVER LOGIC

function checkLocalMoveValidity() {
  const isMyTurn = (gameState.turn === currentUser.username);
  if (!isMyTurn || gameState.isGameOver) return;

  const myPieces = (gameState.playerRole === "host") ? gameState.p1Pieces : gameState.p2Pieces;

  // Verify if we have any valid move left for any remaining pieces
  const hasMoves = hasAnyLegalMoves(gameState.board, myPieces);

  if (!hasMoves) {
    // Game over for us!
    gameState.isGameOver = true;
    
    // Determine winner based on game mode
    let winner = "";
    let loser = currentUser.username;
    
    if (gameState.mode === "score") {
      // Score Mode: high score wins
      if (gameState.p1Score > gameState.p2Score) {
        winner = gameState.p1Username;
      } else if (gameState.p2Score > gameState.p1Score) {
        winner = gameState.p2Username;
      } else {
        winner = "draw"; // Draw
      }
    } else {
      // Sudden Death Mode: if I blocked, opponent wins
      winner = (gameState.playerRole === "host") ? gameState.p2Username : gameState.p1Username;
    }

    const overPayload = {
      action: "game_over",
      winner: winner,
      loser: loser,
      reason: "no_moves"
    };

    // Send game over command
    relay.send(overPayload);

    // Apply locally
    triggerGameOver(winner, loser, "no_moves");
  }
}

async function triggerGameOver(winner, loser, reason) {
  gameState.isGameOver = true;
  
  // Show GameOver Modal
  views.gameoverModal.classList.remove("hidden");
  
  // Populate scores
  gameoverUI.p1Name.textContent = gameState.p1Username;
  gameoverUI.p2Name.textContent = gameState.p2Username;
  gameoverUI.p1Score.textContent = gameState.p1Score;
  gameoverUI.p2Score.textContent = gameState.p2Score;

  // Set outcome visuals
  const isWinner = (winner === currentUser.username);
  const isDraw = (winner === "draw");

  if (isDraw) {
    gameoverUI.title.textContent = "¡EMPATE!";
    gameoverUI.title.style.color = "var(--combo-gold)";
    gameoverUI.title.style.textShadow = "0 0 20px var(--combo-gold-glow)";
    gameoverUI.reason.textContent = "Ambos jugadores obtuvieron la misma puntuación.";
  } else if (isWinner) {
    gameoverUI.title.textContent = "¡VICTORIA!";
    gameoverUI.title.style.color = "var(--p1-cyan)";
    gameoverUI.title.style.textShadow = "0 0 20px var(--p1-cyan-glow)";
    
    if (reason === "no_moves") {
      gameoverUI.reason.textContent = loser === currentUser.username ? "Te quedaste sin movimientos pero superaste en puntos." : "El oponente se quedó sin movimientos posibles.";
    } else if (reason === "disconnected") {
      gameoverUI.reason.textContent = "El oponente se desconectó de la partida.";
    }
  } else {
    gameoverUI.title.textContent = "¡DERROTA!";
    gameoverUI.title.style.color = "var(--p2-pink)";
    gameoverUI.title.style.textShadow = "0 0 20px var(--p2-pink-glow)";
    
    if (gameState.mode === "sudden_death") {
      gameoverUI.reason.textContent = "Te quedaste sin movimientos posibles.";
    } else {
      gameoverUI.reason.textContent = loser === currentUser.username ? "Te quedaste sin movimientos posibles." : "El oponente obtuvo más puntos.";
    }
  }

  // Play result sound
  audioSystem.playGameOver(isWinner && !isDraw);

  // Write stats to Firestore database
  try {
    const finalScore = (gameState.playerRole === "host") ? gameState.p1Score : gameState.p2Score;
    await authSystem.updateStats(
      currentUser.uid,
      gameState.mode,
      isWinner && !isDraw,
      gameState.mode === "score" ? finalScore : null
    );
    // Refresh local cache stats
    const updatedStats = await authSystem.getUserStats(currentUser.uid);
    if (updatedStats) {
      currentUser = updatedStats;
      updateLobbyProfileUI(updatedStats);
    }
  } catch (error) {
    console.error("Failed to write game over statistics:", error);
  }
}

function handleOpponentDisconnected(user) {
  // If we are actively in the game screen, award automatic victory
  const inGame = (views.game.classList.contains("active"));
  if (inGame && !gameState.isGameOver) {
    gameState.isGameOver = true;
    
    const winner = currentUser.username;
    const loser = user;
    
    relay.send({
      action: "game_over",
      winner: winner,
      loser: loser,
      reason: "disconnected"
    });
    
    triggerGameOver(winner, loser, "disconnected");
  } else if (views.waiting.classList.contains("active")) {
    // If opponent leaves waiting room lobby
    if (activeLobby) {
      activeLobby.guestUsername = null;
      setupWaitingRoom(activeLobby);
    }
  }
}

// Rematch loop
function setupGameOverHandlers() {
  gameoverUI.rematchBtn.addEventListener("click", () => {
    if (gameState.rematchRequested) return;
    
    gameState.rematchRequested = true;
    audioSystem.playTap();

    if (gameState.opponentRematchRequested) {
      // Both clicked rematch! Start it up.
      relay.send({ action: "rematch_accept" });
      if (gameState.playerRole === "host") {
        initiateGameStart();
      }
    } else {
      // Ask opponent for rematch
      relay.send({ action: "rematch_request" });
      updateRematchUI();
    }
  });

  gameoverUI.menuBtn.addEventListener("click", async () => {
    audioSystem.playTap();
    
    // Close websocket relay connection and clean up
    if (relay) {
      relay.close();
      relay = null;
    }
    
    if (activeLobby) {
      if (gameState.playerRole === "host") {
        await lobbySystem.deleteLobby(activeLobby.roomCode);
      }
      activeLobby = null;
    }

    switchView("lobby-view");
  });
}

function updateRematchUI() {
  if (gameState.rematchRequested && gameState.opponentRematchRequested) {
    gameoverUI.rematchStatus.textContent = "Iniciando partida...";
  } else if (gameState.rematchRequested) {
    gameoverUI.rematchStatus.textContent = "Esperando al oponente...";
    gameoverUI.rematchBtn.disabled = true;
    gameoverUI.rematchBtn.textContent = "PENDIENTE";
  } else if (gameState.opponentRematchRequested) {
    gameoverUI.rematchStatus.textContent = "¡El oponente quiere revancha!";
  }
}

// 8. REACTIONS & CHAT EMOJIS
function setupGameControls() {
  // Reactions Tray toggler
  gameUI.reactionToggle.addEventListener("click", () => {
    gameUI.reactionOptions.classList.toggle("hidden");
    audioSystem.playTap();
  });

  // Reaction Emoji click handlers
  gameUI.reactionBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      
      // Send emoji via websocket
      if (relay) {
        relay.send({
          action: "reaction",
          emoji: emoji
        });
      }
      
      // Spawn local floating effect
      spawnFloatingEmoji(emoji);
      
      // Hide reaction panel
      gameUI.reactionOptions.classList.add("hidden");
      audioSystem.playTap();
    });
  });
}

function spawnFloatingEmoji(emoji) {
  const emojiEl = document.createElement("div");
  emojiEl.className = "flying-emoji";
  emojiEl.textContent = emoji;
  
  // Random horizontal launch position
  const randX = Math.floor(20 + Math.random() * 60); // 20% to 80% width
  emojiEl.style.left = `${randX}%`;
  
  gameUI.emojiContainer.appendChild(emojiEl);
  
  // Auto remove after animation finishes
  setTimeout(() => {
    emojiEl.remove();
  }, 1800);
}

// View switcher setup helper
function setupViewSwitcher() {
  // No-op (previously handled room code popup click-away)
}

// 9. FRIENDS AND INVITATIONS SYSTEM LOGIC

function startIncomingInvitesListener(uid) {
  stopIncomingInvitesListener();
  incomingInvitesUnsubscribe = inviteSystem.listenToIncomingInvites(
    uid,
    (invite) => {
      showInviteNotification(invite);
    },
    (inviteId) => {
      removeInviteNotification(inviteId);
    }
  );
}

function removeInviteNotification(inviteId) {
  const notif = document.getElementById(`invite-notif-${inviteId}`);
  if (notif) {
    notif.remove();
  }
}

function stopIncomingInvitesListener() {
  if (incomingInvitesUnsubscribe) {
    incomingInvitesUnsubscribe();
    incomingInvitesUnsubscribe = null;
  }
}

function showInviteNotification(invite) {
  if (document.getElementById(`invite-notif-${invite.id}`)) return;
  
  const container = document.getElementById("invite-notification-container");
  if (!container) return;
  
  const notif = document.createElement("div");
  notif.id = `invite-notif-${invite.id}`;
  notif.className = "invite-notification glass-card";
  
  const modeText = invite.mode === "score" ? "Puntaje" : "Muerte Súbita";
  
  notif.innerHTML = `
    <div class="invite-notification-info">
      <div class="invite-notification-title"><span>${invite.senderUsername}</span> te invita a jugar!</div>
      <div class="invite-notification-mode">Modo: ${modeText}</div>
    </div>
    <div class="invite-notification-actions">
      <button class="btn invite-action-btn invite-btn-decline" id="decline-${invite.id}">Rechazar</button>
      <button class="btn invite-action-btn invite-btn-accept" id="accept-${invite.id}">Aceptar</button>
    </div>
  `;
  
  notif.querySelector(`#decline-${invite.id}`).addEventListener("click", async () => {
    audioSystem.playTap();
    await inviteSystem.declineInvite(invite.id);
    notif.remove();
  });
  
  notif.querySelector(`#accept-${invite.id}`).addEventListener("click", async () => {
    audioSystem.playTap();
    
    // Accept invite in database
    await inviteSystem.acceptInvite(invite.id);
    
    // Setup local lobby data
    activeLobby = {
      roomCode: invite.roomCode,
      mode: invite.mode,
      hostUsername: invite.senderUsername,
      guestUsername: currentUser.username
    };
    
    // Connect to WebSocket Relay as Guest
    connectToGameRelay(invite.roomCode, currentUser.username);
    notif.remove();
  });
  
  container.appendChild(notif);
  
  // Auto decline and remove after 20 seconds
  setTimeout(() => {
    if (notif.parentNode) {
      inviteSystem.declineInvite(invite.id);
      notif.remove();
    }
  }, 20000);
}

async function sendInviteToFriend(friendUsername) {
  if (!currentUser) return;
  audioSystem.playTap();
  
  try {
    // Show waiting screen formatted as Invite Waiting
    waitingUI.title.textContent = "Invitando a jugar...";
    waitingUI.subtitle.textContent = `Esperando que ${friendUsername} acepte la invitación...`;
    waitingUI.roomCodeSection.classList.add("hidden");
    
    waitingUI.hostName.textContent = `${currentUser.username} (Tú)`;
    waitingUI.guestName.textContent = `${friendUsername}`;
    waitingUI.guestDot.className = "player-dot dot-offline";
    waitingUI.statusText.textContent = "Invitación enviada...";
    
    switchView("waiting-view");
    
    // Create direct invite document
    const invite = await inviteSystem.sendInvite(currentUser, friendUsername, selectedMode);
    sentInviteId = invite.id;
    
    // Setup activeLobby locally
    activeLobby = {
      roomCode: invite.roomCode,
      mode: invite.mode,
      hostUsername: currentUser.username,
      guestUsername: friendUsername
    };
    
    // Connect to WebSocket relay room immediately as Host
    connectToGameRelay(invite.roomCode, currentUser.username);
    
    // Start heartbeat
    startLobbyHeartbeat(invite.roomCode);
    
    // Listen for state changes on this invitation doc
    sentInviteUnsubscribe = inviteSystem.listenToInvite(invite.id, (updatedInvite) => {
      if (updatedInvite.status === "accepted") {
        console.log("[App] Invitation accepted. Starting WebSocket game...");
        cleanupSentInviteListener();
      } else if (updatedInvite.status === "declined") {
        alert(`${friendUsername} rechazó tu invitación.`);
        cancelWaitingRoom();
      }
    });
  } catch (err) {
    alert(err.message);
    cancelWaitingRoom();
  }
}

async function cancelWaitingRoom() {
  stopLobbyHeartbeat();
  cleanupSentInviteListener();
  
  if (sentInviteId) {
    await inviteSystem.cancelInvite(sentInviteId);
    sentInviteId = null;
  }
  
  if (relay) {
    relay.close();
    relay = null;
  }
  
  activeLobby = null;
  switchView("lobby-view");
}

function cleanupSentInviteListener() {
  if (sentInviteUnsubscribe) {
    sentInviteUnsubscribe();
    sentInviteUnsubscribe = null;
  }
}

function renderFriendsList() {
  if (!currentUser) return;
  const listEl = lobbyUI.friendsList;
  if (!listEl) return;
  listEl.innerHTML = "";
  
  const friends = currentUser.friends || [];
  if (friends.length === 0) {
    listEl.innerHTML = '<div class="friends-empty-msg">No has agregado amigos todavía.</div>';
    return;
  }
  
  friends.forEach((friendName) => {
    const row = document.createElement("div");
    row.className = "friend-row";
    row.innerHTML = `
      <div class="friend-info">
        <span class="friend-status-dot online"></span>
        <span class="friend-name">${friendName}</span>
      </div>
      <div class="friend-actions">
        <button class="friend-btn friend-btn-invite" data-username="${friendName}">Invitar</button>
        <button class="friend-btn friend-btn-remove" data-username="${friendName}">Eliminar</button>
      </div>
    `;
    
    row.querySelector(".friend-btn-invite").addEventListener("click", () => {
      sendInviteToFriend(friendName);
    });
    
    row.querySelector(".friend-btn-remove").addEventListener("click", async () => {
      if (confirm(`¿Estás seguro de eliminar a ${friendName} de tus amigos?`)) {
        audioSystem.playTap();
        try {
          await authSystem.removeFriend(currentUser, friendName);
          const updatedStats = await authSystem.getUserStats(currentUser.uid);
          if (updatedStats) {
            currentUser = updatedStats;
            renderFriendsList();
          }
        } catch (err) {
          alert(err.message);
        }
      }
    });
    
    listEl.appendChild(row);
  });
}
