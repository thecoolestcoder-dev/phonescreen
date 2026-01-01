// ----------------------
// FIREBASE CONFIG
// ----------------------
const firebaseConfig = {
  apiKey: "AIzaSyDFFIM-hOCR8BHL9W_ji8NJwLZH0OleAQ0",
  authDomain: "dvdlogothingy.firebaseapp.com",
  databaseURL: "https://dvdlogothingy-default-rtdb.firebaseio.com",
  projectId: "dvdlogothingy",
  storageBucket: "dvdlogothingy.firebasestorage.app",
  messagingSenderId: "203177996220",
  appId: "1:203177996220:web:5d95399673795bd9da05b9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ----------------------
// CANVAS SETUP
// ----------------------
const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ----------------------
// STATE
// ----------------------
const TAB_ID = crypto.randomUUID();
let roomCode = null;
let isHost = false;
let locked = false;
let screenPos = { x: 0, y: 0 };
let screens = {};
let dvd = null;
let selectedCell = null;

// ----------------------
// UI ELEMENTS
// ----------------------
const createBtn = document.getElementById("createRoom");
const joinBtn = document.getElementById("joinRoom");
const codeInput = document.getElementById("roomCode");
const grid = document.getElementById("grid");
const lockBtn = document.getElementById("lock");
const toggleUI = document.getElementById("toggleUI");

toggleUI.onclick = () => {
  ui.classList.toggle("hidden");
  toggleUI.textContent = ui.classList.contains("hidden") ? "Show Panel" : "Hide Panel";
};

// ----------------------
// MINI GRID
// ----------------------
for (let y = -1; y <= 1; y++) {
  for (let x = -1; x <= 1; x++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.x = x;
    cell.dataset.y = y;

    cell.onclick = () => {
      if (locked) return;
      if (selectedCell) selectedCell.classList.remove("me");
      cell.classList.add("me");
      selectedCell = cell;
      screenPos = { x, y };
    };

    grid.appendChild(cell);
  }
}

// ----------------------
// CREATE ROOM
// ----------------------
createBtn.onclick = async () => {
  roomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
  codeInput.value = roomCode;
  isHost = true;

  const roomRef = db.ref(`rooms/${roomCode}`);
  await roomRef.set({
    host: TAB_ID,
    screens: {},
    dvd: { x: 100, y: 100, w: 120, h: 60, vx: 200, vy: 150 }
  });

  listenRoom(roomCode);
};

// ----------------------
// JOIN ROOM
// ----------------------
joinBtn.onclick = async () => {
  roomCode = codeInput.value.trim().toUpperCase();
  if (!roomCode) return;

  const roomRef = db.ref(`rooms/${roomCode}`);
  const snapshot = await roomRef.get();
  if (!snapshot.exists()) {
    alert("Room not found");
    return;
  }

  listenRoom(roomCode);
};

// ----------------------
// LOCK POSITION
// ----------------------
lockBtn.onclick = () => {
  if (!roomCode) {
    alert("Create or join a room first");
    return;
  }
  locked = true;
  db.ref(`rooms/${roomCode}/screens/${TAB_ID}`).update({
    x: screenPos.x,
    y: screenPos.y,
    w: canvas.width,
    h: canvas.height,
    locked: true
  });
};

// ----------------------
// LISTEN ROOM
// ----------------------
function listenRoom(room) {
  const roomRef = db.ref(`rooms/${room}`);
  roomRef.on("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;

    screens = data.screens || {};
    dvd = data.dvd;
    if (!data.host && Object.keys(screens).length) {
      // Elect first tab as host
      const first = Object.keys(screens)[0];
      roomRef.update({ host: first });
    }
    isHost = data.host === TAB_ID;
  });

  // Register own screen in room if locked
  if (locked) {
    db.ref(`rooms/${room}/screens/${TAB_ID}`).update({
      x: screenPos.x,
      y: screenPos.y,
      w: canvas.width,
      h: canvas.height,
      locked: true
    });
  }
}

// ----------------------
// PHYSICS LOOP (HOST ONLY)
// ----------------------
function physicsLoop() {
  if (!isHost || !dvd || !roomCode) return;

  const dt = 1 / 60;
  dvd.x += dvd.vx * dt;
  dvd.y += dvd.vy * dt;

  // Calculate world bounds based on screens
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  Object.values(screens).forEach(s => {
    minX = Math.min(minX, s.x * canvas.width);
    minY = Math.min(minY, s.y * canvas.height);
    maxX = Math.max(maxX, s.x * canvas.width + s.w);
    maxY = Math.max(maxY, s.y * canvas.height + s.h);
  });

  const worldW = maxX - minX;
  const worldH = maxY - minY;

  // Bounce off world edges
  if (dvd.x <= 0 || dvd.x + dvd.w >= worldW) dvd.vx *= -1;
  if (dvd.y <= 0 || dvd.y + dvd.h >= worldH) dvd.vy *= -1;

  // Only allow moving to overlapping screens
  Object.values(screens).forEach(s => {
    const screenLeft = s.x * canvas.width;
    const screenTop = s.y * canvas.height;
    const screenRight = screenLeft + s.w;
    const screenBottom = screenTop + s.h;

    if (
      dvd.x < screenRight &&
      dvd.x + dvd.w > screenLeft &&
      dvd.y < screenBottom &&
      dvd.y + dvd.h > screenTop
    ) {
      // DVD is inside this screen, no adjustment needed
    } else {
      // Hit screen edge, bounce
      if (
        dvd.x + dvd.w < screenLeft ||
        dvd.x > screenRight
      ) dvd.vx *= -1;
      if (
        dvd.y + dvd.h < screenTop ||
        dvd.y > screenBottom
      ) dvd.vy *= -1;
    }
  });

  db.ref(`rooms/${roomCode}/dvd`).set(dvd);
}
setInterval(physicsLoop, 1000 / 60);

// ----------------------
// RENDER LOOP
// ----------------------
function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dvd || !screens[TAB_ID]) {
    requestAnimationFrame(loop);
    return;
  }

  const s = screens[TAB_ID];
  const worldOffsetX = s.x * canvas.width;
  const worldOffsetY = s.y * canvas.height;

  const localX = dvd.x - worldOffsetX;
  const localY = dvd.y - worldOffsetY;

  if (
    localX + dvd.w > 0 &&
    localX < canvas.width &&
    localY + dvd.h > 0 &&
    localY < canvas.height
  ) {
    ctx.fillStyle = "white";
    ctx.fillRect(localX, localY, dvd.w, dvd.h);
    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.fillText("DVD", localX + 35, localY + 38);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

