const canvas = document.getElementById("radar");
const ctx = canvas.getContext("2d");

const selectedCall = document.getElementById("selectedCall");
const altEl = document.getElementById("alt");
const spdEl = document.getElementById("spd");
const hdgEl = document.getElementById("hdg");
const message = document.getElementById("message");
const clock = document.getElementById("clock");

const headingInput = document.getElementById("heading");
const altitudeInput = document.getElementById("altitude");
const speedInput = document.getElementById("speed");
const sendBtn = document.getElementById("send");

const GREEN = "#39ff88";
const DIM = "#168f4c";

let W = 0, H = 0;
let selected = null;
let simSeconds = 0;
let last = performance.now();
let nextSpawn = 3;

const aircraft = [
  {
    callsign: "JAL123", x: -0.28, y: -0.15, heading: 95,
    altitude: 3500, speed: 180, targetHeading: 95,
    targetAltitude: 3500, targetSpeed: 180,
    trail: []
  },
  {
    callsign: "ANA456", x: 0.25, y: 0.25, heading: 275,
    altitude: 5000, speed: 210, targetHeading: 275,
    targetAltitude: 5000, targetSpeed: 210,
    trail: []
  }
];

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = r.width; H = r.height;
}
window.addEventListener("resize", resize);
resize();

function center() {
  return { x: W / 2, y: H / 2 };
}

function scale() {
  return Math.min(W, H) * 0.40;
}

function pos(a) {
  const c = center(), s = scale();
  return { x: c.x + a.x * s, y: c.y + a.y * s };
}

function drawGrid() {
  ctx.clearRect(0, 0, W, H);
  const c = center(), s = scale();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(22,143,76,.45)";
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - s);
  ctx.lineTo(c.x, c.y + s);
  ctx.moveTo(c.x - s, c.y);
  ctx.lineTo(c.x + s, c.y);
  ctx.stroke();

  for (let r = s * .25; r <= s; r += s * .25) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = DIM;
  ctx.font = "11px Courier New";
  ctx.fillText("N", c.x + 5, c.y - s - 7);
  ctx.fillText("S", c.x + 5, c.y + s + 16);
  ctx.fillText("W", c.x - s - 17, c.y + 4);
  ctx.fillText("E", c.x + s + 8, c.y + 4);

  // Airport / runway
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 2;
  ctx.strokeRect(c.x - 55, c.y - 13, 110, 26);
  ctx.beginPath();
  ctx.moveTo(c.x - 38, c.y);
  ctx.lineTo(c.x + 38, c.y);
  ctx.stroke();

  ctx.font = "11px Courier New";
  ctx.fillText("NRT", c.x - 13, c.y + 42);
  ctx.fillText("34L", c.x - 13, c.y - 20);
}

function drawTrail(a) {
  if (a.trail.length < 2) return;
  ctx.strokeStyle = "rgba(57,255,136,.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  a.trail.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
}

function drawAircraft(a) {
  const p = pos(a);
  const selectedHere = selected === a;

  if (selectedHere) {
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.stroke();
  }

  // heading line
  const rad = (a.heading - 90) * Math.PI / 180;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(rad) * 22, p.y + Math.sin(rad) * 22);
  ctx.stroke();

  // aircraft symbol
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(rad) * 7, p.y + Math.sin(rad) * 7);
  ctx.lineTo(p.x + Math.cos(rad + 2.5) * 7, p.y + Math.sin(rad + 2.5) * 7);
  ctx.lineTo(p.x + Math.cos(rad - 2.5) * 7, p.y + Math.sin(rad - 2.5) * 7);
  ctx.closePath();
  ctx.fill();

  ctx.font = "12px Courier New";
  ctx.fillText(a.callsign, p.x + 12, p.y - 10);
  ctx.font = "10px Courier New";
  ctx.fillText(`${Math.round(a.altitude)} / ${Math.round(a.speed)}`, p.x + 12, p.y + 3);
}

function normalizeHeading(h) {
  return ((h % 360) + 360) % 360;
}

function turnToward(current, target, amount) {
  let d = ((target - current + 540) % 360) - 180;
  if (Math.abs(d) <= amount) return target;
  return normalizeHeading(current + Math.sign(d) * amount);
}

function updateAircraft(a, dt) {
  a.heading = turnToward(a.heading, a.targetHeading, 25 * dt);
  a.altitude += Math.sign(a.targetAltitude - a.altitude) * Math.min(Math.abs(a.targetAltitude - a.altitude), 900 * dt);
  a.speed += Math.sign(a.targetSpeed - a.speed) * Math.min(Math.abs(a.targetSpeed - a.speed), 12 * dt);

  // screen-normalized movement; speed roughly maps to pixels/second
  const rad = (a.heading - 90) * Math.PI / 180;
  const movement = (a.speed / 3600) * dt * 0.95;
  a.x += Math.cos(rad) * movement;
  a.y += Math.sin(rad) * movement;

  const p = pos(a);
  if (!a.trail.length || Math.hypot(p.x - a.trail[a.trail.length - 1].x, p.y - a.trail[a.trail.length - 1].y) > 3) {
    a.trail.push(p);
    if (a.trail.length > 45) a.trail.shift();
  }

  // wrap around radar
  if (a.x > 1.15) a.x = -1.15;
  if (a.x < -1.15) a.x = 1.15;
  if (a.y > 1.15) a.y = -1.15;
  if (a.y < -1.15) a.y = 1.15;
}

function spawnAircraft() {
  const num = Math.floor(Math.random() * 900) + 100;
  const call = Math.random() > .5 ? `JAL${num}` : `ANA${num}`;
  const side = Math.floor(Math.random() * 4);
  let x = 0, y = 0, heading = 90;

  if (side === 0) { x = -1.05; y = (Math.random() * 1.6) - .8; heading = 90; }
  if (side === 1) { x = 1.05; y = (Math.random() * 1.6) - .8; heading = 270; }
  if (side === 2) { x = (Math.random() * 1.6) - .8; y = -1.05; heading = 180; }
  if (side === 3) { x = (Math.random() * 1.6) - .8; y = 1.05; heading = 0; }

  aircraft.push({
    callsign: call, x, y, heading,
    altitude: Math.round((2500 + Math.random() * 6000) / 500) * 500,
    speed: Math.round(150 + Math.random() * 100),
    targetHeading: heading,
    targetAltitude: 3500,
    targetSpeed: 180,
    trail: []
  });
}

function checkConflicts() {
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      const a = aircraft[i], b = aircraft[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const horizontal = Math.hypot(dx, dy);
      const vertical = Math.abs(a.altitude - b.altitude);

      if (horizontal < 0.075 && vertical < 1000) {
        message.textContent = `!! TRAFFIC ALERT: ${a.callsign} / ${b.callsign} !!`;
        return;
      }
    }
  }
  message.textContent = selected ? `MONITORING ${selected.callsign}` : "SELECT AIRCRAFT";
}

canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  selected = null;
  let nearest = Infinity;

  for (const a of aircraft) {
    const p = pos(a);
    const d = Math.hypot(mx - p.x, my - p.y);
    if (d < 25 && d < nearest) {
      nearest = d;
      selected = a;
    }
  }

  if (selected) {
    selectedCall.textContent = selected.callsign;
    headingInput.value = Math.round(selected.targetHeading);
    altitudeInput.value = Math.round(selected.targetAltitude);
    speedInput.value = Math.round(selected.targetSpeed);
  }
});

sendBtn.addEventListener("click", () => {
  if (!selected) {
    message.textContent = "NO AIRCRAFT SELECTED";
    return;
  }

  const hdg = Number(headingInput.value);
  const alt = Number(altitudeInput.value);
  const spd = Number(speedInput.value);

  if (!Number.isFinite(hdg) || !Number.isFinite(alt) || !Number.isFinite(spd) ||
      hdg < 0 || hdg > 359 || alt < 500 || alt > 18000 || spd < 80 || spd > 450) {
    message.textContent = "INVALID CLEARANCE";
    return;
  }

  selected.targetHeading = normalizeHeading(hdg);
  selected.targetAltitude = alt;
  selected.targetSpeed = spd;
  message.textContent = `${selected.callsign}: CLEARANCE SENT`;
});

function updatePanel() {
  if (!selected) {
    selectedCall.textContent = "NONE";
    altEl.textContent = "----";
    spdEl.textContent = "----";
    hdgEl.textContent = "---";
    return;
  }

  altEl.textContent = Math.round(selected.altitude);
  spdEl.textContent = Math.round(selected.speed);
  hdgEl.textContent = Math.round(selected.heading);
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  simSeconds += dt;

  if (simSeconds > nextSpawn && aircraft.length < 9) {
    spawnAircraft();
    nextSpawn = simSeconds + 5 + Math.random() * 5;
  }

  for (const a of aircraft) updateAircraft(a, dt);

  drawGrid();
  for (const a of aircraft) drawTrail(a);
  for (const a of aircraft) drawAircraft(a);

  updatePanel();
  checkConflicts();

  const total = Math.floor(simSeconds);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor(total / 60) % 60).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  clock.textContent = `${hh}:${mm}:${ss}`;

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
