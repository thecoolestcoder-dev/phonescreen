
const firebaseConfig = {
 apiKey: "AIzaSyC5DabP1fIBGQU5klB8Ulaupae2OmKOZX8",
  authDomain: "bigscreen-fe9a4.firebaseapp.com",
  databaseURL: "https://bigscreen-fe9a4-default-rtdb.firebaseio.com",
  projectId: "bigscreen-fe9a4",
  storageBucket: "bigscreen-fe9a4.firebasestorage.app",
  messagingSenderId: "601819849304",
  appId: "1:601819849304:web:bf8c5d61d0363bdfa4602d"
};

// Initialize Firebase (using the compat libraries from index.html)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

/* ======================
   STATE & CONSTANTS
   ====================== */

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
const ui = document.getElementById("ui");
const statusDiv = document.getElementById("status");

// Unique ID for this specific phone/tab
const TAB_ID = Math.random().toString(36).substr(2, 9);

let roomCode = null;
let isHost = false;
let locked = false;

// Virtual Grid Position (Where is THIS phone relative to others?)
let gridPos = { x: 0, y: 0 };

// VIRTUAL COORDINATES
// The world is made of 1000x1000 "units" per screen.
// This ensures the DVD moves at the same speed on all devices.
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
   UI ELEMENTS & LOGIC
   ====================== */

const createBtn = document.getElementById("createRoom");
const joinBtn = document.getElementById("joinRoom");
const codeInput = document.getElementById("roomCode");
const grid = document.getElementById("grid");
const lockBtn = document.getElementById("lock");

// 1. Create Room (HOST)
createBtn.onclick = async () => {
  roomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
  isHost = true;
  codeInput.value = roomCode;

  // Initialize Room State in Firebase
  const initialData = {
    lastUpdate: Date.now(),
    dvd: {
      x: 500, // Center of the first screen (0,0)
      y: 500,
      vx: 400, // Speed: 400 units per second
      vy: 300,
      color: "hsl(0, 100%, 50%)", // Start red
    },
    screens: {} // Will be populated as people join
  };

  await db.ref("rooms/" + roomCode).set(initialData);
  statusDiv.innerText = `Room ${roomCode} Created! Pick a square.`;
};

// 2. Join Room (GUEST)
joinBtn.onclick = () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return alert("Please enter a room code");

  db.ref("rooms/" + code).once("value", (snapshot) => {
    if (snapshot.exists()) {
      roomCode = code;
      isHost = false;
      statusDiv.innerText = "Joined! Pick your square.";
    } else {
      alert("Room not found");
    }
  });
};

// 3. Grid Selector (Mini 3x3 grid)
let meCell = null;
for (let y = -1; y <= 1; y++) {
  for (let x = -1; x <= 1; x++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.onclick = () => {
      if (locked) return; // Can't change after locking
      
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
  if (!roomCode) return alert("Create or Join a room first");
  if (!meCell) return alert("Select a position on the grid");

  locked = true;
  ui.classList.add("hidden"); // Hide UI so we see the DVD
  startGameLoop();
};

/* ======================
   GAME LOOP
   ====================== */

let localRoomState = null;
let lastTime = performance.now();

function startGameLoop() {
  // A. Register this screen in Firebase
  const myScreenRef = db.ref("rooms/" + roomCode + "/screens/" + TAB_ID);
  myScreenRef.set({
    gridX: gridPos.x,
    gridY: gridPos.y,
    width: V_WIDTH,
    height: V_HEIGHT,
  });

  // Automatically remove this screen if the browser closes/disconnects
  myScreenRef.onDisconnect().remove();

  // B. Listen for real-time updates from the Host
  const roomRef = db.ref("rooms/" + roomCode);
  roomRef.on("value", (snapshot) => {
    localRoomState = snapshot.val();
  });

  // Start the animation loop
  requestAnimationFrame(loop);
}

function loop(time) {
  requestAnimationFrame(loop);

  const dt = (time - lastTime) / 1000;
  lastTime = time;

  if (!localRoomState || !localRoomState.dvd) return;

  // 1. Clear Screen
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /* --- HOST LOGIC (Physics & Sync) --- */
  // Only the host calculates physics. Everyone else just watches.
  if (isHost && localRoomState.screens) {
    const dvd = localRoomState.dvd;
    const screens = Object.values(localRoomState.screens);

    // Calculate Dynamic World Bounds
    // We look at all connected screens to see where the "walls" should be.
    let minGx = Infinity, maxGx = -Infinity;
    let minGy = Infinity, maxGy = -Infinity;

    if (screens.length > 0) {
      screens.forEach((s) => {
        if (s.gridX < minGx) minGx = s.gridX;
        if (s.gridX > maxGx) maxGx = s.gridX;
        if (s.gridY < minGy) minGy = s.gridY;
        if (s.gridY > maxGy) maxGy = s.gridY;
      });
    } else {
      // Fallback if no screens (shouldn't happen if host is present)
      minGx = 0; maxGx = 0; minGy = 0; maxGy = 0;
    }

    // Convert Grid IDs to Virtual World Units
    // Example: Leftmost screen is -1 -> Wall is at -1000
    // Rightmost screen is 1 -> Wall is at (1*1000) + 1000 = 2000
    const minWorldX = minGx * V_WIDTH;
    const maxWorldX = (maxGx * V_WIDTH) + V_WIDTH;
    const minWorldY = minGy * V_HEIGHT;
    const maxWorldY = (maxGy * V_HEIGHT) + V_HEIGHT;

    // Move DVD
    dvd.x += dvd.vx * dt;
    dvd.y += dvd.vy * dt;

    const dvdSize = 150; // Size of DVD in virtual units

    // --- X Collision ---
    if (dvd.x <= minWorldX) {
      dvd.x = minWorldX;
      dvd.vx *= -1;
      dvd.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    } 
    else if (dvd.x + dvdSize >= maxWorldX) {
      dvd.x = maxWorldX - dvdSize;
      dvd.vx *= -1;
      dvd.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    // --- Y Collision ---
    if (dvd.y <= minWorldY) {
      dvd.y = minWorldY;
      dvd.vy *= -1;
      dvd.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    } 
    else if (dvd.y + dvdSize >= maxWorldY) {
      dvd.y = maxWorldY - dvdSize;
      dvd.vy *= -1;
      dvd.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    // Update Firebase with new position
    // (Note: For a production app, you'd throttle this, but it works fine for tests)
    db.ref("rooms/" + roomCode + "/dvd").set(dvd);
  }

  /* --- RENDER LOGIC (For Everyone) --- */
  const dvd = localRoomState.dvd;
  const dvdSize = 150; // Virtual units

  // Convert Global Virtual Coords -> Local Screen Pixels
  
  // 1. Calculate relative position in units
  // If DVD is at x=1500 and I am at grid x=1 (starts at 1000), 
  // then relative to me, the DVD is at 500.
  const relX_Units = dvd.x - (gridPos.x * V_WIDTH);
  const relY_Units = dvd.y - (gridPos.y * V_HEIGHT);

  // 2. Scale units to actual pixels
  // If my screen is 400px wide, and the virtual width is 1000,
  // 500 units becomes 200px.
  const x = (relX_Units / V_WIDTH) * canvas.width;
  const y = (relY_Units / V_HEIGHT) * canvas.height;
  
  const w = (dvdSize / V_WIDTH) * canvas.width;
  // Aspect ratio tweak: Make it shorter than it is wide
  const h = (dvdSize / V_HEIGHT) * canvas.height * 0.6; 

  drawDVD(x, y, w, h, dvd.color);
}

/* ======================
   HELPER: DRAW DVD LOGO
   ====================== */

function drawDVD(x, y, w, h, color) {
  // Only draw if it's actually visible on this screen
  if (x + w < 0 || x > canvas.width || y + h < 0 || y > canvas.height) return;

  ctx.fillStyle = color;
  
  // Ellipse background
  ctx.beginPath();
  ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.fillStyle = "black";
  ctx.font = `bold ${h * 0.5}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Offset y slightly because text baseline varies
  ctx.fillText("DVD", x + w/2, y + h/2 + (h * 0.1));
  
  // Shine/Gloss effect (top half)
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(x + w/2, y + h/2 - h/4, w/2.5, h/5, 0, 0, Math.PI * 2);
  ctx.fill();
}
