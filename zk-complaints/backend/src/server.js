import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from './db.js';
import { getLeaves, getRoot, verifyEligibility, newSecret, commitmentOf } from './zk.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
const strict = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

const MESSAGES = {
  INVALID_PROOF: 'Your eligibility proof could not be verified. Please generate a new proof.',
  DUPLICATE: 'This anonymous credential has already been used for this submission scope.',
  STALE_ROOT: 'The eligibility data has been updated. Please refresh and generate a new proof.',
};
const clean = (s) => String(s ?? '').replace(/[<>]/g, '').trim(); // strip tag characters (React also escapes output)
const CATEGORIES = ['Academic', 'Faculty', 'Infrastructure', 'Hostel', 'Transportation', 'Harassment', 'Examination', 'Other'];
const STATUSES = ['Pending', 'Under Investigation', 'Resolved', 'Rejected'];
const fail = (res, e) => { console.error(e.message); res.status(500).json({ message: 'Something went wrong. Please try again later.' }); };
const requireAdmin = (req, res, next) => {
  try { req.admin = jwt.verify(req.cookies.token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Unauthorized' }); }
};

// ---------- Public / ZK ----------
// Leaves are public commitments; students build their Merkle path locally, so the server never learns which leaf is theirs.
app.get('/api/zk/leaves', async (_req, res) => {
  try { res.json({ leaves: await getLeaves(), root: await getRoot(), scope: process.env.SCOPE }); } catch (e) { fail(res, e); }
});
app.post('/api/zk/verify', async (req, res) => {
  try {
    const r = await verifyEligibility(req.body.proof, req.body.publicSignals);
    res.json(r.valid ? { valid: true, message: 'Eligibility verified without revealing identity' } : { valid: false, message: MESSAGES[r.code] });
  } catch (e) { fail(res, e); }
});

app.post('/api/complaints', strict, async (req, res) => {
  try {
    const { category, title, description, priority, proof, publicSignals } = req.body; // no student fields accepted
    if (!CATEGORIES.includes(category) || !['Low', 'Medium', 'High'].includes(priority) ||
        clean(title).length < 5 || clean(title).length > 150 || clean(description).length < 20 || clean(description).length > 4000)
      return res.status(400).json({ message: 'Please fill in all fields correctly.' });
    const r = await verifyEligibility(proof, publicSignals);
    if (!r.valid) return res.status(400).json({ message: MESSAGES[r.code] });
    const code = 'CMP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    try {
      await pool.query(
        'INSERT INTO complaints (complaint_code,category,title,description,priority,proof,public_signals,merkle_root,nullifier) VALUES (?,?,?,?,?,?,?,?,?)',
        [code, category, clean(title), clean(description), priority, JSON.stringify(proof), JSON.stringify(publicSignals), r.root, r.nullifier]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: MESSAGES.DUPLICATE }); // UNIQUE(nullifier) is race-safe
      throw e;
    }
    res.status(201).json({ complaintCode: code });
  } catch (e) { fail(res, e); }
});

app.get('/api/complaints/:code', async (req, res) => {
  try {
    const [[c]] = await pool.query('SELECT complaint_code,category,title,status,admin_remark,created_at,updated_at FROM complaints WHERE complaint_code=?', [req.params.code.toUpperCase()]);
    c ? res.json(c) : res.status(404).json({ message: 'No complaint found with that ID.' });
  } catch (e) { fail(res, e); }
});

// ---------- Admin ----------
app.post('/api/admin/login', strict, async (req, res) => {
  try {
    const [[a]] = await pool.query('SELECT * FROM admins WHERE email=?', [clean(req.body.email)]);
    if (!a || !(await bcrypt.compare(String(req.body.password ?? ''), a.password_hash)))
      return res.status(401).json({ message: 'Incorrect email or password.' });
    res.cookie('token', jwt.sign({ id: a.id }, process.env.JWT_SECRET, { expiresIn: '2h' }), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
app.post('/api/admin/logout', (_req, res) => res.clearCookie('token').json({ ok: true }));
app.get('/api/admin/me', requireAdmin, (_req, res) => res.json({ ok: true }));

app.get('/api/admin/complaints', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,complaint_code,category,title,description,priority,status,admin_remark,merkle_root,created_at,updated_at FROM complaints ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { fail(res, e); }
});
app.patch('/api/admin/complaints/:id/status', requireAdmin, async (req, res) => {
  try {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ message: 'Invalid status.' });
    await pool.query('UPDATE complaints SET status=?, admin_remark=COALESCE(?,admin_remark) WHERE id=?', [req.body.status, req.body.remark ? clean(req.body.remark) : null, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.post('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const { studentId, name, email, department, year } = req.body;
    if (!clean(studentId) || !clean(name) || !clean(email)) return res.status(400).json({ message: 'Student ID, name and email are required.' });
    const secret = newSecret();
    const commitment = (await commitmentOf(secret)).toString();
    await pool.query('INSERT INTO students (student_id,name,email,department,year,commitment) VALUES (?,?,?,?,?,?)',
      [clean(studentId), clean(name), clean(email), clean(department), Number(year) || null, commitment]);
    // The secret is shown ONCE and never stored. Only its Poseidon commitment is kept.
    res.status(201).json({ credential: secret.toString(), root: await getRoot() });
  } catch (e) { e.code === 'ER_DUP_ENTRY' ? res.status(400).json({ message: 'Student ID already registered.' }) : fail(res, e); }
});
app.get('/api/admin/students', requireAdmin, async (_req, res) => {
  try { const [r] = await pool.query('SELECT student_id,name,department,year,status,created_at FROM students ORDER BY id'); res.json(r); } catch (e) { fail(res, e); }
});
app.get('/api/admin/merkle-root', requireAdmin, async (_req, res) => {
  try { res.json({ root: await getRoot(), count: (await getLeaves()).length, scope: process.env.SCOPE }); } catch (e) { fail(res, e); }
});

// First admin is created from .env (password is bcrypt-hashed, never stored plain)
const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM admins');
if (!n) await pool.query('INSERT INTO admins (email,password_hash) VALUES (?,?)', [process.env.ADMIN_EMAIL, await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)]);
app.listen(process.env.PORT, () => console.log(`API running on port ${process.env.PORT}`));
