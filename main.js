const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");

/* ======================
   CANVAS
   ====================== */

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

/* ======================
   STATE
   ====================== */

const TAB_ID = crypto.randomUUID();
let roomCode = null;
let isHost = false;
let locked = false;
let screenPos = { x: 0, y: 0 };

/* ======================
   UI ELEMENTS
   ====================== */

const createBtn = document.getElementById("createRoom");
const joinBtn = document.getElementById("joinRoom");
const codeInput = document.getElementById("roomCode");
const grid = document.getElementById("grid");
const lockBtn = document.getElementById("lock");

/* ======================
   CREATE ROOM
   ====================== */

createBtn.onclick = () => {
  roomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
  isHost = true;

  localStorage.setItem(
    "room-" + roomCode,
    JSON.stringify({
      host: TAB_ID,
      screens: {},
      dvd: {
        x: 100,
        y: 100,
        w: 120,
        h: 60,
        vx: 200,
        vy: 150
      }
    })
  );

  codeInput.value = roomCode;
};

/* ======================
   JOIN ROOM
   ====================== */

joinBtn.onclick = () => {
  const code = codeInput.value.trim().toUpperCase();
  const data = localStorage.getItem("room-" + code);

  if (!data) {
    alert("Room not found");
    return;
  }

  roomCode = code;
  const room = JSON.parse(data);
  isHost = room.host === TAB_ID;
};

/* ======================
   MINI GRID
   ====================== */

let meCell = null;

for (let y = -1; y <= 1; y++) {
  for (let x = -1; x <= 1; x++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.x = x;
    cell.dataset.y = y;

    cell.onclick = () => {
      if (locked) return;

      if (meCell) meCell.classList.remove("me");
      cell.classList.add("me");
      meCell = cell;

      screenPos = { x, y };
    };

    grid.appendChild(cell);
  }
}

/* ======================
   LOCK POSITION
   ====================== */

lockBtn.onclick = () => {
  if (!roomCode) {
    alert("Create or join a room first");
    return;
  }
  locked = true;
};

/* ======================
   MAIN LOOP
   ====================== */

let lastTime = performance.now();

function loop(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!roomCode || !locked) {
    requestAnimationFrame(loop);
    return;
  }

  const roomKey = "room-" + roomCode;
  const room = JSON.parse(localStorage.getItem(roomKey));

  /* Register screen */
  room.screens[TAB_ID] = {
    x: screenPos.x,
    y: screenPos.y,
    w: canvas.width,
    h: canvas.height
  };

  /* Calculate world bounds */
  let minX = 0, minY = 0, maxX = 0, maxY = 0;

  Object.values(room.screens).forEach(s => {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + 1);
    maxY = Math.max(maxY, s.y + 1);
  });

  const world = {
    w: (maxX - minX) * canvas.width,
    h: (maxY - minY) * canvas.height,
    ox: -minX * canvas.width,
    oy: -minY * canvas.height
  };

  /* Host updates DVD */
  if (isHost) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    room.dvd.x += room.dvd.vx * dt;
    room.dvd.y += room.dvd.vy * dt;

    if (room.dvd.x <= 0 || room.dvd.x + room.dvd.w >= world.w)
      room.dvd.vx *= -1;

    if (room.dvd.y <= 0 || room.dvd.y + room.dvd.h >= world.h)
      room.dvd.vy *= -1;
  }

  localStorage.setItem(roomKey, JSON.stringify(room));

  /* Render DVD */
  const localX =
    room.dvd.x - (screenPos.x * canvas.width + world.ox);
  const localY =
    room.dvd.y - (screenPos.y * canvas.height + world.oy);

  if (
    localX + room.dvd.w > 0 &&
    localX < canvas.width &&
    localY + room.dvd.h > 0 &&
    localY < canvas.height
  ) {
    ctx.fillStyle = "white";
    ctx.fillRect(localX, localY, room.dvd.w, room.dvd.h);

    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.fillText("DVD", localX + 35, localY + 38);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
