/* ======================
   FIREBASE SETUP
   ====================== */
// PASTE YOUR CONFIG HERE FROM FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyC5DabP1fIBGQU5klB8Ulaupae2OmKOZX8",
  authDomain: "bigscreen-fe9a4.firebaseapp.com",
  databaseURL: "https://bigscreen-fe9a4-default-rtdb.firebaseio.com",
  projectId: "bigscreen-fe9a4",
  storageBucket: "bigscreen-fe9a4.firebasestorage.app",
  messagingSenderId: "601819849304",
  appId: "1:601819849304:web:bf8c5d61d0363bdfa4602d",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ======================
   STATE & CONSTANTS
   ====================== */

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
const ui = document.getElementById("ui");

// Generate a random ID for this specific phone tab
const TAB_ID = Math.random().toString(36).substr(2, 9);
let roomCode = null;
let isHost = false;
let locked = false;

// Virtual Grid Position (Where is THIS phone relative to others?)
let gridPos = { x: 0, y: 0 };

// VIRTUAL COORDINATES
// Instead of pixels, we use "units". Each screen is 1000x1000 units.
// This ensures the DVD moves at the same speed on a small iPhone and a large Pixel.
const V_WIDTH = 1000;
const V_HEIGHT = 1000;

/* ======================
   CANVAS SIZING
   ====================== */

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

/* ======================
   UI LOGIC
   ====================== */

const createBtn = document.getElementById("createRoom");
const joinBtn = document.getElementById("joinRoom");
const codeInput = document.getElementById("roomCode");
const grid = document.getElementById("grid");
const lockBtn = document.getElementById("lock");
const statusDiv = document.getElementById("status");

// 1. Create Room (HOST)
createBtn.onclick = async () => {
  roomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
  isHost = true;
  codeInput.value = roomCode;

  // Initial State
  const initialData = {
    lastUpdate: Date.now(),
    dvd: {
      x: 500, // Middle of first screen
      y: 500,
      vx: 400, // Speed in Units per second
      vy: 300,
      color: "hsl(0, 100%, 50%)", // Start red
    },
  };

  await db.ref("rooms/" + roomCode).set(initialData);
  statusDiv.innerText = `Room ${roomCode} Created! Select position.`;
};

// 2. Join Room (GUEST)
joinBtn.onclick = () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return alert("Enter code");

  db.ref("rooms/" + code).once("value", (snapshot) => {
    if (snapshot.exists()) {
      roomCode = code;
      isHost = false;
      statusDiv.innerText = "Joined! Select your position.";
    } else {
      alert("Room not found");
    }
  });
};

// 3. Grid Selector
let meCell = null;
for (let y = -1; y <= 1; y++) {
  for (let x = -1; x <= 1; x++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.onclick = () => {
      if (locked) return;
      if (meCell) meCell.classList.remove("me");
      cell.classList.add("me");
      meCell = cell;
      gridPos = { x, y };
    };
    grid.appendChild(cell);
  }
}

// 4. Lock & Start
lockBtn.onclick = () => {
  if (!roomCode || !meCell) return alert("Join room & select position first");

  locked = true;
  ui.classList.add("hidden"); // Hide UI to show full screen DVD

  // If host, register presence so we know world bounds?
  // For simplicity, we assume the grid is infinite or fixed 3x3.
  // We will simply listen to the DB now.
  startGameLoop();
};

/* ======================
   GAME LOOP
   ====================== */

let localRoomState = null;

function startGameLoop() {
  // Listen for updates from Firebase
  const roomRef = db.ref("rooms/" + roomCode);

  roomRef.on("value", (snapshot) => {
    localRoomState = snapshot.val();
  });

  requestAnimationFrame(loop);
}

let lastTime = performance.now();

function loop(time) {
  requestAnimationFrame(loop);

  const dt = (time - lastTime) / 1000;
  lastTime = time;

  if (!localRoomState) return;

  // Clear Screen
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /* --- HOST PHYSICS --- */
  if (isHost) {
    const dvd = localRoomState.dvd;

    // Move DVD (in virtual units)
    dvd.x += dvd.vx * dt;
    dvd.y += dvd.vy * dt;

    // Bounce logic
    // We assume the wall is 3 screens wide (-1 to 1) -> -1000 to 2000 units
    const minWorldX = -1000;
    const maxWorldX = 2000;
    const minWorldY = -1000;
    const maxWorldY = 2000;

    // DVD Size in virtual units (approx 15% of a screen)
    const dvdSize = 150;

    if (dvd.x <= minWorldX || dvd.x + dvdSize >= maxWorldX) {
      dvd.vx *= -1;
      dvd.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    if (dvd.y <= minWorldY || dvd.y + dvdSize >= maxWorldY) {
      dvd.vy *= -1;
      dvd.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    // Send update to Firebase (Throttle this in production, but okay for demo)
    // We update local state immediately for smoothness, push to DB for others
    db.ref("rooms/" + roomCode + "/dvd").set(dvd);
  }

  /* --- RENDER --- */
  const dvd = localRoomState.dvd;
  const dvdSize = 150; // Virtual units

  // Convert Global Virtual Coords -> Local Screen Pixels
  // 1. Where is the DVD relative to MY screen's top-left corner (in units)?
  //    My Start X = gridPos.x * V_WIDTH
  const relX_Units = dvd.x - gridPos.x * V_WIDTH;
  const relY_Units = dvd.y - gridPos.y * V_HEIGHT;

  // 2. Scale Units to Pixels
  const x = (relX_Units / V_WIDTH) * canvas.width;
  const y = (relY_Units / V_HEIGHT) * canvas.height;
  const w = (dvdSize / V_WIDTH) * canvas.width;
  const h = (dvdSize / V_HEIGHT) * canvas.height * 0.6; // Aspect ratio adjustment

  // Draw DVD Logo
  drawDVD(x, y, w, h, dvd.color);
}

function drawDVD(x, y, w, h, color) {
  ctx.fillStyle = color;

  // Simple ellipse for the "disc" look
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.fillStyle = "black";
  ctx.font = `bold ${h / 2}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DVD", x + w / 2, y + h / 2 + h * 0.1);

  // Shine effect
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2 - h / 4, w / 3, h / 4, 0, 0, Math.PI * 2);
  ctx.fill();
}
