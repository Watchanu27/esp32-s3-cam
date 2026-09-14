const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'image/jpeg', limit: '2mb' }));

let latestFrame = null;
let lastUpdate = 0;

// เปลี่ยนค่านี้เป็นรหัสลับของคุณเอง (ต้องตรงกับใน ESP32)
const SECRET = "changeme123";

// ESP32 POST ภาพมาที่นี่
app.post('/upload', (req, res) => {
  if (req.query.key !== SECRET) return res.sendStatus(403);
  latestFrame = req.body;
  lastUpdate = Date.now();
  res.sendStatus(200);
});

// ดึงภาพล่าสุดแบบดิบ (ใช้ในแท็ก <img>)
app.get('/view', (req, res) => {
  if (!latestFrame) return res.sendStatus(404);
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(latestFrame);
});

// สถานะเซิร์ฟเวอร์ (เช็คว่ากล้องยังส่งภาพอยู่ไหม)
app.get('/status', (req, res) => {
  res.json({
    hasFrame: !!latestFrame,
    lastUpdateMs: lastUpdate ? Date.now() - lastUpdate : null
  });
});

// หน้าเว็บดูภาพแบบ auto-refresh ทุก 500ms
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>ESP32-CAM Live</title>
      </head>
      <body style="margin:0;background:#111;text-align:center">
        <img id="cam" src="/view" style="max-width:100%;margin-top:10px">
        <p style="color:#888;font-family:Arial">Auto-refresh ทุก 0.5 วินาที</p>
        <script>
          setInterval(() => {
            document.getElementById('cam').src = '/view?' + Date.now();
          }, 500);
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
