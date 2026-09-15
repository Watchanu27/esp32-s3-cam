const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'image/jpeg', limit: '2mb' }));

let latestFrame = null;
let lastUpdate = 0;

// สถานะที่เว็บสั่ง แล้ว ESP32 จะมาถามทีหลัง (poll)
let state = {
  cameraOn: true,   // true = ให้ ESP32 ส่งภาพต่อไปเรื่อยๆ
  relayOn: false    // true = ให้ ESP32 สั่งเปิดรีเลย์ (จ่ายไฟให้อุปกรณ์)
};

// เปลี่ยนค่านี้เป็นรหัสลับของคุณเอง (ต้องตรงกับใน ESP32)
const SECRET = "changeme123";

// ---------------------------------------------------
// ESP32 POST ภาพมาที่นี่
// ---------------------------------------------------
app.post('/upload', (req, res) => {
  if (req.query.key !== SECRET) return res.sendStatus(403);
  latestFrame = req.body;
  lastUpdate = Date.now();
  res.sendStatus(200);
});

// ---------------------------------------------------
// ESP32 เรียกมาถามคำสั่งล่าสุด (poll ทุกๆ รอบ loop)
// ---------------------------------------------------
app.get('/command', (req, res) => {
  if (req.query.key !== SECRET) return res.sendStatus(403);
  res.json(state);
});

// ---------------------------------------------------
// หน้าเว็บกดปุ่มแล้วยิงมาที่นี่เพื่อเปลี่ยนสถานะ
// ---------------------------------------------------
app.post('/control', (req, res) => {
  if (req.query.key !== SECRET) return res.sendStatus(403);

  if (req.query.camera === 'on') state.cameraOn = true;
  if (req.query.camera === 'off') state.cameraOn = false;

  if (req.query.relay === 'on') state.relayOn = true;
  if (req.query.relay === 'off') state.relayOn = false;

  res.json(state);
});

// ---------------------------------------------------
// ดึงภาพล่าสุดแบบดิบ (ใช้ในแท็ก <img>)
// ---------------------------------------------------
app.get('/view', (req, res) => {
  if (!latestFrame) return res.sendStatus(404);
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(latestFrame);
});

// ---------------------------------------------------
// สถานะเซิร์ฟเวอร์ (เช็คว่ากล้องยังส่งภาพอยู่ไหม)
// ---------------------------------------------------
app.get('/status', (req, res) => {
  res.json({
    hasFrame: !!latestFrame,
    lastUpdateMs: lastUpdate ? Date.now() - lastUpdate : null,
    ...state
  });
});

// ---------------------------------------------------
// หน้าเว็บดูภาพ + ปุ่มควบคุม
// ---------------------------------------------------
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>ESP32-CAM Live</title>
        <style>
          body {
            margin:0;
            background:#111;
            color:#eee;
            text-align:center;
            font-family:Arial;
          }
          img {
            max-width:100%;
            margin-top:10px;
            border-radius:8px;
          }
          .controls {
            margin:20px auto;
            padding: 0 16px;
          }
          .row {
            display:flex;
            justify-content:center;
            gap:12px;
            margin-bottom:14px;
          }
          button {
            flex:1;
            max-width:150px;
            padding:14px 10px;
            font-size:16px;
            border:none;
            border-radius:8px;
            font-weight:bold;
            color:white;
          }
          .on  { background:#2e7d32; }
          .off { background:#555; }
          .label { color:#888; font-size:14px; margin-bottom:6px; }
        </style>
      </head>
      <body>
        <img id="cam" src="/view">

        <div class="controls">
          <div class="label">กล้อง (Camera)</div>
          <div class="row">
            <button class="on"  onclick="send('camera','on')">เปิดกล้อง</button>
            <button class="off" onclick="send('camera','off')">ปิดกล้อง</button>
          </div>

          <div class="label">รีเลย์ไฟฟ้า (Relay)</div>
          <div class="row">
            <button class="on"  onclick="send('relay','on')">เปิดรีเลย์</button>
            <button class="off" onclick="send('relay','off')">ปิดรีเลย์</button>
          </div>

          <div id="statusText" class="label">กำลังโหลดสถานะ...</div>
        </div>

        <script>
          const KEY = "${SECRET}";

          function send(type, value) {
            fetch('/control?key=' + KEY + '&' + type + '=' + value, { method: 'POST' })
              .then(r => r.json())
              .then(updateStatusText);
          }

          function updateStatusText(s) {
            document.getElementById('statusText').innerText =
              'กล้อง: ' + (s.cameraOn ? 'เปิด' : 'ปิด') +
              ' | รีเลย์: ' + (s.relayOn ? 'เปิด' : 'ปิด');
          }

          function refreshImage() {
            document.getElementById('cam').src = '/view?' + Date.now();
          }

          function refreshStatus() {
            fetch('/status').then(r => r.json()).then(updateStatusText);
          }

          setInterval(refreshImage, 500);
          setInterval(refreshStatus, 1500);
          refreshStatus();
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
