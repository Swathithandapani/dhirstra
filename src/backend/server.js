require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createWorker } = require("tesseract.js");

const app = express();


// ================= CORS =================

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());


// ================= MIDDLEWARE =================

app.use(express.json());


// Railway test route
app.get("/", (req,res)=>{
    res.json({
        status:"Backend running",
        message:"Dhirstra API is live"
    });
});

app.get("/test",(req,res)=>{
    res.send("Backend working");
});


// ================= UPLOADS =================

const UPLOADS_DIR = path.join(__dirname,"uploads");

if(!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR,{recursive:true});
}


app.use(
    "/uploads",
    express.static(UPLOADS_DIR)
);


// ================= MYSQL =================

const db = mysql.createConnection({

    host: process.env.MYSQL_HOST,

    user: process.env.MYSQL_USER,

    password: process.env.MYSQL_PASSWORD,

    database: process.env.MYSQL_DATABASE,

    port: process.env.MYSQL_PORT

});


db.connect((err)=>{

    if(err){

        console.log("MYSQL CONNECTION ERROR:",err.message);

    }
    else{

        console.log("MySQL Connected");

    }

});


// ================= REQUEST LOGGER =================

app.use((req,res,next)=>{

    console.log(
        new Date().toISOString(),
        req.method,
        req.url
    );

    next();

});

// ── AUTH ──
app.post("/signup", (req, res) => {
  const { user_id, password, role } = req.body;
  db.query("INSERT INTO users (user_id, password, role) VALUES (?, ?, ?)", [user_id, password, role], (err) => {
    if (err) return res.status(400).json({ message: "User already exists" });
    res.json({ message: "user created" });
  });
});

app.post("/login", (req, res) => {
  const { user_id, password } = req.body;
  db.query("SELECT * FROM users WHERE user_id=? AND password=?", [user_id, password], (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    if (result.length > 0) res.json({ message: "success", role: result[0].role });
    else res.json({ message: "fail" });
  });
});

// ── FILE UPLOAD ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  const { user_id } = req.body;
  const filePath = req.file.filename;
  db.query("INSERT INTO documents (user_id, file_path) VALUES (?, ?)", [user_id, filePath], (err) => {
    if (err) return res.status(500).json({ message: "upload failed" });
    // Create project_status entry
    db.query(
      "INSERT IGNORE INTO project_status (file_path, dpr_name, nodal_status) VALUES (?, ?, 'Pending')",
      [filePath, filePath.replace(/^\d+-/, '')], () => {}
    );
    res.json({ message: "file uploaded" });
  });
});

app.get("/documents/:user_id", (req, res) => {
  db.query("SELECT * FROM documents WHERE user_id=?", [req.params.user_id], (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    res.json(result);
  });
});

// ── ANALYSIS ──
app.post("/save-analysis", (req, res) => {
  const { file_path, analysis_data } = req.body;
  if (!file_path || !analysis_data) return res.status(400).json({ message: "Missing fields" });
  const q = "INSERT INTO dpr_analysis (file_path, analysis_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE analysis_data=VALUES(analysis_data), created_at=CURRENT_TIMESTAMP";
  db.query(q, [file_path, JSON.stringify(analysis_data)], (err) => {
    if (err) return res.status(500).json({ message: "Failed to save analysis" });
    // Update project_status with extracted info
    const info = analysis_data.info || {};
    db.query(
      `INSERT INTO project_status (file_path, dpr_name, title, location, budget, duration, agency, spec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title=VALUES(title), location=VALUES(location), budget=VALUES(budget),
       duration=VALUES(duration), agency=VALUES(agency), spec=VALUES(spec)`,
      [file_path, file_path.replace(/^\d+-/, ''),
       info.title || '', info.location || '', info.budget || '',
       info.duration || '12 months', info.agency || '', info.spec || ''],
      () => {}
    );
    res.json({ message: "Analysis saved" });
  });
});

app.get("/analysis/:file_path", (req, res) => {
  db.query("SELECT analysis_data FROM dpr_analysis WHERE file_path=?", [req.params.file_path], (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    if (result.length === 0) return res.status(404).json({ message: "Not found" });
    try { res.json(JSON.parse(result[0].analysis_data)); }
    catch(e) { res.status(500).json({ message: "Parse error" }); }
  });
});

// ── NODAL FORWARD ──
app.post("/forward-dpr", (req, res) => {
  const { file_path, dpr } = req.body;
  if (!file_path || !dpr) return res.status(400).json({ message: "Missing fields" });
  db.query("INSERT INTO documents (user_id, file_path, dpr) VALUES (?, ?, ?)", ['nodal_forwarded', file_path, dpr], (err) => {
    if (err) return res.status(500).json({ message: "Failed to forward DPR" });
    db.query(
      `INSERT INTO project_status (file_path, dpr_name, nodal_status, nodal_forwarded_at)
       VALUES (?, ?, 'Forwarded to Ministry', NOW())
       ON DUPLICATE KEY UPDATE nodal_status='Forwarded to Ministry', nodal_forwarded_at=NOW()`,
      [file_path, dpr], () => {}
    );
    res.json({ message: "DPR forwarded" });
  });
});

// ── NODAL REJECT ──
app.post("/reject-dpr", (req, res) => {
  const { file_path, dpr, reason } = req.body;
  if (!file_path || !dpr || !reason) return res.status(400).json({ message: "Missing fields" });
  db.query("INSERT INTO documents (user_id, file_path, dpr, reason) VALUES (?, ?, ?, ?)", ['nodal_rejected', file_path, dpr, reason], (err) => {
    if (err) return res.status(500).json({ message: "Failed to reject DPR" });
    db.query(
      `INSERT INTO project_status (file_path, dpr_name, nodal_status, nodal_rejected_at, nodal_reject_reason)
       VALUES (?, ?, 'Nodal Rejected', NOW(), ?)
       ON DUPLICATE KEY UPDATE nodal_status='Nodal Rejected', nodal_rejected_at=NOW(), nodal_reject_reason=?`,
      [file_path, dpr, reason, reason], () => {}
    );
    res.json({ message: "DPR rejected" });
  });
});

// ── MINISTRY APPROVE ──
app.post("/ministry-approve", (req, res) => {
  const { file_path, decided_by, decided_by_role } = req.body;
  if (!file_path) return res.status(400).json({ message: "Missing file_path" });
  const by = decided_by || 'Central Line Ministries';
  const role = decided_by_role || 'Ministry of Development of North Eastern Region';
  db.query(
    `INSERT INTO ministry_decisions (file_path, decision, decided_by, decided_by_role)
     VALUES (?, 'approved', ?, ?)
     ON DUPLICATE KEY UPDATE decision='approved', reason=NULL, decided_by=VALUES(decided_by), decided_by_role=VALUES(decided_by_role), decided_at=CURRENT_TIMESTAMP`,
    [file_path, by, role], (err) => {
      if (err) return res.status(500).json({ message: "Failed" });
      db.query(
        `UPDATE project_status SET ministry_decision='approved', ministry_decided_by=?, ministry_decided_by_role=?, ministry_decided_at=NOW(), ministry_reject_reason=NULL WHERE file_path=?`,
        [by, role, file_path], () => {}
      );
      res.json({ message: "DPR approved by Ministry" });
    }
  );
});

// ── MINISTRY REJECT ──
app.post("/ministry-reject", (req, res) => {
  const { file_path, reason, decided_by, decided_by_role } = req.body;
  if (!file_path || !reason) return res.status(400).json({ message: "Missing fields" });
  const by = decided_by || 'Central Line Ministries';
  const role = decided_by_role || 'Ministry of Development of North Eastern Region';
  db.query(
    `INSERT INTO ministry_decisions (file_path, decision, reason, decided_by, decided_by_role)
     VALUES (?, 'rejected', ?, ?, ?)
     ON DUPLICATE KEY UPDATE decision='rejected', reason=VALUES(reason), decided_by=VALUES(decided_by), decided_by_role=VALUES(decided_by_role), decided_at=CURRENT_TIMESTAMP`,
    [file_path, reason, by, role], (err) => {
      if (err) return res.status(500).json({ message: "Failed" });
      db.query(
        `UPDATE project_status SET ministry_decision='rejected', ministry_decided_by=?, ministry_decided_by_role=?, ministry_decided_at=NOW(), ministry_reject_reason=? WHERE file_path=?`,
        [by, role, reason, file_path], () => {}
      );
      res.json({ message: "DPR rejected by Ministry" });
    }
  );
});

// ── MINISTRY DECISIONS ──
app.get("/ministry-decisions", (req, res) => {
  db.query("SELECT * FROM ministry_decisions ORDER BY decided_at DESC", (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    res.json(result);
  });
});

app.get("/ministry-decision/:file_path", (req, res) => {
  db.query("SELECT * FROM ministry_decisions WHERE file_path=?", [req.params.file_path], (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    res.json(result.length === 0 ? { decision: null } : result[0]);
  });
});

// ── SLEC PROGRESS UPDATE ──
app.post("/slec-update", (req, res) => {
  const { file_path, slec_progress, slec_impl_status, slec_timeline_compliance, slec_quality_compliance, slec_om_compliance, slec_remarks } = req.body;
  if (!file_path) return res.status(400).json({ message: "Missing file_path" });
  db.query(
    `INSERT INTO project_status (file_path, slec_progress, slec_impl_status, slec_timeline_compliance, slec_quality_compliance, slec_om_compliance, slec_remarks, slec_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE slec_progress=VALUES(slec_progress), slec_impl_status=VALUES(slec_impl_status),
     slec_timeline_compliance=VALUES(slec_timeline_compliance), slec_quality_compliance=VALUES(slec_quality_compliance),
     slec_om_compliance=VALUES(slec_om_compliance), slec_remarks=VALUES(slec_remarks), slec_updated_at=NOW()`,
    [file_path, slec_progress || 0, slec_impl_status || 'Not Started',
     slec_timeline_compliance || 'Under Review', slec_quality_compliance || 'Under Review',
     slec_om_compliance || 'Under Review', slec_remarks || ''],
    (err) => {
      if (err) { console.log(err); return res.status(500).json({ message: "Failed to update SLEC progress" }); }
      res.json({ message: "SLEC progress updated" });
    }
  );
});

// ── GET ALL PROJECT STATUS (single source of truth for all dashboards) ──
app.get("/project-status", (req, res) => {
  db.query("SELECT * FROM project_status ORDER BY updated_at DESC", (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    res.json(result);
  });
});

app.get("/project-status/:file_path", (req, res) => {
  db.query("SELECT * FROM project_status WHERE file_path=?", [req.params.file_path], (err, result) => {
    if (err) return res.status(500).json({ message: "error" });
    res.json(result.length === 0 ? null : result[0]);
  });
});

// ── OCR ──
app.get("/ocr-extract/:filename", async (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    const { pdf } = await import('pdf-to-img');
    const doc = await pdf(filePath, { scale: 2 });
    const totalPages = doc.length;
    const pagesToScan = Math.min(totalPages, 8);
    send({ type: 'start', total: totalPages, scanning: pagesToScan });
    const worker = await createWorker('eng');
    let fullText = ''; let count = 0;
    for await (const pageImg of doc) {
      count++;
      if (count > pagesToScan) break;
      send({ type: 'progress', current: count, total: pagesToScan });
      const { data: { text } } = await worker.recognize(pageImg);
      fullText += `\n--- PAGE ${count} ---\n` + text;
    }
    await worker.terminate();
    send({ type: 'done', text: fullText, pages: totalPages, scanned: count });
    res.end();
  } catch (err) {
    send({ type: 'error', message: err.message });
    res.end();
  }
});

// ── BLOCKCHAIN AUDIT TRAIL ──
const { execFile } = require('child_process');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const BLOCKCHAIN_SCRIPT = path.join(__dirname, 'blockchain.py');

function runBlockchain(args, res) {
  execFile(PYTHON, [BLOCKCHAIN_SCRIPT, ...args], { encoding: 'utf8' }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ message: 'Blockchain error', error: stderr || err.message });
    try { res.json(JSON.parse(stdout)); }
    catch(e) { res.status(500).json({ message: 'Parse error', raw: stdout }); }
  });
}

// Add a block: POST /blockchain/add
// Body: { dpr_id, stage, action, reviewer }
app.post('/blockchain/add', (req, res) => {
  const { dpr_id, stage, action, reviewer } = req.body;
  if (!dpr_id || !stage || !action || !reviewer)
    return res.status(400).json({ message: 'Missing fields: dpr_id, stage, action, reviewer' });
  runBlockchain(['add', dpr_id, stage, action, reviewer], res);
});

// Get full chain: GET /blockchain/chain
app.get('/blockchain/chain', (req, res) => {
  runBlockchain(['chain'], res);
});

// Get trail for one DPR: GET /blockchain/trail/:dpr_id
app.get('/blockchain/trail/:dpr_id', (req, res) => {
  runBlockchain(['trail', req.params.dpr_id], res);
});

// Verify chain integrity: GET /blockchain/verify
app.get('/blockchain/verify', (req, res) => {
  runBlockchain(['verify'], res);
});

const PORT = process.env.PORT || 8080;


app.listen(PORT, "0.0.0.0", ()=>{

    console.log(`Server running on port ${PORT}`);

});