const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// SETTINGS
// =====================================================

const SECRET = "changeme123";

// ถ้าไม่รับภาพใหม่เกินเวลานี้ = กล้อง Offline
const OFFLINE_TIME = 2000;

app.use(express.raw({
  type: 'image/jpeg',
  limit: '2mb'
}));

let latestFrame = null;
let lastUpdate = 0;

// =====================================================
// ESP32 UPLOAD
// =====================================================

app.post('/upload', (req, res) => {

  if (req.query.key !== SECRET) {
    return res.sendStatus(403);
  }

  latestFrame = req.body;
  lastUpdate = Date.now();

  res.sendStatus(200);
});

// =====================================================
// VIEW LAST FRAME
// =====================================================

app.get('/view', (req, res) => {

  if (!latestFrame) {
    return res.sendStatus(404);
  }

  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');

  res.send(latestFrame);
});

// =====================================================
// STATUS
// =====================================================

app.get('/status', (req, res) => {

  const online =
    latestFrame &&
    (Date.now() - lastUpdate < OFFLINE_TIME);

  res.json({
    online: !!online,
    hasFrame: !!latestFrame,
    lastUpdateMs: lastUpdate
      ? Date.now() - lastUpdate
      : null
  });
});

// =====================================================
// BEAUTIFUL CAMERA PAGE
// =====================================================

app.get('/', (req, res) => {

  res.send(`
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>ESP32-CAM Live</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  min-height: 100vh;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:
    radial-gradient(
      circle at top,
      #1e293b,
      #020617 70%
    );

  color: white;

  display: flex;

  justify-content: center;

  align-items: center;

  padding: 20px;

}

/* ============================= */

.container {

  width: 100%;

  max-width: 900px;

}

/* ============================= */

.header {

  display: flex;

  justify-content: space-between;

  align-items: center;

  margin-bottom: 18px;

}

/* ============================= */

.title {

  display: flex;

  align-items: center;

  gap: 12px;

}

.logo {

  width: 45px;

  height: 45px;

  border-radius: 12px;

  background: #2563eb;

  display: flex;

  justify-content: center;

  align-items: center;

  font-size: 23px;

  box-shadow:
    0 0 20px rgba(37,99,235,.4);

}

h1 {

  margin: 0;

  font-size: 22px;

}

.subtitle {

  color: #94a3b8;

  font-size: 13px;

  margin-top: 3px;

}

/* ============================= */

.status {

  display: flex;

  align-items: center;

  gap: 8px;

  padding: 8px 13px;

  border-radius: 20px;

  background: rgba(255,255,255,.07);

  font-size: 13px;

}

.dot {

  width: 9px;

  height: 9px;

  border-radius: 50%;

  background: #ef4444;

}

.online .dot {

  background: #22c55e;

  box-shadow:
    0 0 10px #22c55e;

}

/* ============================= */

.camera {

  position: relative;

  width: 100%;

  aspect-ratio: 16 / 10;

  background: #020617;

  border-radius: 20px;

  overflow: hidden;

  border: 1px solid rgba(255,255,255,.1);

  box-shadow:
    0 20px 60px rgba(0,0,0,.5);

}

/* ============================= */

#cam {

  width: 100%;

  height: 100%;

  object-fit: contain;

  display: none;

}

/* ============================= */

.offline {

  position: absolute;

  inset: 0;

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  background:
    linear-gradient(
      135deg,
      #0f172a,
      #020617
    );

  text-align: center;

}

.esp {

  font-size: 80px;

  margin-bottom: 15px;

  filter:
    drop-shadow(
      0 0 20px
      rgba(59,130,246,.4)
    );

}

.offline h2 {

  margin: 0;

  font-size: 20px;

}

.offline p {

  margin-top: 7px;

  color: #64748b;

  font-size: 13px;

}

/* ============================= */

.footer {

  display: flex;

  justify-content: space-between;

  margin-top: 14px;

  color: #64748b;

  font-size: 12px;

}

.badge {

  padding: 5px 9px;

  border-radius: 8px;

  background: rgba(255,255,255,.05);

}

/* ============================= */

@media(max-width:600px) {

  body {
    padding: 12px;
  }

  .header {
    align-items: flex-start;
  }

  h1 {
    font-size: 18px;
  }

  .camera {
    border-radius: 14px;
  }

}

</style>

</head>

<body>

<div class="container">

  <div class="header">

    <div class="title">

      <div class="logo">
        📷
      </div>

      <div>

        <h1>ESP32-CAM Live</h1>

        <div class="subtitle">
          Wireless Camera Monitor
        </div>

      </div>

    </div>

    <div id="status"
         class="status">

      <span class="dot"></span>

      <span id="statusText">
        Offline
      </span>

    </div>

  </div>


  <div class="camera">

    <img
      id="cam"
      src=""
      alt="ESP32 Camera">

    <div
      id="offline"
      class="offline">

      <div class="esp">
        🤖
      </div>

      <h2>Camera Offline</h2>

      <p>
        Waiting for ESP32-CAM...
      </p>

    </div>

  </div>


  <div class="footer">

    <span>
      ESP32 Camera Server
    </span>

    <span class="badge">
      Auto Refresh 0.5s
    </span>

  </div>

</div>


<script>

const cam =
  document.getElementById('cam');

const offline =
  document.getElementById('offline');

const status =
  document.getElementById('status');

const statusText =
  document.getElementById('statusText');


function setOnline() {

  cam.style.display = 'block';

  offline.style.display = 'none';

  status.classList.add('online');

  statusText.textContent = 'Online';

}


function setOffline() {

  cam.style.display = 'none';

  offline.style.display = 'flex';

  status.classList.remove('online');

  statusText.textContent = 'Offline';

}


async function updateCamera() {

  try {

    const response =
      await fetch(
        '/status?' + Date.now()
      );

    const data =
      await response.json();

    if (data.online) {

      cam.src =
        '/view?' + Date.now();

      setOnline();

    } else {

      setOffline();

    }

  } catch (error) {

    setOffline();

  }

}


setInterval(
  updateCamera,
  500
);

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
    \`Server running on port \${PORT}\`
  );

});
