const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// =====================================================
// CONFIG
// =====================================================
const SECRET = "changeme123";

const OFFLINE_TIME = 10000;
const BOX_DISTANCE_LIMIT = 15;

// =====================================================
// STATE
// =====================================================

// สำคัญ: กล้องเปิดตั้งแต่ Server เริ่ม
let cameraState = true;

// Relay ปิดตั้งแต่เริ่ม
let relayState = false;

let latestFrame = null;

let lastCameraUpdate = 0;
let ultrasonicDistance = null;
let lastSensorUpdate = 0;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: "5mb" }));

// =====================================================
// OFFLINE IMAGE
// =====================================================

const OFFLINE_IMAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAgAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QgTEQ4VqVxX4wAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVAgb3JnLmdpbQAAAABJRU5ErkJggg==",
  "base64"
);

app.get("/offline.png", (req, res) => {
  res.set("Content-Type", "image/png");
  res.send(OFFLINE_IMAGE);
});

// =====================================================
// UPLOAD CAMERA FRAME
// =====================================================

app.post(
  "/upload",
  express.raw({
    type: "image/jpeg",
    limit: "2mb",
  }),
  (req, res) => {

    const key = req.query.key;

    if (key !== SECRET) {
      return res.status(401).send("Unauthorized");
    }

    if (!req.body || !Buffer.isBuffer(req.body)) {
      return res.status(400).send("No image");
    }

    latestFrame = req.body;
    lastCameraUpdate = Date.now();

    // รับระยะ HC-SR04 จาก ESP32
    const distanceHeader = req.headers["x-distance-cm"];

    if (distanceHeader !== undefined) {
      const distance = Number(distanceHeader);

      if (Number.isFinite(distance)) {
        ultrasonicDistance = distance;
        lastSensorUpdate = Date.now();
      }
    }

    res.send("OK");
  }
);

// =====================================================
// VIEW LATEST FRAME
// =====================================================

app.get("/view", (req, res) => {

  if (!latestFrame) {
    return res.redirect("/offline.png");
  }

  const offline =
    Date.now() - lastCameraUpdate > OFFLINE_TIME;

  if (offline) {
    return res.redirect("/offline.png");
  }

  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(latestFrame);
});

// =====================================================
// MJPEG STREAM
// =====================================================

app.get("/stream", (req, res) => {

  const key = req.query.key;

  if (key !== SECRET) {
    return res.status(401).send("Unauthorized");
  }

  res.writeHead(200, {
    "Content-Type":
      "multipart/x-mixed-replace; boundary=frame",

    "Cache-Control":
      "no-cache, no-store, must-revalidate",

    "Connection": "close",

    "Pragma": "no-cache",
  });

  let lastSent = 0;

  const timer = setInterval(() => {

    if (!latestFrame) return;

    if (!cameraState) return;

    if (lastCameraUpdate <= lastSent) {
      return;
    }

    lastSent = lastCameraUpdate;

    res.write(
      `--frame\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Length: ${latestFrame.length}\r\n\r\n`
    );

    res.write(latestFrame);
    res.write("\r\n");

  }, 50);

  req.on("close", () => {
    clearInterval(timer);
  });
});

// =====================================================
// SENSOR
// =====================================================

app.get("/sensor", (req, res) => {

  const key = req.query.key;

  if (key !== SECRET) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  res.json({
    distanceCm: ultrasonicDistance,
    updatedAt: lastSensorUpdate,
  });
});

// =====================================================
// CAMERA CONTROL
// =====================================================

app.get("/camera", (req, res) => {

  const key = req.query.key;

  if (key !== SECRET) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.query.state === "on") {
    cameraState = true;
  }

  if (req.query.state === "off") {
    cameraState = false;
  }

  res.json({
    cameraOn: cameraState,
  });
});

// =====================================================
// RELAY CONTROL
// =====================================================

app.get("/relay", (req, res) => {

  const key = req.query.key;

  if (key !== SECRET) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.query.state === "on") {
    relayState = true;
  }

  if (req.query.state === "off") {
    relayState = false;
  }

  res.json({
    relayOn: relayState,
  });
});

// =====================================================
// COMMAND
// =====================================================

app.get("/command", (req, res) => {

  const key = req.query.key;

  if (key !== SECRET) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  res.json({
    cameraOn: cameraState,
    relayOn: relayState,
  });
});

// =====================================================
// STATUS
// =====================================================

app.get("/status", (req, res) => {

  const key = req.query.key;

  if (key !== SECRET) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  const cameraOnline =
    Date.now() - lastCameraUpdate <= OFFLINE_TIME;

  let boxStatus = "EMPTY";

  if (
    ultrasonicDistance !== null &&
    ultrasonicDistance <= BOX_DISTANCE_LIMIT
  ) {
    boxStatus = "OBJECT DETECTED";
  }

  res.json({
    cameraOn: cameraState,
    cameraOnline,

    relayOn: relayState,

    distanceCm: ultrasonicDistance,

    boxStatus,

    lastCameraUpdate,
    lastSensorUpdate,
  });
});

// =====================================================
// DASHBOARD
// =====================================================

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>ESP32 Smart Box</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background: #111;

  color: white;

}

.container {

  max-width: 1000px;

  margin: auto;

  padding: 20px;

}

h1 {

  text-align: center;

}

.camera-box {

  width: 100%;

  background: #000;

  border-radius: 12px;

  overflow: hidden;

  margin-top: 20px;

}

#camera {

  width: 100%;

  display: block;

  min-height: 300px;

  object-fit: contain;

}

.buttons {

  display: flex;

  gap: 10px;

  flex-wrap: wrap;

  margin-top: 20px;

}

button {

  flex: 1;

  min-width: 180px;

  padding: 15px;

  border: 0;

  border-radius: 8px;

  font-size: 16px;

  cursor: pointer;

}

.on {

  background: #20c997;

  color: white;

}

.off {

  background: #dc3545;

  color: white;

}

.card {

  background: #222;

  padding: 20px;

  border-radius: 12px;

  margin-top: 20px;

}

.value {

  font-size: 28px;

  margin-top: 10px;

}

</style>

</head>

<body>

<div class="container">

<h1>ESP32 Smart Box</h1>

<div class="camera-box">

<img
id="camera"
src="/stream?key=${SECRET}"
>

</div>

<div class="buttons">

<button
class="on"
onclick="cameraControl('on')"
>
Open Camera
</button>

<button
class="off"
onclick="cameraControl('off')"
>
Close Camera
</button>

<button
class="on"
onclick="relayControl('on')"
>
Relay ON
</button>

<button
class="off"
onclick="relayControl('off')"
>
Relay OFF
</button>

</div>

<div class="card">

<h2>Camera</h2>

<div
id="cameraStatus"
class="value"
>
Checking...
</div>

</div>

<div class="card">

<h2>Relay</h2>

<div
id="relayStatus"
class="value"
>
Checking...
</div>

</div>

<div class="card">

<h2>HC-SR04</h2>

<div
id="distance"
class="value"
>
--
</div>

</div>

<div class="card">

<h2>Box Status</h2>

<div
id="boxStatus"
class="value"
>
--
</div>

</div>

</div>

<script>

const KEY = "${SECRET}";

async function cameraControl(state) {

  try {

    const response =
      await fetch(
        "/camera?key=" +
        KEY +
        "&state=" +
        state
      );

    const data =
      await response.json();

    console.log(data);

    updateStatus();

  } catch (error) {

    console.error(error);

  }

}

async function relayControl(state) {

  try {

    const response =
      await fetch(
        "/relay?key=" +
        KEY +
        "&state=" +
        state
      );

    const data =
      await response.json();

    console.log(data);

    updateStatus();

  } catch (error) {

    console.error(error);

  }

}

async function updateStatus() {

  try {

    const response =
      await fetch(
        "/status?key=" +
        KEY +
        "&t=" +
        Date.now()
      );

    const data =
      await response.json();

    document.getElementById(
      "cameraStatus"
    ).textContent =
      data.cameraOn
        ? "ON"
        : "OFF";

    document.getElementById(
      "relayStatus"
    ).textContent =
      data.relayOn
        ? "ON"
        : "OFF";

    if (
      data.distanceCm === null ||
      data.distanceCm === undefined
    ) {

      document.getElementById(
        "distance"
      ).textContent = "--";

    } else {

      document.getElementById(
        "distance"
      ).textContent =
        data.distanceCm.toFixed(1)
        + " cm";

    }

    document.getElementById(
      "boxStatus"
    ).textContent =
      data.boxStatus;

  } catch (error) {

    console.error(error);

  }

}

updateStatus();

setInterval(
  updateStatus,
  1000
);

</script>

</body>

</html>
  `);

});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    "Server running on port " + PORT
  );

});
