const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIG
// =====================================================

const SECRET = process.env.SECRET || "changeme123";

const OFFLINE_TIME = 15000;

// ระยะที่ถือว่า "มีของ"
const BOX_DISTANCE_LIMIT = 15;

// =====================================================
// LINE CONFIG
// =====================================================

const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

const LINE_USER_ID =
  process.env.LINE_USER_ID || "";

// =====================================================
// STATE
// =====================================================

let latestFrame = null;

let lastCameraUpdate = 0;
let lastSensorUpdate = 0;

let cameraState = true;
let relayState = false;

let ultrasonicDistance = null;

// ใช้ตรวจจับการเปลี่ยนสถานะ
let lastBoxState = null;

// =====================================================
// EXPRESS
// =====================================================

app.use(express.json());

// =====================================================
// OFFLINE IMAGE
// =====================================================

app.get("/offline.png", (req, res) => {
  res.set("Content-Type", "image/svg+xml");

  res.send(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="640"
         height="480"
         viewBox="0 0 640 480">

      <rect width="640" height="480" fill="#111827"/>

      <text x="320"
            y="220"
            text-anchor="middle"
            fill="#ffffff"
            font-size="32"
            font-family="Arial">
        Camera Offline
      </text>

      <text x="320"
            y="270"
            text-anchor="middle"
            fill="#9ca3af"
            font-size="20"
            font-family="Arial">
        Waiting for ESP32-S3-CAM
      </text>

    </svg>
  `);
});

// =====================================================
// CAMERA UPLOAD
// =====================================================

app.post(
  "/upload",
  express.raw({
    type: "image/jpeg",
    limit: "2mb",
  }),
  (req, res) => {

    try {

      if (req.query.key !== SECRET) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({
          error: "No image data",
        });
      }

      latestFrame = Buffer.from(req.body);

      lastCameraUpdate = Date.now();

      // -------------------------------------------------
      // รองรับกรณี ESP32 ส่ง distance ผ่าน Header
      // -------------------------------------------------

      if (req.headers["x-distance-cm"]) {

        const distance = Number(
          req.headers["x-distance-cm"]
        );

        if (Number.isFinite(distance)) {

          ultrasonicDistance = distance;

          lastSensorUpdate = Date.now();

          updateBoxState(distance);
        }
      }

      res.json({
        success: true,
      });

    } catch (error) {

      console.error("UPLOAD ERROR:", error);

      res.status(500).json({
        error: "Upload failed",
      });
    }
  }
);

// =====================================================
// VIEW CAMERA
// =====================================================

app.get("/view", (req, res) => {

  if (!latestFrame) {
    return res.redirect("/offline.png");
  }

  res.set("Content-Type", "image/jpeg");

  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.set("Pragma", "no-cache");

  res.set("Expires", "0");

  res.send(latestFrame);
});

// =====================================================
// SEND LINE NOTIFICATION
// =====================================================

async function sendLineNotification(distance) {

  // -------------------------------------------------
  // ตรวจสอบว่าตั้งค่า LINE แล้วหรือยัง
  // -------------------------------------------------

  if (
    !LINE_CHANNEL_ACCESS_TOKEN ||
    !LINE_USER_ID
  ) {

    console.log(
      "⚠️ LINE is not configured"
    );

    return;
  }

  try {

    const response = await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "Authorization":
            `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },

        body: JSON.stringify({

          to: LINE_USER_ID,

          messages: [
            {
              type: "text",

              text:
                `📦 แจ้งเตือน Smart Box\n\n` +
                `มีของเข้ามาในกล่องแล้ว\n` +
                `📏 ระยะ: ${distance.toFixed(1)} cm`,
            },
          ],

        }),
      }
    );

    if (response.ok) {

      console.log(
        "📱 LINE notification sent"
      );

    } else {

      const errorText =
        await response.text();

      console.error(
        "❌ LINE error:",
        response.status,
        errorText
      );
    }

  } catch (error) {

    console.error(
      "❌ LINE request failed:",
      error
    );
  }
}

// =====================================================
// BOX STATE
// =====================================================

function updateBoxState(distance) {

  // -------------------------------------------------
  // -1 = HC-SR04 No Echo / อ่านค่าไม่ได้
  //
  // ห้ามเอา -1 ไปเทียบกับ 15
  // เพราะ -1 <= 15 จะกลายเป็น TRUE
  // -------------------------------------------------

  if (
    !Number.isFinite(distance) ||
    distance < 0
  ) {

    console.log(
      "⚠️ HC-SR04 invalid / No Echo"
    );

    // ไม่เปลี่ยนสถานะกล่อง
    // และไม่ส่ง LINE

    return;
  }

  // -------------------------------------------------
  // ตรวจสอบว่ามีของหรือไม่
  // -------------------------------------------------

  const hasObject =
    distance <= BOX_DISTANCE_LIMIT;

  // -------------------------------------------------
  // ครั้งแรกที่ Server ได้ค่า
  // -------------------------------------------------

  if (lastBoxState === null) {

    lastBoxState = hasObject;

    console.log(
      `📦 Initial box state: ${
        hasObject
          ? "มีของ"
          : "ไม่มีของ"
      }`
    );

    // ไม่ส่ง LINE ตอนเริ่มระบบ

    return;
  }

  // -------------------------------------------------
  // จาก "ไม่มีของ"
  // -> "มีของ"
  //
  // ส่ง LINE
  // -------------------------------------------------

  if (
    lastBoxState === false &&
    hasObject === true
  ) {

    console.log(
      "📦 มีของเข้ามาใหม่!"
    );

    sendLineNotification(distance);
  }

  // -------------------------------------------------
  // แสดงการเปลี่ยนสถานะ
  // -------------------------------------------------

  if (
    lastBoxState !== hasObject
  ) {

    console.log(
      `📦 Box state changed: ${
        hasObject
          ? "มีของ"
          : "ไม่มีของ"
      }`
    );
  }

  // -------------------------------------------------
  // บันทึกสถานะล่าสุด
  // -------------------------------------------------

  lastBoxState = hasObject;
}

// =====================================================
// SENSOR DATA
// =====================================================

app.post("/sensor", (req, res) => {

  try {

    // -------------------------------------------------
    // ตรวจสอบ Secret
    // -------------------------------------------------

    if (req.query.key !== SECRET) {

      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    // -------------------------------------------------
    // อ่านค่า distance
    // -------------------------------------------------

    const distance =
      Number(req.body.distance);

    // -------------------------------------------------
    // ตรวจสอบข้อมูล
    // -------------------------------------------------

    if (!Number.isFinite(distance)) {

      return res.status(400).json({
        error: "Invalid distance",
      });
    }

    // -------------------------------------------------
    // เก็บค่าล่าสุด
    // -------------------------------------------------

    ultrasonicDistance = distance;

    lastSensorUpdate = Date.now();

    // -------------------------------------------------
    // อัปเดตสถานะกล่อง
    // -------------------------------------------------

    updateBoxState(distance);

    console.log(
      `📏 Distance: ${distance} cm`
    );

    res.json({
      success: true,
      distance: distance,
    });

  } catch (error) {

    console.error(
      "SENSOR ERROR:",
      error
    );

    res.status(500).json({
      error: "Sensor processing failed",
    });
  }
});

// =====================================================
// CAMERA CONTROL
// =====================================================

app.post("/camera", (req, res) => {

  try {

    if (req.query.key !== SECRET) {

      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    cameraState =
      Boolean(req.body.cameraOn);

    console.log(
      `📷 Camera: ${
        cameraState
          ? "ON"
          : "OFF"
      }`
    );

    res.json({
      success: true,
      cameraOn: cameraState,
    });

  } catch (error) {

    console.error(
      "CAMERA CONTROL ERROR:",
      error
    );

    res.status(500).json({
      error: "Camera control failed",
    });
  }
});

// =====================================================
// RELAY CONTROL
// =====================================================

app.post("/relay", (req, res) => {

  try {

    if (req.query.key !== SECRET) {

      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    relayState =
      Boolean(req.body.relayOn);

    console.log(
      `🔌 Relay: ${
        relayState
          ? "ON"
          : "OFF"
      }`
    );

    res.json({
      success: true,
      relayOn: relayState,
    });

  } catch (error) {

    console.error(
      "RELAY CONTROL ERROR:",
      error
    );

    res.status(500).json({
      error: "Relay control failed",
    });
  }
});

// =====================================================
// ESP32 COMMAND
// =====================================================

app.get("/command", (req, res) => {

  if (req.query.key !== SECRET) {

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

  const now = Date.now();

  // -------------------------------------------------
  // Camera Online
  // -------------------------------------------------

  const cameraOnline =
    lastCameraUpdate > 0 &&
    now - lastCameraUpdate <= OFFLINE_TIME;

  // -------------------------------------------------
  // Sensor Online
  // -------------------------------------------------

  const sensorOnline =
    lastSensorUpdate > 0 &&
    now - lastSensorUpdate <= OFFLINE_TIME;

  // -------------------------------------------------
  // Camera Text
  // -------------------------------------------------

  const cameraText =
    cameraOnline
      ? "กล้องออนไลน์"
      : "กล้องออฟไลน์";

  // -------------------------------------------------
  // Sensor Text
  // -------------------------------------------------

  const sensorText =
    sensorOnline
      ? "เซ็นเซอร์ออนไลน์"
      : "เซ็นเซอร์ออฟไลน์";

  // -------------------------------------------------
  // Box Status
  // -------------------------------------------------

  let hasObject = null;

  let boxText =
    "กำลังรอเซ็นเซอร์...";

  // -------------------------------------------------
  // ตรวจสอบ Sensor
  // -------------------------------------------------

  if (
    sensorOnline &&
    ultrasonicDistance !== null
  ) {

    // -----------------------------------------------
    // HC-SR04 No Echo
    // -----------------------------------------------

    if (ultrasonicDistance < 0) {

      hasObject = null;

      boxText =
        "เซ็นเซอร์อ่านค่าไม่ได้";
    }

    // -----------------------------------------------
    // มีของ
    // -----------------------------------------------

    else if (
      ultrasonicDistance <=
      BOX_DISTANCE_LIMIT
    ) {

      hasObject = true;

      boxText =
        "มีของอยู่ในกล่อง";
    }

    // -----------------------------------------------
    // ไม่มีของ
    // -----------------------------------------------

    else {

      hasObject = false;

      boxText =
        "ไม่มีของในกล่อง";
    }
  }

  // -------------------------------------------------
  // JSON Response
  // -------------------------------------------------

  res.json({

    cameraOnline,

    sensorOnline,

    cameraOn: cameraState,

    relayOn: relayState,

    distance:
      ultrasonicDistance,

    hasObject,

    boxText,

    cameraText,

    sensorText,

  });
});

// =====================================================
// DASHBOARD
// =====================================================

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>Smart Box</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  font-family:
    Arial,
    sans-serif;

  background:
    linear-gradient(
      135deg,
      #0f172a,
      #1e293b
    );

  color: white;

  min-height: 100vh;

}

.container {

  width: 95%;

  max-width: 1200px;

  margin: auto;

  padding: 25px 0;

}

h1 {

  text-align: center;

  margin-bottom: 25px;

}

.grid {

  display: grid;

  grid-template-columns:
    repeat(
      auto-fit,
      minmax(
        280px,
        1fr
      )
    );

  gap: 20px;

}

.card {

  background:
    rgba(
      255,
      255,
      255,
      0.08
    );

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.1
    );

  border-radius: 18px;

  padding: 20px;

  box-shadow:
    0 10px 30px
    rgba(
      0,
      0,
      0,
      0.25
    );

}

.card h2 {

  margin-top: 0;

}

.camera {

  width: 100%;

  aspect-ratio: 4 / 3;

  object-fit: cover;

  border-radius: 12px;

  background: #000;

}

.status {

  font-size: 18px;

  margin:
    10px 0;

}

.distance {

  font-size: 36px;

  font-weight: bold;

  text-align: center;

  margin:
    20px 0;

}

.box {

  text-align: center;

  font-size: 24px;

  font-weight: bold;

  padding: 20px;

  border-radius: 15px;

  background:
    rgba(
      255,
      255,
      255,
      0.08
    );

}

button {

  width: 100%;

  padding: 14px;

  margin-top: 10px;

  border: none;

  border-radius: 10px;

  font-size: 17px;

  cursor: pointer;

}

.on {

  background: #22c55e;

  color: white;

}

.off {

  background: #ef4444;

  color: white;

}

.info {

  line-height: 1.8;

}

</style>

</head>

<body>

<div class="container">

<h1>
  📦 Smart Box
</h1>

<div class="grid">

<!-- ================= CAMERA ================= -->

<div class="card">

<h2>📷 Camera</h2>

<img
  id="camera"
  class="camera"
  src="/offline.png"
>

<div
  id="cameraStatus"
  class="status"
>
  กำลังตรวจสอบ...
</div>

<button
  id="cameraButton"
  onclick="toggleCamera()"
>
  Camera
</button>

</div>

<!-- ================= SENSOR ================= -->

<div class="card">

<h2>📏 HC-SR04</h2>

<div
  id="distance"
  class="distance"
>
  -- cm
</div>

<div
  id="sensorStatus"
  class="status"
>
  กำลังตรวจสอบ...
</div>

</div>

<!-- ================= BOX ================= -->

<div class="card">

<h2>📦 Box Status</h2>

<div
  id="box"
  class="box"
>
  ⏳ กำลังรอเซ็นเซอร์...
</div>

</div>

<!-- ================= RELAY ================= -->

<div class="card">

<h2>🔌 Relay</h2>

<div
  id="relayStatus"
  class="status"
>
  กำลังตรวจสอบ...
</div>

<button
  id="relayButton"
  onclick="toggleRelay()"
>
  Relay
</button>

</div>

</div>

</div>

<script>

// =====================================================
// UPDATE STATUS
// =====================================================

async function updateStatus() {

  try {

    const response =
      await fetch(
        "/status",
        {
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    // -------------------------------------------------
    // CAMERA
    // -------------------------------------------------

    document.getElementById(
      "cameraStatus"
    ).textContent =
      data.cameraOnline
        ? "🟢 กล้องออนไลน์"
        : "🔴 กล้องออฟไลน์";

    // -------------------------------------------------
    // SENSOR
    // -------------------------------------------------

    document.getElementById(
      "sensorStatus"
    ).textContent =
      data.sensorOnline
        ? "🟢 เซ็นเซอร์ออนไลน์"
        : "🔴 เซ็นเซอร์ออฟไลน์";

    // -------------------------------------------------
    // DISTANCE
    // -------------------------------------------------

    if (
      data.distance !== null &&
      data.distance >= 0
    ) {

      document.getElementById(
        "distance"
      ).textContent =
        Number(
          data.distance
        ).toFixed(1)
        + " cm";

    } else {

      document.getElementById(
        "distance"
      ).textContent =
        "-- cm";
    }

    // -------------------------------------------------
    // BOX
    // -------------------------------------------------

    const box =
      document.getElementById(
        "box"
      );

    if (data.hasObject === true) {

      box.textContent =
        "📦 มีของอยู่ในกล่อง";

    }

    else if (
      data.hasObject === false
    ) {

      box.textContent =
        "📭 ไม่มีของในกล่อง";

    }

    else if (
      data.distance < 0
    ) {

      box.textContent =
        "⚠️ เซ็นเซอร์อ่านค่าไม่ได้";

    }

    else {

      box.textContent =
        "⏳ กำลังรอเซ็นเซอร์...";
    }

    // -------------------------------------------------
    // RELAY
    // -------------------------------------------------

    document.getElementById(
      "relayStatus"
    ).textContent =
      data.relayOn
        ? "🟢 Relay ON"
        : "🔴 Relay OFF";

    // -------------------------------------------------
    // RELAY BUTTON
    // -------------------------------------------------

    const relayButton =
      document.getElementById(
        "relayButton"
      );

    relayButton.textContent =
      data.relayOn
        ? "ปิด Relay"
        : "เปิด Relay";

    relayButton.className =
      data.relayOn
        ? "off"
        : "on";

    // -------------------------------------------------
    // CAMERA BUTTON
    // -------------------------------------------------

    const cameraButton =
      document.getElementById(
        "cameraButton"
      );

    cameraButton.textContent =
      data.cameraOn
        ? "ปิดกล้อง"
        : "เปิดกล้อง";

    cameraButton.className =
      data.cameraOn
        ? "off"
        : "on";

  }

  catch (error) {

    console.error(
      "Status error:",
      error
    );

  }

}

// =====================================================
// UPDATE CAMERA
// =====================================================

function updateCamera() {

  const camera =
    document.getElementById(
      "camera"
    );

  camera.src =
    "/view?t=" +
    Date.now();
}

// =====================================================
// TOGGLE CAMERA
// =====================================================

async function toggleCamera() {

  try {

    const status =
      await fetch(
        "/status"
      );

    const data =
      await status.json();

    await fetch(
      "/camera",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            cameraOn:
              !data.cameraOn
          })
      }
    );

    updateStatus();

  }

  catch (error) {

    console.error(
      "Camera control error:",
      error
    );

  }
}

// =====================================================
// TOGGLE RELAY
// =====================================================

async function toggleRelay() {

  try {

    const status =
      await fetch(
        "/status"
      );

    const data =
      await status.json();

    await fetch(
      "/relay",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            relayOn:
              !data.relayOn
          })
      }
    );

    updateStatus();

  }

  catch (error) {

    console.error(
      "Relay control error:",
      error
    );

  }
}

// =====================================================
// AUTO UPDATE
// =====================================================

setInterval(
  updateStatus,
  500
);

setInterval(
  updateCamera,
  1000
);

// =====================================================
// INITIAL
// =====================================================

updateStatus();

updateCamera();

</script>

</body>

</html>
  `);
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

  console.log(
    `🚀 Smart Box Server running on port ${PORT}`
  );

  console.log(
    `📦 Box distance limit: ${BOX_DISTANCE_LIMIT} cm`
  );

  if (
    LINE_CHANNEL_ACCESS_TOKEN &&
    LINE_USER_ID
  ) {

    console.log(
      "📱 LINE Notification: CONFIGURED"
    );

  } else {

    console.log(
      "⚠️ LINE Notification: NOT CONFIGURED"
    );

  }

});
