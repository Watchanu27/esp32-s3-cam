const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// SETTINGS
// =====================================================

const SECRET = "changeme123";

// ถ้าไม่มีภาพใหม่เกิน 5 วินาที = กล้อง Offline
const OFFLINE_TIME = 5000;

// ระยะ <= 15 cm = มีของในกล่อง
const BOX_DISTANCE_LIMIT = 15;


// =====================================================
// VARIABLES
// =====================================================

let latestFrame = null;
let lastCameraUpdate = 0;

let cameraState = false;
let relayState = false;

let ultrasonicDistance = null;
let lastSensorUpdate = 0;


// =====================================================
// STATIC IMAGE
// offline.png อยู่ที่ root ของ GitHub
// =====================================================

app.get('/offline.png', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'offline.png')
  );

});


// =====================================================
// CAMERA JPEG UPLOAD
// =====================================================

app.use(express.raw({
  type: 'image/jpeg',
  limit: '2mb'
}));


// =====================================================
// ESP32 UPLOAD CAMERA
// =====================================================

app.post('/upload', (req, res) => {

  if (req.query.key !== SECRET) {
    return res.sendStatus(403);
  }

  if (!req.body || req.body.length === 0) {
    return res.status(400).send('No image');
  }

  latestFrame = req.body;

  lastCameraUpdate = Date.now();

  console.log('📷 Camera frame received');

  res.sendStatus(200);

});


// =====================================================
// VIEW CAMERA
// =====================================================

app.get('/view', (req, res) => {

  if (!latestFrame) {
    return res.sendStatus(404);
  }

  res.set('Content-Type', 'image/jpeg');

  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  res.send(latestFrame);

});


// =====================================================
// JSON BODY
// =====================================================

app.use(express.json());


// =====================================================
// ULTRASONIC SENSOR
// ESP32 ส่งระยะมาที่นี่
//
// POST:
// /sensor?key=changeme123
//
// JSON:
// {
//   "distance": 10
// }
// =====================================================

app.post('/sensor', (req, res) => {

  if (req.query.key !== SECRET) {
    return res.sendStatus(403);
  }

  const distance =
    Number(req.body.distance);

  if (Number.isNaN(distance)) {

    return res.status(400).json({
      success: false,
      message: 'Invalid distance'
    });

  }

  ultrasonicDistance = distance;

  lastSensorUpdate = Date.now();

  console.log(
    `📦 Ultrasonic: ${distance} cm`
  );

  res.json({
    success: true,
    distance: distance
  });

});


// =====================================================
// CAMERA ON / OFF
// =====================================================

app.post('/camera', (req, res) => {

  if (req.query.key !== SECRET) {
    return res.sendStatus(403);
  }

  cameraState =
    Boolean(req.body.state);

  console.log(
    `📷 Camera: ${
      cameraState ? 'ON' : 'OFF'
    }`
  );

  res.json({
    success: true,
    camera: cameraState
  });

});


// =====================================================
// RELAY ON / OFF
// =====================================================

app.post('/relay', (req, res) => {

  if (req.query.key !== SECRET) {
    return res.sendStatus(403);
  }

  relayState =
    Boolean(req.body.state);

  console.log(
    `🔌 Relay: ${
      relayState ? 'ON' : 'OFF'
    }`
  );

  res.json({
    success: true,
    relay: relayState
  });

});


// =====================================================
// STATUS
// =====================================================

app.get('/status', (req, res) => {

  const now = Date.now();

  const cameraOnline =
    latestFrame !== null &&
    (now - lastCameraUpdate <= OFFLINE_TIME);

  const sensorOnline =
    lastSensorUpdate !== 0 &&
    (now - lastSensorUpdate <= OFFLINE_TIME);


  // ===================================================
  // BOX STATUS
  // ===================================================

  let hasObject = null;

  let boxText =
    'กำลังรอเซ็นเซอร์...';


  if (
    sensorOnline &&
    ultrasonicDistance !== null
  ) {

    if (
      ultrasonicDistance <= BOX_DISTANCE_LIMIT
    ) {

      hasObject = true;

      boxText =
        'มีของอยู่ในกล่อง';

    } else {

      hasObject = false;

      boxText =
        'ไม่มีของในกล่อง';

    }

  }


  res.json({

    esp32Online:
      cameraOnline || sensorOnline,

    camera: {

      enabled:
        cameraState,

      online:
        cameraOnline

    },

    relay:
      relayState,

    ultrasonic: {

      online:
        sensorOnline,

      distance:
        ultrasonicDistance

    },

    box: {

      hasObject:
        hasObject,

      status:
        boxText

    }

  });

});


// =====================================================
// WEB DASHBOARD
// =====================================================

app.get('/', (req, res) => {

res.send(`<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0">

<title>ESP32 Smart Box</title>


<style>

* {
  box-sizing: border-box;
}


body {

  margin: 0;

  min-height: 100vh;

  font-family:
    Arial,
    "Noto Sans Thai",
    sans-serif;

  color: white;

  background:
    radial-gradient(
      circle at top,
      #10264a 0%,
      #06142b 45%,
      #020817 100%
    );

  padding: 25px;

}


.container {

  width: 100%;

  max-width: 1200px;

  margin: auto;

}


/* =====================================================
HEADER
===================================================== */

.header {

  display: flex;

  justify-content: space-between;

  align-items: center;

  margin-bottom: 25px;

}


.brand {

  display: flex;

  align-items: center;

  gap: 15px;

}


.brand-icon {

  width: 60px;

  height: 60px;

  border-radius: 17px;

  display: flex;

  align-items: center;

  justify-content: center;

  font-size: 30px;

  background:
    linear-gradient(
      135deg,
      #1683ff,
      #2563eb
    );

  box-shadow:
    0 0 30px
    rgba(37,99,235,.35);

}


h1 {

  margin: 0;

  font-size: 30px;

}


.subtitle {

  color: #8fa8ce;

  margin-top: 5px;

  font-size: 14px;

}


.esp-status {

  padding: 12px 20px;

  border-radius: 30px;

  background:
    rgba(239,68,68,.1);

  border:
    1px solid
    rgba(239,68,68,.35);

  color: #f87171;

  font-weight: bold;

}


.esp-status.online {

  color: #2dd4bf;

  background:
    rgba(20,184,166,.1);

  border-color:
    rgba(20,184,166,.4);

}


/* =====================================================
MAIN
===================================================== */

.main {

  display: grid;

  grid-template-columns:
    2fr 1fr;

  gap: 25px;

}


/* =====================================================
CARD
===================================================== */

.card {

  background:
    rgba(7,24,48,.85);

  border:
    1px solid
    rgba(42,112,190,.45);

  border-radius: 20px;

  padding: 20px;

  box-shadow:
    0 20px 50px
    rgba(0,0,0,.3);

}


/* =====================================================
CAMERA
===================================================== */

.camera-card {

  padding: 20px;

}


.camera-header {

  display: flex;

  justify-content: space-between;

  align-items: center;

  margin-bottom: 15px;

}


.camera-title {

  font-size: 21px;

  font-weight: bold;

}


.camera-status {

  padding: 8px 15px;

  border-radius: 20px;

  background: #172f53;

  color: #9bb9e7;

}


.camera {

  position: relative;

  width: 100%;

  aspect-ratio: 16 / 10;

  background: #020617;

  border-radius: 15px;

  overflow: hidden;

  border:
    1px solid
    #1d4b80;

}


#cam {

  width: 100%;

  height: 100%;

  object-fit: contain;

  display: none;

}


.offline {

  position: absolute;

  inset: 0;

  display: flex;

  justify-content: center;

  align-items: center;

  background: #020617;

}


.offline img {

  width: 100%;

  height: 100%;

  object-fit: cover;

}


/* =====================================================
OFFLINE MESSAGE
===================================================== */

.offline-message {

  position: absolute;

  bottom: 25px;

  left: 50%;

  transform:
    translateX(-50%);

  background:
    rgba(0,0,0,.78);

  padding: 14px 25px;

  border-radius: 14px;

  text-align: center;

  backdrop-filter: blur(8px);

  min-width: 260px;

}


.offline-message strong {

  display: block;

  font-size: 20px;

  margin-bottom: 5px;

}


.offline-message span {

  color: #94a3b8;

}


/* =====================================================
CONTROL
===================================================== */

.control-title {

  font-size: 21px;

  font-weight: bold;

  margin-bottom: 10px;

}


.control-status {

  color: #7fa5d5;

  margin-bottom: 20px;

}


.buttons {

  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 12px;

}


button {

  border: none;

  border-radius: 12px;

  padding: 15px;

  font-size: 16px;

  font-weight: bold;

  color: white;

  cursor: pointer;

  transition: .2s;

}


button:hover {

  transform:
    translateY(-2px);

}


.on-button {

  background:
    linear-gradient(
      135deg,
      #1683ff,
      #2563eb
    );

}


.relay-on {

  background:
    linear-gradient(
      135deg,
      #00d084,
      #05a878
    );

}


.off-button {

  background:
    #172f53;

  color: #b5c6df;

}


/* =====================================================
SENSOR
===================================================== */

.sensor-card {

  margin-top: 25px;

  display: grid;

  grid-template-columns:
    180px 1fr 1.5fr;

  align-items: center;

  gap: 25px;

}


.box-icon {

  font-size: 90px;

  text-align: center;

}


.sensor-title {

  font-size: 22px;

  font-weight: bold;

  margin-bottom: 15px;

}


.distance {

  color: #a6bee0;

  font-size: 17px;

  margin-bottom: 10px;

}


.sensor-status {

  color: #f59e0b;

  font-size: 17px;

  font-weight: bold;

}


.box-result {

  border:
    2px solid
    #f59e0b;

  border-radius: 18px;

  padding: 25px;

  text-align: center;

}


.box-result-icon {

  font-size: 45px;

}


.box-result-text {

  font-size: 22px;

  font-weight: bold;

  margin-top: 10px;

}


.box-result.has-item {

  border-color:
    #22c55e;

}


.box-result.has-item
.box-result-text {

  color: #22c55e;

}


.box-result.no-item {

  border-color:
    #3b82f6;

}


.box-result.no-item
.box-result-text {

  color: #60a5fa;

}


/* =====================================================
FOOTER
===================================================== */

.footer {

  text-align: center;

  color: #647fa8;

  margin-top: 25px;

  font-size: 13px;

}


/* =====================================================
MOBILE
===================================================== */

@media(max-width:800px) {

  body {
    padding: 12px;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .main {
    grid-template-columns: 1fr;
  }

  .sensor-card {
    grid-template-columns: 1fr;
    text-align: center;
  }

  h1 {
    font-size: 23px;
  }

}

</style>

</head>


<body>


<div class="container">


<!-- =================================================
HEADER
================================================= -->

<div class="header">

  <div class="brand">

    <div class="brand-icon">
      📦
    </div>

    <div>

      <h1>
        ESP32 Smart Box
      </h1>

      <div class="subtitle">
        Smart Camera & Object Detection
      </div>

    </div>

  </div>


  <div
    id="espStatus"
    class="esp-status">

    🔴 ESP32 Offline

  </div>

</div>


<!-- =================================================
MAIN
================================================= -->

<div class="main">


<!-- =================================================
CAMERA
================================================= -->

<div class="card camera-card">

  <div class="camera-header">

    <div class="camera-title">
      📷 กล้อง ESP32-CAM
    </div>

    <div
      id="cameraStatus"
      class="camera-status">

      ⚫ ปิดกล้อง

    </div>

  </div>


  <div class="camera">

    <img
      id="cam"
      src=""
      alt="ESP32 Camera">


    <!-- OFFLINE IMAGE -->

    <div
      id="offline"
      class="offline">

      <img
        src="/offline.png"
        alt="Camera Offline">


      <div class="offline-message">

        <strong>
          📷 กล้องปิดอยู่
        </strong>

        <span>
          กำลังรอเปิดกล้อง...
        </span>

      </div>

    </div>

  </div>

</div>


<!-- =================================================
CONTROL
================================================= -->

<div>


<!-- CAMERA CONTROL -->

<div class="card">

  <div class="control-title">
    📷 ควบคุมกล้อง
  </div>

  <div class="control-status">

    สถานะปัจจุบัน:
    <strong id="cameraValue">
      ปิด
    </strong>

  </div>


  <div class="buttons">

    <button
      class="on-button"
      onclick="setCamera(true)">

      📷 เปิดกล้อง

    </button>


    <button
      class="off-button"
      onclick="setCamera(false)">

      🚫 ปิดกล้อง

    </button>

  </div>

</div>


<br>


<!-- RELAY CONTROL -->

<div class="card">

  <div class="control-title">
    🔌 ควบคุมรีเลย์
  </div>

  <div class="control-status">

    สถานะปัจจุบัน:
    <strong id="relayValue">
      ปิด
    </strong>

  </div>


  <div class="buttons">

    <button
      class="relay-on"
      onclick="setRelay(true)">

      ⚡ เปิดรีเลย์

    </button>


    <button
      class="off-button"
      onclick="setRelay(false)">

      ⏻ ปิดรีเลย์

    </button>

  </div>

</div>

</div>

</div>


<!-- =================================================
ULTRASONIC
================================================= -->

<div class="card sensor-card">


<div class="box-icon">
  📦
</div>


<div>

  <div class="sensor-title">

    สถานะกล่อง
    <span style="color:#82a9df">
      (Ultrasonic Sensor)
    </span>

  </div>


  <div class="distance">

    📏 ระยะที่วัดได้:

    <strong id="distance">
      -- cm
    </strong>

  </div>


  <div
    id="sensorStatus"
    class="sensor-status">

    ⏳ กำลังรอข้อมูล...

  </div>

</div>


<div
  id="boxResult"
  class="box-result">

  <div class="box-result-icon">
    📦
  </div>

  <div
    id="boxText"
    class="box-result-text">

    กำลังรอเซ็นเซอร์...

  </div>

</div>


</div>


<!-- FOOTER -->

<div class="footer">

  📡 ESP32 Smart Box
  &nbsp; • &nbsp;
  Powered by ESP32
  &nbsp; • &nbsp;
  Auto Update 500ms

</div>


</div>


<script>

// =====================================================
// CAMERA CONTROL
// =====================================================

async function setCamera(state) {

  try {

    await fetch(
      '/camera?key=${SECRET}',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          state: state
        })

      }
    );

    updateStatus();

  }

  catch (error) {

    console.error(
      'Camera error:',
      error
    );

  }

}


// =====================================================
// RELAY CONTROL
// =====================================================

async function setRelay(state) {

  try {

    await fetch(
      '/relay?key=${SECRET}',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          state: state
        })

      }
    );

    updateStatus();

  }

  catch (error) {

    console.error(
      'Relay error:',
      error
    );

  }

}


// =====================================================
// UPDATE STATUS
// =====================================================

async function updateStatus() {

  try {

    const response =
      await fetch(
        '/status?' + Date.now()
      );


    const data =
      await response.json();


    // =================================================
    // ESP32
    // =================================================

    const espStatus =
      document.getElementById(
        'espStatus'
      );


    if (data.esp32Online) {

      espStatus.textContent =
        '🟢 ESP32 Online';

      espStatus.classList.add(
        'online'
      );

    }

    else {

      espStatus.textContent =
        '🔴 ESP32 Offline';

      espStatus.classList.remove(
        'online'
      );

    }


    // =================================================
    // CAMERA STATUS
    // =================================================

    document.getElementById(
      'cameraValue'
    ).textContent =
      data.camera.enabled
        ? 'เปิด'
        : 'ปิด';


    document.getElementById(
      'cameraStatus'
    ).textContent =
      data.camera.enabled
        ? '🟢 เปิดกล้อง'
        : '⚫ ปิดกล้อง';


    const cam =
      document.getElementById(
        'cam'
      );


    const offline =
      document.getElementById(
        'offline'
      );


    if (
      data.camera.enabled &&
      data.camera.online
    ) {

      cam.style.display =
        'block';

      offline.style.display =
        'none';


      cam.src =
        '/view?' + Date.now();

    }

    else {

      cam.style.display =
        'none';

      offline.style.display =
        'flex';

    }


    // =================================================
    // RELAY
    // =================================================

    document.getElementById(
      'relayValue'
    ).textContent =
      data.relay
        ? 'เปิด'
        : 'ปิด';


    // =================================================
    // ULTRASONIC
    // =================================================

    const distance =
      document.getElementById(
        'distance'
      );


    const sensorStatus =
      document.getElementById(
        'sensorStatus'
      );


    if (
      data.ultrasonic.distance !== null
    ) {

      distance.textContent =
        data.ultrasonic.distance +
        ' cm';


      sensorStatus.textContent =
        data.ultrasonic.online
          ? '🟢 เซ็นเซอร์ออนไลน์'
          : '🔴 เซ็นเซอร์ Offline';

    }

    else {

      distance.textContent =
        '-- cm';

      sensorStatus.textContent =
        '⏳ กำลังรอข้อมูล...';

    }


    // =================================================
    // BOX RESULT
    // =================================================

    const boxResult =
      document.getElementById(
        'boxResult'
      );


    const boxText =
      document.getElementById(
        'boxText'
      );


    if (
      data.box.hasObject === true
    ) {

      boxResult.className =
        'box-result has-item';

      boxText.textContent =
        '📦 มีของอยู่ในกล่อง';

    }

    else if (
      data.box.hasObject === false
    ) {

      boxResult.className =
        'box-result no-item';

      boxText.textContent =
        '📭 ไม่มีของในกล่อง';

    }

    else {

      boxResult.className =
        'box-result';

      boxText.textContent =
        '⏳ กำลังรอเซ็นเซอร์...';

    }

  }

  catch (error) {

    console.error(
      'Status error:',
      error
    );

  }

}


// =====================================================
// START
// =====================================================

updateStatus();

setInterval(
  updateStatus,
  500
);

</script>


</body>

</html>`);

});


// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});
